import { XMLParser } from 'fast-xml-parser';
import type { ExternalActivity, Session, Sport } from './model';
import { sha256 } from './sheets';
export function garminActivity(raw: Record<string, unknown>): ExternalActivity {
  const externalId = String(raw.activityId ?? '');
  if (!/^\d+$/.test(externalId)) throw new Error('Garmin activity has no stable activity ID.');
  const timestamp = raw.startTimeGMT;
  if (typeof timestamp !== 'string') throw new Error('Garmin activity has no UTC start timestamp.');
  const date = new Date(
    /[Zz]|[+-]\d\d:\d\d$/.test(timestamp) ? timestamp : `${timestamp.replace(' ', 'T')}Z`,
  );
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid Garmin start timestamp.');
  const type =
    typeof raw.activityType === 'object' && raw.activityType !== null
      ? String((raw.activityType as Record<string, unknown>).typeKey ?? '')
      : String(raw.activityType ?? '');
  const sport: Sport = /run/i.test(type)
    ? 'running'
    : /cycl|bik/i.test(type)
      ? 'cycling'
      : /row/i.test(type)
        ? 'rowing'
        : /ski.*erg/i.test(type)
          ? 'skiErg'
          : /rugby/i.test(type)
            ? 'tagRugby'
            : 'strength';
  const number = (key: string) =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? (raw[key] as number) : undefined;
  return {
    id: `garmin-${externalId}`,
    provider: 'garmin',
    externalId,
    name: String(raw.activityName ?? 'Garmin activity'),
    sport,
    startedAt: date.toISOString(),
    durationSeconds: number('duration'),
    distanceMetres: number('distance'),
    averageHeartRate: number('averageHR'),
    elevationMetres: number('elevationGain'),
    raw,
  };
}
export function matchingSessions(activity: ExternalActivity, sessions: Session[]) {
  return sessions
    .filter(
      (s) =>
        s.status !== 'skipped' &&
        s.sport === activity.sport &&
        Math.abs(new Date(s.startedAt).getTime() - new Date(activity.startedAt).getTime()) <=
          3 * 3600000,
    )
    .map((s) => ({
      session: s,
      minutesApart: Math.round(
        Math.abs(new Date(s.startedAt).getTime() - new Date(activity.startedAt).getTime()) / 60000,
      ),
    }))
    .sort((a, b) => a.minutesApart - b.minutesApart);
}
export function mergeActivities(existing: ExternalActivity[], incoming: ExternalActivity[]) {
  const result = [...existing];
  for (const activity of incoming) {
    const index = result.findIndex(
      (x) => x.provider === activity.provider && x.externalId === activity.externalId,
    );
    if (index < 0) result.push(activity);
    else
      result[index] = {
        ...activity,
        syncStatus: result[index].syncStatus === 'pending' ? 'pending' : activity.syncStatus,
        matchedSessionId: result[index].matchedSessionId,
        dismissed: result[index].dismissed,
      };
  }
  return result;
}
type XmlNode = Record<string, unknown>;
const nodes = (value: unknown): XmlNode[] =>
  Array.isArray(value)
    ? (value as XmlNode[])
    : value && typeof value === 'object'
      ? [value as XmlNode]
      : [];
const obj = (value: unknown): XmlNode =>
  value && typeof value === 'object' ? (value as XmlNode) : {};
export async function parseActivityFile(
  text: string,
  name: string,
  digest: (value: string) => Promise<string> = sha256,
): Promise<ExternalActivity[]> {
  if (text.length > 5 * 1024 * 1024) throw new Error('Choose an activity file smaller than 5 MiB.');
  if (name.toLowerCase().endsWith('.json')) {
    const raw = JSON.parse(text);
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((x) => ({ ...garminActivity(x), provider: 'file' as const }));
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('XML document types and external entities are not supported.');
  const root = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    processEntities: false,
  }).parse(text) as XmlNode;
  const fingerprint = await digest(text);
  if (root.TrainingCenterDatabase) {
    const activities = obj(obj(root.TrainingCenterDatabase).Activities);
    return nodes(activities.Activity).map((a, i) => {
      const laps = nodes(a.Lap);
      const start = String(a.Id ?? laps[0]?.['@_StartTime'] ?? '');
      const startedAt = new Date(start).toISOString();
      const sport = /bik/i.test(String(a['@_Sport'])) ? 'cycling' : 'running';
      return {
        id: `file-${fingerprint}-${i}`,
        provider: 'file',
        externalId: `${fingerprint}-${i}`,
        name: name.replace(/\.tcx$/i, ''),
        sport,
        startedAt,
        durationSeconds: laps.reduce((sum, l) => sum + Number(l.TotalTimeSeconds ?? 0), 0),
        distanceMetres: laps.reduce((sum, l) => sum + Number(l.DistanceMeters ?? 0), 0),
        raw: a,
      };
    });
  }
  if (root.gpx) {
    const gpx = obj(root.gpx);
    const tracks = nodes(gpx.trk);
    return tracks.map((track, i) => {
      const points = nodes(track.trkseg).flatMap((s) => nodes(s.trkpt));
      const timed = points.filter((p) => p.time);
      if (!timed.length) throw new Error('GPX has no activity timestamps.');
      const start = new Date(String(timed[0].time));
      const end = new Date(String(timed.at(-1)!.time));
      return {
        id: `file-${fingerprint}-${i}`,
        provider: 'file',
        externalId: `${fingerprint}-${i}`,
        name: String(track.name ?? name),
        sport: 'running',
        startedAt: start.toISOString(),
        durationSeconds: (end.getTime() - start.getTime()) / 1000,
        raw: track,
      };
    });
  }
  throw new Error('Supported activity files are Garmin JSON, TCX and GPX.');
}

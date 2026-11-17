import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  coachInputText,
  flatten,
  importSheet,
  planWrite,
  sha256,
  type SheetWrite,
} from '../../packages/core/sheets';
import { getWorkbook, writeResult } from './google';
import { importGarmin } from './garmin';
import { importRoutines } from '../../packages/core/routines';
type Env = Cloudflare.Env;
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function client(env: Env, key = env.SUPABASE_PUBLISHABLE_KEY, token?: string) {
  return createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}
async function authorise(request: Request, env: Env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  const db = client(env, env.SUPABASE_PUBLISHABLE_KEY, token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session expired. Sign in again.');
  const member = await db
    .from('training_members')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (member.error || !member.data)
    throw new HttpError(403, 'This account is not authorised for Training.');
  return { db, user: data.user };
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') ?? 0) > 100000)
    throw new HttpError(413, 'Request too large.');
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 100000) {
      await reader.cancel();
      throw new HttpError(413, 'Request too large.');
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return text ? JSON.parse(text) : {};
}
function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
    throw new HttpError(400, 'Invalid record ID.');
  return value;
}
function requireSecret(value: string | undefined, label: string): asserts value is string {
  if (!value)
    throw new HttpError(
      503,
      `${label} is not configured. See the secure backend setup in the runbook.`,
    );
}
async function shareMedia(request: Request, env: Env) {
  requireSecret(env.SUPABASE_SECRET_KEY, 'Private sharing');
  const b = await body(request);
  const token = String(b.token ?? '');
  if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(404, 'This viewer link is unavailable.');
  const db = client(env, env.SUPABASE_SECRET_KEY);
  const hash = await sha256(token);
  const { data: grant, error } = await db
    .from('training_shares')
    .select('*')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !grant || (grant.expires_at && Date.parse(grant.expires_at) <= Date.now()))
    throw new HttpError(404, 'This viewer link is unavailable.');
  const { data: media, error: mediaError } = await db
    .from('training_media')
    .select('id,object_path,mime_type')
    .eq('user_id', grant.user_id)
    .eq('session_id', grant.session_id)
    .eq('status', 'uploaded')
    .in('id', grant.media_ids);
  if (mediaError) throw new HttpError(503, 'Media access is temporarily unavailable.');
  const videos = [];
  for (const m of media ?? []) {
    const { data, error } = await db.storage
      .from('training-videos')
      .createSignedUrl(m.object_path, 60);
    if (error) throw new HttpError(503, 'Media access is temporarily unavailable.');
    videos.push({ id: m.id, url: data.signedUrl, mime: m.mime_type });
  }
  return json({ videos, expiresIn: 60 });
}
function viewer() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Shared training videos</title><style>body{margin:0;background:#F7F8FA;color:#15181E;font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}main{max-width:800px;margin:auto;padding:32px 20px}h1{font-size:26px}video{width:100%;max-height:70vh;background:#191C23;margin:12px 0;border-radius:8px}p{color:#5A6472}</style></head><body><main><h1>Shared training videos</h1><p id="status">Checking viewer access…</p><div id="videos"></div></main><script>const token=location.hash.slice(1);history.replaceState(null,'','/viewer');async function load(){try{const r=await fetch('/api/shared',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);document.getElementById('status').textContent='Private videos shared with you. This link may be revoked by the athlete.';const root=document.getElementById('videos');root.replaceChildren();for(const item of data.videos){const v=document.createElement('video');v.controls=true;v.playsInline=true;v.src=item.url;root.append(v)}}catch(e){document.getElementById('status').textContent=e.message;document.getElementById('videos').replaceChildren()}}load();setInterval(load,55000);</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src https://*.supabase.co; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
export async function processSheetJobs(env: Env) {
  if (
    env.SHEETS_WRITEBACK_ENABLED !== 'true' ||
    !env.SUPABASE_SECRET_KEY ||
    !env.GOOGLE_WRITE_SERVICE_ACCOUNT_JSON ||
    !env.GOOGLE_SERVICE_ACCOUNT_JSON
  )
    return;
  const db = client(env, env.SUPABASE_SECRET_KEY);
  const { data, error } = await db.rpc('training_claim_sheet_jobs', { p_limit: 3 });
  if (error) throw new Error('Could not claim sheet jobs.');
  for (const record of data ?? []) {
    const job = record.payload as SheetWrite;
    try {
      const { data: mapping } = await db
        .from('training_source_mappings')
        .select('*')
        .eq('id', record.mapping_id)
        .eq('user_id', record.user_id)
        .single();
      if (!mapping?.verified || !mapping.writeback_enabled)
        throw new Error('Source mapping needs review.');
      const { data: latest } = await db
        .from('training_source_mappings')
        .select('id')
        .eq('user_id', record.user_id)
        .eq('mapping->>workbookId', job.mapping.workbookId)
        .eq('mapping->>sheetId', String(job.mapping.sheetId))
        .order('created_at', { ascending: false })
        .limit(1);
      if (latest?.[0]?.id !== mapping.id) throw new Error('Destination mapping was superseded.');
      if (job.mapping.workbookId !== env.WORKBOOK_ID)
        throw new Error('Destination workbook changed.');
      const wb = await getWorkbook(
        env.WORKBOOK_ID,
        env.GOOGLE_SERVICE_ACCOUNT_JSON,
        `'${job.mapping.title.replace(/'/g, "''")}'!${job.mapping.range}`,
      );
      const sheet = wb.sheets.find((s) => s.properties.sheetId === job.mapping.sheetId);
      if (!sheet) throw new Error('Source sheet changed.');
      const row = flatten(sheet).get(job.row);
      if (!row) throw new Error('Destination row missing.');
      const planned = planWrite(job, {
        mapping: mapping.mapping,
        coachFingerprint: await sha256(coachInputText(sheet)),
        exerciseName: row[2]?.formattedValue ?? '',
        top: row[5] ?? {},
        notes: row[10] ?? {},
      });
      if (!planned.alreadyApplied)
        await writeResult(job, planned.top, planned.notes, env.GOOGLE_WRITE_SERVICE_ACCOUNT_JSON);
      const { error } = await db
        .from('training_sync_jobs')
        .update({ status: 'completed', lease_until: null, error: null })
        .eq('id', record.id);
      if (error) throw new Error('Write acknowledgement failed.');
    } catch (error) {
      const uncertain =
        error instanceof Error && /not confirmed|acknowledgement|unavailable/.test(error.message);
      await db
        .from('training_sync_jobs')
        .update({
          status: uncertain ? 'pending' : 'held',
          lease_until: null,
          attempts: record.attempts + 1,
          next_attempt_at: new Date(
            Date.now() + Math.min(3600000, 15000 * 2 ** Math.min(record.attempts, 8)),
          ).toISOString(),
          error: uncertain
            ? 'Awaiting destination reconciliation.'
            : 'Mapping or human edit conflict. Review before retrying.',
        })
        .eq('id', record.id);
    }
  }
}
const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;
    try {
      if (url.pathname === '/api/health') return json({ app: 'Training', status: 'ok' });
      if (url.pathname === '/viewer') return viewer();
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        return new Response(null, {
          status: 204,
          headers:
            origin === env.APP_ORIGIN
              ? {
                  'Access-Control-Allow-Origin': origin,
                  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                  Vary: 'Origin',
                }
              : {},
        });
      }
      if (url.pathname === '/api/shared' && request.method === 'POST')
        return await shareMedia(request, env);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      const { db, user } = await authorise(request, env);
      if (url.pathname === '/api/status')
        response = json({
          googleRead: !!env.GOOGLE_SERVICE_ACCOUNT_JSON,
          writeback:
            env.SHEETS_WRITEBACK_ENABLED === 'true' && !!env.GOOGLE_WRITE_SERVICE_ACCOUNT_JSON,
          garmin: !!env.GARMIN_PERSONAL_API_KEY && user.id === env.GARMIN_OWNER_ID,
          sharing: !!env.SUPABASE_SECRET_KEY,
        });
      else if (url.pathname === '/api/sheets/sources' && request.method === 'GET') {
        requireSecret(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'Live Google Sheets reads');
        const workbook = await getWorkbook(env.WORKBOOK_ID, env.GOOGLE_SERVICE_ACCOUNT_JSON);
        response = json({
          sources: workbook.sheets.map((s) => ({
            sheetId: s.properties.sheetId,
            title: s.properties.title,
            hidden: s.properties.hidden,
          })),
        });
      } else if (url.pathname === '/api/sheets/preview' && request.method === 'POST') {
        requireSecret(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'Live Google Sheets reads');
        const b = await body(request);
        const metadata = await getWorkbook(env.WORKBOOK_ID, env.GOOGLE_SERVICE_ACCOUNT_JSON);
        const sheet = metadata.sheets.find(
          (s) => s.properties.sheetId === b.sheetId && !s.properties.hidden,
        );
        if (!sheet) throw new HttpError(400, 'Choose an existing visible source.');
        const count = sheet.properties.gridProperties?.rowCount ?? 0;
        if (count > 1000 || count < 1)
          throw new HttpError(400, 'This source requires a bounded mapping review.');
        const wb = await getWorkbook(
          env.WORKBOOK_ID,
          env.GOOGLE_SERVICE_ACCOUNT_JSON,
          `'${sheet.properties.title.replace(/'/g, "''")}'!A1:N${count}`,
        );
        const blockId = crypto.randomUUID();
        const version =
          sheet.properties.sheetId === 2145622624 &&
          sheet.properties.title === 'Rugby warm up/ Plyos'
            ? await importRoutines(
                wb,
                sheet.properties.sheetId,
                crypto.randomUUID(),
                new Date().toISOString(),
              )
            : await importSheet(wb, sheet.properties.sheetId, {
                blockId,
                versionId: crypto.randomUUID(),
                generation: blockId,
                round: 1,
                now: new Date().toISOString(),
              });
        const { error } = await db
          .from('training_candidates')
          .insert({ user_id: user.id, sheet_id: sheet.properties.sheetId, prescription: version });
        if (error) throw new HttpError(503, 'Could not stage this programme.');
        response = json({ version });
      } else if (url.pathname === '/api/garmin/import' && request.method === 'POST') {
        if (user.id !== env.GARMIN_OWNER_ID)
          throw new HttpError(403, 'This Garmin connection belongs to another athlete.');
        requireSecret(env.GARMIN_PERSONAL_API_KEY, 'Garmin import');
        const b = await body(request);
        const start = Number(b.start ?? 0);
        if (!Number.isInteger(start) || start < 0 || start > 10000)
          throw new HttpError(400, 'Invalid import offset.');
        const activities = await importGarmin(env.GARMIN_PERSONAL_API_KEY, start);
        for (const activity of activities) {
          const { error } = await db
            .from('training_external_activities')
            .upsert(
              { user_id: user.id, provider: 'garmin', external_id: activity.externalId, activity },
              { onConflict: 'user_id,provider,external_id', ignoreDuplicates: true },
            );
          if (error) throw new HttpError(503, 'Could not save Garmin activity. Retry the import.');
        }
        response = json({ activities, nextStart: activities.length === 20 ? start + 20 : null });
      } else if (url.pathname === '/api/shares' && request.method === 'POST') {
        requireSecret(env.SUPABASE_SECRET_KEY, 'Private sharing');
        const b = await body(request);
        const sessionId = uuid(b.sessionId);
        const ids = Array.isArray(b.mediaIds) ? b.mediaIds.map(uuid) : [];
        if (!ids.length || ids.length > 20)
          throw new HttpError(400, 'Select 1–20 uploaded videos.');
        const { data: media, error } = await db
          .from('training_media')
          .select('id')
          .eq('session_id', sessionId)
          .eq('status', 'uploaded')
          .in('id', ids);
        if (error || media?.length !== ids.length)
          throw new HttpError(403, 'A selected video is unavailable.');
        const token = [...crypto.getRandomValues(new Uint8Array(32))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const id = crypto.randomUUID();
        const { error: insertError } = await db.from('training_shares').insert({
          id,
          user_id: user.id,
          session_id: sessionId,
          media_ids: ids,
          token_hash: await sha256(token),
        });
        if (insertError) throw new HttpError(503, 'Could not save sharing grant.');
        response = json({ id, url: `${env.APP_ORIGIN}/viewer#${token}` });
      } else if (url.pathname === '/api/sheets/queue' && request.method === 'POST') {
        requireSecret(env.SUPABASE_SECRET_KEY, 'Coach result preparation');
        const b = await body(request);
        const sessionId = uuid(b.sessionId);
        const { data: record } = await db
          .from('training_sessions')
          .select('payload')
          .eq('id', sessionId)
          .single();
        if (!record) throw new HttpError(404, 'Save this session to the cloud first.');
        const session = record.payload as import('../../packages/core/model').Session;
        const { data: version } = await db
          .from('training_versions')
          .select('prescription')
          .eq('id', session.versionId)
          .single();
        const source = version?.prescription?.source;
        if (!source) throw new HttpError(400, 'This session has no coach source.');
        const { data: mappings } = await db
          .from('training_source_mappings')
          .select('*')
          .eq('block_id', session.blockId)
          .eq('round_number', session.round)
          .order('created_at', { ascending: false })
          .limit(1);
        const mapping = mappings?.[0];
        if (!mapping)
          throw new HttpError(
            409,
            'Map this round to a reviewed source before preparing sheet results.',
          );
        const admin = client(env, env.SUPABASE_SECRET_KEY);
        let queued = 0;
        let held = 0;
        for (const exercise of session.prescription.exercises) {
          const result = session.exercises.find((e) => e.prescriptionId === exercise.id);
          if (!result || !exercise.source) continue;
          const top = [...result.sets]
            .reverse()
            .find(
              (s) =>
                s.kind === 'top' &&
                s.load !== undefined &&
                (s.status === 'completed' || s.status === 'partial'),
            );
          const notes = [
            session.notes,
            result.notes,
            ...result.sets
              .filter((s) => s.notes || s.status === 'partial' || s.status === 'failed')
              .map(
                (s) =>
                  `${s.kind}: ${s.status}${s.reps !== undefined ? ` · ${s.reps} reps` : ''}${s.notes ? ` · ${s.notes}` : ''}`,
              ),
          ]
            .filter(Boolean)
            .join('\n');
          if (!top && !notes) continue;
          const id = crypto.randomUUID();
          const job: SheetWrite = {
            id,
            blockId: session.blockId,
            round: session.round,
            sessionId: session.id,
            mapping: mapping.mapping,
            row: exercise.source.row,
            exerciseName: exercise.name,
            expectedTop:
              exercise.source.cells.find((c) => c.a1 === `F${exercise.source!.row}`)?.display ?? '',
            expectedNotes:
              exercise.source.cells.find((c) => c.a1 === `K${exercise.source!.row}`)?.display ?? '',
            top:
              top?.load === undefined
                ? undefined
                : top.loadUnit === 'lb'
                  ? Number((top.load * 0.45359237).toFixed(3))
                  : top.load,
            notes: notes || `Top set recorded in Training · ${top?.reps ?? '—'} reps`,
          };
          const blocked =
            !mapping.verified ||
            !mapping.writeback_enabled ||
            env.SHEETS_WRITEBACK_ENABLED !== 'true';
          const { error } = await admin.from('training_sync_jobs').upsert(
            {
              id,
              user_id: user.id,
              session_id: sessionId,
              mapping_id: mapping.id,
              idempotency_key: `${sessionId}:${session.revision}:${exercise.id}`,
              payload: job,
              status: blocked ? 'held' : 'pending',
              error: blocked ? 'Test-copy mapping and recovery verification required.' : null,
            },
            { onConflict: 'idempotency_key', ignoreDuplicates: true },
          );
          if (error)
            throw new HttpError(503, 'Could not preserve the coach result job. Retry preparation.');
          if (blocked) held++;
          else queued++;
        }
        response = json({ queued, held });
      } else if (url.pathname === '/api/sheets/run' && request.method === 'POST') {
        await processSheetJobs(env);
        response = json({ status: 'reconciled' });
      } else throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      const status =
        error instanceof HttpError ? error.status : error instanceof SyntaxError ? 400 : 503;
      response = json(
        { error: error instanceof Error ? error.message : 'Service unavailable.' },
        status,
      );
    }
    const origin = request.headers.get('Origin');
    if (origin === env.APP_ORIGIN) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Vary', 'Origin');
    }
    return response;
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processSheetJobs(env));
  },
};
export default worker;

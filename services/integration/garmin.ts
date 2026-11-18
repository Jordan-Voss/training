import { garminActivity } from '../../packages/core/activities';
// Endpoints and text token response verified against Garmin's official Personal API Python client.
const BASE = 'https://personal.connectapi.garmin.com';
export async function importGarmin(key: string, start = 0) {
  const auth = await fetch(`${BASE}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${key}`, Accept: '*/*' },
    signal: AbortSignal.timeout(15000),
  });
  if (auth.status === 401 || auth.status === 403)
    throw new Error('Garmin key expired, revoked or unavailable. Replace the backend secret.');
  if (!auth.ok) throw new Error(`Garmin authorisation unavailable (${auth.status}).`);
  const token = (await auth.text()).trim();
  if (!token || token.length > 10000) throw new Error('Unexpected Garmin token response.');
  const response = await fetch(
    `${BASE}/activitylist-service/activities/search/activities?start=${start}&limit=20`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (response.status === 429) throw new Error('Garmin rate limit reached. Retry later.');
  if (!response.ok) throw new Error(`Garmin activity read unavailable (${response.status}).`);
  const raw = (await response.json()) as Record<string, unknown>[];
  if (!Array.isArray(raw)) throw new Error('Unexpected Garmin activity format.');
  return raw.map(garminActivity);
}

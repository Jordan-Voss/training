import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../services/integration/index';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SUPABASE_SECRET_KEY: '',
  APP_ORIGIN: 'https://training.example',
  WORKBOOK_ID: 'workbook',
  GARMIN_OWNER_ID: 'owner',
  SHEETS_WRITEBACK_ENABLED: 'false',
  GOOGLE_SERVICE_ACCOUNT_JSON: '',
  GOOGLE_WRITE_SERVICE_ACCOUNT_JSON: '',
  GARMIN_PERSONAL_API_KEY: '',
  ASSETS: { fetch: async () => new Response('static') },
} as Parameters<typeof worker.fetch>[1];
afterEach(() => vi.unstubAllGlobals());
describe('integration access boundaries', () => {
  it('requires an authenticated athlete for private endpoints', async () => {
    const response = await worker.fetch(new Request('https://training.example/api/status'), env);
    expect(response.status).toBe(401);
  });
  it('checks Training membership after validating the session', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
      String(input).includes('/auth/v1/user')
        ? Response.json({ id: 'outsider', aud: 'authenticated' })
        : Response.json([]),
    );
    const response = await worker.fetch(
      new Request('https://training.example/api/status', {
        headers: { Authorization: 'Bearer token' },
      }),
      env,
    );
    expect(response.status).toBe(403);
  });
  it('reports missing integrations honestly without exposing keys', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
      String(input).includes('/auth/v1/user')
        ? Response.json({ id: 'owner', aud: 'authenticated' })
        : Response.json([{ user_id: 'owner' }]),
    );
    const response = await worker.fetch(
      new Request('https://training.example/api/status', {
        headers: { Authorization: 'Bearer token' },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      googleRead: false,
      writeback: false,
      garmin: false,
      sharing: false,
    });
  });
  it('rejects revoked grants before issuing any storage access', async () => {
    let storageCalls = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).includes('/storage/')) storageCalls++;
      return Response.json(null);
    });
    const response = await worker.fetch(
      new Request('https://training.example/api/shared', {
        method: 'POST',
        body: JSON.stringify({ token: 'a'.repeat(64) }),
      }),
      { ...env, SUPABASE_SECRET_KEY: 'server-secret' },
    );
    expect(response.status).toBe(404);
    expect(storageCalls).toBe(0);
  });
  it('rejects expired grants before issuing storage access', async () => {
    let storageCalls = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).includes('/storage/')) storageCalls++;
      return Response.json({
        id: 'share',
        user_id: 'owner',
        session_id: 'session',
        media_ids: ['media'],
        expires_at: '2026-01-01T00:00:00Z',
      });
    });
    const response = await worker.fetch(
      new Request('https://training.example/api/shared', {
        method: 'POST',
        body: JSON.stringify({ token: 'a'.repeat(64) }),
      }),
      { ...env, SUPABASE_SECRET_KEY: 'server-secret' },
    );
    expect(response.status).toBe(404);
    expect(storageCalls).toBe(0);
  });
  it('keeps viewer tokens out of referrers and persistent URLs', async () => {
    const response = await worker.fetch(new Request('https://training.example/viewer'), env);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toContain("history.replaceState(null,'','/viewer')");
  });
  it('never accepts oversized public sharing payloads', async () => {
    const response = await worker.fetch(
      new Request('https://training.example/api/shared', {
        method: 'POST',
        body: 'x'.repeat(100001),
      }),
      { ...env, SUPABASE_SECRET_KEY: 'server-secret' },
    );
    expect(response.status).toBe(413);
  });
});

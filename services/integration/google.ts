import { SHEETS_SCOPE, type Workbook, type SheetWrite } from '../../packages/core/sheets';
export async function googleToken(credentials: string, write = false): Promise<string> {
  const account = JSON.parse(credentials) as { client_email: string; private_key: string };
  if (!account.client_email || !account.private_key)
    throw new Error('Google credentials are incomplete.');
  const b64 = (value: string) =>
    btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(
    JSON.stringify({
      iss: account.client_email,
      scope: write ? 'https://www.googleapis.com/auth/spreadsheets' : SHEETS_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  );
  const assertion = `${header}.${claims}.${b64(String.fromCharCode(...signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      'Google authorisation failed. Check the backend credential and workbook sharing.',
    );
  const result = (await response.json()) as { access_token: string };
  return result.access_token;
}
export async function getWorkbook(
  workbookId: string,
  credentials: string,
  range?: string,
): Promise<Workbook> {
  const token = await googleToken(credentials);
  const query = new URLSearchParams({ includeGridData: range ? 'true' : 'false' });
  if (range) query.set('ranges', range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(workbookId)}?${query}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error(`Workbook read failed (${response.status}).`);
  return response.json() as Promise<Workbook>;
}
export async function writeResult(
  job: SheetWrite,
  top: number | undefined,
  notes: string | undefined,
  credentials: string,
) {
  const token = await googleToken(credentials, true);
  const requests = [];
  if (top !== undefined)
    requests.push({
      updateCells: {
        range: {
          sheetId: job.mapping.sheetId,
          startRowIndex: job.row - 1,
          endRowIndex: job.row,
          startColumnIndex: 5,
          endColumnIndex: 6,
        },
        rows: [{ values: [{ userEnteredValue: { numberValue: top } }] }],
        fields: 'userEnteredValue',
      },
    });
  if (notes !== undefined)
    requests.push({
      updateCells: {
        range: {
          sheetId: job.mapping.sheetId,
          startRowIndex: job.row - 1,
          endRowIndex: job.row,
          startColumnIndex: 10,
          endColumnIndex: 11,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: notes } }] }],
        fields: 'userEnteredValue',
      },
    });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(job.mapping.workbookId)}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Sheet result write was not confirmed (${response.status}). Reconcile before retrying.`,
    );
}

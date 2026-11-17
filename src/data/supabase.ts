import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { authStorage } from '../storage/auth-storage';
import { ConflictError, type SessionTransport } from '../../packages/core/store';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : undefined;
export const transport: SessionTransport = {
  async apply(op) {
    if (!supabase) throw new Error('Cloud not configured');
    const { error } = await supabase.rpc('training_apply_session', {
      p_operation: op.id,
      p_expected: op.expectedRevision,
      p_session: op.session,
    });
    if (error) {
      if (error.code === '40001') throw new ConflictError(error.message);
      throw error;
    }
  },
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw new Error('Sign in to continue.');
  const base = process.env.EXPO_PUBLIC_API_URL ?? 'https://training.jordanvoss.dev';
  const response = await fetch(`${base}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'Request failed.');
  return json as T;
}

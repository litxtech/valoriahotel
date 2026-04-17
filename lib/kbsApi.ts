import { supabase } from '@/lib/supabase';

const baseUrl = process.env.EXPO_PUBLIC_RAILWAY_API_URL ?? '';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  if (!baseUrl) return { ok: false, error: { code: 'CONFIG', message: 'EXPO_PUBLIC_RAILWAY_API_URL missing' } };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Not authenticated' } };

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!json) return { ok: false, error: { code: 'NETWORK', message: 'Invalid server response' } };
  return json;
}


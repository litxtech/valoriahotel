import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

function getRailwayBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const pub = (extra.public ?? {}) as Record<string, unknown>;
  const fromExtra = typeof pub.railwayApiUrl === 'string' ? pub.railwayApiUrl : '';
  return fromExtra || (process.env.EXPO_PUBLIC_RAILWAY_API_URL ?? '');
}

const baseUrl = getRailwayBaseUrl();
export const railwayApiBaseUrl = baseUrl;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

export type ApiDebugEntry = {
  ts: string;
  method: 'GET' | 'POST';
  url: string;
  status?: number;
  contentType?: string;
  bodyPreview?: string;
  note?: string;
};

let lastApiDebug: ApiDebugEntry | null = null;
export function getLastApiDebug() {
  return lastApiDebug;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  if (!baseUrl) return { ok: false, error: { code: 'CONFIG', message: 'EXPO_PUBLIC_RAILWAY_API_URL missing' } };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Not authenticated' } };

  const url = `${baseUrl}${path}`;
  lastApiDebug = { ts: new Date().toISOString(), method: 'POST', url, note: 'request_sent' };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await res.text().catch(() => '');
    lastApiDebug = {
      ts: new Date().toISOString(),
      method: 'POST',
      url,
      status: res.status,
      contentType,
      bodyPreview: text.slice(0, 500),
      note: 'non_json_response'
    };
    return {
      ok: false,
      error: {
        code: 'NETWORK',
        message: 'Invalid server response (expected JSON)',
        details: { status: res.status, contentType, bodyPreview: text.slice(0, 500) }
      }
    };
  }
  const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!json) {
    lastApiDebug = {
      ts: new Date().toISOString(),
      method: 'POST',
      url,
      status: res.status,
      contentType,
      note: 'invalid_json'
    };
    return { ok: false, error: { code: 'NETWORK', message: 'Invalid JSON response' } };
  }
  lastApiDebug = { ts: new Date().toISOString(), method: 'POST', url, status: res.status, contentType, note: 'json_ok' };
  return json;
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  if (!baseUrl) return { ok: false, error: { code: 'CONFIG', message: 'EXPO_PUBLIC_RAILWAY_API_URL missing' } };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Not authenticated' } };

  const url = `${baseUrl}${path}`;
  lastApiDebug = { ts: new Date().toISOString(), method: 'GET', url, note: 'request_sent' };
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await res.text().catch(() => '');
    lastApiDebug = {
      ts: new Date().toISOString(),
      method: 'GET',
      url,
      status: res.status,
      contentType,
      bodyPreview: text.slice(0, 500),
      note: 'non_json_response'
    };
    return {
      ok: false,
      error: {
        code: 'NETWORK',
        message: 'Invalid server response (expected JSON)',
        details: { status: res.status, contentType, bodyPreview: text.slice(0, 500) }
      }
    };
  }
  const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!json) {
    lastApiDebug = {
      ts: new Date().toISOString(),
      method: 'GET',
      url,
      status: res.status,
      contentType,
      note: 'invalid_json'
    };
    return { ok: false, error: { code: 'NETWORK', message: 'Invalid JSON response' } };
  }
  lastApiDebug = { ts: new Date().toISOString(), method: 'GET', url, status: res.status, contentType, note: 'json_ok' };
  return json;
}


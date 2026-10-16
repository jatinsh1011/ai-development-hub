'use client';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const COOKIE = 'aidev_token';

export const getToken = () => document.cookie.split('; ').find((c) => c.startsWith(COOKIE + '='))?.split('=')[1];
export const setToken = (t: string) => { document.cookie = `${COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`; };
export const clearToken = () => { document.cookie = `${COOKIE}=; path=/; max-age=0`; };

export async function clientApi<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const token = getToken();
  try {
    const r = await fetch(`${API}/v1${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: r.status, data: (await r.json().catch(() => ({}))) as T };
  } catch {
    return { status: 0, data: { error: 'The registry is not reachable.' } as T };
  }
}

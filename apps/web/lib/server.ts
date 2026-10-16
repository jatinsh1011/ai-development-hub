import 'server-only';
import { cookies } from 'next/headers';
import type { User } from './types';

export const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const COOKIE = 'aidev_token';

export async function getToken() { return (await cookies()).get(COOKIE)?.value; }

export async function serverApi<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const token = await getToken();
  try {
    const r = await fetch(`${API}/v1${path}`, {
      method: opts.method ?? 'GET', cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: r.status, data: (await r.json().catch(() => ({}))) as T };
  } catch {
    return { status: 0, data: { error: 'The registry is not reachable.' } as T };
  }
}

export async function currentUser(): Promise<User | null> {
  if (!(await getToken())) return null;
  const r = await serverApi<{ user: User }>('/auth/me');
  return r.status === 200 ? r.data.user : null;
}

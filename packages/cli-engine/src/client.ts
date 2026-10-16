import type { ArtifactFile, Manifest, RiskItem, Finding } from '@aidev/artifact-schema';
import { CliError, Exit } from './errors.js';
import type { Config } from './config.js';

export interface Governance { status: 'approved' | 'blocked' | 'external'; org: string }
export interface SearchItem {
  owner: string; slug: string; title: string; type: string; description: string; latestVersion: string; verified: boolean; official: boolean;
  installs: number; stars: number; downloads: number; rating: string | null; compat: Record<string, boolean>; tags: string[]; visibility: string; updatedAt: string;
}
export interface ResolvedNode {
  owner: string; slug: string; type: string; version: string; sha256: string; manifest: Manifest; files: ArtifactFile[];
  risk: RiskItem[]; findings: Finding[]; governance: Governance | null; requiredBy: string | null;
}

export class RegistryClient {
  constructor(private cfg: Config) {}
  get registry() { return this.cfg.registry; }
  get hasToken() { return !!this.cfg.token; }

  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.cfg.registry + '/v1' + path, {
        method,
        headers: { 'content-type': 'application/json', 'user-agent': 'aidev-cli', ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new CliError(Exit.NETWORK, 'network', `cannot reach registry at ${this.cfg.registry}`, 'check `aidev config` or set AIDEV_REGISTRY', String(e));
    }
    const data: any = await res.json().catch(() => ({}));
    if (res.ok) return data as T;
    const msg: string = data.error ?? data.message ?? `registry returned ${res.status}`;
    if (res.status === 401) throw new CliError(Exit.AUTH, 'auth', msg, data.hint ?? 'run `aidev login` or set AIDEV_TOKEN');
    if (res.status === 403) throw new CliError(data.code === 'BLOCKED' ? Exit.POLICY : Exit.AUTH, data.code === 'BLOCKED' ? 'blocked' : 'forbidden', msg, data.code === 'BLOCKED' ? 'ask your company admin to unblock it' : undefined);
    if (res.status === 404) throw new CliError(Exit.NOT_FOUND, 'not-found', msg);
    if (res.status === 409) throw new CliError(Exit.CONFLICT, 'conflict', msg);
    if (res.status === 422 || res.status === 400) throw new CliError(Exit.VALIDATION, 'validation', msg, undefined, data);
    throw new CliError(Exit.GENERIC, 'registry', msg);
  }

  search(params: Record<string, string | number | boolean | undefined>) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return this.request<{ total: number; items: SearchItem[] }>('GET', `/artifacts?${qs}`);
  }
  lookup(ref: string, version?: string) { return this.request<any>('GET', `/lookup?ref=${encodeURIComponent(ref)}${version ? `&version=${encodeURIComponent(version)}` : ''}`); }
  resolve(ref: string, range?: string) { return this.request<{ root: string; order: ResolvedNode[] }>('GET', `/install?ref=${encodeURIComponent(ref)}${range ? `&range=${encodeURIComponent(range)}` : ''}`); }
  updates(items: { ref: string; version: string }[]) { return this.request<{ updates: any[] }>('POST', '/updates', { items }); }
  recordInstall(ref: string, version: string, provider: string, action: string) { return this.request('POST', `/artifacts/${ref}/installed`, { version, provider, action }); }
  validate(files: ArtifactFile[]) { return this.request<any>('POST', '/artifacts/validate', { files }); }
  publish(body: unknown) { return this.request<any>('POST', '/artifacts', body); }
  me() { return this.request<{ user: { id: string; email: string; handle: string; name: string } }>('GET', '/auth/me'); }
  login(email: string, password: string) { return this.request<{ token: string; user: any }>('POST', '/auth/login', { email, password }); }
  logout() { return this.request('POST', '/auth/logout', {}); }
  orgs() { return this.request<{ orgs: any[] }>('GET', '/orgs'); }
  resources() { return this.request<{ resources: any[] }>('GET', '/me/resources'); }
}

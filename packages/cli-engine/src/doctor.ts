import { promises as fs } from 'node:fs';
import { adapters, sha } from '@aidev/provider-adapters';
import { readLock, loadState, scopeRoot } from './state.js';
import { detectProviders, displayPath, type Env } from './installer.js';

export interface Check { name: string; status: 'ok' | 'warn' | 'fail'; detail: string }

export async function doctor(env: Env, scope: 'project' | 'user' = 'project'): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, status: Check['status'], detail: string) => checks.push({ name, status, detail });
  add('node', Number(process.versions.node.split('.')[0]) >= 20 ? 'ok' : 'fail', `v${process.versions.node}`);
  try { await env.client.request('GET', '/health'); add('registry', 'ok', env.cfg.registry); } catch (e: any) { add('registry', 'fail', `${env.cfg.registry} — ${e.message}`); }
  if (!env.client.hasToken) add('auth', 'warn', 'not logged in (public artifacts only) — run `aidevkit login`');
  else { try { const me = await env.client.me(); add('auth', 'ok', `${me.user.handle} <${me.user.email}>`); } catch (e: any) { add('auth', 'fail', e.message); } }
  for (const d of await detectProviders(env)) add(`provider:${d.adapter.id}`, d.env.detected ? 'ok' : 'warn', d.env.detected ? d.env.evidence.join(', ') : 'not detected');

  const root = scopeRoot(scope, env.cwd, env.home);
  const state = await loadState(root);
  for (const e of Object.values(state.installed)) {
    for (const [pid, rec] of Object.entries(e.providers)) {
      for (const op of rec!.ops) {
        if (op.kind !== 'write') continue;
        const cur = await fs.readFile(op.path, 'utf8').catch(() => null);
        if (cur === null) add(`${e.ref}:${pid}`, 'fail', `missing ${displayPath(op.path, env)}`);
        else if (sha(cur) !== sha(op.content)) add(`${e.ref}:${pid}`, 'warn', `modified locally: ${displayPath(op.path, env)}`);
      }
    }
  }
  if (Object.keys(state.installed).length && !checks.some((c) => c.name.includes(':') && c.status !== 'ok' && !c.name.startsWith('provider'))) add('installed', 'ok', `${Object.keys(state.installed).length} artifact(s) intact`);
  const lock = await readLock(env.cwd);
  if (scope === 'project') {
    if (!lock && Object.keys(state.installed).length) add('lockfile', 'warn', 'no .aidev-lock.json — commit one for reproducible setups');
    else if (lock) {
      const drift = Object.entries(lock.artifacts).filter(([r, a]) => state.installed[r]?.version !== a.version);
      add('lockfile', drift.length ? 'warn' : 'ok', drift.length ? `out of sync: ${drift.map(([r]) => r).join(', ')} (run \`aidevkit install\`)` : 'in sync');
    }
  }
  void adapters;
  return checks;
}

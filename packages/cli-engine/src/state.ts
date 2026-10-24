import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PlanOp, Scope } from '@aidev/provider-adapters';
import type { ProviderId } from '@aidev/artifact-schema';

export interface InstalledEntry {
  ref: string;
  type: string;
  version: string;
  sha256: string;
  range: string;
  explicit: boolean;              // requested by the user (vs pulled in as a dependency)
  dependsOn: string[];
  installedAt: string;
  providers: Partial<Record<ProviderId, { ops: PlanOp[]; backupId?: string }>>;
  /** install transaction (rollback point) that produced this entry */
  tx?: string;
  /** entry as it was before that transaction, restored by `aidevkit rollback` */
  previous?: Omit<InstalledEntry, 'previous'>;
}
export interface State { version: 1; installed: Record<string, InstalledEntry> }

/** Project scope → <cwd>/.aidev ; user scope → ~/.aidev */
export const scopeRoot = (scope: Scope, cwd: string, home: string) => (scope === 'user' ? home : cwd);
export const stateFile = (root: string) => path.join(root, '.aidev', 'state.json');
export const backupRoot = (root: string) => path.join(root, '.aidev', 'backups');
export const lockFile = (root: string) => path.join(root, '.aidev-lock.json');

export async function loadState(root: string): Promise<State> {
  try { return JSON.parse(await fs.readFile(stateFile(root), 'utf8')); } catch { return { version: 1, installed: {} }; }
}
export async function saveState(root: string, s: State) {
  await fs.mkdir(path.dirname(stateFile(root)), { recursive: true });
  await fs.writeFile(stateFile(root), JSON.stringify(s, null, 2));
}

export interface Lock {
  lockfileVersion: 1;
  registry: string;
  artifacts: Record<string, { version: string; sha256: string; type: string; explicit: boolean; providers: ProviderId[] }>;
}

/** Reproducible description of the project's AI-dev environment. Commit it. */
export async function writeLock(root: string, registry: string, state: State) {
  const artifacts: Lock['artifacts'] = {};
  for (const ref of Object.keys(state.installed).sort()) {
    const e = state.installed[ref];
    artifacts[ref] = { version: e.version, sha256: e.sha256, type: e.type, explicit: e.explicit, providers: Object.keys(e.providers) as ProviderId[] };
  }
  const file = lockFile(root);
  if (!Object.keys(artifacts).length) { await fs.rm(file, { force: true }); return; }
  await fs.writeFile(file, JSON.stringify({ lockfileVersion: 1, registry, artifacts } satisfies Lock, null, 2) + '\n');
}
export async function readLock(root: string): Promise<Lock | null> {
  try { return JSON.parse(await fs.readFile(lockFile(root), 'utf8')); } catch { return null; }
}

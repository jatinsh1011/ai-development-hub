import path from 'node:path';
import { hashFiles, PROVIDER_IDS, semver, validateArtifact, type ProviderId, type ResolvedArtifact } from '@aidev/artifact-schema';
import { adapters, rollback, sameTarget, type Change, type InstallResult, type PlanOp, type Scope } from '@aidev/provider-adapters';
import type { RegistryClient, ResolvedNode } from './client.js';
import type { Config } from './config.js';
import { CliError, Exit } from './errors.js';
import type { Output } from './output.js';
import type { Prompter } from './prompt.js';
import { backupRoot, loadState, readLock, saveState, scopeRoot, writeLock, type InstalledEntry, type State } from './state.js';

export interface Env { cwd: string; home: string; out: Output; prompt: Prompter; client: RegistryClient; cfg: Config }
export interface InstallFlags {
  providers?: string[]; all?: boolean; scope: Scope; yes?: boolean; force?: boolean; dryRun?: boolean; diff?: boolean;
  allowRisky?: boolean; range?: string; explicit?: boolean;
}

const ALIASES: Record<string, ProviderId> = { copilot: 'copilot', 'github-copilot': 'copilot', claude: 'claude', 'claude-code': 'claude', claudecode: 'claude', codex: 'codex' };
export const normalizeProvider = (p: string): ProviderId => {
  const id = ALIASES[p.toLowerCase()];
  if (!id) throw new CliError(Exit.USAGE, 'usage', `unknown provider "${p}"`, `valid providers: ${PROVIDER_IDS.join(', ')}`);
  return id;
};

export const displayPath = (p: string, env: Pick<Env, 'cwd' | 'home'>) =>
  p.startsWith(env.cwd + path.sep) ? path.relative(env.cwd, p) : p.startsWith(env.home + path.sep) ? '~/' + path.relative(env.home, p) : p;

export async function detectProviders(env: Pick<Env, 'cwd' | 'home'>) {
  return Promise.all(Object.values(adapters).map(async (a) => ({ adapter: a, env: await a.inspect({ cwd: env.cwd, home: env.home }) })));
}

export async function selectProviders(env: Env, flags: Pick<InstallFlags, 'providers' | 'all'>): Promise<ProviderId[]> {
  if (flags.providers?.length) return [...new Set(flags.providers.map(normalizeProvider))];
  const found = (await detectProviders(env)).filter((d) => d.env.detected).map((d) => d.adapter.id);
  if (flags.all) {
    if (!found.length) throw new CliError(Exit.USAGE, 'no-provider', 'no AI coding tools detected', 'pass --provider copilot|claude|codex');
    return found;
  }
  if (found.length === 1) return found;
  if (!found.length) throw new CliError(Exit.USAGE, 'no-provider', 'no AI coding tools detected in this project or home directory', 'pass --provider copilot|claude|codex');
  const pref = env.cfg.defaultProvider && ALIASES[env.cfg.defaultProvider];
  if (pref && found.includes(pref)) return [pref];
  if (process.env.CLAUDECODE && found.includes('claude')) return ['claude'];
  if (env.prompt.interactive) {
    const names = found.map((id) => adapters[id].name);
    const picked = await env.prompt.choose('Install for which tools?', names, names);
    return found.filter((id) => picked.includes(adapters[id].name));
  }
  throw new CliError(Exit.USAGE, 'ambiguous-provider', `multiple AI tools detected (${found.join(', ')})`, 'pass --provider <id> or --all, or run `aidev config set defaultProvider <id>`');
}

const asArtifact = (n: ResolvedNode): ResolvedArtifact => ({ owner: n.owner, slug: n.slug, version: n.version, sha256: n.sha256, manifest: n.manifest, files: n.files });
const refOf = (n: { owner: string; slug: string }) => `${n.owner}/${n.slug}`;

function depRefs(n: ResolvedNode, all: ResolvedNode[]): string[] {
  const d = n.manifest.dependencies;
  const names = new Set([...d.skills, ...d.mcps, ...d.agents, ...d.prompts, ...d.instructions].map((x) => x.split('@')[0]));
  return all.filter((o) => o !== n && (names.has(o.slug) || names.has(refOf(o)))).map(refOf);
}

export interface ProviderOutcome { id: ProviderId; name: string; skipped?: string; notes: string[]; files: { path: string; action: string }[]; diffs?: string[] }
export interface NodeOutcome { ref: string; version: string; type: string; explicit: boolean; risk: unknown; providers: ProviderOutcome[] }

/** Core transaction: verify → consent → plan (no writes) → apply with rollback → record state. */
export async function installNodes(env: Env, order: ResolvedNode[], providers: ProviderId[], flags: InstallFlags, action: 'artifact_installed' | 'artifact_updated' = 'artifact_installed') {
  const { out } = env;
  const root = scopeRoot(flags.scope, env.cwd, env.home);
  const state = await loadState(root);
  const rootNode = order[order.length - 1];

  // 1. integrity + independent validation. Never trust what the registry says about its own content:
  //    the manifest is re-derived from the hashed files, and unsafe paths are rejected.
  for (const n of order) {
    if (hashFiles(n.files) !== n.sha256) throw new CliError(Exit.VALIDATION, 'integrity', `${refOf(n)}@${n.version} failed its integrity check (sha256 mismatch) — refusing to install`);
    const rep = validateArtifact(n.files);
    if (!rep.ok || !rep.manifest) throw new CliError(Exit.VALIDATION, 'invalid-artifact', `${refOf(n)}@${n.version} is not a valid artifact: ${rep.issues.filter((i) => i.level === 'error').map((i) => `${i.path} ${i.message}`).join('; ')}`);
    n.manifest = rep.manifest;
    n.findings = rep.findings;   // re-scan locally; do not rely on the server's verdict
  }

  // 2. show what is being installed + consent
  out.ok(`Artifact resolved  ${refOf(rootNode)}@${rootNode.version}`);
  if (order.length > 1) out.ok(`Dependencies resolved (${order.length - 1}): ${order.slice(0, -1).map((n) => `${n.slug}@${n.version}`).join(', ')}`);
  for (const n of order) {
    const g = n.governance;
    if (g?.status === 'external') out.warn(`${refOf(n)} is not approved by ${g.org} (external)`);
    if (g?.status === 'approved') out.line(`  ${out.c('green', '✓')} ${refOf(n)} approved by ${g.org}`);
  }
  const risks = order.filter((n) => n.risk.length);
  if (risks.length) {
    out.line();
    out.line(out.c('bold', 'Requested permissions:'));
    for (const n of risks) {
      out.line(`  ${refOf(n)}`);
      for (const r of n.risk) out.line(`    ${r.level === 'high' ? out.c('yellow', '!') : '-'} ${r.label}: ${r.detail}`);
    }
  }
  const findings = order.flatMap((n) => n.findings.filter((f) => f.severity !== 'info').map((f) => ({ ...f, ref: refOf(n) })));
  if (findings.length) {
    out.line();
    for (const f of findings) out.warn(`${f.ref}: ${f.file}:${f.line} [${f.severity}] ${f.message}`);
  }
  const high = findings.some((f) => f.severity === 'high');
  if (high && !flags.allowRisky) throw new CliError(Exit.CONSENT, 'risky', 'artifact contains high-severity findings', 'review them with `aidev info`, then re-run with --allow-risky if you trust the publisher');
  if (!flags.dryRun) {
    out.line();
    if (!flags.yes) {
      if (!env.prompt.interactive) throw new CliError(Exit.CONSENT, 'consent-required', 'installation needs your consent to the permissions above', 're-run with --yes after reviewing `aidev info <artifact>`');
      if (!(await env.prompt.confirm(`Install ${refOf(rootNode)}@${rootNode.version} for ${providers.map((p) => adapters[p].name).join(', ')}?`, false))) throw new CliError(Exit.CONSENT, 'declined', 'installation cancelled');
    }
  }

  // 3. plan (dry-run, nothing written). All writes of this install share one rollback point.
  const txId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
  const txRoot = path.join(backupRoot(root), txId);
  const opts = (n: ResolvedNode, p: ProviderId, dryRun: boolean) => ({
    cwd: env.cwd, home: env.home, scope: flags.scope, force: flags.force, dryRun,
    previous: state.installed[refOf(n)]?.providers[p]?.ops, backupRoot: txRoot,
  });
  const plans: { n: ResolvedNode; p: ProviderId; r: InstallResult }[] = [];
  for (const n of order) for (const p of providers) plans.push({ n, p, r: await adapters[p].installArtifact(asArtifact(n), opts(n, p, true)) });
  const conflicts = plans.flatMap(({ n, p, r }) => r.conflicts.map((c) => ({ ref: refOf(n), provider: p, path: displayPath(c.path, env), reason: c.reason })));
  if (conflicts.length) {
    throw new CliError(Exit.CONFLICT, 'conflict', `refusing to overwrite existing configuration:\n${conflicts.map((c) => `  ! ${c.path} (${c.provider}): ${c.reason}`).join('\n')}`, 'inspect the files, then re-run with --force (a backup is created first)', conflicts);
  }
  const rootSkipped = plans.filter((x) => x.n === rootNode && x.r.skipped);
  if (rootSkipped.length === providers.length) {
    throw new CliError(Exit.UNSUPPORTED, 'unsupported', `${refOf(rootNode)} cannot be installed for ${providers.join(', ')}: ${rootSkipped.map((x) => x.r.skipped).join('; ')}`);
  }

  // 4. apply, rolling back everything on failure
  const applied: { backupId: string; root: string }[] = [];
  let overwrote = 0;
  const results = new Map<string, InstallResult>();
  try {
    for (const { n, p, r: dry } of plans) {
      if (dry.skipped || flags.dryRun) { results.set(`${refOf(n)}|${p}`, dry); continue; }
      const r = await adapters[p].installArtifact(asArtifact(n), opts(n, p, false));
      if (r.backupId) applied.push({ backupId: r.backupId, root: txRoot });
      overwrote += r.changes.filter((c) => c.before !== null && (c.action === 'update' || c.action === 'delete')).length;
      results.set(`${refOf(n)}|${p}`, r);
      // remove files from a previous version that the new version no longer ships
      const prev = state.installed[refOf(n)]?.providers[p]?.ops ?? [];
      const stale = prev.filter((o) => !r.ops.some((x) => sameTarget(o, x)));
      if (stale.length) {
        const u = await adapters[p].uninstallArtifact(n, { ...opts(n, p, false), ops: stale });
        if (u.backupId) applied.push({ backupId: u.backupId, root: txRoot });
        overwrote += u.changes.filter((c) => c.before !== null).length;
      }
    }
  } catch (e) {
    for (const b of applied.reverse()) await rollback(b.root, b.backupId).catch(() => {});
    throw new CliError(Exit.GENERIC, 'install-failed', `installation failed and was rolled back: ${(e as Error).message}`);
  }

  // 5. report + record
  const outcomes: NodeOutcome[] = [];
  for (const n of order) {
    const ref = refOf(n);
    const prevEntry = state.installed[ref];
    const entry: InstalledEntry = {
      ref, type: n.type, version: n.version, sha256: n.sha256, range: flags.range ?? 'latest',
      explicit: n === rootNode ? flags.explicit !== false : prevEntry?.explicit ?? false,
      dependsOn: depRefs(n, order), installedAt: new Date().toISOString(), providers: { ...(prevEntry?.providers ?? {}) },
      tx: txId, previous: prevEntry ? (({ previous: _p, ...rest }) => rest)(prevEntry) : undefined,
    };
    const po: ProviderOutcome[] = [];
    for (const p of providers) {
      const r = results.get(`${ref}|${p}`)!;
      po.push({
        id: p, name: adapters[p].name, skipped: r.skipped, notes: r.notes,
        files: r.changes.map((c) => ({ path: displayPath(c.path, env), action: c.action })),
        ...(flags.dryRun && flags.diff ? { diffs: r.changes.map((c) => c.diff).filter(Boolean) } : {}),
      });
      if (!r.skipped && !flags.dryRun) entry.providers[p] = { ops: r.ops, backupId: r.backupId };
    }
    outcomes.push({ ref, version: n.version, type: n.type, explicit: entry.explicit, risk: n.risk, providers: po });
    if (!flags.dryRun) state.installed[ref] = entry;
  }

  out.line();
  for (const o of outcomes) {
    out.line(out.c('bold', `${o.ref}@${o.version}`) + out.c('dim', `  (${o.type})`));
    for (const p of o.providers) {
      if (p.skipped) { out.line(`  ${p.name}: ${out.c('yellow', 'skipped')} — ${p.skipped}`); continue; }
      out.line(`  ${p.name}:`);
      if (!p.files.length) out.line(out.c('dim', '    (no files — installs dependencies only)'));
      for (const f of p.files) out.line(`    ${f.action === 'create' ? out.c('green', '+') : f.action === 'update' ? out.c('yellow', '~') : out.c('dim', '=')} ${f.path}${f.action === 'unchanged' ? out.c('dim', ' (unchanged)') : ''}`);
      for (const note of p.notes) out.line(out.c('dim', `    note: ${note}`));
      for (const d of p.diffs ?? []) out.line(d);
    }
  }
  const backups = applied.length ? [txId] : [];
  if (flags.dryRun) { out.line(); out.info('Dry run — nothing was written.'); return { outcomes, backups: [], root: refOf(rootNode), dryRun: true as const }; }

  await saveState(root, state);
  if (flags.scope === 'project') await writeLock(root, env.cfg.registry, state);
  for (const n of order) for (const p of providers) {
    if (!results.get(`${refOf(n)}|${p}`)!.skipped) env.client.recordInstall(refOf(n), n.version, p, action).catch(() => {});
  }
  out.line();
  if (backups.length) out.ok(`${overwrote ? 'Backup created' : 'Rollback point created'}  ${txId}  (undo with \`aidev rollback ${txId}\`)`);
  out.ok('Configuration updated');
  out.line();
  out.line(out.c('bold', 'Ready to use.'));
  return { outcomes, backups, root: refOf(rootNode), dryRun: false as const };
}

/** Resolve a user-supplied ref against what is installed (accepts bare names). */
export function findInstalled(state: State, ref: string): InstalledEntry | undefined {
  if (state.installed[ref]) return state.installed[ref];
  const m = Object.values(state.installed).filter((e) => e.ref.split('/')[1] === ref.split('@')[0]);
  if (m.length > 1) throw new CliError(Exit.USAGE, 'ambiguous', `"${ref}" matches several installed artifacts: ${m.map((e) => e.ref).join(', ')}`);
  return m[0];
}

export async function installRef(env: Env, refInput: string, flags: InstallFlags, action: 'artifact_installed' | 'artifact_updated' = 'artifact_installed') {
  const [ref, inlineRange] = refInput.split('@');
  const range = flags.range ?? inlineRange;
  env.out.step(`Resolving ${ref}${range ? `@${range}` : ''}...`);
  const providers = await selectProviders(env, flags);
  env.out.ok(`Target: ${providers.map((p) => adapters[p].name).join(', ')}`);
  const res = await env.client.resolve(ref, range);
  return installNodes(env, res.order, providers, { ...flags, range: range ?? 'latest' }, action);
}

export async function installFromLock(env: Env, flags: InstallFlags) {
  const lock = await readLock(env.cwd);
  if (!lock) throw new CliError(Exit.NOT_FOUND, 'no-lockfile', 'no .aidev-lock.json in this directory', 'install something first, or pass an artifact name');
  const results = [];
  const nodes: ResolvedNode[] = [];
  for (const [ref, e] of Object.entries(lock.artifacts)) {
    const res = await env.client.resolve(ref, e.version);
    const node = res.order[res.order.length - 1];   // dependencies are separate lock entries, pinned individually
    if (node.sha256 !== e.sha256) throw new CliError(Exit.VALIDATION, 'lock-mismatch', `${ref}@${e.version} no longer matches the lockfile hash`, 'the registry content differs from what was locked — do not proceed');
    const providers = e.providers.length ? e.providers : await selectProviders(env, flags);
    results.push(await installNodes(env, [node], providers, { ...flags, range: e.version, explicit: e.explicit }));
    nodes.push(node);
  }
  // Installing entries one by one loses the dependency edges; rebuild them from the pinned manifests.
  const root = scopeRoot(flags.scope, env.cwd, env.home);
  const state = await loadState(root);
  for (const n of nodes) if (state.installed[refOf(n)]) state.installed[refOf(n)].dependsOn = depRefs(n, nodes);   // n.manifest was re-validated by installNodes
  await saveState(root, state);
  return results;
}

export async function uninstallRef(env: Env, refInput: string, flags: { scope: Scope; yes?: boolean; force?: boolean; dryRun?: boolean; providers?: string[] }) {
  const root = scopeRoot(flags.scope, env.cwd, env.home);
  const state = await loadState(root);
  const entry = findInstalled(state, refInput);
  if (!entry) throw new CliError(Exit.NOT_FOUND, 'not-installed', `${refInput} is not installed (${flags.scope} scope)`, 'see `aidev list`');
  const dependents = Object.values(state.installed).filter((e) => e.ref !== entry.ref && e.dependsOn.includes(entry.ref));
  if (dependents.length && !flags.force) throw new CliError(Exit.CONFLICT, 'has-dependents', `${entry.ref} is required by ${dependents.map((d) => d.ref).join(', ')}`, 'uninstall those first, or use --force');

  const toRemove = [entry];
  // prune auto-installed dependencies nobody else needs
  const removed = new Set([entry.ref]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of Object.values(state.installed)) {
      if (e.explicit || removed.has(e.ref)) continue;
      const stillNeeded = Object.values(state.installed).some((o) => !removed.has(o.ref) && o.dependsOn.includes(e.ref));
      if (!stillNeeded && entry.dependsOn.concat([...removed].flatMap((r) => state.installed[r]?.dependsOn ?? [])).includes(e.ref)) { removed.add(e.ref); toRemove.push(e); changed = true; }
    }
  }
  const only = flags.providers?.map(normalizeProvider);
  const outcomes = [];
  for (const e of toRemove) {
    for (const [pid, rec] of Object.entries(e.providers) as [ProviderId, NonNullable<InstalledEntry['providers'][ProviderId]>][]) {
      if (only && !only.includes(pid)) continue;
      const [owner, slug] = e.ref.split('/');
      const r = await adapters[pid].uninstallArtifact({ owner, slug }, { cwd: env.cwd, home: env.home, scope: flags.scope, force: flags.force, dryRun: flags.dryRun, ops: rec.ops, backupRoot: backupRoot(root) });
      env.out.line(`${env.out.c('bold', e.ref)}  ${adapters[pid].name}:`);
      for (const c of r.changes) env.out.line(`    ${c.action === 'delete' ? env.out.c('red', '-') : c.action === 'update' ? env.out.c('yellow', '~') : c.action === 'conflict' ? env.out.c('yellow', '!') : '='} ${displayPath(c.path, env)}${c.reason ? env.out.c('dim', ` (${c.reason})`) : ''}`);
      outcomes.push({ ref: e.ref, provider: pid, files: r.changes.map((c) => ({ path: displayPath(c.path, env), action: c.action, reason: c.reason })), backupId: r.backupId });
    }
    if (!flags.dryRun) {
      if (only) for (const p of only) delete e.providers[p];
      if (!only || !Object.keys(e.providers).length) delete state.installed[e.ref];
      env.client.recordInstall(e.ref, e.version, 'all', 'artifact_removed').catch(() => {});
    }
  }
  if (!flags.dryRun) {
    await saveState(root, state);
    if (flags.scope === 'project') await writeLock(root, env.cfg.registry, state);
    env.out.ok(`Removed ${toRemove.map((e) => e.ref).join(', ')}`);
  } else env.out.info('Dry run — nothing was written.');
  return { removed: toRemove.map((e) => e.ref), outcomes };
}

export interface UpdateRow { ref: string; installed: string; latest?: string; updateAvailable?: boolean; major?: boolean; status: 'updated' | 'up-to-date' | 'skipped-major' | 'available' | 'error'; error?: string }

export async function updateRefs(env: Env, refs: string[] | 'all', flags: InstallFlags & { major?: boolean; check?: boolean }) {
  const root = scopeRoot(flags.scope, env.cwd, env.home);
  const state = await loadState(root);
  const entries = refs === 'all' ? Object.values(state.installed) : refs.map((r) => findInstalled(state, r) ?? (() => { throw new CliError(Exit.NOT_FOUND, 'not-installed', `${r} is not installed`); })());
  if (!entries.length) { env.out.info('Nothing installed.'); return { rows: [] as UpdateRow[] }; }
  const { updates } = await env.client.updates(entries.map((e) => ({ ref: e.ref, version: e.version })));
  const rows: UpdateRow[] = [];
  for (const u of updates) {
    const e = state.installed[u.ref];
    if (u.error) { rows.push({ ref: u.ref, installed: u.installed, status: 'error', error: u.error }); continue; }
    if (!u.updateAvailable) { rows.push({ ref: u.ref, installed: u.installed, latest: u.latest, status: 'up-to-date' }); continue; }
    if (u.governance?.status === 'blocked') { rows.push({ ref: u.ref, installed: u.installed, latest: u.latest, status: 'error', error: `blocked by ${u.governance.org}` }); continue; }
    // never silently apply breaking (major) updates
    const named = refs !== 'all';
    if (u.major && !(flags.major || (named && flags.yes))) {
      rows.push({ ref: u.ref, installed: u.installed, latest: u.latest, major: true, updateAvailable: true, status: 'skipped-major' });
      env.out.warn(`${u.ref}: ${u.installed} → ${u.latest} is a major update; run \`aidev update ${u.ref} --yes\` to apply`);
      continue;
    }
    if (flags.check) { rows.push({ ref: u.ref, installed: u.installed, latest: u.latest, major: u.major, updateAvailable: true, status: 'available' }); continue; }
    env.out.line(`${env.out.c('bold', u.ref)}  ${u.installed} → ${u.latest}`);
    await installRef(env, u.ref, { ...flags, providers: Object.keys(e.providers), range: 'latest', explicit: e.explicit }, 'artifact_updated');
    rows.push({ ref: u.ref, installed: u.installed, latest: u.latest, major: u.major, updateAvailable: true, status: 'updated' });
  }
  return { rows };
}

/** Undo an install transaction: restore files, then restore (or forget) the state entries it touched. */
export async function rollbackTx(env: Env, scope: Scope, id: string) {
  const root = scopeRoot(scope, env.cwd, env.home);
  const restored = await rollback(backupRoot(root), id).catch(() => { throw new CliError(Exit.NOT_FOUND, 'not-found', `no backup "${id}"`); });
  const state = await loadState(root);
  const reverted: string[] = [];
  for (const [ref, e] of Object.entries(state.installed)) {
    if (e.tx !== id) continue;
    if (e.previous) state.installed[ref] = e.previous as InstalledEntry; else delete state.installed[ref];
    reverted.push(ref);
  }
  await saveState(root, state);
  if (scope === 'project') await writeLock(root, env.cfg.registry, state);
  return { restored, reverted };
}

export const cmpVersions = semver.compare;
export type { Change, PlanOp };

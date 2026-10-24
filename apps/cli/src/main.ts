import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { ARTIFACT_TYPES, riskProfile, validateArtifact } from '@aidev/artifact-schema';
import {
  AutoPrompter, CliError, Exit, Output, RegistryClient, TtyPrompter, configDir, detectProject, displayPath, doctor, installFromLock, installRef,
  loadConfig, loadState, readArtifactDir, recommend, saveConfig, scaffold, scopeRoot, shouldColor, uninstallRef, updateRefs, backupRoot,
  normalizeProvider, detectProviders, rollbackTx, type Env, type InstallFlags, type SearchItem,
} from '@aidev/cli-engine';
import { listBackups } from '@aidev/provider-adapters';

/** Read at runtime so `--version` always matches the published package (dist/ and src/ both sit one level below it). */
const VERSION: string = createRequire(import.meta.url)('../package.json').version;

class YesTty extends TtyPrompter { async confirm() { return true; } }

interface G { json?: boolean; color?: boolean; yes?: boolean; nonInteractive?: boolean; registry?: string; cwd?: string }

async function makeEnv(g: G): Promise<Env> {
  const cfg = await loadConfig();
  if (g.registry) cfg.registry = g.registry.replace(/\/$/, '');
  const out = new Output({ json: !!g.json, color: shouldColor({ color: g.color }) });
  const tty = !!process.stdin.isTTY && !!process.stdout.isTTY && !g.json && !g.nonInteractive;
  const prompt = !tty ? new AutoPrompter(!!g.yes) : g.yes ? new YesTty() : new TtyPrompter();
  return { cwd: path.resolve(g.cwd ?? process.cwd()), home: process.env.AIDEV_HOME ?? os.homedir(), out, prompt, client: new RegistryClient(cfg), cfg };
}

/** Wrap every command: shared env, uniform error → exit-code mapping. */
function run<A extends unknown[]>(fn: (env: Env, ...a: A) => Promise<void>, prog: Command) {
  return async (...args: A) => {
    const g = prog.opts<G>();
    let env: Env | undefined;
    try {
      env = await makeEnv(g);
      await fn(env, ...args);
    } catch (e) {
      const out = env?.out ?? new Output({ json: !!g.json, color: false });
      process.exitCode = out.fail(e);
    }
  };
}

const list = (v: string, prev: string[] = []) => [...prev, ...v.split(',').map((s) => s.trim()).filter(Boolean)];
const scopeOf = (o: { global?: boolean }) => (o.global ? ('user' as const) : ('project' as const));
const stars = (i: { rating?: string | null }) => (i.rating ? `★ ${i.rating}` : '');
const num = (n: number) => n.toLocaleString('en-US');

function badges(o: Output, i: { official?: boolean; verified?: boolean; governance?: { status: string; org: string } | null }) {
  const b: string[] = [];
  if (i.official) b.push(o.c('cyan', 'official'));
  else if (i.verified) b.push(o.c('cyan', 'verified'));
  if (i.governance?.status === 'approved') b.push(o.c('green', `✓ approved by ${i.governance.org}`));
  if (i.governance?.status === 'external') b.push(o.c('yellow', '⚠ external'));
  if (i.governance?.status === 'blocked') b.push(o.c('red', `✕ blocked by ${i.governance.org}`));
  return b.join(' ');
}

function printItems(o: Output, items: SearchItem[]) {
  if (!items.length) return o.line('No results.');
  const w = Math.max(...items.map((i) => `${i.owner}/${i.slug}`.length));
  for (const i of items) {
    o.line(`${o.c('bold', `${i.owner}/${i.slug}`.padEnd(w))}  ${o.c('dim', `v${i.latestVersion}`.padEnd(8))} ${i.type.padEnd(11)} ${o.c('dim', `${num(i.installs)} installs ${stars(i)}${(i as any).githubStars != null ? ` ★${num((i as any).githubStars)} GitHub` : ''}`)} ${badges(o, i)}`);
    o.line(`${' '.repeat(w)}  ${i.description}`);
  }
}

const prog = new Command('aidevkit')
  .description('Package manager for reusable AI development building blocks')
  .version(VERSION)
  .option('--json', 'machine-readable JSON output (one document on stdout)')
  .option('--no-color', 'disable colors')
  .option('-y, --yes', 'assume yes for confirmations (non-interactive)')
  .option('--non-interactive', 'never prompt; fail instead')
  .option('--registry <url>', 'registry URL (default: config / AIDEV_REGISTRY)')
  .option('--cwd <dir>', 'run as if started in <dir>')
  .showHelpAfterError()
  .addHelpText('after', `
Exit codes: 0 ok · 1 error · 2 usage · 3 auth · 4 not found · 5 conflict · 6 blocked by policy
            7 consent required · 8 validation · 9 network · 10 unsupported
Env: AIDEV_TOKEN (automation), AIDEV_REGISTRY, AIDEV_PROVIDER, NO_COLOR`);

/* ------------------------------ auth ------------------------------ */
prog.command('login').description('authenticate with the registry')
  .option('--token <token>', 'use an API token (aidev_pat_…) — for automation')
  .option('--email <email>').option('--password <password>')
  .action(run(async (env, o: any) => {
    let token = o.token as string | undefined, email = o.email ?? process.env.AIDEV_EMAIL;
    if (!token) {
      email ||= await env.prompt.ask('Email');
      const pw = o.password ?? process.env.AIDEV_PASSWORD ?? (env.prompt.interactive ? await env.prompt.ask('Password', { secret: true }) : '');
      if (!email || !pw) throw new CliError(Exit.USAGE, 'usage', 'email and password required', 'pass --token, or --email/--password, or set AIDEV_TOKEN');
      token = (await env.client.login(email, pw)).token;
    }
    const authed = new RegistryClient({ ...env.cfg, token });
    const me = await authed.me();
    await saveConfig({ token, registry: env.cfg.registry, email: me.user.email });
    env.out.ok(`Logged in to ${env.cfg.registry} as ${me.user.handle}`);
    env.out.result({ user: me.user, registry: env.cfg.registry });
  }, prog));

prog.command('logout').description('forget the stored token').action(run(async (env) => {
  await env.client.logout().catch(() => {});
  await saveConfig({ token: undefined });
  env.out.ok('Logged out');
  env.out.result({});
}, prog));

prog.command('whoami').description('show the authenticated user').action(run(async (env) => {
  const me = await env.client.me();
  env.out.line(`${me.user.handle} <${me.user.email}> @ ${env.cfg.registry}`);
  env.out.result({ user: me.user, registry: env.cfg.registry });
}, prog));

/* ------------------------------ discovery ------------------------------ */
prog.command('search <query...>').description('search the registry')
  .option('-t, --type <type>', ARTIFACT_TYPES.join('|')).option('--provider <p>', 'copilot|claude|codex')
  .option('--language <l>').option('--framework <f>').option('--verified').option('--official')
  .option('--sort <s>', 'relevance|popular|recent|stars').option('-n, --limit <n>', 'max results', '10')
  .action(run(async (env, q: string[], o: any) => {
    const r = await env.client.search({ q: q.join(' '), type: o.type, provider: o.provider && normalizeProvider(o.provider), language: o.language, framework: o.framework, verified: o.verified, official: o.official, sort: o.sort, limit: o.limit });
    env.out.line(env.out.c('dim', `${r.total} result${r.total === 1 ? '' : 's'} for "${q.join(' ')}"\n`));
    printItems(env.out, r.items);
    env.out.result({ query: q.join(' '), total: r.total, items: r.items.map((i) => ({ ref: `${i.owner}/${i.slug}`, ...i })) });
  }, prog));

prog.command('browse').description('popular, trending and recently published artifacts')
  .option('-t, --type <type>')
  .action(run(async (env, o: any) => {
    const [popular, recent, ...byType] = await Promise.all([
      env.client.search({ sort: 'popular', limit: 5, type: o.type }), env.client.search({ sort: 'recent', limit: 5, type: o.type }),
      ...(o.type ? [] : (['agent', 'skill', 'mcp'] as const).map((t) => env.client.search({ sort: 'popular', limit: 3, type: t }))),
    ]);
    const sections: Record<string, SearchItem[]> = { popular: popular.items, recent: recent.items };
    if (!o.type) { sections.topAgents = byType[0].items; sections.topSkills = byType[1].items; sections.topMcps = byType[2].items; }
    const titles: Record<string, string> = { popular: 'Popular', recent: 'Recently published', topAgents: 'Top agents', topSkills: 'Top skills', topMcps: 'Top MCP servers' };
    for (const [k, items] of Object.entries(sections)) { env.out.line(env.out.c('bold', titles[k])); printItems(env.out, items); env.out.line(); }
    env.out.result({ sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.map((i) => ({ ref: `${i.owner}/${i.slug}`, ...i }))])) });
  }, prog));

prog.command('info <artifact>').description('show details, permissions and compatibility').option('--version <v>', 'specific version')
  .action(run(async (env, ref: string, o: any) => {
    const [r, inline] = ref.split('@');
    const a = await env.client.lookup(r, o.version ?? inline);
    const v = a.version, m = v.manifest, out = env.out;
    out.line(`${out.c('bold', a.title)}  ${out.c('dim', `${a.owner}/${a.slug}@${v.version}`)}  ${badges(out, a)}`);
    out.line(a.description);
    out.line();
    out.line(`${a.rating ? `★ ${a.rating} (${a.ratingCount})  ` : ''}${num(a.installs)} installs · ${num(a.stars)} stars · ${a.license ?? 'no license'} · ${a.type}`);
    out.line(`Author: ${a.author}${a.org ? `  ·  ${a.org.name}${a.team ? ` / ${a.team.name}` : ''}` : ''}  ·  visibility: ${a.visibility}`);
    const c = m.compatibility;
    out.line(`Compatible with: ${[c.copilot && '✓ Copilot', c.claudeCode && '✓ Claude Code', c.codex && '✓ Codex'].filter(Boolean).join('  ')}`);
    const deps = Object.entries(m.dependencies as Record<string, string[]>).flatMap(([k, xs]) => xs.map((x) => `${x} (${k.replace(/s$/, '')})`));
    if (deps.length) out.line(`Requires: ${deps.join(', ')}`);
    if (m.tags?.length) out.line(`Capabilities: ${m.tags.join(', ')}`);
    if (v.risk.length) { out.line(); out.line(out.c('bold', 'Permissions:')); for (const r2 of v.risk) out.line(`  ${r2.level === 'high' ? out.c('yellow', '!') : '-'} ${r2.label}: ${r2.detail}`); }
    const fs2 = v.findings.filter((f: any) => f.severity !== 'info');
    if (fs2.length) { out.line(); out.line(out.c('bold', 'Scan findings:')); for (const f of fs2) out.line(`  [${f.severity}] ${f.file}:${f.line} ${f.message}`); }
    out.line();
    out.line(`Files: ${v.files.map((f: any) => f.path).join(', ')}`);
    out.line(`Versions: ${a.versions.map((x: any) => x.version).join(', ')}`);
    out.line(`sha256: ${v.sha256.slice(0, 16)}…`);
    out.line();
    out.line(`  $ ${a.installCommand}`);
    out.result({ artifact: { ref: `${a.owner}/${a.slug}`, ...a } });
  }, prog));

/* ------------------------------ install / manage ------------------------------ */
const installOpts = (c: Command) => c
  .option('-p, --provider <id>', 'copilot|claude|codex (repeatable or comma-separated)', list)
  .option('--all', 'install for every detected provider')
  .option('-g, --global', 'install at user level instead of the project')
  .option('--force', 'overwrite conflicting files (a backup is created first)')
  .option('--dry-run', 'show what would change; write nothing')
  .option('--diff', 'with --dry-run: include unified diffs')
  .option('--allow-risky', 'permit artifacts with high-severity scan findings');

const flagsOf = (o: any, extra: Partial<InstallFlags> = {}, yes?: boolean): InstallFlags => ({
  providers: o.provider, all: o.all, scope: scopeOf(o), force: o.force, dryRun: o.dryRun, diff: o.diff, allowRisky: o.allowRisky, yes, ...extra,
});

installOpts(prog.command('install [artifact]').description('install an artifact (or restore from .aidev-lock.json)').option('--version <range>', 'latest | 1.2.0 | ^1.2.0 | ~1.2.0'))
  .action(run(async (env, ref: string | undefined, o: any) => {
    const flags = flagsOf(o, { range: o.version }, prog.opts().yes);
    if (!ref) {
      env.out.step('Restoring from .aidev-lock.json...');
      const rs = await installFromLock(env, flags);
      env.out.result({ restored: rs.map((r) => r.root) });
      return;
    }
    const r = await installRef(env, ref, flags);
    env.out.result({ action: 'install', dryRun: r.dryRun, root: r.root, installed: r.outcomes, backups: r.backups });
  }, prog));

prog.command('uninstall <artifact>').alias('remove').description('remove an installed artifact')
  .option('-p, --provider <id>', 'only remove from this provider', list).option('-g, --global').option('--force').option('--dry-run')
  .action(run(async (env, ref: string, o: any) => {
    const r = await uninstallRef(env, ref, { scope: scopeOf(o), force: o.force, dryRun: o.dryRun, providers: o.provider, yes: prog.opts().yes });
    env.out.result({ action: 'uninstall', ...r });
  }, prog));

installOpts(prog.command('update [artifact]').description('update installed artifacts (major versions need explicit consent)'))
  .option('--check', 'only report available updates').option('--major', 'also apply major (breaking) updates')
  .action(run(async (env, ref: string | undefined, o: any) => {
    const all = !ref;
    const r = await updateRefs(env, ref ? [ref] : 'all', { ...flagsOf(o, {}, prog.opts().yes), check: o.check, major: o.major });
    if (all || o.check) for (const row of r.rows) env.out.line(`${row.status === 'up-to-date' ? '=' : row.status === 'error' ? '!' : '↑'} ${row.ref}  ${row.installed}${row.latest && row.latest !== row.installed ? ` → ${row.latest}` : ''}  ${env.out.c('dim', row.status + (row.error ? `: ${row.error}` : ''))}`);
    env.out.result({ action: 'update', updates: r.rows });
  }, prog));

prog.command('list').alias('ls').description('list installed artifacts').option('-g, --global').option('--outdated')
  .action(run(async (env, o: any) => {
    const state = await loadState(scopeRoot(scopeOf(o), env.cwd, env.home));
    const entries = Object.values(state.installed);
    let outdated: Record<string, string> = {};
    if (o.outdated && entries.length) outdated = Object.fromEntries((await env.client.updates(entries.map((e) => ({ ref: e.ref, version: e.version })))).updates.filter((u) => u.updateAvailable).map((u) => [u.ref, u.latest]));
    if (!entries.length) env.out.line('Nothing installed. Try `aidevkit search <query>`.');
    for (const e of entries) env.out.line(`${env.out.c('bold', e.ref)}@${e.version}  ${env.out.c('dim', `${e.type} · ${Object.keys(e.providers).join(', ')}${e.explicit ? '' : ' · dependency'}`)}${outdated[e.ref] ? env.out.c('yellow', `  → ${outdated[e.ref]} available`) : ''}`);
    env.out.result({ scope: scopeOf(o), installed: entries.map((e) => ({ ref: e.ref, type: e.type, version: e.version, sha256: e.sha256, explicit: e.explicit, providers: Object.keys(e.providers), latest: outdated[e.ref] ?? null })) });
  }, prog));

prog.command('rollback [backupId]').description('restore files from a backup created by install/update/uninstall').option('-g, --global')
  .action(run(async (env, id: string | undefined, o: any) => {
    const root = backupRoot(scopeRoot(scopeOf(o), env.cwd, env.home));
    const backups = await listBackups(root);
    if (!id) {
      for (const b of backups) env.out.line(`${b.id}  ${b.files} file(s)  ${env.out.c('dim', b.createdAt)}`);
      if (!backups.length) env.out.line('No backups.');
      env.out.result({ backups });
      return;
    }
    const { restored, reverted } = await rollbackTx(env, scopeOf(o), id);
    env.out.ok(`Restored ${restored.length} file(s)${reverted.length ? `; reverted ${reverted.join(', ')}` : ''}`);
    env.out.result({ restored, reverted });
  }, prog));

prog.command('doctor').description('check registry, auth, providers and installed files').option('-g, --global')
  .action(run(async (env, o: any) => {
    const checks = await doctor(env, scopeOf(o));
    for (const c of checks) env.out.line(`${c.status === 'ok' ? env.out.c('green', '✓') : c.status === 'warn' ? env.out.c('yellow', '⚠') : env.out.c('red', '✗')} ${c.name.padEnd(28)} ${env.out.c('dim', c.detail)}`);
    env.out.result({ checks, healthy: !checks.some((c) => c.status === 'fail') });
    if (checks.some((c) => c.status === 'fail')) process.exitCode = Exit.GENERIC;
  }, prog));

/* ------------------------------ authoring ------------------------------ */
const init = prog.command('init').description('detect your project and recommend building blocks')
  .action(run(async (env) => {
    const info = await detectProject(env.cwd);
    const found = (await detectProviders(env)).filter((d) => d.env.detected);
    env.out.line('Detected:');
    for (const [ok, label] of [[info.git, 'Git repository'], [info.github, 'GitHub']] as const) if (ok) env.out.line(`  ${env.out.c('green', '✓')} ${label}`);
    for (const f of found) env.out.line(`  ${env.out.c('green', '✓')} ${f.adapter.name}`);
    if (info.languages.length || info.frameworks.length) env.out.line(`  ${env.out.c('green', '✓')} ${[...info.languages, ...info.frameworks].join(', ')}`);
    const recs: { ref: string; why: string; exists: boolean }[] = [];
    for (const r of recommend(info)) recs.push({ ...r, exists: await env.client.lookup(r.ref).then(() => true, () => false) });
    const avail = recs.filter((r) => r.exists);
    env.out.line();
    env.out.line('Recommended building blocks:');
    for (const r of avail) env.out.line(`  [${r.ref}]  ${env.out.c('dim', r.why)}`);
    env.out.result({ detected: { ...info, providers: found.map((f) => f.adapter.id) }, recommended: avail.map(({ ref, why }) => ({ ref, why })) });
    if (!avail.length || env.out.json) return;
    if (!env.prompt.interactive) { env.out.info('\nRun `aidevkit install <name>` for each, or re-run interactively.'); return; }
    if (await env.prompt.confirm('\nInstall recommended setup?', false)) {
      for (const r of avail) await installRef(env, r.ref, { scope: 'project', yes: true, providers: found.length === 1 ? [found[0].adapter.id] : undefined, all: found.length > 1 });
    }
  }, prog));

init.command('artifact <type> <name>').description(`scaffold a new artifact in ./<name> (${ARTIFACT_TYPES.join('|')})`).option('--dir <dir>', 'target directory')
  .action(run(async (env, type: string, name: string, o: any) => {
    const me = await env.client.me().then((r) => r.user.handle).catch(() => os.userInfo().username);
    const dir = path.resolve(env.cwd, o.dir ?? name);
    try { await fs.access(path.join(dir, 'manifest.json')); throw new CliError(Exit.CONFLICT, 'exists', `${displayPath(dir, env)}/manifest.json already exists`); } catch (e) { if (e instanceof CliError) throw e; }
    let files; try { files = scaffold(type, name, me); } catch (e) { throw new CliError(Exit.USAGE, 'usage', (e as Error).message); }
    for (const f of files) { await fs.mkdir(path.dirname(path.join(dir, f.path)), { recursive: true }); await fs.writeFile(path.join(dir, f.path), f.content); }
    env.out.ok(`Created ${displayPath(dir, env)}/ (${files.map((f) => f.path).join(', ')})`);
    env.out.info('Edit it, then run `aidevkit publish` from that directory.');
    env.out.result({ dir, files: files.map((f) => f.path) });
  }, prog));

prog.command('publish [dir]').description('validate and publish an artifact directory')
  .option('--org <slug>', 'publish under an organization').option('--team <slug>', 'restrict to a team (visibility: team)')
  .option('--visibility <v>', 'public|unlisted|private|organization|team').option('--dry-run', 'validate only')
  .action(run(async (env, dir: string | undefined, o: any) => {
    const root = path.resolve(env.cwd, dir ?? '.');
    const files = await readArtifactDir(root).catch(() => { throw new CliError(Exit.NOT_FOUND, 'not-found', `cannot read ${root}`); });
    const rep = validateArtifact(files);
    for (const i of rep.issues) {
      if (i.level === 'error') env.out.line(`${env.out.c('red', '✗')} ${i.path}: ${i.message}`);
      else env.out.warn(`${i.path}: ${i.message}`);
    }
    for (const f of rep.findings.filter((f) => f.severity !== 'info')) env.out.warn(`${f.file}:${f.line} [${f.severity}] ${f.message}`);
    if (!rep.ok || !rep.manifest) throw new CliError(Exit.VALIDATION, 'validation', 'artifact failed validation', 'fix the errors above and re-run', { issues: rep.issues });
    const m = rep.manifest;
    env.out.ok(`Valid ${m.type} ${m.name}@${m.version} (${files.length} files)`);
    for (const r of riskProfile(m)) env.out.line(`   ${r.level === 'high' ? '!' : '-'} ${r.label}: ${r.detail}`);
    if (o.dryRun) { env.out.result({ dryRun: true, manifest: m, issues: rep.issues, findings: rep.findings }); return; }
    if (!prog.opts().yes) {
      if (!env.prompt.interactive) throw new CliError(Exit.CONSENT, 'consent-required', 'publishing is public and permanent for this version', 're-run with --yes');
      if (!(await env.prompt.confirm(`Publish ${m.name}@${m.version}? Versions are immutable.`, false))) throw new CliError(Exit.CONSENT, 'declined', 'cancelled');
    }
    const r = await env.client.publish({ files, owner: o.org, team: o.team, visibility: o.visibility });
    env.out.ok(`Published ${r.owner}/${r.slug}@${r.version}  (${r.visibility})`);
    env.out.line(`  $ aidevkit install ${r.owner}/${r.slug}`);
    env.out.result({ published: r });
  }, prog));

/* ------------------------------ team / provider / config ------------------------------ */
const team = prog.command('team').description('company hub: teams and approved resources');
team.command('list').description('your organizations and teams').action(run(async (env) => {
  const { orgs } = await env.client.orgs();
  const full = await Promise.all(orgs.map((o) => env.client.request('GET', `/orgs/${o.slug}`)));
  for (const o of full) {
    env.out.line(`${env.out.c('bold', o.name)} (${o.slug}) — you are ${o.role}`);
    for (const t of o.teams) env.out.line(`  ${t.slug.padEnd(14)} ${t.members} member(s), ${t.artifacts} artifact(s)`);
  }
  if (!orgs.length) env.out.line('You are not in any organization.');
  env.out.result({ organizations: full });
}, prog));
team.command('resources').description('artifacts your company shares with you, with approval status').action(run(async (env) => {
  const { resources } = await env.client.resources();
  let org = '';
  for (const r of resources) {
    if (r.org !== org) { org = r.org; env.out.line(env.out.c('bold', `\n${org}`)); }
    const gov = r.governance === 'blocked' ? env.out.c('red', '✕ blocked') : r.governance === 'approved' ? env.out.c('green', '✓ approved') : env.out.c('yellow', '⚠ external');
    env.out.line(`  ${`${r.owner}/${r.slug}`.padEnd(38)} ${r.type.padEnd(7)} v${r.latestVersion}  ${gov}${r.team ? env.out.c('dim', `  [${r.team}]`) : ''}`);
  }
  if (!resources.length) env.out.line('No company resources.');
  env.out.result({ resources });
}, prog));

const provider = prog.command('provider').description('supported AI coding tools');
provider.command('list').description('supported providers and where they install things').action(run(async (env) => {
  const rows = await detectProviders(env);
  for (const d of rows) {
    env.out.line(`${env.out.c('bold', d.adapter.id.padEnd(8))} ${d.adapter.name}`);
    for (const [scope, paths] of Object.entries(d.env.paths)) env.out.line(env.out.c('dim', `  ${scope}: ${Object.entries(paths).map(([k, v]) => `${k}=${v}`).join('  ')}`));
  }
  env.out.result({ providers: rows.map((d) => ({ id: d.adapter.id, name: d.adapter.name, paths: d.env.paths })) });
}, prog));
provider.command('detect').description('detect installed AI coding tools').action(run(async (env) => {
  const rows = await detectProviders(env);
  for (const d of rows) env.out.line(`${d.env.detected ? env.out.c('green', '✓') : env.out.c('dim', '·')} ${d.adapter.name}${d.env.detected ? env.out.c('dim', `  (${d.env.evidence.join(', ')})`) : ''}`);
  env.out.result({ providers: rows.map((d) => ({ id: d.adapter.id, name: d.adapter.name, detected: d.env.detected, binary: d.env.binary ?? null, evidence: d.env.evidence })) });
}, prog));

const config = prog.command('config').description('view or change CLI configuration');
config.action(run(async (env) => {
  const shown = { registry: env.cfg.registry, defaultProvider: env.cfg.defaultProvider ?? null, token: env.cfg.token ? `${env.cfg.token.slice(0, 14)}…` : null, configDir: configDir() };
  for (const [k, v] of Object.entries(shown)) env.out.line(`${k.padEnd(16)} ${v ?? env.out.c('dim', '(unset)')}`);
  env.out.result({ config: shown });
}, prog));
config.command('set <key> <value>').description('registry | defaultProvider').action(run(async (env, key: string, value: string) => {
  if (!['registry', 'defaultProvider'].includes(key)) throw new CliError(Exit.USAGE, 'usage', `unknown key "${key}"`, 'keys: registry, defaultProvider');
  if (key === 'defaultProvider') value = normalizeProvider(value);
  await saveConfig({ [key]: value });
  env.out.ok(`${key} = ${value}`);
  env.out.result({ [key]: value });
}, prog));

await prog.parseAsync(process.argv);

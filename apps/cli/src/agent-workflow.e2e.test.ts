/**
 * End-to-end: the real `aidev` binary against a live (in-memory, seeded) registry.
 * The first block replays what a coding agent with shell access would do:
 *   search --json → info --json → install --yes --json → use the installed files.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { connect, PgSearch } from '@aidev/database';
import { createApp } from '../../api/src/app.js';
import { MemoryStorage } from '../../api/src/storage.js';
import { seedIfEmpty } from '../../api/src/fixtures/seed.js';

const run = promisify(execFile);
const BIN = path.resolve(__dirname, '../dist/aidev.js');
let app: Awaited<ReturnType<typeof createApp>>, registry: string, proj: string, home: string, cfg: string;
let demoToken = '', aliceToken = '';

async function aidev(args: string[], env: Record<string, string> = {}, cwd = proj) {
  try {
    const r = await run(process.execPath, [BIN, ...args], {
      cwd, env: { PATH: path.dirname(process.execPath), AIDEV_REGISTRY: registry, AIDEV_HOME: home, AIDEV_CONFIG_DIR: cfg, ...env },
    });
    return { code: 0, stdout: r.stdout, stderr: r.stderr, json: tryJson(r.stdout) };
  } catch (e: any) {
    return { code: e.code as number, stdout: e.stdout as string, stderr: e.stderr as string, json: tryJson(e.stdout) };
  }
}
const tryJson = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
const exists = (p: string) => fs.access(path.join(proj, p)).then(() => true, () => false);
const read = (p: string) => fs.readFile(path.join(proj, p), 'utf8');

beforeAll(async () => {
  execFileSync('npx', ['tsup'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
  const db = await connect();
  const ctx = { db, search: new PgSearch(db), storage: new MemoryStorage() };
  await seedIfEmpty(ctx, () => {});
  app = await createApp(ctx);
  await app.listen(0);
  registry = (await app.getUrl()).replace('[::1]', 'localhost');
  proj = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-e2e-proj-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-e2e-home-'));
  cfg = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-e2e-cfg-'));
  await fs.mkdir(path.join(proj, '.github'));            // → only Copilot is detectable (PATH is stripped)
  await fs.writeFile(path.join(proj, '.github/copilot-instructions.md'), '# project rules\n');
  const login = async (email: string) => (await aidev(['login', '--email', email, '--password', 'password123', '--json'])).json;
  await login('demo@example.com');
  demoToken = JSON.parse(await fs.readFile(path.join(cfg, 'config.json'), 'utf8')).token;
  await login('alice@acme.dev');
  aliceToken = JSON.parse(await fs.readFile(path.join(cfg, 'config.json'), 'utf8')).token;
  await fs.rm(path.join(cfg, 'config.json'));            // run the rest as anonymous unless AIDEV_TOKEN is given
}, 120_000);
afterAll(async () => { await app?.close(); });

describe('agent workflow (search → info → install → use)', () => {
  it('search --json returns candidates with machine-readable fields', async () => {
    const r = await aidev(['search', 'react 19 migration', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.items.map((i: any) => i.ref)).toContain('aidev/react-19-migration');
    expect(r.stdout.trim().startsWith('{')).toBe(true);      // exactly one JSON document, no prose
    expect(r.stdout).not.toMatch(/\x1b\[/);                    // no ANSI in JSON mode
  });

  it('info --json exposes permissions, compatibility and the install command', async () => {
    const r = await aidev(['info', 'react-19-migration', '--json']);
    expect(r.code).toBe(0);
    const a = r.json.artifact;
    expect(a.installCommand).toBe('aidev install aidev/react-19-migration');
    expect(a.version.manifest.compatibility.copilot).toBe(true);
    expect(a.version.risk.some((x: any) => x.label === 'Local command execution')).toBe(true);
  });

  it('non-interactive install without --yes is refused with exit 7 and a hint', async () => {
    const r = await aidev(['install', 'react-19-migration', '--json']);
    expect(r.code).toBe(7);
    expect(r.json).toMatchObject({ ok: false, error: { kind: 'consent-required', exitCode: 7 } });
    expect(await exists('.github/skills')).toBe(false);
  });

  it('install --yes --json auto-detects Copilot and writes the documented files', async () => {
    const r = await aidev(['install', 'react-19-migration', '--yes', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.installed[0].providers[0]).toMatchObject({ id: 'copilot' });
    expect(await read('.github/skills/react-19-migration/SKILL.md')).toMatch(/^---\nname: react-19-migration\n/);
    expect(await exists('.github/skills/react-19-migration/references/removed-apis.md')).toBe(true);
    expect(JSON.parse(await read('.aidev-lock.json')).artifacts['aidev/react-19-migration'].version).toBe('1.3.0');
  });

  it('install of an agent pulls dependencies and wires MCP config (Copilot)', async () => {
    const r = await aidev(['install', 'react-migration-agent', '--yes', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.installed.map((i: any) => i.ref)).toEqual(['aidev/react-19-migration', 'aidev/rtl-migration', 'aidev/github', 'aidev/react-migration-agent']);
    expect(r.json.installed[0].providers[0].files.every((f: any) => f.action === 'unchanged')).toBe(true); // already installed → untouched
    expect(await read('.github/agents/react-migration-agent.agent.md')).toMatch(/tools:\n {2}- read\n {2}- edit\n {2}- search\n {2}- execute/);
    const mcp = JSON.parse(await read('.vscode/mcp.json'));
    expect(mcp.servers.github.command).toBe('npx');
    expect(mcp.inputs[0].password).toBe(true);
  });

  it('list --json reflects state, with dependency flags', async () => {
    const r = await aidev(['list', '--json']);
    const byRef = Object.fromEntries(r.json.installed.map((i: any) => [i.ref, i]));
    expect(byRef['aidev/react-migration-agent'].explicit).toBe(true);
    expect(byRef['aidev/github'].explicit).toBe(false);
  });
});

describe('exit codes & safety', () => {
  it('not found → 4', async () => expect((await aidev(['info', 'nope-nope', '--json'])).code).toBe(4));
  it('publish without auth → 3', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-art-'));
    await aidev(['init', 'artifact', 'prompt', 'my-prompt', '--dir', d, '--json']);
    const r = await aidev(['publish', d, '--yes', '--json']);
    expect(r.code).toBe(3);
  });
  it('company-blocked artifact → 6 for members, installable for outsiders', async () => {
    expect((await aidev(['install', 'mlopez/quick-deploy-agent', '--yes', '--json'], { AIDEV_TOKEN: demoToken })).code).toBe(6);
    expect((await aidev(['install', 'mlopez/quick-deploy-agent', '--yes', '--json', '--dry-run'])).code).toBe(0);
  });
  it('never overwrites an existing file: exit 5; --force backs up; rollback restores', async () => {
    const f = path.join(proj, '.github/prompts/pr-review.prompt.md');
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, 'my own prompt');
    const r = await aidev(['install', 'pr-review', '--yes', '--json']);
    expect(r.code).toBe(5);
    expect(await fs.readFile(f, 'utf8')).toBe('my own prompt');
    const forced = await aidev(['install', 'pr-review', '--yes', '--force', '--json']);
    expect(forced.code).toBe(0);
    expect(forced.json.backups).toHaveLength(1);
    expect(await fs.readFile(f, 'utf8')).toMatch(/Review the changes/);
    expect((await aidev(['rollback', forced.json.backups[0], '--json'])).code).toBe(0);
    expect(await fs.readFile(f, 'utf8')).toBe('my own prompt');
  });
  it('--dry-run --diff writes nothing and shows diffs', async () => {
    const r = await aidev(['install', 'api-testing', '--dry-run', '--diff', '--yes', '--json']);
    expect(r.json.dryRun).toBe(true);
    expect(r.json.installed[0].providers[0].diffs[0]).toContain('+++');
    expect(await exists('.github/skills/api-testing')).toBe(false);
  });
  it('--no-color output has no escape codes', async () => {
    const r = await aidev(['--no-color', 'search', 'postgres']);
    expect(r.stdout).not.toMatch(/\x1b\[/);
  });
});

describe('updates, uninstall, lockfile', () => {
  const skill = (version: string, name = 'rtl-migration') => [
    { path: 'manifest.json', content: JSON.stringify({ name, type: 'skill', version, description: 'Migrate Enzyme tests to RTL (updated)', author: 'AI Hub', permissions: ['read-files'] }) },
    { path: 'SKILL.md', content: `---\nname: ${name}\ndescription: x\n---\nVersion ${version} body` },
    { path: 'README.md', content: '#' },
  ];
  async function publish(version: string) {
    const r = await fetch(`${registry}/v1/artifacts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await aidevToken()}` }, body: JSON.stringify({ files: skill(version) }) });
    return r.status;
  }
  const aidevToken = async () => (await (await fetch(`${registry}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'official@aidev.dev', password: 'password123' }) })).json()).token;

  it('update applies minor bumps but never silently applies major ones', async () => {
    expect(await publish('1.1.0')).toBe(201);
    expect(await publish('2.0.0')).toBe(201);
    const check = await aidev(['update', '--check', '--json']);
    const row = check.json.updates.find((u: any) => u.ref === 'aidev/rtl-migration');
    expect(row).toMatchObject({ installed: '1.0.0', latest: '2.0.0', major: true, status: 'skipped-major' });
    expect(await read('.github/skills/rtl-migration/SKILL.md')).not.toContain('Version 2.0.0');
    const all = await aidev(['update', '--all', '--yes', '--json']);
    expect(all.code).toBe(0);
    expect(await read('.github/skills/rtl-migration/SKILL.md')).not.toContain('Version 2.0.0');
    const major = await aidev(['update', 'rtl-migration', '--yes', '--json']);
    expect(major.code).toBe(0);
    expect(await read('.github/skills/rtl-migration/SKILL.md')).toContain('Version 2.0.0');
    expect(JSON.parse(await read('.aidev-lock.json')).artifacts['aidev/rtl-migration'].version).toBe('2.0.0');
  });

  it('refuses to uninstall something others depend on; removes cleanly otherwise (and prunes orphans)', async () => {
    expect((await aidev(['uninstall', 'github', '--json'])).code).toBe(5);
    const r = await aidev(['uninstall', 'react-migration-agent', '--json']);
    expect(r.code).toBe(0);
    expect(await exists('.github/agents/react-migration-agent.agent.md')).toBe(false);
    expect(await exists('.vscode/mcp.json')).toBe(false);                 // our only entry removed → empty file removed
    expect(r.json.removed).toEqual(expect.arrayContaining(['aidev/react-migration-agent', 'aidev/github']));
    expect(await exists('.github/skills/react-19-migration/SKILL.md')).toBe(true); // explicit install is kept
  });

  it('install with no args restores the project from the lockfile (and verifies hashes)', async () => {
    await fs.rm(path.join(proj, '.github/skills'), { recursive: true });
    await fs.rm(path.join(proj, '.aidev'), { recursive: true });
    const r = await aidev(['install', '--yes', '--json']);
    expect(r.code).toBe(0);
    expect(await exists('.github/skills/react-19-migration/SKILL.md')).toBe(true);
    expect(await exists('.github/skills/rtl-migration/SKILL.md')).toBe(false);   // was only a dependency of the removed agent
  });

  it('lockfile restore preserves dependency edges (shared deps stay protected)', async () => {
    expect((await aidev(['install', 'react-migration-agent', '--yes', '--json'])).code).toBe(0);
    await fs.rm(path.join(proj, '.github'), { recursive: true });
    await fs.rm(path.join(proj, '.vscode'), { recursive: true });
    await fs.rm(path.join(proj, '.aidev'), { recursive: true });
    await fs.mkdir(path.join(proj, '.github'));
    await fs.writeFile(path.join(proj, '.github/copilot-instructions.md'), '# project rules\n');
    expect((await aidev(['install', '--yes', '--json'])).code).toBe(0);
    expect((await aidev(['uninstall', 'github', '--json'])).code).toBe(5);       // still required by the agent
    expect((await aidev(['uninstall', 'react-migration-agent', '--json'])).code).toBe(0);
    expect(await exists('.vscode/mcp.json')).toBe(false);                        // orphaned MCP pruned
  });

  it('doctor reports a healthy setup and flags locally modified files', async () => {
    expect((await aidev(['doctor', '--json'])).json.healthy).toBe(true);
    await fs.appendFile(path.join(proj, '.github/skills/react-19-migration/SKILL.md'), '\nlocal edit');
    const d = await aidev(['doctor', '--json']);
    expect(d.json.checks.some((c: any) => c.status === 'warn' && /modified locally/.test(c.detail))).toBe(true);
  });
});

describe('publish & company flows via CLI', () => {
  it('init artifact → publish --dry-run → publish to a private org namespace', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-art-'));
    const init = await aidev(['init', 'artifact', 'skill', 'acme-lint-skill', '--dir', d, '--json'], { AIDEV_TOKEN: aliceToken });
    expect(init.code).toBe(0);
    const dry = await aidev(['publish', d, '--dry-run', '--json']);
    expect(dry.code).toBe(0);
    expect(dry.json.manifest.name).toBe('acme-lint-skill');
    const pub = await aidev(['publish', d, '--org', 'acme', '--visibility', 'organization', '--yes', '--json'], { AIDEV_TOKEN: aliceToken });
    expect(pub.code).toBe(0);
    expect(pub.json.published).toMatchObject({ owner: 'acme', slug: 'acme-lint-skill', version: '0.1.0' });
    expect((await aidev(['info', 'acme/acme-lint-skill', '--json'])).code).toBe(4);                    // anonymous can't see it
    expect((await aidev(['info', 'acme/acme-lint-skill', '--json'], { AIDEV_TOKEN: demoToken })).code).toBe(0); // acme member can
  });
  it('team resources shows governance labels', async () => {
    const r = await aidev(['team', 'resources', '--json'], { AIDEV_TOKEN: demoToken });
    const gov = Object.fromEntries(r.json.resources.map((x: any) => [x.slug, x.governance]));
    expect(gov['rtl-conventions']).toBe('approved');
  });
  it('validation failure exits 8', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-art-'));
    await fs.writeFile(path.join(d, 'manifest.json'), '{"name":"x"}');
    expect((await aidev(['publish', d, '--yes', '--json'], { AIDEV_TOKEN: demoToken })).code).toBe(8);
  });
});

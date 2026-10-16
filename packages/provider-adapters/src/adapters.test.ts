import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manifestSchema, hashFiles, type ResolvedArtifact, type ManifestInput } from '@aidev/artifact-schema';
import { adapters, rollback } from './index.js';

let dir: string, home: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-proj-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-home-'));
});

function art(m: Partial<ManifestInput> & { name: string; type: ManifestInput['type']; version: string }, files: Record<string, string>): ResolvedArtifact {
  const manifest = manifestSchema.parse({ ...{ author: 'acme', description: 'A test artifact here' }, ...m });
  const fl = Object.entries(files).map(([path, content]) => ({ path, content }));
  return { owner: 'acme', slug: manifest.name, version: manifest.version, sha256: hashFiles(fl), manifest, files: fl };
}
const opts = () => ({ cwd: dir, home, scope: 'project' as const });
const read = (p: string) => fs.readFile(path.join(dir, p), 'utf8');

const agent = art({ name: 'react-agent', type: 'agent', version: '1.0.0', agent: { tools: ['read', 'edit', 'execute'] } }, { 'agent.md': '# Instructions\nMigrate React.' });
const skill = art({ name: 'mui7', type: 'skill', version: '1.0.0' }, { 'SKILL.md': '---\nname: mui7\ndescription: x\n---\nBody', 'references/a.md': 'ref' });
const mcp = art({ name: 'github', type: 'mcp', version: '1.0.0', mcp: { command: 'npx', args: ['-y', 'gh-mcp'], env: { GITHUB_TOKEN: { description: 'PAT' } } } }, {});

describe('copilot', () => {
  it('installs agent, skill and mcp in documented locations', async () => {
    const c = adapters.copilot;
    await c.installArtifact(agent, opts());
    await c.installArtifact(skill, opts());
    await c.installArtifact(mcp, opts());
    expect(await read('.github/agents/react-agent.agent.md')).toMatch(/tools:\n {2}- read\n {2}- edit\n {2}- execute/);
    expect(await read('.github/skills/mui7/SKILL.md')).toContain('Body');
    expect(await read('.github/skills/mui7/references/a.md')).toBe('ref');
    const j = JSON.parse(await read('.vscode/mcp.json'));
    expect(j.servers.github.command).toBe('npx');
    expect(j.servers.github.env.GITHUB_TOKEN).toBe('${input:github-github_token}');
    expect(j.inputs[0]).toMatchObject({ id: 'github-github_token', password: true });
  });

  it('never overwrites foreign files, and --force backs up', async () => {
    const f = path.join(dir, '.github/agents/react-agent.agent.md');
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, 'mine');
    const r = await adapters.copilot.installArtifact(agent, opts());
    expect(r.applied).toBe(false);
    expect(r.conflicts).toHaveLength(1);
    expect(await fs.readFile(f, 'utf8')).toBe('mine');
    const r2 = await adapters.copilot.installArtifact(agent, { ...opts(), force: true });
    expect(r2.applied).toBe(true);
    expect(r2.backupId).toBeTruthy();
    expect(await fs.readFile(path.join(dir, '.aidev/backups', r2.backupId!, '0'), 'utf8')).toBe('mine');
    await rollback(path.join(dir, '.aidev/backups'), r2.backupId!);
    expect(await fs.readFile(f, 'utf8')).toBe('mine');
  });

  it('merges into an existing mcp.json without losing servers, and uninstall removes only ours', async () => {
    await fs.mkdir(path.join(dir, '.vscode'), { recursive: true });
    await fs.writeFile(path.join(dir, '.vscode/mcp.json'), JSON.stringify({ servers: { other: { command: 'x' } } }));
    const r = await adapters.copilot.installArtifact(mcp, opts());
    expect(Object.keys(JSON.parse(await read('.vscode/mcp.json')).servers)).toEqual(['other', 'github']);
    await adapters.copilot.uninstallArtifact(mcp, { ...opts(), ops: r.ops });
    expect(JSON.parse(await read('.vscode/mcp.json'))).toEqual({ servers: { other: { command: 'x' } } });
  });

  it('is idempotent and update-safe via previous ops', async () => {
    const r1 = await adapters.copilot.installArtifact(agent, opts());
    const r2 = await adapters.copilot.installArtifact(agent, { ...opts(), previous: r1.ops });
    expect(r2.changes.every((c) => c.action === 'unchanged')).toBe(true);
    const v2 = art({ name: 'react-agent', type: 'agent', version: '1.1.0' }, { 'agent.md': 'new body' });
    const r3 = await adapters.copilot.installArtifact(v2, { ...opts(), previous: r1.ops });
    expect(r3.applied).toBe(true);
    expect(await read('.github/agents/react-agent.agent.md')).toContain('new body');
  });

  it('refuses a non-strict-JSON mcp.json instead of clobbering it', async () => {
    await fs.mkdir(path.join(dir, '.vscode'), { recursive: true });
    await fs.writeFile(path.join(dir, '.vscode/mcp.json'), '{ // comment\n "servers": {} }');
    const r = await adapters.copilot.installArtifact(mcp, opts());
    expect(r.applied).toBe(false);
    expect(r.conflicts[0].reason).toMatch(/parse/);
  });

  it('dry-run writes nothing', async () => {
    const r = await adapters.copilot.installArtifact(agent, { ...opts(), dryRun: true });
    expect(r.applied).toBe(false);
    expect(r.changes[0].action).toBe('create');
    await expect(read('.github/agents/react-agent.agent.md')).rejects.toThrow();
  });
});

describe('claude', () => {
  it('maps agent tools and writes subagent, skill, .mcp.json', async () => {
    const c = adapters.claude;
    await c.installArtifact(agent, opts());
    await c.installArtifact(skill, opts());
    await c.installArtifact(mcp, opts());
    expect(await read('.claude/agents/react-agent.md')).toContain('tools: Read, Grep, Glob, Edit, Write, Bash');
    expect(await read('.claude/skills/mui7/SKILL.md')).toContain('name: mui7');
    expect(JSON.parse(await read('.mcp.json')).mcpServers.github.env.GITHUB_TOKEN).toBe('${GITHUB_TOKEN}');
  });
  it('skips user-scope mcp with a reason', async () => {
    const r = await adapters.claude.installArtifact(mcp, { ...opts(), scope: 'user' });
    expect(r.skipped).toMatch(/claude.json/);
  });
});

describe('codex', () => {
  it('installs agent as skill in .agents/skills and mcp as managed toml block', async () => {
    const c = adapters.codex;
    const ra = await c.installArtifact(agent, opts());
    expect(ra.notes.join()).toMatch(/no agent file/);
    expect(await read('.agents/skills/react-agent/SKILL.md')).toContain('Migrate React');
    await fs.mkdir(path.join(dir, '.codex'), { recursive: true });
    await fs.writeFile(path.join(dir, '.codex/config.toml'), 'model = "x"\n# my comment\n');
    const rm = await c.installArtifact(mcp, opts());
    const toml = await read('.codex/config.toml');
    expect(toml).toContain('# my comment');
    expect(toml).toContain('[mcp_servers.github]');
    expect(toml).toContain('env_vars = ["GITHUB_TOKEN"]');
    await c.uninstallArtifact(mcp, { ...opts(), ops: rm.ops });
    expect(await read('.codex/config.toml')).toBe('model = "x"\n# my comment\n');
  });
  it('detects conflicting hand-written mcp table', async () => {
    await fs.mkdir(path.join(dir, '.codex'), { recursive: true });
    await fs.writeFile(path.join(dir, '.codex/config.toml'), '[mcp_servers.github]\ncommand = "mine"\n');
    const r = await adapters.codex.installArtifact(mcp, opts());
    expect(r.applied).toBe(false);
  });
});

describe('safety', () => {
  it('refuses files that escape the skill directory', () => {
    const evil = art({ name: 'evil', type: 'skill', version: '1.0.0' }, { 'SKILL.md': '---\nname: evil\ndescription: x\n---\nb', '../../../.ssh/authorized_keys': 'pwn' });
    expect(() => adapters.copilot.plan(evil, opts())).toThrow(/escapes/);
  });
});

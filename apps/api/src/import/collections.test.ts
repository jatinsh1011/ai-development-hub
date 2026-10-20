import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect, PgSearch } from '@aidev/database';
import { validateArtifact } from '@aidev/artifact-schema';
import { ArtifactsService } from '../artifacts.service.js';
import { MemoryStorage } from '../storage.js';
import type { Ctx } from '../context.js';
import { permissiveLicense, sameSource } from './common.js';
import {
  claudeTools, humanize, importCollection, loadSource, looseFrontmatter, mapAgenticWorkflow, mapClaudeAgent, mapCommand, mapCursorRule,
  type CollectionSource, type Source,
} from './collections.js';

const MIT = 'MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software…';
const lic = { spdx: 'MIT', text: MIT };
const src: Source = { repo: 'acme/collection', dir: '/nonexistent', sha: 'abc1234def', files: [] };
const ok = (m: any) => {
  expect('skip' in m ? m.skip : null).toBeNull();
  expect(validateArtifact(m.files).issues.filter((i) => i.level === 'error')).toEqual([]);
  return m;
};
const manifestOf = (m: any) => JSON.parse(m.files.find((f: any) => f.path === 'manifest.json').content);
const fileOf = (m: any, p: string) => m.files.find((f: any) => f.path === p)?.content as string;

let ctx: Ctx;
beforeEach(async () => {
  const db = await connect();
  ctx = { db, search: new PgSearch(db), storage: new MemoryStorage() };
});

describe('collection import: licensing and identity', () => {
  it('only accepts permissive licenses', () => {
    expect(permissiveLicense(MIT)).toBe('MIT');
    expect(permissiveLicense('                                 Apache License\n                           Version 2.0, January 2004')).toBe('Apache-2.0');
    expect(permissiveLicense('Creative Commons Legal Code\n\nCC0 1.0 Universal')).toBe('CC0-1.0');
    expect(permissiveLicense('Copyright (c) 2020, X\nAll rights reserved.\n\nRedistribution and use in source and binary forms… Neither the name of X…')).toBe('BSD-3-Clause');
    expect(permissiveLicense('© 2025 Anthropic, PBC. All rights reserved.\n\nUse of these materials is governed by your agreement with Anthropic.')).toBeNull();
    expect(permissiveLicense('')).toBeNull();
  });

  it('treats the same upstream path at a different commit as the same item', () => {
    expect(sameSource('https://github.com/o/r/blob/aaa/skills/x', 'https://github.com/o/r/blob/bbb/skills/x')).toBe(true);
    expect(sameSource('https://github.com/o/r/blob/aaa/skills/x', 'https://github.com/o/r/blob/aaa/skills/y')).toBe(false);
    expect(sameSource(null, 'https://github.com/o/r/blob/aaa/skills/x')).toBe(false);
  });
});

describe('collection import: mapping each format', () => {
  it('maps a Claude Code subagent to an agent', () => {
    const text = '---\nname: api-designer\ndescription: "Use this agent when designing new APIs. <example>Context: x\\nuser: y</example>"\ntools: Read, Write, Edit, Bash, Glob, Grep\nmodel: sonnet\n---\n\nYou are a senior API designer.\n';
    const m = ok(mapClaudeAgent(src, 'acme', 'agents/api-designer.md', text, lic));
    const man = manifestOf(m);
    expect(man.title).toBe('API Designer');
    expect(man.description).not.toMatch(/example|Context:/i);
    expect(man.agent.tools).toEqual(['read', 'edit', 'search', 'execute']);
    expect(man.permissions).toEqual(['read-files', 'write-files', 'run-commands']);
    expect(man.providers.claude.frontmatter.model).toBe('sonnet');
    expect(man.repository).toBe('https://github.com/acme/collection/blob/abc1234def/agents/api-designer.md');
    expect(fileOf(m, 'LICENSE')).toBe(MIT);
    expect(fileOf(m, 'README.md')).toMatch(/not been reviewed/);
    expect(claudeTools(undefined)).toEqual(['read', 'edit', 'search', 'execute']);
    expect(claudeTools('WebFetch, Read')).toEqual(['read', 'web']);
  });

  it('maps a slash command to a prompt, keeping Claude-only fields as overrides', () => {
    const text = '---\ndescription: Scaffold a Python project with uv\nargument-hint: <project-name>\nallowed-tools: Bash(uv:*), Write\n---\n\n# Python Project Scaffolding\n\nYou are a Python project architecture expert. Create $ARGUMENTS with a full layout.\n';
    const m = ok(mapCommand(src, 'acme', 'commands/python-scaffold.md', text, lic, 'prompt'));
    const man = manifestOf(m);
    expect(man).toMatchObject({ type: 'prompt', name: 'python-scaffold', title: 'Python Project Scaffolding', description: 'Scaffold a Python project with uv' });
    expect(man.providers.claude.frontmatter).toEqual({ 'argument-hint': '<project-name>', 'allowed-tools': 'Bash(uv:*), Write' });
    expect(man.permissions).toEqual(['read-files', 'write-files', 'run-commands']);
    expect(fileOf(m, 'prompt.md')).toMatch(/\$ARGUMENTS/);
    expect(fileOf(m, 'README.md')).toMatch(/fills in `\$ARGUMENTS`/);
  });

  it('maps a multi-agent command to a workflow, describing it from its first paragraph', () => {
    const text = '---\nmodel: claude-opus-4-1\n---\n\nImplement a new feature using specialized agents with explicit Task tool invocations.\n\n[Extended thinking: orchestrates agents]\n\n## Steps\n1. Plan\n';
    const m = ok(mapCommand(src, 'acme', 'workflows/feature-development.md', text, lic, 'workflow'));
    expect(manifestOf(m)).toMatchObject({ type: 'workflow', title: 'Feature Development' });
    expect(manifestOf(m).description).toMatch(/^Implement a new feature/);
    expect(fileOf(m, 'workflow.md')).not.toMatch(/claude-opus/);
  });

  it('maps a GitHub Agentic Workflow to on-demand instructions and says how it runs upstream', () => {
    const text = '---\nname: Daily Issue Triage\ndescription: |\n  Scheduled daily triage that processes untriaged issues.\non:\n  schedule: daily\n  workflow_dispatch:\npermissions: read-all\n---\n\n# Daily triage\n\nFind issues without labels and add the right labels and a short triage comment.\n';
    const m = ok(mapAgenticWorkflow(src, 'acme', 'workflows/daily-issue-triage.md', text, lic));
    expect(manifestOf(m)).toMatchObject({ type: 'workflow', title: 'Daily Issue Triage' });
    expect(fileOf(m, 'workflow.md')).not.toMatch(/^---|safe-outputs|permissions: read-all/);
    expect(fileOf(m, 'README.md')).toMatch(/runs on: schedule \(daily\), workflow dispatch/);
    expect('skip' in mapAgenticWorkflow(src, 'acme', 'workflows/notes.md', '# Notes\n\nNot a workflow, just notes about how we work here.', lic)).toBe(true);
  });

  it('maps a Cursor rule to an instruction, even with YAML-invalid globs', () => {
    const text = '---\ndescription: "Cursor rules for Angular development with TypeScript integration."\nglobs: **/*.ts\nalwaysApply: false\n---\nyou are an expert Angular programmer using TypeScript, Angular 18 and Jest.\n';
    expect(looseFrontmatter(text).data.globs).toBe('**/*.ts');
    const m = ok(mapCursorRule(src, 'acme', 'rules/angular-typescript-cursorrules-prompt-file.mdc', text, lic));
    const man = manifestOf(m);
    expect(man).toMatchObject({ type: 'instruction', name: 'angular-typescript', title: 'Angular TypeScript', description: 'Cursor rules for Angular development with TypeScript integration.' });
    expect(man.providers.copilot.frontmatter.applyTo).toBe('**/*.ts');
    expect(fileOf(m, 'instruction.md')).not.toMatch(/^---|alwaysApply/);
    expect(humanize('ci-cd-github-actions')).toBe('CI CD GitHub Actions');
  });
});

describe('collection import: end to end', () => {
  it('imports components and plugins, shares identical copies, refuses closed licenses, and re-imports without duplicates', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidev-coll-'));
    const dir = path.join(root, 'acme_plugins');
    const w = async (rel: string, content: string) => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), content); };
    const agent = '---\nname: test-runner\ndescription: Runs the test suite and fixes failing tests in the project.\ntools: Read, Edit, Bash\n---\n\nRun the tests, read failures, fix them.\n';
    await w('LICENSE', MIT);
    await w('plugins/alpha/.claude-plugin/plugin.json', JSON.stringify({ name: 'alpha', version: '1.2.0', description: 'Alpha plugin with an agent, a command and a skill' }));
    await w('plugins/alpha/agents/test-runner.md', agent);
    await w('plugins/alpha/commands/run-tests.md', '---\ndescription: Run the whole test suite and summarise failures\n---\n\nRun all tests with the project test command and summarise every failure you find.\n');
    await w('plugins/alpha/skills/flaky-finder/SKILL.md', '---\nname: flaky-finder\ndescription: Finds flaky tests by re-running suspicious ones several times.\n---\n\nRe-run each suspicious test five times and report the ones that flip.\n');
    await w('plugins/beta/.claude-plugin/plugin.json', JSON.stringify({ name: 'beta', description: 'Beta reuses the same test-runner agent as alpha' }));
    await w('plugins/beta/agents/test-runner.md', agent); // identical copy: one shared listing
    await w('plugins/hooks-only/.claude-plugin/plugin.json', JSON.stringify({ name: 'hooks-only', description: 'Only hooks, nothing aidev can install' }));
    await w('plugins/hooks-only/hooks/hooks.json', '{}');
    await w('plugins/closed/LICENSE', '© 2026 Someone. All rights reserved.');
    await w('plugins/closed/.claude-plugin/plugin.json', JSON.stringify({ name: 'closed', description: 'A source-available plugin we must not copy' }));
    await w('plugins/closed/agents/secret.md', '---\nname: secret\ndescription: A source-available agent that must not be imported.\n---\n\nSecret.\n');

    const source: CollectionSource = {
      id: 'test', repo: 'acme/plugins', publisher: { handle: 'acme-plugins', name: 'acme (imported)' }, licensing: 'root',
      skill: /^plugins\/[^/]+\/skills\/[^/]+$/, agent: /^plugins\/[^/]+\/agents\/[^/]+\.md$/, prompt: /^plugins\/[^/]+\/commands\/[^/]+\.md$/,
      plugin: { re: /^plugins\/[^/]+$/, format: 'claude' },
    };
    const s1 = await loadSource('acme/plugins', { sourcesDir: root });
    const r1 = await importCollection(ctx, source, { src: s1 });
    expect(r1.byKind).toMatchObject({ agent: 1, prompt: 1, skill: 1, plugin: 2 });
    expect(r1.stats.skipped.get('identical copy (shared with another plugin)')).toBe(1);
    expect(r1.stats.skipped.get('no permissive license')).toBe(1);
    expect(r1.stats.skipped.get('plugin: no permissive license')).toBe(1);
    expect(r1.stats.skipped.get('plugin without installable parts (hooks, LSP or MCP only)')).toBe(1);

    const svc = new ArtifactsService(ctx);
    const alpha = await svc.resolveInstall('acme-plugins/alpha', undefined, null);
    expect(alpha.order.map((x: any) => x.slug).sort()).toEqual(['alpha', 'flaky-finder', 'run-tests', 'test-runner']);
    expect(alpha.order.find((x: any) => x.slug === 'alpha').version).toBe('1.2.0');
    const beta = await svc.resolveInstall('acme-plugins/beta', undefined, null);
    expect(beta.order.map((x: any) => x.slug).sort()).toEqual(['beta', 'test-runner']);

    // An upstream commit moves every pinned link; the same listings are updated, none duplicated.
    const r2 = await importCollection(ctx, source, { src: { ...s1, sha: 'feedface' } });
    expect(r2.stats.created).toBe(0);
    const n = (await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM artifacts WHERE owner_slug='acme-plugins'")).rows[0].n;
    expect(n).toBe(5);
  });
});

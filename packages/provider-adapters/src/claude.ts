import path from 'node:path';
import { stringifyFrontmatter, type ResolvedArtifact } from '@aidev/artifact-schema';
import { BaseAdapter, bodyOf, overrides, skillOps, unsupported, type Plan } from './base.js';
import { exists, which } from './detect.js';
import type { InstallOptions, ProviderEnvironment } from './ops.js';

const TOOLMAP: Record<string, string[]> = {
  read: ['Read', 'Grep', 'Glob'], edit: ['Edit', 'Write'], search: ['Grep', 'Glob'], execute: ['Bash'], web: ['WebFetch', 'WebSearch'],
};

/**
 * Claude Code.
 * Docs (verified): skills `.claude/skills/<n>/SKILL.md` (or ~/.claude/skills); subagents `.claude/agents/<n>.md`
 * with comma-separated `tools`; project MCP `.mcp.json` ({ mcpServers }, `${VAR}` expansion); CLAUDE.md memory.
 * Slash commands are now skills, so prompts install as user-invoked skills.
 * User-level MCP lives in ~/.claude.json (managed by `claude mcp add`), which we deliberately do not edit.
 */
export class ClaudeCodeAdapter extends BaseAdapter {
  id = 'claude' as const;
  name = 'Claude Code';

  async inspect(o: { cwd?: string; home?: string } = {}): Promise<ProviderEnvironment> {
    const cwd = o.cwd ?? process.cwd(), home = o.home ?? process.env.HOME ?? '';
    const evidence: string[] = [];
    const bin = await which('claude');
    if (bin) evidence.push(`claude CLI at ${bin}`);
    if (await exists(path.join(home, '.claude'))) evidence.push('~/.claude');
    for (const p of ['.claude', 'CLAUDE.md', '.mcp.json']) if (await exists(path.join(cwd, p))) evidence.push(p);
    return {
      id: this.id, name: this.name, detected: evidence.length > 0, binary: bin, evidence,
      paths: {
        project: { agents: '.claude/agents', skills: '.claude/skills', instructions: 'CLAUDE.md', mcp: '.mcp.json' },
        user: { agents: '~/.claude/agents', skills: '~/.claude/skills', instructions: '~/.claude/CLAUDE.md' },
      },
    };
  }

  plan(a: ResolvedArtifact, o: InstallOptions): Plan {
    const base = o.scope === 'user' ? path.join(o.home, '.claude') : path.join(o.cwd, '.claude');
    const m = a.manifest;
    switch (m.type) {
      case 'skill':
      case 'workflow':
        return { ops: skillOps(a, path.join(base, 'skills')), notes: [] };
      case 'prompt':
        return { ops: skillOps(a, path.join(base, 'skills'), { 'disable-model-invocation': true, ...overrides(a, 'claude') }, bodyOf(a)), notes: [`Invoke with /${m.name}`] };
      case 'agent': {
        const tools = [...new Set((m.agent?.tools ?? ['read', 'search']).flatMap((t) => TOOLMAP[t] ?? []))].join(', ');
        const model = m.agent?.model && /^(sonnet|opus|haiku|fable|claude-)/.test(m.agent.model) ? m.agent.model : undefined;
        const fm = { name: m.name, description: m.description, tools, model, ...overrides(a, 'claude') };
        return { ops: [{ kind: 'write', path: path.join(base, 'agents', `${m.name}.md`), content: stringifyFrontmatter(fm, bodyOf(a)) }], notes: [] };
      }
      case 'instruction': {
        const file = o.scope === 'user' ? path.join(base, 'CLAUDE.md') : path.join(o.cwd, 'CLAUDE.md');
        return { ops: [{ kind: 'text-block', path: file, id: m.name, style: 'html', content: `## ${m.title ?? m.name}\n\n${bodyOf(a).trim()}` }], notes: [] };
      }
      case 'mcp': {
        if (o.scope === 'user') return unsupported('Claude Code user-scope MCP is stored in ~/.claude.json; run `claude mcp add` or use --scope project');
        const s = m.mcp!;
        const env = Object.fromEntries(Object.keys(s.env).map((k) => [k, `\${${k}}`]));
        const server = s.transport === 'stdio'
          ? { type: 'stdio', command: s.command, args: s.args, ...(Object.keys(env).length ? { env } : {}) }
          : { type: 'http', url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}) };
        return {
          ops: [{ kind: 'json-key', path: path.join(o.cwd, '.mcp.json'), keys: ['mcpServers', m.name], value: server }],
          notes: [Object.keys(env).length ? `Export ${Object.keys(env).join(', ')} in your shell before launching Claude Code.` : '', 'Claude Code asks you to approve project MCP servers on first use.'].filter(Boolean),
        };
      }
      default:
        return { ops: [], notes: [`${m.type} installs its dependencies only`] };
    }
  }
}

import path from 'node:path';
import { stringifyFrontmatter, type ResolvedArtifact } from '@aidev/artifact-schema';
import { BaseAdapter, bodyOf, overrides, skillOps, unsupported, type Plan } from './base.js';
import { exists, which } from './detect.js';
import type { InstallOptions, PlanOp, ProviderEnvironment } from './ops.js';

/**
 * GitHub Copilot (VS Code, Copilot CLI, cloud agent).
 * Docs (verified): custom agents `.github/agents/*.agent.md`; skills `.github/skills/<n>/SKILL.md`;
 * prompts `.github/prompts/*.prompt.md`; repo MCP `.vscode/mcp.json` ({ servers, inputs });
 * user-level (Copilot CLI) `~/.copilot/agents`, `~/.copilot/skills`.
 */
export class CopilotAdapter extends BaseAdapter {
  id = 'copilot' as const;
  name = 'GitHub Copilot';

  async inspect(o: { cwd?: string; home?: string } = {}): Promise<ProviderEnvironment> {
    const cwd = o.cwd ?? process.cwd(), home = o.home ?? process.env.HOME ?? '';
    const evidence: string[] = [];
    const bin = await which('copilot');
    if (bin) evidence.push(`copilot CLI at ${bin}`);
    for (const p of [path.join(home, '.copilot'), path.join(cwd, '.github', 'copilot-instructions.md'), path.join(cwd, '.github', 'agents'), path.join(cwd, '.github', 'skills'), path.join(cwd, '.github', 'prompts'), path.join(cwd, '.vscode')]) {
      if (await exists(p)) evidence.push(p.startsWith(cwd) ? path.relative(cwd, p) : p.replace(home, '~'));
    }
    return {
      id: this.id, name: this.name, detected: evidence.length > 0, binary: bin, evidence,
      paths: {
        project: { agents: '.github/agents', skills: '.github/skills', prompts: '.github/prompts', instructions: '.github/instructions', mcp: '.vscode/mcp.json' },
        user: { agents: '~/.copilot/agents', skills: '~/.copilot/skills' },
      },
    };
  }

  plan(a: ResolvedArtifact, o: InstallOptions): Plan {
    const base = o.scope === 'user' ? path.join(o.home, '.copilot') : path.join(o.cwd, '.github');
    const m = a.manifest;
    const notes: string[] = [];
    switch (m.type) {
      case 'skill':
      case 'workflow':
        return { ops: skillOps(a, path.join(base, 'skills')), notes };
      case 'agent': {
        const tools = m.agent?.tools ?? ['read', 'search'];
        const fm = { name: m.name, description: m.description, tools, ...(m.agent?.model ? { model: m.agent.model } : {}), ...overrides(a, 'copilot') };
        return { ops: [{ kind: 'write', path: path.join(base, 'agents', `${m.name}.agent.md`), content: stringifyFrontmatter(fm, bodyOf(a)) }], notes };
      }
      case 'prompt': {
        if (o.scope === 'user') return unsupported('Copilot user-level prompts live in the editor profile; install with --scope project');
        const fm = { description: m.description, ...overrides(a, 'copilot') };
        return { ops: [{ kind: 'write', path: path.join(base, 'prompts', `${m.name}.prompt.md`), content: stringifyFrontmatter(fm, bodyOf(a)) }], notes };
      }
      case 'instruction': {
        if (o.scope === 'user') return unsupported('Copilot instruction files are repository-scoped; use --scope project');
        const fm = { description: m.description, applyTo: '**', ...overrides(a, 'copilot') };
        return { ops: [{ kind: 'write', path: path.join(base, 'instructions', `${m.name}.instructions.md`), content: stringifyFrontmatter(fm, bodyOf(a)) }], notes };
      }
      case 'mcp': {
        if (o.scope === 'user') return unsupported('Copilot MCP servers are configured per workspace (.vscode/mcp.json); use --scope project');
        const s = m.mcp!;
        const file = path.join(o.cwd, '.vscode', 'mcp.json');
        const ops: PlanOp[] = [];
        const server: Record<string, unknown> = s.transport === 'stdio'
          ? { type: 'stdio', command: s.command, args: s.args }
          : { type: 'http', url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}) };
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.env)) {
          const id = `${m.name}-${k}`.toLowerCase();
          ops.push({ kind: 'json-array', path: file, keys: ['inputs'], idKey: 'id', value: { type: 'promptString', id, description: v.description ?? k, password: v.secret } });
          env[k] = `\${input:${id}}`;
        }
        if (s.transport === 'stdio' && Object.keys(env).length) server.env = env;
        ops.push({ kind: 'json-key', path: file, keys: ['servers', m.name], value: server });
        notes.push('VS Code will prompt for secret inputs the first time the server starts.');
        return { ops, notes };
      }
      default:
        return { ops: [], notes: [`${m.type} installs its dependencies only`] };
    }
  }
}

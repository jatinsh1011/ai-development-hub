import path from 'node:path';
import type { ResolvedArtifact } from '@aidev/artifact-schema';
import { BaseAdapter, bodyOf, overrides, skillOps, type Plan } from './base.js';
import { exists, which } from './detect.js';
import type { InstallOptions, ProviderEnvironment } from './ops.js';

const q = (s: string) => JSON.stringify(s);

/**
 * OpenAI Codex.
 * Docs (verified): skills discovered in `.agents/skills` (repo, walking up) and `~/.agents/skills`;
 * MCP in `~/.codex/config.toml` or `.codex/config.toml` (trusted projects) under `[mcp_servers.<name>]`;
 * project guidance in AGENTS.md. Codex has no separate "agent file" format, so agents and prompts
 * are installed as skills (limitation: neutral `tools` cannot be enforced).
 */
export class CodexAdapter extends BaseAdapter {
  id = 'codex' as const;
  name = 'Codex';

  async inspect(o: { cwd?: string; home?: string } = {}): Promise<ProviderEnvironment> {
    const cwd = o.cwd ?? process.cwd(), home = o.home ?? process.env.HOME ?? '';
    const evidence: string[] = [];
    const bin = await which('codex');
    if (bin) evidence.push(`codex CLI at ${bin}`);
    if (await exists(path.join(home, '.codex'))) evidence.push('~/.codex');
    for (const p of ['.agents', '.codex', 'AGENTS.md']) if (await exists(path.join(cwd, p))) evidence.push(p);
    return {
      id: this.id, name: this.name, detected: evidence.length > 0, binary: bin, evidence,
      paths: {
        project: { skills: '.agents/skills', instructions: 'AGENTS.md', mcp: '.codex/config.toml' },
        user: { skills: '~/.agents/skills', instructions: '~/.codex/AGENTS.md', mcp: '~/.codex/config.toml' },
      },
    };
  }

  plan(a: ResolvedArtifact, o: InstallOptions): Plan {
    const skills = o.scope === 'user' ? path.join(o.home, '.agents', 'skills') : path.join(o.cwd, '.agents', 'skills');
    const m = a.manifest;
    switch (m.type) {
      case 'skill':
      case 'workflow':
        return { ops: skillOps(a, skills), notes: [] };
      case 'agent':
        return { ops: skillOps(a, skills, overrides(a, 'codex'), bodyOf(a)), notes: [`Codex has no agent file format; installed as a skill (invoke with $${m.name}). Tool restrictions are not enforced.`] };
      case 'prompt':
        return { ops: skillOps(a, skills, overrides(a, 'codex'), bodyOf(a)), notes: [`Installed as a skill (invoke with $${m.name}).`] };
      case 'instruction': {
        const file = o.scope === 'user' ? path.join(o.home, '.codex', 'AGENTS.md') : path.join(o.cwd, 'AGENTS.md');
        return { ops: [{ kind: 'text-block', path: file, id: m.name, style: 'html', content: `## ${m.title ?? m.name}\n\n${bodyOf(a).trim()}` }], notes: [] };
      }
      case 'mcp': {
        const s = m.mcp!;
        const file = o.scope === 'user' ? path.join(o.home, '.codex', 'config.toml') : path.join(o.cwd, '.codex', 'config.toml');
        const t = `mcp_servers.${m.name}`;
        const L: string[] = [`[${t}]`];
        if (s.transport === 'stdio') {
          L.push(`command = ${q(s.command!)}`, `args = [${s.args.map(q).join(', ')}]`);
          const vars = Object.keys(s.env);
          if (vars.length) L.push(`env_vars = [${vars.map(q).join(', ')}]`);
        } else {
          L.push(`url = ${q(s.url!)}`);
          const hdrs = { ...s.headers };
          for (const [k, v] of Object.entries(hdrs)) {
            const bm = k.toLowerCase() === 'authorization' && /^Bearer \$\{(\w+)\}$/.exec(v);
            if (bm) { L.push(`bearer_token_env_var = ${q(bm[1])}`); delete hdrs[k]; }
          }
          if (Object.keys(hdrs).length) L.push(`http_headers = { ${Object.entries(hdrs).map(([k, v]) => `${q(k)} = ${q(v)}`).join(', ')} }`);
        }
        return {
          ops: [{ kind: 'text-block', path: file, id: m.name, style: 'hash', content: L.join('\n'), conflictRe: `^\\[mcp_servers\\.${m.name}\\]` }],
          notes: [o.scope === 'project' ? 'Project .codex/config.toml is only read for trusted projects.' : '', Object.keys(s.env).length ? `Export ${Object.keys(s.env).join(', ')} before launching Codex.` : ''].filter(Boolean),
        };
      }
      default:
        return { ops: [], notes: [`${m.type} installs its dependencies only`] };
    }
  }
}

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter, type ArtifactFile } from '@aidev/artifact-schema';
import type { Ctx } from '../context.js';
import { clean, describe, detect, ensurePublisher, makeImporter, normalizeVersion, permissiveLicense, publishImported, sameSource, slugify, type Importer } from './common.js';

/**
 * Curated GitHub collections beyond awesome-copilot: Agent Skills, Claude Code subagents, slash commands
 * (imported as prompts), multi-step workflows, Cursor rules (imported as instructions) and plugins.
 *
 * Only permissively licensed content is imported. The license that applies to an item is the nearest
 * LICENSE file above it (its own folder, its plugin, then the repository root), so a plugin with
 * source-available terms inside an Apache-2.0 repository is skipped. Each listing bundles that license,
 * links the exact upstream commit and says it has not been reviewed. Counters start at zero.
 */

export type Kind = 'skill' | 'agent' | 'prompt' | 'workflow' | 'instruction' | 'plugin';

export interface CollectionSource {
  id: string;
  repo: string;
  publisher: { handle: string; name: string };
  /** 'root': the repository LICENSE covers items that ship none. 'item': every item must ship its own LICENSE. */
  licensing: 'root' | 'item';
  /** Directory holding a SKILL.md */
  skill?: RegExp;
  /** Claude Code subagent file (frontmatter: name, description, tools, model) */
  agent?: RegExp;
  /** Claude Code slash command file, imported as a prompt */
  prompt?: RegExp;
  /** 'command': an on-demand multi-agent workflow command. 'agentic': a GitHub Agentic Workflow file. */
  workflow?: { re: RegExp; format: 'command' | 'agentic' };
  /** Cursor rule (.mdc), imported as an instruction */
  instruction?: RegExp;
  /** Plugin root directory. 'claude': .claude-plugin/plugin.json + agents/commands/skills inside. 'copilot': plugin.json listing repo items. */
  plugin?: { re: RegExp; format: 'claude' | 'copilot' };
}

export const SOURCES: CollectionSource[] = [
  {
    id: 'wshobson-agents', repo: 'wshobson/agents', publisher: { handle: 'wshobson-agents', name: 'wshobson/agents (imported)' }, licensing: 'root',
    skill: /^plugins\/[^/]+\/skills\/[^/]+$/, agent: /^plugins\/[^/]+\/agents\/[^/]+\.md$/, prompt: /^plugins\/[^/]+\/commands\/[^/]+\.md$/,
    plugin: { re: /^plugins\/[^/]+$/, format: 'claude' },
  },
  {
    id: 'wshobson-commands', repo: 'wshobson/commands', publisher: { handle: 'wshobson-commands', name: 'wshobson/commands (imported)' }, licensing: 'root',
    prompt: /^tools\/[^/]+\.md$/, workflow: { re: /^workflows\/[^/]+\.md$/, format: 'command' },
  },
  {
    id: 'voltagent-subagents', repo: 'VoltAgent/awesome-claude-code-subagents', publisher: { handle: 'voltagent-subagents', name: 'VoltAgent subagents (imported)' }, licensing: 'root',
    agent: /^categories\/[^/]+\/(?!README)[^/]+\.md$/,
  },
  {
    id: 'claude-plugins', repo: 'anthropics/claude-plugins-official', publisher: { handle: 'claude-plugins', name: 'Claude Code plugin directory (imported)' }, licensing: 'root',
    skill: /^plugins\/[^/]+\/skills\/[^/]+$/, agent: /^plugins\/[^/]+\/agents\/[^/]+\.md$/, prompt: /^plugins\/[^/]+\/commands\/[^/]+\.md$/,
    plugin: { re: /^plugins\/[^/]+$/, format: 'claude' },
  },
  { id: 'openai-skills', repo: 'openai/skills', publisher: { handle: 'openai-skills', name: 'openai/skills (imported)' }, licensing: 'item', skill: /^skills\/\.(curated|system)\/[^/]+$/ },
  { id: 'anthropic-skills', repo: 'anthropics/skills', publisher: { handle: 'anthropic-skills', name: 'anthropics/skills (imported)' }, licensing: 'item', skill: /^skills\/[^/]+$/ },
  { id: 'superpowers', repo: 'obra/superpowers', publisher: { handle: 'superpowers', name: 'obra/superpowers (imported)' }, licensing: 'root', skill: /^skills\/[^/]+$/ },
  { id: 'scientific-skills', repo: 'K-Dense-AI/scientific-agent-skills', publisher: { handle: 'scientific-skills', name: 'K-Dense scientific skills (imported)' }, licensing: 'root', skill: /^skills\/[^/]+$/ },
  { id: 'cursorrules', repo: 'PatrickJS/awesome-cursorrules', publisher: { handle: 'cursorrules', name: 'awesome-cursorrules (imported)' }, licensing: 'root', instruction: /^rules\/[^/]+\.mdc$/ },
  { id: 'agentics', repo: 'githubnext/agentics', publisher: { handle: 'agentics', name: 'githubnext/agentics (imported)' }, licensing: 'root', workflow: { re: /^workflows\/[^/]+\.md$/, format: 'agentic' } },
  {
    // Extras from the repository awesome.ts already imports (same publisher): agentic workflows and plugins.
    id: 'awesome-copilot-extras', repo: 'github/awesome-copilot', publisher: { handle: 'awesome-copilot', name: 'Awesome Copilot (imported)' }, licensing: 'root',
    workflow: { re: /^workflows\/[^/]+\.md$/, format: 'agentic' }, plugin: { re: /^plugins\/[^/]+$/, format: 'copilot' },
  },
];

/** Shared collections: a repository's stars say nothing about one item inside it. */
export const COLLECTION_REPOS = SOURCES.map((s) => s.repo.toLowerCase());

/* ------------------------------------------------------------------------------------------------ */

export interface Source { repo: string; dir: string; sha: string; files: string[] }
export interface Lic { spdx: string; text: string }
type Tool = 'read' | 'edit' | 'search' | 'execute' | 'web';
export type Mapped = { skip: string } | { slug: string; kind: Kind; files: ArtifactFile[]; version?: string };

const exists = (p: string) => fs.access(p).then(() => true, () => false);

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  };
  await walk(root);
  return out.sort();
}

/** Use a checkout from `sourcesDir/<owner>_<name>` when present, else shallow-clone into a temp dir. */
export async function loadSource(repo: string, opts: { sourcesDir?: string; log?: (s: string) => void } = {}): Promise<Source> {
  let dir = opts.sourcesDir ? path.join(opts.sourcesDir, repo.replace('/', '_')) : '';
  if (!dir || !(await exists(dir))) {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), `aidev-${repo.replace('/', '-')}-`));
    opts.log?.(`  cloning ${repo}…`);
    execFileSync('git', ['clone', '--depth', '1', '-q', `https://github.com/${repo}`, dir], { stdio: 'ignore' });
  }
  const sha = (() => { try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } })();
  return { repo, dir, sha, files: await listFiles(dir) };
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/** The license governing `rel` (a file or directory): the nearest LICENSE file above it. Null = do not import. */
export async function licenseFor(src: Source, rel: string, licensing: 'root' | 'item', isDir: boolean): Promise<Lic | null> {
  let dir = isDir ? rel : path.posix.dirname(rel);
  for (;;) {
    if (dir === '.' || dir === '') {
      if (licensing === 'item') return null;
      dir = '';
    }
    const prefix = dir ? `${dir}/` : '';
    const f = src.files.find((x) => x.startsWith(prefix) && !x.slice(prefix.length).includes('/') && LICENSE_FILE.test(x.slice(prefix.length)));
    if (f) {
      const text = await fs.readFile(path.join(src.dir, f), 'utf8');
      const spdx = permissiveLicense(text);
      return spdx ? { spdx, text } : null; // the nearest license decides, even when it is restrictive
    }
    if (!dir) return null;
    dir = path.posix.dirname(dir);
  }
}

/* ------------------------------------------------------------------------------------------------ */

const ACRONYMS: Record<string, string> = {
  api: 'API', ui: 'UI', ux: 'UX', ai: 'AI', ml: 'ML', llm: 'LLM', mcp: 'MCP', sql: 'SQL', css: 'CSS', html: 'HTML', js: 'JS', ts: 'TS', ci: 'CI', cd: 'CD',
  aws: 'AWS', gcp: 'GCP', ios: 'iOS', qa: 'QA', seo: 'SEO', pr: 'PR', prs: 'PRs', tdd: 'TDD', sdk: 'SDK', cli: 'CLI', db: 'DB', php: 'PHP', dx: 'DX',
  devops: 'DevOps', graphql: 'GraphQL', typescript: 'TypeScript', javascript: 'JavaScript', nextjs: 'Next.js', nodejs: 'Node.js', k8s: 'K8s',
  github: 'GitHub', gitlab: 'GitLab', fastapi: 'FastAPI', iot: 'IoT', rest: 'REST', jwt: 'JWT', oauth: 'OAuth', lsp: 'LSP', md: 'MD', vscode: 'VS Code',
};
/** "python-pro" -> "Python Pro"; leaves real titles alone. */
export function humanize(s: string): string {
  const t = clean(s);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(t)) return t;
  return t.split(/[-_]+/).filter(Boolean).map((w) => ACRONYMS[w] ?? w[0].toUpperCase() + w.slice(1)).join(' ');
}

const TOOL_ORDER: Tool[] = ['read', 'edit', 'search', 'execute', 'web'];
/** Claude Code tool names -> neutral tools. No list means the agent inherits every tool. */
export function claudeTools(tools: unknown): Tool[] {
  const list = Array.isArray(tools) ? tools.map(String) : typeof tools === 'string' ? tools.split(',') : [];
  const names = list.map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return ['read', 'edit', 'search', 'execute'];
  const out = new Set<Tool>();
  for (const x of names) {
    if (/^(read|notebookread|ls)$/.test(x)) out.add('read');
    if (/^(glob|grep|ls|search)$/.test(x)) out.add('search');
    if (/^(edit|multiedit|write|notebookedit)$/.test(x)) out.add('edit');
    if (/^(bash|bashoutput|killshell|killbash|task)$/.test(x)) out.add('execute');
    if (/^(webfetch|websearch)$/.test(x)) out.add('web');
  }
  if (!out.size) out.add('read');
  return TOOL_ORDER.filter((t) => out.has(t));
}
const permsFor = (tools: Tool[]) => [...new Set(['read-files', ...(tools.includes('edit') ? ['write-files'] : []), ...(tools.includes('execute') ? ['run-commands'] : []), ...(tools.includes('web') ? ['network'] : [])])];

/** Agent descriptions often embed <example> dialogues; keep the summary only. */
const stripExamples = (s: string) => s.replace(/<example>[\s\S]*?<\/example>/gi, ' ').replace(/\\n/g, ' ');

/** YAML first; Cursor rules often have unquoted globs (`globs: **\/*`) that YAML rejects, so fall back to key: value lines. */
export function looseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const parsed = parseFrontmatter(text);
  if (Object.keys(parsed.data).length || !/^---\r?\n/.test(text)) return parsed;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return parsed;
  const data: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return { data, body: m[2] };
}

const link = (src: Source, rel: string) => `https://github.com/${src.repo}/blob/${src.sha}/${rel}`;
const notice = (src: Source, kind: string, rel: string, lic: Lic) =>
  `> Imported from [${src.repo}](${link(src, rel)}) (${lic.spdx}, commit \`${src.sha.slice(0, 7)}\`). This ${kind} was written by its upstream authors and has **not been reviewed** by AI Development Hub. See the bundled \`LICENSE\`.\n\n`;
const tagsFor = (kind: string, slug: string, extra: string[] = []) => [...new Set([kind, ...extra, ...slug.split('-').filter((w) => w.length > 2).slice(0, 4)])].slice(0, 8);
const common = (src: Source, sourceId: string, rel: string, lic: Lic) => ({
  version: '1.0.0', license: lic.spdx, author: src.repo, repository: link(src, rel), categories: [sourceId], compatibility: { copilot: true, claudeCode: true, codex: true },
});
const files = (manifest: object, readme: string, lic: Lic, extra: ArtifactFile[]): ArtifactFile[] => [
  { path: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' }, { path: 'README.md', content: readme }, { path: 'LICENSE', content: lic.text }, ...extra,
];
/** First prose paragraph of a markdown body (skips headings, notes in brackets, code). */
const firstParagraph = (body: string) => {
  const p = body.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !/^(#|\[|```|---|>|<|\||-\s|\*\s|\d+\.)/.test(x));
  return p ? clean(p).replace(/\s*[:;,]$/, '.') : ''; // "…invocations:" leads into a list; as a summary it should end the sentence
};
const headingOf = (body: string) => /^#\s+(.+)$/m.exec(body)?.[1];

/* ---- mappers ------------------------------------------------------------------------------------ */

export function mapClaudeAgent(src: Source, sourceId: string, rel: string, text: string, lic: Lic): Mapped {
  const { data, body } = parseFrontmatter(text);
  const stem = path.posix.basename(rel, '.md');
  const title = humanize(clean(data.name) || stem);
  const description = describe(stripExamples(String(data.description ?? '')), title);
  if (!description) return { skip: 'agent without description' };
  if (!body.trim()) return { skip: 'empty agent body' };
  const tools = claudeTools(data.tools);
  const model = typeof data.model === 'string' && /^(sonnet|opus|haiku)$/i.test(data.model.trim()) ? data.model.trim().toLowerCase() : undefined;
  const slug = slugify(stem);
  const { languages, frameworks } = detect(`${title} ${description}`);
  const manifest = {
    name: slug, type: 'agent', title, description, ...common(src, sourceId, rel, lic), tags: tagsFor('agent', slug, ['claude-code']),
    languages, frameworks, permissions: permsFor(tools), agent: { tools },
    ...(model ? { providers: { claude: { frontmatter: { model } } } } : {}),
  };
  return { slug, kind: 'agent', files: files(manifest, `# ${title}\n\n${notice(src, 'agent', rel, lic)}${description}\n`, lic, [{ path: 'agent.md', content: body.trim() + '\n' }]) };
}

/** A Claude Code slash command, as a prompt (user-invoked) or as an on-demand workflow. */
export function mapCommand(src: Source, sourceId: string, rel: string, text: string, lic: Lic, kind: 'prompt' | 'workflow'): Mapped {
  const { data, body } = parseFrontmatter(text);
  const stem = path.posix.basename(rel, '.md');
  const title = clean(headingOf(body)) || humanize(stem);
  const description = describe(String(data.description ?? '') || firstParagraph(body), title);
  if (!description) return { skip: `${kind} without description` };
  if (body.trim().length < 40) return { skip: `${kind} body too short` };
  const slug = slugify(stem);
  const allowed = clean(data['allowed-tools']);
  const claude = Object.fromEntries(Object.entries({ 'argument-hint': clean(data['argument-hint']) || undefined, 'allowed-tools': allowed || undefined }).filter(([, v]) => v));
  const permissions = kind === 'workflow' ? ['read-files', 'write-files', 'run-commands'] : allowed ? permsFor(claudeTools(allowed.replace(/\([^)]*\)/g, ''))) : [];
  const { languages, frameworks } = detect(`${title} ${description}`);
  const manifest = {
    name: slug, type: kind, title, description, ...common(src, sourceId, rel, lic), tags: tagsFor(kind, slug, kind === 'prompt' ? ['slash-command'] : ['multi-agent']),
    languages, frameworks, permissions,
    ...(Object.keys(claude).length ? { providers: { claude: { frontmatter: claude } } } : {}),
  };
  const usage = body.includes('$ARGUMENTS') ? `\nPass what you want it to work on as the argument (it fills in \`$ARGUMENTS\`).\n` : '';
  return { slug, kind, files: files(manifest, `# ${title}\n\n${notice(src, kind, rel, lic)}${description}\n${usage}`, lic, [{ path: kind === 'prompt' ? 'prompt.md' : 'workflow.md', content: body.trim() + '\n' }]) };
}

/** Plain-words summary of a GitHub Agentic Workflow trigger (`on:`). */
function triggerOf(on: unknown): string {
  if (typeof on === 'string') return on;
  if (!on || typeof on !== 'object') return 'manual runs';
  return Object.entries(on as Record<string, unknown>).map(([k, v]) => (k === 'schedule' && typeof v === 'string' ? `schedule (${v})` : k.replace(/_/g, ' '))).join(', ');
}

/** A GitHub Agentic Workflow, installed as on-demand instructions. The README says how it runs upstream. */
export function mapAgenticWorkflow(src: Source, sourceId: string, rel: string, text: string, lic: Lic): Mapped {
  const { data, body } = parseFrontmatter(text);
  if (!Object.keys(data).length || !('on' in data)) return { skip: 'not an agentic workflow' };
  const stem = path.posix.basename(rel, '.md');
  const title = clean(data.name) || humanize(stem);
  const description = describe(String(data.description ?? '') || firstParagraph(body), title);
  if (!description) return { skip: 'workflow without description' };
  if (body.trim().length < 40) return { skip: 'workflow body too short' };
  const slug = slugify(stem);
  const { languages, frameworks } = detect(`${title} ${description}`);
  const manifest = {
    name: slug, type: 'workflow', title, description, ...common(src, sourceId, rel, lic), tags: tagsFor('workflow', slug, ['agentic-workflow', 'github']),
    languages, frameworks, permissions: ['read-files', 'network'],
  };
  const how = `Upstream this is a GitHub Agentic Workflow that runs on: ${triggerOf(data.on)}. aidevkit installs its instructions so your coding agent can run it on demand. To run it automatically in GitHub Actions, use the [original file](${link(src, rel)}) with \`gh aw\`.\n`;
  return { slug, kind: 'workflow', files: files(manifest, `# ${title}\n\n${notice(src, 'workflow', rel, lic)}${description}\n\n${how}`, lic, [{ path: 'workflow.md', content: body.trim() + '\n' }]) };
}

/** A Cursor rule (.mdc) as a project instruction; its globs become Copilot's applyTo. */
export function mapCursorRule(src: Source, sourceId: string, rel: string, text: string, lic: Lic): Mapped {
  const { data, body } = looseFrontmatter(text);
  const stem = path.posix.basename(rel, '.mdc').replace(/-cursorrules(-prompt-file)?$/, '').replace(/-prompt-file$/, '');
  const title = humanize(stem);
  const description = describe(String(data.description ?? '') || `Coding rules for ${title} projects.`, title);
  if (!description) return { skip: 'instruction without description' };
  if (body.trim().length < 40) return { skip: 'instruction body too short' };
  const globs = Array.isArray(data.globs) ? data.globs.map(String).join(',') : clean(data.globs);
  const applyTo = globs && !['*', '**', '**/*'].includes(globs) ? globs : undefined;
  const slug = slugify(stem);
  const { languages, frameworks } = detect(`${title} ${description} ${body.slice(0, 600)}`);
  const manifest = {
    name: slug, type: 'instruction', title, description, ...common(src, sourceId, rel, lic), tags: tagsFor('instructions', slug, ['cursor-rules']),
    languages, frameworks, permissions: [],
    ...(applyTo ? { providers: { copilot: { frontmatter: { applyTo } } } } : {}),
  };
  const scoped = applyTo ? `_Applies to files matching \`${applyTo}\`._\n\n` : '';
  return { slug, kind: 'instruction', files: files(manifest, `# ${title}\n\n${notice(src, 'instruction', rel, lic)}${description}\n`, lic, [{ path: 'instruction.md', content: scoped + body.trim() + '\n' }]) };
}

const MAX_SKILL_BYTES = 1_500_000;
export async function mapSkillDir(src: Source, sourceId: string, rel: string, lic: Lic): Promise<Mapped> {
  const inside = src.files.filter((f) => f.startsWith(`${rel}/`)).map((f) => f.slice(rel.length + 1));
  if (!inside.includes('SKILL.md')) return { skip: 'no SKILL.md' };
  if (inside.length > 150) return { skip: 'skill has more than 150 files' };
  let total = 0;
  for (const f of inside) total += (await fs.stat(path.join(src.dir, rel, f))).size;
  if (total > MAX_SKILL_BYTES) return { skip: 'skill larger than 1.5 MB' };
  const out: ArtifactFile[] = [];
  let omitted = 0;
  for (const f of inside) {
    if (LICENSE_FILE.test(f) || ['manifest.json', 'README.md', 'readme.md'].includes(f)) continue; // the governing license is bundled as LICENSE
    const buf = await fs.readFile(path.join(src.dir, rel, f));
    if (buf.includes(0)) { omitted++; continue; } // binary assets are not supported yet
    out.push({ path: f, content: buf.toString('utf8') });
  }
  const skill = out.find((f) => f.path === 'SKILL.md')!;
  const { data } = parseFrontmatter(skill.content);
  const dirName = path.posix.basename(rel);
  const title = humanize(clean(data.name) || dirName);
  const description = describe(String(data.description ?? ''), title);
  if (!description) return { skip: 'skill without description' };
  const slug = slugify(dirName);
  const hasScripts = out.some((f) => f.path.startsWith('scripts/'));
  const { languages, frameworks } = detect(`${title} ${description}`);
  const manifest = {
    name: slug, type: 'skill', title, description, ...common(src, sourceId, rel, lic), tags: tagsFor('skill', slug), languages, frameworks,
    permissions: hasScripts ? ['read-files', 'run-commands'] : ['read-files'],
  };
  const extraNote = omitted ? `\n\n_${omitted} binary file(s) from the upstream skill were not imported._` : '';
  return { slug, kind: 'skill', files: files(manifest, `# ${title}\n\n${notice(src, 'skill', rel, lic)}${description}${extraNote}\n`, lic, out) };
}

/* ---- import ------------------------------------------------------------------------------------- */

const contentHash = (fs_: ArtifactFile[]) => createHash('sha256').update(fs_.filter((f) => !['manifest.json', 'README.md', 'LICENSE'].includes(f.path)).map((f) => `${f.path}\n${f.content}`).sort().join('\0')).digest('hex');

/** First free slug, or the one this exact upstream item already owns. */
async function pickSlug(imp: Importer, cands: string[], url: string): Promise<string | null> {
  for (const cand of cands) {
    const row = (await imp.ctx.db.query<{ repository: string | null }>('SELECT repository FROM artifacts WHERE owner_slug=$1 AND slug=$2', [imp.publisher.handle, cand])).rows[0];
    if (!row || sameSource(row.repository, url)) return cand;
  }
  return null;
}

function renamed(fs_: ArtifactFile[], slug: string): ArtifactFile[] {
  return fs_.map((f) => {
    if (f.path === 'manifest.json') return { ...f, content: JSON.stringify({ ...JSON.parse(f.content), name: slug }, null, 2) + '\n' };
    if (f.path === 'SKILL.md') return { ...f, content: f.content.replace(/^(---\r?\n[\s\S]*?\bname:\s*).*$/m, `$1${slug}`) };
    return f;
  });
}

export interface CollectionResult { stats: Importer['stats']; byKind: Record<Kind, number>; report: (label: string) => string }

export async function importCollection(ctx: Ctx, source: CollectionSource, opts: { sourcesDir?: string; src?: Source; limit?: number; log?: (s: string) => void } = {}): Promise<CollectionResult> {
  const log = opts.log ?? (() => {});
  const src = opts.src ?? (await loadSource(source.repo, { sourcesDir: opts.sourcesDir, log }));
  const publisher = await ensurePublisher(ctx, source.publisher.handle, source.publisher.name);
  const imp = makeImporter(ctx, publisher);
  const owner = publisher.handle;
  const byKind: Record<Kind, number> = { skill: 0, agent: 0, prompt: 0, workflow: 0, instruction: 0, plugin: 0 };
  const refByRel = new Map<string, { ref: string; kind: Kind; perms: string[] }>(); // component path -> published listing
  const refByHash = new Map<string, { ref: string; kind: Kind; perms: string[] }>(); // identical copies share one listing

  type Job = { rel: string; kind: Exclude<Kind, 'plugin'>; isDir: boolean; map: (lic: Lic) => Promise<Mapped> };
  const jobs: Job[] = [];
  const read = (rel: string) => fs.readFile(path.join(src.dir, rel), 'utf8');
  if (source.skill) {
    const dirs = [...new Set(src.files.filter((f) => f.endsWith('/SKILL.md')).map((f) => f.slice(0, -'/SKILL.md'.length)))].filter((d) => source.skill!.test(d));
    for (const d of dirs) jobs.push({ rel: d, kind: 'skill', isDir: true, map: (lic) => mapSkillDir(src, source.id, d, lic) });
  }
  for (const f of src.files) {
    if (source.agent?.test(f)) jobs.push({ rel: f, kind: 'agent', isDir: false, map: async (lic) => mapClaudeAgent(src, source.id, f, await read(f), lic) });
    else if (source.prompt?.test(f)) jobs.push({ rel: f, kind: 'prompt', isDir: false, map: async (lic) => mapCommand(src, source.id, f, await read(f), lic, 'prompt') });
    else if (source.workflow?.re.test(f)) {
      const fmt = source.workflow.format;
      jobs.push({ rel: f, kind: 'workflow', isDir: false, map: async (lic) => (fmt === 'agentic' ? mapAgenticWorkflow(src, source.id, f, await read(f), lic) : mapCommand(src, source.id, f, await read(f), lic, 'workflow')) });
    } else if (source.instruction?.test(f)) jobs.push({ rel: f, kind: 'instruction', isDir: false, map: async (lic) => mapCursorRule(src, source.id, f, await read(f), lic) });
  }
  const limited = opts.limit ? jobs.slice(0, opts.limit) : jobs;
  log(`  ${limited.length} items found`);

  let i = 0;
  for (const job of limited) {
    if (++i % 100 === 0) log(`  ${i}/${limited.length}…`);
    const lic = await licenseFor(src, job.rel, source.licensing, job.isDir);
    if (!lic) { imp.stats.skip('no permissive license'); continue; }
    const m = await job.map(lic).catch((e) => ({ skip: `error: ${String(e?.message ?? e).slice(0, 60)}` }));
    if ('skip' in m) { imp.stats.skip(m.skip); continue; }
    const perms = (JSON.parse(m.files[0].content).permissions ?? []) as string[];
    const hash = `${m.kind}:${contentHash(m.files)}`;
    const dup = refByHash.get(hash);
    if (dup) { refByRel.set(job.rel, dup); imp.stats.skip('identical copy (shared with another plugin)'); continue; }
    const url = link(src, job.rel);
    const plugin = /^plugins\/([^/]+)\//.exec(job.rel)?.[1];
    const cands = [m.slug, plugin ? slugify(`${m.slug}-${plugin}`) : '', slugify(`${m.slug}-${m.kind}`)].filter(Boolean);
    const slug = await pickSlug(imp, cands, url);
    if (!slug) { imp.stats.skip('slug collision'); continue; }
    const r = await publishImported(imp, renamed(m.files, slug), { owner, slug, version: m.version ?? '1.0.0', bump: true });
    if (r === 'rejected') continue;
    const entry = { ref: `${owner}/${slug}`, kind: m.kind, perms };
    refByRel.set(job.rel, entry);
    refByHash.set(hash, entry);
    byKind[m.kind]++;
  }

  if (source.plugin) {
    const roots = source.plugin.format === 'claude'
      ? [...new Set(src.files.filter((f) => f.endsWith('/.claude-plugin/plugin.json')).map((f) => f.slice(0, -'/.claude-plugin/plugin.json'.length)))]
      : [...new Set(src.files.filter((f) => f.endsWith('/plugin.json')).map((f) => path.posix.dirname(f)))];
    for (const root of roots.filter((r) => source.plugin!.re.test(r))) {
      const lic = await licenseFor(src, root, source.licensing, true);
      if (!lic) { imp.stats.skip('plugin: no permissive license'); continue; }
      const pj = JSON.parse(await read(source.plugin.format === 'claude' ? `${root}/.claude-plugin/plugin.json` : `${root}/plugin.json`).catch(() => '{}'));
      const deps = source.plugin.format === 'claude'
        ? [...refByRel.entries()].filter(([rel]) => rel.startsWith(`${root}/`)).map(([, v]) => v)
        : await copilotPluginDeps(imp, pj);
      const m = mapPlugin(src, source.id, root, pj, deps, lic, src.files.filter((f) => f.startsWith(`${root}/`)));
      if ('skip' in m) { imp.stats.skip(m.skip); continue; }
      const slug = await pickSlug(imp, [m.slug, slugify(`${m.slug}-plugin`)], link(src, root));
      if (!slug) { imp.stats.skip('slug collision'); continue; }
      const r = await publishImported(imp, renamed(m.files, slug), { owner, slug, version: m.version ?? '1.0.0', bump: true });
      if (r !== 'rejected') byKind.plugin++;
    }
  }

  return {
    stats: imp.stats, byKind,
    report: (label: string) => `${imp.stats.report(label)}\n    by type: ${Object.entries(byKind).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ') || 'none'}`,
  };
}

/** awesome-copilot plugin.json lists repo paths ("./agents/x.md", "./skills/y/"); resolve them to the listings awesome.ts imported. */
async function copilotPluginDeps(imp: Importer, pj: any): Promise<{ ref: string; kind: Kind; perms: string[] }[]> {
  const ext = pj?.extensions?.['com.github.awesome-copilot'] ?? pj ?? {};
  const out: { ref: string; kind: Kind; perms: string[] }[] = [];
  const want: [string, Kind][] = [['agents', 'agent'], ['skills', 'skill'], ['instructions', 'instruction'], ['prompts', 'prompt']];
  for (const [key, kind] of want) {
    for (const p of Array.isArray(ext[key]) ? ext[key] : []) {
      const stem = path.posix.basename(String(p).replace(/\/+$/, '')).replace(/\.(agent|instructions|prompt)\.md$|\.md$/, '');
      const slug = slugify(stem);
      for (const cand of [slug, `${slug}-${kind}`]) {
        const row = (await imp.ctx.db.query<{ manifest: any }>('SELECT v.manifest FROM artifacts a JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.latest_version WHERE a.owner_slug=$1 AND a.slug=$2 AND a.type=$3', ['awesome-copilot', cand, kind])).rows[0];
        if (row) { out.push({ ref: `awesome-copilot/${cand}`, kind, perms: row.manifest?.permissions ?? [] }); break; }
      }
    }
  }
  return out;
}

export function mapPlugin(src: Source, sourceId: string, root: string, pj: any, deps: { ref: string; kind: Kind; perms: string[] }[], lic: Lic, pluginFiles: string[]): Mapped {
  const dirName = path.posix.basename(root);
  const title = humanize(clean(pj?.name) || dirName);
  const description = describe(String(pj?.description ?? ''), title);
  if (!description) return { skip: 'plugin without description' };
  const unique = [...new Map(deps.map((d) => [d.ref, d])).values()];
  if (!unique.length) return { skip: 'plugin without installable parts (hooks, LSP or MCP only)' };
  const of = (k: Kind) => unique.filter((d) => d.kind === k).map((d) => d.ref);
  const dependencies = { agents: of('agent'), skills: of('skill'), prompts: of('prompt'), instructions: of('instruction'), mcps: [] as string[] };
  const slug = slugify(clean(pj?.name) || dirName);
  const keywords = Array.isArray(pj?.keywords) ? pj.keywords.map((k: unknown) => slugify(String(k))).filter(Boolean).slice(0, 4) : [];
  const { languages, frameworks } = detect(`${title} ${description}`);
  const manifest = {
    name: slug, type: 'plugin', title, description, ...common(src, sourceId, root, lic), version: normalizeVersion(pj?.version) ?? '1.0.0',
    tags: tagsFor('plugin', slug, keywords), languages, frameworks, permissions: [...new Set(unique.flatMap((d) => d.perms))], dependencies,
  };
  const rel = (f: string) => f.slice(root.length + 1);
  const leftOut = [
    pluginFiles.some((f) => rel(f).startsWith('hooks/')) ? 'hooks' : '',
    pluginFiles.some((f) => /^\.mcp\.json$/.test(rel(f))) ? 'MCP server config' : '',
    pluginFiles.some((f) => /^\.lsp\.json$/.test(rel(f))) ? 'language-server config' : '',
  ].filter(Boolean);
  const list = (label: string, refs: string[]) => (refs.length ? `- ${refs.length} ${refs.length === 1 ? label : `${label}s`}: ${refs.map((r) => `\`${r}\``).join(', ')}\n` : '');
  const readme = `# ${title}\n\n${notice(src, 'plugin', root, lic)}${description}\n\nInstalling this plugin installs:\n\n${list('agent', dependencies.agents)}${list('skill', dependencies.skills)}${list('prompt', dependencies.prompts)}${list('instruction', dependencies.instructions)}${leftOut.length ? `\nNot included: the plugin's ${leftOut.join(' and ')}, which aidevkit can't translate across tools yet.\n` : ''}`;
  return { slug, kind: 'plugin', version: manifest.version, files: files(manifest, readme, lic, []) };
}

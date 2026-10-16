import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter, type ArtifactFile } from '@aidev/artifact-schema';
import type { Ctx } from '../context.js';
import { clean, describe, detect, ensurePublisher, makeImporter, publishImported, slugify, type Importer } from './common.js';

/**
 * Source: github/awesome-copilot (MIT). Agents, instructions and skills are imported with attribution:
 * each artifact carries the upstream LICENSE, a link pinned to the imported commit, and a README notice.
 * Copilot-native frontmatter is preserved verbatim for Copilot via `providers.copilot.frontmatter`;
 * a neutral approximation is derived for Claude Code / Codex.
 */
export const REPO = 'github/awesome-copilot';
export const PUBLISHER = { handle: 'awesome-copilot', name: 'Awesome Copilot (imported)' };

export interface Source { dir: string; sha: string; license: string }

export async function cloneSource(log: (s: string) => void): Promise<Source> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'awesome-copilot-'));
  log(`  cloning ${REPO}…`);
  execFileSync('git', ['clone', '--depth', '1', '-q', `https://github.com/${REPO}`, dir], { stdio: 'ignore' });
  return readSource(dir);
}
export async function readSource(dir: string): Promise<Source> {
  const sha = (() => { try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD']).toString().trim(); } catch { return 'unknown'; } })();
  return { dir, sha, license: await fs.readFile(path.join(dir, 'LICENSE'), 'utf8') };
}

const link = (src: Source, rel: string) => `https://github.com/${REPO}/blob/${src.sha}/${rel}`;
const notice = (kind: string, rel: string, src: Source) =>
  `> Imported from [${REPO}](${link(src, rel)}) (MIT, commit \`${src.sha.slice(0, 7)}\`). This ${kind} was written by its upstream contributors and has **not been reviewed** by AI Development Hub. See the bundled \`LICENSE\`.\n\n`;

/** Copilot tool names -> neutral tool set used for Claude/Codex approximations. */
export function neutralTools(tools: unknown): ('read' | 'edit' | 'search' | 'execute' | 'web')[] {
  if (!Array.isArray(tools)) return ['read', 'search', 'edit', 'execute']; // Copilot default: all tools enabled
  const t = tools.map(String).join(' ').toLowerCase();
  const out: ('read' | 'edit' | 'search' | 'execute' | 'web')[] = ['read'];
  if (/edit|write|new\b|changes/.test(t)) out.push('edit');
  if (/search|codebase|usages|grep|findtestfiles/.test(t)) out.push('search');
  if (/run|execute|terminal|task|shell|bash/.test(t)) out.push('execute');
  if (/fetch|web|browser/.test(t)) out.push('web');
  return out;
}
const permsFor = (tools: string[]) => [...new Set(['read-files', ...(tools.includes('edit') ? ['write-files'] : []), ...(tools.includes('execute') ? ['run-commands'] : []), ...(tools.includes('web') ? ['network'] : [])])];

const FM_DROP = new Set(['name', 'description']);
const common = (rel: string, src: Source, extra: Record<string, unknown>) => ({
  version: '1.0.0', license: 'MIT', author: REPO, repository: link(src, rel), categories: ['awesome-copilot'], compatibility: { copilot: true, claudeCode: true, codex: true }, ...extra,
});
const baseFiles = (manifest: object, readme: string, src: Source): ArtifactFile[] => [
  { path: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' }, { path: 'README.md', content: readme }, { path: 'LICENSE', content: src.license },
];

export function mapAgent(file: string, text: string, src: Source) {
  const rel = `agents/${file}`;
  const { data, body } = parseFrontmatter(text);
  const title = clean(data.name) || file.replace(/\.agent\.md$/, '');
  const description = describe(String(data.description ?? ''), title);
  if (!description) return { skip: 'agent without description' };
  if (!body.trim()) return { skip: 'empty agent body' };
  const tools = neutralTools(data.tools);
  const override = Object.fromEntries(Object.entries(data).filter(([k]) => !FM_DROP.has(k)));
  const { languages, frameworks } = detect(`${title} ${description}`);
  const slug = slugify(file.replace(/\.agent\.md$/, ''));
  const manifest = {
    name: slug, type: 'agent', title, description, ...common(rel, src, {}), tags: ['agent', 'github-copilot', ...slug.split('-').filter((w) => w.length > 2).slice(0, 4)],
    languages, frameworks, permissions: permsFor(tools), agent: { tools },
    ...(Object.keys(override).length ? { providers: { copilot: { frontmatter: override } } } : {}),
  };
  return { slug, kind: 'agent' as const, files: [...baseFiles(manifest, `# ${title}\n\n${notice('agent', rel, src)}${description}\n`, src), { path: 'agent.md', content: body.trim() + '\n' }] };
}

export function mapInstruction(file: string, text: string, src: Source) {
  const rel = `instructions/${file}`;
  const { data, body } = parseFrontmatter(text);
  const stem = file.replace(/\.instructions\.md$/, '');
  const title = clean(data.title) || clean(data.name) || stem.replace(/[-_]+/g, ' ');
  const description = describe(String(data.description ?? ''), title);
  if (!description) return { skip: 'instruction without description' };
  if (!body.trim()) return { skip: 'empty instruction body' };
  const applyTo = data.applyTo == null ? undefined : String(data.applyTo);
  const scoped = applyTo && applyTo !== '**' && applyTo !== '**/*' ? `_Applies to files matching \`${applyTo}\`._\n\n` : '';
  const { languages, frameworks } = detect(`${title} ${description} ${applyTo ?? ''}`);
  const slug = slugify(stem);
  const manifest = {
    name: slug, type: 'instruction', title, description, ...common(rel, src, {}), tags: ['instructions', 'github-copilot', ...slug.split('-').filter((w) => w.length > 2).slice(0, 4)],
    languages, frameworks, permissions: [],
    ...(applyTo ? { providers: { copilot: { frontmatter: { applyTo } } } } : {}),
  };
  return { slug, kind: 'instruction' as const, files: [...baseFiles(manifest, `# ${title}\n\n${notice('instruction', rel, src)}${description}\n${applyTo ? `\nScope: \`${applyTo}\`\n` : ''}`, src), { path: 'instruction.md', content: scoped + body.trim() + '\n' }] };
}

const MAX_SKILL_BYTES = 1_500_000;
async function walk(dir: string, base = dir): Promise<{ rel: string; abs: string; size: number }[]> {
  const out: { rel: string; abs: string; size: number }[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...(await walk(abs, base)));
    else out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs, size: (await fs.stat(abs)).size });
  }
  return out;
}

export async function mapSkill(dirName: string, src: Source) {
  const root = path.join(src.dir, 'skills', dirName);
  const rel = `skills/${dirName}`;
  const all = await walk(root);
  const skillMd = all.find((f) => f.rel === 'SKILL.md');
  if (!skillMd) return { skip: 'no SKILL.md' };
  if (all.reduce((n, f) => n + f.size, 0) > MAX_SKILL_BYTES) return { skip: 'skill larger than 1.5 MB' };
  const files: ArtifactFile[] = [];
  let omitted = 0;
  for (const f of all) {
    const buf = await fs.readFile(f.abs);
    if (buf.includes(0)) { omitted++; continue; } // binary assets are not supported yet
    files.push({ path: f.rel, content: buf.toString('utf8') });
  }
  const { data } = parseFrontmatter(files.find((f) => f.path === 'SKILL.md')!.content);
  const title = clean(data.name) || dirName;
  const description = describe(String(data.description ?? ''), title);
  if (!description) return { skip: 'skill without description' };
  if (files.length > 150) return { skip: 'skill has more than 150 files' };
  const slug = slugify(dirName);
  const hasScripts = files.some((f) => f.path.startsWith('scripts/'));
  const { languages, frameworks } = detect(`${title} ${description}`);
  // The skill's own license (if any) is respected as declared by its author.
  const lic = clean(data.license);
  const manifest = {
    name: slug, type: 'skill', title, description, ...common(rel, src, lic && lic.length < 40 ? { license: lic } : {}),
    tags: ['skill', ...slug.split('-').filter((w) => w.length > 2).slice(0, 5)], languages, frameworks,
    permissions: hasScripts ? ['read-files', 'run-commands'] : ['read-files'],
  };
  const extraNote = omitted ? `\n\n_${omitted} binary file(s) from the upstream skill were not imported._` : '';
  return {
    slug, kind: 'skill' as const,
    files: [...baseFiles(manifest, `# ${title}\n\n${notice('skill', rel, src)}${description}${extraNote}\n`, src), ...files.filter((f) => !['manifest.json', 'README.md', 'readme.md', 'LICENSE'].includes(f.path))],
  };
}

type Mapped = { skip: string } | { slug: string; kind: 'agent' | 'instruction' | 'skill'; files: ArtifactFile[] };

/** Slug collisions across kinds (an agent and a skill both called "accessibility") get a kind suffix. */
async function pickSlug(imp: Importer, slug: string, kind: string, repoUrl: string) {
  for (const cand of [slug, `${slug}-${kind}`]) {
    const row = (await imp.ctx.db.query<{ repository: string | null }>('SELECT repository FROM artifacts WHERE owner_slug=$1 AND slug=$2', [imp.publisher.handle, cand])).rows[0];
    if (!row || row.repository === repoUrl) return cand;
  }
  return null;
}

export async function importAwesome(ctx: Ctx, opts: { src: Source; limit?: number; log?: (s: string) => void }) {
  const log = opts.log ?? (() => {});
  const publisher = await ensurePublisher(ctx, PUBLISHER.handle, PUBLISHER.name);
  const imp = makeImporter(ctx, publisher);
  const { src } = opts;
  const list = async (d: string, ext?: string) => (await fs.readdir(path.join(src.dir, d)).catch(() => [] as string[])).filter((f) => !ext || f.endsWith(ext)).sort();
  const jobs: { rel: string; map: () => Promise<Mapped> }[] = [];
  for (const d of await list('skills')) if ((await fs.stat(path.join(src.dir, 'skills', d))).isDirectory()) jobs.push({ rel: `skills/${d}`, map: () => mapSkill(d, src) });
  for (const f of await list('agents', '.agent.md')) jobs.push({ rel: `agents/${f}`, map: async () => mapAgent(f, await fs.readFile(path.join(src.dir, 'agents', f), 'utf8'), src) });
  for (const f of await list('instructions', '.instructions.md')) jobs.push({ rel: `instructions/${f}`, map: async () => mapInstruction(f, await fs.readFile(path.join(src.dir, 'instructions', f), 'utf8'), src) });
  let i = 0;
  for (const job of opts.limit ? jobs.slice(0, opts.limit) : jobs) {
    if (++i % 100 === 0) log(`  ${i}/${jobs.length}…`);
    const m = await job.map().catch((e) => ({ skip: `error: ${String(e.message).slice(0, 60)}` }));
    if ('skip' in m) { imp.stats.skip(m.skip); continue; }
    const url = link(src, job.rel);
    const slug = await pickSlug(imp, m.slug, m.kind, url);
    if (!slug) { imp.stats.skip('slug collision'); continue; }
    const files = m.files.map((f) => (f.path === 'manifest.json' ? { ...f, content: JSON.stringify({ ...JSON.parse(f.content), name: slug, repository: url }, null, 2) + '\n' } : f));
    // SKILL.md must carry the (possibly suffixed) artifact name
    const fixed = files.map((f) => (f.path === 'SKILL.md' && slug !== m.slug ? { ...f, content: f.content.replace(/^(---\r?\n[\s\S]*?\bname:\s*).*$/m, `$1${slug}`) } : f));
    await publishImported(imp, fixed, { owner: publisher.handle, slug, version: '1.0.0', bump: true });
  }
  return imp.stats;
}

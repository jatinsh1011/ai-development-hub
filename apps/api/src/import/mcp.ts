import type { ArtifactFile } from '@aidev/artifact-schema';
import { clean, describe, detect, ensurePublisher, makeImporter, normalizeVersion, publishImported, slugify } from './common.js';
import type { Ctx } from '../context.js';

/**
 * Source: the official MCP Registry (https://registry.modelcontextprotocol.io), public API, no auth.
 * Each entry is mapped to ONE connection we can express faithfully (a remote URL or a stdio package);
 * entries needing user-supplied arguments, templated URLs or required headers are skipped, never guessed.
 */
export const REGISTRY = 'https://registry.modelcontextprotocol.io';
export const PUBLISHER = { handle: 'mcp-registry', name: 'MCP Registry (imported)' };

interface EnvVar { name: string; description?: string; isRequired?: boolean; isSecret?: boolean }
interface Arg { type: 'positional' | 'named'; name?: string; value?: string; isRequired?: boolean }
export interface RegistryEntry {
  server: {
    name: string; title?: string; description?: string; version?: string; websiteUrl?: string;
    repository?: { url?: string };
    packages?: { registryType: string; identifier: string; version?: string; runtimeHint?: string; transport?: { type: string }; environmentVariables?: EnvVar[]; packageArguments?: Arg[] }[];
    remotes?: { type: string; url: string; headers?: { name: string; value?: string; isRequired?: boolean }[] }[];
  };
  _meta?: Record<string, { status?: string }>;
}

/** reverse-DNS registry name -> stable slug: `io.github.acme/foo-mcp` -> `acme-foo-mcp`, `com.stripe/mcp` -> `stripe-mcp`. */
export function slugForName(name: string): string {
  const [ns, server = ''] = name.split('/');
  const parts = ns.split('.');
  const rest = ns.startsWith('io.github.') ? parts.slice(2).join('-') : parts.slice(1).join('-');
  const s = slugify(server), r = slugify(rest);
  return slugify(!r || s.startsWith(r) ? s : `${r}-${s}`);
}

type Conn = { mcp: Record<string, unknown>; summary: string; env: EnvVar[]; kind: string };

function remoteConn(e: RegistryEntry['server']): Conn | string {
  const rs = (e.remotes ?? []).filter((r) => r.type === 'streamable-http');
  if (!rs.length) return 'no streamable-http remote';
  for (const r of rs) {
    if (/[{}]/.test(r.url)) continue;
    const headers: Record<string, string> = {};
    let ok = true;
    for (const h of r.headers ?? []) {
      if (h.value && !/[{}]/.test(h.value)) headers[h.name] = h.value;
      else if (h.isRequired) ok = false;
    }
    if (!ok) continue;
    return { mcp: { transport: 'http', url: r.url, args: [], env: {}, headers }, summary: `Remote (streamable HTTP): \`${r.url}\``, env: [], kind: 'remote' };
  }
  return 'remote needs templated URL or required headers';
}

function packageConn(e: RegistryEntry['server']): Conn | string {
  let why = 'no package';
  for (const p of e.packages ?? []) {
    if (p.transport?.type !== 'stdio') { why = `package transport ${p.transport?.type ?? 'unknown'}`; continue; }
    const extra: string[] = [];
    let ok = true;
    for (const a of p.packageArguments ?? []) {
      if (a.value && !/[{}]/.test(a.value)) { if (a.type === 'named' && a.name) extra.push(a.name); extra.push(a.value); }
      else if (a.isRequired) ok = false;
    }
    if (!ok) { why = 'package needs user-supplied arguments'; continue; }
    const env = p.environmentVariables ?? [];
    let command: string, args: string[];
    if (p.registryType === 'npm') { command = 'npx'; args = ['-y', p.version ? `${p.identifier}@${p.version}` : p.identifier, ...extra]; }
    else if (p.registryType === 'pypi') { command = 'uvx'; args = [p.version ? `${p.identifier}@${p.version}` : p.identifier, ...extra]; }
    else if (p.registryType === 'oci') { command = 'docker'; args = ['run', '-i', '--rm', ...env.flatMap((v) => ['-e', v.name]), p.identifier, ...extra]; }
    else { why = `unsupported package type ${p.registryType}`; continue; }
    return {
      mcp: { transport: 'stdio', command, args, env: Object.fromEntries(env.map((v) => [v.name, { description: clean(v.description) || undefined, required: v.isRequired ?? false, secret: v.isSecret ?? true }])) },
      summary: `Local (${p.registryType}): \`${[command, ...args].join(' ')}\``, env, kind: p.registryType,
    };
  }
  return why;
}

export function mapEntry(entry: RegistryEntry): { slug: string; version: string; files: ArtifactFile[]; tags: string[] } | { skip: string } {
  const s = entry.server;
  if (entry._meta && Object.values(entry._meta)[0]?.status && Object.values(entry._meta)[0].status !== 'active') return { skip: 'not active' };
  const version = normalizeVersion(s.version);
  if (!version) return { skip: 'non-semver version' };
  const title = clean(s.title) || s.name.split('/')[1] || s.name;
  const description = describe(s.description ?? '', title);
  if (!description) return { skip: 'description too short' };
  const remote = remoteConn(s);
  const conn = typeof remote !== 'string' ? remote : packageConn(s);
  if (typeof conn === 'string') return { skip: `no usable connection (${typeof remote === 'string' ? remote : ''}; ${conn})`.replace('; no package', '') };

  const slug = slugForName(s.name);
  if (slug.length < 2) return { skip: 'unusable name' };
  const { languages, frameworks } = detect(`${s.name} ${title} ${description}`);
  const words = s.name.split(/[./_-]+/).filter((w) => w.length > 2 && !['com', 'org', 'dev', 'mcp', 'server', 'the', 'github', 'www'].includes(w));
  const tags = [...new Set(['mcp', conn.kind === 'remote' ? 'remote' : 'local', ...words])].slice(0, 8);
  const permissions = conn.kind === 'remote' ? ['network'] : ['network', ...(conn.env.length ? ['env-vars'] : [])];
  const [ns] = s.name.split('/');

  const manifest = {
    name: slug, type: 'mcp', version, title, description, author: ns, license: 'NOASSERTION',
    repository: s.repository?.url, homepage: s.websiteUrl, tags, categories: ['mcp-registry'], languages, frameworks,
    compatibility: { copilot: true, claudeCode: true, codex: true }, permissions, mcp: conn.mcp,
  };
  const readme = [
    `# ${title}`, '',
    `> Imported from the official [MCP Registry](${REGISTRY}) as \`${s.name}\`. The listing is supplied by the server's publisher and has **not been reviewed** by AI Development Hub. Check the source before you trust it with credentials.`, '',
    description, '', '## Connection', '', `- ${conn.summary}`,
    ...(conn.env.length ? ['', '## Environment variables', '', 'Export these in your shell before launching your AI tool (values are never written to config files).', '', '| Variable | Required | Secret | Description |', '|---|---|---|---|', ...conn.env.map((v) => `| \`${v.name}\` | ${v.isRequired ? 'yes' : 'no'} | ${v.isSecret === false ? 'no' : 'yes'} | ${clean(v.description).replace(/\|/g, '\\|')} |`)] : []),
    '', '## Source', '', `- Registry name: \`${s.name}\` (v${s.version})`, ...(s.repository?.url ? [`- Repository: ${s.repository.url}`] : []), ...(s.websiteUrl ? [`- Website: ${s.websiteUrl}`] : []), '',
  ].join('\n');
  return { slug, version, tags, files: [{ path: 'manifest.json', content: JSON.stringify(manifest, (_k, v) => (v === undefined ? undefined : v), 2) + '\n' }, { path: 'README.md', content: readme }] };
}

export async function fetchRegistry(limit: number, log: (s: string) => void): Promise<RegistryEntry[]> {
  const out: RegistryEntry[] = [];
  let cursor = '';
  while (out.length < limit) {
    const url = `${REGISTRY}/v0/servers?limit=100&version=latest${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`MCP registry returned ${r.status}`);
    const page = (await r.json()) as { servers: RegistryEntry[]; metadata?: { nextCursor?: string } };
    out.push(...page.servers);
    log(`  fetched ${out.length}…`);
    if (!page.metadata?.nextCursor || !page.servers.length) break;
    cursor = page.metadata.nextCursor;
  }
  return out.slice(0, limit);
}

const PLACEHOLDER = /(^|[-_./ ])(test|tests|testing|template|example|examples|demo|sample|hello[-_ ]?world|placeholder|todo)([-_./ ]|$)/i;

/** Curation rules (documented in the report): provenance link required, placeholders and bulk-publisher spam excluded. */
export function curate(s: RegistryEntry['server']): string | null {
  if (!s.repository?.url && !s.websiteUrl) return 'no repository or website';
  if (PLACEHOLDER.test(s.name.split('/')[1] ?? '') || PLACEHOLDER.test(clean(s.title))) return 'test/template/example name';
  return null;
}

export async function importMcp(ctx: Ctx, opts: { limit: number; perNamespace?: number; entries?: RegistryEntry[]; log?: (s: string) => void }) {
  const log = opts.log ?? (() => {});
  const publisher = await ensurePublisher(ctx, PUBLISHER.handle, PUBLISHER.name);
  const imp = makeImporter(ctx, publisher);
  const entries = opts.entries ?? (await fetchRegistry(opts.limit, log));
  const cap = opts.perNamespace ?? 3;
  const perNs = new Map<string, Set<string>>();
  for (const e of entries) {
    const bad = curate(e.server);
    if (bad) { imp.stats.skip(bad); continue; }
    const m = mapEntry(e);
    if ('skip' in m) { imp.stats.skip(m.skip); continue; }
    const ns = e.server.name.split('/')[0];
    const seen = perNs.get(ns) ?? new Set<string>();
    if (!seen.has(m.slug) && seen.size >= cap) { imp.stats.skip(`namespace cap (${cap} per publisher)`); continue; }
    seen.add(m.slug); perNs.set(ns, seen);
    await publishImported(imp, m.files, { owner: publisher.handle, slug: m.slug, version: m.version });
  }
  return imp.stats;
}

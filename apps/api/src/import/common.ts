import { randomBytes } from 'node:crypto';
import { hashFiles, semver, type ArtifactFile } from '@aidev/artifact-schema';
import { ArtifactsService } from '../artifacts.service.js';
import { AuthService, type User } from '../auth.service.js';
import type { Ctx } from '../context.js';

/**
 * Importers publish third-party listings through the normal publish path, so validation, scanning and
 * immutability rules apply exactly as for any user. Nothing here invents data: counters stay at zero.
 */
export interface Importer {
  ctx: Ctx;
  artifacts: ArtifactsService;
  publisher: User;
  stats: Stats;
}

export class Stats {
  created = 0;
  updated = 0;
  unchanged = 0;
  skipped = new Map<string, number>();
  skip(reason: string) { this.skipped.set(reason, (this.skipped.get(reason) ?? 0) + 1); }
  get skippedTotal() { return [...this.skipped.values()].reduce((a, b) => a + b, 0); }
  report(label: string) {
    const lines = [`${label}: ${this.created} created, ${this.updated} updated, ${this.unchanged} unchanged, ${this.skippedTotal} skipped`];
    for (const [r, n] of [...this.skipped].sort((a, b) => b[1] - a[1]).slice(0, 12)) lines.push(`    ${String(n).padStart(4)}  ${r}`);
    return lines.join('\n');
  }
}

/** Find or create a non-loginable service account that owns imported listings. */
export async function ensurePublisher(ctx: Ctx, handle: string, name: string): Promise<User> {
  const auth = new AuthService(ctx);
  const existing = (await ctx.db.query<User>('SELECT id, email, handle, name FROM users WHERE handle=$1', [handle])).rows[0];
  if (existing) return existing;
  // Random password nobody knows: the account exists only to own imported listings.
  return (await auth.register({ email: `${handle}@imports.invalid`, handle, name, password: randomBytes(24).toString('hex') })).user;
}

export function makeImporter(ctx: Ctx, publisher: User): Importer {
  return { ctx, artifacts: new ArtifactsService(ctx), publisher, stats: new Stats() };
}

const trunc = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
export const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const describe = (desc: string, title: string) => {
  let d = clean(desc);
  if (d.length < 10) d = clean(`${title} — ${d}`);
  return d.length < 10 ? null : trunc(d, 490);
};

export function slugify(s: string, max = 64): string {
  const base = s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base;
  let h = 0;
  for (const c of base) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return base.slice(0, max - 7).replace(/-+$/, '') + '-' + h.toString(36).slice(0, 6);
}

const LANGS: Record<string, RegExp> = {
  typescript: /\btypescript\b/, javascript: /\bjavascript\b|\bnode\.?js\b/, python: /\bpython\b|\bpytest\b/, java: /\bjava\b(?!script)/,
  kotlin: /\bkotlin\b/, go: /\bgolang\b|\bgo (?:code|language|developer|module)/, rust: /\brust\b/, csharp: /\bc#|\bcsharp\b|\bc-sharp\b|\.net\b|\bdotnet\b/,
  ruby: /\bruby\b/, php: /\bphp\b/, swift: /\bswift\b(?!ui)/, sql: /\bsql\b|\bpostgres(?:ql)?\b|\bmysql\b/,
};
const FRAMEWORKS: Record<string, RegExp> = {
  react: /\breact\b/, angular: /\bangular\b/, vue: /\bvue(?:\.?js)?\b/, nextjs: /\bnext\.?js\b/, 'spring-boot': /\bspring[ -]?boot\b/, django: /\bdjango\b/,
  fastapi: /\bfastapi\b/, flask: /\bflask\b/, dotnet: /\.net\b|\bdotnet\b|\basp\.?net\b/, kubernetes: /\bkubernetes\b|\bk8s\b/, docker: /\bdocker\b/,
  terraform: /\bterraform\b/, nestjs: /\bnest\.?js\b/, jest: /\bjest\b/, vitest: /\bvitest\b/, playwright: /\bplaywright\b/,
};
/** Heuristic classification from the listing's own words; no claim beyond that. */
export function detect(text: string) {
  const t = text.toLowerCase();
  return {
    languages: Object.keys(LANGS).filter((k) => LANGS[k].test(t)),
    frameworks: Object.keys(FRAMEWORKS).filter((k) => FRAMEWORKS[k].test(t)),
  };
}

/**
 * Two source links point at the same upstream item when only the pinned commit differs:
 * https://github.com/o/r/blob/<sha>/path. Comparing whole URLs would treat every upstream commit as a
 * different item and duplicate the listing on re-import.
 */
export const sameSource = (a: string | null | undefined, b: string | null | undefined) => {
  const unpin = (u: string | null | undefined) => String(u ?? '').replace(/\/(blob|tree)\/[^/]+\//, '/$1/~/');
  return !!a && !!b && unpin(a) === unpin(b);
};

/**
 * SPDX id of a license text we may redistribute, or null. Only permissive licenses qualify; anything
 * else (including "All rights reserved" source-available terms) means the item is not imported.
 */
export function permissiveLicense(text: string | null | undefined): string | null {
  const t = String(text ?? '').slice(0, 4000);
  // Recognise the grant itself; proprietary terms ("governed by your agreement with…") never match.
  if (/Apache License[\s\S]{0,60}Version 2\.0/i.test(t)) return 'Apache-2.0';
  if (/Permission is hereby granted, free of charge/i.test(t)) return 'MIT';
  if (/\bCC0\b|Creative Commons Zero/i.test(t)) return 'CC0-1.0';
  if (/Redistribution and use in source and binary forms/i.test(t)) return /Neither the name/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(t)) return 'ISC';
  if (/free and unencumbered software released into the public domain/i.test(t)) return 'Unlicense';
  return null;
}

export const normalizeVersion = (v: string | undefined): string | null => {
  const s = String(v ?? '').trim().replace(/^v/i, '');
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(s)) return s;
  if (/^\d+\.\d+$/.test(s)) return `${s}.0`;
  if (/^\d+$/.test(s)) return `${s}.0.0`;
  return null;
};

export type PublishOutcome = 'created' | 'updated' | 'unchanged' | 'rejected';

/**
 * Publish if new or changed. `bump`: choose the next patch version when content changed but the
 * upstream gives us no (greater) version of its own.
 */
export async function publishImported(imp: Importer, files: ArtifactFile[], opts: { owner: string; slug: string; version: string; bump?: boolean; visibility?: 'public' }) {
  const existing = (await imp.ctx.db.query<{ latest_version: string; id: string }>('SELECT latest_version, id FROM artifacts WHERE owner_slug=$1 AND slug=$2', [opts.owner, opts.slug])).rows[0];
  let version = opts.version;
  if (existing?.latest_version) {
    const cur = (await imp.ctx.db.query<{ sha256: string }>('SELECT sha256 FROM artifact_versions WHERE artifact_id=$1 AND version=$2', [existing.id, existing.latest_version])).rows[0];
    const withVersion = (v: string) => files.map((f) => (f.path === 'manifest.json' ? { ...f, content: JSON.stringify({ ...JSON.parse(f.content), version: v }, null, 2) + '\n' } : f));
    if (cur && cur.sha256 === hashFiles(withVersion(existing.latest_version))) { imp.stats.unchanged++; return 'unchanged' as const; }
    if (semver.compare(version, existing.latest_version) <= 0) {
      if (!opts.bump) { imp.stats.unchanged++; return 'unchanged' as const; }
      const p = semver.parse(existing.latest_version)!;
      version = `${p.major}.${p.minor}.${p.patch + 1}`;
    }
    files = withVersion(version);
  }
  try {
    await imp.artifacts.publish(imp.publisher, { files, visibility: opts.visibility ?? 'public' });
    if (existing) imp.stats.updated++; else imp.stats.created++;
    return (existing ? 'updated' : 'created') as PublishOutcome;
  } catch (e: any) {
    const msg = e?.response?.error ?? e?.message ?? String(e);
    const detail = e?.response?.findings?.[0]?.rule ?? e?.response?.issues?.[0]?.message;
    imp.stats.skip(`rejected: ${msg}${detail ? ` (${detail})` : ''}`.slice(0, 140));
    return 'rejected' as const;
  }
}

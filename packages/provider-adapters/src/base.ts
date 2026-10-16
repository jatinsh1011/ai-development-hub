import path from 'node:path';
import { parseFrontmatter, stringifyFrontmatter, providerCompat, ENTRY_FILE, type ProviderId, type ResolvedArtifact } from '@aidev/artifact-schema';
import { commit, computeChanges, computeRemovals } from './apply.js';
import type { InstallOptions, InstallResult, PlanOp, ProviderAdapter, ProviderEnvironment, UninstallResult, ValidationResult } from './ops.js';

export type Plan = { ops: PlanOp[]; notes: string[]; skipped?: string };

export abstract class BaseAdapter implements ProviderAdapter {
  abstract id: ProviderId;
  abstract name: string;
  abstract inspect(opts?: { cwd?: string; home?: string }): Promise<ProviderEnvironment>;
  abstract plan(a: ResolvedArtifact, o: InstallOptions): Plan;

  async detect(opts?: { cwd?: string; home?: string }) { return (await this.inspect(opts)).detected; }

  async validate(a: ResolvedArtifact): Promise<ValidationResult> {
    const errors: string[] = [], warnings: string[] = [];
    if (!providerCompat(a.manifest, this.id)) errors.push(`${a.manifest.name} is not marked compatible with ${this.name}`);
    return { ok: !errors.length, errors, warnings };
  }

  async installArtifact(a: ResolvedArtifact, o: InstallOptions): Promise<InstallResult> {
    const ref = `${a.owner}/${a.slug}`;
    const v = await this.validate(a);
    if (!v.ok) return { provider: this.id, artifact: ref, ops: [], changes: [], conflicts: [], applied: false, notes: v.warnings, skipped: v.errors.join('; ') };
    const { ops, notes, skipped } = this.plan(a, o);
    if (skipped) return { provider: this.id, artifact: ref, ops: [], changes: [], conflicts: [], applied: false, notes, skipped };
    const changes = await computeChanges(ops, o.previous, o.force);
    const conflicts = changes.filter((c) => c.action === 'conflict');
    let applied = false, backupId: string | undefined;
    if (!conflicts.length && !o.dryRun) {
      backupId = await commit(changes, o.backupRoot ?? path.join(o.cwd, '.aidev', 'backups'));
      applied = true;
    }
    return { provider: this.id, artifact: ref, ops, changes, conflicts, applied, backupId, notes: [...notes, ...v.warnings] };
  }

  async uninstallArtifact(a: ResolvedArtifact | { owner: string; slug: string }, o: InstallOptions & { ops: PlanOp[] }): Promise<UninstallResult> {
    const changes = await computeRemovals(o.ops);
    let backupId: string | undefined, applied = false;
    if (!o.dryRun && !changes.some((c) => c.action === 'conflict' && !o.force)) {
      backupId = await commit(changes, o.backupRoot ?? path.join(o.cwd, '.aidev', 'backups'));
      applied = true;
    }
    return { provider: this.id, artifact: `${a.owner}/${a.slug}`, changes, applied, backupId, notes: [] };
  }
}

/* ---------- shared helpers ---------- */

export const entryOf = (a: ResolvedArtifact) => {
  const name = ENTRY_FILE[a.manifest.type];
  return name ? a.files.find((f) => f.path === name) : undefined;
};

/** Body of the entry file with frontmatter stripped. */
export const bodyOf = (a: ResolvedArtifact) => parseFrontmatter(entryOf(a)?.content ?? '').body;

/** Provider-specific frontmatter overrides from manifest.providers.<id>.frontmatter */
export const overrides = (a: ResolvedArtifact, id: ProviderId): Record<string, unknown> => {
  const f = a.manifest.providers?.[id]?.frontmatter;
  return f && typeof f === 'object' ? (f as Record<string, unknown>) : {};
};

const SKIP = new Set(['manifest.json', 'README.md', 'readme.md']);

/** Write the artifact as an Agent-Skills directory (SKILL.md + supporting files). */
export function skillOps(a: ResolvedArtifact, dir: string, extraFm: Record<string, unknown> = {}, bodyOverride?: string): PlanOp[] {
  const root = path.join(dir, a.manifest.name);
  // Defense in depth: never write outside the skill directory, whatever the registry sent.
  const inside = (p: string) => { const full = path.resolve(root, p); return full.startsWith(path.resolve(root) + path.sep); };
  for (const f of a.files) if (!inside(f.path)) throw new Error(`artifact file path escapes its directory: ${f.path}`);
  const ops: PlanOp[] = [];
  const skill = entryOf(a);
  const fm = parseFrontmatter(skill?.content ?? '');
  const body = bodyOverride ?? fm.body;
  ops.push({
    kind: 'write',
    path: path.join(root, 'SKILL.md'),
    content: stringifyFrontmatter({ ...fm.data, name: a.manifest.name, description: a.manifest.description, ...extraFm }, body),
  });
  for (const f of a.files) {
    if (SKIP.has(f.path) || f.path === skill?.path || f.encoding === 'base64' || (a.manifest.type !== 'skill' && f.path === ENTRY_FILE[a.manifest.type])) continue;
    if (a.manifest.type === 'skill' || f.path.startsWith('references/') || f.path.startsWith('assets/') || f.path.startsWith('scripts/')) {
      ops.push({ kind: 'write', path: path.join(root, f.path), content: f.content });
    }
  }
  return ops;
}

export const unsupported = (why: string): Plan => ({ ops: [], notes: [], skipped: why });

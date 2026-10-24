import { Inject, Injectable } from '@nestjs/common';
import { ARTIFACT_COLS, reindexArtifact, VISIBLE_SQL, type SearchQuery } from '@aidev/database';
import {
  DEP_KINDS, hashFiles, highestSeverity, riskProfile, semver, validateArtifact,
  type ArtifactFile, type Manifest, type Visibility, VISIBILITIES,
} from '@aidev/artifact-schema';
import { governance, orgBySlug, orgRole } from './access.js';
import { bad, CTX, type User } from './auth.service.js';
import type { Ctx } from './context.js';

export interface PublishBody {
  files: ArtifactFile[];
  owner?: string;
  visibility?: Visibility;
  team?: string;
  grants?: { teams?: string[]; users?: string[] };
}

const ACRONYMS = new Set(['api', 'aws', 'pr', 'rtl', 'mcp', 'sql', 'ui', 'ci', 'cd', 'k8s', 'gcp', 'sdk', 'cli']);
const humanize = (s: string) => s.split('-').map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1))).join(' ');
export const parseRef = (ref: string) => {
  const [r, range] = ref.split('@');
  const [a, b] = r.includes('/') ? r.split('/') : [undefined, r];
  return { owner: a, slug: b, range: range || undefined };
};

@Injectable()
export class ArtifactsService {
  constructor(@Inject(CTX) private ctx: Ctx) {}
  private get db() { return this.ctx.db; }

  /* ------------------------------ search ------------------------------ */
  search(q: SearchQuery) { return this.ctx.search.search(q); }

  /* ------------------------------ lookup ------------------------------ */
  /** Resolve "owner/slug" or a bare "slug" to an artifact row the viewer may see. */
  async resolveRef(ref: string, viewer: User | null, opts: { type?: string; preferOwner?: string } = {}) {
    const p = parseRef(ref);
    const params: unknown[] = [viewer?.id ?? null, p.slug];
    let where = `a.slug = $2 AND (${VISIBLE_SQL} OR a.visibility = 'unlisted')`;
    if (p.owner) { params.push(p.owner); where += ` AND a.owner_slug = $${params.length}`; }
    if (opts.type) { params.push(opts.type); where += ` AND a.type = $${params.length}`; }
    params.push(opts.preferOwner ?? '');
    const r = await this.db.query(
      `SELECT a.* FROM artifacts a WHERE ${where}
       ORDER BY (a.owner_slug = $${params.length}) DESC,
                (a.org_id IS NOT NULL AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = a.org_id AND m.user_id = $1::uuid)) DESC,
                a.official DESC, a.verified DESC, a.installs DESC LIMIT 1`,
      params,
    );
    if (!r.rows[0]) throw bad(`artifact "${ref}" not found`, 404);
    return r.rows[0];
  }

  private async versionRow(artifactId: string, range?: string) {
    const vs = (await this.db.query<{ version: string }>('SELECT version FROM artifact_versions WHERE artifact_id=$1', [artifactId])).rows.map((r) => r.version);
    const v = semver.maxSatisfying(vs, range || 'latest') ?? (range && vs.includes(range) ? range : null);
    if (!v) throw bad(`no version matches "${range ?? 'latest'}" (available: ${vs.sort(semver.compare).join(', ') || 'none'})`, 404);
    return (await this.db.query('SELECT * FROM artifact_versions WHERE artifact_id=$1 AND version=$2', [artifactId, v])).rows[0];
  }

  async detail(ref: string, viewer: User | null, range?: string) {
    const a = await this.resolveRef(ref, viewer);
    const v = await this.versionRow(a.id, range);
    const cols = (await this.db.query(`SELECT ${ARTIFACT_COLS}, a.repository, a.homepage FROM artifacts a WHERE a.id=$1`, [a.id])).rows[0];
    const versions = (await this.db.query('SELECT version, sha256, created_at AS "createdAt" FROM artifact_versions WHERE artifact_id=$1', [a.id])).rows.sort((x: any, y: any) => semver.compare(y.version, x.version));
    const team = a.team_id ? (await this.db.query('SELECT slug, name FROM teams WHERE id=$1', [a.team_id])).rows[0] : null;
    const org = a.org_id ? (await this.db.query('SELECT slug, name FROM organizations WHERE id=$1', [a.org_id])).rows[0] : null;
    const starred = viewer ? (await this.db.query('SELECT 1 FROM stars WHERE user_id=$1 AND artifact_id=$2', [viewer.id, a.id])).rows.length > 0 : false;
    return {
      ...cols,
      team, org, starred,
      governance: await governance(this.db, a, viewer?.id ?? null),
      installCommand: `aidevkit install ${a.owner_slug}/${a.slug}`,
      version: { version: v.version, sha256: v.sha256, manifest: v.manifest, readme: v.readme, files: v.file_index, risk: v.risk, findings: v.findings, createdAt: v.created_at },
      versions,
    };
  }

  async files(ref: string, version: string, viewer: User | null) {
    const a = await this.resolveRef(ref, viewer);
    const v = await this.versionRow(a.id, version);
    return { version: v.version, sha256: v.sha256, files: JSON.parse(await this.ctx.storage.get(v.storage_key)).files as ArtifactFile[] };
  }

  /* ------------------------------ install resolution ------------------------------ */
  /** Resolve an artifact + its dependency closure, dependencies first. Throws 403 if anything is company-blocked. */
  async resolveInstall(ref: string, range: string | undefined, viewer: User | null) {
    const order: any[] = [];
    const seen = new Set<string>();
    const stack: string[] = [];
    const visit = async (r: string, rg: string | undefined, parent?: { owner: string; slug: string }, type?: string): Promise<void> => {
      const a = await this.resolveRef(r, viewer, { type, preferOwner: parent?.owner }).catch((e) => {
        if (parent) throw bad(`dependency "${r}" (required by ${parent.owner}/${parent.slug}) not found`, 404);
        throw e;
      });
      const key = `${a.owner_slug}/${a.slug}`;
      if (seen.has(key)) return;
      if (stack.includes(key)) throw bad(`dependency cycle: ${[...stack, key].join(' → ')}`, 422);
      stack.push(key);
      const v = await this.versionRow(a.id, rg);
      const manifest = v.manifest as Manifest;
      for (const [kind, type2] of Object.entries(DEP_KINDS)) {
        for (const d of (manifest.dependencies as any)[kind] ?? []) {
          const dp = parseRef(d);
          await visit(d, dp.range, { owner: a.owner_slug, slug: a.slug }, type2);
        }
      }
      stack.pop();
      seen.add(key);
      const gov = await governance(this.db, a, viewer?.id ?? null);
      if (gov?.status === 'blocked') throw bad(`${key} is blocked by ${gov.org}`, 403, { code: 'BLOCKED', artifact: key });
      order.push({
        owner: a.owner_slug, slug: a.slug, type: a.type, version: v.version, sha256: v.sha256, manifest,
        files: JSON.parse(await this.ctx.storage.get(v.storage_key)).files,
        risk: v.risk, findings: v.findings, governance: gov, requiredBy: parent ? `${parent.owner}/${parent.slug}` : null,
        id: a.id,
      });
    };
    const p = parseRef(ref);
    await visit(p.owner ? `${p.owner}/${p.slug}` : p.slug, range ?? p.range);
    const root = order[order.length - 1];
    await this.db.query('UPDATE artifacts SET downloads = downloads + 1 WHERE id=$1', [root.id]);
    return { root: `${root.owner}/${root.slug}`, order: order.map(({ id: _id, ...rest }) => rest) };
  }

  /** Update-check helper: latest version per ref, with major-bump flag. */
  async latest(refs: { ref: string; version: string }[], viewer: User | null) {
    const out = [];
    for (const r of refs) {
      try {
        const a = await this.resolveRef(r.ref, viewer);
        const v = await this.versionRow(a.id);
        out.push({ ref: r.ref, installed: r.version, latest: v.version, updateAvailable: semver.compare(v.version, r.version) > 0, major: semver.isMajorBump(r.version, v.version), governance: await governance(this.db, a, viewer?.id ?? null) });
      } catch (e: any) { out.push({ ref: r.ref, installed: r.version, error: e.response?.error ?? String(e) }); }
    }
    return out;
  }

  /* ------------------------------ publish ------------------------------ */
  validate(files: ArtifactFile[]) {
    const r = validateArtifact(files);
    return { ok: r.ok, issues: r.issues, findings: r.findings, severity: highestSeverity(r.findings), manifest: r.manifest, risk: r.manifest ? riskProfile(r.manifest) : [] };
  }

  async publish(user: User, body: PublishBody, forkedFrom?: string) {
    if (!Array.isArray(body?.files)) throw bad('files[] is required');
    const rep = validateArtifact(body.files);
    if (!rep.ok || !rep.manifest) throw bad('artifact failed validation', 422, { issues: rep.issues });
    const m = rep.manifest;
    const severity = highestSeverity(rep.findings);

    // Ownership + permissions
    const ownerSlug = body.owner ?? user.handle;
    let ownerType: 'user' | 'org' = 'user', ownerId = user.id, orgId: string | null = null, teamId: string | null = null;
    const visibility: Visibility = body.visibility ?? (ownerSlug === user.handle ? 'public' : 'organization');
    if (!VISIBILITIES.includes(visibility)) throw bad(`invalid visibility "${visibility}"`);
    if (ownerSlug !== user.handle) {
      const org = await orgBySlug(this.db, ownerSlug);
      ownerType = 'org'; ownerId = org.id; orgId = org.id;
      const role = await orgRole(this.db, org.id, user.id);
      if (body.team) {
        const t = (await this.db.query('SELECT id FROM teams WHERE org_id=$1 AND slug=$2', [org.id, body.team])).rows[0];
        if (!t) throw bad(`team "${body.team}" not found in ${ownerSlug}`, 404);
        teamId = t.id;
      }
      const teamMaint = teamId ? (await this.db.query("SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2 AND role='maintainer'", [teamId, user.id])).rows.length > 0 : false;
      if (!(role === 'admin' || role === 'maintainer' || teamMaint)) throw bad(`you cannot publish to ${ownerSlug}`, 403);
      if (visibility === 'team' && !teamId) throw bad('visibility "team" requires a team');
    } else if (['organization', 'team'].includes(visibility)) {
      throw bad(`visibility "${visibility}" is only available for organization-owned artifacts`);
    }
    if (['public', 'unlisted'].includes(visibility) && severity === 'high') {
      throw bad('publicly visible artifacts cannot contain high-severity findings', 422, { findings: rep.findings.filter((f) => f.severity === 'high') });
    }

    const existing = (await this.db.query('SELECT * FROM artifacts WHERE owner_slug=$1 AND slug=$2', [ownerSlug, m.name])).rows[0];
    let id: string;
    if (existing) {
      if (existing.owner_type === 'user' ? existing.owner_id !== user.id : !(await orgRole(this.db, existing.owner_id, user.id)) ) throw bad('you do not own this artifact', 403);
      if (existing.latest_version && semver.compare(m.version, existing.latest_version) <= 0) {
        throw bad(`version ${m.version} must be greater than the latest published version ${existing.latest_version} (releases are immutable)`, 409);
      }
      id = existing.id;
    } else {
      id = (await this.db.query(
        `INSERT INTO artifacts (owner_type, owner_id, owner_slug, org_id, team_id, slug, title, type, description, author, visibility, forked_from, official, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,false) RETURNING id`,
        [ownerType, ownerId, ownerSlug, orgId, teamId, m.name, m.title ?? humanize(m.name), m.type, m.description, m.author, visibility, forkedFrom ?? null],
      )).rows[0].id;
    }

    const sha = hashFiles(rep.files);
    const key = `${ownerSlug}/${m.name}/${m.version}.json`;
    await this.ctx.storage.put(key, JSON.stringify({ files: rep.files }));
    const readme = rep.files.find((f) => /^readme\.md$/i.test(f.path))?.content ?? null;
    await this.db.query(
      `INSERT INTO artifact_versions (artifact_id, version, manifest, file_index, storage_key, sha256, readme, findings, risk, published_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, m.version, JSON.stringify(m), JSON.stringify(rep.files.map((f) => ({ path: f.path, size: f.content.length }))), key, sha, readme, JSON.stringify(rep.findings), JSON.stringify(riskProfile(m)), user.id],
    );
    await this.db.query(
      `UPDATE artifacts SET latest_version=$2, title=$3, description=$4, author=$5, license=$6, repository=$7, homepage=$8, tags=$9, categories=$10,
         languages=$11, frameworks=$12, compat=$13, type=$14, updated_at=now() WHERE id=$1`,
      [id, m.version, m.title ?? humanize(m.name), m.description, m.author, m.license, m.repository ?? null, m.homepage ?? null, m.tags, m.categories, m.languages, m.frameworks, JSON.stringify(m.compatibility), m.type],
    );
    if (body.visibility && existing) await this.db.query('UPDATE artifacts SET visibility=$2 WHERE id=$1', [id, visibility]);
    for (const t of body.grants?.teams ?? []) {
      if (!orgId) break;
      const tr = (await this.db.query('SELECT id FROM teams WHERE org_id=$1 AND slug=$2', [orgId, t])).rows[0];
      if (tr) await this.db.query("INSERT INTO artifact_grants VALUES ($1,'team',$2) ON CONFLICT DO NOTHING", [id, tr.id]);
    }
    for (const h of body.grants?.users ?? []) {
      const ur = (await this.db.query('SELECT id FROM users WHERE handle=$1 OR email=$1', [h])).rows[0];
      if (ur) await this.db.query("INSERT INTO artifact_grants VALUES ($1,'user',$2) ON CONFLICT DO NOTHING", [id, ur.id]);
    }
    await reindexArtifact(this.db, id);
    return { owner: ownerSlug, slug: m.name, version: m.version, sha256: sha, visibility: existing?.visibility ?? visibility, issues: rep.issues, findings: rep.findings };
  }

  /* ------------------------------ social ------------------------------ */
  async star(user: User, ref: string) {
    const a = await this.resolveRef(ref, user);
    const had = (await this.db.query('DELETE FROM stars WHERE user_id=$1 AND artifact_id=$2 RETURNING 1', [user.id, a.id])).rows.length > 0;
    if (!had) await this.db.query('INSERT INTO stars VALUES ($1,$2)', [user.id, a.id]);
    const n = (await this.db.query('UPDATE artifacts SET stars = (SELECT count(*) FROM stars WHERE artifact_id=$1) WHERE id=$1 RETURNING stars', [a.id])).rows[0].stars;
    return { starred: !had, stars: n };
  }
  async rate(user: User, ref: string, score: number) {
    if (!(score >= 1 && score <= 5)) throw bad('score must be 1-5');
    const a = await this.resolveRef(ref, user);
    await this.db.query('INSERT INTO ratings VALUES ($1,$2,$3) ON CONFLICT (user_id, artifact_id) DO UPDATE SET score=$3', [user.id, a.id, Math.round(score)]);
    return { ok: true };
  }
  async report(user: User, ref: string, reason: string) {
    if (!reason?.trim()) throw bad('reason required');
    const a = await this.resolveRef(ref, user);
    await this.db.query('INSERT INTO reports (artifact_id, user_id, reason) VALUES ($1,$2,$3)', [a.id, user.id, reason.slice(0, 2000)]);
    return { ok: true };
  }
  async fork(user: User, ref: string) {
    const a = await this.resolveRef(ref, user);
    const v = await this.versionRow(a.id);
    const files = JSON.parse(await this.ctx.storage.get(v.storage_key)).files as ArtifactFile[];
    if (a.owner_slug === user.handle) throw bad('you already own this artifact', 409);
    const clash = (await this.db.query('SELECT 1 FROM artifacts WHERE owner_slug=$1 AND slug=$2', [user.handle, a.slug])).rows.length;
    if (clash) throw bad(`${user.handle}/${a.slug} already exists`, 409);
    return this.publish(user, { files, visibility: 'public' }, a.id);
  }

  async recordInstall(user: User | null, ref: string, version: string, provider: string, action: 'artifact_installed' | 'artifact_updated' | 'artifact_removed') {
    const a = await this.resolveRef(ref, user);
    if (action !== 'artifact_removed') await this.db.query('UPDATE artifacts SET installs = installs + 1 WHERE id=$1', [a.id]);
    const orgIds = user ? (await this.db.query('SELECT org_id FROM memberships WHERE user_id=$1', [user.id])).rows : [];
    const orgId = a.org_id ?? orgIds[0]?.org_id ?? null;
    await this.db.query(
      'INSERT INTO events (org_id, user_id, event_type, provider, artifact_id, artifact_version) VALUES ($1,$2,$3,$4,$5,$6)',
      [orgId, user?.id ?? null, action, provider, a.id, version],
    );
    return { ok: true };
  }

  async userProfile(handle: string, viewer: User | null) {
    const u = (await this.db.query('SELECT id, handle, name, created_at AS "createdAt" FROM users WHERE handle=$1', [handle])).rows[0];
    if (!u) throw bad('user not found', 404);
    const published = await this.search({ owner: handle, limit: 100, sort: 'recent', viewerId: viewer?.id ?? null });
    const starred = (await this.db.query(
      `SELECT ${ARTIFACT_COLS} FROM stars s JOIN artifacts a ON a.id = s.artifact_id WHERE s.user_id=$2 AND ${VISIBLE_SQL} ORDER BY a.stars DESC`, [viewer?.id ?? null, u.id])).rows;
    const forked = published.items.length ? (await this.db.query(`SELECT ${ARTIFACT_COLS} FROM artifacts a WHERE a.owner_slug=$2 AND a.forked_from IS NOT NULL AND ${VISIBLE_SQL}`, [viewer?.id ?? null, handle])).rows : [];
    const installed = (await this.db.query(
      `SELECT DISTINCT ON (a.id) ${ARTIFACT_COLS} FROM events e JOIN artifacts a ON a.id = e.artifact_id WHERE e.user_id=$2 AND e.event_type='artifact_installed' AND ${VISIBLE_SQL}`, [viewer?.id ?? null, u.id])).rows;
    return { user: u, published: published.items, starred, forked, installed: viewer?.id === u.id ? installed : [] };
  }
}

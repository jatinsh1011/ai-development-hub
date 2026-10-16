import { Inject, Injectable } from '@nestjs/common';
import { usageEventSchema } from '@aidev/core';
import { ARTIFACT_COLS, VISIBLE_SQL } from '@aidev/database';
import { orgBySlug, orgRole, requireOrgRole } from './access.js';
import { ArtifactsService } from './artifacts.service.js';
import { bad, CTX, type User } from './auth.service.js';
import type { Ctx } from './context.js';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}$/;

@Injectable()
export class OrgsService {
  constructor(@Inject(CTX) private ctx: Ctx, @Inject(ArtifactsService) private artifacts: ArtifactsService) {}
  private get db() { return this.ctx.db; }

  async create(user: User, b: { slug: string; name: string }) {
    const slug = String(b.slug ?? '').toLowerCase();
    if (!SLUG.test(slug)) throw bad('slug must be 2-39 chars: lowercase letters, digits, dashes');
    const clash = await this.db.query('SELECT 1 FROM organizations WHERE slug=$1 UNION SELECT 1 FROM users WHERE handle=$1', [slug]);
    if (clash.rows.length) throw bad('that name is taken', 409);
    const org = (await this.db.query('INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id, slug, name', [slug, b.name || slug])).rows[0];
    await this.db.query("INSERT INTO memberships VALUES ($1,$2,'admin')", [org.id, user.id]);
    return org;
  }

  async mine(user: User) {
    return (await this.db.query(
      `SELECT o.slug, o.name, m.role, o.verified FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id=$1 ORDER BY o.name`, [user.id])).rows;
  }

  async overview(user: User, slug: string) {
    const org = await orgBySlug(this.db, slug);
    const role = await orgRole(this.db, org.id, user.id);
    if (!role) throw bad('not a member of this organization', 403);
    const counts = (await this.db.query('SELECT type, count(*)::int AS n FROM artifacts WHERE org_id=$1 GROUP BY type', [org.id])).rows;
    const teams = (await this.db.query(
      `SELECT t.id, t.slug, t.name, (SELECT count(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS members,
         (SELECT count(*)::int FROM artifacts a WHERE a.team_id = t.id) AS artifacts FROM teams t WHERE t.org_id=$1 ORDER BY t.name`, [org.id])).rows;
    const members = (await this.db.query(
      `SELECT u.handle, u.name, u.email, m.role, COALESCE((SELECT json_agg(t.slug) FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = u.id AND t.org_id = m.org_id), '[]'::json) AS teams
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id=$1 ORDER BY m.role, u.handle`, [org.id])).rows;
    return { ...org, role, counts: Object.fromEntries(counts.map((c: any) => [c.type, c.n])), teams, members };
  }

  async createTeam(user: User, slug: string, b: { slug: string; name: string }) {
    const { org } = await requireOrgRole(this.db, slug, user.id, ['admin']);
    const ts = String(b.slug ?? '').toLowerCase();
    if (!SLUG.test(ts)) throw bad('invalid team slug');
    const r = await this.db.query('INSERT INTO teams (org_id, slug, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id, slug, name', [org.id, ts, b.name || ts]);
    if (!r.rows[0]) throw bad('team already exists', 409);
    return r.rows[0];
  }

  async addMember(user: User, slug: string, b: { email: string; role?: string; team?: string; teamRole?: string }) {
    const { org } = await requireOrgRole(this.db, slug, user.id, ['admin']);
    const role = b.role ?? 'developer';
    if (!['admin', 'maintainer', 'developer'].includes(role)) throw bad('invalid role');
    const u = (await this.db.query('SELECT id, handle FROM users WHERE email=$1 OR handle=$1', [String(b.email ?? '').toLowerCase()])).rows[0];
    if (!u) throw bad('no user with that email/handle — ask them to sign up first', 404);
    await this.db.query('INSERT INTO memberships VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO UPDATE SET role=$3', [org.id, u.id, role]);
    if (b.team) {
      const t = (await this.db.query('SELECT id FROM teams WHERE org_id=$1 AND slug=$2', [org.id, b.team])).rows[0];
      if (!t) throw bad(`team "${b.team}" not found`, 404);
      await this.db.query('INSERT INTO team_members VALUES ($1,$2,$3) ON CONFLICT (team_id, user_id) DO UPDATE SET role=$3', [t.id, u.id, b.teamRole === 'maintainer' ? 'maintainer' : 'member']);
    }
    return { handle: u.handle, role, team: b.team ?? null };
  }

  async setPolicy(user: User, slug: string, b: { artifact: string; status: 'approved' | 'blocked' | 'none' }) {
    const { org } = await requireOrgRole(this.db, slug, user.id, ['admin']);
    if (!['approved', 'blocked', 'none'].includes(b.status)) throw bad('status must be approved, blocked or none');
    const a = await this.artifacts.resolveRef(b.artifact, user);
    if (b.status === 'none') await this.db.query('DELETE FROM org_policies WHERE org_id=$1 AND artifact_id=$2', [org.id, a.id]);
    else await this.db.query(
      `INSERT INTO org_policies (org_id, artifact_id, status, set_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (org_id, artifact_id) DO UPDATE SET status=$3, set_by=$4, updated_at=now()`, [org.id, a.id, b.status, user.id]);
    return { artifact: `${a.owner_slug}/${a.slug}`, status: b.status };
  }

  async policies(user: User, slug: string) {
    const org = await orgBySlug(this.db, slug);
    if (!(await orgRole(this.db, org.id, user.id))) throw bad('not a member', 403);
    return (await this.db.query(
      `SELECT a.owner_slug AS owner, a.slug, a.type, p.status, p.updated_at AS "updatedAt" FROM org_policies p JOIN artifacts a ON a.id = p.artifact_id WHERE p.org_id=$1 ORDER BY p.status, a.slug`, [org.id])).rows;
  }

  /** Everything the viewer can use from their companies, with governance status. */
  async resources(user: User) {
    const rows = (await this.db.query(
      `SELECT ${ARTIFACT_COLS}, o.slug AS "org", t.slug AS team,
         COALESCE((SELECT p.status FROM org_policies p WHERE p.org_id = a.org_id AND p.artifact_id = a.id), 'approved') AS governance
       FROM artifacts a JOIN organizations o ON o.id = a.org_id LEFT JOIN teams t ON t.id = a.team_id
       WHERE ${VISIBLE_SQL} AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = a.org_id AND m.user_id = $1::uuid)
       ORDER BY o.slug, a.type, a.slug`, [user.id])).rows;
    const approvedExternal = (await this.db.query(
      `SELECT ${ARTIFACT_COLS}, o.slug AS "org", NULL AS team, 'approved' AS governance FROM org_policies p
       JOIN artifacts a ON a.id = p.artifact_id JOIN organizations o ON o.id = p.org_id
       WHERE p.status='approved' AND a.org_id IS DISTINCT FROM p.org_id AND ${VISIBLE_SQL}
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = p.org_id AND m.user_id = $1::uuid)`, [user.id])).rows;
    return [...rows, ...approvedExternal];
  }

  async analytics(user: User, slug: string, days = 30) {
    const { org } = await requireOrgRole(this.db, slug, user.id, ['admin', 'maintainer']);
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const one = async (sql: string) => (await this.db.query(sql, [org.id, since])).rows;
    const [tot] = await one(`SELECT count(*) FILTER (WHERE event_type='request')::int AS requests, COALESCE(sum(input_tokens),0)::int AS "inputTokens",
        COALESCE(sum(output_tokens),0)::int AS "outputTokens", COALESCE(sum(estimated_cost),0)::float AS cost,
        count(DISTINCT user_id)::int AS "activeUsers", count(DISTINCT session_id)::int AS sessions,
        count(*) FILTER (WHERE event_type='artifact_installed')::int AS installs
      FROM events WHERE org_id=$1 AND ts >= $2`);
    const byProvider = await one(`SELECT provider, count(*)::int AS events, COALESCE(sum(estimated_cost),0)::float AS cost FROM events WHERE org_id=$1 AND ts >= $2 AND provider IS NOT NULL GROUP BY provider ORDER BY events DESC`);
    const byArtifact = await one(`SELECT a.owner_slug || '/' || a.slug AS artifact, a.type, count(*)::int AS events, count(DISTINCT e.user_id)::int AS users
      FROM events e JOIN artifacts a ON a.id = e.artifact_id WHERE e.org_id=$1 AND e.ts >= $2 GROUP BY a.id ORDER BY events DESC LIMIT 10`);
    const byModel = await one(`SELECT model, count(*)::int AS requests, COALESCE(sum(estimated_cost),0)::float AS cost FROM events WHERE org_id=$1 AND ts >= $2 AND model IS NOT NULL GROUP BY model ORDER BY requests DESC`);
    const ov = await this.overview(user, slug);
    return { windowDays: days, totals: tot, byProvider, byArtifact, byModel, artifacts: ov.counts, members: ov.members.length, teams: ov.teams.length,
      note: 'Cost and token figures are only populated when usage events are ingested; outcome (PR/CI) metrics are not inferred.' };
  }

  async ingest(user: User, body: { events: unknown[] }) {
    if (!Array.isArray(body?.events) || body.events.length > 500) throw bad('events[] required (max 500)');
    let n = 0;
    for (const raw of body.events) {
      const e = usageEventSchema.safeParse(raw);
      if (!e.success) throw bad(`invalid event #${n}: ${e.error.issues[0]?.message}`, 422);
      const v = e.data;
      let orgId: string | null = null, teamId: string | null = null;
      if (v.orgSlug) {
        const org = await orgBySlug(this.db, v.orgSlug);
        if (!(await orgRole(this.db, org.id, user.id))) throw bad('not a member of that organization', 403);
        orgId = org.id;
        if (v.teamSlug) teamId = (await this.db.query('SELECT id FROM teams WHERE org_id=$1 AND slug=$2', [org.id, v.teamSlug])).rows[0]?.id ?? null;
      }
      const art = v.artifact ? await this.artifacts.resolveRef(v.artifact, user).catch(() => null) : null;
      await this.db.query(
        `INSERT INTO events (org_id, user_id, team_id, event_type, provider, agent, model, session_id, repository, input_tokens, output_tokens, estimated_cost, artifact_id, artifact_version, payload, ts)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [orgId, user.id, teamId, v.eventType, v.provider ?? null, v.agent ?? null, v.model ?? null, v.sessionId ?? null, v.repository ?? null, v.inputTokens ?? null, v.outputTokens ?? null, v.estimatedCost ?? null, art?.id ?? null, v.artifactVersion ?? null, JSON.stringify(v.payload ?? {}), v.timestamp ?? new Date().toISOString()],
      );
      n++;
    }
    return { accepted: n };
  }
}

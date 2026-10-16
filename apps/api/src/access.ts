import { VISIBLE_SQL, type Db } from '@aidev/database';
import { bad } from './auth.service.js';

export type OrgRole = 'admin' | 'maintainer' | 'developer';

export async function orgRole(db: Db, orgId: string, userId: string): Promise<OrgRole | null> {
  const r = await db.query<{ role: OrgRole }>('SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2', [orgId, userId]);
  return r.rows[0]?.role ?? null;
}

export async function orgBySlug(db: Db, slug: string) {
  const r = await db.query<{ id: string; slug: string; name: string }>('SELECT id, slug, name FROM organizations WHERE slug=$1', [slug]);
  if (!r.rows[0]) throw bad(`organization "${slug}" not found`, 404);
  return r.rows[0];
}

export async function requireOrgRole(db: Db, slug: string, userId: string, roles: OrgRole[]) {
  const org = await orgBySlug(db, slug);
  const role = await orgRole(db, org.id, userId);
  if (!role || !roles.includes(role)) throw bad(`requires ${roles.join(' or ')} role in ${slug}`, 403);
  return { org, role };
}

/** Governance as seen by one viewer: blocked beats approved beats external. null if viewer has no org. */
export async function governance(db: Db, artifact: { id: string; org_id: string | null }, viewerId: string | null) {
  if (!viewerId) return null;
  const orgs = (await db.query<{ org_id: string; slug: string }>('SELECT m.org_id, o.slug FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id=$1', [viewerId])).rows;
  if (!orgs.length) return null;
  const pol = (await db.query<{ status: string; slug: string }>(
    `SELECT p.status, o.slug FROM org_policies p JOIN organizations o ON o.id = p.org_id JOIN memberships m ON m.org_id = p.org_id AND m.user_id=$1 WHERE p.artifact_id=$2`,
    [viewerId, artifact.id])).rows;
  const blocked = pol.find((p) => p.status === 'blocked');
  if (blocked) return { status: 'blocked' as const, org: blocked.slug };
  const approved = pol.find((p) => p.status === 'approved') ?? (artifact.org_id && orgs.find((o) => o.org_id === artifact.org_id) ? { slug: orgs.find((o) => o.org_id === artifact.org_id)!.slug } : null);
  if (approved) return { status: 'approved' as const, org: approved.slug };
  return { status: 'external' as const, org: orgs[0].slug };
}

export { VISIBLE_SQL };

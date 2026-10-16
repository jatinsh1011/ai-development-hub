import type { Db } from './db.js';

export interface SearchQuery {
  q?: string;
  type?: string;
  provider?: string;
  language?: string;
  framework?: string;
  verified?: boolean;
  official?: boolean;
  owner?: string;
  org?: string;
  sort?: 'relevance' | 'popular' | 'recent' | 'stars' | 'github';
  limit?: number;
  offset?: number;
  viewerId?: string | null;
}

/** SQL predicate: which artifacts a viewer may see. $1 is always the viewer id (nullable uuid). */
export const VISIBLE_SQL = `(
  a.visibility = 'public'
  OR ($1::uuid IS NOT NULL AND (
    (a.owner_type = 'user' AND a.owner_id = $1::uuid)
    OR (a.org_id IS NOT NULL AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = a.org_id AND m.user_id = $1::uuid AND m.role = 'admin'))
    OR (a.visibility = 'organization' AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = a.org_id AND m.user_id = $1::uuid))
    OR (a.visibility = 'team' AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = a.team_id AND tm.user_id = $1::uuid))
    OR EXISTS (SELECT 1 FROM artifact_grants g WHERE g.artifact_id = a.id AND (
         (g.grantee_type = 'user' AND g.grantee_id = $1::uuid)
      OR (g.grantee_type = 'team' AND g.grantee_id IN (SELECT team_id FROM team_members WHERE user_id = $1::uuid))))
  ))
)`;

/** Swap this interface for OpenSearch/Typesense later without touching callers. */
export interface SearchProvider {
  search(q: SearchQuery): Promise<{ total: number; items: any[] }>;
}

const toTsQuery = (q: string) =>
  q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => `${w}:*`).join(' & ');

export const ARTIFACT_COLS = `a.id, a.owner_slug AS owner, a.slug, a.title, a.type, a.description, a.author, a.visibility,
  a.latest_version AS "latestVersion", a.license, a.tags, a.categories, a.languages, a.frameworks, a.compat,
  a.verified, a.official, a.downloads, a.installs, a.stars, a.updated_at AS "updatedAt", a.created_at AS "createdAt",
  (SELECT round(avg(score)::numeric, 1) FROM ratings r WHERE r.artifact_id = a.id) AS rating,
  (SELECT count(*)::int FROM ratings r WHERE r.artifact_id = a.id) AS "ratingCount",
  a.github_repo AS "githubRepo", a.github_stars AS "githubStars"`;

export class PgSearch implements SearchProvider {
  constructor(private db: Db) {}

  async search(s: SearchQuery) {
    const params: unknown[] = [s.viewerId ?? null];
    const where: string[] = [VISIBLE_SQL, `(a.visibility <> 'unlisted' OR a.owner_id = $1::uuid)`];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const tsq = s.q ? toTsQuery(s.q) : '';
    let tsParam = '';
    if (tsq) {
      tsParam = add(tsq);
      where.push(`a.search @@ to_tsquery('english', ${tsParam})`);
    }
    if (s.type) where.push(`a.type = ${add(s.type)}`);
    if (s.provider) where.push(`COALESCE((a.compat ->> ${add(s.provider === 'claude' ? 'claudeCode' : s.provider)})::boolean, false)`);
    if (s.language) where.push(`${add(s.language.toLowerCase())} = ANY (SELECT lower(x) FROM unnest(a.languages) x)`);
    if (s.framework) where.push(`${add(s.framework.toLowerCase())} = ANY (SELECT lower(x) FROM unnest(a.frameworks) x)`);
    if (s.verified) where.push('a.verified');
    if (s.official) where.push('a.official');
    if (s.owner) where.push(`a.owner_slug = ${add(s.owner)}`);
    if (s.org) where.push(`a.org_id = (SELECT id FROM organizations WHERE slug = ${add(s.org)})`);
    const W = where.join(' AND ');
    const total = (await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM artifacts a WHERE ${W}`, params)).rows[0].n;

    // Ranking parameters are added after the count query so both queries bind exactly what they reference.
    let rank = '0';
    if (tsq) {
      const raw = add(String(s.q).trim().toLowerCase());
      // exact / prefix name matches outrank incidental text matches
      rank = `(ts_rank(a.search, to_tsquery('english', ${tsParam})) + CASE WHEN lower(a.slug) = ${raw} OR lower(a.title) = ${raw} THEN 2 WHEN lower(a.slug) LIKE ${raw} || '%' OR lower(a.title) LIKE ${raw} || '%' THEN 0.4 ELSE 0 END)`;
    }
    const order =
      s.sort === 'popular' ? 'a.installs DESC, a.downloads DESC'
      : s.sort === 'recent' ? 'a.updated_at DESC'
      : s.sort === 'stars' ? 'a.stars DESC, a.github_stars DESC NULLS LAST'
      : s.sort === 'github' ? 'a.github_stars DESC NULLS LAST'
      : `(${rank} + ln(a.installs + 1) * 0.02 + ln(COALESCE(a.github_stars, 0) + 1) * 0.015 + CASE WHEN a.verified THEN 0.05 ELSE 0 END) DESC, a.installs DESC`;
    const limit = Math.min(s.limit ?? 20, 100);
    const rows = await this.db.query(
      `SELECT ${ARTIFACT_COLS} FROM artifacts a WHERE ${W} ORDER BY ${order} LIMIT ${limit} OFFSET ${Math.max(s.offset ?? 0, 0)}`,
      params,
    );
    return { total, items: rows.rows };
  }
}

/** Recompute the weighted search vector for one artifact. */
export async function reindexArtifact(db: Db, id: string) {
  await db.query(
    `UPDATE artifacts SET search =
       setweight(to_tsvector('english', coalesce(title,'') || ' ' || slug), 'A') ||
       setweight(to_tsvector('english', array_to_string(tags, ' ') || ' ' || array_to_string(categories, ' ') || ' ' || array_to_string(languages, ' ') || ' ' || array_to_string(frameworks, ' ')), 'B') ||
       setweight(to_tsvector('english', coalesce(description,'') || ' ' || type || ' ' || author), 'C')
     WHERE id = $1`,
    [id],
  );
}

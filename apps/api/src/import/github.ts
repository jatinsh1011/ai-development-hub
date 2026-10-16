import type { Ctx } from '../context.js';

/**
 * Real GitHub star counts for imported listings, fetched with the GitHub GraphQL API (100 repos per request).
 * Stars belong to the *source repository*, so they are shown separately from this site's own stars/installs.
 * Listings whose repository is a shared collection (awesome-copilot) are excluded: that repo's stars say
 * nothing about one item inside it.
 */
const SHARED_COLLECTIONS = new Set(['github/awesome-copilot']);

/** "https://github.com/Owner/Repo(.git)(/tree/...)" -> "owner/repo" (lowercased), else null. */
export function parseGithubRepo(url: string | null | undefined): string | null {
  const m = /^(?:https?:\/\/|git\+https?:\/\/|git@)?(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(String(url ?? '').trim());
  if (!m) return null;
  const repo = `${m[1]}/${m[2]}`.toLowerCase();
  return SHARED_COLLECTIONS.has(repo) ? null : repo;
}

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The registry verifies the *namespace* (io.github.X = logged in as X; com.example = owns example.com)
 * but not the free-text repository URL. Stars are only attributed when the repo provably belongs to the publisher.
 */
export function repoMatchesPublisher(namespace: string, repo: string): boolean {
  const [owner, name] = repo.split('/');
  const gh = /^io\.github\.(.+)$/i.exec(namespace);
  if (gh) return owner.toLowerCase() === gh[1].toLowerCase();
  const labels = namespace.toLowerCase().split('.').slice(1).filter((l) => l.length >= 3 && !['mcp', 'www', 'api', 'app', 'dev'].includes(l));
  return labels.some((l) => { const n = norm(l); return n.length >= 3 && (norm(owner).includes(n) || norm(name).includes(n) || n.includes(norm(owner))); });
}

const escape = (s: string) => s.replace(/["\\]/g, '');

async function fetchBatch(token: string, repos: string[]): Promise<Map<string, number>> {
  const fields = repos.map((r, i) => { const [o, n] = r.split('/'); return `r${i}: repository(owner: "${escape(o)}", name: "${escape(n)}") { stargazerCount }`; });
  const query = `query { ${fields.join('\n')} rateLimit { remaining resetAt } }`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'aidev-hub' },
      body: JSON.stringify({ query }),
    });
    if (res.status === 401) throw new Error('GitHub rejected the token (401). Check GITHUB_TOKEN.');
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`GitHub GraphQL returned ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, { stargazerCount: number } | null> };
    const out = new Map<string, number>();
    repos.forEach((r, i) => { const v = body.data?.[`r${i}`]; if (v) out.set(r, v.stargazerCount); }); // missing/renamed repos come back null
    return out;
  }
}

export async function syncGithubStars(ctx: Ctx, opts: { token: string; log?: (s: string) => void; batch?: number }) {
  const log = opts.log ?? (() => {});
  const rows = (await ctx.db.query<{ id: string; repository: string | null; author: string }>("SELECT id, repository, author FROM artifacts WHERE repository IS NOT NULL AND visibility = 'public'")).rows;
  const byRepo = new Map<string, string[]>();
  const unverified: string[] = [];
  for (const r of rows) {
    const repo = parseGithubRepo(r.repository);
    if (!repo) continue;
    if (!repoMatchesPublisher(r.author, repo)) { unverified.push(r.id); continue; }
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), r.id]);
  }
  // Never show borrowed stars: clear any previously stored value for listings whose repo isn't the publisher's.
  if (unverified.length) await ctx.db.query('UPDATE artifacts SET github_repo = NULL, github_stars = NULL, github_synced_at = now() WHERE id = ANY($1::uuid[])', [unverified]);
  log(`  ${unverified.length} listings skipped: repository not owned by the publisher`);
  const repos = [...byRepo.keys()];
  log(`  ${repos.length} distinct GitHub repositories across ${rows.length} listings`);
  const size = opts.batch ?? 100;
  let found = 0, missing = 0;
  for (let i = 0; i < repos.length; i += size) {
    const chunk = repos.slice(i, i + size);
    const stars = await fetchBatch(opts.token, chunk);
    for (const repo of chunk) {
      const ids = byRepo.get(repo)!;
      const n = stars.get(repo);
      if (n === undefined) missing++; else found++;
      await ctx.db.query('UPDATE artifacts SET github_repo = $2, github_stars = $3, github_synced_at = now() WHERE id = ANY($1::uuid[])', [ids, repo, n ?? null]);
    }
    if ((i / size) % 20 === 0) log(`  ${Math.min(i + size, repos.length)}/${repos.length}…`);
  }
  return { repos: repos.length, found, missing, unverified: unverified.length };
}

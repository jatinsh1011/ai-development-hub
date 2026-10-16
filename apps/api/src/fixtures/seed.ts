import { ArtifactsService } from '../artifacts.service.js';
import { AuthService } from '../auth.service.js';
import type { Ctx } from '../context.js';
import { OrgsService } from '../orgs.service.js';
import { ACME, COMMUNITY, filesFor, type Seed } from './catalog.js';

export const DEMO_PASSWORD = 'password123';

export async function seedIfEmpty(ctx: Ctx, log = console.log) {
  const n = (await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM artifacts')).rows[0].n;
  if (n > 0) return false;
  const auth = new AuthService(ctx), art = new ArtifactsService(ctx), orgs = new OrgsService(ctx, art);
  const reg = async (email: string, handle: string, name: string) => (await auth.register({ email, handle, name, password: DEMO_PASSWORD })).user;

  const aidev = await reg('official@aidev.dev', 'aidev', 'AI Development Hub');
  const maria = await reg('maria@example.com', 'mlopez', 'Maria Lopez');
  const alice = await reg('alice@acme.dev', 'alice', 'Alice Admin');
  const bob = await reg('bob@acme.dev', 'bob', 'Bob Developer');
  const demo = await reg('demo@example.com', 'demo', 'Demo User');
  const people: Record<string, any> = { aidev, mlopez: maria, acme: alice };

  const publish = async (s: Seed) => {
    await art.publish(people[s.owner], { files: filesFor(s), owner: s.owner === 'acme' ? 'acme' : undefined, visibility: s.visibility, team: s.team });
    const st = s.stats!;
    await ctx.db.query('UPDATE artifacts SET installs=$3, stars=$4, downloads=$5 WHERE owner_slug=$1 AND slug=$2', [s.owner, s.manifest.name, st.installs, st.stars, st.downloads]);
  };

  for (const s of COMMUNITY) await publish(s);
  await ctx.db.query("UPDATE artifacts SET official=true, verified=true WHERE owner_slug='aidev'");

  // Company
  await orgs.create(alice, { slug: 'acme', name: 'Acme Corp' });
  await ctx.db.query("UPDATE organizations SET verified=true WHERE slug='acme'");
  for (const t of [['platform', 'Platform Team'], ['frontend', 'Frontend Team'], ['security', 'Security Team']]) await orgs.createTeam(alice, 'acme', { slug: t[0], name: t[1] });
  await orgs.addMember(alice, 'acme', { email: 'bob@acme.dev', role: 'developer', team: 'frontend' });
  await orgs.addMember(alice, 'acme', { email: 'demo@example.com', role: 'developer', team: 'frontend' });
  await orgs.addMember(alice, 'acme', { email: 'bob@acme.dev', role: 'maintainer', team: 'frontend', teamRole: 'maintainer' });
  for (const s of ACME) await publish(s);
  await ctx.db.query("UPDATE artifacts SET verified=true WHERE owner_slug='acme'");
  for (const a of ['aidev/github', 'aidev/react-migration-agent', 'aidev/pr-review', 'aidev/react-19-migration', 'aidev/rtl-migration']) await orgs.setPolicy(alice, 'acme', { artifact: a, status: 'approved' });
  await orgs.setPolicy(alice, 'acme', { artifact: 'mlopez/quick-deploy-agent', status: 'blocked' });

  // Ratings
  for (const [ref, score] of [['aidev/react-migration-agent', 5], ['aidev/github', 5], ['aidev/security-review-agent', 4], ['aidev/pr-review', 5]] as const) {
    for (const u of [maria, bob, demo]) await art.rate(u, ref, score - (u === demo ? 1 : 0) || 1);
  }
  // Sample usage events (clearly synthetic) so the analytics page has something to render.
  const providers = ['copilot', 'claude', 'codex'], models = ['gpt-5', 'claude-sonnet-5-5', 'gpt-5-codex'];
  const events = Array.from({ length: 60 }, (_, i) => ({
    orgSlug: 'acme', eventType: 'request' as const, provider: providers[i % 3], model: models[i % 3], sessionId: `s${i % 12}`,
    agent: i % 2 ? 'react-migration-agent' : 'security-review-agent', artifact: i % 2 ? 'aidev/react-migration-agent' : 'aidev/security-review-agent',
    inputTokens: 1500 + i * 37, outputTokens: 400 + i * 11, estimatedCost: +(0.01 + (i % 7) * 0.004).toFixed(4), repository: 'acme/web',
  }));
  await orgs.ingest(bob, { events });
  await orgs.ingest(alice, { events: events.slice(0, 10) });
  log(`Seeded ${COMMUNITY.length + ACME.length} artifacts. Demo logins (password "${DEMO_PASSWORD}"): demo@example.com, alice@acme.dev (acme admin), bob@acme.dev`);
  return true;
}

import Link from 'next/link';
import { ArtifactCard } from '@/components/ArtifactCard';
import { SearchBox } from '@/components/SearchBox';
import { ButtonLink, Section } from '@/components/ui';
import { serverApi } from '@/lib/server';
import { TYPES, type ArtifactSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Editorial picks: well-known publishers' real listings. Shown until real install data makes "Most installed" meaningful. */
const FEATURED = [
  'mcp-registry/github-mcp-server', 'mcp-registry/atlassian-mcp-server', 'mcp-registry/stripe-mcp',
  'awesome-copilot/react19-migrator', 'awesome-copilot/playwright-generate-test', 'awesome-copilot/postgresql-code-review',
];
const MIN_INSTALLS_FOR_POPULAR = 50;

const q = async (qs: string) => (await serverApi<{ items: ArtifactSummary[]; total: number }>(`/artifacts?${qs}`)).data.items ?? [];

export default async function Home() {
  const [popularRaw, featured, recent, ...counts] = await Promise.all([
    q('sort=popular&limit=6'),
    Promise.all(FEATURED.map(async (ref) => { const r = await serverApi<ArtifactSummary>(`/artifacts/${ref}`); return r.status === 200 ? r.data : null; })),
    q('sort=recent&limit=3'),
    ...TYPES.map(async (t) => (await serverApi<{ total: number }>(`/artifacts?type=${t.id}&limit=1`)).data.total ?? 0),
  ]);
  const hasUsage = popularRaw.length > 0 && popularRaw.every((a) => a.installs >= MIN_INSTALLS_FOR_POPULAR);
  const top = hasUsage ? popularRaw : (featured.filter(Boolean) as ArtifactSummary[]);
  return (
    <>
      <div className="mx-auto max-w-6xl px-6">
        <section className="pb-14 pt-24 sm:pt-32">
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-7xl">
            Reusable AI development <span className="text-muted">building blocks.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Discover, publish, install and share agents, skills, MCP servers, prompts and workflows across your AI development tools.
          </p>
          <div className="mt-10 max-w-2xl"><SearchBox large autoFocus /></div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            Try
            {['react migration', 'postgres', 'security review', 'kubernetes'].map((s) => (
              <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-border px-3 py-1 hover:border-fg hover:text-fg">{s}</Link>
            ))}
          </div>
        </section>

        <Section title={hasUsage ? 'Most installed' : 'Featured'} action={<Link href="/search" className="text-sm text-muted hover:text-fg">Browse all →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{top.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>
        </Section>

        <Section title="Recently published" action={<Link href="/search?sort=recent" className="text-sm text-muted hover:text-fg">View all →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recent.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>
        </Section>
      </div>

      <div className="mt-8 border-y border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          {TYPES.map((t, i) => (
            <Link key={t.id} href={`/search?type=${t.id}`} className="group border-b border-border p-6 hover:bg-subtle lg:border-b-0">
              <div className="flex items-baseline justify-between"><span className="font-medium">{t.label}</span><span className="font-mono text-xs text-muted">{counts[i]}</span></div>
              <p className="mt-2 text-sm text-muted">{t.blurb}</p>
              <span className="mt-4 inline-block text-sm text-muted group-hover:text-fg">Browse →</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-24 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl font-semibold leading-tight tracking-[-0.03em]">Built for developers.</h2>
            <p className="mt-4 max-w-md text-lg text-muted">Install directly into your AI coding environment. One command writes the right files for Copilot, Claude Code or Codex — with backups, diffs and a lockfile.</p>
            <p className="mt-4 max-w-md text-muted">Your coding agent can use it too: every command has <code className="rounded bg-code px-1.5 py-0.5 font-mono text-[13px]">--json</code> output and stable exit codes.</p>
            <div className="mt-8 flex gap-3">
              <ButtonLink href="/docs">Read the CLI guide</ButtonLink>
              <ButtonLink href="/publish" variant="secondary">Publish a building block</ButtonLink>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-strong bg-code p-5 font-mono text-[13px] leading-6">
{`$ aidev search "react migration"
$ aidev install react-migration-agent

✓ Artifact resolved  aidev/react-migration-agent@1.4.2
✓ Dependencies resolved (3)
✓ Target: GitHub Copilot

GitHub Copilot:
  + .github/skills/react-19-migration/SKILL.md
  + .github/agents/react-migration-agent.agent.md
  + .vscode/mcp.json

✓ Rollback point created
✓ Configuration updated

Ready to use.`}
          </pre>
        </section>
      </div>
    </>
  );
}

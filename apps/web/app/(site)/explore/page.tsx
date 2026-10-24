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
      <div className="wrap">
        <section className="pb-14 pt-16 sm:pt-24">
          <h1 className="h-display max-w-4xl text-5xl sm:text-7xl">
            Reusable AI development <span className="text-link">building blocks.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Discover, publish, install and share agents, skills, MCP servers, prompts and workflows across your AI development tools.
          </p>
          <div className="mt-10 max-w-2xl"><SearchBox large autoFocus /></div>
          <div className="chips mt-5 flex flex-wrap items-center gap-2 text-sm text-muted">
            Try
            {['react migration', 'postgres', 'security review', 'kubernetes'].map((s, i) => (
              <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className={`chip ${['chip-peach', 'chip-sky', 'chip-rose', 'chip-night'][i % 4]}`}>{s}</Link>
            ))}
          </div>
        </section>

        <Section title={hasUsage ? 'Most installed' : 'Featured'} action={<Link href="/search" className="link text-sm font-semibold">Browse all →</Link>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{top.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>
        </Section>

        <Section title="Recently published" action={<Link href="/search?sort=recent" className="link text-sm font-semibold">View all →</Link>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{recent.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>
        </Section>
      </div>

      <div className="mt-8 bg-soft py-14">
        <div className="wrap grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((t, i) => (
            <Link key={t.id} href={`/search?type=${t.id}`} className="card card-link group p-6">
              <div className="flex items-baseline justify-between"><span className="h-card text-xl">{t.label}</span><span className="font-mono text-xs text-muted">{counts[i]}</span></div>
              <p className="mt-2 text-sm text-muted">{t.blurb}</p>
              <span className="link mt-4 inline-block text-sm font-semibold">Browse →</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="wrap">
        <section className="grid items-center gap-12 py-24 lg:grid-cols-2">
          <div>
            <h2 className="h-display text-4xl sm:text-5xl">Built for developers.</h2>
            <p className="mt-4 max-w-md text-lg text-muted">Install directly into your AI coding environment. One command writes the right files for Copilot, Claude Code or Codex — with backups, diffs and a lockfile.</p>
            <p className="mt-4 max-w-md text-muted">Your coding agent can use it too: every command has <code className="whitespace-nowrap rounded-md bg-quiet px-1.5 py-0.5 font-mono text-[13px]">--json</code> output and stable exit codes.</p>
            <div className="mt-8 flex gap-3">
              <ButtonLink href="/docs">Read the CLI guide</ButtonLink>
              <ButtonLink href="/publish" variant="secondary">Publish a building block</ButtonLink>
            </div>
          </div>
          <pre className="terminal-block">
{`$ npm i -g aidevkit-cli
$ aidev install github-mcp-server

Resolving github-mcp-server...
✓ Target: GitHub Copilot
✓ Artifact resolved  mcp-registry/github-mcp-server@2.0.3

Requested permissions:
  mcp-registry/github-mcp-server
    - Network access: Makes outbound network requests; Connects to https://api.githubcopilot.com/mcp/
    - External APIs: Sends tool calls and their arguments to the server

Install mcp-registry/github-mcp-server@2.0.3 for GitHub Copilot? (y/N) y

mcp-registry/github-mcp-server@2.0.3  (mcp)
  GitHub Copilot:
    + .vscode/mcp.json
    note: VS Code will prompt for secret inputs the first time the server starts.

✓ Rollback point created  (undo with \`aidev rollback <id>\`)
✓ Configuration updated

Ready to use.`}
          </pre>
        </section>
      </div>
    </>
  );
}

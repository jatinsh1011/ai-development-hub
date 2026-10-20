import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArtifactCard, num } from '@/components/ArtifactCard';
import { AddMemberForm, CreateTeamForm, PolicyForm } from '@/components/OrgForms';
import { Badge, Empty, cx } from '@/components/ui';
import { currentUser, serverApi } from '@/lib/server';
import type { ArtifactSummary, Gov } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Company AI Hub' };

const TABS = [
  ['overview', 'Overview'],
  ['agent', 'Agents'],
  ['skill', 'Skills'],
  ['mcp', 'MCPs'],
  ['prompt', 'Prompts'],
  ['plugin', 'Plugins'],
  ['teams', 'Teams'],
  ['members', 'Members'],
  ['policies', 'Policies'],
  ['usage', 'Usage'],
] as const;
const ARTIFACT_TABS = ['agent', 'skill', 'mcp', 'prompt', 'plugin'];

export default async function OrgPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const tab = (await searchParams).tab ?? 'overview';
  if (!(await currentUser())) redirect('/login');
  const ov = await serverApi(`/orgs/${slug}`);
  if (ov.status === 403 || ov.status === 404) notFound();
  const o = ov.data;
  const isAdmin = o.role === 'admin';
  const canSeeUsage = o.role !== 'developer';
  const policies: { owner: string; slug: string; status: 'approved' | 'blocked' }[] = (await serverApi(`/orgs/${slug}/policies`)).data.policies ?? [];
  const analytics = canSeeUsage ? (await serverApi(`/orgs/${slug}/analytics`)).data : null;

  const govFor = (a: ArtifactSummary): Gov => {
    const p = policies.find((x) => x.owner === a.owner && x.slug === a.slug);
    return { status: p ? p.status : a.owner === slug ? 'approved' : 'external', org: slug };
  };

  let items: ArtifactSummary[] = [];
  if (ARTIFACT_TABS.includes(tab)) items = (await serverApi(`/artifacts?org=${slug}&type=${tab}&limit=100`)).data.items ?? [];

  const cost = analytics?.totals?.cost ?? 0;
  const metrics = [
    ['AI usage', analytics ? `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'],
    ['Active users', analytics ? String(analytics.totals.activeUsers) : '—'],
    ['Agents', String(o.counts.agent ?? 0)],
    ['MCPs', String(o.counts.mcp ?? 0)],
  ];

  return (
    <div className="wrap py-12">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">Company AI Hub {o.verified && <Badge tone="ok">Verified</Badge>}</div>
      <h1 className="h-display text-4xl sm:text-5xl">{o.name}</h1>
      <p className="mt-2 text-muted">
        You are {o.role === 'admin' ? 'an admin' : `a ${o.role}`}. Anything published here is private to your company unless you make it public.
      </p>

      <nav className="tabs mt-8" aria-label="Sections">
        {TABS.filter(([id]) => id !== 'usage' || canSeeUsage).map(([id, label]) => (
          <Link key={id} href={`/org/${slug}?tab=${id}`} className={cx('tab', tab === id && 'is-active')}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="pt-10">
        {tab === 'overview' && (
          <div className="space-y-12">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4">
              {metrics.map(([k, v]) => (
                <div key={k} className="bg-surface p-6">
                  <div className="text-sm text-muted">{k}</div>
                  <div className="h-display mt-2 text-4xl">{v}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <h2 className="h-card mb-4 text-xl">Teams</h2>
                <ul className="card divide-y divide-border text-sm">
                  {o.teams.map((t: any) => (
                    <li key={t.id} className="flex justify-between px-4 py-3">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted">
                        {t.members} members · {t.artifacts} artifacts
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="h-card mb-4 text-xl">Governance</h2>
                <ul className="card divide-y divide-border text-sm">
                  {policies.slice(0, 6).map((p) => (
                    <li key={p.owner + p.slug} className="flex justify-between px-4 py-3">
                      <span className="font-mono text-xs">
                        {p.owner}/{p.slug}
                      </span>
                      <Badge tone={p.status === 'approved' ? 'ok' : 'bad'}>{p.status === 'approved' ? '✓ Approved' : '✕ Blocked'}</Badge>
                    </li>
                  ))}
                  {!policies.length && <li className="px-4 py-6 text-center text-muted">No policies yet. External artifacts show as “⚠ External”.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {ARTIFACT_TABS.includes(tab) &&
          (items.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <ArtifactCard key={a.id} a={a} gov={govFor(a)} />
              ))}
            </div>
          ) : (
            <Empty>
              Nothing here yet. <Link className="link" href="/publish">Publish one</Link> under {o.name}.
            </Empty>
          ))}

        {tab === 'teams' && (
          <div className="space-y-8">
            {isAdmin && <CreateTeamForm org={slug} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {o.teams.map((t: any) => (
                <div key={t.id} className="card p-5">
                  <div className="h-card text-lg">{t.name}</div>
                  <div className="font-mono text-xs text-muted">{t.slug}</div>
                  <div className="mt-3 text-sm text-muted">
                    {t.members} members · {t.artifacts} artifacts
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div className="space-y-8">
            {isAdmin && <AddMemberForm org={slug} teams={o.teams} />}
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 font-medium">Member</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Teams</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {o.members.map((m: any) => (
                  <tr key={m.handle}>
                    <td className="py-3">
                      <Link href={`/u/${m.handle}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>{' '}
                      <span className="text-muted">@{m.handle}</span>
                    </td>
                    <td className="py-3">{m.role}</td>
                    <td className="py-3 text-muted">{(m.teams as string[]).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'policies' && (
          <div className="space-y-8">
            <p className="max-w-2xl text-muted">
              Mark any artifact — yours or public — as approved or blocked for the whole company. Blocked artifacts cannot be installed by members through the CLI.
            </p>
            {isAdmin && <PolicyForm org={slug} />}
            <ul className="card divide-y divide-border text-sm">
              {policies.map((p) => (
                <li key={p.owner + p.slug} className="flex items-center justify-between px-4 py-3">
                  <Link href={`/a/${p.owner}/${p.slug}`} className="font-mono text-xs hover:underline">
                    {p.owner}/{p.slug}
                  </Link>
                  <Badge tone={p.status === 'approved' ? 'ok' : 'bad'}>{p.status === 'approved' ? '✓ Company approved' : '✕ Company blocked'}</Badge>
                </li>
              ))}
              {!policies.length && <li className="px-4 py-8 text-center text-muted">No policies set.</li>}
            </ul>
          </div>
        )}

        {tab === 'usage' && analytics && (
          <div className="space-y-10">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-5">
              {[
                ['Requests', num(analytics.totals.requests)],
                ['Sessions', num(analytics.totals.sessions)],
                ['Input tokens', num(analytics.totals.inputTokens)],
                ['Output tokens', num(analytics.totals.outputTokens)],
                ['Installs', num(analytics.totals.installs)],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface p-5">
                  <div className="text-sm text-muted">{k}</div>
                  <div className="h-display mt-1 text-3xl">{v}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-10 lg:grid-cols-2">
              <Table title="By provider" head={['Provider', 'Events', 'Cost']} rows={analytics.byProvider.map((p: any) => [p.provider, p.events, `$${p.cost.toFixed(2)}`])} />
              <Table title="By model" head={['Model', 'Requests', 'Cost']} rows={analytics.byModel.map((p: any) => [p.model, p.requests, `$${p.cost.toFixed(2)}`])} />
              <Table title="Artifact adoption" head={['Artifact', 'Events', 'Users']} rows={analytics.byArtifact.map((p: any) => [p.artifact, p.events, p.users])} />
            </div>
            <p className="max-w-2xl text-xs text-muted">Last {analytics.windowDays} days. {analytics.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div>
      <h2 className="h-card mb-3 text-xl">{title}</h2>
      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cx('py-2.5', j === 0 && 'font-mono text-xs')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={head.length} className="py-6 text-center text-muted">
                No events yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

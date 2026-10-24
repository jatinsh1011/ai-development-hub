import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GovBadge, Trust, num } from '@/components/ArtifactCard';
import { Compat } from '@/components/Compat';
import { CopyCommand } from '@/components/CopyCommand';
import { Markdown } from '@/components/Markdown';
import { StarButton } from '@/components/StarButton';
import { Badge, Empty, cx } from '@/components/ui';
import { serverApi } from '@/lib/server';
import { typeLabel } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ tab?: string; version?: string; file?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, slug } = await params;
  const r = await serverApi(`/artifacts/${owner}/${slug}`);
  return { title: r.status === 200 ? `${r.data.title} (${owner}/${slug})` : 'Not found', description: r.data.description };
}

const TABS = [['readme', 'README'], ['files', 'Files'], ['versions', 'Versions'], ['security', 'Permissions & scan']] as const;

export default async function ArtifactPage({ params, searchParams }: Props) {
  const { owner, slug } = await params;
  const sp = await searchParams;
  const r = await serverApi(`/artifacts/${owner}/${slug}${sp.version ? `?version=${sp.version}` : ''}`);
  if (r.status !== 200) notFound();
  const a = r.data, v = a.version, m = v.manifest;
  const tab = sp.tab ?? 'readme';
  const base = `/a/${owner}/${slug}`;
  const q = (extra: string) => `${base}?${sp.version ? `version=${sp.version}&` : ''}${extra}`;
  const deps: { kind: string; name: string }[] = Object.entries(m.dependencies as Record<string, string[]>).flatMap(([k, xs]) => xs.map((name) => ({ kind: k.replace(/s$/, ''), name })));
  const highFindings = v.findings.filter((f: any) => f.severity !== 'info');

  let files: { path: string; content: string }[] = [];
  if (tab === 'files') files = (await serverApi(`/artifacts/${owner}/${slug}/versions/${v.version}/files`)).data.files ?? [];
  const selected = files.find((f) => f.path === sp.file) ?? files.find((f) => /readme/i.test(f.path)) ?? files[0];

  return (
    <div className="wrap py-12">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted">
        <Link href={`/search?type=${a.type}`} className="hover:text-fg">{typeLabel(a.type)}</Link><span>/</span>
        <Link href={`/u/${a.owner}`} className="hover:text-fg">{a.owner}</Link>
      </div>
      <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <h1 className="h-display text-4xl sm:text-5xl">{a.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">{a.description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Trust a={a} /><GovBadge gov={a.governance} />
            {a.visibility !== 'public' && <Badge tone="warn">{a.visibility}{a.team ? ` · ${a.team.name}` : ''}</Badge>}
            <span className="text-muted">by <Link href={`/u/${a.owner}`} className="text-fg hover:underline">{a.author}</Link></span>
            <span className="font-mono text-muted">v{v.version}</span>
            {a.rating && <span className="text-muted">★ {a.rating} <span className="text-muted/70">({a.ratingCount})</span></span>}
            <span className="text-muted">{num(a.installs)} installs</span>
            {a.githubStars != null && <a href={`https://github.com/${a.githubRepo}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-fg" title="Stars of the source repository on GitHub">★ {num(a.githubStars)} on GitHub</a>}
            {a.license && <span className="text-muted">{a.license}</span>}
          </div>
          {a.governance?.status === 'blocked' && <div className="callout callout-bad mt-6">This artifact is blocked by {a.governance.org}. The CLI will refuse to install it.</div>}

          <nav className="tabs mt-10" aria-label="Sections">
            {TABS.map(([id, label]) => (
              <Link key={id} href={q(`tab=${id}`)} className={cx('tab', tab === id && 'is-active')}>{label}</Link>
            ))}
          </nav>

          <div className="pt-8">
            {tab === 'readme' && (v.readme ? <Markdown>{v.readme}</Markdown> : <Empty>This artifact has no README.</Empty>)}

            {tab === 'files' && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
                <ul className="min-w-0 space-y-0.5 text-sm">
                  {files.map((f) => (
                    <li key={f.path}><Link href={q(`tab=files&file=${encodeURIComponent(f.path)}`)} className={cx('block truncate rounded-[10px] px-2.5 py-1.5 font-mono text-xs hover:bg-quiet', selected?.path === f.path && 'bg-surface font-semibold shadow-[0_1px_0_var(--border),0_6px_16px_-12px_rgb(36_36_34/.45)]')}>{f.path}</Link></li>
                  ))}
                </ul>
                <div className="card min-w-0 overflow-hidden">
                  <div className="border-b border-border bg-subtle px-4 py-2 font-mono text-xs text-muted">{selected?.path}</div>
                  <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6">{selected?.content}</pre>
                </div>
              </div>
            )}

            {tab === 'versions' && (
              <div>
                <p className="mb-4 text-sm text-muted">Releases are immutable. Each version is content-hashed.</p>
                <ul className="card divide-y divide-border">
                  {a.versions.map((x: any) => (
                    <li key={x.version} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                      <Link href={`${base}?version=${x.version}`} className="font-mono font-medium hover:underline">v{x.version}{x.version === a.latestVersion && <Badge className="ml-2">latest</Badge>}</Link>
                      <span className="hidden font-mono text-xs text-muted sm:block">sha256:{x.sha256.slice(0, 16)}…</span>
                      <span className="text-muted">{new Date(x.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === 'security' && (
              <div className="space-y-8">
                <div>
                  <h2 className="h-card mb-3 text-xl">Requested permissions</h2>
                  {v.risk.length ? (
                    <ul className="card divide-y divide-border">
                      {v.risk.map((x: any, i: number) => (
                        <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                          <Badge tone={x.level === 'high' ? 'warn' : 'neutral'}>{x.level}</Badge>
                          <div><div className="font-medium">{x.label}</div><div className="text-muted">{x.detail}</div></div>
                        </li>
                      ))}
                    </ul>
                  ) : <Empty>No special permissions requested.</Empty>}
                </div>
                <div>
                  <h2 className="h-card mb-3 text-xl">Static scan</h2>
                  {highFindings.length ? (
                    <ul className="card divide-y divide-border">
                      {highFindings.map((f: any, i: number) => (
                        <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm"><Badge tone={f.severity === 'high' ? 'bad' : 'warn'}>{f.severity}</Badge><div><div>{f.message}</div><div className="font-mono text-xs text-muted">{f.file}:{f.line}</div></div></li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">No suspicious patterns found. aidevkit never executes scripts from an artifact when installing it.</p>}
                  <p className="mt-3 break-all font-mono text-xs text-muted">sha256 {v.sha256}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-6 rounded-3xl p-6">
            <div>
              <div className="label mb-2">Install</div>
              <CopyCommand command={a.installCommand} />
              <p className="mt-2 text-xs text-muted">Pin a version: <span className="font-mono">{a.installCommand}@{v.version}</span></p>
            </div>
            {a.githubStars != null && (
              <a href={`https://github.com/${a.githubRepo}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-border bg-bg px-3.5 py-3 hover:border-strong">
                <span className="flex items-center gap-2"><span className="text-lg leading-none">★</span><span className="h-card text-xl">{num(a.githubStars)}</span></span>
                <span className="text-right text-xs text-muted">stars on GitHub<br /><span className="font-mono">{a.githubRepo}</span></span>
              </a>
            )}
            <div className="flex items-center gap-3"><StarButton refPath={`${owner}/${slug}`} starred={a.starred} stars={a.stars} /><span className="text-xs text-muted">{num(a.installs)} installs via aidevkit</span></div>
            <Side title="Compatible with"><Compat compat={m.compatibility} /></Side>
            {deps.length > 0 && (
              <Side title="Requires">
                <ul className="space-y-1 text-sm">{deps.map((d) => <li key={d.kind + d.name} className="flex justify-between"><Link href={`/search?q=${d.name}`} className="hover:underline">{d.name}</Link><span className="text-muted">{d.kind}</span></li>)}</ul>
              </Side>
            )}
            <Side title="Permissions">
              {v.risk.length ? (
                <ul className="space-y-1.5 text-sm">{v.risk.slice(0, 5).map((x: any, i: number) => <li key={i} className="flex items-center gap-2"><span className={x.level === 'high' ? 'text-warn' : 'text-muted'}>●</span>{x.label}</li>)}</ul>
              ) : <span className="text-sm text-muted">None requested</span>}
              <Link href={q('tab=security')} className="link mt-2 inline-block text-xs font-semibold">Details →</Link>
            </Side>
            {m.tags?.length > 0 && <Side title="Capabilities"><div className="flex flex-wrap gap-1.5">{m.tags.map((t: string) => <Link key={t} href={`/search?q=${t}`}><Badge>{t}</Badge></Link>)}</div></Side>}
            {(a.repository || a.homepage) && <Side title="Links">{[a.repository, a.homepage].filter(Boolean).map((u: string) => <a key={u} href={u} className="link block truncate text-sm" target="_blank" rel="noopener noreferrer">{u}</a>)}</Side>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="label mb-2">{title}</div>{children}</div>;
}

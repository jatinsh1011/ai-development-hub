import Link from 'next/link';
import type { ArtifactSummary, Gov } from '@/lib/types';
import { typeLabel } from '@/lib/types';
import { Compat } from './Compat';
import { Badge } from './ui';

export const num = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString('en-US'));

export function GovBadge({ gov }: { gov?: Gov | null }) {
  if (!gov) return null;
  if (gov.status === 'approved') return <Badge tone="ok">✓ Approved by {gov.org}</Badge>;
  if (gov.status === 'blocked') return <Badge tone="bad">✕ Blocked by {gov.org}</Badge>;
  return <Badge tone="warn">⚠ External</Badge>;
}

export function Trust({ a }: { a: Pick<ArtifactSummary, 'official' | 'verified'> }) {
  if (a.official) return <Badge tone="ok">Official</Badge>;
  if (a.verified) return <Badge tone="ok">Verified</Badge>;
  return null;
}

export function ArtifactCard({ a, gov, org }: { a: ArtifactSummary; gov?: Gov | null; org?: string }) {
  return (
    <Link href={`/a/${a.owner}/${a.slug}`} className="group flex flex-col gap-3 rounded-xl border border-border p-5 hover:border-strong hover:bg-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium tracking-tight group-hover:underline underline-offset-4">{a.title}</div>
          <div className="truncate font-mono text-xs text-muted">{a.owner}/{a.slug}</div>
        </div>
        <span className="shrink-0 rounded-md bg-code px-1.5 py-0.5 text-[11px] font-medium text-muted">{typeLabel(a.type)}</span>
      </div>
      <p className="line-clamp-2 text-sm text-muted">{a.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted">
        <span className="font-mono">v{a.latestVersion}</span>
        <span>{num(a.installs)} installs</span>
        {a.rating && <span>★ {a.rating}</span>}
        {a.githubStars != null && <span title={`Stars of ${a.githubRepo} on GitHub`}>★ {num(a.githubStars)} on GitHub</span>}
        <Trust a={a} />
        <GovBadge gov={gov} />
        {org && <Badge>{org}</Badge>}
        {a.visibility !== 'public' && <Badge tone="warn">{a.visibility}</Badge>}
      </div>
      <Compat compat={a.compat} compact />
    </Link>
  );
}

export function ArtifactGrid({ items, gov }: { items: ArtifactSummary[]; gov?: Record<string, Gov | null> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => <ArtifactCard key={a.id} a={a} gov={gov?.[a.id]} />)}
    </div>
  );
}

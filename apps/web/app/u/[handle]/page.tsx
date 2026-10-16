import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArtifactGrid } from '@/components/ArtifactCard';
import { Empty, cx } from '@/components/ui';
import { currentUser, serverApi } from '@/lib/server';

export const dynamic = 'force-dynamic';
const TABS = [
  ['published', 'Published'],
  ['installed', 'Installed'],
  ['starred', 'Starred'],
  ['forked', 'Forked'],
] as const;

export default async function Profile({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { handle } = await params;
  const tab = (await searchParams).tab ?? 'published';
  const r = await serverApi(`/users/${handle}`);
  if (r.status !== 200) notFound();
  const me = await currentUser();
  const d = r.data;
  const items = d[tab] ?? [];
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="mb-10 flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-xl font-semibold text-accent-fg">{d.user.handle[0].toUpperCase()}</span>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">{d.user.name}</h1>
          <p className="font-mono text-sm text-muted">@{d.user.handle}</p>
        </div>
      </div>
      <nav className="mb-8 flex gap-6 border-b border-border text-sm">
        {TABS.map(([id, label]) => (
          <Link key={id} href={`/u/${handle}?tab=${id}`} className={cx('-mb-px border-b-2 pb-3', tab === id ? 'border-fg font-medium' : 'border-transparent text-muted hover:text-fg')}>
            {label} <span className="text-muted">{d[id]?.length ?? 0}</span>
          </Link>
        ))}
      </nav>
      {items.length ? <ArtifactGrid items={items} /> : <Empty>{tab === 'installed' && me?.handle !== handle ? 'Install history is only visible to its owner.' : 'Nothing here yet.'}</Empty>}
    </div>
  );
}

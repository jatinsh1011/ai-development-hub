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
    <div className="wrap py-14">
      <div className="mb-10 flex items-center gap-4">
        <span className="avatar h-14 w-14 rounded-2xl text-2xl">{d.user.handle[0].toUpperCase()}</span>
        <div>
          <h1 className="h-display text-4xl">{d.user.name}</h1>
          <p className="font-mono text-sm text-muted">@{d.user.handle}</p>
        </div>
      </div>
      <nav className="tabs mb-8">
        {TABS.map(([id, label]) => (
          <Link key={id} href={`/u/${handle}?tab=${id}`} className={cx('tab', tab === id && 'is-active')}>
            {label} <span className="count">{d[id]?.length ?? 0}</span>
          </Link>
        ))}
      </nav>
      {items.length ? <ArtifactGrid items={items} /> : <Empty>{tab === 'installed' && me?.handle !== handle ? 'Install history is only visible to its owner.' : 'Nothing here yet.'}</Empty>}
    </div>
  );
}

import type { Metadata } from 'next';
import { SearchClient } from '@/components/SearchClient';
import { serverApi } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const orgs = (await serverApi<{ orgs: { slug: string; name: string }[] }>('/orgs')).data.orgs ?? [];
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SearchClient orgs={orgs} initial={{ q: p.q ?? '', type: p.type ?? '', provider: p.provider ?? '', language: p.language ?? '', framework: p.framework ?? '', sort: p.sort ?? '', verified: p.verified === 'true', official: p.official === 'true', org: p.org ?? '' }} />
    </div>
  );
}

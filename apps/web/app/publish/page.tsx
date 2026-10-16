import { PublishClient } from '@/components/PublishClient';
import { currentUser, serverApi } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Publish' };

export default async function PublishPage() {
  const user = await currentUser();
  const orgs = user ? ((await serverApi<{ orgs: any[] }>('/orgs')).data.orgs ?? []) : [];
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Publish a building block</h1>
      <p className="mb-10 mt-3 text-lg text-muted">Validated before it ships: manifest, entry file, permissions and a static scan.</p>
      <PublishClient me={user?.handle ?? null} orgs={orgs} />
    </div>
  );
}

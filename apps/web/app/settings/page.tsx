import { redirect } from 'next/navigation';
import { TokenManager } from '@/components/OrgForms';
import { currentUser, serverApi } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API tokens' };

export default async function Settings() {
  if (!(await currentUser())) redirect('/login');
  const tokens = (await serverApi('/auth/tokens')).data.tokens ?? [];
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">API tokens</h1>
      <p className="mb-8 mt-3 text-muted">
        For CI and coding agents. Set <span className="font-mono text-sm">AIDEV_TOKEN</span> and every <span className="font-mono text-sm">aidev</span> command authenticates without a prompt.
      </p>
      <TokenManager tokens={tokens} />
    </div>
  );
}

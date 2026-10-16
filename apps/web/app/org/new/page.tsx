import { redirect } from 'next/navigation';
import { CreateOrgForm } from '@/components/OrgForms';
import { currentUser } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New organization' };

export default async function NewOrg() {
  if (!(await currentUser())) redirect('/login');
  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">Create a company hub</h1>
      <p className="mb-8 mt-3 text-muted">A private registry for your teams’ agents, skills, MCP servers and prompts — with approvals and policies.</p>
      <CreateOrgForm />
    </div>
  );
}

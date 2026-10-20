import { redirect } from 'next/navigation';
import { CreateOrgForm } from '@/components/OrgForms';
import { currentUser } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New organization' };

export default async function NewOrg() {
  if (!(await currentUser())) redirect('/login');
  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <h1 className="h-display text-4xl">Create a company hub</h1>
      <p className="mb-8 mt-4 text-muted">A private registry for your teams’ agents, skills, MCP servers and prompts — with approvals and policies.</p>
      <div className="card p-6 sm:p-8"><CreateOrgForm /></div>
    </div>
  );
}

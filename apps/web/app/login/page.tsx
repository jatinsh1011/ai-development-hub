import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: 'Log in' };

export default function Page() {
  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="mb-8 text-3xl font-semibold tracking-[-0.03em]">Log in</h1>
      <AuthForm mode="login" />
      <p className="mt-6 text-xs text-muted">Seeded demo accounts: demo@example.com · alice@acme.dev (company admin) · password123</p>
    </div>
  );
}

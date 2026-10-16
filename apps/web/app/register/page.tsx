import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: 'Create your account' };

export default function Page() {
  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="mb-8 text-3xl font-semibold tracking-[-0.03em]">Create your account</h1>
      <AuthForm mode="register" />
    </div>
  );
}

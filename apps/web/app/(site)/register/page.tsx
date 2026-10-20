import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: 'Create your account' };

export default function Page() {
  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <h1 className="h-display mb-8 text-4xl">Create your account</h1>
      <div className="card p-6 sm:p-8"><AuthForm mode="register" /></div>
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, Label } from './ui';
import { clientApi, setToken } from '@/lib/client';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reg = mode === 'register';
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        const f = new FormData(e.currentTarget);
        const r = await clientApi<{ token: string; error?: string }>(`/auth/${mode}`, { method: 'POST', body: Object.fromEntries(f) });
        setBusy(false);
        if (r.status >= 400 || r.status === 0) return setErr(r.data.error ?? 'Something went wrong');
        setToken(r.data.token);
        router.push('/');
        router.refresh();
      }}
    >
      {reg && (
        <div>
          <Label>Handle</Label>
          <Input name="handle" required placeholder="your-handle" pattern="[a-z0-9][a-z0-9\-]{1,38}" title="lowercase letters, digits, dashes" />
        </div>
      )}
      {reg && (
        <div>
          <Label>Name</Label>
          <Input name="name" placeholder="Your name" />
        </div>
      )}
      <div>
        <Label>Email</Label>
        <Input name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label>Password</Label>
        <Input name="password" type="password" required minLength={8} autoComplete={reg ? 'new-password' : 'current-password'} />
      </div>
      {err && (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      )}
      <Button className="h-10 w-full" disabled={busy}>
        {busy ? '…' : reg ? 'Create account' : 'Log in'}
      </Button>
      <p className="text-center text-sm text-muted">
        {reg ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-fg underline underline-offset-4">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/register" className="text-fg underline underline-offset-4">
              Create an account
            </Link>
          </>
        )}
      </p>
      <div className="rounded-lg border border-dashed border-strong p-3 text-center text-xs text-muted">
        GitHub sign-in is on the roadmap. The account model already supports it.
      </div>
    </form>
  );
}

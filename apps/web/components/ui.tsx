import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const btn = 'btn';
const variants = {
  primary: 'btn-primary',
  secondary: 'btn-quiet',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
} as const;

export function Button({ variant = 'primary', className, ...p }: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
  return <button className={cx(btn, variants[variant], className)} {...p} />;
}
export function ButtonLink({ variant = 'primary', className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={cx(btn, variants[variant], className)} {...p} />;
}

export function Input({ className, ...p }: ComponentProps<'input'>) {
  return <input className={cx('field', className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<'select'>) {
  return <select className={cx('field', className)} {...p} />;
}
export function Label({ children }: { children: ReactNode }) {
  return <label className="label mb-1.5 block">{children}</label>;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad'; children: ReactNode; className?: string }) {
  const t = { neutral: '', ok: 'tag-ok', warn: 'tag-warn', bad: 'tag-bad' }[tone];
  return <span className={cx('tag', t, className)}>{children}</span>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="h-section">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-strong bg-surface/60 px-6 py-12 text-center text-sm text-muted">{children}</div>;
}

export const Check = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

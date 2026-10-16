import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium h-9 px-4 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none cursor-pointer';
const variants = {
  primary: 'bg-accent text-accent-fg hover:opacity-85',
  secondary: 'border border-strong bg-bg hover:bg-subtle',
  ghost: 'hover:bg-subtle text-muted hover:text-fg',
  danger: 'border border-bad/40 text-bad hover:bg-bad/10',
} as const;

export function Button({ variant = 'primary', className, ...p }: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
  return <button className={cx(btn, variants[variant], className)} {...p} />;
}
export function ButtonLink({ variant = 'primary', className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={cx(btn, variants[variant], className)} {...p} />;
}

export function Input({ className, ...p }: ComponentProps<'input'>) {
  return <input className={cx('h-10 w-full rounded-lg border border-strong bg-bg px-3 text-sm placeholder:text-muted/70 focus:border-fg focus:outline-none', className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<'select'>) {
  return <select className={cx('h-10 rounded-lg border border-strong bg-bg px-3 text-sm focus:border-fg focus:outline-none', className)} {...p} />;
}
export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted">{children}</label>;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad'; children: ReactNode; className?: string }) {
  const t = { neutral: 'border-border text-muted', ok: 'border-ok/30 text-ok', warn: 'border-warn/40 text-warn', bad: 'border-bad/40 text-bad' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4', t, className)}>{children}</span>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-10">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-strong px-6 py-12 text-center text-sm text-muted">{children}</div>;
}

export const Check = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

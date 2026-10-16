'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearToken, clientApi } from '@/lib/client';
import type { User } from '@/lib/types';

export function UserMenu({ user, orgs }: { user: User; orgs: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const item = 'block rounded-md px-3 py-1.5 text-sm hover:bg-subtle';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm hover:bg-subtle cursor-pointer" aria-expanded={open}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{user.handle[0].toUpperCase()}</span>
        <span className="hidden sm:inline">{user.handle}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-strong bg-bg p-1.5 shadow-lg shadow-black/5" onClick={() => setOpen(false)}>
          <Link className={item} href={`/u/${user.handle}`}>Profile</Link>
          <Link className={item} href="/publish">Publish an artifact</Link>
          <Link className={item} href="/settings">API tokens</Link>
          <div className="my-1.5 border-t border-border" />
          <div className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Company hubs</div>
          {orgs.map((o) => <Link key={o.slug} className={item} href={`/org/${o.slug}`}>{o.name}</Link>)}
          <Link className={`${item} text-muted`} href="/org/new">+ New organization</Link>
          <div className="my-1.5 border-t border-border" />
          <button className={`${item} w-full text-left cursor-pointer`} onClick={async () => { await clientApi('/auth/logout', { method: 'POST' }); clearToken(); router.push('/'); router.refresh(); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

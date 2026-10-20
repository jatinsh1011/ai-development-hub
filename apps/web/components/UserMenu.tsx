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
  const item = 'menu-item';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex h-10 items-center gap-2.5 rounded-full px-2.5 text-sm font-semibold hover:bg-quiet cursor-pointer" aria-expanded={open}>
        <span className="avatar h-7 w-7 text-[13px]">{user.handle[0].toUpperCase()}</span>
        <span className="hidden sm:inline">{user.handle}</span>
      </button>
      {open && (
        <div className="menu absolute right-0 mt-2 w-60" onClick={() => setOpen(false)}>
          <Link className={item} href={`/u/${user.handle}`}>Profile</Link>
          <Link className={item} href="/publish">Publish an artifact</Link>
          <Link className={item} href="/settings">API tokens</Link>
          <div className="my-1.5 border-t border-border" />
          <div className="label px-3 pb-1 pt-1">Company hubs</div>
          {orgs.map((o) => <Link key={o.slug} className={item} href={`/org/${o.slug}`}>{o.name}</Link>)}
          <Link className={`${item} text-muted`} href="/org/new">+ New organization</Link>
          <div className="my-1.5 border-t border-border" />
          <button className={`${item} w-full text-left cursor-pointer`} onClick={async () => { await clientApi('/auth/logout', { method: 'POST' }); clearToken(); router.push('/'); router.refresh(); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

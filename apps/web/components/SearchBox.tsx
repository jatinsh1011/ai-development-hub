'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function SearchBox({ initial = '', large = false, autoFocus = false }: { initial?: string; large?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`); }} role="search" className="relative">
      <svg className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${large ? 'left-5' : 'left-3.5'}`} width={large ? 20 : 16} height={large ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
      <input
        ref={ref} autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the Hub"
        placeholder="Search agents, skills, MCPs, prompts…"
        className={`w-full rounded-xl border border-strong bg-bg placeholder:text-muted/70 focus:border-fg focus:outline-none ${large ? 'h-14 pl-13 pr-16 text-lg' : 'h-10 pl-10 pr-10 text-sm'}`}
        style={large ? { paddingLeft: 52 } : undefined}
      />
      <kbd className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 font-mono text-xs text-muted sm:block ${large ? 'right-5' : 'right-3'}`}>/</kbd>
    </form>
  );
}

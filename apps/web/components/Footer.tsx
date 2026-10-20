import Link from 'next/link';
import { GITHUB_URL } from '@/lib/site';
import { BlocksMark } from './landing/BlocksMark';

export function Footer() {
  return (
    <footer className="wrap mt-24 grid gap-7 pb-10 pt-12">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <a href="/" className="brand"><BlocksMark className="brand-mark" />aidev.</a>
          <p className="mt-2.5 text-sm text-muted">the package manager for your AI coding tools.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/search" className="btn btn-primary">Browse the hub <span className="font-normal">→</span></Link>
          <Link href="/docs" className="btn btn-quiet">Read the docs <span className="font-normal">→</span></Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-6">
        <nav className="flex flex-wrap gap-2.5" aria-label="Footer">
          <Link className="foot-chip" href="/search"><span className="icon-sq"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></svg></span>browse</Link>
          <Link className="foot-chip c-orange" href="/explore"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" /></svg></span>featured</Link>
          <Link className="foot-chip c-pink" href="/docs"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M5 7l5 5-5 5M12 17h7" /></svg></span>cli docs</Link>
          <Link className="foot-chip c-green" href="/publish"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M12 20V8m-5 5 5-5 5 5M5 4h14" /></svg></span>publish</Link>
          <a className="foot-chip c-purple" href={GITHUB_URL} rel="noopener"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.4 5.6-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.6 2.6 5.6 2.9 5.6 2.9a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.2 9.3c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21" /></svg></span>github ↗</a>
        </nav>
        <div className="flex gap-5 text-sm text-muted"><Link href="/docs" className="hover:text-fg">for coding agents</Link><span>© 2026 aidev</span></div>
      </div>
    </footer>
  );
}

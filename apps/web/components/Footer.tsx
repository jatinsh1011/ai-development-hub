import Link from 'next/link';
import { Mark } from './Logo';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-fg"><Mark size={16} /> AI Development Hub</div>
        <nav className="flex gap-6">
          <Link href="/search" className="hover:text-fg">Browse</Link>
          <Link href="/publish" className="hover:text-fg">Publish</Link>
          <Link href="/docs" className="hover:text-fg">CLI &amp; agents</Link>
        </nav>
        <p>Reusable AI development building blocks.</p>
      </div>
    </footer>
  );
}

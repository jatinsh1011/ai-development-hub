import Link from 'next/link';
import { currentUser, serverApi } from '@/lib/server';
import { BlocksMark } from './landing/BlocksMark';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { ButtonLink } from './ui';

export async function Header() {
  const user = await currentUser();
  const orgs = user ? (await serverApi<{ orgs: { slug: string; name: string }[] }>('/orgs')).data.orgs ?? [] : [];
  return (
    <header className="app-header">
      <div className="wrap flex h-[76px] items-center gap-2 sm:gap-4">
        {/* "/" is the landing page, a separate root layout, so a plain link (full page load) is right here */}
        <a href="/" className="brand" aria-label="aidevkit home"><BlocksMark className="brand-mark" />aidevkit.</a>
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          <Link href="/explore" className="nav-link">explore</Link>
          <Link href="/search" className="nav-link">browse</Link>
          <Link href="/publish" className="nav-link">publish</Link>
          <Link href="/docs" className="nav-link">docs</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:ml-3">
          <ThemeToggle />
          {user ? <UserMenu user={user} orgs={orgs} /> : (
            <>
              <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
              <ButtonLink href="/register">Sign up <span className="hidden font-normal sm:inline">→</span></ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

import Link from 'next/link';
import { currentUser, serverApi } from '@/lib/server';
import { Mark } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { ButtonLink } from './ui';

export async function Header() {
  const user = await currentUser();
  const orgs = user ? (await serverApi<{ orgs: { slug: string; name: string }[] }>('/orgs')).data.orgs ?? [] : [];
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Mark /> <span>AI Development Hub</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm text-muted sm:flex">
          <Link href="/search" className="rounded-md px-3 py-1.5 hover:bg-subtle hover:text-fg">Browse</Link>
          <Link href="/publish" className="rounded-md px-3 py-1.5 hover:bg-subtle hover:text-fg">Publish</Link>
          <Link href="/docs" className="rounded-md px-3 py-1.5 hover:bg-subtle hover:text-fg">CLI</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? <UserMenu user={user} orgs={orgs} /> : (
            <>
              <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
              <ButtonLink href="/register">Sign up</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

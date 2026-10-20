import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { rounded } from '@/lib/fonts';
import { SITE_URL } from '@/lib/site';
import '../globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'AI Development Hub — Reusable AI development building blocks', template: '%s · AI Development Hub' },
  description: 'Discover, publish, install and share agents, skills, MCP servers, prompts and workflows across your AI development tools.',
};

const themeScript = `try{var t=localStorage.getItem('aidev-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rounded.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

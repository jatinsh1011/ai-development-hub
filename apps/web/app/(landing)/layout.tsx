import type { Metadata, Viewport } from 'next';
import { rounded } from '@/lib/fonts';
import { SITE_URL } from '@/lib/site';
import './landing.css';

export const metadata: Metadata = { metadataBase: new URL(SITE_URL) };

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fffdf9' },
    { media: '(prefers-color-scheme: dark)', color: '#191a1d' },
  ],
};

// Apply a saved theme before first paint; without one the page follows the OS. Same key as the rest of the site.
const themeScript = `try{var t=localStorage.getItem('aidev-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rounded.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}

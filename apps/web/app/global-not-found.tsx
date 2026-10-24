import type { Metadata } from 'next';
import { BlocksMark } from '@/components/landing/BlocksMark';
import { rounded } from '@/lib/fonts';
import './(landing)/landing.css';

export const metadata: Metadata = { title: 'Page not found · aidevkit' };

const themeScript = `try{var t=localStorage.getItem('aidev-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function GlobalNotFound() {
  return (
    <html lang="en" className={rounded.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <main className="wrap" style={{ minHeight: '100vh', display: 'grid', alignContent: 'center', gap: 28, paddingBlock: 64 }}>
          <BlocksMark className="closing-mark" />
          <h1 className="display">that block<br /><span className="accent">isn’t installed.</span></h1>
          <p className="lede">The page you asked for doesn’t exist. It may have moved, or the link has a typo.</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <a className="btn" href="/">Go home <span className="arrow">→</span></a>
            <a className="btn btn-quiet" href="/search">Search the hub <span className="arrow">→</span></a>
          </div>
        </main>
      </body>
    </html>
  );
}

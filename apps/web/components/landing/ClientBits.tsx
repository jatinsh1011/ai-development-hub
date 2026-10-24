'use client';
import { useEffect, useState } from 'react';

/** Copies the install command; the button itself shows the command, like a terminal line. */
export function CopyInstall({ command = 'npm i -g aidevkit-cli', className = 'btn btn-copy' }: { command?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try { await navigator.clipboard.writeText(command); setCopied(true); } catch { setCopied(false); }
      }}
      aria-label={copied ? 'Copied to clipboard' : `Copy “${command}”`}
    >
      <span><span className="dollar">$ </span>{command}</span>
      {copied ? (
        <span aria-hidden>copied ✓</span>
      ) : (
        <svg className="copy-ico" viewBox="0 0 24 24" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>
      )}
    </button>
  );
}

/** Light/dark switch. Shares the `aidev-theme` key with the rest of the site. */
export function ThemeSwitch() {
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Switch between light and dark theme"
      onClick={() => {
        const root = document.documentElement;
        const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        root.dataset.theme = dark ? 'light' : 'dark';
        try { localStorage.setItem('aidev-theme', root.dataset.theme); } catch { /* private mode */ }
      }}
    >
      <svg className="sun" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      <svg className="moon" viewBox="0 0 24 24" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
    </button>
  );
}

/** Compacts the sticky header after a little scroll. */
export function ScrollFlag() {
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => root.toggleAttribute('data-scrolled', scrollY > 8);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);
  return null;
}

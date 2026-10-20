'use client';
import { useState } from 'react';

export function CopyCommand({ command, className = '' }: { command: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(command); setDone(true); setTimeout(() => setDone(false), 1400); }}
      className={`group flex w-full items-center justify-between gap-3 rounded-xl border border-strong bg-surface px-3.5 py-2.5 text-left font-mono text-[13px] hover:border-link cursor-pointer ${className}`}
      aria-label={`Copy ${command}`}
    >
      <span className="min-w-0 break-all"><span className="text-muted select-none">$ </span>{command}</span>
      <span className="shrink-0 rounded-full bg-quiet px-2.5 py-1 font-sans text-xs font-semibold text-fg">{done ? 'Copied ✓' : 'Copy'}</span>
    </button>
  );
}

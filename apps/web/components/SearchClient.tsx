'use client';
import { useEffect, useRef, useState } from 'react';
import { ArtifactCard } from './ArtifactCard';
import { Empty, Select } from './ui';
import { clientApi } from '@/lib/client';
import type { ArtifactSummary } from '@/lib/types';

const TYPE_TABS = [['', 'All'], ['agent', 'Agents'], ['skill', 'Skills'], ['mcp', 'MCPs'], ['prompt', 'Prompts'], ['plugin', 'Plugins'], ['workflow', 'Workflows'], ['instruction', 'Instructions']] as const;
const LANGS = ['typescript', 'javascript', 'java', 'python', 'sql'];
const FRAMEWORKS = ['react', 'spring-boot', 'kubernetes', 'docker', 'mui', 'jest'];

export interface Filters { q: string; type: string; provider: string; language: string; framework: string; sort: string; verified: boolean; official: boolean; org: string }

export function SearchClient({ initial, orgs }: { initial: Filters; orgs: { slug: string; name: string }[] }) {
  const [f, setF] = useState<Filters>(initial);
  const [res, setRes] = useState<{ total: number; items: ArtifactSummary[] } | null>(null);
  const [err, setErr] = useState('');
  const seq = useRef(0);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const p = new URLSearchParams();
      if (f.q) p.set('q', f.q);
      for (const k of ['type', 'provider', 'language', 'framework', 'sort', 'org'] as const) if (f[k]) p.set(k, f[k]);
      if (f.verified) p.set('verified', 'true');
      if (f.official) p.set('official', 'true');
      history.replaceState(null, '', p.toString() ? `/search?${p}` : '/search');
      p.set('limit', '30');
      const r = await clientApi<{ total: number; items: ArtifactSummary[]; error?: string }>(`/artifacts?${p}`);
      if (id !== seq.current) return; // a newer keystroke superseded this request
      if (r.status !== 200) setErr(r.data.error ?? 'Search failed'); else { setErr(''); setRes(r.data); }
    }, 140);
    return () => clearTimeout(t);
  }, [f]);

  return (
    <div>
      <div className="relative">
        <svg className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
        <input autoFocus value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Search agents, skills, MCPs, prompts…" aria-label="Search the Hub"
          className="field search-field pr-5" style={{ paddingLeft: 52 }} />
      </div>

      <div className="tabs mt-6" role="tablist" aria-label="Artifact type">
        {TYPE_TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={f.type === id} onClick={() => set('type', id)}
            className="tab">{label}</button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <Select aria-label="Provider" value={f.provider} onChange={(e) => set('provider', e.target.value)}>
          <option value="">Any provider</option><option value="copilot">GitHub Copilot</option><option value="claude">Claude Code</option><option value="codex">Codex</option>
        </Select>
        <Select aria-label="Language" value={f.language} onChange={(e) => set('language', e.target.value)}><option value="">Any language</option>{LANGS.map((l) => <option key={l}>{l}</option>)}</Select>
        <Select aria-label="Framework" value={f.framework} onChange={(e) => set('framework', e.target.value)}><option value="">Any framework</option>{FRAMEWORKS.map((l) => <option key={l}>{l}</option>)}</Select>
        {orgs.length > 0 && <Select aria-label="Company" value={f.org} onChange={(e) => set('org', e.target.value)}><option value="">Any company</option>{orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}</Select>}
        <label className="flex h-10 items-center gap-2 px-2 text-sm text-muted"><input type="checkbox" checked={f.verified} onChange={(e) => set('verified', e.target.checked)} /> Verified</label>
        <label className="flex h-10 items-center gap-2 px-2 text-sm text-muted"><input type="checkbox" checked={f.official} onChange={(e) => set('official', e.target.checked)} /> Official</label>
        <Select aria-label="Sort" className="ml-auto" value={f.sort} onChange={(e) => set('sort', e.target.value)}>
          <option value="">Best match</option><option value="popular">Most installed</option><option value="github">Most GitHub stars</option><option value="recent">Recently updated</option>
        </Select>
      </div>

      <p className="label mb-4 mt-8" aria-live="polite">{err || (res ? `${res.total} result${res.total === 1 ? '' : 's'}` : 'Searching…')}</p>
      {res && (res.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{res.items.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>
      ) : <Empty>Nothing matches. Try fewer filters, or <a className="link" href="/publish">publish the building block you need</a>.</Empty>)}
    </div>
  );
}

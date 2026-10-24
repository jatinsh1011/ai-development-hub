'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Input, Label, Select } from './ui';
import { clientApi, getToken } from '@/lib/client';

interface F {
  path: string;
  content: string;
}
const SKIP = /(^|\/)(node_modules|\.git|\.aidev|dist|\.next)(\/|$)|\.DS_Store$/;
type Org = { slug: string; name: string; role: string };

export function PublishClient({ me, orgs }: { me: string | null; orgs: Org[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<F[]>([]);
  const [report, setReport] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [team, setTeam] = useState('');
  const publishable = orgs.filter((o) => o.role !== 'developer');

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setErr('');
    setReport(null);
    const all = Array.from(list);
    const root = (all[0] as any).webkitRelativePath?.split('/')[0];
    const out: F[] = [];
    for (const f of all) {
      const rel = ((f as any).webkitRelativePath || f.name).replace(`${root}/`, '');
      if (SKIP.test(rel) || f.size > 400_000) continue;
      const text = await f.text();
      if (text.includes('\u0000')) continue; // binary files are not supported yet
      out.push({ path: rel, content: text });
    }
    setFiles(out);
    const r = await clientApi('/artifacts/validate', { method: 'POST', body: { files: out } });
    setReport(r.data);
  }

  async function publish() {
    setBusy(true);
    setErr('');
    const r = await clientApi<any>('/artifacts', { method: 'POST', body: { files, owner: owner || undefined, visibility, team: team || undefined } });
    setBusy(false);
    if (r.status === 201 || r.status === 200) {
      router.push(`/a/${r.data.owner}/${r.data.slug}`);
      router.refresh();
    } else setErr(r.data.error + (r.data.issues ? ': ' + r.data.issues.map((i: any) => i.message).join('; ') : ''));
  }

  const errors = report?.issues?.filter((i: any) => i.level === 'error') ?? [];
  const code = 'rounded-md bg-quiet px-1.5 py-0.5 font-mono text-[13px]';
  return (
    <div className="space-y-8">
      {!me && (
        <div className="callout callout-warn">
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>{' '}
          to publish. You can still validate a directory below.
        </div>
      )}

      <label className="block cursor-pointer rounded-3xl border-2 border-dashed border-strong bg-surface/60 p-12 text-center hover:border-link hover:bg-surface">
        <input type="file" className="hidden" multiple onChange={(e) => pick(e.target.files)} {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
        <div className="h-card text-2xl">Choose an artifact directory</div>
        <div className="mt-1 text-sm text-muted">Contains a manifest.json and its entry file (agent.md, SKILL.md, prompt.md…). Text files only.</div>
        {files.length > 0 && <div className="mt-4 font-mono text-xs text-muted">{files.length} files read</div>}
      </label>
      <p className="text-sm text-muted">
        No directory yet? Run <code className={code}>aidevkit init artifact skill my-skill</code>, then <code className={code}>aidevkit publish</code>.
      </p>

      {report && (
        <div className="space-y-6">
          <div>
            <h2 className="h-card mb-3 text-xl">Validation</h2>
            {report.issues.length === 0 && <p className="text-sm text-ok">✓ Manifest and files are valid.</p>}
            <ul className="space-y-1.5 text-sm">
              {report.issues.map((i: any, k: number) => (
                <li key={k} className="flex gap-2">
                  <Badge tone={i.level === 'error' ? 'bad' : 'warn'}>{i.level}</Badge>
                  <span>
                    <span className="font-mono text-xs text-muted">{i.path}</span> {i.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {report.manifest && (
            <div className="card p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">
                  {report.manifest.name} <span className="font-mono text-sm text-muted">@{report.manifest.version}</span>
                </div>
                <Badge>{report.manifest.type}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{report.manifest.description}</p>
              {report.risk.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {report.risk.map((r: any, i: number) => (
                    <li key={i}>
                      <span className={r.level === 'high' ? 'text-warn' : 'text-muted'}>●</span> {r.label} <span className="text-muted">— {r.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {report.findings?.filter((f: any) => f.severity !== 'info').length > 0 && (
            <div>
              <h2 className="h-card mb-3 text-xl">Scan findings</h2>
              <ul className="space-y-1.5 text-sm">
                {report.findings
                  .filter((f: any) => f.severity !== 'info')
                  .map((f: any, i: number) => (
                    <li key={i} className="flex gap-2">
                      <Badge tone={f.severity === 'high' ? 'bad' : 'warn'}>{f.severity}</Badge>
                      <span>
                        {f.message} <span className="font-mono text-xs text-muted">{f.file}:{f.line}</span>
                      </span>
                    </li>
                  ))}
              </ul>
              {report.severity === 'high' && <p className="mt-2 text-sm text-bad">High-severity findings block public publishing.</p>}
            </div>
          )}

          {report.ok && me && (
            <div className="card space-y-4 rounded-3xl p-6">
              <h2 className="h-card text-xl">Publish</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Publish as</Label>
                  <Select
                    className="w-full"
                    value={owner}
                    onChange={(e) => {
                      setOwner(e.target.value);
                      setVisibility(e.target.value ? 'organization' : 'public');
                    }}
                  >
                    <option value="">{me} (personal)</option>
                    {publishable.map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Visibility</Label>
                  <Select className="w-full" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private (just me / admins)</option>
                    {owner && (
                      <>
                        <option value="organization">Organization</option>
                        <option value="team">Team</option>
                      </>
                    )}
                  </Select>
                </div>
                {visibility === 'team' && (
                  <div>
                    <Label>Team slug</Label>
                    <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="platform" />
                  </div>
                )}
              </div>
              {err && (
                <p role="alert" className="text-sm text-bad">
                  {err}
                </p>
              )}
              <div className="flex items-center gap-4">
                <Button onClick={publish} disabled={busy || errors.length > 0 || !getToken()}>
                  {busy ? 'Publishing…' : `Publish ${report.manifest?.name}@${report.manifest?.version}`}
                </Button>
                <span className="text-xs text-muted">Versions are immutable once published.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

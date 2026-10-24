'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, Label, Select } from './ui';
import { clientApi, getToken, setToken } from '@/lib/client';

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ status: number; data: any }>, okText: string) => {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.status >= 200 && r.status < 300) {
      setMsg({ ok: true, text: okText });
      router.refresh();
    } else setMsg({ ok: false, text: r.data.error ?? 'Failed' });
  };
  return { run, msg, busy };
}

const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) =>
  m ? (
    <p role="status" className={`text-sm ${m.ok ? 'text-ok' : 'text-bad'}`}>
      {m.text}
    </p>
  ) : null;

export function CreateOrgForm() {
  const router = useRouter();
  const [err, setErr] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        const r = await clientApi<any>('/orgs', { method: 'POST', body: f });
        if (r.status === 201) {
          router.push(`/org/${r.data.slug}`);
          router.refresh();
        } else setErr(r.data.error ?? 'Failed');
      }}
    >
      <div>
        <Label>Name</Label>
        <Input name="name" required placeholder="Acme Corp" />
      </div>
      <div>
        <Label>URL slug</Label>
        <Input name="slug" required placeholder="acme" pattern="[a-z0-9][a-z0-9\-]{1,38}" />
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
      <Button>Create organization</Button>
    </form>
  );
}

export function CreateTeamForm({ org }: { org: string }) {
  const { run, msg, busy } = useAction();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = Object.fromEntries(new FormData(form));
        run(() => clientApi(`/orgs/${org}/teams`, { method: 'POST', body: f }), 'Team created').then(() => form.reset());
      }}
    >
      <div>
        <Label>Team name</Label>
        <Input name="name" required placeholder="Platform Team" />
      </div>
      <div>
        <Label>Slug</Label>
        <Input name="slug" required placeholder="platform" pattern="[a-z0-9][a-z0-9\-]{1,38}" />
      </div>
      <Button disabled={busy}>Create team</Button>
      <Msg m={msg} />
    </form>
  );
}

export function AddMemberForm({ org, teams }: { org: string; teams: { slug: string; name: string }[] }) {
  const { run, msg, busy } = useAction();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = Object.fromEntries(new FormData(form));
        if (!f.team) delete f.team;
        run(() => clientApi(`/orgs/${org}/members`, { method: 'POST', body: f }), 'Member added').then(() => form.reset());
      }}
    >
      <div>
        <Label>Email or handle</Label>
        <Input name="email" required placeholder="bob@acme.dev" />
      </div>
      <div>
        <Label>Role</Label>
        <Select name="role" defaultValue="developer">
          <option value="developer">Developer</option>
          <option value="maintainer">Maintainer</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <div>
        <Label>Team</Label>
        <Select name="team" defaultValue="">
          <option value="">No team</option>
          {teams.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <Button disabled={busy}>Add member</Button>
      <Msg m={msg} />
    </form>
  );
}

export function PolicyForm({ org }: { org: string }) {
  const { run, msg, busy } = useAction();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = Object.fromEntries(new FormData(form));
        run(() => clientApi(`/orgs/${org}/policies`, { method: 'PUT', body: f }), 'Policy updated').then(() => form.reset());
      }}
    >
      <div>
        <Label>Artifact</Label>
        <Input name="artifact" required placeholder="aidev/github" className="w-64" />
      </div>
      <div>
        <Label>Status</Label>
        <Select name="status" defaultValue="approved">
          <option value="approved">Approved</option>
          <option value="blocked">Blocked</option>
          <option value="none">Clear (external)</option>
        </Select>
      </div>
      <Button disabled={busy}>Set policy</Button>
      <Msg m={msg} />
    </form>
  );
}

export function TokenManager({ tokens }: { tokens: { id: string; name: string; kind: string; createdAt: string; lastUsedAt: string | null }[] }) {
  const { run, msg, busy } = useAction();
  const [fresh, setFresh] = useState('');
  return (
    <div className="space-y-6">
      <form
        className="flex items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          await run(async () => {
            const r = await clientApi<{ token: string }>('/auth/tokens', { method: 'POST', body: f });
            if (r.status === 201 || r.status === 200) setFresh(r.data.token);
            return r;
          }, 'Token created');
        }}
      >
        <div>
          <Label>Token name</Label>
          <Input name="name" placeholder="ci / coding agent" required />
        </div>
        <Button disabled={busy || !getToken()}>Create token</Button>
        <Msg m={msg} />
      </form>
      {fresh && (
        <div className="callout callout-ok">
          <p className="mb-2 text-sm font-medium">Copy this token now — it is shown once.</p>
          <code className="block break-all rounded-xl bg-surface p-3 font-mono text-xs text-fg">{fresh}</code>
          <p className="mt-2 text-xs text-muted">
            Use it as <span className="font-mono">AIDEV_TOKEN</span> or <span className="font-mono">aidevkit login --token</span>.
          </p>
        </div>
      )}
      <ul className="card divide-y divide-border text-sm">
        {tokens.map((t) => (
          <li key={t.id} className="flex justify-between px-4 py-3">
            <span>
              {t.name} <span className="text-muted">· {t.kind}</span>
            </span>
            <span className="text-muted">{t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { setToken };

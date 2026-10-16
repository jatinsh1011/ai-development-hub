import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import type { Change, PlanOp } from './ops.js';

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const mark = (id: string, style: 'html' | 'hash', end: boolean) =>
  style === 'html' ? `<!-- aidev:${end ? 'end' : 'begin'} ${id} -->` : `# aidev:${end ? 'end' : 'begin'} ${id}`;

export function sameTarget(a: PlanOp, b: PlanOp): boolean {
  if (a.kind !== b.kind || a.path !== b.path) return false;
  switch (a.kind) {
    case 'write': return true;
    case 'json-key': return a.keys.join('\0') === (b as typeof a).keys.join('\0');
    case 'json-array': return a.keys.join('\0') === (b as typeof a).keys.join('\0') && a.value[a.idKey] === (b as typeof a).value[a.idKey];
    case 'text-block': return a.id === (b as typeof a).id;
  }
}

type Res = { text: string | null; conflict?: string };

const parseJson = (text: string | null): { obj: Record<string, any> } | { error: string } => {
  if (text === null || !text.trim()) return { obj: {} };
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? { obj: v } : { error: 'not a JSON object' };
  } catch (e) {
    return { error: `cannot parse as strict JSON (comments?): ${(e as Error).message}` };
  }
};
const ser = (o: unknown) => JSON.stringify(o, null, 2) + '\n';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function descend(obj: Record<string, any>, keys: string[], create: boolean): Record<string, any> | null {
  let cur = obj;
  for (const k of keys) {
    if (cur[k] === undefined) { if (!create) return null; cur[k] = {}; }
    if (typeof cur[k] !== 'object' || cur[k] === null) return null;
    cur = cur[k];
  }
  return cur;
}

function blockRe(op: Extract<PlanOp, { kind: 'text-block' }>) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\n?${esc(mark(op.id, op.style, false))}[\\s\\S]*?${esc(mark(op.id, op.style, true))}\\n?`);
}

/** Apply one op to the current file text. `owned` = previously installed by this artifact. */
export function applyOp(op: PlanOp, text: string | null, owned: boolean, force: boolean): Res {
  switch (op.kind) {
    case 'write': {
      if (text !== null && text !== op.content && !owned && !force) return { text, conflict: 'file exists with different content (not installed by aidev, or modified since)' };
      return { text: op.content };
    }
    case 'json-key': {
      const p = parseJson(text);
      if ('error' in p) return { text, conflict: p.error };
      const parent = descend(p.obj, op.keys.slice(0, -1), true);
      const k = op.keys[op.keys.length - 1];
      if (!parent) return { text, conflict: `"${op.keys.slice(0, -1).join('.')}" is not an object` };
      if (parent[k] !== undefined && !same(parent[k], op.value) && !owned && !force) return { text, conflict: `"${op.keys.join('.')}" already defined with a different value` };
      parent[k] = op.value;
      return { text: ser(p.obj) };
    }
    case 'json-array': {
      const p = parseJson(text);
      if ('error' in p) return { text, conflict: p.error };
      const parent = descend(p.obj, op.keys.slice(0, -1), true);
      const k = op.keys[op.keys.length - 1];
      if (!parent) return { text, conflict: `"${op.keys.join('.')}" parent is not an object` };
      const arr: any[] = Array.isArray(parent[k]) ? parent[k] : parent[k] === undefined ? [] : (null as never);
      if (!arr) return { text, conflict: `"${op.keys.join('.')}" is not an array` };
      const i = arr.findIndex((e) => e?.[op.idKey] === op.value[op.idKey]);
      if (i >= 0 && !same(arr[i], op.value) && !owned && !force) return { text, conflict: `entry ${op.idKey}=${String(op.value[op.idKey])} already exists with different content` };
      if (i >= 0) arr[i] = op.value; else arr.push(op.value);
      parent[k] = arr;
      return { text: ser(p.obj) };
    }
    case 'text-block': {
      const block = `${mark(op.id, op.style, false)}\n${op.content.trimEnd()}\n${mark(op.id, op.style, true)}\n`;
      const base = text ?? '';
      const re = blockRe(op);
      if (re.test(base)) return { text: base.replace(re, (m) => (m.startsWith('\n') ? '\n' : '') + block) };
      if (op.conflictRe && new RegExp(op.conflictRe, 'm').test(base) && !force) return { text: base, conflict: `an equivalent entry already exists in this file (/${op.conflictRe}/)` };
      return { text: base ? base.replace(/\n*$/, '\n\n') + block : block };
    }
  }
}

/** Inverse of applyOp. Returns text=null when the file should be deleted. */
export function removeOp(op: PlanOp, text: string | null): Res {
  if (text === null) return { text: null };
  switch (op.kind) {
    case 'write': return text === op.content ? { text: null } : { text, conflict: 'file was modified after install; leaving it in place' };
    case 'json-key': {
      const p = parseJson(text);
      if ('error' in p) return { text, conflict: p.error };
      const chain: Record<string, any>[] = [p.obj];
      for (const k of op.keys.slice(0, -1)) { const n = chain[chain.length - 1][k]; if (!n || typeof n !== 'object') return { text }; chain.push(n); }
      delete chain[chain.length - 1][op.keys[op.keys.length - 1]];
      for (let i = chain.length - 1; i > 0; i--) if (!Object.keys(chain[i]).length) delete chain[i - 1][op.keys[i - 1]];
      return { text: Object.keys(p.obj).length ? ser(p.obj) : null };
    }
    case 'json-array': {
      const p = parseJson(text);
      if ('error' in p) return { text, conflict: p.error };
      const parent = descend(p.obj, op.keys.slice(0, -1), false);
      const k = op.keys[op.keys.length - 1];
      if (parent && Array.isArray(parent[k])) {
        parent[k] = parent[k].filter((e: any) => e?.[op.idKey] !== op.value[op.idKey]);
        if (!parent[k].length) delete parent[k];
      }
      return { text: Object.keys(p.obj).length ? ser(p.obj) : null };
    }
    case 'text-block': {
      const out = text.replace(blockRe(op), '\n');
      return { text: out.trim() ? out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '\n') : null };
    }
  }
}

const readOrNull = async (p: string) => fs.readFile(p, 'utf8').catch(() => null);
const patch = (p: string, a: string | null, b: string | null) => createTwoFilesPatch(a === null ? '/dev/null' : p, b === null ? '/dev/null' : p, a ?? '', b ?? '', '', '', { context: 2 });

/** Compute per-file changes without writing anything. */
export async function computeChanges(ops: PlanOp[], previous: PlanOp[] = [], force = false): Promise<Change[]> {
  const byPath = new Map<string, PlanOp[]>();
  for (const op of ops) byPath.set(op.path, [...(byPath.get(op.path) ?? []), op]);
  const out: Change[] = [];
  for (const [p, fops] of byPath) {
    const before = await readOrNull(p);
    let text = before;
    let conflict: string | undefined;
    for (const op of fops) {
      const prev = previous.find((x) => sameTarget(x, op));
      const owned = !!prev && (op.kind !== 'write' || (prev.kind === 'write' && before !== null && sha(before) === sha(prev.content)));
      const r = applyOp(op, text, owned, force);
      if (r.conflict) { conflict = r.conflict; break; }
      text = r.text;
    }
    const action = conflict ? 'conflict' : before === null ? 'create' : text === before ? 'unchanged' : 'update';
    out.push({ path: p, action, before, after: conflict ? before : text, reason: conflict, diff: action === 'unchanged' ? '' : patch(p, before, conflict ? before : text), ops: fops });
  }
  return out;
}

export async function computeRemovals(ops: PlanOp[]): Promise<Change[]> {
  const byPath = new Map<string, PlanOp[]>();
  for (const op of ops) byPath.set(op.path, [...(byPath.get(op.path) ?? []), op]);
  const out: Change[] = [];
  for (const [p, fops] of byPath) {
    const before = await readOrNull(p);
    let text = before;
    let conflict: string | undefined;
    for (const op of fops) { const r = removeOp(op, text); if (r.conflict) conflict = r.conflict; else text = r.text; if (text === null) break; }
    const action = before === null ? 'unchanged' : conflict ? 'conflict' : text === null ? 'delete' : text === before ? 'unchanged' : 'update';
    out.push({ path: p, action, before, after: text, reason: conflict, diff: action === 'unchanged' || action === 'conflict' ? '' : patch(p, before, text), ops: fops });
  }
  return out;
}

interface BackupMap { id: string; createdAt: string; entries: { path: string; backup: string | null }[] }

/** Write changes atomically-ish: back up first, roll back everything on any failure. */
export async function commit(changes: Change[], backupRoot: string): Promise<string | undefined> {
  const todo = changes.filter((c) => c.action === 'create' || c.action === 'update' || c.action === 'delete');
  if (!todo.length) return undefined;
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
  const dir = path.join(backupRoot, id);
  await fs.mkdir(dir, { recursive: true });
  const map: BackupMap = { id, createdAt: new Date().toISOString(), entries: [] };
  todo.forEach((c, i) => map.entries.push({ path: c.path, backup: c.before === null ? null : String(i) }));
  for (const [i, c] of todo.entries()) if (c.before !== null) await fs.writeFile(path.join(dir, String(i)), c.before);
  await fs.writeFile(path.join(dir, 'map.json'), JSON.stringify(map, null, 2));
  try {
    for (const c of todo) {
      if (c.action === 'delete') await fs.rm(c.path, { force: true });
      else { await fs.mkdir(path.dirname(c.path), { recursive: true }); await fs.writeFile(c.path, c.after ?? ''); }
    }
  } catch (e) {
    await rollback(backupRoot, id);
    throw e;
  }
  return id;
}

/** Restore files recorded in a backup (or a group of backups = one install transaction). */
export async function rollback(backupRoot: string, id: string): Promise<string[]> {
  const dir = path.join(backupRoot, id);
  const mapFile = path.join(dir, 'map.json');
  if (!(await readOrNull(mapFile))) {
    // transaction group: undo members newest-first
    const members = (await fs.readdir(dir)).sort().reverse();
    if (!members.length) throw new Error(`no backup ${id}`);
    const all: string[] = [];
    for (const m of members) all.push(...(await rollback(dir, m)));
    return all;
  }
  const map: BackupMap = JSON.parse(await fs.readFile(mapFile, 'utf8'));
  const restored: string[] = [];
  for (const e of map.entries) {
    if (e.backup === null) await fs.rm(e.path, { force: true });
    else { await fs.mkdir(path.dirname(e.path), { recursive: true }); await fs.writeFile(e.path, await fs.readFile(path.join(dir, e.backup), 'utf8')); }
    restored.push(e.path);
  }
  return restored;
}

export async function listBackups(backupRoot: string): Promise<{ id: string; createdAt: string; files: number }[]> {
  const ids = await fs.readdir(backupRoot).catch(() => [] as string[]);
  const out = [];
  const count = async (dir: string): Promise<{ createdAt: string; files: number } | null> => {
    const raw = await readOrNull(path.join(dir, 'map.json'));
    if (raw) { const m: BackupMap = JSON.parse(raw); return { createdAt: m.createdAt, files: m.entries.length }; }
    const subs = await fs.readdir(dir).catch(() => [] as string[]);
    let files = 0, createdAt = '';
    for (const s of subs.sort()) { const c = await count(path.join(dir, s)); if (c) { files += c.files; createdAt ||= c.createdAt; } }
    return createdAt ? { createdAt, files } : null;
  };
  for (const id of ids.sort()) { const c = await count(path.join(backupRoot, id)); if (c) out.push({ id, ...c }); }
  return out;
}

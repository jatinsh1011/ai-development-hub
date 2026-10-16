export interface SemVer { major: number; minor: number; patch: number; pre?: string }

export function parse(v: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] } : null;
}

export function compare(a: string, b: string): number {
  const x = parse(a), y = parse(b);
  if (!x || !y) throw new Error(`invalid semver: ${!x ? a : b}`);
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** Supports: "latest", "*", "1.2.0", "^1.2.0", "~1.2.0". */
export function satisfies(version: string, range: string): boolean {
  const r = range.trim();
  if (r === 'latest' || r === '*' || r === '') return !parse(version)?.pre;
  const v = parse(version);
  if (!v) return false;
  if (r.startsWith('^') || r.startsWith('~')) {
    const base = parse(r.slice(1));
    if (!base || compare(version, r.slice(1)) < 0 || v.pre) return false;
    if (r[0] === '~') return v.major === base.major && v.minor === base.minor;
    if (base.major > 0) return v.major === base.major;
    return v.major === 0 && v.minor === base.minor;
  }
  return compare(version, r) === 0;
}

export function maxSatisfying(versions: string[], range: string): string | null {
  const ok = versions.filter((v) => satisfies(v, range)).sort(compare);
  return ok.length ? ok[ok.length - 1] : null;
}

export const isMajorBump = (from: string, to: string) => (parse(to)?.major ?? 0) > (parse(from)?.major ?? 0);

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

export interface Doc { data: Record<string, unknown>; body: string }

export function parseFrontmatter(src: string): Doc {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { data: {}, body: src };
  try {
    const data = yamlParse(m[1]);
    return { data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {}, body: m[2] };
  } catch {
    return { data: {}, body: src };
  }
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const y = yamlStringify(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${y}\n---\n\n${body.replace(/^\s+/, '')}${body.endsWith('\n') ? '' : '\n'}`;
}

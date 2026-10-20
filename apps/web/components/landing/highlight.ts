/** Just enough syntax colouring for the demo editor: JSON, TOML, Markdown with front matter, TS. */
export type Lang = 'json' | 'toml' | 'md' | 'ts' | 'text';
export type Tok = { t: string; c?: string };

const TS_KEYWORDS = /\b(import|from|export|default|function|return|const|type|let)\b/;

function json(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null|\d+(?:\.\d+)?)\b/g;
  let last = 0;
  for (let x = re.exec(line); x; x = re.exec(line)) {
    if (x.index > last) out.push({ t: line.slice(last, x.index) });
    if (x[1]) {
      out.push({ t: x[1], c: x[2] ? 'tok-key' : 'tok-str' });
      if (x[2]) out.push({ t: x[2] });
    } else out.push({ t: x[3], c: 'tok-num' });
    last = x.index + x[0].length;
  }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
}

function toml(line: string): Tok[] {
  if (/^\s*#/.test(line)) return [{ t: line, c: 'tok-dim' }];
  if (/^\s*\[.*\]\s*$/.test(line)) return [{ t: line, c: 'tok-h' }];
  const kv = /^(\s*[\w.-]+)(\s*=\s*)(.*)$/.exec(line);
  if (kv) return [{ t: kv[1], c: 'tok-key' }, { t: kv[2] }, { t: kv[3], c: kv[3].startsWith('"') ? 'tok-str' : 'tok-num' }];
  return [{ t: line }];
}

function ts(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /('[^']*'|"[^"]*"|`[^`]*`)|(\/\/.*$)|\b(import|from|export|default|function|return|const|type|let)\b|\b(\d+)\b/g;
  let last = 0;
  for (let x = re.exec(line); x; x = re.exec(line)) {
    if (x.index > last) out.push({ t: line.slice(last, x.index) });
    out.push({ t: x[0], c: x[1] ? 'tok-str' : x[2] ? 'tok-dim' : x[3] && TS_KEYWORDS.test(x[3]) ? 'tok-key' : 'tok-num' });
    last = x.index + x[0].length;
  }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
}

export function highlight(text: string, lang: Lang): Tok[][] {
  const rows = text.split('\n');
  if (lang === 'json') return rows.map(json);
  if (lang === 'toml') return rows.map(toml);
  if (lang === 'ts') return rows.map(ts);
  if (lang === 'text') return rows.map((t) => [{ t }]);
  // markdown: front matter keys, headings, fences
  let inFront = rows[0] === '---';
  let fence = false;
  return rows.map((row, i) => {
    if (inFront) {
      if (row === '---' && i > 0) { inFront = false; return [{ t: row, c: 'tok-dim' }]; }
      if (row === '---') return [{ t: row, c: 'tok-dim' }];
      const kv = /^(\s*-?\s*)([\w-]+)(:)(.*)$/.exec(row);
      if (kv) return [{ t: kv[1] }, { t: kv[2], c: 'tok-key' }, { t: kv[3] }, { t: kv[4], c: 'tok-str' }];
      const item = /^(\s*-\s*)(.*)$/.exec(row);
      if (item) return [{ t: item[1], c: 'tok-dim' }, { t: item[2], c: 'tok-str' }];
      return [{ t: row }];
    }
    if (row.startsWith('```')) { fence = !fence; return [{ t: row, c: 'tok-dim' }]; }
    if (fence) return [{ t: row, c: 'tok-str' }];
    if (/^#{1,6}\s/.test(row)) return [{ t: row, c: 'tok-h' }];
    const num = /^(\s*\d+\.\s+)(.*)$/.exec(row);
    if (num) return [{ t: num[1], c: 'tok-key' }, { t: num[2] }];
    return [{ t: row }];
  });
}

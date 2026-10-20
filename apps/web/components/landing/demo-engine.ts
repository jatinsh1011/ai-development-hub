/**
 * A tiny, deterministic "screen recording" engine for the landing-page demo.
 *
 * A scene is a list of steps (type a command, print a line, add a file, ...). `compile` turns it
 * into events on a timeline, and `frameAt(scene, t)` returns what the window shows at time t.
 * Nothing is accumulated imperatively, so pausing, jumping between scenes, switching the target
 * tool and reduced motion are all just "render a different t".
 */

export type Tone = 'pr' | 'cm' | 'ok' | 'er' | 'wa' | 'dim' | 'b' | 'add' | 'acc' | 'cy';
export type Seg = { t: string; c?: Tone };
export type TermLine = Seg[];
export type StickerTone = 'amber' | 'pink' | 'mint' | 'blue' | 'white';

export type Step =
  /** Type a command at the prompt (after `pre` ms), paste `paste` in one go if given, then press Enter. */
  | { kind: 'type'; text: string; pre?: number; paste?: string }
  /** Print one output line `wait` ms after the previous step. */
  | { kind: 'out'; line: TermLine; wait?: number }
  /** Add text to the end of the last line (an answer typed at a y/N prompt). */
  | { kind: 'append'; seg: Seg; wait?: number }
  | { kind: 'add'; path: string; wait?: number }
  | { kind: 'remove'; path: string; wait?: number }
  | { kind: 'open'; path: string; wait?: number }
  | { kind: 'sticker'; text: string; tone?: StickerTone; pos?: 'top' | 'bottom'; wait?: number }
  | { kind: 'clear'; wait?: number }
  | { kind: 'wait'; ms: number };

type Ev =
  | { at: number; kind: 'prompt' }
  | { at: number; kind: 'char'; cmd: string; n: number }
  | { at: number; kind: 'enter'; cmd: string }
  | { at: number; kind: 'out'; line: TermLine }
  | { at: number; kind: 'append'; seg: Seg }
  | { at: number; kind: 'add' | 'remove' | 'open'; path: string }
  | { at: number; kind: 'sticker'; text: string; tone: StickerTone; pos: 'top' | 'bottom' }
  | { at: number; kind: 'clear' };

export type Compiled = { events: Ev[]; duration: number; times: number[] };

export type Sticker = { text: string; tone: StickerTone; pos: 'top' | 'bottom' };
export type Frame = {
  lines: TermLine[];
  /** The command being typed right now (prompt shown with a caret), or null between commands. */
  typing: string | null;
  /** A command is executing: its output is still streaming, so no prompt is shown. */
  running: boolean;
  added: string[];
  removed: string[];
  open: string | null;
  stickers: Sticker[];
  done: boolean;
};

export const PROMPT: TermLine = [{ t: '~/acme-shop', c: 'pr' }, { t: ' $ ', c: 'dim' }];

/** Deterministic 0..1 noise so typing rhythm is stable between renders and server/client. */
const noise = (i: number, seed: number) => {
  const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function compile(steps: Step[], seed = 1): Compiled {
  const events: Ev[] = [];
  let at = 0;
  for (const s of steps) {
    switch (s.kind) {
      case 'type': {
        events.push({ at, kind: 'prompt' });
        at += s.pre ?? 450;
        const full = s.text + (s.paste ?? '');
        for (let i = 1; i <= s.text.length; i++) {
          const ch = s.text[i - 1];
          at += 34 + noise(i, seed + s.text.length) * 52 + (ch === ' ' ? 70 : 0);
          events.push({ at, kind: 'char', cmd: full, n: i });
        }
        if (s.paste) {
          at += 320;
          events.push({ at, kind: 'char', cmd: full, n: full.length });
        }
        at += 380;
        events.push({ at, kind: 'enter', cmd: full });
        break;
      }
      case 'out':
        at += s.wait ?? 110;
        events.push({ at, kind: 'out', line: s.line });
        break;
      case 'append':
        at += s.wait ?? 0;
        events.push({ at, kind: 'append', seg: s.seg });
        break;
      case 'add': case 'remove': case 'open':
        at += s.wait ?? 0;
        events.push({ at, kind: s.kind, path: s.path });
        break;
      case 'sticker':
        at += s.wait ?? 0;
        events.push({ at, kind: 'sticker', text: s.text, tone: s.tone ?? 'amber', pos: s.pos ?? 'top' });
        break;
      case 'clear':
        at += s.wait ?? 0;
        events.push({ at, kind: 'clear' });
        break;
      case 'wait':
        at += s.ms;
        break;
    }
  }
  const times = [...new Set(events.map((e) => e.at))].sort((a, b) => a - b);
  return { events, duration: at, times };
}

export function frameAt(c: Compiled, t: number): Frame {
  const f: Frame = { lines: [], typing: null, running: false, added: [], removed: [], open: null, stickers: [], done: t >= c.duration };
  for (const e of c.events) {
    if (e.at > t) break;
    switch (e.kind) {
      case 'prompt': f.running = false; break;
      case 'char': f.typing = e.cmd.slice(0, e.n); f.running = false; break;
      case 'enter': f.typing = null; f.running = true; f.lines.push([...PROMPT, { t: e.cmd, c: 'cm' }]); break;
      case 'out': f.lines.push(e.line); break;
      case 'append': if (f.lines.length) f.lines[f.lines.length - 1] = [...f.lines[f.lines.length - 1], e.seg]; break;
      case 'add': f.added.push(e.path); f.removed = f.removed.filter((p) => p !== e.path); break;
      case 'remove': f.removed.push(e.path); break;
      case 'open': f.open = e.path; break;
      case 'sticker': f.stickers = [...f.stickers.filter((s) => s.pos !== e.pos), { text: e.text, tone: e.tone, pos: e.pos }]; break;
      case 'clear': f.lines = []; break;
    }
  }
  if (f.done) f.running = false;
  return f;
}

/** The next moment after t when the frame changes, or null when the scene is over. */
export function nextAt(c: Compiled, t: number): number | null {
  for (const x of c.times) if (x > t) return x;
  return null;
}

/** Parse a light markup into coloured segments: "{ok:✓} resolved {b:name}" */
export function m(src: string): TermLine {
  const out: TermLine = [];
  const re = /\{(\w+):([^}]*)\}/g;
  let last = 0;
  for (let x = re.exec(src); x; x = re.exec(src)) {
    if (x.index > last) out.push({ t: src.slice(last, x.index) });
    out.push({ t: x[2], c: x[1] as Tone });
    last = x.index + x[0].length;
  }
  if (last < src.length) out.push({ t: src.slice(last) });
  return out.length ? out : [{ t: '' }];
}

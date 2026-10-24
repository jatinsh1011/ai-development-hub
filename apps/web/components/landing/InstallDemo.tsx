'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BlocksMark } from './BlocksMark';
import { BASE_FILES, COLLAPSED, DEFAULT_OPEN, DEFAULT_TOOL, SCENES, TOOLS, fileFor, respond, type ToolId } from './demo-data';
import { compile, frameAt, nextAt, PROMPT, type Compiled, type Frame, type TermLine } from './demo-engine';
import { highlight } from './highlight';

const HOLD = 2600; // ms a finished scene stays on screen before the next one starts
const EMPTY = compile([]);

type Base = { files: string[]; lines: TermLine[] };

/** Files present after applying a finished frame to a base set (removed files are dropped). */
function settle(files: string[], f: Frame) {
  const set = new Set(files);
  for (const p of f.added) set.add(p);
  for (const p of f.removed) set.delete(p);
  return [...set];
}

function filesBefore(scene: number, tool: ToolId) {
  let files = BASE_FILES;
  for (let i = 0; i < scene; i++) files = settle(files, frameAt(compile(SCENES[i].steps(tool), i + 1), Infinity));
  return files;
}

type Row = { path: string; name: string; depth: number; dir: boolean; state: 'new' | 'gone' | null };

/** Flat explorer rows. Folders only expand when they hold something this demo touched. */
function treeRows(present: string[], added: Set<string>, removed: Set<string>, open: string | null): Row[] {
  const all = [...new Set([...present, ...removed])];
  const touched = [...added, ...removed, ...(open ? [open] : [])];
  const dirs = new Set<string>();
  for (const p of all) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const expanded = (d: string) => !COLLAPSED.has(d) && touched.some((p) => p.startsWith(d + '/'));
  const entries = [...dirs].map((d) => ({ path: d, dir: true })).concat(all.map((p) => ({ path: p, dir: false })));
  const visible = entries.filter((e) => {
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i++) if (!expanded(parts.slice(0, i).join('/'))) return false;
    return true;
  });
  const key = (e: { path: string; dir: boolean }) =>
    e.path.split('/').map((seg, i, arr) => `${i === arr.length - 1 && !e.dir ? '1' : '0'}${seg.toLowerCase()}`).join('/');
  visible.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return visible.map((e) => {
    const parts = e.path.split('/');
    const isNew = e.dir ? [...added].some((p) => p.startsWith(e.path + '/')) && !present.some((p) => p.startsWith(e.path + '/') && !added.has(p))
      : added.has(e.path);
    const isGone = e.dir ? false : removed.has(e.path);
    return { path: e.path, name: parts[parts.length - 1], depth: parts.length - 1, dir: e.dir, state: isGone ? 'gone' : isNew ? 'new' : null };
  });
}

function Line({ line }: { line: TermLine }) {
  return <div className="tl">{line.map((s, i) => (s.c ? <span key={i} className={s.c}>{s.t}</span> : s.t))}</div>;
}

const FileIcon = ({ dir }: { dir: boolean }) => dir
  ? <svg className="ico" viewBox="0 0 24 24" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  : <svg className="ico" viewBox="0 0 24 24" aria-hidden><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;

export function InstallDemo() {
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL);
  const [scene, setScene] = useState(0);
  const [custom, setCustom] = useState<Compiled | null>(null); // a command the visitor typed
  const [t, setT] = useState(0);
  const [base, setBase] = useState<Base>({ files: BASE_FILES, lines: [] });
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [picked, setPicked] = useState<string | null>(null); // file the visitor clicked
  const [draft, setDraft] = useState('');
  const [typingMode, setTypingMode] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [said, setSaid] = useState(''); // live-region text for typed commands
  const [round, setRound] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const histPos = useRef(-1);

  const compiled = useMemo(() => custom ?? compile(SCENES[scene].steps(tool), scene + 1), [custom, scene, tool]);
  const frame = useMemo(() => frameAt(compiled, reduced ? Infinity : t), [compiled, t, reduced]);

  // Watch visibility and the reduced-motion preference.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => { io.disconnect(); mq.removeEventListener('change', sync); };
  }, []);

  // A visitor's own command always plays; the scripted demo only while visible and not paused.
  const running = !reduced && (custom ? true : playing && inView && !typingMode);

  // The clock: jump straight to the next moment the picture changes.
  useEffect(() => {
    if (!running) return;
    const n = nextAt(compiled, t);
    if (n !== null) {
      const id = setTimeout(() => setT(n), Math.max(0, n - t));
      return () => clearTimeout(id);
    }
    if (custom) return;
    const id = setTimeout(() => goTo(scene + 1 === SCENES.length ? 0 : scene + 1, false), HOLD);
    return () => clearTimeout(id);
  }, [running, compiled, t, custom, scene]);

  // A file opened by the script wins over one the visitor clicked earlier.
  useEffect(() => { if (frame.open) setPicked(null); }, [frame.open]);

  function goTo(next: number, userAction: boolean, nextTool: ToolId = tool) {
    setCustom(null);
    setTypingMode(false);
    setScene(next);
    setT(0);
    setPicked(null);
    setRound((r) => r + 1);
    setBase({ files: filesBefore(next, nextTool), lines: [] });
    if (userAction) setPlaying(true);
  }

  function changeTool(next: ToolId) {
    if (next === tool) return;
    setTool(next);
    setCustom(null);
    setTypingMode(false);
    setPlaying(true);
    setT(0);
    setPicked(null);
    setRound((r) => r + 1);
    setBase({ files: filesBefore(scene, next), lines: [] });
  }

  const present = settle(base.files, { ...frame, removed: [] }).filter((p) => !frame.removed.includes(p));
  const nowFiles = settle(base.files, frame);

  function enterTypingMode() {
    if (typingMode) return;
    // Freeze what's on screen as the new starting point, dropping any half-typed command.
    setBase({ files: nowFiles, lines: [...base.lines, ...frame.lines].slice(-60) });
    setCustom(EMPTY);
    setT(0);
    setTypingMode(true);
    setPlaying(false);
  }

  function submit() {
    const cmd = draft.trim();
    setDraft('');
    histPos.current = -1;
    const lines = [...base.lines, ...frame.lines, [...PROMPT, { t: cmd, c: 'cm' as const }]].slice(-60);
    if (!cmd) { setBase({ files: nowFiles, lines }); setCustom(EMPTY); setT(0); return; }
    setHistory((h) => [cmd, ...h.filter((x) => x !== cmd)].slice(0, 20));
    const r = respond(cmd, { tool, files: nowFiles });
    const steps = r.steps.map((s, i) => (i === 0 && 'wait' in s ? { ...s, wait: Math.min(s.wait ?? 0, 160) } : s));
    setBase({ files: nowFiles, lines: r.clear ? [] : lines });
    setCustom(compile(steps, cmd.length));
    setT(0);
    const text = frameAt(compile(steps), Infinity).lines.map((l) => l.map((s) => s.t).join('')).join('\n');
    setSaid(text || (r.clear ? 'Cleared.' : ''));
  }

  const added = new Set(frame.added);
  const removed = new Set(frame.removed);
  const openPath = picked ?? frame.open ?? DEFAULT_OPEN;
  const rows = treeRows(present, added, removed, frame.open);
  const file = fileFor(openPath, tool) ?? fileFor(DEFAULT_OPEN, tool)!;
  const fresh = added.has(openPath);
  const tabs = [...new Set([DEFAULT_OPEN, openPath])];
  const lines = [...base.lines, ...frame.lines];
  const showPrompt = typingMode || frame.typing !== null || frame.done || !frame.running;
  const current = typingMode ? draft : frame.typing ?? '';
  const sc = SCENES[scene];
  const toolName = TOOLS.find((x) => x.id === tool)!.name;
  const paused = !running;

  return (
    <div className="demo" ref={root} data-paused={paused ? '' : undefined} data-typing={frame.typing ? '' : undefined}>
      <p className="sr-only">
        Demo: aidevkit installs an MCP server, a skill and an agent into {toolName}, writing each one to the folder that tool reads, then rolls the last install back. Click the terminal to type your own aidevkit command.
      </p>
      <div className="demo-window">
        <div className="demo-bar">
          <i aria-hidden /><i aria-hidden /><i aria-hidden />
          <span className="demo-path" aria-hidden>~/acme-shop</span>
          <div className="demo-target">
            <span id="demo-target-label">installing into</span>
            <div className="switch" role="group" aria-labelledby="demo-target-label">
              {TOOLS.map((x) => (
                <button key={x.id} type="button" aria-pressed={x.id === tool} onClick={() => changeTool(x.id)}>{x.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="demo-body">
          <div className="demo-explorer" aria-hidden>
            <h3>acme-shop</h3>
            <div className="tree">
              {rows.map((r) => (
                <button
                  key={`${r.path}-${r.state ?? ''}-${round}`}
                  type="button"
                  tabIndex={-1}
                  className={`tree-row${r.dir ? ' is-dir' : ''}${r.state === 'new' ? ' is-new' : ''}${r.state === 'gone' ? ' is-gone' : ''}${!r.dir && r.path === openPath ? ' is-open' : ''}`}
                  style={{ ['--depth' as string]: r.depth }}
                  onClick={() => { if (!r.dir && r.state !== 'gone' && fileFor(r.path, tool)) setPicked(r.path); }}
                >
                  <FileIcon dir={r.dir} />
                  <span className="name">{r.name}{r.dir ? '/' : ''}</span>
                  {r.state === 'new' && <span className="badge">new</span>}
                  {r.state === 'gone' && <span className="badge">removed</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="demo-main">
            <div className="demo-editor" aria-hidden>
              <div className="demo-tabs">
                {tabs.map((p) => (
                  <button key={p} type="button" tabIndex={-1} className="demo-tab" aria-selected={p === openPath} onClick={() => setPicked(p)}>
                    {added.has(p) && <span className="dot" />}{p.split('/').pop()}
                  </button>
                ))}
              </div>
              <pre className={`demo-code${fresh ? ' is-fresh' : ''}`} key={`${openPath}-${round}-${fresh}`}>
                {highlight(file.text, file.lang).map((segs, i) => (
                  <span key={i} className={`ln${fresh ? ' is-add' : ''}`} style={{ ['--i' as string]: i }}>
                    <span className="n">{i + 1}</span>
                    <span className="c">{segs.map((s, j) => (s.c ? <span key={j} className={s.c}>{s.t}</span> : s.t))}</span>
                  </span>
                ))}
              </pre>
            </div>

            <div className="demo-term">
              <div className="demo-term-head" aria-hidden>
                <b>terminal</b><span>zsh</span>
                <span className="hint">{typingMode ? 'esc to watch the demo' : 'click to type'}</span>
              </div>
              <div className="demo-screen" onClick={() => input.current?.focus()}>
                <div aria-hidden>
                  {lines.map((l, i) => <Line key={i} line={l} />)}
                  {showPrompt && (
                    <div className="tl">
                      {PROMPT.map((s, i) => <span key={i} className={s.c}>{s.t}</span>)}
                      <span className="cm">{current}</span>
                      <span className="caret" />
                    </div>
                  )}
                </div>
                <input
                  ref={input}
                  className="demo-input"
                  aria-label="Type an aidevkit command, then press Enter"
                  autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                  value={draft}
                  onFocus={enterTypingMode}
                  onChange={(e) => { if (!typingMode) enterTypingMode(); setDraft(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submit(); }
                    else if (e.key === 'Escape') { e.currentTarget.blur(); goTo(scene, true); }
                    else if (e.key === 'ArrowUp' && history.length) {
                      e.preventDefault();
                      histPos.current = Math.min(histPos.current + 1, history.length - 1);
                      setDraft(history[histPos.current]);
                    } else if (e.key === 'ArrowDown' && histPos.current >= 0) {
                      e.preventDefault();
                      histPos.current -= 1;
                      setDraft(histPos.current >= 0 ? history[histPos.current] : '');
                    }
                  }}
                />
              </div>
              <p className="sr-only" aria-live="polite">{said}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="coach" aria-hidden>
        <div className="coach-text" key={typingMode ? 'you' : `${scene}-${tool}`}>
          <h3>{typingMode ? 'your turn.' : sc.coach.title}</h3>
          <p>{typingMode ? 'Try aidevkit search postgres, aidevkit install <name>, aidevkit list or aidevkit rollback.' : sc.coach.body.replace('{tool}', toolName)}</p>
        </div>
        <div className="coach-foot">
          <span className="coach-step">{typingMode ? 'you’re driving' : `step ${scene + 1} of ${SCENES.length}`}</span>
          <button type="button" tabIndex={-1} className="coach-skip" onClick={() => goTo(typingMode ? scene : (scene + 1) % SCENES.length, true)}>
            {typingMode ? 'back to demo →' : 'skip →'}
          </button>
        </div>
      </div>
      <BlocksMark className="mascot" eyes />

      {frame.stickers.map((s) => (
        <span key={`${s.pos}-${s.text}`} className={`sticker demo-sticker at-${s.pos} s-${s.tone}`} style={{ ['--tilt' as string]: s.pos === 'top' ? '-4deg' : '3deg' }} aria-hidden>
          {s.text}
        </span>
      ))}

      <div className="demo-controls">
        <button
          type="button"
          className="play-btn"
          aria-label={playing && !typingMode ? 'Pause the demo' : 'Play the demo'}
          onClick={() => { if (typingMode) goTo(scene, true); else setPlaying(!playing); }}
        >
          {playing && !typingMode
            ? <svg viewBox="0 0 24 24" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
        </button>
        <ol className="chapters" aria-label="Demo steps">
          {SCENES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`chapter${i < scene && !typingMode ? ' is-done' : ''}`}
                aria-current={i === scene && !typingMode ? 'step' : undefined}
                onClick={() => goTo(i, true)}
              >
                <span className="fill" key={`${i}-${scene}-${tool}-${round}`} style={{ ['--dur' as string]: `${compiled.duration + HOLD}ms` }} />
                <span className="num">{i + 1}</span>{s.label}
              </button>
            </li>
          ))}
        </ol>
        <p className="demo-try">or click the terminal and type <kbd>aidevkit search postgres</kbd></p>
      </div>
    </div>
  );
}

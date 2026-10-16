import readline from 'node:readline/promises';

export interface Prompter {
  interactive: boolean;
  confirm(q: string, def?: boolean): Promise<boolean>;
  ask(q: string, opts?: { secret?: boolean; def?: string }): Promise<string>;
  choose(q: string, options: string[], def?: string[]): Promise<string[]>;
}

/** Non-interactive prompter: takes defaults; --yes flips confirmations to true. */
export class AutoPrompter implements Prompter {
  interactive = false;
  constructor(private yes = false) {}
  async confirm(_q: string, def = false) { return this.yes ? true : def; }
  async ask(_q: string, o?: { def?: string }) { return o?.def ?? ''; }
  async choose(_q: string, _o: string[], def: string[] = []) { return def; }
}

export class TtyPrompter implements Prompter {
  interactive = true;
  private rl = () => readline.createInterface({ input: process.stdin, output: process.stderr });
  async confirm(q: string, def = false) {
    const rl = this.rl();
    try {
      const a = (await rl.question(`${q} ${def ? '(Y/n)' : '(y/N)'} `)).trim().toLowerCase();
      return a ? a.startsWith('y') : def;
    } finally { rl.close(); }
  }
  async ask(q: string, o: { secret?: boolean; def?: string } = {}) {
    if (o.secret) return this.secret(q);
    const rl = this.rl();
    try { return (await rl.question(`${q}${o.def ? ` (${o.def})` : ''}: `)).trim() || o.def || ''; } finally { rl.close(); }
  }
  private secret(q: string): Promise<string> {
    return new Promise((resolve) => {
      process.stderr.write(`${q}: `);
      const stdin = process.stdin;
      let buf = '';
      stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding('utf8');
      const onData = (ch: string) => {
        if (ch === '\r' || ch === '\n') { stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); process.stderr.write('\n'); resolve(buf); }
        else if (ch === '\u0003') { process.exit(130); }
        else if (ch === '\u007f') buf = buf.slice(0, -1);
        else buf += ch;
      };
      stdin.on('data', onData);
    });
  }
  async choose(q: string, options: string[], def: string[] = []) {
    const lines = options.map((o, i) => `  ${i + 1}) ${o}${def.includes(o) ? ' *' : ''}`).join('\n');
    const rl = this.rl();
    try {
      const a = (await rl.question(`${q}\n${lines}\nSelect (comma-separated numbers, Enter = *): `)).trim();
      if (!a) return def;
      return a.split(',').map((n) => options[+n.trim() - 1]).filter(Boolean);
    } finally { rl.close(); }
  }
}

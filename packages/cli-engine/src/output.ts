import { CliError, Exit } from './errors.js';

const C = { dim: 2, bold: 1, red: 31, green: 32, yellow: 33, cyan: 36, gray: 90 } as const;

export interface OutputOpts { json: boolean; color: boolean }

/** Human output goes to stdout; in --json mode stdout carries exactly one JSON document. */
export class Output {
  warnings: string[] = [];
  constructor(public o: OutputOpts, private out: (s: string) => void = (s) => process.stdout.write(s), private err: (s: string) => void = (s) => process.stderr.write(s)) {}
  get json() { return this.o.json; }
  c(style: keyof typeof C, s: string) { return this.o.color ? `\x1b[${C[style]}m${s}\x1b[0m` : s; }
  line(s = '') { if (!this.o.json) this.out(s + '\n'); }
  ok(s: string) { this.line(`${this.c('green', '✓')} ${s}`); }
  info(s: string) { this.line(this.c('dim', s)); }
  warn(s: string) { this.warnings.push(s); if (!this.o.json) this.err(`${this.c('yellow', '⚠')} ${s}\n`); }
  step(s: string) { this.line(s); }
  /** Emit the final structured result. */
  result(data: Record<string, unknown>) {
    if (this.o.json) this.out(JSON.stringify({ ok: true, ...data, ...(this.warnings.length ? { warnings: this.warnings } : {}) }, null, 2) + '\n');
  }
  fail(e: unknown): number {
    const err = e instanceof CliError ? e : new CliError(Exit.GENERIC, 'error', e instanceof Error ? e.message : String(e));
    if (this.o.json) this.out(JSON.stringify({ ok: false, error: { kind: err.kind, message: err.message, hint: err.hint, exitCode: err.exit, details: err.details } }, null, 2) + '\n');
    else {
      this.err(`${this.c('red', '✗')} ${err.message}\n`);
      if (err.hint) this.err(`  ${this.c('dim', err.hint)}\n`);
    }
    return err.exit;
  }
}

export const shouldColor = (flags: { color?: boolean; noColor?: boolean }) =>
  !flags.noColor && flags.color !== false && !process.env.NO_COLOR && !!process.stdout.isTTY && process.env.TERM !== 'dumb';

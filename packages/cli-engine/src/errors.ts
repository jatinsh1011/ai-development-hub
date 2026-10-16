/** Stable process exit codes — part of the machine interface for AI agents. */
export const Exit = {
  OK: 0,
  GENERIC: 1,
  USAGE: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  POLICY: 6,
  CONSENT: 7,
  VALIDATION: 8,
  NETWORK: 9,
  UNSUPPORTED: 10,
} as const;

export class CliError extends Error {
  constructor(public exit: number, public kind: string, message: string, public hint?: string, public details?: unknown) { super(message); }
}

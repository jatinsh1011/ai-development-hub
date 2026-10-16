import type { ProviderId, ResolvedArtifact } from '@aidev/artifact-schema';

/**
 * Adapters never touch disk. They return a plan of declarative operations;
 * the apply engine performs them with backup, diff, conflict detection and rollback.
 */
export type PlanOp =
  /** A file wholly owned by the artifact. */
  | { kind: 'write'; path: string; content: string }
  /** Set one key inside a JSON object file (other keys preserved). */
  | { kind: 'json-key'; path: string; keys: string[]; value: unknown }
  /** Upsert an element (matched by idKey) in a JSON array file. */
  | { kind: 'json-array'; path: string; keys: string[]; idKey: string; value: Record<string, unknown> }
  /** A marker-delimited block inside a text file (Markdown or TOML). */
  | { kind: 'text-block'; path: string; id: string; content: string; style: 'html' | 'hash'; conflictRe?: string };

export type Scope = 'project' | 'user';

export interface InstallOptions {
  cwd: string;
  home: string;
  scope: Scope;
  force?: boolean;
  dryRun?: boolean;
  /** Ops recorded by a previous install of this artifact (enables safe updates). */
  previous?: PlanOp[];
  backupRoot?: string;
}

export type ChangeAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'delete';

export interface Change {
  path: string;
  action: ChangeAction;
  before: string | null;
  after: string | null;
  reason?: string;
  diff: string;
  ops: PlanOp[];
}

export interface InstallResult {
  provider: ProviderId;
  artifact: string;
  ops: PlanOp[];
  changes: Change[];
  conflicts: Change[];
  applied: boolean;
  backupId?: string;
  notes: string[];
  /** Set when this provider cannot represent the artifact (reason). */
  skipped?: string;
}

export interface UninstallResult {
  provider: ProviderId;
  artifact: string;
  changes: Change[];
  applied: boolean;
  backupId?: string;
  notes: string[];
}

export interface ProviderEnvironment {
  id: ProviderId;
  name: string;
  detected: boolean;
  binary?: string;
  evidence: string[];
  paths: { project: Record<string, string>; user: Record<string, string> };
}

export interface ValidationResult { ok: boolean; errors: string[]; warnings: string[] }

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  detect(opts?: { cwd?: string; home?: string }): Promise<boolean>;
  inspect(opts?: { cwd?: string; home?: string }): Promise<ProviderEnvironment>;
  validate(artifact: ResolvedArtifact): Promise<ValidationResult>;
  /** Pure: translate to declarative operations. */
  plan(artifact: ResolvedArtifact, opts: InstallOptions): { ops: PlanOp[]; notes: string[]; skipped?: string };
  installArtifact(artifact: ResolvedArtifact, opts: InstallOptions): Promise<InstallResult>;
  uninstallArtifact(artifact: ResolvedArtifact | { owner: string; slug: string }, opts: InstallOptions & { ops: PlanOp[] }): Promise<UninstallResult>;
}

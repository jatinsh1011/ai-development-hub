import { z } from 'zod';
import { ARTIFACT_TYPES, PROVIDER_IDS } from './types.js';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Capabilities an artifact declares. Shown to the user before install. */
export const PERMISSIONS = [
  'read-files', 'write-files', 'run-tests', 'run-commands', 'network', 'env-vars', 'mcp-access', 'git',
] as const;

const mcpEnvVar = z.object({
  description: z.string().optional(),
  required: z.boolean().default(true),
  secret: z.boolean().default(true),
});

/** Provider-neutral MCP server definition. Adapters translate it to each client's format. */
export const mcpSchema = z
  .object({
    transport: z.enum(['stdio', 'http']).default('stdio'),
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    env: z.record(z.string(), mcpEnvVar).default({}),
    headers: z.record(z.string(), z.string()).default({}),
  })
  .refine((m) => (m.transport === 'stdio' ? !!m.command : !!m.url), {
    message: 'stdio MCP servers need "command"; http MCP servers need "url"',
  });

const agentSchema = z.object({
  /** Neutral tool names; adapters map them: read | edit | search | execute | web */
  tools: z.array(z.enum(['read', 'edit', 'search', 'execute', 'web'])).default(['read', 'search']),
  model: z.string().optional(),
});

export const manifestSchema = z.object({
  name: z.string().regex(SLUG_RE, 'name must be lowercase letters, digits and dashes'),
  type: z.enum(ARTIFACT_TYPES),
  version: z.string().regex(SEMVER_RE, 'version must be semver, e.g. 1.2.0'),
  title: z.string().optional(),
  description: z.string().min(10).max(500),
  author: z.string().min(1),
  license: z.string().default('MIT'),
  repository: z.string().optional(),
  homepage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  compatibility: z
    .object({ copilot: z.boolean().default(true), claudeCode: z.boolean().default(true), codex: z.boolean().default(true) })
    .default({ copilot: true, claudeCode: true, codex: true }),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
  dependencies: z
    .object({
      skills: z.array(z.string()).default([]),
      mcps: z.array(z.string()).default([]),
      agents: z.array(z.string()).default([]),
      prompts: z.array(z.string()).default([]),
      instructions: z.array(z.string()).default([]),
    })
    .default({ skills: [], mcps: [], agents: [], prompts: [], instructions: [] }),
  agent: agentSchema.optional(),
  mcp: mcpSchema.optional(),
  /** Provider-specific overrides; never erased by the neutral fields. */
  providers: z.partialRecord(z.enum(PROVIDER_IDS), z.record(z.string(), z.unknown())).optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestInput = z.input<typeof manifestSchema>;

export const providerCompat = (m: Manifest, p: (typeof PROVIDER_IDS)[number]): boolean =>
  p === 'claude' ? m.compatibility.claudeCode : m.compatibility[p];

/** Which neutral dependency kind maps to which artifact type. */
export const DEP_KINDS = {
  skills: 'skill', mcps: 'mcp', agents: 'agent', prompts: 'prompt', instructions: 'instruction',
} as const;

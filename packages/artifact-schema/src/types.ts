export const ARTIFACT_TYPES = ['agent', 'skill', 'mcp', 'prompt', 'instruction', 'plugin', 'workflow', 'bundle'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const PROVIDER_IDS = ['copilot', 'claude', 'codex'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const VISIBILITIES = ['public', 'unlisted', 'private', 'organization', 'team'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type GovernanceStatus = 'approved' | 'blocked' | 'external';

export interface ArtifactFile {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

/** A fully resolved, installable artifact version. Adapters consume this. */
export interface ResolvedArtifact {
  owner: string;
  slug: string;
  version: string;
  sha256: string;
  manifest: import('./manifest.js').Manifest;
  files: ArtifactFile[];
}

export const refOf = (a: { owner: string; slug: string }) => `${a.owner}/${a.slug}`;

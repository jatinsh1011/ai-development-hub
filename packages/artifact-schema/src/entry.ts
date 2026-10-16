import type { ArtifactType } from './types.js';

export const MANIFEST_FILE = 'manifest.json';

/** The primary content file for each artifact type (null = none required). */
export const ENTRY_FILE: Record<ArtifactType, string | null> = {
  agent: 'agent.md',
  skill: 'SKILL.md',
  prompt: 'prompt.md',
  instruction: 'instruction.md',
  workflow: 'workflow.md',
  mcp: null,
  plugin: null,
  bundle: null,
};

export interface Gov { status: 'approved' | 'blocked' | 'external'; org: string }
export interface ArtifactSummary {
  id: string; owner: string; slug: string; title: string; type: string; description: string; author: string; visibility: string;
  latestVersion: string; license: string | null; tags: string[]; categories: string[]; languages: string[]; frameworks: string[];
  compat: { copilot?: boolean; claudeCode?: boolean; codex?: boolean };
  verified: boolean; official: boolean; downloads: number; installs: number; stars: number; rating: string | null; ratingCount: number;
  updatedAt: string; createdAt: string;
  githubRepo?: string | null; githubStars?: number | null;
}
export interface User { id: string; email: string; handle: string; name: string }
export const TYPES = [
  { id: 'agent', label: 'Agents', blurb: 'Specialised assistants with their own instructions and tools.' },
  { id: 'skill', label: 'Skills', blurb: 'SKILL.md packages that teach an agent a repeatable task.' },
  { id: 'mcp', label: 'MCP servers', blurb: 'Connect agents to GitHub, Jira, databases and clouds.' },
  { id: 'instruction', label: 'Instructions', blurb: 'Project rules your AI tool follows on every request.' },
] as const;
export const typeLabel = (t: string) => ({ mcp: 'MCP', plugin: 'Plugin', instruction: 'Instruction', workflow: 'Workflow', bundle: 'Bundle' } as Record<string, string>)[t] ?? t[0].toUpperCase() + t.slice(1);

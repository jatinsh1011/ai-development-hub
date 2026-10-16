import type { Manifest } from './manifest.js';

export interface RiskItem { label: string; detail: string; level: 'low' | 'medium' | 'high' }

const PERM_LABEL: Record<string, RiskItem> = {
  'read-files': { label: 'Filesystem read', detail: 'Reads files in your project', level: 'low' },
  'write-files': { label: 'Filesystem write', detail: 'Creates or edits files in your project', level: 'medium' },
  'run-tests': { label: 'Run tests', detail: 'Runs your test suite', level: 'low' },
  'run-commands': { label: 'Local command execution', detail: 'Runs shell commands', level: 'high' },
  network: { label: 'Network access', detail: 'Makes outbound network requests', level: 'medium' },
  'env-vars': { label: 'Environment variables', detail: 'Reads environment variables', level: 'medium' },
  'mcp-access': { label: 'MCP tools', detail: 'Calls tools on MCP servers', level: 'medium' },
  git: { label: 'Git', detail: 'Reads or modifies git state', level: 'medium' },
};

/** What the user must see and consent to before install. */
export function riskProfile(m: Manifest): RiskItem[] {
  const items = m.permissions.map((p) => PERM_LABEL[p]).filter(Boolean);
  if (m.type === 'agent' && m.agent) {
    if (m.agent.tools.includes('execute')) items.push(PERM_LABEL['run-commands']);
    if (m.agent.tools.includes('edit')) items.push(PERM_LABEL['write-files']);
    if (m.agent.tools.includes('web')) items.push(PERM_LABEL.network);
  }
  if (m.mcp) {
    if (m.mcp.transport === 'stdio') items.push({ label: 'Local command execution', detail: `Launches \`${[m.mcp.command, ...m.mcp.args].join(' ')}\` on your machine`, level: 'high' });
    else items.push({ label: 'Network access', detail: `Connects to ${m.mcp.url}`, level: 'medium' });
    const env = Object.keys(m.mcp.env);
    if (env.length) items.push({ label: 'Environment variables', detail: `Needs ${env.join(', ')}`, level: 'medium' });
    items.push({ label: 'External APIs', detail: 'Sends tool calls and their arguments to the server', level: 'medium' });
  }
  // merge entries sharing a label so the user sees each capability once
  const merged = new Map<string, RiskItem>();
  const rank = { low: 0, medium: 1, high: 2 } as const;
  for (const i of items) {
    const prev = merged.get(i.label);
    if (!prev) merged.set(i.label, { ...i });
    else {
      if (!prev.detail.includes(i.detail)) prev.detail += `; ${i.detail}`;
      if (rank[i.level] > rank[prev.level]) prev.level = i.level;
    }
  }
  return [...merged.values()];
}

export const isRisky = (items: RiskItem[]) => items.some((i) => i.level === 'high');

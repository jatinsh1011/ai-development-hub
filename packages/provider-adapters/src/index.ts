import type { ProviderId } from '@aidev/artifact-schema';
import { ClaudeCodeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';
import { CopilotAdapter } from './copilot.js';
import type { ProviderAdapter } from './ops.js';

export * from './ops.js';
export * from './apply.js';
export { exists, which } from './detect.js';
export { BaseAdapter } from './base.js';
export { CopilotAdapter, ClaudeCodeAdapter, CodexAdapter };

export const adapters: Record<ProviderId, ProviderAdapter> = {
  copilot: new CopilotAdapter(),
  claude: new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
};
export const getAdapter = (id: ProviderId) => adapters[id];
export const allAdapters = () => Object.values(adapters);

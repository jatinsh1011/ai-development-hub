import { z } from 'zod';

/**
 * Usage-event model — the spine of future monitoring/analytics.
 *
 *   AI usage → developer → team → artifact → repository → (GitHub/Jira/CI) → engineering outcome
 *
 * Only a subset is produced today (artifact_* by the CLI, anything via POST /v1/events).
 * Outcome events (pr_*, test_*) are *recorded facts*; the platform never infers ROI from them.
 */
export const EVENT_TYPES = [
  'request', 'response', 'tool_call', 'mcp_call', 'agent_started', 'agent_finished',
  'artifact_installed', 'artifact_updated', 'artifact_removed',
  'pr_created', 'pr_merged', 'test_passed', 'test_failed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const usageEventSchema = z.object({
  orgSlug: z.string().optional(),
  teamSlug: z.string().optional(),
  eventType: z.enum(EVENT_TYPES),
  provider: z.string().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
  sessionId: z.string().optional(),
  repository: z.string().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  artifact: z.string().optional(),
  artifactVersion: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type UsageEvent = z.infer<typeof usageEventSchema>;

/** Planned dashboards, each a pure query over `events` (documented in docs/monitoring.md). */
export const PLANNED_METRICS = [
  'ai_usage', 'cost', 'requests', 'tokens', 'sessions', 'active_users', 'model_usage', 'provider_usage', 'team_usage',
  'artifact_adoption', 'agent_success_rate', 'mcp_usage', 'repeated_prompts', 'redundant_work', 'agent_loops', 'abandoned_sessions',
] as const;

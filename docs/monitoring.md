# Monitoring, analytics, knowledge loop and gateway (design)

Only the **event spine** exists today. Everything else is design.

## Event model (implemented: `packages/core`, table `events`, `POST /v1/events`)

```json
{
  "orgSlug": "acme", "teamSlug": "frontend",
  "eventType": "request", "provider": "copilot", "agent": "react-migration-agent", "model": "…",
  "sessionId": "…", "repository": "acme/web",
  "inputTokens": 123, "outputTokens": 456, "estimatedCost": 0.42,
  "artifact": "aidev/react-migration-agent", "artifactVersion": "1.4.2"
}
```

Types: `request, response, tool_call, mcp_call, agent_started, agent_finished, artifact_installed, artifact_updated, artifact_removed, pr_created, pr_merged, test_passed, test_failed`.
The CLI already emits `artifact_installed/updated/removed`. Everything else arrives via the ingest endpoint (members only, validated, ≤500 per call).

`GET /v1/orgs/:slug/analytics` returns totals, by-provider, by-model and artifact adoption for admins/maintainers; the company hub's *Usage* tab renders it. With real data the page shows only actual events (e.g. CLI installs); the optional demo fixtures include clearly synthetic events.

## Planned dashboards

Each is a query over `events` (join `artifacts`, `teams`): AI usage, cost, requests, tokens, sessions, active users, model/provider/team usage, artifact adoption, agent success rate (`agent_finished` outcomes), MCP usage (`mcp_call`), repeated prompts, redundant work, agent loops (repeated `tool_call` sequences within a session), abandoned sessions (`agent_started` without `agent_finished`).

Outcome linkage — `AI usage → developer → team → artifact → repository → GitHub/Jira/CI → outcome` — needs connectors that write `pr_*`/`test_*` events. **No ROI figures are produced or implied unless outcome events exist.** The analytics endpoint says so explicitly.

## Knowledge-compounding loop (future)

Cluster normalised prompts per org (embeddings + frequency across distinct users). A cluster seen from many developers with no matching artifact becomes a suggestion: *"80 developers ask how to migrate X → create a Prompt / Skill / Agent / Workflow"*. Publishing it closes the loop; adoption and success events feed back into the artifact's page.

## Credits and gateway (future)

```
Developer → Copilot / Claude Code / Codex → Company AI Gateway → Provider APIs
```

The gateway enforces org/team/user budgets, model allow-lists, rate limits and routing, and emits the same `request/response` events. **LiteLLM is an implementation component behind the Hub**, not the product abstraction: the Hub owns identity, policy, budgets and events; a `GatewayDriver` interface would let LiteLLM (or anything else) enforce them. Nothing of this is built.

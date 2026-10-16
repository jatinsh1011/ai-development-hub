# Provider adapters

Formats below were checked against each vendor's current official documentation on **2026-10-03**. They change quickly; each adapter's header comment names the surface it targets, and the adapter tests pin the exact output. If a vendor changes a path, fix the adapter — nothing else.

| Artifact | GitHub Copilot | Claude Code | Codex |
|---|---|---|---|
| skill / workflow | `.github/skills/<n>/SKILL.md` · user: `~/.copilot/skills` | `.claude/skills/<n>/SKILL.md` · user: `~/.claude/skills` | `.agents/skills/<n>/SKILL.md` · user: `~/.agents/skills` |
| agent | `.github/agents/<n>.agent.md` · user: `~/.copilot/agents` | `.claude/agents/<n>.md` · user: `~/.claude/agents` | **no agent file format** → installed as a skill |
| prompt | `.github/prompts/<n>.prompt.md` (project only) | user-invoked skill (`disable-model-invocation: true`) — slash commands are skills now | skill |
| instruction | `.github/instructions/<n>.instructions.md` (`applyTo: "**"`) | managed block in `CLAUDE.md` | managed block in `AGENTS.md` / `~/.codex/AGENTS.md` |
| mcp | `.vscode/mcp.json` → `servers` + `inputs` (secrets via `${input:id}`) | `.mcp.json` → `mcpServers` (secrets via `${VAR}`) | `[mcp_servers.<n>]` in `.codex/config.toml` (trusted projects) or `~/.codex/config.toml`, secrets via `env_vars` |
| plugin / bundle | installs its dependencies only | same | same |

## Neutral → provider mapping

- `agent.tools` (`read | edit | search | execute | web`) → Copilot tool aliases; Claude `Read, Grep, Glob, Edit, Write, Bash, WebFetch, WebSearch`. Codex cannot enforce them (documented in the install output).
- MCP `env` entries are **never written with values**. Copilot gets a prompted password input; Claude/Codex reference your shell environment. The install output tells you which variables to export.
- `manifest.providers.<id>.frontmatter` is merged into the provider's frontmatter last, so publishers can use provider-only features.

## Known limits

- Claude Code user-scope MCP lives in `~/.claude.json` (managed by `claude mcp add`); we refuse rather than edit it. Use `--scope project`.
- Copilot user-level prompts/instructions and MCP are editor-profile-specific; project scope only.
- Copilot tool alias `web` is passed through; the docs say unrecognised names are ignored.
- Binary assets in artifacts are not supported yet (text files only).
- Codex project `.codex/config.toml` is only honoured for trusted projects.
- Existing JSON config with comments (JSONC) is treated as a conflict instead of being rewritten.

## Adding a provider

Implement `plan(artifact, options)` returning ops, plus `inspect()` for detection evidence; extend `BaseAdapter`; register it in `adapters`. Add tests that assert the written files.

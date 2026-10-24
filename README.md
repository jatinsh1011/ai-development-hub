# AI Development Hub

**Reusable AI development building blocks** — a registry, discovery site, install CLI and (eventually) enterprise control plane for agents, skills, MCP servers, prompts, instructions and plugins.

Live at **[aidevkit.in](https://aidevkit.in)**. The CLI is [`aidevkit-cli`](https://www.npmjs.com/package/aidevkit-cli) on npm and installs the `aidevkit` command.

```
$ npm i -g aidevkit-cli
$ aidevkit install github-mcp-server

Resolving github-mcp-server...
✓ Target: GitHub Copilot
✓ Artifact resolved  mcp-registry/github-mcp-server@2.0.3

Requested permissions:
  mcp-registry/github-mcp-server
    - Network access: Makes outbound network requests; Connects to https://api.githubcopilot.com/mcp/
    - External APIs: Sends tool calls and their arguments to the server

Install mcp-registry/github-mcp-server@2.0.3 for GitHub Copilot? (y/N) y

mcp-registry/github-mcp-server@2.0.3  (mcp)
  GitHub Copilot:
    + .vscode/mcp.json
    note: VS Code will prompt for secret inputs the first time the server starts.

✓ Rollback point created  (undo with `aidevkit rollback <id>`)
✓ Configuration updated

Ready to use.
```

The core loop works end to end: **discover → inspect → install → use → update → publish → share**.

## Quick start

Requires Node ≥ 20. No Docker or database needed for development: the API embeds Postgres (PGlite) in `apps/api/.data`.

```bash
npm install
npm run import             # one-off: pull real listings (≈10 min; stop the API first — embedded DB is single-process)
npm run dev:api            # http://localhost:4000
npm run dev:web            # http://localhost:3000

npm run build:cli          # builds apps/cli/dist/aidev.js
AIDEV_REGISTRY=http://localhost:4000 node apps/cli/dist/aidev.js search "react migration"   # the CLI defaults to https://aidevkit.in
```

Create an account on the site (or `POST /v1/auth/register`). There are no built-in users any more.

### Where the data comes from

All listings are real and imported, never invented. Install counts and stars start at zero and only reflect actual use.

| Source | What | License / terms | Imported as |
|---|---|---|---|
| [Official MCP Registry](https://registry.modelcontextprotocol.io) | MCP servers (remote URLs and npm/PyPI/OCI packages) | publisher-supplied metadata, public API | `mcp-registry/*` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | agents, skills, instructions, agentic workflows, plugins | MIT; each artifact bundles the upstream `LICENSE` and links the exact commit | `awesome-copilot/*` |
| [wshobson/agents](https://github.com/wshobson/agents) | Claude Code agents, skills, slash commands (as prompts), plugins | MIT | `wshobson-agents/*` |
| [wshobson/commands](https://github.com/wshobson/commands) | slash commands (as prompts), multi-agent workflows | MIT | `wshobson-commands/*` |
| [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | Claude Code subagents | MIT | `voltagent-subagents/*` |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | agents, skills, commands, plugins | Apache-2.0 (plugins with their own restrictive license are skipped) | `claude-plugins/*` |
| [anthropics/skills](https://github.com/anthropics/skills) | skills | Apache-2.0 per skill (the source-available document skills are skipped) | `anthropic-skills/*` |
| [openai/skills](https://github.com/openai/skills) | skills | Apache-2.0 per skill | `openai-skills/*` |
| [obra/superpowers](https://github.com/obra/superpowers) | skills | MIT | `superpowers/*` |
| [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | scientific and research skills | MIT | `scientific-skills/*` |
| [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) | Cursor rules (as instructions) | CC0-1.0 | `cursorrules/*` |
| [githubnext/agentics](https://github.com/githubnext/agentics) | GitHub Agentic Workflows (installed as on-demand workflows) | MIT | `agentics/*` |

Curation rules for MCP servers (from about 38.7k registry entries to about 21k listings): there must be a repository or website link, placeholder names (test/example/template) are dropped, there are at most 3 servers per publisher namespace (bulk publishers flood the registry otherwise), and only entries whose connection can be expressed faithfully are kept. Templated URLs, required headers and user-supplied arguments are skipped, never guessed. Anything failing the security scan is rejected (e.g. 13 awesome-copilot skills containing `curl | bash`, broad `rm -rf` or credential paths). Imported listings are labelled **not reviewed** on their pages.

Collections are imported only when their content is permissively licensed (MIT, Apache-2.0, BSD, ISC, CC0). The license that applies to an item is the nearest `LICENSE` file above it, so a plugin with its own source-available terms inside an Apache-2.0 repository is skipped. Identical copies of an agent shared by several plugins become one listing, and plugins depend on the listings of their parts. Hooks, LSP and Copilot-extension-only plugins are skipped because aidevkit can't install them across tools.

Re-run `npm run import` any time; it is idempotent (unchanged listings are skipped; changed upstream content becomes a new version). Options: `npm run import -- mcp|awesome-copilot|collections [--limit N] [--per-namespace N] [--source <collection id>] [--sources-dir <dir of owner_repo checkouts>]`.

The fictional demo catalog (Acme company, demo users) still exists for tests and screenshots only: `npm run demo -w @aidev/api` on an empty database.

Point the CLI at a registry with `aidevkit config set registry <url>` or `AIDEV_REGISTRY`. For a production-shaped stack: `docker compose up` (Postgres + API + web; see *Status* below).

## Production

The public site and registry run at **https://aidevkit.in** on one VPS, behind a shared Caddy:
`docker-compose.prod.yml` runs Postgres, the API and the web app on the external `proxy` network (no published ports), and
Caddy sends `/v1/*` to `aidev-api:4000` and everything else to `aidev-web:3000`, so the site and the CLI use the same origin.

```bash
cp .env.example .env    # then set POSTGRES_PASSWORD (hex, no URL-special characters) and SITE_URL=https://aidevkit.in
docker compose -f docker-compose.prod.yml up -d --build
# refresh listings (idempotent; safe while the API runs):
docker compose -f docker-compose.prod.yml run --rm api npx tsx src/import/run.ts all
```

## Repository layout

```
apps/
  api/                 NestJS registry API (auth, artifacts, orgs, policies, events)
  web/                 Next.js + Tailwind site (discovery, artifact pages, publish, company hub)
  cli/                 `aidevkit` — bundled to a single self-contained npm package
packages/
  artifact-schema/     manifest (zod), semver, validation, security scanner, risk profile, content hashing
  provider-adapters/   Copilot / Claude Code / Codex adapters + the plan/apply/backup/rollback engine
  cli-engine/          installer, state, lockfile, registry client, doctor, output/exit-code contract
  database/            SQL migrations, Postgres + PGlite connectors, search provider
  core/                shared usage-event model
examples/              valid example artifacts (validated by a test)
docs/                  architecture, providers, security, monitoring, roadmap
```

## Quality gates

```bash
npm run check      # eslint + tsc (all workspaces) + vitest (72 tests)
```

Notable tests: `apps/cli/src/agent-workflow.e2e.test.ts` drives the **built `aidevkit` binary** against a live registry seeded with the test fixtures exactly as a coding agent would (`search --json` → `info --json` → `install --yes --json`), and checks exit codes, conflict refusal, backup/rollback, updates (major versions are never applied silently), lockfile restore, policy blocking and doctor.

## Docs

- [Architecture & decisions](docs/architecture.md)
- [Provider adapters](docs/providers.md) — what was verified against official docs, and the limits
- [Security model](docs/security.md)
- [Monitoring, analytics & gateway design](docs/monitoring.md)
- [Roadmap & known gaps](docs/roadmap.md)

## Status — read this before relying on it

This is a serious foundation, not a finished product. What is verified vs. not:

- **Verified by automated tests:** schema/validation/scanner, all three adapters (install, merge, conflict, uninstall, rollback), API (search, visibility, governance, publish rules, orgs, events), the CLI binary end to end, and the packed npm tarball installed into a clean prefix.
- **Verified manually:** the web UI renders against the live API (screenshots of home, search, artifact pages; company hub fetched with an admin session). There are no automated browser tests.
- **Not verified:** the real-Postgres connector (`DATABASE_URL`) and `docker compose` — Docker was not running in the development environment, so only the embedded PGlite path was exercised. The SQL is plain Postgres.
- **Not built (by design, see roadmap):** GitHub OAuth, S3 storage driver, package signing, rate limiting, email verification, billing, AI gateway, outcome analytics.

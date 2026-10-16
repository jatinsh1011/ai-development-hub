# AI Development Hub

**Reusable AI development building blocks** — a registry, discovery site, install CLI and (eventually) enterprise control plane for agents, skills, MCP servers, prompts, instructions and plugins.

```bash
aidev search "react migration"
aidev install react-migration-agent
```

```
✓ Artifact resolved  aidev/react-migration-agent@1.4.2
✓ Dependencies resolved (3): react-19-migration@1.3.0, rtl-migration@1.0.0, github@1.2.0
✓ Target: GitHub Copilot

GitHub Copilot:
  + .github/agents/react-migration-agent.agent.md
  + .vscode/mcp.json
✓ Rollback point created
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
node apps/cli/dist/aidev.js search "react migration"
```

Create an account on the site (or `POST /v1/auth/register`). There are no built-in users any more.

### Where the data comes from

All listings are real and imported, never invented. Install counts and stars start at zero and only reflect actual use.

| Source | What | License / terms | Imported as |
|---|---|---|---|
| [Official MCP Registry](https://registry.modelcontextprotocol.io) | MCP servers (remote URLs and npm/PyPI/OCI packages) | publisher-supplied metadata, public API | `mcp-registry/*` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | agents, skills, instructions | MIT; each artifact bundles the upstream `LICENSE` and links the exact commit | `awesome-copilot/*` |

Curation rules for MCP servers (from about 38.7k registry entries to about 21k listings): there must be a repository or website link, placeholder names (test/example/template) are dropped, there are at most 3 servers per publisher namespace (bulk publishers flood the registry otherwise), and only entries whose connection can be expressed faithfully are kept. Templated URLs, required headers and user-supplied arguments are skipped, never guessed. Anything failing the security scan is rejected (e.g. 13 awesome-copilot skills containing `curl | bash`, broad `rm -rf` or credential paths). Imported listings are labelled **not reviewed** on their pages.

Re-run `npm run import` any time; it is idempotent (unchanged listings are skipped; changed upstream content becomes a new version). Options: `npm run import -- mcp|awesome-copilot [--limit N] [--per-namespace N]`.

The fictional demo catalog (Acme company, demo users) still exists for tests and screenshots only: `npm run demo -w @aidev/api` on an empty database.

Point the CLI at a registry with `aidev config set registry <url>` or `AIDEV_REGISTRY`. For a production-shaped stack: `docker compose up` (Postgres + API + web; see *Status* below).

## Repository layout

```
apps/
  api/                 NestJS registry API (auth, artifacts, orgs, policies, events)
  web/                 Next.js + Tailwind site (discovery, artifact pages, publish, company hub)
  cli/                 `aidev` — bundled to a single self-contained npm package
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

Notable tests: `apps/cli/src/agent-workflow.e2e.test.ts` drives the **built `aidev` binary** against a live registry seeded with the test fixtures exactly as a coding agent would (`search --json` → `info --json` → `install --yes --json`), and checks exit codes, conflict refusal, backup/rollback, updates (major versions are never applied silently), lockfile restore, policy blocking and doctor.

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

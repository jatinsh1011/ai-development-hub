# Architecture

```
apps/web (Next.js) ─┐
apps/cli (aidevkit)  ──┼─►  apps/api (NestJS) ──► Postgres (FTS)     metadata, orgs, policies, events
AI coding agents ───┘          │            └─► Object storage     immutable version bundles
                               └─► usage events (artifact_*, request, mcp_call, …)

aidevkit ► cli-engine ► provider-adapters/{copilot,claude,codex} ► project files + .aidev/{state,backups}
```

## Key decisions

| Decision | Why |
|---|---|
| **One neutral manifest, per-provider adapters** | Providers share ideas (`SKILL.md`) but not discovery paths or schemas. The manifest never pretends otherwise: `providers.<id>.frontmatter` overrides are passed through untouched. |
| **Adapters are pure planners** | An adapter returns declarative ops (`write`, `json-key`, `json-array`, `text-block`). One engine applies them with backup, diff, conflict detection and rollback, so safety is implemented once, not three times. |
| **Immutable, content-hashed versions** | `UNIQUE(artifact_id, version)`; bundle storage refuses to overwrite; sha256 over the canonical file set. The CLI re-hashes and re-validates on install, so it does not trust the registry. |
| **Managed blocks instead of rewriting shared files** | `CLAUDE.md`, `AGENTS.md` and Codex `config.toml` contain user content/comments. We insert marker-delimited blocks and leave everything else byte-for-byte intact. Strict-JSON files that fail to parse (e.g. JSONC with comments) are a conflict, never a rewrite. |
| **Plain SQL migrations on `pg`, PGlite for dev/tests** | No ORM version churn; Postgres full-text search with prefix matching; zero-setup dev. `Db` is a 3-method interface. |
| **Search behind `SearchProvider`** | `PgSearch` today (weighted tsvector, prefix terms, popularity boost); OpenSearch/Typesense later without touching callers. |
| **Visibility in SQL, not in controllers** | `VISIBLE_SQL` is one predicate shared by search, lookup, profiles and company listings, so a new endpoint can't forget it. |
| **The CLI is a machine interface** | `--json` emits exactly one document; exit codes are a contract; consent is explicit (`--yes`); tokens via `AIDEV_TOKEN`. |

## Data model (summary)

`users` · `api_tokens` · `organizations` · `teams` · `memberships(admin|maintainer|developer)` · `team_members` ·
`artifacts` (owner user|org, visibility `public|unlisted|private|organization|team`, type, counters, search vector) ·
`artifact_versions` (manifest, file index, storage key, sha256, scan findings, risk profile) ·
`artifact_grants` (share to selected teams/users) · `org_policies(approved|blocked)` · `stars` · `ratings` · `reports` · `events`.

Adding an artifact type = add it to `ARTIFACT_TYPES`, give it an entry file in `entry.ts`, and teach each adapter's `plan()` (unknown types fall through to "installs dependencies only"). No migration is needed.

## Install transaction

1. Resolve root + dependency closure server-side (cycle detection, visibility- and policy-aware, company artifacts preferred for members). Blocked → 403.
2. Verify hash, re-validate manifest/paths, re-scan locally.
3. Show permissions + findings; require consent (`--yes` or prompt; `--allow-risky` for high-severity findings).
4. **Plan** every (artifact × provider) with `dryRun` — any conflict aborts before a single write.
5. **Apply**; all writes share one rollback point; any failure restores everything.
6. Remove files the new version no longer ships (update case), record state + `.aidev-lock.json`, report an install event.

## Governance

Company admins mark artifacts `approved`/`blocked` per organisation. For a member, `blocked` beats `approved` beats `external`. Org-owned artifacts count as approved unless blocked. The resolver refuses blocked artifacts and blocked transitive dependencies.

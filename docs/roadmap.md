# Roadmap & known gaps

## Built (MVP)

Registry API · web discovery/search/artifact/publish/profile/company hub · `aidevkit` CLI (login, search, browse, info, install, uninstall, update, list, doctor, publish, init, team, provider, config, rollback) · Copilot/Claude/Codex adapters · private orgs, teams, visibility, grants, approve/block · usage-event ingest and basic analytics · lockfile.

## Honest gaps in what exists

- **Trending** is not implemented (needs time-windowed install counts); the home page shows Popular and Recently published instead.
- `aidevkit browse` is a non-interactive listing, not a TUI.
- Dependency resolution is "highest satisfying version per name"; there is no conflict solver for diamond dependencies with incompatible ranges.
- Lockfile restore installs each pinned entry independently (no dependency re-resolution); edges are rebuilt from the pinned manifests.
- Web publishing reads a directory in the browser (text files); there is no repository import yet.
- Web UI has no automated tests; org admin actions (create team/member/policy) were exercised through the API tests, not a browser.
- Real-Postgres connector and `docker compose` are untested (see README).
- `unlisted` artifacts are hidden from search but visible to anyone with the link; `private` is owner/org-admin only.

- Imported MCP listings are not reviewed; only a static scan runs. Some upstream titles are poor (e.g. Stripe's is literally "mcp") and are shown as published.
- awesome-copilot "plugins", hooks and workflows are not imported yet (only agents, skills, instructions); MCP entries using `mcpb`, NuGet or Cargo packages are skipped.

## Next

1. GitHub OAuth (`users.github_id` exists) and verified-publisher flow.
2. S3-compatible storage driver; package signing (sigstore-style) on the existing sha256 identity.
3. Rate limiting, email verification, audit log.
4. Repo import (`aidevkit publish --from-git`), binary assets, per-file size policy.
5. Trending, ratings UI, reports triage.
6. Org allow-list mode ("only approved artifacts installable") and per-team policies.
7. Monitoring connectors (GitHub, CI) → outcome events → dashboards. Then the knowledge-loop suggestions. Then the gateway.

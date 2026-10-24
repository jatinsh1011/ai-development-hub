# aidev

Install AI agents, skills, MCP servers, prompts, instructions, workflows and plugins into **GitHub Copilot, Claude Code and Codex** with one command. aidev writes each one where your tool reads it, shows what it can access before anything is written, and can undo any install.

Browse the catalog (30,000+ listings) at **[aidevkit.in](https://aidevkit.in)**.

```bash
npm i -g aidev

aidev search "react migration"
aidev info github-mcp-server
aidev install github-mcp-server        # asks before writing; --yes to skip
aidev list
aidev rollback <id>                     # every install is a rollback point
```

## Where files go

| | GitHub Copilot | Claude Code | Codex |
|---|---|---|---|
| agent | `.github/agents/<name>.agent.md` | `.claude/agents/<name>.md` | a skill |
| skill | `.github/skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` |
| prompt | `.github/prompts/<name>.prompt.md` | a skill you invoke by name | a skill |
| instruction | `.github/instructions/<name>.instructions.md` | a block in `CLAUDE.md` | a block in `AGENTS.md` |
| MCP server | `.vscode/mcp.json` | `.mcp.json` | `.codex/config.toml` |

aidev detects the tool your project uses, or pick one with `--provider copilot|claude|codex`.

## For coding agents

Commands support `--json` (one JSON document on stdout), `--yes` (non-interactive consent) and `--no-color`, and return documented exit codes (`aidev --help` lists them). Authenticate with `AIDEV_TOKEN`.

```bash
aidev search "postgres" --json
aidev install github-mcp-server --yes --json --provider claude
```

## More

- `.aidev-lock.json` pins versions and hashes; `aidev install` with no name restores it on another machine.
- `aidev update` asks before applying a major version.
- Use your own registry with `aidev config set registry <url>` or `AIDEV_REGISTRY`.

Source: [github.com/jatinsh1011/ai-development-hub](https://github.com/jatinsh1011/ai-development-hub) · MIT license

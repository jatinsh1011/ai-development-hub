export const metadata = { title: 'CLI & agents' };

const Code = ({ children }: { children: string }) => (
  <pre className="terminal-block my-4">{children}</pre>
);

export default function Docs() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="h-display text-5xl sm:text-6xl">The aidev CLI</h1>
      <p className="mt-5 text-lg text-muted">A package manager for AI development building blocks. Humans and coding agents use the same commands.</p>

      <div className="prose-hub mt-12" style={{ maxWidth: 'none' }}>
        <h2>Install</h2>
        <Code>{`npm install -g aidevkit-cli      # the command is aidev
aidev search "playwright"
aidev info playwright-tester
aidev install playwright-tester`}</Code>

        <h2>Where files go</h2>
        <p>Each provider adapter translates one neutral artifact into that tool’s current format. Nothing is overwritten silently: conflicts abort, <code>--force</code> backs up first, and every install is a rollback point.</p>
        <table>
          <thead><tr><th>Artifact</th><th>GitHub Copilot</th><th>Claude Code</th><th>Codex</th></tr></thead>
          <tbody>
            <tr><td>skill</td><td><code>.github/skills/&lt;n&gt;/SKILL.md</code></td><td><code>.claude/skills/&lt;n&gt;/SKILL.md</code></td><td><code>.agents/skills/&lt;n&gt;/SKILL.md</code></td></tr>
            <tr><td>agent</td><td><code>.github/agents/&lt;n&gt;.agent.md</code></td><td><code>.claude/agents/&lt;n&gt;.md</code></td><td>installed as a skill (no agent file format)</td></tr>
            <tr><td>prompt</td><td><code>.github/prompts/&lt;n&gt;.prompt.md</code></td><td>user-invoked skill</td><td>skill</td></tr>
            <tr><td>instruction</td><td><code>.github/instructions/&lt;n&gt;.instructions.md</code></td><td>block in <code>CLAUDE.md</code></td><td>block in <code>AGENTS.md</code></td></tr>
            <tr><td>mcp</td><td><code>.vscode/mcp.json</code></td><td><code>.mcp.json</code></td><td><code>.codex/config.toml</code> or <code>~/.codex/config.toml</code></td></tr>
          </tbody>
        </table>

        <h2>For coding agents</h2>
        <p>Every command supports <code>--json</code> (a single JSON document on stdout), <code>--yes</code> (non-interactive consent) and <code>--no-color</code>. Authenticate with <code>AIDEV_TOKEN</code>.</p>
        <Code>{`aidev search "react 19" --json
aidev info react19-migrator --json
aidev install react19-migrator --yes --json --provider copilot`}</Code>
        <table>
          <thead><tr><th>Exit</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td>0</td><td>success</td></tr>
            <tr><td>2</td><td>usage error / provider not determinable</td></tr>
            <tr><td>3</td><td>authentication required</td></tr>
            <tr><td>4</td><td>not found</td></tr>
            <tr><td>5</td><td>conflict (would overwrite existing config)</td></tr>
            <tr><td>6</td><td>blocked by company policy</td></tr>
            <tr><td>7</td><td>consent required (re-run with <code>--yes</code>)</td></tr>
            <tr><td>8</td><td>validation failed</td></tr>
            <tr><td>9</td><td>network error</td></tr>
          </tbody>
        </table>

        <h2>Safety</h2>
        <p>Artifacts are untrusted. Installing never executes anything: scripts are copied, not run. Permissions are shown before install, high-severity scan findings require <code>--allow-risky</code>, content hashes are verified, and company-blocked artifacts are refused.</p>

        <h2>Publish</h2>
        <Code>{`aidev init artifact skill my-skill
cd my-skill && aidev publish --dry-run
aidev publish --org acme --visibility organization`}</Code>
      </div>
    </div>
  );
}

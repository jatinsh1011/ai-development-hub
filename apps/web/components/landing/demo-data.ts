/**
 * Script and file contents for the landing-page install demo.
 * Every terminal line and file below was captured from the real `aidevkit` CLI (v0.1.0) installing
 * real catalog listings; only the rollback ids are reused from those runs.
 */
import { m, type Step, type TermLine } from './demo-engine';
import type { Lang } from './highlight';

export type ToolId = 'copilot' | 'claude-code' | 'codex';
export const TOOLS: { id: ToolId; label: string; name: string; key: string }[] = [
  { id: 'copilot', label: 'Copilot', name: 'GitHub Copilot', key: 'copilot' },
  { id: 'claude-code', label: 'Claude Code', name: 'Claude Code', key: 'claude' },
  { id: 'codex', label: 'Codex', name: 'Codex', key: 'codex' },
];
export const DEFAULT_TOOL: ToolId = 'claude-code';
const tool = (id: ToolId) => TOOLS.find((x) => x.id === id)!;

type Art = {
  short: string; ref: string; version: string; type: 'mcp' | 'skill' | 'agent';
  title: string; description: string; publisher: string; perms: string[];
  files: Record<ToolId, string[]>; note?: Partial<Record<ToolId, string>>; backup: string;
};

export const ARTS: Art[] = [
  {
    short: 'github-mcp-server', ref: 'mcp-registry/github-mcp-server', version: '1.13.0', type: 'mcp', title: 'GitHub', publisher: 'GitHub',
    description: 'Connect AI assistants to GitHub - manage repos, issues, PRs, and workflows through natural language.',
    perms: ['- Network access: Makes outbound network requests; Connects to https://api.githubcopilot.com/mcp/', '- External APIs: Sends tool calls and their arguments to the server'],
    files: { copilot: ['.vscode/mcp.json'], 'claude-code': ['.mcp.json'], codex: ['.codex/config.toml'] },
    note: {
      copilot: 'VS Code will prompt for secret inputs the first time the server starts.',
      'claude-code': 'Claude Code asks you to approve project MCP servers on first use.',
      codex: 'Project .codex/config.toml is only read for trusted projects.',
    },
    backup: '2026-10-19T17-18-47-970Z-ofa0',
  },
  {
    short: 'create-readme', ref: 'awesome-copilot/create-readme', version: '1.0.0', type: 'skill', title: 'Create README', publisher: 'awesome-copilot',
    description: 'Create a README.md file for the project',
    perms: ['- Filesystem read: Reads files in your project'],
    files: {
      copilot: ['.github/skills/create-readme/SKILL.md', '.github/skills/create-readme/LICENSE'],
      'claude-code': ['.claude/skills/create-readme/SKILL.md', '.claude/skills/create-readme/LICENSE'],
      codex: ['.agents/skills/create-readme/SKILL.md', '.agents/skills/create-readme/LICENSE'],
    },
    backup: '2026-10-19T17-18-57-433Z-myie',
  },
  {
    short: 'playwright-tester', ref: 'awesome-copilot/playwright-tester', version: '1.0.0', type: 'agent', title: 'Playwright Tester', publisher: 'awesome-copilot',
    description: 'Testing mode for Playwright tests',
    perms: ['- Filesystem read: Reads files in your project', '- Filesystem write: Creates or edits files in your project', '{wa:!} Local command execution: Runs shell commands', '- Network access: Makes outbound network requests'],
    files: {
      copilot: ['.github/agents/playwright-tester.agent.md'],
      'claude-code': ['.claude/agents/playwright-tester.md'],
      codex: ['.agents/skills/playwright-tester/SKILL.md'],
    },
    backup: '2026-10-19T17-21-04-562Z-ta5g',
  },
];

/** A few more real listings so visitors can search the demo terminal. */
const EXTRA = [
  { ref: 'mcp-registry/abhishekkumar2021-github', version: '0.2.0', type: 'mcp', description: 'GitHub via MCP: search, repos, issues, PRs, files, notifications. OAuth device flow or token.' },
  { ref: 'awesome-copilot/github-actions-hardening', version: '1.0.0', type: 'skill', description: 'Security hardening reviewer for GitHub Actions workflow files (.github/workflows/*.yml).' },
  { ref: 'awesome-copilot/postgresql-code-review', version: '1.0.0', type: 'skill', description: 'PostgreSQL-specific code review assistant focusing on PostgreSQL best practices.' },
  { ref: 'awesome-copilot/react19-migrator', version: '1.0.0', type: 'agent', description: 'Migrates a React codebase to React 19.' },
  { ref: 'mcp-registry/stripe-mcp', version: '0.2.4', type: 'mcp', description: 'Stripe MCP server for payments, customers and subscriptions.' },
  { ref: 'mcp-registry/atlassian-mcp-server', version: '1.0.0', type: 'mcp', description: 'Atlassian Rovo MCP server for Jira and Confluence.' },
];

const WORKSPACE_FILES = ['.aidev-lock.json', '.aidev/state.json'];
export const BASE_FILES = ['README.md', 'package.json', 'tsconfig.json', '.gitignore', 'src/app.tsx', 'src/lib/cart.ts'];
export const DEFAULT_OPEN = 'README.md';
/** Folders the explorer never expands (aidevkit's own bookkeeping). */
export const COLLAPSED = new Set(['.aidev']);

const blank: TermLine = [{ t: '' }];
const out = (src: string, wait?: number): Step => ({ kind: 'out', line: m(src), wait });

/** Output of `aidevkit install <short>`, as printed by the real CLI, plus the files it writes. */
function installSteps(a: Art, id: ToolId, files: string[]): Step[] {
  const name = tool(id).name;
  const first = !files.includes('.aidev-lock.json');
  const written = a.files[id];
  const note = a.note?.[id];
  return [
    out(`Resolving ${a.short}...`, 240),
    out(`{ok:✓} Target: ${name}`, 520),
    out(`{ok:✓} Artifact resolved  ${a.ref}@${a.version}`, 240),
    { kind: 'out', line: blank, wait: 80 },
    out('{b:Requested permissions:}', 80),
    out(`  ${a.ref}`, 60),
    ...a.perms.map((p) => out(`    ${p}`, 70)),
    { kind: 'out', line: blank, wait: 60 },
    out(`Install ${a.ref}@${a.version} for ${name}? (y/N) `, 160),
    { kind: 'append', seg: { t: 'y', c: 'cm' }, wait: 950 },
    { kind: 'out', line: blank, wait: 220 },
    out(`{b:${a.ref}@${a.version}}{dim:  (${a.type})}`, 140),
    out(`  ${name}:`, 70),
    ...written.map((f) => out(`    {add:+} ${f}`, 90)),
    ...(note ? [out(`{dim:    note: ${note}}`, 80)] : []),
    { kind: 'out', line: blank, wait: 60 },
    ...written.map((path): Step => ({ kind: 'add', path, wait: 0 })),
    ...(first ? WORKSPACE_FILES.map((path): Step => ({ kind: 'add', path })) : []),
    out(`{ok:✓} Rollback point created  ${a.backup}  {dim:(undo with \`aidevkit rollback ${a.backup}\`)}`, 380),
    out('{ok:✓} Configuration updated', 220),
    { kind: 'open', path: written[0], wait: 120 },
    { kind: 'out', line: blank, wait: 100 },
    out('{b:Ready to use.}', 60),
  ];
}

export type Scene = { id: string; label: string; coach: { title: string; body: string }; steps: (id: ToolId) => Step[] };

const filesAfter = (n: number, id: ToolId) => [...BASE_FILES, ...ARTS.slice(0, n).flatMap((a) => a.files[id]), ...(n > 0 ? WORKSPACE_FILES : [])];

export const SCENES: Scene[] = [
  {
    id: 'mcp', label: 'an MCP server',
    coach: { title: 'one command.', body: 'aidevkit writes the MCP config {tool} reads, in the format it expects.' },
    steps: (id) => [{ kind: 'type', text: `aidevkit install ${ARTS[0].short}`, pre: 700 }, ...installSteps(ARTS[0], id, filesAfter(0, id)),
      { kind: 'sticker', text: `✓ ready in ${tool(id).name}`, tone: 'amber', pos: 'top', wait: 260 }],
  },
  {
    id: 'skill', label: 'a skill',
    coach: { title: 'skills, too.', body: 'Same command. The SKILL.md lands in the folder {tool} looks in.' },
    steps: (id) => [{ kind: 'type', text: `aidevkit install ${ARTS[1].short}`, pre: 600 }, ...installSteps(ARTS[1], id, filesAfter(1, id)),
      { kind: 'sticker', text: 'it’s just files', tone: 'mint', pos: 'top', wait: 260 }],
  },
  {
    id: 'agent', label: 'an agent',
    coach: { title: 'it asks first.', body: 'You see every permission before anything is written.' },
    steps: (id) => [{ kind: 'type', text: `aidevkit install ${ARTS[2].short}`, pre: 600 }, ...installSteps(ARTS[2], id, filesAfter(2, id)),
      { kind: 'sticker', text: 'rollback point saved', tone: 'pink', pos: 'top', wait: 260 }],
  },
  {
    id: 'undo', label: 'undo it',
    coach: { title: 'changed your mind?', body: 'Every install is a rollback point. One command puts the files back.' },
    steps: (id) => [
      { kind: 'type', text: 'aidevkit rollback ', paste: ARTS[2].backup, pre: 700 },
      out(`{ok:✓} Restored 1 file(s); reverted ${ARTS[2].ref}`, 480),
      { kind: 'remove', path: ARTS[2].files[id][0] },
      { kind: 'sticker', text: '✓ undone', tone: 'pink', pos: 'top', wait: 240 },
      { kind: 'type', text: 'aidevkit list', pre: 1300 },
      out(`{b:${ARTS[0].ref}}@${ARTS[0].version}  {dim:${ARTS[0].type} · ${tool(id).key}}`, 300),
      out(`{b:${ARTS[1].ref}}@${ARTS[1].version}  {dim:${ARTS[1].type} · ${tool(id).key}}`, 80),
    ],
  },
];

/* ---- file contents ---------------------------------------------------------------------- */

const MCP_JSON = (key: 'mcpServers' | 'servers') => `{
  "${key}": {
    "github-mcp-server": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    }
  }
}`;

const CODEX_TOML = `# aidev:begin github-mcp-server
[mcp_servers.github-mcp-server]
url = "https://api.githubcopilot.com/mcp/"
# aidev:end github-mcp-server`;

const SKILL_MD = `---
name: create-readme
description: Create a README.md file for the project
---

## Role

You're a senior expert software engineer with extensive experience in open source projects. You always make sure the README files you write are appealing, informative, and easy to read.

## Task

1. Take a deep breath, and review the entire project and workspace, then create a comprehensive and well-structured README.md file for the project.
2. Take inspiration from these readme files for the structure, tone and content:
3. Do not overuse emojis, and keep the readme concise and to the point.
4. Do not include sections like "LICENSE", "CONTRIBUTING", "CHANGELOG", etc. There are dedicated files for those sections.
5. Use GFM (GitHub Flavored Markdown) for formatting, and GitHub admonition syntax where appropriate.
6. If you find a logo or icon for the project, use it in the readme's header.`;

const LICENSE = `MIT License

Copyright GitHub, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions: …`;

const AGENT_BODY = `## Core Responsibilities

1.  **Website Exploration**: Use the Playwright MCP to navigate to the website, take a page snapshot and analyze the key functionalities.
2.  **Test Improvements**: When asked to improve tests use the Playwright MCP to navigate to the URL and view the page snapshot.
3.  **Test Generation**: Once you have finished exploring the site, start writing well-structured and maintainable Playwright tests using TypeScript.
4.  **Test Execution & Refinement**: Run the generated tests, diagnose any failures, and iterate on the code until all tests pass reliably.
5.  **Documentation**: Provide clear summaries of the functionalities tested and the structure of the generated tests.`;

const AGENT_COPILOT = `---
name: playwright-tester
description: Testing mode for Playwright tests
tools:
  - changes
  - codebase
  - edit/editFiles
  - fetch
  - findTestFiles
  - problems
  - runCommands
  - runTasks
  - runTests
  - search
  - playwright
model: Claude Sonnet 4
---

${AGENT_BODY}`;

const AGENT_CLAUDE = `---
name: playwright-tester
description: Testing mode for Playwright tests
tools: Read, Grep, Glob, Edit, Write, Bash, WebFetch, WebSearch
---

${AGENT_BODY}`;

const AGENT_CODEX = `---
name: playwright-tester
description: Testing mode for Playwright tests
---

${AGENT_BODY}`;

const BASE: Record<string, { lang: Lang; text: string }> = {
  'README.md': { lang: 'md', text: `# acme-shop

A small storefront: product pages, a cart and checkout.

## Develop

\`\`\`bash
npm install
npm run dev
\`\`\`

Open http://localhost:3000 and start shopping.

## Test

\`\`\`bash
npm test
\`\`\`` },
  'package.json': { lang: 'json', text: `{
  "name": "acme-shop",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.0"
  }
}` },
  'tsconfig.json': { lang: 'json', text: `{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "jsx": "preserve"
  }
}` },
  '.gitignore': { lang: 'text', text: `node_modules
.next
.env` },
  'src/app.tsx': { lang: 'ts', text: `import { Cart } from './lib/cart';

export default function App() {
  return <Cart />;
}` },
  'src/lib/cart.ts': { lang: 'ts', text: `export type Item = { id: string; price: number; qty: number };

export const total = (items: Item[]) =>
  items.reduce((sum, i) => sum + i.price * i.qty, 0);` },
};

export function fileFor(path: string, id: ToolId): { lang: Lang; text: string } | null {
  if (BASE[path]) return BASE[path];
  if (path === '.mcp.json') return { lang: 'json', text: MCP_JSON('mcpServers') };
  if (path === '.vscode/mcp.json') return { lang: 'json', text: MCP_JSON('servers') };
  if (path === '.codex/config.toml') return { lang: 'toml', text: CODEX_TOML };
  if (path.endsWith('create-readme/SKILL.md')) return { lang: 'md', text: SKILL_MD };
  if (path.endsWith('create-readme/LICENSE')) return { lang: 'text', text: LICENSE };
  if (path.includes('playwright-tester')) return { lang: 'md', text: id === 'copilot' ? AGENT_COPILOT : id === 'codex' ? AGENT_CODEX : AGENT_CLAUDE };
  return null;
}

/* ---- commands a visitor can type ---------------------------------------------------------- */

const HELP = `Usage: aidevkit [options] [command]

Package manager for reusable AI development building blocks

Commands:
  search [options] <query...>            search the registry
  info [options] <artifact>              show details, permissions and compatibility
  install [options] [artifact]           install an artifact (or restore from .aidev-lock.json)
  uninstall|remove [options] <artifact>  remove an installed artifact
  update [options] [artifact]            update installed artifacts (major versions need explicit consent)
  list|ls [options]                      list installed artifacts
  rollback [options] [backupId]          restore files from a backup created by install/update/uninstall
  doctor [options]                       check registry, auth, providers and installed files
  init                                   detect your project and recommend building blocks
  publish [options] [dir]                validate and publish an artifact directory

Exit codes: 0 ok · 1 error · 2 usage · 3 auth · 4 not found · 5 conflict · 6 blocked by policy`;

const lines = (text: string, tone?: 'dim'): Step[] => text.split('\n').map((l, i) => ({ kind: 'out', line: [{ t: l, c: tone }], wait: i ? 16 : 120 }));
const find = (q: string) => ARTS.find((a) => a.short === q || a.ref === q);

function installedNow(files: string[], id: ToolId) {
  return ARTS.filter((a) => a.files[id].every((f) => files.includes(f)));
}

export function respond(input: string, ctx: { tool: ToolId; files: string[] }): { steps: Step[]; clear?: boolean } {
  const [cmd, ...rest] = input.trim().split(/\s+/);
  const args = rest.filter((x) => !x.startsWith('-'));
  if (cmd === 'clear') return { steps: [], clear: true };
  if (cmd === 'pwd') return { steps: [out('/Users/you/acme-shop', 60)] };
  if (cmd === 'ls') {
    const top = [...new Set(ctx.files.map((f) => f.split('/')[0]))].filter((f) => rest.includes('-a') || rest.includes('-la') || !f.startsWith('.')).sort();
    return { steps: [out(top.join('  '), 60)] };
  }
  if (cmd === 'cat') {
    const f = args[0] && ctx.files.includes(args[0]) ? fileFor(args[0], ctx.tool) : null;
    return { steps: f ? lines(f.text) : [out(`cat: ${args[0] ?? ''}: No such file or directory`, 60)] };
  }
  if (cmd === 'npm' || cmd === 'npx') return { steps: [out('{dim:aidevkit is already installed in this demo. In your own terminal: npm i -g aidevkit-cli}', 80)] };
  if (cmd !== 'aidevkit' && cmd !== 'aidev') return { steps: [out(`zsh: command not found: ${cmd}`, 60)] };

  const sub = args[0];
  const name = args[1];
  if (!sub || sub === 'help' || rest.includes('--help') || rest.includes('-h')) return { steps: lines(HELP) };
  if (rest.includes('-V') || rest.includes('--version')) return { steps: [out('0.1.0', 60)] };

  if (sub === 'search') {
    const q = args.slice(1).join(' ').replace(/^["']|["']$/g, '').toLowerCase();
    if (!q) return { steps: [out('{er:✗} missing required argument \'query\'', 60)] };
    const all = [...ARTS.map((a) => ({ ref: a.ref, version: a.version, type: a.type, description: a.description })), ...EXTRA];
    const hits = all.filter((a) => `${a.ref} ${a.description}`.toLowerCase().includes(q));
    if (!hits.length) return { steps: [out(`0 results for "${q}" {dim:in this demo catalog. The real hub has 21,000+ listings.}`, 140)] };
    return {
      steps: [
        out(`${hits.length} results for "${q}" {dim:(demo catalog)}`, 160),
        { kind: 'out', line: blank, wait: 40 },
        ...hits.flatMap((h): Step[] => [
          out(`{b:${h.ref.padEnd(42)}}{dim:v${h.version.padEnd(8)}}${h.type.padEnd(12)}`, 50),
          out(`{dim:${' '.repeat(42)}${h.description}}`, 20),
        ]),
      ],
    };
  }

  if (sub === 'info') {
    const a = name ? find(name) : undefined;
    if (!a) return { steps: [out(`{er:✗} artifact "${name ?? ''}" not found`, 120), out('{dim:  try aidevkit search <query>}', 20)] };
    return {
      steps: [
        out(`{b:${a.title}}  ${a.ref}@${a.version}`, 140),
        out(a.description, 20),
        { kind: 'out', line: blank, wait: 20 },
        out(`{dim:Author: ${a.publisher}  ·  visibility: public}`, 20),
        out('Compatible with: {ok:✓} Copilot  {ok:✓} Claude Code  {ok:✓} Codex', 20),
        { kind: 'out', line: blank, wait: 20 },
        out('{b:Permissions:}', 20),
        ...a.perms.map((p) => out(`  ${p}`, 20)),
        { kind: 'out', line: blank, wait: 20 },
        out(`{dim:  $ aidevkit install ${a.ref}}`, 20),
      ],
    };
  }

  if (sub === 'install' || sub === 'i' || sub === 'add') {
    const a = name ? find(name) : undefined;
    if (!name) return { steps: [out('{dim:Nothing to restore: no .aidev-lock.json entries are missing.}', 100)] };
    if (!a) return { steps: [out(`Resolving ${name}...`, 120), out(`{er:✗} artifact "${name}" not found`, 380), out('{dim:  try aidevkit search <query>, or install github-mcp-server, create-readme or playwright-tester}', 20)] };
    return { steps: installSteps(a, ctx.tool, ctx.files).map((s) => (s.kind === 'out' && 'wait' in s ? { ...s, wait: Math.min(s.wait ?? 0, 520) } : s)) };
  }

  if (sub === 'list' || sub === 'ls') {
    const inst = installedNow(ctx.files, ctx.tool);
    if (!inst.length) return { steps: [out('Nothing installed. Try `aidevkit search <query>`.', 80)] };
    return { steps: inst.map((a) => out(`{b:${a.ref}}@${a.version}  {dim:${a.type} · ${tool(ctx.tool).key}}`, 60)) };
  }

  if (sub === 'rollback') {
    const inst = installedNow(ctx.files, ctx.tool);
    if (!name) {
      if (!inst.length) return { steps: [out('No backups.', 60)] };
      return { steps: inst.map((a) => out(`${a.backup}  ${a.files[ctx.tool].length} file(s)  {dim:2026-10-19}`, 50)) };
    }
    const a = inst.find((x) => x.backup === name);
    if (!a) return { steps: [out(`{er:✗} no backup "${name}"`, 120)] };
    return {
      steps: [
        out(`{ok:✓} Restored ${a.files[ctx.tool].length} file(s); reverted ${a.ref}`, 260),
        ...a.files[ctx.tool].map((path): Step => ({ kind: 'remove', path })),
      ],
    };
  }

  if (['uninstall', 'remove', 'update', 'doctor', 'init', 'publish', 'login', 'logout', 'whoami', 'browse', 'team', 'provider', 'config'].includes(sub)) {
    return { steps: [out(`{dim:aidevkit ${sub} works in your own terminal. This demo knows search, info, install, list and rollback.}`, 80)] };
  }

  return { steps: [out(`{er:✗} unknown command '${sub}'`, 80), out('{dim:  see aidevkit --help}', 20)] };
}

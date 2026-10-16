import { stringifyFrontmatter, type ArtifactFile, type ManifestInput } from '@aidev/artifact-schema';

export interface Seed {
  owner: string;           // user handle or org slug
  visibility?: 'public' | 'organization' | 'team' | 'private';
  team?: string;
  manifest: ManifestInput;
  body?: string;           // entry file body
  extra?: Record<string, string>;
  readme?: string;
  stats?: { installs: number; stars: number; downloads: number };
}

type Base = Omit<ManifestInput, 'author' | 'version'> & { version?: string };
const m = (author: string, b: Base): ManifestInput => ({ version: '1.0.0', license: 'MIT', ...b, author } as ManifestInput);

const steps = (title: string, items: string[]) => `# ${title}\n\n${items.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;

const TITLES: Record<string, string> = {
  github: 'GitHub', jira: 'Jira', postgresql: 'PostgreSQL', sentry: 'Sentry', aws: 'AWS', 'pr-review': 'PR Review', 'rtl-migration': 'RTL Migration',
  'react-19-migration': 'React 19 Migration', 'mui7-migration': 'MUI 7 Migration', 'api-testing': 'API Testing', 'postgresql-optimizer': 'PostgreSQL Optimizer',
  'typescript-strict-conventions': 'TypeScript Strict Conventions', 'aws-internal': 'AWS (Acme internal)', 'rtl-conventions': 'RTL Conventions',
};

export const filesFor = (s: Seed): ArtifactFile[] => {
  const mf = { ...s.manifest, ...(TITLES[s.manifest.name] && !s.manifest.title ? { title: TITLES[s.manifest.name] } : {}) } as ManifestInput;
  const entry: Record<string, string> = { agent: 'agent.md', skill: 'SKILL.md', prompt: 'prompt.md', instruction: 'instruction.md', workflow: 'workflow.md' };
  const files: ArtifactFile[] = [{ path: 'manifest.json', content: JSON.stringify(mf, null, 2) + '\n' }];
  const e = entry[mf.type];
  if (e) {
    const body = s.body ?? `# ${mf.name}\n\n${mf.description}\n`;
    files.push({ path: e, content: mf.type === 'skill' ? stringifyFrontmatter({ name: mf.name, description: mf.description }, body) : body });
  }
  files.push({ path: 'README.md', content: s.readme ?? `# ${mf.name}\n\n${mf.description}\n\n## Install\n\n\`\`\`bash\naidev install ${s.owner}/${mf.name}\n\`\`\`\n` });
  for (const [p, c] of Object.entries(s.extra ?? {})) files.push({ path: p, content: c });
  return files;
};

const A = 'Aidev Official';

export const COMMUNITY: Seed[] = [
  /* ------------------------------ skills ------------------------------ */
  { owner: 'aidev', stats: { installs: 5210, stars: 412, downloads: 7020 },
    manifest: m(A, { name: 'react-19-migration', type: 'skill', version: '1.3.0', description: 'Step-by-step playbook for upgrading React 17/18 apps to React 19: removed APIs, codemods and verification.',
      tags: ['react', 'migration', 'react-19', 'upgrade', 'codemod'], categories: ['migration'], languages: ['typescript', 'javascript'], frameworks: ['react'], permissions: ['read-files', 'write-files', 'run-tests', 'run-commands'] }),
    body: steps('React 19 migration', ['Read `package.json` and lockfile; list react, react-dom, @types/react versions.', 'Run `npx types-react-codemod@latest preset-19 ./src` and `npx react-codemod@latest` for removed APIs.', 'Replace `ReactDOM.render` with `createRoot`; remove `propTypes`/`defaultProps` on function components.', 'Replace string refs and legacy context; convert `forwardRef` to ref-as-prop where safe.', 'Run the type checker, then the test suite; fix failures one category at a time.', 'Summarise breaking changes handled and anything needing manual review.']),
    extra: { 'references/removed-apis.md': '# Removed in React 19\n\n- `ReactDOM.render`, `hydrate`, `unmountComponentAtNode`\n- `propTypes` and `defaultProps` for function components\n- String refs, legacy Context, `findDOMNode`\n', 'scripts/list-react-versions.sh': '#!/usr/bin/env sh\nnpm ls react react-dom @types/react --depth=0\n' } },
  { owner: 'aidev', stats: { installs: 3890, stars: 301, downloads: 5100 },
    manifest: m(A, { name: 'rtl-migration', type: 'skill', description: 'Migrate Enzyme tests to React Testing Library with user-centric queries and async patterns.',
      tags: ['react', 'testing', 'rtl', 'enzyme', 'migration'], categories: ['testing', 'migration'], languages: ['typescript', 'javascript'], frameworks: ['react', 'jest'], permissions: ['read-files', 'write-files', 'run-tests'] }),
    body: steps('Enzyme → React Testing Library', ['Find specs importing `enzyme`; migrate one file at a time.', 'Replace `shallow/mount` with `render`; query by role, label or text — not by component or class.', 'Replace `simulate` with `userEvent`; await async UI with `findBy*`/`waitFor`.', 'Delete snapshot tests that only assert implementation details.', 'Run the file after each conversion and keep behaviour assertions identical.']) },
  { owner: 'aidev', stats: { installs: 2210, stars: 188, downloads: 3000 },
    manifest: m(A, { name: 'mui7-migration', type: 'skill', description: 'Upgrade Material UI v5/v6 to v7: import paths, Grid v2, theme changes and codemods.',
      tags: ['mui', 'material-ui', 'react', 'migration', 'react-migration'], categories: ['migration'], languages: ['typescript'], frameworks: ['react', 'mui'], permissions: ['read-files', 'write-files', 'run-commands'] }),
    body: steps('MUI v7 migration', ['Bump `@mui/material` and peers together.', 'Run `npx @mui/codemod@latest v7.0.0/preset-safe ./src`.', 'Migrate `Grid` → `Grid` v2 (`size` prop); remove deprecated `components`/`componentsProps`.', 'Fix import paths that relied on deep imports.', 'Run build and visual checks.']) },
  { owner: 'aidev', stats: { installs: 1760, stars: 143, downloads: 2400 },
    manifest: m(A, { name: 'api-testing', type: 'skill', description: 'Design and write contract-focused HTTP API tests: status codes, schemas, auth and error paths.',
      tags: ['api', 'testing', 'http', 'contract'], categories: ['testing'], languages: ['typescript', 'java', 'python'], frameworks: ['supertest', 'rest-assured'], permissions: ['read-files', 'write-files', 'run-tests'] }),
    body: steps('API testing', ['Enumerate endpoints from the router or OpenAPI spec.', 'For each: happy path, validation failure, auth failure, not-found.', 'Assert response schema, not just status.', 'Keep tests hermetic; seed data per test.']) },
  { owner: 'aidev', stats: { installs: 2650, stars: 220, downloads: 3300 },
    manifest: m(A, { name: 'docker-debugging', type: 'skill', description: 'Diagnose container build failures, crash loops, networking and volume problems.',
      tags: ['docker', 'containers', 'debugging', 'devops'], categories: ['devops'], languages: [], frameworks: ['docker'], permissions: ['read-files', 'run-commands'] }),
    body: steps('Docker debugging', ['`docker ps -a` and `docker logs --tail 200 <c>` first.', 'Check exit code: 137 = OOM kill, 1 = app error.', 'For build failures, rebuild with `--progress=plain --no-cache` and read the failing layer.', 'Inspect networks with `docker network inspect`; verify service names, not localhost.']) },
  { owner: 'aidev', stats: { installs: 3120, stars: 260, downloads: 4200 },
    manifest: m(A, { name: 'kubernetes-troubleshooting', type: 'skill', description: 'Triage pods stuck in Pending, CrashLoopBackOff, ImagePullBackOff and failing probes.',
      tags: ['kubernetes', 'k8s', 'debugging', 'devops'], categories: ['devops'], languages: [], frameworks: ['kubernetes'], permissions: ['read-files', 'run-commands'] }),
    body: steps('Kubernetes troubleshooting', ['`kubectl get pods -A | grep -v Running`.', '`kubectl describe pod` — read Events bottom-up.', 'Pending → resources/taints; ImagePull → registry creds; CrashLoop → `logs --previous`.', 'Never `kubectl delete` or `apply` without asking the user.']) },

  /* ------------------------------ mcp servers ------------------------------ */
  { owner: 'aidev', stats: { installs: 9840, stars: 905, downloads: 12000 },
    manifest: m(A, { name: 'github', type: 'mcp', version: '1.2.0', description: 'Read repositories, issues and pull requests, and create comments, through GitHub.',
      tags: ['github', 'git', 'pull-requests', 'issues'], categories: ['source-control'], permissions: ['network', 'env-vars', 'git'],
      mcp: { transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: { description: 'GitHub PAT with repo scope', required: true, secret: true } } } }) },
  { owner: 'aidev', stats: { installs: 3300, stars: 240, downloads: 4400 },
    manifest: m(A, { name: 'jira', type: 'mcp', description: 'Search and update Jira issues, sprints and comments.',
      tags: ['jira', 'atlassian', 'tickets'], categories: ['project-management'], permissions: ['network', 'env-vars'],
      mcp: { transport: 'stdio', command: 'uvx', args: ['mcp-atlassian'], env: { JIRA_URL: { description: 'https://your.atlassian.net', secret: false }, JIRA_USERNAME: { description: 'Account email', secret: false }, JIRA_API_TOKEN: { description: 'Atlassian API token' } } } }) },
  { owner: 'aidev', stats: { installs: 4100, stars: 330, downloads: 5400 },
    manifest: m(A, { name: 'postgresql', type: 'mcp', description: 'Inspect schemas, run read-only queries and analyse query plans on PostgreSQL.',
      tags: ['postgres', 'postgresql', 'database', 'sql'], categories: ['database'], permissions: ['network', 'env-vars'],
      mcp: { transport: 'stdio', command: 'uvx', args: ['postgres-mcp', '--access-mode=restricted'], env: { DATABASE_URI: { description: 'postgresql://user:pass@host:5432/db' } } } }) },
  { owner: 'aidev', stats: { installs: 2050, stars: 170, downloads: 2600 },
    manifest: m(A, { name: 'sentry', type: 'mcp', description: 'Query Sentry issues, events and releases over Sentry’s hosted MCP server.',
      tags: ['sentry', 'errors', 'observability', 'monitoring'], categories: ['observability'], permissions: ['network'],
      mcp: { transport: 'http', url: 'https://mcp.sentry.dev/mcp' } }) },
  { owner: 'aidev', stats: { installs: 2780, stars: 205, downloads: 3500 },
    manifest: m(A, { name: 'aws', type: 'mcp', description: 'Call AWS APIs through the AWS API MCP server using your local credentials.',
      tags: ['aws', 'cloud', 'infrastructure'], categories: ['cloud'], permissions: ['network', 'env-vars', 'run-commands'],
      mcp: { transport: 'stdio', command: 'uvx', args: ['awslabs.aws-api-mcp-server@latest'], env: { AWS_REGION: { description: 'e.g. us-east-1', secret: false } } } }) },

  /* ------------------------------ agents ------------------------------ */
  { owner: 'aidev', stats: { installs: 6420, stars: 530, downloads: 8100 },
    manifest: m(A, { name: 'react-migration-agent', type: 'agent', version: '1.4.2', title: 'React Migration Agent',
      description: 'Migrates React 17/18 applications to React 19 with dependency analysis, codemods and test generation.',
      tags: ['react', 'migration', 'react-19', 'codemod', 'react-migration'], categories: ['migration'], languages: ['typescript', 'javascript'], frameworks: ['react'],
      permissions: ['read-files', 'write-files', 'run-tests', 'run-commands', 'git'], agent: { tools: ['read', 'edit', 'search', 'execute'] },
      dependencies: { skills: ['react-19-migration', 'rtl-migration'], mcps: ['github'] } }),
    body: 'You are a React migration specialist.\n\n## Process\n1. Audit dependencies and list blockers for React 19.\n2. Use the `react-19-migration` skill for the upgrade steps.\n3. Convert legacy tests using the `rtl-migration` skill.\n4. Commit in small, reviewable steps; open a PR with the GitHub MCP when asked.\n\n## Rules\n- Never change public component APIs without calling it out.\n- Run the test suite after every batch of changes.\n' },
  { owner: 'aidev', stats: { installs: 3200, stars: 260, downloads: 4100 },
    manifest: m(A, { name: 'spring-boot-debugger', type: 'agent', version: '2.0.1', description: 'Debugs Spring Boot startup failures, bean wiring errors and slow endpoints from logs and stack traces.',
      tags: ['spring', 'spring-boot', 'java', 'debugging'], categories: ['debugging'], languages: ['java', 'kotlin'], frameworks: ['spring-boot'],
      permissions: ['read-files', 'run-tests', 'run-commands'], agent: { tools: ['read', 'search', 'execute'] }, dependencies: { skills: ['docker-debugging'] } }),
    body: 'You debug Spring Boot applications.\n\n1. Read the full stack trace; find the root `Caused by:`.\n2. Check bean definitions, profiles and `application.yml` for the failing component.\n3. Reproduce with the smallest `mvn -q test -Dtest=...` run.\n4. Propose a fix and explain why it addresses the root cause.\n' },
  { owner: 'aidev', stats: { installs: 4800, stars: 410, downloads: 6000 },
    manifest: m(A, { name: 'security-review-agent', type: 'agent', version: '1.1.0', description: 'Reviews diffs for injection, authz gaps, secrets and unsafe dependencies, with severity-ranked findings.',
      tags: ['security', 'review', 'owasp', 'appsec'], categories: ['security'], languages: [], frameworks: [],
      permissions: ['read-files', 'git'], agent: { tools: ['read', 'search'] }, dependencies: { mcps: ['github', 'sentry'] } }),
    body: 'You are an application-security reviewer. You never modify files.\n\nFor each change, check: input validation, authn/authz, secret handling, SQL/command injection, SSRF, dependency risk.\nReport findings as: severity, location, exploit scenario, fix. Say explicitly when you found nothing.\n' },
  { owner: 'aidev', stats: { installs: 5300, stars: 440, downloads: 6900 },
    manifest: m(A, { name: 'test-generation-agent', type: 'agent', version: '1.2.0', description: 'Generates focused unit and integration tests that match your existing test style and conventions.',
      tags: ['testing', 'unit-tests', 'coverage', 'jest', 'vitest'], categories: ['testing'], languages: ['typescript', 'javascript', 'python'], frameworks: ['jest', 'vitest', 'pytest'],
      permissions: ['read-files', 'write-files', 'run-tests'], agent: { tools: ['read', 'edit', 'search', 'execute'] }, dependencies: { skills: ['api-testing'] } }),
    body: 'You write tests.\n\n1. Read two existing test files first and copy their style.\n2. Cover behaviour, edge cases and failure paths — not implementation details.\n3. Run the tests; a test that cannot fail is not done.\n4. Never weaken or delete existing assertions.\n' },
  { owner: 'aidev', stats: { installs: 2900, stars: 235, downloads: 3700 },
    manifest: m(A, { name: 'postgresql-optimizer', type: 'agent', version: '1.0.3', description: 'Finds slow queries, reads EXPLAIN plans and proposes indexes and rewrites for PostgreSQL.',
      tags: ['postgres', 'postgresql', 'performance', 'sql', 'indexes'], categories: ['database'], languages: ['sql'], frameworks: [],
      permissions: ['read-files', 'network'], agent: { tools: ['read', 'search'] }, dependencies: { mcps: ['postgresql'] } }),
    body: 'You optimise PostgreSQL.\n\n1. Identify the slow query (pg_stat_statements if available).\n2. Run `EXPLAIN (ANALYZE, BUFFERS)` — read-only.\n3. Look for seq scans on large tables, bad estimates, missing indexes.\n4. Propose changes as SQL; never run DDL yourself.\n' },

  /* ------------------------------ prompts ------------------------------ */
  { owner: 'aidev', stats: { installs: 7100, stars: 620, downloads: 9000 },
    manifest: m(A, { name: 'pr-review', type: 'prompt', description: 'Review the current pull request for correctness, tests, naming and risk.', tags: ['review', 'pull-request', 'code-review'], categories: ['review'], permissions: ['read-files', 'git'] }),
    body: 'Review the changes on the current branch against the base branch.\n\nReport:\n1. Bugs and edge cases (with file:line).\n2. Missing or weak tests.\n3. Risky changes (migrations, auth, concurrency).\n4. Optional style notes — keep these short.\n' },
  { owner: 'aidev', stats: { installs: 1900, stars: 150, downloads: 2400 },
    manifest: m(A, { name: 'incident-analysis', type: 'prompt', description: 'Build a timeline, root cause and follow-ups from logs and alerts after an incident.', tags: ['incident', 'postmortem', 'sre'], categories: ['operations'], permissions: ['read-files'] }),
    body: 'Given the logs and alerts I provide, produce:\n\n- Timeline (UTC)\n- Impact\n- Root cause and contributing factors\n- What went well / poorly\n- Follow-up actions with owners\n\nMark anything you are inferring rather than observing.\n' },
  { owner: 'aidev', stats: { installs: 2300, stars: 190, downloads: 2900 },
    manifest: m(A, { name: 'architecture-review', type: 'prompt', description: 'Challenge a design doc: assumptions, failure modes, scaling limits and simpler alternatives.', tags: ['architecture', 'design-review', 'adr'], categories: ['review'], permissions: ['read-files'] }),
    body: 'Review the attached design.\n\n1. State the problem in one sentence.\n2. List assumptions that, if false, break the design.\n3. Failure modes and blast radius.\n4. A simpler alternative, and what it costs.\n' },
  { owner: 'aidev', stats: { installs: 3400, stars: 280, downloads: 4300 },
    manifest: m(A, { name: 'bug-investigation', type: 'prompt', description: 'Systematically reproduce, isolate and explain a bug before proposing a fix.', tags: ['debugging', 'bug', 'investigation'], categories: ['debugging'], permissions: ['read-files', 'run-tests'] }),
    body: 'Investigate this bug.\n\n1. Restate expected vs actual behaviour.\n2. Find or write a failing reproduction.\n3. Bisect to the smallest cause.\n4. Explain the root cause, then propose the minimal fix with a regression test.\n' },

  /* ------------------------------ instruction ------------------------------ */
  { owner: 'aidev', stats: { installs: 1500, stars: 120, downloads: 1900 },
    manifest: m(A, { name: 'typescript-strict-conventions', type: 'instruction', description: 'House rules for strict TypeScript: no any, exhaustive unions, explicit return types at boundaries.', tags: ['typescript', 'conventions', 'style'], categories: ['conventions'], languages: ['typescript'], permissions: [] }),
    body: '- Prefer `unknown` over `any`; narrow before use.\n- Model state with discriminated unions and exhaustive `switch`.\n- Explicit return types on exported functions.\n- No non-null assertions without a comment explaining why.\n' },

  /* ------------------------------ plugins ------------------------------ */
  { owner: 'aidev', stats: { installs: 3600, stars: 310, downloads: 4600 },
    manifest: m(A, { name: 'frontend-toolkit', type: 'plugin', version: '1.1.0', description: 'React migration agent, testing skills and the GitHub MCP in one install.', tags: ['react', 'frontend', 'toolkit', 'bundle'], categories: ['bundle'], languages: ['typescript'], frameworks: ['react'],
      permissions: ['read-files', 'write-files'], dependencies: { agents: ['react-migration-agent'], skills: ['rtl-migration', 'mui7-migration'], mcps: ['github'], prompts: ['pr-review'] } }) },
  { owner: 'aidev', stats: { installs: 2400, stars: 200, downloads: 3000 },
    manifest: m(A, { name: 'backend-toolkit', type: 'plugin', version: '1.0.0', description: 'Spring Boot debugger, PostgreSQL optimizer, API testing and the PostgreSQL MCP.', tags: ['backend', 'java', 'postgres', 'toolkit', 'bundle'], categories: ['bundle'], languages: ['java'], frameworks: ['spring-boot'],
      permissions: ['read-files'], dependencies: { agents: ['spring-boot-debugger', 'postgresql-optimizer'], skills: ['api-testing'], mcps: ['postgresql'] } }) },
  { owner: 'aidev', stats: { installs: 2100, stars: 180, downloads: 2700 },
    manifest: m(A, { name: 'devops-toolkit', type: 'plugin', version: '1.0.0', description: 'Kubernetes and Docker troubleshooting skills with the AWS and Sentry MCPs.', tags: ['devops', 'kubernetes', 'docker', 'toolkit', 'bundle'], categories: ['bundle'],
      permissions: ['read-files'], dependencies: { skills: ['kubernetes-troubleshooting', 'docker-debugging'], mcps: ['aws', 'sentry'] } }) },

  /* ------------------------------ community ------------------------------ */
  { owner: 'mlopez', stats: { installs: 340, stars: 31, downloads: 420 },
    manifest: m('Maria Lopez', { name: 'quick-deploy-agent', type: 'agent', version: '0.3.0', description: 'Builds and deploys a service to a VM over SSH with one command (uses sudo).', tags: ['deploy', 'ssh', 'devops'], categories: ['devops'], permissions: ['run-commands', 'network'], agent: { tools: ['read', 'execute'] } }),
    body: 'Deploy the service:\n\n1. Run the build.\n2. `ssh deploy@host "sudo systemctl restart app"`.\n3. Verify the health endpoint.\n' },
];

/** Private Acme company artifacts. */
export const ACME: Seed[] = [
  { owner: 'acme', visibility: 'team', team: 'platform', stats: { installs: 41, stars: 6, downloads: 60 },
    manifest: m('Acme Platform', { name: 'kubernetes-agent', type: 'agent', version: '2.1.0', description: 'Acme platform agent for our EKS clusters, namespaces and deployment conventions.', tags: ['kubernetes', 'eks', 'acme'], categories: ['devops'], permissions: ['read-files', 'run-commands'], agent: { tools: ['read', 'search', 'execute'] }, dependencies: { skills: ['kubernetes-troubleshooting'] } }),
    body: 'You operate Acme’s EKS clusters. Read-only by default: use `kubectl get/describe/logs`. Ask before any apply/delete. Namespaces follow `<team>-<env>`.\n' },
  { owner: 'acme', visibility: 'team', team: 'platform', stats: { installs: 33, stars: 4, downloads: 51 },
    manifest: m('Acme Platform', { name: 'aws-internal', type: 'mcp', version: '1.0.0', description: 'AWS MCP preconfigured for Acme’s SSO profile and read-only role.', tags: ['aws', 'acme', 'internal'], categories: ['cloud'], permissions: ['network', 'env-vars'], mcp: { transport: 'stdio', command: 'uvx', args: ['awslabs.aws-api-mcp-server@latest'], env: { AWS_PROFILE: { description: 'acme-readonly', secret: false } } } }) },
  { owner: 'acme', visibility: 'organization', team: 'frontend', stats: { installs: 88, stars: 12, downloads: 120 },
    manifest: m('Acme Frontend', { name: 'react-migration-agent', type: 'agent', version: '3.0.0', description: 'Acme’s React migration agent: wraps the public one with our design-system rules.', tags: ['react', 'migration', 'acme', 'design-system'], categories: ['migration'], frameworks: ['react'], permissions: ['read-files', 'write-files', 'run-tests'], agent: { tools: ['read', 'edit', 'search', 'execute'] }, dependencies: { skills: ['react-19-migration', 'rtl-conventions'] } }),
    body: 'Follow the public migration process, plus:\n- Use `@acme/ui` components, never raw MUI imports.\n- Every migrated component needs an RTL test and a Storybook story.\n' },
  { owner: 'acme', visibility: 'organization', team: 'frontend', stats: { installs: 70, stars: 9, downloads: 90 },
    manifest: m('Acme Frontend', { name: 'rtl-conventions', type: 'skill', version: '1.2.0', description: 'Acme conventions for React Testing Library: custom render, MSW handlers and test ids.', tags: ['rtl', 'testing', 'acme'], categories: ['testing'], frameworks: ['react'], permissions: ['read-files', 'write-files'] }),
    body: steps('Acme RTL conventions', ['Import `render` from `@acme/test-utils`, not `@testing-library/react`.', 'Mock the network with MSW handlers from `test/handlers`.', 'Query by role first; `data-testid` only for non-semantic widgets.']) },
  { owner: 'acme', visibility: 'team', team: 'security', stats: { installs: 19, stars: 3, downloads: 28 },
    manifest: m('Acme Security', { name: 'security-review-agent', type: 'agent', version: '1.0.0', description: 'Acme security review agent aligned to our internal threat model and SDLC checklist.', tags: ['security', 'review', 'acme'], categories: ['security'], permissions: ['read-files', 'git'], agent: { tools: ['read', 'search'] }, dependencies: { mcps: ['github'] } }),
    body: 'Review changes against the Acme SDLC security checklist (authn/z, PII handling, secrets, logging). Output a PASS/FAIL table and block on any FAIL.\n' },
];

import type { Metadata } from 'next';
import { BlocksMark } from '@/components/landing/BlocksMark';
import { CopyInstall, ScrollFlag, ThemeSwitch } from '@/components/landing/ClientBits';
import { InstallDemo } from '@/components/landing/InstallDemo';
import { GITHUB_URL, SITE_URL } from '@/lib/site';

const title = 'aidevkit: install AI agents, skills and MCP servers';
const description = 'One command installs AI agents, skills and MCP servers into GitHub Copilot, Claude Code and Codex, with permissions shown first and one-step undo.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', siteName: 'aidevkit', title, description, locale: 'en_US' },
  twitter: { card: 'summary_large_image', title, description },
};

const TOOL_PATHS = [
  {
    name: 'GitHub Copilot', meta: 'VS Code · GitHub', tile: 't-blue',
    icon: <path d="M12 3a9 9 0 0 0-2.8 17.6c.4 0 .6-.2.6-.5v-1.7c-2.5.5-3-1.1-3-1.1-.4-1-1-1.3-1-1.3-.8-.6.1-.6.1-.6.9.1 1.4 1 1.4 1 .8 1.4 2.1 1 2.6.8 0-.6.3-1 .6-1.3-2-.2-4.1-1-4.1-4.4 0-1 .4-1.8 1-2.4-.1-.2-.4-1.2.1-2.4 0 0 .8-.3 2.5.9a8.6 8.6 0 0 1 4.5 0c1.7-1.2 2.5-.9 2.5-.9.5 1.2.2 2.2.1 2.4.6.6 1 1.4 1 2.4 0 3.4-2.1 4.2-4.1 4.4.3.3.6.9.6 1.7v2.6c0 .3.2.6.7.5A9 9 0 0 0 12 3z" />,
    rows: [['agent', '.github/agents/<name>.agent.md'], ['skill', '.github/skills/<name>/SKILL.md'], ['prompt', '.github/prompts/<name>.prompt.md'], ['instruction', '.github/instructions/<name>.instructions.md'], ['MCP server', '.vscode/mcp.json']],
  },
  {
    name: 'Claude Code', meta: 'terminal · IDE · desktop', tile: 't-orange',
    icon: <path d="M5 7l5 5-5 5M12 17h7" />,
    rows: [['agent', '.claude/agents/<name>.md'], ['skill', '.claude/skills/<name>/SKILL.md'], ['prompt', 'a skill you invoke by name'], ['instruction', 'a marked block in CLAUDE.md'], ['MCP server', '.mcp.json']],
  },
  {
    name: 'Codex', meta: 'CLI · IDE extension', tile: 't-purple',
    icon: <><path d="M8 8l-4 4 4 4M16 8l4 4-4 4" /><path d="M13.5 5l-3 14" /></>,
    rows: [['agent', 'a skill (Codex has no agent files)'], ['skill', '.agents/skills/<name>/SKILL.md'], ['prompt', 'a skill'], ['instruction', 'a marked block in AGENTS.md'], ['MCP server', '.codex/config.toml']],
  },
] as const;

const HUB = [
  { tone: 'h-blue', n: '28,000+', label: 'MCP servers', text: 'GitHub, Stripe, Atlassian, databases, clouds and more.', type: 'mcp' },
  { tone: 'h-peach', n: '850+', label: 'skills', text: 'SKILL.md packages that teach an agent a repeatable task.', type: 'skill' },
  { tone: 'h-pink', n: '550+', label: 'agents', text: 'Specialised assistants with their own instructions and tools.', type: 'agent' },
  { tone: 'h-sky', n: '440+', label: 'instructions', text: 'Project rules your AI tool follows on every request.', type: 'instruction' },
  { tone: 'h-orange', n: '180+', label: 'plugins', text: 'Agents, skills and prompts that install together.', type: 'plugin' },
  { tone: 'h-mint', n: '160+', label: 'prompts', text: 'Slash commands you run by name, like /python-scaffold.', type: 'prompt' },
  { tone: 'h-plum', n: '70+', label: 'workflows', text: 'Multi-step jobs an agent runs from start to finish.', type: 'workflow' },
  { tone: 'h-stone', n: 'yours', label: 'next', text: 'Publish a folder and it gets a page, a version and an install command.', type: null },
] as const;

const FAQ = [
  { q: 'What does aidevkit install?', a: 'Agents, skills, MCP servers, prompts, instructions, workflows and plugins: the reusable pieces that make an AI coding tool good at your project. Each one is a versioned listing on the hub.' },
  { q: 'Which AI coding tools does it support?', a: 'GitHub Copilot, Claude Code and Codex. aidevkit detects the tool your project uses, or you pick one with --provider. The same command works for all three.' },
  { q: 'Where do the files go?', a: 'Into your project, in each tool’s own folder: .github/ and .vscode/ for Copilot, .claude/ and .mcp.json for Claude Code, .agents/ and .codex/ for Codex. They are plain files you can read, diff and commit.' },
  { q: 'How do I add an MCP server to Claude Code?', a: 'Run aidevkit install <name>. aidevkit adds the server to .mcp.json in your project, and Claude Code asks you to approve it the first time it starts.' },
  { q: 'Can I undo an install?', a: 'Yes. Every install creates a rollback point, and aidevkit rollback <id> puts the files back the way they were.' },
  { q: 'Can my coding agent use aidevkit on its own?', a: 'Yes. Commands support --json and --yes and return documented exit codes, so an agent can search, inspect and install without anyone at the keyboard.' },
  { q: 'Where do the listings come from?', a: 'From the official MCP Registry, github/awesome-copilot and ten other openly licensed collections, like anthropics/skills, openai/skills and wshobson/agents. Each is imported with a link to its source and marked “not reviewed”, and anything that fails the security scan is left out.' },
  { q: 'Is it free?', a: 'Yes. The CLI and the hub are free to use, and the code is on GitHub.' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'aidevkit',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any (Node.js 20 or newer)',
      softwareVersion: '0.1.0',
      url: SITE_URL,
      description: 'A package manager that installs AI agents, skills, MCP servers, prompts and instructions into GitHub Copilot, Claude Code and Codex.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      sameAs: [GITHUB_URL],
    },
    {
      '@type': 'WebSite',
      name: 'aidevkit',
      url: SITE_URL,
      potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

const Icon = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden>{d}</svg>;

export default function Landing() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ScrollFlag />
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="site-header wrap">
        <a className="brand" href="/" aria-label="aidevkit home"><BlocksMark className="brand-mark" />aidevkit.</a>
        <nav className="nav" aria-label="Main">
          <a href="#demo">how it works</a>
          <a href="/search">browse</a>
          <a href="/docs">docs</a>
          <a href={GITHUB_URL} rel="noopener">github ↗</a>
        </nav>
        <div className="actions">
          <a className="btn btn-sm header-cta" href="/search">Browse the hub <span className="arrow">→</span></a>
          <ThemeSwitch />
        </div>
      </header>

      <main id="main">
        <div className="wrap">
          <section className="hero" aria-labelledby="hero-title">
            <div>
              <h1 id="hero-title" className="display">AI agents, skills and MCP servers,<br /><span className="accent">one command away.</span></h1>
              <p className="lede">
                aidevkit installs reusable building blocks into GitHub Copilot, Claude Code and Codex. It puts each one where your tool looks for it,
                shows you what it can touch first, and undoes it in one step.
              </p>
              <div className="chips" aria-label="Works with">
                <span className="chip chip-sky">GitHub Copilot</span>
                <span className="chip chip-peach">Claude Code</span>
                <span className="chip chip-night">Codex</span>
                <span className="chip chip-rose">your coding agent</span>
                <a className="more" href="/search">+ 30,000 listings ↗</a>
              </div>
            </div>
            <div className="cta-pair">
              <div className="cta"><CopyInstall /><p className="note">Node 20 or newer · free</p></div>
              <div className="cta"><a className="btn btn-quiet" href="/search">Browse the hub <span className="arrow">→</span></a><p className="note">Real listings · no account needed</p></div>
            </div>
          </section>

          <section id="demo" aria-label="See aidevkit install something">
            <InstallDemo />
          </section>
        </div>

        <hr className="rule wrap" />

        <section className="section" aria-labelledby="folders-title">
          <div className="wrap">
            <div className="section-head">
              <h2 id="folders-title" className="title">every tool wants<br /><span className="accent">its own folder.</span></h2>
              <p className="lede">Copilot, Claude Code and Codex read agents, skills and MCP config from different places, in different formats. aidevkit knows all of them, so you type the same thing everywhere.</p>
            </div>
            <div className="one-cmd">
              <code className="terminal"><span className="pr">~/your-project $</span> aidevkit install <span className="ok">&lt;name&gt;</span></code>
              <span className="note">one command, three very different results:</span>
            </div>
            <div className="tools">
              {TOOL_PATHS.map((tool) => (
                <article key={tool.name} className="tool-card">
                  <span className={`icon-tile ${tool.tile}`}><Icon d={tool.icon} /></span>
                  <div>
                    <h3>{tool.name}</h3>
                    <p className="meta">{tool.meta}</p>
                  </div>
                  <ul className="paths">
                    {tool.rows.map(([label, path]) => (
                      <li key={label}><span>{label}</span>{path.startsWith('.') ? <code>{path}</code> : <span className="soft">{path}</span>}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="features-title">
          <div className="wrap">
            <div className="section-head">
              <h2 id="features-title" className="title">less copy-paste.<br /><span className="accent">fewer surprises.</span></h2>
              <p className="lede">The boring parts of sharing AI setups, handled for you.</p>
            </div>
            <div className="grid-3">
              <article className="card">
                <div className="card-art tone-orange" aria-hidden>
                  <div className="art-stack">
                    <div className="mini" style={{ ['--tilt' as string]: '-2deg' }}>
                      <b>Requested permissions</b>
                      <div className="row"><span>Filesystem write</span><small>your project</small></div>
                      <div className="row"><span>Local commands</span><span className="status is-warn">shell</span></div>
                      <div className="row"><span>Network access</span><small>outbound</small></div>
                    </div>
                    <span className="sticker" style={{ ['--tilt' as string]: '4deg' }}>install? (y/N)</span>
                  </div>
                </div>
                <div className="card-body"><h3 className="card-title">it asks before it writes.</h3><p>Every install lists what it needs, like file access, shell commands or network calls, and waits for your yes.</p></div>
              </article>
              <article className="card">
                <div className="card-art" aria-hidden>
                  <div className="art-stack">
                    <div className="terminal" style={{ rotate: '1.5deg' }}>
                      <div><span className="pr">$</span> aidevkit rollback 2026-10-19T…</div>
                      <div><span className="ok">✓</span> Restored 1 file(s)</div>
                    </div>
                    <span className="sticker s-pink" style={{ ['--tilt' as string]: '-4deg' }}>rollback point saved</span>
                  </div>
                </div>
                <div className="card-body"><h3 className="card-title">every install can be undone.</h3><p>aidevkit saves a rollback point before it touches a file. One command puts them back.</p></div>
              </article>
              <article className="card">
                <div className="card-art tone-green" aria-hidden>
                  <div className="mini json-mini" style={{ ['--tilt' as string]: '2deg', width: '80%' }}>
                    <div><span className="k">&quot;mcp-registry/github-mcp-server&quot;</span>: {'{'}</div>
                    <div>  <span className="k">&quot;version&quot;</span>: <span className="s">&quot;1.13.0&quot;</span>,</div>
                    <div>  <span className="k">&quot;sha256&quot;</span>: <span className="s">&quot;9961da22a9f2…&quot;</span></div>
                    <div>{'}'}</div>
                  </div>
                </div>
                <div className="card-body"><h3 className="card-title">same setup on every laptop.</h3><p>.aidev-lock.json pins versions and hashes. A teammate runs aidevkit install and gets exactly what you have.</p></div>
              </article>
            </div>

            <div className="grid-3 tiles" style={{ marginTop: 22 }}>
              <article className="card">
                <div className="card-art" aria-hidden>
                  <div className="mini json-mini" style={{ ['--tilt' as string]: '-1.5deg' }}>
                    <div>{'{'} <span className="k">&quot;ok&quot;</span>: <span className="n">true</span>,</div>
                    <div>  <span className="k">&quot;action&quot;</span>: <span className="s">&quot;install&quot;</span>,</div>
                    <div>  <span className="k">&quot;exitCode&quot;</span>: <span className="n">0</span> {'}'}</div>
                  </div>
                </div>
                <div className="card-body"><h3 className="tile-title">your agent installs things too?</h3><p>Commands speak --json and return documented exit codes, so Claude Code or Codex can search and install on their own.</p></div>
              </article>
              <article className="card">
                <div className="card-art tone-orange" aria-hidden>
                  <div className="mini" style={{ ['--tilt' as string]: '2deg' }}>
                    <div className="row"><b>your-skill</b><small>1.4.2 → 2.0.0</small></div>
                    <div className="row"><span>major update</span><span className="status is-warn">asks first</span></div>
                  </div>
                </div>
                <div className="card-body"><h3 className="tile-title">will an update break it?</h3><p>aidevkit update asks before it applies a major version.</p></div>
              </article>
              <article className="card">
                <div className="card-art tone-pink" aria-hidden>
                  <div className="art-stack" style={{ width: '74%' }}>
                    <div className="mini" style={{ ['--tilt' as string]: '-2deg' }}>
                      <div className="row"><b>curl … | bash</b><span className="status is-warn">flagged</span></div>
                      <div className="row"><b>rm -rf ~/</b><span className="status is-warn">flagged</span></div>
                    </div>
                    <span className="sticker s-white" style={{ ['--tilt' as string]: '3deg' }}>not reviewed</span>
                  </div>
                </div>
                <div className="card-body"><h3 className="tile-title">is this MCP server safe?</h3><p>aidevkit scans every listing for risky patterns like curl | bash, and marks imported ones as not reviewed.</p></div>
              </article>
              <article className="card">
                <div className="card-art tone-green" aria-hidden>
                  <div className="mini" style={{ ['--tilt' as string]: '1.5deg', width: '72%' }}>
                    <b>acme · company hub</b>
                    <div className="row"><span>approved skills</span><small>12</small></div>
                    <div className="row"><span>blocked by policy</span><span className="status is-warn">exit 6</span></div>
                  </div>
                </div>
                <div className="card-body"><h3 className="tile-title">company-only skills?</h3><p>Private hubs for your team, with approved resources and policies that block what you don’t allow.</p></div>
              </article>
              <article className="card">
                <div className="card-art" aria-hidden>
                  <span className="sticker s-blue" style={{ ['--tilt' as string]: '-3deg' }}>$ aidevkit publish ./my-skill</span>
                </div>
                <div className="card-body"><h3 className="tile-title">made something good?</h3><p>aidevkit publish validates a folder and gives it a page, a version and an install command.</p></div>
              </article>
              <article className="card">
                <div className="card-art tone-orange" aria-hidden>
                  <div className="mini block-mini" style={{ ['--tilt' as string]: '-1deg', width: '78%' }}>
                    <div className="c"># acme rules</div>
                    <div className="c">Use pnpm. Never touch /infra.</div>
                    <div className="h">&lt;!-- aidev:begin react-rules --&gt;</div>
                    <div>Prefer server components.</div>
                    <div className="h">&lt;!-- aidev:end react-rules --&gt;</div>
                  </div>
                </div>
                <div className="card-body"><h3 className="tile-title">already have a CLAUDE.md?</h3><p>aidevkit adds its own marked block and leaves the rest of your file alone.</p></div>
              </article>
            </div>
          </div>
        </section>

        <section className="band" aria-labelledby="hub-title">
          <div className="wrap">
            <div className="hub-head">
              <h2 id="hub-title" className="title">30,000+ building blocks.<br /><span className="accent-pink">all of them real.</span></h2>
              <p className="lede">Imported from the official MCP Registry, awesome-copilot and ten other openly licensed collections, each with a link to its source. Install counts start at zero and only count real installs.</p>
            </div>
            <div className="hub-grid">
              {HUB.map((h) => (
                <a key={h.label} className={`hub-tile ${h.tone}`} href={h.type ? `/search?type=${h.type}` : '/publish'}>
                  <span className="numeral">{h.n}</span>
                  <b>{h.label}</b>
                  <p>{h.text}</p>
                  <span className="go">{h.type ? 'browse →' : 'publish →'}</span>
                </a>
              ))}
            </div>
            <div className="hub-foot">
              <a className="btn" href="/search">Browse the hub <span className="arrow">→</span></a>
              <p className="note">Or see <a className="link" href="/explore">what’s featured and new</a></p>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="faq-title">
          <div className="wrap split">
            <h2 id="faq-title" className="title">yes, it’s <span className="accent">just files.</span></h2>
            <div className="faq">
              {FAQ.map((f, i) => (
                <details key={f.q} open={i === 0}>
                  <summary><h3>{f.q}</h3></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="band-accent closing" aria-labelledby="closing-title">
          <span className="closing-glyph" aria-hidden>$</span>
          <div className="wrap">
            <BlocksMark className="closing-mark" />
            <h2 id="closing-title" className="title-xl">every good setup<br />started with one install.<br /><span className="accent">let’s run yours.</span></h2>
            <div className="cta-pair">
              <div className="cta"><CopyInstall /><p className="note">Node 20 or newer · free</p></div>
              <div className="cta"><a className="btn btn-quiet" href="/search">Browse the hub <span className="arrow">→</span></a><p className="note">Real listings · no account needed</p></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap site-footer">
        <div className="footer-top">
          <div>
            <a className="brand" href="/"><BlocksMark className="brand-mark" />aidevkit.</a>
            <p className="small" style={{ marginTop: 10 }}>the package manager for your AI coding tools.</p>
          </div>
          <div className="actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href="/search">Browse the hub <span className="arrow">→</span></a>
            <a className="btn btn-sm btn-quiet" href="/docs">Read the docs <span className="arrow">→</span></a>
          </div>
        </div>
        <div className="footer-bottom">
          <nav className="footer-links" aria-label="Footer">
            <a className="foot-chip" href="/search"><span className="icon-sq"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></svg></span>browse</a>
            <a className="foot-chip c-orange" href="/explore"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" /></svg></span>featured</a>
            <a className="foot-chip c-pink" href="/docs"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M5 7l5 5-5 5M12 17h7" /></svg></span>cli docs</a>
            <a className="foot-chip c-green" href="/publish"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M12 20V8m-5 5 5-5 5 5M5 4h14" /></svg></span>publish</a>
            <a className="foot-chip c-purple" href={GITHUB_URL} rel="noopener"><span className="icon-sq"><svg viewBox="0 0 24 24"><path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.4 5.6-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.6 2.6 5.6 2.9 5.6 2.9a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.2 9.3c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21" /></svg></span>github ↗</a>
          </nav>
          <div className="footer-utility"><a href="/docs">for coding agents</a><span>© 2026 aidevkit</span></div>
        </div>
      </footer>
    </>
  );
}

# Security model

Artifacts are **untrusted input**. A package can contain malicious scripts, MCP servers that exfiltrate credentials, destructive commands, or prompt injection.

## What is enforced today

| Threat | Control |
|---|---|
| Auto-executed code | `aidevkit` never executes anything from an artifact. Scripts are copied as inert files. |
| Hidden capabilities | Manifest permissions + derived risk profile (filesystem, network, env vars, **local command execution**, external APIs) shown before install, on the web page, and in `--json`. |
| Malicious content | Static scan at publish and again locally at install: pipe-to-shell, destructive `rm`, encoded execution, credential-path access, env exfiltration, `sudo`, `chmod 777`, prompt-injection phrases, hidden/bidi Unicode. High-severity findings block public publishing and require `--allow-risky` to install. |
| Tampering | sha256 over the canonical file set; the CLI re-hashes after download; the lockfile pins hashes and refuses drift. |
| Hostile registry | The CLI re-validates the manifest from the hashed files and rejects paths that escape the install directory. |
| Silent overwrite | Conflicts abort before any write; `--force` backs up first; every install is a rollback point. |
| Mutating releases | Versions are immutable (DB unique key + write-once storage); versions must increase. |
| Company policy | Blocked artifacts (and blocked transitive dependencies) are refused server-side; `external` is labelled. |
| Secrets | MCP env values are never stored in config files; tokens are stored hashed (sha256); passwords with scrypt; the CLI config file is mode 0600. |
| README XSS | Markdown rendered without raw HTML; links `rel="noopener noreferrer nofollow"`. |

## Not yet implemented

Package signing and publisher key verification (hashes only), sandboxed server-side scanning of scripts, rate limiting / abuse controls, email verification and password reset, audit log UI, enterprise allow-lists beyond approve/block, secret scanning of artifacts, SSO. Treat the static scanner as a tripwire, not a guarantee — it is regex-based and evadable.

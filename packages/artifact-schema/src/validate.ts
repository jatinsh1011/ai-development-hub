import { manifestSchema, type Manifest } from './manifest.js';
import { ENTRY_FILE, MANIFEST_FILE } from './entry.js';
import { parseFrontmatter } from './frontmatter.js';
import { scanFiles, type Finding } from './scan.js';
import type { ArtifactFile } from './types.js';

export interface ValidationIssue { level: 'error' | 'warning'; path: string; message: string }
export interface ValidationReport {
  ok: boolean;
  manifest?: Manifest;
  files: ArtifactFile[];
  issues: ValidationIssue[];
  findings: Finding[];
}

const MAX_FILES = 200;
const MAX_BYTES = 2_000_000;

/** Validate a directory's worth of files (as read from disk or uploaded). */
export function validateArtifact(allFiles: ArtifactFile[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  const files = allFiles.map((f) => ({ ...f, path: f.path.replace(/\\/g, '/').replace(/^\.\//, '') }));
  if (files.length > MAX_FILES) err('.', `too many files (${files.length} > ${MAX_FILES})`);
  if (files.reduce((n, f) => n + f.content.length, 0) > MAX_BYTES) err('.', `artifact exceeds ${MAX_BYTES} bytes`);
  for (const f of files) {
    if (f.path.startsWith('/') || f.path.split('/').includes('..')) err(f.path, 'path escapes the artifact root');
  }

  const mf = files.find((f) => f.path === MANIFEST_FILE);
  if (!mf) {
    err(MANIFEST_FILE, `missing ${MANIFEST_FILE} (run \`aidevkit init\`)`);
    return { ok: false, files, issues, findings: [] };
  }
  let raw: unknown;
  try { raw = JSON.parse(mf.content); } catch (e) { err(MANIFEST_FILE, `invalid JSON: ${(e as Error).message}`); return { ok: false, files, issues, findings: [] }; }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(`${MANIFEST_FILE}:${i.path.join('.')}`, i.message);
    return { ok: false, files, issues, findings: [] };
  }
  const manifest = parsed.data;

  const entry = ENTRY_FILE[manifest.type];
  if (entry) {
    const ef = files.find((f) => f.path === entry);
    if (!ef) err(entry, `${manifest.type} artifacts require ${entry}`);
    else if (!ef.content.trim()) err(entry, 'entry file is empty');
    else if (manifest.type === 'skill') {
      const { data } = parseFrontmatter(ef.content);
      if (!data.name || !data.description) err(entry, 'SKILL.md frontmatter needs "name" and "description"');
      else if (data.name !== manifest.name) warn(entry, `SKILL.md name "${String(data.name)}" differs from manifest name "${manifest.name}"; installers will use the manifest name`);
    }
  }
  if (manifest.type === 'mcp' && !manifest.mcp) err(`${MANIFEST_FILE}:mcp`, 'mcp artifacts require an "mcp" block');
  if (manifest.type === 'agent' && !manifest.agent) warn(`${MANIFEST_FILE}:agent`, 'no "agent" block; defaulting to read-only tools');
  if (['plugin', 'bundle'].includes(manifest.type) && !Object.values(manifest.dependencies).some((d) => d.length)) {
    err(`${MANIFEST_FILE}:dependencies`, 'plugins and bundles must list at least one dependency');
  }
  if (!files.some((f) => /^readme\.md$/i.test(f.path))) warn('README.md', 'no README.md; the artifact page will be empty');
  if (!manifest.permissions.length && manifest.type !== 'prompt' && manifest.type !== 'instruction') warn(`${MANIFEST_FILE}:permissions`, 'no permissions declared');

  const findings = scanFiles(files);
  return { ok: !issues.some((i) => i.level === 'error'), manifest, files, issues, findings };
}

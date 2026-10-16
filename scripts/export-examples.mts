/** Writes a handful of seed artifacts to ./examples so people can copy a working layout. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { COMMUNITY, filesFor } from '../apps/api/src/fixtures/catalog.ts';

const PICK: Record<string, string> = {
  'react-migration-agent': 'agents', 'security-review-agent': 'agents',
  'react-19-migration': 'skills', 'rtl-migration': 'skills',
  'pr-review': 'prompts', 'bug-investigation': 'prompts',
  github: 'mcp', sentry: 'mcp', 'frontend-toolkit': 'plugins',
};
const root = path.resolve(import.meta.dirname, '../examples');
for (const s of COMMUNITY) {
  const group = PICK[s.manifest.name];
  if (!group) continue;
  for (const f of filesFor(s)) {
    const p = path.join(root, group, s.manifest.name, f.path);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, f.content);
  }
}
console.log('examples written');

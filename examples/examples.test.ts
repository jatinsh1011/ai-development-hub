import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateArtifact } from '@aidev/artifact-schema';
import { readArtifactDir } from '@aidev/cli-engine';

const root = __dirname;
describe('examples/ are valid, publishable artifacts', async () => {
  for (const group of await fs.readdir(root, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const d of await fs.readdir(path.join(root, group.name), { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      it(`${group.name}/${d.name}`, async () => {
        const r = validateArtifact(await readArtifactDir(path.join(root, group.name, d.name)));
        expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
        expect(r.findings.filter((f) => f.severity === 'high')).toEqual([]);
      });
    }
  }
});

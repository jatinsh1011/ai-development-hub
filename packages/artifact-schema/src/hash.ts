import { createHash } from 'node:crypto';
import type { ArtifactFile } from './types.js';

/** Deterministic content hash of a file set (immutable-version identity). */
export function hashFiles(files: ArtifactFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(`${f.path}\0${f.encoding ?? 'utf8'}\0${f.content.length}\0${f.content}\0`);
  }
  return h.digest('hex');
}

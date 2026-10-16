import { promises as fs } from 'node:fs';
import path from 'node:path';

export const exists = (p: string) => fs.access(p).then(() => true, () => false);

export async function which(bin: string): Promise<string | undefined> {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const e of exts) {
      const p = path.join(dir, bin + e);
      if (await exists(p)) return p;
    }
  }
  return undefined;
}

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** S3-compatible object storage abstraction. Only the local-disk driver ships in the MVP. */
export interface Storage {
  put(key: string, data: string): Promise<void>;
  get(key: string): Promise<string>;
}

export class LocalFsStorage implements Storage {
  constructor(private root: string) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('bad storage key');
    return full;
  }
  async put(key: string, data: string) {
    const p = this.p(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    // Versions are immutable: refuse to overwrite.
    await fs.writeFile(p, data, { flag: 'wx' });
  }
  get(key: string) { return fs.readFile(this.p(key), 'utf8'); }
}

export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  async put(key: string, data: string) { if (this.m.has(key)) throw new Error('exists'); this.m.set(key, data); }
  async get(key: string) { const v = this.m.get(key); if (v === undefined) throw new Error('missing'); return v; }
}

import { connect, PgSearch, type Db, type SearchProvider } from '@aidev/database';
import { LocalFsStorage, MemoryStorage, type Storage } from './storage.js';

export interface Ctx { db: Db; search: SearchProvider; storage: Storage }

/** DATABASE_URL set → Postgres. Otherwise embedded PGlite in ./.data (or memory if AIDEV_MEMORY=1). */
export async function createCtx(): Promise<Ctx> {
  const mem = process.env.AIDEV_MEMORY === '1';
  const db = await connect({ url: process.env.DATABASE_URL, dataDir: mem ? undefined : process.env.AIDEV_DATA_DIR ?? '.data/pglite' });
  const storage = mem ? new MemoryStorage() : new LocalFsStorage(process.env.AIDEV_STORAGE_DIR ?? '.data/storage');
  return { db, search: new PgSearch(db), storage };
}

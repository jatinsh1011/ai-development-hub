import { MIGRATIONS } from './schema.js';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  tx<T>(fn: (q: Db['query']) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Postgres via node-postgres (production / docker-compose). */
export async function connectPg(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url });
  return {
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn((s, p) => c.query(s, p as any[]) as any);
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

/** In-process Postgres (PGlite) for zero-setup local dev and tests. dataDir undefined = memory. */
export async function connectPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) { const fs = await import('node:fs'); const path = await import('node:path'); fs.mkdirSync(path.dirname(path.resolve(dataDir)), { recursive: true }); }
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  return {
    query: (sql, params) => pg.query(sql, params as any[]) as any,
    tx: (fn) => pg.transaction((t) => fn((s, p) => t.query(s, p as any[]) as any)),
    close: () => pg.close(),
  };
}

export async function migrate(db: Db): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ id: string }>('SELECT id FROM schema_migrations')).rows.map((r) => r.id));
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.tx(async (q) => {
      // PGlite's query() runs a single statement; split on statement boundaries we control.
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q(stmt);
      await q('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
    ran.push(m.id);
  }
  return ran;
}

export async function connect(opts: { url?: string; dataDir?: string } = {}): Promise<Db> {
  const db = opts.url ? await connectPg(opts.url) : await connectPglite(opts.dataDir);
  await migrate(db);
  return db;
}

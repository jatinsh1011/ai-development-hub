/**
 * Usage:  npm run import -- [mcp|awesome-copilot|all|github-stars] [--limit N|all] [--per-namespace N (default 3)] [--source-dir <path to awesome-copilot checkout>]
 * Imports real third-party listings. With the embedded database, stop the API first (single-process lock);
 * with DATABASE_URL (Postgres) it can run alongside the API.
 */
import { cloneSource, importAwesome, readSource } from './awesome.js';
import { syncGithubStars } from './github.js';
import { importMcp } from './mcp.js';
import { createCtx } from '../context.js';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const what = args.find((a) => !a.startsWith('--') && ['mcp', 'awesome-copilot', 'all', 'github-stars'].includes(a)) ?? 'all';
const lim = flag('limit');
const limit = lim === 'all' || lim === undefined ? Infinity : Number(lim);
const perNamespace = Number(flag('per-namespace') ?? 3);
const log = (s: string) => console.log(s);

const ctx = await createCtx();
try {
  if (what === 'mcp' || what === 'all') {
    log('MCP Registry…');
    log((await importMcp(ctx, { limit, perNamespace, log })).report('mcp-registry'));
  }
  if (what === 'awesome-copilot' || what === 'all') {
    log('awesome-copilot…');
    const dir = flag('source-dir');
    const src = dir ? await readSource(dir) : await cloneSource(log);
    log((await importAwesome(ctx, { src, limit: Number.isFinite(limit) ? limit : undefined, log })).report('awesome-copilot'));
  }
  if (what === 'github-stars' || (what === 'all' && process.env.GITHUB_TOKEN)) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('Set GITHUB_TOKEN (a GitHub personal access token; no permissions needed) to sync stars.');
    log('GitHub stars…');
    const r = await syncGithubStars(ctx, { token, log });
    log(`github-stars: ${r.found} repositories updated, ${r.missing} not found (deleted, renamed or private)`);
  }
} finally {
  await ctx.db.close();
}

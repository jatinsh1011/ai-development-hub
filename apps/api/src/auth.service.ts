import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Ctx } from './context.js';

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface User { id: string; email: string; handle: string; name: string }
export const CTX = 'CTX';

export const bad = (msg: string, code = 400, extra: object = {}) => new HttpException({ error: msg, ...extra }, code);

@Injectable()
export class AuthService {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  private async hash(pw: string) {
    const salt = randomBytes(16);
    return `${salt.toString('hex')}:${(await scrypt(pw, salt, 64)).toString('hex')}`;
  }
  private async check(pw: string, stored: string) {
    const [s, h] = stored.split(':');
    return timingSafeEqual(await scrypt(pw, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
  }

  async issue(userId: string, name: string, kind: 'session' | 'pat') {
    const token = `aidev_${kind === 'pat' ? 'pat' : 'sess'}_${randomBytes(24).toString('hex')}`;
    await this.ctx.db.query('INSERT INTO api_tokens (user_id, token_hash, name, kind) VALUES ($1,$2,$3,$4)', [userId, sha256(token), name, kind]);
    return token;
  }

  async register(b: { email: string; password: string; name?: string; handle?: string }) {
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('invalid email');
    if (String(b.password ?? '').length < 8) throw bad('password must be at least 8 characters');
    const handle = (b.handle ?? email.split('@')[0]).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 39);
    if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(handle)) throw bad('invalid handle');
    const taken = await this.ctx.db.query('SELECT 1 FROM users WHERE email=$1 OR handle=$2 UNION SELECT 1 FROM organizations WHERE slug=$2', [email, handle]);
    if (taken.rows.length) throw bad('email or handle already taken', 409);
    const r = await this.ctx.db.query<User>('INSERT INTO users (email, handle, name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, email, handle, name', [email, handle, b.name || handle, await this.hash(b.password)]);
    return { user: r.rows[0], token: await this.issue(r.rows[0].id, 'web session', 'session') };
  }

  async login(b: { email: string; password: string }) {
    const r = await this.ctx.db.query<User & { password_hash: string }>('SELECT * FROM users WHERE email=$1', [String(b.email ?? '').toLowerCase()]);
    const u = r.rows[0];
    if (!u || !(await this.check(String(b.password ?? ''), u.password_hash))) throw new UnauthorizedException({ error: 'invalid email or password' });
    return { user: { id: u.id, email: u.email, handle: u.handle, name: u.name }, token: await this.issue(u.id, 'cli login', 'session') };
  }

  /** Resolve the bearer token (session or PAT) to a user. */
  async user(req: { headers: Record<string, any> }, required: true): Promise<User>;
  async user(req: { headers: Record<string, any> }, required?: false): Promise<User | null>;
  async user(req: { headers: Record<string, any> }, required = false): Promise<User | null> {
    const h = String(req.headers.authorization ?? '');
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (token) {
      const r = await this.ctx.db.query<User>(
        `UPDATE api_tokens t SET last_used_at = now() FROM users u WHERE t.token_hash = $1 AND u.id = t.user_id RETURNING u.id, u.email, u.handle, u.name`,
        [sha256(token)],
      );
      if (r.rows[0]) return r.rows[0];
    }
    if (required) throw new UnauthorizedException({ error: 'authentication required', hint: 'run `aidevkit login` or set AIDEV_TOKEN' });
    return null;
  }

  async revoke(token: string) { await this.ctx.db.query('DELETE FROM api_tokens WHERE token_hash=$1', [sha256(token)]); }
  async listTokens(userId: string) {
    return (await this.ctx.db.query('SELECT id, name, kind, created_at AS "createdAt", last_used_at AS "lastUsedAt" FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC', [userId])).rows;
  }
}

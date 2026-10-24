import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Config { registry: string; token?: string; defaultProvider?: string; email?: string }
/** The public registry. For a local API, set AIDEV_REGISTRY=http://localhost:4000 or `aidev config set registry`. */
export const DEFAULT_REGISTRY = 'https://aidevkit.in';

export const configDir = () => process.env.AIDEV_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'aidev');
const file = () => path.join(configDir(), 'config.json');

export async function loadConfig(): Promise<Config> {
  let stored: Partial<Config> = {};
  try { stored = JSON.parse(await fs.readFile(file(), 'utf8')); } catch { /* first run */ }
  return {
    registry: (process.env.AIDEV_REGISTRY ?? stored.registry ?? DEFAULT_REGISTRY).replace(/\/$/, ''),
    token: process.env.AIDEV_TOKEN ?? stored.token,
    defaultProvider: process.env.AIDEV_PROVIDER ?? stored.defaultProvider,
    email: stored.email,
  };
}

/** Persist only stored keys (never leak env-provided tokens into the file). */
export async function saveConfig(patch: Partial<Config>) {
  let stored: Partial<Config> = {};
  try { stored = JSON.parse(await fs.readFile(file(), 'utf8')); } catch { /* none */ }
  const next = { ...stored, ...patch };
  for (const k of Object.keys(next) as (keyof Config)[]) if (next[k] === undefined) delete next[k];
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  await fs.writeFile(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

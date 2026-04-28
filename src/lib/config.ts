import { parseCliEnv } from './env.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = parseCliEnv(process.env);
export const AUTH_API_URL = env.AURA_API_URL;
export const IMAGE_WORKER_URL = env.AURA_CDN_URL;
export const WEB_URL = env.AURA_WEB_URL;

interface AuraConfig {
  projectName: string;
  publicKey: string;
  baseUrl: string;
}

const CONFIG_FILENAME = 'aura.config.json';

export function readConfig(cwd = process.cwd()): AuraConfig | null {
  const path = join(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as AuraConfig;
}

export function writeConfig(config: AuraConfig, cwd = process.cwd()) {
  const path = join(cwd, CONFIG_FILENAME);
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
}

export function appendEnvLocal(vars: Record<string, string>, cwd = process.cwd()) {
  const path = join(cwd, '.env.local');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const map = new Map(
    existing
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx), l.slice(idx + 1)] as [string, string];
      })
  );
  for (const [k, v] of Object.entries(vars)) map.set(k, v);
  writeFileSync(path, [...map.entries()].map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Credentials {
  token: string;
  email: string;
  local?: boolean;
}

const CREDENTIALS_DIR = join(homedir(), '.aura');
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, 'credentials');

export function readCredentials(): Credentials | null {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as Credentials;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: Credentials): void {
  mkdirSync(CREDENTIALS_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + '\n', {
    mode: 0o600
  });
}

export function clearCredentials(): void {
  rmSync(CREDENTIALS_PATH, { force: true });
}

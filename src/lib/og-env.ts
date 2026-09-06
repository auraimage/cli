import { join } from 'node:path';

/**
 * Credential resolution for `aura og *` (ADR 0032). These commands manage a
 * project resource, so the credential is the project's **Secret Key** as a
 * bearer token, not the user-scoped CLI token in ~/.aura/credentials. A Secret
 * Key is server-only and belongs in the project's env, which is where `aura
 * init` tells the developer to put it.
 */

const PRODUCTION_CDN_URL = 'https://cdn.auraimage.ai';
const ENV_FILES = ['.env.local', '.env'];

export class OgConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OgConfigError';
  }
}

export interface OgContext {
  projectName: string;
  secretKey: string;
  /** CDN base URL with any trailing slashes trimmed. */
  cdnUrl: string;
}

/**
 * Loads `.env.local` then `.env` from `cwd` into `process.env`.
 *
 * `process.loadEnvFile` never overwrites a variable already in `process.env`,
 * so this order gives exactly the precedence the docs promise: the real
 * environment wins, then `.env.local`, then `.env`. A missing file throws
 * ENOENT and is simply skipped — both files are optional.
 */
export function loadProjectEnv(cwd: string = process.cwd()): void {
  for (const file of ENV_FILES) {
    try {
      process.loadEnvFile(join(cwd, file));
    } catch {
      // Missing or unreadable: env files are optional for these commands.
    }
  }
}

export function resolveOgContext(overrideProject?: string, env: NodeJS.ProcessEnv = process.env): OgContext {
  const secretKey = env.AURA_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new OgConfigError(
      'AURA_SECRET_KEY is not set.\n' +
        'Run `aura init` to create a Secret Key for this project, then add it to .env.local.\n' +
        'Keep it server-side only — it is the bearer credential for your project.'
    );
  }
  if (!secretKey.startsWith('sk_live_')) {
    throw new OgConfigError(
      'AURA_SECRET_KEY does not look like a Secret Key (they start with `sk_live_`).\n' +
        'The CLI token in ~/.aura/credentials is a different credential and will not work here.'
    );
  }

  // AURA_PROJECT is what `aura init` prints today. AURA_PROJECT_NAME is the
  // name CONTEXT.md makes canonical across every language, so it is read as a
  // fallback rather than making a correctly-configured project fail here.
  const projectName = (overrideProject ?? env.AURA_PROJECT ?? env.AURA_PROJECT_NAME)?.trim();
  if (!projectName) {
    throw new OgConfigError(
      'No project. Pass --project <name>, or set AURA_PROJECT in .env.local (`aura init` prints it).'
    );
  }

  const cdnUrl = (env.AURA_CDN_URL?.trim() || PRODUCTION_CDN_URL).replace(/\/+$/, '');
  return { projectName, secretKey, cdnUrl };
}

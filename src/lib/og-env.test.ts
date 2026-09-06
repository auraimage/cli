import { readCredentials } from './credentials.js';
import { OgConfigError, loadProjectEnv, resolveOgContext } from './og-env.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// resolveOgContext takes its CDN URL from the CLI's endpoint resolution, which
// reads ~/.aura/credentials. Stubbing the read keeps the developer's real login
// (and whether it is a --local one) out of these assertions.
vi.mock('./credentials.js', () => ({ readCredentials: vi.fn() }));

let dir: string;
let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-og-env-'));
  // loadProjectEnv mutates the real process.env, so every test restores it.
  snapshot = { ...process.env };
  // A developer running this suite may have these set for real work, and
  // loadProjectEnv never overrides what is already there — which would silently
  // invert the precedence assertions below. AURA_API_URL and AURA_WEB_URL are
  // cleared too: resolveOgContext goes through parseCliEnv, which validates all
  // three URLs, so a malformed value in either one would fail assertions that
  // have nothing to do with it.
  for (const key of [
    'AURA_SECRET_KEY',
    'AURA_PROJECT',
    'AURA_PROJECT_NAME',
    'AURA_CDN_URL',
    'AURA_API_URL',
    'AURA_WEB_URL'
  ]) {
    delete process.env[key];
  }
  // No credentials file is the common case for `aura og *`: endpoint resolution
  // falls through to the environment, so these commands need no prior login.
  vi.mocked(readCredentials).mockReturnValue(null);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, snapshot);
});

describe('loadProjectEnv', () => {
  it('loads .env.local and .env without overriding an existing process.env value', () => {
    writeFileSync(join(dir, '.env.local'), 'AURA_SECRET_KEY=sk_live_from_local\nAURA_PROJECT=from_local\n');
    writeFileSync(join(dir, '.env'), 'AURA_SECRET_KEY=sk_live_from_env\nAURA_CDN_URL=https://cdn.example\n');
    process.env.AURA_PROJECT = 'from_process';

    loadProjectEnv(dir);

    expect(process.env.AURA_PROJECT).toBe('from_process');
    expect(process.env.AURA_SECRET_KEY).toBe('sk_live_from_local');
    expect(process.env.AURA_CDN_URL).toBe('https://cdn.example');
  });

  it('is a no-op when neither file exists', () => {
    expect(() => loadProjectEnv(dir)).not.toThrow();
  });
});

describe('resolveOgContext', () => {
  const env = {
    AURA_SECRET_KEY: 'sk_live_abc',
    AURA_PROJECT: 'my-app'
  } as NodeJS.ProcessEnv;

  it('reads the key, the project, and the CDN base URL', () => {
    // The key and the project come from the injected env; the CDN URL comes from
    // the endpoint resolution, which reads the real process.env that
    // loadProjectEnv has already merged .env.local into.
    process.env.AURA_CDN_URL = 'https://cdn.example';
    expect(resolveOgContext(undefined, env)).toEqual({
      secretKey: 'sk_live_abc',
      projectName: 'my-app',
      cdnUrl: 'https://cdn.example'
    });
  });

  it('lets --project override AURA_PROJECT', () => {
    expect(resolveOgContext('other-app', env).projectName).toBe('other-app');
  });

  it('falls back to AURA_PROJECT_NAME when AURA_PROJECT is unset', () => {
    const { AURA_PROJECT: _drop, ...rest } = env;
    expect(
      resolveOgContext(undefined, { ...rest, AURA_PROJECT_NAME: 'canonical' } as NodeJS.ProcessEnv).projectName
    ).toBe('canonical');
  });

  it('trims trailing slashes off AURA_CDN_URL and defaults to production', () => {
    process.env.AURA_CDN_URL = 'https://cdn.example///';
    expect(resolveOgContext(undefined, env).cdnUrl).toBe('https://cdn.example');
    delete process.env.AURA_CDN_URL;
    expect(resolveOgContext(undefined, env).cdnUrl).toBe('https://cdn.auraimage.ai');
  });

  it('rejects an AURA_CDN_URL that is not a URL', () => {
    process.env.AURA_CDN_URL = 'cdn.example';
    expect(() => resolveOgContext(undefined, env)).toThrow(/CLI env validation failed/);
  });

  it('follows a --local login to the local CDN, as `aura upload` does', () => {
    vi.mocked(readCredentials).mockReturnValue({ token: 't', email: 'e', local: true });
    // Local credentials outrank AURA_CDN_URL, so `aura og push` and `aura upload`
    // cannot end up pointed at different CDNs.
    process.env.AURA_CDN_URL = 'https://cdn.example';
    expect(resolveOgContext(undefined, env).cdnUrl).toBe('https://cdn.auraimage.localhost');
  });

  it('names AURA_SECRET_KEY and points at aura init when the key is missing', () => {
    const { AURA_SECRET_KEY: _drop, ...rest } = env;
    expect(() => resolveOgContext(undefined, rest as NodeJS.ProcessEnv)).toThrow(OgConfigError);
    expect(() => resolveOgContext(undefined, rest as NodeJS.ProcessEnv)).toThrow(
      /AURA_SECRET_KEY is not set[\s\S]*aura init/
    );
  });

  it('rejects a value that is not a Secret Key', () => {
    expect(() => resolveOgContext(undefined, { ...env, AURA_SECRET_KEY: 'aura_pat_nope' })).toThrow(
      /AURA_SECRET_KEY does not look like a Secret Key/
    );
  });

  it('names the project sources when no project is known', () => {
    const { AURA_PROJECT: _drop, ...rest } = env;
    expect(() => resolveOgContext(undefined, rest as NodeJS.ProcessEnv)).toThrow(/--project <name>[\s\S]*AURA_PROJECT/);
  });
});

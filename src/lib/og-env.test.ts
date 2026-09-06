import { OgConfigError, loadProjectEnv, resolveOgContext } from './og-env.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let dir: string;
let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-og-env-'));
  // loadProjectEnv mutates the real process.env, so every test restores it.
  snapshot = { ...process.env };
  // A developer running this suite may have these set for real work, and
  // loadProjectEnv never overrides what is already there — which would silently
  // invert the precedence assertions below.
  for (const key of ['AURA_SECRET_KEY', 'AURA_PROJECT', 'AURA_PROJECT_NAME', 'AURA_CDN_URL']) {
    delete process.env[key];
  }
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
    AURA_PROJECT: 'my-app',
    AURA_CDN_URL: 'https://cdn.example'
  } as NodeJS.ProcessEnv;

  it('reads the key, the project, and the CDN base URL', () => {
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
    expect(resolveOgContext(undefined, { ...env, AURA_CDN_URL: 'https://cdn.example///' }).cdnUrl).toBe(
      'https://cdn.example'
    );
    const { AURA_CDN_URL: _drop, ...rest } = env;
    expect(resolveOgContext(undefined, rest as NodeJS.ProcessEnv).cdnUrl).toBe('https://cdn.auraimage.ai');
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

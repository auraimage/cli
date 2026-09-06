import { readCredentials } from '../lib/credentials.js';
import { cmdOgList } from './og-list.js';
import { cmdOgRm } from './og-rm.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `@clack/prompts` is native ESM, so its namespace properties are
 * non-configurable and `vi.spyOn(p, 'confirm')` throws
 * "Cannot redefine property: confirm". Replace the module instead. This also
 * keeps the real spinner's timers and stdout writes out of the test run.
 */
const clack = vi.hoisted(() => ({
  confirm: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
  spinner: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), error: vi.fn() }
}));
vi.mock('@clack/prompts', () => clack);

// resolveOgContext takes its CDN URL from the CLI's endpoint resolution, which
// reads ~/.aura/credentials. Stubbing the read keeps the developer's real login
// (and whether it is a --local one, which would send every URL below to
// cdn.auraimage.localhost) out of these assertions.
vi.mock('../lib/credentials.js', () => ({ readCredentials: vi.fn() }));

let snapshot: NodeJS.ProcessEnv;
let out: string[];
let err: string[];

const SUMMARY = {
  name: 'blog-post',
  version: 'abc123def4567890',
  width: 1200,
  height: 630,
  quality: 80,
  fonts: [] as string[],
  defaults: {},
  variables: { title: 'text', cover: 'image' },
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  url: 'https://cdn.example/v1/og/my-app/blog-post'
};

function stubFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` clears call history but keeps implementations, so re-seed
  // the ones the commands depend on. `confirm` is set per test.
  clack.isCancel.mockReturnValue(false);
  clack.spinner.mockReturnValue({ start: vi.fn(), stop: vi.fn(), message: vi.fn() });
  // No credentials file is the common case for `aura og *`: endpoint resolution
  // falls through to the environment, so these commands need no prior login.
  vi.mocked(readCredentials).mockReturnValue(null);

  snapshot = { ...process.env };
  // AURA_PROJECT_NAME is cleared because it is the fallback project source, and
  // AURA_API_URL / AURA_WEB_URL because resolveOgContext runs the whole CLI env
  // through one parseCliEnv — a malformed value in either would fail assertions
  // that have nothing to do with it.
  for (const key of ['AURA_PROJECT_NAME', 'AURA_API_URL', 'AURA_WEB_URL']) delete process.env[key];
  process.env.AURA_SECRET_KEY = 'sk_live_abc';
  process.env.AURA_PROJECT = 'my-app';
  process.env.AURA_CDN_URL = 'https://cdn.example';
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void err.push(args.join(' ')));
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code ?? 0}`);
  }) as never);
});

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, snapshot);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cmdOgList', () => {
  it('GETs the project list and prints every template as JSON', async () => {
    const fetchFn = stubFetch(json({ templates: [SUMMARY] }));
    await cmdOgList({ json: true });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cdn.example/v1/og-templates/my-app');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk_live_abc' });
    expect(JSON.parse(out.join('\n'))).toEqual({ templates: [SUMMARY] });
  });

  it('exits 1 naming AURA_SECRET_KEY when the key is missing', async () => {
    delete process.env.AURA_SECRET_KEY;
    const fetchFn = stubFetch(json({}));
    await expect(cmdOgList({ json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('AURA_SECRET_KEY is not set');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("exits 1 with the CDN's message when the list fails", async () => {
    stubFetch(json({ message: 'Forbidden' }, 403));
    await expect(cmdOgList({ json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('Forbidden');
  });

  it('exits 1 when the network fails, which rejects with a raw TypeError', async () => {
    // fetch rejects rather than resolving, so nothing here is an OgRequestError.
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchFn);
    await expect(cmdOgList({ json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('fetch failed');
  });
});

describe('cmdOgRm', () => {
  it('DELETEs after --yes, with no prompt', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 204 }));

    await cmdOgRm('blog-post', { json: true, yes: true });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cdn.example/v1/og-templates/my-app/blog-post');
    expect(init.method).toBe('DELETE');
    expect(clack.confirm).not.toHaveBeenCalled();
    expect(JSON.parse(out.join('\n'))).toEqual({ name: 'blog-post', removed: true });
  });

  it('refuses --json without --yes, because there is no prompt to answer', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 204 }));
    await expect(cmdOgRm('blog-post', { json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('Pass --yes');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('deletes nothing when the confirmation is declined', async () => {
    clack.confirm.mockResolvedValue(false);
    const fetchFn = stubFetch(new Response(null, { status: 204 }));

    await cmdOgRm('blog-post', {});

    expect(fetchFn).not.toHaveBeenCalled();
    expect(clack.cancel).toHaveBeenCalled();
  });

  it('deletes when the confirmation is accepted', async () => {
    clack.confirm.mockResolvedValue(true);
    const fetchFn = stubFetch(new Response(null, { status: 204 }));

    await cmdOgRm('blog-post', {});

    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE');
    expect(clack.log.success).toHaveBeenCalled();
  });

  it("exits 1 with the CDN's message when the template does not exist", async () => {
    stubFetch(json({ message: 'OG template not found' }, 404));
    await expect(cmdOgRm('nope', { json: true, yes: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('OG template not found');
  });
});

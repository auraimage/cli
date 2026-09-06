import { readCredentials } from '../lib/credentials.js';
import { cmdOgPush } from './og-push.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// resolveOgContext takes its CDN URL from the CLI's endpoint resolution, which
// reads ~/.aura/credentials. Stubbing the read keeps the developer's real login
// (and whether it is a --local one, which would send every URL below to
// cdn.auraimage.localhost) out of these assertions.
vi.mock('../lib/credentials.js', () => ({ readCredentials: vi.fn() }));

let dir: string;
let file: string;
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
  defaults: { kicker: 'Engineering' },
  variables: { kicker: 'text', title: 'text', cover: 'image' },
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

const FLAGS = { font: [] as string[], default: [] as string[] };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-og-push-'));
  file = join(dir, 'blog-post.html');
  writeFileSync(file, '<div tw="flex"></div>');
  snapshot = { ...process.env };
  // AURA_PROJECT_NAME is cleared because it is the fallback project source, and
  // AURA_API_URL / AURA_WEB_URL because resolveOgContext runs the whole CLI env
  // through one parseCliEnv — a malformed value in either would fail assertions
  // that have nothing to do with it.
  for (const key of ['AURA_PROJECT_NAME', 'AURA_API_URL', 'AURA_WEB_URL']) delete process.env[key];
  process.env.AURA_SECRET_KEY = 'sk_live_abc';
  process.env.AURA_PROJECT = 'my-app';
  process.env.AURA_CDN_URL = 'https://cdn.example';
  // No credentials file is the common case for `aura og *`: endpoint resolution
  // falls through to the environment, so these commands need no prior login.
  vi.mocked(readCredentials).mockReturnValue(null);
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void err.push(args.join(' ')));
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code ?? 0}`);
  }) as never);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, snapshot);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cmdOgPush', () => {
  it('sends the file plus the flags and prints the Render URL and an example URL', async () => {
    const fetchFn = stubFetch(json({ ...SUMMARY, created: true }, 201));
    await cmdOgPush('blog-post', file, { ...FLAGS, font: ['Inter'], default: ['kicker=Engineering'], json: true });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cdn.example/v1/og-templates/my-app/blog-post');
    expect(JSON.parse(init.body as string)).toEqual({
      html: '<div tw="flex"></div>',
      width: 1200,
      height: 630,
      fonts: ['Inter'],
      defaults: { kicker: 'Engineering' }
    });

    const printed = JSON.parse(out.join('\n')) as { created: boolean; url: string; exampleUrl: string };
    expect(printed.created).toBe(true);
    expect(printed.url).toBe('https://cdn.example/v1/og/my-app/blog-post');
    // `cover` is an image slot with no default, so it is left out of the example.
    expect(printed.exampleUrl).toBe('https://cdn.example/v1/og/my-app/blog-post?kicker=Engineering&title=Title');
  });

  it('sends --width, --height, and --quality when given', async () => {
    const fetchFn = stubFetch(json({ ...SUMMARY, created: false }));
    await cmdOgPush('square-card', file, { ...FLAGS, width: '1080', height: '1080', quality: '90', json: true });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ width: 1080, height: 1080, quality: 90 });
  });

  it("exits 1 with the origin's message when the push is rejected", async () => {
    stubFetch(json({ message: "variable '{{c}}' may not appear in a tw attribute — variables are text" }, 400));
    await expect(cmdOgPush('blog-post', file, { ...FLAGS, json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('may not appear in a tw attribute');
  });

  it('exits 1 naming AURA_SECRET_KEY when the key is missing', async () => {
    delete process.env.AURA_SECRET_KEY;
    const fetchFn = stubFetch(json({}));
    await expect(cmdOgPush('blog-post', file, { ...FLAGS, json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('AURA_SECRET_KEY is not set');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('exits 1 with the validation message, not a file error, when AURA_CDN_URL is malformed', async () => {
    // parseCliEnv throws a plain Error, not an OgConfigError, and the template
    // file here is perfectly readable — so the message must name the env var.
    process.env.AURA_CDN_URL = 'cdn.example';
    const fetchFn = stubFetch(json({}));
    await expect(cmdOgPush('blog-post', file, { ...FLAGS, json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('CLI env validation failed');
    expect(err.join('\n')).not.toContain('Could not read');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('exits 1 when the template file does not exist', async () => {
    const fetchFn = stubFetch(json({}));
    await expect(cmdOgPush('blog-post', join(dir, 'missing.html'), { ...FLAGS, json: true })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('missing.html');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

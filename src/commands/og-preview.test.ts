import { readCredentials } from '../lib/credentials.js';
import { cmdOgPreview } from './og-preview.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The preview command always drives a clack spinner. Replace the module rather
 * than let the real one write to stdout and hold a timer open for the run.
 * `vi.spyOn` is not an option: `@clack/prompts` is native ESM and its namespace
 * properties are non-configurable.
 */
const clack = vi.hoisted(() => ({
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  log: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(() => false)
}));
vi.mock('@clack/prompts', () => clack);

// resolveOgContext takes its CDN URL from the CLI's endpoint resolution, which
// reads ~/.aura/credentials. Stubbing the read keeps the developer's real login
// (and whether it is a --local one, which would send every URL below to
// cdn.auraimage.localhost) out of these assertions.
vi.mock('../lib/credentials.js', () => ({ readCredentials: vi.fn() }));

let dir: string;
let snapshot: NodeJS.ProcessEnv;
let err: string[];

const HTML =
  '<div tw="flex h-full w-full items-center justify-center bg-[#16130f]">' +
  '<div tw="flex text-[40px] font-bold text-[#f4f4f6]">{{title}}</div></div>';

/** PNG signature, then IHDR width/height as big-endian uint32s at bytes 16 and 20. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const FLAGS = { font: [] as string[], default: [] as string[], var: [] as string[] };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-og-preview-'));
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
  err = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
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

describe('cmdOgPreview', () => {
  it('renders a PNG at the requested canvas', async () => {
    const file = join(dir, 't.html');
    const out = join(dir, 'card.png');
    writeFileSync(file, HTML);

    await cmdOgPreview(file, { ...FLAGS, var: ['title=Hello'], out, width: '600', height: '300' });

    expect(pngSize(readFileSync(out))).toEqual({ width: 600, height: 300 });
  });

  it('fetches an image slot from the project CDN and embeds it', async () => {
    const file = join(dir, 't.html');
    const out = join(dir, 'card.png');
    writeFileSync(file, '<div tw="flex h-full w-full"><img src="{{cover}}" tw="h-full w-full" /></div>');

    // A 1x1 PNG, the smallest thing the renderer will decode.
    const onePixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const fetchFn = vi.fn(async (_url: string | URL | Request) => new Response(onePixel, { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);

    await cmdOgPreview(file, { ...FLAGS, var: ['cover=w=300/blog/hero'], out, width: '400', height: '200' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://cdn.example/my-app/w=512/blog/hero.webp');
    expect(pngSize(readFileSync(out))).toEqual({ width: 400, height: 200 });
  });

  it('exits 1 naming the variable that has no value', async () => {
    const file = join(dir, 't.html');
    writeFileSync(file, HTML);
    await expect(cmdOgPreview(file, { ...FLAGS, out: join(dir, 'card.png') })).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain("no value for '{{title}}'");
  });

  it('exits 1 with the CDN status when a slot image is missing', async () => {
    const file = join(dir, 't.html');
    writeFileSync(file, '<div tw="flex h-full w-full"><img src="{{cover}}" tw="h-full w-full" /></div>');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 }))
    );

    await expect(
      cmdOgPreview(file, { ...FLAGS, var: ['cover=w=300/blog/missing'], out: join(dir, 'card.png') })
    ).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('404');
    expect(err.join('\n')).toContain('w=512/blog/missing.webp');
  });

  it('rejects an unsupported --format', async () => {
    const file = join(dir, 't.html');
    writeFileSync(file, HTML);
    await expect(
      cmdOgPreview(file, { ...FLAGS, var: ['title=x'], format: 'avif', out: join(dir, 'card.avif') })
    ).rejects.toThrow('exit:1');
    expect(err.join('\n')).toContain('--format must be png, jpg, or webp');
  });

  it('exits 1 with the validation message, not a file error, when AURA_CDN_URL is malformed', async () => {
    // parseCliEnv throws a plain Error, not an OgConfigError, and the template
    // file here is perfectly readable — so the message must name the env var.
    const file = join(dir, 't.html');
    writeFileSync(file, HTML);
    process.env.AURA_CDN_URL = 'cdn.example';

    await expect(cmdOgPreview(file, { ...FLAGS, var: ['title=x'], out: join(dir, 'card.png') })).rejects.toThrow(
      'exit:1'
    );
    expect(err.join('\n')).toContain('CLI env validation failed');
    expect(err.join('\n')).not.toContain('Could not read');
  });
});

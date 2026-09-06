import { OgRequestError, deleteTemplate, listTemplates, pushTemplate } from './og-client.js';
import type { OgContext } from './og-env.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ctx: OgContext = { projectName: 'my-app', secretKey: 'sk_live_abc', cdnUrl: 'https://cdn.example' };

function stubFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUMMARY = {
  name: 'blog-post',
  version: 'abc123',
  width: 1200,
  height: 630,
  quality: 80,
  fonts: [],
  defaults: {},
  variables: { title: 'text' as const },
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  url: 'https://cdn.example/v1/og/my-app/blog-post'
};

afterEach(() => vi.unstubAllGlobals());

describe('pushTemplate', () => {
  it('PUTs the body with the Secret Key as a bearer token', async () => {
    const fetchFn = stubFetch(json({ ...SUMMARY, created: true }, 201));
    const result = await pushTemplate(ctx, 'blog-post', {
      html: '<div/>',
      width: 1200,
      height: 630,
      fonts: [],
      defaults: {}
    });

    expect(result.created).toBe(true);
    expect(result.url).toBe('https://cdn.example/v1/og/my-app/blog-post');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cdn.example/v1/og-templates/my-app/blog-post');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk_live_abc', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      html: '<div/>',
      width: 1200,
      height: 630,
      fonts: [],
      defaults: {}
    });
  });

  it('encodes the project and template name in the path', async () => {
    const fetchFn = stubFetch(json({ ...SUMMARY, created: false }));
    await pushTemplate({ ...ctx, projectName: 'my app' }, 'blog-post', {
      html: '<div/>',
      width: 1200,
      height: 630,
      fonts: [],
      defaults: {}
    });
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      'https://cdn.example/v1/og-templates/my%20app/blog-post'
    );
  });

  it("throws the origin's message verbatim, with its status", async () => {
    stubFetch(json({ message: "class 'flex' is not defined in a <style> block" }, 400));
    await expect(
      pushTemplate(ctx, 'blog-post', { html: '<div/>', width: 1200, height: 630, fonts: [], defaults: {} })
    ).rejects.toThrow("class 'flex' is not defined in a <style> block");
    stubFetch(json({ message: 'nope' }, 409));
    await expect(
      pushTemplate(ctx, 'blog-post', { html: '<div/>', width: 1200, height: 630, fonts: [], defaults: {} })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    stubFetch(new Response('gateway blew up', { status: 502 }));
    await expect(
      pushTemplate(ctx, 'blog-post', { html: '<div/>', width: 1200, height: 630, fonts: [], defaults: {} })
    ).rejects.toThrow('Request failed (502)');
  });
});

describe('listTemplates', () => {
  it('GETs the project list and returns the templates array', async () => {
    const fetchFn = stubFetch(json({ templates: [SUMMARY] }));
    expect(await listTemplates(ctx)).toEqual([SUMMARY]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cdn.example/v1/og-templates/my-app');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk_live_abc' });
  });
});

describe('deleteTemplate', () => {
  it('DELETEs and resolves on 204', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 204 }));
    await expect(deleteTemplate(ctx, 'blog-post')).resolves.toBeUndefined();
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE');
  });

  it('throws an OgRequestError on 404', async () => {
    stubFetch(json({ message: 'OG template not found' }, 404));
    await expect(deleteTemplate(ctx, 'nope')).rejects.toBeInstanceOf(OgRequestError);
  });
});

import { OgConfigError } from './og-env.js';
import {
  escapeHtml,
  readTemplateShape,
  resolveValues,
  slotServeUrl,
  staticImagePaths,
  substituteVariables
} from './og-local-render.js';
import { describe, expect, it } from 'vitest';

describe('escapeHtml', () => {
  it('escapes exactly the five characters the origin escapes', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes & first so an escape is never double-escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('substituteVariables', () => {
  it('fills every hole with its escaped value', () => {
    expect(substituteVariables('<h1>{{title}}</h1>', { title: '<script>' })).toBe('<h1>&lt;script&gt;</h1>');
  });

  it('leaves a hole alone when no value was supplied', () => {
    expect(substituteVariables('{{a}}{{b}}', { a: 'x' })).toBe('x{{b}}');
  });

  it('ignores inherited property names', () => {
    expect(substituteVariables('{{constructor}}', {})).toBe('{{constructor}}');
  });
});

describe('readTemplateShape', () => {
  it('lists every variable and marks the ones used as an image src', () => {
    const html = '<div tw="flex">{{title}}<img src="{{cover}}" /><img src="w=64/logo" /></div>';
    expect(readTemplateShape(html)).toEqual({ names: ['cover', 'title'], slots: ['cover'] });
  });

  it('does not mark a name that is also used as text', () => {
    expect(readTemplateShape('<img src="{{a}}" />{{a}}')).toEqual({ names: ['a'], slots: [] });
  });

  it('accepts single-quoted src attributes', () => {
    expect(readTemplateShape("<img src='{{cover}}' />").slots).toEqual(['cover']);
  });
});

describe('resolveValues', () => {
  const shape = { names: ['cover', 'title'], slots: ['cover'] };

  it('prefers a supplied value over a default', () => {
    expect(resolveValues(shape, { title: 'Supplied' }, { title: 'Default', cover: 'w=64/logo' })).toEqual({
      cover: 'w=64/logo',
      title: 'Supplied'
    });
  });

  it('throws naming the variable when nothing supplies a value', () => {
    expect(() => resolveValues(shape, { cover: 'w=64/logo' }, {})).toThrow(OgConfigError);
    expect(() => resolveValues(shape, { cover: 'w=64/logo' }, {})).toThrow(
      "no value for '{{title}}' — pass --var title=… or push a default with --default title=…"
    );
  });

  it('rejects a --var the template never declares', () => {
    expect(() => resolveValues(shape, { title: 'a', cover: 'b', nope: 'c' }, {})).toThrow(
      "this template has no variable 'nope' — it declares: cover, title"
    );
  });
});

describe('slotServeUrl', () => {
  it('defaults to width 1536 and webp when the path carries no transform', () => {
    expect(slotServeUrl('https://cdn.example', 'my-app', 'blog/hero')).toBe(
      'https://cdn.example/my-app/w=1536/blog/hero.webp'
    );
  });

  it('snaps a requested width up the ladder and caps it at 2048', () => {
    expect(slotServeUrl('https://cdn.example', 'my-app', 'w=300/blog/hero')).toBe(
      'https://cdn.example/my-app/w=512/blog/hero.webp'
    );
    expect(slotServeUrl('https://cdn.example', 'my-app', 'w=4000/blog/hero')).toBe(
      'https://cdn.example/my-app/w=2048/blog/hero.webp'
    );
  });

  it('keeps fit and quality, and an explicit extension wins over webp', () => {
    expect(slotServeUrl('https://cdn.example', 'my-app', 'w=256,fit=face,q=70/team/jane.png')).toBe(
      'https://cdn.example/my-app/w=256,fit=face,q=70/team/jane.png'
    );
  });

  it('uses only the height when only a height was asked for', () => {
    expect(slotServeUrl('https://cdn.example', 'my-app', 'h=400/blog/hero')).toBe(
      'https://cdn.example/my-app/h=512/blog/hero.webp'
    );
  });

  it('refuses an absolute URL with the upload-it-first message', () => {
    expect(() => slotServeUrl('https://cdn.example', 'my-app', 'https://example.com/a.png')).toThrow(
      /must be uploaded to this project first/
    );
  });
});

describe('staticImagePaths', () => {
  it('returns every non-placeholder image src, deduplicated', () => {
    const html = '<img src="w=64/logo" /><img src="{{cover}}" /><img src="w=64/logo" />';
    expect(staticImagePaths(html)).toEqual(['w=64/logo']);
  });
});

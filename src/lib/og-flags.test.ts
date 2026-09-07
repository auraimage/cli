import { OgConfigError } from './og-env.js';
import { collect, parseCanvas, parseDefaults, parseFonts } from './og-flags.js';
import { describe, expect, it } from 'vitest';

const base = { font: [] as string[], default: [] as string[] };

describe('parseCanvas', () => {
  it('defaults to the OG card canvas and omits quality when the flag is absent', () => {
    expect(parseCanvas(base)).toEqual({ width: 1200, height: 630 });
  });

  it('reads width, height, and quality', () => {
    expect(parseCanvas({ ...base, width: '1080', height: '1080', quality: '90' })).toEqual({
      width: 1080,
      height: 1080,
      quality: 90
    });
  });

  it('rejects a non-integer or out-of-range canvas', () => {
    expect(() => parseCanvas({ ...base, width: '12.5' })).toThrow('--width must be an integer between 100 and 4096');
    expect(() => parseCanvas({ ...base, height: '99' })).toThrow('--height must be an integer between 100 and 4096');
    expect(() => parseCanvas({ ...base, width: '4097' })).toThrow('--width must be an integer between 100 and 4096');
  });

  it('rejects a quality outside 1-100', () => {
    expect(() => parseCanvas({ ...base, quality: '0' })).toThrow('--quality must be an integer between 1 and 100');
    expect(() => parseCanvas({ ...base, quality: '101' })).toThrow('--quality must be an integer between 1 and 100');
  });
});

describe('parseFonts', () => {
  it('passes families through and caps the list at four', () => {
    expect(parseFonts({ ...base, font: ['Inter', 'Fraunces'] })).toEqual(['Inter', 'Fraunces']);
    expect(() => parseFonts({ ...base, font: ['a', 'b', 'c', 'd', 'e'] })).toThrow(
      'at most 4 --font families (a template may declare 4)'
    );
  });
});

describe('parseDefaults', () => {
  it('splits on the first = so a value may contain one', () => {
    expect(parseDefaults(['title=Hello', 'cover=w=1200,fit=cover/blog/hero'], '--default')).toEqual({
      title: 'Hello',
      cover: 'w=1200,fit=cover/blog/hero'
    });
  });

  it('accepts an empty value', () => {
    expect(parseDefaults(['kicker='], '--default')).toEqual({ kicker: '' });
  });

  it('rejects a pair with no = and a bad variable name', () => {
    expect(() => parseDefaults(['title'], '--default')).toThrow("--default 'title' must be written key=value");
    expect(() => parseDefaults(['Title=x'], '--default')).toThrow(
      "--default variable name 'Title' must match [a-z][a-z0-9_]*"
    );
  });

  it('rejects a duplicate key', () => {
    expect(() => parseDefaults(['title=a', 'title=b'], '--default')).toThrow("--default 'title' was given twice");
  });

  it('accepts a 500-character value and rejects 501, the cap a Render URL enforces', () => {
    expect(parseDefaults([`title=${'x'.repeat(500)}`], '--default')).toEqual({ title: 'x'.repeat(500) });
    expect(() => parseDefaults([`title=${'x'.repeat(501)}`], '--default')).toThrow(OgConfigError);
    expect(() => parseDefaults([`title=${'x'.repeat(501)}`], '--var')).toThrow(
      "value for 'title' exceeds 500 characters"
    );
  });
});

describe('collect', () => {
  it('accumulates repeated option values without mutating the previous array', () => {
    const first: string[] = [];
    const second = collect('a', first);
    expect(collect('b', second)).toEqual(['a', 'b']);
    expect(first).toEqual([]);
  });
});

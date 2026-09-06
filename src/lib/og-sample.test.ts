import { sampleValues, titleCase, withQuery } from './og-sample.js';
import { describe, expect, it } from 'vitest';

describe('titleCase', () => {
  it('turns a variable name into a readable sample value', () => {
    expect(titleCase('title')).toBe('Title');
    expect(titleCase('read_time')).toBe('Read Time');
    expect(titleCase('h1')).toBe('H1');
  });
});

describe('sampleValues', () => {
  it('prefers a declared default and falls back to the title-cased name for text', () => {
    expect(
      sampleValues({
        variables: { title: 'text', kicker: 'text' },
        defaults: { kicker: 'Engineering' }
      })
    ).toEqual({ values: { kicker: 'Engineering', title: 'Title' }, missingSlots: [] });
  });

  it('fills an image slot only from its default and reports the ones with none', () => {
    expect(
      sampleValues({
        variables: { cover: 'image', hero: 'image', title: 'text' },
        defaults: { cover: 'w=1200/blog/hero' }
      })
    ).toEqual({ values: { cover: 'w=1200/blog/hero', title: 'Title' }, missingSlots: ['hero'] });
  });

  it('ignores an inherited property name', () => {
    expect(sampleValues({ variables: {}, defaults: {} })).toEqual({ values: {}, missingSlots: [] });
  });
});

describe('withQuery', () => {
  it('appends sorted, encoded pairs and returns the bare url when there are none', () => {
    expect(withQuery('https://cdn.example/v1/og/a/b', { title: 'a b', author: 'Ada' })).toBe(
      'https://cdn.example/v1/og/a/b?author=Ada&title=a%20b'
    );
    expect(withQuery('https://cdn.example/v1/og/a/b', {})).toBe('https://cdn.example/v1/og/a/b');
  });
});

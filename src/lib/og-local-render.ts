import { OgConfigError } from './og-env.js';

/**
 * Local-preview counterparts of the origin's render helpers (ADR 0032).
 * Deliberately re-encoded rather than shared: `@auraimage/cli` is a separately
 * published package and cannot import from `apps/cdn-origin`. Behaviour must
 * match `substituteVariables` / `escapeHtml` in `apps/cdn-origin/src/og/render.ts`
 * and the slot rules in `apps/cdn-origin/src/og/images.ts` exactly, or a card
 * that previews clean will render differently once pushed.
 */

const PLACEHOLDER_RE = /\{\{([a-z][a-z0-9_]*)\}\}/g;
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const SLOT_ONLY_RE = /^\{\{([a-z][a-z0-9_]*)\}\}$/;

// The slot grammar, mirroring apps/cdn-origin/src/og/slot-path.ts. Every rule
// there is repeated here: a shape this accepts but the origin rejects would
// preview clean and then 400 on the first Render URL.
const LADDER = [64, 128, 256, 512, 768, 1024, 1536, 2048, 3072, 4096] as const;
const SLOT_MAX_DIMENSION = 2048;
const SLOT_DEFAULT_WIDTH = 1536;
const SLOT_DEFAULT_EXTENSION = '.webp';
const OPTION_KEYS = ['w', 'h', 'fit', 'q'] as const;
const FIT_VALUES = new Set(['cover', 'contain', 'face', 'auto']);
const EMBEDDABLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const REJECTED_EXTENSIONS = new Set(['avif', 'gif', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'svg']);

/** Emoji glyphs (Twemoji) are the only host a render may fetch — same rule as the origin. */
export const ALLOWED_FETCH_HOST = 'cdn.jsdelivr.net' as const;

const UPLOAD_FIRST =
  'images must be uploaded to this project first — reference them as a project-relative serve path, e.g. w=1200/blog/hero';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function substituteVariables(html: string, values: Record<string, string>): string {
  // Own-property only: `constructor` and friends match the variable grammar, so
  // an `in` test would hand escapeHtml a function.
  return html.replace(PLACEHOLDER_RE, (match, name: string) =>
    Object.hasOwn(values, name) ? escapeHtml(values[name]!) : match
  );
}

export interface TemplateShape {
  /** Every declared variable, sorted. */
  names: string[];
  /** The subset used as an image `src` and nowhere else, sorted. */
  slots: string[];
}

export function readTemplateShape(html: string): TemplateShape {
  const names = new Set<string>();
  for (const match of html.matchAll(PLACEHOLDER_RE)) names.add(match[1]!);

  const asSrc = new Set<string>();
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const slot = SLOT_ONLY_RE.exec(match[1] ?? match[2] ?? '');
    if (slot) asSrc.add(slot[1]!);
  }

  // A name used both as a src and as text is not a slot; push rejects that
  // outright, and preview simply treats it as text so the card still renders.
  const slots = [...asSrc].filter((name) => {
    const total = (html.match(new RegExp(`\\{\\{${name}\\}\\}`, 'g')) ?? []).length;
    const inSrc = (html.match(new RegExp(`src\\s*=\\s*["']\\{\\{${name}\\}\\}["']`, 'g')) ?? []).length;
    return total === inSrc;
  });

  return { names: [...names].sort(), slots: slots.sort() };
}

export function resolveValues(
  shape: TemplateShape,
  supplied: Record<string, string>,
  defaults: Record<string, string>
): Record<string, string> {
  for (const name of Object.keys(supplied)) {
    if (!shape.names.includes(name)) {
      throw new OgConfigError(
        `this template has no variable '${name}' — it declares: ${shape.names.join(', ') || '(none)'}`
      );
    }
  }
  const values: Record<string, string> = {};
  for (const name of shape.names) {
    const value = Object.hasOwn(supplied, name)
      ? supplied[name]
      : Object.hasOwn(defaults, name)
        ? defaults[name]
        : undefined;
    if (value === undefined) {
      throw new OgConfigError(
        `no value for '{{${name}}}' — pass --var ${name}=… or push a default with --default ${name}=…`
      );
    }
    values[name] = value;
  }
  return values;
}

function snapAndCap(n: number): number {
  for (const rung of LADDER) if (n <= rung) return Math.min(rung, SLOT_MAX_DIMENSION);
  return SLOT_MAX_DIMENSION;
}

interface SlotOptions {
  w?: number;
  h?: number;
  fit?: string;
  q?: number;
}

/** Every message names the path it came from, so a card with several slots says which one. */
function slotError(servePath: string, detail: string): OgConfigError {
  return new OgConfigError(`'${servePath}': ${detail}`);
}

function looksLikeOptions(segment: string): boolean {
  return segment.includes('=') || segment.includes(',');
}

/** Mirrors `parseOptionsSegment` in the origin's slot-path.ts, message for message. */
function parseOptionsSegment(segment: string, servePath: string): SlotOptions {
  const options: SlotOptions = {};
  const seen = new Set<string>();
  for (const part of segment.split(',')) {
    if (!part) throw slotError(servePath, 'empty option in transform segment');
    const eq = part.indexOf('=');
    if (eq <= 0 || eq === part.length - 1) {
      throw slotError(servePath, `malformed transform option '${part}' — expected key=value`);
    }
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 'lqip') throw slotError(servePath, 'lqip is not supported in an image slot');
    if (!(OPTION_KEYS as readonly string[]).includes(key)) {
      throw slotError(servePath, `unknown transform option '${key}' — supported: w, h, fit, q`);
    }
    if (seen.has(key)) throw slotError(servePath, `duplicate transform option '${key}'`);
    seen.add(key);
    switch (key) {
      case 'w':
      case 'h': {
        // The regex is the guard, not Number(): NaN compares false against every
        // ladder rung, so an unchecked 'abc' would fall through to the 2048 cap.
        if (!/^\d+$/.test(value) || Number(value) <= 0) {
          throw slotError(servePath, `invalid ${key} '${value}' — must be a positive integer`);
        }
        options[key] = Number(value);
        break;
      }
      case 'q': {
        const q = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!(q >= 1 && q <= 100)) {
          throw slotError(servePath, `invalid q '${value}' — must be an integer between 1 and 100`);
        }
        options.q = q;
        break;
      }
      case 'fit': {
        if (!FIT_VALUES.has(value)) {
          throw slotError(servePath, `invalid fit '${value}' — must be cover, contain, face, or auto`);
        }
        options.fit = value;
        break;
      }
    }
  }
  return options;
}

/**
 * Turns a project-relative serve path into the public CDN URL whose bytes the
 * preview embeds. Mirrors `parseSlotPath` plus `makeImageResolver`: width
 * snapped to the ladder and capped at 2048, default width 1536 when neither axis
 * is given, WebP unless the path pins an extension.
 */
export function slotServeUrl(cdnUrl: string, projectName: string, servePath: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(servePath) || servePath.startsWith('//')) {
    throw slotError(servePath, UPLOAD_FIRST);
  }
  if (servePath.startsWith('/')) {
    throw slotError(servePath, 'image paths are project-relative — do not start with /');
  }

  const segments = servePath.split('/');
  const hasOptions = segments.length > 0 && looksLikeOptions(segments[0]!);
  const options = hasOptions ? parseOptionsSegment(segments[0]!, servePath) : {};
  const nameSegments = hasOptions ? segments.slice(1) : segments;
  if (nameSegments.some(looksLikeOptions)) {
    throw slotError(servePath, 'the transform segment must be a single path segment before the image name');
  }

  const name = nameSegments.join('/');
  if (!name) throw slotError(servePath, 'missing image name after the transform segment');

  // An extension the origin refuses to embed is named here rather than fetched
  // and rejected by the CDN. An unrecognised suffix is not an extension at all
  // and falls through to the name rules, exactly as at the origin.
  let hasExtension = false;
  const extMatch = /\.([A-Za-z0-9]+)$/.exec(name);
  if (extMatch) {
    const candidate = extMatch[1]!.toLowerCase();
    if (EMBEDDABLE_EXTENSIONS.has(candidate)) hasExtension = true;
    else if (REJECTED_EXTENSIONS.has(candidate)) {
      throw slotError(
        servePath,
        `'.${candidate}' is not supported in an image slot — use .jpg, .png, .webp, or no extension`
      );
    }
  }

  const rebuilt: string[] = [];
  if (options.w !== undefined) rebuilt.push(`w=${snapAndCap(options.w)}`);
  else if (options.h === undefined) rebuilt.push(`w=${SLOT_DEFAULT_WIDTH}`);
  if (options.h !== undefined) rebuilt.push(`h=${snapAndCap(options.h)}`);
  if (options.fit !== undefined) rebuilt.push(`fit=${options.fit}`);
  if (options.q !== undefined) rebuilt.push(`q=${options.q}`);

  const encoded = name.split('/').map(encodeURIComponent).join('/');
  return (
    `${cdnUrl}/${encodeURIComponent(projectName)}/${rebuilt.join(',')}/${encoded}` +
    (hasExtension ? '' : SLOT_DEFAULT_EXTENSION)
  );
}

/** Every image `src` in the markup that is a literal serve path rather than a slot. */
export function staticImagePaths(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const src = match[1] ?? match[2] ?? '';
    if (src.includes('{{')) continue;
    if (!out.includes(src)) out.push(src);
  }
  return out;
}

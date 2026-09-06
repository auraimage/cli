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

// Mirrors LADDER in apps/cdn-origin/src/og/slot-path.ts.
const LADDER = [64, 128, 256, 512, 768, 1024, 1536, 2048, 3072, 4096] as const;
const SLOT_MAX_DIMENSION = 2048;
const SLOT_DEFAULT_WIDTH = 1536;
const SLOT_DEFAULT_EXTENSION = '.webp';

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

/**
 * Turns a project-relative serve path into the public CDN URL whose bytes the
 * preview embeds. Mirrors `makeImageResolver`: width snapped to the ladder and
 * capped at 2048, default width 1536 when neither axis is given, WebP unless
 * the path pins an extension.
 */
export function slotServeUrl(cdnUrl: string, projectName: string, servePath: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(servePath) || servePath.startsWith('//')) {
    throw new OgConfigError(`'${servePath}': ${UPLOAD_FIRST}`);
  }
  if (servePath.startsWith('/')) {
    throw new OgConfigError(`'${servePath}': image paths are project-relative — do not start with /`);
  }

  const segments = servePath.split('/');
  const first = segments[0]!;
  const hasOptions = first.includes('=') || first.includes(',');
  const options = new Map<string, string>();
  if (hasOptions) {
    for (const part of first.split(',')) {
      const eq = part.indexOf('=');
      if (eq <= 0 || eq === part.length - 1) {
        throw new OgConfigError(`'${servePath}': malformed transform option '${part}' — expected key=value`);
      }
      options.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
  const name = (hasOptions ? segments.slice(1) : segments).join('/');
  if (!name) throw new OgConfigError(`'${servePath}': missing image name after the transform segment`);

  const w = options.get('w');
  const h = options.get('h');
  const rebuilt: string[] = [];
  if (w !== undefined) rebuilt.push(`w=${snapAndCap(Number(w))}`);
  else if (h === undefined) rebuilt.push(`w=${SLOT_DEFAULT_WIDTH}`);
  if (h !== undefined) rebuilt.push(`h=${snapAndCap(Number(h))}`);
  const fit = options.get('fit');
  if (fit !== undefined) rebuilt.push(`fit=${fit}`);
  const q = options.get('q');
  if (q !== undefined) rebuilt.push(`q=${q}`);

  const hasExtension = /\.[A-Za-z0-9]+$/.test(name);
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

import { OgConfigError, type OgContext, loadProjectEnv, resolveOgContext } from '../lib/og-env.js';
import { type OgCanvasFlags, parseCanvas, parseDefaults, parseFonts } from '../lib/og-flags.js';
import {
  ALLOWED_FETCH_HOST,
  readTemplateShape,
  resolveValues,
  slotServeUrl,
  staticImagePaths,
  substituteVariables
} from '../lib/og-local-render.js';
import * as p from '@clack/prompts';
import { readFileSync, writeFileSync } from 'node:fs';
import type { googleFonts as GoogleFontsFn } from 'takumi-js/helpers';

export interface OgPreviewOptions extends OgCanvasFlags {
  var: string[];
  out?: string;
  format?: string;
  project?: string;
}

type OutputFormat = 'png' | 'jpeg' | 'webp';

const FORMATS: Record<string, { takumi: OutputFormat; extension: string }> = {
  png: { takumi: 'png', extension: '.png' },
  jpg: { takumi: 'jpeg', extension: '.jpg' },
  webp: { takumi: 'webp', extension: '.webp' }
};

// Same bounds the origin puts on an emoji fetch.
const EMOJI_FETCH_MAX_BYTES = 1024 * 1024;
const EMOJI_FETCH_TIMEOUT_MS = 5_000;

/** Twemoji is the only host a render may reach, exactly as at the origin. */
function allowRenderUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === ALLOWED_FETCH_HOST;
  } catch {
    return false;
  }
}

/**
 * `aura og preview <file.html>` — renders the template locally with the same
 * `takumi-js` build the origin uses, so the file in the repo is real before it
 * is ever pushed (ADR 0032).
 *
 * Push is the validation gate, not this: preview does not run the compiler, so
 * a stray `class` or an absolute URL still renders here and is caught on push.
 * The one thing it does refuse is a variable with no value, because that is the
 * failure a blank card hides.
 */
export async function cmdOgPreview(file: string, options: OgPreviewOptions): Promise<void> {
  loadProjectEnv();

  // Context and plan are resolved in separate blocks, the same split `og push`
  // makes: a malformed AURA_CDN_URL leaves resolveOgContext as a plain Error
  // from parseCliEnv, and reporting that under `Could not read <file>` would
  // send the developer to a file that is perfectly fine.
  let ctx: OgContext;
  try {
    ctx = resolveOgContext(options.project);
  } catch (e) {
    console.error(e instanceof OgConfigError ? e.message : message(e));
    process.exit(1);
    return;
  }

  let plan: RenderPlan;
  try {
    plan = buildPlan(ctx, file, options);
  } catch (e) {
    // The flag parsers and the slot grammar throw OgConfigError and already name
    // their own offender; the only other thing that fails here is reading the
    // template file.
    console.error(e instanceof OgConfigError ? e.message : `Could not read ${file}: ${message(e)}`);
    process.exit(1);
    return;
  }

  const spinner = p.spinner();
  spinner.start(`Rendering ${plan.width}x${plan.height}…`);

  let bytes: Uint8Array;
  try {
    bytes = await renderLocally(plan);
  } catch (e) {
    spinner.stop("Couldn't render the template.");
    console.error(message(e));
    process.exit(1);
    return;
  }

  try {
    writeFileSync(plan.out, bytes);
  } catch (e) {
    // The render succeeded and the spinner is still running: without this the
    // ENOENT from a typo'd --out directory surfaces as a live spinner plus an
    // unhandled-rejection stack.
    spinner.stop("Couldn't write the image.");
    console.error(`Could not write ${plan.out}: ${message(e)}`);
    process.exit(1);
    return;
  }
  spinner.stop(`Wrote ${plan.out} (${plan.width}x${plan.height}).`);
}

interface RenderPlan {
  html: string;
  width: number;
  height: number;
  quality: number;
  fonts: string[];
  format: OutputFormat;
  out: string;
  /** Public CDN URLs to fetch, keyed by the `src` string that will be in the markup. */
  imageUrls: Map<string, string>;
}

function buildPlan(ctx: OgContext, file: string, options: OgPreviewOptions): RenderPlan {
  const chosen = options.format ?? 'png';
  if (!Object.hasOwn(FORMATS, chosen)) {
    throw new OgConfigError(`--format must be png, jpg, or webp, got '${chosen}'`);
  }
  const format = FORMATS[chosen]!;

  const canvas = parseCanvas(options);
  const fonts = parseFonts(options);
  const defaults = parseDefaults(options.default, '--default');
  const supplied = parseDefaults(options.var, '--var');

  const raw = readFileSync(file, 'utf8');
  const shape = readTemplateShape(raw);
  const values = resolveValues(shape, supplied, defaults);
  const html = substituteVariables(raw, values);

  // A slot value is HTML-escaped on its way into the markup, and `fromHtml` does
  // not decode entities in attribute values — so the sources map has to be keyed
  // by the escaped string, exactly as at the origin. Static paths are never
  // substituted and keep their raw key.
  const imageUrls = new Map<string, string>();
  for (const slot of shape.slots) {
    const substituted = substituteVariables(`{{${slot}}}`, values);
    imageUrls.set(substituted, slotServeUrl(ctx.cdnUrl, ctx.projectName, values[slot]!));
  }
  for (const path of staticImagePaths(raw)) {
    imageUrls.set(path, slotServeUrl(ctx.cdnUrl, ctx.projectName, path));
  }

  return {
    html,
    width: canvas.width,
    height: canvas.height,
    // The origin owns 80 as the wire default; a local render has no origin to
    // ask, so it repeats the number rather than sending nothing.
    quality: canvas.quality ?? 80,
    fonts,
    format: format.takumi,
    out: options.out ?? `og-preview${format.extension}`,
    imageUrls
  };
}

/**
 * Takumi tags `quality` onto the format it applies to, so PNG has no such
 * field. Naming the format one literal at a time is what picks the matching
 * member; a variable of the union type matches none of them.
 */
function outputOptions(
  format: OutputFormat,
  quality: number
): { format: 'png' } | { format: 'jpeg'; quality: number } | { format: 'webp'; quality: number } {
  switch (format) {
    case 'png':
      return { format };
    case 'jpeg':
      return { format, quality };
    case 'webp':
      return { format, quality };
  }
}

async function renderLocally(plan: RenderPlan): Promise<Uint8Array> {
  // Dynamic so `aura login`, `aura upload`, and the other og verbs never load
  // the native rendering binding.
  const { render } = await import('takumi-js');
  const { googleFonts } = await import('takumi-js/helpers');
  const { fromHtml } = await import('takumi-js/helpers/html');

  const sources = await Promise.all(
    [...plan.imageUrls].map(async ([src, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`image '${url}' returned ${res.status} — is it uploaded, and public?`);
      return { src, data: new Uint8Array(await res.arrayBuffer()) };
    })
  );

  const fonts = plan.fonts.length > 0 ? await loadFonts(plan.fonts, googleFonts) : undefined;
  const { node, css } = fromHtml(plan.html);
  const out = await render(node, {
    width: plan.width,
    height: plan.height,
    css,
    ...outputOptions(plan.format, plan.quality),
    fonts,
    images: {
      sources,
      allowUrl: allowRenderUrl,
      maxBytes: EMOJI_FETCH_MAX_BYTES,
      timeout: EMOJI_FETCH_TIMEOUT_MS
    }
  });
  return new Uint8Array(out);
}

type GoogleFonts = typeof GoogleFontsFn;
type FontSubsets = Awaited<ReturnType<GoogleFonts>>;

/** Takumi throws `HTTP <status> <statusText> fetching <url>` on a non-OK response. */
const HTTP_400_RE = /^HTTP 400\b/;

/**
 * Mirrors the origin's `probeWeights` (apps/cdn-origin/src/og/template.ts):
 * prefer regular plus bold, fall back to whatever single weight the family
 * ships.
 *
 * Only a 400 is a verdict about the family — Google answers it for an unknown
 * family or for a weight the family does not ship. A timeout, a DNS failure, or
 * an exhausted 5xx retry is our outage, and downgrading there would hand back a
 * preview with no bold that the pushed template renders bold.
 */
async function loadFamily(name: string, googleFonts: GoogleFonts): Promise<FontSubsets> {
  for (const weight of [[400, 700], [400]]) {
    try {
      const loaded = await googleFonts({ families: [{ name, weight }] } as Parameters<GoogleFonts>[0]);
      if (loaded.length > 0) return loaded;
    } catch (e) {
      const detail = message(e);
      if (!HTTP_400_RE.test(detail)) {
        throw new Error(`font family '${name}' could not be verified with Google Fonts: ${detail}`);
      }
    }
  }
  throw new Error(`font family '${name}' was not found on Google Fonts`);
}

/**
 * One probe per family, as the origin does. A single call carrying every family
 * shares one weight list, so one family lacking 700 would drop bold for all of
 * them and the failure would name families that are perfectly fine.
 */
async function loadFonts(families: string[], googleFonts: GoogleFonts): Promise<FontSubsets> {
  const loaded: FontSubsets = [];
  for (const name of families) loaded.push(...(await loadFamily(name, googleFonts)));
  return loaded;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

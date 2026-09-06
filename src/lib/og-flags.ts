import { OgConfigError } from './og-env.js';

/**
 * Template metadata lives in flags, never in the HTML file (ADR 0032): the file
 * is a design, and the canvas, fonts, defaults, and quality are properties of
 * the push. Ranges mirror the origin's compiler so a typo fails on this machine
 * instead of after a round trip.
 */

const MIN_DIMENSION = 100;
const MAX_DIMENSION = 4096;
const MAX_FONTS = 4;
const VARIABLE_NAME_RE = /^[a-z][a-z0-9_]*$/;

export interface OgCanvasFlags {
  width?: string;
  height?: string;
  quality?: string;
  font: string[];
  default: string[];
}

/** Commander's repeatable-option collector. */
export function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function integer(raw: string, flag: string, min: number, max: number): number {
  const n = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new OgConfigError(`${flag} must be an integer between ${min} and ${max}, got '${raw}'`);
  }
  return n;
}

export function parseCanvas(flags: OgCanvasFlags): { width: number; height: number; quality?: number } {
  const width = flags.width === undefined ? 1200 : integer(flags.width, '--width', MIN_DIMENSION, MAX_DIMENSION);
  const height = flags.height === undefined ? 630 : integer(flags.height, '--height', MIN_DIMENSION, MAX_DIMENSION);
  // Omitted rather than defaulted to 80: the origin owns that default, and
  // sending nothing keeps one source of truth for it.
  const quality = flags.quality === undefined ? undefined : integer(flags.quality, '--quality', 1, 100);
  return quality === undefined ? { width, height } : { width, height, quality };
}

export function parseFonts(flags: OgCanvasFlags): string[] {
  if (flags.font.length > MAX_FONTS) {
    throw new OgConfigError(`at most ${MAX_FONTS} --font families (a template may declare ${MAX_FONTS})`);
  }
  return flags.font;
}

export function parseDefaults(pairs: string[], flagName: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new OgConfigError(`${flagName} '${pair}' must be written key=value`);
    const key = pair.slice(0, eq);
    // Split on the FIRST '=' only: a slot default is itself a serve path full of
    // them, e.g. `cover=w=1200,fit=cover/blog/hero`.
    const value = pair.slice(eq + 1);
    if (!VARIABLE_NAME_RE.test(key)) {
      throw new OgConfigError(`${flagName} variable name '${key}' must match [a-z][a-z0-9_]*`);
    }
    if (Object.hasOwn(out, key)) throw new OgConfigError(`${flagName} '${key}' was given twice`);
    out[key] = value;
  }
  return out;
}

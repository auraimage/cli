import { type OgPushBody, type OgTemplateSummary, pushTemplate } from '../lib/og-client.js';
import { OgConfigError, type OgContext, loadProjectEnv, resolveOgContext } from '../lib/og-env.js';
import { type OgCanvasFlags, parseCanvas, parseDefaults, parseFonts } from '../lib/og-flags.js';
import { sampleValues, withQuery } from '../lib/og-sample.js';
import * as p from '@clack/prompts';
import { readFileSync } from 'node:fs';

export interface OgPushOptions extends OgCanvasFlags {
  project?: string;
  json?: boolean;
}

/**
 * `aura og push <name> <file.html>` — idempotent upload of one OG template
 * (ADR 0032). The repo file is the source of truth; every push replaces the
 * stored template and refreshes every Render URL within about a minute.
 */
export async function cmdOgPush(name: string, file: string, options: OgPushOptions): Promise<void> {
  const jsonMode = options.json === true;

  loadProjectEnv();

  // Context and body are resolved in separate blocks so each failure is named
  // for what actually broke: a malformed AURA_CDN_URL leaves resolveOgContext as
  // a plain Error from parseCliEnv, and reporting that under `Could not read
  // <file>` would send the developer to a file that is perfectly fine.
  let ctx: OgContext;
  try {
    ctx = resolveOgContext(options.project);
  } catch (e) {
    console.error(e instanceof OgConfigError ? e.message : message(e));
    process.exit(1);
    return;
  }

  let body: OgPushBody;
  try {
    body = {
      html: readFileSync(file, 'utf8'),
      ...parseCanvas(options),
      fonts: parseFonts(options),
      defaults: parseDefaults(options.default, '--default')
    };
  } catch (e) {
    // The flag parsers throw OgConfigError and already name their own flag; the
    // only other thing that fails here is reading the template file.
    console.error(e instanceof OgConfigError ? e.message : `Could not read ${file}: ${message(e)}`);
    process.exit(1);
    return;
  }

  const spinner = jsonMode ? null : p.spinner();
  if (spinner) spinner.start(`Pushing \`${name}\` to \`${ctx.projectName}\`…`);

  let result: OgTemplateSummary & { created: boolean };
  try {
    result = await pushTemplate(ctx, name, body);
  } catch (e) {
    if (spinner) spinner.stop(`\`${name}\` was rejected.`);
    // The origin's message names the offender — a class token, a variable in a
    // style position, a font family. Print it verbatim; anything we add is noise.
    console.error(message(e));
    process.exit(1);
    return;
  }

  const { values, missingSlots } = sampleValues(result);
  const exampleUrl = withQuery(result.url, values);

  if (jsonMode) {
    if (spinner) spinner.stop('');
    console.log(JSON.stringify({ ...result, exampleUrl }, null, 2));
    return;
  }

  if (spinner) spinner.stop(`${result.created ? 'Created' : 'Updated'} \`${name}\`.`);
  console.log(`  Render URL  ${result.url}`);
  console.log(`  Example     ${exampleUrl}`);
  console.log(`  ${result.width}x${result.height} · quality ${result.quality} · ${fontLabel(result.fonts)}`);
  console.log(`  Variables   ${variableLabel(result.variables)}`);
  for (const slot of missingSlots) {
    console.log(
      `  Note        '${slot}' is an image slot with no default. Pass one in the URL, ` +
        `or push again with --default ${slot}=w=1200/blog/hero`
    );
  }
  p.outro('Point og:image at the Render URL.');
}

function fontLabel(fonts: string[]): string {
  return fonts.length === 0 ? 'built-in font' : `fonts: ${fonts.join(', ')}`;
}

function variableLabel(variables: Record<string, 'text' | 'image'>): string {
  const names = Object.keys(variables).sort();
  if (names.length === 0) return 'none';
  return names.map((n) => `${n} (${variables[n]})`).join(', ');
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

import { type OgTemplateSummary, listTemplates } from '../lib/og-client.js';
import { OgConfigError, type OgContext, loadProjectEnv, resolveOgContext } from '../lib/og-env.js';
import * as p from '@clack/prompts';

export interface OgListOptions {
  project?: string;
  json?: boolean;
}

/** `aura og list` — every OG template in the project, with its Render URL. */
export async function cmdOgList(options: OgListOptions): Promise<void> {
  const jsonMode = options.json === true;
  loadProjectEnv();

  let ctx: OgContext;
  try {
    ctx = resolveOgContext(options.project);
  } catch (e) {
    // A malformed AURA_CDN_URL surfaces here as a plain Error from parseCliEnv,
    // so anything that is not an OgConfigError is still printed as a message.
    console.error(e instanceof OgConfigError ? e.message : message(e));
    process.exit(1);
    return;
  }

  const spinner = jsonMode ? null : p.spinner();
  if (spinner) spinner.start(`Listing templates in \`${ctx.projectName}\`…`);

  let templates: OgTemplateSummary[];
  try {
    templates = await listTemplates(ctx);
  } catch (e) {
    if (spinner) spinner.stop("Couldn't list templates.");
    // A network failure rejects with a raw TypeError rather than an
    // OgRequestError, so this prints whatever came back rather than a stack.
    console.error(message(e));
    process.exit(1);
    return;
  }

  if (jsonMode) {
    if (spinner) spinner.stop('');
    console.log(JSON.stringify({ templates }, null, 2));
    return;
  }

  if (spinner) {
    spinner.stop(templates.length === 1 ? 'Found 1 template.' : `Found ${templates.length} templates.`);
  }

  if (templates.length === 0) {
    p.log.info('No OG templates yet. Push one with `aura og push <name> ./og/<name>.html`.');
    return;
  }

  for (const t of [...templates].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const vars = Object.keys(t.variables)
      .sort()
      .map((n) => `${n} (${t.variables[n]})`)
      .join(', ');
    console.log(`  ${t.name}`);
    console.log(`    ${t.width}x${t.height} · quality ${t.quality} · version ${t.version.slice(0, 8)}`);
    console.log(`    variables: ${vars || 'none'}`);
    console.log(`    ${t.url}`);
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

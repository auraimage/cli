import { deleteTemplate } from '../lib/og-client.js';
import { OgConfigError, type OgContext, loadProjectEnv, resolveOgContext } from '../lib/og-env.js';
import * as p from '@clack/prompts';

export interface OgRmOptions {
  project?: string;
  json?: boolean;
  yes?: boolean;
}

/**
 * `aura og rm <name>` — removes a stored template. Every Render URL built from
 * it starts returning 404 within about a minute, so the removal is confirmed
 * unless --yes says otherwise. --json has no TTY for a prompt and requires it.
 */
export async function cmdOgRm(name: string, options: OgRmOptions): Promise<void> {
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

  if (options.yes !== true) {
    if (jsonMode) {
      console.error('Pass --yes to remove a template with --json (there is no prompt in JSON mode).');
      process.exit(1);
      return;
    }
    const ok = await p.confirm({
      message: `Remove \`${name}\` from \`${ctx.projectName}\`? Every Render URL for it will 404.`,
      initialValue: false
    });
    if (p.isCancel(ok) || !ok) {
      p.cancel('Left it alone.');
      return;
    }
  }

  try {
    await deleteTemplate(ctx, name);
  } catch (e) {
    // A network failure rejects with a raw TypeError rather than an
    // OgRequestError, so this prints whatever came back rather than a stack.
    console.error(message(e));
    process.exit(1);
    return;
  }

  if (jsonMode) console.log(JSON.stringify({ name, removed: true }));
  else p.log.success(`Removed \`${name}\`.`);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

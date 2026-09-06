#!/usr/bin/env node
import { cmdInit } from './commands/init.js';
import { cmdLogin } from './commands/login.js';
import { cmdLogout } from './commands/logout.js';
import { cmdOgList } from './commands/og-list.js';
import { cmdOgPreview } from './commands/og-preview.js';
import { cmdOgPush } from './commands/og-push.js';
import { cmdOgRm } from './commands/og-rm.js';
import { cmdUpload } from './commands/upload.js';
import { readCredentials } from './lib/credentials.js';
import { collect } from './lib/og-flags.js';
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Re-exec with the portless CA trusted when running against the local dev stack.
// NODE_EXTRA_CA_CERTS must be set before Node starts — setting it in code is too late.
if (!process.env.NODE_EXTRA_CA_CERTS) {
  const needsLocal =
    process.argv.includes('--local') ||
    (() => {
      try {
        return readCredentials()?.local === true;
      } catch {
        return false;
      }
    })();

  if (needsLocal) {
    const candidates = ['/tmp/portless/ca.pem', join(homedir(), '.portless', 'ca.pem')];
    const caPath = candidates.find(existsSync);
    if (caPath) {
      const result = spawnSync(process.execPath, process.argv.slice(1), {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: caPath },
        stdio: 'inherit'
      });
      process.exit(result.status ?? 1);
    }
  }
}

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command().name('aura').description('AuraImage CLI').version(version);

program
  .command('init')
  .description('Pick a project and print the env vars to add')
  .option('--project <name>', 'Project to wire up (prompts if omitted)')
  .option('--name <name>', 'Name for the new Secret Key (defaults to cli-<hostname>)')
  .action((options: { name?: string; project?: string }) => cmdInit({ name: options.name, project: options.project }));

program
  .command('login')
  .description('Sign in via your browser')
  .option('--no-browser', 'Skip auto-opening the browser; print the URL only')
  .option('--force', 'Replace any existing CLI session without asking')
  .option('--local', 'Sign in against the local dev stack (auraimage.localhost)')
  .action((options: { browser: boolean; force?: boolean; local?: boolean }) =>
    cmdLogin({ noBrowser: !options.browser, force: options.force, local: options.local })
  );

program.command('logout').description('Sign out and revoke this CLI session').action(cmdLogout);

program
  .command('upload <path>')
  .description(
    'Upload an image or every image under a directory (recurses, skipping dot-dirs and node_modules/dist/build)'
  )
  .option('--project-name <projectName>', 'Project to upload into (prompts if omitted)')
  .option('--json', 'Emit newline-delimited JSON to stdout (one object per file)')
  .action(cmdUpload);

const og = program.command('og').description('Manage this project’s OG templates (social preview images)');

og.command('push <name> <file>')
  .description('Push an OG template from an HTML file (idempotent)')
  .option('--width <px>', 'Canvas width in pixels', '1200')
  .option('--height <px>', 'Canvas height in pixels', '630')
  .option('--font <family>', 'Google Font family to load (repeatable, max 4)', collect, [])
  .option('--default <key=value>', 'Default value for a variable (repeatable)', collect, [])
  .option('--quality <n>', 'Output quality 1-100 for JPEG and WebP (default 80)')
  .option('--project <name>', 'Project to push into (defaults to AURA_PROJECT)')
  .option('--json', 'Print the template summary as JSON')
  .action(cmdOgPush);

og.command('preview <file>')
  .description('Render an OG template locally to an image file, without pushing it')
  .option('--var <key=value>', 'Value for a template variable (repeatable)', collect, [])
  .option('--out <path>', 'Where to write the image (default og-preview.<ext>)')
  .option('--format <fmt>', 'png, jpg, or webp', 'png')
  .option('--width <px>', 'Canvas width in pixels', '1200')
  .option('--height <px>', 'Canvas height in pixels', '630')
  .option('--font <family>', 'Google Font family to load (repeatable, max 4)', collect, [])
  .option('--default <key=value>', 'Default value for a variable (repeatable)', collect, [])
  .option('--quality <n>', 'Output quality 1-100 for JPEG and WebP (default 80)')
  .option('--project <name>', 'Project whose images the slots resolve against (defaults to AURA_PROJECT)')
  .action(cmdOgPreview);

og.command('list')
  .description('List the OG templates in this project')
  .option('--project <name>', 'Project to list (defaults to AURA_PROJECT)')
  .option('--json', 'Print the templates as JSON')
  .action(cmdOgList);

og.command('rm <name>')
  .description('Remove an OG template')
  .option('--project <name>', 'Project to remove from (defaults to AURA_PROJECT)')
  .option('--yes', 'Skip the confirmation prompt')
  .option('--json', 'Print the result as JSON')
  .action(cmdOgRm);

program.parse();

#!/usr/bin/env node
import { cmdInit } from './commands/init.js';
import { cmdLogin } from './commands/login.js';
import { cmdLogout } from './commands/logout.js';
import { cmdUpload } from './commands/upload.js';
import { readCredentials } from './lib/credentials.js';
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
  .description('Pick or create an AuraImage project and print the env vars to add')
  .option('--name <name>', 'Name for the new Secret Key (defaults to cli-<hostname>)')
  .action((options: { name?: string }) => cmdInit({ name: options.name }));

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

program.parse();

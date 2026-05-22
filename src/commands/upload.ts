import { listProjects } from '../lib/api.js';
import { readCredentials } from '../lib/credentials.js';
import { endpointsForCredentials } from '../lib/endpoints.js';
import * as p from '@clack/prompts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.tiff', '.heic']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build']);

interface UploadOptions {
  projectName?: string;
  json?: boolean;
}

interface UploadResponseBody {
  url: string;
  key: string;
  blurhash: string;
  width: number;
  height: number;
  format: string;
  masterFormat: string;
  size: number;
  visibility: string;
}

interface FileEntry {
  fullPath: string;
  /** Path relative to the upload root (used as the uploaded filename). */
  name: string;
}

export async function cmdUpload(path: string, options: UploadOptions) {
  const jsonMode = options.json === true;
  const logErr = console.error;

  const creds = readCredentials();
  if (!creds) {
    logErr('Not signed in yet — run `aura login` first.');
    process.exit(1);
  }

  const { apiUrl, cdnUrl } = endpointsForCredentials(creds);

  let entries: FileEntry[];
  try {
    entries = collectImageFiles(path);
  } catch (e) {
    logErr(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  if (entries.length === 0) {
    if (jsonMode) process.stderr.write('No image files found.\n');
    else p.log.info('No image files in there — nothing to upload.');
    return;
  }

  const projectName = options.projectName ?? (jsonMode ? null : await pickProjectInteractive(apiUrl, creds.token));
  if (!projectName) {
    logErr('Missing --project-name. Pass it explicitly when using --json.');
    process.exit(1);
  }

  if (!jsonMode) {
    p.intro(`Uploading to \`${projectName}\``);
  } else {
    process.stderr.write(`Uploading ${entries.length} image(s) to project "${projectName}"\n`);
  }

  const signRes = await fetch(`${apiUrl}/v1/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.token}`
    },
    body: JSON.stringify({ projectName })
  });

  if (!signRes.ok) {
    const err = (await signRes.json().catch(() => ({}))) as { message?: string };
    logErr(err.message ?? `Couldn't get an upload token (${signRes.status}).`);
    process.exit(1);
  }

  const { signature } = (await signRes.json()) as { signature: string };

  const spinner = jsonMode ? null : p.spinner();
  if (spinner) spinner.start(`Uploading 0 of ${entries.length}…`);

  let succeeded = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (spinner) spinner.message(`Uploading ${i + 1} of ${entries.length} — ${entry.name}…`);

    const formData = new FormData();
    formData.append('file', new Blob([readFileSync(entry.fullPath)]), entry.name);
    formData.append('filename', entry.name);

    const res = await fetch(`${cdnUrl}/v1/upload`, {
      method: 'POST',
      headers: { 'X-Aura-Signature': signature },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (spinner) spinner.stop(`Failed on \`${entry.name}\`.`);
      logErr(errText || `Upload failed for ${entry.name} (${res.status}).`);
      process.exit(1);
    }

    const body = (await res.json()) as UploadResponseBody;
    succeeded++;

    if (jsonMode) {
      process.stdout.write(JSON.stringify({ filename: entry.name, ...body }) + '\n');
    } else {
      console.log(`  ✓ ${body.url}`);
    }
  }

  if (spinner) spinner.stop(`Uploaded ${succeeded} image${succeeded === 1 ? '' : 's'}.`);
  if (!jsonMode) p.outro('Done — your images are live.');
  else process.stderr.write('Done.\n');
}

function collectImageFiles(path: string): FileEntry[] {
  const stat = statSync(path);
  if (stat.isFile()) {
    if (!IMAGE_EXTS.has(extname(path).toLowerCase())) {
      throw new Error(`\`${path}\` isn't a supported image type.`);
    }
    return [{ fullPath: path, name: basename(path) }];
  }

  const entries: FileEntry[] = [];
  walkInto(path, path, entries);
  return entries;
}

function walkInto(root: string, current: string, out: FileEntry[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkInto(root, fullPath, out);
    } else if (entry.isFile() && IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      out.push({ fullPath, name: relative(root, fullPath) });
    }
  }
}

async function pickProjectInteractive(apiUrl: string, token: string): Promise<string> {
  const spinner = p.spinner();
  spinner.start('Looking up your projects…');
  let projects;
  try {
    projects = await listProjects(apiUrl, token);
    spinner.stop(projects.length === 1 ? 'Found 1 project.' : `Found ${projects.length} projects.`);
  } catch (e) {
    spinner.stop("Couldn't reach the AuraImage API.");
    p.cancel(e instanceof Error ? e.message : 'Network error.');
    process.exit(1);
  }

  if (projects.length === 0) {
    p.cancel("You don't have any projects yet — run `aura init` to create one.");
    process.exit(1);
  }

  const choice = await p.select({
    message: 'Which project should these go to?',
    options: projects.map((pr) => ({ value: pr.projectName, label: pr.projectName }))
  });
  if (p.isCancel(choice)) {
    p.cancel('No worries — come back when you are.');
    process.exit(0);
  }
  return choice;
}

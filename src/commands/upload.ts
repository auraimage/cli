import { readCredentials } from '../lib/credentials.js';
import { endpointsForCredentials } from '../lib/endpoints.js';
import * as p from '@clack/prompts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.tiff', '.heic']);

interface UploadOptions {
  projectName: string;
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
  name: string;
}

export async function cmdUpload(path: string, options: UploadOptions) {
  const jsonMode = options.json === true;
  const log = jsonMode ? (msg: string) => process.stderr.write(msg + '\n') : console.log;
  const logErr = console.error;

  const creds = readCredentials();
  if (!creds) {
    logErr('Error: not logged in. Run `aura login` first.');
    process.exit(1);
  }

  const { apiUrl: AUTH_API_URL, cdnUrl: IMAGE_WORKER_URL } = endpointsForCredentials(creds);

  let entries: FileEntry[];

  const stat = statSync(path);
  if (stat.isFile()) {
    if (!IMAGE_EXTS.has(extname(path).toLowerCase())) {
      logErr(`Error: ${path} is not a supported image type.`);
      process.exit(1);
    }
    entries = [{ fullPath: path, name: basename(path) }];
  } else {
    entries = readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isFile() && IMAGE_EXTS.has(extname(e.name).toLowerCase()))
      .map((e) => ({ fullPath: join(path, e.name), name: e.name }));
  }

  if (entries.length === 0) {
    log('No image files found.');
    return;
  }

  const spinner = p.spinner();
  if (!jsonMode) spinner.start(`Uploading ${entries.length} image(s) to project "${options.projectName}"…`);
  else process.stderr.write(`Uploading ${entries.length} image(s) to project "${options.projectName}"…\n`);

  const signRes = await fetch(`${AUTH_API_URL}/v1/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.token}`
    },
    body: JSON.stringify({ projectName: options.projectName })
  });

  if (!signRes.ok) {
    if (!jsonMode) spinner.stop('Failed to get upload token');
    const err = (await signRes.json()) as { message?: string };
    logErr(err.message ?? 'Sign request failed');
    process.exit(1);
  }

  const { signature } = (await signRes.json()) as { signature: string };

  for (const entry of entries) {
    const formData = new FormData();
    formData.append('file', new Blob([readFileSync(entry.fullPath)]), entry.name);
    formData.append('filename', entry.name);

    const res = await fetch(`${IMAGE_WORKER_URL}/v1/upload`, {
      method: 'POST',
      headers: { 'X-Aura-Signature': signature },
      body: formData
    });

    if (!res.ok) {
      if (!jsonMode) spinner.stop(`Failed on ${entry.name}`);
      logErr(await res.text());
      process.exit(1);
    }

    const body = (await res.json()) as UploadResponseBody;

    if (jsonMode) {
      process.stdout.write(JSON.stringify({ filename: entry.name, ...body }) + '\n');
    } else {
      console.log(`  ✓ ${body.url}`);
    }
  }

  if (!jsonMode) spinner.stop('Done.');
  else process.stderr.write('Done.\n');
}

import { basename } from 'node:path';

const RESERVED = new Set(['api', 'admin', 'test', 'static', 'registry', 'cdn', 'health', 'v1']);
const PROJECT_NAME_RE = /^[a-z0-9-]+$/;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function validateProjectName(name: string): string | undefined {
  if (!name) return 'Looks like it slipped in empty — give your project a name.';
  if (!PROJECT_NAME_RE.test(name))
    return 'Project names use lowercase letters, numbers, and hyphens only — try `my-app`.';
  if (RESERVED.has(name)) return `\`${name}\` is reserved — try something else.`;
  if (name.length < 2) return 'A bit too short — give it at least 2 characters.';
  if (name.length > 40) return 'A bit too long — keep it under 40 characters.';
  return undefined;
}

export function suggestedProjectName(cwd: string = process.cwd()): string {
  const candidate = slugify(basename(cwd));
  return validateProjectName(candidate) ? 'my-app' : candidate;
}

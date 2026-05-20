import { type Project, createProject, listProjects } from '../lib/api.js';
import { readCredentials } from '../lib/credentials.js';
import { endpointsForCredentials } from '../lib/endpoints.js';
import { suggestedProjectName, validateProjectName } from '../lib/project-name.js';
import { cmdLogin } from './login.js';
import * as p from '@clack/prompts';
import os from 'node:os';

const CREATE_NEW = '__create_new__';

export async function cmdInit(options: { name?: string } = {}) {
  p.intro('Welcome to AuraImage');

  if (!readCredentials()) {
    p.log.info("Let's get you signed in first.");
    await cmdLogin();
    if (!readCredentials()) {
      p.cancel("Sign-in was cancelled — pick this back up with `aura init` whenever you're ready.");
      process.exit(1);
    }
  }

  const creds = readCredentials();
  if (!creds) {
    p.cancel('Something went sideways while reading your credentials — try `aura login` again.');
    process.exit(1);
  }

  const { apiUrl } = endpointsForCredentials(creds);

  let projects: Project[];
  const fetching = p.spinner();
  fetching.start('Looking up your projects…');
  try {
    projects = await listProjects(apiUrl, creds.token);
    fetching.stop(projects.length === 1 ? 'Found 1 project.' : `Found ${projects.length} projects.`);
  } catch (e) {
    fetching.stop("Couldn't reach the AuraImage API.");
    p.cancel(e instanceof Error ? e.message : 'Network error while listing projects.');
    process.exit(1);
  }

  let projectName: string;
  if (projects.length === 0) {
    p.log.info("You don't have any projects yet — let's spin up your first one.");
    projectName = await promptCreateProject(apiUrl, creds.token);
  } else {
    const choice = await p.select({
      message: 'Which project are we wiring up today?',
      options: [
        ...projects.map((pr) => ({ value: pr.projectName, label: pr.projectName })),
        { value: CREATE_NEW, label: '+ Create new project' }
      ]
    });
    if (p.isCancel(choice)) {
      p.cancel('No worries — come back when you are.');
      process.exit(0);
    }
    projectName = choice === CREATE_NEW ? await promptCreateProject(apiUrl, creds.token) : choice;
  }

  const keyName = options.name ?? `cli-${os.hostname()}`;
  const keying = p.spinner();
  keying.start('Creating a fresh Secret Key…');
  const res = await fetch(`${apiUrl}/v1/me/secret-keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: keyName })
  });
  if (!res.ok) {
    keying.stop("Couldn't create a Secret Key.");
    let msg: string;
    if (res.status === 409) {
      msg = 'Max active keys reached. Revoke one in the dashboard (Settings → Secret Keys).';
    } else {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      msg = body.message ?? `API error (${res.status}).`;
    }
    p.cancel(msg);
    process.exit(1);
  }
  const { secret } = (await res.json()) as { secret: string };
  keying.stop('Created.');

  const envBlock = [`AURA_SECRET_KEY=${secret}`, `NEXT_PUBLIC_AURA_PROJECT_NAME=${projectName}`].join('\n');

  p.note(envBlock, 'Drop these into your env file (.env.local, .env, or wherever you keep secrets)');
  p.log.info('Keep `AURA_SECRET_KEY` server-side only — it signs upload tokens for your project.');
  p.outro("You're all set — happy uploading!");
}

async function promptCreateProject(apiUrl: string, token: string): Promise<string> {
  const placeholder = suggestedProjectName();
  const name = await p.text({
    message: "What's the new project called?",
    placeholder,
    validate: (v) => validateProjectName(v ?? '')
  });
  if (p.isCancel(name)) {
    p.cancel('No worries — come back when you are.');
    process.exit(0);
  }

  const creating = p.spinner();
  creating.start(`Creating \`${name}\`…`);
  try {
    const project = await createProject(apiUrl, token, name);
    creating.stop(`Created \`${project.projectName}\`.`);
    return project.projectName;
  } catch (e) {
    creating.stop("Couldn't create the project.");
    p.cancel(e instanceof Error ? e.message : 'API error.');
    process.exit(1);
  }
}

import { clearCredentials, readCredentials } from '../lib/credentials.js';
import { endpointsForCredentials } from '../lib/endpoints.js';
import * as p from '@clack/prompts';

export async function cmdLogout() {
  const creds = readCredentials();
  if (!creds) {
    p.outro("You weren't signed in — nothing to do.");
    return;
  }

  const { apiUrl } = endpointsForCredentials(creds);

  try {
    const res = await fetch(`${apiUrl}/v1/auth/cli-tokens/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    if (!res.ok && res.status !== 401) {
      p.log.warn(`Server-side revoke didn't take (${res.status}) — wiping local credentials anyway.`);
    }
  } catch {
    p.log.warn("Couldn't reach the API — wiping local credentials anyway.");
  }

  clearCredentials();
  p.outro('Signed out. See you next time.');
}

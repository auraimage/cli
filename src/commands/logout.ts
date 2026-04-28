import { clearCredentials, readCredentials } from '../lib/credentials.js';
import { endpointsForCredentials } from '../lib/endpoints.js';
import * as p from '@clack/prompts';

export async function cmdLogout() {
  const creds = readCredentials();
  if (!creds) {
    p.outro('Not signed in.');
    return;
  }

  const { apiUrl } = endpointsForCredentials(creds);

  try {
    const res = await fetch(`${apiUrl}/v1/auth/cli-tokens/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    // 204 = revoked. 401 = already revoked or unknown token; either way the local
    // credentials are stale, so we still wipe them.
    if (!res.ok && res.status !== 401) {
      p.log.warn(`Server-side revoke failed (${res.status}). Removing local credentials anyway.`);
    }
  } catch {
    p.log.warn('Could not reach the API. Removing local credentials anyway.');
  }

  clearCredentials();
  p.outro('Signed out.');
}

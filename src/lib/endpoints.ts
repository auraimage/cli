import type { Credentials } from './credentials.js';
import { parseCliEnv } from './env.js';

const LOCAL_API_URL = 'https://api.auraimage.localhost';
const LOCAL_CDN_URL = 'https://cdn.auraimage.localhost';
const LOCAL_WEB_URL = 'https://app.auraimage.localhost';

export interface Endpoints {
  apiUrl: string;
  cdnUrl: string;
  webUrl: string;
}

export function localEndpoints(): Endpoints {
  return { apiUrl: LOCAL_API_URL, cdnUrl: LOCAL_CDN_URL, webUrl: LOCAL_WEB_URL };
}

export function envEndpoints(): Endpoints {
  const env = parseCliEnv(process.env);
  return { apiUrl: env.AURA_API_URL, cdnUrl: env.AURA_CDN_URL, webUrl: env.AURA_WEB_URL };
}

export function endpointsForCredentials(creds: Credentials | null): Endpoints {
  if (creds?.local) return localEndpoints();
  return envEndpoints();
}

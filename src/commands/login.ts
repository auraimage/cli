import { isHeadless, openBrowser } from '../lib/browser.js';
import { readCredentials, writeCredentials } from '../lib/credentials.js';
import { endpointsForCredentials, envEndpoints, localEndpoints } from '../lib/endpoints.js';
import * as p from '@clack/prompts';
import { hostname } from 'node:os';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenSuccess {
  token: string;
  email: string;
}

interface DeviceTokenError {
  error: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied';
  interval?: number;
}

type DeviceTokenResponse = DeviceTokenSuccess | DeviceTokenError;

interface LoginOptions {
  noBrowser?: boolean;
  force?: boolean;
  local?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function startDeviceFlow(apiUrl: string, name: string): Promise<DeviceCodeResponse> {
  const res = await fetch(`${apiUrl}/v1/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Device-flow request failed (${res.status})`);
  }
  return (await res.json()) as DeviceCodeResponse;
}

async function pollOnce(apiUrl: string, deviceCode: string): Promise<DeviceTokenResponse> {
  const res = await fetch(`${apiUrl}/v1/auth/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode })
  });
  return (await res.json()) as DeviceTokenResponse;
}

async function cancelDeviceCode(apiUrl: string, deviceCode: string): Promise<void> {
  try {
    await fetch(`${apiUrl}/v1/auth/device/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode })
    });
  } catch {
    /* best-effort */
  }
}

async function existingSessionEmail(apiUrl: string, token: string, fallback: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/auth/me/methods`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? fallback;
  } catch {
    return null;
  }
}

export async function cmdLogin(options: LoginOptions = {}) {
  p.intro(options.local ? 'Welcome to AuraImage — signing in (local)' : 'Welcome to AuraImage — signing in');

  const endpoints = options.local ? localEndpoints() : envEndpoints();

  const existing = readCredentials();
  if (existing && !options.force) {
    const sameMode = !!existing.local === !!options.local;
    if (sameMode) {
      const existingEndpoints = endpointsForCredentials(existing);
      const email = await existingSessionEmail(existingEndpoints.apiUrl, existing.token, existing.email);
      if (email) {
        const proceed = await p.confirm({
          message: `You're already signed in as ${email} — replace this CLI session?`,
          initialValue: false
        });
        if (p.isCancel(proceed) || !proceed) {
          p.cancel('No worries — staying signed in.');
          process.exit(0);
        }
      }
    }
  }

  const name = hostname() || 'Unknown device';
  let device: DeviceCodeResponse;
  try {
    device = await startDeviceFlow(endpoints.apiUrl, name);
  } catch (e) {
    p.log.error(e instanceof Error ? e.message : "Couldn't start sign-in — give it another go in a moment.");
    process.exit(1);
  }

  const headless = options.noBrowser || isHeadless();
  if (!headless) {
    p.log.info(`Opening ${device.verification_uri_complete} in your browser…`);
    openBrowser(device.verification_uri_complete);
  }
  p.log.message(
    [
      `If your browser didn't pop open, head to:`,
      `  ${device.verification_uri}`,
      `and punch in this code:`,
      `  ${device.user_code}`
    ].join('\n')
  );

  let interval = device.interval;
  const expiresAt = Date.now() + device.expires_in * 1000;

  // Best-effort cancel on Ctrl-C. Don't block exit on the network call.
  const onSigint = () => {
    void cancelDeviceCode(endpoints.apiUrl, device.device_code);
    p.cancel('Bailing out — sign-in cancelled.');
    process.exit(130);
  };
  process.once('SIGINT', onSigint);

  const spinner = p.spinner();
  spinner.start('Waiting for you to approve this in the browser…');

  try {
    while (Date.now() < expiresAt) {
      await sleep(interval * 1000);
      let result: DeviceTokenResponse;
      try {
        result = await pollOnce(endpoints.apiUrl, device.device_code);
      } catch {
        // Transient network error — keep polling.
        continue;
      }

      if ('token' in result) {
        writeCredentials({
          token: result.token,
          email: result.email,
          ...(options.local ? { local: true } : {})
        });
        spinner.stop(`Signed in as ${result.email}.`);
        p.outro(options.local ? "You're in (local mode). Try `aura init` next." : "You're in. Try `aura init` next.");
        return;
      }

      if (result.error === 'authorization_pending') continue;
      if (result.error === 'slow_down') {
        interval = result.interval ?? interval + 5;
        continue;
      }
      if (result.error === 'access_denied') {
        spinner.stop('Cancelled in the browser.');
        p.outro('No problem — give `aura login` another shot whenever.');
        process.exit(1);
      }
      if (result.error === 'expired_token') {
        spinner.stop('That code expired.');
        p.outro('These codes have a short fuse — run `aura login` again to grab a fresh one.');
        process.exit(1);
      }
    }

    spinner.stop('Timed out waiting.');
    p.outro("Didn't see an approval come through — run `aura login` again when you're ready.");
    process.exit(1);
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

import { spawn } from 'node:child_process';

/**
 * Best-effort browser launcher. Returns true if we successfully spawned the
 * platform's URL-handler process (not a guarantee a tab actually opened).
 */
export function openBrowser(url: string): boolean {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : process.env.WSL_DISTRO_NAME
          ? 'wslview'
          : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      /* swallow — caller falls back to manual instructions */
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function isHeadless(): boolean {
  return Boolean(process.env.CI || process.env.SSH_CONNECTION || !process.stdout.isTTY);
}

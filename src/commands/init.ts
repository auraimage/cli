import { WEB_URL, appendEnvLocal, readConfig, writeConfig } from '../lib/config.js';
import * as p from '@clack/prompts';

export async function cmdInit(options: { rotate?: boolean }) {
  p.intro('AuraImage init');

  if (options.rotate) {
    const existing = readConfig();
    if (!existing) {
      p.cancel('No aura.config.json found. Run `aura init` first.');
      process.exit(1);
    }

    const keys = await p.group(
      {
        publicKey: () =>
          p.text({
            message: 'New Public Key (pk_live_...):',
            validate: (v) => (v?.startsWith('pk_') ? undefined : 'Must start with pk_')
          }),
        secretKey: () =>
          p.password({
            message: 'New Secret Key (sk_live_...):',
            validate: (v) => (v?.startsWith('sk_live_') ? undefined : 'Must start with sk_live_')
          })
      },
      {
        onCancel: () => {
          p.cancel('Cancelled.');
          process.exit(0);
        }
      }
    );

    appendEnvLocal({
      NEXT_PUBLIC_AURA_PUBLIC_KEY: keys.publicKey,
      AURA_SECRET_KEY: keys.secretKey
    });

    writeConfig({ ...existing, publicKey: keys.publicKey });

    p.outro('Keys rotated. .env.local updated. Project name unchanged.');
    return;
  }

  const answers = await p.group(
    {
      projectName: () =>
        p.text({
          message: 'Your project name (e.g. narek):',
          validate: (v) => (v ? undefined : 'Required')
        }),
      publicKey: () =>
        p.text({
          message: 'Public Key (pk_live_...):',
          validate: (v) => (v?.startsWith('pk_') ? undefined : 'Must start with pk_')
        }),
      secretKey: () =>
        p.password({
          message: 'Secret Key (sk_live_...):',
          validate: (v) => (v?.startsWith('sk_live_') ? undefined : 'Must start with sk_live_')
        })
    },
    {
      onCancel: () => {
        p.cancel('Cancelled.');
        process.exit(0);
      }
    }
  );

  const config = {
    projectName: answers.projectName,
    publicKey: answers.publicKey,
    baseUrl: WEB_URL
  };

  writeConfig(config);
  appendEnvLocal({
    NEXT_PUBLIC_AURA_PUBLIC_KEY: answers.publicKey,
    AURA_SECRET_KEY: answers.secretKey,
    NEXT_PUBLIC_AURA_PROJECT_NAME: answers.projectName
  });

  p.outro(
    [
      'Done! Created aura.config.json and wrote secrets to .env.local',
      '',
      'Next steps:',
      '  1. Deploy your workers with:  wrangler secret put MACHINE_SECRET',
      '     MACHINE_SECRET is the M2M bearer secret for admin routes (not your per-user signing key).',
      '  2. Set JWT_SECRET on api worker:  wrangler secret put JWT_SECRET'
    ].join('\n')
  );
}

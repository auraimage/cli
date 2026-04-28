import { z } from 'zod';

const PRODUCTION_API_URL = 'https://api.auraimage.ai';
const PRODUCTION_CDN_URL = 'https://cdn.auraimage.ai';
const PRODUCTION_WEB_URL = 'https://auraimage.ai';

const cliSchema = z.object({
  AURA_API_URL: z.url().default(PRODUCTION_API_URL),
  AURA_CDN_URL: z.url().default(PRODUCTION_CDN_URL),
  AURA_WEB_URL: z.url().default(PRODUCTION_WEB_URL)
});

export type CliEnv = z.infer<typeof cliSchema>;

export function parseCliEnv(source: Record<string, string | undefined>): CliEnv {
  const result = cliSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`[config] CLI env validation failed: ${result.error.message}`);
  }
  return result.data;
}

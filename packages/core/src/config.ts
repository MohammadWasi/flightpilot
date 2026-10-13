import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { config as dotenv } from 'dotenv';
import { z } from 'zod';
export const projectRoot =
  process.env.FLIGHTPILOT_PROJECT_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export function loadConfig() {
  dotenv({ path: resolve(projectRoot, '.env'), quiet: true });
  const env = z
    .object({
      FLIGHTPILOT_MODE: z.enum(['simulation', 'duffel_test']).default('simulation'),
      FLIGHTPILOT_BASE_URL: z.string().url().default('http://127.0.0.1:3000'),
      FLIGHTPILOT_API_TOKEN: z.string().min(32),
      FLIGHTPILOT_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
      DATABASE_URL: z.string().optional(),
      DUFFEL_ACCESS_TOKEN: z.string().optional(),
      DUFFEL_WEBHOOK_SECRET: z.string().optional(),
      FLIGHTPILOT_DATA_DIR: z.string().default(resolve(projectRoot, '.data')),
    })
    .parse(process.env);
  const url = new URL(env.FLIGHTPILOT_BASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.protocol !== 'https:')
    throw new Error('Remote checkout requires HTTPS.');
  if (env.FLIGHTPILOT_MODE === 'duffel_test' && !env.DUFFEL_ACCESS_TOKEN?.startsWith('duffel_test_'))
    throw new Error('Duffel requires a duffel_test_ token. Live tokens are deliberately rejected.');
  return {
    mode: env.FLIGHTPILOT_MODE,
    baseUrl: url.origin,
    apiToken: env.FLIGHTPILOT_API_TOKEN,
    encryptionKey: env.FLIGHTPILOT_ENCRYPTION_KEY,
    databaseUrl: env.DATABASE_URL,
    dataDir: env.FLIGHTPILOT_DATA_DIR,
    duffelToken: env.DUFFEL_ACCESS_TOKEN,
    webhookSecret: env.DUFFEL_WEBHOOK_SECRET,
  };
}
export type Config = ReturnType<typeof loadConfig>;

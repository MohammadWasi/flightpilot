import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { projectRoot, loadConfig } from '../packages/core/src/config';
const envFile = resolve(projectRoot, '.env');
try {
  await access(envFile);
} catch {
  await writeFile(
    envFile,
    `FLIGHTPILOT_MODE=simulation\nFLIGHTPILOT_BASE_URL=http://127.0.0.1:3000\nFLIGHTPILOT_API_TOKEN=${randomBytes(32).toString('hex')}\nFLIGHTPILOT_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`,
    { mode: 0o600, flag: 'wx' },
  );
}
process.env.FLIGHTPILOT_PROJECT_ROOT = projectRoot;
const config = loadConfig();
console.log(
  `FlightPilot: ${config.mode}. Production purchases are disabled.\nOpen ${config.baseUrl}. Sign in using FLIGHTPILOT_API_TOKEN from the ignored .env file.\nIn another terminal run pnpm setup:agents.`,
);
const child = spawn(
  process.execPath,
  [
    resolve(projectRoot, 'apps/web/node_modules/next/dist/bin/next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    new URL(config.baseUrl).port || '3000',
  ],
  { cwd: resolve(projectRoot, 'apps/web'), stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));

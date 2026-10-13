import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { loadConfig, projectRoot } from '../packages/core/src/config';
process.env.FLIGHTPILOT_PROJECT_ROOT = projectRoot;
const config = loadConfig();
const child = spawn(
  process.execPath,
  [
    resolve(projectRoot, 'apps/web/node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    process.env.FLIGHTPILOT_BIND_ADDRESS ?? '127.0.0.1',
    '--port',
    new URL(config.baseUrl).port || '3000',
  ],
  { cwd: resolve(projectRoot, 'apps/web'), stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));

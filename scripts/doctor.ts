import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../packages/core/src/config.js';
import { agentProjectRoot, findExecutable, probeMcp, serverCommand } from './agent-config.js';

export async function doctor(): Promise<boolean> {
  let success = true;
  const report = (ok: boolean, message: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
    if (!ok) success = false;
  };
  report(
    Number(process.versions.node.split('.')[0]) === 24,
    `Node ${process.versions.node}; use Node 24 LTS`,
  );
  report(
    existsSync(resolve(agentProjectRoot, 'node_modules')),
    'Workspace dependencies installed (pnpm install)',
  );
  report(
    existsSync(resolve(agentProjectRoot, '.env')),
    'Project .env exists (pnpm dev initializes local defaults)',
  );
  try {
    serverCommand();
    report(true, 'Absolute Node/tsx/MCP executable paths resolve');
  } catch {
    report(false, 'Executable paths unavailable; run pnpm install');
  }
  for (const name of ['codex', 'claude'])
    console.log(
      `INFO ${name}: ${findExecutable(name) ? 'installed on PATH' : 'not installed/on PATH; optional until registration'}`,
    );
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
    report(true, 'Environment validated; no secret values displayed');
  } catch {
    report(false, 'Environment invalid. Check .env.example, secret lengths and test-only provider settings.');
    return false;
  }
  if (config.mode === 'duffel_test') {
    report(
      Boolean(config.duffelToken?.startsWith('duffel_test_')),
      'Duffel test token prefix; live tokens must be rejected',
    );
    console.log(
      'INFO Token presence is not proof of provider access; doctor performs no supplier search or purchase. Verify approved test access with the manual test checkout documented in README.md.',
    );
  } else console.log('INFO Local simulation uses synthetic fixtures; no live fares or tickets.');
  try {
    const response = await fetch(new URL('/api/health', config.baseUrl), {
      headers: { Authorization: `Bearer ${config.apiToken}` },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    const health: unknown = await response.json();
    const healthy =
      response.ok &&
      typeof health === 'object' &&
      health !== null &&
      'status' in health &&
      health.status === 'ok' &&
      'productionBooking' in health &&
      health.productionBooking === false;
    report(
      healthy,
      'FlightPilot backend responds with production booking disabled (start pnpm dev if unavailable)',
    );
  } catch {
    report(false, 'Backend unavailable. Start pnpm dev, then rerun doctor.');
  }
  try {
    const result = await probeMcp();
    report(true, `MCP discovery: ${result.toolCount} tools; ${result.invoked} invocation succeeded`);
  } catch {
    report(false, 'MCP invocation failed. Confirm .env, backend URL/token, and pnpm dev.');
  }
  return success;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  doctor()
    .then((ok) => {
      process.exitCode = ok ? 0 : 1;
    })
    .catch(() => {
      console.error('Doctor failed; inspect local configuration.');
      process.exitCode = 1;
    });
}

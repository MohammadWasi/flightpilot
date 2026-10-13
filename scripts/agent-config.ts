import { accessSync, constants, realpathSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

export type AgentName = 'codex' | 'claude';
export const agentProjectRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
export function serverCommand() {
  return {
    command: realpathSync(process.execPath),
    args: [require.resolve('tsx/cli'), resolve(agentProjectRoot, 'apps/mcp-server/src/index.ts')],
  };
}
export function findExecutable(name: string): string | undefined {
  const names = process.platform === 'win32' ? [name + '.exe', name + '.cmd', name] : [name];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    for (const candidate of names) {
      const path = resolve(directory, candidate);
      try {
        accessSync(path, constants.X_OK);
        return path;
      } catch {
        /* next PATH entry */
      }
    }
  }
  return undefined;
}
export function registrationArgs(agent: AgentName, config = serverCommand()): string[] {
  return agent === 'codex'
    ? ['mcp', 'add', 'flightpilot', '--', config.command, ...config.args]
    : [
        'mcp',
        'add',
        '--transport',
        'stdio',
        '--scope',
        'user',
        'flightpilot',
        '--',
        config.command,
        ...config.args,
      ];
}
export function inspectRegistration(agent: AgentName, executable: string): 'exists' | 'missing' | 'unknown' {
  const result = spawnSync(executable, ['mcp', 'get', 'flightpilot'], { encoding: 'utf8', timeout: 15_000 });
  if (result.status === 0) return 'exists';
  const message = (result.stderr ?? '') + (result.stdout ?? '');
  return /no MCP server(?: named| found with name:?)\s+["']?flightpilot\b/i.test(message)
    ? 'missing'
    : 'unknown';
}
export async function probeMcp(environment: Record<string, string> = {}) {
  const config = serverCommand();
  const client = new Client({ name: 'flightpilot-install-verification', version: '0.1.0' });
  const runtimeEnvironment: Record<string, string> = {};
  for (const key of [
    'FLIGHTPILOT_MODE',
    'FLIGHTPILOT_BASE_URL',
    'FLIGHTPILOT_API_TOKEN',
    'FLIGHTPILOT_ENCRYPTION_KEY',
    'DUFFEL_ACCESS_TOKEN',
  ]) {
    if (process.env[key]) runtimeEnvironment[key] = process.env[key]!;
  }
  const transport = new StdioClientTransport({
    ...config,
    env: { ...getDefaultEnvironment(), ...runtimeEnvironment, ...environment },
    cwd: agentProjectRoot,
    stderr: 'pipe',
  });
  // Drain diagnostics without echoing environment values or upstream payloads.
  transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport, { timeout: 15_000 });
    const listed = await client.listTools({}, { timeout: 10_000 });
    if (listed.tools.length !== 9) throw new Error('Expected nine FlightPilot tools');
    const result = await client.callTool(
      { name: 'resolve_airport', arguments: { query: 'PNQ' } },
      undefined,
      { timeout: 15_000 },
    );
    if (
      result.isError ||
      !result.structuredContent ||
      typeof result.structuredContent !== 'object' ||
      !('ok' in result.structuredContent) ||
      result.structuredContent.ok !== true
    )
      throw new Error('MCP connected but backend tool invocation failed');
    return { toolCount: listed.tools.length, invoked: 'resolve_airport' };
  } finally {
    await client.close();
  }
}

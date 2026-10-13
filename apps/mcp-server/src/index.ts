import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../../../packages/core/src/config.js';
import { createFlightPilotServer } from './server.js';

export async function startStdio(): Promise<void> {
  const config = loadConfig();
  await createFlightPilotServer(config).connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStdio().catch(() => {
    console.error(
      'FlightPilot MCP startup failed. Run pnpm run doctor; check the project .env and dependencies.',
    );
    process.exitCode = 1;
  });
}

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  findExecutable,
  inspectRegistration,
  probeMcp,
  registrationArgs,
  serverCommand,
} from './agent-config.js';

export async function setupAgents(): Promise<void> {
  const found = (['codex', 'claude'] as const).map((name) => ({ name, path: findExecutable(name) }));
  console.log(
    'FlightPilot agent setup. Secrets stay in the project .env; only absolute executable paths are registered.',
  );
  for (const item of found) console.log(`${item.name}: ${item.path ? 'detected' : 'not found on PATH'}`);
  if (process.argv.includes('--print')) {
    for (const agent of ['codex', 'claude'] as const)
      console.log(JSON.stringify({ client: agent, command: agent, args: registrationArgs(agent) }, null, 2));
    return;
  }
  if (!stdin.isTTY)
    throw new Error(
      'Run this command in an interactive terminal to approve global configuration changes, or use --print for manual commands. No configuration was changed.',
    );
  if (!found.some((item) => item.path))
    throw new Error(
      'Install Codex CLI or Claude Code, then rerun pnpm setup:agents. See docs/agent-installation.md.',
    );
  console.log('Checking the MCP connection and a read-only airport lookup...');
  await probeMcp();
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const choice =
      (await prompt.question('Install for codex, claude, both, or none? [both] ')).trim().toLowerCase() ||
      'both';
    if (!['codex', 'claude', 'both', 'none'].includes(choice))
      throw new Error('Unknown selection. No configuration was changed.');
    for (const item of found) {
      if (!item.path || choice === 'none' || (choice !== 'both' && choice !== item.name)) continue;
      const existing = inspectRegistration(item.name, item.path);
      if (existing === 'exists') {
        console.log(
          `${item.name}: an existing flightpilot configuration was preserved. Use ${item.name} mcp get flightpilot to inspect it.`,
        );
        continue;
      }
      if (existing === 'unknown') {
        console.log(
          `${item.name}: could not safely inspect existing configuration. No changes made. Check ${item.name} mcp get flightpilot manually.`,
        );
        continue;
      }
      const config = serverCommand();
      console.log(
        JSON.stringify({ client: item.name, executable: config.command, args: config.args }, null, 2),
      );
      const approved = (
        await prompt.question(
          `Add flightpilot to ${item.name}'s user-level global MCP configuration? Existing servers will be preserved. [y/N] `,
        )
      )
        .trim()
        .toLowerCase();
      if (approved !== 'y' && approved !== 'yes') {
        console.log(`${item.name}: skipped.`);
        continue;
      }
      const registration = spawnSync(item.path, registrationArgs(item.name), {
        stdio: 'inherit',
        timeout: 30_000,
      });
      if (registration.status !== 0)
        throw new Error(
          `${item.name} registration failed. Inspect ${item.name} mcp list; no automatic retry was attempted.`,
        );
      if (inspectRegistration(item.name, item.path) !== 'exists')
        throw new Error(
          `${item.name} registration could not be read back. Inspect it manually before retrying.`,
        );
      await probeMcp();
      console.log(
        `${item.name}: registration read back; MCP protocol discovery and airport invocation passed. Restart your client and use /mcp to confirm its own runtime connection.`,
      );
    }
  } finally {
    prompt.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupAgents().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Setup failed. Run pnpm run doctor.');
    process.exitCode = 1;
  });
}

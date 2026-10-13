# Codex and Claude installation

Start the backend with `pnpm dev`, then run `pnpm setup:agents` in a separate interactive terminal. The installer discovers clients on PATH, verifies the stdio MCP protocol and a read-only airport lookup, offers Codex/Claude/both, and asks before each global configuration change. It invokes the clients' supported registration commands, preserves an existing `flightpilot` entry, and stores only absolute executable paths. Secrets are loaded from the project `.env`, never placed in registration arguments.

`pnpm setup:agents --print` prints the exact argument arrays without changing configuration. Paths are machine-specific; rerun setup after moving the checkout or Node installation. `pnpm run doctor` checks Node, dependencies, environment, backend health and MCP discovery/invocation. It does not make a supplier booking.

The `run` is required because pnpm 11 reserves the bare `pnpm doctor` command for its own diagnostics.

## Manual registration

Use the absolute Node executable, installed tsx CLI path and MCP entry point printed by `--print`:

```sh
codex mcp add flightpilot -- /ABS/NODE /ABS/FLIGHTPILOT/node_modules/tsx/dist/cli.mjs /ABS/FLIGHTPILOT/apps/mcp-server/src/index.ts
claude mcp add --transport stdio --scope user flightpilot -- /ABS/NODE /ABS/FLIGHTPILOT/node_modules/tsx/dist/cli.mjs /ABS/FLIGHTPILOT/apps/mcp-server/src/index.ts
```

The installer resolves the actual tsx path, which may differ under pnpm. Codex CLI and IDE share MCP configuration. Restart the client and use `/mcp` to inspect its connection. Read registration with `codex mcp get flightpilot` or `claude mcp get flightpilot`. [Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

Protocol tests launch the same server with real MCP SDK clients using both registration argument shapes. This proves transport compatibility, tool discovery and invocation; it is not a claim that the interactive Codex and Claude applications were automatically operated or authenticated.

## Claude Desktop

The stdio transport is compatible with Claude Desktop. Merge this server entry into its existing `mcpServers` object without removing other entries. Replace every placeholder using `pnpm setup:agents --print`. Never commit personal Desktop configuration or add credentials to it.

```json
{
  "mcpServers": {
    "flightpilot": {
      "command": "/ABS/NODE",
      "args": ["/ABS/TSX-CLI", "/ABS/FLIGHTPILOT/apps/mcp-server/src/index.ts"]
    }
  }
}
```

The installer does not modify Claude Desktop configuration. See the current [MCP local-server connection guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers) for Desktop settings locations.

## Optional local HTTP transport

`pnpm mcp:http` exposes `http://127.0.0.1:3001/mcp`, with the same tool implementation and mandatory `Authorization: Bearer <FLIGHTPILOT_API_TOKEN>`. It validates Host/Origin, accepts bounded POST requests, and is stateless. Configure a client through its supported secure bearer-token facility. Do not put the token in a tracked file or shell history.

This transport is a local, single-user integration. Internet-hosted multi-user service needs TLS, identity/OAuth, user-bound authorization, deployment controls and operational review before exposure. The provided command binds only loopback.

## Troubleshooting

- Backend unavailable: keep `pnpm dev` running; check `FLIGHTPILOT_BASE_URL` and run `pnpm run doctor`.
- Authentication failed: the MCP process and backend must use the same project `.env` and API token; restart both after a change.
- Client not detected: install its official CLI and ensure it is on PATH in the terminal running setup.
- Existing registration: setup deliberately preserves it. Inspect it, then manually remove/re-register only the FlightPilot entry if the paths are stale.
- No real offers: default simulation is synthetic. Configure an approved Duffel test token for supplier sandbox data. Live tokens/purchases are disabled.
- Startup JSON/protocol errors: stdout is reserved for MCP messages; diagnostics belong on stderr.

Future npm packaging should ship compiled server code and a stable CLI entry point, eliminating the checkout-specific tsx path. Publishing is not required for this MVP.

Date flexibility can make up to seven sequential supplier requests. For Codex, set `tool_timeout_sec = 240` in the FlightPilot MCP entry when using these longer searches; other clients need a comparable tool timeout. The backend never retries an order purchase.

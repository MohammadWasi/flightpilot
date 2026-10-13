import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { callBackend } from '../apps/mcp-server/src/server.js';
import { createMcpHttpServer } from '../apps/mcp-server/src/http.js';
import { serverCommand, registrationArgs } from '../scripts/agent-config.js';
import { ToolSchemas } from '../packages/shared/src/index.js';

// Synthetic local HTTP fixture verifies MCP protocol and auth, never supplier access.
const apiToken = 'test-api-token-'.padEnd(48, 'x');
let backend: Server;
let baseUrl: string;
const calls: string[] = [];
beforeAll(async () => {
  backend = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${apiToken}`) {
      response.writeHead(401, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required', retryable: false },
        }),
      );
      return;
    }
    calls.push(request.url ?? '');
    request.resume();
    response
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ airports: [{ code: 'PNQ', city: 'Pune' }], fixture: true }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const address = backend.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listen failed');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => backend.close((error) => (error ? reject(error) : resolve())));
});

describe('portable Codex/Claude launch configurations using real MCP SDK clients', () => {
  it.each(['codex', 'claude'] as const)(
    '%s config discovers and invokes the same nine tools from an unrelated cwd',
    async (agent) => {
      const launch = serverCommand();
      const args = registrationArgs(agent, launch);
      expect(args.slice(args.indexOf('--') + 1)).toEqual([launch.command, ...launch.args]);
      expect(JSON.stringify(args)).not.toContain(apiToken);
      const client = new Client({ name: `${agent}-configuration-protocol-test`, version: '0.1.0' });
      const transport = new StdioClientTransport({
        ...launch,
        cwd: tmpdir(),
        stderr: 'pipe',
        env: {
          ...getDefaultEnvironment(),
          FLIGHTPILOT_BASE_URL: baseUrl,
          FLIGHTPILOT_API_TOKEN: apiToken,
          FLIGHTPILOT_ENCRYPTION_KEY: '11'.repeat(32),
          FLIGHTPILOT_MODE: 'simulation',
          NODE_ENV: 'test',
        },
      });
      transport.stderr?.on('data', () => {});
      try {
        await client.connect(transport);
        const listed = await client.listTools();
        expect(listed.tools.map((tool) => tool.name).sort()).toEqual(Object.keys(ToolSchemas).sort());
        const inputSchemaText = JSON.stringify(listed.tools.map((tool) => tool.inputSchema));
        expect(inputSchemaText).not.toContain('passport');
        expect(inputSchemaText).not.toContain('cardNumber');
        const resolved = await client.callTool({ name: 'resolve_airport', arguments: { query: 'PNQ' } });
        expect(resolved.structuredContent).toMatchObject({
          ok: true,
          data: { airports: [{ code: 'PNQ' }], fixture: true },
        });
        const calledBefore = calls.length;
        const invalid = await client.callTool({
          name: 'resolve_airport',
          arguments: { query: 'PNQ', passport: 'must never pass' },
        });
        expect(invalid.isError).toBe(true);
        expect(calls.length).toBe(calledBefore);
      } finally {
        await client.close();
      }
    },
    20_000,
  );
});

describe('local authenticated Streamable HTTP', () => {
  it('requires bearer auth, rejects foreign browser origins, and supports MCP invocation', async () => {
    const server = createMcpHttpServer({ baseUrl, apiToken });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('MCP listen failed');
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const client = new Client({ name: 'local-http-protocol-test', version: '0.1.0' });
    try {
      expect((await fetch(url, { method: 'POST' })).status).toBe(401);
      expect(
        (
          await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiToken}`, Origin: 'https://untrusted.example' },
          })
        ).status,
      ).toBe(403);
      const forgedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest(
          url,
          { method: 'POST', headers: { Authorization: `Bearer ${apiToken}`, Host: 'untrusted.example' } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on('error', reject);
        request.end('{}');
      });
      expect(forgedHostStatus).toBe(403);
      expect(
        (
          await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiToken}` },
            body: 'x'.repeat(65_537),
          })
        ).status,
      ).toBe(413);
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          requestInit: { headers: { Authorization: `Bearer ${apiToken}` } },
        }),
      );
      expect((await client.listTools()).tools).toHaveLength(9);
      const result = await client.callTool({ name: 'resolve_airport', arguments: { query: 'PNQ' } });
      expect(result.structuredContent).toMatchObject({ ok: true });
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 20_000);
});

describe('backend error boundary', () => {
  it('returns actionable authentication failure without revealing secrets', async () => {
    const result = await callBackend('resolve_airport', { query: 'PNQ' }, { baseUrl, apiToken: 'incorrect' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required', retryable: false },
    });
  });
  it('redacts network exceptions and never follows redirects carrying authorization', async () => {
    const result = await callBackend(
      'resolve_airport',
      { query: 'PNQ' },
      {
        baseUrl,
        apiToken,
        fetcher: async (_input, init) => {
          expect(init?.redirect).toBe('error');
          throw new Error(`sensitive=${apiToken}`);
        },
      },
    );
    expect(result.error?.code).toBe('BACKEND_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain(apiToken);
  });
});

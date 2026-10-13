import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig } from '../../../packages/core/src/config.js';
import { createFlightPilotServer, type BackendOptions } from './server.js';

export function createMcpHttpServer(options: BackendOptions): Server {
  if (options.apiToken.length < 32) throw new Error('A strong FlightPilot API token is required.');
  return createServer(
    { requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 8192 },
    (request, response) => {
      void (async () => {
        const address = request.socket.localAddress;
        const host = request.headers.host;
        const port = request.socket.localPort;
        const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
        if (
          !address ||
          !host ||
          !allowedHosts.includes(host) ||
          (request.headers.origin && request.headers.origin !== `http://${host}`)
        ) {
          response.writeHead(403).end('Invalid origin');
          return;
        }
        if (request.url !== '/mcp') {
          response.writeHead(404).end();
          return;
        }
        const supplied = Buffer.from(request.headers.authorization ?? '');
        const expected = Buffer.from(`Bearer ${options.apiToken}`);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
          response.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end('Authentication required');
          return;
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST' }).end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > 65_536) {
            response.writeHead(413).end();
            return;
          }
          chunks.push(bytes);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          response.writeHead(400).end('Invalid JSON');
          return;
        }
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        const server = createFlightPilotServer(options);
        response.on('close', () => {
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(request, response, parsed);
      })().catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FLIGHTPILOT_MCP_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid MCP port');
  createMcpHttpServer(loadConfig()).listen(port, '127.0.0.1', () =>
    console.error(`FlightPilot authenticated MCP: http://127.0.0.1:${port}/mcp (local use only)`),
  );
}

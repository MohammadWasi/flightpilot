import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolSchemas, type ToolName } from '../../../packages/shared/src/index.js';

const errorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict();
const resultSchema = z
  .object({ ok: z.boolean(), data: z.unknown().optional(), error: errorSchema.optional() })
  .strict();
export type ToolResult = z.infer<typeof resultSchema>;
export type BackendOptions = { baseUrl: string; apiToken: string; fetcher?: typeof fetch };

const descriptions: Record<ToolName, string> = {
  search_flights:
    'Search the connected flight provider for all travellers. Supply exact child/infant ages on the travel date. Results declare simulation/test/live provenance; never describe simulation fares as available airline prices. Do not collect identity or card details in conversation.',
  compare_flights:
    'Rank previously returned offers as cheapest suitable, best overall value, and fastest suitable. Explain verified price, baggage, stops and restrictions; unknown costs remain unknown. This does not search the entire internet.',
  find_cheapest_dates:
    'Search actual provider results across a bounded range of at most seven departure dates. This consumes supplier search quota. Do not invent dates or prices.',
  get_fare_details:
    'Retrieve current fare, taxes, baggage, carrier, expiry and known change/cancellation terms for a returned offer.',
  revalidate_offer:
    'Refresh provider price and availability; report changes. A refreshed fare does not authorize a purchase.',
  prepare_checkout:
    'Create a short-lived checkout link for the authenticated user. This never charges or books. The user must open the link, provide traveller details privately, review the refreshed total and explicitly approve in checkout.',
  get_booking_status:
    'Retrieve the authenticated user’s booking and provider ticketing status. Distinguish a reservation/PNR from issued tickets. Uncertain results require reconciliation, never another blind purchase.',
  list_my_bookings:
    'List bookings belonging to the authenticated user, without passenger identity or payment secrets.',
  resolve_airport:
    'Resolve an airport/city name or IATA code from the supported airport directory. Return ambiguity rather than guessing.',
};

export async function callBackend(
  name: ToolName,
  input: unknown,
  options: BackendOptions,
): Promise<ToolResult> {
  try {
    const response = await (options.fetcher ?? fetch)(new URL(`/api/tools/${name}`, options.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiToken}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(
        name === 'find_cheapest_dates' || name === 'search_flights' ? 240_000 : 45_000,
      ),
      redirect: 'error',
    });
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const parsed = errorSchema.safeParse(payload.error);
      if (parsed.success) return { ok: false, error: parsed.data };
    }
    if (!response.ok)
      return {
        ok: false,
        error: {
          code: response.status === 401 ? 'AUTH_REQUIRED' : 'BACKEND_ERROR',
          message:
            response.status === 401
              ? 'FlightPilot authentication failed. Run pnpm run doctor and check the local API token.'
              : 'The FlightPilot backend could not complete this request. Run pnpm run doctor.',
          retryable: response.status >= 500,
        },
      };
    return { ok: true, data: payload };
  } catch {
    return {
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message:
          'FlightPilot backend is unreachable or returned an invalid response. Start pnpm dev, then run pnpm run doctor. Do not retry a purchase; query booking status for uncertain bookings.',
        retryable: true,
      },
    };
  }
}

export function createFlightPilotServer(options: BackendOptions): McpServer {
  const server = new McpServer(
    { name: 'flightpilot', version: '0.1.0' },
    {
      instructions:
        'FlightPilot uses one MCP contract for Codex and Claude. Respect environment labels. Never request payment card, OTP, passport or traveller identity data in chat. Booking approval occurs only in the authenticated web checkout. Visa and entry requirements must be independently verified with official sources.',
    },
  );
  for (const name of Object.keys(ToolSchemas) as ToolName[]) {
    server.registerTool(
      name,
      {
        description: descriptions[name],
        inputSchema: ToolSchemas[name],
        outputSchema: resultSchema,
        annotations: {
          readOnlyHint: name !== 'prepare_checkout',
          destructiveHint: false,
          idempotentHint: name !== 'prepare_checkout',
          openWorldHint: name !== 'resolve_airport',
        },
      },
      async (input: unknown) => {
        const result = await callBackend(name, input, options);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
          isError: !result.ok,
        };
      },
    );
  }
  return server;
}

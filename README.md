# FlightPilot

FlightPilot is an MCP-first flight-search and checkout MVP in TypeScript. Codex and Claude use the same nine tools. A small Next.js application handles private traveller forms, explicit approval and booking history.

The source is available under the [MIT license](LICENSE). You can run, study, modify, and contribute to the application; the default simulator needs no supplier account or paid service. See [contributing](CONTRIBUTING.md), [support](SUPPORT.md), and [security reporting](SECURITY.md).

**This build is for local simulation and Duffel's test environment. It is not ready for production travel sales.** The default fares, schedules and booking references are clearly labelled synthetic. The Duffel adapter calls the documented provider API when supplied with a test token; no provider credentials were supplied during this build, so authenticated supplier search or booking has not been verified. Live tokens and real-money booking are disabled.

[![M8ven Score](https://m8ven.ai/badge/mcp/mohammadwasi-flightpilot-4owxjj)](https://m8ven.ai/mcp/mohammadwasi-flightpilot-4owxjj?s=readme)


## Run locally

Use Node **24 LTS** and the exact pnpm version pinned in `package.json` (**11.25.0**). Clone the source and install the locked dependencies:

```sh
git clone https://github.com/MohammadWasi/flightpilot.git
cd flightpilot
pnpm install --frozen-lockfile
pnpm dev
```

On first run, `pnpm dev` creates an ignored `.env` with random local secrets. It starts the web application on [http://127.0.0.1:3000](http://127.0.0.1:3000). Open `.env` privately in your editor and use `FLIGHTPILOT_API_TOKEN` to sign in. Keep the token outside AI conversations. Do not copy `.env.example` with its placeholder secrets unchanged.

Keep the server running. In another terminal:

```sh
pnpm run doctor
pnpm setup:agents
```

Use **`pnpm run doctor`**, including `run`: pnpm 11 has its own built-in `doctor` command, so `pnpm doctor` runs package-manager diagnostics instead of FlightPilot's script. See [pnpm's script command rules](https://pnpm.io/scripts).

Setup detects Codex and Claude Code on PATH, probes MCP, and asks before modifying each client's user-level configuration. Existing `flightpilot` entries are preserved. `pnpm setup:agents --print` prints registration arguments without changing anything. Restart your client and inspect `/mcp`. See [agent installation](docs/agent-installation.md) for manual Codex, Claude Code and Claude Desktop configuration.

## What the MVP contains

- Provider-attributed search, bounded date comparison, fare refresh, and cheapest/best-value/fastest recommendations using decimal amounts and airport time zones.
- A documented Duffel v2 **test-only** adapter, plus an explicitly synthetic local provider for credential-free development.
- Authenticated checkout with short-lived sessions, exact traveller checks, explicit browser approval, atomic attempt claiming, and provider status retrieval. A PNR is distinguished from issued ticket documents.
- Persistent local PostgreSQL-compatible storage through PGlite; an optional PostgreSQL connection through Drizzle.
- Stdio MCP and an optional authenticated loopback Streamable HTTP transport. No purchase tool is exposed to the assistant.
- Automated core, pricing, provider-fixture and MCP protocol tests, plus Playwright browser scenarios. See the commands below for reproducible validation; supplier fixtures are fabricated test data, not captured live responses.

## Try a complete local journey

Sign in, search Pune → Delhi on a future date, and choose an inclusive baggage fare. Open **Review flight**, inspect the itinerary and use fictional traveller details. Tick the approval checkbox, then approve the simulated booking. The result shows a synthetic reference and ticket status. No card form, payment network or airline purchase is involved.

The checkout also offers explicit simulation outcomes for decline, uncertain timeout and pending ticketing. An uncertain result blocks another approval of that checkout and gives reconciliation instructions. See the [user guide](docs/user-guide.md).

## Connect approved Duffel test access

Create your own Duffel account and test token through its dashboard. Update the ignored `.env`:

```dotenv
FLIGHTPILOT_MODE=duffel_test
DUFFEL_ACCESS_TOKEN=duffel_test_YOUR_PRIVATE_TOKEN
```

Restart `pnpm dev` and the MCP client. Use the provider account's quoted currency; no FX conversion is invented. Search a supported route/date, select a fare with included baggage and no required passport documents, then complete checkout with fictional travellers. Approval submits an instant **test-balance** order and retrieves provider status. Confirm that the UI, offers and returned order all identify the test environment.

This is a manual supplier acceptance procedure, **not a verified result from this build**. A test token does not prove India business eligibility, live airline coverage or payment approval. [Duffel's test-mode guide](https://duffel.com/docs/api/overview/test-mode) explains its fictional airline and test limitations. The [provider feasibility matrix](docs/provider-feasibility.md) records India payment restrictions, TBO onboarding, deprecated Amadeus Self-Service documentation and Skyscanner's search/deep-link model.

## MCP tools

| Tool                  | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `resolve_airport`     | Resolve the curated airport directory; surface ambiguous cities     |
| `search_flights`      | Search the active provider with exact party and journey preferences |
| `compare_flights`     | Rank saved offers for the same search context                       |
| `find_cheapest_dates` | Perform at most seven bounded provider searches                     |
| `get_fare_details`    | Refresh fare and known baggage/change/cancellation details          |
| `revalidate_offer`    | Check current price/availability and identify price changes         |
| `prepare_checkout`    | Return an authenticated checkout link; never charge or book         |
| `get_booking_status`  | Retrieve owned booking and ticketing status                         |
| `list_my_bookings`    | List stored booking summaries for the local user                    |

Example conversational request: “Find flights from Pune to Delhi on 20 November 2026 for two adults and a child aged three on that date, with one checked bag per person and no long layovers.” Replace the example with a future date. Resolve ambiguity before searching. The assistant must preserve simulation/test labels and never ask for identity or payment details in chat.

See the [verification record](docs/verification.md) for the checks actually completed.

## Validation and operations

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

`pnpm check` runs formatting, lint, TypeScript, and unit/integration checks. Use `pnpm format` to apply the repository's formatting rules. With the local application running, `pnpm run doctor` checks its configuration and connectivity. These commands describe reproducible checks; configured CI workflows do not establish that a hosted run or supplier acceptance has passed.

Playwright starts an isolated simulation server on port 3100 and uses `.data-e2e`. It does not buy airline tickets. `pnpm start` serves the built web app; initialize valid local environment settings first. `pnpm mcp:http` starts the optional local bearer-authenticated MCP endpoint on port 3001.

The MCP tests use real SDK clients with both clients' launch argument shapes. They verify protocol discovery/invocation, not a conversation operated inside both installed products. Codex CLI was detected on the build machine; Claude Code was absent. No global client configuration was changed by the build. The production web build and the application doctor were verified locally; this does not enable production flight purchases.

For optional PostgreSQL, start `docker compose up -d`, set `DATABASE_URL` using `.env.example`, and run `pnpm db:migrate` before starting the app. The Compose password is for local development only. PostgreSQL deployment has not been independently validated in this build. Keep only one web process on a PGlite data directory. Stop that process before running `pnpm db:migrate` against the same PGlite directory.

A `Dockerfile` is also supplied for the web/backend. Container build and deployment were **not executed here**. After generating valid local `.env` settings, a local test deployment can use:

```sh
docker build -t flightpilot .
docker run --rm --env-file .env -p 127.0.0.1:3000:3000 -v flightpilot-data:/app/.data flightpilot
```

Keep `FLIGHTPILOT_BASE_URL=http://127.0.0.1:3000` for that local binding, and keep its encryption key stable with the persistent data volume. Container `127.0.0.1` is the container itself: an optional external PostgreSQL `DATABASE_URL` must use a host/network address reachable from the container. Do not expose this local shared-token application publicly. The image runs one web process; connect MCP separately from the host checkout.

## Repository

```text
apps/web/               private web workspace and API routes
apps/mcp-server/        shared MCP server, stdio and local HTTP transports
packages/shared/       strict schemas and provider contracts
packages/providers/    synthetic simulator and Duffel test adapter
packages/pricing-engine/ decimal money, journey metrics and rankings
packages/core/         persistence, authentication, checkout and webhooks
scripts/               development, setup, diagnostics and schema initialization
tests/                 unit, protocol, provider-fixture and browser scenarios
docs/                  design, operation, feasibility and launch gaps
```

Read [architecture](docs/architecture.md), [known limitations](docs/limitations.md), and the [production launch checklist](docs/production-checklist.md) before adapting this application beyond local testing. Secrets, passenger identity and payment data must never be committed, logged or sent through MCP.

## Contributing and community

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, review expectations, and validation. Small fixes, tests, accessibility improvements, and documentation contributions are welcome. Discuss broader provider or purchase-flow changes in an issue before starting. Participants follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Use the [support guide](SUPPORT.md) for questions and bug reports. Report vulnerabilities privately through the [security policy](SECURITY.md). Public issues and pull requests must use fictional data and must never contain traveller identities, passport or card details, real booking records, tokens, or `.env` contents.

The [changelog](CHANGELOG.md) records notable changes, including unreleased work. The project is maintained by [@MohammadWasi](https://github.com/MohammadWasi); community support has no guaranteed response time.

## License

FlightPilot's original source and documentation are licensed under [MIT](LICENSE). Contributions use the same license, with no CLA or copyright assignment. Dependencies retain their own licenses; consult the [third-party notices](THIRD_PARTY_NOTICES.md) before redistributing dependencies or application images. The open-source license does not grant supplier access or replace the provider's own account and service terms.

# Known limitations

This is a local, test-only MVP. The most significant limitations are external supplier access and deliberately disabled live financial operations.

## What has not been verified externally

- No real provider credentials or commercial approvals were supplied. Authenticated Duffel sandbox search/booking has not been executed for this build. Provider tests use explicitly fabricated responses.
- No live flight search, money collection or travel-valid ticket issuance is claimed.
- India business eligibility, specific carrier inventory, INR settlement, fees and payment approval remain account-specific and unverified.
- Codex CLI was detected; Claude Code was not installed on the build machine. Automated tests use real MCP SDK clients with both configuration shapes, not actual conversations in both products. Global client settings were not modified during the build.
- Optional PostgreSQL/Docker deployment has not been independently verified. Current local tests use PGlite or isolated fixtures.
- A production Next.js build can be served locally, but that describes the web framework's build mode only. It does not make flight purchasing production-capable. The supplied Dockerfile was not built/run during this delivery.

## Product scope

- The implemented providers are the local simulator and Duffel test adapter. TBO, Amadeus and Skyscanner appear only in feasibility research.
- Production tokens/purchases are hard-disabled. There is no real hosted payment page, card capture, 3DS, UPI flow, payment-gateway integration or Duffel Links integration.
- Checkout supports included baggage only. Purchasing ancillary bags/seats, collecting required passport/identity documents and Duffel seated infants are unsupported.
- No cancellation/change/refund tool or servicing interface is implemented. Status retrieval can display supplier cancellation; initiating it is separate work.
- The airport directory is curated and small. Unknown locations are rejected, ambiguous cities require selection, and nearby-airport distance search is absent. The simulator's supported time zones may be narrower than the resolver directory.
- One-way/return and limited multi-city slices are supported through MCP. The web search form focuses on one-way and return journeys. Flexible-date searches use `flexibleDays` or the separate bounded tool and shift all itinerary dates together.
- Rankings compare only returned, compatible offers from the active provider. They do not cover the internet, invent missing fees/FX, predict fare drops or score airline reliability. Ranking weights are configurable in code, not a web control.
- Only the declared currencies are accepted. A provider quote in another currency can be rejected or excluded from comparison; no conversion service is integrated.
- Browser preferences are saved locally, not synchronized to the server/MCP account. Alerts, subscriptions and other optional features are not implemented.

## Security and operations

- Authentication is a shared workspace token and signed cookie for one local user. Hosted multi-user accounts/OAuth, user provisioning and tenant isolation are not a finished product.
- The optional Streamable HTTP endpoint is local bearer authentication, not an internet-hosted SaaS endpoint.
- PGlite requires one backend process per data directory. The repository has idempotent table/index creation, but no production migration history or tested rollback framework.
- Search/raw fare cleanup uses a 24-hour inactivity threshold; operational records use 90 days. Cleanup is invoked at startup or by the migration script, not a scheduled retention service.
- Purchase attempts are not automatically retried. A crash or uncertain provider result may need manual reconciliation; there is no operator console/background reconciliation worker.
- Lists currently return at most 100 recent records. Full history pagination and scalable operational reporting are absent.
- Webhook logic requires a configured Duffel test signing secret and reachable deployment. Local loopback startup does not provide an external callback/tunnel. No real supplier webhook delivery was verified.
- The code minimizes identity persistence and encrypts raw offers, but production privacy/compliance review, key rotation, backup/restore and independent security audit remain outstanding.

Run the documented validation commands to establish the status of your own checkout. Passing fixture or browser tests does not establish airline access, certification, payment approval or production readiness. See the [production launch checklist](production-checklist.md).

# Production launch checklist

**Production is intentionally blocked in this build.** This checklist is unfinished engineering and business work, not evidence of approval. Do not remove live-token guards merely to test a booking.

## Supplier and India feasibility

- [ ] Obtain written approval for the actual legal entity, India point of sale, distribution model, AI/MCP presentation and intended customer markets.
- [ ] Confirm enabled Indian/international carriers, route coverage, passenger categories, baggage, currency/settlement, support and servicing rights with the account's contract.
- [ ] Select the actual production supplier. Duffel has implementation priority only if supported; TBO needs its own contracted integration and certification. The other researched providers are not adapters in this build.
- [ ] Confirm the current Duffel Payments/Links country rules instead of assuming India eligibility. Agree merchant-of-record responsibilities, customer support and applicable commercial fees.
- [ ] Obtain an account-specific tariff covering booking, ancillary, search, FX, payment, cancellation and other charges. Model the complete payable amount without invented conversions.

Use the [provider feasibility matrix](provider-feasibility.md) as a starting point, then refresh its primary sources and verify your actual account.

## Genuine supplier acceptance

- [ ] Run authorized supplier sandbox search, one-way/return/family bookings, repricing, expiry, failed payment, pending issuance, ticket retrieval and cancellation scenarios.
- [ ] Verify actual provider request/response shapes against this adapter; sanitized, recorded fixtures may supplement the current fabricated fixtures.
- [ ] Validate ticket completeness for all passengers/segments and servicing status. A paid PNR alone is insufficient.
- [ ] Complete supplier certification, static-IP requirements and production access approvals where applicable.
- [ ] Establish operator procedures for a timeout after upstream order creation. Add safe reconciliation tools and durable background processing before scaling.

## Payment, consent and security

- [ ] Implement an approved provider-hosted/PCI-compliant payment flow and required 3DS challenges. Keep raw card data and OTPs outside application storage, logs and MCP.
- [ ] Bind payment authorization, selected services, final currency/total and explicit user consent to the same checkout version. Reapproval is mandatory for changed payable terms.
- [ ] Review failure handling across payment authorization/capture, booking, ticketing and refund; prevent duplicate capture or duplicate orders after crashes.
- [ ] Implement supported identity-document collection where required, with encryption, minimization, retention and access controls.
- [ ] Replace the shared local access-token model with reviewed multi-user authentication and per-user authorization. Add appropriate OAuth for hosted MCP, secure account recovery and secret rotation.
- [ ] Review TLS, reverse proxy/Host/Origin behavior, rate limits, CSP, dependency vulnerabilities and deployment exposure. Loopback transport settings are not an internet security architecture.

## Data and operations

- [ ] Validate a production PostgreSQL deployment, connection handling, concurrency, atomic state transitions and rollback paths. PGlite's single-process local mode is not the scaling plan.
- [ ] Add versioned schema migrations, tested backup/restore and a key-management/rotation strategy.
- [ ] Schedule retention cleanup; current cleanup only runs at startup/schema initialization. Confirm required records and retention with qualified advisers.
- [ ] Operate verified webhooks with retry, duplicate/out-of-order handling, monitoring and reconciliation. Do not mark an unprocessed event complete after an unresolved booking failure.
- [ ] Add booking/payment/ticketing alerts, provider health monitoring, on-call ownership, customer support and incident procedures.
- [ ] Review privacy notices, traveller disclosures, consumer/travel obligations, refunds and payment requirements for the target jurisdictions with qualified specialists.

## Release gates

- [ ] Run typecheck, automated tests, browser scenarios and production build against the release artifact; investigate failures.
- [ ] Verify actual interactive Codex and Claude Code discovery/invocation on fresh machines, alongside SDK protocol tests. Verify manual Desktop setup if advertised.
- [ ] Exercise realistic India routes/currencies and accessibility/mobile flows with approved supplier test access.
- [ ] Document known coverage gaps and supported operations. Do not claim internet-wide cheapest fares or unavailable booking integrations.
- [ ] Obtain explicit human authorization for any carefully controlled real-money acceptance transaction. No automated production purchase test may spend money.

Live capability should be introduced as a reviewed feature with these gates, not as an environment variable that bypasses the current test-only design.

# Security policy

FlightPilot is an early MVP for local simulation and Duffel test mode. Live tokens and real-money booking are disabled. The shared-token local application is not designed for public deployment or production traveller data.

## Supported code

Security fixes are developed against the latest `main` branch. There are no maintained release branches or guaranteed backports yet. Use the current code and lockfile, and review the [known limitations](docs/limitations.md) before testing. No production-readiness or security-audit claim is made.

## Report a vulnerability privately

Use [GitHub's private vulnerability reporting](https://github.com/MohammadWasi/flightpilot/security/advisories/new). If that form is unavailable, email **mdwasi15@gmail.com** with the subject `FlightPilot security report`. Do not open a public issue or pull request with exploit details before coordinated disclosure.

Include the affected commit or version, relevant component, expected and observed behavior, impact, and minimal steps to reproduce using fictional data. Useful areas include authentication, booking ownership, traveller-data exposure, approval bypass, replay or duplicate order attempts, webhook verification, and accidentally enabled live purchases.

Never send real passport details, passenger identities, payment-card data, private booking records, provider tokens, local API tokens, encryption keys, or complete `.env` files. Redact logs and use placeholder credentials. If a credential was exposed, revoke or rotate it through the relevant provider; removing it from a report does not invalidate it.

The maintainer will assess reports and coordinate remediation and disclosure when practical. There is no guaranteed response time, bounty program, or commitment to a particular remediation date. Please agree on public disclosure timing with the maintainer when possible so users can receive a fix.

## Safe testing

Test only systems and accounts you own or have permission to test. Prefer the local synthetic provider and fabricated fixtures. Do not make real purchases, access another person's records, or probe supplier infrastructure as part of a FlightPilot report. Supplier vulnerabilities should be reported to the supplier through its own security process.

Automated dependency and code checks reduce risk but do not replace a security review. Before expanding the application beyond local testing, consult the [production checklist](docs/production-checklist.md).

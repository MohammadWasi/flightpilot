# Contributing to FlightPilot

Thank you for helping improve FlightPilot. It is an early, local-development MVP: simulation and Duffel test mode are supported, and live purchases are disabled. Contributions should preserve those boundaries unless an explicitly reviewed design changes them.

## Choose a change

Search existing [issues](https://github.com/MohammadWasi/flightpilot/issues) and pull requests before starting. Small bug fixes, documentation corrections, accessibility improvements, and meaningful tests are welcome directly. For a new provider, architecture change, or expanded purchase capability, open an issue describing the problem and proposed scope first so maintainers can discuss the direction.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately using the [security policy](SECURITY.md). Never put access tokens, passenger identities, passport details, payment-card data, or real booking details in issues, logs, screenshots, fixtures, or pull requests. Use fictional data.

## Set up locally

1. Fork the repository and create a focused branch from `main`.
2. Use Node.js 24 and the pnpm version pinned in `package.json`.
3. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.
4. Follow the [README](README.md) to sign in with the generated local token. The ignored `.env` and local data directories stay private.

The simulator requires no provider account. Run development and automated checks in simulation mode. The [architecture guide](docs/architecture.md) explains package boundaries; [known limitations](docs/limitations.md) identifies unfinished areas. Do not use real travellers or live supplier credentials to validate a contribution.

## Make and verify the change

- Keep a pull request focused on one problem; explain changes to public behavior and update the relevant documentation.
- Preserve provider attribution, test-environment labels, explicit browser approval, ownership checks, and the rule that MCP tools never purchase flights.
- Add regression coverage for bugs and meaningful tests for new behavior. Use fabricated provider fixtures and deterministic simulation scenarios.
- Reuse the existing package boundaries and dependencies. Explain why a new dependency is needed and check its license before adding it.
- Update `pnpm-lock.yaml` through pnpm when changing dependencies; do not edit it manually.

Before opening a pull request, run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Use `pnpm format` to fix formatting. Playwright starts a simulation server on port 3100 with isolated data. Keep supplier tokens out of CI. If a check cannot run, state which check and why in the pull request; do not describe it as passing. Test-mode supplier acceptance, PostgreSQL deployment, and container deployment must be reported separately from local simulation checks.

## Submit a pull request

Describe the original problem, the resulting behavior, and your validation. Link the related issue when there is one, include screenshots for visible changes, and call out compatibility or data-migration effects. Use clear commit messages that describe the change; no commit-message prefix is required.

Maintainers review contributions before merging and may request a smaller scope or additional evidence. A pull request does not guarantee inclusion or a response time. Do not include generated builds, local databases, browser reports, credentials, or unrelated formatting changes.

## License and ownership

By submitting a contribution, you agree to license that contribution under the project's [MIT license](LICENSE). You retain copyright in your work. There is no contributor license agreement (CLA) or copyright assignment. Only submit work you have the right to contribute, and preserve applicable third-party license and attribution notices.

The project is maintained by [@MohammadWasi](https://github.com/MohammadWasi). Maintainers decide the project direction, review changes, and manage releases. This repository's version history and changelog distinguish unreleased work from published releases.

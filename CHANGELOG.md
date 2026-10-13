# Changelog

Notable user-facing changes are recorded here. Entries under Unreleased describe repository changes, not a published package or hosted service. The initial package version is `0.1.0`; no release tag is implied by this document.

## Unreleased

### Added

- Initial TypeScript workspace for flight search, fare comparison, explicit checkout approval, and booking history.
- Nine MCP tools shared across supported clients, with stdio and authenticated local HTTP transports.
- Synthetic development provider and a Duffel test-mode adapter; live tokens and real-money purchases remain disabled.
- Local persistent storage, optional PostgreSQL configuration, and isolated simulation browser scenarios.
- MIT licensing, contribution and community policies, private security-reporting guidance, and issue and pull request templates.
- Formatting, TypeScript and React Hooks lint rules, pinned CI actions, browser checks, CodeQL, dependency audits, and Dependabot updates.
- Reproducible dependency license inventory and a one-day minimum release age for dependency installation.

### Limitations

- Authenticated Duffel supplier acceptance requires separate test credentials and verification.
- Production travel sales, real payments, public hosting, and production security hardening are outside this MVP. See the [limitations](docs/limitations.md) and [production checklist](docs/production-checklist.md).

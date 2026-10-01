# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [1.0.0] - 2026-10-01

### Added
- **Console (Angular 22, standalone, zoneless, signals):** dashboard (KPIs, PML ladder, trend, LOB and peril charts), exposure grid (Ag-Grid Enterprise server-side row model: grouping, aggregation, side bar, set/text/number/date filters, CSV export, saved column state), policy detail with legacy-versus-modern rating reconciliation, accumulation tile map with client-side stress preview and server-authoritative stress run, admin status page, persona login, light/dark theme, degraded-data banner.
- **BFF (NestJS 12, ESM):** `/api/v1` exposures query/distinct/export/detail, portfolio summary/accumulation/stress, status, auth demo-login/me; `/healthz`, `/readyz`; RFC 9457 errors; helmet, throttling, compression, correlation ids, graceful drain; zod-validated configuration that refuses unsafe production settings.
- **Libraries:** `shared/domain` (risk model, permissions, formatting), `shared/legacy-bridge` (ES5 engine plus typed adapter), `shared/ui` (KPI card, charts, state panels), `risk/data-access` (circuit breaker, retry, stores).
- **Quality:** 99 unit/integration tests (Vitest), 13 Playwright tests including axe accessibility scans, ESLint with Nx boundary rules, Prettier, Conventional Commit hooks.
- **Delivery:** Dockerfiles, Compose, Kubernetes base and dev/prod overlays, Terraform for AWS (EKS) and GCP (GKE) with GitHub OIDC modules, CI with a single required check, CodeQL, manual OIDC deploy, release workflow, `protect-main` ruleset.
- **Docs:** README, WALKTHROUGH, Solution-Deep-Dive, SRS, SRS-Compliance, ADRs 0001-0007.

### Known limitations
- Playwright specs, Docker builds, Terraform validate, kubectl rendering and GitHub Actions were not executed in the authoring sandbox (see SRS-Compliance).
- The risk model is illustrative, not an actuarial or regulatory model. Data is synthetic and seeded.
- Ag-Grid Enterprise needs your own licence key; without it a watermark appears.

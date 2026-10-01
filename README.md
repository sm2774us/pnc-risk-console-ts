# PNC Risk Console

[![ci](https://github.com/sm2774us/pnc-risk-console/actions/workflows/pr-verification.yml/badge.svg)](https://github.com/sm2774us/pnc-risk-console/actions/workflows/pr-verification.yml)

Property & casualty **risk assessment and exposure management** console. Angular 22 (standalone, signals, zoneless) · Nx 23 · RxJS · Angular Material · Ag-Grid Enterprise 36 · NestJS 12 BFF · Docker · Kubernetes · Terraform (AWS + GCP) · GitHub Actions.

It is a showcase: synthetic data, an illustrative risk model, production-minded engineering.

## Quick start
```bash
nvm use            # Node 22.22.3 (see .nvmrc)
npm ci
npm run dev        # BFF :3000 + web :4200, then open http://localhost:4200
```
Pick a persona on the sign-in page (viewer, underwriter, risk-manager, admin). Full steps, troubleshooting and VS Code debugging: [WALKTHROUGH.md](WALKTHROUGH.md).

## Commands
| Command | Does |
|---|---|
| `npm run verify` | format check, lint, typecheck, all tests, build |
| `npm test` | unit and integration tests (Vitest) |
| `npm run test:e2e` | Playwright + axe (needs `npx playwright install chromium`) |
| `docker compose up --build` | full stack at http://localhost:8080 |

## Layout
```text
apps/bff                NestJS 12 BFF
apps/risk-console       Angular shell (routes, guards, login, theme)
apps/risk-console-e2e   Playwright + axe
libs/shared/{domain,legacy-bridge,ui}
libs/risk/{data-access,feature-dashboard,feature-exposure,feature-accumulation,feature-policy}
infra/{docker,terraform}  k8s/{base,overlays}  .github/  docs/adr
```

## Docs
[Solution-Deep-Dive](./docs/Solution-Deep-Dive.md) · [SRS](./docs/SRS.md) · [SRS-Compliance](./docs/SRS-Compliance.md) · [WALKTHROUGH](WALKTHROUGH.md) · [CHANGELOG](CHANGELOG.md) · [ADRs](docs/adr) · [CONTRIBUTING](CONTRIBUTING.md) · [SECURITY](SECURITY.md)

## Ag-Grid licence
Enterprise features require your own licence. Provide it at runtime by setting `window.__PNC_AG_LICENSE__` before the app boots (never commit a key). Without one the grid works with a watermark.

## Licence
MIT for this repository's code. Ag-Grid Enterprise is licensed separately.

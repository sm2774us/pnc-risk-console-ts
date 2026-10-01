# SRS Compliance Report: PNC Risk Console

| | |
|---|---|
| **Subject** | Shared libraries, NestJS BFF, Angular app, container files, Kubernetes manifests, Terraform, GitHub workflows |
| **Measured against** | `SRS.md` v1.0 (60 requirements) |
| **Method** | Requirement-by-requirement review against the code, plus the automated results from the authoring environment |
| **Not verified** | Playwright and axe runs, Docker image builds, GitHub Actions runs, `terraform validate`, `kubectl kustomize`, a screen reader, a real Ag-Grid licence, Windows or WSL, load |

## 1. Executive summary

* **The server-side guarantees are verified by tests over real HTTP:** deny-by-default, per-role permissions, masking and the inference guard, CSV formula safety, validation, RFC 9457 errors, rate limit, chaos injection, readiness during drain.
* **Client resilience is verified at unit and component level:** circuit breaker, backoff, idempotent retry, stale-while-error, hidden-tab polling, guards, dashboard states, policy reconciliation, accumulation preview.
* **Playwright and axe specs are written (13 tests plus a theme/page axe loop) but were NOT run**: the sandbox cannot download browsers. Every requirement that leans only on them is rated 🟡.
* **Docker, Terraform, kubectl and GitHub Actions were not exercised.** Files are written and statically consistent (names, paths, images); they have not been executed.
* **The risk model is illustrative.** Passing tests prove internal consistency (monotonic PML, parity with the legacy engine), not actuarial correctness.

### Tally
| Status | Count |
|---|---:|
| ✅ Met, with a check that ran green here | 47 |
| 🟡 Met in code, unverified here | 13 |
| 🟠 Partially met | 0 |
| ❌ Not met | 0 |
| **Total** | **60** |

**Legend.** ✅ implemented and covered by a check that ran green here · 🟡 implemented; needs a browser, Docker, CI run, cloud or human review, or has no direct test · 🟠 partial · ❌ not met.

### Evidence that ran green
| Check | Result |
|---|---|
| `npm run verify` (format, lint, typecheck, test, build) | exit 0 |
| `nx run-many -t typecheck` | 11 projects, 0 errors |
| `nx run-many -t lint` (ESLint, angular-eslint, Nx boundaries) | 11 projects, 0 errors |
| Prettier `--check` | clean (Markdown excluded by `.prettierignore`) |
| Vitest `shared-domain` | 15 passing |
| Vitest `shared-legacy-bridge` | 5 passing |
| Angular unit-test `shared-ui` | 5 passing |
| Angular unit-test `risk-data-access` | 17 passing |
| Angular unit-test feature libs and app shell | dashboard 4, exposure 4, accumulation 3, policy 3, app 3 |
| Vitest `bff` (unit 23 + integration 17) | 40 passing |
| Angular production build with budgets | succeeds |
| BFF esbuild bundle | builds; `/healthz` and demo-login smoke-tested |
| Total automated tests that ran | **99 passing** |

## 2. Traceability to the request
| Requirement in the brief | Delivered | Status |
|---|---|---|
| Angular (latest), Nx monorepo, RxJS, signals, standalone | Angular 22.2.1, Nx 23.2.1, RxJS 7.8.2, zoneless standalone components | ✅ |
| Angular Material and Ag-Grid with large datasets | Material 3 theme; Ag-Grid Enterprise 36 server-side row model over 50,000 rows (up to 1,000,000) | ✅ / 🟡 |
| TypeScript and JS (ES5/ES6+), legacy debugging | Strict TS 6; ES5 engine behind a typed anti-corruption layer with parity test | ✅ |
| Node BFF | NestJS 12 | ✅ |
| Financial-services context | P&C exposure, PML, accumulation, appetite, stress; role-based data masking | ✅ |
| Docker, Kubernetes, Terraform on GCP and AWS | Dockerfiles, Compose, base and overlays, EKS and GKE modules | 🟡 |
| GitHub Actions CI/CD, rulesets, OIDC | `pr-verification.yml`, `release.yml` (approval-gated), `housekeeping.yml`, `codeql.yml`, `deploy.yml`, `protect-main.json` | 🟡 |
| Docs and regression-test process | README, WALKTHROUGH, Deep Dive, SRS, this report, ADRs | ✅ |

## 3. Requirement-level compliance
### 3.1 Exposure grid (FR-EXP)

| ID | Status | Evidence or gap |
|---|:-:|---|
| FR-EXP-01 | ✅ | BFF *pages leaf rows and reports total as lastRow*; component *maps BFF response to grid success* |
| FR-EXP-02 | ✅ | BFF *rejects malformed or abusive requests*; integration *validates payloads (400 with field errors)* |
| FR-EXP-03 | ✅ | BFF *filters: set, text, number range, combined OR and date*, *sorts descending by numeric field* |
| FR-EXP-04 | ✅ | BFF *groups and aggregates…*, *drills into groups…*, *supports min/max/count/avg aggregations*; integration *serves grouped aggregates* |
| FR-EXP-05 | 🟡 | Implemented in `exposure-page.ts` (localStorage state); no direct test, needs a browser |
| FR-EXP-06 | ✅ | Component *cancels in-flight requests on destroy* |
| FR-EXP-07 | ✅ | BFF *neutralises formula injection and escapes quotes*; integration *exports CSV for permitted roles…*; E2E *underwriter can export CSV* (not run) |
| FR-EXP-08 | ✅ | BFF *lists distinct values only for enumerable fields*; integration *returns distinct values…* |

### 3.2 Policy detail and legacy reconciliation (FR-POL)

| ID | Status | Evidence or gap |
|---|:-:|---|
| FR-POL-01 | ✅ | Component *shows agreement between modern and legacy engines* |
| FR-POL-02 | ✅ | Component *flags disagreement and legacy failure explicitly* |
| FR-POL-03 | ✅ | Legacy-bridge *converts thrown strings…*, *accepts numeric strings…* |
| FR-POL-04 | ✅ | Legacy-bridge *parity: legacy ES5 engine equals modern domain model…* |
| FR-POL-05 | ✅ | Integration *returns distinct values and 404 for unknown policy, detail with legacy reconciliation* |

### 3.3 Portfolio, accumulation and stress (FR-ACC)

| ID | Status | Evidence or gap |
|---|:-:|---|
| FR-ACC-01 | ✅ | Component *renders KPIs, charts and the PML ladder from the store* |
| FR-ACC-02 | ✅ | Integration *summary reconciles with accumulation rows* |
| FR-ACC-03 | ✅ | Domain *PML is monotonic in return period and capped by limit* |
| FR-ACC-04 | ✅ | Component *takes the worst peril per zone and marks unmodelled zones* |
| FR-ACC-05 | ✅ | Component *renders map and previews stress without a server call…*; integration *stress increases PML for positive shocks…* |
| FR-ACC-06 | ✅ | Integration *…rejects out-of-range shocks* |
| FR-ACC-07 | ✅ | Domain *utilisation thresholds* |

### 3.4 Security and access (FR-SEC)

| ID | Status | Evidence or gap |
|---|:-:|---|
| FR-SEC-01 | ✅ | Integration *rejects anonymous, malformed and forged tokens with problem+json* |
| FR-SEC-02 | ✅ | Integration *enforces least privilege per role*; domain *viewer lacks PII and export; admin has all* |
| FR-SEC-03 | ✅ | Domain *masks deterministically…*; BFF *masks insured for roles without PII permission*; integration *returns a sorted page, masked for viewers…* |
| FR-SEC-04 | ✅ | BFF *forbids filtering or sorting on masked fields…*; integration (same paragraph as FR-SEC-03) |
| FR-SEC-05 | ✅ | Integration *sets security headers, correlation id and hides framework* |
| FR-SEC-06 | ✅ | Integration *rate limiter returns 429* |
| FR-SEC-07 | ✅ | Config *refuses unsafe production configuration* |
| FR-SEC-08 | ✅ | App *redirects anonymous users…*, *allows authenticated users*, *forbids a missing permission*; E2E auth specs (not run) |
| FR-SEC-09 | ✅ | Data-access *derives permissions, persists and restores sessions, ignores expired/corrupt ones*, *logs the user out and redirects on 401* |
| FR-SEC-10 | 🟡 | Configured in `infra/docker/nginx.conf`; image not built or served here |

### 3.5 Resilience and observability (FR-RES)

| ID | Status | Evidence or gap |
|---|:-:|---|
| FR-RES-01 | ✅ | Data-access *opens after threshold, half-opens…*, *re-opens when the probe fails*, *opens the circuit after repeated failures…* |
| FR-RES-02 | ✅ | Data-access *backoff grows exponentially…*, *retries transient GET failures…*, *does not retry non-idempotent POST…* |
| FR-RES-03 | ✅ | Data-access *serves last known good data flagged stale…*, *loads, retains data when a refresh fails…*; dashboard *flags stale data without hiding it* |
| FR-RES-04 | ✅ | Dashboard *shows a section-level error with retry…*; data-access *propagates the error when there is nothing cached* |
| FR-RES-05 | ✅ | BFF *correlation id reuses valid and replaces invalid ids*; integration *replaces malformed correlation ids* |
| FR-RES-06 | ✅ | Data-access *maps transport and problem+json failures*; integration problem+json assertions |
| FR-RES-07 | ✅ | Data-access *visiblePoll pauses while the tab is hidden and resumes when visible* |
| FR-RES-08 | ✅ | Integration *liveness/readiness are public…*, *readiness fails while draining*; BFF *flips to draining before shutdown* |
| FR-RES-09 | ✅ | Integration *chaos injection yields retriable 503…* |
| FR-RES-10 | ✅ | BFF *emits structured lines honouring level*, *is silent when level is silent* |

### 3.6 Interface and accessibility (FR-UI)

| ID | Status | Evidence or gap |
|---|:-:|---|
| FR-UI-01 | ✅ | UI *StatusChip is never colour-only* |
| FR-UI-02 | ✅ | UI *charts scale values and provide a screen-reader table* |
| FR-UI-03 | ✅ | UI *StatePanel announces errors and emits retry* |
| FR-UI-04 | 🟡 | E2E *skip link is the first tab stop* (written, not run) |
| FR-UI-05 | 🟡 | E2E `a11y.spec.ts` (written, not run); component-level a11y covered by UI tests |
| FR-UI-06 | 🟡 | Implemented in `theme.ts`; no direct test |
| FR-UI-07 | ✅ | Production build succeeds with budgets (initial 700 kB warn / 1.2 MB error) |
| FR-UI-08 | 🟡 | E2E mobile project (Pixel 7) written, not run |

### 3.7 Non-functional (NFR)

| ID | Status | Evidence or gap |
|---|:-:|---|
| NFR-01 | ✅ | `npm run lint` passes on 11 projects with `@nx/enforce-module-boundaries` |
| NFR-02 | ✅ | `nx run-many -t typecheck` passes on 11 projects |
| NFR-03 | ✅ | Domain *is deterministic per seed*; BFF *is deterministic and internally consistent* |
| NFR-04 | ✅ | `tools/build-bff.mjs` bundle built and smoke-tested (`/healthz`, demo-login) |
| NFR-05 | 🟡 | Dockerfiles, Compose and manifests configured; images not built here |
| NFR-06 | 🟡 | `k8s/base`; not rendered or validated here (no kubectl) |
| NFR-07 | 🟡 | `infra/terraform`; not validated here (no terraform) |
| NFR-08 | 🟡 | `.github/rulesets/protect-main.json`, `CODEOWNERS`; not imported into GitHub here |
| NFR-09 | 🟡 | `.github/workflows/pr-verification.yml`; not run on GitHub here |
| NFR-10 | 🟡 | `.githooks/commit-msg`; installed by `prepare`; not exercised here |
| NFR-11 | ✅ | `npm run verify` ran end to end and exited successfully (format, lint 11, typecheck 11, test 10, build 2) |
| NFR-12 | 🟡 | Stated in WALKTHROUGH Part 6 and the PR template; enforced by review |

## 4. Defects found and fixed while building
- BFF tests initially failed under Vitest because decorator metadata is not emitted; fixed with explicit `@Inject()` and `oxc.decorator.legacy`.
- Lint flagged type-only imports in BFF files; fixed with `consistent-type-imports`.
- The ESLint template processor tried to parse generated coverage HTML; `coverage` is now ignored.
- Duplicate Kubernetes files (`hpa-pdb.yaml`, `networkpolicy.yaml`) existed beside the base manifests; removed to avoid double-defined resources.

## 5. What is not verified, and how to close each gap
| Gap | How to close |
|---|---|
| Playwright and axe | `npx playwright install --with-deps chromium && npm run build && npm run test:e2e` |
| Docker images | `docker compose up --build`; check `/healthz` on :8080 and the BFF health |
| Kubernetes | `make k8s-render` then kubeconform (CI job `k8s`) |
| Terraform | `make tf-validate` (CI job `terraform`); a real `plan` needs cloud credentials |
| GitHub rulesets and Actions | Import `protect-main.json`, open one pull request, confirm `ci-ok (required check)` |
| Ag-Grid features with a licence | Set `window.__PNC_AG_LICENSE__` and exercise grouping, side bar and export by hand |
| Accessibility with assistive tech | Manual screen-reader pass on dashboard, grid and accumulation |
| Load | Run k6 or similar against `POST /exposures/query` at 1,000,000 rows |

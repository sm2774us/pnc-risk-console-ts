# Software Requirements Specification: PNC Risk Console

| | |
|---|---|
| **Product** | A property and casualty risk assessment and exposure management console with a role-aware BFF |
| **Version** | 1.0 |
| **Status** | Baseline for review |
| **Companions** | `Solution-Deep-Dive.md` (design and screens), `SRS-Compliance.md` (evidence per requirement), `WALKTHROUGH.md`, `docs/adr/` |

Keywords **MUST**, **SHOULD**, **MAY** follow RFC 2119. Priority **M**/**S**/**C** = must/should/could.

---

## 1. Introduction

### 1.1 Purpose and scope
Define what the console must do so that **underwriters** can find and inspect exposures at scale, **risk managers** can see accumulation and test stress scenarios, **viewers** can read the book without seeing sensitive names, and **admins** can see service health, while the console **stays usable when its API is degraded**.

In scope: the Angular app, the NestJS BFF, shared libraries, the legacy rating bridge, containers, Kubernetes manifests, Terraform for AWS and GCP, GitHub workflows and rulesets, and Windows/Ubuntu/WSL2 developer workflows.
Out of scope: real policy systems, a production database, a real identity provider, actuarial or regulatory modelling, payments, email.

### 1.2 Definitions
| Term | Meaning |
|---|---|
| TIV | Total insured value |
| PML | Probable maximum loss at a return period |
| Accumulation cell | A peril and zone pair with aggregated TIV and PML |
| Appetite | Configured holding limit per cell |
| SSRM | Ag-Grid server-side row model |
| BFF | Backend for frontend |
| Legacy engine | The ES5 rating engine in `legacy-bridge` |

### 1.3 References
RFC 2119, RFC 9457, WCAG 2.2 AA, OWASP ASVS (selected), Conventional Commits 1.0, Keep a Changelog 1.1.

## 2. Overall description

### 2.1 Architecture in one line
Angular 22 standalone zoneless app (signals, RxJS) → NestJS 12 BFF `/api/v1` → seeded in-memory portfolio; shared domain library used by both sides.

### 2.2 User classes
| Class | Goal | Role |
|---|---|---|
| Viewer | Read the book | `viewer` |
| Underwriter | Find, inspect and export exposures | `underwriter` |
| Risk manager | Assess accumulation and run stress | `risk-manager` |
| Administrator | Check service health | `admin` |
| Developer | Change safely | n/a |

### 2.3 Operating environment
Node ≥ 22.22 (pinned 22.22.3), evergreen browsers, Docker 24+, Kubernetes 1.30+, Terraform ≥ 1.9.

### 2.4 Constraints
TypeScript 6.0.x (required by Angular 22); Nest 12 is ESM-only; Ag-Grid Enterprise needs a commercial licence; the dataset is synthetic.

### 2.5 Clarifying assumptions
1. Authentication is a demo persona picker; production uses an OIDC provider and `AUTH_MODE=jwt`.
2. The risk model is illustrative and not a regulatory model.
3. The portfolio fits in BFF memory (up to 1,000,000 rows); a warehouse would replace it behind the same contract.
4. Ag-Grid licence keys are supplied at runtime by the operator.

## 3. Specific requirements
### 3.1 Exposure grid (FR-EXP)

| ID | Pri | Requirement |
|---|:-:|---|
| FR-EXP-01 | M | The grid MUST load rows through a server-side row model in blocks of at most 100 rows. |
| FR-EXP-02 | M | The server MUST cap a page at 1,000 rows and reject malformed or abusive requests. |
| FR-EXP-03 | M | The server MUST support text, number, set, date and combined filters and multi-column sorting. |
| FR-EXP-04 | M | The server MUST support row grouping with drill-down and sum/avg/min/max/count aggregates, including an exposure-weighted loss ratio. |
| FR-EXP-05 | S | The UI SHOULD offer a side bar with filters and columns, and persist column layout between visits. |
| FR-EXP-06 | M | The UI MUST cancel in-flight block requests when the grid is destroyed. |
| FR-EXP-07 | M | A user with `exposure:export` MUST be able to download CSV; cells beginning with `= + - @` MUST be neutralised. |
| FR-EXP-08 | S | The grid SHOULD list distinct values for set filters on enumerable fields only. |

### 3.2 Policy detail and legacy reconciliation (FR-POL)

| ID | Pri | Requirement |
|---|:-:|---|
| FR-POL-01 | M | The policy page MUST show the modern rating and the legacy-engine rating side by side. |
| FR-POL-02 | M | Disagreement or legacy failure MUST be flagged explicitly and MUST NOT hide the modern result. |
| FR-POL-03 | M | The legacy ES5 engine MUST be wrapped by a typed adapter that converts thrown strings to typed errors and normalises numeric-string input. |
| FR-POL-04 | M | The adapter MUST be proven equal to the modern model over a grid of inputs. |
| FR-POL-05 | M | Unknown policy ids MUST return 404 problem+json. |

### 3.3 Portfolio, accumulation and stress (FR-ACC)

| ID | Pri | Requirement |
|---|:-:|---|
| FR-ACC-01 | M | The dashboard MUST show total insured value, premium, expected loss, loss ratio, PML ladder, trend and breakdowns. |
| FR-ACC-02 | M | Summary figures MUST reconcile with accumulation rows. |
| FR-ACC-03 | M | PML MUST be non-decreasing in return period and never exceed the limit. |
| FR-ACC-04 | M | The accumulation map MUST show the worst peril per zone and mark unmodelled zones. |
| FR-ACC-05 | M | Stress preview MUST run in the browser without a server call; the server run MUST be authoritative. |
| FR-ACC-06 | M | Stress shocks outside the allowed range MUST be rejected. |
| FR-ACC-07 | S | Appetite utilisation SHOULD classify cells as ok, watch or breach. |

### 3.4 Security and access (FR-SEC)

| ID | Pri | Requirement |
|---|:-:|---|
| FR-SEC-01 | M | Every route MUST deny by default unless explicitly public. |
| FR-SEC-02 | M | Permissions MUST follow the role matrix in Appendix A for every route. |
| FR-SEC-03 | M | Insured names MUST be masked without `exposure:read-pii`, deterministically. |
| FR-SEC-04 | M | Filtering or sorting on a masked field MUST be refused (403). |
| FR-SEC-05 | M | Responses MUST carry security headers and MUST NOT disclose the framework. |
| FR-SEC-06 | M | The API MUST rate-limit and return 429. |
| FR-SEC-07 | M | Production MUST refuse default secrets, demo authentication and unauthorised chaos injection. |
| FR-SEC-08 | M | The app MUST redirect anonymous users to sign-in keeping a return URL, and forbid missing permissions. |
| FR-SEC-09 | M | Expired or corrupt sessions MUST be ignored and a 401 MUST sign the user out. |
| FR-SEC-10 | S | The web image SHOULD send CSP, nosniff, frame and referrer headers. |

### 3.5 Resilience and observability (FR-RES)

| ID | Pri | Requirement |
|---|:-:|---|
| FR-RES-01 | M | Clients MUST open a circuit after repeated failures, fail fast and recover after a cool-down. |
| FR-RES-02 | M | Only idempotent calls MAY be retried, with exponential backoff, jitter and Retry-After. |
| FR-RES-03 | M | When refresh fails, last known data MUST remain visible and be flagged stale. |
| FR-RES-04 | M | With no cached data, a section-level error with retry and correlation id MUST show. |
| FR-RES-05 | M | Every request MUST carry a correlation id; malformed inbound ids MUST be replaced. |
| FR-RES-06 | M | Errors MUST be RFC 9457 problem+json including the correlation id. |
| FR-RES-07 | M | Polling MUST pause while the tab is hidden. |
| FR-RES-08 | M | Liveness and readiness MUST be public; readiness MUST fail while draining. |
| FR-RES-09 | S | Development chaos injection SHOULD yield retriable 503 with Retry-After and exempt health. |
| FR-RES-10 | S | Logs SHOULD be structured JSON honouring level. |

### 3.6 Interface and accessibility (FR-UI)

| ID | Pri | Requirement |
|---|:-:|---|
| FR-UI-01 | M | Status MUST NOT be conveyed by colour alone. |
| FR-UI-02 | M | Charts MUST provide a screen-reader table. |
| FR-UI-03 | M | Errors MUST be announced and offer retry. |
| FR-UI-04 | M | A skip link MUST be the first tab stop. |
| FR-UI-05 | M | Pages MUST pass automated axe scans in both themes. |
| FR-UI-06 | S | Light and dark themes SHOULD be supported and persisted. |
| FR-UI-07 | S | Routes SHOULD be lazy-loaded with per-feature chunks within a bundle budget. |
| FR-UI-08 | S | The UI SHOULD work at 360 px width. |

### 3.7 Non-functional (NFR)

| ID | Pri | Requirement |
|---|:-:|---|
| NFR-01 | M | Layering MUST be enforced by lint (app → feature → data-access/ui → domain). |
| NFR-02 | M | TypeScript MUST compile in strict mode with `noUncheckedIndexedAccess`. |
| NFR-03 | M | The default dataset MUST be deterministic for a seed. |
| NFR-04 | M | The BFF MUST ship as a single bundled file runnable without `node_modules`. |
| NFR-05 | M | Containers MUST run non-root, read-only root filesystem, no capabilities. |
| NFR-06 | M | Kubernetes manifests MUST include probes, resources, HPA, PDB, default-deny NetworkPolicy and `restricted` Pod Security. |
| NFR-07 | M | Terraform MUST cover AWS (EKS) and GCP (GKE) with keyless GitHub OIDC trusted for one repository. |
| NFR-08 | M | The main branch MUST require one check named `ci-ok (required check)`, one code-owner review and linear history. |
| NFR-09 | M | CI MUST aggregate verify, e2e, docker, terraform and k8s into the single required check. |
| NFR-10 | M | Commits MUST follow Conventional Commits via a local hook. |
| NFR-11 | S | `npm run verify` SHOULD run format, lint, typecheck, tests and build end to end. |
| NFR-12 | M | Every enhancement or fix MUST add regression tests (process rule). |

## 4. External interfaces

### 4.1 API
Base path `/api/v1`; health at `/healthz` and `/readyz`. Errors are `application/problem+json` with `type`, `title`, `status`, `detail`, `correlationId` and, for validation, field errors. The route table is in `Solution-Deep-Dive.md` §3.

### 4.2 Types
Single source: `libs/shared/domain/src/lib/types.ts` (Exposure, AccumulationCell, PortfolioSummary, StressRequest/Result, SsrmRequest/Response, AuthUser, ProblemDetails, PolicyDetail).

### 4.3 Configuration
Environment variables validated by zod in `apps/bff/src/config/env.ts` (`PORT`, `AUTH_MODE`, `JWT_SECRET`, `CORS_ORIGINS`, `DATASET_SIZE`, `DATASET_SEED`, `CHAOS_RATE`, `RATE_LIMIT_PER_MIN`, `LOG_LEVEL`, and others).

## 5. Data requirements
Rows are synthetic and generated from a seeded PRNG (default seed 20261001, 50,000 rows, 1,000 to 1,000,000 allowed). No real personal data is stored. Session tokens live in `sessionStorage`; column layout in `localStorage`.

## 6. Verification approach
Unit (Vitest), integration (Vitest + supertest over real HTTP), component (Angular unit-test with Vitest), end-to-end (Playwright + axe), static (ESLint with Nx boundaries, TypeScript strict, Prettier), and pipeline checks (CI). Evidence per requirement is in `SRS-Compliance.md`.

## Appendix A: Access matrix (mirrors the code)
| Permission | viewer | underwriter | risk-manager | admin |
|---|:-:|:-:|:-:|:-:|
| exposure:read | ✅ | ✅ | ✅ | ✅ |
| portfolio:read | ✅ | ✅ | ✅ | ✅ |
| exposure:read-pii | | ✅ | ✅ | ✅ |
| exposure:export | | ✅ | ✅ | ✅ |
| stress:run | | | ✅ | ✅ |
| admin:status | | | | ✅ |

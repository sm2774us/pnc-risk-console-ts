# ADR 0004: NestJS BFF with deny-by-default authorization

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
The browser needs one stable, role-aware API and must not receive data it is not entitled to.

## Decision
NestJS 12 (ESM). Global `AuthGuard` denies unless `@Public`; routes declare `@RequirePermissions`. Roles map to permissions in one shared matrix. Insured names are masked without `exposure:read-pii`, and the query engine rejects filters or sorts on masked fields (403) so values cannot be inferred. Production refuses default secrets, demo auth and chaos injection.

## Consequences
Authorization is testable in one place and mirrored by the UI guards. Demo auth is a development convenience only.

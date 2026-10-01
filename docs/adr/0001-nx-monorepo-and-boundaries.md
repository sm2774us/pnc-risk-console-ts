# ADR 0001: Nx monorepo with enforced module boundaries

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
One repo holds the Angular app, the NestJS BFF and shared libraries. Without rules, feature code drifts into tangled imports.

## Decision
Nx 23 with tagged projects (`scope:*`, `type:*`). `@nx/enforce-module-boundaries` in `eslint.config.mjs` allows only app → feature → data-access/ui → domain. `@nx/nest` is not used because its peers cap below Nest 12; the BFF uses plain `nx:run-commands` targets.

## Consequences
Illegal imports fail lint and therefore the required CI check. Affected-only builds are possible. The BFF has a hand-written target set to maintain.

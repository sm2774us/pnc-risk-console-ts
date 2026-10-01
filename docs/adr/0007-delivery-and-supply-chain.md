# ADR 0007: Delivery: one required check, OIDC, hardened images

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Branch protection should not break when jobs are added, and long-lived cloud keys are a liability.

## Decision
The ruleset requires one check, `ci-ok (required check)`, which aggregates verify, e2e, docker, terraform and k8s jobs. Deploys use GitHub OIDC to AWS or GCP roles trusted for one repository and environment. Images are non-root, read-only-rootfs, capability-dropped; the BFF image is a single bundle on distroless.

## Consequences
New jobs join `needs:` without touching the ruleset. Deployments need an approved environment.

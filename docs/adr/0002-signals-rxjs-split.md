# ADR 0002: Signals for state, RxJS for streams

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Angular 22 is zoneless and signal-first, but polling, retry, backoff and cancellation are stream problems.

## Decision
Components read signals. `PortfolioStore` runs RxJS (`visiblePoll`, `switchMap`, `retry` with backoff) and exposes the result through `toSignal`. Circuit-breaker state is a signal. No `Subject` leaks out of a store.

## Consequences
Templates stay simple and OnPush-free of manual subscriptions. Both idioms are shown deliberately; contributors must keep the boundary.

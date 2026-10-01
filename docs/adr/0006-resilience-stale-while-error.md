# ADR 0006: Client resilience pipeline

- Status: Accepted
- Decision: Interceptors in order: correlation id, auth, circuit breaker, retry with exponential backoff and jitter (idempotent calls only, marked by an `HttpContext` token). Reads fall back to the last known good value flagged stale; the shell shows a degraded banner.
- Consequences: Users keep context during incidents. Stale data is always labelled.

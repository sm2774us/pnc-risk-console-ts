# ADR 0003: Ag-Grid Enterprise server-side row model

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
The portfolio has 50,000 policy rows by default (up to 1,000,000). The browser must never hold them all.

## Decision
Server-side row model with 100-row blocks. The BFF owns filtering, sorting, grouping, aggregation, the exposure-weighted loss ratio and a 1,000-row page cap. Column state persists in `localStorage`. The licence key is injected at runtime, never committed.

## Consequences
Constant client memory and fast first paint. Grouping and aggregation logic lives in the BFF and is tested there. Enterprise requires a commercial licence; without a key a watermark shows.

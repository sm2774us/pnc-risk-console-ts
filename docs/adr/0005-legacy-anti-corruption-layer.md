# ADR 0005: Anti-corruption layer for the legacy ES5 rating engine

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Financial services estates keep ES5 code that throws strings, accepts numeric strings and mutates globals.

## Decision
The ES5 IIFE stays unchanged. A typed adapter reads it from `globalThis`, normalises inputs, converts thrown strings to `LegacyRatingError`, and a parity test compares it with the modern model. The policy page shows both results side by side.

## Consequences
Migration is observable instead of a big bang. Drift between engines fails a test.

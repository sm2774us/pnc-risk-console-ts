import { signal } from '@angular/core';

export type BreakerState = 'closed' | 'open' | 'half-open';
export interface BreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
}

/**
 * Classic three-state circuit breaker.
 * closed -> (N consecutive failures) -> open -> (cooldown) -> half-open -> (probe ok) -> closed | (probe fails) -> open
 * The state is a signal so the UI can render it.
 */
export class CircuitBreaker {
  readonly state = signal<BreakerState>('closed');
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  private readonly now: () => number;

  constructor(private readonly opts: BreakerOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** Returns false while open; after the cooldown lets exactly one probe request through. */
  canRequest(): boolean {
    if (this.state() === 'closed') return true;
    if (this.state() === 'open') {
      if (this.now() - this.openedAt < this.opts.cooldownMs) return false;
      this.state.set('half-open');
      this.probing = true;
      return true;
    }
    if (this.probing) return false; // half-open: a probe is already in flight
    this.probing = true;
    return true;
  }

  retryAfterMs(): number {
    return Math.max(0, this.opts.cooldownMs - (this.now() - this.openedAt));
  }

  recordSuccess(): void {
    this.failures = 0;
    this.probing = false;
    this.state.set('closed');
  }

  recordFailure(): void {
    this.probing = false;
    this.failures++;
    if (this.state() === 'half-open' || this.failures >= this.opts.failureThreshold) {
      this.openedAt = this.now();
      this.state.set('open');
    }
  }
}

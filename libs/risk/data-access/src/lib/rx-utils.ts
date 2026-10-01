import { EMPTY, type Observable, fromEvent, map, startWith, switchMap, timer } from 'rxjs';

/** Emits immediately and then every `periodMs`, but only while the tab is visible (saves load on the BFF). */
export function visiblePoll(periodMs: number, doc: Document = document): Observable<number> {
  return fromEvent(doc, 'visibilitychange').pipe(
    map(() => !doc.hidden),
    startWith(!doc.hidden),
    switchMap((visible) => (visible ? timer(0, periodMs) : EMPTY)),
  );
}

/** Exponential backoff with jitter; honours a Retry-After hint (seconds) up to a cap. */
export function backoffDelayMs(
  attempt: number,
  baseMs: number,
  jitterMs: number,
  retryAfterSec?: number | null,
  rand: () => number = Math.random,
): number {
  if (retryAfterSec && retryAfterSec > 0) return Math.min(5000, retryAfterSec * 1000);
  return Math.min(8000, baseMs * 2 ** (attempt - 1)) + Math.floor(rand() * jitterMs);
}

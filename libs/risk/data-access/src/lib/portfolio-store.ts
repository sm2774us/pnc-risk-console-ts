import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { PortfolioSummary } from '@pnc/shared/domain';
import { BehaviorSubject, catchError, map, of, scan, startWith, switchMap } from 'rxjs';
import { type AppError, toAppError } from './app-error';
import { RiskApi } from './risk-api';
import { visiblePoll } from './rx-utils';

export type Status = 'loading' | 'ready' | 'stale' | 'error';
export interface PortfolioVm {
  status: Status;
  data: PortfolioSummary | null;
  error: AppError | null;
  at: number | null;
}
const INITIAL: PortfolioVm = { status: 'loading', data: null, error: null, at: null };
export const POLL_MS = 60_000;

/**
 * Signal-facing store over an RxJS pipeline:
 *   manual reload + visibility-aware polling -> switchMap (cancels in-flight) -> scan (retains last data on failure).
 */
@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  private readonly api = inject(RiskApi);
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  readonly vm = toSignal(
    this.reload$.pipe(
      switchMap(() => visiblePoll(POLL_MS)),
      switchMap(() =>
        this.api.summary$().pipe(
          map((r): Partial<PortfolioVm> => ({ status: r.stale ? 'stale' : 'ready', data: r.data, error: null, at: r.at })),
          catchError((e: unknown) => of<Partial<PortfolioVm>>({ status: 'error', error: toAppError(e) })),
        ),
      ),
      scan((prev, next): PortfolioVm => ({ ...prev, ...next }), INITIAL),
      startWith(INITIAL),
    ),
    { requireSync: true },
  );

  readonly summary = computed(() => this.vm().data);
  readonly status = computed(() => this.vm().status);
  reload(): void {
    this.reload$.next();
  }
}

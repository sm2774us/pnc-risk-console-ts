import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  AccumulationRow,
  FilterModel,
  PolicyDetail,
  PortfolioSummary,
  ReturnPeriod,
  ServiceStatus,
  SortModelItem,
  SsrmRequest,
  SsrmResponse,
  StressRequest,
  StressResult,
} from '@pnc/shared/domain';
import { type Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { ApiCircuitBreaker, API_BASE_URL, IDEMPOTENT } from './interceptors';

export interface Fetched<T> {
  data: T;
  stale: boolean;
  at: number;
}

/** Connectivity facts surfaced to the shell (banner) without coupling features to transport details. */
@Injectable({ providedIn: 'root' })
export class ApiHealth {
  readonly breaker = inject(ApiCircuitBreaker);
  private readonly staleKeys = signal<ReadonlySet<string>>(new Set());
  readonly anyStale = computed(() => this.staleKeys().size > 0);
  readonly degraded = computed(() => this.breaker.state() !== 'closed' || this.anyStale());
  markStale(key: string, stale: boolean): void {
    const next = new Set(this.staleKeys());
    if (stale) next.add(key);
    else next.delete(key);
    this.staleKeys.set(next);
  }
}

@Injectable({ providedIn: 'root' })
export class RiskApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly health = inject(ApiHealth);
  private readonly cache = new Map<string, { data: unknown; at: number }>();
  private readonly idempotent = new HttpContext().set(IDEMPOTENT, true);

  /** Stale-while-error: if the call fails after retries, serve the last known good value flagged as stale. */
  private withFallback<T>(key: string, source: Observable<T>): Observable<Fetched<T>> {
    return source.pipe(
      map((data) => ({ data, stale: false, at: Date.now() })),
      tap((r) => {
        this.cache.set(key, { data: r.data, at: r.at });
        this.health.markStale(key, false);
      }),
      catchError((err: unknown) => {
        const hit = this.cache.get(key);
        if (!hit) return throwError(() => err);
        this.health.markStale(key, true);
        return of({ data: hit.data as T, stale: true, at: hit.at });
      }),
    );
  }

  summary$(): Observable<Fetched<PortfolioSummary>> {
    return this.withFallback('summary', this.http.get<PortfolioSummary>(`${this.base}/portfolio/summary`));
  }

  accumulation$(rp: ReturnPeriod = 100): Observable<Fetched<AccumulationRow[]>> {
    return this.withFallback(
      `acc:${rp}`,
      this.http.get<AccumulationRow[]>(`${this.base}/portfolio/accumulation`, { params: new HttpParams().set('returnPeriod', rp) }),
    );
  }

  stress$(req: StressRequest): Observable<StressResult> {
    return this.http.post<StressResult>(`${this.base}/portfolio/stress`, req, { context: this.idempotent });
  }

  detail$(id: string): Observable<PolicyDetail> {
    return this.http.get<PolicyDetail>(`${this.base}/exposures/${encodeURIComponent(id)}`);
  }

  queryExposures$(req: SsrmRequest): Observable<SsrmResponse> {
    return this.http.post<SsrmResponse>(`${this.base}/exposures/query`, req, { context: this.idempotent });
  }

  distinct$(field: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/exposures/distinct/${encodeURIComponent(field)}`);
  }

  exportCsv$(filterModel: FilterModel, sortModel: SortModelItem[]): Observable<Blob> {
    const params = new HttpParams().set('filterModel', JSON.stringify(filterModel)).set('sortModel', JSON.stringify(sortModel));
    return this.http.get(`${this.base}/exposures/export.csv`, { params, responseType: 'blob' });
  }

  status$(): Observable<ServiceStatus> {
    return this.http.get<ServiceStatus>(`${this.base}/status`);
  }
}

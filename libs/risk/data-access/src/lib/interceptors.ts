import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, tap, throwError, timer } from 'rxjs';
import { CircuitOpenError } from './app-error';
import { AuthStore } from './auth-store';
import { CircuitBreaker } from './circuit-breaker';
import { backoffDelayMs } from './rx-utils';

/** Marks a request as safe to retry (GETs are implicit; read-only POSTs such as SSRM queries opt in). */
export const IDEMPOTENT = new HttpContextToken<boolean>(() => false);
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { providedIn: 'root', factory: () => '/api/v1' });

export interface ResilienceConfig {
  retryCount: number;
  baseMs: number;
  jitterMs: number;
  failureThreshold: number;
  cooldownMs: number;
}
export const RESILIENCE_CONFIG = new InjectionToken<ResilienceConfig>('RESILIENCE_CONFIG', {
  providedIn: 'root',
  factory: () => ({ retryCount: 3, baseMs: 250, jitterMs: 120, failureThreshold: 5, cooldownMs: 15_000 }),
});

@Injectable({ providedIn: 'root' })
export class ApiCircuitBreaker extends CircuitBreaker {
  constructor() {
    const c = inject(RESILIENCE_CONFIG);
    super({ failureThreshold: c.failureThreshold, cooldownMs: c.cooldownMs });
  }
}

const RETRIABLE = new Set([0, 429, 502, 503, 504]);
const isRetriable = (e: unknown): e is HttpErrorResponse => e instanceof HttpErrorResponse && RETRIABLE.has(e.status);

/** Outermost: traceability. Every request carries an id the BFF echoes back and logs. */
export const correlationInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.headers.has('x-correlation-id') ? req : req.clone({ setHeaders: { 'x-correlation-id': crypto.randomUUID() } }));

/** Attaches the bearer token to API calls only (never to third-party origins) and handles 401 centrally. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  if (!req.url.startsWith(base)) return next(req);
  const auth = inject(AuthStore);
  const router = inject(Router);
  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && !req.url.endsWith('/auth/demo-login')) {
        auth.logout();
        void router.navigate(['/login'], { queryParams: { reason: 'expired' } });
      }
      return throwError(() => e);
    }),
  );
};

/** Fail fast while the upstream is known-bad; observes the FINAL outcome after retries. */
export const circuitBreakerInterceptor: HttpInterceptorFn = (req, next) => {
  const breaker = inject(ApiCircuitBreaker);
  if (!breaker.canRequest()) return throwError(() => new CircuitOpenError(breaker.retryAfterMs()));
  return next(req).pipe(
    tap({
      next: (ev) => {
        if ('status' in ev) breaker.recordSuccess();
      },
    }),
    catchError((e: unknown) => {
      // Client errors (4xx except 429) are the caller's fault, not a sign the upstream is unhealthy.
      if (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 500 || e.status === 429)) breaker.recordFailure();
      else breaker.recordSuccess();
      return throwError(() => e);
    }),
  );
};

/** Retries transient failures of idempotent requests with exponential backoff + jitter. */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  const cfg = inject(RESILIENCE_CONFIG);
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.context.get(IDEMPOTENT);
  if (!safe) return next(req);
  return next(req).pipe(
    retry({
      count: cfg.retryCount,
      delay: (err: unknown, attempt: number) => {
        if (!isRetriable(err)) return throwError(() => err);
        const hint = Number(err.headers?.get('retry-after'));
        return timer(backoffDelayMs(attempt, cfg.baseMs, cfg.jitterMs, Number.isFinite(hint) ? hint : null));
      },
    }),
  );
};

export const RISK_INTERCEPTORS = [correlationInterceptor, authInterceptor, circuitBreakerInterceptor, retryInterceptor];

import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiCircuitBreaker,
  AuthStore,
  CircuitBreaker,
  CircuitOpenError,
  PortfolioStore,
  RESILIENCE_CONFIG,
  RISK_INTERCEPTORS,
  RiskApi,
  ApiHealth,
  backoffDelayMs,
  toAppError,
  visiblePoll,
  IDEMPOTENT,
} from '../index';
import { HttpContext } from '@angular/common/http';

const tick = (ms = 8) => new Promise((r) => setTimeout(r, ms));
const fast = { retryCount: 2, baseMs: 1, jitterMs: 0, failureThreshold: 3, cooldownMs: 40 };

function setup() {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors(RISK_INTERCEPTORS)),
      provideHttpClientTesting(),
      { provide: RESILIENCE_CONFIG, useValue: fast },
    ],
  });
  return { http: TestBed.inject(HttpClient), ctl: TestBed.inject(HttpTestingController) };
}

describe('CircuitBreaker', () => {
  it('opens after threshold, half-opens after cooldown, closes on successful probe', () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100, now: () => t });
    expect(b.canRequest()).toBe(true);
    b.recordFailure();
    expect(b.state()).toBe('closed');
    b.recordFailure();
    expect(b.state()).toBe('open');
    expect(b.canRequest()).toBe(false);
    expect(b.retryAfterMs()).toBe(100);
    t = 150;
    expect(b.canRequest()).toBe(true);
    expect(b.state()).toBe('half-open');
    expect(b.canRequest()).toBe(false); // only one probe
    b.recordSuccess();
    expect(b.state()).toBe('closed');
  });
  it('re-opens when the probe fails', () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10, now: () => t });
    b.recordFailure();
    t = 20;
    expect(b.canRequest()).toBe(true);
    b.recordFailure();
    expect(b.state()).toBe('open');
    t = 40;
    b.canRequest();
    b.recordSuccess();
    t = 41;
    expect(b.canRequest()).toBe(true);
  });
  it('uses wall clock by default', () => {
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 0 });
    b.recordFailure();
    expect(b.canRequest()).toBe(true);
  });
});

describe('rx utils', () => {
  it('backoff grows exponentially, caps, and honours Retry-After', () => {
    expect(backoffDelayMs(1, 100, 0, null)).toBe(100);
    expect(backoffDelayMs(3, 100, 0, null)).toBe(400);
    expect(backoffDelayMs(20, 100, 0, null)).toBe(8000);
    expect(backoffDelayMs(1, 100, 50, null, () => 0.5)).toBe(125);
    expect(backoffDelayMs(1, 100, 0, 2)).toBe(2000);
    expect(backoffDelayMs(1, 100, 0, 99)).toBe(5000);
  });
  it('visiblePoll pauses while the tab is hidden and resumes when visible', async () => {
    const target = new EventTarget();
    const doc = Object.assign(target, { hidden: false }) as unknown as Document;
    const seen: number[] = [];
    const sub = visiblePoll(5, doc).subscribe((n) => seen.push(n));
    await tick(18);
    const before = seen.length;
    expect(before).toBeGreaterThan(1);
    (doc as { hidden: boolean }).hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    await tick(8);
    const paused = seen.length;
    await tick(20);
    expect(seen.length).toBe(paused);
    (doc as { hidden: boolean }).hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    await tick(8);
    expect(seen.length).toBeGreaterThan(paused);
    sub.unsubscribe();
  });
});

describe('toAppError', () => {
  const he = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });
  it('maps transport and problem+json failures', () => {
    expect(toAppError(he(0)).kind).toBe('network');
    expect(toAppError(he(401)).kind).toBe('auth');
    expect(toAppError(he(403, { detail: 'nope' })).message).toBe('nope');
    expect(toAppError(he(400, { title: 'Bad', correlationId: 'c1' }))).toMatchObject({
      kind: 'validation',
      correlationId: 'c1',
      retriable: false,
    });
    expect(toAppError(he(429)).retriable).toBe(true);
    expect(toAppError(he(503)).kind).toBe('server');
    expect(toAppError(new CircuitOpenError(5)).kind).toBe('circuit-open');
    expect(toAppError(new Error('x'))).toMatchObject({ kind: 'unknown', message: 'x' });
    expect(toAppError('weird').message).toBe('Unexpected error');
  });
});

describe('HTTP resilience pipeline', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('adds a correlation id and bearer token to API calls only', async () => {
    const { http, ctl } = setup();
    const auth = TestBed.inject(AuthStore);
    const login = firstValueFrom(auth.login('u-uw'));
    ctl.expectOne('/api/v1/auth/demo-login').flush({
      accessToken: 'tok',
      expiresIn: 3600,
      user: { sub: 'u-uw', name: 'U', role: 'underwriter', permissions: ['exposure:read'] },
    });
    await login;
    const p = firstValueFrom(http.get('/api/v1/x'));
    const r = ctl.expectOne('/api/v1/x');
    expect(r.request.headers.get('Authorization')).toBe('Bearer tok');
    expect(r.request.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    r.flush({});
    await p;
    const q = firstValueFrom(http.get('https://third.party/x'));
    const r2 = ctl.expectOne('https://third.party/x');
    expect(r2.request.headers.has('Authorization')).toBe(false);
    r2.flush({});
    await q;
  });

  it('retries transient GET failures with backoff and then succeeds', async () => {
    const { http, ctl } = setup();
    const p = firstValueFrom(http.get<{ ok: boolean }>('/api/v1/flaky'));
    ctl.expectOne('/api/v1/flaky').flush('', { status: 503, statusText: 'Unavailable' });
    await tick();
    ctl.expectOne('/api/v1/flaky').flush('', { status: 503, statusText: 'Unavailable' });
    await tick();
    ctl.expectOne('/api/v1/flaky').flush({ ok: true });
    expect(await p).toEqual({ ok: true });
  });

  it('does not retry non-idempotent POST nor client errors; retries read-only POST when flagged', async () => {
    const { http, ctl } = setup();
    const post = firstValueFrom(http.post('/api/v1/mutate', {})).catch((e: HttpErrorResponse) => e.status);
    ctl.expectOne('/api/v1/mutate').flush('', { status: 503, statusText: 'x' });
    expect(await post).toBe(503);
    const bad = firstValueFrom(http.get('/api/v1/bad')).catch((e: HttpErrorResponse) => e.status);
    ctl.expectOne('/api/v1/bad').flush('', { status: 400, statusText: 'x' });
    expect(await bad).toBe(400);
    const ro = firstValueFrom(http.post('/api/v1/ro', {}, { context: new HttpContext().set(IDEMPOTENT, true) }));
    ctl.expectOne('/api/v1/ro').flush('', { status: 503, statusText: 'x' });
    await tick();
    ctl.expectOne('/api/v1/ro').flush({ done: 1 });
    expect(await ro).toEqual({ done: 1 });
  });

  it('opens the circuit after repeated failures and fails fast, then recovers after cooldown', async () => {
    const { http, ctl } = setup();
    const breaker = TestBed.inject(ApiCircuitBreaker);
    for (let i = 0; i < 3; i++) {
      const p = firstValueFrom(http.post('/api/v1/w', {})).catch(() => 0);
      ctl.expectOne('/api/v1/w').flush('', { status: 500, statusText: 'x' });
      await p;
    }
    expect(breaker.state()).toBe('open');
    await expect(firstValueFrom(http.get('/api/v1/any'))).rejects.toBeInstanceOf(CircuitOpenError);
    ctl.expectNone('/api/v1/any');
    await tick(60);
    const probe = firstValueFrom(http.get('/api/v1/any'));
    ctl.expectOne('/api/v1/any').flush({ ok: 1 });
    await probe;
    expect(breaker.state()).toBe('closed');
  });

  it('logs the user out and redirects on 401', async () => {
    const { http, ctl } = setup();
    const auth = TestBed.inject(AuthStore);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const l = firstValueFrom(auth.login('u-uw'));
    ctl
      .expectOne('/api/v1/auth/demo-login')
      .flush({ accessToken: 't', expiresIn: 60, user: { sub: 'u', name: 'U', role: 'viewer', permissions: [] } });
    await l;
    expect(auth.isAuthenticated()).toBe(true);
    const p = firstValueFrom(http.get('/api/v1/secure')).catch(() => 'err');
    ctl.expectOne('/api/v1/secure').flush('', { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(auth.isAuthenticated()).toBe(false);
    expect(nav).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired' } });
  });
});

describe('AuthStore', () => {
  it('derives permissions, persists and restores sessions, ignores expired/corrupt ones', async () => {
    const { ctl } = setup();
    const auth = TestBed.inject(AuthStore);
    expect(auth.can('exposure:read')).toBe(false);
    const l = firstValueFrom(auth.login('u-rm'));
    ctl
      .expectOne('/api/v1/auth/demo-login')
      .flush({ accessToken: 't', expiresIn: 60, user: { sub: 'u-rm', name: 'R', role: 'risk-manager', permissions: ['stress:run'] } });
    await l;
    expect(auth.can('stress:run')).toBe(true);
    expect(auth.can('admin:status')).toBe(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true);
    sessionStorage.setItem('pnc.session.v1', JSON.stringify({ token: 'x', user: {}, expiresAt: 1 }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    sessionStorage.setItem('pnc.session.v1', '{not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    TestBed.inject(AuthStore).logout();
  });
});

describe('RiskApi stale-while-error', () => {
  it('serves last known good data flagged stale when the upstream fails, and recovers', async () => {
    const { ctl } = setup();
    const api = TestBed.inject(RiskApi);
    const health = TestBed.inject(ApiHealth);
    const summary = { policies: 1 };
    const first = firstValueFrom(api.summary$());
    ctl.expectOne('/api/v1/portfolio/summary').flush(summary);
    expect((await first).stale).toBe(false);

    const second = firstValueFrom(api.summary$());
    for (let i = 0; i < 3; i++) {
      await tick();
      ctl.expectOne('/api/v1/portfolio/summary').flush('', { status: 503, statusText: 'x' });
    }
    const r = await second;
    expect(r.stale).toBe(true);
    expect(r.data).toEqual(summary);
    expect(health.anyStale()).toBe(true);
    expect(health.degraded()).toBe(true);

    const third = firstValueFrom(api.summary$());
    ctl.expectOne('/api/v1/portfolio/summary').flush(summary);
    await third;
    expect(health.anyStale()).toBe(false);
  });
  it('propagates the error when there is nothing cached', async () => {
    const { ctl } = setup();
    const api = TestBed.inject(RiskApi);
    const p = firstValueFrom(api.accumulation$(250)).catch((e: HttpErrorResponse) => e.status);
    ctl
      .expectOne((r) => r.url === '/api/v1/portfolio/accumulation' && r.params.get('returnPeriod') === '250')
      .flush('', { status: 404, statusText: 'x' });
    expect(await p).toBe(404);
  });
  it('builds expected URLs for the remaining endpoints', async () => {
    const { ctl } = setup();
    const api = TestBed.inject(RiskApi);
    void firstValueFrom(api.detail$('E 1'));
    ctl.expectOne('/api/v1/exposures/E%201').flush({});
    void firstValueFrom(api.distinct$('lob'));
    ctl.expectOne('/api/v1/exposures/distinct/lob').flush([]);
    void firstValueFrom(api.status$());
    ctl.expectOne('/api/v1/status').flush({});
    void firstValueFrom(api.stress$({ returnPeriod: 100, perilShocks: {} }));
    ctl.expectOne('/api/v1/portfolio/stress').flush({});
    void firstValueFrom(
      api.queryExposures$({ startRow: 0, endRow: 1, rowGroupCols: [], valueCols: [], groupKeys: [], filterModel: {}, sortModel: [] }),
    );
    ctl.expectOne('/api/v1/exposures/query').flush({});
    void firstValueFrom(api.exportCsv$({}, []));
    const csv = ctl.expectOne((r) => r.url === '/api/v1/exposures/export.csv');
    expect(csv.request.responseType).toBe('blob');
    csv.flush(new Blob(['a']));
  });
});

describe('PortfolioStore', () => {
  it('loads, retains data when a refresh fails, and reports error before any data', async () => {
    const { ctl } = setup();
    const store = TestBed.inject(PortfolioStore);
    TestBed.tick();
    expect(store.status()).toBe('loading');
    await tick();
    ctl.expectOne('/api/v1/portfolio/summary').flush({ policies: 5 });
    await tick();
    TestBed.tick();
    expect(store.status()).toBe('ready');
    expect(store.summary()?.policies).toBe(5);
    store.reload();
    for (let i = 0; i < 3; i++) {
      await tick();
      ctl.expectOne('/api/v1/portfolio/summary').flush('', { status: 503, statusText: 'x' });
    }
    await tick();
    TestBed.tick();
    expect(store.status()).toBe('stale');
    expect(store.summary()?.policies).toBe(5);
  });
  it('surfaces an error state when no data was ever loaded', async () => {
    const { ctl } = setup();
    const store = TestBed.inject(PortfolioStore);
    TestBed.tick();
    for (let i = 0; i < 3; i++) {
      await tick();
      ctl.expectOne('/api/v1/portfolio/summary').flush('', { status: 503, statusText: 'x' });
    }
    await tick();
    TestBed.tick();
    expect(store.status()).toBe('error');
    expect(store.vm().error?.kind).toBe('server');
  });
});

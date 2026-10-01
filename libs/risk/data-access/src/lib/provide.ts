import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { API_BASE_URL, RISK_INTERCEPTORS, RESILIENCE_CONFIG, type ResilienceConfig } from './interceptors';

export interface RiskDataAccessOptions {
  apiBaseUrl?: string;
  resilience?: Partial<ResilienceConfig>;
}

/** One-call wiring of HttpClient + the resilience pipeline: correlation -> auth -> circuit breaker -> retry. */
export function provideRiskDataAccess(options: RiskDataAccessOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withFetch(), withInterceptors(RISK_INTERCEPTORS)),
    { provide: API_BASE_URL, useValue: options.apiBaseUrl ?? '/api/v1' },
    ...(options.resilience
      ? [
          {
            provide: RESILIENCE_CONFIG,
            useValue: { retryCount: 3, baseMs: 250, jitterMs: 120, failureThreshold: 5, cooldownMs: 15_000, ...options.resilience },
          },
        ]
      : []),
  ]);
}

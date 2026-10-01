import { HttpErrorResponse } from '@angular/common/http';
import type { ProblemDetails } from '@pnc/shared/domain';

export type ErrorKind = 'network' | 'server' | 'auth' | 'forbidden' | 'validation' | 'circuit-open' | 'unknown';
export interface AppError {
  message: string;
  status: number;
  kind: ErrorKind;
  retriable: boolean;
  correlationId?: string;
}

export class CircuitOpenError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Service temporarily unavailable (circuit open)');
    this.name = 'CircuitOpenError';
  }
}

/** Normalises transport and RFC 9457 problem+json failures into one UI-friendly shape. */
export function toAppError(e: unknown): AppError {
  if (e instanceof CircuitOpenError)
    return {
      message: 'The risk service is recovering. Showing the last known data where available.',
      status: 0,
      kind: 'circuit-open',
      retriable: true,
    };
  if (e instanceof HttpErrorResponse) {
    const p = (typeof e.error === 'object' && e.error !== null ? e.error : {}) as Partial<ProblemDetails>;
    const correlationId = p.correlationId ?? e.headers?.get('x-correlation-id') ?? undefined;
    if (e.status === 0)
      return {
        message: 'Cannot reach the risk service. Check your connection.',
        status: 0,
        kind: 'network',
        retriable: true,
        correlationId,
      };
    if (e.status === 401)
      return { message: 'Your session has expired. Please sign in again.', status: 401, kind: 'auth', retriable: false, correlationId };
    if (e.status === 403)
      return {
        message: p.detail ?? 'You do not have permission for this action.',
        status: 403,
        kind: 'forbidden',
        retriable: false,
        correlationId,
      };
    if (e.status >= 400 && e.status < 500)
      return {
        message: p.detail ?? p.title ?? 'The request was rejected.',
        status: e.status,
        kind: 'validation',
        retriable: e.status === 429,
        correlationId,
      };
    return {
      message: 'The risk service had a problem. Please try again.',
      status: e.status,
      kind: 'server',
      retriable: true,
      correlationId,
    };
  }
  return { message: e instanceof Error ? e.message : 'Unexpected error', status: -1, kind: 'unknown', retriable: false };
}

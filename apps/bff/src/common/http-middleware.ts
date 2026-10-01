import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Accepts a well-formed inbound correlation id (traceability across the stack) or mints a new one. */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header(CORRELATION_HEADER);
  const id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();
  (req as Request & { correlationId: string }).correlationId = id;
  res.setHeader(CORRELATION_HEADER, id);
  next();
}

const EXEMPT = /^\/(healthz|readyz)/;

/**
 * Fault injection for resilience demos and tests. Fails a fraction of requests with 503 + Retry-After.
 * Disabled when rate is 0. Production start-up refuses CHAOS_RATE>0 unless ALLOW_CHAOS=true (see env.ts).
 */
export function chaos(rate: number, random: () => number = Math.random) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (rate > 0 && !EXEMPT.test(req.path) && random() < rate) {
      res.setHeader('Retry-After', '1');
      res.setHeader('x-chaos', 'injected');
      res
        .status(503)
        .type('application/problem+json')
        .json({ type: 'about:blank#chaos', title: 'Injected failure', status: 503, correlationId: res.getHeader(CORRELATION_HEADER) });
      return;
    }
    next();
  };
}

import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { chaos, correlationId } from './http-middleware';
import { JsonLogger } from './json-logger';
import { csvCell } from '../exposure/exposure.controller';
import { LifecycleState } from '../health/health.controller';

describe('csvCell', () => {
  it('neutralises formula injection and escapes quotes', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvCell('@cmd')).toBe(`"'@cmd"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });
});

describe('JsonLogger', () => {
  it('emits structured lines honouring level', () => {
    const lines: string[] = [];
    const log = new JsonLogger('warn', (l) => lines.push(l));
    log.log('hidden');
    log.debug('hidden');
    log.verbose('hidden');
    log.warn({ msg: 'w' }, 'ctx');
    log.error('boom', 'trace', 'ctx');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ severity: 'WARN', msg: 'w', context: 'ctx' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ severity: 'ERROR', trace: 'trace' });
    log.setLogLevels?.([]);
  });
  it('is silent when level is silent', () => {
    const lines: string[] = [];
    new JsonLogger('silent', (l) => lines.push(l)).error('x');
    expect(lines).toHaveLength(0);
  });
});

describe('middleware', () => {
  const mk = (path = '/api/x', header?: string) => {
    const headers: Record<string, unknown> = {};
    const res = {
      setHeader: (k: string, v: unknown) => {
        headers[k] = v;
        return res;
      },
      getHeader: (k: string) => headers[k],
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const req = { path, header: () => header } as unknown as Request;
    return { req, res, headers, next: vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn> };
  };
  it('chaos passes through at rate 0 and for exempt paths', () => {
    const a = mk();
    chaos(0)(a.req, a.res, a.next);
    expect(a.next).toHaveBeenCalled();
    const b = mk('/readyz');
    chaos(1)(b.req, b.res, b.next);
    expect(b.next).toHaveBeenCalled();
  });
  it('chaos fails deterministically when random < rate', () => {
    const a = mk();
    chaos(0.5, () => 0.1)(a.req, a.res, a.next);
    expect(a.next).not.toHaveBeenCalled();
    expect(a.res.status).toHaveBeenCalledWith(503);
    const b = mk();
    chaos(0.5, () => 0.9)(b.req, b.res, b.next);
    expect(b.next).toHaveBeenCalled();
  });
  it('correlation id reuses valid and replaces invalid ids', () => {
    const a = mk('/', 'valid-id-12345');
    correlationId(a.req, a.res, a.next);
    expect(a.headers['x-correlation-id']).toBe('valid-id-12345');
    const b = mk('/', '<script>');
    correlationId(b.req, b.res, b.next);
    expect(b.headers['x-correlation-id']).not.toBe('<script>');
  });
});

describe('LifecycleState', () => {
  it('flips to draining before shutdown', () => {
    const s = new LifecycleState();
    expect(s.draining).toBe(false);
    s.beforeApplicationShutdown();
    expect(s.draining).toBe(true);
  });
});

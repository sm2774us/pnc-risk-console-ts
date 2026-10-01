import { describe, expect, it } from 'vitest';
import { ratingFor, riskScore } from '@pnc/shared/domain';
import { LegacyRatingAdapter, LegacyRatingError } from '../index';
import type Legacy from './legacy-rating-engine.js';

describe('LegacyRatingAdapter', () => {
  const adapter = new LegacyRatingAdapter();

  it('parity: legacy ES5 engine equals modern domain model over a grid of inputs', () => {
    for (const hazard of [0, 0.5, 1, 1.7, 2.6, 4]) {
      for (const lossRatio of [0, 0.2, 0.65, 1.1, 3]) {
        for (const deductibleRatio of [0, 0.001, 0.005, 0.02]) {
          const tiv = 10_000_000;
          const legacy = adapter.rate({ hazard, lossRatio, tiv, deductible: tiv * deductibleRatio });
          const modern = riskScore({ hazard, lossRatio, deductibleRatio });
          expect(legacy.score).toBe(modern);
          expect(legacy.rating).toBe(ratingFor(modern));
        }
      }
    }
  });

  it('accepts numeric strings with thousands separators (feed quirk)', () => {
    const r = adapter.rate({ hazard: '2.4', lossRatio: '0.5', tiv: '10,000,000', deductible: '25,000' });
    expect(r.score).toBeGreaterThan(0);
  });

  it('converts thrown strings into typed errors with codes', () => {
    expect(() => adapter.rate({ hazard: 'abc', lossRatio: 0, tiv: 1, deductible: 0 })).toThrow(LegacyRatingError);
    try {
      adapter.rate({ hazard: 1, lossRatio: 0, tiv: 0, deductible: 0 });
      expect.unreachable();
    } catch (e) {
      expect((e as LegacyRatingError).code).toBe('LEGACY_NON_POSITIVE_TIV');
      expect((e as Error).stack).toBeTruthy();
    }
    try {
      adapter.rate({ hazard: 1, lossRatio: NaN, tiv: 1, deductible: 0 });
    } catch (e) {
      expect((e as LegacyRatingError).field).toBe('lossRatio');
    }
  });

  it('tracks invocations and supports call-without-new', () => {
    expect(adapter.invocations).toBeGreaterThan(0);
    const ctor = (globalThis as unknown as { LegacyRatingEngine: unknown }).LegacyRatingEngine as (
      o?: object,
    ) => InstanceType<typeof Legacy>;
    const e = ctor();
    expect(e.score({ hazard: 1, lossRatio: 0.1, tiv: 100, deductible: 1 })).toBeTypeOf('number');
  });

  it('re-throws non-string failures untouched', () => {
    const a = new LegacyRatingAdapter();
    (a as unknown as { engine: { score: () => never } }).engine = {
      score: () => {
        throw new TypeError('boom');
      },
    } as never;
    expect(() => a.rate({ hazard: 1, lossRatio: 1, tiv: 1, deductible: 1 })).toThrow(TypeError);
  });
});

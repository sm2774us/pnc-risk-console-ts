import { describe, expect, it } from 'vitest';
import {
  aggregateCells,
  appetiteFor,
  applyStress,
  can,
  cellPml,
  createRng,
  expectedLoss,
  formatPct,
  formatUsd,
  formatUsdCompact,
  formatInt,
  maskExposure,
  maskInsured,
  pickWeighted,
  probableMaxLoss,
  ratingFor,
  riskScore,
  ROLE_PERMISSIONS,
  toAccumulationRow,
  utilizationStatus,
  DEMO_PERSONAS,
  allReturnPeriodPml,
} from '../index';
import type { AccumulationCell } from '../index';
import { inferAppetiteScale } from '../index';

const cell: AccumulationCell = {
  zone: 'US-FL',
  peril: 'Windstorm',
  policies: 10,
  tiv: 1_000_000_000,
  limit: 600_000_000,
  premium: 20_000_000,
};

describe('risk model', () => {
  it('expected loss is positive and bounded by limit', () => {
    expect(expectedLoss({ tiv: 10e6, limit: 5e6, peril: 'Windstorm', zone: 'US-FL' })).toBeGreaterThan(0);
    expect(expectedLoss({ tiv: 10e6, limit: 1, peril: 'Windstorm', zone: 'US-FL' })).toBe(1);
  });
  it('is zero for unmodelled peril/zone pairs', () => {
    expect(expectedLoss({ tiv: 10e6, limit: 5e6, peril: 'Earthquake', zone: 'US-FL' })).toBe(0);
  });
  it('PML is monotonic in return period and capped by limit', () => {
    const rps = [10, 50, 100, 250, 500] as const;
    const v = rps.map((rp) => cellPml(cell, rp));
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]!);
    expect(Math.max(...v)).toBeLessThanOrEqual(cell.limit);
  });
  it('applies severity shock monotonically', () => {
    expect(cellPml(cell, 50, 0.3)).toBeGreaterThan(cellPml(cell, 50, 0));
    expect(cellPml(cell, 50, -1)).toBe(0);
  });
  it('stress returns delta consistent with baseline', () => {
    const r = applyStress([cell], { returnPeriod: 100, perilShocks: { Windstorm: 0.25 } }, 1);
    expect(r.delta).toBeCloseTo(r.stressedPml - r.baselinePml);
    expect(r.deltaPct).toBeGreaterThanOrEqual(0);
    expect(applyStress([], { returnPeriod: 10, perilShocks: {} }, 1).deltaPct).toBe(0);
  });
  it('aggregates cells and sums PML', () => {
    const cells = aggregateCells([
      { zone: 'US-FL', peril: 'Windstorm', tiv: 1, limit: 1, premium: 1 },
      { zone: 'US-FL', peril: 'Windstorm', tiv: 2, limit: 2, premium: 2 },
      { zone: 'US-CA', peril: 'Earthquake', tiv: 3, limit: 3, premium: 3 },
    ]);
    expect(cells).toHaveLength(2);
    expect(cells.find((c) => c.zone === 'US-FL')?.tiv).toBe(3);
    expect(probableMaxLoss(cells, 100)).toBeGreaterThan(0);
    expect(Object.keys(allReturnPeriodPml(cells))).toHaveLength(5);
  });
  it('utilisation thresholds', () => {
    expect(utilizationStatus(0.5)).toBe('ok');
    expect(utilizationStatus(0.85)).toBe('watch');
    expect(utilizationStatus(1)).toBe('breach');
    expect(appetiteFor('XX', 'Fire')).toBe(0);
    expect(toAccumulationRow({ ...cell, zone: 'XX' }, 1).utilization).toBe(0);
    expect(toAccumulationRow(cell, 1).appetite).toBeGreaterThan(0);
  });
  it('scores and ratings are bounded and ordered', () => {
    expect(riskScore({ hazard: 0, lossRatio: 0, deductibleRatio: 1 })).toBe(0);
    expect(riskScore({ hazard: 9, lossRatio: 9, deductibleRatio: 0 })).toBe(100);
    expect(['A', 'B', 'C', 'D', 'E']).toEqual([10, 30, 50, 70, 90].map(ratingFor));
  });
});

describe('appetite scale', () => {
  it('infers the scale used to produce rows', () => {
    const row = toAccumulationRow(cell, 2.5);
    expect(inferAppetiteScale([row])).toBeCloseTo(2.5);
    expect(inferAppetiteScale([])).toBe(1);
    expect(inferAppetiteScale([{ zone: 'XX', peril: 'Fire', appetite: 0 }])).toBe(1);
  });
});

describe('permissions & masking', () => {
  it('viewer lacks PII and export; admin has all', () => {
    expect(ROLE_PERMISSIONS.viewer).not.toContain('exposure:read-pii');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('exposure:export');
    expect(ROLE_PERMISSIONS.admin).toContain('admin:status');
    expect(DEMO_PERSONAS).toHaveLength(4);
  });
  it('can() handles null users', () => {
    expect(can(null, 'exposure:read')).toBe(false);
    expect(can(DEMO_PERSONAS[1], 'exposure:export')).toBe(true);
  });
  it('masks deterministically and only without PII permission', () => {
    expect(maskInsured('Acme Corp')).toBe(maskInsured('Acme Corp'));
    expect(maskInsured('Acme Corp')).not.toContain('Acme');
    expect(maskExposure({ insured: 'Acme' }, ['exposure:read']).insured).not.toBe('Acme');
    expect(maskExposure({ insured: 'Acme' }, ['exposure:read-pii']).insured).toBe('Acme');
  });
});

describe('prng & format', () => {
  it('is deterministic per seed', () => {
    const a = createRng(7),
      b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('weighted pick honours zero weights and falls back', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) expect(pickWeighted(rng, ['a', 'b'], (x) => (x === 'a' ? 0 : 1))).toBe('b');
    expect(
      pickWeighted(
        () => 0.99999,
        ['x'],
        () => 1,
      ),
    ).toBe('x');
  });
  it('formats null-safely', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(1234)).toBe('$1,234');
    expect(formatUsdCompact(1_500_000_000)).toBe('$1.5B');
    expect(formatUsdCompact(undefined)).toBe('—');
    expect(formatPct(0.123)).toBe('12.3%');
    expect(formatPct(NaN)).toBe('—');
    expect(formatInt(1000)).toBe('1,000');
    expect(formatInt(null)).toBe('—');
  });
});

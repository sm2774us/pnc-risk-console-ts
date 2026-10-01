import { describe, expect, it } from 'vitest';
import { generateDataset } from './dataset';
import { distinctValues, filterRows, ForbiddenQueryError, QueryError, runSsrm } from './query-engine';
import type { SsrmRequest } from '@pnc/shared/domain';

const ds = generateDataset(3000, 42);
const base: SsrmRequest = { startRow: 0, endRow: 100, rowGroupCols: [], valueCols: [], groupKeys: [], filterModel: {}, sortModel: [] };
const READ = ['exposure:read'] as const;
const PII = ['exposure:read', 'exposure:read-pii'] as const;

describe('dataset generator', () => {
  it('is deterministic and internally consistent', () => {
    const again = generateDataset(3000, 42);
    expect(again.exposures[10]).toEqual(ds.exposures[10]);
    expect(ds.exposures).toHaveLength(3000);
    expect(ds.exposures.every((e) => e.limit <= e.tiv + 1000 && e.premium > 0 && e.riskScore >= 0 && e.riskScore <= 100)).toBe(true);
    expect(ds.trend.length).toBeGreaterThan(12);
    expect(ds.cells.length).toBeGreaterThan(20);
  });
});

describe('SSRM query engine', () => {
  it('pages leaf rows and reports total as lastRow', () => {
    const r = runSsrm(ds.exposures, { ...base, endRow: 50 }, PII);
    expect(r.rows).toHaveLength(50);
    expect(r.lastRow).toBe(3000);
  });
  it('sorts descending by numeric field', () => {
    const r = runSsrm(ds.exposures, { ...base, sortModel: [{ colId: 'tiv', sort: 'desc' }] }, PII);
    const v = r.rows.map((x) => x['tiv'] as number);
    expect([...v].sort((a, b) => b - a)).toEqual(v);
  });
  it('filters: set, text, number range, combined OR and date', () => {
    const set = runSsrm(ds.exposures, { ...base, filterModel: { lob: { filterType: 'set', values: ['Cyber'] } } }, PII);
    expect(set.rows.every((x) => x['lob'] === 'Cyber')).toBe(true);
    const txt = filterRows(ds.exposures, { policyNumber: { filterType: 'text', type: 'startsWith', filter: 'pnc-2025' } });
    expect(txt.every((e) => e.policyNumber.startsWith('PNC-2025'))).toBe(true);
    const rng = filterRows(ds.exposures, { tiv: { filterType: 'number', type: 'inRange', filter: 1e6, filterTo: 2e6 } });
    expect(rng.every((e) => e.tiv >= 1e6 && e.tiv <= 2e6)).toBe(true);
    const or = filterRows(ds.exposures, {
      rating: {
        filterType: 'set',
        operator: 'OR',
        conditions: [
          { filterType: 'set', values: ['A'] },
          { filterType: 'set', values: ['E'] },
        ],
      } as never,
    });
    expect(or.every((e) => e.rating === 'A' || e.rating === 'E')).toBe(true);
    const d = filterRows(ds.exposures, { inception: { filterType: 'date', type: 'greaterThan', dateFrom: '2026-01-01' } });
    expect(d.every((e) => e.inception > '2026-01-01')).toBe(true);
    const and = filterRows(ds.exposures, {
      tiv: {
        filterType: 'number',
        operator: 'AND',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 1e6 },
          { filterType: 'number', type: 'lessThan', filter: 2e6 },
        ],
      },
    });
    expect(and.every((e) => e.tiv > 1e6 && e.tiv < 2e6)).toBe(true);
  });
  it('groups and aggregates with exposure-weighted loss ratio', () => {
    const r = runSsrm(
      ds.exposures,
      {
        ...base,
        rowGroupCols: [{ id: 'lob', field: 'lob' }],
        valueCols: [
          { id: 'tiv', field: 'tiv', aggFunc: 'sum' },
          { id: 'premium', field: 'premium', aggFunc: 'sum' },
          { id: 'lossRatio', field: 'lossRatio', aggFunc: 'avg' },
        ],
      },
      PII,
    );
    expect(r.rows.length).toBeGreaterThan(3);
    const total = r.rows.reduce((s, x) => s + (x['tiv'] as number), 0);
    expect(total).toBe(ds.exposures.reduce((s, e) => s + e.tiv, 0));
    const cyber = ds.exposures.filter((e) => e.lob === 'Cyber');
    const row = r.rows.find((x) => x['lob'] === 'Cyber')!;
    expect(row['lossRatio'] as number).toBeCloseTo(
      cyber.reduce((s, e) => s + e.incurredLoss, 0) / cyber.reduce((s, e) => s + e.premium, 0),
      6,
    );
  });
  it('drills into groups using groupKeys and returns leaves at the last level', () => {
    const grp = {
      ...base,
      rowGroupCols: [
        { id: 'lob', field: 'lob' },
        { id: 'zone', field: 'zone' },
      ],
    };
    const l1 = runSsrm(ds.exposures, { ...grp, groupKeys: ['Cyber'] }, PII);
    expect(l1.rows.every((x) => 'zone' in x && 'childCount' in x)).toBe(true);
    const zone = l1.rows[0]!['zone'] as string;
    const leaves = runSsrm(ds.exposures, { ...grp, groupKeys: ['Cyber', zone] }, PII);
    expect(leaves.rows.every((x) => x['lob'] === 'Cyber' && x['zone'] === zone)).toBe(true);
    expect(leaves.lastRow).toBe(l1.rows[0]!['childCount']);
  });
  it('sorts group rows by aggregate column', () => {
    const r = runSsrm(
      ds.exposures,
      {
        ...base,
        rowGroupCols: [{ id: 'lob', field: 'lob' }],
        valueCols: [{ id: 'tiv', field: 'tiv', aggFunc: 'sum' }],
        sortModel: [{ colId: 'tiv', sort: 'desc' }],
      },
      PII,
    );
    const v = r.rows.map((x) => x['tiv'] as number);
    expect([...v].sort((a, b) => b - a)).toEqual(v);
  });
  it('supports min/max/count/avg aggregations', () => {
    const r = runSsrm(
      ds.exposures,
      {
        ...base,
        rowGroupCols: [{ id: 'status', field: 'status' }],
        valueCols: [
          { id: 'a', field: 'tiv', aggFunc: 'min' },
          { id: 'b', field: 'limit', aggFunc: 'max' },
          { id: 'c', field: 'riskScore', aggFunc: 'count' },
          { id: 'd', field: 'deductible', aggFunc: 'avg' },
        ],
      },
      PII,
    );
    expect(r.rows.length).toBeGreaterThan(0);
  });
  it('masks insured for roles without PII permission', () => {
    const r = runSsrm(ds.exposures, base, READ);
    expect(r.rows.every((x) => String(x['insured']).startsWith('Insured ••'))).toBe(true);
  });
  it('forbids filtering or sorting on masked fields (no inference side channel)', () => {
    expect(() =>
      runSsrm(ds.exposures, { ...base, filterModel: { insured: { filterType: 'text', type: 'contains', filter: 'a' } } }, READ),
    ).toThrow(ForbiddenQueryError);
    expect(() => runSsrm(ds.exposures, { ...base, sortModel: [{ colId: 'insured', sort: 'asc' }] }, READ)).toThrow(ForbiddenQueryError);
    expect(() => runSsrm(ds.exposures, { ...base, sortModel: [{ colId: 'insured', sort: 'asc' }] }, PII)).not.toThrow();
  });
  it('rejects malformed or abusive requests', () => {
    expect(() => runSsrm(ds.exposures, { ...base, endRow: 5000 }, PII)).toThrow(QueryError);
    expect(() => runSsrm(ds.exposures, { ...base, endRow: 0 }, PII)).toThrow(QueryError);
    expect(() => runSsrm(ds.exposures, { ...base, rowGroupCols: [{ id: 'x', field: 'insured' }] }, PII)).toThrow(/groupable/);
    expect(() => runSsrm(ds.exposures, { ...base, valueCols: [{ id: 'x', field: 'lob' }] }, PII)).toThrow(/aggregatable/);
    expect(() => runSsrm(ds.exposures, { ...base, valueCols: [{ id: 'x', field: 'tiv', aggFunc: 'median' as never }] }, PII)).toThrow(
      /aggregation/,
    );
    expect(() =>
      runSsrm(ds.exposures, { ...base, filterModel: { password: { filterType: 'text', type: 'equals', filter: 'x' } } }, PII),
    ).toThrow(/filterable/);
    expect(() => runSsrm(ds.exposures, { ...base, sortModel: [{ colId: '__proto__', sort: 'asc' }] }, PII)).toThrow(/sortable/);
    expect(() => runSsrm(ds.exposures, { ...base, groupKeys: ['x'] }, PII)).toThrow(/groupKeys/);
    expect(() => filterRows(ds.exposures, { lob: { filterType: 'text', type: 'bogus', filter: 'x' } })).toThrow(QueryError);
    expect(() => filterRows(ds.exposures, { tiv: { filterType: 'number', type: 'bogus' } })).toThrow(QueryError);
    expect(() => filterRows(ds.exposures, { inception: { filterType: 'date', type: 'bogus' } })).toThrow(QueryError);
  });
  it('lists distinct values only for enumerable fields', () => {
    expect(distinctValues(ds.exposures, 'lob').length).toBe(new Set(ds.exposures.map((e) => e.lob)).size);
    expect(() => distinctValues(ds.exposures, 'insured')).toThrow(QueryError);
  });
});

import { maskExposure } from '@pnc/shared/domain';
import type {
  AggFunc,
  CombinedFilter,
  Exposure,
  FilterCondition,
  FilterModel,
  Permission,
  SsrmRequest,
  SsrmResponse,
} from '@pnc/shared/domain';

export const GROUPABLE = ['lob', 'peril', 'country', 'zone', 'status', 'rating', 'underwriter'] as const;
export const NUMERIC = ['tiv', 'limit', 'deductible', 'premium', 'incurredLoss', 'lossRatio', 'riskScore'] as const;
export const FILTERABLE = [
  'policyNumber',
  'insured',
  'lob',
  'peril',
  'country',
  'zone',
  'status',
  'rating',
  'underwriter',
  'inception',
  'expiry',
  ...NUMERIC,
] as const;
export const SORTABLE = FILTERABLE;
export const AGGS: readonly AggFunc[] = ['sum', 'avg', 'min', 'max', 'count'];
export const MAX_PAGE = 1000;

export class QueryError extends Error {}
export class ForbiddenQueryError extends Error {}

type Row = Record<string, unknown>;
const text = (v: unknown) => String(v ?? '').toLowerCase();

function matchOne(value: unknown, f: FilterCondition): boolean {
  switch (f.filterType) {
    case 'set':
      return (f.values ?? []).includes(String(value));
    case 'text': {
      const v = text(value),
        q = text(f.filter);
      switch (f.type) {
        case 'contains':
          return v.includes(q);
        case 'notContains':
          return !v.includes(q);
        case 'equals':
          return v === q;
        case 'notEqual':
          return v !== q;
        case 'startsWith':
          return v.startsWith(q);
        case 'endsWith':
          return v.endsWith(q);
        case 'blank':
          return v === '';
        case 'notBlank':
          return v !== '';
        default:
          throw new QueryError(`Unsupported text filter type: ${f.type}`);
      }
    }
    case 'number': {
      const v = Number(value),
        a = Number(f.filter),
        b = Number(f.filterTo);
      switch (f.type) {
        case 'equals':
          return v === a;
        case 'notEqual':
          return v !== a;
        case 'lessThan':
          return v < a;
        case 'lessThanOrEqual':
          return v <= a;
        case 'greaterThan':
          return v > a;
        case 'greaterThanOrEqual':
          return v >= a;
        case 'inRange':
          return v >= a && v <= b;
        case 'blank':
          return value == null;
        case 'notBlank':
          return value != null;
        default:
          throw new QueryError(`Unsupported number filter type: ${f.type}`);
      }
    }
    case 'date': {
      const v = String(value).slice(0, 10),
        from = (f.dateFrom ?? '').slice(0, 10),
        to = (f.dateTo ?? '').slice(0, 10);
      switch (f.type) {
        case 'equals':
          return v === from;
        case 'notEqual':
          return v !== from;
        case 'greaterThan':
          return v > from;
        case 'lessThan':
          return v < from;
        case 'inRange':
          return v >= from && v <= to;
        default:
          throw new QueryError(`Unsupported date filter type: ${f.type}`);
      }
    }
    default:
      throw new QueryError('Unsupported filterType');
  }
}

function matchFilter(value: unknown, f: FilterCondition | CombinedFilter): boolean {
  if ('operator' in f) {
    const results = f.conditions.map((c) => matchOne(value, c));
    return f.operator === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }
  return matchOne(value, f);
}

export function validate(req: SsrmRequest, permissions: readonly Permission[]): void {
  if (req.endRow - req.startRow > MAX_PAGE || req.endRow <= req.startRow) throw new QueryError(`Page size must be 1..${MAX_PAGE}`);
  for (const c of req.rowGroupCols)
    if (!(GROUPABLE as readonly string[]).includes(c.field)) throw new QueryError(`Field not groupable: ${c.field}`);
  for (const v of req.valueCols) {
    if (!(NUMERIC as readonly string[]).includes(v.field)) throw new QueryError(`Field not aggregatable: ${v.field}`);
    if (v.aggFunc && !AGGS.includes(v.aggFunc)) throw new QueryError(`Unsupported aggregation: ${v.aggFunc}`);
  }
  for (const f of Object.keys(req.filterModel))
    if (!(FILTERABLE as readonly string[]).includes(f)) throw new QueryError(`Field not filterable: ${f}`);
  for (const s of req.sortModel)
    if (!(SORTABLE as readonly string[]).includes(s.colId) && !req.valueCols.some((v) => v.id === s.colId))
      throw new QueryError(`Field not sortable: ${s.colId}`);
  if (!permissions.includes('exposure:read-pii')) {
    // Filtering/sorting by a masked field would leak its real values through ordering or match counts.
    if ('insured' in req.filterModel || req.sortModel.some((s) => s.colId === 'insured'))
      throw new ForbiddenQueryError('insured is masked for your role');
  }
}

export function filterRows(rows: readonly Exposure[], filterModel: FilterModel): Exposure[] {
  const entries = Object.entries(filterModel);
  if (entries.length === 0) return rows as Exposure[];
  return rows.filter((r) => entries.every(([field, f]) => matchFilter((r as unknown as Row)[field], f)));
}

function aggregate(rows: readonly Exposure[], field: string, fn: AggFunc): number {
  if (fn === 'count') return rows.length;
  if (rows.length === 0) return 0;
  let sum = 0,
    min = Infinity,
    max = -Infinity;
  for (const r of rows) {
    const v = (r as unknown as Row)[field] as number;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return fn === 'sum' ? sum : fn === 'avg' ? sum / rows.length : fn === 'min' ? min : max;
}

function compare(a: unknown, b: unknown): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''));
}

/** Server-side row model executor: filter -> (group + aggregate | leaf) -> sort -> page. */
export function runSsrm(rows: readonly Exposure[], req: SsrmRequest, permissions: readonly Permission[]): SsrmResponse {
  validate(req, permissions);
  let scoped = filterRows(rows, req.filterModel);
  req.groupKeys.forEach((key, i) => {
    const col = req.rowGroupCols[i];
    if (!col) throw new QueryError('groupKeys exceed rowGroupCols');
    scoped = scoped.filter((r) => String((r as unknown as Row)[col.field]) === key);
  });

  const level = req.groupKeys.length;
  const grouping = level < req.rowGroupCols.length;
  let out: Row[];

  if (grouping) {
    const col = req.rowGroupCols[level]!;
    const buckets = new Map<string, Exposure[]>();
    for (const r of scoped) {
      const k = String((r as unknown as Row)[col.field]);
      const b = buckets.get(k);
      if (b) b.push(r);
      else buckets.set(k, [r]);
    }
    out = [...buckets.entries()].map(([key, members]) => {
      const row: Row = { [col.field]: key, childCount: members.length };
      for (const v of req.valueCols) row[v.field] = aggregate(members, v.field, v.aggFunc ?? 'sum');
      // Ratios must be exposure-weighted, never an average of averages.
      if ('lossRatio' in row) {
        const prem = aggregate(members, 'premium', 'sum');
        row['lossRatio'] = prem > 0 ? aggregate(members, 'incurredLoss', 'sum') / prem : 0;
      }
      return row;
    });
    const defaultSort = (a: Row, b: Row) => compare(a[col.field], b[col.field]);
    const sorts = req.sortModel.filter((s) => s.colId === col.field || req.valueCols.some((v) => v.id === s.colId || v.field === s.colId));
    out.sort((a, b) => {
      for (const s of sorts) {
        const field = req.valueCols.find((v) => v.id === s.colId)?.field ?? s.colId;
        const c = compare(a[field], b[field]);
        if (c !== 0) return s.sort === 'asc' ? c : -c;
      }
      return defaultSort(a, b);
    });
  } else {
    const sorted = req.sortModel.length
      ? [...scoped].sort((a, b) => {
          for (const s of req.sortModel) {
            const c = compare((a as unknown as Row)[s.colId], (b as unknown as Row)[s.colId]);
            if (c !== 0) return s.sort === 'asc' ? c : -c;
          }
          return a.id.localeCompare(b.id);
        })
      : scoped;
    out = sorted.slice(req.startRow, req.endRow).map((r) => maskExposure(r, permissions) as unknown as Row);
    return { rows: out, lastRow: sorted.length, generatedAt: new Date().toISOString() };
  }
  return { rows: out.slice(req.startRow, req.endRow), lastRow: out.length, generatedAt: new Date().toISOString() };
}

export function distinctValues(rows: readonly Exposure[], field: string): string[] {
  if (!(GROUPABLE as readonly string[]).includes(field)) throw new QueryError(`Field not enumerable: ${field}`);
  return [...new Set(rows.map((r) => String((r as unknown as Row)[field])))].sort();
}

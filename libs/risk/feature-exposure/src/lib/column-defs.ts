import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { LOBS, PERILS, RATINGS, formatPct, formatUsd } from '@pnc/shared/domain';

const usd = (p: ValueFormatterParams): string => (p.value == null ? '' : formatUsd(p.value as number));
const pct = (p: ValueFormatterParams): string => (p.value == null ? '' : formatPct(p.value as number));
const num = { filter: 'agNumberColumnFilter', type: 'rightAligned' } as const;

/** Column model. `enableRowGroup` + `aggFunc` drive the server-side grouping/aggregation contract. */
export const COLUMN_DEFS: ColDef[] = [
  { field: 'policyNumber', headerName: 'Policy', filter: 'agTextColumnFilter', pinned: 'left', width: 150 },
  { field: 'insured', headerName: 'Insured', filter: 'agTextColumnFilter', minWidth: 200 },
  { field: 'lob', headerName: 'Line of business', enableRowGroup: true, filter: 'agSetColumnFilter', filterParams: { values: [...LOBS] } },
  { field: 'peril', enableRowGroup: true, filter: 'agSetColumnFilter', filterParams: { values: [...PERILS] } },
  { field: 'country', enableRowGroup: true, filter: 'agSetColumnFilter', width: 120 },
  { field: 'zone', enableRowGroup: true, filter: 'agSetColumnFilter', width: 110 },
  { field: 'tiv', headerName: 'TIV', ...num, aggFunc: 'sum', enableValue: true, valueFormatter: usd },
  { field: 'limit', headerName: 'Limit', ...num, enableValue: true, allowedAggFuncs: ['sum', 'avg', 'max'], valueFormatter: usd },
  { field: 'premium', headerName: 'Premium', ...num, aggFunc: 'sum', enableValue: true, valueFormatter: usd },
  {
    field: 'incurredLoss',
    headerName: 'Incurred',
    ...num,
    enableValue: true,
    allowedAggFuncs: ['sum', 'avg'],
    valueFormatter: usd,
    hide: true,
  },
  {
    field: 'lossRatio',
    headerName: 'Loss ratio',
    ...num,
    enableValue: true,
    allowedAggFuncs: ['avg'],
    valueFormatter: pct,
    cellClassRules: { 'cell-bad': (p) => (p.value as number) > 1, 'cell-warn': (p) => (p.value as number) > 0.75 },
  },
  { field: 'riskScore', headerName: 'Risk score', ...num, enableValue: true, allowedAggFuncs: ['avg', 'max'] },
  {
    field: 'rating',
    filter: 'agSetColumnFilter',
    filterParams: { values: [...RATINGS] },
    width: 100,
    cellClass: (p) => `rating rating-${String(p.value)}`,
  },
  { field: 'status', filter: 'agSetColumnFilter', enableRowGroup: true, width: 120 },
  { field: 'inception', filter: 'agDateColumnFilter', width: 130 },
  { field: 'expiry', filter: 'agDateColumnFilter', width: 130, hide: true },
  { field: 'underwriter', enableRowGroup: true, filter: 'agSetColumnFilter', hide: true },
];

/** Canonical domain contracts shared by the Angular client and the NestJS BFF. */
export type Lob = 'Commercial Property' | 'Homeowners' | 'Marine Cargo' | 'General Liability' | 'Cyber' | 'Aviation' | 'Auto Fleet';
export type Peril = 'Windstorm' | 'Flood' | 'Earthquake' | 'Wildfire' | 'Fire' | 'Liability' | 'Cyber Event';
export type Rating = 'A' | 'B' | 'C' | 'D' | 'E';
export type PolicyStatus = 'Quoted' | 'Bound' | 'Renewal' | 'Expired' | 'Cancelled';
export type ReturnPeriod = 10 | 50 | 100 | 250 | 500;
export type UtilizationStatus = 'ok' | 'watch' | 'breach';

export interface Exposure {
  id: string;
  policyNumber: string;
  insured: string;
  lob: Lob;
  peril: Peril;
  country: string;
  zone: string;
  tiv: number;
  limit: number;
  deductible: number;
  premium: number;
  incurredLoss: number;
  lossRatio: number;
  riskScore: number;
  rating: Rating;
  status: PolicyStatus;
  inception: string;
  expiry: string;
  underwriter: string;
}

export interface Zone {
  code: string;
  name: string;
  country: string;
  /** Row/column on the illustrative tile map. */
  tile: { col: number; row: number };
  /** Multiplier on peril base severity; 0 means the peril is not modelled for this zone. */
  hazard: Partial<Record<Peril, number>>;
  /** Relative share of the book written in this zone. */
  weight: number;
  /** Relative accumulation appetite. */
  capacity: number;
}

export interface AccumulationCell {
  zone: string;
  peril: Peril;
  policies: number;
  tiv: number;
  limit: number;
  premium: number;
}

export interface AccumulationRow extends AccumulationCell {
  appetite: number;
  utilization: number;
  status: UtilizationStatus;
  expectedLoss: number;
  pml100: number;
}

export interface PortfolioSummary {
  asOf: string;
  policies: number;
  tiv: number;
  premium: number;
  incurredLoss: number;
  lossRatio: number;
  expectedLoss: number;
  pml: Record<ReturnPeriod, number>;
  byLob: { lob: Lob; tiv: number; premium: number; lossRatio: number; policies: number }[];
  byPeril: { peril: Peril; tiv: number; expectedLoss: number }[];
  breaches: number;
  watch: number;
  trend: TrendPoint[];
}

export interface StressRequest {
  returnPeriod: ReturnPeriod;
  /** Severity shock per peril, e.g. 0.25 = +25 %. Range [-0.5, 2]. */
  perilShocks: Partial<Record<Peril, number>>;
}

export interface StressResult {
  returnPeriod: ReturnPeriod;
  baselinePml: number;
  stressedPml: number;
  delta: number;
  deltaPct: number;
  rows: AccumulationRow[];
}

/* ---------------- Ag-Grid server-side row model contract ---------------- */
export type SortDir = 'asc' | 'desc';
export type AggFunc = 'sum' | 'avg' | 'min' | 'max' | 'count';
export interface ColumnVO {
  id: string;
  field: string;
  displayName?: string;
  aggFunc?: AggFunc;
}
export interface SortModelItem {
  colId: string;
  sort: SortDir;
}
export interface FilterCondition {
  filterType: 'text' | 'number' | 'set' | 'date';
  type?: string;
  filter?: string | number;
  filterTo?: number;
  values?: string[];
  dateFrom?: string;
  dateTo?: string;
}
export interface CombinedFilter {
  filterType: FilterCondition['filterType'];
  operator: 'AND' | 'OR';
  conditions: FilterCondition[];
}
export type FilterModel = Record<string, FilterCondition | CombinedFilter>;

export interface SsrmRequest {
  startRow: number;
  endRow: number;
  rowGroupCols: ColumnVO[];
  valueCols: ColumnVO[];
  groupKeys: string[];
  filterModel: FilterModel;
  sortModel: SortModelItem[];
}
export interface SsrmResponse<T = Record<string, unknown>> {
  rows: T[];
  lastRow: number;
  generatedAt: string;
}

/* ---------------- Identity / authorisation ---------------- */
export type Role = 'viewer' | 'underwriter' | 'risk-manager' | 'admin';
export type Permission = 'exposure:read' | 'exposure:read-pii' | 'exposure:export' | 'portfolio:read' | 'stress:run' | 'admin:status';
export interface AuthUser {
  sub: string;
  name: string;
  role: Role;
  permissions: Permission[];
}
export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

/* ---------------- Operational ---------------- */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  correlationId?: string;
  errors?: { path: string; message: string }[];
}
export interface ServiceStatus {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSec: number;
  datasetSize: number;
  chaosRate: number;
  node: string;
}

/* ---------------- Additions: trend & policy detail ---------------- */
export interface TrendPoint {
  month: string;
  premium: number;
  incurred: number;
  policies: number;
}
export interface PolicyDetail {
  exposure: Exposure;
  hazard: number;
  expectedLoss: number;
  scoring: {
    modern: { score: number; rating: Rating };
    legacy: { score: number; rating: Rating } | { error: string };
    reconciled: boolean;
  };
  zoneName: string;
  peers: { zone: string; peril: Peril; policies: number; tiv: number; utilization: number; status: UtilizationStatus };
}

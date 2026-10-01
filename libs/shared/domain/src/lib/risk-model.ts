import {
  BASE_APPETITE_TIV,
  BREACH_THRESHOLD,
  PERIL_BASE_RATE,
  RETURN_PERIODS,
  RP_MULTIPLIER,
  TAIL_FACTOR,
  WATCH_THRESHOLD,
  ZONE_BY_CODE,
} from './constants';
import type {
  AccumulationCell,
  AccumulationRow,
  Exposure,
  Peril,
  Rating,
  ReturnPeriod,
  StressRequest,
  StressResult,
  UtilizationStatus,
} from './types';

/*
 * Illustrative, deterministic risk model used for demonstration. It is NOT a vendor catastrophe model.
 * Every function is pure so the same code runs in the browser (stress sliders) and in the BFF (authoritative numbers).
 */

export function hazardFor(zone: string, peril: Peril): number {
  return ZONE_BY_CODE.get(zone)?.hazard[peril] ?? 0;
}

/** Annual average loss for an exposure: TIV x base damage rate x zone hazard, bounded by the policy limit. */
export function expectedLoss(e: Pick<Exposure, 'tiv' | 'limit' | 'peril' | 'zone'>): number {
  return Math.min(e.limit, e.tiv * PERIL_BASE_RATE[e.peril] * hazardFor(e.zone, e.peril));
}

/** Probable maximum loss for one accumulation cell at a return period; never exceeds the aggregate limit. */
export function cellPml(cell: Pick<AccumulationCell, 'zone' | 'peril' | 'tiv' | 'limit'>, rp: ReturnPeriod, severityShock = 0): number {
  const hazard = hazardFor(cell.zone, cell.peril);
  const ratio = PERIL_BASE_RATE[cell.peril] * hazard * RP_MULTIPLIER[rp] * TAIL_FACTOR[cell.peril] * (1 + severityShock);
  return Math.min(cell.limit, Math.max(0, cell.tiv * ratio));
}

/** Zone-level cat PML: perils within a zone are summed (conservative); zones are summed (no diversification credit). */
export function probableMaxLoss(cells: readonly AccumulationCell[], rp: ReturnPeriod, shocks: StressRequest['perilShocks'] = {}): number {
  return cells.reduce((sum, c) => sum + cellPml(c, rp, shocks[c.peril] ?? 0), 0);
}

export function appetiteFor(zone: string, peril: Peril, scale = 1): number {
  const z = ZONE_BY_CODE.get(zone);
  if (!z) return 0;
  const catLoad = hazardFor(zone, peril) > 1.4 ? 0.85 : 1;
  return BASE_APPETITE_TIV * z.capacity * catLoad * scale;
}

export function utilizationStatus(u: number): UtilizationStatus {
  return u >= BREACH_THRESHOLD ? 'breach' : u >= WATCH_THRESHOLD ? 'watch' : 'ok';
}

export function toAccumulationRow(
  cell: AccumulationCell,
  appetiteScale: number,
  rp: ReturnPeriod = 100,
  shocks: StressRequest['perilShocks'] = {},
): AccumulationRow {
  const appetite = appetiteFor(cell.zone, cell.peril, appetiteScale);
  const utilization = appetite > 0 ? cell.tiv / appetite : 0;
  const hazard = hazardFor(cell.zone, cell.peril);
  return {
    ...cell,
    appetite,
    utilization,
    status: utilizationStatus(utilization),
    expectedLoss: Math.min(cell.limit, cell.tiv * PERIL_BASE_RATE[cell.peril] * hazard),
    pml100: cellPml(cell, rp, shocks[cell.peril] ?? 0),
  };
}

export function applyStress(cells: readonly AccumulationCell[], req: StressRequest, appetiteScale: number): StressResult {
  const baselinePml = probableMaxLoss(cells, req.returnPeriod);
  const stressedPml = probableMaxLoss(cells, req.returnPeriod, req.perilShocks);
  const rows = cells.map((c) => toAccumulationRow(c, appetiteScale, req.returnPeriod, req.perilShocks));
  const delta = stressedPml - baselinePml;
  return { returnPeriod: req.returnPeriod, baselinePml, stressedPml, delta, deltaPct: baselinePml > 0 ? delta / baselinePml : 0, rows };
}

/** Risk score 0-100 (higher = riskier) combining hazard, loss experience and deductible adequacy. */
export function riskScore(input: { hazard: number; lossRatio: number; deductibleRatio: number }): number {
  const hazardPart = Math.min(45, input.hazard * 15);
  const lossPart = Math.min(40, input.lossRatio * 40);
  const dedPart = Math.max(0, 15 - input.deductibleRatio * 1500);
  return Math.round(Math.min(100, Math.max(0, hazardPart + lossPart + dedPart)));
}

export function ratingFor(score: number): Rating {
  return score < 25 ? 'A' : score < 45 ? 'B' : score < 65 ? 'C' : score < 82 ? 'D' : 'E';
}

export function allReturnPeriodPml(cells: readonly AccumulationCell[]): Record<ReturnPeriod, number> {
  return Object.fromEntries(RETURN_PERIODS.map((rp) => [rp, probableMaxLoss(cells, rp)])) as Record<ReturnPeriod, number>;
}

export function aggregateCells(exposures: readonly Pick<Exposure, 'zone' | 'peril' | 'tiv' | 'limit' | 'premium'>[]): AccumulationCell[] {
  const map = new Map<string, AccumulationCell>();
  for (const e of exposures) {
    const key = `${e.zone}|${e.peril}`;
    const c = map.get(key);
    if (c) {
      c.policies += 1;
      c.tiv += e.tiv;
      c.limit += e.limit;
      c.premium += e.premium;
    } else {
      map.set(key, { zone: e.zone, peril: e.peril, policies: 1, tiv: e.tiv, limit: e.limit, premium: e.premium });
    }
  }
  return [...map.values()].sort((a, b) => a.zone.localeCompare(b.zone) || a.peril.localeCompare(b.peril));
}

/** Recovers the dataset-size appetite scale from server rows so the browser can re-run stress locally. */
export function inferAppetiteScale(rows: readonly Pick<AccumulationRow, 'zone' | 'peril' | 'appetite'>[]): number {
  for (const r of rows) {
    const unit = appetiteFor(r.zone, r.peril, 1);
    if (unit > 0 && r.appetite > 0) return r.appetite / unit;
  }
  return 1;
}

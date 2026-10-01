import { Inject, Injectable } from '@nestjs/common';
import { allReturnPeriodPml, toAccumulationRow, expectedLoss } from '@pnc/shared/domain';
import type { AccumulationRow, Lob, Peril, PortfolioSummary } from '@pnc/shared/domain';
import { APP_ENV, type Env } from '../config/env';
import { generateDataset, type Dataset } from './dataset';

@Injectable()
export class DatasetService {
  readonly data: Dataset;
  private summaryCache?: PortfolioSummary;
  constructor(@Inject(APP_ENV) private readonly env: Env) {
    this.data = generateDataset(env.DATASET_SIZE, env.DATASET_SEED);
  }

  accumulation(rp: Parameters<typeof toAccumulationRow>[2] = 100): AccumulationRow[] {
    return this.data.cells.map((c) => toAccumulationRow(c, this.data.appetiteScale, rp));
  }

  summary(): PortfolioSummary {
    if (this.summaryCache) return this.summaryCache;
    const ex = this.data.exposures;
    const lob = new Map<Lob, { tiv: number; premium: number; incurred: number; policies: number }>();
    const peril = new Map<Peril, { tiv: number; el: number }>();
    let tiv = 0,
      premium = 0,
      incurred = 0,
      el = 0;
    for (const e of ex) {
      tiv += e.tiv;
      premium += e.premium;
      incurred += e.incurredLoss;
      const x = expectedLoss(e);
      el += x;
      const l = lob.get(e.lob) ?? { tiv: 0, premium: 0, incurred: 0, policies: 0 };
      l.tiv += e.tiv;
      l.premium += e.premium;
      l.incurred += e.incurredLoss;
      l.policies++;
      lob.set(e.lob, l);
      const p = peril.get(e.peril) ?? { tiv: 0, el: 0 };
      p.tiv += e.tiv;
      p.el += x;
      peril.set(e.peril, p);
    }
    const rows = this.accumulation();
    this.summaryCache = {
      asOf: new Date().toISOString(),
      policies: ex.length,
      tiv,
      premium,
      incurredLoss: incurred,
      lossRatio: premium ? incurred / premium : 0,
      expectedLoss: el,
      pml: allReturnPeriodPml(this.data.cells),
      byLob: [...lob.entries()]
        .map(([k, v]) => ({
          lob: k,
          tiv: v.tiv,
          premium: v.premium,
          lossRatio: v.premium ? v.incurred / v.premium : 0,
          policies: v.policies,
        }))
        .sort((a, b) => b.tiv - a.tiv),
      byPeril: [...peril.entries()].map(([k, v]) => ({ peril: k, tiv: v.tiv, expectedLoss: v.el })).sort((a, b) => b.tiv - a.tiv),
      breaches: rows.filter((r) => r.status === 'breach').length,
      watch: rows.filter((r) => r.status === 'watch').length,
      trend: this.data.trend,
    };
    return this.summaryCache;
  }
}

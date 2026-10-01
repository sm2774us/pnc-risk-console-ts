import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ZONE_BY_CODE, expectedLoss, hazardFor, maskExposure, ratingFor, riskScore, toAccumulationRow } from '@pnc/shared/domain';
import type { Exposure, FilterModel, PolicyDetail, SortModelItem, SsrmRequest } from '@pnc/shared/domain';
import { LegacyRatingAdapter, LegacyRatingError } from '@pnc/shared/legacy-bridge';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions, type AuthedRequest } from '../auth/auth';
import { DatasetService } from '../data/dataset.service';
import { distinctValues, filterRows, runSsrm } from '../data/query-engine';

const Col = z.object({
  id: z.string().max(40),
  field: z.string().max(40),
  displayName: z.string().max(80).optional(),
  aggFunc: z.enum(['sum', 'avg', 'min', 'max', 'count']).optional(),
});
const SsrmBody = z.object({
  startRow: z.number().int().min(0),
  endRow: z.number().int().min(1),
  rowGroupCols: z.array(Col).max(4).default([]),
  valueCols: z.array(Col).max(12).default([]),
  groupKeys: z.array(z.string().max(80)).max(4).default([]),
  filterModel: z.record(z.string(), z.any()).default({}),
  sortModel: z
    .array(z.object({ colId: z.string().max(40), sort: z.enum(['asc', 'desc']) }))
    .max(4)
    .default([]),
});
const ExportQuery = z.object({ filterModel: z.string().max(4000).optional(), sortModel: z.string().max(1000).optional() });
const EXPORT_CAP = 200_000;
const CSV_COLS: (keyof Exposure)[] = [
  'policyNumber',
  'insured',
  'lob',
  'peril',
  'country',
  'zone',
  'tiv',
  'limit',
  'deductible',
  'premium',
  'incurredLoss',
  'lossRatio',
  'riskScore',
  'rating',
  'status',
  'inception',
  'expiry',
  'underwriter',
];

/** Neutralises CSV/Excel formula injection (=, +, -, @ prefixes) and quotes fields. */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

@Controller('exposures')
export class ExposureController {
  private readonly legacy = new LegacyRatingAdapter();
  constructor(@Inject(DatasetService) private readonly ds: DatasetService) {}

  @Post('query')
  @HttpCode(200)
  @RequirePermissions('exposure:read')
  query(@Body() body: unknown, @Req() req: AuthedRequest) {
    return runSsrm(this.ds.data.exposures, SsrmBody.parse(body) as SsrmRequest, req.user!.permissions);
  }

  @Get('distinct/:field')
  @RequirePermissions('exposure:read')
  @Header('Cache-Control', 'private, max-age=300')
  distinct(@Param('field') field: string) {
    return distinctValues(this.ds.data.exposures, field);
  }

  @Get('export.csv')
  @RequirePermissions('exposure:export')
  async exportCsv(@Query() query: unknown, @Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const q = ExportQuery.parse(query);
    let filterModel: FilterModel = {},
      sortModel: SortModelItem[] = [];
    try {
      filterModel = q.filterModel ? JSON.parse(q.filterModel) : {};
      sortModel = q.sortModel ? JSON.parse(q.sortModel) : [];
    } catch {
      throw new BadRequestException('filterModel/sortModel must be JSON');
    }
    // Reuse validation (and the masked-field guard) by executing a one-row probe.
    runSsrm(
      this.ds.data.exposures,
      { startRow: 0, endRow: 1, rowGroupCols: [], valueCols: [], groupKeys: [], filterModel, sortModel },
      req.user!.permissions,
    );
    const rows = filterRows(this.ds.data.exposures, filterModel).slice(0, EXPORT_CAP);
    res.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="exposures.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.write(`${CSV_COLS.join(',')}\n`);
    for (let i = 0; i < rows.length; i += 2000) {
      const chunk = rows.slice(i, i + 2000).map((r) => {
        const m = maskExposure(r, req.user!.permissions);
        return CSV_COLS.map((c) => csvCell(m[c])).join(',');
      });
      if (!res.write(`${chunk.join('\n')}\n`)) await new Promise<void>((r) => res.once('drain', r));
    }
    res.end();
  }

  @Get(':id')
  @RequirePermissions('exposure:read')
  detail(@Param('id') id: string, @Req() req: AuthedRequest): PolicyDetail {
    const e = this.ds.data.byId.get(id);
    if (!e) throw new NotFoundException(`Exposure ${id} not found`);
    const hazard = hazardFor(e.zone, e.peril);
    const modernScore = riskScore({ hazard, lossRatio: e.lossRatio, deductibleRatio: e.deductible / e.tiv });
    let legacy: PolicyDetail['scoring']['legacy'];
    try {
      // Feed values the way the legacy XML feed does: as strings.
      const r = this.legacy.rate({
        hazard: String(hazard),
        lossRatio: String(e.lossRatio),
        tiv: String(e.tiv),
        deductible: String(e.deductible),
      });
      legacy = { score: r.score, rating: r.rating };
    } catch (err) {
      legacy = { error: err instanceof LegacyRatingError ? err.code : 'LEGACY_UNKNOWN' };
    }
    const cell = this.ds.data.cells.find((c) => c.zone === e.zone && c.peril === e.peril);
    const peer = cell ? toAccumulationRow(cell, this.ds.data.appetiteScale) : undefined;
    return {
      exposure: maskExposure(e, req.user!.permissions),
      hazard,
      expectedLoss: expectedLoss(e),
      scoring: {
        modern: { score: modernScore, rating: ratingFor(modernScore) },
        legacy,
        reconciled: 'score' in legacy && legacy.score === modernScore,
      },
      zoneName: ZONE_BY_CODE.get(e.zone)?.name ?? e.zone,
      peers: {
        zone: e.zone,
        peril: e.peril,
        policies: peer?.policies ?? 0,
        tiv: peer?.tiv ?? 0,
        utilization: peer?.utilization ?? 0,
        status: peer?.status ?? 'ok',
      },
    };
  }
}

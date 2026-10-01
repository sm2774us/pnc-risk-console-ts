import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { RETURN_PERIODS, PERILS, applyStress } from '@pnc/shared/domain';
import type { ReturnPeriod, StressRequest } from '@pnc/shared/domain';
import { z } from 'zod';
import { RequirePermissions } from '../auth/auth';
import { DatasetService } from '../data/dataset.service';

const Rp = z.coerce
  .number()
  .refine((n): n is ReturnPeriod => (RETURN_PERIODS as readonly number[]).includes(n), 'returnPeriod must be one of 10, 50, 100, 250, 500');
const shockShape = Object.fromEntries(PERILS.map((p) => [p, z.number().min(-0.5).max(2).optional()]));
const StressBody = z.object({ returnPeriod: Rp, perilShocks: z.object(shockShape).strict().default({}) }).strict();

@Controller('portfolio')
export class PortfolioController {
  constructor(@Inject(DatasetService) private readonly ds: DatasetService) {}

  @Get('summary')
  @RequirePermissions('portfolio:read')
  summary() {
    return this.ds.summary();
  }

  @Get('accumulation')
  @RequirePermissions('portfolio:read')
  accumulation(@Query('returnPeriod') rp?: string) {
    return this.ds.accumulation(Rp.default(100).parse(rp));
  }

  /** Server-authoritative stress run (same pure function as the browser preview). */
  @Post('stress')
  @HttpCode(200)
  @RequirePermissions('stress:run')
  stress(@Body() body: unknown) {
    return applyStress(this.ds.data.cells, StressBody.parse(body) as StressRequest, this.ds.data.appetiteScale);
  }
}

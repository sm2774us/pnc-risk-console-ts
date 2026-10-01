import { type BeforeApplicationShutdown, Controller, Get, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { ServiceStatus } from '@pnc/shared/domain';
import { RequirePermissions, Public } from '../auth/auth';
import { DatasetService } from '../data/dataset.service';
import { APP_ENV, type Env } from '../config/env';

@Injectable()
export class LifecycleState implements BeforeApplicationShutdown {
  draining = false;
  readonly startedAt = Date.now();
  beforeApplicationShutdown(): void {
    this.draining = true;
  }
}

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    @Inject(LifecycleState) private readonly state: LifecycleState,
    @Inject(DatasetService) private readonly ds: DatasetService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  /** Liveness: the process is up. Must not depend on downstreams. */
  @Public()
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dataset loaded and not draining. Kubernetes removes the pod from the Service when this fails. */
  @Public()
  @Get('readyz')
  ready() {
    if (this.state.draining) throw new ServiceUnavailableException('draining');
    if (this.ds.data.exposures.length === 0) throw new ServiceUnavailableException('dataset not loaded');
    return { status: 'ready' };
  }

  @Get('status')
  @RequirePermissions('admin:status')
  status(): ServiceStatus {
    return {
      status: this.env.CHAOS_RATE > 0 ? 'degraded' : 'ok',
      version: this.env.APP_VERSION,
      uptimeSec: Math.round((Date.now() - this.state.startedAt) / 1000),
      datasetSize: this.ds.data.exposures.length,
      chaosRate: this.env.CHAOS_RATE,
      node: process.version,
    };
  }
}

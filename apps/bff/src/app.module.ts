import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthGuard, AuthService } from './auth/auth';
import { AccessLogInterceptor, TimeoutInterceptor } from './common/interceptors';
import { ProblemFilter } from './common/problem.filter';
import { APP_ENV, type Env } from './config/env';
import { DatasetService } from './data/dataset.service';
import { ExposureController } from './exposure/exposure.controller';
import { HealthController, LifecycleState } from './health/health.controller';
import { PortfolioController } from './portfolio/portfolio.controller';

export function buildAppModule(env: Env) {
  @Module({
    imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: env.RATE_LIMIT_PER_MIN }] })],
    controllers: [AuthController, ExposureController, PortfolioController, HealthController],
    providers: [
      { provide: APP_ENV, useValue: env },
      { provide: 'NODE_ENV', useValue: env.NODE_ENV },
      AuthService,
      DatasetService,
      LifecycleState,
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
      { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
      { provide: APP_FILTER, useClass: ProblemFilter },
    ],
  })
  class AppModule {}
  return AppModule;
}

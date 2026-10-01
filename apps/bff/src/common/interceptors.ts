import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, TimeoutError, catchError, tap, throwError, timeout } from 'rxjs';
import { APP_ENV, type Env } from '../config/env';

/** Bounds latency: no request may hold a worker longer than REQUEST_TIMEOUT_MS. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.env.REQUEST_TIMEOUT_MS),
      catchError((err) =>
        throwError(() => (err instanceof TimeoutError ? new RequestTimeoutException('Request exceeded time budget') : err)),
      ),
    );
  }
}

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('access');
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { correlationId?: string; user?: { sub: string } }>();
    const started = performance.now();
    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log({
            msg: 'request',
            method: req.method,
            path: req.path,
            sub: req.user?.sub,
            correlationId: req.correlationId,
            ms: Math.round(performance.now() - started),
          }),
      }),
    );
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { catchError, map, of, timer, switchMap } from 'rxjs';
import { ApiHealth, RiskApi, toAppError } from '@pnc/risk/data-access';
import type { ServiceStatus } from '@pnc/shared/domain';

type Vm = { s: ServiceStatus | null; error: string | null };

@Component({
  selector: 'pnc-status-page',
  imports: [MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="page">
    <h1>Service status</h1>
    <mat-card appearance="outlined"
      ><mat-card-content>
        <p>
          Client circuit breaker: <b>{{ health.breaker.state() }}</b>
        </p>
        @if (vm().s; as s) {
          <dl>
            <dt>Status</dt>
            <dd>{{ s.status }}</dd>
            <dt>Version</dt>
            <dd>{{ s.version }}</dd>
            <dt>Node</dt>
            <dd>{{ s.node }}</dd>
            <dt>Uptime</dt>
            <dd>{{ s.uptimeSec }}s</dd>
            <dt>Dataset rows</dt>
            <dd>{{ s.datasetSize }}</dd>
            <dt>Chaos rate</dt>
            <dd>{{ s.chaosRate }}</dd>
          </dl>
        }
        @if (vm().error) {
          <p role="alert">{{ vm().error }}</p>
        }
      </mat-card-content></mat-card
    >
  </section>`,
  styles: `
    dl {
      display: grid;
      grid-template-columns: 9rem 1fr;
      gap: 0.3rem 0.75rem;
    }
    dd {
      margin: 0;
    }
  `,
})
export class StatusPage {
  protected readonly health = inject(ApiHealth);
  private readonly api = inject(RiskApi);
  protected readonly vm = toSignal<Vm, Vm>(
    timer(0, 10_000).pipe(
      switchMap(() =>
        this.api.status$().pipe(
          map((s): Vm => ({ s, error: null })),
          catchError((e: unknown) => of<Vm>({ s: null, error: toAppError(e).message })),
        ),
      ),
    ),
    { initialValue: { s: null, error: null } },
  );
}

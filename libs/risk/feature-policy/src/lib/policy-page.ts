import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { RiskApi, toAppError, type AppError } from '@pnc/risk/data-access';
import { formatPct, formatUsd, type PolicyDetail } from '@pnc/shared/domain';
import { Icon, StatePanel, StatusChip } from '@pnc/shared/ui';

type Vm = { state: 'loading' } | { state: 'ready'; d: PolicyDetail } | { state: 'error'; e: AppError };

/** Route param `id` is bound with withComponentInputBinding(). */
@Component({
  selector: 'pnc-policy-page',
  imports: [MatCardModule, MatButtonModule, MatProgressBarModule, RouterLink, StatusChip, StatePanel, Icon, DatePipe, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page" aria-labelledby="pol-title">
      <a mat-button routerLink="/exposures"><pnc-icon name="back" /> Back to exposures</a>
      @switch (vm().state) {
        @case ('ready') {
          @if (detail(); as d) {
            <header class="head">
              <h1 id="pol-title">{{ d.exposure.policyNumber }} · {{ d.exposure.insured }}</h1>
              <pnc-status-chip kind="rating" [value]="d.exposure.rating" />
            </header>
            <div class="grid two">
              <mat-card appearance="outlined"
                ><mat-card-header><h2>Policy</h2></mat-card-header
                ><mat-card-content>
                  <dl>
                    <dt>Line / peril</dt>
                    <dd>{{ d.exposure.lob }} · {{ d.exposure.peril }}</dd>
                    <dt>Location</dt>
                    <dd>{{ d.zoneName }} ({{ d.exposure.zone }}), {{ d.exposure.country }}</dd>
                    <dt>Status</dt>
                    <dd>{{ d.exposure.status }}</dd>
                    <dt>Term</dt>
                    <dd>{{ d.exposure.inception | date: 'mediumDate' }} – {{ d.exposure.expiry | date: 'mediumDate' }}</dd>
                    <dt>Underwriter</dt>
                    <dd>{{ d.exposure.underwriter }}</dd>
                    <dt>TIV</dt>
                    <dd>{{ d.exposure.tiv | currency: 'USD' : 'symbol' : '1.0-0' }}</dd>
                    <dt>Limit / deductible</dt>
                    <dd>{{ money(d.exposure.limit) }} / {{ money(d.exposure.deductible) }}</dd>
                    <dt>Premium</dt>
                    <dd>{{ money(d.exposure.premium) }}</dd>
                    <dt>Loss ratio</dt>
                    <dd>{{ pct(d.exposure.lossRatio) }}</dd>
                    <dt>Expected loss</dt>
                    <dd>{{ money(d.expectedLoss) }} (hazard ×{{ d.hazard }})</dd>
                  </dl>
                </mat-card-content></mat-card
              >
              <mat-card appearance="outlined"
                ><mat-card-header><h2>Scoring reconciliation</h2></mat-card-header
                ><mat-card-content>
                  <p class="note">
                    The modern TypeScript model is compared with the legacy ES5 rating engine behind an anti-corruption layer.
                  </p>
                  <table class="rec" aria-label="Modern versus legacy score">
                    <thead>
                      <tr>
                        <th scope="col">Engine</th>
                        <th scope="col">Score</th>
                        <th scope="col">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Modern (TypeScript)</th>
                        <td>{{ d.scoring.modern.score }}</td>
                        <td>{{ d.scoring.modern.rating }}</td>
                      </tr>
                      <tr>
                        <th scope="row">Legacy (ES5)</th>
                        @if (legacyOk(d); as l) {
                          <td>{{ l.score }}</td>
                          <td>{{ l.rating }}</td>
                        } @else {
                          <td colspan="2">Unavailable: {{ legacyError(d) }}</td>
                        }
                      </tr>
                    </tbody>
                  </table>
                  <p role="status" [class.ok]="d.scoring.reconciled" [class.bad]="!d.scoring.reconciled">
                    {{ d.scoring.reconciled ? 'Engines agree.' : 'Engines disagree. Escalate to model risk.' }}
                  </p>
                </mat-card-content></mat-card
              >
              <mat-card appearance="outlined"
                ><mat-card-header><h2>Accumulation context</h2></mat-card-header
                ><mat-card-content>
                  <p>
                    {{ d.peers.policies }} policies in {{ d.zoneName }} for {{ d.peers.peril }}, TIV {{ money(d.peers.tiv) }}, utilisation
                    {{ pct(d.peers.utilization) }}.
                  </p>
                  <pnc-status-chip kind="utilization" [value]="d.peers.status" /> </mat-card-content
              ></mat-card>
            </div>
          }
        }
        @case ('error') {
          @if (error(); as e) {
            <pnc-state-panel title="Policy unavailable" [message]="e.message" [correlationId]="e.correlationId" />
          }
        }
        @default {
          <mat-progress-bar mode="indeterminate" aria-label="Loading policy" />
        }
      }
    </section>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .two {
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    }
    dl {
      display: grid;
      grid-template-columns: 9rem 1fr;
      gap: 0.35rem 0.75rem;
      margin: 0;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
    }
    .rec {
      border-collapse: collapse;
      width: 100%;
    }
    .rec th,
    .rec td {
      text-align: left;
      padding: 0.35rem 0.5rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .ok {
      color: #1b5e20;
      font-weight: 600;
    }
    .bad {
      color: #8c1d18;
      font-weight: 600;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PolicyPage {
  readonly id = input.required<string>();
  private readonly api = inject(RiskApi);
  protected readonly money = formatUsd;
  protected readonly pct = formatPct;

  protected readonly vm = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) =>
        this.api.detail$(id).pipe(
          map((d): Vm => ({ state: 'ready', d })),
          startWith<Vm>({ state: 'loading' }),
          catchError((e: unknown) => of<Vm>({ state: 'error', e: toAppError(e) })),
        ),
      ),
    ),
    { initialValue: { state: 'loading' } as Vm },
  );
  protected readonly detail = computed(() => {
    const v = this.vm();
    return v.state === 'ready' ? v.d : null;
  });
  protected readonly error = computed(() => {
    const v = this.vm();
    return v.state === 'error' ? v.e : null;
  });

  protected legacyOk(d: PolicyDetail): { score: number; rating: string } | null {
    const l = d.scoring.legacy;
    return 'error' in l ? null : l;
  }
  protected legacyError(d: PolicyDetail): string {
    const l = d.scoring.legacy;
    return 'error' in l ? l.error : '';
  }
}

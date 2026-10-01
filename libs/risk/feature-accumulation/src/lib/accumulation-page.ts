import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { catchError, map, of, startWith, switchMap, Subject } from 'rxjs';
import { AuthStore, RiskApi, toAppError, type AppError } from '@pnc/risk/data-access';
import {
  PERILS,
  RETURN_PERIODS,
  applyStress,
  formatPct,
  formatUsdCompact,
  inferAppetiteScale,
  type AccumulationRow,
  type Peril,
  type ReturnPeriod,
  type StressResult,
} from '@pnc/shared/domain';
import { Icon, StatePanel, StatusChip } from '@pnc/shared/ui';
import { buildTiles } from './heatmap';

interface LoadVm {
  rows: AccumulationRow[] | null;
  err: AppError | null;
}
interface ServerVm {
  result: StressResult | null;
  error: string | null;
}

@Component({
  selector: 'pnc-accumulation-page',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatSelectModule,
    MatProgressBarModule,
    StatePanel,
    StatusChip,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page" aria-labelledby="acc-title">
      <header class="head">
        <h1 id="acc-title">Accumulation &amp; stress</h1>
        <mat-button-toggle-group aria-label="Return period" [value]="rp()" (change)="rp.set($event.value)">
          @for (p of periods; track p) {
            <mat-button-toggle [value]="p">1-in-{{ p }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </header>

      @if (base(); as b) {
        <div class="grid two">
          <mat-card appearance="outlined">
            <mat-card-header><h2>Utilisation map</h2></mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="sel"
                ><mat-label>Peril</mat-label>
                <mat-select [value]="peril()" (selectionChange)="peril.set($event.value)"
                  ><mat-option value="all">Worst peril</mat-option>
                  @for (p of perils; track p) {
                    <mat-option [value]="p">{{ p }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <div class="map" role="img" [attr.aria-label]="mapLabel()">
                @for (t of tiles(); track t.code) {
                  <div
                    class="tile"
                    [class]="t.status"
                    [style.grid-column]="t.col + 1"
                    [style.grid-row]="t.row + 1"
                    [title]="t.name + ': ' + (t.utilization === null ? 'n/a' : pct(t.utilization))"
                  >
                    <b>{{ t.code }}</b
                    ><span>{{ t.utilization === null ? '–' : pct(t.utilization) }}</span>
                  </div>
                }
              </div>
              <p class="legend">
                <pnc-status-chip kind="utilization" value="ok" /> <pnc-status-chip kind="utilization" value="watch" />
                <pnc-status-chip kind="utilization" value="breach" />
              </p>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header><h2>Stress test</h2></mat-card-header>
            <mat-card-content>
              <p class="note">
                Shock peril severity. The preview is computed instantly in your browser; “Run authoritative” recomputes on the server.
              </p>
              @for (p of perils; track p) {
                <label class="sl"
                  ><span>{{ p }} {{ fmtShock(shocks()[p]) }}</span>
                  <mat-slider min="-50" max="200" step="5" [disabled]="!canStress()"
                    ><input
                      matSliderThumb
                      [value]="(shocks()[p] ?? 0) * 100"
                      (valueChange)="setShock(p, $event)"
                      [attr.aria-label]="p + ' severity shock percent'" /></mat-slider
                ></label>
              }
              <div class="result" role="status">
                <div>
                  Baseline PML <b>{{ usd(preview().baselinePml) }}</b>
                </div>
                <div>
                  Stressed PML <b>{{ usd(preview().stressedPml) }}</b>
                </div>
                <div>
                  Change <b [class.bad]="preview().delta > 0">{{ pct(preview().deltaPct) }}</b>
                </div>
              </div>
              @if (canStress()) {
                <button mat-flat-button type="button" (click)="runServer$.next()"><pnc-icon name="check" /> Run authoritative</button>
                <button mat-stroked-button type="button" (click)="reset()">Reset</button>
              } @else {
                <p class="note">Your role is read-only for stress testing.</p>
              }
              @if (server(); as s) {
                @if (s.error) {
                  <p role="alert">Server run failed: {{ s.error }}</p>
                } @else if (s.result) {
                  <p class="auth" role="status">
                    Server result: {{ usd(s.result.stressedPml) }} ({{ pct(s.result.deltaPct) }}) · {{ s.result.rows.length }} cells
                    re-scored
                  </p>
                }
              }
            </mat-card-content>
          </mat-card>
        </div>
      } @else if (err(); as e) {
        <pnc-state-panel title="Accumulation unavailable" [message]="e.message" [correlationId]="e.correlationId" (retry)="retry$.next()" />
      } @else {
        <mat-progress-bar mode="indeterminate" aria-label="Loading accumulation" />
      }
    </section>
  `,
  styles: `
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .two {
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    }
    .sel {
      width: 100%;
    }
    .map {
      display: grid;
      grid-template-columns: repeat(9, minmax(0, 1fr));
      gap: 4px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.3rem 0.1rem;
      border-radius: 6px;
      font: var(--mat-sys-label-small);
      border: 1px solid transparent;
    }
    .tile.ok {
      background: #e8f5e9;
      color: #1b5e20;
    }
    .tile.watch {
      background: #fff3e0;
      color: #7a4a00;
      border-color: #7a4a00;
    }
    .tile.breach {
      background: #fdecea;
      color: #8c1d18;
      border: 2px solid #8c1d18;
      font-weight: 700;
    }
    .tile.none {
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
    }
    .sl {
      display: grid;
      grid-template-columns: 11rem 1fr;
      align-items: center;
    }
    .result {
      display: flex;
      gap: 1.25rem;
      flex-wrap: wrap;
      margin: 1rem 0;
    }
    .bad {
      color: #8c1d18;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
    }
    .legend {
      margin-top: 0.75rem;
      display: flex;
      gap: 0.5rem;
    }
  `,
})
export class AccumulationPage {
  private readonly api = inject(RiskApi);
  private readonly auth = inject(AuthStore);
  protected readonly periods = RETURN_PERIODS;
  protected readonly perils = PERILS;
  protected readonly usd = formatUsdCompact;
  protected readonly pct = formatPct;
  protected readonly rp = signal<ReturnPeriod>(100);
  protected readonly peril = signal<Peril | 'all'>('all');
  protected readonly shocks = signal<Partial<Record<Peril, number>>>({});
  protected readonly canStress = computed(() => this.auth.can('stress:run'));
  protected readonly retry$ = new Subject<void>();
  protected readonly runServer$ = new Subject<void>();

  private readonly load = toSignal<LoadVm, LoadVm>(
    this.retry$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.api.accumulation$(100).pipe(
          map((r): LoadVm => ({ rows: r.data, err: null })),
          catchError((e: unknown) => of<LoadVm>({ rows: null, err: toAppError(e) })),
        ),
      ),
    ),
    { initialValue: { rows: null, err: null } },
  );
  protected readonly base = computed(() => this.load().rows);
  protected readonly err = computed(() => this.load().err);

  /** Client preview reuses the exact shared domain model the BFF uses, so preview and server agree. */
  protected readonly preview = computed<StressResult>(() => {
    const rows = this.base() ?? [];
    return applyStress(rows, { returnPeriod: this.rp(), perilShocks: this.shocks() }, inferAppetiteScale(rows));
  });
  protected readonly tiles = computed(() => buildTiles(this.preview().rows, this.peril()));
  protected readonly mapLabel = computed(
    () => `Tile map of utilisation: ${this.tiles().filter((t) => t.status === 'breach').length} zones in breach`,
  );

  protected readonly server = toSignal<ServerVm | null, null>(
    this.runServer$.pipe(
      switchMap(() =>
        this.api.stress$({ returnPeriod: this.rp(), perilShocks: this.shocks() }).pipe(
          map((result): ServerVm => ({ result, error: null })),
          catchError((e: unknown) => of<ServerVm>({ result: null, error: toAppError(e).message })),
        ),
      ),
    ),
    { initialValue: null },
  );

  protected setShock(p: Peril, percent: number): void {
    this.shocks.update((s) => ({ ...s, [p]: percent / 100 }));
  }
  protected reset(): void {
    this.shocks.set({});
  }
  protected fmtShock(v: number | undefined): string {
    return v ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : '±0%';
  }
}

import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { RETURN_PERIODS, formatPct, formatUsdCompact } from '@pnc/shared/domain';
import { PortfolioStore } from '@pnc/risk/data-access';
import { BarChart, DonutChart, Icon, KpiCard, LineChart, StatePanel } from '@pnc/shared/ui';

@Component({
  selector: 'pnc-dashboard-page',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatTableModule,
    MatProgressBarModule,
    RouterLink,
    DatePipe,
    KpiCard,
    BarChart,
    DonutChart,
    LineChart,
    StatePanel,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page" aria-labelledby="dash-title">
      <header class="head">
        <h1 id="dash-title">Portfolio dashboard</h1>
        <div class="actions">
          @if (vm().status === 'stale') {
            <span class="stale" role="status">Showing last known data</span>
          }
          @if (vm().at; as at) {
            <span class="asof">Updated {{ at | date: 'mediumTime' }}</span>
          }
          <button mat-stroked-button type="button" (click)="store.reload()"><pnc-icon name="refresh" /> Refresh</button>
        </div>
      </header>

      @if (summary(); as s) {
        <div class="kpis grid">
          <pnc-kpi-card label="Total insured value" [value]="usd(s.tiv)" [hint]="s.policies + ' policies'" />
          <pnc-kpi-card label="Written premium" [value]="usd(s.premium)" />
          <pnc-kpi-card
            label="Loss ratio"
            [value]="pct(s.lossRatio)"
            [tone]="s.lossRatio > 0.75 ? 'warn' : 'good'"
            hint="Incurred / premium"
          />
          <pnc-kpi-card label="Expected annual loss" [value]="usd(s.expectedLoss)" />
          <pnc-kpi-card label="1-in-100 PML" [value]="usd(s.pml[100])" hint="Illustrative model" />
          <pnc-kpi-card
            label="Appetite breaches"
            [value]="'' + s.breaches"
            [tone]="s.breaches > 0 ? 'bad' : 'good'"
            [hint]="s.watch + ' on watch'"
          />
        </div>

        <div class="charts grid">
          <mat-card appearance="outlined"
            ><mat-card-content><pnc-bar-chart caption="Insured value by line of business" [data]="lobData()" /></mat-card-content
          ></mat-card>
          <mat-card appearance="outlined"
            ><mat-card-content><pnc-donut-chart caption="Insured value by peril" [data]="perilData()" /></mat-card-content
          ></mat-card>
          <mat-card appearance="outlined" class="wide"
            ><mat-card-content
              ><pnc-line-chart
                caption="Written premium vs incurred loss by inception month"
                [labels]="trendLabels()"
                [series]="trendSeries()" /></mat-card-content
          ></mat-card>
        </div>

        <div class="grid two">
          <mat-card appearance="outlined">
            <mat-card-header><h2>PML ladder</h2></mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="ladder()" aria-label="Probable maximum loss by return period">
                <ng-container matColumnDef="rp"
                  ><th mat-header-cell *matHeaderCellDef scope="col">Return period</th>
                  <td mat-cell *matCellDef="let r">1-in-{{ r.rp }}</td></ng-container
                >
                <ng-container matColumnDef="pml"
                  ><th mat-header-cell *matHeaderCellDef scope="col">PML</th>
                  <td mat-cell *matCellDef="let r">{{ r.pml }}</td></ng-container
                >
                <ng-container matColumnDef="pct"
                  ><th mat-header-cell *matHeaderCellDef scope="col">% of TIV</th>
                  <td mat-cell *matCellDef="let r">{{ r.pct }}</td></ng-container
                >
                <tr mat-header-row *matHeaderRowDef="['rp', 'pml', 'pct']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['rp', 'pml', 'pct']"></tr>
              </table>
            </mat-card-content>
          </mat-card>
          <mat-card appearance="outlined">
            <mat-card-header><h2>Next steps</h2></mat-card-header>
            <mat-card-content>
              <p>{{ s.breaches }} zone-peril cells are over appetite and {{ s.watch }} are approaching it.</p>
              <a mat-flat-button routerLink="/accumulation">Review accumulation</a>
              <a mat-stroked-button routerLink="/exposures">Explore exposures</a>
            </mat-card-content>
          </mat-card>
        </div>
      } @else if (vm().error; as e) {
        <pnc-state-panel
          title="Portfolio data unavailable"
          [message]="e.message"
          [correlationId]="e.correlationId"
          (retry)="store.reload()"
        />
      } @else {
        <mat-progress-bar mode="indeterminate" aria-label="Loading portfolio" />
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
    .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .asof {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .stale {
      font: var(--mat-sys-label-large);
      color: #7a4a00;
      background: #fff3e0;
      padding: 0.1rem 0.6rem;
      border-radius: 999px;
    }
    .kpis {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      margin-bottom: 1rem;
    }
    .charts {
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      margin-bottom: 1rem;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .two {
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    }
    mat-card-content {
      padding-top: 1rem;
    }
    a + a {
      margin-left: 0.5rem;
    }
  `,
})
export class DashboardPage {
  protected readonly store = inject(PortfolioStore);
  protected readonly vm = this.store.vm;
  protected readonly summary = this.store.summary;
  protected readonly usd = formatUsdCompact;
  protected readonly pct = formatPct;

  protected readonly lobData = computed(() => this.summary()?.byLob.map((l) => ({ label: l.lob, value: l.tiv })) ?? []);
  protected readonly perilData = computed(() => this.summary()?.byPeril.map((p) => ({ label: p.peril, value: p.tiv })) ?? []);
  protected readonly trendLabels = computed(() => this.summary()?.trend.map((t) => t.month) ?? []);
  protected readonly trendSeries = computed(() => {
    const t = this.summary()?.trend ?? [];
    return [
      { name: 'Premium', values: t.map((x) => x.premium) },
      { name: 'Incurred', values: t.map((x) => x.incurred) },
    ];
  });
  protected readonly ladder = computed(() => {
    const s = this.summary();
    return s ? RETURN_PERIODS.map((rp) => ({ rp, pml: formatUsdCompact(s.pml[rp]), pct: formatPct(s.pml[rp] / s.tiv) })) : [];
  });
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Datum {
  label: string;
  value: number;
}
const PALETTE = ['#1a73e8', '#0b8043', '#e37400', '#a142f4', '#d93025', '#00897b', '#5f6368'];
const fmt = (n: number) =>
  Math.abs(n) >= 1e9
    ? `${(n / 1e9).toFixed(1)}B`
    : Math.abs(n) >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `${(n / 1e3).toFixed(0)}K`
        : n.toFixed(0);

/** Accessible horizontal bar chart (SVG) with a visually hidden data table fallback for screen readers. */
@Component({
  selector: 'pnc-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure>
      <figcaption>{{ caption() }}</figcaption>
      <svg [attr.viewBox]="'0 0 520 ' + height()" role="img" [attr.aria-label]="caption()">
        @for (b of bars(); track b.label) {
          <text x="0" [attr.y]="b.y + 15" class="lbl">{{ b.label }}</text>
          <rect x="150" [attr.y]="b.y" [attr.width]="b.w" height="20" rx="3" [attr.fill]="b.color" />
          <text [attr.x]="156 + b.w" [attr.y]="b.y + 15" class="val">{{ b.text }}</text>
        }
      </svg>
      <table class="sr-only">
        <caption>
          {{
            caption()
          }}
        </caption>
        <tbody>
          @for (d of data(); track d.label) {
            <tr>
              <th scope="row">{{ d.label }}</th>
              <td>{{ d.value }}</td>
            </tr>
          }
        </tbody>
      </table>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    figcaption {
      font: var(--mat-sys-title-small);
      margin-bottom: 0.5rem;
    }
    svg {
      width: 100%;
      height: auto;
    }
    .lbl,
    .val {
      font:
        12px system-ui,
        sans-serif;
      fill: var(--mat-sys-on-surface);
    }
    .val {
      fill: var(--mat-sys-on-surface-variant);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class BarChart {
  readonly caption = input.required<string>();
  readonly data = input.required<readonly Datum[]>();
  protected readonly height = computed(() => this.data().length * 28 + 4);
  protected readonly bars = computed(() => {
    const max = Math.max(1, ...this.data().map((d) => d.value));
    return this.data().map((d, i) => ({
      label: d.label,
      y: i * 28,
      w: Math.max(2, (d.value / max) * 280),
      color: PALETTE[i % PALETTE.length]!,
      text: fmt(d.value),
    }));
  });
}

@Component({
  selector: 'pnc-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure>
      <figcaption>{{ caption() }}</figcaption>
      <div class="wrap">
        <svg viewBox="0 0 120 120" role="img" [attr.aria-label]="caption()">
          @for (s of slices(); track s.label) {
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke-width="22"
              [attr.stroke]="s.color"
              [attr.stroke-dasharray]="s.dash"
              [attr.stroke-dashoffset]="s.offset"
              transform="rotate(-90 60 60)"
            />
          }
        </svg>
        <ul>
          @for (s of slices(); track s.label) {
            <li>
              <span class="sw" [style.background]="s.color"></span>{{ s.label }} <b>{{ s.pct }}</b>
            </li>
          }
        </ul>
      </div>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    figcaption {
      font: var(--mat-sys-title-small);
      margin-bottom: 0.5rem;
    }
    .wrap {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }
    svg {
      width: 140px;
      height: 140px;
      flex: none;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      font: var(--mat-sys-body-medium);
    }
    li {
      margin: 0.15rem 0;
    }
    .sw {
      display: inline-block;
      width: 0.7rem;
      height: 0.7rem;
      border-radius: 2px;
      margin-right: 0.4rem;
    }
  `,
})
export class DonutChart {
  readonly caption = input.required<string>();
  readonly data = input.required<readonly Datum[]>();
  protected readonly slices = computed(() => {
    const total = this.data().reduce((s, d) => s + d.value, 0) || 1;
    const C = 2 * Math.PI * 42;
    let acc = 0;
    return this.data().map((d, i) => {
      const frac = d.value / total;
      const s = {
        label: d.label,
        color: PALETTE[i % PALETTE.length]!,
        dash: `${frac * C} ${C - frac * C}`,
        offset: -acc * C,
        pct: `${(frac * 100).toFixed(0)}%`,
      };
      acc += frac;
      return s;
    });
  });
}

@Component({
  selector: 'pnc-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure>
      <figcaption>{{ caption() }}</figcaption>
      <svg viewBox="0 0 520 180" role="img" [attr.aria-label]="caption()">
        <line x1="30" y1="150" x2="510" y2="150" class="axis" />
        <line x1="30" y1="10" x2="30" y2="150" class="axis" />
        @for (l of lines(); track l.name) {
          <polyline fill="none" stroke-width="2" [attr.stroke]="l.color" [attr.points]="l.points" />
        }
        @for (x of ticks(); track x.label) {
          <text [attr.x]="x.x" y="168" class="t" text-anchor="middle">{{ x.label }}</text>
        }
      </svg>
      <ul class="legend">
        @for (l of lines(); track l.name) {
          <li><span class="sw" [style.background]="l.color"></span>{{ l.name }}</li>
        }
      </ul>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    figcaption {
      font: var(--mat-sys-title-small);
      margin-bottom: 0.5rem;
    }
    svg {
      width: 100%;
      height: auto;
    }
    .axis {
      stroke: var(--mat-sys-outline);
      stroke-width: 1;
    }
    .t {
      font:
        10px system-ui,
        sans-serif;
      fill: var(--mat-sys-on-surface-variant);
    }
    .legend {
      display: flex;
      gap: 1rem;
      list-style: none;
      padding: 0;
      margin: 0.25rem 0 0;
      font: var(--mat-sys-body-small);
    }
    .sw {
      display: inline-block;
      width: 0.7rem;
      height: 0.7rem;
      margin-right: 0.3rem;
      border-radius: 2px;
    }
  `,
})
export class LineChart {
  readonly caption = input.required<string>();
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly { name: string; values: readonly number[] }[]>();
  protected readonly lines = computed(() => {
    const max = Math.max(1, ...this.series().flatMap((s) => s.values));
    const n = Math.max(1, this.labels().length - 1);
    return this.series().map((s, i) => ({
      name: s.name,
      color: PALETTE[i % PALETTE.length]!,
      points: s.values.map((v, k) => `${30 + (k / n) * 480},${150 - (v / max) * 140}`).join(' '),
    }));
  });
  protected readonly ticks = computed(() => {
    const n = Math.max(1, this.labels().length - 1);
    return this.labels()
      .map((label, k) => ({ label, x: 30 + (k / n) * 480 }))
      .filter((_, k) => k % 4 === 0);
  });
}

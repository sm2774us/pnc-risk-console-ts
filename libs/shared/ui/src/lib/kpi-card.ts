import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad';

@Component({
  selector: 'pnc-kpi-card',
  imports: [MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card appearance="outlined" [class]="'tone-' + tone()">
      <mat-card-content>
        <div class="label" [id]="labelId()">{{ label() }}</div>
        <div class="value" [attr.aria-labelledby]="labelId()">{{ value() }}</div>
        @if (hint()) {
          <div class="hint">{{ hint() }}</div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-card {
      height: 100%;
      border-inline-start: 4px solid var(--tone, var(--mat-sys-outline-variant));
    }
    .label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-headline-medium);
      margin-block: 0.25rem;
      font-variant-numeric: tabular-nums;
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .tone-good {
      --tone: #2e7d32;
    }
    .tone-warn {
      --tone: #b26a00;
    }
    .tone-bad {
      --tone: var(--mat-sys-error);
    }
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string>('');
  readonly tone = input<Tone>('neutral');
  protected labelId(): string {
    return `kpi-${this.label()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`;
  }
}

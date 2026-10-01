import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Kind = 'rating' | 'utilization';
const RATING_TONE: Record<string, string> = { A: 'good', B: 'good', C: 'warn', D: 'bad', E: 'bad' };
const UTIL_TONE: Record<string, string> = { ok: 'good', watch: 'warn', breach: 'bad' };
const UTIL_LABEL: Record<string, string> = { ok: 'Within appetite', watch: 'Watch', breach: 'Breach' };

/** Never colour-only: every state carries text, so it is distinguishable without colour perception (WCAG 1.4.1). */
@Component({
  selector: 'pnc-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="tone()">{{ text() }}</span>`,
  styles: `
    .chip {
      display: inline-block;
      padding: 0.125rem 0.6rem;
      border-radius: 999px;
      font: var(--mat-sys-label-medium);
      border: 1px solid currentColor;
    }
    .good {
      color: #1b5e20;
      background: #e8f5e9;
    }
    .warn {
      color: #7a4a00;
      background: #fff3e0;
    }
    .bad {
      color: #8c1d18;
      background: #fdecea;
    }
    @media (prefers-color-scheme: dark) {
      .good {
        color: #a5d6a7;
        background: #1b3a1f;
      }
      .warn {
        color: #ffcc80;
        background: #3d2a0a;
      }
      .bad {
        color: #f2b8b5;
        background: #4a1512;
      }
    }
  `,
})
export class StatusChip {
  readonly kind = input<Kind>('rating');
  readonly value = input.required<string>();
  protected readonly tone = computed(() => (this.kind() === 'rating' ? RATING_TONE : UTIL_TONE)[this.value()] ?? 'warn');
  protected readonly text = computed(() =>
    this.kind() === 'rating' ? `Rating ${this.value()}` : (UTIL_LABEL[this.value()] ?? this.value()),
  );
}

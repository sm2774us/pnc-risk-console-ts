import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from './icon';

/** Section-level error boundary: a failing widget shows its own retry instead of breaking the page. */
@Component({
  selector: 'pnc-state-panel',
  imports: [MatButtonModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel" role="alert">
      <pnc-icon name="warning" />
      <div>
        <strong>{{ title() }}</strong>
        <p>{{ message() }}</p>
        @if (correlationId()) {
          <p class="cid">
            Reference: <code>{{ correlationId() }}</code>
          </p>
        }
        <button mat-stroked-button type="button" (click)="retry.emit()"><pnc-icon name="refresh" /> Try again</button>
      </div>
    </div>
  `,
  styles: `
    .panel {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border: 1px solid var(--mat-sys-error);
      border-radius: var(--mat-sys-corner-medium);
      color: var(--mat-sys-on-surface);
    }
    p {
      margin: 0.25rem 0 0.75rem;
    }
    .cid {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    pnc-icon {
      color: var(--mat-sys-error);
    }
  `,
})
export class StatePanel {
  readonly title = input('Something went wrong');
  readonly message = input.required<string>();
  readonly correlationId = input<string | undefined>();
  readonly retry = output<void>();
}

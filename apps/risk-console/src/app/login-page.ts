import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { AuthStore, toAppError } from '@pnc/risk/data-access';
import { DEMO_PERSONAS } from '@pnc/shared/domain';

@Component({
  selector: 'pnc-login-page',
  imports: [MatCardModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <mat-card appearance="outlined">
        <mat-card-header><h1>PNC Risk Console</h1></mat-card-header>
        <mat-card-content>
          <p>Demo sign-in. Choose a persona to see least-privilege access in action. Production deployments use OIDC.</p>
          <ul class="personas">
            @for (p of personas; track p.sub) {
              <li>
                <button mat-stroked-button type="button" [disabled]="busy()" (click)="signIn(p.sub)">
                  <b>{{ p.name }}</b> <small>{{ p.role }}</small>
                </button>
              </li>
            }
          </ul>
          @if (error()) {
            <p role="alert" class="err">{{ error() }}</p>
          }
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1rem;
    }
    mat-card {
      max-width: 460px;
      width: 100%;
    }
    .personas {
      list-style: none;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }
    button {
      width: 100%;
      justify-content: space-between;
    }
    .err {
      color: #8c1d18;
    }
  `,
})
export class LoginPage {
  readonly returnUrl = input<string>();
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly personas = DEMO_PERSONAS;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected signIn(persona: string): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.login(persona).subscribe({
      next: () => {
        const t = this.returnUrl();
        void this.router.navigateByUrl(t && t.startsWith('/') && !t.startsWith('//') ? t : '/dashboard');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(toAppError(e).message);
      },
    });
  }
}

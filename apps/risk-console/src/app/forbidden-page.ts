import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'pnc-forbidden',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="page">
    <h1>Access denied</h1>
    <p>Your role does not include this area.</p>
    <a routerLink="/dashboard">Go to dashboard</a>
  </section>`,
})
export class ForbiddenPage {}

@Component({
  selector: 'pnc-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="page">
    <h1>Page not found</h1>
    <a routerLink="/dashboard">Go to dashboard</a>
  </section>`,
})
export class NotFoundPage {}

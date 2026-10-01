import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { ApiHealth, AuthStore } from '@pnc/risk/data-access';
import { Icon, type IconName } from '@pnc/shared/ui';
import type { Permission } from '@pnc/shared/domain';
import { ThemeService } from './theme';

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  needs: Permission;
}
const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', needs: 'portfolio:read' },
  { label: 'Exposures', path: '/exposures', icon: 'table', needs: 'exposure:read' },
  { label: 'Accumulation', path: '/accumulation', icon: 'map', needs: 'portfolio:read' },
  { label: 'Service status', path: '/admin/status', icon: 'shield', needs: 'admin:status' },
];

@Component({
  selector: 'pnc-shell',
  imports: [MatSidenavModule, MatToolbarModule, MatListModule, MatButtonModule, RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip" href="#main">Skip to content</a>
    <mat-sidenav-container class="root">
      <mat-sidenav
        [mode]="narrow() ? 'over' : 'side'"
        [opened]="!narrow() || open()"
        (closedStart)="open.set(false)"
        role="navigation"
        aria-label="Primary"
      >
        <div class="brand">PNC Risk Console</div>
        <mat-nav-list>
          @for (n of items(); track n.path) {
            <a
              mat-list-item
              [routerLink]="n.path"
              routerLinkActive="active"
              #rla="routerLinkActive"
              [attr.aria-current]="rla.isActive ? 'page' : null"
              (click)="narrow() && open.set(false)"
              ><pnc-icon matListItemIcon [name]="n.icon" /> <span matListItemTitle>{{ n.label }}</span></a
            >
          }
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar>
          @if (narrow()) {
            <button mat-icon-button type="button" aria-label="Open navigation" (click)="open.set(!open())"><pnc-icon name="menu" /></button>
          }
          <span class="spacer"></span>
          <span class="who">{{ auth.user()?.name }} · {{ auth.user()?.role }}</span>
          <button
            mat-icon-button
            type="button"
            [attr.aria-label]="'Theme: ' + theme.mode() + '. Activate to change'"
            (click)="theme.cycle()"
          >
            <pnc-icon name="theme" />
          </button>
          <button mat-button type="button" (click)="logout()"><pnc-icon name="logout" /> Sign out</button>
        </mat-toolbar>
        @if (health.degraded()) {
          <div class="banner" role="status">
            <pnc-icon name="warning" /> Service is degraded. Showing last known data where available
            @if (health.breaker.state() !== 'closed') {
              (circuit {{ health.breaker.state() }})
            }
            .
          </div>
        }
        <main id="main" tabindex="-1"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .root {
      height: 100vh;
    }
    mat-sidenav {
      width: 240px;
    }
    .brand {
      font: var(--mat-sys-title-medium);
      padding: 1rem 1.25rem;
    }
    .spacer {
      flex: 1;
    }
    .who {
      font: var(--mat-sys-label-large);
      margin-right: 0.5rem;
    }
    .active {
      background: var(--mat-sys-secondary-container);
    }
    .banner {
      background: #fff3e0;
      color: #7a4a00;
      padding: 0.5rem 1.5rem;
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font: var(--mat-sys-label-large);
    }
    .skip {
      position: absolute;
      left: -999px;
      top: 0;
      z-index: 10;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      padding: 0.5rem 1rem;
    }
    .skip:focus {
      left: 0;
    }
    main:focus {
      outline: none;
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly health = inject(ApiHealth);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);
  protected readonly narrow = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 900px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly items = computed(() => NAV.filter((n) => this.auth.can(n.needs)));
  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}

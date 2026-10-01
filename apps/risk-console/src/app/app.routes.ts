import { type Routes } from '@angular/router';
import { authGuard, permissionGuard } from './guards';

export const routes: Routes = [
  { path: 'login', title: 'Sign in · PNC Risk Console', loadComponent: () => import('./login-page').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · PNC Risk Console',
        canActivate: [permissionGuard('portfolio:read')],
        loadComponent: () => import('@pnc/risk/feature-dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'exposures',
        title: 'Exposures · PNC Risk Console',
        canActivate: [permissionGuard('exposure:read')],
        loadComponent: () => import('@pnc/risk/feature-exposure').then((m) => m.ExposurePage),
      },
      {
        path: 'policies/:id',
        title: 'Policy · PNC Risk Console',
        canActivate: [permissionGuard('exposure:read')],
        loadComponent: () => import('@pnc/risk/feature-policy').then((m) => m.PolicyPage),
      },
      {
        path: 'accumulation',
        title: 'Accumulation · PNC Risk Console',
        canActivate: [permissionGuard('portfolio:read')],
        loadComponent: () => import('@pnc/risk/feature-accumulation').then((m) => m.AccumulationPage),
      },
      {
        path: 'admin/status',
        title: 'Service status · PNC Risk Console',
        canActivate: [permissionGuard('admin:status')],
        loadComponent: () => import('./status-page').then((m) => m.StatusPage),
      },
      { path: 'forbidden', title: 'Forbidden', loadComponent: () => import('./forbidden-page').then((m) => m.ForbiddenPage) },
    ],
  },
  { path: '**', title: 'Not found', loadComponent: () => import('./forbidden-page').then((m) => m.NotFoundPage) },
];

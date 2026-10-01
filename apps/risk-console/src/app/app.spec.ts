import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '@pnc/risk/data-access';
import { authGuard, permissionGuard } from './guards';
import { routes } from './app.routes';

describe('route guards (deny by default)', () => {
  const run = (g: unknown, user: { can: (p: string) => boolean; isAuthenticated: () => boolean }): unknown => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: AuthStore, useValue: user }] });
    return TestBed.runInInjectionContext(() => (g as (a: unknown, b: unknown) => unknown)({}, { url: '/exposures' }));
  };
  it('redirects anonymous users to /login with returnUrl', () => {
    const r = run(authGuard, { can: () => false, isAuthenticated: () => false });
    expect(TestBed.inject(Router).serializeUrl(r as never)).toBe('/login?returnUrl=%2Fexposures');
  });
  it('allows authenticated users', () => {
    expect(run(authGuard, { can: () => true, isAuthenticated: () => true })).toBe(true);
  });
  it('forbids a missing permission', () => {
    const r = run(permissionGuard('admin:status'), { can: () => false, isAuthenticated: () => true });
    expect(TestBed.inject(Router).serializeUrl(r as never)).toBe('/forbidden');
  });
});

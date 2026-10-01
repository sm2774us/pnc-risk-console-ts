import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PortfolioStore } from '@pnc/risk/data-access';
import type { PortfolioSummary } from '@pnc/shared/domain';
import { describe, expect, it } from 'vitest';
import { DashboardPage } from '../index';

const summary: PortfolioSummary = {
  asOf: '2026-10-01',
  policies: 100,
  tiv: 5e9,
  premium: 1e8,
  incurredLoss: 6e7,
  lossRatio: 0.6,
  expectedLoss: 2e7,
  pml: { 10: 1, 50: 2, 100: 3e8, 250: 4, 500: 5 },
  breaches: 3,
  watch: 5,
  byLob: [{ lob: 'Cyber', tiv: 1e9, premium: 1e7, lossRatio: 0.5, policies: 10 }],
  byPeril: [{ peril: 'Windstorm', tiv: 2e9, expectedLoss: 1 }],
  trend: [
    { month: '2026-01', premium: 1, incurred: 1, policies: 1 },
    { month: '2026-02', premium: 2, incurred: 1, policies: 1 },
  ],
};

function mount(vm: object) {
  const data = (vm as { data: PortfolioSummary | null }).data;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PortfolioStore,
        useValue: {
          vm: signal(vm),
          summary: signal(data),
          reload: () => {
            reloaded++;
          },
        },
      },
    ],
  });
  const f = TestBed.createComponent(DashboardPage);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}
let reloaded = 0;

describe('DashboardPage', () => {
  it('renders KPIs, charts and the PML ladder from the store', () => {
    const el = mount({ status: 'ready', data: summary, error: null, at: Date.now() });
    expect(el.textContent).toContain('Total insured value');
    expect(el.textContent).toContain('$5B');
    expect(el.textContent).toContain('1-in-100');
    expect(el.querySelectorAll('pnc-kpi-card')).toHaveLength(6);
    expect(el.querySelector('pnc-line-chart polyline')).toBeTruthy();
  });
  it('flags stale data without hiding it', () => {
    const el = mount({ status: 'stale', data: summary, error: null, at: Date.now() });
    expect(el.querySelector('[role=status]')?.textContent).toContain('last known');
    expect(el.querySelector('pnc-kpi-card')).toBeTruthy();
  });
  it('shows a section-level error with retry when nothing was ever loaded', () => {
    const el = mount({
      status: 'error',
      data: null,
      error: { message: 'down', kind: 'server', retriable: true, status: 503, correlationId: 'cid-9' },
      at: null,
    });
    expect(el.querySelector('[role=alert]')?.textContent).toContain('cid-9');
    reloaded = 0;
    (el.querySelector('[role=alert] button') as HTMLButtonElement).click();
    expect(reloaded).toBe(1);
  });
  it('shows a progress bar while loading', () => {
    expect(mount({ status: 'loading', data: null, error: null, at: null }).querySelector('mat-progress-bar')).toBeTruthy();
  });
});

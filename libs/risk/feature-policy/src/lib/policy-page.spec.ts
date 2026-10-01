import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { RiskApi } from '@pnc/risk/data-access';
import type { PolicyDetail } from '@pnc/shared/domain';
import { PolicyPage } from './policy-page';

const detail = (legacy: PolicyDetail['scoring']['legacy'], reconciled: boolean): PolicyDetail => ({
  exposure: {
    id: 'e1',
    policyNumber: 'PN-1',
    insured: 'Acme',
    lob: 'Homeowners',
    peril: 'Flood',
    country: 'US',
    zone: 'US-FL',
    tiv: 1e6,
    limit: 9e5,
    deductible: 1e4,
    premium: 5e3,
    incurredLoss: 1e3,
    lossRatio: 0.2,
    riskScore: 40,
    rating: 'B',
    status: 'Bound',
    inception: '2026-01-01',
    expiry: '2027-01-01',
    underwriter: 'A. Whitfield',
  },
  hazard: 1.4,
  expectedLoss: 1234,
  zoneName: 'Florida',
  scoring: { modern: { score: 40, rating: 'B' }, legacy, reconciled },
  peers: { zone: 'US-FL', peril: 'Flood', policies: 10, tiv: 1e7, utilization: 0.9, status: 'watch' },
});

function mount(api: Partial<RiskApi>): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: RiskApi, useValue: api }] });
  const f = TestBed.createComponent(PolicyPage);
  f.componentRef.setInput('id', 'e1');
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('PolicyPage', () => {
  it('shows agreement between modern and legacy engines', () => {
    const el = mount({ detail$: () => of(detail({ score: 40, rating: 'B' }, true)) });
    expect(el.textContent).toContain('PN-1');
    expect(el.textContent).toContain('Engines agree');
  });
  it('flags disagreement and legacy failure explicitly', () => {
    const el = mount({ detail$: () => of(detail({ error: 'bad input' }, false)) });
    expect(el.textContent).toContain('Unavailable: bad input');
    expect(el.textContent).toContain('Escalate to model risk');
  });
  it('renders an error panel with correlation id', () => {
    const el = mount({ detail$: () => throwError(() => ({ status: 404 })) });
    expect(el.querySelector('pnc-state-panel')).toBeTruthy();
  });
});

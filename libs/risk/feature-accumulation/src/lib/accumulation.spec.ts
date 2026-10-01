import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuthStore, RiskApi } from '@pnc/risk/data-access';
import type { AccumulationRow } from '@pnc/shared/domain';
import { AccumulationPage } from './accumulation-page';
import { buildTiles } from './heatmap';

const row = (zone: string, peril: AccumulationRow['peril'], utilization: number, status: AccumulationRow['status']): AccumulationRow => ({
  zone,
  peril,
  policies: 1,
  tiv: 1e6,
  limit: 1e6,
  premium: 1e4,
  appetite: 4e9,
  utilization,
  status,
  expectedLoss: 1,
  pml100: 1,
});

describe('buildTiles', () => {
  it('takes the worst peril per zone and marks unmodelled zones', () => {
    const t = buildTiles([row('US-FL', 'Flood', 0.5, 'ok'), row('US-FL', 'Windstorm', 1.2, 'breach')], 'all');
    expect(t.find((x) => x.code === 'US-FL')).toMatchObject({ status: 'breach', utilization: 1.2 });
    expect(t.find((x) => x.code !== 'US-FL')?.status).toBe('none');
  });
  it('filters by peril', () => {
    expect(
      buildTiles([row('US-FL', 'Flood', 0.5, 'ok'), row('US-FL', 'Windstorm', 1.2, 'breach')], 'Flood').find((x) => x.code === 'US-FL')
        ?.status,
    ).toBe('ok');
  });
});

describe('AccumulationPage', () => {
  it('renders map and previews stress without a server call, hides run for read-only roles', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RiskApi, useValue: { accumulation$: () => of({ data: [row('US-FL', 'Flood', 0.9, 'watch')], stale: false, at: 1 }) } },
        { provide: AuthStore, useValue: { can: () => false } },
      ],
    });
    const f = TestBed.createComponent(AccumulationPage);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.map .tile.ok')).toBeTruthy();
    expect(el.textContent).toContain('read-only');
    expect(el.querySelector('button')?.textContent ?? '').not.toContain('Run authoritative');
  });
});

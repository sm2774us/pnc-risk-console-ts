import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BarChart, DonutChart, Icon, KpiCard, LineChart, StatePanel, StatusChip } from '../index';

describe('shared ui', () => {
  it('KpiCard renders label, value and accessible name', () => {
    const f = TestBed.createComponent(KpiCard);
    f.componentRef.setInput('label', 'Total TIV');
    f.componentRef.setInput('value', '$1.2B');
    f.componentRef.setInput('hint', 'as of today');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Total TIV');
    expect(el.querySelector('.value')?.getAttribute('aria-labelledby')).toBe('kpi-total-tiv');
    expect(el.querySelector('.hint')?.textContent).toContain('as of today');
  });

  it('StatusChip is never colour-only', () => {
    const f = TestBed.createComponent(StatusChip);
    f.componentRef.setInput('kind', 'utilization');
    f.componentRef.setInput('value', 'breach');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Breach');
    f.componentRef.setInput('kind', 'rating');
    f.componentRef.setInput('value', 'D');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Rating D');
  });

  it('StatePanel announces errors and emits retry', () => {
    const f = TestBed.createComponent(StatePanel);
    f.componentRef.setInput('message', 'Upstream unavailable');
    f.componentRef.setInput('correlationId', 'cid-123');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role=alert]')).toBeTruthy();
    expect(el.textContent).toContain('cid-123');
    let retried = 0;
    f.componentInstance.retry.subscribe(() => retried++);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(retried).toBe(1);
  });

  it('Icon renders an svg path and hides from assistive tech', () => {
    const f = TestBed.createComponent(Icon);
    f.componentRef.setInput('name', 'warning');
    f.detectChanges();
    const svg = (f.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(10);
  });

  it('charts scale values and provide a screen-reader table', () => {
    const bar = TestBed.createComponent(BarChart);
    bar.componentRef.setInput('caption', 'TIV by LOB');
    bar.componentRef.setInput('data', [
      { label: 'A', value: 100 },
      { label: 'B', value: 50 },
    ]);
    bar.detectChanges();
    const rects = (bar.nativeElement as HTMLElement).querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    expect(Number(rects[0]!.getAttribute('width'))).toBeGreaterThan(Number(rects[1]!.getAttribute('width')));
    expect((bar.nativeElement as HTMLElement).querySelectorAll('table.sr-only tr')).toHaveLength(2);

    const donut = TestBed.createComponent(DonutChart);
    donut.componentRef.setInput('caption', 'Peril');
    donut.componentRef.setInput('data', [
      { label: 'W', value: 3 },
      { label: 'F', value: 1 },
    ]);
    donut.detectChanges();
    expect((donut.nativeElement as HTMLElement).textContent).toContain('75%');

    const line = TestBed.createComponent(LineChart);
    line.componentRef.setInput('caption', 'Trend');
    line.componentRef.setInput('labels', ['2025-01', '2025-02', '2025-03']);
    line.componentRef.setInput('series', [{ name: 'Premium', values: [1, 2, 3] }]);
    line.detectChanges();
    expect((line.nativeElement as HTMLElement).querySelector('polyline')?.getAttribute('points')).toContain(',');
  });
});

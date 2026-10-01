import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('dashboard shows KPIs, charts and the PML ladder', async ({ page }) => {
  await signIn(page, 'risk-manager');
  await expect(page.getByText('Total insured value')).toBeVisible();
  await expect(page.getByRole('table', { name: /probable maximum loss/i })).toBeVisible();
  await expect(page.locator('pnc-kpi-card')).toHaveCount(6);
});

test('serves last known data with a degraded banner when the API fails', async ({ page }) => {
  await signIn(page, 'risk-manager');
  await expect(page.getByText('Total insured value')).toBeVisible();
  await page.route('**/api/v1/portfolio/summary', (r) =>
    r.fulfill({ status: 503, contentType: 'application/problem+json', body: '{"title":"down","status":503}' }),
  );
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.locator('pnc-dashboard-page .stale')).toHaveText('Showing last known data', { timeout: 20_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Service is degraded' })).toBeVisible();
  await expect(page.getByText('Total insured value')).toBeVisible();
});

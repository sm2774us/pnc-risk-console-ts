import { expect, test } from '@playwright/test';
import { goTo, signIn } from './helpers';

test('grid loads the first block from the server-side row model and opens a policy', async ({ page }) => {
  await signIn(page, 'underwriter');
  const first = page.waitForResponse((r) => r.url().includes('/exposures/query') && r.status() === 200);
  await goTo(page, 'Exposures');
  await first;
  await expect(page.getByRole('region', { name: 'Exposure grid' })).toBeVisible();
  await page.locator('.ag-row[row-index="0"]').dblclick();
  await expect(page).toHaveURL(/policies\//);
  await expect(page.getByRole('heading', { name: 'Scoring reconciliation' })).toBeVisible();
});

test('viewer sees masked insureds and no export button', async ({ page }) => {
  await signIn(page, 'viewer');
  await goTo(page, 'Exposures');
  await expect(page.getByRole('button', { name: /export csv/i })).toHaveCount(0);
  await expect(page.locator('.ag-row[row-index="0"] [col-id="insured"]')).toContainText('Insured ••');
});

test('underwriter can export CSV', async ({ page }) => {
  await signIn(page, 'underwriter');
  await goTo(page, 'Exposures');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /export csv/i }).click();
  expect((await dl).suggestedFilename()).toBe('exposures.csv');
});

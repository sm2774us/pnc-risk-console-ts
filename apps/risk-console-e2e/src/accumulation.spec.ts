import { expect, test } from '@playwright/test';
import { goTo, signIn } from './helpers';

test('risk manager previews a stress instantly and runs it authoritatively', async ({ page }) => {
  await signIn(page, 'risk-manager');
  await goTo(page, 'Accumulation');
  const slider = page.getByLabel('Windstorm severity shock percent');
  await slider.focus();
  for (let i = 0; i < 6; i++) await slider.press('ArrowRight');
  await expect(page.getByRole('status').filter({ hasText: 'Stressed PML' })).toBeVisible();
  const call = page.waitForResponse((r) => r.url().endsWith('/portfolio/stress') && r.ok());
  await page.getByRole('button', { name: /run authoritative/i }).click();
  await call;
  await expect(page.getByText(/Server result/)).toBeVisible();
});

test('underwriter has no stress controls', async ({ page }) => {
  await signIn(page, 'underwriter');
  await goTo(page, 'Accumulation');
  await expect(page.getByText(/read-only for stress testing/)).toBeVisible();
});

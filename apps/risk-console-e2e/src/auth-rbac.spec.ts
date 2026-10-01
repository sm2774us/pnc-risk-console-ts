import { expect, test } from '@playwright/test';
import { goTo, openNav, signIn } from './helpers';

test('anonymous users are redirected to login with a return URL', async ({ page }) => {
  await page.goto('/exposures');
  await expect(page).toHaveURL(/login\?returnUrl=%2Fexposures/);
});

test('viewer cannot reach the admin status page nor see its nav entry', async ({ page }) => {
  await signIn(page, 'viewer');
  await openNav(page);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Service status' })).toHaveCount(0);
  await page.goto('/admin/status');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});

test('admin sees service status', async ({ page }) => {
  await signIn(page, 'admin');
  await goTo(page, 'Service status');
  await expect(page.getByRole('heading', { name: 'Service status' })).toBeVisible();
});

test('sign out clears the session', async ({ page }) => {
  await signIn(page, 'underwriter');
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
});

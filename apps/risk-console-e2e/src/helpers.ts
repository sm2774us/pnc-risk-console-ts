import { expect, type Page } from '@playwright/test';

export type Persona = 'viewer' | 'underwriter' | 'risk-manager' | 'admin';
/** Signs in through the persona picker (the same path a user takes). */
export async function signIn(page: Page, role: Persona): Promise<void> {
  await page.goto('/login');
  await page
    .getByRole('button', { name: new RegExp(role, 'i') })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
}

/** The slide-over nav is collapsed on narrow viewports; open it when the menu button is shown. */
export async function openNav(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
}

/** Navigates via the primary nav (exact name, so in-page links such as "Review accumulation" never collide). */
export async function goTo(page: Page, name: string): Promise<void> {
  await openNav(page);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true }).click();
}

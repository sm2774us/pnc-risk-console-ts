import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const PAGES = [
  ['Dashboard', '/dashboard'],
  ['Accumulation', '/accumulation'],
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`WCAG 2.1 AA (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test('login page', async ({ page }) => {
      await page.goto('/login');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(r.violations).toEqual([]);
    });
    for (const [name, path] of PAGES) {
      test(name, async ({ page }) => {
        await signIn(page, 'risk-manager');
        await page.goto(path);
        await page.locator('main h1').waitFor();
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(r.violations).toEqual([]);
      });
    }
  });
}

test('skip link is the first tab stop', async ({ page }) => {
  await signIn(page, 'viewer');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

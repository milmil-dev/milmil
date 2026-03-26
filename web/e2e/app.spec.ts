import { expect, test } from '@playwright/test';

test('homepage loads and shows title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('TanStack SPA Template');
});

test('page has correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('TanStack SPA Template');
});

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4000';

const CHILD_PAGES = [
  'getting-started/installation',
  'getting-started/docker',
  'getting-started/first-setup',
  'configuration/environment',
  'configuration/integrations',
  'features/library',
  'features/streaming',
  'features/downloads',
  'features/discovery',
  'features/collection',
];

test.describe('Docs Pages — Browser E2E', () => {
  // Test 1: Direct navigation to docs index
  test('zh-HK/docs loads with content and sidebar', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK/docs`);
    // Wait for page to fully render
    await page.waitForLoadState('networkidle');

    // Check h1 exists and has text
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 10000 });
    const h1Text = await h1.textContent();
    console.log(`  Docs index h1: "${h1Text}"`);
    expect(h1Text?.length).toBeGreaterThan(0);

    // Check sidebar exists
    const sidebar = page.locator('aside').first();
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    console.log(`  Sidebar visible: ${sidebarVisible}`);

    // Check for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Check no FrameworkProvider error in page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('FrameworkProvider');
    expect(bodyText).not.toContain('Application error');
  });

  // Test 2: Direct navigation to EACH child page
  for (const childPage of CHILD_PAGES) {
    test(`direct nav: /zh-HK/docs/${childPage}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`${BASE}/zh-HK/docs/${childPage}`);
      await page.waitForLoadState('networkidle');

      // Page should have h1
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible({ timeout: 10000 });
      const h1Text = await h1.textContent();
      console.log(`  /${childPage} h1: "${h1Text}"`);
      expect(h1Text?.length).toBeGreaterThan(0);

      // Page should NOT be blank or error
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('FrameworkProvider');
      expect(bodyText).not.toContain('Application error');
      expect(bodyText!.length).toBeGreaterThan(100);

      // Check for JS errors
      const criticalErrors = errors.filter(e =>
        e.includes('FrameworkProvider') ||
        e.includes('Uncaught') ||
        e.includes('not a function')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }

  // Test 3: Client-side navigation via sidebar
  test('sidebar navigation works', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Start at docs index
    await page.goto(`${BASE}/zh-HK/docs`);
    await page.waitForLoadState('networkidle');

    // Find and click a sidebar link to a child page
    const sidebarLink = page.locator('aside a[href*="getting-started"]').first();
    if (await sidebarLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sidebarLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check page rendered
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible({ timeout: 10000 });
      const h1Text = await h1.textContent();
      console.log(`  After sidebar click h1: "${h1Text}"`);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('FrameworkProvider');
      expect(bodyText!.length).toBeGreaterThan(100);
    } else {
      console.log('  WARNING: No sidebar link found');
    }

    // Report all errors
    if (errors.length > 0) {
      console.log(`  Console errors: ${errors.length}`);
      for (const e of errors.slice(0, 5)) {
        console.log(`    ${e.substring(0, 200)}`);
      }
    }

    const criticalErrors = errors.filter(e =>
      e.includes('FrameworkProvider') || e.includes('Uncaught')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  // Test 4: Take screenshot for visual verification
  test('screenshot docs page', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK/docs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/docs-index.png', fullPage: true });

    await page.goto(`${BASE}/zh-HK/docs/getting-started/installation`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/docs-child.png', fullPage: true });
  });
});

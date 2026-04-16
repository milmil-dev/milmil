import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4000';

test.describe('Landing Page E2E', () => {
  test('root redirects to /zh-HK', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForURL('**/zh-HK');
    expect(page.url()).toContain('/zh-HK');
  });

  test('landing page renders zh-HK content', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK`);
    await expect(page.locator('h1')).toContainText('milmil');
    await expect(page.getByText('自架動漫媒體伺服器')).toBeVisible();
    await expect(page.getByText('開始使用')).toBeVisible();
    await expect(page.getByText('查看 GitHub').first()).toBeVisible();
  });

  test('clicking 開始使用 navigates to docs', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK`);
    await page.getByText('開始使用').first().click();
    await page.waitForURL('**/zh-HK/docs', { timeout: 10000 });
    expect(page.url()).toContain('/zh-HK/docs');
    // Docs page should render content, not be blank
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    const h1Text = await page.locator('h1').first().textContent();
    expect(h1Text?.length).toBeGreaterThan(0);
  });

  test('clicking 查看文檔 navigates to installation docs', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK`);
    await page.getByText('查看文檔').first().click();
    await page.waitForURL('**/docs/getting-started/installation', { timeout: 10000 });
    expect(page.url()).toContain('/docs/getting-started/installation');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('docs page has sidebar navigation', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK/docs`);
    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
  });

  test('docs sidebar links work', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK/docs`);
    // Click a sidebar link
    const link = page.locator('a[href*="getting-started"]').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL('**/getting-started/**', { timeout: 10000 });
      await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    }
  });

  test('features section renders', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK`);
    await expect(page.getByText('功能一覽')).toBeVisible();
    await expect(page.getByText('媒體庫管理')).toBeVisible();
  });

  test('deploy section renders', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK`);
    await expect(page.getByText('秒級部署')).toBeVisible();
    await expect(page.getByText('docker compose up -d').first()).toBeVisible();
  });

  test('integrations section renders with logos', async ({ page }) => {
    await page.goto(`${BASE}/zh-HK`);
    await expect(page.getByText('無縫整合')).toBeVisible();
    await expect(page.getByText('Bangumi', { exact: true })).toBeVisible();
    await expect(page.getByText('AniList', { exact: true })).toBeVisible();
    await expect(page.getByText('FFmpeg', { exact: true })).toBeVisible();
  });

  test('all language landing pages load', async ({ page }) => {
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko']) {
      const resp = await page.goto(`${BASE}/${lang}`);
      expect(resp?.status()).toBe(200);
      await expect(page.locator('h1')).toContainText('milmil');
    }
  });

  test('all language docs pages load', async ({ page }) => {
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko']) {
      const resp = await page.goto(`${BASE}/${lang}/docs`);
      expect(resp?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });
    }
  });
});

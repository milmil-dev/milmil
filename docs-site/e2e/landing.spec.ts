import { test, expect } from '@playwright/test';
import zhHK from '../messages/zh-HK.json';

// Strings come from the catalog rather than being duplicated here, so a copy change
// updates the assertions with it. zh-HK is Cantonese: "開始用", not "開始使用".
const t = zhHK.Landing;

const LANGS = ['en', 'zh-CN', 'zh-TW', 'zh-HK'];

test.describe('Landing page', () => {
  test('root redirects to the default locale', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/en');
    expect(page.url()).toContain('/en');
  });

  test('renders zh-HK content', async ({ page }) => {
    await page.goto('/zh-HK');
    await expect(page.locator('h1')).toContainText('milmil');
    await expect(page.getByText(t.tagline)).toBeVisible();
    await expect(page.getByText(t.getStarted).first()).toBeVisible();
    await expect(page.getByText(t.viewGithub).first()).toBeVisible();
  });

  test('primary CTA navigates to docs', async ({ page }) => {
    await page.goto('/zh-HK');
    await page.getByText(t.getStarted).first().click();
    await page.waitForURL('**/zh-HK/docs', { timeout: 10000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('closing CTA navigates to the installation guide', async ({ page }) => {
    await page.goto('/zh-HK');
    await page.getByText(t.readDocs).first().click();
    await page.waitForURL('**/docs/getting-started/installation', { timeout: 10000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('features section renders', async ({ page }) => {
    await page.goto('/zh-HK');
    await expect(page.getByText(t.featuresTitle)).toBeVisible();
    await expect(page.getByText(t.f1)).toBeVisible();
  });

  test('deploy section renders', async ({ page }) => {
    await page.goto('/zh-HK');
    await expect(page.getByText(t.deployTitle)).toBeVisible();
    await expect(page.getByText('docker compose up -d').first()).toBeVisible();
  });

  test('integrations section renders with logos', async ({ page }) => {
    await page.goto('/zh-HK');
    await expect(page.getByText(t.integrationsTitle)).toBeVisible();
    for (const name of ['Bangumi', 'AniList', 'FFmpeg']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('every locale landing page loads', async ({ page }) => {
    for (const lang of LANGS) {
      const resp = await page.goto(`/${lang}`);
      expect(resp?.status()).toBe(200);
      await expect(page.locator('h1')).toContainText('milmil');
    }
  });

  test('every locale docs index loads', async ({ page }) => {
    for (const lang of LANGS) {
      const resp = await page.goto(`/${lang}/docs`);
      expect(resp?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('docs page has sidebar navigation', async ({ page }) => {
    await page.goto('/zh-HK/docs');
    await expect(page.locator('aside').first()).toBeVisible({ timeout: 10000 });
  });
});

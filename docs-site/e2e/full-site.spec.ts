import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:4000';
const LANGS = ['en', 'zh-CN', 'zh-TW', 'zh-HK'];
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

async function assertNoFatalErrors(page: Page) {
  const body = await page.locator('body').textContent();
  expect(body).not.toContain('FrameworkProvider');
  expect(body).not.toContain('Application error');
  expect(body).not.toContain('Internal Server Error');
}

async function assertPageLoaded(page: Page) {
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible({ timeout: 10000 });
  const text = await h1.textContent();
  expect(text!.length).toBeGreaterThan(0);
  await assertNoFatalErrors(page);
}

// ─── Root redirect ───
test('root / redirects to /zh-HK', async ({ page }) => {
  const resp = await page.goto(BASE);
  await page.waitForURL('**/zh-HK**');
  expect(page.url()).toContain('/zh-HK');
});

// ─── Landing page per language ───
for (const lang of LANGS) {
  test(`landing /${lang} renders`, async ({ page }) => {
    await page.goto(`${BASE}/${lang}`);
    await expect(page.locator('h1')).toContainText('milmil');
    await assertNoFatalErrors(page);
  });
}

// ─── Landing → Docs navigation ───
test('landing 開始使用 → docs (browser click)', async ({ page }) => {
  await page.goto(`${BASE}/zh-HK`);
  await page.getByText('開始使用').first().click();
  await page.waitForURL('**/zh-HK/docs**', { timeout: 10000 });
  await assertPageLoaded(page);
});

test('landing 查看文檔 → installation (browser click)', async ({ page }) => {
  await page.goto(`${BASE}/zh-HK`);
  await page.getByText('查看文檔').first().click();
  await page.waitForURL('**/docs/getting-started/installation**', { timeout: 10000 });
  await assertPageLoaded(page);
});

// ─── Docs index per language ───
for (const lang of LANGS) {
  test(`docs /${lang}/docs renders with sidebar`, async ({ page }) => {
    await page.goto(`${BASE}/${lang}/docs`);
    await assertPageLoaded(page);
    // Sidebar must exist
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });
  });
}

// ─── Every child page per language (direct navigation) ───
for (const lang of LANGS) {
  for (const child of CHILD_PAGES) {
    test(`docs /${lang}/docs/${child} loads`, async ({ page }) => {
      await page.goto(`${BASE}/${lang}/docs/${child}`);
      await assertPageLoaded(page);
      await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });
    });
  }
}

// ─── Sidebar navigation (client-side) ───
test('sidebar click navigates to child page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(`${BASE}/zh-HK/docs`);
  await page.waitForTimeout(2000);

  // Expand first folder (Getting Started / 入門)
  const gsBtn = page.locator('aside button[aria-expanded="false"]').first();
  if (await gsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gsBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Installation (安裝) in sidebar
  const link = page.locator('aside a[href*="installation"]').first();
  await expect(link).toBeVisible({ timeout: 5000 });
  const href = await link.getAttribute('href');
  expect(href).toContain('/zh-HK/docs/getting-started/installation');

  await link.click();
  await page.waitForURL('**/installation**', { timeout: 10000 });
  await assertPageLoaded(page);

  // No JS errors
  const fatal = errors.filter(e => e.includes('FrameworkProvider') || e.includes('Uncaught'));
  expect(fatal).toHaveLength(0);
});

// ─── Features section renders ───
test('landing features section', async ({ page }) => {
  await page.goto(`${BASE}/zh-HK`);
  await expect(page.getByText('功能一覽')).toBeVisible();
});

// ─── Deploy section renders ───
test('landing deploy section', async ({ page }) => {
  await page.goto(`${BASE}/zh-HK`);
  await expect(page.getByText('秒級部署')).toBeVisible();
  await expect(page.getByText('docker compose up -d').first()).toBeVisible();
});

// ─── Integrations section ───
test('landing integrations section', async ({ page }) => {
  await page.goto(`${BASE}/zh-HK`);
  await expect(page.getByText('無縫整合')).toBeVisible();
  await expect(page.getByText('Bangumi', { exact: true })).toBeVisible();
  await expect(page.getByText('AniList', { exact: true })).toBeVisible();
});

// ─── Search API responds ───
test('search API responds', async ({ page }) => {
  const resp = await page.goto(`${BASE}/api/search?query=install&locale=zh-HK`);
  expect(resp?.status()).toBe(200);
});

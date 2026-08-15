import { test, expect, type Page } from '@playwright/test';

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
test('root / redirects to /en', async ({ page }) => {
  const resp = await page.goto('/');
  await page.waitForURL('**/en');
  expect(page.url()).toContain('/en');
});

// ─── Landing page per language ───
for (const lang of LANGS) {
  test(`landing /${lang} renders`, async ({ page }) => {
    await page.goto(`/${lang}`);
    await expect(page.locator('h1')).toContainText('milmil');
    await assertNoFatalErrors(page);
  });
}

// ─── Landing → Docs navigation ───
test('landing 開始用 → docs (browser click)', async ({ page }) => {
  await page.goto(`/zh-HK`);
  await page.getByText('開始用').first().click();
  await page.waitForURL('**/zh-HK/docs**', { timeout: 10000 });
  await assertPageLoaded(page);
});

test('landing 睇文檔 → installation (browser click)', async ({ page }) => {
  await page.goto(`/zh-HK`);
  await page.getByText('睇文檔').first().click();
  await page.waitForURL('**/docs/getting-started/installation**', { timeout: 10000 });
  await assertPageLoaded(page);
});

// ─── Docs index per language ───
for (const lang of LANGS) {
  test(`docs /${lang}/docs renders with sidebar`, async ({ page }) => {
    await page.goto(`/${lang}/docs`);
    await assertPageLoaded(page);
    // Sidebar must exist
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });
  });
}

// ─── Every child page per language (direct navigation) ───
for (const lang of LANGS) {
  for (const child of CHILD_PAGES) {
    test(`docs /${lang}/docs/${child} loads`, async ({ page }) => {
      await page.goto(`/${lang}/docs/${child}`);
      await assertPageLoaded(page);
      await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });
    });
  }
}

// ─── Sidebar navigation (client-side) ───
test('sidebar click navigates to child page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  // Start on a page inside a section so that section's links are already expanded —
  // clicking folder toggles blindly hits the search dialog trigger, which also carries
  // aria-expanded and opens a modal that swallows later clicks.
  await page.goto('/zh-HK/docs/getting-started/installation');

  const link = page.locator('aside a[href*="getting-started/docker"]').first();
  await expect(link).toBeVisible({ timeout: 5000 });
  const href = await link.getAttribute('href');
  expect(href).toContain('/zh-HK/docs/getting-started/docker');

  await link.click();
  await page.waitForURL('**/getting-started/docker', { timeout: 10000 });
  await assertPageLoaded(page);

  // No JS errors
  const fatal = errors.filter(e => e.includes('FrameworkProvider') || e.includes('Uncaught'));
  expect(fatal).toHaveLength(0);
});

// ─── Features section renders ───
test('landing features section', async ({ page }) => {
  await page.goto(`/zh-HK`);
  await expect(page.getByText('功能一覽')).toBeVisible();
});

// ─── Deploy section renders ───
test('landing deploy section', async ({ page }) => {
  await page.goto(`/zh-HK`);
  await expect(page.getByText('秒速部署')).toBeVisible();
  await expect(page.getByText('docker compose up -d').first()).toBeVisible();
});

// ─── Integrations section ───
test('landing integrations section', async ({ page }) => {
  await page.goto(`/zh-HK`);
  await expect(page.getByText('無縫整合')).toBeVisible();
  await expect(page.getByText('Bangumi', { exact: true })).toBeVisible();
  await expect(page.getByText('AniList', { exact: true })).toBeVisible();
});

// ─── Search API responds ───
test('search API responds', async ({ page }) => {
  const resp = await page.goto(`/api/search?query=install&locale=zh-HK`);
  expect(resp?.status()).toBe(200);
});

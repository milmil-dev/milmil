import { test, expect } from '@playwright/test';

/**
 * Covers the metadata/LLM surface added alongside the Fumadocs 16 upgrade. The matcher in
 * proxy.ts is easy to break — any of these routes silently becoming a locale redirect
 * hides it from crawlers, which is exactly the failure this suite is here to catch.
 */
test.describe('Site surface', () => {
  test('metadata routes are served directly, not locale-redirected', async ({ request }) => {
    for (const path of ['/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt']) {
      const resp = await request.get(path, { maxRedirects: 0 });
      expect(resp.status(), `${path} should be 200`).toBe(200);
    }
  });

  test('robots.txt points at the sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Sitemap:');
    expect(body).toContain('/sitemap.xml');
  });

  test('sitemap lists docs and API pages for every locale', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'zh-HK']) {
      expect(xml).toContain(`/${lang}/docs`);
    }
    expect(xml).toContain('/docs/api/');
  });

  test('llms.txt is an index and llms-full.txt is not duplicated per locale', async ({
    request,
  }) => {
    const index = await (await request.get('/llms.txt')).text();
    expect(index).toContain('/en/docs');

    const full = await (await request.get('/llms-full.txt')).text();
    // Default locale only — one heading per page, not one per locale.
    const installHeadings = full.match(/^# Installation/gm) ?? [];
    expect(installHeadings).toHaveLength(1);
  });

  test('docs pages content-negotiate to markdown', async ({ request }) => {
    const resp = await request.get('/en/docs/getting-started/installation', {
      headers: { Accept: 'text/markdown' },
    });
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('text/markdown');
    expect(resp.headers()['vary']).toContain('Accept');
    expect(await resp.text()).toContain('# Installation');
  });

  test('the .md suffix serves markdown too', async ({ request }) => {
    const resp = await request.get('/en/docs/getting-started/installation.md');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('text/markdown');
  });

  test('the same URL still serves HTML by default', async ({ request }) => {
    const resp = await request.get('/en/docs/getting-started/installation');
    expect(resp.headers()['content-type']).toContain('text/html');
  });

  test('OG images render as PNG', async ({ request }) => {
    const resp = await request.get('/en/og/docs/getting-started/installation/image.png');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('image/png');
  });

  test('generated API reference renders operations', async ({ page }) => {
    await page.goto('/en/docs/api/auth');
    await expect(page.locator('h1').first()).toBeVisible();

    // Paths render as separate <code> segments per URL part, so assert on the method
    // badges instead of a contiguous path string.
    await expect(page.getByText('POST', { exact: true }).first()).toBeVisible();
    expect(await page.getByText('POST', { exact: true }).count()).toBeGreaterThan(1);
  });

  test('every OpenAPI tag has a page', async ({ request }) => {
    // Regression guard for the drift that made the previous committed API docs wrong.
    for (const tag of ['auth', 'anime', 'libraries', 'downloads', 'audit', 'library-rename']) {
      const resp = await request.get(`/en/docs/api/${tag}`);
      expect(resp.status(), `/en/docs/api/${tag}`).toBe(200);
    }
  });

  test('non-English docs point their OG card at the English image', async ({ page }) => {
    await page.goto('/zh-HK/docs/getting-started/installation');
    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveAttribute('content', /\/en\/og\/docs\/.+\/image\.png$/);
  });
});

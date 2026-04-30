import { expect, type Page, test } from '@playwright/test';

const LIBRARY_ID = 'lib-test-1';

async function setupAuthAndLibrary(page: Page) {
  // Catch-all MUST be registered FIRST — Playwright matches routes in LIFO
  // order, so specific routes registered later take precedence and the
  // catch-all only fires for unmatched paths.
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'user-1', username: 'testuser' }),
    });
  });
  await page.route('**/api/v1/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ initialized: true }),
    });
  });

  await page.route(`**/api/v1/libraries/${LIBRARY_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: LIBRARY_ID,
        name: 'Test Library',
        path: '/mnt/test',
        enabled: 1,
        source_type: 'local',
        scan_interval_minutes: 60,
        last_scanned_at: null,
        created_at: '2026-04-30T00:00:00Z',
        updated_at: '2026-04-30T00:00:00Z',
        file_count: 1,
        matched_count: 0,
        unmatched_count: 1,
        total_size_bytes: 1_000_000_000,
      }),
    });
  });

  await page.route(`**/api/v1/libraries/${LIBRARY_ID}/capacity`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_bytes: 0,
        free_bytes: 0,
        used_bytes: 0,
        available: false,
      }),
    });
  });

  await page.route(`**/api/v1/libraries/${LIBRARY_ID}/media-files*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'f1',
            library_id: LIBRARY_ID,
            path: '/mnt/test/f1.mkv',
            filename: 'f1.mkv',
            size_bytes: 1_000_000_000,
            match_status: 'unmatched',
            dandanplay_anime_id: null,
            dandanplay_episode_id: null,
            subtitle_count: 0,
            matched_anime_title: '',
            matched_episode_sort: 0,
            matched_bangumi_id: 0,
            created_at: '2026-04-30T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        per_page: 10,
      }),
    });
  });

  // Seed auth token before navigation so the root beforeLoad guard doesn't
  // bounce us to /login or /setup. Token must start with `mlml_` —
  // legacy tokens are cleared by auth-store migration.
  await page.addInitScript(() => {
    localStorage.setItem('milmil-token', 'mlml_fake');
  });
}

async function gotoFilesTab(page: Page) {
  await page.goto(`/libraries/${LIBRARY_ID}`);
  // The default tab is `anime`. Click the `Files` tab to render the table.
  // Locale is zh-TW by default so we accept both labels.
  await page
    .getByRole('button', { name: /^(檔案|文件|Files|ファイル|파일)$/ })
    .first()
    .click();
  // Wait for the row to render — handles initial query loading.
  await expect(page.locator('tbody tr')).toHaveCount(1);
}

async function getFilenameHeaderWidth(page: Page): Promise<number> {
  return await page
    .locator('thead th')
    .nth(1)
    .evaluate((el) => el.getBoundingClientRect().width);
}

test.describe('Library media files — column resizing', () => {
  test('drag, persist across reload, reset via double-click', async ({ page }) => {
    await setupAuthAndLibrary(page);
    await gotoFilesTab(page);

    const beforeWidth = await getFilenameHeaderWidth(page);
    expect(beforeWidth).toBeCloseTo(650, 0);

    // Find the resize handle on the filename column (2nd column;
    // 1st is the select checkbox column).
    const filenameHeader = page.locator('thead th').nth(1);
    const handle = filenameHeader.locator('[role="separator"]');
    await expect(handle).toBeVisible();

    // Drag the handle 100px to the right.
    const box = await handle.boundingBox();
    if (!box) throw new Error('handle has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const afterDragWidth = await getFilenameHeaderWidth(page);
    expect(afterDragWidth).toBeGreaterThan(beforeWidth + 50);

    // Reload — width should persist.
    await page.reload();
    await page
      .getByRole('button', { name: /^(檔案|文件|Files|ファイル|파일)$/ })
      .first()
      .click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    const reloadedWidth = await getFilenameHeaderWidth(page);
    expect(reloadedWidth).toBeCloseTo(afterDragWidth, 0);

    // Double-click the handle — width resets to default.
    const handleAfter = page.locator('thead th').nth(1).locator('[role="separator"]');
    await handleAfter.dblclick();
    await page.waitForTimeout(100);
    const resetWidth = await getFilenameHeaderWidth(page);
    expect(resetWidth).toBeCloseTo(650, 0);

    // Reload — still default.
    await page.reload();
    await page
      .getByRole('button', { name: /^(檔案|文件|Files|ファイル|파일)$/ })
      .first()
      .click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    const finalWidth = await getFilenameHeaderWidth(page);
    expect(finalWidth).toBeCloseTo(650, 0);
  });

  test('select and actions columns have no resize handle', async ({ page }) => {
    await setupAuthAndLibrary(page);
    await gotoFilesTab(page);

    // The select column is index 0 (checkbox). Confirm no handle.
    const selectHeader = page.locator('thead th').nth(0);
    await expect(selectHeader.locator('[role="separator"]')).toHaveCount(0);

    // Last column is `actions` (since onMatch is wired in LibraryDetailPage).
    const lastHeader = page.locator('thead th').last();
    await expect(lastHeader.locator('[role="separator"]')).toHaveCount(0);
  });
});

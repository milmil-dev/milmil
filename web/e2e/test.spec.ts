import { expect, test } from '@playwright/test';

test('library page crashes on next page', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(msg.text()));

  let crashError = null;
  page.on('pageerror', (err) => {
    crashError = err;
    console.error(`PAGE ERROR: ${err.message}`);
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'user-1', username: 'testuser' }),
    });
  });

  await page.route('**/api/v1/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ initialized: true }),
    });
  });

  await page.route(
    '**/api/v1/libraries/999fc38a-5690-4efa-af88-c1845e54a52e/media-files*',
    async (route) => {
      const url = new URL(route.request().url());
      const pageNum = Number(url.searchParams.get('page')) || 1;

      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `file-${pageNum}-${i}`,
        filename: `test-page${pageNum}-${i}.mkv`,
        path: `/test/test-page${pageNum}-${i}.mkv`,
        match_status: 'unmatched',
        size_bytes: 1024,
        subtitle_count: 0,
      }));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ items, total: 50, page: pageNum, per_page: 10 }),
      });
    }
  );

  await page.route(
    '**/api/v1/libraries/999fc38a-5690-4efa-af88-c1845e54a52e/scan-summaries',
    async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    }
  );

  await page.route('**/api/v1/libraries/999fc38a-5690-4efa-af88-c1845e54a52e', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        id: '999fc38a-5690-4efa-af88-c1845e54a52e',
        name: 'Test Library',
        path: '/test',
        enabled: 1,
        file_count: 50,
        matched_count: 50,
        unmatched_count: 0,
        total_size_bytes: 1000,
      }),
    });
  });

  await page.route('**/api/v1/libraries', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  await page.goto('/libraries/999fc38a-5690-4efa-af88-c1845e54a52e');
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'fake-token');
    localStorage.setItem(
      'auth',
      JSON.stringify({
        state: {
          token: 'fake-token',
          user: { id: 'user-1', username: 'testuser' },
          initialized: true,
        },
        version: 0,
      })
    );
    window.location.reload();
  });

  await page.waitForTimeout(2000);

  const nextBtn = page
    .locator('button', { hasText: 'Next' })
    .or(page.locator('button[aria-label="Go to next page"]'))
    .first();
  if (await nextBtn.isVisible()) {
    console.log('Clicking Next...');
    const responsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes('/api/v1/libraries/999fc38a-5690-4efa-af88-c1845e54a52e/media-files') &&
        response.status() === 200
    );
    await nextBtn.click();
    await responsePromise;
    await page.waitForSelector('text=test-page2-0.mkv', { timeout: 5000 });
    console.log('Clicked Next and data loaded!');
  } else {
    console.log('Next button not found. Dumping HTML:', await page.content());
  }

  if (crashError) {
    throw crashError;
  }
});

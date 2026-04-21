import { expect, test } from '@playwright/test';

test('watch history page: renders, filters, deletes', async ({ page }) => {
  // Auth endpoints
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ id: 'user-1', username: 'testuser' }) })
  );
  await page.route('**/api/v1/auth/status', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );

  // Home-page dependent endpoints (return empty to avoid noise)
  await page.route('**/api/v1/discover/calendar', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/discover/trending*', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/libraries', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/progress/recent', (r) => r.fulfill({ status: 200, body: '[]' }));

  const items = [
    {
      id: 'wp-1', user_id: 'u1', episode_id: 'e1', media_file_id: null,
      position_seconds: 600, duration_seconds: 1440, completed: 0,
      last_watched_at: new Date().toISOString(),
      anime_id: 'a1', anime_title: 'Test Anime A', anime_title_zh: null,
      anime_cover_image: null, anime_bangumi_id: 111, episode_number: 3,
    },
    {
      id: 'wp-2', user_id: 'u1', episode_id: 'e2', media_file_id: null,
      position_seconds: 1440, duration_seconds: 1440, completed: 1,
      last_watched_at: new Date(Date.now() - 86400_000).toISOString(),
      anime_id: 'a2', anime_title: 'Test Anime B', anime_title_zh: null,
      anime_cover_image: null, anime_bangumi_id: 222, episode_number: 1,
    },
  ];

  let callCount = 0;
  await page.route('**/api/v1/progress/history*', (route) => {
    callCount++;
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('filter') ?? 'all';
    let resp = items;
    if (filter === 'completed') resp = items.filter((i) => i.completed === 1);
    else if (filter === 'in_progress') resp = items.filter((i) => i.completed === 0);
    route.fulfill({
      status: 200,
      body: JSON.stringify({ items: resp, next_before: null }),
    });
  });

  await page.route('**/api/v1/progress/wp-1', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ deleted: 1 }) })
  );

  // Navigate to the app first so we can set localStorage with a valid token prefix
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token-for-e2e');
  });

  await page.goto('/history');

  // Both items render
  await expect(page.getByText('Test Anime A')).toBeVisible();
  await expect(page.getByText('Test Anime B')).toBeVisible();

  // Switch to Completed tab
  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(page.getByText('Test Anime B')).toBeVisible();
  await expect(page.getByText('Test Anime A')).toHaveCount(0);

  // Switch back to All
  await page.getByRole('button', { name: 'All' }).click();

  // Hover the first card and click its delete button
  const firstCard = page.locator('a', { hasText: 'Test Anime A' }).first();
  await firstCard.hover();
  await firstCard.getByLabel('delete').click();

  // Confirm in the dialog
  await page.getByRole('button', { name: /confirm/i }).click();

  // At least one history refetch after delete
  await expect.poll(() => callCount).toBeGreaterThan(1);
});

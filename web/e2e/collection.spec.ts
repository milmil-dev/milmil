import { expect, type Page, test } from '@playwright/test';

test.use({ locale: 'en-US' });

const catalogBookmark = {
  id: 'anime-bookmark',
  bangumi_id: 400602,
  title: 'Frieren Catalog Bookmark',
  title_zh: null,
  title_en: 'Frieren Catalog Bookmark',
  cover_image_url: null,
  total_episodes: 28,
  status: 'airing',
  watch_status: 'planning',
  watch_status_updated_at: '2026-09-15T00:00:00Z',
  genres: '[]',
  year: 2023,
  season: 'fall',
  air_date: '2023-09-29',
  created_at: '2026-09-15T00:00:00Z',
  user_score: null,
  score: 8.9,
  local_file_count: 0,
};

const libraryWatching = {
  id: 'anime-lib',
  bangumi_id: 530725,
  title: 'Library Watching Show',
  title_zh: null,
  title_en: 'Library Watching Show',
  cover_image_url: null,
  total_episodes: 12,
  status: 'finished',
  watch_status: 'watching',
  watch_status_updated_at: '2026-09-14T00:00:00Z',
  genres: '[]',
  year: 2024,
  season: 'spring',
  air_date: '2024-04-01',
  created_at: '2026-09-14T00:00:00Z',
  user_score: null,
  score: 7.2,
  local_file_count: 12,
};

async function setupAuth(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token-for-e2e');
  });
}

async function setupApiMocks(
  page: Page,
  items: Array<typeof catalogBookmark | typeof libraryWatching>
) {
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ id: 'user-1', username: 'testuser' }) })
  );
  await page.route('**/api/v1/auth/status', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );
  await page.route('**/api/v1/libraries', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/progress/recent', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/notifications/**', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ count: 0, items: [] }) })
  );

  await page.route('**/api/v1/collection**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/status-counts')) {
      const counts = new Map<string, number>();
      for (const item of items) {
        counts.set(item.watch_status, (counts.get(item.watch_status) ?? 0) + 1);
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          [...counts.entries()].map(([watch_status, count]) => ({ watch_status, count }))
        ),
      });
    }
    if (path.endsWith('/recent')) {
      return route.fulfill({ status: 200, body: '[]' });
    }
    const status = url.searchParams.get('status') ?? '';
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    let result = items;
    if (status) result = result.filter((item) => item.watch_status === status);
    if (search) {
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(search) ||
          (item.title_zh ?? '').toLowerCase().includes(search)
      );
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
}

test('collection shows catalog-only bookmarks and filters by status', async ({ page }) => {
  await setupApiMocks(page, [catalogBookmark, libraryWatching]);
  await setupAuth(page);
  await page.goto('/collection');

  const catalogCard = page.getByRole('button', { name: /Frieren Catalog Bookmark/ });
  const libraryCard = page.getByRole('button', { name: /Library Watching Show/ });

  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  await expect(catalogCard).toBeVisible();
  await expect(libraryCard).toBeVisible();
  await expect(page.getByText('No anime in your collection yet')).toHaveCount(0);

  await page.getByRole('button', { name: /^Planning\s+\d+$/ }).click();
  await expect(catalogCard).toBeVisible();
  await expect(libraryCard).toHaveCount(0);

  await page.getByRole('button', { name: /^Watching\s+\d+$/ }).click();
  await expect(libraryCard).toBeVisible();
  await expect(catalogCard).toHaveCount(0);
});

test('collection empty state when there are no bookmarks', async ({ page }) => {
  await setupApiMocks(page, []);
  await setupAuth(page);
  await page.goto('/collection');

  await expect(page.getByText('No anime in your collection yet')).toBeVisible();
});

import { expect, type Page, test } from '@playwright/test';

function fakeAnime(id: number, title: string, extra: Record<string, unknown> = {}) {
  return {
    bangumi_id: id,
    title,
    title_original: title,
    cover_image: '',
    episode_count: 12,
    score: 8.1,
    ...extra,
  };
}

function weekdayEN(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

async function setupApiMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ id: 'user-1', username: 'testuser' }) })
  );
  await page.route('**/api/v1/auth/status', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );
  await page.route('**/api/v1/libraries', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/progress/recent', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/collection*', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/discover/calendar*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          weekday: '星期四',
          weekday_en: weekdayEN(),
          items: [fakeAnime(42, 'Tonight Show', { next_episode: 5 })],
        },
      ]),
    })
  );
  await page.route('**/api/v1/discover/trending*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([fakeAnime(1, 'Trending Hit')]),
    })
  );
  await page.route('**/api/v1/discover/browse*', (r) => {
    const url = new URL(r.request().url());
    const year = url.searchParams.get('year');
    const sort = url.searchParams.get('sort');
    if (sort === 'SCORE_DESC') {
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([fakeAnime(100, 'Season Best')]),
      });
    }
    const title = year ? `Classic ${year}` : 'Browse Hit';
    const id = year ? Number(year) : 2;
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([fakeAnime(id, title)]),
    });
  });
}

test('home today is a poster shelf; season and memories teasers follow', async ({ page }) => {
  await setupApiMocks(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token-for-e2e');
  });
  await page.goto('/');

  const today = page.getByTestId('home-today');
  await expect(today).toBeVisible();
  await expect(today.getByRole('link', { name: /Tonight Show/ })).toBeVisible();
  await expect(today.getByText('EP 5')).toBeVisible();
  // Destination label mirrors macOS "時刻表 ›" (locale-dependent string).
  await expect(today.locator('a[href="/schedule"]')).toBeVisible();

  await expect(
    page.getByTestId('home-top-season').getByRole('link', { name: /Season Best/ })
  ).toBeVisible();

  const memories = page.getByTestId('home-memories');
  await expect(memories).toBeVisible();
  const year = new Date().getFullYear();
  await expect(
    memories.getByRole('link', { name: new RegExp(`Classic ${year - 10}`) })
  ).toBeVisible();
});

test('home still shows continue watching when discover endpoints fail', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ id: 'user-1', username: 'testuser' }) })
  );
  await page.route('**/api/v1/auth/status', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );
  await page.route('**/api/v1/libraries', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/collection*', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/discover/tags/popular*', (r) =>
    r.fulfill({ status: 200, body: '[]' })
  );
  await page.route('**/api/v1/discover/calendar*', (r) =>
    r.fulfill({ status: 502, body: JSON.stringify({ message: 'external service unavailable' }) })
  );
  await page.route('**/api/v1/discover/trending*', (r) =>
    r.fulfill({ status: 502, body: JSON.stringify({ message: 'external service unavailable' }) })
  );
  await page.route('**/api/v1/discover/browse*', (r) =>
    r.fulfill({ status: 502, body: JSON.stringify({ message: 'external service unavailable' }) })
  );
  await page.route('**/api/v1/progress/recent', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '1',
          user_id: 'u1',
          episode_id: 'e1',
          media_file_id: 'f1',
          position_seconds: 600,
          duration_seconds: 1200,
          completed: 0,
          last_watched_at: '2026-03-26T00:00:00Z',
          anime_id: 'a1',
          anime_title: 'Continue Me',
          anime_title_zh: null,
          anime_cover_image: null,
          anime_bangumi_id: 111,
          episode_number: 3,
        },
      ]),
    })
  );

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token-for-e2e');
  });
  await page.goto('/');

  await expect(page.getByText('Continue Me')).toBeVisible();
  await expect(page.getByTestId('home-trending')).toHaveCount(0);
});

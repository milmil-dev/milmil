import { expect, type Page, test } from '@playwright/test';

function fakeAnime(id: number, title: string) {
  return {
    bangumi_id: id,
    title,
    title_original: title,
    cover_image: '',
    episode_count: 12,
    score: 8.1,
  };
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
  await page.route('**/api/v1/discover/calendar*', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/discover/tags/popular*', (r) =>
    r.fulfill({ status: 200, body: '[]' })
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
    const title = year ? `Classic ${year}` : 'Browse Hit';
    const id = year ? Number(year) : 2;
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([fakeAnime(id, title)]),
    });
  });
}

test('/discover redirects to home', async ({ page }) => {
  await setupApiMocks(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token-for-e2e');
  });
  await page.goto('/discover');
  await expect(page).toHaveURL(/\/$/);
});

test('home memories: same season from 5 / 10 / 15 / 20 years ago', async ({ page }) => {
  await setupApiMocks(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token-for-e2e');
  });
  await page.goto('/');

  const memories = page.getByTestId('home-memories');
  await expect(memories).toBeVisible();

  const year = new Date().getFullYear();
  await expect(
    memories.getByRole('link', { name: new RegExp(`Classic ${year - 10}`) })
  ).toBeVisible();
  await expect(page.getByTestId('memories-era-10')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('memories-era-20').click();
  await expect(page.getByTestId('memories-era-20')).toHaveAttribute('aria-selected', 'true');
  await expect(
    memories.getByRole('link', { name: new RegExp(`Classic ${year - 20}`) })
  ).toBeVisible();

  await page.getByTestId('memories-era-5').click();
  await expect(
    memories.getByRole('link', { name: new RegExp(`Classic ${year - 5}`) })
  ).toBeVisible();
});

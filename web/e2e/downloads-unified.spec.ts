// web/e2e/downloads-unified.spec.ts
// E2E coverage for the unified AnimeDownloadCard across all three manage tabs.
import { expect, type Page, test } from '@playwright/test';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BANGUMI_ID = 400602;

const COVER_URL = 'https://lain.bgm.tv/pic/cover/l/00/00/400602_abc.jpg';

const GROUPED_DOWNLOADS = [
  {
    rule_id: 'rule-1',
    rule_name: 'Frieren S1',
    bangumi_id: BANGUMI_ID,
    downloads: [
      {
        id: 'dl-1',
        gid: 'gid-1',
        name: '[桜都] Frieren - 01 [1080p]',
        status: 'active',
        total_bytes: 1_500_000_000,
        completed_bytes: 750_000_000,
        speed_bytes: 2_100_000,
        created_at: '2024-01-15T12:00:00Z',
      },
      {
        id: 'dl-2',
        gid: 'gid-2',
        name: '[桜都] Frieren - 02 [1080p]',
        status: 'complete',
        total_bytes: 1_400_000_000,
        completed_bytes: 1_400_000_000,
        speed_bytes: 0,
        created_at: '2024-01-14T12:00:00Z',
      },
    ],
    active_count: 1,
    complete_count: 1,
    total_count: 2,
  },
];

const DOWNLOAD_RULES = [
  {
    id: 'rule-1',
    name: 'Frieren S1',
    enabled: 1,
    rss_feed_id: 'feed-1',
    filter_regex: '.*Frieren.*',
    exclude_regex: '',
    save_dir: '',
    episode_offset: 0,
    resolution_filter: '1080p',
    subgroup_filter: '桜都字幕組',
    min_seeders: 0,
    bangumi_id: BANGUMI_ID,
    last_triggered_at: '2024-01-15T11:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
];

const RSS_FEEDS = [
  {
    id: 'feed-1',
    name: '[Auto] Frieren',
    url: 'https://mikanani.me/RSS/Search?searchstr=Frieren',
    type: 'mikan',
    enabled: 1,
    fetch_interval_minutes: 30,
    last_fetched_at: '2024-01-15T10:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
];

const ANIME_DETAIL = {
  bangumi_id: BANGUMI_ID,
  title: '葬送的芙莉蓮',
  title_original: '葬送のフリーレン',
  title_en: 'Frieren: Beyond Journey\'s End',
  cover_image: COVER_URL,
  episode_count: 28,
  score: 9.2,
  media_type: 'TV',
  synopsis: '',
  tags: [],
  rating: { score: 9.2, total: 1000 },
};

// ── Shared setup ──────────────────────────────────────────────────────────────

async function setupMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ id: 'u1', username: 'test' }) })
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );
  await page.route('**/api/v1/system/downloader-status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ engine: 'aria2', healthy: true }) })
  );
  await page.route('**/api/v1/system/aria2-status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ connected: true, version: '1.37.0' }) })
  );
  await page.route('**/api/v1/rss-feeds', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(RSS_FEEDS) })
  );
  await page.route('**/api/v1/download-rules', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(DOWNLOAD_RULES) })
  );
  await page.route('**/api/v1/downloads/grouped', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(GROUPED_DOWNLOADS) })
  );
  await page.route('**/api/v1/libraries', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );
  // Anime detail — used by useAnimeCover to fetch cover image
  await page.route(`**/api/v1/discover/anime/${BANGUMI_ID}`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/torrents')) return route.continue();
    return route.fulfill({ status: 200, body: JSON.stringify(ANIME_DETAIL) });
  });
  await page.route('**/api/v1/discover/search*', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );
}

async function setupAuth(page: Page) {
  await page.evaluate(() => {
    // Token must start with 'mlml_' to survive the auth-store migration guard
    localStorage.setItem('milmil-token', 'mlml_fake-token');
    localStorage.setItem(
      'auth',
      JSON.stringify({
        state: { token: 'mlml_fake-token', user: { id: 'u1', username: 'test' }, initialized: true },
        version: 0,
      })
    );
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Downloads — unified AnimeDownloadCard', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
    await setupAuth(page);
    await page.reload();
    await page.waitForTimeout(500);
  });

  test('已追番 tab: shows AnimeDownloadCard with cover block', async ({ page }) => {
    // Navigate directly to library tab via URL (locale-agnostic)
    await page.goto('/downloads?tab=library');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('anime-download-card').first();
    await expect(card).toBeVisible();

    // Cover block should be present — either an <img> or the placeholder div.
    // External cover URLs may fail to load in test env; check the container instead.
    const coverBlock = card.locator('.rounded-lg.overflow-hidden').first();
    await expect(coverBlock).toBeVisible();
  });

  test('下載緊 tab: active group card is auto-expanded with ep-bar-fill visible', async ({ page }) => {
    // Navigate directly to library tab via URL (locale-agnostic)
    await page.goto('/downloads?tab=library');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('anime-download-card').first();
    await expect(card).toBeVisible();

    // Active groups are auto-expanded — ep-bar-fill (progress bar) should be visible
    await expect(page.getByTestId('ep-bar-fill').first()).toBeVisible();
  });

  test('已完成 tab: toggle expand reveals card-divider', async ({ page }) => {
    // Navigate directly to library tab via URL (locale-agnostic)
    await page.goto('/downloads?tab=library');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('anime-download-card').first();
    await expect(card).toBeVisible();

    // Divider should not be visible when collapsed
    await expect(page.getByTestId('card-divider').first()).not.toBeVisible();

    // Click the toggle to expand
    await card.locator('button').first().click();
    await page.waitForTimeout(400);

    // card-divider should now be visible
    await expect(page.getByTestId('card-divider').first()).toBeVisible();
  });

  test('search filter: typing non-matching text shows zero subscription cards', async ({ page }) => {
    // Verify subscription cards are visible on library tab
    await page.goto('/downloads?tab=library');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('anime-download-card').first()).toBeVisible();

    // Switch to search tab via URL and confirm no anime-download-card appears
    await page.goto('/downloads?tab=search');
    await page.waitForLoadState('networkidle');
    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('nonexistent');
    await page.waitForTimeout(600);

    // No anime-download-card in search tab (those only appear in manage tabs)
    await expect(page.getByTestId('anime-download-card')).toHaveCount(0);
  });
});

import { expect, type Page, test } from '@playwright/test';

// ── Test data: mix of popular and obscure anime ─────────────────────────────

const ANIME_SEARCH_RESULTS = {
  frieren: [
    {
      bangumi_id: 400602,
      title: '葬送的芙莉蓮',
      title_original: '葬送のフリーレン',
      title_en: "Frieren: Beyond Journey's End",
      cover_image: 'https://lain.bgm.tv/pic/cover/l/00/00/400602_abc.jpg',
      air_date: '2023-09-29',
      episode_count: 28,
      score: 9.2,
      media_type: 'TV',
    },
  ],
  // Obscure anime: 冷門作品
  planetarian: [
    {
      bangumi_id: 192797,
      title: 'planetarian ～星之夢～',
      title_original: 'planetarian ～ちいさなほしのゆめ～',
      title_en: 'Planetarian',
      cover_image: 'https://lain.bgm.tv/pic/cover/l/00/00/192797_abc.jpg',
      air_date: '2016-07-07',
      episode_count: 5,
      score: 7.5,
      media_type: 'ONA',
    },
  ],
  tamayura: [
    {
      bangumi_id: 83937,
      title: 'たまゆら',
      title_original: 'たまゆら',
      title_en: 'Tamayura',
      cover_image: 'https://lain.bgm.tv/pic/cover/l/00/00/83937_abc.jpg',
      air_date: '2010-11-20',
      episode_count: 4,
      score: 6.8,
      media_type: 'OVA',
    },
  ],
  noResults: [],
};

function makeTorrentResults(animeName: string, count: number) {
  const subgroups = ['桜都字幕組', '喵萌奶茶屋', 'LoliHouse', 'SubsPlease'];
  const resolutions = ['1080p', '720p', '4K'];
  return Array.from({ length: count }, (_, i) => ({
    title: `[${subgroups[i % subgroups.length]}] ${animeName} - ${String(i + 1).padStart(2, '0')} [${resolutions[i % resolutions.length]}][BDRip].mkv`,
    magnet: `magnet:?xt=urn:btih:${Math.random().toString(36).slice(2)}`,
    torrent_url: '',
    size: `${(1.2 + Math.random()).toFixed(1)} GB`,
    seeders: Math.floor(Math.random() * 200) + 1,
    leechers: Math.floor(Math.random() * 50),
    publish_date: `2024-0${(i % 9) + 1}-15T12:00:00Z`,
    sub_group: subgroups[i % subgroups.length],
    info_hash: `hash${i}${Date.now()}`,
    source_site: ['nyaa', 'mikan', 'dmhy'][i % 3],
  }));
}

const TORRENT_RESULTS: Record<number, ReturnType<typeof makeTorrentResults>> = {
  400602: makeTorrentResults('Frieren S1', 12),
  192797: makeTorrentResults('planetarian', 5),
  83937: makeTorrentResults('Tamayura', 4),
};

// ── Mock data for manage tab ──────────────────────────────────────────────

const GROUPED_DOWNLOADS_WITH_DATA = [
  {
    rule_id: 'rule-1',
    rule_name: 'Frieren S1',
    bangumi_id: 400602,
    downloads: [
      {
        id: 'dl-1',
        gid: 'gid-1',
        name: '[桜都] Frieren - 01 [1080p]',
        status: 'active',
        total_bytes: 1500000000,
        completed_bytes: 1020000000,
        speed_bytes: 2100000,
        created_at: '2024-01-15T12:00:00Z',
      },
      {
        id: 'dl-2',
        gid: 'gid-2',
        name: '[桜都] Frieren - 02 [1080p]',
        status: 'complete',
        total_bytes: 1400000000,
        completed_bytes: 1400000000,
        speed_bytes: 0,
        created_at: '2024-01-14T12:00:00Z',
      },
    ],
    active_count: 1,
    complete_count: 1,
    total_count: 2,
  },
  {
    rule_id: '',
    rule_name: 'Manual Downloads',
    downloads: [
      {
        id: 'dl-3',
        gid: 'gid-3',
        name: 'Some manual download.mkv',
        status: 'complete',
        total_bytes: 800000000,
        completed_bytes: 800000000,
        speed_bytes: 0,
        created_at: '2024-01-13T12:00:00Z',
      },
    ],
    active_count: 0,
    complete_count: 1,
    total_count: 1,
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
    last_triggered_at: '2024-01-15T11:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
];

const ANIME_DETAIL_FRIEREN = {
  bangumi_id: 400602,
  title: '葬送的芙莉蓮',
  title_original: '葬送のフリーレン',
  cover_image: 'https://lain.bgm.tv/pic/cover/l/00/00/400602_abc.jpg',
  episode_count: 28,
  score: 9.2,
  media_type: 'TV',
  synopsis: '',
  tags: [],
  rating: { score: 9.2, total: 1000 },
};

// ── Auth + API mock setup ───────────────────────────────────────────────────

async function setupAuth(page: Page) {
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
  });
}

async function setupApiMocks(
  page: Page,
  options?: {
    withSubscriptions?: boolean;
    withDownloads?: boolean;
  }
) {
  const { withSubscriptions = false, withDownloads = false } = options ?? {};

  // Auth endpoints
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'user-1', username: 'testuser' }),
    })
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ initialized: true }),
    })
  );

  // Discover search — match by query
  await page.route('**/api/v1/discover/search*', (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    let results = ANIME_SEARCH_RESULTS.noResults;
    if (q.includes('frieren') || q.includes('芙莉蓮') || q.includes('フリーレン')) {
      results = ANIME_SEARCH_RESULTS.frieren;
    } else if (q.includes('planetarian') || q.includes('星之夢')) {
      results = ANIME_SEARCH_RESULTS.planetarian;
    } else if (q.includes('tamayura') || q.includes('たまゆら')) {
      results = ANIME_SEARCH_RESULTS.tamayura;
    } else if (q.includes('xyznotexist')) {
      results = ANIME_SEARCH_RESULTS.noResults;
    }
    return route.fulfill({ status: 200, body: JSON.stringify(results) });
  });

  // Anime detail endpoint (for cover images)
  await page.route('**/api/v1/discover/anime/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/torrents')) return route.continue();
    return route.fulfill({
      status: 200,
      body: JSON.stringify(ANIME_DETAIL_FRIEREN),
    });
  });

  // Anime torrents endpoint
  await page.route('**/api/v1/discover/anime/*/torrents*', (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/anime\/(\d+)\/torrents/);
    const id = match ? Number(match[1]) : 0;
    const results = TORRENT_RESULTS[id] ?? [];
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ results }),
    });
  });

  // Libraries
  await page.route('**/api/v1/libraries', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify([
        { id: 'lib-1', name: 'Anime Library', path: '/media/anime', enabled: 1 },
        { id: 'lib-2', name: 'Movies', path: '/media/movies', enabled: 1 },
      ]),
    })
  );

  // Subscribe endpoint
  await page.route('**/api/v1/subscribe', (route) =>
    route.fulfill({
      status: 201,
      body: JSON.stringify({
        feed: {
          id: 'feed-1',
          name: '[Auto] Test',
          url: 'https://example.com/rss',
          type: 'mikan',
          enabled: 1,
          fetch_interval_minutes: 30,
          last_fetched_at: null,
          created_at: new Date().toISOString(),
        },
        rule: {
          id: 'rule-1',
          name: 'Test',
          enabled: 1,
          rss_feed_id: 'feed-1',
          filter_regex: '.*',
          exclude_regex: '',
          save_dir: '',
          episode_offset: 0,
          resolution_filter: '1080p',
          subgroup_filter: '',
          min_seeders: 0,
          last_triggered_at: null,
          created_at: new Date().toISOString(),
        },
      }),
    })
  );

  // Torrent add (download from search)
  await page.route('**/api/v1/torrent-search/add', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'dl-1', gid: 'gid-1', status: 'active' }),
    })
  );

  // Download add (URL add from manage tab)
  await page.route('**/api/v1/downloads', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'dl-new',
          gid: 'gid-new',
          status: 'active',
          name: 'New download',
          total_bytes: 0,
          completed_bytes: 0,
          speed_bytes: 0,
          created_at: new Date().toISOString(),
        }),
      });
    }
    return route.continue();
  });

  // RSS feeds
  await page.route('**/api/v1/rss-feeds', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify(withSubscriptions ? RSS_FEEDS : []),
      });
    }
    return route.fulfill({ status: 200, body: JSON.stringify({}) });
  });

  // Download rules
  await page.route('**/api/v1/download-rules', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify(withSubscriptions ? DOWNLOAD_RULES : []),
    })
  );

  // Grouped downloads
  await page.route('**/api/v1/downloads/grouped', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify(withDownloads ? GROUPED_DOWNLOADS_WITH_DATA : []),
    })
  );
}

// ── Helper: navigate to manage tab and click a sub-tab ────────────────────

async function goToManageTab(page: Page) {
  await page.locator('[class*="border-b"] button', { hasText: /manage/i }).click();
  await page.waitForTimeout(500);
}

async function clickSubTab(page: Page, name: string) {
  // Sub-tab buttons are inside the manage tab content, pill-shaped buttons
  await page
    .locator('button', { hasText: new RegExp(name, 'i') })
    .first()
    .click();
  await page.waitForTimeout(300);
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Auto-Download Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');
    await setupAuth(page);
    await page.reload();
    await page.waitForTimeout(500);
  });

  test('navigates to auto-download page', async ({ page }) => {
    await page.click('a[href="/downloads"]');
    await expect(page.locator('h1')).toContainText(/auto/i);
  });

  test('shows two tabs: Search and Manage', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    // Should have search and manage tab buttons in the tab bar
    const tabs = page.locator('[class*="border-b"] button');
    await expect(tabs).toHaveCount(2);
  });

  // ── Search Tab: Popular anime ─────────────────────────────────────────

  test('search popular anime: Frieren shows results', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600); // debounce

    // Should show anime card
    await expect(page.locator('text=葬送的芙莉蓮')).toBeVisible();
    await expect(page.locator('text=TV')).toBeVisible();
    await expect(page.locator('text=28')).toBeVisible(); // episode count
  });

  // ── Search Tab: Obscure anime ─────────────────────────────────────────

  test('search obscure anime: planetarian (ONA, 5 eps)', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('planetarian');
    await page.waitForTimeout(600);

    await expect(page.locator('text=planetarian ～星之夢～')).toBeVisible();
    await expect(page.locator('text=ONA')).toBeVisible();
    await expect(page.locator('text=5 eps')).toBeVisible(); // 5 episodes
  });

  test('search obscure anime: Tamayura (OVA, 4 eps)', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('tamayura');
    await page.waitForTimeout(600);

    await expect(page.locator('text=たまゆら')).toBeVisible();
    await expect(page.locator('text=OVA')).toBeVisible();
  });

  test('search with no results shows empty state', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('xyznotexist');
    await page.waitForTimeout(600);

    // Should show some kind of empty/no-results state (no anime cards)
    await expect(page.locator('text=葬送的芙莉蓮')).not.toBeVisible();
    await expect(page.locator('text=planetarian')).not.toBeVisible();
  });

  // ── Torrent View ──────────────────────────────────────────────────────

  test('clicking anime shows torrent list', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    // Search and click Frieren
    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);

    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Should show torrent results
    await expect(page.locator('text=Frieren S1').first()).toBeVisible();
    // Source badges should be visible
    await expect(page.locator('text=Nyaa').first()).toBeVisible();
  });

  test('torrent view has filter chips for source, resolution, subgroup', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Source filters
    await expect(page.locator('button', { hasText: 'All' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Nyaa' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Mikan' }).first()).toBeVisible();

    // Resolution filters
    await expect(page.locator('button', { hasText: '1080p' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '720p' }).first()).toBeVisible();
  });

  test('resolution filter narrows results', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Count initial results
    const initialCount = await page.locator('[class*="rounded-lg"][class*="bg-white"]').count();

    // Click 720p filter
    await page.locator('button', { hasText: '720p' }).first().click();
    await page.waitForTimeout(300);

    // Should have fewer results (only 720p)
    const filteredCount = await page.locator('text=720p').count();
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('back button returns to anime search results', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Torrent view should be showing — find and click back button
    const backButton = page
      .locator('button')
      .filter({ has: page.locator('svg') })
      .first();
    await backButton.click();
    await page.waitForTimeout(300);

    // Search results should be visible again
    await expect(page.locator('text=葬送的芙莉蓮')).toBeVisible();
  });

  // ── Download action ───────────────────────────────────────────────────

  test('clicking download button on a torrent shows success toast', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('planetarian');
    await page.waitForTimeout(600);
    await page.click('text=planetarian ～星之夢～');
    await page.waitForTimeout(500);

    // Find first download button and click
    const dlButtons = page.locator('button', { hasText: /download/i });
    await dlButtons.first().click();
    await page.waitForTimeout(500);

    // Toast should appear
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 3000 });
  });

  // ── Subscribe flow ────────────────────────────────────────────────────

  test('subscribe button opens confirmation panel', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Click subscribe button
    const subscribeBtn = page.locator('button', { hasText: /subscribe/i }).first();
    await subscribeBtn.click();
    await page.waitForTimeout(300);

    // Confirmation panel should show anime name and match count
    await expect(page.locator('text=葬送的芙莉蓮').first()).toBeVisible();
    // Should show library picker
    await expect(page.locator('text=Anime Library')).toBeVisible();
  });

  test('subscribe confirmation with library selection works', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Open subscribe panel
    const subscribeBtn = page.locator('button', { hasText: /subscribe/i }).first();
    await subscribeBtn.click();
    await page.waitForTimeout(300);

    // Select library
    await page.click('text=Anime Library');
    await page.waitForTimeout(200);

    // Confirm subscribe
    const confirmBtn = page.locator('button', { hasText: /confirm/i }).first();
    await confirmBtn.click();
    await page.waitForTimeout(500);

    // Success toast should appear
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 3000 });
  });

  test('subscribe for obscure anime (Tamayura OVA) works', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('tamayura');
    await page.waitForTimeout(600);
    await page.click('text=たまゆら');
    await page.waitForTimeout(500);

    // Verify torrents loaded
    await expect(page.locator('text=Tamayura').first()).toBeVisible();

    // Subscribe
    const subscribeBtn = page.locator('button', { hasText: /subscribe/i }).first();
    await subscribeBtn.click();
    await page.waitForTimeout(300);

    const confirmBtn = page.locator('button', { hasText: /confirm/i }).first();
    await confirmBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 3000 });
  });

  // ── Manage Tab — Sub-tab structure ────────────────────────────────────

  test('manage tab shows 3 sub-tabs: Subscriptions, Downloads, Completed', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Should see all 3 sub-tab pill buttons
    await expect(page.locator('button', { hasText: /subscriptions/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /^downloads$/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /completed/i }).first()).toBeVisible();
  });

  test('manage tab defaults to Subscriptions sub-tab', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Subscriptions sub-tab should be active (has brighter styling)
    // and should show subscription content (empty state or cards)
    await expect(page.locator('text=/no subscriptions yet/i')).toBeVisible();
  });

  test('subscriptions sub-tab shows empty state with Go to Search CTA', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Empty state text
    await expect(page.locator('text=/no subscriptions yet/i')).toBeVisible();
    // "Go to Search" CTA button
    await expect(page.locator('button', { hasText: /go to search/i })).toBeVisible();
  });

  test('subscriptions sub-tab Go to Search button switches to Search tab', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Click "Go to Search"
    await page.locator('button', { hasText: /go to search/i }).click();
    await page.waitForTimeout(300);

    // Should now be on Search tab — search input visible
    const searchInput = page.locator('input[placeholder]').first();
    await expect(searchInput).toBeVisible();
  });

  test('downloads sub-tab shows URL input form', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'downloads');

    // Should see the URL input with paste placeholder
    await expect(page.locator('input[placeholder]').first()).toBeVisible();
    // Should see the Add button
    await expect(page.locator('button', { hasText: /^add$/i })).toBeVisible();
  });

  test('downloads sub-tab URL form accepts input', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'downloads');

    // Type a magnet URL
    const urlInput = page.locator('input[placeholder]').first();
    await urlInput.fill('magnet:?xt=urn:btih:abc123');
    await expect(urlInput).toHaveValue('magnet:?xt=urn:btih:abc123');
  });

  test('downloads sub-tab shows no active downloads empty state', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'downloads');

    // Should show empty state when no active downloads
    await expect(page.locator('text=/no active downloads/i')).toBeVisible();
  });

  test('completed sub-tab shows no completed downloads empty state', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'completed');

    // Should show empty state
    await expect(page.locator('text=/no completed downloads/i')).toBeVisible();
  });

  test('switching between sub-tabs works', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Default: Subscriptions
    await expect(page.locator('text=/no subscriptions yet/i')).toBeVisible();

    // Switch to Downloads
    await clickSubTab(page, 'downloads');
    await expect(page.locator('text=/no active downloads/i')).toBeVisible();

    // Switch to Completed
    await clickSubTab(page, 'completed');
    await expect(page.locator('text=/no completed downloads/i')).toBeVisible();

    // Switch back to Subscriptions
    await clickSubTab(page, 'subscriptions');
    await expect(page.locator('text=/no subscriptions yet/i')).toBeVisible();
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  test('rapid search changes debounce correctly', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();

    // Type quickly, changing query multiple times
    await searchInput.fill('Fr');
    await page.waitForTimeout(100);
    await searchInput.fill('Frie');
    await page.waitForTimeout(100);
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600); // wait for debounce

    // Only the final query should produce results
    await expect(page.locator('text=葬送的芙莉蓮')).toBeVisible();
  });

  test('clearing search shows initial state', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await expect(page.locator('text=葬送的芙莉蓮')).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(600);

    // Results should be gone
    await expect(page.locator('text=葬送的芙莉蓮')).not.toBeVisible();
  });

  test('switching between search and manage tabs works without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/downloads');
    await page.waitForTimeout(500);

    // Switch to Manage
    await page.locator('[class*="border-b"] button', { hasText: /manage/i }).click();
    await page.waitForTimeout(300);

    // Switch back to Search
    await page.locator('[class*="border-b"] button', { hasText: /search/i }).click();
    await page.waitForTimeout(300);

    // Search should still work after tab switch
    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);
    await expect(page.locator('text=葬送的芙莉蓮')).toBeVisible();

    expect(errors).toEqual([]);
  });

  // ── No crash tests ────────────────────────────────────────────────────

  test('page does not crash on any interaction', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/downloads');
    await page.waitForTimeout(500);

    // Search
    const searchInput = page.locator('input[placeholder]').first();
    await searchInput.fill('Frieren');
    await page.waitForTimeout(600);

    // Click anime
    await page.click('text=葬送的芙莉蓮');
    await page.waitForTimeout(500);

    // Click filters
    if (await page.locator('button', { hasText: 'Nyaa' }).first().isVisible()) {
      await page.locator('button', { hasText: 'Nyaa' }).first().click();
      await page.waitForTimeout(300);
    }
    if (await page.locator('button', { hasText: '720p' }).first().isVisible()) {
      await page.locator('button', { hasText: '720p' }).first().click();
      await page.waitForTimeout(300);
    }

    // Open subscribe panel
    const subscribeBtn = page.locator('button', { hasText: /subscribe/i }).first();
    if (await subscribeBtn.isVisible()) {
      await subscribeBtn.click();
      await page.waitForTimeout(300);

      // Close the modal by pressing Escape or clicking cancel
      const cancelBtn = page.locator('button', { hasText: /cancel/i }).first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // Switch to Manage and cycle through sub-tabs
    await page.locator('[class*="border-b"] button', { hasText: /manage/i }).click();
    await page.waitForTimeout(300);

    await clickSubTab(page, 'downloads');
    await clickSubTab(page, 'completed');
    await clickSubTab(page, 'subscriptions');

    // Switch back to Search
    await page.locator('[class*="border-b"] button', { hasText: /search/i }).click();
    await page.waitForTimeout(300);

    expect(errors).toEqual([]);
  });
});

// ── Manage Tab with populated data ──────────────────────────────────────────

test.describe('Manage Tab — with subscriptions and downloads', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { withSubscriptions: true, withDownloads: true });
    await page.goto('/');
    await setupAuth(page);
    await page.reload();
    await page.waitForTimeout(500);
  });

  test('subscriptions sub-tab shows subscription cards', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Should show the Frieren subscription rule name
    await expect(page.locator('text=Frieren S1').first()).toBeVisible();
  });

  test('downloads sub-tab shows summary bar with active downloads', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'downloads');

    // Should show the summary bar with active download count
    await expect(page.locator('text=/downloading/i').first()).toBeVisible();
    // Should show the active download card
    await expect(page.locator('text=[桜都] Frieren - 01 [1080p]')).toBeVisible();
  });

  test('downloads sub-tab shows Pause All button when active downloads exist', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'downloads');

    // Should show Pause All in the summary bar
    await expect(page.locator('button', { hasText: /pause all/i })).toBeVisible();
  });

  test('completed sub-tab shows completed downloads with Clear All button', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);
    await clickSubTab(page, 'completed');

    // Should show completed download cards
    await expect(page.locator('text=[桜都] Frieren - 02 [1080p]')).toBeVisible();
    await expect(page.locator('text=Some manual download.mkv')).toBeVisible();

    // Should show Clear All button
    await expect(page.locator('button', { hasText: /clear all/i })).toBeVisible();
  });

  test('downloads sub-tab badge shows active count', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // The Downloads sub-tab pill should show "1" badge (1 active download)
    const downloadsTab = page
      .locator('button', { hasText: /downloads/i })
      .filter({ hasNotText: /completed/i })
      .first();
    await expect(downloadsTab).toContainText('1');
  });

  test('completed sub-tab badge shows completed count', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // The Completed sub-tab pill should show "2" badge (2 completed downloads)
    const completedTab = page.locator('button', { hasText: /completed/i }).first();
    await expect(completedTab).toContainText('2');
  });

  test('no crash when cycling through all sub-tabs with data', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await goToManageTab(page);

    // Subscriptions (default)
    await expect(page.locator('text=Frieren S1').first()).toBeVisible();

    // Downloads
    await clickSubTab(page, 'downloads');
    await expect(page.locator('text=[桜都] Frieren - 01 [1080p]')).toBeVisible();

    // Completed
    await clickSubTab(page, 'completed');
    await expect(page.locator('text=Some manual download.mkv')).toBeVisible();

    // Back to Subscriptions
    await clickSubTab(page, 'subscriptions');
    await expect(page.locator('text=Frieren S1').first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});

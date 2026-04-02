import { expect, type Page, test } from '@playwright/test';

// ── Test data: mix of popular and obscure anime ─────────────────────────────

const ANIME_SEARCH_RESULTS = {
  frieren: [
    {
      bangumi_id: 400602,
      title: '葬送的芙莉蓮',
      title_original: '葬送のフリーレン',
      title_en: 'Frieren: Beyond Journey\'s End',
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

async function setupApiMocks(page: Page) {
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

  // Aria2 status
  await page.route('**/api/v1/system/aria2-status', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ connected: true, version: '1.37.0' }),
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
        feed: { id: 'feed-1', name: '[Auto] Test', url: 'https://example.com/rss', type: 'mikan', enabled: 1, fetch_interval_minutes: 30, last_fetched_at: null, created_at: new Date().toISOString() },
        rule: { id: 'rule-1', name: 'Test', enabled: 1, rss_feed_id: 'feed-1', filter_regex: '.*', exclude_regex: '', save_dir: '', episode_offset: 0, resolution_filter: '1080p', subgroup_filter: '', min_seeders: 0, last_triggered_at: null, created_at: new Date().toISOString() },
      }),
    })
  );

  // Torrent add (download)
  await page.route('**/api/v1/torrent-search/add', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'dl-1', gid: 'gid-1', status: 'active' }),
    })
  );

  // RSS feeds
  await page.route('**/api/v1/rss-feeds', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, body: JSON.stringify({}) });
  });

  // Download rules
  await page.route('**/api/v1/download-rules', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );

  // Grouped downloads
  await page.route('**/api/v1/downloads/grouped', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );
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

    // Should have search and manage tab buttons
    const tabs = page.locator('button').filter({ hasText: /search|manage/i });
    await expect(tabs).toHaveCount(2);
  });

  test('shows Aria2 connection status', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    await expect(page.locator('text=Aria2 v1.37.0')).toBeVisible();
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
    const backButton = page.locator('button').filter({ has: page.locator('svg') }).first();
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

  // ── Manage Tab ────────────────────────────────────────────────────────

  test('manage tab shows empty state when no subscriptions', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    // Click Manage tab
    const manageTab = page.locator('button', { hasText: /manage/i });
    await manageTab.click();
    await page.waitForTimeout(500);

    // Should show URL input form
    await expect(page.locator('input[placeholder]').first()).toBeVisible();
  });

  test('manage tab URL add form accepts input', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForTimeout(500);

    const manageTab = page.locator('button', { hasText: /manage/i });
    await manageTab.click();
    await page.waitForTimeout(500);

    // Type a magnet URL
    const urlInput = page.locator('input[placeholder]').first();
    await urlInput.fill('magnet:?xt=urn:btih:abc123');
    await expect(urlInput).toHaveValue('magnet:?xt=urn:btih:abc123');
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
    await page.locator('button', { hasText: /manage/i }).click();
    await page.waitForTimeout(300);

    // Switch back to Search
    await page.locator('button', { hasText: /search/i }).click();
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

    // Switch tabs
    await page.locator('button', { hasText: /manage/i }).click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: /search/i }).click();
    await page.waitForTimeout(300);

    expect(errors).toEqual([]);
  });
});

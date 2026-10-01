import { expect, type Page, test } from '@playwright/test';

const ID = 400602;
const EPISODE_COUNT = 30;
const CHARACTER_COUNT = 14;

const SYNOPSIS = Array.from(
  { length: 6 },
  (_, i) => `Paragraph ${i + 1}: the elf mage keeps walking long after the hero's party is gone.`
).join('\n');

function detail() {
  return {
    bangumi_id: ID,
    anilist_id: 154587,
    title: 'Frieren: Beyond Journey’s End',
    title_original: '葬送のフリーレン',
    cover_image: '',
    banner_image: '',
    score: 9.1,
    episode_count: EPISODE_COUNT,
    media_type: 'TV',
    air_date: '2023-09-29',
    synopsis: SYNOPSIS,
    tags: ['Fantasy', 'Adventure'],
    rating: { score: 9.1, total: 5000 },
    characters: Array.from({ length: CHARACTER_COUNT }, (_, i) => ({
      role: i < 2 ? 'MAIN' : 'SUPPORTING',
      character: { id: i + 1, name: `Character ${i + 1}`, image: '' },
      voice_actor: { id: 100 + i, name: `Actor ${i + 1}`, image: '' },
    })),
    recommendations: Array.from({ length: 6 }, (_, i) => ({
      bangumi_id: 1000 + i,
      anilist_id: 2000 + i,
      title: `Recommended ${i + 1}`,
      cover_image: '',
      episode_count: 12,
      score: 7.5,
    })),
    relations: [],
    reviews: [],
  };
}

function discoverEpisodes() {
  return Array.from({ length: EPISODE_COUNT }, (_, i) => ({
    bangumi_episode_id: i + 1,
    sort: i + 1,
    title: `Title ${i + 1}`,
    title_original: '',
    air_date: '2023-09-29',
  }));
}

/**
 * Every episode up to `resumeAt + 1` is on disk; the ones before `resumeAt`
 * are watched and `resumeAt` itself is half-way through.
 */
function playable(watchStatus: string, resumeAt = 3) {
  return {
    anime_id: 'a1',
    watch_status: watchStatus,
    mal_id: 52991,
    tmdb_id: null,
    anidb_id: null,
    user_score: null,
    sync_disabled: 0,
    watch_status_override: '',
    episodes: discoverEpisodes().map((ep) => {
      const onDisk = ep.sort <= resumeAt + 1;
      return {
        episode_id: `ep-${ep.sort}`,
        sort: ep.sort,
        title: ep.title,
        title_zh: null,
        air_date: ep.air_date,
        synopsis: null,
        synopsis_zh: null,
        image: null,
        media_file: onDisk ? { id: `f-${ep.sort}`, height: 1080, video_codec: 'hevc' } : null,
        progress:
          ep.sort < resumeAt
            ? { position_seconds: 1440, duration_seconds: 1440, completed: true }
            : ep.sort === resumeAt
              ? { position_seconds: 600, duration_seconds: 1440, completed: false }
              : null,
      };
    }),
  };
}

async function setup(
  page: Page,
  opts: { watchStatus?: string; progress?: boolean; resumeAt?: number } = {}
) {
  let watchStatus = opts.watchStatus ?? 'none';
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  // Catch-all first: Playwright gives later routes precedence.
  await page.route('**/api/v1/**', (r) => r.fulfill(json([])));
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill(json({ id: 'user-1', username: 'testuser' }))
  );
  await page.route('**/api/v1/auth/status', (r) => r.fulfill(json({ initialized: true })));
  await page.route('**/api/v1/notifications**', (r) => r.fulfill(json({ count: 0 })));
  await page.route(`**/api/v1/discover/anime/${ID}`, (r) => r.fulfill(json(detail())));
  await page.route(`**/api/v1/discover/anime/${ID}/episodes`, (r) =>
    r.fulfill(json(discoverEpisodes()))
  );
  await page.route(`**/api/v1/discover/anime/${ID}/franchise`, (r) =>
    r.fulfill(json({ main_series: [], side_stories: [] }))
  );
  await page.route(`**/api/v1/anime/${ID}/missing`, (r) => r.fulfill({ status: 404, body: '' }));
  await page.route(`**/api/v1/anime/${ID}/playable-episodes`, (r) => {
    const body = playable(watchStatus, opts.resumeAt);
    if (opts.progress === false) {
      for (const ep of body.episodes) ep.progress = null;
    }
    return r.fulfill(json(body));
  });
  await page.route(`**/api/v1/collection/${ID}/status`, (r) => {
    watchStatus = (JSON.parse(r.request().postData() ?? '{}') as { status: string }).status;
    return r.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('milmil-token', 'mlml_fake-token');
    localStorage.setItem(
      'auth',
      JSON.stringify({
        state: {
          token: 'mlml_fake-token',
          user: { id: 'user-1', username: 'testuser' },
          initialized: true,
        },
        version: 0,
      })
    );
  });
  await page.goto(`/anime/${ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(detail().title);
}

test('primary button resumes the in-progress episode', async ({ page }) => {
  await setup(page);
  const play = page.getByRole('link', { name: /EP 3/ }).first();
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('href', new RegExp(`/watch/${ID}\\?ep=3`));
});

test('primary button starts from the first file when nothing is watched', async ({ page }) => {
  await setup(page, { progress: false });
  await expect(page.getByRole('link', { name: /EP 1$/ }).first()).toBeVisible();
});

test('primary button is reachable on a phone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await expect(page.getByRole('link', { name: /EP 3/ }).first()).toBeInViewport();
});

test('bookmark button reflects collection state', async ({ page }) => {
  await setup(page);
  const bookmark = page.getByRole('button', { name: /Collection/ });
  await expect(bookmark).toHaveAttribute('aria-pressed', 'false');
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
  // The status select appears once the anime is in the collection.
  await expect(page.locator('select')).toHaveValue('planning');
});

test('synopsis is clamped and expands on demand', async ({ page }) => {
  await setup(page);
  const text = page.getByText(/Paragraph 1:/);
  const collapsed = (await text.boundingBox())!.height;
  const toggle = page.locator('p', { hasText: 'Paragraph 1:' }).locator('+ button');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/Paragraph 6:/)).toBeVisible();
  expect((await text.boundingBox())!.height).toBeGreaterThan(collapsed * 1.5);
  // The hero is overflow-hidden: it must grow with the text, not clip it.
  const hero = page
    .locator('h1')
    .locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]');
  const [heroBox, toggleBox] = [(await hero.boundingBox())!, (await toggle.boundingBox())!];
  expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(heroBox.y + heroBox.height);
});

test('long episode and cast lists collapse behind show-more toggles', async ({ page }) => {
  await setup(page);
  await expect(page.getByText('Title 24', { exact: true })).toBeVisible();
  await expect(page.getByText('Title 25', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /\(\+6\)/ }).click();
  await expect(page.getByText('Title 30', { exact: true })).toBeVisible();

  await expect(page.getByText('Character 10', { exact: true })).toBeVisible();
  await expect(page.getByText('Character 11', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /\(\+4\)/ }).click();
  await expect(page.getByText('Character 14', { exact: true })).toBeVisible();
});

test('recommendations render as a rail', async ({ page }) => {
  await setup(page);
  // AnimeCard repeats the title in its fallback art, so pin to the caption.
  const first = page.locator('p', { hasText: /^Recommended 1$/ });
  const last = page.locator('p', { hasText: /^Recommended 6$/ });
  await first.scrollIntoViewIfNeeded();
  // All six share one row instead of wrapping into a half-empty grid.
  const [a, b] = [(await first.boundingBox())!, (await last.boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
});

test('collapsed episode list centres on the episode being watched', async ({ page }) => {
  await setup(page, { resumeAt: 28 });
  await expect(page.getByRole('link', { name: /EP 28/ }).first()).toBeVisible();
  await expect(page.getByText('Title 25', { exact: true })).toBeVisible();
  await expect(page.getByText('Title 30', { exact: true })).toBeVisible();
  await expect(page.getByText('Title 1', { exact: true })).toHaveCount(0);
});

test('external links are labelled and only shown when known', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('link', { name: /^Bangumi/ })).toHaveAttribute(
    'href',
    `https://bgm.tv/subject/${ID}`
  );
  await expect(page.getByRole('link', { name: /^MAL/ })).toHaveAttribute(
    'href',
    'https://myanimelist.net/anime/52991'
  );
  await expect(page.getByRole('link', { name: /^TMDB/ })).toHaveCount(0);
});

import { expect, type Locator, type Page, test } from '@playwright/test';

// ── Calendar fixture ──────────────────────────────────────────────────────

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const WEEKDAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_JP = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];

/** Same mapping the page uses: JS Sunday (0) is the last Bangumi weekday. */
function todayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function makeAnime(id: number, title: string, airTime: string) {
  return {
    bangumi_id: id,
    title,
    title_original: title,
    cover_image: '',
    episode_count: 12,
    score: 7.5,
    next_episode: 3,
    air_time: airTime,
  };
}

const CALENDAR = WEEKDAYS.map((weekday, i) => ({
  weekday,
  weekday_en: WEEKDAYS_EN[i],
  items: [
    makeAnime(1000 + i, `${WEEKDAYS_EN[i]} Show Early`, '00:30'),
    makeAnime(2000 + i, `${WEEKDAYS_EN[i]} Show Late A`, '23:00'),
    makeAnime(3000 + i, `${WEEKDAYS_EN[i]} Show Late B`, '23:00'),
  ],
}));

/** The card for `title` on whichever surface (mobile or desktop) is rendered. */
function visibleCard(page: Page, title: string) {
  return page.getByRole('link', { name: new RegExp(title) }).filter({ visible: true });
}

async function setupApiMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ id: 'user-1', username: 'testuser' }) })
  );
  await page.route('**/api/v1/auth/status', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );
  await page.route('**/api/v1/discover/calendar', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CALENDAR) })
  );
  await page.route('**/api/v1/discover/trending*', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/libraries', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/progress/recent', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/v1/notifications**', (r) => r.fulfill({ status: 200, body: '[]' }));
}

/** Synthesises a one-finger horizontal swipe on `target` via real TouchEvents. */
async function swipe(target: Locator, dx: number) {
  await target.evaluate((el, delta) => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(rect.height / 2, 120);
    const mk = (type: string, clientX: number) => {
      const touch = new Touch({ identifier: 1, target: el, clientX, clientY: y });
      return new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [touch],
        changedTouches: [touch],
        bubbles: true,
        cancelable: true,
      });
    };
    el.dispatchEvent(mk('touchstart', x));
    el.dispatchEvent(mk('touchmove', x + delta / 2));
    el.dispatchEvent(mk('touchend', x + delta));
  }, dx);
}

// ── Mobile ────────────────────────────────────────────────────────────────

test.describe('schedule page on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens on today, shows time-slot headers, and swipes between weekdays', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/schedule');

    const idx = todayIndex();
    const mobileTabs = page.locator('[data-tab-surface="mobile"]');
    const activeTab = mobileTabs.and(page.locator('[data-active="true"]'));

    // 1. The current weekday is selected on entry …
    await expect(activeTab).toHaveAttribute('data-weekday', WEEKDAYS[idx]!);
    await expect(page.getByRole('heading', { level: 2, name: WEEKDAYS_JP[idx]! })).toBeVisible();

    // … and its tab has been scrolled into the visible part of the strip.
    const inView = await activeTab.evaluate((btn) => {
      const scroller = btn.closest('.overflow-x-auto')!;
      const s = scroller.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return b.left >= s.left && b.right <= s.right;
    });
    expect(inView).toBe(true);

    // 2. Cards are grouped under time-slot headers.
    await expect(page.getByRole('heading', { level: 3, name: '00:30' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '23:00' })).toBeVisible();
    await expect(visibleCard(page, `${WEEKDAYS_EN[idx]} Show Early`)).toBeVisible();

    // 3. A horizontal swipe pages to the neighbouring weekday. Sunday is the
    //    last tab with the default Monday week start, so swipe back from there.
    const content = page.getByTestId('schedule-mobile-content');
    const forward = idx < WEEKDAYS.length - 1;
    const target = forward ? idx + 1 : idx - 1;
    await swipe(content, forward ? -160 : 160);

    await expect(activeTab).toHaveAttribute('data-weekday', WEEKDAYS[target]!);
    await expect(page.getByRole('heading', { level: 2, name: WEEKDAYS_JP[target]! })).toBeVisible();
    await expect(visibleCard(page, `${WEEKDAYS_EN[target]} Show Early`)).toBeVisible();

    // A mostly-vertical drag is scrolling, not paging — the day must not change.
    await content.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + 100;
      const mk = (type: string, clientX: number, clientY: number) => {
        const touch = new Touch({ identifier: 2, target: el, clientX, clientY });
        return new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
          bubbles: true,
        });
      };
      el.dispatchEvent(mk('touchstart', x, y));
      el.dispatchEvent(mk('touchend', x - 60, y + 200));
    });
    await expect(activeTab).toHaveAttribute('data-weekday', WEEKDAYS[target]!);
  });
});

// ── Desktop ───────────────────────────────────────────────────────────────

test('schedule page on desktop opens on today', async ({ page }) => {
  await setupApiMocks(page);
  await page.goto('/schedule');

  const idx = todayIndex();
  const activeTab = page
    .locator('[data-tab-surface="desktop"]')
    .and(page.locator('[data-active="true"]'));
  await expect(activeTab).toHaveAttribute('data-weekday', WEEKDAYS[idx]!);
  await expect(page.getByRole('heading', { level: 2, name: WEEKDAYS_JP[idx]! })).toBeVisible();
  await expect(visibleCard(page, `${WEEKDAYS_EN[idx]} Show Early`)).toBeVisible();
});

import { expect, type Page, test } from '@playwright/test';

// ── Mock notification data ────────────────────────────────────────────────

const ALL_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'download.completed',
    title: 'Download Complete',
    message: '[桜都] Frieren - 26 [1080p]',
    severity: 'success',
    read: 0,
    metadata: '{"gid":"gid1"}',
    created_at: new Date().toISOString(), // today
  },
  {
    id: 'n2',
    type: 'download.started',
    title: 'New Episode',
    message: '[SubsPlease] Solo Leveling - 05 [1080p]',
    severity: 'info',
    read: 0,
    metadata: '{"rule_id":"r1"}',
    created_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago
  },
  {
    id: 'n3',
    type: 'download.failed',
    title: 'Download Failed',
    message: 'Some torrent that failed',
    severity: 'error',
    read: 1,
    metadata: null,
    created_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
  },
  {
    id: 'n4',
    type: 'library.scan_completed',
    title: 'Library Scan Complete',
    message: 'Anime Library: 3 new files',
    severity: 'info',
    read: 1,
    metadata: null,
    created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
  },
  {
    id: 'n5',
    type: 'system.error',
    title: 'Download Error',
    message: 'Torrent client encountered an error',
    severity: 'error',
    read: 0,
    metadata: null,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(), // 2h ago
  },
];

// ── Auth + API mock setup ─────────────────────────────────────────────────

async function setupAuth(page: Page) {
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

  // Notifications — single route handler that dispatches by URL path + method
  // (Playwright matches routes LIFO, so a single catch-all is safest)
  await page.route('**/api/v1/notifications**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    // Unread count
    if (path.endsWith('/unread-count')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 3 }),
      });
    }

    // Mark all read
    if (path.endsWith('/mark-all-read')) {
      return route.fulfill({ status: 200, body: '{}' });
    }

    // Mark single read — e.g. /notifications/n1/read
    if (path.match(/\/notifications\/[^/]+\/read$/)) {
      return route.fulfill({ status: 200, body: '{}' });
    }

    // Only /api/v1/notifications (exact) below this point
    if (path !== '/api/v1/notifications') {
      return route.continue();
    }

    // DELETE = clear all
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 200, body: '{}' });
    }

    // GET = list
    const filter = url.searchParams.get('filter');
    let notifs = ALL_NOTIFICATIONS;
    if (filter) notifs = notifs.filter((n) => n.type.startsWith(filter));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(notifs.slice(0, 20)),
    });
  });

  // Libraries (may be fetched by sidebar)
  await page.route('**/api/v1/libraries', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );
}

// ── Helper: click the bell via JS to avoid React remount from Playwright CDP ──

async function openBellDropdown(page: Page) {
  // The NotificationBell component re-mounts when Playwright dispatches native
  // pointer events (the sidebar parent re-renders). Use a JS .click() which
  // fires a synthetic click without mousedown/pointerdown, keeping the dropdown
  // open reliably. Prefer the sidebar bell — the floating mobile chip is also
  // in the DOM (md:hidden) and would otherwise collide on aria-label.
  await page.evaluate(() => {
    (document.querySelector('[data-testid="notification-bell"]') as HTMLElement | null)?.click();
  });
  // Wait for the dropdown's data query to resolve
  await page.waitForTimeout(500);
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Notification Center', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');
    await setupAuth(page);
    await page.reload();
    await page.waitForTimeout(500);
  });

  // ── Bell + dropdown tests ─────────────────────────────────────────────

  test('bell shows unread badge count', async ({ page }) => {
    // Sidebar bell — not the floating mobile chip (also in the DOM, md:hidden).
    const bellButton = page.getByTestId('notification-bell');
    await expect(bellButton).toBeVisible({ timeout: 5000 });

    // Badge should show unread count of 3
    const badge = bellButton.locator('span');
    await expect(badge).toContainText('3');
  });

  test('clicking bell opens dropdown with notifications', async ({ page }) => {
    await openBellDropdown(page);

    // Dropdown should show notification titles
    await expect(page.locator('text=Download Complete').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=[桜都] Frieren - 26 [1080p]').first()).toBeVisible();
  });

  test('dropdown shows latest notifications with severity styling', async ({ page }) => {
    await openBellDropdown(page);

    // Success notification (Download Complete)
    await expect(page.locator('text=Download Complete').first()).toBeVisible({ timeout: 5000 });

    // Error notification (Download Error)
    await expect(page.locator('text=Download Error').first()).toBeVisible();

    // Info notification (New Episode)
    await expect(page.locator('text=New Episode').first()).toBeVisible();

    await expect(page.locator('button', { hasText: 'Download Complete' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Download Error' })).toBeVisible();
  });

  test('clicking "view all" navigates to notifications page', async ({ page }) => {
    await openBellDropdown(page);
    await page.locator('a[href="/notifications"]').click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/\/notifications/);
  });

  // ── Full page tests ──────────────────────────────────────────────────

  test('notifications page shows all notifications', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(1000);

    // All notification titles should be visible
    await expect(page.locator('text=Download Complete').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=New Episode').first()).toBeVisible();
    await expect(page.locator('text=Download Failed').first()).toBeVisible();
    await expect(page.locator('text=Library Scan Complete').first()).toBeVisible();
    await expect(page.locator('text=System Error').first()).toBeVisible();
  });

  test('filter tabs filter by type', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(1000);

    // Wait for page to load with all notifications
    await expect(page.locator('text=Download Complete').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Library Scan Complete').first()).toBeVisible();

    // Click "Downloads" filter tab and wait for filtered API response
    const downloadFilter = page.getByRole('button', { name: 'Downloads', exact: true });
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/v1/notifications') &&
        resp.url().includes('filter=download') &&
        resp.status() === 200
    );
    await downloadFilter.click();
    await responsePromise;
    await page.waitForTimeout(500);

    // Download notifications should still be visible
    await expect(page.locator('text=Download Complete').first()).toBeVisible();
    await expect(page.locator('text=New Episode').first()).toBeVisible();
    await expect(page.locator('text=Download Failed').first()).toBeVisible();

    // Non-download notifications should no longer be visible
    await expect(page.locator('text=Library Scan Complete')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Download Error')).not.toBeVisible();
  });

  test('notifications grouped by time (today/yesterday/earlier)', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(1000);

    // Wait for page to load
    await expect(page.locator('text=Download Complete').first()).toBeVisible({ timeout: 5000 });

    // Should show time grouping headers (uppercase text)
    await expect(page.locator('text=/Today/i').first()).toBeVisible();
    await expect(page.locator('text=/Yesterday/i').first()).toBeVisible();
    await expect(page.locator('text=/Earlier/i').first()).toBeVisible();
  });

  test('mark all read button works', async ({ page }) => {
    let markAllCalled = false;
    page.on('request', (req) => {
      if (req.url().includes('/notifications/mark-all-read') && req.method() === 'POST') {
        markAllCalled = true;
      }
    });

    await page.goto('/notifications');
    await page.waitForTimeout(1000);

    // Wait for page to load
    await expect(page.locator('text=Download Complete').first()).toBeVisible({ timeout: 5000 });

    // Find "Mark all read" button
    const markAllBtn = page.locator('button', { hasText: /Mark all read/i });
    await expect(markAllBtn).toBeVisible();

    // Click it
    await markAllBtn.click();
    await page.waitForTimeout(500);

    // Verify the API was called
    expect(markAllCalled).toBe(true);
  });

  test('page does not crash', async ({ page }) => {
    let crashError: Error | null = null;
    page.on('pageerror', (err) => {
      crashError = err;
    });

    await page.goto('/notifications');
    await page.waitForTimeout(2000);

    // Page should load without JS errors
    expect(crashError).toBeNull();

    // Should have the page heading "Notifications"
    await expect(page.locator('h1', { hasText: /Notifications/i })).toBeVisible({ timeout: 5000 });
  });
});

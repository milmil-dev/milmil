import { expect, test } from '@playwright/test';

// E2E coverage for the first-run setup wizard:
//  1. happy path: / -> /setup -> /setup/admin -> /setup/library -> /setup/integrations -> /
//  2. refresh during the library step keeps the user on /setup/library
//  3. authed user with zero libraries hitting / is bounced to /setup/library
//
// Auth note: useAuthStore reads/writes the raw `milmil-token` key in localStorage
// (NOT a zustand persist envelope). On module load the store migrates away any
// legacy token that doesn't start with `mlml_`, so when we pre-seed a token for
// reload/deep-link cases it must use the `mlml_` prefix.

test.describe('First-run setup wizard', () => {
  test('happy path: admin -> library -> integrations -> dashboard', async ({ page }) => {
    let hasAdmin = false;
    let libraryCount = 0;

    // Catch-all MUST be registered FIRST — Playwright matches routes in LIFO order,
    // so the most-recently-added handler runs first. Specific routes registered after
    // this catch-all will therefore be checked first; the catch-all only fires for
    // unmatched paths.
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_admin: hasAdmin, library_count: libraryCount }),
      });
    });
    await page.route('**/api/v1/auth/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ initialized: hasAdmin }),
      });
    });
    await page.route('**/api/v1/auth/setup', async (route) => {
      hasAdmin = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mlml_test',
          user: { id: 'u1', username: 'admin' },
        }),
      });
    });
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', username: 'admin' }),
      });
    });
    await page.route('**/api/v1/libraries/test-connection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route('**/api/v1/libraries', async (route) => {
      if (route.request().method() === 'POST') {
        libraryCount = 1;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'lib-1',
            name: 'Anime',
            path: '/media',
            enabled: 1,
            source_type: 'local',
            scan_interval_minutes: 60,
            last_scanned_at: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    // Fire-and-forget initial scan kick-off — URL fix: /libraries/{id}/scan (plural)
    await page.route('**/api/v1/libraries/lib-1/scan', async (route) => {
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/');

    await expect(page).toHaveURL(/\/setup\/admin$/);

    await page.getByLabel(/auth\.setup\.username|^username$/i).fill('admin');
    await page.getByLabel(/auth\.setup\.password|^password$/i).fill('Password123!');
    await page.getByRole('button', { name: /auth\.setup\.submit|create account/i }).click();

    await expect(page).toHaveURL(/\/setup\/library$/);

    await page.getByLabel(/library\.nameLabel|library name/i).fill('Anime');
    // Path field already has /media as default value; trigger blur to fire path check.
    const pathField = page.getByLabel(/library\.pathLabel|path/i);
    await pathField.click();
    await pathField.blur();
    await expect(page.getByText(/pathReadable|path readable/i)).toBeVisible();

    await page.getByRole('button', { name: /library\.submit|create library/i }).click();

    await expect(page).toHaveURL(/\/setup\/integrations$/);
    // Use exact: true — non-exact `getByText('Bangumi')` matches the description copy
    // ("Pull anime metadata…") in addition to the provider name and trips strict mode.
    await expect(page.getByText('Bangumi', { exact: true })).toBeVisible();
    await expect(page.getByText('AniList', { exact: true })).toBeVisible();
    await expect(page.getByText('Trakt', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /finish/i }).click();

    await expect(page).not.toHaveURL(/\/setup\//);
  });

  test('refresh during library step keeps user on /setup/library', async ({ page }) => {
    // Catch-all first (LIFO matching — see happy-path test for explanation).
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_admin: true, library_count: 0 }),
      });
    });
    await page.route('**/api/v1/auth/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ initialized: true }),
      });
    });
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', username: 'admin' }),
      });
    });
    await page.route('**/api/v1/libraries/test-connection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    // Token must start with `mlml_` — auth-store migration clears anything else.
    await page.addInitScript(() => {
      window.localStorage.setItem('milmil-token', 'mlml_test');
    });

    await page.goto('/setup/library');
    await expect(page).toHaveURL(/\/setup\/library$/);
    await page.reload();
    await expect(page).toHaveURL(/\/setup\/library$/);
  });

  test('deep link to / with no library bounces to /setup/library', async ({ page }) => {
    // Catch-all first (LIFO matching — see happy-path test for explanation).
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_admin: true, library_count: 0 }),
      });
    });
    await page.route('**/api/v1/auth/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ initialized: true }),
      });
    });
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', username: 'admin' }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('milmil-token', 'mlml_test');
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/setup\/library$/);
  });
});

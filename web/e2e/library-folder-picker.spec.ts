import { expect, test } from '@playwright/test';

test('folder picker dialog: navigate and select on local source', async ({ page }) => {
  // Auth mocks
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'user-1', username: 'testuser' }),
    });
  });
  await page.route('**/api/v1/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ initialized: true }),
    });
  });

  // Libraries: empty list, plus POST handler
  await page.route('**/api/v1/libraries', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
      return;
    }
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 201,
        body: JSON.stringify({
          id: 'lib-created',
          name: body.name ?? 'test',
          path: body.path ?? '/',
          enabled: 1,
          source_type: body.source_type ?? 'local',
          scan_interval_minutes: body.scan_interval_minutes ?? 60,
        }),
      });
      return;
    }
    await route.fallback();
  });

  // Browse endpoint — simulated local filesystem tree
  await page.route('**/api/v1/libraries/browse', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const tree: Record<string, string[]> = {
      '/': ['mnt'],
      '/mnt': ['media'],
      '/mnt/media': ['anime', 'movies'],
      '/mnt/media/anime': [],
    };
    const children = tree[body.path] ?? [];
    const directories = children.map((name) => ({
      name,
      path: `${body.path === '/' ? '' : body.path}/${name}`,
    }));
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ directories }),
    });
  });

  // Seed auth token before navigation so beforeLoad guard doesn't redirect.
  // Token must start with `mlml_` — legacy tokens are cleared by auth-store migration.
  await page.addInitScript(() => {
    localStorage.setItem('milmil-token', 'mlml_fake');
  });

  await page.goto('/libraries');
  await page.waitForLoadState('networkidle');

  // Step 1: click the add-library card on the empty state
  await page
    .getByText(/新增媒體庫|Add library/i)
    .first()
    .click();

  // Pick local source — the source card with 本機 label
  await page
    .getByText(/本機|Local/i)
    .first()
    .click();

  // Step 2: click the folder-icon trigger (aria-label from library.browseFolder)
  await page.getByRole('button', { name: /瀏覽資料夾|Browse folder/i }).click();

  // Dialog opens
  await expect(page.getByRole('dialog')).toBeVisible();

  // Navigate: / -> /mnt -> /mnt/media -> /mnt/media/anime
  // Directory buttons render their folder name plus a ▶ chevron — use anchored regex.
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^mnt/ }).click();
  await dialog.getByRole('button', { name: /^media/ }).click();
  await dialog.getByRole('button', { name: /^anime/ }).click();

  // Click the Select button in the dialog footer
  await page.getByRole('button', { name: /選擇此資料夾|Select this folder/i }).click();

  // Dialog closes
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Path input populated with selected path
  await expect(page.locator('#wiz-path')).toHaveValue('/mnt/media/anime');
});

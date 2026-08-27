import { expect, type Page, test } from '@playwright/test';

const USER = { id: 'user-1', username: 'testuser', avatar_url: '/api/v1/users/user-1/avatar?v=1' };

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

async function setupApiMocks(page: Page, calls: { requests: string[] }) {
  let hasAvatar = true;
  await page.route('**/api/v1/auth/me/avatar', (route) => {
    const method = route.request().method();
    calls.requests.push(`${method} ${route.request().postData() ?? ''}`.trim());
    if (method === 'DELETE') {
      hasAvatar = false;
      return route.fulfill({ status: 204, body: '' });
    }
    hasAvatar = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ avatar_url: '/api/v1/users/user-1/avatar?v=2' }),
    });
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...USER, avatar_url: hasAvatar ? USER.avatar_url : null }),
    })
  );
  await page.route('**/api/v1/users/user-1/avatar**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      // 1×1 transparent PNG
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      ),
    })
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
  );
  await page.route('**/api/v1/auth/2fa/status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ enabled: false }) })
  );
  await page.route('**/api/v1/auth/tokens**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );
  await page.route('**/api/v1/libraries', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify([]) })
  );
  await page.route('**/api/v1/notifications**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
    })
  );
  await page.route('**/api/v1/collection**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'a1', bangumi_id: 530725, title: 'Bleach', title_zh: '死神', cover_image_url: null },
      ]),
    })
  );
  await page.route('**/api/v1/discover/anime/530725', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        bangumi_id: 530725,
        title: 'Bleach',
        characters: [
          {
            role: 'MAIN',
            character: { id: 1, name: 'Ichigo', image: 'https://img.test/ichigo.jpg' },
          },
        ],
      }),
    })
  );
  await page.route('https://img.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) })
  );
}

test.describe('Settings › Account › avatar', () => {
  const calls = { requests: [] as string[] };

  test.beforeEach(async ({ page }) => {
    calls.requests.length = 0;
    await setupApiMocks(page, calls);
    await page.goto('/');
    await setupAuth(page);
    await page.goto('/settings?tab=account');
  });

  test('shows the avatar image and removes it', async ({ page }) => {
    await expect(page.getByTestId('user-avatar-image').first()).toBeVisible();
    await page.getByTestId('avatar-remove').click();
    await expect.poll(() => calls.requests).toContain('DELETE');
    await expect(page.getByTestId('avatar-remove')).toHaveCount(0);
  });

  test('picks a character as the avatar', async ({ page }) => {
    await page.getByTestId('avatar-use-character').click();
    await page.getByRole('button', { name: /死神/ }).click();
    await page.getByRole('button', { name: /Ichigo/ }).click();
    await expect
      .poll(() => calls.requests.join('\n'))
      .toContain('PUT {"source_url":"https://img.test/ichigo.jpg"}');
  });
});

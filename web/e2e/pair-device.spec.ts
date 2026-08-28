import { expect, type Page, test } from '@playwright/test';

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

/**
 * The pairing card is the only thing in the product that produces a
 * `milmil://pair` link, so without it the mobile clients have no way in.
 * These assertions are about the link's shape, which is the contract all
 * three clients parse — see PairRequest.swift and PairLink.kt.
 */
test.describe('Settings › Account › pair a device', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/api-tokens', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            id: 'tok_1',
            name: 'Pairing',
            token: 'mlml_test_token',
            token_prefix: 'mlml_tes',
            created_at: new Date().toISOString(),
          },
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/');
    await setupAuth(page);
    await page.goto('/settings?tab=account');
    // The API-tokens tab is local state inside AccountPanel, not a route.
    await page.getByRole('button', { name: 'API Tokens' }).click();
  });

  test('mints a code and offers it as a scannable link', async ({ page }) => {
    await page.getByTestId('pair-start').click();

    const qr = page.getByTestId('pair-qr');
    await expect(qr).toBeVisible();

    const link = await qr.getAttribute('data-link');
    expect(link).toMatch(/^milmil:\/\/pair\?/);
    expect(link).toContain('token=mlml_test_token');
    // The clients normalise this, but it must be the origin they can reach.
    expect(link).toContain(`url=${encodeURIComponent(new URL(page.url()).origin)}`);
    // The device name comes from the page title and has spaces in it. Form
    // encoding them as `+` gets through every URL parser the clients use and
    // lands as a literal plus in the server's name.
    expect(link).not.toContain('+');
    expect(link).toContain('%20');
  });

  test('offers the same link to the app on this machine', async ({ page }) => {
    await page.getByTestId('pair-start').click();
    const open = page.getByTestId('pair-open-in-app');
    await expect(open).toHaveAttribute('href', /^milmil:\/\/pair\?/);
  });
});

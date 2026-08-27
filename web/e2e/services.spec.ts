import { expect, type Page, test } from '@playwright/test';

const NOW = new Date().toISOString();

function service(overrides: Record<string, unknown>) {
  return {
    kind: 'worker',
    enabled: true,
    controllable: true,
    runnable: true,
    running: false,
    interval_seconds: 300,
    last_run_at: NOW,
    last_duration_ms: 800,
    last_error: '',
    next_run_at: null,
    summary: '',
    extra: null,
    ...overrides,
  };
}

const SERVICES = [
  service({
    id: 'jellyfin',
    kind: 'api',
    name: 'Jellyfin API',
    runnable: false,
    interval_seconds: null,
    extra: {
      address: 'http://10.0.0.5:18080/jellyfin',
      discovery_enabled: true,
      discovery_port: 7359,
      device_count: 1,
    },
  }),
  service({ id: 'worker.rss_refresh', name: 'rss_refresh', summary: '1 feed' }),
  service({
    id: 'worker.library_reconcile',
    name: 'library_reconcile',
    interval_seconds: 3600,
    last_error: 'scan failed',
  }),
  service({
    id: 'downloader',
    kind: 'daemon',
    name: 'aria2',
    controllable: false,
    runnable: false,
    interval_seconds: null,
    summary: 'connected · 1.37',
  }),
];

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

async function setupApiMocks(page: Page, calls: { runs: string[]; patches: string[] }) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ id: 'user-1', username: 'testuser' }) })
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ initialized: true }) })
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
  await page.route('**/api/v1/system/services**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path.endsWith('/jellyfin/devices')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          devices: [
            {
              device_id: 'atv-1',
              client: 'Infuse',
              device_name: 'Apple TV',
              first_seen: NOW,
              last_seen: NOW,
              revoked: false,
            },
          ],
        }),
      });
    }
    if (method === 'POST' && path.endsWith('/run')) {
      calls.runs.push(path);
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"started":true}',
      });
    }
    if (method === 'PATCH') {
      calls.patches.push(`${path} ${route.request().postData() ?? ''}`);
      const id = path.split('/').pop() ?? '';
      const svc = SERVICES.find((s) => s.id === id) ?? SERVICES[1];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...svc, ...JSON.parse(route.request().postData() ?? '{}') }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        services: SERVICES,
        system: { version: '0.1.17', uptime_seconds: 3600, started_at: NOW },
      }),
    });
  });
}

test.describe('Settings › Services', () => {
  const calls = { runs: [] as string[], patches: [] as string[] };

  test.beforeEach(async ({ page }) => {
    calls.runs.length = 0;
    calls.patches.length = 0;
    await setupApiMocks(page, calls);
    await page.goto('/');
    await setupAuth(page);
    await page.goto('/settings?tab=services');
  });

  test('lists services with the failing worker first and the Jellyfin address', async ({
    page,
  }) => {
    await expect(page.getByTestId('jellyfin-address')).toHaveText('http://10.0.0.5:18080/jellyfin');
    const rows = page.locator('[data-testid="services-workers"] [data-testid^="service-worker."]');
    await expect(rows.first()).toHaveAttribute('data-testid', 'service-worker.library_reconcile');
    await expect(rows.first()).toContainText('scan failed');
    await expect(page.getByTestId('jellyfin-devices')).toContainText('Infuse');
  });

  test('run now and enable toggle hit the API', async ({ page }) => {
    const row = page.getByTestId('service-worker.rss_refresh');
    await row.getByRole('button').first().click();
    await expect.poll(() => calls.runs).toContain('/api/v1/system/services/worker.rss_refresh/run');

    await row.getByRole('switch').click();
    await expect
      .poll(() => calls.patches.join('\n'))
      .toContain('/api/v1/system/services/worker.rss_refresh {"enabled":false}');
  });
});

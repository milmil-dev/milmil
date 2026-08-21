import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // builtin-torrent.spec.ts drives a real API on :8080 and signs in with
  // hardcoded local credentials, so it cannot run anywhere but a developer's
  // own machine. Opt in with MILMIL_E2E_LIVE=1; every other spec stubs the API
  // with page.route and needs nothing but the dev server.
  testIgnore: process.env.MILMIL_E2E_LIVE ? [] : ['**/builtin-torrent.spec.ts'],
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: true,
    // A cold Vite start on CI runners is a good deal slower than on a warm
    // developer machine.
    timeout: 120_000,
  },
});

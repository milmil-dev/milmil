import { defineConfig, devices } from '@playwright/test';

// Vite's default 5173 is shared with every other Vite project on the machine,
// and reuseExistingServer means Playwright will happily adopt whichever one is
// already listening. That is not hypothetical: a full run once executed
// against a different app's dev server and reported dozens of failures that
// had nothing to do with this codebase. Pin a milmil-specific port and make
// Vite refuse to drift off it.
const PORT = process.env.PLAYWRIGHT_PORT ?? '5273';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // builtin-torrent.spec.ts drives a real API on :8080 and signs in with
  // hardcoded local credentials, so it cannot run anywhere but a developer's
  // own machine. Opt in with MILMIL_E2E_LIVE=1; every other spec stubs the API
  // with page.route and needs nothing but the dev server.
  testIgnore: process.env.MILMIL_E2E_LIVE ? [] : ['**/builtin-torrent.spec.ts'],
  fullyParallel: true,
  // The specs lean heavily on fixed waitForTimeout sleeps (80 in
  // auto-download.spec.ts alone) rather than waiting on state. On a CI runner
  // Vite compiles each route on first request, so those budgets occasionally
  // expire before the page is ready. Retries absorb that cold-start variance;
  // a test that only passes on a retry is still reported as flaky, so this
  // hides nothing. Removing the sleeps is the real fix.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `bun dev --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Never adopt a stray server in CI; locally, reuse is still convenient now
    // that the port is ours alone.
    reuseExistingServer: !process.env.CI,
    // A cold Vite start on CI runners is a good deal slower than on a warm
    // developer machine.
    timeout: 120_000,
  },
});

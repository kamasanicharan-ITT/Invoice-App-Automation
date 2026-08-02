import { defineConfig, devices } from '@playwright/test';

/**
 * Role-based storageState (gitignored under auth/):
 * - auth/admin.json — BDU + app admin (org-wide Dashboard counts)
 * - auth/pm.json    — Invoice application basic user 2.0 (user-scoped counts)
 *
 * Capture:
 *   npx playwright open --save-storage=auth/admin.json "<APP_URL>"
 *   npx playwright open --save-storage=auth/pm.json "<APP_URL>"
 *
 * Run:
 *   npx playwright test tests/dashboard.spec.ts --project=chromium-admin
 *   npx playwright test tests/dashboard.spec.ts --project=chromium-pm
 *   npx playwright test tests/dashboard.spec.ts --project=chromium-admin --project=chromium-pm
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  retries: 1,
  fullyParallel: false,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    headless: false,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // Default alias → admin (keeps bare `npx playwright test` / MCP chromium runs working)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'auth/admin.json' },
    },
    {
      name: 'chromium-admin',
      use: { ...devices['Desktop Chrome'], storageState: 'auth/admin.json' },
    },
    {
      name: 'chromium-pm',
      use: { ...devices['Desktop Chrome'], storageState: 'auth/pm.json' },
    },
  ],
});

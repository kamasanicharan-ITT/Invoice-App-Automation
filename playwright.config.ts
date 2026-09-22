import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';

/**
 * Multi-env + role-based storageState (gitignored under auth/):
 *   ENV=dev|sit|qa|uat (default dev; prod forbidden — see config/env.ts)
 *   admin — your account (BDU + Security Roles admin) → auth/<env>/admin.json
 *   pm    — teammate (Basic User 2.0)                → auth/<env>/pm.json
 *
 * Capture (example SIT — files go directly under auth/sit, not a nested auth folder):
 *   mkdir auth\sit
 *   npx playwright open --save-storage=auth/sit/admin.json "<SIT_APP_URL>"
 *   npx playwright open --save-storage=auth/sit/pm.json "<SIT_APP_URL>"
 *
 * Run:
 *   npx playwright test --project=chromium-admin
 *   $env:ENV="sit"; npx playwright test --project=chromium-admin
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  retries: 1,
  fullyParallel: false,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    // Raw Allure files. The pipeline turns this folder into one HTML file
    // (see allurerc.json) and publishes it as an artifact. A later Azure
    // DevOps extension can publish the same folder as an in-run tab.
    ['allure-playwright', {
      resultsDir: 'allure-results',
      environmentInfo: {
        ENV: process.env.ENV ?? 'dev',
        App: 'Invoice Canvas',
      },
    }],
  ],

  // Azure Pipelines / any CI sets CI=true. Agents have no UI — must be headless.
  // Local runs stay headed so you can watch the Canvas app.
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: env.appUrl,
    headless: !!process.env.CI,
    // Overview ⋮ / Next Step sit on the far right — narrow viewports clip them.
    viewport: { width: 1920, height: 1080 },
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // Role-only cases are tagged @admin / @pm in the test title so they are
    // not even scheduled on the other persona (no skip noise in the report).
    // Shared cases have neither tag and run on both.
    // viewport AFTER Desktop Chrome — device preset is 1280x720 and clips Overview ⋮.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: env.authAdmin,
      },
      grepInvert: /@pm\b/,
    },
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: env.authAdmin,
      },
      grepInvert: /@pm\b/,
    },
    {
      name: 'chromium-pm',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: env.authPm,
      },
      grepInvert: /@admin\b/,
    },
  ],
});

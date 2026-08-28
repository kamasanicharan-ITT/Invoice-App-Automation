import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';

/**
 * Multi-env + role-based storageState (gitignored under auth/):
 *   ENV=dev|sit|qa|uat (default dev; prod forbidden — see config/env.ts)
 *   admin — your account (BDU + Security Roles admin) → auth/<env>/admin.json
 *   pm    — teammate (Basic User 2.0)                → auth/<env>/pm.json
 *   DEV also accepts legacy auth/admin.json + auth/pm.json
 *
 * Capture (example SIT):
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

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: env.appUrl,
    headless: false,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // Default alias → admin (bare `npx playwright test` / MCP chromium)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: env.authAdmin },
    },
    {
      name: 'chromium-admin',
      use: { ...devices['Desktop Chrome'], storageState: env.authAdmin },
    },
    {
      name: 'chromium-pm',
      use: { ...devices['Desktop Chrome'], storageState: env.authPm },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  fullyParallel: false,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    headless: false,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    storageState: 'auth.json',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
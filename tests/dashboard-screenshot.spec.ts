import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { markAndShot, shot } from './utils/screenshot';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

async function openDashboard(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  return appFrame;
}

/**
 * Waits until the dashboard has fully rendered its data-driven sections so screenshots
 * capture real values, not a half-loaded screen.
 */
async function waitForDashboardReady(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Region', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 30000 });
  // The task counts populate last; wait for a real numeric count before capturing.
  await expect(appFrame.getByText(/\d+\s*Total\s*Tasks/).first()).toBeVisible({ timeout: 30000 });
}

test.describe('Dashboard screenshots', () => {
  test('marks each Invoice Tasks status row on a full dashboard screenshot', async ({ page }, testInfo) => {
    const appFrame = await openDashboard(page);
    await waitForDashboardReady(appFrame);

    await test.step('Dashboard overview', async () => {
      await shot(page, 'Dashboard overview', testInfo);
    });

    const statusCases = [
      { name: 'Total Tasks count', regex: /\d+\s*Total\s*Tasks/ },
      { name: 'Draft count', regex: /\d+\s*Drafts?/ },
      { name: 'Flagged count', regex: /\d+\s*Flagged/ },
      { name: 'Submitted count', regex: /\d+\s*Submitted/ },
      { name: 'Reviewed count', regex: /\d+\s*Reviewed/ },
      { name: 'Approved count', regex: /\d+\s*Approved/ },
      { name: 'Failed count', regex: /\d+\s*Failed/ },
      { name: 'Cancelled count', regex: /\d+\s*Cancelled/ },
      { name: 'Sent count', regex: /\d+\s*Sent/ },
    ];

    for (const statusCase of statusCases) {
      await test.step(statusCase.name, async () => {
        const row = appFrame.getByText(statusCase.regex).first();
        await expect(row).toBeVisible({ timeout: 20000 });
        await markAndShot(page, row, statusCase.name, testInfo);
      });
    }
  });
});

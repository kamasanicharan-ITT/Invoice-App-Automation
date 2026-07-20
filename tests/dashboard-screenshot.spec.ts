import { test, expect, type Page, type FrameLocator, type TestInfo, type Locator } from '@playwright/test';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

async function openDashboard(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });

  return appFrame;
}

async function waitForDashboardReady(page: Page, appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Region', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(4000);
}

async function markAndCapture(testInfo: TestInfo, locator: Locator, name: string): Promise<void> {
  await locator.evaluate((element: HTMLElement, label: string) => {
    const existing = document.getElementById('__pw-marker-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = '__pw-marker-overlay';

    const rect = element.getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.border = '3px solid #ff9800';
    overlay.style.background = 'rgba(255, 152, 0, 0.16)';
    overlay.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.18)';
    overlay.style.zIndex = '999999';
    overlay.style.pointerEvents = 'none';

    const badge = document.createElement('div');
    badge.textContent = label;
    badge.style.position = 'absolute';
    badge.style.top = '-28px';
    badge.style.left = '0';
    badge.style.background = '#ff9800';
    badge.style.color = 'white';
    badge.style.padding = '4px 8px';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = 'bold';
    badge.style.borderRadius = '4px';
    badge.style.whiteSpace = 'nowrap';
    overlay.appendChild(badge);

    document.body.appendChild(overlay);
  }, name);

  const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const path = testInfo.outputPath(fileName);

  await locator.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });

  await locator.evaluate(() => {
    const existing = document.getElementById('__pw-marker-overlay');
    if (existing) {
      existing.remove();
    }
  });
}

test.describe('Dashboard screenshots', () => {
  test('marks each Dataverse status row after the dashboard finishes loading', async ({ page }, testInfo) => {
    const appFrame = await openDashboard(page);
    await waitForDashboardReady(page, appFrame);

    await test.step('Capture dashboard overview', async () => {
      const overview = appFrame.locator('body');
      await expect(overview).toBeVisible();
      await markAndCapture(testInfo, overview, 'Dashboard overview');
    });

    const statusCases = [
      { name: 'Draft count', regex: /\d+\s*Drafts?/ },
      { name: 'Submitted count', regex: /\d+\s*Submitted/ },
      { name: 'Reviewed count', regex: /\d+\s*Reviewed/ },
      { name: 'Approved count', regex: /\d+\s*Approved/ },
      { name: 'Flagged count', regex: /\d+\s*Flagged/ },
      { name: 'Failed count', regex: /\d+\s*Failed/ },
      { name: 'Cancelled count', regex: /\d+\s*Cancelled/ },
      { name: 'Sent count', regex: /\d+\s*Sent/ },
    ];

    for (const statusCase of statusCases) {
      await test.step(statusCase.name, async () => {
        const row = appFrame.getByText(statusCase.regex).first();
        await expect(row).toBeVisible({ timeout: 20000 });
        await row.scrollIntoViewIfNeeded();
        await markAndCapture(testInfo, row, statusCase.name);
      });
    }
  });
});

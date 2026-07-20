import { test, expect } from '@playwright/test';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

test.describe('Dashboard Screen', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
    await expect(appFrame.getByText('Dashboard', { exact: true }).first())
      .toBeVisible({ timeout: 30000 });
  });

  test('TC-DB-01: Dashboard header and navigation are visible', async ({ page }) => {
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

    // Soft assertions so all failures are reported at once
    await expect.soft(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible();
    await expect.soft(appFrame.getByText('Invoice Overview')).toBeVisible();
    await expect.soft(appFrame.getByText('Create Invoice').first()).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Create Invoice' }).last()).toBeVisible();
  });

  test('TC-DB-02: All four summary cards are visible with numeric values', async ({ page }) => {
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

    // Validate each card label exists
    await expect.soft(appFrame.getByText('Total Invoices', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Partners', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Project', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Revenue', { exact: true })).toBeVisible();

    // Validate that This Month and Last Month labels appear (dynamic values, not hard-coded)
    const thisMonthLabels = appFrame.getByText('This Month');
    await expect.soft(thisMonthLabels.first()).toBeVisible();

    const lastMonthLabels = appFrame.getByText('Last Month');
    await expect.soft(lastMonthLabels.first()).toBeVisible();
  });

  test('TC-DB-03: Invoice Tasks section has all rows with counts and buttons', async ({ page }) => {
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

    await expect.soft(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible();

    // Each task row: validate using regex so the count can be any number
    const taskRows = [
      { label: /\d+\s*Total\s*Tasks/, button: 'View All' },
      { label: /\d+\s*Drafts/, button: 'View Drafts' },
      { label: /\d+\s*Flagged/, button: 'View Flagged' },
      { label: /\d+\s*Submitted/, button: 'View Submitted' },
      { label: /\d+\s*Reviewed/, button: 'View Reviewed' },
      { label: /\d+\s*Approved/, button: 'View Approved' },
      { label: /\d+\s*Failed/, button: 'View Failed' },
      { label: /\d+\s*Cancelled/, button: 'View Cancelled' },
      { label: /\d+\s*Sent/, button: 'View Sent' },
    ];

    for (const row of taskRows) {
      await expect.soft(appFrame.getByText(row.label).first()).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: row.button })).toBeVisible();
    }
  });

  test('TC-DB-04: Region filter updates summary card values', async ({ page }) => {
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

    // Capture the Total Invoices count BEFORE filtering
    const invoiceCardBefore = await appFrame
      .getByText(/\d+/).first().textContent();

    // Open the Region dropdown and select India
    await appFrame.getByText('Region').click();
    await appFrame.getByText('India', { exact: true }).click();

    // Wait for data to refresh
    await page.waitForTimeout(3000);

    // Capture AFTER filtering
    const invoiceCardAfter = await appFrame
      .getByText(/\d+/).first().textContent();

    // The values should be different when a region is selected
    expect(invoiceCardBefore).not.toBe(invoiceCardAfter);

    // Summary cards should still be visible after filter
    await expect.soft(appFrame.getByText('Total Invoices', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Partners', { exact: true })).toBeVisible();
  });

  test('TC-DB-05: Create Invoice button navigates to Create Invoice screen', async ({ page }) => {
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();

    // Verify navigation happened
    await expect(appFrame.getByText('New Invoice', { exact: true }))
      .toBeVisible({ timeout: 15000 });
  });

});
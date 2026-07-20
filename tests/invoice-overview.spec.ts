import { test, expect } from '@playwright/test';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

async function navigateToInvoiceOverview(page) {
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await appFrame.getByRole('button', { name: 'Invoice Overview' }).first().click();
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({ timeout: 30000 });
  return appFrame;
}

test.describe('Invoice Overview Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
  });

  test('TC-IO-01: Invoice Overview loads with expected controls and table layout', async ({ page }) => {
    const appFrame = await navigateToInvoiceOverview(page);

    await expect.soft(appFrame.getByRole('button', { name: 'Invoice Overview' })).toBeVisible();
    await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Region', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'This Month' })).toBeVisible();
    await expect.soft(appFrame.getByPlaceholder('Search')).toBeVisible();

    await expect.soft(appFrame.getByText('Partner', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Project', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Invoice #', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Action Pending with', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Status', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Next Step', { exact: true })).toBeVisible();

    await expect.soft(appFrame.getByText(/^Item\s*\d+/, { exact: false }).first()).toBeVisible();
    await expect.soft(appFrame.getByText(/^1$/, { exact: true }).first()).toBeVisible();
    await expect.soft(appFrame.getByText(/^2$/, { exact: true }).first()).toBeVisible();
    await expect.soft(appFrame.getByText(/^3$/, { exact: true }).first()).toBeVisible();
  });

  test('TC-IO-02: Invoice Overview switches between My Invoices and All Invoices', async ({ page }) => {
    const appFrame = await navigateToInvoiceOverview(page);

    const myInvoicesRadio = appFrame.getByRole('radio', { name: 'My Invoices' }).first();
    const allInvoicesRadio = appFrame.getByRole('radio', { name: 'All Invoices' }).first();

    await expect.soft(myInvoicesRadio).toBeVisible();
    await expect.soft(allInvoicesRadio).toBeVisible();

    await allInvoicesRadio.check();
    await page.waitForTimeout(3000);
    await expect.soft(allInvoicesRadio).toBeChecked();
    await expect.soft(appFrame.getByText(/^Item\s*\d+/, { exact: false }).first()).toBeVisible();

    await myInvoicesRadio.check();
    await page.waitForTimeout(3000);
    await expect.soft(myInvoicesRadio).toBeChecked();
    await expect.soft(appFrame.getByText(/^Item\s*\d+/, { exact: false }).first()).toBeVisible();
  });

  test('TC-IO-03: Filter and refresh behavior on Invoice Overview', async ({ page }) => {
    const appFrame = await navigateToInvoiceOverview(page);

    await expect.soft(appFrame.getByText('Region', { exact: true })).toBeVisible();
    const regionTarget = appFrame.locator('xpath=//div[normalize-space(text())="Region"]/following::button[normalize-space(text())="."][1]');
    await expect.soft(regionTarget).toBeVisible({ timeout: 10000 });
    await regionTarget.click();

    const regionMenuItem = appFrame.locator('xpath=//*[normalize-space(text())="Australia" or normalize-space(text())="India" or normalize-space(text())="North America" or normalize-space(text())="UAE" or normalize-space(text())="Saudi Arabia"]').first();
    await expect(regionMenuItem).toBeVisible({ timeout: 10000 });
    await regionMenuItem.click();

    await page.waitForTimeout(3000);
    await expect.soft(appFrame.getByText('Region', { exact: true })).toBeVisible();

    const refreshButton = appFrame.locator('xpath=//*[contains(normalize-space(text()), "Refresh")][1]');
    if (await refreshButton.count() > 0) {
      await refreshButton.click();
      await page.waitForTimeout(3000);
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
    } else {
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
    }
  });

  test('TC-IO-04: Invoice row actions and status labels are visible', async ({ page }) => {
    const appFrame = await navigateToInvoiceOverview(page);

    const reviewAction = appFrame.locator('xpath=//button[.//div[normalize-space(text())="Review"]][1]');
    const reportAction = appFrame.locator('xpath=//button[.//div[normalize-space(text())="Report"]][1]');

    await expect.soft(reviewAction).toBeVisible({ timeout: 10000 });
    await expect.soft(reportAction).toBeVisible({ timeout: 10000 });

    const actionToClick = (await reviewAction.count()) > 0 ? reviewAction : reportAction;
    if (await actionToClick.count() > 0) {
      await actionToClick.click();
      await page.waitForTimeout(3000);
      await expect.soft(page).toHaveURL(/apps\.powerapps\.com/);
    }
  });
});

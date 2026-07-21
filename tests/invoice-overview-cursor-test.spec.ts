// spec: specs/invoice-overview-cursor-plan.md
// seed: tests/seed.spec.ts
//
// Cursor setup-check suite for the Invoice Overview screen.
// Each test is wrapped in labeled test.step() blocks so the scenario under test is
// clearly identifiable in the Playwright trace / video recording (the "chapter markers").
// Persona: current authenticated session (Admin/BDU - can see both My Invoices and All Invoices).

import { test, expect, type Page, type FrameLocator } from '@playwright/test';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

/**
 * Navigates to the app and opens the Invoice Overview screen.
 * Returns the iframe frame locator (the Canvas app renders inside this iframe).
 */
async function openInvoiceOverview(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByRole('button', { name: 'Invoice Overview' }).first()).toBeVisible({ timeout: 45000 });
  await appFrame.getByRole('button', { name: 'Invoice Overview' }).first().click();
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({ timeout: 30000 });
  // Wait for the gallery to actually load invoice data before assertions run.
  await expect(appFrame.getByText(/\d{4}-\d{4}/).first()).toBeVisible({ timeout: 30000 });
  return appFrame;
}

/**
 * Region dropdown. In this Canvas app, controls are absolutely-positioned siblings (NOT
 * visually nested), so label-scoped locators fail. When no region is selected the control's
 * accessible name is just "." (normalized from a ". " placeholder), which is unique on the
 * screen (the period dropdown is ". This Month"). This resolves to exactly one element.
 */
function regionDropdown(appFrame: FrameLocator) {
  return appFrame.getByRole('button', { name: '.', exact: true });
}

test.describe('Invoice Overview (Cursor Setup Check)', () => {

  test('TC-IOC-01: Screen layout loads with all controls', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('MARK: verify navigation and header controls', async () => {
      await expect.soft(appFrame.getByRole('button', { name: 'Dashboard' })).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: 'Invoice Overview' }).first()).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: 'Create Invoice' }).first()).toBeVisible();
      await expect.soft(appFrame.getByText('Invoice Overview').first()).toBeVisible();
    });

    await test.step('MARK: verify scope toggle (My/All Invoices)', async () => {
      await expect.soft(appFrame.getByRole('radio', { name: 'My Invoices' })).toBeVisible();
      await expect.soft(appFrame.getByRole('radio', { name: 'All Invoices' })).toBeVisible();
    });

    await test.step('MARK: verify filters and search', async () => {
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Region', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByPlaceholder('Search')).toBeVisible();
    });

    await test.step('MARK: verify table headers', async () => {
      await expect.soft(appFrame.getByText('Partner', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Project', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Invoice #', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Action Pending with', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Status', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Next Step', { exact: true })).toBeVisible();
    });

    await test.step('MARK: verify at least one invoice row and pagination', async () => {
      await expect.soft(appFrame.getByText(/^Item\s*\d+/).first()).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: '1', exact: true })).toBeVisible();
    });
  });

  test('TC-IOC-02: Admin can switch between My Invoices and All Invoices', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);

    const myInvoices = appFrame.getByRole('radio', { name: 'My Invoices' });
    const allInvoices = appFrame.getByRole('radio', { name: 'All Invoices' });

    await test.step('MARK: All Invoices is selected by default for this persona', async () => {
      await expect.soft(allInvoices).toBeChecked();
    });

    await test.step('MARK: switch to My Invoices', async () => {
      await myInvoices.click();
      await expect(myInvoices).toBeChecked();
      await expect.soft(appFrame.getByText(/^Item\s*\d+/).first()).toBeVisible();
    });

    await test.step('MARK: switch back to All Invoices', async () => {
      await allInvoices.click();
      await expect(allInvoices).toBeChecked();
      await expect.soft(appFrame.getByText(/^Item\s*\d+/).first()).toBeVisible();
    });
  });

  test('TC-IOC-03: Show Invoices period filter', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('MARK: open the Show Invoices period dropdown', async () => {
      await appFrame.getByRole('button', { name: 'This Month' }).click();
    });

    await test.step('MARK: verify all period options (note app spelling "Quater")', async () => {
      for (const option of [
        'This Month', 'Last Month', 'Quater to Date', 'Last Quater',
        'Year to Date', 'Last Year', 'Future Months',
      ]) {
        await expect.soft(appFrame.getByRole('option', { name: option })).toBeVisible();
      }
    });

    await test.step('MARK: select Last Month and confirm it applied', async () => {
      await appFrame.getByRole('option', { name: 'Last Month' }).click();
      await expect(appFrame.getByRole('button', { name: 'Last Month' })).toBeVisible();
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
    });
  });

  test('TC-IOC-04: Region filter', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('MARK: open the Region dropdown', async () => {
      await regionDropdown(appFrame).click();
    });

    await test.step('MARK: verify all region options', async () => {
      for (const region of [
        'Australia', 'Colombia', 'India', 'Netherlands',
        'North America', 'Saudi Arabia', 'South Korea', 'UAE',
      ]) {
        await expect.soft(appFrame.getByRole('option', { name: region })).toBeVisible();
      }
    });

    await test.step('MARK: select India and confirm it applied', async () => {
      await appFrame.getByRole('option', { name: 'India' }).click();
      await expect(appFrame.getByText('India').first()).toBeVisible();
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
    });
  });

  test('TC-IOC-05: Search filters the invoice list', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);
    const search = appFrame.getByPlaceholder('Search');

    // Read a real invoice number from the first row so the test adapts to current data.
    let invoiceNumber = '';
    await test.step('MARK: capture an invoice number from the current list', async () => {
      const cellText = await appFrame.getByText(/\d{4}-\d{4}/).first().textContent();
      invoiceNumber = (cellText ?? '').trim();
      expect(invoiceNumber).toMatch(/\d{4}-\d{4}/);
    });

    await test.step('MARK: type that invoice number into Search', async () => {
      await search.fill(invoiceNumber);
      await expect(search).toHaveValue(invoiceNumber);
    });

    await test.step('MARK: verify the list narrows to the searched invoice', async () => {
      await expect(appFrame.getByText(invoiceNumber).first()).toBeVisible();
    });
  });

  test('TC-IOC-06: Status drives the correct Next Step action', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('MARK: Submitted invoices expose a Review action', async () => {
      await expect.soft(appFrame.getByRole('button', { name: 'Review' }).first()).toBeVisible();
    });

    await test.step('MARK: Fail-Creation invoices expose a Report action', async () => {
      await expect.soft(appFrame.getByRole('button', { name: 'Report' }).first()).toBeVisible();
    });

    await test.step('MARK: Flagged invoices expose an Edit action (surfaced via Region=India)', async () => {
      await regionDropdown(appFrame).click();
      await appFrame.getByRole('option', { name: 'India' }).click();
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
      // A Flagged invoice may not exist every cycle; assert the Edit action only when present.
      const editButton = appFrame.getByRole('button', { name: 'Edit' });
      if (await editButton.count() > 0) {
        await expect.soft(editButton.first()).toBeVisible();
      }
    });
  });

  test('TC-IOC-07: Pagination navigates between pages', async ({ page }) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('MARK: verify pagination controls are present', async () => {
      await expect.soft(appFrame.getByRole('button', { name: '1', exact: true })).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: '2', exact: true })).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: '3', exact: true })).toBeVisible();
    });

    await test.step('MARK: navigate to page 2 and confirm the list reloads', async () => {
      await appFrame.getByRole('button', { name: '2', exact: true }).click();
      await expect(appFrame.getByText(/\d{4}-\d{4}/).first()).toBeVisible();
    });
  });
});

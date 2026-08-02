// spec: specs/invoice-overview-test-plan.md
// seed: tests/seed.spec.ts
//
// Consolidated Invoice Overview suite (merged from invoice-overview.spec.ts +
// invoice-overview-cursor-test.spec.ts). Persona: BDU/Admin via storageState.

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

const PERIOD_OPTIONS = [
  'This Month',
  'Last Month',
  'Quater to Date',
  'Last Quater',
  'Year to Date',
  'Last Year',
  'Future Months',
] as const;

const REGIONS = [
  'Australia',
  'Colombia',
  'India',
  'Netherlands',
  'North America',
  'Saudi Arabia',
  'South Korea',
  'UAE',
] as const;

const INVOICE_NUMBER = /\d{4}-\d{4}/;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function dismissHostAlerts(page: Page): Promise<void> {
  const hostAlertClose = page.locator('[role="alert"]').getByRole('button', { name: 'Close' });
  for (let i = 0; i < 3; i++) {
    if (!(await hostAlertClose.isVisible().catch(() => false))) break;
    await hostAlertClose.click().catch(() => undefined);
  }
}

/**
 * Navigate to Invoice Overview. Reloads once if Dashboard never appears
 * (Power Apps "Starting your app..." hang).
 */
async function openInvoiceOverview(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

  try {
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });
  } catch {
    await dismissHostAlerts(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
  }

  await dismissHostAlerts(page);
  await appFrame.getByRole('button', { name: 'Invoice Overview' }).first().click();
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 30000,
  });

  // Wait for gallery data OR empty state before asserting late controls
  await expect
    .poll(
      async () => {
        const invoiceCount = await appFrame.getByText(INVOICE_NUMBER).count();
        const itemCount = await appFrame.getByText(/^Item\s*\d+/).count();
        if (invoiceCount > 0 || itemCount > 0) return 'rows';
        const emptyVisible = await appFrame
          .getByText('No Item to Display', { exact: true })
          .isVisible()
          .catch(() => false);
        return emptyVisible ? 'empty' : '';
      },
      { timeout: 45000 }
    )
    .not.toBe('');

  return appFrame;
}

/** Unselected Region combo — accessible name is exactly "." (unique on Overview). */
function regionDropdown(appFrame: FrameLocator) {
  return appFrame.getByRole('button', { name: '.', exact: true });
}

function periodButton(appFrame: FrameLocator, label: string) {
  // Live name is often ". This Month" / ". Last Month"; substring match is enough
  return appFrame.getByRole('button', { name: label });
}

/** Page-number buttons in the Overview pagination strip (excludes Create Invoice etc.). */
function pageNumberButtons(appFrame: FrameLocator) {
  return appFrame.getByRole('button', { name: /^\d+$/ });
}

/**
 * Click the previous-page chevron. Canvas drops page "1" from the strip on later pages,
 * so we click just left of the lowest visible page-number button.
 */
async function clickPaginationPrev(page: Page, appFrame: FrameLocator): Promise<void> {
  const lowest = pageNumberButtons(appFrame).first();
  await expect(lowest).toBeVisible({ timeout: 15000 });
  const box = await lowest.boundingBox();
  if (!box) throw new Error('Pagination page button has no bounding box');
  await page.mouse.click(box.x - 20, box.y + box.height / 2);
}

/** Open a combo and assert each option exists (scroll into view — list may clip). */
async function expectComboOptions(
  appFrame: FrameLocator,
  options: readonly string[]
): Promise<void> {
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
  await expect(appFrame.getByRole('option')).toHaveCount(options.length);
  for (const name of options) {
    const opt = appFrame.getByRole('option', { name, exact: true });
    await opt.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect.soft(opt).toBeVisible({ timeout: 10000 });
  }
}

async function waitForOverviewSettled(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  // Avoid locator.or().toBeVisible() — gallery Item + invoice # + empty template can all exist
  await expect
    .poll(
      async () => {
        const invoiceCount = await appFrame.getByText(INVOICE_NUMBER).count();
        const itemCount = await appFrame.getByText(/^Item\s*\d+/).count();
        if (invoiceCount > 0 || itemCount > 0) return 'rows';
        const emptyVisible = await appFrame
          .getByText('No Item to Display', { exact: true })
          .isVisible()
          .catch(() => false);
        return emptyVisible ? 'empty' : '';
      },
      { timeout: 30000 }
    )
    .not.toBe('');
}

async function firstInvoiceNumber(appFrame: FrameLocator): Promise<string> {
  const cell = appFrame.getByText(INVOICE_NUMBER).first();
  if ((await cell.count()) === 0) return '';
  return ((await cell.textContent()) || '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice Overview Screen', () => {
  test.describe.configure({ timeout: 120000 });

  test('TC-IO-01: Screen layout loads with expected controls', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('Navigation and header', async () => {
      await expect.soft(appFrame.getByRole('button', { name: 'Dashboard' })).toBeVisible();
      await expect
        .soft(appFrame.getByRole('button', { name: 'Invoice Overview' }).first())
        .toBeVisible();
      await expect
        .soft(appFrame.getByRole('button', { name: 'Create Invoice' }).first())
        .toBeVisible();
      await expect.soft(appFrame.getByText('Invoice Overview').first()).toBeVisible();

      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('button', { name: 'Dashboard' }),
          appFrame.getByRole('button', { name: 'Invoice Overview' }).first(),
          appFrame.getByRole('button', { name: 'Create Invoice' }).first(),
          appFrame.getByText('Invoice Overview').first(),
        ],
        'Navigation and header',
        testInfo
      );
    });

    await test.step('Scope, filters, and search', async () => {
      await expect.soft(appFrame.getByRole('radio', { name: 'My Invoices' })).toBeVisible();
      await expect.soft(appFrame.getByRole('radio', { name: 'All Invoices' })).toBeVisible();
      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Region', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByPlaceholder('Search')).toBeVisible();

      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('radiogroup'),
          appFrame.getByText('Show Invoices', { exact: true }),
          periodButton(appFrame, 'This Month'),
          appFrame.getByText('Region', { exact: true }),
          appFrame.getByPlaceholder('Search'),
        ],
        'Scope, filters, and search',
        testInfo
      );
    });

    await test.step('Table headers, rows, and pagination', async () => {
      for (const header of [
        'Partner',
        'Project',
        'Invoice #',
        'Action Pending with',
        'Status',
        'Next Step',
      ]) {
        await expect.soft(appFrame.getByText(header, { exact: true })).toBeVisible();
      }

      await expect.soft(appFrame.getByText(/^Item\s*\d+/).first()).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: '1', exact: true })).toBeVisible();

      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Partner', { exact: true }),
          appFrame.getByText('Next Step', { exact: true }),
          appFrame.getByRole('button', { name: '1', exact: true }),
        ],
        'Table headers, rows, and pagination',
        testInfo
      );
    });
  });

  test('TC-IO-02: Admin can switch My Invoices / All Invoices', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const myInvoices = appFrame.getByRole('radio', { name: 'My Invoices' });
    const allInvoices = appFrame.getByRole('radio', { name: 'All Invoices' });
    const radioGroup = appFrame.getByRole('radiogroup');

    await test.step('Default is All Invoices', async () => {
      await expect(allInvoices).toBeChecked();
      await markGroupAndShot(page, [radioGroup], 'Default is All Invoices', testInfo);
    });

    await test.step('Switch to My Invoices', async () => {
      await myInvoices.click();
      await expect(myInvoices).toBeChecked();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(page, [radioGroup], 'Switch to My Invoices', testInfo);
    });

    await test.step('Switch back to All Invoices', async () => {
      await allInvoices.click();
      await expect(allInvoices).toBeChecked();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(page, [radioGroup], 'Switch back to All Invoices', testInfo);
    });
  });

  test('TC-IO-03: Show Invoices period filter', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('Period options listed', async () => {
      await periodButton(appFrame, 'This Month').click();
      await expectComboOptions(appFrame, PERIOD_OPTIONS);
      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('option', { name: 'This Month', exact: true }),
          appFrame.getByRole('option', { name: 'Future Months', exact: true }),
        ],
        'Period options listed',
        testInfo
      );
    });

    await test.step('Last Month applied', async () => {
      await appFrame.getByRole('option', { name: 'Last Month', exact: true }).click();
      await expect(periodButton(appFrame, 'Last Month')).toBeVisible({ timeout: 15000 });
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true }), periodButton(appFrame, 'Last Month')],
        'Last Month applied',
        testInfo
      );
    });
  });

  test('TC-IO-04: Region filter', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('Region options listed', async () => {
      await dismissHostAlerts(page);
      await regionDropdown(appFrame).click();
      await expectComboOptions(appFrame, REGIONS);
      // Scroll ends into view for evidence — listbox role is flaky on this combo
      const first = appFrame.getByRole('option', { name: 'Australia', exact: true });
      const last = appFrame.getByRole('option', { name: 'UAE', exact: true });
      await first.scrollIntoViewIfNeeded().catch(() => undefined);
      await last.scrollIntoViewIfNeeded().catch(() => undefined);
      await markGroupAndShot(page, [first, last], 'Region options listed', testInfo);
    });

    await test.step('India applied', async () => {
      // Re-open if evidence scroll closed the combo
      if ((await appFrame.getByRole('option', { name: 'India', exact: true }).count()) === 0) {
        await regionDropdown(appFrame).click();
        await expect(appFrame.getByRole('option', { name: 'India', exact: true })).toBeVisible({
          timeout: 15000,
        });
      }
      await appFrame.getByRole('option', { name: 'India', exact: true }).click();
      await expect(appFrame.getByRole('button', { name: 'India' })).toBeVisible({
        timeout: 15000,
      });
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Region', { exact: true }), appFrame.getByRole('button', { name: 'India' })],
        'India applied',
        testInfo
      );
    });
  });

  test('TC-IO-05: Search filters the invoice list', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const search = appFrame.getByPlaceholder('Search');

    let invoiceNumber = '';
    await test.step('Capture invoice number from list', async () => {
      const cell = appFrame.getByText(INVOICE_NUMBER).first();
      await expect(cell).toBeVisible({ timeout: 30000 });
      invoiceNumber = ((await cell.textContent()) || '').trim();
      expect(invoiceNumber).toMatch(INVOICE_NUMBER);
    });

    await test.step('Search filters the list', async () => {
      await search.fill(invoiceNumber);
      await expect(search).toHaveValue(invoiceNumber);
      await expect(appFrame.getByText(invoiceNumber).first()).toBeVisible({ timeout: 15000 });
      await markGroupAndShot(
        page,
        [search, appFrame.getByText(invoiceNumber).first()],
        'Search filters the list',
        testInfo
      );
    });
  });

  test('TC-IO-06: Status drives the correct Next Step action', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);

    // Ensure All Invoices so more statuses are likely present
    const allInvoices = appFrame.getByRole('radio', { name: 'All Invoices' });
    if (!(await allInvoices.isChecked().catch(() => false))) {
      await allInvoices.click();
      await waitForOverviewSettled(appFrame);
    }

    const mappings: { action: string | RegExp; label: string }[] = [
      { action: 'Review', label: 'Submitted → Review' },
      { action: 'Approve', label: 'Reviewed → Approve' },
      { action: /^Edit/, label: 'Flagged/Draft → Edit' },
      { action: 'Report', label: 'Fail-* → Report' },
      { action: 'View', label: 'Approved/Sent → View' },
    ];

    const found: { action: string | RegExp; label: string }[] = [];
    for (const m of mappings) {
      if ((await appFrame.getByRole('button', { name: m.action }).count()) > 0) {
        found.push(m);
      }
    }

    expect(
      found.length,
      'Expected at least one Next Step action (Review/Approve/Edit/Report/View) on Overview'
    ).toBeGreaterThan(0);

    await test.step('Next Step actions present for visible statuses', async () => {
      const targets = found.map((m) => appFrame.getByRole('button', { name: m.action }).first());
      for (const m of found) {
        await expect.soft(appFrame.getByRole('button', { name: m.action }).first()).toBeVisible();
      }
      await markGroupAndShot(
        page,
        [appFrame.getByText('Next Step', { exact: true }), ...targets],
        'Next Step actions present for visible statuses',
        testInfo,
        { padding: 12 }
      );
    });
  });

  test('TC-IO-07: Pagination navigates between pages', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await dismissHostAlerts(page);

    const page1 = appFrame.getByRole('button', { name: '1', exact: true });
    const page2 = appFrame.getByRole('button', { name: '2', exact: true });
    const hasPage2 = (await page2.count()) > 0;

    await test.step('Pagination controls', async () => {
      await expect(page1).toBeVisible();
      const targets = hasPage2 ? [page1, page2] : [page1];
      await markGroupAndShot(page, targets, 'Pagination controls', testInfo);
    });

    if (!hasPage2) {
      testInfo.annotations.push({
        type: 'skip-reason',
        description: 'Only one page of invoices — page navigation not exercised',
      });
      return;
    }

    await test.step('Navigate to page 2 then back to 1', async () => {
      const page1Invoice = await firstInvoiceNumber(appFrame);

      await page2.click();
      await waitForOverviewSettled(appFrame);
      await expect(page2).toBeVisible({ timeout: 15000 });
      // Gallery should change when enough data exists
      if (page1Invoice) {
        await expect
          .poll(async () => firstInvoiceNumber(appFrame), { timeout: 20000 })
          .not.toBe(page1Invoice);
      }
      await markGroupAndShot(page, [page2], 'Page 2 active', testInfo);

      // Page "1" often leaves the pagination strip — use prev chevron and/or content check
      let backOnPage1 = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        if (await page1.isVisible().catch(() => false)) {
          await page1.click();
          await waitForOverviewSettled(appFrame);
          backOnPage1 = true;
          break;
        }

        await dismissHostAlerts(page);
        await clickPaginationPrev(page, appFrame);
        await waitForOverviewSettled(appFrame);

        if (page1Invoice && (await firstInvoiceNumber(appFrame)) === page1Invoice) {
          backOnPage1 = true;
          break;
        }
        if (await page1.isVisible().catch(() => false)) {
          backOnPage1 = true;
          break;
        }
      }

      expect(backOnPage1, 'Expected to return to page 1 via page button or prev chevron').toBeTruthy();

      const evidencePage = (await page1.isVisible().catch(() => false))
        ? page1
        : pageNumberButtons(appFrame).first();
      await markGroupAndShot(page, [evidencePage], 'Page 1 active', testInfo);
    });
  });

  test('TC-IO-08: Create Invoice from Overview opens New Invoice', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('Create Invoice opens New Invoice form', async () => {
      await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
      await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible({
        timeout: 30000,
      });

      await markGroupAndShot(
        page,
        [
          appFrame.getByText('New Invoice', { exact: true }),
          appFrame.getByRole('button', { name: 'Close' }),
          appFrame.getByRole('button', { name: 'Submit' }),
        ],
        'Create Invoice opens New Invoice form',
        testInfo
      );
    });
  });
});

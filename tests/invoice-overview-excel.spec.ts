// spec: specs/Invoice_Overview_Test_Cases.md
// seed: tests/seed.spec.ts
//
// Excel IO-001 … IO-042 on Invoice Overview. Implemented where live behaviour is
// known; skipped with specs/confusion.md ids where it is not.

import { test, expect, type FrameLocator, type TestInfo } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import { dismissHostDialogs } from './utils/host-dialogs';
import {
  GALLERY_HEADERS,
  INVOICE_NUMBER,
  PERIOD_OPTIONS,
  REGIONS,
  activePersona,
  applyPeriod,
  clickIconRightOf,
  expectComboOptions,
  firstInvoiceNumber,
  firstRowPartnerAndProject,
  openInvoiceOverview,
  overviewHasRows,
  periodButton,
  regionDropdown,
  scopeRadios,
  waitForOverviewSettled,
} from './utils/invoice-overview-ui';

async function skipIfEmpty(appFrame: FrameLocator, why: string): Promise<void> {
  test.skip(!(await overviewHasRows(appFrame)), why);
}

async function shotFilters(
  page: Parameters<typeof markGroupAndShot>[0],
  appFrame: FrameLocator,
  testInfo: TestInfo,
  extra: Parameters<typeof markGroupAndShot>[1][number],
  label: string
): Promise<void> {
  await markGroupAndShot(
    page,
    [appFrame.getByText('Show Invoices', { exact: true }), extra],
    label,
    testInfo
  );
}

test.describe('Invoice Overview Excel (IO-001 … IO-042)', () => {
  test.describe.configure({ timeout: 120000 });

  test('IO-001: Invoice Overview screen loads with all elements', async ({ page }, testInfo) => {
    const persona = activePersona(testInfo);
    const appFrame = await openInvoiceOverview(page);
    const radios = scopeRadios(appFrame);

    await test.step('Filters, search, columns', async () => {
      await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
      await expect(appFrame.getByText('Region', { exact: true })).toBeVisible();
      await expect(appFrame.getByPlaceholder('Search')).toBeVisible();
      if (persona === 'admin') {
        await expect(radios.my).toBeVisible();
        await expect(radios.all).toBeVisible();
      } else {
        await expect(radios.my).toHaveCount(0);
        await expect(radios.all).toHaveCount(0);
      }
      for (const header of GALLERY_HEADERS) {
        await expect.soft(appFrame.getByText(header, { exact: true })).toBeVisible();
      }
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Show Invoices', { exact: true }),
          appFrame.getByText('Next Step', { exact: true }),
        ],
        'Filters, search, columns',
        testInfo
      );
    });
  });

  test('IO-002: This Month filter shows current billing cycle', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('This Month is selected and gallery settles', async () => {
      await expect(periodButton(appFrame, 'This Month')).toBeVisible();
      await waitForOverviewSettled(appFrame);
      await shotFilters(page, appFrame, testInfo, periodButton(appFrame, 'This Month'), 'This Month');
    });
  });

  test('IO-003: Last Month filter can be applied', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select Last Month', async () => {
      await applyPeriod(appFrame, 'Last Month');
      await shotFilters(page, appFrame, testInfo, periodButton(appFrame, 'Last Month'), 'Last Month');
    });
  });

  test('IO-004: Quarter to Date option can be applied', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select Quater to Date (app spelling)', async () => {
      await applyPeriod(appFrame, 'Quater to Date');
      await shotFilters(
        page,
        appFrame,
        testInfo,
        periodButton(appFrame, 'Quater to Date'),
        'Quater to Date'
      );
    });
  });

  test('IO-005: Last Quarter option can be applied', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select Last Quater (app spelling)', async () => {
      await applyPeriod(appFrame, 'Last Quater');
      await shotFilters(page, appFrame, testInfo, periodButton(appFrame, 'Last Quater'), 'Last Quater');
    });
  });

  test('IO-006: Year to Date option can be applied', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select Year to Date', async () => {
      await applyPeriod(appFrame, 'Year to Date');
      await shotFilters(
        page,
        appFrame,
        testInfo,
        periodButton(appFrame, 'Year to Date'),
        'Year to Date'
      );
    });
  });

  test('IO-007: Last Year option can be applied', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select Last Year', async () => {
      await applyPeriod(appFrame, 'Last Year');
      await shotFilters(page, appFrame, testInfo, periodButton(appFrame, 'Last Year'), 'Last Year');
    });
  });

  test('IO-008: Future Months option can be applied', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select Future Months', async () => {
      await applyPeriod(appFrame, 'Future Months');
      await shotFilters(
        page,
        appFrame,
        testInfo,
        periodButton(appFrame, 'Future Months'),
        'Future Months'
      );
    });
  });

  test('IO-009: Future month invoice does not appear in This Month', async () => {
    test.skip(true, 'confusion.md C-02: overlap bug pass/fail and seed invoice date not confirmed');
  });

  test('IO-010: Region filter North America', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Select North America', async () => {
      await dismissHostDialogs(page);
      await regionDropdown(appFrame).click();
      await expect(appFrame.getByRole('option', { name: 'North America', exact: true })).toBeVisible({
        timeout: 15000,
      });
      await appFrame.getByRole('option', { name: 'North America', exact: true }).click();
      await expect(appFrame.getByRole('button', { name: 'North America' })).toBeVisible({
        timeout: 15000,
      });
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Region', { exact: true }),
          appFrame.getByRole('button', { name: 'North America' }),
        ],
        'North America region',
        testInfo
      );
    });
  });

  test('IO-011: Region filter blank shows all regions', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await test.step('Default region is unselected', async () => {
      await expect(regionDropdown(appFrame)).toBeVisible();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Region', { exact: true }), regionDropdown(appFrame)],
        'Region unselected',
        testInfo
      );
    });
  });

  test('IO-012: All Invoices and My Invoices radios', async ({ page }, testInfo) => {
    test.skip(activePersona(testInfo) === 'pm', 'IO-012 is BDU/Admin — PM has no radios');
    const appFrame = await openInvoiceOverview(page);
    const radios = scopeRadios(appFrame);
    await test.step('Switch All then My', async () => {
      await expect(radios.all).toBeChecked();
      await radios.my.click();
      await expect(radios.my).toBeChecked();
      await waitForOverviewSettled(appFrame);
      await radios.all.click();
      await expect(radios.all).toBeChecked();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(page, [radios.group], 'My / All radios', testInfo);
    });
  });

  test('IO-013: Search by partner name', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows to search');
    const { partner } = await firstRowPartnerAndProject(appFrame);
    test.skip(!partner, 'Could not read a partner name from the first row');
    const search = appFrame.getByPlaceholder('Search');
    await test.step('Type partner name', async () => {
      await search.fill(partner);
      await expect(search).toHaveValue(partner);
      await expect(appFrame.getByText(partner).first()).toBeVisible({ timeout: 15000 });
      await markGroupAndShot(
        page,
        [search, appFrame.getByText(partner).first()],
        'Search partner',
        testInfo
      );
    });
  });

  test('IO-014: Search by project name', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows to search');
    const { project } = await firstRowPartnerAndProject(appFrame);
    test.skip(!project, 'Could not read a project name from the first row');
    const search = appFrame.getByPlaceholder('Search');
    await test.step('Type project name', async () => {
      await search.fill(project);
      await expect(search).toHaveValue(project);
      await expect(appFrame.getByText(project).first()).toBeVisible({ timeout: 15000 });
      await markGroupAndShot(
        page,
        [search, appFrame.getByText(project).first()],
        'Search project',
        testInfo
      );
    });
  });

  test('IO-015: Search by invoice number', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows to search');
    const invoiceNumber = await firstInvoiceNumber(appFrame);
    test.skip(!invoiceNumber, 'No invoice number on the first page');
    const search = appFrame.getByPlaceholder('Search');
    await test.step('Type invoice number', async () => {
      await search.fill(invoiceNumber);
      await expect(search).toHaveValue(invoiceNumber);
      await expect(appFrame.getByText(invoiceNumber).first()).toBeVisible({ timeout: 15000 });
      await markGroupAndShot(
        page,
        [search, appFrame.getByText(invoiceNumber).first()],
        'Search invoice number',
        testInfo
      );
    });
  });

  test('IO-016: Partner column sorts ascending then descending', async () => {
    test.skip(true, 'confusion.md C-03/C-04: unlabeled sort vs filter icons; sort order not confirmed');
  });

  test('IO-017: Project column sorts correctly', async () => {
    test.skip(true, 'confusion.md C-04: unlabeled sort vs filter icons');
  });

  test('IO-018: Invoice # column sorts correctly', async () => {
    test.skip(true, 'confusion.md C-04: unlabeled sort vs filter icons');
  });

  test('IO-019: Status column sorts correctly', async () => {
    test.skip(true, 'confusion.md C-03: alpha vs lifecycle sort not confirmed');
  });

  test('IO-020: Partner column filter works', async () => {
    test.skip(true, 'confusion.md C-04: column filter UI not mapped');
  });

  test('IO-021: Status column filter works', async () => {
    test.skip(true, 'confusion.md C-04: column filter UI not mapped');
  });

  test('IO-022: Action Pending With filter works', async () => {
    test.skip(true, 'confusion.md C-04: column filter UI not mapped');
  });

  test('IO-023: Review button visible for Submitted invoices', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows');
    const review = appFrame.getByRole('button', { name: 'Review' });
    test.skip((await review.count()) === 0, 'No Submitted row with Review on this page');
    await test.step('Review visible', async () => {
      await expect(review.first()).toBeVisible();
      await markGroupAndShot(
        page,
        [appFrame.getByText('Next Step', { exact: true }), review.first()],
        'Review Next Step',
        testInfo
      );
    });
  });

  test('IO-024: Approve button visible for Reviewed invoices', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows');
    const approve = appFrame.getByRole('button', { name: 'Approve' });
    test.skip((await approve.count()) === 0, 'No Reviewed row with Approve on this page');
    await test.step('Approve visible', async () => {
      await expect(approve.first()).toBeVisible();
      await markGroupAndShot(
        page,
        [appFrame.getByText('Next Step', { exact: true }), approve.first()],
        'Approve Next Step',
        testInfo
      );
    });
  });

  test('IO-025: Edit button visible for Draft and Flagged invoices', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows');
    const edit = appFrame.getByRole('button', { name: /^Edit/ });
    test.skip((await edit.count()) === 0, 'No Draft/Flagged row with Edit on this page');
    await test.step('Edit visible', async () => {
      await expect(edit.first()).toBeVisible();
      await markGroupAndShot(
        page,
        [appFrame.getByText('Next Step', { exact: true }), edit.first()],
        'Edit Next Step',
        testInfo
      );
    });
  });

  test('IO-026: View button visible for Approved and Sent invoices', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows');
    const view = appFrame.getByRole('button', { name: 'View' });
    test.skip((await view.count()) === 0, 'No Approved/Sent row with View on this page');
    await test.step('View visible', async () => {
      await expect(view.first()).toBeVisible();
      await markGroupAndShot(
        page,
        [appFrame.getByText('Next Step', { exact: true }), view.first()],
        'View Next Step',
        testInfo
      );
    });
  });

  test('IO-027: Report button visible for Fail-Creation invoices', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    await skipIfEmpty(appFrame, 'No gallery rows');
    const report = appFrame.getByRole('button', { name: 'Report' });
    test.skip((await report.count()) === 0, 'No Fail-* row with Report on this page');
    await test.step('Report visible', async () => {
      await expect(report.first()).toBeVisible();
      await markGroupAndShot(
        page,
        [appFrame.getByText('Next Step', { exact: true }), report.first()],
        'Report Next Step',
        testInfo
      );
    });
  });

  test('IO-028: Clicking Review opens View Invoice inline', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const review = appFrame.getByRole('button', { name: 'Review' });
    test.skip((await review.count()) === 0, 'No Review button');
    await test.step('Open Review overlay', async () => {
      await review.first().click();
      await dismissHostDialogs(page);
      await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
      await expect(pdf.getByText(/Invoice|Partner Name/i).first()).toBeVisible({ timeout: 30000 });
      await markGroupAndShot(
        page,
        [appFrame.getByText('View Invoice', { exact: true })],
        'View Invoice overlay',
        testInfo
      );
      await clickIconRightOf(page, appFrame.getByText('View Invoice', { exact: true }));
    });
  });

  test('IO-029: PDF viewer shows navigation and zoom controls', async () => {
    test.skip(true, 'confusion.md C-06: overlay chrome is unlabeled; cannot map zoom/search/download');
  });

  test('IO-030: Download button in PDF viewer saves the PDF', async () => {
    test.skip(true, 'confusion.md C-06: which control is Download (overlay vs host bar)');
  });

  test('IO-031: Close dismisses View Invoice', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const review = appFrame.getByRole('button', { name: 'Review' });
    test.skip((await review.count()) === 0, 'No Review button');
    await test.step('Close overlay', async () => {
      await review.first().click();
      await dismissHostDialogs(page);
      await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await clickIconRightOf(page, appFrame.getByText('View Invoice', { exact: true }));
      await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
        timeout: 20000,
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true })],
        'Overview after close',
        testInfo
      );
    });
  });

  test('IO-032: PDF loads without error on Review', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const review = appFrame.getByRole('button', { name: 'Review' });
    test.skip((await review.count()) === 0, 'No Review button');
    await test.step('PDF content visible', async () => {
      await review.first().click();
      await dismissHostDialogs(page);
      await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await expect(appFrame.getByText(/error screen|something went wrong/i)).toHaveCount(0);
      const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
      await expect(pdf.getByText(/Invoice|Partner Name/i).first()).toBeVisible({ timeout: 30000 });
      await markGroupAndShot(
        page,
        [appFrame.getByText('View Invoice', { exact: true })],
        'PDF without error',
        testInfo
      );
      await clickIconRightOf(page, appFrame.getByText('View Invoice', { exact: true }));
    });
  });

  test('IO-032b: Three-dot menu shows Delete Draft for Draft invoices', async () => {
    test.skip(true, 'confusion.md C-08: Draft three-dot menu not mapped');
  });

  test('IO-033: Delete Draft shows confirmation popup', async () => {
    test.skip(true, 'confusion.md C-08: Delete Draft popup not mapped');
  });

  test('IO-034: Confirming Delete Draft removes the invoice', async () => {
    test.skip(true, 'confusion.md C-08: delete vs hide not confirmed');
  });

  test('IO-035: Cancel option available for Approved invoices', async () => {
    test.skip(true, 'confusion.md C-09: Cancel on Submitted/Reviewed vs Approved only; PM vs Admin');
  });

  test('IO-036: Cancelling invoice changes status to Cancelled', async () => {
    test.skip(true, 'confusion.md C-09: reason required and Cancel flow not confirmed');
  });

  test('IO-037: Reviewer can open Review and close without action', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const review = appFrame.getByRole('button', { name: 'Review' });
    test.skip((await review.count()) === 0, 'No Review button');
    await test.step('Open then close without Flag or Mark as Reviewed', async () => {
      await review.first().click();
      await dismissHostDialogs(page);
      await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await expect(appFrame.getByRole('button', { name: 'Flag' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Mark as Reviewed' })).toBeVisible();
      await clickIconRightOf(page, appFrame.getByText('View Invoice', { exact: true }));
      await expect(appFrame.getByRole('button', { name: 'Review' }).first()).toBeVisible();
      await markGroupAndShot(
        page,
        [appFrame.getByRole('button', { name: 'Review' }).first()],
        'Still Submitted after close',
        testInfo
      );
    });
  });

  test('IO-038: Approver can approve a Reviewed invoice', async () => {
    test.skip(true, 'confusion.md C-14: Approve overlay labels and confirm dialog not observed');
  });

  test('IO-039: Reviewer can flag a Submitted invoice', async () => {
    test.skip(true, 'confusion.md C-12: Flag comments required; do not mutate org invoices');
  });

  test('IO-040: Approver can flag a Reviewed invoice', async () => {
    test.skip(true, 'confusion.md C-14: Flag from Approve overlay not observed');
  });

  test('IO-041: Invoice amounts display correct decimal values', async () => {
    test.skip(true, 'confusion.md C-16: Overview gallery has no Rate/Total columns');
  });

  test('IO-042: Alphabetical order of column filter values', async () => {
    test.skip(true, 'confusion.md C-04: column filter dropdown not mapped');
  });
});

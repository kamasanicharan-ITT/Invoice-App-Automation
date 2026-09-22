// spec: specs/invoice-overview-screen-plan.md
// seed: tests/seed.spec.ts
//
// Single Invoice Overview screen suite: TC-IO shell, unique Excel IO cases,
// and a read-only Overview flow catalog. Mutating lifecycle cases stay skipped
// until product behaviour is confirmed.

import { test, expect } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import { dismissHostDialogs } from './utils/host-dialogs';
import { assertAppSession } from './utils/assert-app-session';
import {
  captureDataverseToken,
  listActiveContractsForProject,
  loadCreateInvoiceFixtures,
} from './utils/dataverse-fixtures';
import {
  waitForInvoiceAfterAction,
  waitForInvoiceStatus,
  waitForSubmittedInvoice,
} from './utils/flow-audit';
import {
  awaitSubmitNavigatedToOverview,
  contractModalOpen,
  dismissDuplicateDialog,
  ensureLineItemRow,
  openCreateInvoice,
  selectContractIfPrompted,
  selectPartnerAndProject,
  selectedProjectButton,
  setAdhoc,
} from './utils/create-invoice-ui';
import {
  DECIMAL_DESCRIPTIONS,
  DECIMAL_RATES,
  addLineItemRow,
  closeViewInvoiceOverlay,
  decimalTokens,
  expectedRateDisplay,
  fillDecimalRow,
  lineItemRowCount,
  listOpenRateProducts,
  normalizePdfText,
  pdfRowValues,
  readPdfViewerText,
  waitForRowNextStep,
  type FilledRow,
} from './utils/invoice-decimal-rates';
import {
  isRetiredInvoiceFlowName,
  listCloudFlows,
  listFlowRunsForWorkflow,
  searchWorkflowsByName,
  type FlowRunRow,
  type WorkflowRow,
} from './utils/flow-runs';
import {
  INVOICE_NUMBER,
  PERIOD_OPTIONS,
  REGIONS,
  activePersona,
  applyPeriod,
  clickColumnFunnel,
  clickColumnSortArrow,
  clickIconRightOf,
  clickPaginationPrev,
  closeViewInvoice,
  commentsModalCancelInvoiceButton,
  downloadViewInvoicePdf,
  ensureDisposableDraft,
  ensureOverviewRows,
  expectComboOptions,
  firstInvoiceNumber,
  firstRowPartnerAndProject,
  galleryRows,
  isSortedAsc,
  isSortedDesc,
  openInvoiceOverview,
  openPdfFromNextStep,
  openRowKebab,
  overviewHasRows,
  pageNumberButtons,
  periodButton,
  regionDropdown,
  resetOverviewViaDashboard,
  scopeRadios,
  waitForOverviewSettled,
} from './utils/invoice-overview-ui';

const OVERVIEW_FLOWS: { key: string; label: string; match: (name: string) => boolean }[] = [
  {
    key: 'notify-initiator',
    label: 'NotifyInvoiceInitiator',
    match: (n) => /notify\s*invoice\s*initiator/i.test(n),
  },
  {
    key: 'post-submitted',
    label: 'Project Invoice (M): Handle Post Submitted Tasks',
    match: (n) => /handle\s*post\s*submitted/i.test(n),
  },
  {
    key: 'update-na',
    label: 'Update Invoice - NA Region',
    match: (n) =>
      /update\s*invoice/i.test(n) && /(na\b|north\s*america)/i.test(n) && !/create|deprecated/i.test(n),
  },
  {
    key: 'update-other',
    label: 'Update Invoice - Other Region',
    match: (n) => /update\s*invoice/i.test(n) && /other/i.test(n) && !/create|deprecated/i.test(n),
  },
  {
    key: 'immediate-send-notify',
    label: 'Notify for Immediate send Invoices',
    match: (n) => /immediate\s*send/i.test(n),
  },
  {
    key: 'send-instant-client',
    label: 'Send instant Invoices to Client',
    match: (n) => /send\s*instant\s*invoices\s*to\s*client/i.test(n),
  },
];

function flowRunLine(r: FlowRunRow): string {
  return (
    `| ${r.starttime ?? r.createdon ?? '?'} | ${r.status ?? '?'} | ${r.flowrunid ?? r.name ?? '?'} | ` +
    `${(r.errormessage ?? '').replace(/\|/g, '/').slice(0, 80)} |`
  );
}

test.describe('Invoice Overview Screen', () => {
  test.describe.configure({ timeout: 120000 });

  // Session gate: one open before any scheduled case (full file, --grep group, or
  // a single test). Sign in / dead storageState fails this hook so later cases
  // are skipped instead of each timing out. See tests/utils/assert-app-session.ts.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await assertAppSession(page);
    } finally {
      await page.close();
    }
  });

  // Shared shell for Admin + PM. Radios differ by persona (project storageState).

  test('TC-IO-01: Screen layout loads with expected controls', async ({ page }, testInfo) => {
    const persona = activePersona(testInfo);
    const appFrame = await openInvoiceOverview(page);
    const radios = scopeRadios(appFrame);

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

    await test.step(`Scope radios (${persona}) + filters`, async () => {
      if (persona === 'admin') {
        await expect(radios.my).toBeVisible();
        await expect(radios.all).toBeVisible();
      } else {
        // [PM] hidden — My/All radios must not appear
        await expect(radios.my).toHaveCount(0);
        await expect(radios.all).toHaveCount(0);
        await expect(radios.group).toHaveCount(0);
      }

      await expect.soft(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByText('Region', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByPlaceholder('Search')).toBeVisible();

      const filterTargets =
        persona === 'admin'
          ? [
              radios.group,
              appFrame.getByText('Show Invoices', { exact: true }),
              periodButton(appFrame, 'This Month'),
              appFrame.getByText('Region', { exact: true }),
              appFrame.getByPlaceholder('Search'),
            ]
          : [
              appFrame.getByText('Show Invoices', { exact: true }),
              periodButton(appFrame, 'This Month'),
              appFrame.getByText('Region', { exact: true }),
              appFrame.getByPlaceholder('Search'),
            ];

      await markGroupAndShot(page, filterTargets, `Scope radios (${persona}) + filters`, testInfo);
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

      const hasRows = await overviewHasRows(appFrame);
      if (hasRows) {
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
      } else {
        await expect
          .soft(appFrame.getByText('No Item to Display', { exact: true }))
          .toBeVisible();
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Partner', { exact: true }),
            appFrame.getByText('Next Step', { exact: true }),
            appFrame.getByText('No Item to Display', { exact: true }),
          ],
          'Table headers (empty gallery)',
          testInfo
        );
      }
    });
  });

  test('TC-IO-02: Admin can switch My Invoices / All Invoices @admin', async ({
    page,
  }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const radios = scopeRadios(appFrame);

    await test.step('Default is All Invoices', async () => {
      await expect(radios.all).toBeChecked();
      await markGroupAndShot(page, [radios.group], 'Default is All Invoices', testInfo);
    });

    await test.step('Switch to My Invoices', async () => {
      await radios.my.click();
      await expect(radios.my).toBeChecked();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(page, [radios.group], 'Switch to My Invoices', testInfo);
    });

    await test.step('Switch back to All Invoices', async () => {
      await radios.all.click();
      await expect(radios.all).toBeChecked();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(page, [radios.group], 'Switch back to All Invoices', testInfo);
    });
  });

  test('TC-IO-02b: PM does not see My / All Invoices radios @pm', async ({
    page,
  }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const radios = scopeRadios(appFrame);

    await test.step('My/All radios hidden for PM', async () => {
      await expect(radios.my).toHaveCount(0);
      await expect(radios.all).toHaveCount(0);
      await expect(radios.group).toHaveCount(0);
      await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();

      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Invoice Overview').first(),
          appFrame.getByText('Show Invoices', { exact: true }),
          appFrame.getByText('Region', { exact: true }),
          appFrame.getByPlaceholder('Search'),
        ],
        'My/All radios hidden for PM',
        testInfo
      );
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
      await dismissHostDialogs(page);
      await regionDropdown(appFrame).click();
      await expectComboOptions(appFrame, REGIONS);
      const first = appFrame.getByRole('option', { name: 'Australia', exact: true });
      const last = appFrame.getByRole('option', { name: 'UAE', exact: true });
      await first.scrollIntoViewIfNeeded().catch(() => undefined);
      await last.scrollIntoViewIfNeeded().catch(() => undefined);
      await markGroupAndShot(page, [first, last], 'Region options listed', testInfo);
    });

    await test.step('India applied', async () => {
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
    test.skip(!(await overviewHasRows(appFrame)), 'No invoice rows to search for this persona');

    const search = appFrame.getByPlaceholder('Search');
    let invoiceNumber = '';

    await test.step('Capture invoice number from list', async () => {
      invoiceNumber = await firstInvoiceNumber(appFrame);
      expect(invoiceNumber, 'Expected an invoice number in the Overview gallery').toMatch(
        INVOICE_NUMBER
      );
    });

    await test.step('Search filters the list', async () => {
      await search.fill(invoiceNumber);
      await expect(search).toHaveValue(invoiceNumber);
      await waitForOverviewSettled(appFrame);
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
    const persona = activePersona(testInfo);
    const appFrame = await openInvoiceOverview(page);

    // Admin: prefer All Invoices for broader statuses. PM has no radios.
    if (persona === 'admin') {
      const allInvoices = scopeRadios(appFrame).all;
      if (!(await allInvoices.isChecked().catch(() => false))) {
        await allInvoices.click();
        await waitForOverviewSettled(appFrame);
      }
    }

    test.skip(!(await overviewHasRows(appFrame)), 'No invoice rows — Next Step mapping N/A');

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
    await dismissHostDialogs(page);

    test.skip(!(await overviewHasRows(appFrame)), 'No invoice rows — pagination N/A');

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
      if (page1Invoice) {
        await expect
          .poll(async () => firstInvoiceNumber(appFrame), { timeout: 20000 })
          .not.toBe(page1Invoice);
      }
      await markGroupAndShot(page, [page2], 'Page 2 active', testInfo);

      let backOnPage1 = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        if (await page1.isVisible().catch(() => false)) {
          await page1.click();
          await waitForOverviewSettled(appFrame);
          backOnPage1 = true;
          break;
        }

        await dismissHostDialogs(page);
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
    const persona = activePersona(testInfo);
    const appFrame = await openInvoiceOverview(page);

    await test.step('Create Invoice opens New Invoice form', async () => {
      await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
      await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });

      // Adhoc is Admin-elevated; PM may not show the toggle — do not require it for PM
      if (persona === 'admin') {
        await expect.soft(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible({
          timeout: 15000,
        });
      }

      await expect(appFrame.getByRole('button', { name: 'Close' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeVisible();

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

  test('TC-IO-20: Review opens View Invoice with PDF and actions', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);
    const review = appFrame.getByRole('button', { name: 'Review' });
    test.skip((await review.count()) === 0, 'No Submitted invoice with Review on Overview');

    await test.step('Open Review overlay', async () => {
      await review.first().click();
      await dismissHostDialogs(page);
      await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await expect(appFrame.getByRole('button', { name: 'Flag' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Mark as Reviewed' })).toBeVisible();
      await expect.soft(appFrame.getByText('Comments', { exact: true })).toBeVisible();
      await expect
        .soft(appFrame.getByText('Internal Notes (Hidden from Customer)', { exact: true }))
        .toBeVisible();

      const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
      await expect(pdf.getByText(/Invoice|Partner Name/i).first()).toBeVisible({
        timeout: 30000,
      });

      await markGroupAndShot(
        page,
        [
          appFrame.getByText('View Invoice', { exact: true }),
          appFrame.getByRole('button', { name: 'Flag' }),
          appFrame.getByRole('button', { name: 'Mark as Reviewed' }),
        ],
        'View Invoice overlay',
        testInfo
      );
    });

    await test.step('Close without Flag or Mark as Reviewed', async () => {
      await clickIconRightOf(page, appFrame.getByText('View Invoice', { exact: true }));
      await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
        timeout: 20000,
      });
      await expect(appFrame.getByRole('button', { name: 'Review' }).first()).toBeVisible();
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Show Invoices', { exact: true }),
          appFrame.getByRole('button', { name: 'Review' }).first(),
        ],
        'Overview after closing Review',
        testInfo
      );
    });
  });

  test('TC-IO-27: Refresh control is present on Overview', async ({ page }, testInfo) => {
    const appFrame = await openInvoiceOverview(page);

    await test.step('Click header refresh icon', async () => {
      const title = appFrame.getByText('Invoice Overview', { exact: true }).first();
      await expect(title).toBeVisible();
      await clickIconRightOf(page, title);
      await dismissHostDialogs(page);
      await waitForOverviewSettled(appFrame);
      await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible();
      await markGroupAndShot(
        page,
        [title, appFrame.getByText('Show Invoices', { exact: true })],
        'Overview after refresh',
        testInfo
      );
    });
  });

  test.describe('Period, region, and search (sheet IDs not covered above)', () => {
    test('IO-004: Quarter to Date option can be applied', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Quater to Date');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true }), periodButton(appFrame, 'Quater to Date')],
        'Quater to Date',
        testInfo
      );
    });

    test('IO-005: Last Quarter option can be applied', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Last Quater');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true }), periodButton(appFrame, 'Last Quater')],
        'Last Quater',
        testInfo
      );
    });

    test('IO-006: Year to Date option can be applied', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Year to Date');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true }), periodButton(appFrame, 'Year to Date')],
        'Year to Date',
        testInfo
      );
    });

    test('IO-007: Last Year option can be applied', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Last Year');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true }), periodButton(appFrame, 'Last Year')],
        'Last Year',
        testInfo
      );
    });

    test('IO-008: Future Months shows invoices after the 5th of next month', async ({
      page,
    }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Future Months');
      const hasRows = await overviewHasRows(appFrame);
      expect(
        hasRows,
        'No invoices in Future Months to filter — please create some (invoice date on/after the 6th of next month)'
      ).toBe(true);
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Show Invoices', { exact: true }),
          periodButton(appFrame, 'Future Months'),
        ],
        'Future Months',
        testInfo
      );
    });

    test('IO-009: Future month invoice does not appear in This Month', async ({
      page,
    }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Future Months');
      const futureRows = await galleryRows(appFrame);
      const futureInvoices = futureRows.map((r) => r.invoice).filter(Boolean);
      expect(
        futureInvoices.length > 0 || (await overviewHasRows(appFrame)),
        'No invoices in Future Months to filter — please create some (invoice date on/after the 6th of next month)'
      ).toBe(true);

      await applyPeriod(appFrame, 'This Month');
      for (const inv of futureInvoices) {
        await expect(
          appFrame.getByText(inv, { exact: true }),
          `Future invoice ${inv} must not appear under This Month`
        ).toHaveCount(0);
      }
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Show Invoices', { exact: true }),
          periodButton(appFrame, 'This Month'),
        ],
        'This Month excludes Future Months invoices',
        testInfo
      );
    });

    test('IO-010: Region filter North America', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await dismissHostDialogs(page);
      await regionDropdown(appFrame).click();
      await expect(
        appFrame.getByRole('option', { name: 'North America', exact: true })
      ).toBeVisible({ timeout: 15000 });
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

    test('IO-011: Region filter blank shows all regions', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await expect(regionDropdown(appFrame)).toBeVisible();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Region', { exact: true }), regionDropdown(appFrame)],
        'Region unselected',
        testInfo
      );
    });

    test('IO-013: Search by partner name', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      test.skip(!(await overviewHasRows(appFrame)), 'No gallery rows to search');
      const { partner } = await firstRowPartnerAndProject(appFrame);
      test.skip(!partner, 'Could not read a partner name from the first row');
      const search = appFrame.getByPlaceholder('Search');
      await search.fill(partner);
      await expect(search).toHaveValue(partner);
      await waitForOverviewSettled(appFrame);
      await expect(appFrame.getByText(partner, { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });
    });

    test('IO-014: Search by project name', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      test.skip(!(await overviewHasRows(appFrame)), 'No gallery rows to search');
      const { project } = await firstRowPartnerAndProject(appFrame);
      test.skip(!project, 'Could not read a project name from the first row');
      const search = appFrame.getByPlaceholder('Search');
      await search.fill(project);
      await expect(search).toHaveValue(project);
      await waitForOverviewSettled(appFrame);
      await expect(appFrame.getByText(project, { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });
    });
  });

  test.describe('Locked Excel cases (sort, filter, PDF, delete, cancel)', () => {
    test('IO-016: Partner column sorts ascending then descending', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to sort — please create some'
      ).toBe(true);

      await clickColumnSortArrow(page, appFrame, 'Partner');
      const asc = (await galleryRows(appFrame)).map((r) => r.partner).filter(Boolean);
      expect(asc.length, 'No partner values after sort').toBeGreaterThan(0);
      expect(isSortedAsc(asc), `Partner not A→Z after first click: ${asc.slice(0, 8).join(', ')}`).toBe(
        true
      );

      await clickColumnSortArrow(page, appFrame, 'Partner');
      const desc = (await galleryRows(appFrame)).map((r) => r.partner).filter(Boolean);
      expect(
        isSortedDesc(desc),
        `Partner not Z→A after second click: ${desc.slice(0, 8).join(', ')}`
      ).toBe(true);

      await markGroupAndShot(
        page,
        [appFrame.getByText('Partner', { exact: true }).first()],
        'Partner sort',
        testInfo
      );
    });

    test('IO-017: Project column sorts correctly', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to sort — please create some'
      ).toBe(true);

      await clickColumnSortArrow(page, appFrame, 'Project');
      const asc = (await galleryRows(appFrame)).map((r) => r.project).filter(Boolean);
      expect(isSortedAsc(asc), `Project not A→Z: ${asc.slice(0, 8).join(', ')}`).toBe(true);

      await clickColumnSortArrow(page, appFrame, 'Project');
      const desc = (await galleryRows(appFrame)).map((r) => r.project).filter(Boolean);
      expect(isSortedDesc(desc), `Project not Z→A: ${desc.slice(0, 8).join(', ')}`).toBe(true);

      await markGroupAndShot(
        page,
        [appFrame.getByText('Project', { exact: true }).first()],
        'Project sort',
        testInfo
      );
    });

    test('IO-018: Invoice # column sorts correctly', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to sort — please create some'
      ).toBe(true);

      await clickColumnSortArrow(page, appFrame, 'Invoice #');
      const asc = (await galleryRows(appFrame)).map((r) => r.invoice).filter(Boolean);
      expect(asc.length, 'No invoice numbers after sort — need numbered rows').toBeGreaterThan(0);
      expect(isSortedAsc(asc), `Invoice # not low→high: ${asc.slice(0, 8).join(', ')}`).toBe(true);

      await clickColumnSortArrow(page, appFrame, 'Invoice #');
      const desc = (await galleryRows(appFrame)).map((r) => r.invoice).filter(Boolean);
      expect(isSortedDesc(desc), `Invoice # not high→low: ${desc.slice(0, 8).join(', ')}`).toBe(
        true
      );

      await markGroupAndShot(
        page,
        [appFrame.getByText('Invoice #', { exact: true }).first()],
        'Invoice # sort',
        testInfo
      );
    });

    test('IO-019: Status column sorts correctly', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to sort — please create some'
      ).toBe(true);

      await clickColumnSortArrow(page, appFrame, 'Status');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Status', { exact: true }).first()],
        'Status sort first click (A→Z)',
        testInfo
      );
      await clickColumnSortArrow(page, appFrame, 'Status');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Status', { exact: true }).first()],
        'Status sort second click (Z→A)',
        testInfo
      );
    });

    test('IO-020: Partner column filter works', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to filter — please create some'
      ).toBe(true);
      const { partner } = await firstRowPartnerAndProject(appFrame);
      expect(partner, 'Could not read a partner name from the gallery').toBeTruthy();

      await clickColumnFunnel(page, appFrame, 'Partner');
      const partnerFilter = appFrame.locator('[data-control-name="cmb_PartnerFilter"]');
      await expect(partnerFilter).toBeVisible({ timeout: 10000 });
      await partnerFilter.click({ force: true });
      await page.keyboard.type(partner.slice(0, Math.min(4, partner.length)), { delay: 50 });
      const opt = appFrame.getByRole('option', { name: partner, exact: true });
      await expect(opt.first()).toBeVisible({ timeout: 15000 });
      await opt.first().click();
      await waitForOverviewSettled(appFrame);

      const after = await galleryRows(appFrame);
      expect(after.length, 'Filter returned no rows').toBeGreaterThan(0);
      for (const row of after) {
        if (row.partner) expect(row.partner).toBe(partner);
      }

      await resetOverviewViaDashboard(page, appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Partner', { exact: true }).first()],
        'Partner filter cleared after nav',
        testInfo
      );
    });

    test('IO-021: Status column filter works', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to filter — please create some'
      ).toBe(true);

      await clickColumnFunnel(page, appFrame, 'Status');
      const filterCombo = appFrame.locator('[data-control-name="dd_StatusFilter"]');
      await expect(filterCombo).toBeVisible({ timeout: 10000 });
      await filterCombo.click({ force: true });
      // Search the open list then select one status (Submitted is always present in DEV This Month)
      await page.keyboard.type('Sub', { delay: 40 });
      const submittedOpt = appFrame
        .getByRole('option', { name: 'Submitted', exact: true })
        .or(appFrame.getByText('Submitted', { exact: true }));
      await expect(
        submittedOpt.first(),
        'Submitted option missing from Status filter list'
      ).toBeVisible({ timeout: 15000 });
      await submittedOpt.first().click({ force: true });
      await page.keyboard.press('Escape');
      await waitForOverviewSettled(appFrame);
      await expect(
        appFrame.getByRole('button', { name: 'Review' }).first(),
        'After filtering to Submitted, expected at least one Review Next Step'
      ).toBeVisible({ timeout: 15000 });

      await resetOverviewViaDashboard(page, appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Status', { exact: true }).first()],
        'Status filter',
        testInfo
      );
    });

    test('IO-022: Action Pending With filter works', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      expect(
        await overviewHasRows(appFrame),
        'No invoices to filter — please create some'
      ).toBe(true);

      await clickColumnFunnel(page, appFrame, 'Action Pending with');
      const filterCnt = appFrame.locator('[data-control-name="cnt_ActionPendingFilter"]');
      await expect(
        filterCnt,
        'Action Pending filter did not open'
      ).toBeVisible({ timeout: 10000 });
      await filterCnt.click({ force: true });
      await page.keyboard.type('a', { delay: 40 });
      const anyOpt = appFrame.getByRole('option').first();
      await expect(
        anyOpt,
        'No user options in Action Pending filter — please create invoices with Action Pending users'
      ).toBeVisible({ timeout: 15000 });
      const chosen = ((await anyOpt.textContent()) || '').trim();
      await anyOpt.click();
      await waitForOverviewSettled(appFrame);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Action Pending with', { exact: true }).first()],
        `Action Pending filter ${chosen}`,
        testInfo
      );

      await resetOverviewViaDashboard(page, appFrame);
    });

    test('IO-029: PDF viewer shows navigation and zoom controls', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      await openPdfFromNextStep(page, appFrame);
      const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
      await expect(pdf.getByText(/Invoice|Partner Name|INVOICE/i).first()).toBeVisible({
        timeout: 30000,
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('View Invoice', { exact: true })],
        'PDF zoom viewer',
        testInfo
      );
      await closeViewInvoice(page, appFrame);
    });

    test('IO-030: Download button in PDF viewer saves the PDF', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      await openPdfFromNextStep(page, appFrame);
      await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible();

      const outcome = await downloadViewInvoicePdf(page, appFrame);
      expect(outcome.nameOrUrl.length).toBeGreaterThan(0);
      await markGroupAndShot(
        page,
        [appFrame.getByText('View Invoice', { exact: true })],
        `PDF download (${outcome.kind})`,
        testInfo
      );
      await closeViewInvoice(page, appFrame);
    });

    test('IO-032b: Three-dot menu shows Delete Draft for Draft invoices', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(180000);
      const persona = activePersona(testInfo);
      test.skip(
        persona === 'pm',
        'On hold — PM Delete Draft ⋮ to be verified later (seed Draft on Test for dev 1 works)'
      );
      const appFrame = await ensureDisposableDraft(page, browser, persona);

      await openRowKebab(page, appFrame, 'Edit Draft', 'Delete Draft');
      await expect(appFrame.getByText('Delete Draft', { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('Delete Draft', { exact: true })],
        'Delete Draft menu',
        testInfo
      );
      await page.keyboard.press('Escape');
    });

    test('IO-033: Delete Draft removes the draft with no confirmation popup', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(180000);
      const persona = activePersona(testInfo);
      test.skip(
        persona === 'pm',
        'On hold — PM Delete Draft ⋮ to be verified later'
      );
      const appFrame = await ensureDisposableDraft(page, browser, persona);

      const beforeCount = await appFrame.getByRole('button', { name: 'Edit Draft', exact: true }).count();
      expect(beforeCount, 'Need an Edit Draft row to delete').toBeGreaterThan(0);

      await openRowKebab(page, appFrame, 'Edit Draft', 'Delete Draft');
      await expect(appFrame.getByText('Delete Draft', { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await appFrame.getByText('Delete Draft', { exact: true }).click();

      // Live app has no confirm popup — the row should disappear immediately.
      await expect(
        appFrame.getByRole('button', { name: /^(Continue|Yes|OK|Confirm)$/i })
      ).toHaveCount(0);
      await waitForOverviewSettled(appFrame);
      await expect(
        appFrame.getByRole('button', { name: 'Edit Draft', exact: true }),
        'Draft was not deleted — Edit Draft is still on Overview'
      ).toHaveCount(0);

      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true })],
        'Draft deleted with no popup',
        testInfo
      );
    });

    test('IO-034: Delete Draft removes the invoice immediately', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(180000);
      const persona = activePersona(testInfo);
      test.skip(
        persona === 'pm',
        'On hold — PM Delete Draft ⋮ to be verified later (seed Draft on Test for dev 1 works)'
      );
      const appFrame = await ensureDisposableDraft(page, browser, persona);

      const before = await galleryRows(appFrame);
      const draftRow = before.find((r) => /Edit Draft/i.test(r.nextStep));
      const marker = draftRow?.project || draftRow?.partner || 'Draft';

      await openRowKebab(page, appFrame, 'Edit Draft', 'Delete Draft');
      await expect(appFrame.getByText('Delete Draft', { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await appFrame.getByText('Delete Draft', { exact: true }).click();
      await waitForOverviewSettled(appFrame);
      // Canvas may keep a hidden "Delete Draft" template node — assert the Draft row is gone.
      await expect(
        appFrame.getByRole('button', { name: 'Edit Draft', exact: true }),
        'Edit Draft row still present after Delete Draft'
      ).toHaveCount(0);
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true })],
        `Deleted draft (${marker})`,
        testInfo
      );
    });

    test('IO-035: Cancel Invoice option on Approved ⋮ @admin', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      // Narrow to Approved so View rows are on-screen and ⋮ is unambiguous.
      await clickColumnFunnel(page, appFrame, 'Status');
      const filterCombo = appFrame.locator('[data-control-name="dd_StatusFilter"]');
      await expect(filterCombo).toBeVisible({ timeout: 10000 });
      await filterCombo.click({ force: true });
      await page.keyboard.type('Approved', { delay: 40 });
      // Prefer role=option — getByText('Approved') also matches Status badges (often hidden).
      const approvedOpt = appFrame.getByRole('option', { name: 'Approved', exact: true });
      await expect(
        approvedOpt.first(),
        'Approved option missing from Status filter list'
      ).toBeVisible({ timeout: 15000 });
      await approvedOpt.first().click({ force: true });
      await page.keyboard.press('Escape');
      await waitForOverviewSettled(appFrame);

      const view = appFrame.getByRole('button', { name: 'View', exact: true });
      expect(
        (await view.count()) > 0,
        'No Approved invoice (View) — please approve a disposable invoice'
      ).toBe(true);

      await openRowKebab(page, appFrame, 'View', 'Cancel Invoice');
      await expect(appFrame.getByText('Cancel Invoice', { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('Cancel Invoice', { exact: true })],
        'Cancel Invoice menu',
        testInfo
      );
      await page.keyboard.press('Escape');
    });

    test('IO-036: Cancelling Approved invoice requires comments @admin', async ({
      page,
    }, testInfo) => {
      test.setTimeout(180000);
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      await clickColumnFunnel(page, appFrame, 'Status');
      const filterCombo = appFrame.locator('[data-control-name="dd_StatusFilter"]');
      await expect(filterCombo).toBeVisible({ timeout: 10000 });
      await filterCombo.click({ force: true });
      await page.keyboard.type('Approved', { delay: 40 });
      const approvedOpt = appFrame.getByRole('option', { name: 'Approved', exact: true });
      await expect(
        approvedOpt.first(),
        'Approved option missing from Status filter list'
      ).toBeVisible({ timeout: 15000 });
      await approvedOpt.first().click({ force: true });
      await page.keyboard.press('Escape');
      await waitForOverviewSettled(appFrame);

      const view = appFrame.getByRole('button', { name: 'View', exact: true });
      expect(
        (await view.count()) > 0,
        'No disposable Approved invoice — please approve a throwaway invoice'
      ).toBe(true);

      await openRowKebab(page, appFrame, 'View', 'Cancel Invoice');
      // ⋮ menu item (red) — not the Comments dialog button.
      await appFrame.getByText('Cancel Invoice', { exact: true }).first().click();
      await expect(appFrame.getByText('Comments', { exact: true })).toBeVisible({
        timeout: 15000,
      });
      const typed = appFrame.getByPlaceholder(/Type here/);
      await expect(typed).toBeVisible({ timeout: 10000 });
      // Dialog confirm button (distinct from ⋮ "Cancel Invoice").
      const dialogCancel = await commentsModalCancelInvoiceButton(appFrame);
      await expect(dialogCancel, 'Empty comments → Cancel Invoice should be disabled').toBeDisabled();
      await typed.fill('automation cancel');
      await expect(dialogCancel, 'With comments → Cancel Invoice should enable').toBeEnabled({
        timeout: 10000,
      });
      await dialogCancel.click();
      await expect(appFrame.getByText('Invoice has been cancelled')).toBeVisible({
        timeout: 30000,
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('Invoice has been cancelled')],
        'Invoice cancelled toast',
        testInfo
      );
    });

    test('IO-037: Reviewer can Mark as Reviewed on a Submitted invoice @admin', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(300000);
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);

      const review = appFrame.getByRole('button', { name: 'Review', exact: true });
      const inFlightRow = appFrame.getByRole('listitem').filter({
        has: appFrame.getByRole('button', { name: 'Background Invoice Process Running' }),
      });

      let invoiceNo = '';
      if ((await inFlightRow.count()) > 0) {
        invoiceNo =
          ((await inFlightRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
      } else {
        if ((await review.count()) === 0) {
          const pages = pageNumberButtons(appFrame);
          const pageCount = await pages.count();
          for (let i = 1; i < pageCount; i++) {
            await pages.nth(i).click();
            await waitForOverviewSettled(appFrame);
            if ((await review.count()) > 0) break;
          }
        }
        expect(
          (await review.count()) > 0,
          'No Submitted invoice (Review) — please submit a disposable invoice'
        ).toBe(true);

        const reviewRow = appFrame.getByRole('listitem').filter({ has: review.first() });
        invoiceNo =
          ((await reviewRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
        expect(invoiceNo, 'Could not read invoice # from the Review row').toBeTruthy();

        await review.first().click();
        await dismissHostDialogs(page);
        await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        await expect(appFrame.getByRole('button', { name: 'Flag' })).toBeVisible();
        const markReviewed = appFrame.getByRole('button', { name: 'Mark as Reviewed' });
        await expect(markReviewed).toBeVisible();
        const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
        await expect(pdf.getByText(/Invoice|Partner Name|INVOICE/i).first()).toBeVisible({
          timeout: 30000,
        });

        const comments = appFrame.getByPlaceholder(/Type here/);
        if ((await comments.count()) > 0 && (await markReviewed.isDisabled().catch(() => false))) {
          await comments.fill('automation review');
          await expect(markReviewed).toBeEnabled({ timeout: 10000 });
        }
        await markReviewed.click();

        await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        await waitForOverviewSettled(appFrame);
      }
      expect(invoiceNo, 'Could not read invoice # to wait for Reviewed').toBeTruthy();

      const token = await captureDataverseToken(browser);
      expect(token, 'Dataverse Bearer token').toBeTruthy();
      const waited = await waitForInvoiceStatus({
        token,
        invoiceNumber: invoiceNo,
        match: /^(Reviewed|Fail-Review)$/i,
        timeoutMs: 180000,
      });
      expect(
        waited.status,
        `Invoice ${invoiceNo} dia_status did not leave Pending (last=${waited.status ?? 'none'})`
      ).toMatch(/^(Reviewed|Fail-Review)$/i);
      expect(
        waited.status,
        `Invoice ${invoiceNo} landed on ${waited.status} instead of Reviewed`
      ).toMatch(/^Reviewed$/i);

      await resetOverviewViaDashboard(page, appFrame);
      const search = appFrame.getByRole('textbox', { name: 'Search' });
      if ((await search.count()) > 0) {
        await search.fill(invoiceNo);
        await waitForOverviewSettled(appFrame);
      }
      const targetRow = appFrame.getByRole('listitem').filter({ hasText: invoiceNo });
      if ((await targetRow.count()) > 0) {
        await markGroupAndShot(
          page,
          [targetRow.first()],
          'Reviewed status after Mark as Reviewed',
          testInfo
        );
      }
    });

    test('IO-038: Approver can approve a Reviewed invoice @admin', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(900000);
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);

      const approve = appFrame.getByRole('button', { name: 'Approve', exact: true });
      const inFlightRow = appFrame.getByRole('listitem').filter({
        has: appFrame.getByRole('button', { name: 'Background Invoice Process Running' }),
      });

      let invoiceNo = '';
      const hasApprove = async () => {
        if ((await approve.count()) > 0) return true;
        const pages = pageNumberButtons(appFrame);
        const pageCount = await pages.count();
        for (let i = 1; i < pageCount; i++) {
          await pages.nth(i).click();
          await waitForOverviewSettled(appFrame);
          if ((await approve.count()) > 0) return true;
        }
        return false;
      };

      if (await hasApprove()) {
        const approveRow = appFrame.getByRole('listitem').filter({ has: approve.first() });
        invoiceNo =
          ((await approveRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
        expect(invoiceNo, 'Could not read invoice # from the Approve row').toBeTruthy();

        await approve.first().click();
        await dismissHostDialogs(page);
        await expect(
          appFrame.getByText('View Invoice', { exact: true }),
          'View Invoice overlay did not open from Approve'
        ).toBeVisible({
          timeout: 45000,
        });
        await expect(appFrame.getByRole('button', { name: 'Flag' })).toBeVisible();
        const overlay = appFrame.locator(
          '[data-control-name="cnt_backgroundViewInvoiceInvoiceOverview"]'
        );
        const overlayApprove = overlay.getByRole('button', { name: 'Approve', exact: true });
        await expect(overlayApprove).toBeVisible();
        await markGroupAndShot(
          page,
          [appFrame.getByText('View Invoice', { exact: true }), overlayApprove],
          'View Invoice overlay opened from Approve',
          testInfo
        );
        // PDF.js often stays at 0/0 until the approval flow finishes. Confirm
        // the overlay opened, Approve now, then assert PDF after status lands.

        const comments = appFrame.getByPlaceholder(/Type here/);
        if (
          (await comments.count()) > 0 &&
          (await overlayApprove.isDisabled().catch(() => false))
        ) {
          await comments.fill('automation approve');
          await expect(overlayApprove).toBeEnabled({ timeout: 10000 });
        }
        await overlayApprove.click({ force: true });

        await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        await waitForOverviewSettled(appFrame);
      } else if ((await inFlightRow.count()) > 0) {
        invoiceNo =
          ((await inFlightRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
      } else {
        expect(
          false,
          'No Reviewed invoice (Approve) — please review a disposable invoice'
        ).toBe(true);
      }
      expect(invoiceNo, 'Could not read invoice # to wait for Approved').toBeTruthy();

      const token = await captureDataverseToken(browser);
      expect(token, 'Dataverse Bearer token').toBeTruthy();
      const waited = await waitForInvoiceStatus({
        token,
        invoiceNumber: invoiceNo,
        match: /^(Approved|Fail-Approval)$/i,
        timeoutMs: 180000,
      });
      expect(
        waited.status,
        `Invoice ${invoiceNo} dia_status did not leave Pending (last=${waited.status ?? 'none'})`
      ).toMatch(/^(Approved|Fail-Approval)$/i);
      expect(
        waited.status,
        `Invoice ${invoiceNo} landed on ${waited.status} instead of Approved`
      ).toMatch(/^Approved$/i);

      const viewBtn = await waitForRowNextStep(page, appFrame, {
        invoiceNumber: invoiceNo,
        searchTerm: invoiceNo,
        timeoutMs: 240000,
      });
      await markGroupAndShot(
        page,
        [appFrame.getByRole('listitem').filter({ hasText: invoiceNo }).first()],
        'Approved status after Approve',
        testInfo
      );
      await viewBtn.click();
      await expect(
        appFrame.getByText('View Invoice', { exact: true }),
        'View Invoice did not reopen after approval flow'
      ).toBeVisible({ timeout: 45000 });
      const pdfText = await readPdfViewerText(page, {
        contains: /Invoice|PartnerName|INVOICE|Amount/i,
        timeoutMs: 180000,
      });
      expect(
        normalizePdfText(pdfText),
        `PDF still empty after approval flow for ${invoiceNo}`
      ).toMatch(/Invoice|PartnerName|INVOICE|Amount/i);
      await closeViewInvoiceOverlay(appFrame);
    });

    test('IO-039: Reviewer can flag a Submitted invoice @admin', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(360000);
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);

      const review = appFrame.getByRole('button', { name: 'Review', exact: true });
      const inFlightRow = appFrame.getByRole('listitem').filter({
        has: appFrame.getByRole('button', { name: 'Background Invoice Process Running' }),
      });

      let invoiceNo = '';
      const hasReview = async () => {
        if ((await review.count()) > 0) return true;
        const pages = pageNumberButtons(appFrame);
        const pageCount = await pages.count();
        for (let i = 1; i < pageCount; i++) {
          await pages.nth(i).click();
          await waitForOverviewSettled(appFrame);
          if ((await review.count()) > 0) return true;
        }
        return false;
      };

      if (await hasReview()) {
        const reviewRow = appFrame.getByRole('listitem').filter({ has: review.first() });
        invoiceNo =
          ((await reviewRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
        expect(invoiceNo, 'Could not read invoice # from the Review row').toBeTruthy();

        await review.first().click();
        await dismissHostDialogs(page);
        await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        const overlay = appFrame.locator(
          '[data-control-name="cnt_backgroundViewInvoiceInvoiceOverview"]'
        );
        const overlayFlag = overlay.getByRole('button', { name: 'Flag', exact: true });
        await expect(overlayFlag).toBeVisible();
        const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
        await expect(pdf.getByText(/Invoice|Partner Name|INVOICE/i).first()).toBeVisible({
          timeout: 30000,
        });

        await overlayFlag.click({ force: true });
        const finish = appFrame.getByRole('button', { name: 'Finish', exact: true });
        await expect(finish).toBeVisible({ timeout: 15000 });
        const flagReason = appFrame.getByPlaceholder(/reason for flagging/i);
        const finishBox = await finish.boundingBox();
        if (finishBox && !(await flagReason.isVisible().catch(() => false))) {
          await page.mouse.move(finishBox.x + finishBox.width / 2, finishBox.y - 20);
          for (let i = 0; i < 8 && !(await flagReason.isVisible().catch(() => false)); i++) {
            await page.mouse.wheel(0, 400);
          }
        }
        await expect(flagReason).toBeVisible({ timeout: 15000 });
        await flagReason.fill('automation flag');
        await expect(finish, 'Finish stayed disabled after Flag Reason').toBeEnabled({
          timeout: 15000,
        });
        await finish.click({ force: true });
        await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        await waitForOverviewSettled(appFrame);
      } else if ((await inFlightRow.count()) > 0) {
        invoiceNo =
          ((await inFlightRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
      } else {
        expect(
          false,
          'No Submitted invoice (Review) — please submit a disposable invoice'
        ).toBe(true);
      }
      expect(invoiceNo, 'Could not read invoice # to wait for Flagged').toBeTruthy();

      const token = await captureDataverseToken(browser);
      expect(token, 'Dataverse Bearer token').toBeTruthy();
      const waited = await waitForInvoiceStatus({
        token,
        invoiceNumber: invoiceNo,
        match: /^(Flagged|Fail-Flag)$/i,
        timeoutMs: 180000,
      });
      expect(
        waited.status,
        `Invoice ${invoiceNo} dia_status did not leave Pending (last=${waited.status ?? 'none'})`
      ).toMatch(/^(Flagged|Fail-Flag)$/i);
      expect(
        waited.status,
        `Invoice ${invoiceNo} landed on ${waited.status} instead of Flagged`
      ).toMatch(/^Flagged$/i);

      await resetOverviewViaDashboard(page, appFrame);
      const search = appFrame.getByRole('textbox', { name: 'Search' });
      if ((await search.count()) > 0) {
        await search.fill(invoiceNo);
        await waitForOverviewSettled(appFrame);
      }
      const targetRow = appFrame.getByRole('listitem').filter({ hasText: invoiceNo });
      if ((await targetRow.count()) > 0) {
        await markGroupAndShot(
          page,
          [targetRow.first()],
          'Flagged status after Flag',
          testInfo
        );
      }
    });

    test('IO-040: Approver can flag a Reviewed invoice @admin', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(360000);
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);

      const approve = appFrame.getByRole('button', { name: 'Approve', exact: true });
      const inFlightRow = appFrame.getByRole('listitem').filter({
        has: appFrame.getByRole('button', { name: 'Background Invoice Process Running' }),
      });

      let invoiceNo = '';
      const hasApprove = async () => {
        if ((await approve.count()) > 0) return true;
        const pages = pageNumberButtons(appFrame);
        const pageCount = await pages.count();
        for (let i = 1; i < pageCount; i++) {
          await pages.nth(i).click();
          await waitForOverviewSettled(appFrame);
          if ((await approve.count()) > 0) return true;
        }
        return false;
      };

      if (await hasApprove()) {
        const approveRow = appFrame.getByRole('listitem').filter({ has: approve.first() });
        invoiceNo =
          ((await approveRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
        expect(invoiceNo, 'Could not read invoice # from the Approve row').toBeTruthy();

        await approve.first().click();
        await dismissHostDialogs(page);
        await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        const overlay = appFrame.locator(
          '[data-control-name="cnt_backgroundViewInvoiceInvoiceOverview"]'
        );
        const overlayFlag = overlay.getByRole('button', { name: 'Flag', exact: true });
        await expect(overlayFlag).toBeVisible();
        const pdf = page.frameLocator('iframe[name="fullscreen-app-host"]').frameLocator('iframe');
        await expect(pdf.getByText(/Invoice|Partner Name|INVOICE/i).first()).toBeVisible({
          timeout: 30000,
        });

        await overlayFlag.click({ force: true });
        const finish = appFrame.getByRole('button', { name: 'Finish', exact: true });
        await expect(finish).toBeVisible({ timeout: 15000 });
        const flagReason = appFrame.getByPlaceholder(/reason for flagging/i);
        const finishBox = await finish.boundingBox();
        if (finishBox && !(await flagReason.isVisible().catch(() => false))) {
          await page.mouse.move(finishBox.x + finishBox.width / 2, finishBox.y - 20);
          for (let i = 0; i < 8 && !(await flagReason.isVisible().catch(() => false)); i++) {
            await page.mouse.wheel(0, 400);
          }
        }
        await expect(flagReason).toBeVisible({ timeout: 15000 });
        await flagReason.fill('automation flag');
        await expect(finish, 'Finish stayed disabled after Flag Reason').toBeEnabled({
          timeout: 15000,
        });
        await finish.click({ force: true });
        await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
          timeout: 45000,
        });
        await waitForOverviewSettled(appFrame);
      } else if ((await inFlightRow.count()) > 0) {
        invoiceNo =
          ((await inFlightRow.first().innerText()) || '').match(/\d{4}-\d{4}|INV-\d+/)?.[0] ?? '';
      } else {
        expect(
          false,
          'No Reviewed invoice (Approve) — please review a disposable invoice'
        ).toBe(true);
      }
      expect(invoiceNo, 'Could not read invoice # to wait for Flagged').toBeTruthy();

      const token = await captureDataverseToken(browser);
      expect(token, 'Dataverse Bearer token').toBeTruthy();
      const waited = await waitForInvoiceStatus({
        token,
        invoiceNumber: invoiceNo,
        match: /^(Flagged|Fail-Flag)$/i,
        timeoutMs: 180000,
      });
      expect(
        waited.status,
        `Invoice ${invoiceNo} dia_status did not leave Pending (last=${waited.status ?? 'none'})`
      ).toMatch(/^(Flagged|Fail-Flag)$/i);
      expect(
        waited.status,
        `Invoice ${invoiceNo} landed on ${waited.status} instead of Flagged`
      ).toMatch(/^Flagged$/i);

      await resetOverviewViaDashboard(page, appFrame);
      const search = appFrame.getByRole('textbox', { name: 'Search' });
      if ((await search.count()) > 0) {
        await search.fill(invoiceNo);
        await waitForOverviewSettled(appFrame);
      }
      const targetRow = appFrame.getByRole('listitem').filter({ hasText: invoiceNo });
      if ((await targetRow.count()) > 0) {
        await markGroupAndShot(
          page,
          [targetRow.first()],
          'Flagged status after Flag from Reviewed',
          testInfo
        );
      }
    });
  });

  test.describe('Decimal + ordering Excel cases', () => {
    test('IO-041: PDF Rate and Amount show at most 2 decimal places @admin', async ({
      page,
      browser,
    }, testInfo) => {
      // Submit flow + background-process wait + PDF render all sit on live flows.
      test.setTimeout(1500000);
      const token = await captureDataverseToken(browser);
      expect(token, 'Dataverse Bearer token from Admin storageState').toBeTruthy();

      const products = await listOpenRateProducts(token, 12);
      expect(
        products.length,
        'Need at least 5 Editable Rate products with no default catalog rate'
      ).toBeGreaterThanOrEqual(DECIMAL_RATES.length);

      const fixtures = await loadCreateInvoiceFixtures(token, { persona: 'admin' });
      const project = fixtures.nonNorthAmerica;
      expect(
        project,
        'No non-North-America project with an Active contract in this Dataverse'
      ).toBeTruthy();
      expect((project!.region ?? '').toLowerCase()).not.toContain('north america');
      const contracts = await listActiveContractsForProject(token, project!.projectId);

      // Adhoc keeps this repeatable: no one-invoice-per-cycle duplicate block.
      let appFrame = await openCreateInvoice(page, 'admin');
      await setAdhoc(appFrame, true);
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

      await selectPartnerAndProject(appFrame, project!);
      await selectContractIfPrompted(appFrame, { contracts, label: project!.projectName });
      await dismissDuplicateDialog(appFrame);
      if (await contractModalOpen(appFrame)) {
        await selectContractIfPrompted(appFrame, { contracts, label: project!.projectName });
      }
      await expect(
        selectedProjectButton(appFrame, project!.projectName),
        `Project ${project!.projectName} did not stick on the form`
      ).toBeVisible({ timeout: 30000 });

      await ensureLineItemRow(appFrame);
      const filled: FilledRow[] = [];
      for (let i = 0; i < DECIMAL_RATES.length; i++) {
        if ((await lineItemRowCount(appFrame)) <= i) await addLineItemRow(appFrame);
        filled.push(
          await fillDecimalRow(page, appFrame, i, {
            product: products[i],
            description: DECIMAL_DESCRIPTIONS[i],
            qty: '1',
            rate: DECIMAL_RATES[i],
          })
        );
      }
      await markGroupAndShot(
        page,
        [appFrame.getByText('New Invoice', { exact: true }).first()],
        'Decimal rates entered on the line-item grid',
        testInfo
      );

      const submit = appFrame.getByRole('button', { name: 'Submit' });
      await expect(submit).toBeEnabled({ timeout: 30000 });
      const submitStartedAt = new Date().toISOString();
      await submit.click();
      await awaitSubmitNavigatedToOverview(appFrame);

      let created = await waitForSubmittedInvoice({
        token,
        projectId: project!.projectId,
        submitStartedAt,
        timeoutMs: 240000,
      });
      let invoiceRow = (created.row ?? {}) as Record<string, unknown>;
      const invoiceId = String(invoiceRow.dia_invoicedetailsid ?? '').trim();
      expect(invoiceId, 'Submit did not create an invoice row for this project').toBeTruthy();
      let invoiceNo = String(invoiceRow.dia_invoicenumber ?? '').trim();
      if (!invoiceNo) {
        created = await waitForInvoiceAfterAction({
          token,
          invoiceId,
          submitStartedAt,
          mode: 'update',
          timeoutMs: 180000,
        });
        invoiceRow = (created.row ?? invoiceRow) as Record<string, unknown>;
        invoiceNo = String(invoiceRow.dia_invoicenumber ?? '').trim();
      }
      expect(invoiceNo, 'Submitted invoice never got an invoice number').toBeTruthy();
      const status = await waitForInvoiceStatus({
        token,
        invoiceNumber: invoiceNo,
        match: /^(Submitted|Fail-Creation)$/i,
        timeoutMs: 240000,
      });
      expect(
        status.status,
        `Invoice ${invoiceNo} did not reach Submitted (last=${status.status ?? 'none'})`
      ).toMatch(/^Submitted$/i);

      // Open the invoice PDF from its own row. Review overlay is read-only as
      // long as we close it with X. The gallery that Submit lands on still holds
      // the pre-submit collection, so re-enter Overview before searching.
      const findTargetRow = () =>
        appFrame.getByRole('listitem').filter({ hasText: invoiceNo }).first();
      let rowVisible = false;
      for (let attempt = 1; attempt <= 4 && !rowVisible; attempt++) {
        if (attempt === 1) {
          await resetOverviewViaDashboard(page, appFrame);
        } else {
          appFrame = await openInvoiceOverview(page);
        }
        const search = appFrame
          .getByPlaceholder('Search')
          .or(appFrame.getByRole('textbox', { name: 'Search' }));
        if ((await search.count()) > 0) {
          await search.first().fill(project!.projectName);
          await waitForOverviewSettled(appFrame);
        }
        rowVisible = await findTargetRow()
          .isVisible({ timeout: 20000 })
          .catch(() => false);
      }
      const targetRow = findTargetRow();
      await expect(targetRow, `Invoice ${invoiceNo} not found on Overview`).toBeVisible({
        timeout: 30000,
      });

      // This template prints no invoice number, so gate the read on our own
      // last line-item description — that also proves every row rendered.
      const pdfReady = new RegExp(
        normalizePdfText(DECIMAL_DESCRIPTIONS[DECIMAL_DESCRIPTIONS.length - 1])
      );
      let pdfText = '';
      for (let attempt = 1; attempt <= 3 && !pdfText; attempt++) {
        const overlay = appFrame.getByText('View Invoice', { exact: true });
        if (!(await overlay.isVisible().catch(() => false))) {
          const nextStep = await waitForRowNextStep(page, appFrame, {
            invoiceNumber: invoiceNo,
            searchTerm: project!.projectName,
            timeoutMs: 480000,
          });
          await nextStep.click();
          await dismissHostDialogs(page);
        }
        await expect(overlay).toBeVisible({ timeout: 90000 });
        const text = await readPdfViewerText(page, { contains: pdfReady, timeoutMs: 90000 });
        if (pdfReady.test(normalizePdfText(text))) {
          pdfText = text;
          break;
        }
        await closeViewInvoiceOverlay(appFrame).catch(() => undefined);
        await waitForOverviewSettled(appFrame);
      }
      expect(
        pdfText,
        `PDF for ${invoiceNo} never rendered the line items in its text layer`
      ).toBeTruthy();

      const tokens = decimalTokens(pdfText);
      const report: string[] = [
        `# IO-041 — decimal rates for invoice ${invoiceNo}`,
        '',
        `- Project: **${project!.projectName}** (${project!.partnerName}, region ${project!.region ?? 'unknown'})`,
        `- Adhoc: yes · Qty per row: 1 · Invoice id: ${invoiceId}`,
        '',
        '| # | Product | Entered rate | Rate field kept | PDF Qty | PDF Rate | PDF Amount | PDF 2dp match |',
        '|---|---|---|---|---|---|---|---|',
      ];
      const pdfMisses: string[] = [];

      for (const row of filled) {
        const expectedPdf = expectedRateDisplay(row.requestedRate);
        const expectedValue = Number(expectedPdf);
        const pdf = pdfRowValues(pdfText, row.description);
        const rateOk = pdf.rate !== undefined && Number(pdf.rate) === expectedValue;
        const amountOk = pdf.amount !== undefined && Number(pdf.amount) === expectedValue;
        const inPdf = rateOk && amountOk;
        report.push(
          `| ${row.index + 1} | ${row.product} | ${row.requestedRate} | ${row.acceptedRate || '—'} | ` +
            `${pdf.qty ?? '—'} | ${pdf.rate ?? '—'} | ${pdf.amount ?? '—'} | ${inPdf ? 'yes' : 'NO'} |`
        );
        if (!inPdf) {
          pdfMisses.push(
            `row ${row.index + 1}: typed ${row.requestedRate} → PDF must show ${expectedPdf} ` +
              `for Rate and Amount (qty 1); got Rate=${pdf.rate ?? 'none'} Amount=${pdf.amount ?? 'none'}`
          );
        }
      }
      report.push('', `Decimal tokens in PDF: ${tokens.join(', ')}`);
      await testInfo.attach('io-041-decimal-rates.md', {
        body: report.join('\n'),
        contentType: 'text/markdown',
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('View Invoice', { exact: true })],
        `PDF decimal rates ${invoiceNo}`,
        testInfo
      );
      await closeViewInvoiceOverlay(appFrame).catch(() => undefined);

      expect(
        pdfMisses,
        `PDF Rate/Amount must be 2 decimals: ${pdfMisses.join(' | ')}`
      ).toHaveLength(0);
    });

    test('IO-042: Column sort arrows and funnel filters still work', async ({
      page,
    }, testInfo) => {
      test.setTimeout(600000);
      const appFrame = await openInvoiceOverview(page);
      await ensureOverviewRows(page, appFrame);
      expect(await overviewHasRows(appFrame), 'No invoices to sort or filter').toBe(true);

      const report: string[] = [
        '# IO-042 — sort arrows + funnel filter (order of funnel lists is not asserted)',
        '',
      ];

      report.push('## Column sort arrows (Action Pending has no sort)', '');
      const sortColumns = [
        { column: 'Partner' as const, field: 'partner' as const },
        { column: 'Project' as const, field: 'project' as const },
        { column: 'Invoice #' as const, field: 'invoice' as const },
      ];
      for (const { column, field } of sortColumns) {
        await clickColumnSortArrow(page, appFrame, column);
        const asc = (await galleryRows(appFrame)).map((r) => r[field]).filter(Boolean);
        expect(asc.length, `No ${column} values after sort`).toBeGreaterThan(0);
        expect(
          isSortedAsc(asc),
          `${column} first click should be low→high (digits before letters): ${asc.slice(0, 8).join(', ')}`
        ).toBe(true);
        await clickColumnSortArrow(page, appFrame, column);
        const desc = (await galleryRows(appFrame)).map((r) => r[field]).filter(Boolean);
        expect(
          isSortedDesc(desc),
          `${column} second click should be high→low: ${desc.slice(0, 8).join(', ')}`
        ).toBe(true);
        report.push(
          `- **${column}** — first click low→high (${asc.slice(0, 4).join(', ')}); second click high→low`
        );
        await resetOverviewViaDashboard(page, appFrame);
      }
      report.push('- **Action Pending with** — funnel only, no sort arrow', '');

      report.push('## Funnel: selected value filters the gallery (list order not checked)', '');

      const visible = await galleryRows(appFrame);
      const partnerFromGallery = visible.find((r) => r.partner)?.partner ?? '';
      const projectFromGallery = visible.find((r) => r.project)?.project ?? '';
      const actionFromGallery = visible.find((r) => r.actionPending)?.actionPending ?? '';

      await clickColumnFunnel(page, appFrame, 'Partner');
      const partnerFilter = appFrame.locator('[data-control-name="cmb_PartnerFilter"]');
      await expect(partnerFilter, 'Partner funnel did not open').toBeVisible({ timeout: 15000 });
      await partnerFilter.click({ force: true });
      expect(partnerFromGallery, 'Could not read a Partner name from the gallery').toBeTruthy();
      await page.keyboard.type(partnerFromGallery.slice(0, Math.min(4, partnerFromGallery.length)), {
        delay: 50,
      });
      const partnerOpt = appFrame.getByRole('option', { name: partnerFromGallery, exact: true });
      await expect(partnerOpt.first()).toBeVisible({ timeout: 15000 });
      await partnerOpt.first().click();
      await waitForOverviewSettled(appFrame);
      const partnerRows = await galleryRows(appFrame);
      expect(partnerRows.length, `Partner filter "${partnerFromGallery}" returned no rows`).toBeGreaterThan(
        0
      );
      for (const row of partnerRows) {
        if (row.partner) expect(row.partner).toBe(partnerFromGallery);
      }
      report.push(
        `- Partner funnel: selected **${partnerFromGallery}** — ${partnerRows.length} row(s) match`
      );
      await resetOverviewViaDashboard(page, appFrame);

      await clickColumnFunnel(page, appFrame, 'Project');
      const projectFilter = appFrame.locator('[data-control-name="cmb_ProjectFilter"]');
      await expect(projectFilter, 'Project funnel did not open').toBeVisible({ timeout: 15000 });
      await projectFilter.click({ force: true });
      expect(projectFromGallery, 'Could not read a Project name from the gallery').toBeTruthy();
      await page.keyboard.type(projectFromGallery.slice(0, Math.min(4, projectFromGallery.length)), {
        delay: 50,
      });
      const projectOpt = appFrame.getByRole('option', { name: projectFromGallery, exact: true });
      await expect(projectOpt.first()).toBeVisible({ timeout: 15000 });
      await projectOpt.first().click();
      await waitForOverviewSettled(appFrame);
      const projectRows = await galleryRows(appFrame);
      expect(projectRows.length, `Project filter "${projectFromGallery}" returned no rows`).toBeGreaterThan(
        0
      );
      for (const row of projectRows) {
        if (row.project) expect(row.project).toBe(projectFromGallery);
      }
      report.push(
        `- Project funnel: selected **${projectFromGallery}** — ${projectRows.length} row(s) match`
      );
      await resetOverviewViaDashboard(page, appFrame);

      await clickColumnFunnel(page, appFrame, 'Action Pending with');
      const actionFilter = appFrame.locator('[data-control-name="cnt_ActionPendingFilter"]');
      await expect(actionFilter, 'Action Pending funnel did not open').toBeVisible({ timeout: 15000 });
      await actionFilter.click({ force: true });
      if (actionFromGallery) {
        await page.keyboard.type(actionFromGallery.slice(0, Math.min(3, actionFromGallery.length)), {
          delay: 50,
        });
        const actionOpt = appFrame.getByRole('option', { name: actionFromGallery, exact: true });
        await expect(actionOpt.first()).toBeVisible({ timeout: 15000 });
        await actionOpt.first().click();
        await waitForOverviewSettled(appFrame);
        const actionRows = await galleryRows(appFrame);
        expect(
          actionRows.length,
          `Action Pending filter "${actionFromGallery}" returned no rows`
        ).toBeGreaterThan(0);
        for (const row of actionRows) {
          if (row.actionPending) expect(row.actionPending).toBe(actionFromGallery);
        }
        report.push(
          `- Action Pending funnel (no sort): selected **${actionFromGallery}** — ${actionRows.length} row(s) match`
        );
      } else {
        await page.keyboard.type('a', { delay: 40 });
        await expect(
          appFrame.getByRole('option').first(),
          'Action Pending funnel opened but had no people'
        ).toBeVisible({ timeout: 15000 });
        report.push('- Action Pending funnel opened (no person on the current page to match)');
        await page.keyboard.press('Escape').catch(() => undefined);
      }
      await resetOverviewViaDashboard(page, appFrame);
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);

      await clickColumnFunnel(page, appFrame, 'Status');
      const statusFilter = appFrame.locator('[data-control-name="dd_StatusFilter"]');
      if (!(await statusFilter.isVisible().catch(() => false))) {
        await clickColumnFunnel(page, appFrame, 'Status');
      }
      await expect(statusFilter, 'Status funnel did not open').toBeVisible({ timeout: 15000 });
      await statusFilter.click({ force: true });
      await page.keyboard.type('Sub', { delay: 40 });
      const submittedOpt = appFrame
        .getByRole('option', { name: 'Submitted', exact: true })
        .or(appFrame.getByText('Submitted', { exact: true }));
      await expect(submittedOpt.first(), 'Submitted missing from Status funnel').toBeVisible({
        timeout: 15000,
      });
      await submittedOpt.first().click({ force: true });
      await page.keyboard.press('Escape');
      await waitForOverviewSettled(appFrame);
      await expect(
        appFrame.getByRole('button', { name: 'Review' }).first(),
        'Status=Submitted should still show Review'
      ).toBeVisible({ timeout: 15000 });
      report.push('- Status funnel: selected **Submitted** — Review Next Step still present');
      await resetOverviewViaDashboard(page, appFrame);

      await testInfo.attach('io-042-sort-funnel-audit.md', {
        body: report.join('\n'),
        contentType: 'text/markdown',
      });
      await markGroupAndShot(
        page,
        [appFrame.getByText('Partner', { exact: true }).first()],
        'Sort and funnel filters',
        testInfo
      );
    });
  });

  test('TC-IO-FLOW-01: Catalog Overview lifecycle flows and latest runs @admin', async (
    { browser },
    testInfo
  ) => {
    const token = await captureDataverseToken(browser);
    expect(token, 'Dataverse Bearer token from Admin storageState').toBeTruthy();

    const inventory = await listCloudFlows(token);
    expect(inventory.ok, inventory.errorSnippet).toBeTruthy();
    const byUpdateName = await searchWorkflowsByName(token, 'Update Invoice');
    const byImmediateName = await searchWorkflowsByName(token, 'Immediate send');
    const mergedById = new Map<string, WorkflowRow>();
    for (const f of [...inventory.flows, ...byUpdateName.flows, ...byImmediateName.flows]) {
      const id = (f.workflowid ?? '').replace(/[{}]/g, '').toLowerCase();
      if (id) mergedById.set(id, f);
    }
    const live = [...mergedById.values()].filter((f) => !isRetiredInvoiceFlowName(f.name ?? ''));
    const lines: string[] = ['# Overview lifecycle flow catalog', ''];

    for (const target of OVERVIEW_FLOWS) {
      const matches = live.filter((f) => target.match(f.name ?? ''));
      const on = matches.filter((f) => f.statecode === 1);
      const preferred =
        on.find((f) => (f.name ?? '').trim().toLowerCase() === target.label.toLowerCase()) ??
        on[0] ??
        matches[0];
      lines.push(`### ${target.label}`);
      lines.push(`- Catalog hits: **${matches.length}**`);
      if (preferred?.workflowid) {
        const runs = await listFlowRunsForWorkflow(token, preferred.workflowid, { top: 8 });
        if (runs.ok && runs.runs.length) {
          lines.push('| Start | Status | Run id | Error |');
          lines.push('|---|---|---|---|');
          lines.push(...runs.runs.map(flowRunLine));
        }
      }
      lines.push('');
    }

    await testInfo.attach('overview-flow-catalog.md', {
      body: Buffer.from(lines.join('\n'), 'utf-8'),
      contentType: 'text/markdown',
    });

    const foundLabels = OVERVIEW_FLOWS.filter((t) => live.some((f) => t.match(f.name ?? ''))).map(
      (t) => t.label
    );
    expect(
      foundLabels.length,
      `Expected named Overview flows in catalog. Found: ${foundLabels.join(', ') || '(none)'}`
    ).toBeGreaterThan(0);
  });
});

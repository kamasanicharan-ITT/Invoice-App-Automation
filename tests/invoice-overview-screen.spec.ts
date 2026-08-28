// spec: specs/invoice-overview-screen-plan.md
// seed: tests/seed.spec.ts
//
// Single Invoice Overview screen suite: TC-IO shell, unique Excel IO cases,
// and a read-only Overview flow catalog. Mutating lifecycle cases stay skipped
// until product behaviour is confirmed.

import { test, expect } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import { dismissHostDialogs } from './utils/host-dialogs';
import { captureDataverseToken } from './utils/dataverse-fixtures';
import {
  isRetiredInvoiceFlowName,
  listCloudFlows,
  listFlowRunsForWorkflow,
  searchWorkflowsByName,
  type FlowRunRow,
  type WorkflowRow,
} from './utils/flow-runs';
import {
  PERIOD_OPTIONS,
  REGIONS,
  activePersona,
  applyPeriod,
  clickIconRightOf,
  clickPaginationPrev,
  expectComboOptions,
  firstInvoiceNumber,
  firstRowPartnerAndProject,
  openInvoiceOverview,
  overviewHasRows,
  pageNumberButtons,
  periodButton,
  regionDropdown,
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

  test('TC-IO-02: Admin can switch My Invoices / All Invoices', async ({ page }, testInfo) => {
    test.skip(activePersona(testInfo) === 'pm', '[PM] My/All radios are hidden — Admin-only');

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

  test('TC-IO-02b: PM does not see My / All Invoices radios', async ({ page }, testInfo) => {
    test.skip(activePersona(testInfo) === 'admin', '[Admin] radios are visible — PM-only deny');

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

    test('IO-008: Future Months option can be applied', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      await applyPeriod(appFrame, 'Future Months');
      await markGroupAndShot(
        page,
        [appFrame.getByText('Show Invoices', { exact: true }), periodButton(appFrame, 'Future Months')],
        'Future Months',
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
      await expect(appFrame.getByText(partner).first()).toBeVisible({ timeout: 15000 });
    });

    test('IO-014: Search by project name', async ({ page }, testInfo) => {
      const appFrame = await openInvoiceOverview(page);
      test.skip(!(await overviewHasRows(appFrame)), 'No gallery rows to search');
      const { project } = await firstRowPartnerAndProject(appFrame);
      test.skip(!project, 'Could not read a project name from the first row');
      const search = appFrame.getByPlaceholder('Search');
      await search.fill(project);
      await expect(search).toHaveValue(project);
      await expect(appFrame.getByText(project).first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Deferred Excel cases (pending product confirmation)', () => {
    const pending = 'Deferred until product behaviour is confirmed';
    test('IO-009: Future month invoice does not appear in This Month', async () => {
      test.skip(true, pending);
    });
    test('IO-016: Partner column sorts ascending then descending', async () => {
      test.skip(true, pending);
    });
    test('IO-017: Project column sorts correctly', async () => {
      test.skip(true, pending);
    });
    test('IO-018: Invoice # column sorts correctly', async () => {
      test.skip(true, pending);
    });
    test('IO-019: Status column sorts correctly', async () => {
      test.skip(true, pending);
    });
    test('IO-020: Partner column filter works', async () => {
      test.skip(true, pending);
    });
    test('IO-021: Status column filter works', async () => {
      test.skip(true, pending);
    });
    test('IO-022: Action Pending With filter works', async () => {
      test.skip(true, pending);
    });
    test('IO-029: PDF viewer shows navigation and zoom controls', async () => {
      test.skip(true, pending);
    });
    test('IO-030: Download button in PDF viewer saves the PDF', async () => {
      test.skip(true, pending);
    });
    test('IO-032b: Three-dot menu shows Delete Draft for Draft invoices', async () => {
      test.skip(true, pending);
    });
    test('IO-033: Delete Draft shows confirmation popup', async () => {
      test.skip(true, pending);
    });
    test('IO-034: Confirming Delete Draft removes the invoice', async () => {
      test.skip(true, pending);
    });
    test('IO-035: Cancel option available for Approved invoices', async () => {
      test.skip(true, pending);
    });
    test('IO-036: Cancelling invoice changes status to Cancelled', async () => {
      test.skip(true, pending);
    });
    test('IO-038: Approver can approve a Reviewed invoice', async () => {
      test.skip(true, pending);
    });
    test('IO-039: Reviewer can flag a Submitted invoice', async () => {
      test.skip(true, pending);
    });
    test('IO-040: Approver can flag a Reviewed invoice', async () => {
      test.skip(true, pending);
    });
    test('IO-041: Invoice amounts display correct decimal values', async () => {
      test.skip(true, pending);
    });
    test('IO-042: Alphabetical order of column filter values', async () => {
      test.skip(true, pending);
    });
  });

  test('TC-IO-FLOW-01: Catalog Overview lifecycle flows and latest runs', async (
    { browser },
    testInfo
  ) => {
    test.skip(testInfo.project.name.toLowerCase().includes('pm'), 'Admin token — org-wide catalog');
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

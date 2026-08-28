// spec: specs/invoice-overview-test-plan.md
// seed: tests/seed.spec.ts
//
// Invoice Overview suite — Admin (you) vs PM (teammate).
// Same shell for both; My Invoices / All Invoices radios are Admin-only.
// TC-IO-20 / TC-IO-27: Review overlay (View Invoice) and header refresh — do not Flag / Mark as Reviewed.
// Persona is inferred from Playwright project name (same pattern as dashboard.spec.ts).
// URLs/auth come from config/env.ts (ENV=dev|sit|qa|uat).

import { test, expect, type Page, type FrameLocator, type Locator, type TestInfo } from '@playwright/test';
import { APP_URL } from '../config/env';
import { markGroupAndShot } from './utils/screenshot';
import { dismissHostDialogs, dismissHostDialogsSettling } from './utils/host-dialogs';

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

const INVOICE_NUMBER = /\d{4}-\d{4}|INV-\d+/;

async function clickIconRightOf(page: Page, label: Locator): Promise<void> {
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (!box) throw new Error(`No bounding box for ${await label.textContent()}`);
  await page.mouse.click(box.x + box.width + 18, box.y + box.height / 2);
}

type Persona = 'admin' | 'pm';

// ─────────────────────────────────────────────────────────────────────────────
// Persona helpers (mirror dashboard.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

function personaFromProjectName(projectName: string): Persona {
  return projectName.toLowerCase().includes('pm') ? 'pm' : 'admin';
}

function activePersona(testInfo: TestInfo): Persona {
  return personaFromProjectName(testInfo.project.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openInvoiceOverview(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

  await dismissHostDialogsSettling(page);

  try {
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });
  } catch {
    await dismissHostDialogs(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissHostDialogsSettling(page);
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
  }

  await dismissHostDialogs(page);
  await appFrame.getByRole('button', { name: 'Invoice Overview' }).first().click();
  await dismissHostDialogs(page);
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 30000,
  });

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
  return appFrame.getByRole('button', { name: label });
}

function pageNumberButtons(appFrame: FrameLocator) {
  return appFrame.getByRole('button', { name: /^\d+$/ });
}

function scopeRadios(appFrame: FrameLocator) {
  return {
    group: appFrame.getByRole('radiogroup'),
    my: appFrame.getByRole('radio', { name: 'My Invoices' }),
    all: appFrame.getByRole('radio', { name: 'All Invoices' }),
  };
}

async function clickPaginationPrev(page: Page, appFrame: FrameLocator): Promise<void> {
  const lowest = pageNumberButtons(appFrame).first();
  await expect(lowest).toBeVisible({ timeout: 15000 });
  const box = await lowest.boundingBox();
  if (!box) throw new Error('Pagination page button has no bounding box');
  await page.mouse.click(box.x - 20, box.y + box.height / 2);
}

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

async function overviewHasRows(appFrame: FrameLocator): Promise<boolean> {
  return (
    (await appFrame.getByText(INVOICE_NUMBER).count()) > 0 ||
    (await appFrame.getByText(/^Item\s*\d+/).count()) > 0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

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
});

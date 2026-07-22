// spec: specs/dashboard-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect, request, type Page, type FrameLocator, type Request, type TestInfo } from '@playwright/test';
import { markAndShot, markGroupAndShot } from './utils/screenshot';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';
const INVOICE_TABLE = 'dia_invoicedetailses';

/** Actionable statuses that roll up into the Dashboard "Total Tasks" tile. */
const TOTAL_TASKS_FILTER =
  `(dia_status eq 'Draft' or dia_status eq 'Flagged' or (dia_status eq 'Submitted' and dia_adhocinvoice eq true) or dia_status eq 'Reviewed' or dia_status eq 'Approved' or dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review')`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current billing-cycle date range: 6th of the cycle month → 5th of the
 * following month. If today is before the 6th, the active cycle started on the 6th of the
 * PREVIOUS month. The window intentionally INCLUDES future-dated invoices up to the 5th of
 * next month — the dashboard shows them, so we must not cap the end at "today".
 */
function getBillingCycleDates(): { start: string; end: string } {
  const today = new Date();
  const anchorMonth = today.getDate() >= 6 ? today.getMonth() : today.getMonth() - 1;
  const start = new Date(today.getFullYear(), anchorMonth, 6, 0, 0, 0);
  const end = new Date(today.getFullYear(), anchorMonth + 1, 5, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Calls the Dataverse Web API and returns the record count for a status filter, applying the
 * exact rules the dashboard uses for its Invoice Tasks tiles:
 *   - the current billing-cycle window on `dia_invoicedate`
 *   - `dia_isreported eq null` when `requireUnreported` is true (per-status tiles; reported
 *     invoices leave those rows). Total Tasks does NOT exclude reported Fail invoices — pass
 *     `requireUnreported: false` for TC-DV-09.
 * The Submitted tile additionally scopes to adhoc invoices — pass that clause inside
 * `filterExpression` (see TC-DV-02 / TC-DV-09).
 */
async function getDataverseCount(
  token: string,
  filterExpression: string,
  options: { requireUnreported?: boolean } = {}
): Promise<number> {
  const { requireUnreported = true } = options;
  const { start, end } = getBillingCycleDates();
  const dateFilter = `dia_invoicedate ge ${start} and dia_invoicedate le ${end}`;
  const reportedFilter = requireUnreported ? ' and dia_isreported eq null' : '';
  const fullFilter = `(${filterExpression}) and ${dateFilter}${reportedFilter}`;

  const apiContext = await request.newContext();
  const response = await apiContext.get(
    `${DATAVERSE_URL}/api/data/v9.2/${INVOICE_TABLE}?$filter=${encodeURIComponent(
      fullFilter
    )}&$count=true&$top=1&$select=dia_invoicedetailsid`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer: 'odata.include-annotations="*"',
      },
    }
  );

  if (!response.ok()) {
    console.log(`Dataverse error [${filterExpression}]:`, (await response.text()).slice(0, 300));
    return -1;
  }

  const data = await response.json();
  return data['@odata.count'] ?? -1;
}

/**
 * Waits for Invoice Tasks data to finish loading via Playwright auto-wait (no sleep).
 * Before data loads the section shows a "0 Total Task" placeholder and no status rows;
 * Drafts only appears once real counts are populated.
 */
async function waitForDashboardReady(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Region', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText(/\d+\s*Drafts?/).first()).toBeVisible({ timeout: 30000 });
}

/**
 * Navigates to the app and waits until the Dashboard (including task counts) is ready.
 */
async function openDashboard(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await waitForDashboardReady(appFrame);
  return appFrame;
}

/**
 * Reads the numeric count for a matching Invoice Tasks label after the section is ready.
 * Relies on Playwright auto-wait (`expect` / `textContent` timeouts) — no `waitForTimeout`.
 * Extracts the digit from the matched label substring (not the first digit in a broader
 * parent textContent), so values like "107 Total Tasks" are not confused with nearby numbers.
 */
async function getDashboardTaskCount(
  appFrame: FrameLocator,
  labelPattern: RegExp
): Promise<number> {
  const row = appFrame.getByText(labelPattern).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  const text = await row.textContent();
  const labelMatch = text?.match(labelPattern);
  const digits = labelMatch?.[0].match(/\d+/);
  return digits ? Number(digits[0]) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard Screen', () => {
  // ── UI Structure ─────────────────────────────────────────────────────────

  test('TC-DB-01: Dashboard header and navigation are visible', async ({ page }, testInfo) => {
    // Open the app and land on the Dashboard
    const appFrame = await openDashboard(page);

    const dashboardHeader = appFrame.getByText('Dashboard', { exact: true }).first();
    const dashboardNav = appFrame.getByRole('button', { name: 'Dashboard' });
    const overviewNav = appFrame.getByRole('button', { name: 'Invoice Overview' });
    const createNav = appFrame.getByRole('button', { name: 'Create Invoice' }).first();

    await expect.soft(dashboardHeader).toBeVisible();
    await expect.soft(dashboardNav).toBeVisible();
    await expect.soft(overviewNav).toBeVisible();
    await expect.soft(createNav).toBeVisible();

    // Mark the full navigation strip (all screen links), not just the Dashboard label
    await test.step('Dashboard navigation header', async () => {
      await markGroupAndShot(
        page,
        [dashboardNav, overviewNav, createNav],
        'Dashboard navigation header',
        testInfo,
      );
    });
  });

  test('TC-DB-02: All four summary cards are visible', async ({ page }, testInfo) => {
    // Verify the four summary cards and their This/Last Month sub-labels
    const appFrame = await openDashboard(page);

    const totalInvoices = appFrame.getByText('Total Invoices', { exact: true });
    const totalPartners = appFrame.getByText('Total Partners', { exact: true });
    const totalProject = appFrame.getByText('Total Project', { exact: true });
    const totalRevenue = appFrame.getByText('Total Revenue', { exact: true });
    const thisMonth = appFrame.getByText('This Month').first();
    const lastMonth = appFrame.getByText('Last Month').nth(3);

    await expect.soft(totalInvoices).toBeVisible();
    await expect.soft(totalPartners).toBeVisible();
    await expect.soft(totalProject).toBeVisible();
    await expect.soft(totalRevenue).toBeVisible();
    await expect.soft(thisMonth).toBeVisible();
    await expect.soft(appFrame.getByText('Last Month').first()).toBeVisible();

    // One mark covering the full card strip (labels + counts + This/Last Month)
    await test.step('Summary cards', async () => {
      await markGroupAndShot(
        page,
        [totalInvoices, totalPartners, totalProject, totalRevenue, thisMonth, lastMonth],
        'Summary cards (labels, counts, This/Last Month)',
        testInfo,
        { padding: 10 },
      );
    });
  });

  test('TC-DB-03: Invoice Tasks section has all 9 rows and action buttons', async ({ page }, testInfo) => {
    // Verify the Invoice Tasks section and every task row (count via regex + its button)
    const appFrame = await openDashboard(page);

    const sectionHeader = appFrame.getByText('Invoice Tasks', { exact: true });
    await expect.soft(sectionHeader).toBeVisible();

    const taskRows = [
      { labelPattern: /\d+\s*Total\s*Tasks?/, buttonName: 'View All' },
      { labelPattern: /\d+\s*Drafts?/, buttonName: 'View Drafts' },
      { labelPattern: /\d+\s*Flagged/, buttonName: 'View Flagged' },
      { labelPattern: /\d+\s*Submitted/, buttonName: 'View Submitted' },
      { labelPattern: /\d+\s*Reviewed/, buttonName: 'View Reviewed' },
      { labelPattern: /\d+\s*Approved/, buttonName: 'View Approved' },
      { labelPattern: /\d+\s*Failed/, buttonName: 'View Failed' },
      { labelPattern: /\d+\s*Cancelled/, buttonName: 'View Cancelled' },
      { labelPattern: /\d+\s*Sent/, buttonName: 'View Sent' },
    ];

    for (const row of taskRows) {
      await expect.soft(appFrame.getByText(row.labelPattern).first()).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: row.buttonName })).toBeVisible();
    }

    // Two group shots (section is taller than one viewport): upper then lower rows
    const upperLabels = taskRows.slice(0, 5).map((r) => appFrame.getByText(r.labelPattern).first());
    const upperButtons = taskRows.slice(0, 5).map((r) => appFrame.getByRole('button', { name: r.buttonName }));
    const lowerLabels = taskRows.slice(5).map((r) => appFrame.getByText(r.labelPattern).first());
    const lowerButtons = taskRows.slice(5).map((r) => appFrame.getByRole('button', { name: r.buttonName }));

    await test.step('Invoice Tasks upper rows', async () => {
      await markGroupAndShot(
        page,
        [sectionHeader, ...upperLabels, ...upperButtons],
        'Invoice Tasks (upper rows)',
        testInfo,
        { padding: 8 },
      );
    });

    await test.step('Invoice Tasks lower rows', async () => {
      await markGroupAndShot(
        page,
        [...lowerLabels, ...lowerButtons],
        'Invoice Tasks (lower rows)',
        testInfo,
        { padding: 8 },
      );
    });
  });

  test('TC-DB-04: Region dropdown shows all 8 regions', async ({ page }, testInfo) => {
    // Open the Region dropdown (placeholder "." button) and verify all region options
    const appFrame = await openDashboard(page);

    const regionControl = appFrame.getByRole('button', { name: '.', exact: true });
    await regionControl.click();

    const regions = [
      'Australia', 'Colombia', 'India', 'Netherlands',
      'North America', 'Saudi Arabia', 'South Korea', 'UAE',
    ];
    const options = regions.map((region) => appFrame.getByRole('option', { name: region }));
    for (const option of options) {
      await expect.soft(option).toBeVisible();
    }

    // Mark the full open dropdown list (first → last option), not a single option
    await test.step('Region dropdown options', async () => {
      await markGroupAndShot(
        page,
        [options[0], options[options.length - 1]],
        'Region dropdown (all 8 regions)',
        testInfo,
        { padding: 8 },
      );
    });
  });

  test('TC-DB-05: Region filter can be applied', async ({ page }, testInfo) => {
    // Open the Region dropdown, select India, and confirm the dashboard stays intact
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: '.', exact: true }).click();
    await appFrame.getByRole('option', { name: 'India' }).click();

    const selectedRegion = appFrame.getByRole('button', { name: 'India' });
    const regionLabel = appFrame.getByText('Region', { exact: true });
    await expect(selectedRegion).toBeVisible({ timeout: 15000 });
    await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible();

    await test.step('Region filter set to India', async () => {
      await markGroupAndShot(
        page,
        [regionLabel, selectedRegion],
        'Region filter set to India',
        testInfo,
      );
    });
  });

  test('TC-DB-06: Create Invoice button navigates to New Invoice screen', async ({ page }, testInfo) => {
    // Click Create Invoice and verify navigation to the form
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    const newInvoiceHeader = appFrame.getByText('New Invoice', { exact: true });
    await expect(newInvoiceHeader).toBeVisible({ timeout: 15000 });

    const brandNew = appFrame.getByText('Brand New', { exact: true });
    const findPartner = appFrame.getByText('Find Partner').first();
    const closeBtn = appFrame.getByRole('button', { name: 'Close' });
    const saveDraftBtn = appFrame.getByRole('button', { name: 'Save Draft' });
    const submitBtn = appFrame.getByRole('button', { name: 'Submit' });

    await expect(brandNew).toBeVisible({ timeout: 15000 });
    await expect(findPartner).toBeVisible({ timeout: 15000 });
    await expect(closeBtn).toBeVisible();
    await expect(saveDraftBtn).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Mark the full New Invoice form (header → partner field → action buttons)
    await test.step('New Invoice form', async () => {
      await markGroupAndShot(
        page,
        [newInvoiceHeader, brandNew, findPartner, closeBtn, saveDraftBtn, submitBtn],
        'New Invoice form',
        testInfo,
        { padding: 10 },
      );
    });
  });

  // ── Dataverse Data Validation (UI count == Dataverse count) ─────────────────

  test.describe('Dataverse Validation', () => {
    let dataverseToken = '';

    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage();

      // Capture the Bearer token the Canvas app uses when calling Dataverse
      const tokenPromise = new Promise<string>((resolve) => {
        const onRequest = (req: Request) => {
          const authHeader = req.headers()['authorization'];
          if (req.url().includes('crm8.dynamics.com') && authHeader?.startsWith('Bearer ')) {
            page.off('request', onRequest);
            resolve(authHeader.replace('Bearer ', ''));
          }
        };
        page.on('request', onRequest);
        setTimeout(() => resolve(''), 30000);
      });

      await page.goto(APP_URL);
      dataverseToken = await tokenPromise;

      const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
      await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
      await waitForDashboardReady(appFrame);
      await page.close();

      console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
    });

    async function assertTaskCountMatches(
      page: Page,
      testInfo: TestInfo,
      opts: { label: string; filter: string; pattern: RegExp; requireUnreported?: boolean }
    ): Promise<void> {
      const apiCount = await getDataverseCount(dataverseToken, opts.filter, {
        requireUnreported: opts.requireUnreported,
      });
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(appFrame, opts.pattern);
      const row = appFrame.getByText(opts.pattern).first();

      console.log(`${opts.label} — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);

      await test.step(`${opts.label} count`, async () => {
        await markAndShot(page, row, `${opts.label} count (UI ${uiCount} = DV ${apiCount})`, testInfo);
      });
    }

    test('TC-DV-01: Draft count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Drafts',
        filter: `dia_status eq 'Draft'`,
        pattern: /\d+\s*Drafts?/,
      });
    });

    test('TC-DV-02: Submitted count matches Dataverse', async ({ page }, testInfo) => {
      // Submitted tile is scoped to adhoc invoices only
      await assertTaskCountMatches(page, testInfo, {
        label: 'Submitted',
        filter: `dia_status eq 'Submitted' and dia_adhocinvoice eq true`,
        pattern: /\d+\s*Submitted/,
      });
    });

    test('TC-DV-03: Reviewed count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Reviewed',
        filter: `dia_status eq 'Reviewed'`,
        pattern: /\d+\s*Reviewed/,
      });
    });

    test('TC-DV-04: Approved count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Approved',
        filter: `dia_status eq 'Approved'`,
        pattern: /\d+\s*Approved/,
      });
    });

    test('TC-DV-05: Flagged count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Flagged',
        filter: `dia_status eq 'Flagged'`,
        pattern: /\d+\s*Flagged/,
      });
    });

    test('TC-DV-06: Failed count matches Dataverse', async ({ page }, testInfo) => {
      // Failed = any Fail-* status; the tile excludes already-reported invoices (isreported null)
      await assertTaskCountMatches(page, testInfo, {
        label: 'Failed',
        filter:
          `dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review'`,
        pattern: /\d+\s*Failed/,
      });
    });

    test('TC-DV-07: Cancelled count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Cancelled',
        filter: `dia_status eq 'Cancelled'`,
        pattern: /\d+\s*Cancelled/,
      });
    });

    test('TC-DV-08: Sent count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Sent',
        filter: `dia_status eq 'Sent'`,
        pattern: /\d+\s*Sent/,
      });
    });

    test('TC-DV-09: Total Tasks count matches Dataverse', async ({ page }, testInfo) => {
      // Total Tasks = actionable statuses (Draft/Flagged/Submitted+adhoc/Reviewed/Approved/Fail-*),
      // excluding Cancelled/Sent. Same `dia_isreported eq null` rule as the per-status tiles.
      // The Total Tasks label can briefly show a stale aggregate while tiles finish loading —
      // wait (via expect.poll, no sleep) until it matches the sum of the status rows on screen,
      // then compare that settled UI value to one Dataverse count.
      const apiCount = await getDataverseCount(dataverseToken, TOTAL_TASKS_FILTER);
      const appFrame = await openDashboard(page);

      const draft = await getDashboardTaskCount(appFrame, /\d+\s*Drafts?/);
      const flagged = await getDashboardTaskCount(appFrame, /\d+\s*Flagged/);
      const submitted = await getDashboardTaskCount(appFrame, /\d+\s*Submitted/);
      const reviewed = await getDashboardTaskCount(appFrame, /\d+\s*Reviewed/);
      const approved = await getDashboardTaskCount(appFrame, /\d+\s*Approved/);
      const failed = await getDashboardTaskCount(appFrame, /\d+\s*Failed/);
      const tileSum = draft + flagged + submitted + reviewed + approved + failed;

      await expect
        .poll(async () => getDashboardTaskCount(appFrame, /\d+\s*Total\s*Tasks?/), {
          timeout: 30000,
          message: 'Total Tasks should settle to the sum of actionable status tiles',
        })
        .toBe(tileSum);

      const uiCount = await getDashboardTaskCount(appFrame, /\d+\s*Total\s*Tasks?/);
      const row = appFrame.getByText(/\d+\s*Total\s*Tasks?/).first();
      console.log(`Total Tasks — UI: ${uiCount} | tileSum: ${tileSum} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);

      await test.step('Total Tasks count', async () => {
        await markAndShot(page, row, `Total Tasks count (UI ${uiCount} = DV ${apiCount})`, testInfo);
      });
    });
  });
});

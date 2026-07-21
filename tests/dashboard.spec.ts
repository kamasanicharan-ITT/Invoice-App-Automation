// spec: specs/dashboard-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect, request, type Page, type FrameLocator, type Request } from '@playwright/test';
import { markAndShot, shot } from './utils/screenshot';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';
const INVOICE_TABLE = 'dia_invoicedetailses';

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
 *   - `dia_isreported eq null` (reported invoices leave the task list)
 * The Submitted tile additionally scopes to adhoc invoices — pass that clause inside
 * `filterExpression` (see TC-DV-02).
 */
async function getDataverseCount(token: string, filterExpression: string): Promise<number> {
  const { start, end } = getBillingCycleDates();
  const dateFilter = `dia_invoicedate ge ${start} and dia_invoicedate le ${end}`;
  const fullFilter = `(${filterExpression}) and ${dateFilter} and dia_isreported eq null`;

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
 * Waits for the Invoice Tasks section to render, then reads and returns the numeric count for
 * the matching label. Returns 0 if the element is not found (valid when the count is 0).
 * This is the ONLY place `waitForTimeout` is permitted (counts populate after the header).
 */
async function getDashboardTaskCount(
  page: Page,
  appFrame: FrameLocator,
  labelPattern: RegExp
): Promise<number> {
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 30000 });
  // Readiness anchor: before data loads the section shows only a "0 Total Task" placeholder and
  // NO status rows. The per-status rows (e.g. Drafts) render only once real data has loaded, so
  // waiting for the Drafts row guarantees the counts are populated (not the placeholder).
  await expect(appFrame.getByText(/\d+\s*Drafts?/).first()).toBeVisible({ timeout: 30000 });
  try {
    const text = await appFrame.getByText(labelPattern).first().textContent({ timeout: 8000 });
    const match = text?.match(/\d+/);
    return match ? Number(match[0]) : 0;
  } catch {
    return 0;
  }
}

/**
 * Navigates to the app and waits for the Dashboard to be ready. Returns the app frame locator.
 */
async function openDashboard(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  return appFrame;
}

/**
 * Waits until the dashboard's data-driven sections are populated so screenshots capture real
 * values. The task counts populate last; wait for a numeric Total Tasks before capturing.
 */
async function waitForDashboardReady(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Region', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 30000 });
  // The per-status rows render only after data loads (the header briefly shows a "0 Total Task"
  // placeholder). Wait for the Drafts row so captures/reads see real values, not the placeholder.
  await expect(appFrame.getByText(/\d+\s*Drafts?/).first()).toBeVisible({ timeout: 30000 });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard Screen', () => {
  // ── UI Structure ─────────────────────────────────────────────────────────

  test('TC-DB-01: Dashboard header and navigation are visible', async ({ page }) => {
    // Open the app and land on the Dashboard
    const appFrame = await openDashboard(page);

    await expect.soft(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Invoice Overview' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Create Invoice' }).first()).toBeVisible();
  });

  test('TC-DB-02: All four summary cards are visible', async ({ page }) => {
    // Verify the four summary cards and their This/Last Month sub-labels
    const appFrame = await openDashboard(page);

    await expect.soft(appFrame.getByText('Total Invoices', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Partners', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Project', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Revenue', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('This Month').first()).toBeVisible();
    await expect.soft(appFrame.getByText('Last Month').first()).toBeVisible();
  });

  test('TC-DB-03: Invoice Tasks section has all 9 rows and action buttons', async ({ page }) => {
    // Verify the Invoice Tasks section and every task row (count via regex + its button)
    const appFrame = await openDashboard(page);
    await waitForDashboardReady(appFrame);

    await expect.soft(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible();

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
  });

  test('TC-DB-04: Region dropdown shows all 8 regions', async ({ page }) => {
    // Open the Region dropdown (placeholder "." button) and verify all region options
    const appFrame = await openDashboard(page);
    await waitForDashboardReady(appFrame);

    await appFrame.getByRole('button', { name: '.', exact: true }).click();

    const regions = [
      'Australia', 'Colombia', 'India', 'Netherlands',
      'North America', 'Saudi Arabia', 'South Korea', 'UAE',
    ];
    for (const region of regions) {
      await expect.soft(appFrame.getByRole('option', { name: region })).toBeVisible();
    }
  });

  test('TC-DB-05: Region filter can be applied', async ({ page }) => {
    // Open the Region dropdown, select India, and confirm the dashboard stays intact
    const appFrame = await openDashboard(page);
    await waitForDashboardReady(appFrame);

    await appFrame.getByRole('button', { name: '.', exact: true }).click();
    await appFrame.getByRole('option', { name: 'India' }).click();

    await expect(appFrame.getByRole('button', { name: 'India' })).toBeVisible({ timeout: 15000 });
    await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible();
  });

  test('TC-DB-06: Create Invoice button navigates to New Invoice screen', async ({ page }) => {
    // Click Create Invoice and verify navigation
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  // ── Marked screenshot evidence ─────────────────────────────────────────────

  test('TC-DB-07: Marked evidence of every Invoice Tasks row', async ({ page }, testInfo) => {
    // Load the dashboard fully, then capture an overview + a marked shot per status row
    const appFrame = await openDashboard(page);
    await waitForDashboardReady(appFrame);

    await test.step('Dashboard overview', async () => {
      await shot(page, 'Dashboard overview', testInfo);
    });

    const statusCases = [
      { name: 'Total Tasks count', regex: /\d+\s*Total\s*Tasks/ },
      { name: 'Draft count', regex: /\d+\s*Drafts?/ },
      { name: 'Flagged count', regex: /\d+\s*Flagged/ },
      { name: 'Submitted count', regex: /\d+\s*Submitted/ },
      { name: 'Reviewed count', regex: /\d+\s*Reviewed/ },
      { name: 'Approved count', regex: /\d+\s*Approved/ },
      { name: 'Failed count', regex: /\d+\s*Failed/ },
      { name: 'Cancelled count', regex: /\d+\s*Cancelled/ },
      { name: 'Sent count', regex: /\d+\s*Sent/ },
    ];

    for (const statusCase of statusCases) {
      await test.step(statusCase.name, async () => {
        const row = appFrame.getByText(statusCase.regex).first();
        await expect(row).toBeVisible({ timeout: 20000 });
        await markAndShot(page, row, statusCase.name, testInfo);
      });
    }
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
      await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(2000);
      await page.close();

      console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
    });

    test('TC-DV-01: Draft count matches Dataverse', async ({ page }) => {
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Draft'`);
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Drafts?/);
      console.log(`Drafts — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-02: Submitted count matches Dataverse', async ({ page }) => {
      // Submitted tile is scoped to adhoc invoices only
      const apiCount = await getDataverseCount(
        dataverseToken,
        `dia_status eq 'Submitted' and dia_adhocinvoice eq true`
      );
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Submitted/);
      console.log(`Submitted — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-03: Reviewed count matches Dataverse', async ({ page }) => {
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Reviewed'`);
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Reviewed/);
      console.log(`Reviewed — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-04: Approved count matches Dataverse', async ({ page }) => {
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Approved'`);
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Approved/);
      console.log(`Approved — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-05: Flagged count matches Dataverse', async ({ page }) => {
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Flagged'`);
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Flagged/);
      console.log(`Flagged — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-06: Failed count matches Dataverse', async ({ page }) => {
      // Failed = any Fail-* status; the tile excludes already-reported invoices (isreported null)
      const apiCount = await getDataverseCount(
        dataverseToken,
        `dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review'`
      );
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Failed/);
      console.log(`Failed — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-07: Cancelled count matches Dataverse', async ({ page }) => {
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Cancelled'`);
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Cancelled/);
      console.log(`Cancelled — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-08: Sent count matches Dataverse', async ({ page }) => {
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Sent'`);
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(page, appFrame, /\d+\s*Sent/);
      console.log(`Sent — UI: ${uiCount} | Dataverse: ${apiCount}`);
      expect(uiCount).toBe(apiCount);
    });

    test('TC-DV-09: Total Tasks equals the sum of actionable statuses', async ({ page }) => {
      // Total Tasks = Draft + Flagged + Submitted + Reviewed + Approved + Failed
      // (Cancelled and Sent are terminal and excluded from Total Tasks)
      const draft = await getDataverseCount(dataverseToken, `dia_status eq 'Draft'`);
      const flagged = await getDataverseCount(dataverseToken, `dia_status eq 'Flagged'`);
      const submitted = await getDataverseCount(
        dataverseToken,
        `dia_status eq 'Submitted' and dia_adhocinvoice eq true`
      );
      const reviewed = await getDataverseCount(dataverseToken, `dia_status eq 'Reviewed'`);
      const approved = await getDataverseCount(dataverseToken, `dia_status eq 'Approved'`);
      const failed = await getDataverseCount(
        dataverseToken,
        `dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review'`
      );
      const apiTotal = draft + flagged + submitted + reviewed + approved + failed;

      const appFrame = await openDashboard(page);
      const uiTotal = await getDashboardTaskCount(page, appFrame, /\d+\s*Total\s*Tasks?/);
      console.log(`Total Tasks — UI: ${uiTotal} | Dataverse (sum): ${apiTotal}`);
      expect(uiTotal).toBe(apiTotal);
    });
  });
});

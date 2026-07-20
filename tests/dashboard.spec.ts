// spec: specs/dashboard-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect, request, type Page, type FrameLocator, type Request } from '@playwright/test';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';
const INVOICE_TABLE = 'dia_invoicedetailses';

/**
 * Returns the billing-cycle date range for the current month.
 * Start: 6th of current month. End: 5th of next month.
 * Matches the exact date logic used by the Canvas app.
 */
function getBillingCycleDates(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 6, 0, 0, 0);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 5, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Calls the Dataverse API with the supplied OData filter expression
 * and returns the matching record count for the current billing cycle.
 */
async function getDataverseCount(token: string, filterExpression: string): Promise<number> {
  const { start, end } = getBillingCycleDates();
  const dateFilter = `dia_invoicedate ge ${start} and dia_invoicedate le ${end}`;
  const fullFilter = `(${filterExpression}) and ${dateFilter}`;

  const apiContext = await request.newContext();
  const response = await apiContext.get(
    `${DATAVERSE_URL}/api/data/v9.2/${INVOICE_TABLE}?$filter=${encodeURIComponent(fullFilter)}&$count=true&$top=1&$select=dia_invoicedetailsid`,
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
 * Waits for the Invoice Tasks section to fully render,
 * then reads and returns the numeric count for the matching label.
 * Returns 0 if the element is not found (valid when count is genuinely zero).
 */
async function getDashboardTaskCount(
  page: Page,
  appFrame: FrameLocator,
  labelPattern: RegExp
): Promise<number> {
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(2000);
  try {
    const text = await appFrame.getByText(labelPattern).first().textContent({ timeout: 8000 });
    const match = text?.match(/\d+/);
    return match ? Number(match[0]) : 0;
  } catch {
    return 0;
  }
}

/**
 * Navigates to the app and waits for the Dashboard to be ready.
 * Returns the iframe frame locator for use in all assertions.
 */
async function openDashboard(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  return appFrame;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard Screen', () => {

  // ── UI Structure Tests ──────────────────────────────────────────────────

  test('TC-DB-01: Dashboard header and navigation are visible', async ({ page }) => {
    const appFrame = await openDashboard(page);

    await expect.soft(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Invoice Overview' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Create Invoice' }).first()).toBeVisible();
  });

  test('TC-DB-02: All four summary cards are visible', async ({ page }) => {
    const appFrame = await openDashboard(page);

    await expect.soft(appFrame.getByText('Total Invoices', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Partners', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Project', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Total Revenue', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('This Month').first()).toBeVisible();
    await expect.soft(appFrame.getByText('Last Month').first()).toBeVisible();
  });

  test('TC-DB-03: Invoice Tasks section has all 9 rows and action buttons', async ({ page }) => {
    const appFrame = await openDashboard(page);

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
    const appFrame = await openDashboard(page);

    await appFrame.getByText('Region', { exact: true }).click();

    const regions = [
      'Australia', 'Colombia', 'India', 'Netherlands',
      'North America', 'Saudi Arabia', 'South Korea', 'UAE',
    ];

    for (const region of regions) {
      await expect.soft(appFrame.getByText(region, { exact: true })).toBeVisible();
    }
  });

  test('TC-DB-05: Create Invoice button navigates to New Invoice screen', async ({ page }) => {
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  // ── Dataverse Data Validation Tests ────────────────────────────────────

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
      await expect(appFrame.getByText('Invoice Tasks')).toBeVisible({ timeout: 20000 });
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
      const apiCount = await getDataverseCount(dataverseToken, `dia_status eq 'Submitted'`);
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
  });
});
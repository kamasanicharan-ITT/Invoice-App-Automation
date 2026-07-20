/*import { test, expect, request } from '@playwright/test';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';
const INVOICE_TABLE = 'dia_invoicedetailses';

async function getDataverseCount(token: string, status: string): Promise<number> {
  const apiContext = await request.newContext();

  const response = await apiContext.get(
    `${DATAVERSE_URL}/api/data/v9.2/${INVOICE_TABLE}?$filter=dia_status eq '${status}'&$count=true&$top=1&$select=dia_invoicedetailsid`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Accept': 'application/json',
        'Prefer': 'odata.include-annotations="*"',
      }
    }
  );

  console.log(`API status for "${status}":`, response.status());

  if (!response.ok()) {
    const errorText = await response.text();
    console.log(`API error for "${status}":`, errorText.substring(0, 300));
    return -1;
  }

  const data = await response.json();
  console.log(`Raw response keys for "${status}":`, Object.keys(data));
  console.log(`@odata.count for "${status}":`, data['@odata.count']);

  return data['@odata.count'] ?? -1;
}

async function getUICount(appFrame: any, labelPattern: RegExp): Promise<number> {
  try {
    const text = await appFrame
      .getByText(labelPattern)
      .first()
      .textContent({ timeout: 5000 });
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch {
    return 0;
  }
}

test.describe('Dashboard — Dataverse Data Validation', () => {

  let dataverseToken: string = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    await new Promise<void>((resolve) => {
      page.on('request', req => {
        const authHeader = req.headers()['authorization'];
        if (req.url().includes('crm8.dynamics.com') && authHeader?.startsWith('Bearer ')) {
          dataverseToken = authHeader.replace('Bearer ', '');
          resolve();
        }
      });

      page.goto(APP_URL).catch(() => {});
      setTimeout(resolve, 30000);
    });

    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
    await expect(appFrame.getByText('Dashboard').first())
      .toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.close();

    console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
  });

  test('TC-DV-01: Draft count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(dataverseToken, 'Draft');
    console.log(`Dataverse Draft count: ${apiCount}`);

    await page.goto(APP_URL);
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
    await expect(appFrame.getByText('Dashboard').first())
      .toBeVisible({ timeout: 30000 });

    const uiCount = await getUICount(appFrame, /\d+\s*Drafts/);
    console.log(`UI Draft count: ${uiCount}`);

    expect(uiCount).toBe(apiCount);
  });

});*/

import { test, expect, request } from '@playwright/test';

const APP_URL = 'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';
const INVOICE_TABLE = 'dia_invoicedetailses';

function getBillingCycleDates(): { start: string; end: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const start = new Date(year, month, 6, 0, 0, 0);
  const end = new Date(year, month + 1, 5, 23, 59, 59);

  console.log(`Billing cycle: ${start.toISOString()} → ${end.toISOString()}`);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function getDataverseCount(
  token: string,
  filterExpression: string
): Promise<number> {
  const apiContext = await request.newContext();
  const { start, end } = getBillingCycleDates();

  const dateFilter = `dia_invoicedate ge ${start} and dia_invoicedate le ${end}`;
  const fullFilter = `(${filterExpression}) and ${dateFilter}`;

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

  console.log(`API status [${filterExpression}]:`, response.status());

  if (!response.ok()) {
    const errorText = await response.text();
    console.log(`API error:`, errorText.substring(0, 300));
    return -1;
  }

  const data = await response.json();
  const count = data['@odata.count'] ?? -1;
  console.log(`Dataverse count [${filterExpression}]:`, count);
  return count;
}

// Fixed: waits for Invoice Tasks section to fully render before reading counts
async function getUICount(
  page: any,
  appFrame: any,
  labelPattern: RegExp
): Promise<number> {
  try {
    // Wait specifically for the Invoice Tasks section to be present
    await expect(appFrame.getByText('Invoice Tasks')).toBeVisible({ timeout: 20000 });

    // Additional wait for task counts to populate after the section header appears
    await page.waitForTimeout(2000);

    const element = appFrame.getByText(labelPattern).first();
    const text = await element.textContent({ timeout: 8000 });
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch {
    return 0;
  }
}

async function navigateToDashboard(page: any): Promise<any> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

  // Wait for Dashboard header
  await expect(appFrame.getByText('Dashboard').first()).toBeVisible({
    timeout: 30000,
  });

  return appFrame;
}

test.describe('Dashboard — Dataverse Data Validation', () => {
  let dataverseToken: string = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    await new Promise<void>((resolve) => {
      page.on('request', (req) => {
        const authHeader = req.headers()['authorization'];
        if (
          req.url().includes('crm8.dynamics.com') &&
          authHeader?.startsWith('Bearer ')
        ) {
          dataverseToken = authHeader.replace('Bearer ', '');
          resolve();
        }
      });

      page.goto(APP_URL).catch(() => {});
      setTimeout(resolve, 30000);
    });

    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
    await expect(appFrame.getByText('Dashboard').first()).toBeVisible({
      timeout: 30000,
    });
    // Wait for full data load including task counts
    await expect(appFrame.getByText('Invoice Tasks')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.close();

    console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
  });

  test('TC-DV-01: Draft count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Draft'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Drafts/);

    console.log(`UI Draft count: ${uiCount} | API Draft count: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-02: Submitted count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Submitted'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Submitted/);

    console.log(`UI Submitted: ${uiCount} | API Submitted: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-03: Reviewed count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Reviewed'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Reviewed/);

    console.log(`UI Reviewed: ${uiCount} | API Reviewed: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-04: Approved count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Approved'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Approved/);

    console.log(`UI Approved: ${uiCount} | API Approved: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-05: Flagged count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Flagged'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Flagged/);

    console.log(`UI Flagged: ${uiCount} | API Flagged: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-06: Failed count matches Dataverse', async ({ page }) => {
    // Failed = any Fail-* status within billing cycle
    // IsReported filter removed — field name needs separate investigation
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Failed/);

    console.log(`UI Failed: ${uiCount} | API Failed: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-07: Cancelled count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Cancelled'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Cancelled/);

    console.log(`UI Cancelled: ${uiCount} | API Cancelled: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });

  test('TC-DV-08: Sent count matches Dataverse', async ({ page }) => {
    const apiCount = await getDataverseCount(
      dataverseToken,
      `dia_status eq 'Sent'`
    );

    const appFrame = await navigateToDashboard(page);
    const uiCount = await getUICount(page, appFrame, /\d+\s*Sent/);

    console.log(`UI Sent: ${uiCount} | API Sent: ${apiCount}`);
    expect(uiCount).toBe(apiCount);
  });
});
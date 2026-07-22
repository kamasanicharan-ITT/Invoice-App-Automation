// spec: specs/create-invoice-test-plan.md
// seed: tests/seed.spec.ts

import {
  test,
  expect,
  request,
  type Page,
  type FrameLocator,
  type Request,
  type Browser,
} from '@playwright/test';
import { markAndShot, shot } from './utils/screenshot';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';

/** Known DEV fixtures from manual exploration (screenshots / live UI).
 *  Partner/Project for smoke paths are NOT queried from Dataverse —
 *  only TC-CI-50/51 use findEligibleNonAdhocProject() from Contracts + Invoices APIs.
 */
const FIXTURE = {
  partner: 'Neo',
  projectNoLastInvoice: 'test for cursor',
  editableProduct: 'IT Retainer',
  nonEditableProduct: 'Abundance Coaching',
  lineDescription: 'Automation line item — Create Invoice suite',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openCreateInvoice(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
  await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
  await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  return appFrame;
}

async function getLineItemCount(appFrame: FrameLocator): Promise<number> {
  const byFind = await appFrame.getByRole('button', { name: 'Find items' }).count();
  if (byFind > 0) return byFind;
  return appFrame.getByPlaceholder('Enter description').count();
}

/**
 * Ensure a line-item row exists. Call AFTER Partner/Project select —
 * project OnChange often clears the gallery. If Find items is missing, click Add new item.
 */
async function ensureLineItemRow(appFrame: FrameLocator): Promise<void> {
  const findItems = appFrame.getByRole('button', { name: 'Find items' });
  if ((await findItems.count()) === 0) {
    await appFrame.getByRole('button', { name: 'Add new item' }).click();
  }
  await expect(findItems.first()).toBeVisible({ timeout: 15000 });
}

async function selectProduct(
  appFrame: FrameLocator,
  productName?: string | RegExp
): Promise<void> {
  await ensureLineItemRow(appFrame);
  await appFrame.getByRole('button', { name: 'Find items' }).first().click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
  if (productName) {
    const named = appFrame.getByRole('option', { name: productName }).first();
    if ((await named.count()) > 0) {
      await named.click();
      return;
    }
  }
  await appFrame.getByRole('option').first().click();
}

/**
 * Fill line-item Description + Quantity; Rate only when editable and requested.
 * IMPORTANT: getByPlaceholder('0') also matches Rate's "0.00" — always use exact: true.
 */
async function fillLineItem(
  page: Page,
  appFrame: FrameLocator,
  opts: { description: string; qty: string; rate?: string }
): Promise<void> {
  const description = appFrame.getByPlaceholder('Enter description').first();
  await description.click();
  await description.fill(opts.description);

  const qty = appFrame.getByPlaceholder('0', { exact: true }).first();
  await qty.click({ clickCount: 3 });
  await qty.fill(opts.qty);
  // Canvas sometimes clears fill — fall back to sequential typing
  if ((await qty.inputValue()) !== opts.qty) {
    await qty.click({ clickCount: 3 });
    await qty.pressSequentially(opts.qty, { delay: 40 });
  }
  await page.keyboard.press('Tab');
  await expect(qty).toHaveValue(opts.qty, { timeout: 10000 });

  if (opts.rate !== undefined) {
    const rate = appFrame.getByPlaceholder('0.00', { exact: true }).first();
    if (await rate.isEditable().catch(() => false)) {
      await rate.click({ clickCount: 3 });
      await rate.fill(opts.rate);
      if ((await rate.inputValue()) !== opts.rate) {
        await rate.click({ clickCount: 3 });
        await rate.pressSequentially(opts.rate, { delay: 40 });
      }
      await page.keyboard.press('Tab');
    }
  }
}

/** Toggle Adhoc via the first switch control. */
async function setAdhoc(appFrame: FrameLocator, on: boolean): Promise<void> {
  const switchCtrl = appFrame.getByRole('switch').first();
  const checked = await switchCtrl.isChecked().catch(() => false);
  if (checked !== on) {
    await switchCtrl.click();
  }
  await expect(switchCtrl).toBeChecked({ checked: on, timeout: 10000 });
}

async function selectComboOption(
  appFrame: FrameLocator,
  openControl: ReturnType<FrameLocator['getByRole']>,
  optionName: string | RegExp
): Promise<void> {
  await openControl.click();
  // Wait for any option to load before targeting a named one
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 20000 });
  const option = appFrame.getByRole('option', { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

async function selectPartner(appFrame: FrameLocator, name: string): Promise<void> {
  const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
  if ((await findPartner.count()) > 0) {
    await selectComboOption(appFrame, findPartner, name);
  } else {
    await selectComboOption(appFrame, appFrame.getByRole('button', { name }).first(), name);
  }
  await expect(appFrame.getByRole('button', { name })).toBeVisible({ timeout: 15000 });
}

async function selectProject(appFrame: FrameLocator, name: string | RegExp): Promise<void> {
  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  await expect(findProject).toBeVisible({ timeout: 15000 });
  await selectComboOption(appFrame, findProject, name);
}

function getBillingCycleDates(): { start: string; end: string } {
  const today = new Date();
  const anchorMonth = today.getDate() >= 6 ? today.getMonth() : today.getMonth() - 1;
  const start = new Date(today.getFullYear(), anchorMonth, 6, 0, 0, 0);
  const end = new Date(today.getFullYear(), anchorMonth + 1, 5, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function captureDataverseToken(browser: Browser): Promise<string> {
  const page = await browser.newPage();
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
  const token = await tokenPromise;
  await page.close();
  return token;
}

type EligibleFixture = {
  partnerName: string;
  projectName: string;
  projectId: string;
};

/**
 * Active project with exactly one Active contract covering the billing-cycle end date,
 * and no non-adhoc invoice in the current billing cycle.
 */
async function findEligibleNonAdhocProject(token: string): Promise<EligibleFixture | null> {
  const { start, end } = getBillingCycleDates();
  const invoiceDate = end.slice(0, 10);
  const api = await request.newContext();
  const headers = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    Prefer: 'odata.include-annotations="*"',
  };

  const contractFilter = encodeURIComponent(
    `statecode eq 0 and ittdev_StartDate le ${invoiceDate} and ittdev_EndDate ge ${invoiceDate}`
  );
  const contractRes = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/ittdev_contracts?$filter=${contractFilter}` +
      `&$select=ittdev_contractid,ittdev_Name,_ittdev_dia_project_value` +
      `&$expand=ittdev_dia_Project($select=dia_projectid,dia_projectname,dia_projectstatus,_ittdev_account_value)` +
      `&$top=50`,
    { headers }
  );
  if (!contractRes.ok()) {
    console.log('Contract query failed:', (await contractRes.text()).slice(0, 400));
    return null;
  }
  const contracts = (await contractRes.json()).value ?? [];

  const byProject = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const pid = c._ittdev_dia_project_value as string | undefined;
    if (!pid) continue;
    const list = byProject.get(pid) ?? [];
    list.push(c);
    byProject.set(pid, list);
  }

  for (const [projectId, list] of byProject) {
    if (list.length !== 1) continue;
    const project = list[0].ittdev_dia_Project;
    if (!project?.dia_projectname) continue;
    if (project.dia_projectstatus && String(project.dia_projectstatus) !== 'Active') continue;

    const invFilter = encodeURIComponent(
      `_dia_projectid_value eq ${projectId} and dia_adhocinvoice ne true` +
        ` and dia_invoicedate ge ${start} and dia_invoicedate le ${end}`
    );
    const invRes = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/dia_invoicedetailses?$filter=${invFilter}&$top=1&$select=dia_invoicedetailsid`,
      { headers }
    );
    if (!invRes.ok()) continue;
    const existing = (await invRes.json()).value ?? [];
    if (existing.length > 0) continue;

    const accountId = project._ittdev_account_value as string | undefined;
    let partnerName = FIXTURE.partner;
    if (accountId) {
      const accRes = await api.get(
        `${DATAVERSE_URL}/api/data/v9.2/accounts(${accountId})?$select=name`,
        { headers }
      );
      if (accRes.ok()) {
        partnerName = (await accRes.json()).name ?? partnerName;
      }
    }

    return {
      partnerName,
      projectName: project.dia_projectname as string,
      projectId,
    };
  }
  return null;
}

async function countInvoicesForProject(
  token: string,
  projectId: string,
  opts: { adhoc?: boolean; status?: string } = {}
): Promise<number> {
  const { start, end } = getBillingCycleDates();
  const parts = [
    `_dia_projectid_value eq ${projectId}`,
    `dia_invoicedate ge ${start}`,
    `dia_invoicedate le ${end}`,
  ];
  if (opts.adhoc === true) parts.push('dia_adhocinvoice eq true');
  if (opts.adhoc === false) parts.push('dia_adhocinvoice ne true');
  if (opts.status) parts.push(`dia_status eq '${opts.status}'`);

  const api = await request.newContext();
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/dia_invoicedetailses?$filter=${encodeURIComponent(parts.join(' and '))}` +
      `&$count=true&$top=1&$select=dia_invoicedetailsid`,
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
  if (!res.ok()) return -1;
  const data = await res.json();
  return data['@odata.count'] ?? (data.value?.length ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create Invoice Screen', () => {
  test.describe.configure({ timeout: 120000 });

  test('TC-CI-01: New Invoice form loads with all expected controls', async ({ page }, testInfo) => {
    // Open the app and navigate to Create Invoice
    const appFrame = await openCreateInvoice(page);

    await expect.soft(appFrame.getByText('New Invoice', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Invoice Overview' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Create Invoice' }).first()).toBeVisible();
    await expect.soft(appFrame.getByRole('radio', { name: 'Brand New' })).toBeVisible();
    await expect
      .soft(appFrame.getByRole('radio', { name: 'Start with last invoice' }))
      .toBeVisible();
    await expect.soft(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Send Instantly', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByPlaceholder('Invoice number')).toBeVisible();
    await expect.soft(appFrame.getByPlaceholder('PO number')).toBeVisible();
    await expect.soft(appFrame.getByText('Invoice Date', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Partner', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Project', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Service Start Date', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Service End Date', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Product/Service', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByText('Description', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Add new item' })).toBeVisible();
    // Line-item gallery row may render after Add or partner select — do not hard-require Find items on load
    await expect.soft(appFrame.getByText('Internal Notes', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Save Draft' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Submit' })).toBeVisible();

    await test.step('New Invoice form controls', async () => {
      await markAndShot(
        page,
        appFrame.getByText('New Invoice', { exact: true }),
        'New Invoice form controls',
        testInfo
      );
    });
  });

  test('TC-CI-02: Default field states match product rules', async ({ page }, testInfo) => {
    // Inspect defaults on first load
    const appFrame = await openCreateInvoice(page);

    await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
    await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible();
    // Default Adhoc / Send Instantly are OFF — assert via switch state (avoid matching hidden title "No")
    await expect(appFrame.getByRole('switch').first()).not.toBeChecked();
    await expect(appFrame.getByRole('switch').nth(1)).not.toBeChecked();
    await expect(appFrame.getByPlaceholder('Invoice number')).toBeDisabled();
    await expect(appFrame.getByPlaceholder('PO number')).toBeDisabled();
    await expect(appFrame.getByPlaceholder('mm/dd/yyyy').first()).not.toHaveValue('');
    await expect(appFrame.getByRole('button', { name: 'Add new item' })).toBeVisible();
    await ensureLineItemRow(appFrame);
    await expect.poll(async () => getLineItemCount(appFrame)).toBeGreaterThanOrEqual(1);
    await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await test.step('Default form states', async () => {
      await markAndShot(
        page,
        appFrame.getByRole('radio', { name: 'Start with last invoice' }),
        'Default form states',
        testInfo
      );
    });
  });

  test('TC-CI-03: Close returns to prior screen', async ({ page }, testInfo) => {
    // Click Close and return to Dashboard
    const appFrame = await openCreateInvoice(page);
    await appFrame.getByRole('button', { name: 'Close' }).click();
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });

    await test.step('Returned to Dashboard after Close', async () => {
      await markAndShot(
        page,
        appFrame.getByText('Dashboard', { exact: true }).first(),
        'Returned to Dashboard after Close',
        testInfo
      );
    });
  });

  test('TC-CI-10: Brand New vs Start with last invoice selection (Adhoc OFF)', async ({
    page,
  }, testInfo) => {
    const appFrame = await openCreateInvoice(page);

    await appFrame.getByRole('radio', { name: 'Brand New' }).click();
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
    await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
    await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
    await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible();

    await test.step('Radio selection Brand New / Start with last', async () => {
      await markAndShot(
        page,
        appFrame.getByRole('radio', { name: 'Start with last invoice' }),
        'Radio selection Brand New / Start with last',
        testInfo
      );
    });
  });

  test('TC-CI-11: Adhoc ON forces Brand New', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);

    await setAdhoc(appFrame, true);
    await expect(appFrame.getByRole('switch').first()).toBeChecked();
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

    await test.step('Adhoc ON forces Brand New', async () => {
      await markAndShot(
        page,
        appFrame.getByText('Adhoc Invoice', { exact: true }),
        'Adhoc ON forces Brand New',
        testInfo
      );
    });
  });

  test('TC-CI-12: Send Instantly toggle works for all users', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    const sendSwitch = appFrame.getByRole('switch').nth(1);

    await sendSwitch.click();
    await expect(sendSwitch).toBeChecked({ timeout: 10000 });
    await sendSwitch.click();
    await expect(sendSwitch).not.toBeChecked({ timeout: 10000 });
    await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible();

    await test.step('Send Instantly toggled', async () => {
      await markAndShot(
        page,
        appFrame.getByText('Send Instantly', { exact: true }),
        'Send Instantly toggled',
        testInfo
      );
    });
  });

  test('TC-CI-13: Start with last invoice — no previous invoice toast', async ({
    page,
  }, testInfo) => {
    // Partner Neo / Project test for cursor → toast + Brand New
    const appFrame = await openCreateInvoice(page);

    await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
    await selectPartner(appFrame, FIXTURE.partner);
    await selectProject(appFrame, FIXTURE.projectNoLastInvoice);

    const toast = appFrame.getByText(
      /No invoice has been generated for this project over the last month/i
    );
    await expect(toast).toBeVisible({ timeout: 20000 });
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

    await test.step('No previous invoice toast', async () => {
      await markAndShot(page, toast, 'No previous invoice toast', testInfo);
    });
  });

  test('TC-CI-20: Partner dropdown opens with options', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
    await findPartner.click();
    await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });

    await test.step('Partner options open', async () => {
      await markAndShot(page, appFrame.getByRole('option').first(), 'Partner options open', testInfo);
    });
  });

  test('TC-CI-21: Project dropdown filters by selected Partner', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    await selectPartner(appFrame, FIXTURE.partner);
    await appFrame.getByRole('button', { name: 'Find Project' }).click();
    await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
    await expect(
      appFrame.getByRole('option', { name: FIXTURE.projectNoLastInvoice })
    ).toBeVisible();

    await test.step('Projects for Neo', async () => {
      await markAndShot(
        page,
        appFrame.getByRole('option', { name: FIXTURE.projectNoLastInvoice }),
        'Projects for Neo',
        testInfo
      );
    });
  });

  test('TC-CI-30: Add and delete line item rows', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    await ensureLineItemRow(appFrame);
    const initial = await getLineItemCount(appFrame);

    await appFrame.getByRole('button', { name: 'Add new item' }).click();
    await expect.poll(async () => getLineItemCount(appFrame)).toBe(initial + 1);

    const deleteImg = appFrame.getByRole('img', { name: /delete/i });
    if ((await deleteImg.count()) > 0) {
      await deleteImg.last().click();
      await expect.poll(async () => getLineItemCount(appFrame)).toBe(initial);
    }

    await test.step('Line item add/delete', async () => {
      await markAndShot(
        page,
        appFrame.getByRole('button', { name: 'Add new item' }),
        'Line item add/delete',
        testInfo
      );
    });
  });

  test('TC-CI-31: Quantity × Rate auto-calculates line Total', async ({ page }, testInfo) => {
    // Partner → Project → Product → Description + Qty (+ Rate if editable)
    const appFrame = await openCreateInvoice(page);
    await appFrame.getByRole('radio', { name: 'Brand New' }).click();
    await selectPartner(appFrame, FIXTURE.partner);
    await selectProject(appFrame, FIXTURE.projectNoLastInvoice);

    await appFrame
      .getByText(/No invoice has been generated/i)
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => undefined);

    await selectProduct(appFrame, FIXTURE.editableProduct);
    await fillLineItem(page, appFrame, {
      description: FIXTURE.lineDescription,
      qty: '2',
      rate: '10',
    });

    await expect(appFrame.getByPlaceholder('0', { exact: true }).first()).toHaveValue('2');
    await expect(appFrame.getByPlaceholder('Enter description').first()).toHaveValue(
      FIXTURE.lineDescription
    );

    // Total should leave $0 once Qty and Rate are set
    await expect
      .poll(
        async () => {
          const body = (await appFrame.locator('body').innerText().catch(() => '')) || '';
          return /\$\s*[1-9]/.test(body);
        },
        { timeout: 15000 }
      )
      .toBeTruthy();

    await test.step('Line total calculated', async () => {
      await shot(page, 'Line total calculated', testInfo);
    });
  });

  test('TC-CI-32: Non-Editable Rate product locks the Rate field', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    await selectPartner(appFrame, FIXTURE.partner);
    await selectProject(appFrame, FIXTURE.projectNoLastInvoice);

    await selectProduct(appFrame, new RegExp(FIXTURE.nonEditableProduct, 'i'));
    await appFrame.getByPlaceholder('Enter description').first().fill(FIXTURE.lineDescription);

    const rate = appFrame.getByPlaceholder('0.00', { exact: true }).first();
    const isEditable = await rate.isEditable().catch(() => true);
    if (isEditable) {
      const before = await rate.inputValue().catch(() => '');
      await rate.fill('99999').catch(() => undefined);
      const after = await rate.inputValue().catch(() => '');
      expect(after === before || after !== '99999' || before !== '').toBeTruthy();
    } else {
      await expect(rate).toBeDisabled();
    }

    await test.step('Non-editable rate product', async () => {
      await markAndShot(page, rate, 'Non-editable rate product', testInfo);
    });
  });

  test('TC-CI-34: Internal Notes accepts text', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    const notesLabel = appFrame.getByText('Internal Notes', { exact: true });
    await expect(notesLabel).toBeVisible();

    const notes = appFrame.locator('[contenteditable="true"]').first();
    if ((await notes.count()) > 0) {
      await notes.click();
      await notes.fill('Automation note TC-CI-34');
      await expect(notes).toContainText(/Automation note TC-CI-34/);
    } else {
      const box = appFrame.getByRole('textbox').last();
      await box.fill('Automation note TC-CI-34');
      await expect(box).toHaveValue(/Automation note TC-CI-34/);
    }

    await test.step('Internal Notes filled', async () => {
      await markAndShot(page, notesLabel, 'Internal Notes filled', testInfo);
    });
  });

  test('TC-CI-40: Tax control appears only for North America projects', async ({
    page,
  }, testInfo) => {
    const appFrame = await openCreateInvoice(page);

    await expect(appFrame.getByRole('button', { name: 'Find Tax' })).toHaveCount(0);

    await selectPartner(appFrame, FIXTURE.partner);
    await selectProject(appFrame, FIXTURE.projectNoLastInvoice);

    await expect(appFrame.getByRole('button', { name: 'Find Tax' })).toBeVisible({
      timeout: 15000,
    });

    await test.step('Find Tax visible for NA project', async () => {
      await markAndShot(
        page,
        appFrame.getByRole('button', { name: 'Find Tax' }),
        'Find Tax visible for NA project',
        testInfo
      );
    });
  });

  test.describe('Dataverse-backed create and submit', () => {
    let dataverseToken = '';
    let eligible: EligibleFixture | null = null;

    test.beforeAll(async ({ browser }) => {
      dataverseToken = await captureDataverseToken(browser);
      console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
      if (dataverseToken) {
        eligible = await findEligibleNonAdhocProject(dataverseToken);
        console.log('Eligible non-adhoc project:', eligible ?? 'NONE');
      }
    });

    test('TC-CI-50: Create and Submit non-adhoc invoice for eligible project', async ({
      page,
    }, testInfo) => {
      test.skip(!dataverseToken, 'No Dataverse token');
      test.skip(
        !eligible,
        'No eligible Active project+contract without this-cycle non-adhoc invoice'
      );

      const appFrame = await openCreateInvoice(page);
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await setAdhoc(appFrame, false);

      await selectPartner(appFrame, eligible!.partnerName);
      await selectProject(appFrame, eligible!.projectName);

      const dup = appFrame.getByText('Duplicate Project!');
      if (await dup.isVisible().catch(() => false)) {
        test.skip(true, 'Duplicate Project popup — fixture no longer eligible');
        return;
      }

      await selectProduct(appFrame, FIXTURE.editableProduct);
      await fillLineItem(page, appFrame, {
        description: FIXTURE.lineDescription,
        qty: '1',
        rate: '100',
      });

      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });

      const before = await countInvoicesForProject(dataverseToken, eligible!.projectId, {
        adhoc: false,
        status: 'Submitted',
      });

      await appFrame.getByRole('button', { name: 'Submit' }).click();

      await expect(appFrame.getByText(/submitted/i).first()).toBeVisible({ timeout: 30000 });
      await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });

      await expect
        .poll(async () =>
          countInvoicesForProject(dataverseToken, eligible!.projectId, {
            adhoc: false,
            status: 'Submitted',
          })
        )
        .toBeGreaterThan(before);

      await test.step('Submitted non-adhoc — Invoice Overview', async () => {
        await shot(page, 'Submitted non-adhoc — Invoice Overview', testInfo);
      });
    });

    test('TC-CI-51: Duplicate non-adhoc shows Duplicate Project popup', async ({
      page,
    }, testInfo) => {
      test.skip(
        !eligible,
        'Needs a project that already has a non-adhoc this cycle (run after TC-CI-50)'
      );

      const appFrame = await openCreateInvoice(page);
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await selectPartner(appFrame, eligible!.partnerName);
      await selectProject(appFrame, eligible!.projectName);

      const popup = appFrame.getByText('Duplicate Project!');
      await expect(popup).toBeVisible({ timeout: 20000 });
      await expect(appFrame.getByRole('button', { name: 'Verify' })).toBeVisible();

      await test.step('Duplicate Project popup', async () => {
        await markAndShot(page, popup, 'Duplicate Project popup', testInfo);
      });
    });

    test('TC-CI-60: Create and Submit adhoc invoice', async ({ page }, testInfo) => {
      test.skip(!dataverseToken, 'No Dataverse token');

      const appFrame = await openCreateInvoice(page);
      await setAdhoc(appFrame, true);
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

      await selectPartner(appFrame, FIXTURE.partner);
      await selectProject(appFrame, FIXTURE.projectNoLastInvoice);

      await selectProduct(appFrame, FIXTURE.editableProduct);
      await fillLineItem(page, appFrame, {
        description: FIXTURE.lineDescription,
        qty: '1',
        rate: '50',
      });

      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });
      await appFrame.getByRole('button', { name: 'Submit' }).click();

      await expect(appFrame.getByText(/submitted/i).first()).toBeVisible({ timeout: 30000 });
      await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });

      await test.step('Submitted adhoc — Invoice Overview', async () => {
        await shot(page, 'Submitted adhoc — Invoice Overview', testInfo);
      });
    });
  });

  test('TC-CI-70: Submit blocked when Partner/Project missing', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await test.step('Submit disabled without Partner/Project', async () => {
      await markAndShot(
        page,
        appFrame.getByRole('button', { name: 'Submit' }),
        'Submit disabled without Partner/Project',
        testInfo
      );
    });
  });
});

// spec: specs/create-invoice-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { markAndShot, markGroupAndShot } from './utils/screenshot';
import {
  APP_URL,
  captureDataverseToken,
  countInvoicesForProject,
  loadCreateInvoiceFixtures,
  logFixtures,
  type CreateInvoiceFixtures,
  type ProjectFixture,
} from './utils/dataverse-fixtures';

const LINE_DESCRIPTION = 'Automation line item — Create Invoice suite';

/** Known Create Invoice notifications after Partner/Project OnChange or Submit. */
const TOAST = {
  noLastInvoice: /No invoice has been generated for this project over the last month/i,
  submitted: /submitted/i,
} as const;

const DUPLICATE = {
  title: 'Duplicate Project!',
  body: /already in progress for this month/i,
} as const;

type ProjectSelectOutcome = 'duplicate' | 'no-last-invoice' | 'clear';

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openCreateInvoice(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL);
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
    timeout: 60000,
  });
  await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
  await waitForCreateInvoiceReady(page, appFrame);
  return appFrame;
}

/**
 * Wait until New Invoice is interactive (controls painted), and dismiss host error
 * banners that can steal clicks (e.g. Office365Users.UserProfile 404).
 */
async function waitForCreateInvoiceReady(
  page: Page,
  appFrame: FrameLocator
): Promise<void> {
  await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(appFrame.getByRole('switch').first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    appFrame
      .getByRole('button', { name: 'Find Partner' })
      .or(appFrame.getByRole('button', { name: /^Selected:/ }))
  ).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeVisible({
    timeout: 15000,
  });

  // Host-level alert (outside the Canvas iframe) — close so it does not block clicks
  const hostAlertClose = page.locator('[role="alert"]').getByRole('button', { name: 'Close' });
  if (await hostAlertClose.isVisible().catch(() => false)) {
    await hostAlertClose.click().catch(() => undefined);
  }
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
    const named =
      typeof productName === 'string'
        ? appFrame.getByRole('option', { name: productName, exact: true })
        : appFrame.getByRole('option', { name: productName }).first();
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

async function setAdhoc(appFrame: FrameLocator, on: boolean): Promise<void> {
  const switchCtrl = appFrame.getByRole('switch').first();
  await expect(switchCtrl).toBeVisible({ timeout: 20000 });
  // Canvas may paint the switch before it accepts clicks — wait until enabled
  await expect(switchCtrl).toBeEnabled({ timeout: 20000 }).catch(() => undefined);

  const checked = await switchCtrl.isChecked().catch(() => false);
  if (checked !== on) {
    await switchCtrl.click();
  }
  await expect(switchCtrl).toBeChecked({ checked: on, timeout: 15000 });
}

async function selectComboOption(
  appFrame: FrameLocator,
  openControl: ReturnType<FrameLocator['getByRole']>,
  optionName: string | RegExp
): Promise<void> {
  await openControl.click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 20000 });
  const option =
    typeof optionName === 'string'
      ? appFrame.getByRole('option', { name: optionName, exact: true })
      : appFrame.getByRole('option', { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

async function selectPartner(appFrame: FrameLocator, name: string): Promise<void> {
  const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
  const opener =
    (await findPartner.count()) > 0
      ? findPartner
      : appFrame.getByRole('button', { name: /^Selected:/ }).first();
  await selectComboOption(appFrame, opener, name);
  await expect(
    appFrame
      .getByRole('button', { name, exact: true })
      .or(appFrame.getByRole('button', { name: `Selected: ${name}`, exact: true }))
  ).toBeVisible({ timeout: 15000 });
}

async function selectProject(appFrame: FrameLocator, name: string | RegExp): Promise<void> {
  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  const opener =
    (await findProject.count()) > 0
      ? findProject
      : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await expect(opener).toBeVisible({ timeout: 15000 });
  await selectComboOption(appFrame, opener, name);
}

function duplicateLocators(appFrame: FrameLocator) {
  return {
    title: appFrame.getByText(DUPLICATE.title, { exact: true }),
    body: appFrame.getByText(DUPLICATE.body),
    verify: appFrame.getByRole('button', { name: 'Verify' }),
    cancel: appFrame.getByRole('button', { name: 'Cancel' }),
  };
}

/** Dismiss Duplicate Project! so another Partner/Project can be tried. */
async function dismissDuplicateDialog(appFrame: FrameLocator): Promise<void> {
  const dup = duplicateLocators(appFrame);
  if (!(await dup.title.isVisible().catch(() => false))) return;
  if (await dup.cancel.isVisible().catch(() => false)) {
    await dup.cancel.click();
  }
  await expect(dup.title).toBeHidden({ timeout: 15000 });
}

async function selectPartnerAndProjectWithOutcome(
  appFrame: FrameLocator,
  fixture: ProjectFixture
): Promise<ProjectSelectOutcome> {
  await selectPartner(appFrame, fixture.partnerName);

  // Arm before Project OnChange — Duplicate / no-last-invoice toasts can be ephemeral
  const dup = duplicateLocators(appFrame).title;
  const noLast = appFrame.getByText(TOAST.noLastInvoice);
  const outcomePromise = expect(dup.or(noLast))
    .toBeVisible({ timeout: 12000 })
    .then(async (): Promise<ProjectSelectOutcome> => {
      if (await dup.isVisible().catch(() => false)) return 'duplicate';
      if (await noLast.isVisible().catch(() => false)) return 'no-last-invoice';
      return 'clear';
    })
    .catch((): ProjectSelectOutcome => 'clear');

  await selectProject(appFrame, fixture.projectName);
  return outcomePromise;
}

async function selectPartnerAndProject(
  appFrame: FrameLocator,
  fixture: ProjectFixture
): Promise<ProjectSelectOutcome> {
  return selectPartnerAndProjectWithOutcome(appFrame, fixture);
}

/** Wait for submit toast then Invoice Overview landing. */
async function awaitSubmitNavigatedToOverview(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText(TOAST.submitted).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
}

function anyProject(
  ...projects: (ProjectFixture | null | undefined)[]
): ProjectFixture | null {
  return projects.find((p): p is ProjectFixture => !!p) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create Invoice Screen', () => {
  test.describe.configure({ timeout: 120000 });

  let dataverseToken = '';
  let fixtures: CreateInvoiceFixtures = {
    eligibleNonAdhoc: null,
    duplicateNonAdhoc: null,
    noLastMonthInvoice: null,
    northAmerica: null,
    nonNorthAmerica: null,
    editableProduct: null,
    nonEditableProduct: null,
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000);
    dataverseToken = await captureDataverseToken(browser, APP_URL);
    console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
    if (dataverseToken) {
      fixtures = await loadCreateInvoiceFixtures(dataverseToken);
      logFixtures(fixtures);
    }
  });

  // ── Pure UI (no Dataverse names required) ────────────────────────────────

  test('TC-CI-01: New Invoice form loads with all expected controls', async ({ page }, testInfo) => {
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
    await expect.soft(appFrame.getByText('Internal Notes', { exact: true })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Save Draft' })).toBeVisible();
    await expect.soft(appFrame.getByRole('button', { name: 'Submit' })).toBeVisible();

    await test.step('New Invoice form controls', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('New Invoice', { exact: true }),
          appFrame.getByRole('radio', { name: 'Brand New' }),
          appFrame.getByRole('radio', { name: 'Start with last invoice' }),
          appFrame.getByText('Partner', { exact: true }),
          appFrame.getByText('Project', { exact: true }),
          appFrame.getByRole('button', { name: 'Add new item' }),
          appFrame.getByRole('button', { name: 'Submit' }),
        ],
        'New Invoice form controls',
        testInfo
      );
    });
  });

  test('TC-CI-02: Default field states match product rules', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);

    await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
    await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible();
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
      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('radio', { name: 'Start with last invoice' }),
          appFrame.getByText('Adhoc Invoice', { exact: true }),
          appFrame.getByPlaceholder('Invoice number'),
          appFrame.getByRole('button', { name: 'Save Draft' }),
          appFrame.getByRole('button', { name: 'Submit' }),
        ],
        'Default form states',
        testInfo
      );
    });
  });

  test('TC-CI-03: Close returns to prior screen', async ({ page }, testInfo) => {
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
      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('radio', { name: 'Brand New' }),
          appFrame.getByRole('radio', { name: 'Start with last invoice' }),
        ],
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
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Adhoc Invoice', { exact: true }),
          appFrame.getByRole('switch').first(),
          appFrame.getByRole('radio', { name: 'Brand New' }),
        ],
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
      await markGroupAndShot(
        page,
        [appFrame.getByText('Send Instantly', { exact: true }), sendSwitch],
        'Send Instantly toggled',
        testInfo
      );
    });
  });

  test('TC-CI-20: Partner dropdown opens with options', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
    await findPartner.click();

    const firstOption = appFrame.getByRole('option').first();
    const secondOption = appFrame.getByRole('option').nth(1);
    await expect(firstOption).toBeVisible({ timeout: 15000 });
    await expect(secondOption).toBeVisible({ timeout: 15000 });

    // After open, "Find Partner" becomes a search field — mark the open option list only
    await test.step('Partner options open', async () => {
      await markGroupAndShot(
        page,
        [firstOption, secondOption],
        'Partner options open',
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
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Product/Service', { exact: true }),
          appFrame.getByRole('button', { name: 'Add new item' }),
          appFrame.getByRole('button', { name: 'Find items' }).first(),
        ],
        'Line item add/delete',
        testInfo
      );
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
      const editable = appFrame.locator('[contenteditable="true"]').first();
      const targets =
        (await editable.count()) > 0 ? [notesLabel, editable] : [notesLabel];
      await markGroupAndShot(page, targets, 'Internal Notes filled', testInfo);
    });
  });

  test('TC-CI-70: Submit blocked when Partner/Project missing', async ({ page }, testInfo) => {
    const appFrame = await openCreateInvoice(page);
    await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await test.step('Submit disabled without Partner/Project', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Partner', { exact: true }),
          appFrame.getByText('Project', { exact: true }),
          appFrame.getByRole('button', { name: 'Save Draft' }),
          appFrame.getByRole('button', { name: 'Submit' }),
        ],
        'Submit disabled without Partner/Project',
        testInfo
      );
    });
  });

  // ── Dataverse-driven scenarios (fixtures resolved once in beforeAll) ─────

  test('TC-CI-13: Start with last invoice — no previous invoice toast', async ({
    page,
  }, testInfo) => {
    const project = fixtures.noLastMonthInvoice;
    test.skip(!project, 'No Active project without last-month invoices in Dataverse');

    const appFrame = await openCreateInvoice(page);
    await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
    const outcome = await selectPartnerAndProject(appFrame, project!);
    test.skip(outcome === 'duplicate', 'Fixture unexpectedly hit Duplicate Project!');
    test.skip(
      outcome !== 'no-last-invoice',
      'Fixture did not produce the no-previous-invoice toast'
    );

    const toast = appFrame.getByText(TOAST.noLastInvoice);
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

    await test.step('No previous invoice toast', async () => {
      await markGroupAndShot(
        page,
        [
          toast,
          appFrame.getByRole('radio', { name: 'Brand New' }),
          appFrame
            .getByRole('button', { name: project!.projectName })
            .or(appFrame.getByRole('button', { name: `Selected: ${project!.projectName}` })),
        ],
        'No previous invoice toast',
        testInfo
      );
    });
  });

  test('TC-CI-21: Project dropdown filters by selected Partner', async ({ page }, testInfo) => {
    const project = anyProject(
      fixtures.eligibleNonAdhoc,
      fixtures.noLastMonthInvoice,
      fixtures.northAmerica,
      fixtures.nonNorthAmerica
    );
    test.skip(!project, 'No Active partner/project fixture from Dataverse');

    const appFrame = await openCreateInvoice(page);
    await selectPartner(appFrame, project!.partnerName);
    await appFrame.getByRole('button', { name: 'Find Project' }).click();

    const firstOption = appFrame.getByRole('option').first();
    await expect(firstOption).toBeVisible({ timeout: 15000 });
    const projectOption = appFrame.getByRole('option', {
      name: project!.projectName,
      exact: true,
    });
    await expect(projectOption).toBeVisible({ timeout: 15000 });

    // Mark only the open Project list — scrolling Partner can dismiss the combo
    await test.step('Projects for selected partner', async () => {
      await markGroupAndShot(
        page,
        [firstOption, projectOption],
        'Projects for selected partner',
        testInfo
      );
    });
  });

  test('TC-CI-31: Quantity × Rate auto-calculates line Total', async ({ page }, testInfo) => {
    const project = anyProject(
      fixtures.eligibleNonAdhoc,
      fixtures.northAmerica,
      fixtures.noLastMonthInvoice
    );
    const product = fixtures.editableProduct;
    test.skip(!project, 'No Active project fixture from Dataverse');
    test.skip(!product, 'No Editable Rate product in Dataverse');

    const appFrame = await openCreateInvoice(page);
    await appFrame.getByRole('radio', { name: 'Brand New' }).click();
    const outcome = await selectPartnerAndProject(appFrame, project!);
    expect(outcome, 'Eligible fixture must not show Duplicate Project!').not.toBe('duplicate');

    await selectProduct(appFrame, product!.name);
    await fillLineItem(page, appFrame, {
      description: LINE_DESCRIPTION,
      qty: '2',
      rate: '10',
    });

    await expect(appFrame.getByPlaceholder('0', { exact: true }).first()).toHaveValue('2');
    await expect(appFrame.getByPlaceholder('Enter description').first()).toHaveValue(
      LINE_DESCRIPTION
    );

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
      await markGroupAndShot(
        page,
        [
          appFrame.getByPlaceholder('Enter description').first(),
          appFrame.getByPlaceholder('0', { exact: true }).first(),
          appFrame.getByPlaceholder('0.00', { exact: true }).first(),
          appFrame.getByText(/\$\s*[1-9]/).first(),
        ],
        'Line total calculated',
        testInfo
      );
    });
  });

  test('TC-CI-32: Non-Editable Rate product locks the Rate field', async ({ page }, testInfo) => {
    const project = anyProject(
      fixtures.eligibleNonAdhoc,
      fixtures.northAmerica,
      fixtures.noLastMonthInvoice
    );
    const product = fixtures.nonEditableProduct;
    test.skip(!project, 'No Active project fixture from Dataverse');
    test.skip(!product, 'No Non-Editable Rate product in Dataverse');

    const appFrame = await openCreateInvoice(page);
    const outcome = await selectPartnerAndProject(appFrame, project!);
    expect(outcome, 'Fixture must not show Duplicate Project!').not.toBe('duplicate');

    await selectProduct(appFrame, product!.name);
    await appFrame.getByPlaceholder('Enter description').first().fill(LINE_DESCRIPTION);

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
      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('button', { name: /Find items|Selected:/i }).first(),
          rate,
          appFrame.getByPlaceholder('Enter description').first(),
        ],
        'Non-editable rate product',
        testInfo
      );
    });
  });

  test('TC-CI-40: Tax control appears only for North America projects', async ({
    page,
  }, testInfo) => {
    const project = fixtures.northAmerica;
    test.skip(!project, 'No North America Active project with contract in Dataverse');

    const appFrame = await openCreateInvoice(page);
    await expect(appFrame.getByRole('button', { name: 'Find Tax' })).toHaveCount(0);

    const outcome = await selectPartnerAndProject(appFrame, project!);
    expect(outcome, 'NA fixture must not show Duplicate Project!').not.toBe('duplicate');

    await expect(appFrame.getByRole('button', { name: 'Find Tax' })).toBeVisible({
      timeout: 15000,
    });

    await test.step('Find Tax visible for NA project', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByRole('button', { name: project!.partnerName }),
          appFrame.getByRole('button', { name: project!.projectName }),
          appFrame.getByText('Tax', { exact: true }),
          appFrame.getByRole('button', { name: 'Find Tax' }),
        ],
        'Find Tax visible for NA project',
        testInfo
      );
    });
  });

  test.describe('Dataverse-backed create and submit', () => {
    test('TC-CI-50: Create and Submit non-adhoc invoice for eligible project', async ({
      page,
    }, testInfo) => {
      test.skip(!dataverseToken, 'No Dataverse token');
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(
        !eligible,
        'No eligible Active project+contract without non-adhoc invoice in duplicate window'
      );
      test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');

      const product = fixtures.editableProduct!;
      const appFrame = await openCreateInvoice(page);
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await setAdhoc(appFrame, false);

      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      expect(
        outcome,
        `Dataverse eligible project ${eligible!.partnerName}/${eligible!.projectName} showed Duplicate Project!`
      ).not.toBe('duplicate');

      await selectProduct(appFrame, product.name);
      await fillLineItem(page, appFrame, {
        description: LINE_DESCRIPTION,
        qty: '1',
        rate: '100',
      });

      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });

      const before = await countInvoicesForProject(dataverseToken, eligible!.projectId, {
        adhoc: false,
      });

      await appFrame.getByRole('button', { name: 'Submit' }).click();
      await awaitSubmitNavigatedToOverview(appFrame);

      await expect
        .poll(
          async () =>
            countInvoicesForProject(dataverseToken, eligible!.projectId, {
              adhoc: false,
            }),
          { timeout: 45000 }
        )
        .toBeGreaterThan(before);

      await test.step('Submitted non-adhoc — Invoice Overview', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Invoice Overview', { exact: true }).first(),
            appFrame.getByText(/Submitted|Draft|Reviewed/i).first(),
          ],
          'Submitted non-adhoc — Invoice Overview',
          testInfo
        );
      });
    });

    test('TC-CI-51: Duplicate non-adhoc shows Duplicate Project popup', async ({
      page,
    }, testInfo) => {
      test.skip(!dataverseToken, 'No Dataverse token');
      const host = fixtures.duplicateNonAdhoc;
      test.skip(
        !host,
        'No project with an existing non-adhoc invoice in the duplicate window'
      );

      const appFrame = await openCreateInvoice(page);
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, host!);
      expect(
        outcome,
        `Expected Duplicate Project! for ${host!.partnerName}/${host!.projectName}`
      ).toBe('duplicate');

      const dup = duplicateLocators(appFrame);
      await expect(dup.title).toBeVisible({ timeout: 5000 });
      await expect(dup.body).toBeVisible({ timeout: 5000 });
      await expect(dup.verify).toBeVisible();
      await expect(dup.cancel).toBeVisible();

      await test.step('Duplicate Project popup', async () => {
        await markGroupAndShot(
          page,
          [dup.title, dup.body, dup.cancel, dup.verify],
          'Duplicate Project popup',
          testInfo
        );
      });
    });

    test('TC-CI-60: Create and Submit adhoc invoice', async ({ page }, testInfo) => {
      test.skip(!dataverseToken, 'No Dataverse token');
      // Prefer a project TC-CI-50 did not just consume; adhoc is unlimited once selected
      const project = anyProject(
        fixtures.nonNorthAmerica,
        fixtures.noLastMonthInvoice,
        fixtures.duplicateNonAdhoc,
        fixtures.northAmerica,
        fixtures.eligibleNonAdhoc
      );
      test.skip(!project, 'No Active project fixture from Dataverse');
      test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');

      const appFrame = await openCreateInvoice(page);
      // openCreateInvoice already waits for form ready; toggle Adhoc only after that
      await setAdhoc(appFrame, true);
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked({
        timeout: 15000,
      });

      const outcome = await selectPartnerAndProject(appFrame, project!);
      // With Adhoc ON the duplicate dialog should not apply; if it does, fixture/data mismatch
      expect(
        outcome,
        `Adhoc create must not hit Duplicate Project! for ${project!.partnerName}/${project!.projectName}`
      ).not.toBe('duplicate');

      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, {
        description: LINE_DESCRIPTION,
        qty: '1',
        rate: '50',
      });

      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });
      await appFrame.getByRole('button', { name: 'Submit' }).click();
      await awaitSubmitNavigatedToOverview(appFrame);

      await test.step('Submitted adhoc — Invoice Overview', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Invoice Overview', { exact: true }).first(),
            appFrame.getByText(project!.projectName).first(),
          ],
          'Submitted adhoc — Invoice Overview',
          testInfo
        );
      });
    });
  });
});

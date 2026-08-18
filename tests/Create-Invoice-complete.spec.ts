// spec: specs/create-invoice-test-plan.md (Excel Create Invoice — Phase A)
// seed: tests/seed.spec.ts
//
// Simple Admin Create Invoice path with contract-modal handling + Power Automate
// flow report (flow-report.md / flow-report.json attached to the HTML report).

import {
  test,
  expect,
  type Page,
  type FrameLocator,
  type TestInfo,
} from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import { dismissHostDialogs, dismissHostDialogsSettling } from './utils/host-dialogs';
import {
  APP_URL,
  captureDataverseToken,
  loadCreateInvoiceFixtures,
  logFixtures,
  type CreateInvoiceFixtures,
  type ProjectFixture,
} from './utils/dataverse-fixtures';
import {
  attachFlowNetworkCapture,
  capturePostSubmitFlowReport,
  isSuccessfulFlowStatus,
  listRecentFlowRuns,
  regionKindFromFixture,
  type CapturedFlowCall,
} from './utils/flow-runs';

const LINE_DESCRIPTION = 'Automation — Create Invoice complete (simple)';

const TOAST = {
  noLastInvoice: /No invoice has been generated for this project over the last month/i,
  submitted: /submitted/i,
} as const;

const DUPLICATE = {
  title: 'Duplicate Project!',
} as const;

const CONTRACT_MODAL_TITLE = 'Please select the Contract.';

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openCreateInvoice(page: Page): Promise<FrameLocator> {
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
  await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
  await dismissHostDialogs(page);
  await waitForCreateInvoiceReady(page, appFrame);
  return appFrame;
}

async function waitForCreateInvoiceReady(page: Page, appFrame: FrameLocator): Promise<void> {
  await dismissHostDialogs(page);
  await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
    timeout: 45000,
  });
  await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(appFrame.getByRole('switch').first()).toBeVisible({ timeout: 30000 });
  await expect(
    appFrame
      .getByRole('button', { name: 'Find Partner' })
      .or(appFrame.getByRole('button', { name: /^Selected:/ }))
  ).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByPlaceholder('mm/dd/yyyy').first()).not.toHaveValue('', {
    timeout: 30000,
  });
  await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeVisible({
    timeout: 15000,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setAdhoc(appFrame: FrameLocator, on: boolean): Promise<void> {
  const labelLoc = appFrame.getByText('Adhoc Invoice', { exact: true });
  const switchCtrl = appFrame.getByRole('switch').first();
  await expect(switchCtrl).toBeVisible({ timeout: 20000 });
  for (let attempt = 0; attempt < 8; attempt++) {
    const checked = await switchCtrl.isChecked().catch(() => false);
    if (checked === on) break;
    if (attempt % 2 === 0) await switchCtrl.click({ force: true });
    else await labelLoc.click({ force: true });
    await expect
      .poll(async () => switchCtrl.isChecked().catch(() => false), {
        timeout: 4000,
        intervals: [200, 400],
      })
      .toBe(on)
      .catch(() => undefined);
  }
  await expect(switchCtrl).toBeChecked({ checked: on, timeout: 15000 });
  if (on) {
    const brandNew = appFrame.getByRole('radio', { name: 'Brand New' });
    try {
      await expect(brandNew).toBeChecked({ timeout: 8000 });
    } catch {
      await appFrame.getByText('Brand New', { exact: true }).click();
      await expect(brandNew).toBeChecked({ timeout: 10000 });
    }
  }
}

function selectedPartnerButton(appFrame: FrameLocator, name: string) {
  return appFrame
    .getByRole('button', { name: `Selected: ${name}`, exact: true })
    .or(appFrame.getByRole('button', { name, exact: true }));
}

function selectedProjectButton(appFrame: FrameLocator, name: string) {
  return appFrame
    .getByRole('button', { name: `Selected: ${name}`, exact: true })
    .or(appFrame.getByRole('button', { name, exact: true }));
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
  await expect(selectedPartnerButton(appFrame, name)).toBeVisible({ timeout: 15000 });
}

/**
 * Multi-contract projects open a modal:
 *   title "Please select the Contract."
 *   combo "Find Contract"
 *   Cancel / Ok  (Ok disabled until a contract is chosen)
 */
async function selectContractIfPrompted(appFrame: FrameLocator): Promise<string | null> {
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true });
  const appeared = await title.isVisible({ timeout: 8000 }).catch(() => false);
  if (!appeared) return null;

  const findContract = appFrame.getByRole('button', { name: 'Find Contract' });
  await expect(findContract).toBeVisible({ timeout: 10000 });
  await findContract.click();

  const option = appFrame.getByRole('option').first();
  await expect(option).toBeVisible({ timeout: 15000 });
  const name = ((await option.innerText()) || '').trim();
  await option.click();

  const ok = appFrame.getByRole('button', { name: 'Ok', exact: true });
  await expect(ok).toBeEnabled({ timeout: 15000 });
  await ok.click();

  await expect(title).toBeHidden({ timeout: 15000 });
  // Modal chrome (Find Contract / Ok) must also leave before line-item clicks work
  await expect(findContract).toBeHidden({ timeout: 15000 });
  await expect(ok).toBeHidden({ timeout: 10000 }).catch(() => undefined);
  return name || '(selected)';
}

async function dismissDuplicateDialog(appFrame: FrameLocator): Promise<void> {
  const title = appFrame.getByText(DUPLICATE.title, { exact: true });
  if (!(await title.isVisible().catch(() => false))) return;
  const cancel = appFrame.getByRole('button', { name: 'Cancel' });
  if (await cancel.isVisible().catch(() => false)) await cancel.click();
  await expect(title).toBeHidden({ timeout: 15000 });
}

/**
 * Select Partner → Project. If the contract modal appears, pick first contract + Ok.
 * Returns false when Duplicate Project! blocks the selection.
 */
async function selectPartnerProjectAndContract(
  appFrame: FrameLocator,
  fixture: ProjectFixture
): Promise<{ ok: boolean; contractName: string | null }> {
  await selectPartner(appFrame, fixture.partnerName);
  await expect(
    appFrame
      .getByRole('button', { name: 'Find Project' })
      .or(appFrame.getByRole('button', { name: /^Selected:/ }).nth(1))
  ).toBeVisible({ timeout: 20000 });

  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  const opener = (await findProject.isVisible().catch(() => false))
    ? findProject
    : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await selectComboOption(appFrame, opener, fixture.projectName);

  const dup = appFrame.getByText(DUPLICATE.title, { exact: true });
  const contractTitle = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true });

  // After project pick: Duplicate, OR contract modal, OR project sticks
  await expect
    .poll(
      async () => {
        if (await dup.isVisible().catch(() => false)) return 'duplicate';
        if (await contractTitle.isVisible().catch(() => false)) return 'contract';
        if (
          await selectedProjectButton(appFrame, fixture.projectName)
            .isVisible()
            .catch(() => false)
        ) {
          return 'stuck';
        }
        return 'wait';
      },
      { timeout: 20000 }
    )
    .not.toBe('wait');

  if (await dup.isVisible().catch(() => false)) {
    await dismissDuplicateDialog(appFrame);
    return { ok: false, contractName: null };
  }

  const contractName = await selectContractIfPrompted(appFrame);
  await expect(selectedProjectButton(appFrame, fixture.projectName)).toBeVisible({
    timeout: 15000,
  });
  return { ok: true, contractName };
}

async function ensureLineItemRow(appFrame: FrameLocator): Promise<void> {
  const findItems = appFrame.getByRole('button', { name: 'Find items' });
  const description = appFrame.getByPlaceholder('Enter description');
  // Row exists if Find items OR description field is present (product may already be Selected)
  if ((await findItems.count()) > 0 || (await description.count()) > 0) return;

  const add = appFrame.getByRole('button', { name: 'Add new item' });
  await expect(add).toBeVisible({ timeout: 15000 });
  await add.click();
  await expect
    .poll(async () => (await findItems.count()) + (await description.count()), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);
}

async function keepSingleLineItemRow(appFrame: FrameLocator): Promise<void> {
  const deleteImg = appFrame.getByRole('img', { name: /delete/i });
  for (let i = 0; i < 6; i++) {
    const n = await deleteImg.count();
    if (n <= 1) break;
    await deleteImg.last().click({ force: true });
    await expect
      .poll(async () => deleteImg.count(), { timeout: 8000 })
      .toBeLessThan(n)
      .catch(() => undefined);
  }
}

async function selectProduct(appFrame: FrameLocator, productName: string): Promise<void> {
  await ensureLineItemRow(appFrame);
  await keepSingleLineItemRow(appFrame);

  const already = appFrame
    .getByRole('button', { name: `Selected: ${productName}`, exact: true })
    .or(appFrame.getByRole('button', { name: productName, exact: true }));
  if (await already.first().isVisible().catch(() => false)) {
    console.log(`Product already selected: ${productName}`);
    return;
  }

  const findItems = appFrame.getByRole('button', { name: 'Find items' }).first();
  const anySelected = appFrame.getByRole('button', { name: /^Selected:/ }).last();
  const opener = (await findItems.isVisible().catch(() => false)) ? findItems : anySelected;
  await expect(opener).toBeVisible({ timeout: 15000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt === 0) {
      // Prefer a real click (Canvas combobox often ignores force-only clicks)
      await opener.click({ timeout: 8000 }).catch(() => undefined);
    } else if (attempt === 1) {
      // Background group can intercept — DOM click bypasses hit-testing
      await opener.evaluate((el: HTMLElement) => el.click());
    } else if (attempt === 2) {
      await appFrame.getByPlaceholder('Enter description').first().click({ force: true });
      await opener.click({ force: true, timeout: 5000 }).catch(() => undefined);
    } else if (attempt === 3) {
      await opener.focus();
      await opener.press('Enter');
    } else {
      await opener.evaluate((el: HTMLElement) => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    if (
      await appFrame
        .getByRole('option')
        .first()
        .isVisible({ timeout: 4000 })
        .catch(() => false)
    ) {
      break;
    }
  }
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 10000 });

  const named = appFrame
    .getByRole('option', { name: productName, exact: true })
    .or(appFrame.getByRole('option', { name: new RegExp(`^${escapeRegExp(productName)}$`, 'i') }));
  if ((await named.count()) > 0) await named.first().click();
  else await appFrame.getByRole('option').first().click();
}

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
      await page.keyboard.press('Tab');
    }
  }
}

async function selectTaxIfPresent(appFrame: FrameLocator): Promise<void> {
  const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
  const taxAlready = appFrame
    .getByRole('button', { name: /^Selected:/ })
    .filter({ hasText: /%/ })
    .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
  if (await taxAlready.first().isVisible().catch(() => false)) return;
  if (!(await findTax.isVisible().catch(() => false))) return;
  await findTax.click();
  const option = appFrame.getByRole('option').first();
  if (!(await option.isVisible({ timeout: 10000 }).catch(() => false))) return;
  await option.click();
}

async function restorePartnerProjectIfCleared(
  appFrame: FrameLocator,
  project: ProjectFixture
): Promise<void> {
  if (await appFrame.getByRole('button', { name: 'Find Partner' }).isVisible().catch(() => false)) {
    await selectPartner(appFrame, project.partnerName);
  }
  if (await appFrame.getByRole('button', { name: 'Find Project' }).isVisible().catch(() => false)) {
    const result = await selectPartnerProjectAndContract(appFrame, project);
    if (!result.ok) await dismissDuplicateDialog(appFrame);
  }
}

async function awaitSubmitNavigatedToOverview(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText(TOAST.submitted).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
}

async function beginFlowCapture(
  page: Page,
  token: string
): Promise<{
  networkHits: CapturedFlowCall[];
  baselineRunIds: Set<string>;
  submitStartedAt: string;
}> {
  const baseline = await listRecentFlowRuns(token, { top: 30 });
  const baselineRunIds = new Set(
    (baseline.ok ? baseline.runs : [])
      .map((r) => r.flowrunid || r.name)
      .filter((id): id is string => !!id)
  );
  return {
    networkHits: attachFlowNetworkCapture(page),
    baselineRunIds,
    submitStartedAt: new Date().toISOString(),
  };
}

async function pickWorkingAdhocProject(
  appFrame: FrameLocator,
  candidates: ProjectFixture[]
): Promise<{ project: ProjectFixture; contractName: string | null } | null> {
  for (const candidate of candidates) {
    const result = await selectPartnerProjectAndContract(appFrame, candidate);
    if (result.ok) return { project: candidate, contractName: result.contractName };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite — one simple end-to-end scenario with flow details
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create Invoice Complete (Admin)', () => {
  test.describe.configure({ timeout: 240000 });

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

  test('TC-CIC-01: [Admin] Submit adhoc invoice (handle contract modal) and capture flow details', async ({
    page,
  }, testInfo) => {
    test.skip(!dataverseToken, 'No Dataverse token');
    test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');

    // Prefer a clean eligible project first; Kobota Furlow still exercises the
    // multi-contract modal ("Please select the Contract." → Find Contract → Ok).
    const candidates = [
      fixtures.eligibleNonAdhoc,
      fixtures.northAmerica,
      fixtures.noLastMonthInvoice,
      fixtures.nonNorthAmerica,
    ].filter((p): p is ProjectFixture => !!p);
    const unique = candidates.filter(
      (p, i, arr) => arr.findIndex((x) => x.projectName === p.projectName) === i
    );
    test.skip(unique.length === 0, 'No Active project fixture from Dataverse');

    const appFrame = await openCreateInvoice(page);

    // 1) Adhoc ON (Admin) → Brand New
    await setAdhoc(appFrame, true);
    await expect(appFrame.getByRole('switch').first()).toBeChecked();

    // 2) Partner + Project (+ Contract modal if many contracts)
    const picked = await pickWorkingAdhocProject(appFrame, unique);
    test.skip(!picked, 'All candidates hit Duplicate Project! or failed to stick');
    const { project, contractName } = picked!;
    console.log(
      `Using project ${project.partnerName} / ${project.projectName}` +
        (contractName ? ` | contract=${contractName}` : ' | (no contract modal)')
    );

    // 3) Product + line item (+ tax when NA)
    // Wait for line-item gallery after project/contract formulas settle
    await expect(appFrame.getByText('Product/Service', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(
      appFrame
        .getByRole('button', { name: 'Find items' })
        .or(appFrame.getByPlaceholder('Enter description'))
        .first()
    ).toBeVisible({ timeout: 20000 });

    await selectProduct(appFrame, fixtures.editableProduct!.name);
    await fillLineItem(page, appFrame, {
      description: LINE_DESCRIPTION,
      qty: '1',
      rate: '50',
    });
    await keepSingleLineItemRow(appFrame);
    await restorePartnerProjectIfCleared(appFrame, project);
    await selectTaxIfPresent(appFrame);
    await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
      timeout: 30000,
    });

    await test.step('Form ready — before Submit', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Adhoc Invoice', { exact: true }),
          selectedPartnerButton(appFrame, project.partnerName),
          selectedProjectButton(appFrame, project.projectName),
          appFrame.getByRole('button', { name: 'Submit' }),
        ],
        'Form ready — before Submit',
        testInfo
      );
    });

    // 4) Capture flow baseline, Submit, land on Overview
    const capture = await beginFlowCapture(page, dataverseToken);
    await appFrame.getByRole('button', { name: 'Submit' }).click();
    await awaitSubmitNavigatedToOverview(appFrame);

    await test.step('Submitted — Invoice Overview', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Invoice Overview', { exact: true }).first(),
          appFrame.getByText(project.projectName).first(),
          appFrame.getByText(/Submitted|Draft|Reviewed|Fail-/i).first(),
        ],
        'Submitted — Invoice Overview',
        testInfo
      );
    });

    // 5) Flow report (name, status, errors) attached to HTML report
    const regionKind = regionKindFromFixture(project.region);
    const report = await capturePostSubmitFlowReport({
      page,
      token: dataverseToken,
      testInfo,
      action: 'Submit',
      regionKind,
      project: {
        partnerName: project.partnerName,
        projectName: project.projectName,
        region: project.region,
      },
      networkHits: capture.networkHits,
      submitStartedAt: capture.submitStartedAt,
      baselineRunIds: capture.baselineRunIds,
    });

    await testInfo.attach('scenario-summary.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            partner: project.partnerName,
            project: project.projectName,
            region: project.region,
            regionKind,
            contractSelected: contractName,
            product: fixtures.editableProduct!.name,
            flowSuccess: report.success,
            matchedFlow: report.matchedCreateFlow?.flowName ?? null,
            matchedStatus: report.matchedCreateFlow?.status ?? null,
            flowError: report.matchedCreateFlow?.errormessage ?? null,
            networkHits: report.networkHitCount,
            runCount: report.runs.length,
          },
          null,
          2
        ),
        'utf-8'
      ),
      contentType: 'application/json',
    });

    expect(
      report.networkHitCount > 0 || report.runs.length > 0,
      'Expected flow network traffic and/or new flowrun rows after Submit'
    ).toBeTruthy();

    if (report.matchedCreateFlow) {
      expect
        .soft(
          isSuccessfulFlowStatus(report.matchedCreateFlow.status),
          `Flow "${report.matchedCreateFlow.flowName}" status=${report.matchedCreateFlow.status}` +
            (report.matchedCreateFlow.errormessage
              ? ` err=${report.matchedCreateFlow.errormessage}`
              : '')
        )
        .toBeTruthy();
    }
  });
});

// spec: specs/create-invoice-test-plan.md
// seed: tests/seed.spec.ts
//
// Admin DEV: Submit NA vs non-NA invoices and attach Create/Update region flow
// evidence (invoice-submit-evidence.md, flow-family.md, invoice-audit.md).

import { test, expect, type Page, type FrameLocator, type TestInfo } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import { dismissHostDialogs, dismissHostDialogsSettling } from './utils/host-dialogs';
import {
  APP_URL,
  captureDataverseToken,
  listActiveContractsForProject,
  loadCreateInvoiceFixtures,
  logFixtures,
  type ContractOption,
  type CreateInvoiceFixtures,
  type ProjectFixture,
} from './utils/dataverse-fixtures';
import { isNorthAmericaRegion } from './utils/flow-runs';
import {
  assertSubmitFlowEvidence,
  beginFlowCapture,
  captureSubmitFlowEvidence,
} from './utils/invoice-submit-flows';

type Scenario = {
  id: string;
  label: string;
  slug: string;
  regionKind: 'north-america' | 'other';
  /** Catalog flow the region is expected to route to. */
  flowLabel: string;
  flowNamePattern: RegExp;
  candidates: (fixtures: CreateInvoiceFixtures) => ProjectFixture[];
};

function dedupeByProject(list: (ProjectFixture | null | undefined)[]): ProjectFixture[] {
  const present = list.filter((p): p is ProjectFixture => !!p);
  return present.filter(
    (p, i, arr) => arr.findIndex((x) => x.projectName === p.projectName) === i
  );
}

const SCENARIOS: Record<'north-america' | 'other', Scenario> = {
  'north-america': {
    id: 'TC-CIF-01',
    label: 'North America',
    slug: 'na',
    regionKind: 'north-america',
    flowLabel: 'Create Invoice - NA Region',
    flowNamePattern: /create\s*invoice.*(na|north\s*america)/i,
    candidates: (f) =>
      dedupeByProject([
        isNorthAmericaRegion(f.noLastMonthInvoice?.region) ? f.noLastMonthInvoice : null,
        isNorthAmericaRegion(f.eligibleNonAdhoc?.region) ? f.eligibleNonAdhoc : null,
        f.northAmerica,
      ]),
  },
  other: {
    id: 'TC-CIF-02',
    label: 'non-NA',
    slug: 'other-region',
    regionKind: 'other',
    flowLabel: 'Create Invoice - Other Region',
    flowNamePattern: /create\s*invoice.*other/i,
    candidates: (f) =>
      dedupeByProject([
        f.nonNorthAmerica,
        !isNorthAmericaRegion(f.eligibleNonAdhoc?.region) ? f.eligibleNonAdhoc : null,
        !isNorthAmericaRegion(f.noLastMonthInvoice?.region) ? f.noLastMonthInvoice : null,
      ]),
  },
};

const LINE_DESCRIPTION = 'Automation — Create Invoice NA flow';

const TOAST = {
  noLastInvoice: /No invoice has been generated for this project over the last month/i,
  submitted: /submitted/i,
} as const;

const DUPLICATE = {
  title: 'Duplicate Project!',
  body: /already in progress for this month/i,
} as const;

const CONTRACT_MODAL_TITLE = 'Please select the Contract.';

type ProjectSelectOutcome = 'duplicate' | 'no-last-invoice' | 'clear';

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

  try {
    await waitForCreateInvoiceReady(page, appFrame);
  } catch {
    await dismissHostDialogs(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissHostDialogsSettling(page);
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    await dismissHostDialogs(page);
    await waitForCreateInvoiceReady(page, appFrame);
  }
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
  await expect(appFrame.getByText('Send Instantly', { exact: true })).toBeVisible({
    timeout: 15000,
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
  await expect(appFrame.getByPlaceholder('mm/dd/yyyy').first()).not.toHaveValue('', {
    timeout: 30000,
  });
  await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeVisible({
    timeout: 15000,
  });
  await dismissHostDialogs(page);
}

async function setToggle(
  appFrame: FrameLocator,
  label: 'Adhoc Invoice' | 'Send Instantly',
  on: boolean
): Promise<void> {
  const labelLoc = appFrame.getByText(label, { exact: true });
  await expect(labelLoc).toBeVisible({ timeout: 20000 });
  const named = appFrame.getByRole('switch', { name: new RegExp(label, 'i') });
  const switchIndex = label === 'Adhoc Invoice' ? 0 : 1;
  const switchCtrl =
    (await named.count()) > 0 ? named.first() : appFrame.getByRole('switch').nth(switchIndex);
  await expect(switchCtrl).toBeVisible({ timeout: 20000 });

  for (let attempt = 0; attempt < 8; attempt++) {
    const checked = await switchCtrl.isChecked().catch(() => false);
    if (checked === on) break;
    if (attempt % 2 === 0) await switchCtrl.click({ force: true });
    else await labelLoc.click({ force: true });
    await expect
      .poll(async () => switchCtrl.isChecked().catch(() => false), {
        timeout: 4000,
        intervals: [200, 400, 800],
      })
      .toBe(on)
      .catch(() => undefined);
  }
  await expect(switchCtrl).toBeChecked({ checked: on, timeout: 15000 });
}

async function setAdhoc(appFrame: FrameLocator, on: boolean): Promise<void> {
  await setToggle(appFrame, 'Adhoc Invoice', on);
  if (!on) return;
  const brandNew = appFrame.getByRole('radio', { name: 'Brand New' });
  try {
    await expect(brandNew).toBeChecked({ timeout: 8000 });
  } catch {
    await appFrame.getByText('Brand New', { exact: true }).click();
    await expect(brandNew).toBeChecked({ timeout: 10000 });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function duplicateLocators(appFrame: FrameLocator) {
  return {
    title: appFrame.getByText(DUPLICATE.title, { exact: true }),
    cancel: appFrame.getByRole('button', { name: 'Cancel' }),
  };
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

async function selectProject(appFrame: FrameLocator, name: string): Promise<void> {
  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  const opener = (await findProject.isVisible().catch(() => false))
    ? findProject
    : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await expect(opener).toBeVisible({ timeout: 15000 });
  await selectComboOption(appFrame, opener, name);
  const dup = duplicateLocators(appFrame).title;
  await expect(selectedProjectButton(appFrame, name).or(dup)).toBeVisible({
    timeout: 15000,
  });
}

async function dismissDuplicateDialog(appFrame: FrameLocator): Promise<void> {
  const dup = duplicateLocators(appFrame);
  if (!(await dup.title.isVisible().catch(() => false))) return;
  if (await dup.cancel.isVisible().catch(() => false)) await dup.cancel.click();
  await expect(dup.title).toBeHidden({ timeout: 15000 });
}

/** True when the Canvas contract modal is on screen right now. */
async function contractModalOpen(appFrame: FrameLocator): Promise<boolean> {
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true });
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' });
  return (
    (await title.isVisible().catch(() => false)) ||
    (await findContract.isVisible().catch(() => false))
  );
}

/**
 * Multi-contract projects open a modal after Project OnChange:
 *   title "Please select the Contract." | combo "Find Contract" | Cancel / Ok (Ok disabled until chosen)
 *
 * Whether it appears is decided by Dataverse, not the DOM: pass the project's Active
 * contracts so a project with more than one *requires* the modal (we wait for it and fail
 * if it never renders), while a single-contract project costs no wait at all. Racing the
 * modal against line-item controls does not work — "Add new item" is present from the
 * start, so the race always short-circuits before the modal renders.
 */
async function selectContractIfPrompted(
  appFrame: FrameLocator,
  opts: { contracts?: ContractOption[]; label?: string } = {}
): Promise<string | null> {
  const contracts = opts.contracts ?? [];
  const expectModal = contracts.length > 1;
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true });
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' });

  if (expectModal) {
    console.log(
      `${opts.label ?? 'Project'} has ${contracts.length} Active contract(s) — expecting the contract modal: ` +
        contracts
          .map((c) => `${c.name}${c.coversInvoiceDate ? ' [covers invoice date]' : ''}`)
          .join(' | ')
    );
    await expect(
      title.or(findContract).first(),
      `Project has ${contracts.length} Active contracts, so "${CONTRACT_MODAL_TITLE}" must appear`
    ).toBeVisible({ timeout: 30000 });
  } else if (!(await contractModalOpen(appFrame))) {
    return null;
  }

  await expect(findContract).toBeVisible({ timeout: 15000 });
  await findContract.click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 20000 });

  const options = appFrame.getByRole('option');
  const names = (await options.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  console.log(`Contract modal: ${names.length} option(s) — ${names.join(' | ')}`);

  // Prefer a contract whose period covers the invoice date; the app rejects the rest.
  const preferred = contracts.filter((c) => c.coversInvoiceDate).map((c) => c.name);
  const order = [
    ...names.filter((n) => preferred.some((p) => p && n.toLowerCase() === p.toLowerCase())),
    ...names.filter((n) => !preferred.some((p) => p && n.toLowerCase() === p.toLowerCase())),
  ];
  if (preferred.length) {
    console.log(`Preferring contract(s) covering the invoice date: ${preferred.join(' | ')}`);
  }

  const ok = appFrame.getByRole('button', { name: 'Ok', exact: true });
  let chosen = '';
  for (const candidateName of order.length ? order : ['']) {
    if ((await options.count()) === 0) {
      await findContract.click();
      await expect(options.first()).toBeVisible({ timeout: 15000 });
    }
    const option = candidateName
      ? appFrame.getByRole('option', { name: candidateName, exact: true }).first()
      : options.first();
    if (!(await option.isVisible().catch(() => false))) continue;
    chosen = ((await option.innerText()) || candidateName).trim();
    await option.click();
    if (await ok.isEnabled().catch(() => false)) break;
    await expect(ok).toBeEnabled({ timeout: 5000 }).catch(() => undefined);
    if (await ok.isEnabled().catch(() => false)) break;
    console.log(`Contract "${chosen}" left Ok disabled — trying the next option`);
  }

  await expect(
    ok,
    `No contract option enabled Ok (tried ${order.join(' | ') || 'first option'})`
  ).toBeEnabled({ timeout: 15000 });
  await ok.click();

  // Modal chrome must fully leave before any line-item click will land.
  await expect(title).toBeHidden({ timeout: 20000 });
  await expect(findContract).toBeHidden({ timeout: 20000 });
  await expect(ok).toBeHidden({ timeout: 10000 }).catch(() => undefined);
  console.log(`Contract selected: ${chosen || '(unnamed)'}`);
  return chosen || '(selected)';
}

async function selectPartnerAndProject(
  appFrame: FrameLocator,
  fixture: ProjectFixture
): Promise<ProjectSelectOutcome> {
  await selectPartner(appFrame, fixture.partnerName);
  await expect(
    appFrame
      .getByRole('button', { name: 'Find Project' })
      .or(appFrame.getByRole('button', { name: /^Selected:/ }).nth(1))
  ).toBeVisible({ timeout: 20000 });

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

async function keepSingleLineItemRow(appFrame: FrameLocator): Promise<void> {
  const deleteImg = appFrame.getByRole('img', { name: /delete/i });
  for (let i = 0; i < 6; i++) {
    const n = await deleteImg.count();
    if (n <= 1) break;
    await deleteImg.last().click();
    await expect
      .poll(async () => deleteImg.count(), { timeout: 8000 })
      .toBeLessThan(n)
      .catch(() => undefined);
  }
}

async function selectProduct(appFrame: FrameLocator, productName: string): Promise<void> {
  const findItems = appFrame.getByRole('button', { name: 'Find items' });
  if ((await findItems.count()) === 0) {
    await appFrame.getByRole('button', { name: 'Add new item' }).click();
  }
  await keepSingleLineItemRow(appFrame);
  await expect(findItems.first()).toBeVisible({ timeout: 15000 });
  await findItems.first().click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
  const named = appFrame
    .getByRole('option', { name: productName, exact: true })
    .or(appFrame.getByRole('option', { name: new RegExp(`^${escapeRegExp(productName)}$`, 'i') }));
  if ((await named.count()) > 0) await named.first().click();
  else await appFrame.getByRole('option').first().click();

  // Some projects render more than one line-item row, so several combos can carry the
  // same "Selected: <product>" label — take the first rather than tripping strict mode.
  await expect(
    appFrame
      .getByRole('button', { name: productName, exact: true })
      .or(appFrame.getByRole('button', { name: `Selected: ${productName}`, exact: true }))
      .first()
  ).toBeVisible({ timeout: 15000 });

  // Product OnChange can append a blank row, which disables Submit.
  await keepSingleLineItemRow(appFrame);
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

async function selectTaxOption(appFrame: FrameLocator): Promise<void> {
  const taxAlready = appFrame
    .getByRole('button', { name: /^Selected:/ })
    .filter({ hasText: /%/ })
    .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
  if (await taxAlready.first().isVisible().catch(() => false)) return;

  const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
  await expect(findTax).toBeVisible({ timeout: 15000 });
  await findTax.click();
  const option = appFrame.getByRole('option').first();
  await expect(option).toBeVisible({ timeout: 15000 });
  await option.click();
}

async function awaitSubmitNavigatedToOverview(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText(TOAST.submitted).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
}

test.describe('Create Invoice region flows (Admin)', () => {
  test.describe.configure({ timeout: 600000 });

  let dataverseToken = '';
  let fixtures: CreateInvoiceFixtures = {
    eligibleNonAdhoc: null,
    duplicateNonAdhoc: null,
    noLastMonthInvoice: null,
    withLastInvoice: null,
    northAmerica: null,
    nonNorthAmerica: null,
    noActiveContract: null,
    noFourthMonthCoverage: null,
    multiActiveContract: null,
    coversFourthMonth: null,
    editableProduct: null,
    nonEditableProduct: null,
  };

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const persona = testInfo.project.name.toLowerCase().includes('pm') ? 'pm' : 'admin';
    dataverseToken = await captureDataverseToken(browser, APP_URL, persona);
    console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
    if (dataverseToken) {
      fixtures = await loadCreateInvoiceFixtures(dataverseToken, { persona });
      logFixtures(fixtures, persona);
    }
  });

  async function runFlowScenario(
    page: Page,
    testInfo: TestInfo,
    scenario: Scenario
  ): Promise<void> {
    test.skip(
      testInfo.project.name.toLowerCase().includes('pm'),
      'Admin-only: Adhoc Create Invoice + flow tracking'
    );
    test.skip(!dataverseToken, 'No Dataverse token');
    test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');

    // Candidates come from loaded fixtures — those names are in the Canvas dropdowns.
    const candidates = scenario.candidates(fixtures);
    test.skip(
      candidates.length === 0,
      `No ${scenario.label} project fixture in this Dataverse`
    );

    // Knowing each candidate's Active contracts up front makes the contract modal
    // deterministic instead of a DOM guess.
    const contractsByProject = new Map<string, ContractOption[]>();
    for (const candidate of candidates) {
      contractsByProject.set(
        candidate.projectId,
        await listActiveContractsForProject(dataverseToken, candidate.projectId)
      );
    }

    const session = beginFlowCapture(page, dataverseToken);

    const appFrame = await openCreateInvoice(page);
    await setAdhoc(appFrame, true);
    await expect(appFrame.getByRole('switch').first()).toBeChecked();
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

    let project: ProjectFixture | null = null;
    let contractName: string | null = null;
    for (const candidate of candidates) {
      console.log(
        `Trying ${scenario.label} project ${candidate.partnerName} / ${candidate.projectName}`
      );
      const outcome = await selectPartnerAndProject(appFrame, candidate);
      contractName = await selectContractIfPrompted(appFrame, {
        contracts: contractsByProject.get(candidate.projectId),
        label: candidate.projectName,
      });
      const stuck = await selectedProjectButton(appFrame, candidate.projectName)
        .isVisible()
        .catch(() => false);
      if (outcome !== 'duplicate' && stuck) {
        project = candidate;
        break;
      }
      await dismissDuplicateDialog(appFrame);
    }
    test.skip(
      !project,
      `All ${scenario.label} candidates hit Duplicate Project! or failed to stick`
    );

    expect(
      isNorthAmericaRegion(project!.region),
      `Expected ${scenario.label} region, got "${project!.region ?? ''}"`
    ).toBe(scenario.regionKind === 'north-america');
    console.log(
      `${scenario.label} project ${project!.partnerName} / ${project!.projectName} [${project!.region}]` +
        (contractName ? ` | contract=${contractName}` : ' | (no contract modal)')
    );

    // A late contract modal would swallow every line-item click that follows.
    if (await contractModalOpen(appFrame)) {
      contractName =
        (await selectContractIfPrompted(appFrame, {
          contracts: contractsByProject.get(project!.projectId),
          label: project!.projectName,
        })) ?? contractName;
    }
    await selectProduct(appFrame, fixtures.editableProduct!.name);
    await fillLineItem(page, appFrame, {
      description: LINE_DESCRIPTION,
      qty: '1',
      rate: '50',
    });
    await keepSingleLineItemRow(appFrame);

    if (await appFrame.getByRole('button', { name: 'Find Project' }).isVisible().catch(() => false)) {
      await selectProject(appFrame, project!.projectName);
      await expect(selectedProjectButton(appFrame, project!.projectName)).toBeVisible({
        timeout: 15000,
      });
    }

    // Tax is an NA-only control; other regions never render Find Tax.
    if (scenario.regionKind === 'north-america') {
      const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
      const taxAlready = appFrame
        .getByRole('button', { name: /^Selected:/ })
        .filter({ hasText: /%/ })
        .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
      await expect(findTax.or(taxAlready.first())).toBeVisible({ timeout: 20000 });
      if (await findTax.isVisible().catch(() => false)) {
        await selectTaxOption(appFrame);
      }
    } else if (await appFrame.getByRole('button', { name: 'Find Tax' }).isVisible().catch(() => false)) {
      await selectTaxOption(appFrame);
    }
    await keepSingleLineItemRow(appFrame);

    const submitBtn = appFrame.getByRole('button', { name: 'Submit' });
    await expect(submitBtn).toBeEnabled({ timeout: 30000 });

    await test.step(`${scenario.label} form ready — before Submit`, async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Adhoc Invoice', { exact: true }),
          selectedPartnerButton(appFrame, project!.partnerName),
          selectedProjectButton(appFrame, project!.projectName),
          submitBtn,
        ],
        `${scenario.label} form ready — before Submit`,
        testInfo
      );
    });

    const submitStartedAt = new Date().toISOString();
    await submitBtn.click();
    await awaitSubmitNavigatedToOverview(appFrame);

    await test.step(`Submitted ${scenario.label} invoice — Invoice Overview`, async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Invoice Overview', { exact: true }).first(),
          appFrame.getByText(project!.projectName).first(),
          appFrame.getByText(/Submitted|Draft|Reviewed|Fail-/i).first(),
        ],
        `Submitted ${scenario.label} invoice — Invoice Overview`,
        testInfo
      );
    });

    // UI work is done. Everything below is Dataverse polling, so close the browser rather
    // than leaving it parked on Invoice Overview while flows finish.
    await page.close().catch(() => undefined);
    console.log('Browser closed — waiting on Dataverse for flow completion');

    const evidence = await captureSubmitFlowEvidence({
      token: dataverseToken,
      testInfo,
      session,
      action: 'Submit',
      project: {
        partnerName: project!.partnerName,
        projectName: project!.projectName,
        region: project!.region,
        projectId: project!.projectId,
      },
      submitStartedAt,
    });

    expect(evidence.regionKind).toBe(scenario.regionKind);
    expect(
      evidence.expectedLabel,
      `${scenario.label} Submit must map to ${scenario.flowLabel}`
    ).toMatch(scenario.flowNamePattern);
    assertSubmitFlowEvidence(evidence);
    expect
      .soft(evidence.audit.invoice?.invoiceNumber ?? '', 'Create flow should stamp an invoice number')
      .not.toBe('');

    const fired = evidence.slots.filter((s) => s.fired).map((s) => s.label);
    console.log(
      `${scenario.label} main flows fired: ${fired.length ? fired.join(', ') : '(none synced yet)'}` +
        ` | invoice #${evidence.audit.invoice?.invoiceNumber || '(none)'} status=${evidence.audit.invoice?.status ?? '?'}`
    );
  }

  test('TC-CIF-01: [Admin] Submit NA invoice — track Create Invoice - NA Region family', async ({
    page,
  }, testInfo: TestInfo) => {
    await runFlowScenario(page, testInfo, SCENARIOS['north-america']);
  });

  test('TC-CIF-02: [Admin] Submit non-NA invoice — track Create Invoice - Other Region family', async ({
    page,
  }, testInfo: TestInfo) => {
    await runFlowScenario(page, testInfo, SCENARIOS.other);
  });
});

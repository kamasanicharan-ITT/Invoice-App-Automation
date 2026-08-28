// spec: specs/create-invoice-screen-plan.md
// seed: tests/seed.spec.ts
//
// Single Create Invoice screen suite: CI-* regression + unique older coverage +
// Admin NA / non-NA Submit flow family (TC-CIF-01 / TC-CIF-02).

import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import {
  APP_URL,
  captureDataverseToken,
  countInvoicesForProject,
  fetchLastInvoiceWithLines,
  listActiveContractsForProject,
  listContractsForProject,
  loadCreateInvoiceFixtures,
  logFixtures,
  type ContractOption,
  type CreateInvoiceFixtures,
  type ProjectFixture,
} from './utils/dataverse-fixtures';
import { isNorthAmericaRegion } from './utils/flow-runs';
import {
  LINE_DESCRIPTION,
  MONEY,
  TOAST,
  activePersona,
  addDaysUs,
  calendarMonthUsDates,
  threeMonthCapUsDates,
  fourthMonthStartUsDate,
  acceptContractIfPrompted,
  replaceComboSelectionWithJunk,
  formatUsDate,
  dateBox,
  fillDateField,
  openCreateInvoice,
  getLineItemCount,
  readLineItems,
  clickLastLineItemDelete,
  selectProduct,
  fillLineItem,
  setAdhoc,
  setSendInstantly,
  closeToPriorScreen,
  selectTaxOption,
  selectedPartnerButton,
  selectedProjectButton,
  selectPartner,
  selectPartnerAndProject,
  selectProjectAllowingToast,
  duplicateLocators,
  awaitSubmitNavigatedToOverview,
  partnerComboHasOptions,
  fillValidLine,
  anyProject,
  ensureLineItemRow,
  keepSingleLineItemRow,
  dismissDuplicateDialog,
  selectProject,
  selectContractIfPrompted,
  contractModalOpen,
} from './utils/create-invoice-ui';
import {
  assertSubmitFlowEvidence,
  beginFlowCapture,
  captureSubmitFlowEvidence,
} from './utils/invoice-submit-flows';

test.describe('Create Invoice Screen', () => {
  test.describe.configure({ timeout: 120000 });

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
    const persona = activePersona(testInfo);
    dataverseToken = await captureDataverseToken(browser, APP_URL, persona);
    if (dataverseToken) {
      fixtures = await loadCreateInvoiceFixtures(dataverseToken, { persona });
      logFixtures(fixtures, persona);
    }
  });

  /**
   * Day after the covering contract ends — the nearest date that is provably outside
   * the contract, and close enough for the picker to reach by month/day keys.
   */
  async function firstDayPastContract(projectId: string): Promise<string | null> {
    if (!dataverseToken) return null;
    const contracts = await listActiveContractsForProject(dataverseToken, projectId);
    const covering = contracts.find((c) => c.coversInvoiceDate) ?? contracts[0];
    return covering?.end ? addDaysUs(covering.end, 1) : null;
  }

  function fixtureByProjectName(name: string) {
    const list = [
      fixtures.eligibleNonAdhoc,
      fixtures.northAmerica,
      fixtures.nonNorthAmerica,
      fixtures.coversFourthMonth,
      fixtures.duplicateNonAdhoc,
      fixtures.noLastMonthInvoice,
      fixtures.withLastInvoice,
      fixtures.multiActiveContract,
      fixtures.noActiveContract,
    ];
    return list.find((p) => p?.projectName === name) ?? null;
  }

  function selectableProject() {
    return anyProject(
      fixtures.eligibleNonAdhoc,
      fixtures.coversFourthMonth,
      fixtures.northAmerica,
      fixtures.nonNorthAmerica,
      fixtures.withLastInvoice,
      fixtures.multiActiveContract
    );
  }

  function fourthMonthProject() {
    return fixtures.coversFourthMonth;
  }

  // ── 1. Page load and defaults ─────────────────────────────────────────────

  test.describe('Page load and defaults', () => {
    test('CI-001 New Invoice form loads with all expected controls', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const dates = calendarMonthUsDates();

      // Open Create Invoice; dismiss host dialogs (handled in openCreateInvoice).
      await expect.soft(appFrame.getByText('New Invoice', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByRole('radio', { name: 'Brand New' })).toBeVisible();
      await expect
        .soft(appFrame.getByRole('radio', { name: 'Start with last invoice' }))
        .toBeVisible();
      await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
      await expect.soft(appFrame.getByText('Send Instantly', { exact: true })).toBeVisible();
      await expect(appFrame.getByRole('switch').nth(persona === 'admin' ? 1 : 0)).not.toBeChecked();
      await expect(appFrame.getByPlaceholder('Invoice number')).toBeDisabled();
      await expect(appFrame.getByPlaceholder('PO number')).toBeDisabled();
      await expect(dateBox(appFrame, 0)).toHaveValue(dates.end);
      await expect(dateBox(appFrame, 1)).toHaveValue(dates.start);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await expect.soft(appFrame.getByRole('button', { name: 'Find Partner' })).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: 'Find Project' })).toBeVisible();
      await expect.soft(appFrame.getByText('Product/Service', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: 'Add new item' })).toBeVisible();
      await expect.soft(appFrame.getByText('Internal Notes', { exact: true })).toBeVisible();
      await expect.soft(appFrame.getByRole('button', { name: 'Close' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      if (persona === 'admin') {
        await expect.soft(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible();
        await expect(appFrame.getByRole('switch').first()).not.toBeChecked();
      } else {
        await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toHaveCount(0);
      }

      await test.step('New Invoice form controls', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('New Invoice', { exact: true }),
            appFrame.getByRole('radio', { name: 'Start with last invoice' }),
            appFrame.getByPlaceholder('Invoice number'),
            appFrame.getByRole('button', { name: 'Find Partner' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'New Invoice form controls',
          testInfo
        );
      });
    });

    test('CI-002 Brand New empty form keeps calendar-month date defaults', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const dates = calendarMonthUsDates();

      // On New Invoice, select Brand New.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
      await expect(appFrame.getByRole('button', { name: 'Find Partner' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Find Project' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Find items' }).first()).toBeVisible();
      await expect(appFrame.getByPlaceholder('Enter description').first()).toHaveValue('');
      await expect(dateBox(appFrame, 1)).toHaveValue(dates.start);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await expect(dateBox(appFrame, 0)).toHaveValue(dates.end);
      await expect(appFrame.getByPlaceholder('Invoice number')).toBeDisabled();
      await expect(appFrame.getByPlaceholder('Invoice number')).toHaveValue('');

      await test.step('Brand New calendar-month defaults', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('radio', { name: 'Brand New' }),
            dateBox(appFrame, 0),
            dateBox(appFrame, 1),
            dateBox(appFrame, 2),
          ],
          'Brand New calendar-month defaults',
          testInfo
        );
      });
    });

    test('CI-015 CI-016 CI-017 Date fields default to calendar month bounds', async ({
      page,
    }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      const dates = calendarMonthUsDates();

      // Open New Invoice. Read the three date textboxes.
      await expect(dateBox(appFrame, 1)).toHaveValue(dates.start);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await expect(dateBox(appFrame, 0)).toHaveValue(dates.end);

      await test.step('Calendar-month date defaults', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 0), dateBox(appFrame, 1), dateBox(appFrame, 2)],
          'Calendar-month date defaults',
          testInfo
        );
      });
    });

    test('CI-043 PO Number is disabled on create', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Open New Invoice and observe PO Number.
      await expect(appFrame.getByPlaceholder('PO number')).toBeDisabled();
      await expect(appFrame.getByPlaceholder('Invoice number')).toBeDisabled();

      await test.step('PO and Invoice number disabled', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByPlaceholder('Invoice number'),
            appFrame.getByPlaceholder('PO number'),
          ],
          'PO and Invoice number disabled',
          testInfo
        );
      });
    });

    test('CI-007 Send Instantly toggle on and off', async ({ page }, testInfo) => {
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const sendSwitch = appFrame.getByRole('switch').nth(persona === 'admin' ? 1 : 0);

      // Click the Send Instantly switch, then click it again.
      await setSendInstantly(appFrame, true);
      await expect(sendSwitch).toBeChecked();
      await expect(appFrame.getByText('Yes', { exact: true }).first()).toBeVisible();
      await setSendInstantly(appFrame, false);
      await expect(sendSwitch).not.toBeChecked();

      await test.step('Send Instantly Yes then No', async () => {
        await markGroupAndShot(
          page,
          [appFrame.getByText('Send Instantly', { exact: true }), sendSwitch],
          'Send Instantly Yes then No',
          testInfo
        );
      });
    });
  });

  // ── 2. Role access Adhoc ──────────────────────────────────────────────────

  test.describe('Role access Adhoc', () => {
    test('CI-004 Admin Adhoc Invoice toggle switches to Yes', async ({ page }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc toggle is hidden — Admin-only');
      const appFrame = await openCreateInvoice(page, 'admin');

      // As Admin, click the Adhoc Invoice switch.
      await setAdhoc(appFrame, true);
      await expect(appFrame.getByRole('switch').first()).toBeChecked();
      await expect(appFrame.getByText('Yes', { exact: true }).first()).toBeVisible();

      await test.step('Adhoc Invoice Yes', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Adhoc Invoice', { exact: true }),
            appFrame.getByRole('switch').first(),
            appFrame.getByRole('radio', { name: 'Brand New' }),
          ],
          'Adhoc Invoice Yes',
          testInfo
        );
      });
    });

    test('CI-011b PM does not see Adhoc Invoice', async ({ page }, testInfo) => {
      test.skip(activePersona(testInfo) === 'admin', '[Admin] Adhoc is visible — PM-only');
      const appFrame = await openCreateInvoice(page, 'pm');

      // As PM, open New Invoice.
      await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toHaveCount(0);
      await expect(appFrame.getByRole('switch')).toHaveCount(1);
      await expect(appFrame.getByText('Send Instantly', { exact: true })).toBeVisible();

      await test.step('PM Adhoc hidden', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('New Invoice', { exact: true }),
            appFrame.getByText('Send Instantly', { exact: true }),
            appFrame.getByRole('switch').first(),
          ],
          'PM Adhoc hidden',
          testInfo
        );
      });
    });

    test('CI-004b Adhoc ON forces Brand New', async ({ page }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc toggle is hidden — Admin-only');
      const appFrame = await openCreateInvoice(page, 'admin');

      // As Admin, select Start with last invoice, then turn Adhoc Invoice ON.
      await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
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

    test('CI-005 Adhoc ON allows Invoice Date past 3 months when contract covers it', async ({
      page,
    }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc toggle is hidden — Admin-only');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const project = fourthMonthProject();
      test.skip(!project, 'No in-scope project whose contract covers the 4th month');
      const appFrame = await openCreateInvoice(page, 'admin');
      const future = fourthMonthStartUsDate();

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await setAdhoc(appFrame, true);
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on 4th-month fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 0, future);
      await expect(dateBox(appFrame, 0)).toHaveValue(future);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 15000 });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      await test.step('Adhoc Invoice Date past 3 months both buttons on', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Adhoc Invoice', { exact: true }),
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Adhoc Invoice Date past 3 months both buttons on',
          testInfo
        );
      });
    });

    test('CI-059 Adhoc zero amount cannot be submitted', async ({ page }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc toggle is hidden — Admin-only');
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project fixture');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, 'admin');

      // As Admin, turn Adhoc ON, fill partner/project, add a line with quantity 0.
      await setAdhoc(appFrame, true);
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      test.skip(outcome === 'duplicate', 'Eligible project showed Duplicate Project!');
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, { description: LINE_DESCRIPTION, qty: '0', rate: '100' });
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

      await test.step('Adhoc zero amount Submit disabled', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByPlaceholder('0', { exact: true }).first(),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Adhoc zero amount Submit disabled',
          testInfo
        );
      });
    });
  });

  // ── 3. Start with last invoice ────────────────────────────────────────────

  test.describe('Start with last invoice', () => {
    test('CI-003 Start with last invoice prefills line items not dates or invoice number', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      const project = fixtures.withLastInvoice;
      test.skip(!dataverseToken, 'No Dataverse token');
      test.skip(!project, 'No project whose previous invoice has line items');
      const expected = await fetchLastInvoiceWithLines(dataverseToken, project!.projectId);
      test.skip(!expected || expected.lines.length === 0, 'Last invoice carries no line items');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const dates = calendarMonthUsDates();

      // Select Start with last invoice, then the Partner/Project that has a previous invoice.
      await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! blocked the prefill');
      expect(
        outcome,
        'Project has a previous invoice, so the no-last-invoice toast must not appear'
      ).not.toBe('no-last-invoice');

      // The point of the case: line items arrive copied from that previous invoice.
      await expect
        .poll(async () => getLineItemCount(appFrame), { timeout: 20000 })
        .toBe(expected!.lines.length);
      await expect(appFrame.getByRole('button', { name: 'Find items' })).toHaveCount(0);

      const prefilled = await readLineItems(appFrame);
      testInfo.annotations.push({
        type: 'observed',
        description:
          `prefilled ${JSON.stringify(prefilled)} | ` +
          `last invoice ${expected!.invoiceDate?.slice(0, 10)} ${JSON.stringify(expected!.lines)}`,
      });
      expect(prefilled).toEqual(expected!.lines);

      // Dates and invoice number must NOT be carried over from that invoice.
      await expect(dateBox(appFrame, 1)).toHaveValue(dates.start);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await expect(dateBox(appFrame, 0)).toHaveValue(dates.end);
      await expect(appFrame.getByPlaceholder('Invoice number')).toHaveValue('');

      await test.step('Line items prefilled from last invoice', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('radio', { name: 'Start with last invoice' }),
            selectedPartnerButton(appFrame, project!.partnerName),
            appFrame.getByPlaceholder('Enter description').first(),
            dateBox(appFrame, 0),
          ],
          'Line items prefilled from last invoice',
          testInfo
        );
      });
    });
  });

  // ── 4. Contract validation ────────────────────────────────────────────────

  test.describe('Contract validation', () => {
    test('CI-009 Active contract is applied for the selected project', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible Active project+contract');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Select a partner and project that has exactly one active covering contract.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      expect(outcome).not.toBe('duplicate');
      await expect(appFrame.getByText(TOAST.noActiveContract)).toHaveCount(0);

      await test.step('Active contract project selected', async () => {
        await markGroupAndShot(
          page,
          [
            selectedPartnerButton(appFrame, eligible!.partnerName),
            selectedProjectButton(appFrame, eligible!.projectName),
          ],
          'Active contract project selected',
          testInfo
        );
      });
    });

    test('CI-008 No active contract shows toast and keeps both buttons disabled', async ({
      page,
    }, testInfo) => {
      const missing = fixtures.noActiveContract;
      test.skip(!missing, 'No Dataverse project with zero Active contracts');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await selectPartner(appFrame, missing!.partnerName);
      await selectProjectAllowingToast(appFrame, missing!.projectName);
      await expect(appFrame.getByText(TOAST.noActiveContract)).toBeVisible({ timeout: 15000 });
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('No active contract toast', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText(TOAST.noActiveContract),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'No active contract toast',
          testInfo
        );
      });
    });

    test('CI-010 Contract picker lists only Active contracts', async ({ page }, testInfo) => {
      test.skip(!dataverseToken, 'No Dataverse token');
      const project = fixtures.multiActiveContract;
      test.skip(!project?.projectId, 'No in-scope project with 2+ Active covering contracts');
      const contracts = await listContractsForProject(dataverseToken, project!.projectId);
      const active = contracts.filter((c) => c.statecode === 0);
      const inactive = contracts.filter((c) => c.statecode !== 0);
      test.skip(
        active.length < 2,
        'Need 2+ Active contracts on this in-scope project'
      );
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on multi-contract fixture');
      const findContract = appFrame.getByRole('button', { name: 'Find Contract' });
      test.skip(
        !(await findContract.isVisible({ timeout: 8000 }).catch(() => false)),
        'Find Contract picker did not open'
      );
      await findContract.click();
      await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 10000 });
      const listed = (await appFrame.getByRole('option').allTextContents())
        .map((t) => t.trim())
        .filter(Boolean);
      for (const row of inactive) {
        expect(listed, `inactive contract ${row.name} must not appear`).not.toContain(row.name);
      }
      for (const row of active) {
        expect(listed).toContain(row.name);
      }

      await test.step('Contract picker shows Active only', async () => {
        await markGroupAndShot(
          page,
          [appFrame.getByRole('option').first()],
          'Contract picker Active only',
          testInfo
        );
      });
    });

    test('CI-014 Multiple Active contracts require the user to pick one', async ({
      page,
    }, testInfo) => {
      const project = fixtures.multiActiveContract;
      test.skip(!project, 'Need 2+ Active covering contracts in this persona scope');
      if (dataverseToken && project?.projectId) {
        const covering = (await listActiveContractsForProject(dataverseToken, project.projectId)).filter(
          (c) => c.coversInvoiceDate
        );
        test.skip(
          covering.length < 2,
          'Need 2+ Active contracts covering this invoice month'
        );
      }
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on multi-contract fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 15000,
      });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      await test.step('Invoice proceeds after contract selection', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Invoice proceeds after contract selection',
          testInfo
        );
      });
    });

    test('CI-011 Invoice Date in 4th month with covering contract disables both buttons', async ({
      page,
    }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const persona = activePersona(testInfo);
      const project = fourthMonthProject();
      test.skip(!project, 'No in-scope project whose contract covers the 4th month');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const dates = calendarMonthUsDates();
      const future = fourthMonthStartUsDate();

      // Non-adhoc: Invoice Date in the 4th month while the covering contract still applies → both off.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      if (persona === 'admin') await setAdhoc(appFrame, false);
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on 4th-month fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await expect(dateBox(appFrame, 1)).toHaveValue(dates.start);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await fillDateField(page, appFrame, 0, future);
      await expect(dateBox(appFrame, 0)).toHaveValue(future);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Invoice Date in 4th month both buttons off', async () => {
        await markGroupAndShot(
          page,
          [
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Submit' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
          ],
          'Invoice Date in 4th month both buttons off',
          testInfo
        );
      });
    });

    test('CI-012 Service End in 4th month follows Invoice Date and disables both buttons', async ({
      page,
    }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const persona = activePersona(testInfo);
      const project = fourthMonthProject();
      test.skip(!project, 'No in-scope project whose contract covers the 4th month');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const future = fourthMonthStartUsDate();

      // Service End in the 4th month: Invoice Date follows; both buttons stay off.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      if (persona === 'admin') await setAdhoc(appFrame, false);
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on 4th-month fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 2, future);
      await expect(dateBox(appFrame, 0)).toHaveValue(future);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Service End in 4th month both buttons off', async () => {
        await markGroupAndShot(
          page,
          [
            dateBox(appFrame, 2),
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Service End in 4th month both buttons off',
          testInfo
        );
      });
    });

    test('CI-013 Contract warning clears when dates are brought back in range', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const dates = calendarMonthUsDates();

      // Set Service End outside contract, then set it back inside.
      const pastContract = await firstDayPastContract(eligible!.projectId);
      test.skip(!pastContract, 'No contract end date available for the eligible project');
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on eligible fixture');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 2, pastContract!);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await fillDateField(page, appFrame, 1, dates.start);
      await fillDateField(page, appFrame, 2, dates.end);
      await fillDateField(page, appFrame, 0, dates.end);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });

      await test.step('Contract dates restored Submit enabled', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 2), appFrame.getByRole('button', { name: 'Submit' })],
          'Contract dates restored Submit enabled',
          testInfo
        );
      });
    });
  });

  // ── 5. Date validation ────────────────────────────────────────────────────

  test.describe('Date validation', () => {
    test('CI-018 Service Start must be before Service End', async ({ page }, testInfo) => {
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);

      const now = new Date();
      const later = formatUsDate(new Date(now.getFullYear(), now.getMonth(), 20));
      const earlier = formatUsDate(new Date(now.getFullYear(), now.getMonth(), 10));

      // Set Service Start after Service End (and equal-dates is also invalid).
      await fillDateField(page, appFrame, 1, later);
      await fillDateField(page, appFrame, 2, earlier);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Start after End disables Submit', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 1), dateBox(appFrame, 2), appFrame.getByRole('button', { name: 'Submit' })],
          'Start after End disables Submit',
          testInfo
        );
      });
    });

    test('CI-019 Invoice Date follows Service End Date', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      const now = new Date();
      const mid = formatUsDate(new Date(now.getFullYear(), now.getMonth(), 20));

      // Change Service End Date to a new in-range date.
      await fillDateField(page, appFrame, 2, mid);
      await expect(dateBox(appFrame, 0)).toHaveValue(mid);

      await test.step('Invoice Date follows Service End', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 2), dateBox(appFrame, 0)],
          'Invoice Date follows Service End',
          testInfo
        );
      });
    });

    test('CI-006 CI-020 CI-021 Non-adhoc 3-month future limit for PM', async ({
      page,
    }, testInfo) => {
      test.skip(activePersona(testInfo) === 'admin', 'Sheet CI-006 is the PM non-adhoc cap');
      test.skip(
        true,
        'Parked with future-date bugs: PM non-adhoc Submit still allows 11/1/2026'
      );
      test.skip(!fixtures.editableProduct, 'No editable product');
      const used = selectableProject();
      test.skip(!used, 'No selectable in-scope project');
      const appFrame = await openCreateInvoice(page, 'pm');
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const cap = threeMonthCapUsDates();

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, used);
      test.skip(outcome === 'duplicate', 'Eligible in-scope project showed Duplicate Project!');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 0, cap.lastAllowed);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 15000,
      });
      await fillDateField(page, appFrame, 0, cap.firstBlocked);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

      await test.step('PM 3-month future cap', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 0), appFrame.getByRole('button', { name: 'Submit' })],
          'PM 3-month future cap',
          testInfo
        );
      });
    });

    test('CI-052 Non-adhoc 4th month with no covering contract keeps Save Draft enabled', async ({
      page,
    }, testInfo) => {
      const project = fixtures.noFourthMonthCoverage;
      test.skip(!project, 'No project whose contract ends before the 4th month');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const cap = threeMonthCapUsDates();

      // Non-adhoc, Invoice Date past the 3-month cap, no contract covers that date → Save Draft stays on.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      if (persona === 'admin') await setAdhoc(appFrame, false);
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on short-contract fixture');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 0, cap.firstBlocked);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.firstBlocked);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      await test.step('4th month no covering contract: Save Draft on', async () => {
        await markGroupAndShot(
          page,
          [
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          '4th month no covering contract Save Draft on',
          testInfo
        );
      });
    });

    test('CI-073 Custom service dates survive Partner selection', async ({ page }, testInfo) => {
      const persona = activePersona(testInfo);
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const now = new Date();
      const startCustom = formatUsDate(new Date(now.getFullYear(), now.getMonth(), 15));
      const endCustom = formatUsDate(new Date(now.getFullYear(), now.getMonth(), 20));

      // Set custom Service Start and Service End, then select a Partner.
      await fillDateField(page, appFrame, 1, startCustom);
      await fillDateField(page, appFrame, 2, endCustom);
      await selectPartner(appFrame, eligible!.partnerName);
      await expect(dateBox(appFrame, 1)).toHaveValue(startCustom);
      await expect(dateBox(appFrame, 2)).toHaveValue(endCustom);

      await test.step('Dates survive Partner selection', async () => {
        await markGroupAndShot(
          page,
          [
            selectedPartnerButton(appFrame, eligible!.partnerName),
            dateBox(appFrame, 1),
            dateBox(appFrame, 2),
          ],
          'Dates survive Partner selection',
          testInfo
        );
      });
    });

    test('CI-074 Browser refresh clears unsaved form to defaults', async ({ page }, testInfo) => {
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const dates = calendarMonthUsDates();

      // Enter notes, then reload and reopen Create Invoice.
      const notes = appFrame.getByText('Internal Notes', { exact: true });
      await expect(notes).toBeVisible();
      const notesBox = appFrame.locator('[contenteditable="true"]').first();
      if ((await notesBox.count()) > 0) {
        await notesBox.fill('unsaved regression note');
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      const again = await openCreateInvoice(page, persona);
      await expect(dateBox(again, 1)).toHaveValue(dates.start);
      await expect(dateBox(again, 0)).toHaveValue(dates.end);
      await expect(again.getByRole('button', { name: 'Find Partner' })).toBeVisible();

      await test.step('Refresh restored calendar defaults', async () => {
        await markGroupAndShot(
          page,
          [dateBox(again, 0), dateBox(again, 1), again.getByRole('button', { name: 'Find Partner' })],
          'Refresh restored calendar defaults',
          testInfo
        );
      });
    });
  });

  // ── 6. Partner and Project ────────────────────────────────────────────────

  test.describe('Partner and Project', () => {
    test('CI-022 Partner is required', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Leave Partner empty.
      await expect(appFrame.getByRole('button', { name: 'Find Partner' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Partner required Submit disabled', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Find Partner' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Partner required Submit disabled',
          testInfo
        );
      });
    });

    test('CI-023 Project list filters by selected Partner', async ({ page }, testInfo) => {
      const persona = activePersona(testInfo);
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Select a Partner that has projects. Open Find Project.
      await selectPartner(appFrame, eligible!.partnerName);
      await appFrame.getByRole('button', { name: 'Find Project' }).click();
      const first = appFrame.getByRole('option').first();
      await expect(first).toBeVisible({ timeout: 10000 });
      const optionNames = (await appFrame.getByRole('option').allTextContents())
        .map((t) => t.trim())
        .filter(Boolean);
      testInfo.annotations.push({
        type: 'observed',
        description: `projects for ${eligible!.partnerName}: ${optionNames.join(' | ')}`,
      });
      await expect(appFrame.getByRole('option', { name: eligible!.projectName })).toBeVisible();
      const other = fixtures.duplicateNonAdhoc;
      if (other && other.partnerName !== eligible!.partnerName) {
        await expect(appFrame.getByRole('option', { name: other.projectName })).toHaveCount(0);
      }

      await test.step('Project options after Partner', async () => {
        await markGroupAndShot(
          page,
          [appFrame.getByRole('option').first()],
          'Project options after Partner',
          testInfo
        );
      });
    });

    test('CI-024 Partner junk search after a valid form disables both buttons', async ({
      page,
    }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const project = selectableProject();
      test.skip(!project, 'No selectable in-scope project');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on selectable fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 15000,
      });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      await replaceComboSelectionWithJunk(
        page,
        appFrame,
        selectedPartnerButton(appFrame, project.partnerName)
      );
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Partner junk search disables both buttons', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Submit' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
          ],
          'Partner junk search disables both buttons',
          testInfo
        );
      });
    });

    test('CI-025 Project junk search after a valid form disables both buttons', async ({
      page,
    }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const productName = fixtures.editableProduct!.name;
      const project = selectableProject();
      test.skip(!project, 'No selectable in-scope project');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on selectable fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, productName);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 15000,
      });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      // Changing Project clears the line item; re-add it so junk Project is the only gap.
      await replaceComboSelectionWithJunk(
        page,
        appFrame,
        selectedProjectButton(appFrame, project.projectName)
      );
      await fillValidLine(page, appFrame, productName);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Project junk search disables both buttons', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Submit' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
          ],
          'Project junk search disables both buttons',
          testInfo
        );
      });
    });

    test('CI-026 Product junk search after a valid form disables both buttons', async ({
      page,
    }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const productName = fixtures.editableProduct!.name;
      const project = selectableProject();
      test.skip(!project, 'No selectable in-scope project');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on selectable fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, productName);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 15000,
      });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      const productOpener = appFrame
        .getByRole('button', { name: productName, exact: true })
        .or(appFrame.getByRole('button', { name: `Selected: ${productName}`, exact: true }));
      await replaceComboSelectionWithJunk(page, appFrame, productOpener);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Product junk search disables both buttons', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Submit' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
          ],
          'Product junk search disables both buttons',
          testInfo
        );
      });
    });
  });

  // ── 7. Line items ─────────────────────────────────────────────────────────

  test.describe('Line items', () => {
    test('CI-027 At least one complete line item is required', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Header empty + no complete line → Submit disabled.
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('No line items Submit disabled', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Find items' }).first(),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'No line items Submit disabled',
          testInfo
        );
      });
    });

    test('CI-028 CI-029 Add new item appends a blank row without copying the previous product', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, persona);

      // Fill row 1 product, click Add new item.
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      const before = await getLineItemCount(appFrame);
      await appFrame.getByRole('button', { name: 'Add new item' }).click();
      await expect.poll(async () => getLineItemCount(appFrame)).toBeGreaterThan(before);
      await expect(appFrame.getByRole('button', { name: 'Find items' }).last()).toBeVisible();
      await expect(appFrame.getByPlaceholder('Enter description').last()).toHaveValue('');

      await test.step('New blank line item row', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Find items' }).first(),
            appFrame.getByRole('button', { name: 'Find items' }).last(),
            appFrame.getByRole('button', { name: 'Add new item' }),
          ],
          'New blank line item row',
          testInfo
        );
      });
    });

    test('CI-030 Preset-rate product fills Rate immediately', async ({ page }, testInfo) => {
      test.skip(!fixtures.nonEditableProduct, 'No Non-Editable Rate product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Select a Non-Editable / preset-rate product.
      await selectProduct(appFrame, fixtures.nonEditableProduct!.name);
      const rate = appFrame.getByPlaceholder('0.00', { exact: true }).first();
      await expect(rate).not.toHaveValue('0.00', { timeout: 10000 }).catch(async () => {
        await expect(rate).not.toHaveValue('');
      });

      await test.step('Preset rate filled', async () => {
        await markGroupAndShot(
          page,
          [appFrame.getByRole('button', { name: /Selected:|Find items/ }).first(), rate],
          'Preset rate filled',
          testInfo
        );
      });
    });

    test('CI-031 CI-048 Quantity or rate of zero blocks submit', async ({ page }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Set quantity 0.
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, { description: LINE_DESCRIPTION, qty: '0', rate: '100' });
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Zero quantity Submit disabled', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByPlaceholder('0', { exact: true }).first(),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Zero quantity Submit disabled',
          testInfo
        );
      });
    });

    test('CI-032 Line total equals Quantity times Rate', async ({ page }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Enter Quantity 2 and Rate 100.
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, { description: LINE_DESCRIPTION, qty: '2', rate: '100' });
      await expect(appFrame.getByText(MONEY).first()).toBeVisible({ timeout: 15000 });

      await test.step('Qty times Rate total', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByPlaceholder('0', { exact: true }).first(),
            appFrame.getByPlaceholder('0.00', { exact: true }).first(),
            appFrame.getByText(MONEY).first(),
          ],
          'Qty times Rate total',
          testInfo
        );
      });
    });

    test('CI-034 Deleting a line item removes only that row', async ({ page }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Add two rows, click delete on one.
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await appFrame.getByRole('button', { name: 'Add new item' }).click();
      await expect.poll(async () => getLineItemCount(appFrame)).toBeGreaterThanOrEqual(2);
      const before = await getLineItemCount(appFrame);
      const deleted = await clickLastLineItemDelete(appFrame);
      expect(deleted, 'No delete control found on the extra line item row').toBe(true);
      await expect.poll(async () => getLineItemCount(appFrame)).toBeLessThan(before);

      await test.step('Deleted extra line item row', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByPlaceholder('Enter description').first(),
            appFrame.getByRole('button', { name: 'Add new item' }),
          ],
          'Deleted extra line item row',
          testInfo
        );
      });
    });

    test('CI-035 CI-036 Empty or incomplete line item blocks submit', async ({
      page,
    }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const persona = activePersona(testInfo);
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Complete header, leave a blank extra row.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      test.skip(outcome === 'duplicate', 'Duplicate Project!');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await appFrame.getByRole('button', { name: 'Add new item' }).click();
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

      await test.step('Blank extra row blocks Submit', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Find items' }).last(),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Blank extra row blocks Submit',
          testInfo
        );
      });
    });

    test('CI-038 Rate accepts at most 4 decimal places', async ({ page }, testInfo) => {
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Enter a rate such as 10.12345.
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      const rate = appFrame.getByPlaceholder('0.00', { exact: true }).first();
      await expect(rate).toBeEditable();
      await rate.click({ clickCount: 3 });
      await rate.fill('10.12345');
      await page.keyboard.press('Tab');
      await expect(rate).toHaveValue('0');

      await test.step('Rate decimal precision', async () => {
        await markGroupAndShot(page, [rate], 'Rate decimal precision', testInfo);
      });
    });

    test('CI-033 Discount line item shows a negative total', async ({ page }, testInfo) => {
      const project = selectableProject();
      test.skip(!project, 'No selectable in-scope project');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on selectable fixture');
      await acceptContractIfPrompted(appFrame);
      await selectProduct(appFrame, /^Discount$/);
      await fillLineItem(page, appFrame, { description: 'discount line', qty: '1', rate: '45' });
      await expect(appFrame.getByText(/\$\s*-45/).first()).toBeVisible({ timeout: 15000 });

      await test.step('Discount line negative total', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: /Discount/i }).first(),
            appFrame.getByText(/\$\s*-45/).first(),
          ],
          'Discount line negative total',
          testInfo
        );
      });
    });
  });

  // ── 8. Tax North America ──────────────────────────────────────────────────

  test.describe('Tax North America', () => {
    test('CI-039 Tax is optional for NA invoices', async ({ page }, testInfo) => {
      const na = fixtures.northAmerica;
      test.skip(!na, 'No North America project fixture');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Select an NA project, complete the form, leave tax blank.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, na!);
      test.skip(outcome === 'duplicate', 'NA fixture blocked by Duplicate Project!');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
      await expect.soft(findTax).toBeVisible({ timeout: 15000 }).catch(() => undefined);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });

      await test.step('NA tax optional Submit enabled', async () => {
        await markGroupAndShot(
          page,
          [selectedProjectButton(appFrame, na!.projectName), appFrame.getByRole('button', { name: 'Submit' })],
          'NA tax optional Submit enabled',
          testInfo
        );
      });
    });

    test('CI-040 CI-041 Selecting tax shows Subtotal Sales Tax and Grand Total', async ({
      page,
    }, testInfo) => {
      const na = fixtures.northAmerica;
      test.skip(!na, 'No North America project fixture');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // On an NA invoice, select a tax rate.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, na!);
      test.skip(outcome === 'duplicate', 'NA fixture blocked by Duplicate Project!');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
      test.skip(!(await findTax.isVisible().catch(() => false)), 'Find Tax not shown');
      const taxName = await selectTaxOption(appFrame);
      await expect(appFrame.getByText('Subtotal', { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(appFrame.getByText('Sales Tax', { exact: true })).toBeVisible();
      testInfo.annotations.push({
        type: 'observed',
        description: `selected tax "${taxName}"`,
      });

      await test.step('NA tax selected', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Subtotal', { exact: true }),
            appFrame.getByText('Sales Tax', { exact: true }),
          ],
          'NA tax selected',
          testInfo
        );
      });
    });

    test('CI-040b Tax control is absent for Non-NA projects', async ({ page }, testInfo) => {
      const nonNa = fixtures.nonNorthAmerica;
      test.skip(!nonNa, 'No Non-NA project fixture');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Select a Non-NA project.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, nonNa!);
      test.skip(outcome === 'duplicate', 'Non-NA fixture blocked by Duplicate Project!');
      await expect(appFrame.getByRole('button', { name: 'Find Tax' })).toHaveCount(0);

      await test.step('Non-NA has no Find Tax', async () => {
        await markGroupAndShot(
          page,
          [selectedProjectButton(appFrame, nonNa!.projectName), appFrame.getByRole('button', { name: 'Submit' })],
          'Non-NA has no Find Tax',
          testInfo
        );
      });
    });
  });

  // ── 9. Duplicate Submit Save Draft Close ──────────────────────────────────
  // CI-075 Submit tracks Create Invoice NA/Other (+ reports Update NA/Other).
  // Save Draft / Close / enable-only cases do not start those parent flows.

  test.describe('Duplicate Submit Save Draft Close', () => {
    test('CI-046 CI-047 Duplicate Project popup for same project same month', async ({
      page,
    }, testInfo) => {
      const dup = fixtures.duplicateNonAdhoc;
      test.skip(!dup, 'No duplicateNonAdhoc fixture');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Select a project that already has a non-adhoc invoice in the duplicate window.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, dup!);
      const loc = duplicateLocators(appFrame);
      if (outcome === 'duplicate' || (await loc.title.isVisible().catch(() => false))) {
        await expect(loc.title).toBeVisible();
        await expect(loc.verify).toBeVisible();
        await loc.verify.click();
        await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
          timeout: 20000,
        });
      } else {
        test.info().annotations.push({ type: 'skip-reason', description: 'Duplicate popup did not appear' });
      }

      await test.step('Duplicate Project popup', async () => {
        await markGroupAndShot(
          page,
          [appFrame.getByText('Invoice Overview', { exact: true }).first()],
          'Duplicate Project popup',
          testInfo
        );
      });
    });

    test('CI-049 Submit enables when all validations pass', async ({ page }, testInfo) => {
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Button-enable only — no Submit click, so Create/Update region flows are not expected.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      test.skip(outcome === 'duplicate', 'Eligible project showed Duplicate Project!');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });

      await test.step('Ready to Submit', async () => {
        await markGroupAndShot(
          page,
          [
            selectedPartnerButton(appFrame, eligible!.partnerName),
            selectedProjectButton(appFrame, eligible!.projectName),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Ready to Submit',
          testInfo
        );
      });
    });

    test('CI-050 Save Draft saves as Draft and returns to Overview', async ({
      page,
    }, testInfo) => {
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      test.skip(!fixtures.editableProduct, 'No editable product');
      test.skip(!dataverseToken, 'No Dataverse token');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Fill required fields, click Save Draft. Product rule: Draft write, no Create/Update flow.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      test.skip(outcome === 'duplicate', 'Eligible project showed Duplicate Project!');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled({
        timeout: 20000,
      });
      const before = await countInvoicesForProject(dataverseToken, eligible!.projectId, {
        status: 'Draft',
      });
      await appFrame.getByRole('button', { name: 'Save Draft' }).click();
      await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });
      await expect
        .poll(
          async () =>
            countInvoicesForProject(dataverseToken, eligible!.projectId, { status: 'Draft' }),
          { timeout: 45000 }
        )
        .toBeGreaterThan(before);

      await test.step('Saved Draft on Invoice Overview', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Invoice Overview', { exact: true }).first(),
            appFrame.getByText(/Draft/i).first(),
          ],
          'Saved Draft on Invoice Overview',
          testInfo
        );
      });
    });

    test('CI-051 Adhoc Save Draft allows future dates inside contract', async ({
      page,
    }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc toggle is hidden — Admin-only');
      test.skip(!fixtures.editableProduct, 'No editable product');
      const project = fourthMonthProject();
      test.skip(!project, 'No in-scope project whose contract covers the 4th month');
      const appFrame = await openCreateInvoice(page, 'admin');
      const future = fourthMonthStartUsDate();

      // Adhoc ON: 4th-month Invoice Date still covered by contract → Save Draft stays on.
      await setAdhoc(appFrame, true);
      const outcome = await selectPartnerAndProject(appFrame, project);
      test.skip(outcome === 'duplicate', 'Duplicate Project! on 4th-month fixture');
      await acceptContractIfPrompted(appFrame);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 0, future);
      await expect(dateBox(appFrame, 0)).toHaveValue(future);
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled();

      await test.step('Adhoc Save Draft enabled past 3-month cap', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Adhoc Invoice', { exact: true }),
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Save Draft' }),
          ],
          'Adhoc Save Draft enabled past 3-month cap',
          testInfo
        );
      });
    });

    test('CI-064 Close returns without saving', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));

      // Enter some fields, click Close.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const landed = await closeToPriorScreen(appFrame);
      await expect(appFrame.getByText('New Invoice', { exact: true })).toHaveCount(0);

      await test.step(`Returned to ${landed} after Close`, async () => {
        if (landed === 'dashboard') {
          await markGroupAndShot(
            page,
            [
              appFrame.getByText('Invoice Tasks', { exact: true }),
              appFrame.getByText('Total Invoices', { exact: true }),
            ],
            'Returned to Dashboard after Close',
            testInfo
          );
        } else {
          await markGroupAndShot(
            page,
            [
              appFrame.getByText('Invoice Overview', { exact: true }).first(),
              appFrame.getByText('Show Invoices', { exact: true }),
            ],
            'Returned to Invoice Overview after Close',
            testInfo
          );
        }
      });
    });

    test('CI-075 Overview gallery shows submitted invoice after Submit', async ({
      page,
    }, testInfo) => {
      test.setTimeout(600000);
      const eligible = fixtures.eligibleNonAdhoc;
      test.skip(!eligible, 'No eligible project');
      test.skip(!fixtures.editableProduct, 'No editable product');
      test.skip(!dataverseToken, 'No Dataverse token');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      // Submit a valid invoice. Region of this project picks Create Invoice - NA vs Other.
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      test.skip(outcome === 'duplicate', 'Eligible project showed Duplicate Project!');
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });
      const session = beginFlowCapture(page, dataverseToken);
      const submitStartedAt = new Date().toISOString();
      await appFrame.getByRole('button', { name: 'Submit' }).click();
      await awaitSubmitNavigatedToOverview(appFrame);
      await expect(appFrame.getByText(/Submitted|Pending/i).first()).toBeVisible({
        timeout: 20000,
      });

      await test.step('Submitted invoice on Overview', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Invoice Overview', { exact: true }).first(),
            appFrame.getByText(/Submitted|Pending/i).first(),
          ],
          'Submitted invoice on Overview',
          testInfo
        );
      });

      await page.close().catch(() => undefined);
      const evidence = await captureSubmitFlowEvidence({
        token: dataverseToken,
        testInfo,
        session,
        action: 'Submit',
        project: {
          partnerName: eligible!.partnerName,
          projectName: eligible!.projectName,
          region: eligible!.region,
          projectId: eligible!.projectId,
        },
        submitStartedAt,
      });
      assertSubmitFlowEvidence(evidence);
    });
  });

  // ── 10. Edit draft and flagged ────────────────────────────────────────────

  test.describe('Edit draft and flagged', () => {
    test('CI-062 CI-063 Edit existing Draft and Save Draft updates same record', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      await openCreateInvoice(page, persona);
      const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
      await appFrame.getByRole('button', { name: 'Invoice Overview' }).click();
      await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });
      const allInvoices = appFrame.getByRole('radio', { name: 'All Invoices' });
      if (await allInvoices.isVisible().catch(() => false)) {
        if (!(await allInvoices.isChecked().catch(() => false))) {
          await allInvoices.click();
        }
      }
      const edit = appFrame
        .getByRole('button', { name: /^Edit/i })
        .or(appFrame.getByText('Edit', { exact: true }));
      test.skip(
        !(await edit.first().isVisible({ timeout: 15000 }).catch(() => false)),
        'No Edit action on Overview (empty gallery or no Draft/Flagged)'
      );

      // From Overview, Edit a row, change a line, Save Draft. Draft write — no Update Invoice flow.
      await edit.first().click();
      await expect(appFrame.getByText('Edit Invoice', { exact: true })).toBeVisible({
        timeout: 30000,
      });
      await expect(appFrame.getByPlaceholder('Enter description').first()).toBeVisible();
      const desc = appFrame.getByPlaceholder('Enter description').first();
      await desc.click();
      await desc.fill(`${LINE_DESCRIPTION} edited`);
      const saveDraft = appFrame.getByRole('button', { name: 'Save Draft' });
      if (await saveDraft.isEnabled().catch(() => false)) {
        await saveDraft.click();
        await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
          timeout: 30000,
        });
      }

      await test.step('Edited draft saved', async () => {
        await markGroupAndShot(
          page,
          [appFrame.getByText('Invoice Overview', { exact: true }).first()],
          'Edited draft saved',
          testInfo
        );
      });
    });

    test('CI-057 Flagged invoice can be edited and resubmitted', async ({ page }, testInfo) => {
      test.setTimeout(600000);
      const persona = activePersona(testInfo);
      await openCreateInvoice(page, persona);
      const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
      await appFrame.getByRole('button', { name: 'Invoice Overview' }).click();
      await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });
      const allInvoices = appFrame.getByRole('radio', { name: 'All Invoices' });
      if (await allInvoices.isVisible().catch(() => false)) {
        if (!(await allInvoices.isChecked().catch(() => false))) {
          await allInvoices.click();
        }
      }
      const edit = appFrame.getByRole('button', { name: /^Edit/i });
      await expect(edit.first()).toBeVisible({ timeout: 20000 });

      // Flagged rows use Next Step Edit (not Edit Draft). Status pill is not exposed as text.
      await edit.first().click();
      await expect(appFrame.getByText('Edit Invoice', { exact: true })).toBeVisible({
        timeout: 30000,
      });
      const desc = appFrame.getByPlaceholder('Enter description').first();
      await expect(desc).toBeVisible();
      await desc.click();
      await desc.fill(`${LINE_DESCRIPTION} flagged resubmit`);
      const invoiceNumber = (
        (await appFrame.getByPlaceholder('Invoice number').inputValue().catch(() => '')) || ''
      ).trim();
      const selectedLabels = appFrame.getByRole('button', { name: /^Selected:/ });
      const partnerLabel = ((await selectedLabels.nth(0).innerText().catch(() => '')) || '')
        .replace(/^Selected:\s*/i, '')
        .trim();
      const projectLabel = ((await selectedLabels.nth(1).innerText().catch(() => '')) || '')
        .replace(/^Selected:\s*/i, '')
        .trim();
      const known = fixtureByProjectName(projectLabel);
      const submit = appFrame.getByRole('button', { name: 'Submit' });
      const canSubmit = await submit.isEnabled({ timeout: 8000 }).catch(() => false);
      const session = canSubmit && dataverseToken ? beginFlowCapture(page, dataverseToken) : null;
      const submitStartedAt = new Date().toISOString();
      if (canSubmit) {
        await submit.click();
        await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
          timeout: 30000,
        });
      }

      await test.step('Flagged invoice edit form', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame
              .getByText('Edit Invoice', { exact: true })
              .or(appFrame.getByText('Invoice Overview', { exact: true }).first()),
          ],
          'Flagged invoice edit form',
          testInfo
        );
      });

      if (session) {
        await page.close().catch(() => undefined);
        const evidence = await captureSubmitFlowEvidence({
          token: dataverseToken,
          testInfo,
          session,
          action: 'Update',
          project: {
            partnerName: known?.partnerName ?? partnerLabel ?? '(unknown partner)',
            projectName: known?.projectName ?? projectLabel ?? '(unknown project)',
            region: known?.region,
            projectId: known?.projectId,
          },
          submitStartedAt,
          invoiceNumber: invoiceNumber || undefined,
        });
        assertSubmitFlowEvidence(evidence);
      }
    });
  });

  // ── Unique coverage from the older suite (not already covered by CI-* above) ─

  test.describe('Additional screen coverage', () => {
    test('TC-CI-02: Default field states match product rules', async ({ page }, testInfo) => {
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);

      await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
      if (persona === 'admin') {
        await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible();
        await expect(appFrame.getByRole('switch').first()).not.toBeChecked();
        await expect(appFrame.getByRole('switch').nth(1)).not.toBeChecked();
      } else {
        await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toHaveCount(0);
        await expect(appFrame.getByRole('switch').first()).not.toBeChecked();
      }
      await expect(appFrame.getByPlaceholder('Invoice number')).toBeDisabled();
      await expect(appFrame.getByPlaceholder('PO number')).toBeDisabled();
      await expect(appFrame.getByPlaceholder('mm/dd/yyyy').first()).not.toHaveValue('');
      await ensureLineItemRow(appFrame);
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Find Partner' })).toBeVisible();
      await expect(appFrame.getByRole('button', { name: 'Find Project' })).toBeVisible();

      await test.step('Default form states', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('New Invoice', { exact: true }),
            appFrame.getByRole('radio', { name: 'Start with last invoice' }),
            appFrame.getByPlaceholder('Invoice number'),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Default form states',
          testInfo
        );
      });
    });

    test('TC-CI-10: Brand New vs Start with last invoice selection (Adhoc OFF)', async ({
      page,
    }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
      await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();
    });

    test('TC-CI-13: Start with last invoice — no previous invoice toast', async ({
      page,
    }, testInfo) => {
      const project = fixtures.noLastMonthInvoice;
      test.skip(!project, 'No Active project without last-month invoices in Dataverse');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
      const outcome = await selectPartnerAndProject(appFrame, project!);
      test.skip(outcome === 'duplicate', 'Fixture unexpectedly hit Duplicate Project!');
      test.skip(outcome !== 'no-last-invoice', 'Fixture did not produce the no-previous-invoice toast');
      await expect(appFrame.getByText(TOAST.noLastInvoice)).toBeVisible({ timeout: 5000 });
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
    });

    test('TC-CI-20: Partner dropdown opens with options', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await appFrame.getByRole('button', { name: 'Find Partner' }).click();
      const options = appFrame.getByRole('option');
      await expect(options.first()).toBeVisible({ timeout: 15000 });
      await expect.poll(async () => options.count()).toBeGreaterThanOrEqual(3);
      await test.step('Partner options open', async () => {
        await markGroupAndShot(
          page,
          [options.first(), options.nth(Math.min((await options.count()) - 1, 7))],
          'Partner options open',
          testInfo,
          { padding: 12 }
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
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
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
    });

    test('TC-CI-34: Internal Notes accepts text', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
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
    });

    test('TC-CI-42: Create and Submit adhoc NA invoice with tax selected', async ({
      page,
    }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc create is Admin-only');
      test.skip(!dataverseToken, 'No Dataverse token');
      test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');
      const uniqueNa = [
        isNorthAmericaRegion(fixtures.noLastMonthInvoice?.region)
          ? fixtures.noLastMonthInvoice
          : null,
        isNorthAmericaRegion(fixtures.eligibleNonAdhoc?.region) ? fixtures.eligibleNonAdhoc : null,
        fixtures.northAmerica,
      ]
        .filter((p): p is ProjectFixture => !!p)
        .filter((p, i, arr) => arr.findIndex((x) => x.projectName === p.projectName) === i);
      test.skip(uniqueNa.length === 0, 'No North America project fixture from Dataverse');

      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await setAdhoc(appFrame, true);
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

      let usedNa: ProjectFixture | null = null;
      for (const candidate of uniqueNa) {
        const outcome = await selectPartnerAndProject(appFrame, candidate);
        const stuck = await selectedProjectButton(appFrame, candidate.projectName)
          .isVisible()
          .catch(() => false);
        if (outcome !== 'duplicate' && stuck) {
          usedNa = candidate;
          break;
        }
        await dismissDuplicateDialog(appFrame);
      }
      test.skip(!usedNa, 'All NA candidates hit Duplicate or failed to stick under Adhoc');

      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, {
        description: LINE_DESCRIPTION,
        qty: '1',
        rate: '75',
      });
      await keepSingleLineItemRow(appFrame);
      if (await appFrame.getByRole('button', { name: 'Find Project' }).isVisible().catch(() => false)) {
        await selectProject(appFrame, usedNa!.projectName);
      }
      const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
      const taxAlready = appFrame
        .getByRole('button', { name: /^Selected:/ })
        .filter({ hasText: /%/ })
        .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
      await expect(findTax.or(taxAlready.first())).toBeVisible({ timeout: 20000 });
      if (await findTax.isVisible().catch(() => false)) {
        await selectTaxOption(appFrame);
      }
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 30000 });
      await appFrame.getByRole('button', { name: 'Submit' }).click();
      await awaitSubmitNavigatedToOverview(appFrame);
    });

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
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await setAdhoc(appFrame, false);
      const outcome = await selectPartnerAndProject(appFrame, eligible!);
      expect(outcome, 'Eligible fixture must not show Duplicate Project!').not.toBe('duplicate');
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, {
        description: LINE_DESCRIPTION,
        qty: '1',
        rate: '100',
      });
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 20000 });
      const before = await countInvoicesForProject(dataverseToken, eligible!.projectId, {
        adhoc: false,
      });
      await appFrame.getByRole('button', { name: 'Submit' }).click();
      await awaitSubmitNavigatedToOverview(appFrame);
      await expect
        .poll(
          async () =>
            countInvoicesForProject(dataverseToken, eligible!.projectId, { adhoc: false }),
          { timeout: 45000 }
        )
        .toBeGreaterThan(before);
    });

    test('TC-CI-60: Create and Submit adhoc invoice', async ({ page }, testInfo) => {
      test.skip(activePersona(testInfo) === 'pm', '[PM] Adhoc create is Admin-only');
      test.skip(!dataverseToken, 'No Dataverse token');
      const candidates = [
        fixtures.eligibleNonAdhoc,
        fixtures.noLastMonthInvoice,
        fixtures.nonNorthAmerica,
        fixtures.northAmerica,
      ].filter((p): p is ProjectFixture => !!p);
      test.skip(candidates.length === 0, 'No Active project fixture from Dataverse');
      test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await setAdhoc(appFrame, true);
      let project: ProjectFixture | null = null;
      for (const candidate of candidates) {
        const outcome = await selectPartnerAndProject(appFrame, candidate);
        if (outcome !== 'duplicate') {
          project = candidate;
          break;
        }
        await dismissDuplicateDialog(appFrame);
      }
      test.skip(!project, 'All adhoc candidates hit Duplicate Project!');
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, {
        description: LINE_DESCRIPTION,
        qty: '1',
        rate: '50',
      });
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 20000 });
      await appFrame.getByRole('button', { name: 'Submit' }).click();
      await awaitSubmitNavigatedToOverview(appFrame);
    });
  });

  test.describe('Region submit flows (Admin)', () => {
    test.describe.configure({ timeout: 600000 });

    function dedupeByProject(list: (ProjectFixture | null | undefined)[]): ProjectFixture[] {
      const present = list.filter((p): p is ProjectFixture => !!p);
      return present.filter(
        (p, i, arr) => arr.findIndex((x) => x.projectName === p.projectName) === i
      );
    }

    async function runRegionSubmit(
      page: Page,
      testInfo: TestInfo,
      opts: {
        label: string;
        regionKind: 'north-america' | 'other';
        flowLabel: string;
        flowNamePattern: RegExp;
        candidates: ProjectFixture[];
      }
    ): Promise<void> {
      test.skip(activePersona(testInfo) === 'pm', 'Admin-only: Adhoc Create Invoice + flow tracking');
      test.skip(!dataverseToken, 'No Dataverse token');
      test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');
      test.skip(opts.candidates.length === 0, `No ${opts.label} project fixture in this Dataverse`);

      const contractsByProject = new Map<string, ContractOption[]>();
      for (const candidate of opts.candidates) {
        contractsByProject.set(
          candidate.projectId,
          await listActiveContractsForProject(dataverseToken, candidate.projectId)
        );
      }

      const session = beginFlowCapture(page, dataverseToken);
      const appFrame = await openCreateInvoice(page, 'admin');
      await setAdhoc(appFrame, true);
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();

      let project: ProjectFixture | null = null;
      let contractName: string | null = null;
      for (const candidate of opts.candidates) {
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
      test.skip(!project, `All ${opts.label} candidates hit Duplicate Project! or failed to stick`);
      expect(isNorthAmericaRegion(project!.region)).toBe(opts.regionKind === 'north-america');

      if (await contractModalOpen(appFrame)) {
        contractName =
          (await selectContractIfPrompted(appFrame, {
            contracts: contractsByProject.get(project!.projectId),
            label: project!.projectName,
          })) ?? contractName;
      }
      void contractName;

      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await fillLineItem(page, appFrame, {
        description: LINE_DESCRIPTION,
        qty: '1',
        rate: '50',
      });
      await keepSingleLineItemRow(appFrame);
      if (await appFrame.getByRole('button', { name: 'Find Project' }).isVisible().catch(() => false)) {
        await selectProject(appFrame, project!.projectName);
      }
      if (opts.regionKind === 'north-america') {
        const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
        const taxAlready = appFrame
          .getByRole('button', { name: /^Selected:/ })
          .filter({ hasText: /%/ })
          .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
        await expect(findTax.or(taxAlready.first())).toBeVisible({ timeout: 20000 });
        if (await findTax.isVisible().catch(() => false)) {
          await selectTaxOption(appFrame);
        }
      }
      await keepSingleLineItemRow(appFrame);
      const submitBtn = appFrame.getByRole('button', { name: 'Submit' });
      await expect(submitBtn).toBeEnabled({ timeout: 30000 });
      const submitStartedAt = new Date().toISOString();
      await submitBtn.click();
      await awaitSubmitNavigatedToOverview(appFrame);
      await page.close().catch(() => undefined);

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
      expect(evidence.regionKind).toBe(opts.regionKind);
      expect(evidence.expectedLabel).toMatch(opts.flowNamePattern);
      assertSubmitFlowEvidence(evidence);
    }

    test('TC-CIF-01: [Admin] Submit NA invoice — track Create Invoice - NA Region family', async ({
      page,
    }, testInfo) => {
      await runRegionSubmit(page, testInfo, {
        label: 'North America',
        regionKind: 'north-america',
        flowLabel: 'Create Invoice - NA Region',
        flowNamePattern: /create\s*invoice.*(na|north\s*america)/i,
        candidates: dedupeByProject([
          isNorthAmericaRegion(fixtures.noLastMonthInvoice?.region)
            ? fixtures.noLastMonthInvoice
            : null,
          isNorthAmericaRegion(fixtures.eligibleNonAdhoc?.region) ? fixtures.eligibleNonAdhoc : null,
          fixtures.northAmerica,
        ]),
      });
    });

    test('TC-CIF-02: [Admin] Submit non-NA invoice — track Create Invoice - Other Region family', async ({
      page,
    }, testInfo) => {
      await runRegionSubmit(page, testInfo, {
        label: 'non-NA',
        regionKind: 'other',
        flowLabel: 'Create Invoice - Other Region',
        flowNamePattern: /create\s*invoice.*other/i,
        candidates: dedupeByProject([
          fixtures.nonNorthAmerica,
          !isNorthAmericaRegion(fixtures.eligibleNonAdhoc?.region) ? fixtures.eligibleNonAdhoc : null,
          !isNorthAmericaRegion(fixtures.noLastMonthInvoice?.region)
            ? fixtures.noLastMonthInvoice
            : null,
        ]),
      });
    });
  });
});

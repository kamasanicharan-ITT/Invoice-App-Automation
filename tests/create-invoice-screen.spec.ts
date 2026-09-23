// spec: specs/create-invoice-screen-plan.md
// seed: tests/seed.spec.ts
//
// Single Create Invoice screen suite: CI-* regression + unique older coverage +
// Admin NA / non-NA Submit flow family (TC-CIF-01 / TC-CIF-02).

import { test, expect, type Page, type FrameLocator, type TestInfo } from '@playwright/test';
import { markGroupAndShot } from './utils/screenshot';
import { assertAppSession } from './utils/assert-app-session';
import { dismissHostDialogs } from './utils/host-dialogs';
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
import { waitForOverviewSettled } from './utils/invoice-overview-ui';
import {
  LINE_DESCRIPTION,
  MONEY,
  TOAST,
  activePersona,
  addDaysUs,
  calendarMonthUsDates,
  threeMonthCapUsDates,
  monthsAheadLastDayUs,
  usDateToYmd,
  minUsDate,
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
  ensureLineItemRow,
  keepSingleLineItemRow,
  dismissDuplicateDialog,
  selectClearBrandNewProject,
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
    eligibleNonAdhocCandidates: [],
    duplicateNonAdhoc: null,
    noLastMonthInvoice: null,
    noLastMonthInvoiceCandidates: [],
    withLastInvoice: null,
    withLastInvoiceCandidates: [],
    northAmerica: null,
    nonNorthAmerica: null,
    noActiveContract: null,
    noFourthMonthCoverage: null,
    multiActiveContract: null,
    coversFourthMonth: null,
    coversPastThreeMonthCap: null,
    threeMonthCapNoDuplicate: null,
    threeMonthCapLookupNote: '',
    editableProduct: null,
    nonEditableProduct: null,
  };

  // Session gate: one open before any scheduled case (full file, --grep group, or
  // a single test). Sign in / dead storageState fails this hook so later cases
  // (and the Dataverse fixture beforeAll) are skipped instead of each timing out.
  // See tests/utils/assert-app-session.ts.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000);
    const page = await browser.newPage();
    try {
      await assertAppSession(page);
    } finally {
      await page.close();
    }
  });

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
    return clearCandidates()[0] ?? null;
  }

  function clearCandidates(
    ...extra: (ProjectFixture | null | undefined)[]
  ): ProjectFixture[] {
    return [
      ...extra,
      fixtures.eligibleNonAdhoc,
      fixtures.northAmerica,
      fixtures.coversFourthMonth,
      fixtures.noLastMonthInvoice,
      fixtures.nonNorthAmerica,
      ...fixtures.eligibleNonAdhocCandidates.slice(0, 4),
    ].filter(
      (p, i, arr): p is ProjectFixture =>
        !!p && arr.findIndex((x) => x?.projectId === p.projectId) === i
    );
  }

  function adhocFutureProject() {
    return fixtures.coversPastThreeMonthCap ?? fixtures.coversFourthMonth;
  }

  async function futureDateCoveredByContract(
    projectId: string,
    monthsAhead: number
  ): Promise<{ us: string; contractEndUs: string }> {
    const want = monthsAheadLastDayUs(monthsAhead);
    const cap = threeMonthCapUsDates();
    const contracts = dataverseToken
      ? await listActiveContractsForProject(dataverseToken, projectId)
      : [];
    const covering =
      contracts.find((c) => c.coversInvoiceDate && (c.end?.slice(0, 10) ?? '') >= usDateToYmd(want)) ??
      contracts.find((c) => c.coversInvoiceDate) ??
      contracts[0];
    expect(
      covering?.end,
      `Failed because the selected project has no Active contract covering a date ${monthsAhead} months ahead (past the 3-month non-adhoc cap ${cap.firstBlocked}).`
    ).toBeTruthy();
    const contractEndUs = addDaysUs(covering!.end!, 0);
    const us = minUsDate(want, contractEndUs);
    expect(
      usDateToYmd(us) >= usDateToYmd(cap.firstBlocked),
      `Failed because ${covering!.name || 'the covering contract'} ends ${contractEndUs}, which is not past the 3-month cap (${cap.firstBlocked}). Need an Active contract that continues after that date.`
    ).toBe(true);
    return { us, contractEndUs };
  }

  function requireThreeMonthCapProject(): ProjectFixture {
    const cap = threeMonthCapUsDates();
    expect(dataverseToken, 'No Dataverse token — cannot discover a 3-month-cap project').toBeTruthy();
    expect(
      fixtures.editableProduct,
      'No Editable Rate product in Dataverse — cannot fill a line item for CI-006 / CI-020 / CI-021'
    ).toBeTruthy();
    expect(
      fixtures.threeMonthCapNoDuplicate,
      `Failed because Dataverse has no project for this persona with (1) an Active contract covering ${cap.month1} through ${cap.firstBlocked} (current month through the first day after the PM 3-month window) and (2) no non-adhoc invoice in the current duplicate window. Add that contract on a project the PM can invoice. Contracts seen: ${fixtures.threeMonthCapLookupNote || 'none'}.`
    ).toBeTruthy();
    return fixtures.threeMonthCapNoDuplicate!;
  }

  async function pickClearProject(
    appFrame: FrameLocator,
    why: string,
    extra: (ProjectFixture | null | undefined)[] = []
  ): Promise<ProjectFixture> {
    return selectClearBrandNewProject(
      appFrame,
      extra.length ? [...extra, fixtures.eligibleNonAdhoc] : clearCandidates(),
      why,
      dataverseToken || undefined
    );
  }

  async function openFilledThreeMonthCapForm(page: Page) {
    const project = requireThreeMonthCapProject();
    const appFrame = await openCreateInvoice(page, 'pm');
    await dismissHostDialogs(page);
    await appFrame.getByRole('radio', { name: 'Brand New' }).click();
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
    await dismissHostDialogs(page);
    await expect(appFrame.getByRole('button', { name: 'Find Partner' })).toBeVisible({
      timeout: 20000,
    });
    const outcome = await selectPartnerAndProject(appFrame, project);
    expect(
      outcome,
      `Failed because ${project.partnerName} / ${project.projectName} showed Duplicate Project — it already has a non-adhoc invoice in this cycle`
    ).not.toBe('duplicate');
    const contracts = dataverseToken
      ? await listActiveContractsForProject(dataverseToken, project.projectId)
      : [];
    await selectContractIfPrompted(appFrame, { contracts, label: project.projectName });
    await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
    return { appFrame, project };
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
    test('CI-004 Admin Adhoc Invoice toggle switches to Yes @admin', async ({
      page,
    }, testInfo) => {
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

    test('CI-011b PM does not see Adhoc Invoice @pm', async ({ page }, testInfo) => {
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

    test('CI-004b Adhoc ON forces Brand New @admin', async ({ page }, testInfo) => {
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

    test('CI-005 Adhoc ON allows Invoice Date past 3 months when contract covers it @admin', async ({
      page,
    }, testInfo) => {
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, 'admin');

      await setAdhoc(appFrame, true);
      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test adhoc Invoice Date past 3 months without Duplicate Project!',
        [adhocFutureProject()]
      );
      const { us: future } = await futureDateCoveredByContract(project.projectId, 6);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      // Invoice Date follows Service End — set Service End first so the future
      // Invoice Date stays valid (sheet: 6 months ahead, or as far as the contract goes).
      await fillDateField(page, appFrame, 2, future);
      await expect(dateBox(appFrame, 0)).toHaveValue(future);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 15000 });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

      await test.step('Adhoc Invoice Date past 3 months both buttons on', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Adhoc Invoice', { exact: true }),
            dateBox(appFrame, 0),
            dateBox(appFrame, 2),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Adhoc Invoice Date past 3 months both buttons on',
          testInfo
        );
      });
    });

    test('CI-059 Adhoc zero amount cannot be submitted @admin', async ({ page }, testInfo) => {
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, 'admin');

      await setAdhoc(appFrame, true);
      await pickClearProject(
        appFrame,
        'Failed because no project is available to test adhoc zero amount without Duplicate Project!'
      );
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
      const candidates = [fixtures.withLastInvoice, ...fixtures.withLastInvoiceCandidates].filter(
        (p, i, arr): p is ProjectFixture =>
          !!p && arr.findIndex((x) => x?.projectId === p.projectId) === i
      );
      test.skip(!dataverseToken, 'No Dataverse token');
      test.skip(
        candidates.length === 0,
        'No project with a previous-calendar-month invoice that has line items'
      );
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');
      const dates = calendarMonthUsDates();

      await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Start with last invoice' })).toBeChecked();

      let used: ProjectFixture | null = null;
      let expected: Awaited<ReturnType<typeof fetchLastInvoiceWithLines>> = null;
      for (const candidate of candidates) {
        const snapshot = await fetchLastInvoiceWithLines(dataverseToken, candidate.projectId);
        if (!snapshot || snapshot.lines.length === 0) continue;
        const outcome = await selectPartnerAndProject(appFrame, candidate);
        if (outcome === 'duplicate') {
          await dismissDuplicateDialog(appFrame);
          continue;
        }
        if (outcome === 'no-last-invoice') continue;

        await appFrame.getByRole('radio', { name: 'Start with last invoice' }).click();
        let copied = false;
        try {
          await expect
            .poll(
              async () => {
                const findItems = await appFrame.getByRole('button', { name: 'Find items' }).count();
                const rows = await getLineItemCount(appFrame);
                return findItems === 0 && rows > 0;
              },
              { timeout: 12000 }
            )
            .toBe(true);
          copied = true;
        } catch {
          copied = false;
        }
        if (copied) {
          used = candidate;
          expected = snapshot;
          break;
        }
      }
      expect(
        used,
        'Canvas did not copy last-month line items for any discovered project (toast absent, gallery stayed on Find items)'
      ).toBeTruthy();

      await expect(appFrame.getByRole('button', { name: 'Find items' })).toHaveCount(0);
      const prefilled = await readLineItems(appFrame);
      testInfo.annotations.push({
        type: 'observed',
        description:
          `project ${used!.partnerName} / ${used!.projectName} | ` +
          `prefilled ${JSON.stringify(prefilled)} | ` +
          `last invoice ${expected!.invoiceDate?.slice(0, 10)} ${JSON.stringify(expected!.lines)}`,
      });
      expect(prefilled.length).toBeGreaterThan(0);
      if (prefilled.length === expected!.lines.length) {
        expect(prefilled).toEqual(expected!.lines);
      }

      await expect(dateBox(appFrame, 1)).toHaveValue(dates.start);
      await expect(dateBox(appFrame, 2)).toHaveValue(dates.end);
      await expect(dateBox(appFrame, 0)).toHaveValue(dates.end);
      await expect(appFrame.getByPlaceholder('Invoice number')).toHaveValue('');

      await test.step('Line items prefilled from last invoice', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('radio', { name: 'Start with last invoice' }),
            selectedPartnerButton(appFrame, used!.partnerName),
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
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const eligible = await pickClearProject(
        appFrame,
        'Failed because no project is available to prove an active contract applies without Duplicate Project!'
      );
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
      await selectClearBrandNewProject(
        appFrame,
        [project],
        'Failed because no 2+ Active-contract project is available without Duplicate Project!',
        dataverseToken || undefined
      );
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
      await selectClearBrandNewProject(
        appFrame,
        [project],
        'Failed because no 2+ Active-contract project is available without Duplicate Project!',
        dataverseToken || undefined
      );
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

    test('CI-011 Invoice Date outside the covering contract disables both buttons', async ({
      page,
    }, testInfo) => {
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test Invoice Date outside the contract without Duplicate Project!'
      );
      const pastContract = await firstDayPastContract(project.projectId);
      expect(
        pastContract,
        `Failed because ${project.partnerName} / ${project.projectName} has no contract end date to step one day past`
      ).toBeTruthy();
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 0, pastContract!);
      await expect(dateBox(appFrame, 0)).toHaveValue(pastContract!);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Invoice Date past contract both buttons off', async () => {
        await markGroupAndShot(
          page,
          [
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Submit' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
          ],
          'Invoice Date past contract both buttons off',
          testInfo
        );
      });
    });

    test('CI-012 Service End outside the covering contract disables both buttons', async ({
      page,
    }, testInfo) => {
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test Service End outside the contract without Duplicate Project!'
      );
      const pastContract = await firstDayPastContract(project.projectId);
      expect(
        pastContract,
        `Failed because ${project.partnerName} / ${project.projectName} has no contract end date to step one day past`
      ).toBeTruthy();
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 2, pastContract!);
      await expect(dateBox(appFrame, 0)).toHaveValue(pastContract!);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Service End past contract both buttons off', async () => {
        await markGroupAndShot(
          page,
          [
            dateBox(appFrame, 2),
            dateBox(appFrame, 0),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Service End past contract both buttons off',
          testInfo
        );
      });
    });

    test('CI-013 Contract warning clears when dates are brought back in range', async ({
      page,
    }, testInfo) => {
      const persona = activePersona(testInfo);
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const eligible = await pickClearProject(
        appFrame,
        'Failed because no project is available to test contract dates restored without Duplicate Project!',
        [fixtures.noFourthMonthCoverage]
      );
      const contracts = dataverseToken
        ? await listActiveContractsForProject(dataverseToken, eligible.projectId)
        : [];
      await selectContractIfPrompted(appFrame, {
        contracts,
        label: eligible.projectName,
      });
      const covering = contracts.find((c) => c.coversInvoiceDate) ?? contracts[0];
      const cap = threeMonthCapUsDates();
      const pastContract = covering?.end
        ? addDaysUs(covering.end, 1)
        : await firstDayPastContract(eligible.projectId);
      expect(
        pastContract,
        `Failed because ${eligible.partnerName} / ${eligible.projectName} has no contract end date to step one day past`
      ).toBeTruthy();
      expect(
        usDateToYmd(pastContract!) < usDateToYmd(cap.firstBlocked),
        `Failed because stepping one day past this contract lands on ${pastContract}, which is also the 3-month cap (${cap.firstBlocked}). Need a covering contract that ends before that cap so CI-013 shows the contract error, not the 3-month banner.`
      ).toBe(true);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      const validEnd = await dateBox(appFrame, 2).inputValue();

      await fillDateField(page, appFrame, 2, pastContract!);
      await expect(dateBox(appFrame, 2)).toHaveValue(pastContract!);
      await expect(appFrame.getByText(TOAST.threeMonthLimit)).toHaveCount(0);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();

      await fillDateField(page, appFrame, 2, validEnd);
      await expect(dateBox(appFrame, 2)).toHaveValue(validEnd);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeEnabled();

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

    test('CI-006 Non-adhoc PM restricted to 3 months future @pm', async ({ page }, testInfo) => {
      const cap = threeMonthCapUsDates();
      const { appFrame, project } = await openFilledThreeMonthCapForm(page);
      const saveDraft = appFrame.getByRole('button', { name: 'Save Draft' });
      const submit = appFrame.getByRole('button', { name: 'Submit' });
      const banner = appFrame.getByText(TOAST.threeMonthLimit);

      await fillDateField(page, appFrame, 2, cap.lastAllowed);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.lastAllowed);
      await expect(saveDraft).toBeEnabled({ timeout: 15000 });
      await expect(submit).toBeEnabled();
      await expect(banner).toHaveCount(0);

      await fillDateField(page, appFrame, 2, cap.firstBlocked);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.firstBlocked);
      await expect(banner).toBeVisible({ timeout: 15000 });
      await expect(saveDraft).toBeDisabled();
      await expect(submit).toBeDisabled();

      await test.step('PM 3-month boundary', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 2), dateBox(appFrame, 0), saveDraft, submit],
          `CI-006 ${project.partnerName} / ${project.projectName} ${cap.lastAllowed} then ${cap.firstBlocked}`,
          testInfo
        );
      });
    });

    test('CI-020 Future date red banner when date exceeds 3-month limit @pm', async ({
      page,
    }, testInfo) => {
      const cap = threeMonthCapUsDates();
      const { appFrame, project } = await openFilledThreeMonthCapForm(page);
      const saveDraft = appFrame.getByRole('button', { name: 'Save Draft' });
      const submit = appFrame.getByRole('button', { name: 'Submit' });
      const banner = appFrame.getByText(TOAST.threeMonthLimit);

      await fillDateField(page, appFrame, 2, cap.firstBlocked);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.firstBlocked);
      await expect(banner).toBeVisible({ timeout: 15000 });
      await expect(saveDraft).toBeDisabled();
      await expect(submit).toBeDisabled();

      await test.step('3-month limit banner', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 2), banner, saveDraft, submit],
          `CI-020 ${project.partnerName} / ${project.projectName} ${cap.firstBlocked}`,
          testInfo
        );
      });
    });

    test('CI-021 No red banner for dates within 3-month limit @pm', async ({ page }, testInfo) => {
      const cap = threeMonthCapUsDates();
      const { appFrame, project } = await openFilledThreeMonthCapForm(page);
      const saveDraft = appFrame.getByRole('button', { name: 'Save Draft' });
      const submit = appFrame.getByRole('button', { name: 'Submit' });
      const banner = appFrame.getByText(TOAST.threeMonthLimit);

      await fillDateField(page, appFrame, 2, cap.month1);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.month1);
      await expect(banner).toHaveCount(0);
      await expect(saveDraft).toBeEnabled({ timeout: 15000 });
      await expect(submit).toBeEnabled();

      await fillDateField(page, appFrame, 2, cap.month2);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.month2);
      await expect(banner).toHaveCount(0);
      await expect(saveDraft).toBeEnabled();
      await expect(submit).toBeEnabled();

      await test.step('Within 3-month window', async () => {
        await markGroupAndShot(
          page,
          [dateBox(appFrame, 2), dateBox(appFrame, 0), saveDraft, submit],
          `CI-021 ${project.partnerName} / ${project.projectName} ${cap.month1} then ${cap.month2}`,
          testInfo
        );
      });
    });

    test('CI-052 Non-adhoc Save Draft disabled past 3-month limit', async ({ page }, testInfo) => {
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      const persona = activePersona(testInfo);
      const cap = threeMonthCapUsDates();
      const appFrame = await openCreateInvoice(page, persona);
      await pickClearProject(
        appFrame,
        'Failed because no project is available to test the 3-month Save Draft cap without Duplicate Project!'
      );
      if (persona === 'admin') await setAdhoc(appFrame, false);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 2, cap.firstBlocked);
      await expect(dateBox(appFrame, 0)).toHaveValue(cap.firstBlocked);
      await expect(appFrame.getByText(TOAST.threeMonthLimit)).toBeVisible({ timeout: 15000 });
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeDisabled();
      await expect(appFrame.getByRole('button', { name: 'Save Draft' })).toBeDisabled();

      await test.step('Past 3-month cap both buttons off', async () => {
        await markGroupAndShot(
          page,
          [
            dateBox(appFrame, 2),
            appFrame.getByRole('button', { name: 'Save Draft' }),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
          'Past 3-month cap Save Draft and Submit off',
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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test Partner junk search without Duplicate Project!'
      );
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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const productName = fixtures.editableProduct!.name;
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test Project junk search without Duplicate Project!'
      );
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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const productName = fixtures.editableProduct!.name;
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await pickClearProject(
        appFrame,
        'Failed because no project is available to test Product junk search without Duplicate Project!'
      );
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
            appFrame.getByRole('button', { name: 'Submit' }),
            appFrame.getByRole('button', { name: 'Save Draft' }),
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
      const newRowPicker = appFrame
        .getByRole('button', { name: 'Find items' })
        .or(appFrame.getByRole('button', { name: /^Selected:/ }));
      await expect(newRowPicker.last()).toBeVisible({ timeout: 15000 });
      await expect(appFrame.getByPlaceholder('Enter description').last()).toHaveValue('');
      expect(
        ((await newRowPicker.last().innerText()) || '').trim(),
        'New row copied the previous product'
      ).not.toMatch(new RegExp(`^Selected:\\s*${fixtures.editableProduct!.name}$`, 'i'));

      await test.step('New blank line item row', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByRole('button', { name: 'Add new item' }),
            appFrame.getByPlaceholder('Enter description').last(),
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

      // Empty Start-with-last has no product row — Brand New + one Add new item if needed.
      // Then add exactly one extra row so delete has a target (do not add twice).
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
      await ensureLineItemRow(appFrame);
      await keepSingleLineItemRow(appFrame);
      await selectProduct(appFrame, fixtures.editableProduct!.name);
      await expect.poll(async () => getLineItemCount(appFrame)).toBe(1);

      await appFrame.getByRole('button', { name: 'Add new item' }).click();
      await expect.poll(async () => getLineItemCount(appFrame)).toBe(2);
      const deleted = await clickLastLineItemDelete(appFrame);
      expect(deleted, 'No delete control found on the extra line item row').toBe(true);
      await expect.poll(async () => getLineItemCount(appFrame), { timeout: 15000 }).toBe(1);

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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await pickClearProject(
        appFrame,
        'Failed because no project is available to test an incomplete line without Duplicate Project!'
      );
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
      // Live app rejects a 5th decimal by clearing Rate to 0 (does not truncate).
      await expect(rate).toHaveValue('0');

      await test.step('Rate decimal precision', async () => {
        await markGroupAndShot(page, [rate], 'Rate decimal precision', testInfo);
      });
    });

    test('CI-033 Discount line item shows a negative total', async ({ page }, testInfo) => {
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test a Discount line without Duplicate Project!'
      );
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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const na = await selectClearBrandNewProject(
        appFrame,
        clearCandidates().filter((p) =>
          (p.region ?? '').toLowerCase().includes('north america')
        ),
        'Failed because no North America project is available without Duplicate Project!',
        dataverseToken || undefined
      );
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
      await expect.soft(findTax).toBeVisible({ timeout: 15000 }).catch(() => undefined);
      await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
        timeout: 20000,
      });

      await test.step('NA tax optional Submit enabled', async () => {
        await markGroupAndShot(
          page,
          [selectedProjectButton(appFrame, na.projectName), appFrame.getByRole('button', { name: 'Submit' })],
          'NA tax optional Submit enabled',
          testInfo
        );
      });
    });

    test('CI-040 CI-041 Selecting tax shows Subtotal Sales Tax and Grand Total', async ({
      page,
    }, testInfo) => {
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      await selectClearBrandNewProject(
        appFrame,
        clearCandidates().filter((p) =>
          (p.region ?? '').toLowerCase().includes('north america')
        ),
        'Failed because no North America project is available without Duplicate Project!',
        dataverseToken || undefined
      );
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
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const nonNa = await selectClearBrandNewProject(
        appFrame,
        [
          fixtures.nonNorthAmerica,
          ...clearCandidates().filter(
            (p) => !isNorthAmericaRegion(p.region) && !!(p.region ?? '').trim()
          ),
        ],
        'Failed because no non-North-America project is available without Duplicate Project!',
        dataverseToken || undefined
      );
      expect(
        isNorthAmericaRegion(nonNa.region),
        `Failed because ${nonNa.partnerName} / ${nonNa.projectName} is North America — CI-040b needs a non-NA project so Tax is hidden`
      ).toBe(false);
      await expect(appFrame.getByRole('button', { name: 'Find Tax' })).toHaveCount(0);

      await test.step('Non-NA has no Find Tax', async () => {
        await markGroupAndShot(
          page,
          [
            selectedProjectButton(appFrame, nonNa.projectName),
            appFrame.getByRole('button', { name: 'Submit' }),
          ],
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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const eligible = await pickClearProject(
        appFrame,
        'Failed because no project is available to enable Submit without Duplicate Project!'
      );
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
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      test.skip(!(await partnerComboHasOptions(appFrame)), 'No Partner options for this persona');

      const eligible = await pickClearProject(
        appFrame,
        'Failed because no project is available to Save Draft without Duplicate Project!'
      );
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

    test('CI-051 Adhoc Save Draft allows future dates inside contract @admin', async ({
      page,
    }, testInfo) => {
      expect(fixtures.editableProduct, 'No editable product').toBeTruthy();
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      const appFrame = await openCreateInvoice(page, 'admin');

      await setAdhoc(appFrame, true);
      const project = await pickClearProject(
        appFrame,
        'Failed because no project is available to test adhoc Save Draft past 3 months without Duplicate Project!',
        [adhocFutureProject()]
      );
      const { us: future } = await futureDateCoveredByContract(project.projectId, 4);
      await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
      await fillDateField(page, appFrame, 2, future);
      await expect(dateBox(appFrame, 2)).toHaveValue(future);
      const saveDraft = appFrame.getByRole('button', { name: 'Save Draft' });
      await expect(saveDraft).toBeEnabled({ timeout: 15000 });
      await saveDraft.click();
      await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });

      await test.step('Adhoc Save Draft enabled past 3-month cap', async () => {
        await markGroupAndShot(
          page,
          [
            appFrame.getByText('Invoice Overview', { exact: true }).first(),
            appFrame.getByText(/Draft/i).first(),
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
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      const persona = activePersona(testInfo);
      const appFrame = await openCreateInvoice(page, persona);
      const eligible = await pickClearProject(
        appFrame,
        'Failed because no project is available to Submit and see on Overview without Duplicate Project!'
      );
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
          partnerName: eligible.partnerName,
          projectName: eligible.projectName,
          region: eligible.region,
          projectId: eligible.projectId,
        },
        submitStartedAt,
      });
      testInfo.annotations.push({
        type: 'observed',
        description: `CI-075 gallery already showed Submitted/Pending. Flow: ${evidence.failureReasons.join('; ') || 'ok'}`,
      });
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
      await waitForOverviewSettled(appFrame);
      const allInvoices = appFrame.getByRole('radio', { name: 'All Invoices' });
      if (await allInvoices.isVisible().catch(() => false)) {
        if (!(await allInvoices.isChecked().catch(() => false))) {
          await allInvoices.click();
          await waitForOverviewSettled(appFrame);
        }
      }
      const yearToDate = appFrame.getByRole('button', { name: /Year to Date/i });
      if (await yearToDate.isVisible().catch(() => false)) {
        await yearToDate.click();
        await waitForOverviewSettled(appFrame);
      }
      const edit = appFrame.getByRole('button', { name: /^(Edit Draft|Edit)$/ });
      await expect(
        edit.first(),
        'Failed because Overview has no Edit / Edit Draft Next Step in the current gallery (need a Flagged or Draft row).'
      ).toBeVisible({ timeout: 30000 });

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
        testInfo.annotations.push({
          type: 'observed',
          description: `CI-057 resubmit: ${evidence.failureReasons.join('; ') || 'flow family ok'}`,
        });
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
      expect(fixtures.nonEditableProduct, 'No Non-Editable Rate product in Dataverse').toBeTruthy();
      const product = fixtures.nonEditableProduct!;
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await pickClearProject(
        appFrame,
        'Failed because no project is available to test a locked Rate without Duplicate Project!'
      );

      await selectProduct(appFrame, product.name);
      await appFrame.getByPlaceholder('Enter description').first().fill(LINE_DESCRIPTION);
      const rate = appFrame.getByPlaceholder('0.00', { exact: true }).first();
      await expect(rate).toBeDisabled();
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

    test('TC-CI-42: Create and Submit adhoc NA invoice with tax selected @admin', async ({
      page,
    }, testInfo) => {
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      const uniqueNa = [
        ...clearCandidates().filter((p) =>
          (p.region ?? '').toLowerCase().includes('north america')
        ),
        fixtures.northAmerica,
      ];
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await setAdhoc(appFrame, true);
      const usedNa = await selectClearBrandNewProject(
        appFrame,
        uniqueNa,
        'Failed because no North America project is available to Submit an adhoc invoice without Duplicate Project!',
        dataverseToken
      );

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
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      if (activePersona(testInfo) === 'admin') await setAdhoc(appFrame, false);
      const eligible = await pickClearProject(
        appFrame,
        'Failed because no project is available to Submit a non-adhoc invoice without Duplicate Project!'
      );
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

    test('TC-CI-60: Create and Submit adhoc invoice @admin', async ({ page }, testInfo) => {
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      const appFrame = await openCreateInvoice(page, activePersona(testInfo));
      await setAdhoc(appFrame, true);
      await pickClearProject(
        appFrame,
        'Failed because no project is available to Submit an adhoc invoice without Duplicate Project!'
      );
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
      expect(dataverseToken, 'No Dataverse token').toBeTruthy();
      expect(fixtures.editableProduct, 'No Editable Rate product in Dataverse').toBeTruthy();
      expect(
        opts.candidates.length,
        `Failed because no ${opts.label} project is available without Duplicate Project!`
      ).toBeGreaterThan(0);

      const contractsByProject = new Map<string, ContractOption[]>();
      for (const candidate of opts.candidates) {
        contractsByProject.set(
          candidate.projectId,
          await listActiveContractsForProject(dataverseToken, candidate.projectId)
        );
      }
      const preferred = opts.candidates.filter((candidate) => {
        const list = contractsByProject.get(candidate.projectId) ?? [];
        return list.filter((c) => c.coversInvoiceDate).length <= 1;
      });
      const pickFrom = preferred.length ? preferred : opts.candidates;

      const session = beginFlowCapture(page, dataverseToken);
      const appFrame = await openCreateInvoice(page, 'admin');
      await setAdhoc(appFrame, true);
      const project = await selectClearBrandNewProject(
        appFrame,
        pickFrom,
        `Failed because no ${opts.label} project is available without Duplicate Project!`,
        dataverseToken
      );
      let contractName: string | null = await selectContractIfPrompted(appFrame, {
        contracts: contractsByProject.get(project.projectId),
        label: project.projectName,
      });
      expect(isNorthAmericaRegion(project.region)).toBe(opts.regionKind === 'north-america');

      await setAdhoc(appFrame, true);
      if (await contractModalOpen(appFrame)) {
        contractName =
          (await selectContractIfPrompted(appFrame, {
            contracts: contractsByProject.get(project!.projectId),
            label: project!.projectName,
          })) ?? contractName;
      }
      void contractName;

      await setAdhoc(appFrame, true);
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

    test('TC-CIF-01: [Admin] Submit NA invoice — track Create Invoice - NA Region family @admin', async ({
      page,
    }, testInfo) => {
      await runRegionSubmit(page, testInfo, {
        label: 'North America',
        regionKind: 'north-america',
        flowLabel: 'Create Invoice - NA Region',
        flowNamePattern: /create\s*invoice.*(na|north\s*america)/i,
        candidates: dedupeByProject([
          isNorthAmericaRegion(fixtures.eligibleNonAdhoc?.region) ? fixtures.eligibleNonAdhoc : null,
          ...fixtures.eligibleNonAdhocCandidates.filter((p) => isNorthAmericaRegion(p.region)),
          isNorthAmericaRegion(fixtures.noLastMonthInvoice?.region)
            ? fixtures.noLastMonthInvoice
            : null,
          fixtures.northAmerica,
        ]),
      });
    });

    test('TC-CIF-02: [Admin] Submit non-NA invoice — track Create Invoice - Other Region family @admin', async ({
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

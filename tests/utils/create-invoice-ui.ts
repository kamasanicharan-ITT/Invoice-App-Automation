/**
 * Shared Create Invoice UI helpers for regression + existing suites.
 * Locators verified live 2026-08-18 (Admin + PM) against New Invoice.
 */
import { expect, type Page, type FrameLocator, type Locator, type TestInfo } from '@playwright/test';
import { dismissHostDialogs, dismissHostDialogsSettling } from './host-dialogs';
import { APP_URL, projectBlockedByDuplicate, projectHasAnyInvoice, type ContractOption, type ProjectFixture } from './dataverse-fixtures';

export const LINE_DESCRIPTION = 'Automation line item — Create Invoice regression';

export const MONEY = /(?:\$|₹)\s*[1-9]\d*/;

export const TOAST = {
  noLastInvoice: /No invoice has been generated for this project over the last month/i,
  submitted: /submitted/i,
  noActiveContract: /No active contracts found for the selected project/i,
  serviceEndAfterStart: /Service End Date must be after Start Date|after Start Date/i,
  threeMonthLimit: /You are selecting an invoice date beyond the allowed 3-month limit/i,
  contractCoverage:
    /not (fall )?within.{0,40}contract|outside.{0,20}contract|contract.{0,40}(does not )?cover|must be within.{0,20}contract|contract period/i,
} as const;

export const DUPLICATE = {
  title: 'Duplicate Project!',
  body: /already in progress for this month/i,
} as const;

export const CONTRACT_WARNING = /contract/i;

export const CONTRACT_MODAL_TITLE = 'Please select the Contract.';

export type ProjectSelectOutcome = 'duplicate' | 'no-last-invoice' | 'clear';
export type Persona = 'admin' | 'pm';

export function personaFromProjectName(projectName: string): Persona {
  return projectName.toLowerCase().includes('pm') ? 'pm' : 'admin';
}

export function activePersona(testInfo: TestInfo): Persona {
  return personaFromProjectName(testInfo.project.name);
}

export function formatUsDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/** Create Invoice date defaults: calendar month 1st → last (not billing 6th→5th). */
export function calendarMonthUsDates(reference = new Date()): { start: string; end: string } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return { start: formatUsDate(start), end: formatUsDate(end) };
}

/**
 * Non-adhoc PM window is the current calendar month plus the next three
 * (September → last allowed 12/31, first blocked 1/1).
 * month1 / month2 are mid-month dates inside that window (CI-021).
 */
export function threeMonthCapUsDates(reference = new Date()): {
  lastAllowed: string;
  firstBlocked: string;
  month1: string;
  month2: string;
} {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const lastAllowed = new Date(y, m + 4, 0);
  const firstBlocked = new Date(y, m + 4, 1);
  const month1 = new Date(y, m, 15);
  const month2 = new Date(y, m + 1, 15);
  return {
    lastAllowed: formatUsDate(lastAllowed),
    firstBlocked: formatUsDate(firstBlocked),
    month1: formatUsDate(month1),
    month2: formatUsDate(month2),
  };
}

/** First day of calendar month + 4 (August → 12/1). Inside a contract that runs through year-end. */
export function fourthMonthStartUsDate(reference = new Date()): string {
  return formatUsDate(new Date(reference.getFullYear(), reference.getMonth() + 4, 1));
}

/** Last calendar day N months from `reference` (Sep + 6 → 3/31 of next year). */
export function monthsAheadLastDayUs(months: number, reference = new Date()): string {
  return formatUsDate(new Date(reference.getFullYear(), reference.getMonth() + months + 1, 0));
}

export function usDateToYmd(value: string): string {
  const { year, monthIndex, day } = parseUsDate(value);
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function minUsDate(a: string, b: string): string {
  return usDateToYmd(a) <= usDateToYmd(b) ? a : b;
}

export async function acceptContractIfPrompted(appFrame: FrameLocator): Promise<void> {
  if (!(await contractModalOpen(appFrame))) return;
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' }).filter({
    visible: true,
  });
  await expect(findContract.first()).toBeVisible({ timeout: 10000 });
  await findContract.first().click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 10000 });
  await appFrame.getByRole('option').first().click();
  const ok = appFrame.getByRole('button', { name: 'Ok', exact: true }).filter({ visible: true });
  await expect(ok.first()).toBeEnabled({ timeout: 10000 });
  await ok.first().click();
  await expect(findContract.first()).toBeHidden({ timeout: 15000 });
}

/** After a valid combo selection, reopen and type text that is not a real option. */
export async function typeJunkInOpenCombo(
  page: Page,
  appFrame: FrameLocator,
  junk = 'grhreayrtyryhrhrw'
): Promise<void> {
  const named = appFrame
    .getByRole('textbox', { name: 'Find Partner' })
    .or(appFrame.getByRole('textbox', { name: 'Find Project' }))
    .or(appFrame.getByRole('textbox', { name: 'Find items' }))
    .or(appFrame.locator('dialog').getByRole('textbox').first());
  if (await named.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await named.first().fill(junk);
    return;
  }
  await page.keyboard.press('Control+A');
  await page.keyboard.type(junk);
}

const JUNK_SEARCH = 'grhreayrtyryhrhrw';

/**
 * Valid form, then: reopen combo → type junk → remove the selected chip → click outside.
 * Junk text stays in the field; it is not a real selection.
 */
export async function replaceComboSelectionWithJunk(
  page: Page,
  appFrame: FrameLocator,
  opener: Locator,
  junk = JUNK_SEARCH
): Promise<void> {
  await opener.click();
  const remove = appFrame.getByRole('button', { name: /Remove .+ from selection/i });
  await expect(remove).toBeVisible({ timeout: 15000 });
  const search = appFrame
    .getByRole('dialog')
    .getByRole('textbox')
    .or(appFrame.getByRole('textbox', { name: /Find (Partner|Project|items)/i }));
  if (await search.first().isVisible().catch(() => false)) {
    await search.first().fill(junk);
  } else {
    await page.keyboard.type(junk);
  }
  await remove.click();
  await appFrame.getByText('New Invoice', { exact: true }).click({ force: true });
}

/** nth: 0 Invoice Date, 1 Service Start, 2 Service End (live order). */
export function dateBox(appFrame: FrameLocator, index: 0 | 1 | 2) {
  return appFrame.getByPlaceholder('mm/dd/yyyy').nth(index);
}

function parseUsDate(value: string): { year: number; monthIndex: number; day: number } {
  const [month, day, year] = value.split('/').map(Number);
  return { year, monthIndex: month - 1, day };
}

/** Add days to a Dataverse ISO date and return it in the form's m/d/yyyy format. */
export function addDaysUs(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatUsDate(d);
}

/**
 * The Canvas date control ignores mouse clicks on calendar days and the month/year
 * dropdowns only change the view, never the value. Keyboard navigation is the only
 * input that commits (verified live 2026-08-20):
 *   PageUp/PageDown ∓1 month · ArrowUp/ArrowDown ∓7 days · ArrowLeft/Right ∓1 day · Enter commits.
 * The textbox does not update until Enter, so we steer using the picker's own
 * `td.is-selected` marker and re-read it after every keypress.
 */
export async function fillDateField(
  page: Page,
  appFrame: FrameLocator,
  index: 0 | 1 | 2,
  value: string
): Promise<string> {
  const box = dateBox(appFrame, index);
  if ((await box.inputValue()) === value) return value;

  const target = parseUsDate(value);
  const calendarBtn = appFrame
    .getByRole('button', { name: /Open calendar to select a date/i })
    .nth(index);
  // Each date field owns a .pika-single that stays in the DOM; only the open one is visible.
  const picker = appFrame.locator('.pika-single:not(.is-hidden)');

  const openPicker = async () => {
    if (await picker.isVisible().catch(() => false)) return;
    await calendarBtn.click();
    await expect(picker).toBeVisible({ timeout: 8000 });
  };

  await openPicker();
  // Click can dismiss the picker on a second try; reopen once if it vanished.
  if (!(await picker.isVisible().catch(() => false))) await openPicker();
  await expect(picker.locator('select.pika-select-year')).toBeVisible({ timeout: 10000 });

  const readSelection = async () => {
    if (!(await picker.isVisible().catch(() => false))) {
      await openPicker();
    }
    return picker.evaluate((root) => {
      const node = root.querySelector('td.is-selected button.pika-day');
      if (!node) return null;
      return {
        year: Number(node.getAttribute('data-pika-year')),
        monthIndex: Number(node.getAttribute('data-pika-month')),
        day: Number(node.getAttribute('data-pika-day')),
      };
    });
  };

  for (let step = 0; step < 400; step++) {
    const current = await readSelection();
    if (!current) throw new Error(`Date picker ${index} exposed no selected day`);

    const monthDiff =
      (target.year - current.year) * 12 + (target.monthIndex - current.monthIndex);
    if (monthDiff !== 0) {
      await page.keyboard.press(monthDiff > 0 ? 'PageDown' : 'PageUp');
      continue;
    }

    const dayDiff = target.day - current.day;
    if (dayDiff === 0) break;
    if (dayDiff >= 7) await page.keyboard.press('ArrowDown');
    else if (dayDiff <= -7) await page.keyboard.press('ArrowUp');
    else await page.keyboard.press(dayDiff > 0 ? 'ArrowRight' : 'ArrowLeft');
  }

  await page.keyboard.press('Enter');
  await expect(box).toHaveValue(value, { timeout: 10000 });
  return value;
}

export async function openCreateInvoice(
  page: Page,
  persona: Persona = 'admin'
): Promise<FrameLocator> {
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
    await waitForCreateInvoiceReady(page, appFrame, persona);
  } catch {
    await dismissHostDialogs(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissHostDialogsSettling(page);
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    await dismissHostDialogs(page);
    await waitForCreateInvoiceReady(page, appFrame, persona);
  }
  return appFrame;
}

export async function waitForCreateInvoiceReady(
  page: Page,
  appFrame: FrameLocator,
  persona: Persona = 'admin'
): Promise<void> {
  await dismissHostDialogs(page);

  await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
    timeout: 45000,
  });
  if (persona === 'admin') {
    await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible({
      timeout: 30000,
    });
  }
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

/**
 * Count rows by description field only. A row's "Find items" button is replaced by
 * "Selected: <product>" once a product is picked, so it cannot be used to count rows.
 */
export async function getLineItemCount(appFrame: FrameLocator): Promise<number> {
  return appFrame.getByPlaceholder('Enter description').count();
}

export type UiLineItem = { description: string; quantity: number; rate: number };

/** Read every line-item row as it currently stands in the form. */
export async function readLineItems(appFrame: FrameLocator): Promise<UiLineItem[]> {
  const descriptions = appFrame.getByPlaceholder('Enter description');
  const quantities = appFrame.getByPlaceholder('0', { exact: true });
  const rates = appFrame.getByPlaceholder('0.00', { exact: true });
  const count = await descriptions.count();
  const rows: UiLineItem[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      description: (await descriptions.nth(i).inputValue()).trim(),
      quantity: Number((await quantities.nth(i).inputValue()) || 0),
      rate: Number((await rates.nth(i).inputValue()) || 0),
    });
  }
  return rows;
}

export async function ensureLineItemRow(appFrame: FrameLocator): Promise<void> {
  // Default radio is Start with last invoice — that mode has no blank line-item
  // row until a previous invoice is chosen. Brand New always exposes Find items.
  if ((await getLineItemCount(appFrame)) === 0) {
    const startWithLast = appFrame.getByRole('radio', { name: 'Start with last invoice' });
    if (await startWithLast.isChecked().catch(() => false)) {
      await appFrame.getByRole('radio', { name: 'Brand New' }).click();
      await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked();
    }
  }
  if ((await getLineItemCount(appFrame)) === 0) {
    await appFrame.getByRole('button', { name: 'Add new item' }).click();
  }
  await expect(appFrame.getByPlaceholder('Enter description').first()).toBeVisible({
    timeout: 15000,
  });
}

export async function keepSingleLineItemRow(appFrame: FrameLocator): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const n = await getLineItemCount(appFrame);
    if (n <= 1) break;
    const clicked = await clickLastLineItemDelete(appFrame);
    if (!clicked) break;
    await expect
      .poll(async () => getLineItemCount(appFrame), { timeout: 8000 })
      .toBeLessThan(n)
      .catch(() => undefined);
  }
}

/**
 * Canvas trash is an unnamed Icon inside the gallery listitem (no accessible name).
 * Prefer a named delete img when it exists; otherwise click the right edge of the last row.
 */
export async function clickLastLineItemDelete(appFrame: FrameLocator): Promise<boolean> {
  const row = appFrame
    .getByRole('listitem')
    .filter({ has: appFrame.getByPlaceholder('Enter description') })
    .last();
  await expect(row).toBeVisible({ timeout: 10000 });

  const named = row.getByRole('img', { name: /delete|trash|remove/i });
  if ((await named.count()) > 0) {
    await named.last().click({ force: true });
  } else {
    // Canvas trash is an unlabeled aria-hidden control on the row, not a named img
    // (product combo chevrons are img and must not be clicked).
    const trash = row.locator('[aria-hidden="true"]');
    if ((await trash.count()) > 0) {
      await trash.last().click({ force: true });
    } else {
      const box = await row.boundingBox();
      if (!box || box.width < 40) return false;
      await row.click({
        position: { x: Math.max(8, box.width - 8), y: box.height / 2 },
        force: true,
      });
    }
  }

  const confirm = appFrame.getByRole('button', { name: /^(Continue|Yes|OK|Delete)$/i });
  if (await confirm.first().isVisible({ timeout: 4000 }).catch(() => false)) {
    await confirm.first().click();
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function selectProduct(
  appFrame: FrameLocator,
  productName?: string | RegExp
): Promise<void> {
  expect(
    await isDuplicatePopupOpen(appFrame),
    'Duplicate Project! popup is still open — pick another project before filling line items'
  ).toBeFalsy();
  await ensureLineItemRow(appFrame);
  await keepSingleLineItemRow(appFrame);
  const findItems = appFrame.getByRole('button', { name: 'Find items' }).first();
  const alreadyNamed =
    typeof productName === 'string'
      ? appFrame
          .getByRole('button', { name: productName, exact: true })
          .or(appFrame.getByRole('button', { name: `Selected: ${productName}`, exact: true }))
      : null;
  if (alreadyNamed && (await alreadyNamed.first().isVisible().catch(() => false))) {
    return;
  }
  const opener = (await findItems.isVisible().catch(() => false))
    ? findItems
    : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await expect(opener).toBeVisible({ timeout: 15000 });
  await opener.click();
  const search = appFrame.getByRole('textbox', { name: /Find items/i });
  if (typeof productName === 'string' && (await search.isVisible({ timeout: 3000 }).catch(() => false))) {
    await search.fill(productName);
  }
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
  if (productName) {
    const named =
      typeof productName === 'string'
        ? appFrame
            .getByRole('option', { name: productName, exact: true })
            .or(
              appFrame.getByRole('option', {
                name: new RegExp(`^${escapeRegExp(productName)}$`, 'i'),
              })
            )
        : appFrame.getByRole('option', { name: productName }).first();
    if ((await named.count()) > 0) {
      await named.first().click();
    } else {
      await appFrame.getByRole('option').first().click();
    }
  } else {
    await appFrame.getByRole('option').first().click();
  }

  if (typeof productName === 'string') {
    await expect(
      appFrame
        .getByRole('button', { name: productName, exact: true })
        .or(appFrame.getByRole('button', { name: `Selected: ${productName}`, exact: true }))
    ).toBeVisible({ timeout: 15000 });
  }
}

export async function fillLineItem(
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

export async function setToggle(
  appFrame: FrameLocator,
  label: 'Adhoc Invoice' | 'Send Instantly',
  on: boolean
): Promise<void> {
  const labelLoc = appFrame.getByText(label, { exact: true });
  await expect(labelLoc).toBeVisible({ timeout: 20000 });

  const named = appFrame.getByRole('switch', { name: new RegExp(label, 'i') });
  const adhocVisible =
    (await appFrame.getByText('Adhoc Invoice', { exact: true }).count()) > 0;
  const switchIndex = label === 'Adhoc Invoice' ? 0 : adhocVisible ? 1 : 0;
  const switchCtrl =
    (await named.count()) > 0 ? named.first() : appFrame.getByRole('switch').nth(switchIndex);
  await expect(switchCtrl).toBeVisible({ timeout: 20000 });

  for (let attempt = 0; attempt < 8; attempt++) {
    const checked = await switchCtrl.isChecked().catch(() => false);
    if (checked === on) break;
    if (attempt % 2 === 0) {
      await switchCtrl.click({ force: true });
    } else {
      await labelLoc.click({ force: true });
    }
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

export async function setAdhoc(appFrame: FrameLocator, on: boolean): Promise<void> {
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

export async function setSendInstantly(appFrame: FrameLocator, on: boolean): Promise<void> {
  await setToggle(appFrame, 'Send Instantly', on);
}

export async function closeToPriorScreen(
  appFrame: FrameLocator
): Promise<'dashboard' | 'overview'> {
  await appFrame.getByRole('button', { name: 'Close' }).click();

  const confirm = appFrame.getByRole('button', {
    name: /^(Yes|OK|Leave|Discard|Confirm|Don't Save|Dont Save)$/i,
  });
  if (await confirm.first().isVisible({ timeout: 4000 }).catch(() => false)) {
    await confirm.first().click();
  }

  await expect(appFrame.getByText('New Invoice', { exact: true })).toBeHidden({
    timeout: 20000,
  });

  const showInvoices = appFrame.getByText('Show Invoices', { exact: true });
  const dashboard = appFrame.getByText('Invoice Tasks', { exact: true });

  await expect
    .poll(
      async () =>
        (await dashboard.isVisible().catch(() => false)) ||
        (await showInvoices.isVisible().catch(() => false)),
      { timeout: 30000 }
    )
    .toBeTruthy();

  if (await dashboard.isVisible().catch(() => false)) {
    await expect(appFrame.getByText('Total Invoices', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    return 'dashboard';
  }
  return 'overview';
}

export async function selectTaxOption(appFrame: FrameLocator): Promise<string> {
  const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
  await expect(findTax).toBeVisible({ timeout: 15000 });
  await findTax.click();
  const option = appFrame.getByRole('option').first();
  await expect(option).toBeVisible({ timeout: 15000 });
  const name = ((await option.innerText()) || '').trim();
  await option.click();
  const safe = escapeRegExp(name.slice(0, 20) || 'Tax');
  await expect(
    appFrame
      .getByRole('button', { name: new RegExp(safe, 'i') })
      .or(appFrame.getByRole('button', { name: /^Selected:/ }))
  )
    .toBeVisible({ timeout: 10000 })
    .catch(() => undefined);
  return name;
}

export function selectedPartnerButton(appFrame: FrameLocator, name: string) {
  return appFrame
    .getByRole('button', { name: `Selected: ${name}`, exact: true })
    .or(appFrame.getByRole('button', { name, exact: true }));
}

export function selectedProjectButton(appFrame: FrameLocator, name: string) {
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
  const search = appFrame
    .getByRole('textbox', { name: /Find (Partner|Project|items|Contract)/i })
    .or(appFrame.locator('dialog').getByRole('textbox').first());
  if (typeof optionName === 'string') {
    if (await search.first().isVisible({ timeout: 2500 }).catch(() => false)) {
      await search.first().fill(optionName);
    }
  }
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 20000 });
  const option =
    typeof optionName === 'string'
      ? appFrame.getByRole('option', { name: optionName, exact: true })
      : appFrame.getByRole('option', { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

export async function selectPartner(appFrame: FrameLocator, name: string): Promise<void> {
  const selected = selectedPartnerButton(appFrame, name).or(
    appFrame.getByRole('button', { name: new RegExp(`Selected:\\s*${escapeRegExp(name)}`, 'i') })
  );
  if (await selected.isVisible().catch(() => false)) return;

  const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
  const opener = (await findPartner.isVisible().catch(() => false))
    ? findPartner
    : appFrame.getByRole('button', { name: /^Selected:/ }).first();
  await selectComboOption(appFrame, opener, name);
  await expect(selected).toBeVisible({ timeout: 15000 });
}

export async function selectProject(
  appFrame: FrameLocator,
  name: string | RegExp
): Promise<void> {
  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  const opener = (await findProject.isVisible().catch(() => false))
    ? findProject
    : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await expect(opener).toBeVisible({ timeout: 15000 });
  await selectComboOption(appFrame, opener, name);

  if (typeof name !== 'string') return;

  const loc = duplicateLocators(appFrame);
  const selected = selectedProjectButton(appFrame, name);
  await expect
    .poll(
      async () => {
        if (await isDuplicatePopupOpen(appFrame)) return 'dup';
        if (await selected.isVisible().catch(() => false)) return 'ok';
        return '';
      },
      { timeout: 15000 }
    )
    .toMatch(/^(dup|ok)$/);
  if (!(await isDuplicatePopupOpen(appFrame))) {
    await loc.title.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined);
  }
}

/**
 * Pick a Project option without requiring it to stay selected.
 * No-active-contract projects fire a toast and often reset Find Project.
 */
export async function selectProjectAllowingToast(
  appFrame: FrameLocator,
  name: string
): Promise<void> {
  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  const opener = (await findProject.isVisible().catch(() => false))
    ? findProject
    : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await opener.click();
  const search = appFrame.getByRole('textbox', { name: 'Find Project' });
  if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
    await search.fill(name);
  }
  const option = appFrame.getByRole('option', { name, exact: true });
  await expect(option).toBeVisible({ timeout: 15000 });
  await option.click();
}

export function duplicateLocators(appFrame: FrameLocator) {
  return {
    title: appFrame.getByText(/Duplicate Project/),
    body: appFrame.getByText(/already in progress for this month/i),
    verify: appFrame.getByRole('button', { name: 'Verify' }),
    cancel: appFrame.getByRole('button', { name: 'Cancel' }),
  };
}

export async function isDuplicatePopupOpen(appFrame: FrameLocator): Promise<boolean> {
  const loc = duplicateLocators(appFrame);
  if (await loc.title.isVisible().catch(() => false)) return true;
  if (await loc.body.isVisible().catch(() => false)) return true;
  return (
    (await loc.verify.isVisible().catch(() => false)) &&
    (await loc.cancel.isVisible().catch(() => false))
  );
}

export async function dismissDuplicateDialog(appFrame: FrameLocator): Promise<boolean> {
  if (!(await isDuplicatePopupOpen(appFrame))) return false;
  const loc = duplicateLocators(appFrame);

  // Canvas galleries keep extra Cancel copies in hidden templates. `.last()` + force
  // clicked a non-interactive copy and left Duplicate Project! open. Click the visible
  // control the same way the working helper did (no force, no last).
  const visibleCancel = appFrame
    .getByText('Cancel', { exact: true })
    .or(loc.cancel)
    .filter({ visible: true })
    .first();
  if (await visibleCancel.isVisible().catch(() => false)) {
    await visibleCancel.click();
  }

  if (await isDuplicatePopupOpen(appFrame)) {
    const verify = loc.verify.filter({ visible: true }).first();
    const box = await verify.boundingBox().catch(() => null);
    if (box) {
      // Cancel sits immediately left of Verify on the live dialog.
      await verify.click({
        position: { x: -Math.max(24, Math.round(box.width * 0.7)), y: Math.round(box.height / 2) },
        force: true,
      });
    }
  }

  if (await isDuplicatePopupOpen(appFrame)) {
    await loc.verify.filter({ visible: true }).first().press('Escape').catch(() => undefined);
  }

  await expect(
    loc.title.filter({ visible: true }).first(),
    'Duplicate Project! stayed open after Cancel — cannot pick another project'
  ).toBeHidden({ timeout: 15000 });
  return true;
}

export const NO_CLEAR_PROJECT =
  'Failed because no project is available to perform this test without Duplicate Project! (Adhoc was not turned on). Need an Active contracted project with no non-adhoc invoice in the current duplicate window.';

function uniqueProjects(
  candidates: (ProjectFixture | null | undefined)[]
): ProjectFixture[] {
  return candidates.filter(
    (p, i, arr): p is ProjectFixture =>
      !!p && arr.findIndex((x) => x?.projectId === p.projectId) === i
  );
}

/**
 * Start with last invoice + first project that has **no invoices at all**.
 * Last-month invoice → radio stays on Start with last invoice (CI-003).
 * No invoices before → toast + auto-switch to Brand New (TC-CI-13).
 * A project with older invoices (not last month) can toast but will not switch — skip those.
 */
export async function selectProjectForNoLastInvoiceToast(
  appFrame: FrameLocator,
  candidates: (ProjectFixture | null | undefined)[],
  token?: string
): Promise<ProjectFixture> {
  const list = uniqueProjects(candidates).slice(0, token ? 12 : 6);
  expect(
    list.length,
    'Failed because no project is available to test the no-last-invoice toast (need a project with no invoices at all — Brand New auto-switch — and no Duplicate Project this window)'
  ).toBeGreaterThan(0);

  const lastInvoice = appFrame.getByRole('radio', { name: 'Start with last invoice' });
  if (!(await lastInvoice.isChecked().catch(() => false))) {
    await lastInvoice.click();
    await expect(lastInvoice).toBeChecked();
  }

  const tried: string[] = [];
  for (const project of list) {
    const label = `${project.partnerName} / ${project.projectName}`;
    if (token) {
      if (await projectHasAnyInvoice(token, project.projectId)) {
        tried.push(`${label} (has prior invoices — Brand New auto-switch only when none exist)`);
        continue;
      }
      const blocked = await projectBlockedByDuplicate(token, project.projectId);
      if (blocked) {
        tried.push(`${label} (Dataverse already has a non-adhoc invoice this window)`);
        continue;
      }
    }
    if (await isDuplicatePopupOpen(appFrame)) {
      await dismissDuplicateDialog(appFrame);
    }
    if (await contractModalOpen(appFrame)) {
      await acceptContractIfPrompted(appFrame);
    }
    // Contract overlay intercepts clicks on the radios — never click through it.
    if (
      !(await lastInvoice.isChecked().catch(() => false)) &&
      !(await contractModalOpen(appFrame)) &&
      !(await isDuplicatePopupOpen(appFrame))
    ) {
      await lastInvoice.click();
      await expect(lastInvoice).toBeChecked();
    }
    const outcome = await selectPartnerAndProject(appFrame, project).catch(async (err) => {
      tried.push(
        `${label} (partner/project pick failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)})`
      );
      if (await isDuplicatePopupOpen(appFrame)) await dismissDuplicateDialog(appFrame);
      if (await contractModalOpen(appFrame)) {
        await acceptContractIfPrompted(appFrame).catch(() => undefined);
      }
      return 'pick-failed' as const;
    });
    if (outcome === 'pick-failed') continue;
    await expect
      .poll(
        async () =>
          (await isDuplicatePopupOpen(appFrame)) ||
          (await contractModalOpen(appFrame)) ||
          (await appFrame.getByText(TOAST.noLastInvoice).isVisible().catch(() => false)),
        { timeout: 5000, intervals: [200, 400, 800] }
      )
      .toBeTruthy()
      .catch(() => undefined);
    if (outcome === 'duplicate' || (await isDuplicatePopupOpen(appFrame))) {
      tried.push(`${label} (live Duplicate Project! — Cancel and try next)`);
      await dismissDuplicateDialog(appFrame);
      continue;
    }
    if (await contractModalOpen(appFrame)) {
      await acceptContractIfPrompted(appFrame);
    }
    if (
      outcome === 'no-last-invoice' ||
      (await appFrame.getByText(TOAST.noLastInvoice).isVisible().catch(() => false))
    ) {
      const brandNew = appFrame.getByRole('radio', { name: 'Brand New' });
      const switched = await expect
        .poll(async () => brandNew.isChecked(), { timeout: 8000, intervals: [200, 400, 800] })
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      if (switched) return project;
      tried.push(
        `${label} (toast shown but radio stayed on Start with last invoice — older invoices exist)`
      );
      continue;
    }
    tried.push(`${label} (last-month invoice prefills — not the empty-last-month toast)`);
  }

  expect(
    false,
    `Failed because no remaining project had zero invoices (toast + auto-switch to Brand New). Tried: ${tried.join('; ') || '(none)'}`
  ).toBe(true);
  return list[0];
}

/**
 * Brand New + first project still clear of Duplicate Project!.
 * Re-checks Dataverse when a token is passed so stale fixtures are skipped in API, not UI.
 * On Duplicate: Cancel only — do not toggle Start with last / Brand New (Adhoc forces Brand New
 * and that radio fight is what hung the suite). Then try the next partner/project.
 * Caps UI attempts so a full candidate dump cannot sit on the dialog until timeout.
 */
export async function selectClearBrandNewProject(
  appFrame: FrameLocator,
  candidates: (ProjectFixture | null | undefined)[],
  why: string,
  token?: string
): Promise<ProjectFixture> {
  const list = uniqueProjects(candidates).slice(0, token ? 12 : 6);
  expect(list.length, why || NO_CLEAR_PROJECT).toBeGreaterThan(0);

  const brandNew = appFrame.getByRole('radio', { name: 'Brand New' });
  if (!(await brandNew.isChecked().catch(() => false))) {
    await brandNew.click();
    await expect(brandNew).toBeChecked();
  }

  const tried: string[] = [];
  for (const project of list) {
    const label = `${project.partnerName} / ${project.projectName}`;
    if (token) {
      const blocked = await projectBlockedByDuplicate(token, project.projectId);
      if (blocked) {
        tried.push(`${label} (Dataverse already has a non-adhoc invoice this window)`);
        continue;
      }
    }
    tried.push(label);
    if (await isDuplicatePopupOpen(appFrame)) {
      await dismissDuplicateDialog(appFrame);
    }
    const outcome = await selectPartnerAndProject(appFrame, project);
    if (outcome === 'duplicate') {
      tried[tried.length - 1] = `${label} (live Duplicate Project! — Cancel and try next)`;
      await dismissDuplicateDialog(appFrame);
      continue;
    }
    await acceptContractIfPrompted(appFrame);
    return project;
  }

  expect(
    false,
    `${why || NO_CLEAR_PROJECT} Tried: ${tried.join('; ') || '(none)'}`
  ).toBe(true);
  return list[0];
}

export async function selectPartnerAndProject(
  appFrame: FrameLocator,
  fixture: ProjectFixture
): Promise<ProjectSelectOutcome> {
  if (await isDuplicatePopupOpen(appFrame)) {
    return 'duplicate';
  }

  await selectPartner(appFrame, fixture.partnerName);

  await expect(
    appFrame
      .getByRole('button', { name: 'Find Project' })
      .or(appFrame.getByRole('button', { name: /^Selected:/ }).nth(1))
  ).toBeVisible({ timeout: 20000 });

  await selectProject(appFrame, fixture.projectName);
  if (await isDuplicatePopupOpen(appFrame)) return 'duplicate';
  if (await contractModalOpen(appFrame)) {
    await acceptContractIfPrompted(appFrame);
  }
  if (await isDuplicatePopupOpen(appFrame)) return 'duplicate';
  if (await appFrame.getByText(TOAST.noLastInvoice).isVisible().catch(() => false)) {
    return 'no-last-invoice';
  }
  return 'clear';
}

export async function awaitSubmitNavigatedToOverview(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText(TOAST.submitted).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
}

export function anyProject(
  ...projects: (ProjectFixture | null | undefined)[]
): ProjectFixture | null {
  return projects.find((p): p is ProjectFixture => !!p) ?? null;
}

export async function partnerComboHasOptions(appFrame: FrameLocator): Promise<boolean> {
  const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
  if ((await findPartner.count()) === 0) return true;
  await findPartner.click();
  const has =
    (await appFrame.getByRole('option').first().isVisible({ timeout: 8000 }).catch(() => false)) ===
    true;
  await appFrame.getByText('New Invoice', { exact: true }).click({ force: true }).catch(() => undefined);
  return has;
}

export async function fillValidLine(
  page: Page,
  appFrame: FrameLocator,
  productName?: string
): Promise<void> {
  await selectProduct(appFrame, productName);
  await fillLineItem(page, appFrame, {
    description: LINE_DESCRIPTION,
    qty: '2',
    rate: '100',
  });
}

export async function contractModalOpen(appFrame: FrameLocator): Promise<boolean> {
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true }).filter({ visible: true });
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' }).filter({
    visible: true,
  });
  return (
    (await title.first().isVisible().catch(() => false)) ||
    (await findContract.first().isVisible().catch(() => false))
  );
}

/**
 * Multi-contract projects open a modal after Project OnChange.
 * Canvas keeps a hidden "Please select the Contract." template in the DOM — only
 * the visible Find Contract / title counts. If several Active rows exist but only
 * one covers the form date, the picker may never appear.
 */
export async function selectContractIfPrompted(
  appFrame: FrameLocator,
  opts: { contracts?: ContractOption[]; label?: string } = {}
): Promise<string | null> {
  const contracts = opts.contracts ?? [];
  const covering = contracts.filter((c) => c.coversInvoiceDate);
  const expectModal = covering.length > 1 || (covering.length === 0 && contracts.length > 1);
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true }).filter({ visible: true });
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' }).filter({
    visible: true,
  });
  const visiblePrompt = title.or(findContract).filter({ visible: true }).first();

  if (expectModal) {
    const appeared = await visiblePrompt.isVisible({ timeout: 12000 }).catch(() => false);
    if (!appeared) {
      return null;
    }
  } else if (!(await contractModalOpen(appFrame))) {
    return null;
  }

  await expect(findContract.first()).toBeVisible({ timeout: 15000 });
  await findContract.first().click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 20000 });

  const options = appFrame.getByRole('option');
  const names = (await options.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const preferred = contracts.filter((c) => c.coversInvoiceDate).map((c) => c.name);
  const order = [
    ...names.filter((n) => preferred.some((p) => p && n.toLowerCase() === p.toLowerCase())),
    ...names.filter((n) => !preferred.some((p) => p && n.toLowerCase() === p.toLowerCase())),
  ];

  const ok = appFrame.getByRole('button', { name: 'Ok', exact: true });
  let chosen = '';
  for (const candidateName of order.length ? order : ['']) {
    if ((await options.count()) === 0) {
      await findContract.first().click();
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
  }

  await expect(ok).toBeEnabled({ timeout: 15000 });
  await ok.click();
  await expect(title).toBeHidden({ timeout: 20000 });
  await expect(findContract).toBeHidden({ timeout: 20000 });
  await expect(ok).toBeHidden({ timeout: 10000 }).catch(() => undefined);
  return chosen || '(selected)';
}

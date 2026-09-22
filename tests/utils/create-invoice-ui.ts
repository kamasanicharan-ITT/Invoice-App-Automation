/**
 * Shared Create Invoice UI helpers for regression + existing suites.
 * Locators verified live 2026-08-18 (Admin + PM) against New Invoice.
 */
import { expect, type Page, type FrameLocator, type Locator, type TestInfo } from '@playwright/test';
import { dismissHostDialogs, dismissHostDialogsSettling } from './host-dialogs';
import { APP_URL, type ContractOption, type ProjectFixture } from './dataverse-fixtures';

export const LINE_DESCRIPTION = 'Automation line item — Create Invoice regression';

export const MONEY = /(?:\$|₹)\s*[1-9]\d*/;

export const TOAST = {
  noLastInvoice: /No invoice has been generated for this project over the last month/i,
  submitted: /submitted/i,
  noActiveContract: /No active contracts found for the selected project/i,
  serviceEndAfterStart: /Service End Date must be after Start Date|after Start Date/i,
  threeMonthLimit: /You are selecting an invoice date beyond the allowed 3-month limit/i,
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

export async function acceptContractIfPrompted(appFrame: FrameLocator): Promise<void> {
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' });
  if (!(await findContract.isVisible({ timeout: 4000 }).catch(() => false))) return;
  await findContract.click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 10000 });
  await appFrame.getByRole('option').first().click();
  const ok = appFrame.getByRole('button', { name: 'Ok', exact: true });
  if (await ok.isEnabled().catch(() => false)) await ok.click();
  await expect(findContract).toBeHidden({ timeout: 15000 }).catch(() => undefined);
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
  await ensureLineItemRow(appFrame);
  await keepSingleLineItemRow(appFrame);
  const findItems = appFrame.getByRole('button', { name: 'Find items' }).first();
  await expect(findItems).toBeVisible({ timeout: 15000 });
  await findItems.click();
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
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 20000 });
  const option =
    typeof optionName === 'string'
      ? appFrame.getByRole('option', { name: optionName, exact: true })
      : appFrame.getByRole('option', { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

export async function selectPartner(appFrame: FrameLocator, name: string): Promise<void> {
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

  const dup = duplicateLocators(appFrame).title;
  const selected = selectedProjectButton(appFrame, name);
  await expect
    .poll(
      async () => {
        if (await dup.isVisible().catch(() => false)) return 'dup';
        if (await selected.isVisible().catch(() => false)) return 'ok';
        return '';
      },
      { timeout: 15000 }
    )
    .toMatch(/^(dup|ok)$/);
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
    title: appFrame.getByText(DUPLICATE.title, { exact: true }),
    body: appFrame.getByText(DUPLICATE.body),
    verify: appFrame.getByRole('button', { name: 'Verify' }),
    cancel: appFrame.getByRole('button', { name: 'Cancel' }),
  };
}

export async function dismissDuplicateDialog(appFrame: FrameLocator): Promise<void> {
  const dup = duplicateLocators(appFrame);
  if (!(await dup.title.isVisible().catch(() => false))) return;
  if (await dup.cancel.isVisible().catch(() => false)) {
    await dup.cancel.click();
  }
  await expect(dup.title).toBeHidden({ timeout: 15000 });
}

export async function selectPartnerAndProject(
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
  const selected = selectedProjectButton(appFrame, fixture.projectName);
  await selectProject(appFrame, fixture.projectName);
  try {
    await expect
      .poll(
        async () => {
          if (await dup.isVisible().catch(() => false)) return 'duplicate';
          if (await noLast.isVisible().catch(() => false)) return 'no-last-invoice';
          if (await selected.isVisible().catch(() => false)) return 'clear';
          return '';
        },
        { timeout: 15000 }
      )
      .toMatch(/^(duplicate|no-last-invoice|clear)$/);
    if (await dup.isVisible().catch(() => false)) return 'duplicate';
    if (await noLast.isVisible().catch(() => false)) return 'no-last-invoice';
    return 'clear';
  } catch {
    return 'clear';
  }
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
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true });
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' });
  return (
    (await title.isVisible().catch(() => false)) ||
    (await findContract.isVisible().catch(() => false))
  );
}

/**
 * Multi-contract projects open a modal after Project OnChange.
 * Pass Active contracts so a project with more than one requires the modal.
 */
export async function selectContractIfPrompted(
  appFrame: FrameLocator,
  opts: { contracts?: ContractOption[]; label?: string } = {}
): Promise<string | null> {
  const contracts = opts.contracts ?? [];
  const expectModal = contracts.length > 1;
  const title = appFrame.getByText(CONTRACT_MODAL_TITLE, { exact: true });
  const findContract = appFrame.getByRole('button', { name: 'Find Contract' });

  if (expectModal) {
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
  const preferred = contracts.filter((c) => c.coversInvoiceDate).map((c) => c.name);
  const order = [
    ...names.filter((n) => preferred.some((p) => p && n.toLowerCase() === p.toLowerCase())),
    ...names.filter((n) => !preferred.some((p) => p && n.toLowerCase() === p.toLowerCase())),
  ];

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
  }

  await expect(ok).toBeEnabled({ timeout: 15000 });
  await ok.click();
  await expect(title).toBeHidden({ timeout: 20000 });
  await expect(findContract).toBeHidden({ timeout: 20000 });
  await expect(ok).toBeHidden({ timeout: 10000 }).catch(() => undefined);
  return chosen || '(selected)';
}

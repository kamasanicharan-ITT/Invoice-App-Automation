import { expect, type Page, type FrameLocator, type Locator, type TestInfo, type Browser } from '@playwright/test';
import { APP_URL } from '../../config/env';
import { dismissHostDialogs, dismissHostDialogsSettling } from './host-dialogs';
import {
  dismissDuplicateDialog,
  fillValidLine,
  openCreateInvoice,
  partnerComboHasOptions,
  selectPartnerAndProject,
} from './create-invoice-ui';
import {
  captureDataverseToken,
  listProjectsClearForDraftSeed,
  loadCreateInvoiceFixtures,
} from './dataverse-fixtures';

export const PERIOD_OPTIONS = [
  'This Month',
  'Last Month',
  'Quater to Date',
  'Last Quater',
  'Year to Date',
  'Last Year',
  'Future Months',
] as const;

export const REGIONS = [
  'Australia',
  'Colombia',
  'India',
  'Netherlands',
  'North America',
  'Saudi Arabia',
  'South Korea',
  'UAE',
] as const;

export const INVOICE_NUMBER = /\d{4}-\d{4}|INV-\d+/;

export const GALLERY_HEADERS = [
  'Partner',
  'Project',
  'Invoice #',
  'Action Pending with',
  'Status',
  'Next Step',
] as const;

export type Persona = 'admin' | 'pm';

export function personaFromProjectName(projectName: string): Persona {
  return projectName.toLowerCase().includes('pm') ? 'pm' : 'admin';
}

export function activePersona(testInfo: TestInfo): Persona {
  return personaFromProjectName(testInfo.project.name);
}

export async function clickIconRightOf(page: Page, label: Locator): Promise<void> {
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (!box) throw new Error(`No bounding box for ${await label.textContent()}`);
  await page.mouse.click(box.x + box.width + 18, box.y + box.height / 2);
}

export async function openInvoiceOverview(page: Page): Promise<FrameLocator> {
  // Keep canvas wide enough that Partner…⋮ columns stay on-screen.
  await page.setViewportSize({ width: 1920, height: 1080 });
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
  await appFrame.getByRole('button', { name: 'Invoice Overview' }).first().click();
  await dismissHostDialogs(page);
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 30000,
  });

  await waitForOverviewSettled(appFrame);

  return appFrame;
}

export function regionDropdown(appFrame: FrameLocator) {
  return appFrame.getByRole('button', { name: '.', exact: true });
}

export function periodButton(appFrame: FrameLocator, label: string | RegExp) {
  return appFrame.getByRole('button', { name: label });
}

export function pageNumberButtons(appFrame: FrameLocator) {
  return appFrame.getByRole('button', { name: /^\d+$/ });
}

export async function clickPaginationPrev(page: Page, appFrame: FrameLocator): Promise<void> {
  const lowest = pageNumberButtons(appFrame).first();
  await expect(lowest).toBeVisible({ timeout: 15000 });
  const box = await lowest.boundingBox();
  if (!box) throw new Error('Pagination page button has no bounding box');
  await page.mouse.click(box.x - 20, box.y + box.height / 2);
}

export function scopeRadios(appFrame: FrameLocator) {
  return {
    group: appFrame.getByRole('radiogroup'),
    my: appFrame.getByRole('radio', { name: 'My Invoices' }),
    all: appFrame.getByRole('radio', { name: 'All Invoices' }),
  };
}

export async function expectComboOptions(
  appFrame: FrameLocator,
  options: readonly string[]
): Promise<void> {
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
  await expect(appFrame.getByRole('option')).toHaveCount(options.length);
  for (const name of options) {
    const opt = appFrame.getByRole('option', { name, exact: true });
    await opt.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect.soft(opt).toBeVisible({ timeout: 10000 });
  }
}

/** Clear column filters by leaving Overview and coming back. */
export async function resetOverviewViaDashboard(
  page: Page,
  appFrame: FrameLocator
): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
  await dismissHostDialogs(page);
  await appFrame.getByRole('button', { name: 'Dashboard' }).first().click({ force: true });
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await appFrame.getByRole('button', { name: 'Invoice Overview' }).first().click({ force: true });
  await waitForOverviewSettled(appFrame);
}

export async function waitForOverviewSettled(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  // Canvas briefly shows "No Item to Display" while the gallery loads — require
  // rows, or empty stable across several polls (~6s). Do not key off generic
  // "loading"/"spinner" CSS classes — Power Apps chrome matches those constantly.
  let emptyStreak = 0;
  await expect
    .poll(
      async () => {
        const invoiceCount = await appFrame.getByText(INVOICE_NUMBER).count();
        const itemCount = await appFrame.getByText(/^Item\s*\d+/).count();
        if (invoiceCount > 0 || itemCount > 0) {
          emptyStreak = 0;
          return 'rows';
        }
        const emptyVisible = await appFrame
          .getByText('No Item to Display', { exact: true })
          .isVisible()
          .catch(() => false);
        if (emptyVisible) {
          emptyStreak += 1;
          return emptyStreak >= 4 ? 'empty' : '';
        }
        emptyStreak = 0;
        return '';
      },
      { timeout: 60000, intervals: [1000, 1500, 2000] }
    )
    .not.toBe('');
}

export async function firstInvoiceNumber(appFrame: FrameLocator): Promise<string> {
  const cell = appFrame.getByText(INVOICE_NUMBER).first();
  if ((await cell.count()) === 0) return '';
  return ((await cell.textContent()) || '').trim();
}

export async function overviewHasRows(appFrame: FrameLocator): Promise<boolean> {
  return (
    (await appFrame.getByText(INVOICE_NUMBER).count()) > 0 ||
    (await appFrame.getByText(/^Item\s*\d+/).count()) > 0
  );
}

export async function applyPeriod(appFrame: FrameLocator, option: string): Promise<void> {
  const open = periodButton(appFrame, /This Month|Last Month|Quater|Year to Date|Last Year|Future Months/);
  await open.click();
  await appFrame.getByRole('option', { name: option, exact: true }).click();
  await expect(periodButton(appFrame, option)).toBeVisible({ timeout: 15000 });
  await waitForOverviewSettled(appFrame);
}

export async function applyRegion(appFrame: FrameLocator, region: string): Promise<void> {
  const current = appFrame.getByRole('button', { name: region, exact: true });
  if (await current.isVisible().catch(() => false)) {
    await waitForOverviewSettled(appFrame);
    return;
  }
  const unselected = regionDropdown(appFrame);
  if (await unselected.count()) {
    await unselected.click();
  } else {
    await appFrame.getByText('Region', { exact: true }).click();
  }
  await expect(appFrame.getByRole('option', { name: region, exact: true })).toBeVisible({
    timeout: 15000,
  });
  await appFrame.getByRole('option', { name: region, exact: true }).click();
  await expect(appFrame.getByRole('button', { name: region })).toBeVisible({ timeout: 15000 });
  await waitForOverviewSettled(appFrame);
}

// Canvas listitem innerText often starts with "Item 1. Selected." as one line.
const NOISE =
  /^(Item\s*\d+(\.\s*Selected\.)?|Selected\.|Review|Approve|Edit|Report|View|Draft|Submitted|Reviewed|Approved|Flagged|Cancelled|Sent|Fail-.+|SYSTEM|Next Step)$/i;

export async function firstRowPartnerAndProject(
  appFrame: FrameLocator
): Promise<{ partner: string; project: string }> {
  const item = appFrame.getByRole('listitem').first();
  await expect(item).toBeVisible({ timeout: 15000 });
  const raw = ((await item.innerText()) || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const useful = raw.filter((s) => !NOISE.test(s) && !INVOICE_NUMBER.test(s) && s.length > 1);
  return { partner: useful[0] ?? '', project: useful[1] ?? '' };
}

function parseGalleryRow(rawLines: string[]): {
  partner: string;
  project: string;
  invoice: string;
  actionPending: string;
  nextStep: string;
} {
  const lines = rawLines.map((s) => s.trim()).filter(Boolean);
  const useful = lines.filter((s) => !NOISE.test(s) && s.length > 1);
  const invoice = lines.find((s) => INVOICE_NUMBER.test(s)) ?? '';
  const nextStep =
    lines.find((s) =>
      /^(Edit Draft|Review|Approve|View|Report|Edit)$/i.test(s)
    ) ?? '';
  const partner = useful[0] ?? '';
  const project = useful[1] ?? '';
  const actionPending =
    useful.find(
      (s) =>
        s !== partner &&
        s !== project &&
        s !== invoice &&
        s !== nextStep &&
        !INVOICE_NUMBER.test(s) &&
        /^[A-Za-z].*\s[A-Za-z]/.test(s)
    ) ?? '';
  return { partner, project, invoice, actionPending, nextStep };
}

export async function galleryRows(
  appFrame: FrameLocator
): Promise<
  { partner: string; project: string; invoice: string; actionPending: string; nextStep: string }[]
> {
  const items = appFrame.getByRole('listitem');
  const n = await items.count();
  const rows = [];
  for (let i = 0; i < n; i++) {
    const raw = ((await items.nth(i).innerText()) || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    rows.push(parseGalleryRow(raw));
  }
  return rows;
}

/** Sort arrow: prefer named Canvas control, else first icon right of header label. */
export async function clickColumnSortArrow(
  page: Page,
  appFrame: FrameLocator,
  column: 'Partner' | 'Project' | 'Invoice #' | 'Status'
): Promise<void> {
  const byName: Record<string, string> = {
    Partner: 'icnPartnerDownInvoiceOverview',
    Project: 'icnProjectDownInvoiceOverview',
    'Invoice #': 'icnInvoiceDownInvoiceOverview',
    Status: 'icnStatusDownInvoiceOverview',
  };
  const named = appFrame.locator(`[data-control-name="${byName[column]}"]`);
  if ((await named.count()) > 0) {
    await named.first().click({ force: true });
  } else {
    const label = appFrame.getByText(column, { exact: true }).first();
    await expect(label).toBeVisible({ timeout: 15000 });
    const box = await label.boundingBox();
    if (!box) throw new Error(`No bounding box for column ${column}`);
    await page.mouse.click(box.x + box.width + 20, box.y + box.height / 2);
  }
  await waitForOverviewSettled(appFrame);
}

/** Funnel: named Canvas control when present. */
export async function clickColumnFunnel(
  page: Page,
  appFrame: FrameLocator,
  column: 'Partner' | 'Project' | 'Status' | 'Action Pending with'
): Promise<void> {
  const byName: Record<string, string> = {
    Partner: 'icnPartnerFilterInvoiceOverview',
    Project: 'icnProjectFilterInvoiceOverview',
    Status: 'icnStatusFilterInvoiceOverview',
    'Action Pending with': 'icnStatusFilterInvoiceOverview_1',
  };
  const named = appFrame.locator(`[data-control-name="${byName[column]}"]`);
  if ((await named.count()) > 0) {
    await named.first().click({ force: true });
    return;
  }
  const label = appFrame.getByText(column, { exact: true }).first();
  await expect(label).toBeVisible({ timeout: 15000 });
  const box = await label.boundingBox();
  if (!box) throw new Error(`No bounding box for column ${column}`);
  const offsetX =
    column === 'Action Pending with' ? box.width - 8 : box.width + 48;
  await page.mouse.click(box.x + offsetX, box.y + box.height / 2);
}

export async function openPdfFromNextStep(
  page: Page,
  appFrame: FrameLocator
): Promise<'Review' | 'Approve' | 'View'> {
  for (const name of ['Review', 'Approve', 'View'] as const) {
    const btn = appFrame.getByRole('button', { name });
    if ((await btn.count()) === 0) continue;
    await btn.first().click();
    await dismissHostDialogs(page);
    await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    return name;
  }
  throw new Error(
    'No invoice with Review, Approve, or View Next Step — please create or advance some invoices'
  );
}

export async function closeViewInvoice(page: Page, appFrame: FrameLocator): Promise<void> {
  await clickIconRightOf(page, appFrame.getByText('View Invoice', { exact: true }));
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 20000,
  });
}

/** ⋮ menu for a row with the given Next Step button (tries each match until menu item appears). */
export async function openRowKebab(
  page: Page,
  appFrame: FrameLocator,
  nextStepButtonName: string | RegExp,
  expectedMenuItem?: string | RegExp
): Promise<void> {
  const inGallery = appFrame.getByRole('listitem').getByRole('button', { name: nextStepButtonName });
  const candidates =
    (await inGallery.count()) > 0
      ? inGallery
      : appFrame.getByRole('button', { name: nextStepButtonName });
  const candidateCount = await candidates.count();
  expect(
    candidateCount,
    `No Next Step button matching ${String(nextStepButtonName)}`
  ).toBeGreaterThan(0);

  const menuLabels = expectedMenuItem
    ? [expectedMenuItem]
    : (['Delete Draft', 'Cancel Invoice', 'Send Notification'] as const);

  let opened = false;
  for (let b = 0; b < candidateCount; b++) {
    const btn = candidates.nth(b);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const btnBox = await btn.boundingBox();
    if (!btnBox) continue;
    const btnCy = btnBox.y + btnBox.height / 2;

    const more = appFrame.locator('[data-control-name="icn_showMoreOptionsInvoiceOverview"]');
    const moreCount = await more.count();
    let bestIdx = -1;
    let bestX = -1;
    let bestOverlap = -1;
    for (let i = 0; i < moreCount; i++) {
      const box = await more.nth(i).boundingBox();
      if (!box || box.width < 5) continue;
      if (box.x < btnBox.x) continue;
      const overlap =
        Math.min(btnBox.y + btnBox.height, box.y + box.height) -
        Math.max(btnBox.y, box.y);
      if (overlap < 10) continue;
      if (overlap > bestOverlap + 1 || (Math.abs(overlap - bestOverlap) <= 1 && box.x > bestX)) {
        bestOverlap = overlap;
        bestX = box.x;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;

    await page.keyboard.press('Escape').catch(() => undefined);
    // Close Send Notification "Comments" overlay if a prior click opened it.
    const commentsClose = appFrame
      .getByText('Comments', { exact: true })
      .locator('xpath=ancestor::div[1]');
    if (await appFrame.getByText('Comments', { exact: true }).isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => undefined);
      await dismissHostDialogs(page);
    }

    const moreBox = await more.nth(bestIdx).boundingBox();
    if (!moreBox) continue;
    // Icon boxes are tall and can span rows — click at the Next Step button's Y.
    await page.mouse.click(moreBox.x + moreBox.width / 2, btnCy);

    let foundLabel = '';
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && !foundLabel) {
      for (const label of menuLabels) {
        const loc = appFrame.getByText(label, {
          exact: typeof label === 'string',
        });
        const n = await loc.count();
        for (let i = 0; i < n; i++) {
          const box = await loc.nth(i).boundingBox();
          if (!box || box.width < 1) continue;
          if (!(await loc.nth(i).isVisible().catch(() => false))) continue;
          if (Math.abs(box.y + box.height / 2 - btnCy) > 160) continue;
          foundLabel = String(label);
          break;
        }
        if (foundLabel) break;
      }
      if (!foundLabel) await new Promise((r) => setTimeout(r, 200));
    }

    if (!foundLabel) {
      await page.keyboard.press('Escape').catch(() => undefined);
      continue;
    }

    if (expectedMenuItem) {
      const wanted = appFrame.getByText(expectedMenuItem, {
        exact: typeof expectedMenuItem === 'string',
      });
      let found = false;
      const n = await wanted.count();
      for (let i = 0; i < n; i++) {
        const box = await wanted.nth(i).boundingBox();
        if (!box) continue;
        if (!(await wanted.nth(i).isVisible().catch(() => false))) continue;
        if (Math.abs(box.y + box.height / 2 - btnCy) > 160) continue;
        found = true;
        break;
      }
      if (!found) {
        await page.keyboard.press('Escape').catch(() => undefined);
        continue;
      }
    }

    opened = true;
    break;
  }

  expect(
    opened,
    `Could not open row ⋮ menu for ${String(nextStepButtonName)}` +
      (expectedMenuItem ? ` with ${String(expectedMenuItem)}` : '')
  ).toBe(true);
}

/**
 * Cancel Invoice button inside the Comments modal (not the ⋮ menu item).
 * Both share the same label — pick the control below the Comments title.
 */
export async function commentsModalCancelInvoiceButton(
  appFrame: FrameLocator
): Promise<Locator> {
  const comments = appFrame.getByText('Comments', { exact: true });
  await expect(comments).toBeVisible({ timeout: 15000 });
  const commentsBox = await comments.boundingBox();
  const buttons = appFrame.getByRole('button', { name: /Cancel Invoice/i });
  const n = await buttons.count();
  let best = -1;
  let bestY = -1;
  for (let i = 0; i < n; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box || box.width < 1) continue;
    if (commentsBox && box.y <= commentsBox.y) continue;
    if (box.y > bestY) {
      bestY = box.y;
      best = i;
    }
  }
  expect(
    best >= 0,
    'Comments modal Cancel Invoice button not found (distinct from ⋮ menu item)'
  ).toBe(true);
  return buttons.nth(best);
}

/**
 * Click Download beside Close (X) on View Invoice.
 * Live app briefly opens a SharePoint download tab — accept download OR new page/popup.
 */
export async function downloadViewInvoicePdf(
  page: Page,
  appFrame: FrameLocator
): Promise<{ kind: 'download' | 'popup'; nameOrUrl: string }> {
  await expect(appFrame.getByText('View Invoice', { exact: true })).toBeVisible();
  const downloadIcon = appFrame.locator('[data-control-name="icn_DownloadPDF"]');
  await expect(
    downloadIcon.first(),
    'Download PDF icon (icn_DownloadPDF) not visible on View Invoice'
  ).toBeVisible({ timeout: 10000 });

  const settlePopup = async (popup: Page) => {
    // Don't wait for full load — AAD/SharePoint can sit on redirects longer than our race.
    await popup
      .waitForURL(/login\.microsoftonline\.com|sharepoint\.com|download\.aspx|\.pdf/i, {
        timeout: 15000,
      })
      .catch(() => undefined);
    const finalUrl = popup.url();
    await popup.close().catch(() => undefined);
    return { kind: 'popup' as const, nameOrUrl: finalUrl };
  };

  // Don't use Promise.race on rejecting waiters — a download timeout would beat a late popup.
  const outcomePromise = new Promise<{ kind: 'download' | 'popup'; nameOrUrl: string }>(
    (resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          reject(new Error('No download or SharePoint popup within 30s after Download click'));
        }
      }, 30000);
      const done = (value: { kind: 'download' | 'popup'; nameOrUrl: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      page
        .waitForEvent('download', { timeout: 30000 })
        .then((d) => done({ kind: 'download', nameOrUrl: d.suggestedFilename() }))
        .catch(() => undefined);
      // Prefer page 'popup'; context 'page' also fires for the same tab — guard with settled.
      page
        .waitForEvent('popup', { timeout: 30000 })
        .then((popup) => settlePopup(popup).then(done))
        .catch(() => undefined);
      page
        .context()
        .waitForEvent('page', { timeout: 30000 })
        .then((popup) => settlePopup(popup).then(done))
        .catch(() => undefined);
    }
  );

  await downloadIcon.first().click({ force: true });
  const outcome = await outcomePromise;
  expect(
    outcome.kind === 'download' ||
      /download\.aspx|\.pdf|Shared%20Documents|Shared Documents|sharepoint\.com|login\.microsoftonline\.com/i.test(
        outcome.nameOrUrl
      ),
    `Unexpected download outcome: ${outcome.kind} ${outcome.nameOrUrl}`
  ).toBe(true);
  return outcome;
}

/** @deprecated Prefer downloadViewInvoicePdf — kept for callers that only need the click. */
export async function clickViewInvoiceDownload(
  page: Page,
  appFrame: FrameLocator
): Promise<void> {
  await downloadViewInvoicePdf(page, appFrame);
}

/** If gallery looks empty, click header refresh once and wait again. */
export async function ensureOverviewRows(
  page: Page,
  appFrame: FrameLocator
): Promise<void> {
  if (await overviewHasRows(appFrame)) return;
  const title = appFrame.getByText('Invoice Overview', { exact: true }).first();
  await clickIconRightOf(page, title);
  await dismissHostDialogs(page);
  await waitForOverviewSettled(appFrame);
}

export function isSortedAsc(values: string[]): boolean {
  const cleaned = values.filter(Boolean);
  const sorted = [...cleaned].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  );
  return cleaned.every((v, i) => v === sorted[i]);
}

export function isSortedDesc(values: string[]): boolean {
  const cleaned = values.filter(Boolean);
  const sorted = [...cleaned].sort((a, b) =>
    b.localeCompare(a, undefined, { sensitivity: 'base', numeric: true })
  );
  return cleaned.every((v, i) => v === sorted[i]);
}

/** First day of Future Months period: 6th of next calendar month (ISO date). */
export function futureMonthsStartIso(reference = new Date()): string {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const sixthNext = new Date(Date.UTC(y, m + 1, 6));
  return sixthNext.toISOString().slice(0, 10);
}

/**
 * Ensure Overview has at least one Edit Draft row.
 * Same as CI-050 (persona token + Brand New + Save Draft), but pick a project
 * that has a covering Active contract and no invoice this cycle. If Canvas still
 * shows Duplicate Project!, skip that project and try the next — do not reuse
 * a project that already has an invoice.
 */
export async function ensureDisposableDraft(
  page: Page,
  browser: Browser,
  persona: Persona
): Promise<FrameLocator> {
  let appFrame = await openInvoiceOverview(page);
  await ensureOverviewRows(page, appFrame).catch(() => undefined);
  const findEdit = () => appFrame.getByRole('button', { name: 'Edit Draft', exact: true });
  if ((await findEdit().count()) > 0) return appFrame;

  const token = await captureDataverseToken(browser, APP_URL, persona);
  expect(token, 'No Dataverse token — cannot seed a disposable Draft').toBeTruthy();
  const fixtures = await loadCreateInvoiceFixtures(token, { persona });
  expect(fixtures.editableProduct, 'No editable product to fill a Draft line').toBeTruthy();

  const candidates = await listProjectsClearForDraftSeed(token, persona);
  expect(
    candidates.length,
    `No ${persona} project with an Active covering contract and no invoice this cycle`
  ).toBeGreaterThan(0);

  let lastDuplicate = '';
  for (const project of candidates) {
    appFrame = await openCreateInvoice(page, persona);
    expect(
      await partnerComboHasOptions(appFrame),
      `No Partner options for ${persona} — check PM mail-list / Amisha projects`
    ).toBe(true);

    await appFrame.getByRole('radio', { name: 'Brand New' }).click();
    const outcome = await selectPartnerAndProject(appFrame, project);
    if (outcome === 'duplicate') {
      lastDuplicate = project.projectName;
      await dismissDuplicateDialog(appFrame);
      continue;
    }

    await fillValidLine(page, appFrame, fixtures.editableProduct!.name);
    const save = appFrame.getByRole('button', { name: 'Save Draft' });
    await expect(save).toBeEnabled({ timeout: 20000 });
    await save.click();
    await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await waitForOverviewSettled(appFrame);
    await expect(
      findEdit().first(),
      'Save Draft did not produce an Edit Draft row on Overview'
    ).toBeVisible({ timeout: 30000 });
    return appFrame;
  }

  throw new Error(
    lastDuplicate
      ? `Every clear-contract project still showed Duplicate Project! (last: ${lastDuplicate})`
      : 'Could not Save Draft on any project without an invoice this cycle'
  );
}

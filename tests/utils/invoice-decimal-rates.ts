// spec: specs/invoice-overview-screen-plan.md (IO-041)
//
// Helpers for the decimal-rate case: build a multi-row Create Invoice line-item
// grid with one distinct rate per row, then read the generated PDF's text layer
// back out of the Canvas PDF viewer. Create Invoice helpers are imported, never
// modified — `selectProduct` / `fillLineItem` in create-invoice-ui.ts collapse
// the grid to a single row, so row-scoped versions live here.

import { expect, request, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { DATAVERSE_URL, PRODUCT_TYPE } from './dataverse-fixtures';
import { resetOverviewViaDashboard, waitForOverviewSettled } from './invoice-overview-ui';

const ODATA_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  'Content-Type': 'application/json; charset=utf-8',
});

/** One rate per line item: whole, 1dp, 2dp, 3dp, 4dp. */
export const DECIMAL_RATES = ['2', '1.2', '1.21', '1.123', '1.1234'] as const;

/** Descriptions must stay digit-free so PDF number matching cannot hit them. */
export const DECIMAL_DESCRIPTIONS = [
  'Decimal check row one',
  'Decimal check row two',
  'Decimal check row three',
  'Decimal check row four',
  'Decimal check row five',
] as const;

/** PDF / Amount: always two decimals (round half away from zero via toFixed). */
export function expectedRateDisplay(rate: string): string {
  return Number(rate).toFixed(2);
}

/**
 * Editable Rate products whose catalog rate is blank/0, so the app leaves Rate
 * empty and editable. Products that carry a default rate are skipped on purpose.
 */
export async function listOpenRateProducts(token: string, limit = 8): Promise<string[]> {
  const api = await request.newContext();
  try {
    const filter = encodeURIComponent(
      `ittdev_productservicetype eq ${PRODUCT_TYPE.EditableRate} and statecode eq 0`
    );
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/dia_productserviceses?$filter=${filter}` +
        `&$select=dia_productservicename,dia_productservicerate&$orderby=dia_productservicename&$top=200`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) {
      console.log('Open-rate product query failed:', res.status(), (await res.text()).slice(0, 200));
      return [];
    }
    const rows: { dia_productservicename?: string; dia_productservicerate?: number | null }[] =
      (await res.json()).value ?? [];
    const names = rows
      .filter((r) => !r.dia_productservicerate)
      .map((r) => String(r.dia_productservicename ?? '').trim())
      .filter((n) => n.length > 0 && !/do not use|deferred|^default /i.test(n));
    return [...new Set(names)].slice(0, limit);
  } finally {
    await api.dispose();
  }
}

function descriptionInputs(appFrame: FrameLocator): Locator {
  return appFrame.getByPlaceholder('Enter description');
}

function lineItemRow(appFrame: FrameLocator, index: number): Locator {
  return appFrame
    .getByRole('listitem')
    .filter({ has: appFrame.getByPlaceholder('Enter description') })
    .nth(index);
}

export async function lineItemRowCount(appFrame: FrameLocator): Promise<number> {
  return descriptionInputs(appFrame).count();
}

export async function addLineItemRow(appFrame: FrameLocator): Promise<void> {
  const before = await lineItemRowCount(appFrame);
  await appFrame.getByRole('button', { name: 'Add new item' }).click();
  await expect
    .poll(async () => lineItemRowCount(appFrame), { timeout: 20000 })
    .toBeGreaterThan(before);
}

/**
 * Row-scoped input. Canvas galleries usually nest every control in the row
 * listitem; if that lookup comes up empty we fall back to DOM order (nth).
 */
async function rowInput(
  appFrame: FrameLocator,
  index: number,
  placeholder: string
): Promise<Locator> {
  const scoped = lineItemRow(appFrame, index).getByPlaceholder(placeholder, { exact: true });
  if ((await scoped.count()) === 1) return scoped;
  return appFrame.getByPlaceholder(placeholder, { exact: true }).nth(index);
}

/**
 * Product picker for one row. Rows are filled top-down, so the only remaining
 * "Find items" button belongs to the row being filled.
 */
export async function selectProductForRow(
  appFrame: FrameLocator,
  productName: string
): Promise<void> {
  const opener = appFrame.getByRole('button', { name: 'Find items' }).first();
  await expect(opener, 'No "Find items" button for the row being filled').toBeVisible({
    timeout: 20000,
  });
  await opener.click();
  const option = appFrame.getByRole('option', { name: productName, exact: true });
  await expect(option.first(), `Product "${productName}" missing from the picker`).toBeVisible({
    timeout: 20000,
  });
  await option.first().click();
  await expect(
    appFrame
      .getByRole('button', { name: `Selected: ${productName}`, exact: true })
      .or(appFrame.getByRole('button', { name: productName, exact: true }))
      .first()
  ).toBeVisible({ timeout: 20000 });
}

export type FilledRow = {
  index: number;
  product: string;
  description: string;
  qty: string;
  requestedRate: string;
  /** What the form actually kept — differs from requestedRate if the app truncates. */
  acceptedRate: string;
  /** Total the grid renders for the row (Qty x Rate), as displayed. */
  displayedTotal: string;
  rateEditable: boolean;
};

/** Last currency amount rendered in the row — the grid's Total cell. */
async function readRowTotal(appFrame: FrameLocator, index: number): Promise<string> {
  const text = await lineItemRow(appFrame, index)
    .innerText()
    .catch(() => '');
  const amounts = text.match(/[A-Z]{0,3}\$\s*[\d,]*\d(?:\.\d+)?/g) ?? [];
  const last = amounts[amounts.length - 1];
  return last ? last.replace(/[A-Z]{0,3}\$\s*/, '').replace(/,/g, '') : '';
}

export async function fillDecimalRow(
  page: Page,
  appFrame: FrameLocator,
  index: number,
  opts: { product: string; description: string; qty: string; rate: string }
): Promise<FilledRow> {
  await selectProductForRow(appFrame, opts.product);

  const description = await rowInput(appFrame, index, 'Enter description');
  await description.click();
  await description.fill(opts.description);

  const qty = await rowInput(appFrame, index, '0');
  await qty.click({ clickCount: 3 });
  await qty.fill(opts.qty);
  if ((await qty.inputValue()) !== opts.qty) {
    await qty.click({ clickCount: 3 });
    await qty.pressSequentially(opts.qty, { delay: 40 });
  }
  await page.keyboard.press('Tab');

  const rate = await rowInput(appFrame, index, '0.00');
  const rateEditable = await rate.isEditable().catch(() => false);
  if (rateEditable) {
    await rate.click({ clickCount: 3 });
    await rate.fill(opts.rate);
    if ((await rate.inputValue()) !== opts.rate) {
      await rate.click({ clickCount: 3 });
      await rate.pressSequentially(opts.rate, { delay: 40 });
    }
    await page.keyboard.press('Tab');
  }

  return {
    index,
    product: opts.product,
    description: opts.description,
    qty: (await qty.inputValue()).trim(),
    requestedRate: opts.rate,
    acceptedRate: (await rate.inputValue()).trim(),
    displayedTotal: await readRowTotal(appFrame, index),
    rateEditable,
  };
}

/**
 * After a flow, Overview keeps the old gallery (Pending / blank Next Step)
 * until the collection is re-queried. Search only filters that stale set —
 * it does not load the new status. Leave Overview via Dashboard, then search.
 */
export async function waitForRowNextStep(
  page: Page,
  appFrame: FrameLocator,
  opts: { invoiceNumber: string; searchTerm: string; timeoutMs?: number }
): Promise<Locator> {
  const deadline = Date.now() + (opts.timeoutMs ?? 480000);
  const row = () => appFrame.getByRole('listitem').filter({ hasText: opts.invoiceNumber }).first();
  const nextStep = () =>
    row().getByRole('button', { name: /^(Review|Approve|View|Edit)$/ }).first();
  const search = appFrame
    .getByPlaceholder('Search')
    .or(appFrame.getByRole('textbox', { name: 'Search' }))
    .first();

  let lastState = 'row not rendered';
  while (Date.now() < deadline) {
    await resetOverviewViaDashboard(page, appFrame);
    if ((await search.count()) > 0) {
      await search.fill(opts.searchTerm);
      await waitForOverviewSettled(appFrame).catch(() => undefined);
    }
    if (await row().isVisible().catch(() => false)) {
      if ((await nextStep().count()) > 0) {
        if (await nextStep().isEnabled().catch(() => false)) return nextStep();
        lastState = 'Next Step present but disabled';
      } else {
        lastState = 'Background Invoice Process Running';
      }
    } else {
      lastState = 'row not rendered';
    }
  }
  throw new Error(
    `Invoice ${opts.invoiceNumber} never offered an enabled Next Step button (last state: ${lastState})`
  );
}

const PDF_VIEWER_FRAME = /pdfViewer\/webViewPdfViewer\/viewer\/web\/viewer\.html/i;

/** Whitespace and thousands separators dropped so split PDF glyph runs re-join. */
export function normalizePdfText(text: string): string {
  return text.replace(/\s+/g, '').replace(/,/g, '');
}

/**
 * Qty / Rate / Amount for one line, anchored on its description so a value from
 * a neighbouring row can never satisfy the check.
 */
export function pdfRowValues(
  text: string,
  description: string
): { qty?: string; rate?: string; amount?: string } {
  const normalized = normalizePdfText(text);
  const key = normalizePdfText(description);
  const at = normalized.indexOf(key);
  if (at < 0) return {};
  const numbers = normalized.slice(at + key.length, at + key.length + 120).match(/\d+\.\d+/g) ?? [];
  return { qty: numbers[0], rate: numbers[1], amount: numbers[2] };
}

/** Close (X) on the View Invoice overlay — named control, not an offset click. */
export async function closeViewInvoiceOverlay(appFrame: FrameLocator): Promise<void> {
  const close = appFrame.locator('[data-control-name="icn_closeViewInvoiceInvoiceOverview"]');
  if ((await close.count()) === 0) return;
  await close.first().click({ force: true });
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({ timeout: 30000 });
}

/** Every decimal number in the PDF text layer, e.g. 1.1234, 6.6564, 1200.00. */
export function decimalTokens(text: string): string[] {
  return normalizePdfText(text).match(/\d+\.\d+/g) ?? [];
}

export function hasExactValue(tokens: string[], value: number): boolean {
  return tokens.some((t) => Number(t) === value);
}

/** Tokens that round to the same 2dp value — used to explain a miss. */
export function nearTokens(tokens: string[], value: number): string[] {
  return [...new Set(tokens.filter((t) => Math.abs(Number(t) - value) < 0.05))];
}

/**
 * Text layer of the Canvas PDF viewer (PDF.js). Scrolls the viewer so lazily
 * rendered pages contribute their text too, and can wait for expected content.
 */
export async function readPdfViewerText(
  page: Page,
  opts: { contains?: RegExp; timeoutMs?: number } = {}
): Promise<string> {
  const deadline = Date.now() + (opts.timeoutMs ?? 120000);
  let text = '';
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => PDF_VIEWER_FRAME.test(f.url()));
    if (frame) {
      const chunks: string[] = [];
      let lastTop = -1;
      for (let i = 0; i < 20; i++) {
        chunks.push(await frame.evaluate(() => document.body?.innerText ?? '').catch(() => ''));
        const top = await frame
          .evaluate(() => {
            const container = document.getElementById('viewerContainer');
            if (!container) return -1;
            container.scrollTop += Math.max(400, container.clientHeight * 0.8);
            return container.scrollTop;
          })
          .catch(() => -1);
        if (top < 0 || top === lastTop) break;
        lastTop = top;
        await page.waitForTimeout(700);
      }
      text = chunks.join('\n');
      if (!opts.contains || opts.contains.test(normalizePdfText(text))) return text;
    }
    await page.waitForTimeout(2000);
  }
  return text;
}

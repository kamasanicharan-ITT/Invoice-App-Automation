import { expect, type Page, type FrameLocator, type Locator, type TestInfo } from '@playwright/test';
import { APP_URL } from '../../config/env';
import { dismissHostDialogs, dismissHostDialogsSettling } from './host-dialogs';

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

  await expect
    .poll(
      async () => {
        const invoiceCount = await appFrame.getByText(INVOICE_NUMBER).count();
        const itemCount = await appFrame.getByText(/^Item\s*\d+/).count();
        if (invoiceCount > 0 || itemCount > 0) return 'rows';
        const emptyVisible = await appFrame
          .getByText('No Item to Display', { exact: true })
          .isVisible()
          .catch(() => false);
        return emptyVisible ? 'empty' : '';
      },
      { timeout: 45000 }
    )
    .not.toBe('');

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

export async function waitForOverviewSettled(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Show Invoices', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect
    .poll(
      async () => {
        const invoiceCount = await appFrame.getByText(INVOICE_NUMBER).count();
        const itemCount = await appFrame.getByText(/^Item\s*\d+/).count();
        if (invoiceCount > 0 || itemCount > 0) return 'rows';
        const emptyVisible = await appFrame
          .getByText('No Item to Display', { exact: true })
          .isVisible()
          .catch(() => false);
        return emptyVisible ? 'empty' : '';
      },
      { timeout: 30000 }
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

const NOISE =
  /^(Item\s*\d+|Selected\.|Review|Approve|Edit|Report|View|Draft|Submitted|Reviewed|Approved|Flagged|Cancelled|Sent|Fail-.+|SYSTEM|Next Step)$/i;

export async function firstRowPartnerAndProject(
  appFrame: FrameLocator
): Promise<{ partner: string; project: string }> {
  const item = appFrame.getByRole('listitem').first();
  await expect(item).toBeVisible({ timeout: 15000 });
  const raw = ((await item.innerText()) || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const useful = raw.filter((s) => !NOISE.test(s) && !INVOICE_NUMBER.test(s) && s.length > 1);
  return { partner: useful[0] ?? '', project: useful[1] ?? '' };
}

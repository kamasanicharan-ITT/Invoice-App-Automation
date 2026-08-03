import { expect, type Page } from '@playwright/test';

/**
 * Dismiss intermittent Power Apps *host* dialogs that sit outside (or over) the
 * Canvas iframe and block Dashboard / Overview / Create Invoice.
 *
 * Covers:
 * 1. Consent: "Allow Invoice Application to access your data?" → click **Allow**
 * 2. Connector / Office365Users host alerts → click **Close**
 *
 * Safe to call repeatedly (no-op when nothing is open). Prefer calling after
 * `goto` / `reload` and once more if the app looks stuck on load.
 */
export async function dismissHostDialogs(page: Page): Promise<void> {
  await dismissConsentDialog(page);
  await dismissHostAlerts(page);
}

/** Power Apps play-host consent modal (intermittent after session / connection refresh). */
async function dismissConsentDialog(page: Page): Promise<void> {
  const consentTitle = page.getByText(/Allow .+ to access your data\?/i);
  const allowBtn = page
    .getByRole('button', { name: 'Allow', exact: true })
    .or(page.getByRole('dialog').getByRole('button', { name: 'Allow', exact: true }));

  // Host-level first (most common — overlays the play shell)
  if (await consentTitle.isVisible().catch(() => false)) {
    await allowBtn.first().click({ timeout: 10000 });
    await expect(consentTitle).toBeHidden({ timeout: 30000 }).catch(() => undefined);
    return;
  }

  // Rare: consent rendered inside the app iframe
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  const frameTitle = appFrame.getByText(/Allow .+ to access your data\?/i);
  if (await frameTitle.isVisible().catch(() => false)) {
    await appFrame.getByRole('button', { name: 'Allow', exact: true }).click({ timeout: 10000 });
    await expect(frameTitle).toBeHidden({ timeout: 30000 }).catch(() => undefined);
  }
}

/** Pink/host `[role=alert]` banners (e.g. Office365Users.UserProfile 404). */
async function dismissHostAlerts(page: Page): Promise<void> {
  const hostAlertClose = page.locator('[role="alert"]').getByRole('button', { name: 'Close' });
  for (let i = 0; i < 3; i++) {
    if (!(await hostAlertClose.isVisible().catch(() => false))) break;
    await hostAlertClose.click().catch(() => undefined);
  }
}

/**
 * Brief poll for consent that appears a beat after navigate (connections refresh).
 * Uses expect.poll — no waitForTimeout.
 */
export async function dismissHostDialogsSettling(
  page: Page,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  await expect
    .poll(
      async () => {
        await dismissHostDialogs(page);
        const stillOpen = await page
          .getByText(/Allow .+ to access your data\?/i)
          .isVisible()
          .catch(() => false);
        return !stillOpen;
      },
      { timeout: timeoutMs, intervals: [250, 500, 1000, 2000] }
    )
    .toBeTruthy()
    .catch(() => undefined);

  // Final pass for alerts that appeared after consent closed
  await dismissHostDialogs(page);
}

import { expect, type Page } from '@playwright/test';
import { APP_URL, env } from '../../config/env';
import { dismissHostDialogs } from './host-dialogs';

/**
 * Thrown when the Invoice Canvas never becomes reachable because the saved
 * Playwright storageState is expired / missing, or Microsoft Sign in is shown.
 *
 * Throw this from `test.beforeAll` so remaining tests in that describe are
 * skipped instead of each timing out on login.
 */
export class SessionExpiredError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SessionExpiredError';
  }
}

const LOGIN_HOST =
  /login\.microsoftonline\.com|login\.windows\.net|login\.live\.com|login\.microsoft\.com/i;

/** Sticky for this worker so config `retries: 1` does not open Sign in twice. */
let stickySessionError: SessionExpiredError | undefined;

/**
 * One navigation: prove this project's storageState can open the Invoice app.
 * Detection only — never fills Sign in (auth is recaptured via storageState).
 *
 * Call from a screen `test.beforeAll` (Dashboard first; same helper later on
 * Create Invoice / Overview). Works for a full spec, `--grep` group, or one case
 * because Playwright still runs the describe hook when any test is scheduled.
 */
export async function assertAppSession(page: Page): Promise<void> {
  if (stickySessionError) {
    throw stickySessionError;
  }

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await dismissHostDialogs(page);

  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  // Landing is Dashboard; nav labels exist on every screen — reuse this helper later.
  const appReady = appFrame
    .getByText('Dashboard', { exact: true })
    .or(appFrame.getByRole('button', { name: 'Dashboard' }))
    .or(appFrame.getByRole('button', { name: 'Invoice Overview' }))
    .or(appFrame.getByRole('button', { name: 'Create Invoice' }));

  // Poll until ready or expired — do not wait the full timeout after Sign in.
  let outcome: 'pending' | 'ready' | 'expired' = 'pending';
  try {
    await expect
      .poll(
        async () => {
          await dismissHostDialogs(page);
          if (await hostShowsMicrosoftSignIn(page)) {
            outcome = 'expired';
            return true;
          }
          if (await appReady.first().isVisible().catch(() => false)) {
            outcome = 'ready';
            return true;
          }
          return false;
        },
        { timeout: 30000, intervals: [250, 500, 1000, 2000] },
      )
      .toBeTruthy();
  } catch (cause) {
    if (await hostShowsMicrosoftSignIn(page)) {
      throw failSession(
        page,
        'Microsoft Sign in is shown — saved session is expired or invalid.',
      );
    }
    throw failSession(
      page,
      'Invoice app did not become accessible (no Canvas Dashboard/nav).',
      cause,
    );
  }

  if (outcome === 'expired') {
    throw failSession(
      page,
      'Microsoft Sign in is shown — saved session is expired or invalid.',
    );
  }
}

function failSession(page: Page, reason: string, cause?: unknown): SessionExpiredError {
  const recapture = `Recapture storageState (auth/${env.name}/admin.json or pm.json) and re-run. Remaining tests in this screen will not run.`;
  const message = `${reason} URL: ${page.url()}. ${recapture}`;
  stickySessionError =
    cause instanceof Error
      ? new SessionExpiredError(message, { cause })
      : new SessionExpiredError(message);
  return stickySessionError;
}

/**
 * Power Apps often stays on the play URL and shows a host overlay
 * ("Sign in is required" + Sign in button) instead of redirecting to
 * login.microsoftonline.com. Detect both.
 */
async function hostShowsMicrosoftSignIn(page: Page): Promise<boolean> {
  if (LOGIN_HOST.test(page.url())) {
    return true;
  }

  const markers = [
    page.getByText(/sign in is required/i),
    page.getByText(/please select sign in to continue/i),
    page.getByRole('button', { name: /^sign in$/i }),
    page.getByRole('heading', { name: /sign in/i }),
    page.getByPlaceholder(/email, phone, or Skype/i),
    page.getByText('Pick an account', { exact: true }),
  ];

  for (const loc of markers) {
    if (await loc.first().isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

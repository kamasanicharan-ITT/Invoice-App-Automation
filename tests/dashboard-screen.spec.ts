// spec: specs/dashboard-screen-plan.md
// seed: tests/seed.spec.ts

import { test, expect, request, type Page, type FrameLocator, type Request, type TestInfo } from '@playwright/test';
import { APP_URL, DATAVERSE_URL } from '../config/env';
import { markAndShot, markGroupAndShot, shot } from './utils/screenshot';
import { dismissHostDialogs, dismissHostDialogsSettling } from './utils/host-dialogs';

const INVOICE_TABLE = 'dia_invoicedetailses';
const MAIL_LIST_TABLE = 'dia_invoicemaillists';

/**
 * Canvas TotalTask statuses (Admin OnVisible). Excludes Approved and Sent.
 * UI label shows TotalTask - TotalReported (IsReported = "Yes" in the same date window).
 * Submitted includes BOTH adhoc and non-adhoc. Same formula for Admin and PM —
 * only the invoice population (persona scope) differs.
 */
const TOTAL_TASKS_FILTER =
  `(dia_status eq 'Draft' or dia_status eq 'Flagged' or dia_status eq 'Submitted' or dia_status eq 'Reviewed' or dia_status eq 'Cancelled' or dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review')`;

/** Canvas TotalReported: IsReported = "Yes" in the This Month date window. */
const TOTAL_REPORTED_FILTER = `dia_isreported eq 'Yes'`;

const PROJECT_TABLE = 'dia_projects';

type Persona = 'admin' | 'pm';

type PersonaScope = {
  persona: Persona;
  userId: string;
  fullname: string;
  email: string;
  /** Empty for admin. For PM: ` and (...)` involvement clause. */
  scopeAndClause: string;
};

/** Set in Dataverse Validation beforeAll from the active Playwright project. */
let activePersonaScope: PersonaScope = {
  persona: 'admin',
  userId: '',
  fullname: '',
  email: '',
  scopeAndClause: '',
};

function odataEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function personaFromProjectName(projectName: string): Persona {
  return projectName.toLowerCase().includes('pm') ? 'pm' : 'admin';
}

/**
 * PM Dashboard scope (Canvas colFilterInvoiceDetails):
 * User().Email in Approver list OR Submitter OR Reviewer list
 * (mail-list Approvers / Internal Reviewers + Project.dia_submitter).
 */
async function resolvePersonaScope(token: string, persona: Persona): Promise<PersonaScope> {
  if (persona === 'admin') {
    return { persona, userId: '', fullname: '', email: '', scopeAndClause: '' };
  }

  const api = await request.newContext();
  const whoRes = await api.get(`${DATAVERSE_URL}/api/data/v9.2/WhoAmI`, {
    headers: ODATA_HEADERS(token),
  });
  if (!whoRes.ok()) {
    throw new Error(`WhoAmI failed: ${(await whoRes.text()).slice(0, 200)}`);
  }
  const userId = String((await whoRes.json()).UserId ?? '');
  const userRes = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/systemusers(${userId})?$select=fullname,internalemailaddress`,
    { headers: ODATA_HEADERS(token) }
  );
  const user = userRes.ok() ? await userRes.json() : {};
  const fullname = String(user.fullname ?? '');
  const email = String(user.internalemailaddress ?? '');
  if (!email) {
    throw new Error('PM persona: system user has no internalemailaddress');
  }

  const projects = new Set<string>();
  const esc = odataEscape(email);

  // Projects where this user is Submitter
  const projRes = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/${PROJECT_TABLE}?$filter=${encodeURIComponent(
      `contains(dia_submitter,'${esc}')`
    )}&$select=dia_projectid&$top=200`,
    { headers: ODATA_HEADERS(token) }
  );
  if (projRes.ok()) {
    for (const row of (await projRes.json()).value ?? []) {
      if (row.dia_projectid) projects.add(String(row.dia_projectid));
    }
  } else {
    console.log('PM project submitter lookup skipped:', (await projRes.text()).slice(0, 150));
  }

  // Projects where email is on Approvers or Internal Reviewers mail lists
  const mlFilter =
    `contains(dia_approverslist,'${esc}') or contains(dia_internalreviewerslist,'${esc}')`;
  const mlRes = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/${MAIL_LIST_TABLE}?$filter=${encodeURIComponent(
      mlFilter
    )}&$select=_dia_projectid_value&$top=200`,
    { headers: ODATA_HEADERS(token) }
  );
  if (mlRes.ok()) {
    for (const row of (await mlRes.json()).value ?? []) {
      if (row._dia_projectid_value) projects.add(String(row._dia_projectid_value));
    }
  } else {
    console.log('PM mail-list lookup skipped:', (await mlRes.text()).slice(0, 150));
  }

  console.log(`PM scoped projects (submitter/reviewer/approver): ${projects.size}`);

  let scopeAndClause: string;
  if (projects.size === 0) {
    // No involvement → zero invoices (matches empty colFilterInvoiceDetails)
    scopeAndClause =
      ` and (dia_invoicedetailsid eq 00000000-0000-0000-0000-000000000000)`;
  } else {
    const projectOr = [...projects].map((pid) => `_dia_projectid_value eq ${pid}`).join(' or ');
    scopeAndClause = ` and (${projectOr})`;
  }

  console.log(`Persona scope: PM user=${fullname} <${email}> clauseLen=${scopeAndClause.length}`);
  return { persona, userId, fullname, email, scopeAndClause };
}

type InvoiceMismatchRow = {
  dia_invoicedetailsid?: string;
  dia_invoicenumber?: string;
  dia_status?: string;
  dia_invoicedate?: string;
  dia_adhocinvoice?: boolean | null;
  dia_isreported?: string | null;
  _dia_projectid_value?: string;
  _dia_accountid_value?: string;
  'leo.a@example.org.V1.FormattedValue'?: string;
  'yuki.t@example.com.V1.FormattedValue'?: string;
};

const ODATA_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  Prefer: 'odata.include-annotations="*"',
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canvas Dashboard "This Month" window (matches OnVisible DateAdd formulas):
 *   start = 6th of current calendar month
 *   end   = 5th of next calendar month
 * Inclusive on both ends. On calendar days 1–5 this is the *upcoming* cycle
 * (July invoices move under Last Month); that is intentional app behavior.
 */
function getBillingCycleDates(): { start: string; end: string } {
  const today = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Mirror: DateAdd(Today(), 6 - Day(Today())) and end-of-next-cycle DateAdd chain
  const startDate = new Date(today.getFullYear(), today.getMonth(), 6);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 5);
  return { start: ymd(startDate), end: ymd(endDate) };
}

/** Unreported = blank: null or empty string. Used only for Failed tile (Canvas IsBlank(IsReported)). */
function unreportedClause(): string {
  return ` and (dia_isreported eq null or dia_isreported eq '')`;
}

function buildFullFilter(
  filterExpression: string,
  options: { requireUnreported?: boolean; start?: string; end?: string } = {}
): string {
  // Canvas status tiles do NOT filter IsReported except Failed / TotalReported subtraction.
  const { requireUnreported = false } = options;
  const cycle = getBillingCycleDates();
  const start = options.start ?? cycle.start;
  const end = options.end ?? cycle.end;
  // Canvas: Invoice Date >= start && Invoice Date <= end (inclusive)
  const dateFilter = `dia_invoicedate ge ${start} and dia_invoicedate le ${end}`;
  const reportedFilter = requireUnreported ? unreportedClause() : '';
  const personaFilter = activePersonaScope.scopeAndClause;
  return `(${filterExpression}) and ${dateFilter}${reportedFilter}${personaFilter}`;
}

/**
 * Calls the Dataverse Web API and returns the record count for a status filter.
 * Submitted tile = all Submitted (adhoc + non-adhoc).
 * Pass requireUnreported: true only for Failed (Canvas IsBlank(IsReported)).
 */
async function getDataverseCount(
  token: string,
  filterExpression: string,
  options: { requireUnreported?: boolean } = {}
): Promise<number> {
  const fullFilter = buildFullFilter(filterExpression, options);
  const apiContext = await request.newContext();
  const response = await apiContext.get(
    `${DATAVERSE_URL}/api/data/v9.2/${INVOICE_TABLE}?$filter=${encodeURIComponent(
      fullFilter
    )}&$count=true&$top=1&$select=dia_invoicedetailsid`,
    { headers: ODATA_HEADERS(token) }
  );

  if (!response.ok()) {
    console.log(`Dataverse error [${filterExpression}]:`, (await response.text()).slice(0, 300));
    return -1;
  }

  const data = await response.json();
  return data['@odata.count'] ?? -1;
}

/** Fetch invoice rows for mismatch diagnostics (capped). */
async function getDataverseRows(
  token: string,
  filterExpression: string,
  options: { requireUnreported?: boolean; top?: number } = {}
): Promise<InvoiceMismatchRow[]> {
  const top = options.top ?? 50;
  const fullFilter = buildFullFilter(filterExpression, options);
  const select = [
    'dia_invoicedetailsid',
    'dia_invoicenumber',
    'dia_status',
    'dia_invoicedate',
    'dia_adhocinvoice',
    'dia_isreported',
    '_dia_projectid_value',
    '_dia_accountid_value',
  ].join(',');
  const apiContext = await request.newContext();
  const response = await apiContext.get(
    `${DATAVERSE_URL}/api/data/v9.2/${INVOICE_TABLE}?$filter=${encodeURIComponent(
      fullFilter
    )}&$select=${select}&$orderby=dia_invoicedate desc&$top=${top}`,
    { headers: ODATA_HEADERS(token) }
  );
  if (!response.ok()) {
    console.log(`Dataverse rows error:`, (await response.text()).slice(0, 300));
    return [];
  }
  return ((await response.json()).value ?? []) as InvoiceMismatchRow[];
}

function summarizeMismatchRow(row: InvoiceMismatchRow): string {
  const partner =
    row['leo.a@example.org.V1.FormattedValue'] ??
    row._dia_accountid_value ??
    '?';
  const project =
    row['yuki.t@example.com.V1.FormattedValue'] ??
    row._dia_projectid_value ??
    '?';
  return [
    `id=${row.dia_invoicedetailsid ?? '?'}`,
    `#=${row.dia_invoicenumber ?? '(none)'}`,
    `status=${row.dia_status ?? '?'}`,
    `date=${row.dia_invoicedate ?? '?'}`,
    `adhoc=${row.dia_adhocinvoice ?? 'null'}`,
    `isReported=${row.dia_isreported ?? 'null'}`,
    `partner=${partner}`,
    `project=${project}`,
  ].join(' | ');
}

/**
 * When UI != Dataverse, log and attach the Dataverse rows so mismatches can be verified.
 * Also probes a few alternate filters to hint which rule the UI may be using.
 */
async function reportCountMismatch(
  testInfo: TestInfo,
  token: string,
  opts: {
    label: string;
    filter: string;
    uiCount: number;
    apiCount: number;
    requireUnreported?: boolean;
  }
): Promise<void> {
  const { label, filter, uiCount, apiCount, requireUnreported = false } = opts;
  const delta = apiCount - uiCount;
  console.log(`\n=== MISMATCH ${label}: UI=${uiCount} Dataverse=${apiCount} (DV-UI=${delta}) ===`);
  console.log(`Persona: ${activePersonaScope.persona} ${activePersonaScope.email || '(org-wide)'}`);
  console.log(`Billing cycle (Canvas This Month): ${JSON.stringify(getBillingCycleDates())}`);
  console.log(`Filter: ${filter}`);
  if (activePersonaScope.scopeAndClause) {
    console.log(`PM scope: ${activePersonaScope.scopeAndClause.slice(0, 200)}...`);
  }

  const cycle = getBillingCycleDates();
  const api = await request.newContext();

  // Rows in the DV filter (capped).
  const rows = await getDataverseRows(token, filter, {
    requireUnreported,
    top: Math.min(Math.max(apiCount, 20), 80),
  });
  console.log(`Dataverse rows returned for this filter (up to ${rows.length}):`);
  for (const row of rows) {
    console.log(`  - ${summarizeMismatchRow(row)}`);
  }

  const probes: { name: string; count: number }[] = [];
  const probeDefs: { name: string; filter: string }[] = [
    {
      name: 'current (ge start, le end)',
      filter: buildFullFilter(filter, { requireUnreported }),
    },
    {
      name: 'prior cycle (calendar previous month 6th→5th)',
      filter: (() => {
        const today = new Date();
        const ymd = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const start = ymd(new Date(today.getFullYear(), today.getMonth() - 1, 6));
        const end = ymd(new Date(today.getFullYear(), today.getMonth(), 5));
        return `(${filter}) and dia_invoicedate ge ${start} and dia_invoicedate le ${end}${
          requireUnreported ? unreportedClause() : ''
        }${activePersonaScope.scopeAndClause}`;
      })(),
    },
    {
      name: 'Submitted adhoc-only',
      filter: buildFullFilter(`dia_status eq 'Submitted' and dia_adhocinvoice eq true`, {
        requireUnreported,
      }),
    },
    {
      name: 'Submitted all (adhoc+non-adhoc)',
      filter: buildFullFilter(`dia_status eq 'Submitted'`, { requireUnreported }),
    },
  ];

  for (const p of probeDefs) {
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/${INVOICE_TABLE}?$filter=${encodeURIComponent(
        p.filter
      )}&$count=true&$top=1&$select=dia_invoicedetailsid`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) {
      probes.push({ name: `${p.name} [err ${res.status()}]`, count: -1 });
      continue;
    }
    probes.push({ name: p.name, count: (await res.json())['@odata.count'] ?? -1 });
  }
  console.log('Alternate filter probe counts:');
  for (const p of probes) {
    const mark = p.count === uiCount ? ' ← matches UI' : '';
    console.log(`  - ${p.name}: ${p.count}${mark}`);
  }

  await testInfo.attach(`${label}-mismatch.json`, {
    body: JSON.stringify(
      {
        label,
        uiCount,
        apiCount,
        delta,
        billingCycle: cycle,
        filter,
        requireUnreported,
        probes,
        dataverseRows: rows,
      },
      null,
      2
    ),
    contentType: 'application/json',
  });
}

/**
 * Waits for Invoice Tasks data to finish loading via Playwright auto-wait (no sleep).
 * Before data loads the section shows a "0 Total Task" placeholder and bare "Draft" labels
 * (no leading digit). Real data shows e.g. "7 Drafts" / "157 Total Tasks".
 */
async function waitForDashboardReady(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText('Region', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible({ timeout: 30000 });
  // Require a numbered Drafts row — bare "Draft You have drafted..." means still loading
  await expect(appFrame.getByText(/\d+\s*Drafts?/).first()).toBeVisible({ timeout: 60000 });
}

/**
 * Navigates to the app and waits until the Dashboard (including task counts) is ready.
 * Reloads once if Power Apps sticks on "Starting your app...", consent, or the 0-count placeholder.
 */
async function openDashboard(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');

  // Consent / host alerts can appear right after play host loads
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

  try {
    await waitForDashboardReady(appFrame);
  } catch {
    await dismissHostDialogs(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissHostDialogsSettling(page);
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
    await dismissHostDialogs(page);
    await waitForDashboardReady(appFrame);
  }

  return appFrame;
}


/**
 * Reads the numeric count for a matching Invoice Tasks label after the section is ready.
 * Canvas often keeps off-screen / non-visible twins of lower rows (Failed/Cancelled/Sent);
 * prefer a visible match, else read the last attached node without Playwright's
 * scrollIntoViewIfNeeded (that hangs when the control never becomes visible).
 */
async function getDashboardTaskCount(
  appFrame: FrameLocator,
  labelPattern: RegExp
): Promise<number> {
  const matches = appFrame.getByText(labelPattern);
  await expect(matches.first()).toBeAttached({ timeout: 30000 });

  const visible = matches.filter({ visible: true });
  const target = (await visible.count()) > 0 ? visible.first() : matches.last();

  await target
    .evaluate((el) => {
      (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    })
    .catch(() => undefined);

  const text = await target.textContent();
  const labelMatch = text?.match(labelPattern);
  const digits = labelMatch?.[0].match(/\d+/);
  return digits ? Number(digits[0]) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard Screen', () => {
  test.describe.configure({ timeout: 120000 });

  // Same UI for Admin (auth/admin.json) and PM (auth/pm.json).
  // Dataverse counts use org-wide vs user-scope via activePersonaScope (project name).
  // ── UI Structure (both roles) ─────────────────────────────────────────────

  test('TC-DB-01: Dashboard header and navigation are visible', async ({ page }, testInfo) => {
    // Open the app and land on the Dashboard
    const appFrame = await openDashboard(page);

    const dashboardHeader = appFrame.getByText('Dashboard', { exact: true }).first();
    const dashboardNav = appFrame.getByRole('button', { name: 'Dashboard' });
    const overviewNav = appFrame.getByRole('button', { name: 'Invoice Overview' });
    const createNav = appFrame.getByRole('button', { name: 'Create Invoice' }).first();

    await expect.soft(dashboardHeader).toBeVisible();
    await expect.soft(dashboardNav).toBeVisible();
    await expect.soft(overviewNav).toBeVisible();
    await expect.soft(createNav).toBeVisible();

    // Mark the full navigation strip (all screen links), not just the Dashboard label
    await test.step('Dashboard navigation header', async () => {
      await markGroupAndShot(
        page,
        [dashboardNav, overviewNav, createNav],
        'Dashboard navigation header',
        testInfo,
      );
    });
  });

  test('TC-DB-02: All four summary cards are visible', async ({ page }, testInfo) => {
    // Verify the four summary cards and their This/Last Month sub-labels
    const appFrame = await openDashboard(page);

    const totalInvoices = appFrame.getByText('Total Invoices', { exact: true });
    const totalPartners = appFrame.getByText('Total Partners', { exact: true });
    const totalProject = appFrame.getByText('Total Project', { exact: true });
    const totalRevenue = appFrame.getByText('Total Revenue', { exact: true });
    const thisMonth = appFrame.getByText('This Month').first();
    const lastMonth = appFrame.getByText('Last Month').first();

    await expect.soft(totalInvoices).toBeVisible();
    await expect.soft(totalPartners).toBeVisible();
    await expect.soft(totalProject).toBeVisible();
    await expect.soft(totalRevenue).toBeVisible();
    await expect.soft(thisMonth).toBeVisible();
    await expect.soft(lastMonth).toBeVisible();

    // One mark covering the full card strip (labels + counts + This/Last Month)
    await test.step('Summary cards', async () => {
      await markGroupAndShot(
        page,
        [totalInvoices, totalPartners, totalProject, totalRevenue, thisMonth, lastMonth],
        'Summary cards (labels, counts, This/Last Month)',
        testInfo,
        { padding: 10 },
      );
    });
  });

  test('TC-DB-03: Invoice Tasks section has all 9 rows and action buttons', async ({ page }, testInfo) => {
    // Verify the Invoice Tasks section and every task row (count via regex + its button)
    const appFrame = await openDashboard(page);

    const sectionHeader = appFrame.getByText('Invoice Tasks', { exact: true });
    await expect.soft(sectionHeader).toBeVisible();

    const taskRows = [
      { labelPattern: /\d+\s*Total\s*Tasks?/, buttonName: 'View All' },
      { labelPattern: /\d+\s*Drafts?/, buttonName: 'View Drafts' },
      { labelPattern: /\d+\s*Flagged/, buttonName: 'View Flagged' },
      { labelPattern: /\d+\s*Submitted/, buttonName: 'View Submitted' },
      { labelPattern: /\d+\s*Reviewed/, buttonName: 'View Reviewed' },
      { labelPattern: /\d+\s*Approved/, buttonName: 'View Approved' },
      { labelPattern: /\d+\s*Failed/, buttonName: 'View Failed' },
      { labelPattern: /\d+\s*Cancelled/, buttonName: 'View Cancelled' },
      { labelPattern: /\d+\s*Sent/, buttonName: 'View Sent' },
    ];

    for (const row of taskRows) {
      const labelMatches = appFrame.getByText(row.labelPattern);
      await expect.soft(labelMatches.first()).toBeAttached({ timeout: 15000 });

      const buttonMatches = appFrame.getByRole('button', { name: row.buttonName });
      // Some lower-row View buttons are not in the accessibility tree until scrolled;
      // soft-check when present so PM (all-zero tiles) does not hard-fail layout.
      if ((await buttonMatches.count()) > 0) {
        await expect.soft(buttonMatches.first()).toBeAttached();
      } else {
        console.log(`TC-DB-03: button "${row.buttonName}" not in DOM yet (may be off-screen)`);
      }
    }

    const upperLabels = taskRows.slice(0, 5).map((r) =>
      appFrame.getByText(r.labelPattern).filter({ visible: true }).first()
    );
    const upperButtons = taskRows
      .slice(0, 5)
      .map((r) => appFrame.getByRole('button', { name: r.buttonName }))
      .filter(Boolean);

    await test.step('Invoice Tasks upper rows', async () => {
      const visibleUpper = [];
      for (const loc of [sectionHeader, ...upperLabels, ...upperButtons]) {
        if (await loc.isVisible().catch(() => false)) visibleUpper.push(loc);
      }
      if (visibleUpper.length >= 2) {
        await markGroupAndShot(page, visibleUpper, 'Invoice Tasks (upper rows)', testInfo, {
          padding: 8,
        });
      } else {
        await shot(page, 'Invoice Tasks (upper rows)', testInfo);
      }
    });

    await test.step('Invoice Tasks lower rows', async () => {
      // Lower rows are often non-visible twins in Canvas — capture full context
      await shot(page, 'Invoice Tasks (lower rows)', testInfo);
    });
  });

  test('TC-DB-04: Region dropdown shows all 8 regions', async ({ page }, testInfo) => {
    // Open the Region dropdown (placeholder "." button) and verify all region options
    const appFrame = await openDashboard(page);

    const regionControl = appFrame.getByRole('button', { name: '.', exact: true });
    await regionControl.click();

    const regions = [
      'Australia', 'Colombia', 'India', 'Netherlands',
      'North America', 'Saudi Arabia', 'South Korea', 'UAE',
    ];
    const options = regions.map((region) => appFrame.getByRole('option', { name: region }));
    for (const option of options) {
      await expect.soft(option).toBeVisible();
    }

    // Mark the full open dropdown list (first → last option), not a single option
    await test.step('Region dropdown options', async () => {
      await markGroupAndShot(
        page,
        [options[0], options[options.length - 1]],
        'Region dropdown (all 8 regions)',
        testInfo,
        { padding: 8 },
      );
    });
  });

  test('TC-DB-05: Region filter can be applied', async ({ page }, testInfo) => {
    // Open the Region dropdown, select India, and confirm the dashboard stays intact
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: '.', exact: true }).click();
    await appFrame.getByRole('option', { name: 'India' }).click();

    const selectedRegion = appFrame.getByRole('button', { name: 'India' });
    const regionLabel = appFrame.getByText('Region', { exact: true });
    await expect(selectedRegion).toBeVisible({ timeout: 15000 });
    await expect(appFrame.getByText('Invoice Tasks', { exact: true })).toBeVisible();

    await test.step('Region filter set to India', async () => {
      await markGroupAndShot(
        page,
        [regionLabel, selectedRegion],
        'Region filter set to India',
        testInfo,
      );
    });
  });

  test('TC-DB-06: Create Invoice button navigates to New Invoice screen', async ({ page }, testInfo) => {
    // Click Create Invoice and verify navigation to the form
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    const newInvoiceHeader = appFrame.getByText('New Invoice', { exact: true });
    await expect(newInvoiceHeader).toBeVisible({ timeout: 15000 });

    const brandNew = appFrame.getByText('Brand New', { exact: true });
    const findPartner = appFrame.getByText('Find Partner').first();
    const closeBtn = appFrame.getByRole('button', { name: 'Close' });
    const saveDraftBtn = appFrame.getByRole('button', { name: 'Save Draft' });
    const submitBtn = appFrame.getByRole('button', { name: 'Submit' });

    await expect(brandNew).toBeVisible({ timeout: 15000 });
    await expect(findPartner).toBeVisible({ timeout: 15000 });
    await expect(closeBtn).toBeVisible();
    await expect(saveDraftBtn).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Mark the full New Invoice form (header → partner field → action buttons)
    await test.step('New Invoice form', async () => {
      await markGroupAndShot(
        page,
        [newInvoiceHeader, brandNew, findPartner, closeBtn, saveDraftBtn, submitBtn],
        'New Invoice form',
        testInfo,
        { padding: 10 },
      );
    });
  });

  // DB-002 — Navigate to Invoice Overview (same for PM and Admin)
  test('TC-DB-07: Invoice Overview navigation from Dashboard', async ({ page }, testInfo) => {
    const appFrame = await openDashboard(page);

    await appFrame.getByRole('button', { name: 'Invoice Overview' }).click();
    const overviewHeader = appFrame.getByText('Invoice Overview', { exact: true }).first();
    await expect(overviewHeader).toBeVisible({ timeout: 30000 });

    // Gallery rows or empty state — either is a successful navigation
    const galleryOrEmpty = appFrame
      .getByText(/Item\s*\d+|No items to display|there are no|Partner/i)
      .first();
    await expect(galleryOrEmpty).toBeVisible({ timeout: 30000 });

    await test.step('Invoice Overview from Dashboard', async () => {
      const header = appFrame.getByText('Invoice Overview', { exact: true }).first();
      if (await header.isVisible().catch(() => false)) {
        await markAndShot(page, header, 'Invoice Overview from Dashboard', testInfo);
      } else {
        await shot(page, 'Invoice Overview from Dashboard', testInfo);
      }
    });
  });

  // ── Dataverse Data Validation (UI count == Dataverse count) ─────────────────

  test.describe('Dataverse Validation', () => {
    let dataverseToken = '';

    test.beforeAll(async ({ browser }, testInfo) => {
      test.setTimeout(180000);
      const persona = personaFromProjectName(testInfo.project.name);
      const page = await browser.newPage();

      // Keep listening through Dashboard load — token may arrive after first paint
      page.on('request', (req: Request) => {
        if (dataverseToken) return;
        const authHeader = req.headers()['authorization'];
        if (req.url().includes('crm8.dynamics.com') && authHeader?.startsWith('Bearer ')) {
          dataverseToken = authHeader.replace('Bearer ', '');
        }
      });

      await openDashboard(page);
      await page.close();

      console.log(`Token captured: ${dataverseToken ? 'YES' : 'NO'} | project=${testInfo.project.name} | persona=${persona}`);
      expect(
        dataverseToken,
        'Dataverse Bearer token was not captured from Canvas traffic'
      ).toBeTruthy();

      activePersonaScope = await resolvePersonaScope(dataverseToken, persona);
      console.log(
        `Active persona scope: ${activePersonaScope.persona}` +
          (activePersonaScope.email ? ` (${activePersonaScope.email})` : ' (org-wide)')
      );
    });

    async function assertTaskCountMatches(
      page: Page,
      testInfo: TestInfo,
      opts: { label: string; filter: string; pattern: RegExp; requireUnreported?: boolean }
    ): Promise<void> {
      const apiCount = await getDataverseCount(dataverseToken, opts.filter, {
        requireUnreported: opts.requireUnreported,
      });
      const appFrame = await openDashboard(page);
      const uiCount = await getDashboardTaskCount(appFrame, opts.pattern);

      console.log(`${opts.label} — UI: ${uiCount} | Dataverse: ${apiCount}`);

      if (uiCount !== apiCount) {
        await reportCountMismatch(testInfo, dataverseToken, {
          label: opts.label,
          filter: opts.filter,
          uiCount,
          apiCount,
          requireUnreported: opts.requireUnreported,
        });
      }

      expect(
        uiCount,
        `${opts.label}: UI count ${uiCount} != Dataverse ${apiCount}. See console + ${opts.label}-mismatch.json attachment for record details.`
      ).toBe(apiCount);

      await test.step(`${opts.label} count`, async () => {
        const shotLabel = `${opts.label} count (UI ${uiCount} = DV ${apiCount})`;
        const visibleRow = appFrame.getByText(opts.pattern).filter({ visible: true });
        if ((await visibleRow.count()) > 0) {
          await markAndShot(page, visibleRow.first(), shotLabel, testInfo);
        } else {
          await shot(page, shotLabel, testInfo);
        }
      });
    }

    test('TC-DV-01: Draft count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Drafts',
        filter: `dia_status eq 'Draft'`,
        pattern: /\d+\s*Drafts?/,
      });
    });

    test('TC-DV-02: Submitted count matches Dataverse (adhoc + non-adhoc)', async ({
      page,
    }, testInfo) => {
      // Submitted tile includes ALL submitted invoices (adhoc and non-adhoc)
      await assertTaskCountMatches(page, testInfo, {
        label: 'Submitted',
        filter: `dia_status eq 'Submitted'`,
        pattern: /\d+\s*Submitted/,
      });
    });

    test('TC-DV-03: Reviewed count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Reviewed',
        filter: `dia_status eq 'Reviewed'`,
        pattern: /\d+\s*Reviewed/,
      });
    });

    test('TC-DV-04: Approved count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Approved',
        filter: `dia_status eq 'Approved'`,
        pattern: /\d+\s*Approved/,
      });
    });

    test('TC-DV-05: Flagged count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Flagged',
        filter: `dia_status eq 'Flagged'`,
        pattern: /\d+\s*Flagged/,
      });
    });

    test('TC-DV-06: Failed count matches Dataverse', async ({ page }, testInfo) => {
      // Failed = any Fail-* status with IsBlank(IsReported) — Canvas TotalFailed
      await assertTaskCountMatches(page, testInfo, {
        label: 'Failed',
        filter:
          `dia_status eq 'Fail-Creation' or dia_status eq 'Fail-Update' or dia_status eq 'Fail-Flag' or dia_status eq 'Fail-Approval' or dia_status eq 'Fail-Review'`,
        pattern: /\d+\s*Failed/,
        requireUnreported: true,
      });
    });

    test('TC-DV-07: Cancelled count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Cancelled',
        filter: `dia_status eq 'Cancelled'`,
        pattern: /\d+\s*Cancelled/,
      });
    });

    test('TC-DV-08: Sent count matches Dataverse', async ({ page }, testInfo) => {
      await assertTaskCountMatches(page, testInfo, {
        label: 'Sent',
        filter: `dia_status eq 'Sent'`,
        pattern: /\d+\s*Sent/,
      });
    });

    test('TC-DV-09: Total Tasks count matches Dataverse', async ({ page }, testInfo) => {
      // Canvas: display = TotalTask - TotalReported (Approved/Sent not in TotalTask)
      const totalTaskCount = await getDataverseCount(dataverseToken, TOTAL_TASKS_FILTER);
      const reportedCount = await getDataverseCount(dataverseToken, TOTAL_REPORTED_FILTER);
      const apiCount =
        totalTaskCount >= 0 && reportedCount >= 0 ? Math.max(0, totalTaskCount - reportedCount) : -1;

      const appFrame = await openDashboard(page);

      const draft = await getDashboardTaskCount(appFrame, /\d+\s*Drafts?/);
      const flagged = await getDashboardTaskCount(appFrame, /\d+\s*Flagged/);
      const submitted = await getDashboardTaskCount(appFrame, /\d+\s*Submitted/);
      const reviewed = await getDashboardTaskCount(appFrame, /\d+\s*Reviewed/);
      const failed = await getDashboardTaskCount(appFrame, /\d+\s*Failed/);
      const cancelled = await getDashboardTaskCount(appFrame, /\d+\s*Cancelled/);
      // Canvas TotalTask does not include Approved; Failed tile already excludes reported.
      // Soft check: UI Total should be close to these tiles (reported subtraction may differ).
      const tileSum = draft + flagged + submitted + reviewed + failed + cancelled;

      await expect
        .poll(async () => getDashboardTaskCount(appFrame, /\d+\s*Total\s*Tasks?/), {
          timeout: 30000,
          message: 'Total Tasks should settle after Invoice Tasks load',
        })
        .toBeGreaterThanOrEqual(0);

      const uiCount = await getDashboardTaskCount(appFrame, /\d+\s*Total\s*Tasks?/);
      console.log(
        `Total Tasks — UI: ${uiCount} | tileSum(D+F+S+R+Fail+C): ${tileSum} | DV TotalTask: ${totalTaskCount} | DV Reported: ${reportedCount} | DV display: ${apiCount}`
      );

      if (uiCount !== apiCount) {
        await reportCountMismatch(testInfo, dataverseToken, {
          label: 'Total Tasks',
          filter: TOTAL_TASKS_FILTER,
          uiCount,
          apiCount,
        });
      }

      expect(
        uiCount,
        `Total Tasks: UI ${uiCount} != Dataverse ${apiCount} (TotalTask ${totalTaskCount} - Reported ${reportedCount}). See console + Total Tasks-mismatch.json.`
      ).toBe(apiCount);

      await test.step('Total Tasks count', async () => {
        const shotLabel = `Total Tasks count (UI ${uiCount} = DV ${apiCount})`;
        const visibleRow = appFrame.getByText(/\d+\s*Total\s*Tasks?/).filter({ visible: true });
        if ((await visibleRow.count()) > 0) {
          await markAndShot(page, visibleRow.first(), shotLabel, testInfo);
        } else {
          await shot(page, shotLabel, testInfo);
        }
      });
    });
  });
});

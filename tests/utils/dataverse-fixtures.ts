/**
 * Dataverse fixture helpers for Create Invoice (Bearer token + OData Web API).
 * Discovers partners/projects/contracts in the active ENV's Dataverse — no hardcoded seed names.
 */
import { request, type Browser, type Request } from '@playwright/test';
import { APP_URL, DATAVERSE_URL, env } from '../../config/env';

export { APP_URL, DATAVERSE_URL };

/** Picklist values for dia_productservices.ittdev_productservicetype (DEV). */
export const PRODUCT_TYPE = {
  EditableRate: 934920000,
  NonEditableRate: 934920001,
} as const;

export type ProjectFixture = {
  partnerName: string;
  projectName: string;
  projectId: string;
  contractId?: string;
  contractName?: string;
  region?: string;
};

export type ProductFixture = {
  name: string;
  productId: string;
  rateType: 'Editable Rate' | 'Non-Editable Rate';
  rate?: number | null;
};

export type CreateInvoiceFixtures = {
  /** Active project+1 contract with no non-adhoc invoice in the duplicate window. */
  eligibleNonAdhoc: ProjectFixture | null;
  /** Active project that already has a non-adhoc invoice in the duplicate window. */
  duplicateNonAdhoc: ProjectFixture | null;
  noLastMonthInvoice: ProjectFixture | null;
  /** Selectable project whose previous invoice has line items — source for "Start with last invoice". */
  withLastInvoice: ProjectFixture | null;
  northAmerica: ProjectFixture | null;
  nonNorthAmerica: ProjectFixture | null;
  /** Active project with zero Active contracts — CI-008 toast. */
  noActiveContract: ProjectFixture | null;
  /**
   * Active project whose covering contract ends before the 3-month cap
   * (first blocked day). Used for non-adhoc past-cap + no coverage (CI-052).
   */
  noFourthMonthCoverage: ProjectFixture | null;
  /** Project with 2+ Active contracts covering the default invoice date (CI-014). */
  multiActiveContract: ProjectFixture | null;
  /** Unimind / Cursor Test when present — preferred seed for multi-contract checks. */
  cursorTest: ProjectFixture | null;
  editableProduct: ProductFixture | null;
  nonEditableProduct: ProductFixture | null;
};

const ODATA_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  Prefer: 'odata.include-annotations="*"',
});

/** Current billing cycle: 6th of cycle month → 5th of following month. */
export function getBillingCycleDates(reference = new Date()): { start: string; end: string } {
  const anchorMonth =
    reference.getDate() >= 6 ? reference.getMonth() : reference.getMonth() - 1;
  const start = new Date(reference.getFullYear(), anchorMonth, 6, 0, 0, 0);
  const end = new Date(reference.getFullYear(), anchorMonth + 1, 5, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Previous billing cycle (Last Month filter window). */
export function getLastBillingCycleDates(reference = new Date()): {
  start: string;
  end: string;
} {
  const thisCycle = getBillingCycleDates(reference);
  const thisStart = new Date(thisCycle.start);
  const start = new Date(thisStart.getFullYear(), thisStart.getMonth() - 1, 6, 0, 0, 0);
  const end = new Date(thisStart.getFullYear(), thisStart.getMonth(), 5, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Calendar month of `reference` (Create Invoice form defaults use calendar 1st→last). */
export function getCalendarMonthDates(reference = new Date()): { start: string; end: string } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Window used to decide Duplicate Project! for non-adhoc creates.
 * Union of billing cycle (Dashboard This Month) and calendar month (form Invoice Date).
 */
export function getDuplicateCheckWindow(reference = new Date()): { start: string; end: string } {
  const billing = getBillingCycleDates(reference);
  const calendar = getCalendarMonthDates(reference);
  const start = billing.start < calendar.start ? billing.start : calendar.start;
  const end = billing.end > calendar.end ? billing.end : calendar.end;
  return { start, end };
}

export async function captureDataverseToken(
  browser: Browser,
  appUrl: string = APP_URL
): Promise<string> {
  const { expect } = await import('@playwright/test');
  // Prefer env authAdmin (auth/<env>/admin.json); fall back to legacy auth.json / auth/admin.json
  const fs = await import('node:fs');
  const authCandidates = [env.authAdmin, 'auth/admin.json', 'auth.json'];
  const storageState = authCandidates.find((p) => fs.existsSync(p));
  if (!storageState) {
    console.log('No admin storageState found for token capture:', authCandidates.join(', '));
    return '';
  }
  // Explicit storageState — browser.newPage() alone does not inherit config use.storageState
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  let token = '';

  page.on('request', (req: Request) => {
    if (token) return;
    const authHeader = req.headers()['authorization'] ?? '';
    if (req.url().includes('dynamics.com') && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    }
  });

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  // Consent / host alerts can block Dashboard paint and token capture
  const { dismissHostDialogsSettling } = await import('./host-dialogs');
  await dismissHostDialogsSettling(page);

  // Dashboard paint forces Canvas Dataverse traffic that carries the Bearer token
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  try {
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });
  } catch {
    await dismissHostDialogsSettling(page);
    console.log('Dashboard not visible during token capture (auth may be expired)');
  }

  if (!token) {
    await expect.poll(() => token, { timeout: 15000 }).toBeTruthy().catch(() => undefined);
  }

  await context.close();
  return token;
}

async function resolveAccountName(
  token: string,
  accountId: string | undefined
): Promise<string | null> {
  if (!accountId) return null;
  const api = await request.newContext();
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/accounts(${accountId})?$select=name`,
    { headers: ODATA_HEADERS(token) }
  );
  if (!res.ok()) return null;
  return ((await res.json()).name as string) ?? null;
}

/** Cache of ittdev_region option value → label (FormattedValue annotations often missing). */
let regionOptionLabels: Map<number, string> | null = null;

async function loadRegionOptionLabels(token: string): Promise<Map<number, string>> {
  if (regionOptionLabels) return regionOptionLabels;
  const api = await request.newContext();
  const url =
    `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='dia_project')` +
    `/Attributes(LogicalName='ittdev_region')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
    `?$select=LogicalName&$expand=OptionSet($select=Options)`;
  const res = await api.get(url, { headers: ODATA_HEADERS(token) });
  const map = new Map<number, string>();
  if (res.ok()) {
    const data = await res.json();
    for (const opt of data.OptionSet?.Options ?? []) {
      const label = opt.Label?.UserLocalizedLabel?.Label as string | undefined;
      if (opt.Value != null && label) map.set(opt.Value as number, label);
    }
  } else {
    console.log('Region option-set query failed:', res.status(), (await res.text()).slice(0, 200));
  }
  regionOptionLabels = map;
  if (map.size) {
    console.log('Region option map loaded:', map.size, 'values');
  }
  return map;
}

/** Formatted region label — prefer annotations, else picklist metadata map. */
async function resolveProjectRegion(
  token: string,
  projectId: string
): Promise<string | undefined> {
  const api = await request.newContext();
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/dia_projects(${projectId})?$select=ittdev_region`,
    {
      headers: {
        ...ODATA_HEADERS(token),
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    }
  );
  if (!res.ok()) {
    console.log('Project region query failed:', res.status(), (await res.text()).slice(0, 200));
    return undefined;
  }
  const data = await res.json();
  const formatted = data[
    'david.zara@example.net.V1.FormattedValue'
  ] as string | undefined;
  if (formatted) return formatted;

  const numeric = data.ittdev_region as number | undefined;
  if (numeric == null) return undefined;
  const labels = await loadRegionOptionLabels(token);
  return labels.get(numeric);
}

type ContractRow = {
  ittdev_contractid?: string;
  ittdev_name?: string;
  ittdev_startdate?: string;
  ittdev_enddate?: string;
  _ittdev_dia_project_value?: string;
  ittdev_dia_Project?: {
    dia_projectid?: string;
    dia_projectname?: string;
    dia_projectstatus?: string;
    _ittdev_account_value?: string;
    ittdev_region?: number;
    'david.zara@example.net.V1.FormattedValue'?: string;
  };
};

async function fetchActiveContractsCoveringDate(
  token: string,
  invoiceDateYmd: string,
  top = 80
): Promise<ContractRow[]> {
  const api = await request.newContext();
  const filter = encodeURIComponent(
    `statecode eq 0 and ittdev_startdate le ${invoiceDateYmd} and ittdev_enddate ge ${invoiceDateYmd}`
  );
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/ittdev_contracts?$filter=${filter}` +
      `&$select=ittdev_contractid,ittdev_name,_ittdev_dia_project_value,ittdev_startdate,ittdev_enddate` +
      `&$expand=ittdev_dia_Project($select=dia_projectid,dia_projectname,dia_projectstatus,_ittdev_account_value,ittdev_region)` +
      `&$top=${top}`,
    { headers: ODATA_HEADERS(token) }
  );
  if (!res.ok()) {
    console.log('Contract query failed:', (await res.text()).slice(0, 400));
    return [];
  }
  return (await res.json()).value ?? [];
}

export type ContractOption = {
  contractId: string;
  name: string;
  start?: string;
  end?: string;
  /** Contract period covers the invoice date the form defaults to. */
  coversInvoiceDate: boolean;
};

/**
 * Every Active contract on a project, newest first, flagged for whether it covers the
 * invoice date. Lets a test know up front whether the Canvas "Please select the Contract."
 * modal is expected, and which contract is the right one to pick.
 */
export async function listActiveContractsForProject(
  token: string,
  projectId: string,
  invoiceDateYmd?: string
): Promise<ContractOption[]> {
  const invoiceDate = invoiceDateYmd ?? getBillingCycleDates().end.slice(0, 10);
  const api = await request.newContext();
  try {
    const filter = encodeURIComponent(
      `statecode eq 0 and _ittdev_dia_project_value eq ${projectId}`
    );
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/ittdev_contracts?$filter=${filter}` +
        `&$select=ittdev_contractid,ittdev_name,ittdev_startdate,ittdev_enddate` +
        `&$orderby=ittdev_startdate desc&$top=50`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) {
      console.log(
        'Project contract query failed:',
        res.status(),
        (await res.text()).slice(0, 200)
      );
      return [];
    }
    const rows = ((await res.json()).value ?? []) as {
      ittdev_contractid?: string;
      ittdev_name?: string;
      ittdev_startdate?: string;
      ittdev_enddate?: string;
    }[];
    return rows.map((r) => ({
      contractId: r.ittdev_contractid ?? '',
      name: (r.ittdev_name ?? '').trim(),
      start: r.ittdev_startdate,
      end: r.ittdev_enddate,
      coversInvoiceDate:
        !!r.ittdev_startdate &&
        !!r.ittdev_enddate &&
        r.ittdev_startdate.slice(0, 10) <= invoiceDate &&
        r.ittdev_enddate.slice(0, 10) >= invoiceDate,
    }));
  } finally {
    await api.dispose();
  }
}

export type ContractListRow = {
  contractId: string;
  name: string;
  start?: string;
  end?: string;
  /** 0 = Active, 1 = Inactive. */
  statecode: number;
};

function localYmd(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** First day of calendar month + 3 as YYYY-MM-DD (August → 2026-11-01). */
export function firstBlockedCapYmd(reference = new Date()): string {
  const d = new Date(reference.getFullYear(), reference.getMonth() + 3, 1);
  return localYmd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** First day of calendar month + 4 as YYYY-MM-DD (August → 2026-12-01). */
export function fourthMonthStartYmd(reference = new Date()): string {
  const d = new Date(reference.getFullYear(), reference.getMonth() + 4, 1);
  return localYmd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Every contract on a project (Active and Inactive), newest start first. */
export async function listContractsForProject(
  token: string,
  projectId: string
): Promise<ContractListRow[]> {
  const api = await request.newContext();
  try {
    const filter = encodeURIComponent(`_ittdev_dia_project_value eq ${projectId}`);
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/ittdev_contracts?$filter=${filter}` +
        `&$select=ittdev_contractid,ittdev_name,ittdev_startdate,ittdev_enddate,statecode` +
        `&$orderby=ittdev_startdate desc&$top=50`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) {
      console.log(
        'All-contracts query failed:',
        res.status(),
        (await res.text()).slice(0, 200)
      );
      return [];
    }
    const rows = ((await res.json()).value ?? []) as {
      ittdev_contractid?: string;
      ittdev_name?: string;
      ittdev_startdate?: string;
      ittdev_enddate?: string;
      statecode?: number;
    }[];
    return rows.map((r) => ({
      contractId: r.ittdev_contractid ?? '',
      name: (r.ittdev_name ?? '').trim(),
      start: r.ittdev_startdate,
      end: r.ittdev_enddate,
      statecode: r.statecode ?? 0,
    }));
  } finally {
    await api.dispose();
  }
}

export async function findProjectByName(
  token: string,
  projectName: string
): Promise<ProjectFixture | null> {
  const api = await request.newContext();
  try {
    const filter = encodeURIComponent(`dia_projectname eq '${projectName.replace(/'/g, "''")}'`);
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/dia_projects?$filter=${filter}` +
        `&$select=dia_projectid,dia_projectname,_ittdev_account_value&$top=5`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) {
      console.log('findProjectByName failed:', res.status(), (await res.text()).slice(0, 200));
      return null;
    }
    const row = ((await res.json()).value ?? [])[0] as {
      dia_projectid?: string;
      dia_projectname?: string;
      _ittdev_account_value?: string;
    } | undefined;
    if (!row?.dia_projectid) return null;
    const partnerName = await resolveAccountName(token, row._ittdev_account_value);
    if (!partnerName) return null;
    return {
      partnerName,
      projectName: (row.dia_projectname ?? projectName).trim(),
      projectId: row.dia_projectid,
    };
  } finally {
    await api.dispose();
  }
}

/** Active project that has zero Active contracts (may still have Inactive rows). */
export async function findProjectWithNoActiveContract(
  token: string
): Promise<ProjectFixture | null> {
  const api = await request.newContext();
  try {
    const contractRes = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/ittdev_contracts?$filter=statecode eq 0` +
        `&$select=_ittdev_dia_project_value&$top=500`,
      { headers: ODATA_HEADERS(token) }
    );
    const withActive = new Set<string>();
    if (contractRes.ok()) {
      for (const r of ((await contractRes.json()).value ?? []) as {
        _ittdev_dia_project_value?: string;
      }[]) {
        if (r._ittdev_dia_project_value) withActive.add(r._ittdev_dia_project_value);
      }
    }

    const projectRes = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/dia_projects?$select=dia_projectid,dia_projectname,_ittdev_account_value,dia_projectstatus` +
        `&$top=200`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!projectRes.ok()) {
      console.log(
        'No-active-contract project query failed:',
        projectRes.status(),
        (await projectRes.text()).slice(0, 200)
      );
      return null;
    }
    const rows = ((await projectRes.json()).value ?? []) as {
      dia_projectid?: string;
      dia_projectname?: string;
      _ittdev_account_value?: string;
      dia_projectstatus?: string;
    }[];
    for (const row of rows) {
      if (!row.dia_projectid || !row.dia_projectname) continue;
      if (row.dia_projectstatus && String(row.dia_projectstatus) !== 'Active') continue;
      if (withActive.has(row.dia_projectid)) continue;
      const partnerName = await resolveAccountName(token, row._ittdev_account_value);
      if (!partnerName) continue;
      return {
        partnerName,
        projectName: row.dia_projectname.trim(),
        projectId: row.dia_projectid,
      };
    }
    return null;
  } finally {
    await api.dispose();
  }
}

function groupContractsByProject(contracts: ContractRow[]): Map<string, ContractRow[]> {
  const byProject = new Map<string, ContractRow[]>();
  for (const c of contracts) {
    const pid = c._ittdev_dia_project_value;
    if (!pid) continue;
    const list = byProject.get(pid) ?? [];
    list.push(c);
    byProject.set(pid, list);
  }
  return byProject;
}

function isActiveProject(project: ContractRow['ittdev_dia_Project']): boolean {
  if (!project?.dia_projectname) return false;
  if (project.dia_projectstatus && String(project.dia_projectstatus) !== 'Active') return false;
  return true;
}

async function projectHasInvoiceInWindow(
  token: string,
  projectId: string,
  start: string,
  end: string,
  opts: { nonAdhocOnly?: boolean; excludeCancelled?: boolean } = {}
): Promise<boolean> {
  const parts = [
    `_dia_projectid_value eq ${projectId}`,
    `dia_invoicedate ge ${start}`,
    `dia_invoicedate le ${end}`,
  ];
  if (opts.nonAdhocOnly) parts.push('(dia_adhocinvoice eq false or dia_adhocinvoice eq null)');
  if (opts.excludeCancelled) parts.push(`dia_status ne 'Cancelled'`);

  const api = await request.newContext();
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/dia_invoicedetailses?$filter=${encodeURIComponent(parts.join(' and '))}` +
      `&$top=1&$select=dia_invoicedetailsid`,
    { headers: ODATA_HEADERS(token) }
  );
  if (!res.ok()) return true; // treat errors as "has invoice" to avoid bad fixtures
  const existing = (await res.json()).value ?? [];
  return existing.length > 0;
}

async function toProjectFixture(
  token: string,
  projectId: string,
  list: ContractRow[]
): Promise<ProjectFixture | null> {
  const project = list[0]?.ittdev_dia_Project;
  if (!isActiveProject(project)) return null;
  const partnerName = await resolveAccountName(token, project!._ittdev_account_value);
  if (!partnerName) return null;
  const region =
    project!['david.zara@example.net.V1.FormattedValue'] ??
    (await resolveProjectRegion(token, projectId));
  return {
    partnerName,
    projectName: project!.dia_projectname as string,
    projectId,
    contractId: list[0].ittdev_contractid,
    contractName: list[0].ittdev_name,
    region,
  };
}

/**
 * Active project with exactly one Active contract covering Invoice Date,
 * and no non-adhoc (non-Cancelled) invoice in the duplicate-check window.
 */
export async function findEligibleNonAdhocProject(
  token: string
): Promise<ProjectFixture | null> {
  const { end: invoiceDateIso } = getBillingCycleDates();
  const dupWindow = getDuplicateCheckWindow();
  const invoiceDate = invoiceDateIso.slice(0, 10);
  const contracts = await fetchActiveContractsCoveringDate(token, invoiceDate);
  const byProject = groupContractsByProject(contracts);

  for (const [projectId, list] of byProject) {
    if (list.length !== 1) continue;
    if (
      await projectHasInvoiceInWindow(token, projectId, dupWindow.start, dupWindow.end, {
        nonAdhocOnly: true,
        excludeCancelled: true,
      })
    ) {
      continue;
    }
    const fixture = await toProjectFixture(token, projectId, list);
    if (fixture) return fixture;
  }
  return null;
}

/**
 * Active project (with contract covering this-cycle invoice date) that has
 * no invoices in the Last Month billing window or calendar previous month —
 * for the "no previous invoice" toast.
 */
export async function findProjectWithNoLastMonthInvoice(
  token: string
): Promise<ProjectFixture | null> {
  const { end } = getBillingCycleDates();
  const last = getLastBillingCycleDates();
  const invoiceDate = end.slice(0, 10);
  const contracts = await fetchActiveContractsCoveringDate(token, invoiceDate);
  const byProject = groupContractsByProject(contracts);

  const now = new Date();
  const calPrevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const calPrevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  for (const [projectId, list] of byProject) {
    if (list.length < 1) continue;
    if (await projectHasInvoiceInWindow(token, projectId, last.start, last.end)) continue;
    if (await projectHasInvoiceInWindow(token, projectId, calPrevStart, calPrevEnd)) continue;
    const fixture = await toProjectFixture(token, projectId, list);
    if (fixture) return fixture;
  }
  return null;
}

/**
 * Project that already has a non-adhoc (non-Cancelled) invoice in the duplicate window
 * (for Duplicate Project popup).
 */
export async function findProjectWithNonAdhocThisCycle(
  token: string
): Promise<ProjectFixture | null> {
  const { end: invoiceDateIso } = getBillingCycleDates();
  const dupWindow = getDuplicateCheckWindow();
  const invoiceDate = invoiceDateIso.slice(0, 10);
  const contracts = await fetchActiveContractsCoveringDate(token, invoiceDate);
  const byProject = groupContractsByProject(contracts);

  for (const [projectId, list] of byProject) {
    if (list.length < 1) continue;
    if (
      !(await projectHasInvoiceInWindow(token, projectId, dupWindow.start, dupWindow.end, {
        nonAdhocOnly: true,
        excludeCancelled: true,
      }))
    ) {
      continue;
    }
    const fixture = await toProjectFixture(token, projectId, list);
    if (fixture) return fixture;
  }
  return null;
}

/**
 * Active contracted project whose Region formatted value matches `regionLabel`
 * (e.g. "North America"). Pass `exclude: true` to find a non-matching region.
 */
export async function findProjectByRegion(
  token: string,
  regionLabel: string,
  opts: { exclude?: boolean } = {}
): Promise<ProjectFixture | null> {
  const { end } = getBillingCycleDates();
  const invoiceDate = end.slice(0, 10);
  const contracts = await fetchActiveContractsCoveringDate(token, invoiceDate);
  const byProject = groupContractsByProject(contracts);
  const needle = regionLabel.toLowerCase();

  for (const [projectId, list] of byProject) {
    if (list.length < 1) continue;
    const project = list[0].ittdev_dia_Project;
    if (!isActiveProject(project)) continue;
    const formatted =
      project!['david.zara@example.net.V1.FormattedValue'] ??
      (await resolveProjectRegion(token, projectId)) ??
      '';
    const matches = formatted.toLowerCase().includes(needle);
    if (opts.exclude ? matches : !matches) continue;
    const fixture = await toProjectFixture(token, projectId, list);
    if (fixture) return fixture;
  }
  return null;
}

/**
 * Active projects whose contract covers this-cycle invoice date and whose
 * Region matches `regionLabel`. Shuffled so tests do not reuse the same
 * partner/project every run.
 */
export async function listProjectsWithActiveContractsByRegion(
  token: string,
  regionLabel: string,
  opts: { limit?: number } = {}
): Promise<ProjectFixture[]> {
  const limit = opts.limit ?? 12;
  const { end } = getBillingCycleDates();
  const invoiceDate = end.slice(0, 10);
  const contracts = await fetchActiveContractsCoveringDate(token, invoiceDate, 200);
  const byProject = groupContractsByProject(contracts);
  const needle = regionLabel.toLowerCase();
  const found: ProjectFixture[] = [];

  for (const [projectId, list] of byProject) {
    if (list.length < 1) continue;
    const project = list[0].ittdev_dia_Project;
    if (!isActiveProject(project)) continue;
    const formatted =
      project!['david.zara@example.net.V1.FormattedValue'] ??
      (await resolveProjectRegion(token, projectId)) ??
      '';
    if (!formatted.toLowerCase().includes(needle)) continue;
    const fixture = await toProjectFixture(token, projectId, list);
    if (fixture) found.push(fixture);
    if (found.length >= Math.max(limit * 2, 16)) break;
  }

  for (let i = found.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [found[i], found[j]] = [found[j], found[i]];
  }

  const picked = found.slice(0, limit);
  console.log(
    `Active-contract ${regionLabel} projects (${found.length} found, using ${picked.length}):`,
    picked.map((p) => `${p.partnerName} / ${p.projectName}`).join('; ') || 'NONE'
  );
  return picked;
}

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  rate: number;
};

export type LastInvoiceSnapshot = {
  invoiceId: string;
  invoiceDate?: string;
  lines: InvoiceLineItem[];
};

/**
 * Most recent non-Cancelled invoice dated before the current calendar month, with its
 * Billing Info rows — the record "Start with last invoice" copies line items from.
 */
export async function fetchLastInvoiceWithLines(
  token: string,
  projectId: string
): Promise<LastInvoiceSnapshot | null> {
  const monthStart = getCalendarMonthDates().start;
  const api = await request.newContext();
  try {
    const filter = encodeURIComponent(
      `_dia_projectid_value eq ${projectId} and dia_invoicedate lt ${monthStart} ` +
        `and dia_status ne 'Cancelled'`
    );
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/dia_invoicedetailses?$filter=${filter}` +
        `&$select=dia_invoicedetailsid,dia_invoicedate&$orderby=dia_invoicedate desc&$top=1`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) {
      console.log('Last invoice query failed:', res.status(), (await res.text()).slice(0, 200));
      return null;
    }
    const row = ((await res.json()).value ?? [])[0];
    if (!row) return null;
    const invoiceId = row.dia_invoicedetailsid as string;

    const lineRes = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/dia_invoicelineitemdetailses` +
        `?$filter=${encodeURIComponent(`_dia_invoiceid_value eq ${invoiceId}`)}` +
        `&$select=dia_itemdescription,dia_description,dia_quantity,dia_rate,dia_total&$top=50`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!lineRes.ok()) {
      console.log('Line item query failed:', lineRes.status(), (await lineRes.text()).slice(0, 200));
      return { invoiceId, invoiceDate: row.dia_invoicedate, lines: [] };
    }
    const lines: InvoiceLineItem[] = ((await lineRes.json()).value ?? []).map(
      (l: Record<string, unknown>) => ({
        description: String(l.dia_itemdescription ?? l.dia_description ?? '').trim(),
        quantity: Number(l.dia_quantity ?? 0),
        rate: Number(l.dia_rate ?? 0),
      })
    );
    return { invoiceId, invoiceDate: row.dia_invoicedate, lines };
  } finally {
    await api.dispose();
  }
}

export async function findProduct(
  token: string,
  rateType: 'Editable Rate' | 'Non-Editable Rate'
): Promise<ProductFixture | null> {
  const typeValue =
    rateType === 'Editable Rate' ? PRODUCT_TYPE.EditableRate : PRODUCT_TYPE.NonEditableRate;
  const api = await request.newContext();
  const filter = encodeURIComponent(
    `ittdev_productservicetype eq ${typeValue} and statecode eq 0`
  );
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/dia_productserviceses?$filter=${filter}` +
      `&$select=dia_productservicesid,dia_productservicename,dia_productservicerate,ittdev_productservicetype` +
      `&$top=20`,
    { headers: ODATA_HEADERS(token) }
  );
  if (!res.ok()) {
    console.log('Product query failed:', (await res.text()).slice(0, 400));
    return null;
  }
  const rows = (await res.json()).value ?? [];
  const row = rows.find((r: { dia_productservicename?: string }) => r.dia_productservicename);
  if (!row) return null;
  return {
    name: row.dia_productservicename as string,
    productId: row.dia_productservicesid as string,
    rateType,
    rate: row.dia_productservicerate ?? null,
  };
}

export async function countInvoicesForProject(
  token: string,
  projectId: string,
  opts: { adhoc?: boolean; status?: string } = {}
): Promise<number> {
  const { start, end } = getBillingCycleDates();
  const parts = [
    `_dia_projectid_value eq ${projectId}`,
    `dia_invoicedate ge ${start}`,
    `dia_invoicedate le ${end}`,
  ];
  if (opts.adhoc === true) parts.push('dia_adhocinvoice eq true');
  if (opts.adhoc === false) parts.push('(dia_adhocinvoice eq false or dia_adhocinvoice eq null)');
  if (opts.status) parts.push(`dia_status eq '${opts.status}'`);

  const api = await request.newContext();
  const res = await api.get(
    `${DATAVERSE_URL}/api/data/v9.2/dia_invoicedetailses?$filter=${encodeURIComponent(parts.join(' and '))}` +
      `&$select=dia_invoicedetailsid&$top=50`,
    { headers: ODATA_HEADERS(token) }
  );
  if (!res.ok()) {
    console.log('Invoice count query failed:', (await res.text()).slice(0, 300));
    return -1;
  }
  const data = await res.json();
  return data.value?.length ?? 0;
}

/**
 * Load Create Invoice fixtures after token capture.
 * Resolves one project per role directly from Dataverse (no UI retry lists).
 */
export async function loadCreateInvoiceFixtures(
  token: string
): Promise<CreateInvoiceFixtures> {
  const last = getLastBillingCycleDates();
  const dupWindow = getDuplicateCheckWindow();
  const { end: invoiceDateIso } = getBillingCycleDates();
  const invoiceDate = invoiceDateIso.slice(0, 10);

  const [contracts, editableProduct, nonEditableProduct] = await Promise.all([
    fetchActiveContractsCoveringDate(token, invoiceDate),
    findProduct(token, 'Editable Rate'),
    findProduct(token, 'Non-Editable Rate'),
    loadRegionOptionLabels(token),
  ]).then(([c, e, n]) => [c, e, n] as const);

  const byProject = groupContractsByProject(contracts);
  let eligibleNonAdhoc: ProjectFixture | null = null;
  let duplicateNonAdhoc: ProjectFixture | null = null;
  let noLastMonthInvoice: ProjectFixture | null = null;
  let withLastInvoice: ProjectFixture | null = null;
  let northAmerica: ProjectFixture | null = null;
  let nonNorthAmerica: ProjectFixture | null = null;
  let noFourthMonthCoverage: ProjectFixture | null = null;
  let multiActiveContract: ProjectFixture | null = null;
  const firstBlockedYmd = firstBlockedCapYmd();

  const now = new Date();
  const calPrevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const calPrevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  for (const [projectId, list] of byProject) {
    const project = list[0]?.ittdev_dia_Project;
    if (!isActiveProject(project)) continue;

    if (!northAmerica || !nonNorthAmerica) {
      const region =
        project!['david.zara@example.net.V1.FormattedValue'] ??
        (await resolveProjectRegion(token, projectId)) ??
        '';
      const regionLower = region.toLowerCase();
      // Prefer region fixtures that will not raise Duplicate Project! on select
      const hasBlocking =
        list.length === 1
          ? await projectHasInvoiceInWindow(token, projectId, dupWindow.start, dupWindow.end, {
              nonAdhocOnly: true,
              excludeCancelled: true,
            })
          : true;
      if (!northAmerica && regionLower.includes('north america') && !hasBlocking) {
        northAmerica = await toProjectFixture(token, projectId, list);
      }
      if (
        !nonNorthAmerica &&
        region &&
        !regionLower.includes('north america') &&
        !hasBlocking
      ) {
        nonNorthAmerica = await toProjectFixture(token, projectId, list);
      }
    }

    if (!noLastMonthInvoice && list.length >= 1) {
      const hasLastBilling = await projectHasInvoiceInWindow(
        token,
        projectId,
        last.start,
        last.end
      );
      const hasLastCalendar = await projectHasInvoiceInWindow(
        token,
        projectId,
        calPrevStart,
        calPrevEnd
      );
      if (!hasLastBilling && !hasLastCalendar) {
        noLastMonthInvoice = await toProjectFixture(token, projectId, list);
      }
    }

    if (list.length >= 2 && !multiActiveContract) {
      const covering = list.filter((c) => {
        const start = c.ittdev_startdate?.slice(0, 10);
        const end = c.ittdev_enddate?.slice(0, 10);
        return !!start && !!end && start <= invoiceDate && end >= invoiceDate;
      });
      if (covering.length >= 2) {
        const picked = await toProjectFixture(token, projectId, covering);
        if (picked) multiActiveContract = picked;
      }
    }

    if (list.length === 1) {
      const hasBlocking = await projectHasInvoiceInWindow(
        token,
        projectId,
        dupWindow.start,
        dupWindow.end,
        { nonAdhocOnly: true, excludeCancelled: true }
      );
      if (!hasBlocking && !eligibleNonAdhoc) {
        eligibleNonAdhoc = await toProjectFixture(token, projectId, list);
      }
      if (hasBlocking && !duplicateNonAdhoc) {
        duplicateNonAdhoc = await toProjectFixture(token, projectId, list);
      }
      const end = list[0].ittdev_enddate?.slice(0, 10);
      if (end && end < firstBlockedYmd) {
        const short = await toProjectFixture(token, projectId, list);
        if (short && (!noFourthMonthCoverage || !hasBlocking)) {
          noFourthMonthCoverage = short;
        }
      }
      // Prefill source must be selectable without the Duplicate Project! popup,
      // and its previous invoice must actually carry line items to copy.
      if (!hasBlocking && !withLastInvoice) {
        const snapshot = await fetchLastInvoiceWithLines(token, projectId);
        if (snapshot && snapshot.lines.length > 0) {
          withLastInvoice = await toProjectFixture(token, projectId, list);
        }
      }
    }

    if (
      eligibleNonAdhoc &&
      duplicateNonAdhoc &&
      noLastMonthInvoice &&
      withLastInvoice &&
      northAmerica &&
      nonNorthAmerica &&
      noFourthMonthCoverage &&
      multiActiveContract
    ) {
      break;
    }
  }

  const [noActiveContract, cursorTest] = await Promise.all([
    findProjectWithNoActiveContract(token),
    findProjectByName(token, 'Cursor Test'),
  ]);

  if (cursorTest) {
    const covering = (await listActiveContractsForProject(token, cursorTest.projectId)).filter(
      (c) => c.coversInvoiceDate
    );
    if (covering.length >= 2) {
      multiActiveContract = {
        ...cursorTest,
        contractId: covering[0].contractId,
        contractName: covering[0].name,
      };
    }
  }

  return {
    eligibleNonAdhoc,
    duplicateNonAdhoc,
    noLastMonthInvoice,
    withLastInvoice,
    northAmerica,
    nonNorthAmerica,
    noActiveContract,
    noFourthMonthCoverage,
    multiActiveContract,
    cursorTest,
    editableProduct,
    nonEditableProduct,
  };
}

export function logFixtures(fixtures: CreateInvoiceFixtures): void {
  const fmt = (p: ProjectFixture | null) =>
    p ? `${p.partnerName} / ${p.projectName}${p.region ? ` [${p.region}]` : ''}` : 'NONE';
  console.log('Create Invoice fixtures:');
  console.log('  eligibleNonAdhoc (no duplicate):', fmt(fixtures.eligibleNonAdhoc));
  console.log('  duplicateNonAdhoc:', fmt(fixtures.duplicateNonAdhoc));
  console.log('  noLastMonthInvoice:', fmt(fixtures.noLastMonthInvoice));
  console.log('  withLastInvoice (prefill source):', fmt(fixtures.withLastInvoice));
  console.log('  northAmerica:', fmt(fixtures.northAmerica));
  console.log('  nonNorthAmerica:', fmt(fixtures.nonNorthAmerica));
  console.log('  noActiveContract:', fmt(fixtures.noActiveContract));
  console.log('  noFourthMonthCoverage:', fmt(fixtures.noFourthMonthCoverage));
  console.log('  multiActiveContract:', fmt(fixtures.multiActiveContract));
  console.log('  cursorTest:', fmt(fixtures.cursorTest));
  console.log('  editableProduct:', fixtures.editableProduct?.name ?? 'NONE');
  console.log('  nonEditableProduct:', fixtures.nonEditableProduct?.name ?? 'NONE');
}

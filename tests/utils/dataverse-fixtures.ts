/**
 * Dataverse fixture helpers for Create Invoice (Bearer token + OData Web API).
 * No Dataverse MCP — same auth pattern as Dashboard validation.
 */
import { request, type Browser, type Request } from '@playwright/test';

export const APP_URL =
  process.env.APP_URL ??
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';

export const DATAVERSE_URL =
  process.env.DATAVERSE_URL ?? 'https://dev-itt-apps.crm8.dynamics.com';

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
  northAmerica: ProjectFixture | null;
  nonNorthAmerica: ProjectFixture | null;
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
  // Explicit storageState — browser.newPage() alone does not inherit config use.storageState
  const context = await browser.newContext({ storageState: 'auth.json' });
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

  // Dashboard paint forces Canvas Dataverse traffic that carries the Bearer token
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  try {
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });
  } catch {
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
  let northAmerica: ProjectFixture | null = null;
  let nonNorthAmerica: ProjectFixture | null = null;

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
    }

    if (
      eligibleNonAdhoc &&
      duplicateNonAdhoc &&
      noLastMonthInvoice &&
      northAmerica &&
      nonNorthAmerica
    ) {
      break;
    }
  }

  return {
    eligibleNonAdhoc,
    duplicateNonAdhoc,
    noLastMonthInvoice,
    northAmerica,
    nonNorthAmerica,
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
  console.log('  northAmerica:', fmt(fixtures.northAmerica));
  console.log('  nonNorthAmerica:', fmt(fixtures.nonNorthAmerica));
  console.log('  editableProduct:', fixtures.editableProduct?.name ?? 'NONE');
  console.log('  nonEditableProduct:', fixtures.nonEditableProduct?.name ?? 'NONE');
}

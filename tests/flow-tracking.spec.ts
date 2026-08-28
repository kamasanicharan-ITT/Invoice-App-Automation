// seed: tests/seed.spec.ts
// Explores Power Automate flow definitions + run history around adhoc invoice Submit.

import {
  test,
  expect,
  request,
  type Page,
  type FrameLocator,
  type Request,
} from '@playwright/test';
import { markGroupAndShot, shot } from './utils/screenshot';
import { dismissHostDialogs } from './utils/host-dialogs';
import {
  APP_URL,
  DATAVERSE_URL,
  captureDataverseToken,
  loadCreateInvoiceFixtures,
  logFixtures,
  type CreateInvoiceFixtures,
  type ProjectFixture,
} from './utils/dataverse-fixtures';

const LINE_DESCRIPTION = 'Automation line item — flow tracking';

const TOAST = {
  noLastInvoice: /No invoice has been generated for this project over the last month/i,
  submitted: /submitted/i,
} as const;

const DUPLICATE = {
  title: 'Duplicate Project!',
  body: /already in progress for this month/i,
} as const;

type ProjectSelectOutcome = 'duplicate' | 'no-last-invoice' | 'clear';

type WorkflowRow = {
  workflowid?: string;
  name?: string;
  uniquename?: string;
  description?: string;
  category?: number;
  statecode?: number;
  statuscode?: number;
  type?: number;
  primaryentity?: string;
  createdon?: string;
  modifiedon?: string;
  clientdata?: string;
};

/** How a flow relates to the Invoice Canvas app (not the whole Synergy env). */
type InvoiceFlowRole =
  | 'canvas-instant' // triggered from Canvas (Power Apps button / PowerAppV2)
  | 'invoice-automated' // Dataverse trigger on invoice tables
  | 'invoice-child' // child flow called by an invoice parent
  | 'invoice-scheduled' // scheduled invoice notify/status
  | 'invoice-related' // touches invoice entities/fields but role unclear
  | 'excluded'; // copy/deprecated/model-driven/other domain

type ClassifiedFlow = {
  workflowid: string;
  name: string;
  state: 'On' | 'Off' | 'Unknown';
  role: InvoiceFlowRole;
  score: number;
  reasons: string[];
  triggerSummary: string;
  actionSummary: string[];
  invoiceEntities: string[];
  isNoiseName: boolean;
};

type FlowRunRow = {
  flowrunid?: string;
  name?: string;
  status?: string;
  errorcode?: string;
  errormessage?: string;
  workflowid?: string;
  starttime?: string;
  endtime?: string;
  isprimary?: boolean;
  parentrunid?: string;
  triggertype?: string;
  '_workflow_value'?: string;
  'sarah.b@example.net.V1.FormattedValue'?: string;
};

type CapturedFlowCall = {
  method: string;
  url: string;
  at: string;
};

const ODATA_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  Prefer: 'odata.include-annotations="*"',
});

/** Modern / cloud flow category in Dataverse workflow table. */
const WORKFLOW_CATEGORY_MODERN_FLOW = 5;

function isFlowRelatedUrl(url: string): boolean {
  return /flow\.microsoft\.com|powerautomate\.com|api\.flow|invokeFlow|InvokeFlow|\/flows\/|workflowruns|flowruns|ProcessSimple|logic\.azure\.com|azure-apim\.net/i.test(
    url
  );
}

function summarizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 120 ? `${u.pathname.slice(0, 117)}...` : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url.slice(0, 160);
  }
}

async function dvGet<T>(
  token: string,
  pathAndQuery: string
): Promise<{ ok: boolean; status: number; body: T | null; raw: string }> {
  const api = await request.newContext();
  const url = pathAndQuery.startsWith('http')
    ? pathAndQuery
    : `${DATAVERSE_URL}/api/data/v9.2/${pathAndQuery}`;
  const res = await api.get(url, {
    headers: ODATA_HEADERS(token),
  });
  const raw = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(raw) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok(), status: res.status(), body, raw };
}

/**
 * List cloud flows from Dataverse without triggering them.
 * Solution-aware modern flows live in `workflows` (category = 5).
 */
async function listCloudFlows(
  token: string,
  opts: { activeOnly?: boolean; includeClientData?: boolean } = {}
): Promise<{
  ok: boolean;
  status: number;
  flows: WorkflowRow[];
  errorSnippet: string;
}> {
  const selectBase =
    'workflowid,name,uniquename,description,category,statecode,statuscode,type,primaryentity,createdon,modifiedon';
  const select = opts.includeClientData ? `${selectBase},clientdata` : selectBase;
  const parts = [`category eq ${WORKFLOW_CATEGORY_MODERN_FLOW}`];
  if (opts.activeOnly) parts.push('statecode eq 1');
  const filter = encodeURIComponent(parts.join(' and '));
  // Paginate — environments often have >200 cloud flows
  const flows: WorkflowRow[] = [];
  let next: string | undefined =
    `workflows?$select=${select}&$filter=${filter}&$orderby=name asc&$top=${opts.includeClientData ? 50 : 200}`;
  let lastStatus = 0;
  let lastRaw = '';

  while (next) {
    const result = await dvGet<{ value?: WorkflowRow[]; '@odata.nextLink'?: string }>(
      token,
      next
    );
    lastStatus = result.status;
    lastRaw = result.raw;
    if (!result.ok) {
      // clientdata can be huge / blocked — retry without it once
      if (opts.includeClientData && /clientdata/i.test(result.raw)) {
        return listCloudFlows(token, { ...opts, includeClientData: false });
      }
      return {
        ok: false,
        status: lastStatus,
        flows,
        errorSnippet: lastRaw.slice(0, 400),
      };
    }
    flows.push(...(result.body?.value ?? []));
    const link = result.body?.['@odata.nextLink'];
    next = link || undefined;
    if (flows.length >= 500) break; // safety cap
  }

  return {
    ok: true,
    status: lastStatus,
    flows,
    errorSnippet: '',
  };
}

/** Fetch clientdata for a small set of workflow ids (definition introspection). */
async function loadFlowClientData(
  token: string,
  workflowIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const api = await request.newContext();
  for (const id of workflowIds) {
    const res = await api.get(
      `${DATAVERSE_URL}/api/data/v9.2/workflows(${id})?$select=workflowid,clientdata`,
      { headers: ODATA_HEADERS(token) }
    );
    if (!res.ok()) continue;
    const row = (await res.json()) as WorkflowRow;
    if (row.workflowid && row.clientdata) map.set(row.workflowid, row.clientdata);
  }
  return map;
}

/** Noise / non-current naming — copies, deprecated, one-off experiments. */
function isNoiseFlowName(name: string): boolean {
  return /^(copy(\s+of)?|deprecated|old\b|backup\b)|deprecated|\(copy\s*\)|\bbackup\b|\bold\b|\btest flow\b|\bduplicates test\b/i.test(
    name.trim()
  );
}

/** Model-driven / non-invoice domains that share this Dataverse env. */
function isOtherDomainFlowName(name: string): boolean {
  return /resource (requirement|allocation|skills)|partner portal|initiative|quickbooks|forecast|skill|certification|free pool|entra id|knowledge article|login validation|support ticket|sow\b|contract document|project request|project \(m\)|project resource/i.test(
    name
  );
}

/** Strong invoice naming (lifecycle + known helpers from this app). */
function hasInvoiceNameSignal(name: string): boolean {
  return /invoice|notifyinvoice|generate invoice pdf|fail-creation|fail-update|fail-flag|fail-approval|fail-review|adhoc/i.test(
    name
  );
}

const INVOICE_ENTITY_MARKERS = [
  'dia_invoicedetails',
  'dia_invoicedetailses',
  'dia_invoicelineitem',
  'dia_invoicelineitemdetails',
  'dia_invoicelineitemdetailses',
  'dia_invoicefilteringoption',
  'project invoice',
  'projectinvoices',
] as const;

type ParsedFlowDef = {
  triggerSummary: string;
  actionNames: string[];
  invoiceEntities: string[];
  isPowerAppsTrigger: boolean;
  isScheduledTrigger: boolean;
  isChildOrManualTrigger: boolean;
  isDataverseInvoiceTrigger: boolean;
  mentionsInvoice: boolean;
};

function parseFlowClientData(clientdata: string | undefined): ParsedFlowDef {
  const empty: ParsedFlowDef = {
    triggerSummary: '(no definition loaded)',
    actionNames: [],
    invoiceEntities: [],
    isPowerAppsTrigger: false,
    isScheduledTrigger: false,
    isChildOrManualTrigger: false,
    isDataverseInvoiceTrigger: false,
    mentionsInvoice: false,
  };
  if (!clientdata) return empty;

  let root: Record<string, unknown>;
  try {
    root = JSON.parse(clientdata) as Record<string, unknown>;
  } catch {
    return { ...empty, triggerSummary: '(clientdata not JSON)' };
  }

  const properties =
    (root.properties as Record<string, unknown> | undefined) ??
    (root.definition as Record<string, unknown> | undefined) ??
    root;
  const definition =
    (properties.definition as Record<string, unknown> | undefined) ??
    (root.definition as Record<string, unknown> | undefined) ??
    properties;

  const triggers = (definition.triggers as Record<string, unknown>) || {};
  const actions = (definition.actions as Record<string, unknown>) || {};
  const triggerKeys = Object.keys(triggers);
  const firstTriggerKey = triggerKeys[0] ?? '';
  const firstTrigger = (triggers[firstTriggerKey] as Record<string, unknown>) || {};
  const triggerType = String(firstTrigger.type ?? firstTriggerKey ?? '');
  const triggerKind = String(firstTrigger.kind ?? '');

  const blob = clientdata.toLowerCase();
  const invoiceEntities = INVOICE_ENTITY_MARKERS.filter((m) => blob.includes(m.toLowerCase()));

  const actionNames = Object.keys(actions).slice(0, 12);
  // Also surface nested Run a Child Flow / Invoke names when present in text
  const childMentions = [
    ...blob.matchAll(/child[\s_-]*flow[^"\\]{0,80}/gi),
  ]
    .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 80))
    .slice(0, 5);

  const isPowerAppsTrigger =
    /powerapp/i.test(triggerType) ||
    /powerapp/i.test(triggerKind) ||
    /powerapp/i.test(firstTriggerKey);

  const isScheduledTrigger =
    /recurrence/i.test(triggerType) || /recurrence/i.test(firstTriggerKey);

  // Instant "Button" / Manual without PowerAppV2 — typically child or maker-run flows
  const isChildOrManualTrigger =
    !isPowerAppsTrigger &&
    (/manual/i.test(triggerType + firstTriggerKey) ||
      (triggerType === 'Request' && /button/i.test(triggerKind)));

  const isDataverseInvoiceTrigger =
    /openapiconnection|common.?data.?service|dataverse/i.test(triggerType + firstTriggerKey) &&
    invoiceEntities.length > 0;

  return {
    triggerSummary: [firstTriggerKey, triggerType, triggerKind].filter(Boolean).join(' / '),
    actionNames: [...actionNames, ...childMentions].slice(0, 15),
    invoiceEntities,
    isPowerAppsTrigger,
    isScheduledTrigger,
    isChildOrManualTrigger,
    isDataverseInvoiceTrigger,
    mentionsInvoice: invoiceEntities.length > 0 || /invoice/i.test(blob),
  };
}

/**
 * Classify whether a cloud flow belongs to Invoice Canvas work
 * (vs model-driven Project/Resource/Partner flows in the same env).
 */
function classifyInvoiceFlow(flow: WorkflowRow, clientdata?: string): ClassifiedFlow {
  const name = flow.name ?? '(unnamed)';
  const noise = isNoiseFlowName(name);
  const otherDomain = isOtherDomainFlowName(name);
  const parsed = parseFlowClientData(clientdata ?? flow.clientdata);
  const reasons: string[] = [];
  let score = 0;

  if (noise) {
    reasons.push('noise name (Copy of / Deprecated / Backup / Old / Test)');
    score -= 50;
  }
  if (otherDomain && !hasInvoiceNameSignal(name)) {
    reasons.push('other Synergy domain (project/resource/partner/etc.)');
    score -= 40;
  }
  if (flow.statecode === 1) {
    reasons.push('On (active)');
    score += 5;
  } else if (flow.statecode === 0) {
    reasons.push('Off / draft');
    score -= 10;
  }

  if (hasInvoiceNameSignal(name)) {
    reasons.push('invoice-related name');
    score += 25;
  }
  if (parsed.invoiceEntities.length) {
    reasons.push(`touches: ${parsed.invoiceEntities.join(', ')}`);
    score += 30;
  } else if (parsed.mentionsInvoice) {
    reasons.push('clientdata mentions invoice');
    score += 15;
  }
  if (parsed.isPowerAppsTrigger) {
    reasons.push('Power Apps / Canvas instant trigger');
    score += 20;
  }
  if (parsed.isDataverseInvoiceTrigger) {
    reasons.push('Dataverse trigger on invoice table');
    score += 20;
  }
  if (/^child flow/i.test(name) && hasInvoiceNameSignal(name)) {
    reasons.push('named invoice child flow');
    score += 15;
  }
  if (parsed.isScheduledTrigger && hasInvoiceNameSignal(name)) {
    reasons.push('scheduled invoice job');
    score += 10;
  }
  if (/one[\s-]?time|migrate invoices|migrate total/i.test(name)) {
    reasons.push('one-time / migration utility (not runtime app path)');
    score -= 25;
  }
  if (/^button\s*->/i.test(name)) {
    reasons.push('generic Button-> scaffold name');
    score -= 20;
  }

  let role: InvoiceFlowRole = 'excluded';
  const strongInvoice =
    hasInvoiceNameSignal(name) || parsed.invoiceEntities.length > 0 || parsed.mentionsInvoice;

  if (!noise && score >= 35 && strongInvoice) {
    if (/^child flow/i.test(name) || (parsed.isChildOrManualTrigger && /^child flow/i.test(name))) {
      role = 'invoice-child';
    } else if (parsed.isPowerAppsTrigger) {
      role = 'canvas-instant';
    } else if (parsed.isDataverseInvoiceTrigger) {
      role = 'invoice-automated';
    } else if (parsed.isChildOrManualTrigger && hasInvoiceNameSignal(name)) {
      role = 'invoice-child';
    } else if (parsed.isScheduledTrigger) {
      role = 'invoice-scheduled';
    } else {
      role = 'invoice-related';
    }
  }

  // Hard exclude: noise always out of invoice catalog
  if (noise) role = 'excluded';
  // Hard exclude other-domain unless strong invoice entity evidence
  if (otherDomain && parsed.invoiceEntities.length === 0 && !hasInvoiceNameSignal(name)) {
    role = 'excluded';
  }
  // Drop one-time migrations from the runtime catalog
  if (/one[\s-]?time|migrate invoices|migrate total/i.test(name)) {
    role = 'excluded';
  }

  return {
    workflowid: flow.workflowid ?? '',
    name,
    state: flow.statecode === 1 ? 'On' : flow.statecode === 0 ? 'Off' : 'Unknown',
    role,
    score,
    reasons,
    triggerSummary: parsed.triggerSummary,
    actionSummary: parsed.actionNames,
    invoiceEntities: parsed.invoiceEntities,
    isNoiseName: noise,
  };
}

function logClassifiedFlows(label: string, rows: ClassifiedFlow[]): void {
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const r of rows) {
    console.log(
      `- [${r.role}] (${r.state}, score=${r.score}) ${r.name}\n` +
        `    trigger: ${r.triggerSummary}\n` +
        `    why: ${r.reasons.join('; ')}\n` +
        `    actions: ${r.actionSummary.slice(0, 6).join(', ') || '(n/a)'}`
    );
  }
}

/** Fallback: any workflow rows (classic + modern) if modern-only filter fails. */
async function listAnyWorkflows(token: string): Promise<{
  ok: boolean;
  status: number;
  flows: WorkflowRow[];
  errorSnippet: string;
}> {
  const select =
    'workflowid,name,uniquename,category,statecode,statuscode,type,primaryentity,createdon,modifiedon';
  const result = await dvGet<{ value?: WorkflowRow[] }>(
    token,
    `workflows?$select=${select}&$orderby=modifiedon desc&$top=50`
  );
  return {
    ok: result.ok,
    status: result.status,
    flows: result.body?.value ?? [],
    errorSnippet: result.ok ? '' : result.raw.slice(0, 400),
  };
}

async function listRecentFlowRuns(
  token: string,
  opts: { sinceIso?: string; top?: number } = {}
): Promise<{
  ok: boolean;
  status: number;
  runs: FlowRunRow[];
  errorSnippet: string;
}> {
  const top = opts.top ?? 50;
  const filterClause = opts.sinceIso
    ? `&$filter=${encodeURIComponent(`starttime ge ${opts.sinceIso}`)}`
    : '';

  // Try richer select first; fall back if org schema differs
  const selectAttempts = [
    'flowrunid,name,status,errorcode,errormessage,workflowid,starttime,endtime,isprimary,parentrunid,triggertype',
    'flowrunid,name,status,errorcode,errormessage,workflowid,starttime,endtime',
    'flowrunid,name,status,starttime,endtime,workflowid',
  ];

  let last: { ok: boolean; status: number; body: { value?: FlowRunRow[] } | null; raw: string } = {
    ok: false,
    status: 0,
    body: null,
    raw: '',
  };

  for (const select of selectAttempts) {
    last = await dvGet<{ value?: FlowRunRow[] }>(
      token,
      `flowruns?$select=${select}&$orderby=starttime desc&$top=${top}${filterClause}`
    );
    if (last.ok) {
      return {
        ok: true,
        status: last.status,
        runs: last.body?.value ?? [],
        errorSnippet: '',
      };
    }
  }

  return {
    ok: false,
    status: last.status,
    runs: [],
    errorSnippet: last.raw.slice(0, 400),
  };
}

/** Open Find Tax and pick the first option when NA invoices require it. */
async function selectTaxIfPresent(appFrame: FrameLocator): Promise<void> {
  const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
  const taxAlready = appFrame
    .getByRole('button', { name: /^Selected:/ })
    .filter({ hasText: /%/ })
    .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
  if (await taxAlready.first().isVisible().catch(() => false)) return;
  if (!(await findTax.isVisible().catch(() => false))) return;
  await findTax.click();
  const option = appFrame.getByRole('option').first();
  if (!(await option.isVisible({ timeout: 10000 }).catch(() => false))) return;
  await option.click();
}

function attachFlowNetworkCapture(page: Page): CapturedFlowCall[] {
  const hits: CapturedFlowCall[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (!isFlowRelatedUrl(url)) return;
    hits.push({
      method: req.method(),
      url,
      at: new Date().toISOString(),
    });
  });
  return hits;
}

function logFlowInventory(label: string, flows: WorkflowRow[]): void {
  console.log(`\n=== ${label} (${flows.length}) ===`);
  for (const f of flows) {
    console.log(
      `- ${f.name ?? '(no name)'} | id=${f.workflowid ?? '?'} | category=${f.category ?? '?'} | state=${f.statecode ?? '?'} | unique=${f.uniquename ?? ''}`
    );
  }
}

function logFlowRuns(
  label: string,
  runs: FlowRunRow[],
  flowNameById?: Map<string, string>
): void {
  console.log(`\n=== ${label} (${runs.length}) ===`);
  for (const r of runs) {
    const wfId = r.workflowid ?? r['_workflow_value'] ?? '';
    const wfName =
      (wfId && flowNameById?.get(wfId)) ||
      r['sarah.b@example.net.V1.FormattedValue'] ||
      '';
    const parent = r.parentrunid ? ` parent=${r.parentrunid}` : '';
    const primary =
      r.isprimary === false ? ' child' : r.isprimary === true ? ' primary' : '';
    const err = /fail/i.test(r.status ?? '')
      ? ` | err=${r.errorcode ?? ''} ${((r.errormessage ?? '') as string).slice(0, 120)}`
      : '';
    console.log(
      `- ${r.status ?? '?'} | flow=${wfName || '(unknown)'} | run=${r.name ?? r.flowrunid ?? '?'}${primary}${parent} | wfId=${wfId || '?'} | start=${r.starttime ?? '?'}${err}`
    );
  }
}

function logNetworkHits(label: string, hits: CapturedFlowCall[]): void {
  console.log(`\n=== ${label} (${hits.length}) ===`);
  const seen = new Set<string>();
  for (const h of hits) {
    const key = `${h.method} ${summarizeUrl(h.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`- ${h.method} ${summarizeUrl(h.url)}`);
  }
}

// ── UI helpers (minimal subset for adhoc Submit) ─────────────────────────────

async function waitForCreateInvoiceReady(page: Page, appFrame: FrameLocator): Promise<void> {
  await dismissHostDialogs(page);
  await expect(appFrame.getByText('New Invoice', { exact: true })).toBeVisible({
    timeout: 45000,
  });
  await expect(appFrame.getByText('Adhoc Invoice', { exact: true })).toBeVisible({
    timeout: 30000,
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
}

async function openCreateInvoice(page: Page): Promise<FrameLocator> {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
  await dismissHostDialogs(page);
  try {
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });
  } catch {
    await dismissHostDialogs(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissHostDialogs(page);
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
  }
  await dismissHostDialogs(page);
  await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
  await dismissHostDialogs(page);
  try {
    await waitForCreateInvoiceReady(page, appFrame);
  } catch {
    await dismissHostDialogs(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissHostDialogs(page);
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 90000,
    });
    await appFrame.getByRole('button', { name: 'Create Invoice' }).last().click();
    await dismissHostDialogs(page);
    await waitForCreateInvoiceReady(page, appFrame);
  }
  return appFrame;
}

async function setToggle(
  appFrame: FrameLocator,
  label: 'Adhoc Invoice' | 'Send Instantly',
  on: boolean
): Promise<void> {
  const labelLoc = appFrame.getByText(label, { exact: true });
  await expect(labelLoc).toBeVisible({ timeout: 20000 });
  const named = appFrame.getByRole('switch', { name: new RegExp(label, 'i') });
  const switchIndex = label === 'Adhoc Invoice' ? 0 : 1;
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

async function setAdhoc(appFrame: FrameLocator, on: boolean): Promise<void> {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectedPartnerButton(appFrame: FrameLocator, name: string) {
  return appFrame
    .getByRole('button', { name: `Selected: ${name}`, exact: true })
    .or(appFrame.getByRole('button', { name, exact: true }));
}

function selectedProjectButton(appFrame: FrameLocator, name: string) {
  return appFrame
    .getByRole('button', { name: `Selected: ${name}`, exact: true })
    .or(appFrame.getByRole('button', { name, exact: true }));
}

function duplicateLocators(appFrame: FrameLocator) {
  return {
    title: appFrame.getByText(DUPLICATE.title, { exact: true }),
    body: appFrame.getByText(DUPLICATE.body),
    verify: appFrame.getByRole('button', { name: 'Verify' }),
    cancel: appFrame.getByRole('button', { name: 'Cancel' }),
  };
}

async function dismissDuplicateDialog(appFrame: FrameLocator): Promise<void> {
  const dup = duplicateLocators(appFrame);
  if (!(await dup.title.isVisible().catch(() => false))) return;
  if (await dup.cancel.isVisible().catch(() => false)) {
    await dup.cancel.click();
  }
  await expect(dup.title).toBeHidden({ timeout: 15000 });
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

async function selectPartner(appFrame: FrameLocator, name: string): Promise<void> {
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

async function selectProject(appFrame: FrameLocator, name: string | RegExp): Promise<void> {
  const findProject = appFrame.getByRole('button', { name: 'Find Project' });
  const opener = (await findProject.isVisible().catch(() => false))
    ? findProject
    : appFrame.getByRole('button', { name: /^Selected:/ }).last();
  await expect(opener).toBeVisible({ timeout: 15000 });
  await selectComboOption(appFrame, opener, name);
  if (typeof name !== 'string') return;

  // Duplicate title can exist hidden in the DOM — only treat visible popup as duplicate
  const dup = duplicateLocators(appFrame).title;
  const selected = selectedProjectButton(appFrame, name);
  await expect
    .poll(
      async () => {
        if (await selected.isVisible().catch(() => false)) return 'selected';
        if (await dup.isVisible().catch(() => false)) return 'duplicate';
        return 'pending';
      },
      { timeout: 15000 }
    )
    .not.toBe('pending');
}

async function selectPartnerAndProject(
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
  const outcomePromise = expect(dup.or(noLast))
    .toBeVisible({ timeout: 12000 })
    .then(async (): Promise<ProjectSelectOutcome> => {
      if (await dup.isVisible().catch(() => false)) return 'duplicate';
      if (await noLast.isVisible().catch(() => false)) return 'no-last-invoice';
      return 'clear';
    })
    .catch((): ProjectSelectOutcome => 'clear');

  await selectProject(appFrame, fixture.projectName);
  return outcomePromise;
}

async function ensureLineItemRow(appFrame: FrameLocator): Promise<void> {
  const findItems = appFrame.getByRole('button', { name: 'Find items' });
  if ((await findItems.count()) === 0) {
    await appFrame.getByRole('button', { name: 'Add new item' }).click();
  }
  await expect(findItems.first()).toBeVisible({ timeout: 15000 });
}

async function keepSingleLineItemRow(appFrame: FrameLocator): Promise<void> {
  const deleteImg = appFrame.getByRole('img', { name: /delete/i });
  for (let i = 0; i < 6; i++) {
    const n = await deleteImg.count();
    if (n <= 1) break;
    await deleteImg.last().click();
    await expect
      .poll(async () => deleteImg.count(), { timeout: 8000 })
      .toBeLessThan(n)
      .catch(() => undefined);
  }
}

async function selectProduct(appFrame: FrameLocator, productName?: string): Promise<void> {
  await ensureLineItemRow(appFrame);
  await keepSingleLineItemRow(appFrame);
  await appFrame.getByRole('button', { name: 'Find items' }).first().click();
  await expect(appFrame.getByRole('option').first()).toBeVisible({ timeout: 15000 });
  if (productName) {
    const named = appFrame
      .getByRole('option', { name: productName, exact: true })
      .or(
        appFrame.getByRole('option', {
          name: new RegExp(`^${escapeRegExp(productName)}$`, 'i'),
        })
      );
    if ((await named.count()) > 0) {
      await named.first().click();
    } else {
      await appFrame.getByRole('option').first().click();
    }
  } else {
    await appFrame.getByRole('option').first().click();
  }
}

async function fillLineItem(
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

async function awaitSubmitNavigatedToOverview(appFrame: FrameLocator): Promise<void> {
  await expect(appFrame.getByText(TOAST.submitted).first()).toBeVisible({ timeout: 30000 });
  await expect(appFrame.getByText('Invoice Overview', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('Power Automate flow tracking', () => {
  test.describe.configure({ timeout: 180000 });

  let dataverseToken = '';
  let fixtures: CreateInvoiceFixtures = {
    eligibleNonAdhoc: null,
    duplicateNonAdhoc: null,
    noLastMonthInvoice: null,
    withLastInvoice: null,
    northAmerica: null,
    nonNorthAmerica: null,
    noActiveContract: null,
    noFourthMonthCoverage: null,
    multiActiveContract: null,
    coversFourthMonth: null,
    editableProduct: null,
    nonEditableProduct: null,
  };

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const persona = testInfo.project.name.toLowerCase().includes('pm') ? 'pm' : 'admin';
    dataverseToken = await captureDataverseToken(browser, APP_URL, persona);
    console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
    if (dataverseToken) {
      fixtures = await loadCreateInvoiceFixtures(dataverseToken, { persona });
      logFixtures(fixtures, persona);
    }
  });

  test('TC-FLOW-01: Classify Invoice-app flows (exclude Copy/Deprecated/other domains)', async ({
    page,
  }, testInfo) => {
    test.skip(!dataverseToken, 'No Dataverse token');

    // 1) All modern flows (metadata only — no trigger)
    const modern = await listCloudFlows(dataverseToken, { activeOnly: false });
    console.log('Modern flow query status:', modern.status, modern.ok ? 'OK' : modern.errorSnippet);
    expect(modern.ok, `Cannot read workflows [${modern.status}]: ${modern.errorSnippet}`).toBeTruthy();
    const allFlows = modern.flows;
    expect(allFlows.length).toBeGreaterThan(0);

    // 2) Shortlist likely invoice candidates by name (cheap), drop obvious noise
    const nameCandidates = allFlows.filter((f) => {
      const name = f.name ?? '';
      if (isNoiseFlowName(name)) return false;
      if (hasInvoiceNameSignal(name)) return true;
      // Keep active "Child Flow" rows for definition check — many are invoice children
      if (/^child flow/i.test(name) && f.statecode === 1) return true;
      return false;
    });

    // 3) Also include active flows whose definition references invoice tables (even if name is vague)
    //    Load clientdata only for active non-noise flows to keep the probe bounded.
    const activeNonNoise = allFlows.filter(
      (f) => f.statecode === 1 && f.workflowid && !isNoiseFlowName(f.name ?? '')
    );
    // Prefer name candidates first; then sample remaining active flows that aren't clearly other-domain
    const definitionProbeIds = [
      ...nameCandidates.map((f) => f.workflowid!),
      ...activeNonNoise
        .filter((f) => !isOtherDomainFlowName(f.name ?? '') && !nameCandidates.includes(f))
        .map((f) => f.workflowid!),
    ]
      .filter(Boolean)
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 80);

    console.log(
      `Probing clientdata for ${definitionProbeIds.length} candidate flow(s) (of ${allFlows.length} total)...`
    );
    const clientDataById = await loadFlowClientData(dataverseToken, definitionProbeIds);

    // 4) Classify every probed flow + name-only leftovers
    const classified: ClassifiedFlow[] = [];
    const seen = new Set<string>();
    for (const flow of allFlows) {
      const id = flow.workflowid ?? '';
      if (!id || seen.has(id)) continue;
      const cd = clientDataById.get(id);
      // Skip deep-classify for clear other-domain / noise without invoice name (keeps report focused)
      if (
        !cd &&
        (isNoiseFlowName(flow.name ?? '') ||
          (isOtherDomainFlowName(flow.name ?? '') && !hasInvoiceNameSignal(flow.name ?? '')))
      ) {
        continue;
      }
      if (!cd && !hasInvoiceNameSignal(flow.name ?? '') && !/^child flow/i.test(flow.name ?? '')) {
        continue;
      }
      seen.add(id);
      classified.push(classifyInvoiceFlow(flow, cd));
    }

    const noiseInEnv = allFlows.filter((f) => isNoiseFlowName(f.name ?? '')).length;
    const invoiceCatalog = classified
      .filter((c) => c.role !== 'excluded')
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const invoiceCatalogOn = invoiceCatalog.filter((c) => c.state === 'On');
    const excludedNoise = classified.filter((c) => c.isNoiseName);
    const byRole = {
      'canvas-instant': invoiceCatalogOn.filter((c) => c.role === 'canvas-instant'),
      'invoice-automated': invoiceCatalogOn.filter((c) => c.role === 'invoice-automated'),
      'invoice-child': invoiceCatalogOn.filter((c) => c.role === 'invoice-child'),
      'invoice-scheduled': invoiceCatalogOn.filter((c) => c.role === 'invoice-scheduled'),
      'invoice-related': invoiceCatalogOn.filter((c) => c.role === 'invoice-related'),
    };

    console.log(
      `\nTotals: env modern flows=${allFlows.length}; noise names in env=${noiseInEnv}; ` +
        `classified=${classified.length}; invoice catalog (On)=${invoiceCatalogOn.length} ` +
        `(incl Off=${invoiceCatalog.length - invoiceCatalogOn.length}); ` +
        `noise excluded from catalog=${excludedNoise.length}`
    );
    for (const [role, rows] of Object.entries(byRole)) {
      logClassifiedFlows(`Invoice catalog (On) — ${role}`, rows);
    }
    const offRows = invoiceCatalog.filter((c) => c.state !== 'On');
    if (offRows.length) logClassifiedFlows('Invoice-related but Off/draft (not runtime)', offRows);

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });

    await test.step('Dashboard open while classifying Invoice flows', async () => {
      await shot(page, 'Dashboard — Invoice flow classification', testInfo);
    });

    await testInfo.attach('invoice-flow-catalog.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            summary: {
              environmentModernFlowCount: allFlows.length,
              noiseNamesInEnvironment: noiseInEnv,
              classifiedCount: classified.length,
              invoiceCatalogOnCount: invoiceCatalogOn.length,
              invoiceCatalogIncludingOffCount: invoiceCatalog.length,
              byRole: Object.fromEntries(
                Object.entries(byRole).map(([k, v]) => [k, v.length])
              ),
            },
            invoiceCatalogOn,
            invoiceCatalogOff: invoiceCatalog.filter((c) => c.state !== 'On'),
            excludedNoiseSample: allFlows
              .filter((f) => isNoiseFlowName(f.name ?? ''))
              .slice(0, 40)
              .map((f) => ({ name: f.name, workflowid: f.workflowid, statecode: f.statecode })),
          },
          null,
          2
        ),
        'utf-8'
      ),
      contentType: 'application/json',
    });

    expect(
      invoiceCatalogOn.length,
      'Expected at least one On Invoice-relevant flow after filtering Copy/Deprecated/other domains'
    ).toBeGreaterThan(0);
    // Active Create Invoice flows should surface when present in env
    const createInvoice = invoiceCatalogOn.filter((c) => /^create invoice/i.test(c.name));
    expect.soft(createInvoice.length).toBeGreaterThan(0);
  });

  test('TC-FLOW-02: Adhoc Submit — capture network + flowruns (parent/child)', async ({
    page,
  }, testInfo) => {
    test.skip(!dataverseToken, 'No Dataverse token');
    test.skip(!fixtures.editableProduct, 'No Editable Rate product in Dataverse');

    // Prefer projects that are less likely to hit Duplicate after prior flow-tracking submits
    const candidates = [
      fixtures.noLastMonthInvoice,
      fixtures.nonNorthAmerica,
      fixtures.eligibleNonAdhoc,
      fixtures.northAmerica,
    ].filter((p): p is ProjectFixture => !!p);
    test.skip(candidates.length === 0, 'No Active project fixture from Dataverse');

    // Baseline definitions — Invoice catalog only (not whole env)
    const inventory = await listCloudFlows(dataverseToken);
    const inventoryFlows =
      inventory.ok && inventory.flows.length > 0
        ? inventory.flows
        : (await listAnyWorkflows(dataverseToken)).flows;

    const nameCandidates = inventoryFlows.filter(
      (f) => hasInvoiceNameSignal(f.name ?? '') && !isNoiseFlowName(f.name ?? '')
    );
    const clientDataById = await loadFlowClientData(
      dataverseToken,
      nameCandidates
        .map((f) => f.workflowid!)
        .filter(Boolean)
        .slice(0, 60)
    );
    const invoiceCatalog = nameCandidates
      .map((f) => classifyInvoiceFlow(f, clientDataById.get(f.workflowid ?? '')))
      .filter((c) => c.role !== 'excluded')
      .sort((a, b) => b.score - a.score);
    logClassifiedFlows('Pre-submit Invoice flow catalog', invoiceCatalog);

    const flowNameById = new Map(
      inventoryFlows
        .filter((f) => f.workflowid && f.name)
        .map((f) => [f.workflowid as string, f.name as string])
    );

    const baselineRuns = await listRecentFlowRuns(dataverseToken, { top: 20 });
    console.log(
      'flowruns baseline:',
      baselineRuns.ok
        ? `${baselineRuns.runs.length} rows`
        : `FAILED ${baselineRuns.status} ${baselineRuns.errorSnippet}`
    );
    if (baselineRuns.ok) {
      logFlowRuns('Recent flowruns before Submit', baselineRuns.runs, flowNameById);
    }

    const networkHits = attachFlowNetworkCapture(page);
    // Snapshot baseline run ids so we can detect new rows without brittle OData datetime filters
    const baselineRunIds = new Set(
      (baselineRuns.ok ? baselineRuns.runs : [])
        .map((r) => r.flowrunid || r.name)
        .filter((id): id is string => !!id)
    );
    const submitStartedAt = new Date().toISOString();
    // Allow a small clock skew window when filtering client-side
    const sinceMs = Date.parse(submitStartedAt) - 60_000;

    const appFrame = await openCreateInvoice(page);
    await setAdhoc(appFrame, true);
    await expect(appFrame.getByRole('switch').first()).toBeChecked({ timeout: 15000 });
    await expect(appFrame.getByRole('radio', { name: 'Brand New' })).toBeChecked({
      timeout: 15000,
    });

    let project: ProjectFixture | null = null;
    for (const candidate of candidates) {
      const outcome = await selectPartnerAndProject(appFrame, candidate);
      const stuck = await selectedProjectButton(appFrame, candidate.projectName)
        .isVisible()
        .catch(() => false);
      if (outcome !== 'duplicate' && stuck) {
        project = candidate;
        break;
      }
      await dismissDuplicateDialog(appFrame);
    }
    test.skip(!project, 'All adhoc candidates hit Duplicate Project!');

    await selectProduct(appFrame, fixtures.editableProduct!.name);
    await fillLineItem(page, appFrame, {
      description: LINE_DESCRIPTION,
      qty: '1',
      rate: '50',
    });
    // Gallery can grow a blank second row after product OnChange — that blocks Submit
    await keepSingleLineItemRow(appFrame);

    // Product OnChange can clear Project (sometimes Partner) — restore before tax/Submit
    const findPartner = appFrame.getByRole('button', { name: 'Find Partner' });
    const findProject = appFrame.getByRole('button', { name: 'Find Project' });
    if (await findPartner.isVisible().catch(() => false)) {
      await selectPartner(appFrame, project!.partnerName);
    }
    if (await findProject.isVisible().catch(() => false)) {
      await selectProject(appFrame, project!.projectName);
      if (await duplicateLocators(appFrame).title.isVisible().catch(() => false)) {
        await dismissDuplicateDialog(appFrame);
        test.skip(true, 'Project re-select after product hit Duplicate Project!');
      }
      await expect(selectedProjectButton(appFrame, project!.projectName)).toBeVisible({
        timeout: 15000,
      });
    }

    // NA invoices require tax before Submit enables
    const findTax = appFrame.getByRole('button', { name: 'Find Tax' });
    const taxAlready = appFrame
      .getByRole('button', { name: /^Selected:/ })
      .filter({ hasText: /%/ })
      .or(appFrame.getByRole('button', { name: /\(\d+(\.\d+)?%\)/ }));
    await expect(findTax.or(taxAlready.first())).toBeVisible({ timeout: 20000 });
    if (await findTax.isVisible().catch(() => false)) {
      await selectTaxIfPresent(appFrame);
    }

    await expect(appFrame.getByRole('button', { name: 'Submit' })).toBeEnabled({
      timeout: 30000,
    });

    await test.step('Adhoc form ready — before Submit', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Adhoc Invoice', { exact: true }),
          selectedPartnerButton(appFrame, project!.partnerName),
          selectedProjectButton(appFrame, project!.projectName),
          appFrame.getByRole('button', { name: 'Submit' }),
        ],
        'Adhoc form ready — before Submit',
        testInfo
      );
    });

    await appFrame.getByRole('button', { name: 'Submit' }).click();
    await awaitSubmitNavigatedToOverview(appFrame);

    await test.step('Submitted adhoc — Invoice Overview', async () => {
      await markGroupAndShot(
        page,
        [
          appFrame.getByText('Invoice Overview', { exact: true }).first(),
          appFrame.getByText(project!.projectName).first(),
          appFrame.getByText(/Submitted|Draft|Reviewed|Pending|Fail-/i).first(),
        ],
        'Submitted adhoc — Invoice Overview',
        testInfo
      );
    });

    logNetworkHits('Flow-related network during Submit', networkHits);
    for (const hit of networkHits) {
      console.log(`  full: ${hit.method} ${hit.url}`);
    }

    // Poll flowruns — prefer client-side "new since baseline" (elastic $filter on starttime can miss)
    let postRuns: FlowRunRow[] = [];
    let flowrunsReadable = baselineRuns.ok;
    if (flowrunsReadable) {
      await expect
        .poll(
          async () => {
            const latest = await listRecentFlowRuns(dataverseToken, { top: 50 });
            if (!latest.ok) {
              flowrunsReadable = false;
              return 1;
            }
            postRuns = latest.runs.filter((r) => {
              const id = r.flowrunid || r.name || '';
              const startMs = r.starttime ? Date.parse(r.starttime) : NaN;
              const isNewId = !!id && !baselineRunIds.has(id);
              const isRecent = Number.isFinite(startMs) && startMs >= sinceMs;
              // Require both: new run id AND started near/after this Submit
              return isNewId && isRecent;
            });
            // Deduplicate by run id
            const seen = new Set<string>();
            postRuns = postRuns.filter((r) => {
              const id = r.flowrunid || r.name || JSON.stringify(r);
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
            return postRuns.length;
          },
          { timeout: 120000, intervals: [3000, 5000, 8000] }
        )
        .toBeGreaterThan(0)
        .catch(() => undefined);
    }

    if (flowrunsReadable) {
      logFlowRuns(
        'Flowruns since Submit (includes child if parentrunid set)',
        postRuns,
        flowNameById
      );
      const children = postRuns.filter((r) => r.parentrunid || r.isprimary === false);
      const parents = postRuns.filter(
        (r) => r.isprimary === true || (!r.parentrunid && r.isprimary !== false)
      );
      console.log(`Primary-ish runs: ${parents.length}; child runs: ${children.length}`);
    } else {
      console.log(
        'flowruns table not readable or empty ingestion — rely on network capture + invoice dia_status for tracking.'
      );
    }

    // At least one signal: network hit OR flowrun row OR we still completed Submit (UI proof)
    const hasNetworkSignal = networkHits.length > 0;
    const hasFlowRunSignal = flowrunsReadable && postRuns.length > 0;
    console.log(
      JSON.stringify(
        {
          hasNetworkSignal,
          hasFlowRunSignal,
          networkHitCount: networkHits.length,
          flowRunCount: postRuns.length,
          inventoryCount: inventoryFlows.length,
        },
        null,
        2
      )
    );

    await testInfo.attach('flow-tracking-summary.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            submitStartedAt,
            project: project
              ? {
                  partnerName: project.partnerName,
                  projectName: project.projectName,
                  projectId: project.projectId,
                }
              : null,
            inventoryCount: inventoryFlows.length,
            invoiceCatalogCount: invoiceCatalog.length,
            invoiceCatalog: invoiceCatalog.map((c) => ({
              name: c.name,
              role: c.role,
              score: c.score,
              workflowid: c.workflowid,
              triggerSummary: c.triggerSummary,
            })),
            inventorySample: invoiceCatalog.slice(0, 30).map((c) => ({
              name: c.name,
              workflowid: c.workflowid,
              role: c.role,
            })),
            networkHits: networkHits.map((h) => ({
              method: h.method,
              url: summarizeUrl(h.url),
              at: h.at,
            })),
            flowrunsReadable,
            flowrunsSinceSubmit: postRuns,
          },
          null,
          2
        ),
        'utf-8'
      ),
      contentType: 'application/json',
    });

    // Soft expectations: inventory without trigger always; post-submit signals when platform exposes them
    expect.soft(invoiceCatalog.length).toBeGreaterThan(0);
    expect(
      hasNetworkSignal || hasFlowRunSignal,
      'Expected flow invoke network traffic and/or new flowrun rows after Submit'
    ).toBeTruthy();
    if (flowrunsReadable && postRuns.length > 0) {
      const childRuns = postRuns.filter((r) => !!r.parentrunid || r.isprimary === false);
      console.log(
        `Detected ${postRuns.length} new flow run(s); ${childRuns.length} child run(s) with parentrunid/isprimary=false`
      );
      expect.soft(postRuns.length).toBeGreaterThan(0);
    } else if (flowrunsReadable) {
      console.log(
        'No new flowruns ingested yet within poll window — network invoke still proves a flow was triggered.'
      );
    }
  });
});

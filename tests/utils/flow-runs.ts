/**
 * Power Automate flow inventory + post-Submit run capture for Invoice reports.
 */
import { request, type Page, type Request, type TestInfo } from '@playwright/test';
import { DATAVERSE_URL } from '../../config/env';

export type WorkflowRow = {
  workflowid?: string;
  name?: string;
  uniquename?: string;
  statecode?: number;
  category?: number;
};

export type FlowRunRow = {
  flowrunid?: string;
  name?: string;
  status?: string;
  errorcode?: string;
  errormessage?: string;
  workflowid?: string;
  starttime?: string;
  endtime?: string;
  createdon?: string;
  isprimary?: boolean;
  parentrunid?: string;
  triggertype?: string;
  '_workflow_value'?: string;
  'sarah.b@example.net.V1.FormattedValue'?: string;
};

export type CapturedFlowCall = {
  method: string;
  url: string;
  at: string;
};

export type FlowRunSummary = {
  flowName: string;
  workflowId: string;
  runId: string;
  status: string;
  starttime?: string;
  endtime?: string;
  errorcode?: string;
  errormessage?: string;
  isprimary?: boolean;
  parentrunid?: string;
  matchedExpected: boolean;
};

export type FlowReport = {
  action: 'Submit' | 'Save Draft' | 'Update';
  regionKind: 'north-america' | 'other' | 'unknown';
  expectedFlowNamePattern: string;
  expectedFlow?: { name: string; workflowId: string; state: string };
  expectedFlowLatestRun?: FlowRunSummary;
  submitStartedAt: string;
  project?: { partnerName: string; projectName: string; region?: string };
  flowrunsReadable: boolean;
  networkHitCount: number;
  networkHits: { method: string; url: string; at: string }[];
  runs: FlowRunSummary[];
  matchedCreateFlow?: FlowRunSummary;
  success: boolean;
  notes: string[];
};

const ODATA_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  Prefer: 'odata.include-annotations="*"',
});

const WORKFLOW_CATEGORY_MODERN_FLOW = 5;

export function isNorthAmericaRegion(region?: string | null): boolean {
  return /north\s*america/i.test(region ?? '');
}

/** Expected parent create-flow name patterns by region (product naming). */
export function expectedCreateInvoiceFlowPattern(
  regionKind: 'north-america' | 'other' | 'unknown'
): RegExp {
  if (regionKind === 'north-america') {
    return /create\s*invoice.*na|create\s*invoice.*north\s*america/i;
  }
  if (regionKind === 'other') {
    return /create\s*invoice.*other/i;
  }
  return /create\s*invoice/i;
}

export function expectedUpdateInvoiceFlowPattern(
  regionKind: 'north-america' | 'other' | 'unknown'
): RegExp {
  if (regionKind === 'north-america') {
    return /update\s*invoice.*na|update\s*invoice.*north\s*america/i;
  }
  if (regionKind === 'other') {
    return /update\s*invoice.*other/i;
  }
  return /update\s*invoice/i;
}

export function regionKindFromFixture(
  region?: string | null
): 'north-america' | 'other' | 'unknown' {
  if (!region) return 'unknown';
  return isNorthAmericaRegion(region) ? 'north-america' : 'other';
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

function isFlowRelatedUrl(url: string): boolean {
  return /flow\.microsoft\.com|powerautomate\.com|api\.flow|invokeFlow|InvokeFlow|\/flows\/|workflowruns|flowruns|ProcessSimple|logic\.azure\.com|azure-apim\.net|api\.powerplatform\.com|powerautomate\/automations|ExecuteWorkflow|cloudflow/i.test(
    url
  );
}

function runIdOf(run: FlowRunRow): string {
  return run.flowrunid || run.name || '';
}

function workflowIdOf(run: FlowRunRow): string {
  return (run.workflowid ?? run['_workflow_value'] ?? '').replace(/[{}]/g, '').toLowerCase();
}

export async function dvGet<T>(
  token: string,
  pathAndQuery: string,
  extraHeaders?: Record<string, string>
): Promise<{ ok: boolean; status: number; body: T | null; raw: string }> {
  const api = await request.newContext();
  try {
    const url = pathAndQuery.startsWith('http')
      ? pathAndQuery
      : `${DATAVERSE_URL}/api/data/v9.2/${pathAndQuery}`;
    const res = await api.get(url, {
      headers: { ...ODATA_HEADERS(token), ...extraHeaders },
    });
    const raw = await res.text();
    let body: T | null = null;
    try {
      body = JSON.parse(raw) as T;
    } catch {
      body = null;
    }
    return { ok: res.ok(), status: res.status(), body, raw };
  } finally {
    await api.dispose();
  }
}

/**
 * List modern (cloud) flows. Dataverse `$top` is treated as a hard cap *without*
 * `@odata.nextLink` on this org — a `$top=200` page ended at names starting with S
 * and dropped **Update Invoice - NA/Other Region**. Page via `odata.maxpagesize`
 * and follow nextLink until exhausted.
 */
export async function listCloudFlows(token: string): Promise<{
  ok: boolean;
  status: number;
  flows: WorkflowRow[];
  errorSnippet: string;
}> {
  const select = 'workflowid,name,uniquename,statecode,category';
  const filter = encodeURIComponent(`category eq ${WORKFLOW_CATEGORY_MODERN_FLOW}`);
  return listWorkflowsPages(
    token,
    `workflows?$select=${select}&$filter=${filter}&$orderby=name asc`
  );
}

/** Name search across cloud flows (and, if empty, any workflow category). */
export async function searchWorkflowsByName(
  token: string,
  nameContains: string
): Promise<{
  ok: boolean;
  status: number;
  flows: WorkflowRow[];
  errorSnippet: string;
}> {
  const needle = nameContains.replace(/'/g, "''");
  const select = 'workflowid,name,uniquename,statecode,category';
  const cloud = encodeURIComponent(
    `category eq ${WORKFLOW_CATEGORY_MODERN_FLOW} and contains(name,'${needle}')`
  );
  const anyCat = encodeURIComponent(`contains(name,'${needle}')`);
  const first = await listWorkflowsPages(
    token,
    `workflows?$select=${select}&$filter=${cloud}&$orderby=name asc`
  );
  if (!first.ok || first.flows.length > 0) return first;
  return listWorkflowsPages(
    token,
    `workflows?$select=${select}&$filter=${anyCat}&$orderby=name asc`
  );
}

async function listWorkflowsPages(
  token: string,
  firstPathAndQuery: string
): Promise<{
  ok: boolean;
  status: number;
  flows: WorkflowRow[];
  errorSnippet: string;
}> {
  const flows: WorkflowRow[] = [];
  let next: string | undefined = firstPathAndQuery;
  let lastStatus = 0;
  let lastRaw = '';

  while (next) {
    const result = await dvGet<{ value?: WorkflowRow[]; '@odata.nextLink'?: string }>(
      token,
      next,
      { Prefer: 'odata.include-annotations="*",odata.maxpagesize=500' }
    );
    lastStatus = result.status;
    lastRaw = result.raw;
    if (!result.ok) {
      return { ok: false, status: lastStatus, flows, errorSnippet: lastRaw.slice(0, 400) };
    }
    flows.push(...(result.body?.value ?? []));
    next = result.body?.['@odata.nextLink'] || undefined;
    if (flows.length >= 2000) break;
  }

  return { ok: true, status: lastStatus, flows, errorSnippet: '' };
}

const FLOW_RUN_SELECTS = [
  'flowrunid,name,status,errorcode,errormessage,workflowid,starttime,endtime,isprimary,parentrunid,triggertype,createdon',
  'flowrunid,name,status,errorcode,errormessage,workflowid,starttime,endtime,createdon',
  'flowrunid,name,status,starttime,endtime,workflowid',
] as const;

async function queryFlowRuns(
  token: string,
  opts: { top: number; filter?: string; orderby: string }
): Promise<{
  ok: boolean;
  status: number;
  runs: FlowRunRow[];
  errorSnippet: string;
}> {
  const filterQs = opts.filter ? `&$filter=${encodeURIComponent(opts.filter)}` : '';
  let last: { ok: boolean; status: number; body: { value?: FlowRunRow[] } | null; raw: string } = {
    ok: false,
    status: 0,
    body: null,
    raw: '',
  };

  for (const select of FLOW_RUN_SELECTS) {
    last = await dvGet<{ value?: FlowRunRow[] }>(
      token,
      `flowruns?$select=${select}&$orderby=${opts.orderby}&$top=${opts.top}${filterQs}`
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

export async function listRecentFlowRuns(
  token: string,
  opts: { top?: number } = {}
): Promise<{
  ok: boolean;
  status: number;
  runs: FlowRunRow[];
  errorSnippet: string;
}> {
  const top = opts.top ?? 50;
  const byStart = await queryFlowRuns(token, { top, orderby: 'starttime desc' });
  if (byStart.ok) return byStart;
  return queryFlowRuns(token, { top, orderby: 'createdon desc' });
}

/** Runs for one cloud flow (avoids busy-org top-N miss). */
export async function listFlowRunsForWorkflow(
  token: string,
  workflowId: string,
  opts: { top?: number } = {}
): Promise<{
  ok: boolean;
  status: number;
  runs: FlowRunRow[];
  errorSnippet: string;
}> {
  const top = opts.top ?? 20;
  const guid = workflowId.replace(/[{}]/g, '');
  const filters = [`_workflow_value eq ${guid}`, `workflowid eq ${guid}`];

  let lastOk: {
    ok: boolean;
    status: number;
    runs: FlowRunRow[];
    errorSnippet: string;
  } | null = null;

  for (const filter of filters) {
    const byStart = await queryFlowRuns(token, { top, filter, orderby: 'starttime desc' });
    if (byStart.ok) {
      lastOk = byStart;
      if (byStart.runs.length > 0) return byStart;
    }
    const byCreated = await queryFlowRuns(token, { top, filter, orderby: 'createdon desc' });
    if (byCreated.ok) {
      lastOk = byCreated;
      if (byCreated.runs.length > 0) return byCreated;
    }
  }

  return (
    lastOk ?? {
      ok: false,
      status: 0,
      runs: [],
      errorSnippet: 'workflow-scoped flowruns query failed',
    }
  );
}

/** Retired copies must never be treated as the live Create/Update parent. */
export function isRetiredInvoiceFlowName(name: string): boolean {
  return /deprecated|\(copy\s*\)|^copy(\s+of)?\b|\bold\b|\bbackup\b|\blegacy\b/i.test(name.trim());
}

function liveFlows(flows: WorkflowRow[]): WorkflowRow[] {
  return flows.filter((f) => !isRetiredInvoiceFlowName(f.name ?? ''));
}

export function findExpectedCreateInvoiceFlows(
  flows: WorkflowRow[],
  regionKind: 'north-america' | 'other' | 'unknown'
): WorkflowRow[] {
  const pattern = expectedCreateInvoiceFlowPattern(regionKind);
  return liveFlows(flows).filter((f) => pattern.test(f.name ?? '') && f.statecode === 1);
}

export function findExpectedUpdateInvoiceFlows(
  flows: WorkflowRow[],
  regionKind: 'north-america' | 'other' | 'unknown'
): WorkflowRow[] {
  const pattern = expectedUpdateInvoiceFlowPattern(regionKind);
  return liveFlows(flows).filter((f) => pattern.test(f.name ?? '') && f.statecode === 1);
}

/** The four live parent flows that own Create Invoice Submit / Edit-resubmit. */
export type MainInvoiceFlowKey = 'create-na' | 'create-other' | 'update-na' | 'update-other';

export const MAIN_INVOICE_FLOW_LABELS: Record<MainInvoiceFlowKey, string> = {
  'create-na': 'Create Invoice - NA Region',
  'create-other': 'Create Invoice - Other Region',
  'update-na': 'Update Invoice - NA Region',
  'update-other': 'Update Invoice - Other Region',
};

function preferLiveOnFlow(matches: WorkflowRow[], exactLabel: string): WorkflowRow | undefined {
  const on = matches.filter((f) => f.statecode === 1);
  const exact = on.find((f) => (f.name ?? '').trim().toLowerCase() === exactLabel.toLowerCase());
  return exact ?? on[0];
}

/**
 * Resolve the four live Create/Update × NA/Other catalog rows.
 * Deprecated / Old / Copy / Backup names are ignored. Off rows are not used as a fallback.
 */
export function pickMainInvoiceFlows(flows: WorkflowRow[]): Record<
  MainInvoiceFlowKey,
  WorkflowRow | undefined
> {
  const catalog = liveFlows(flows);
  const named = (exactLabel: string, test: (name: string) => boolean) =>
    preferLiveOnFlow(
      catalog.filter((f) => test(f.name ?? '')),
      exactLabel
    );

  return {
    'create-na': named(
      MAIN_INVOICE_FLOW_LABELS['create-na'],
      (n) => /create\s*invoice/i.test(n) && /(na\b|north\s*america)/i.test(n) && !/update/i.test(n)
    ),
    'create-other': named(
      MAIN_INVOICE_FLOW_LABELS['create-other'],
      (n) => /create\s*invoice/i.test(n) && /other/i.test(n) && !/update/i.test(n)
    ),
    'update-na': named(
      MAIN_INVOICE_FLOW_LABELS['update-na'],
      (n) => /update\s*invoice/i.test(n) && /(na\b|north\s*america)/i.test(n) && !/create/i.test(n)
    ),
    'update-other': named(
      MAIN_INVOICE_FLOW_LABELS['update-other'],
      (n) => /update\s*invoice/i.test(n) && /other/i.test(n) && !/create/i.test(n)
    ),
  };
}

export function expectedMainFlowKey(
  action: 'Submit' | 'Update',
  regionKind: 'north-america' | 'other' | 'unknown'
): MainInvoiceFlowKey | undefined {
  if (regionKind === 'unknown') return undefined;
  if (action === 'Submit') {
    return regionKind === 'north-america' ? 'create-na' : 'create-other';
  }
  return regionKind === 'north-america' ? 'update-na' : 'update-other';
}

export function attachFlowNetworkCapture(page: Page): CapturedFlowCall[] {
  const hits: CapturedFlowCall[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (!isFlowRelatedUrl(url)) return;
    hits.push({ method: req.method(), url, at: new Date().toISOString() });
  });
  return hits;
}

export function buildFlowNameMap(flows: WorkflowRow[]): Map<string, string> {
  return new Map(
    flows
      .filter((f) => f.workflowid && f.name)
      .map((f) => [(f.workflowid as string).replace(/[{}]/g, '').toLowerCase(), f.name as string])
  );
}

function resolveFlowName(run: FlowRunRow, flowNameById: Map<string, string>): string {
  const wfId = workflowIdOf(run);
  return (
    (wfId && flowNameById.get(wfId)) ||
    run['sarah.b@example.net.V1.FormattedValue'] ||
    '(unknown flow)'
  );
}

function isCandidateRun(run: FlowRunRow, baselineRunIds: Set<string>, sinceMs: number): boolean {
  const id = runIdOf(run);
  const startMs = run.starttime ? Date.parse(run.starttime) : NaN;
  const createdMs = run.createdon ? Date.parse(run.createdon) : NaN;
  const isNewId = !!id && !baselineRunIds.has(id);
  const isRecent =
    (Number.isFinite(startMs) && startMs >= sinceMs) ||
    (Number.isFinite(createdMs) && createdMs >= sinceMs);
  return isNewId && isRecent;
}

function dedupeRuns(runs: FlowRunRow[]): FlowRunRow[] {
  const seen = new Set<string>();
  return runs.filter((r) => {
    const id = runIdOf(r) || JSON.stringify(r);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function waitForNewFlowRuns(opts: {
  token: string;
  baselineRunIds: Set<string>;
  sinceMs: number;
  timeoutMs?: number;
  workflowIds?: string[];
}): Promise<{
  readable: boolean;
  runs: FlowRunRow[];
  expectedNewRuns: FlowRunRow[];
  expectedLatest: FlowRunRow | undefined;
  latestSample: FlowRunRow[];
}> {
  const { token, baselineRunIds, sinceMs, timeoutMs = 90000, workflowIds = [] } = opts;
  let readable = true;
  let postRuns: FlowRunRow[] = [];
  let expectedNewRuns: FlowRunRow[] = [];
  let expectedLatest: FlowRunRow | undefined;
  let latestSample: FlowRunRow[] = [];
  const started = Date.now();
  let loggedScopedKey = '';

  while (Date.now() - started < timeoutMs) {
    const latest = await listRecentFlowRuns(token, { top: 100 });
    if (!latest.ok) {
      readable = false;
      break;
    }
    latestSample = latest.runs.slice(0, 8);

    const scoped: FlowRunRow[] = [];
    for (const workflowId of workflowIds) {
      const forWf = await listFlowRunsForWorkflow(token, workflowId, { top: 15 });
      if (forWf.ok) {
        scoped.push(...forWf.runs);
        const key = `${forWf.runs[0]?.status ?? ''}|${forWf.runs[0]?.starttime ?? ''}|${forWf.runs.length}`;
        if (forWf.runs.length && key !== loggedScopedKey) {
          loggedScopedKey = key;
          console.log(
            `Workflow-scoped flowruns (${workflowId.slice(0, 8)}…): ${forWf.runs.length} row(s); latest status=${forWf.runs[0]?.status ?? '?'} start=${forWf.runs[0]?.starttime ?? '?'}`
          );
        }
      } else {
        console.log(
          `Workflow-scoped flowruns failed (${workflowId.slice(0, 8)}…): ${forWf.status} ${forWf.errorSnippet}`
        );
      }
    }
    expectedLatest = scoped[0];

    const wanted = new Set(workflowIds.map((id) => id.replace(/[{}]/g, '').toLowerCase()));
    const scopedNew = scoped.filter((r) => isCandidateRun(r, baselineRunIds, sinceMs));
    const globalNew = latest.runs.filter((r) => isCandidateRun(r, baselineRunIds, sinceMs));
    const namedHits =
      wanted.size === 0
        ? globalNew
        : globalNew.filter((r) => wanted.has(workflowIdOf(r)));
    expectedNewRuns = dedupeRuns([...scopedNew, ...namedHits]);
    postRuns = dedupeRuns([...expectedNewRuns, ...globalNew]);

    if (expectedNewRuns.length > 0) break;
    if (postRuns.length > 0 && Date.now() - started > 25000) break;
    await new Promise((r) => setTimeout(r, 4000));
  }

  return { readable, runs: postRuns, expectedNewRuns, expectedLatest, latestSample };
}

export function toFlowRunSummaries(
  runs: FlowRunRow[],
  flowNameById: Map<string, string>,
  expectedPattern: RegExp
): FlowRunSummary[] {
  return runs.map((r) => {
    const flowName = resolveFlowName(r, flowNameById);
    const workflowId = workflowIdOf(r);
    return {
      flowName,
      workflowId,
      runId: r.flowrunid || r.name || '',
      status: r.status ?? 'Unknown',
      starttime: r.starttime,
      endtime: r.endtime,
      errorcode: r.errorcode,
      errormessage: r.errormessage,
      isprimary: r.isprimary,
      parentrunid: r.parentrunid,
      matchedExpected: expectedPattern.test(flowName),
    };
  });
}

export function isSuccessfulFlowStatus(status?: string): boolean {
  return /^(Succeeded|Successful|Completed|Success)$/i.test(status ?? '');
}

export async function attachFlowReport(
  testInfo: TestInfo,
  report: FlowReport
): Promise<void> {
  const lines = [
    `# Flow report — ${report.action}`,
    '',
    `- Region kind: **${report.regionKind}**`,
    `- Expected parent flow pattern: \`${report.expectedFlowNamePattern}\``,
    `- Expected parent flow: **${report.expectedFlow?.name ?? '(not in catalog)'}** (${report.expectedFlow?.state ?? 'n/a'})`,
    report.expectedFlow?.workflowId ? `- Expected workflow id: ${report.expectedFlow.workflowId}` : '',
    `- Submit started: ${report.submitStartedAt}`,
    `- Project: ${
      report.project
        ? `${report.project.partnerName} / ${report.project.projectName} (${report.project.region ?? 'n/a'})`
        : 'n/a'
    }`,
    `- Flowruns readable: ${report.flowrunsReadable}`,
    `- Network flow hits: ${report.networkHitCount}`,
    `- Overall success: **${report.success ? 'YES' : 'NO'}**`,
    '',
    `## Latest run of expected ${report.action === 'Update' ? 'Update' : 'Create'} Invoice flow (catalog)`,
    report.expectedFlowLatestRun
      ? [
          `- Name: **${report.expectedFlowLatestRun.flowName}**`,
          `- Status: **${report.expectedFlowLatestRun.status}**`,
          `- Run id: ${report.expectedFlowLatestRun.runId}`,
          `- Start: ${report.expectedFlowLatestRun.starttime ?? 'n/a'}`,
          `- End: ${report.expectedFlowLatestRun.endtime ?? 'n/a'}`,
          report.expectedFlowLatestRun.errormessage
            ? `- Error: ${report.expectedFlowLatestRun.errorcode ?? ''} ${report.expectedFlowLatestRun.errormessage}`
            : '- Error: (none)',
        ].join('\n')
      : `_No runs found for the expected ${report.action === 'Update' ? 'Update' : 'Create'} Invoice flow._`,
    '',
    `## Matched ${report.action === 'Update' ? 'update' : 'create'} flow (this ${report.action})`,
    report.matchedCreateFlow
      ? [
          `- Name: **${report.matchedCreateFlow.flowName}**`,
          `- Status: **${report.matchedCreateFlow.status}**`,
          `- Run id: ${report.matchedCreateFlow.runId}`,
          `- Workflow id: ${report.matchedCreateFlow.workflowId}`,
          `- Start: ${report.matchedCreateFlow.starttime ?? 'n/a'}`,
          `- End: ${report.matchedCreateFlow.endtime ?? 'n/a'}`,
          report.matchedCreateFlow.errorcode || report.matchedCreateFlow.errormessage
            ? `- Error: ${report.matchedCreateFlow.errorcode ?? ''} ${report.matchedCreateFlow.errormessage ?? ''}`
            : '- Error: (none)',
        ].join('\n')
      : `_No matching ${report.action === 'Update' ? 'update' : 'create'}-invoice flow run found in poll window._`,
    '',
    '## All runs since submit',
    ...(report.runs.length
      ? report.runs.map(
          (r) =>
            `- **${r.flowName}** | status=${r.status} | run=${r.runId}` +
            (r.matchedExpected ? ' | MATCHED' : '') +
            (r.errormessage ? ` | err=${r.errormessage.slice(0, 160)}` : '')
        )
      : ['_No new flowruns._']),
    '',
    '## Notes',
    ...(report.notes.length ? report.notes.map((n) => `- ${n}`) : ['- (none)']),
  ].join('\n');

  await testInfo.attach('flow-report.md', {
    body: Buffer.from(lines, 'utf-8'),
    contentType: 'text/markdown',
  });

  await testInfo.attach('flow-report.json', {
    body: Buffer.from(JSON.stringify(report, null, 2), 'utf-8'),
    contentType: 'application/json',
  });

  console.log('\n=== Flow report ===');
  console.log(lines);
}

export async function capturePostSubmitFlowReport(opts: {
  /** Unused — network hits are collected up front, so callers may close the page first. */
  page?: Page;
  token: string;
  testInfo: TestInfo;
  action?: 'Submit' | 'Save Draft' | 'Update';
  regionKind: 'north-america' | 'other' | 'unknown';
  project?: { partnerName: string; projectName: string; region?: string };
  networkHits: CapturedFlowCall[];
  submitStartedAt: string;
  baselineRunIds: Set<string>;
  /** Budget for the flowruns poll. Keep small — the table lags, so long waits are dead time. */
  waitMs?: number;
}): Promise<FlowReport> {
  const action = opts.action ?? 'Submit';
  const expectedPattern =
    action === 'Update'
      ? expectedUpdateInvoiceFlowPattern(opts.regionKind)
      : expectedCreateInvoiceFlowPattern(opts.regionKind);
  const notes: string[] = [];

  const inventory = await listCloudFlows(opts.token);
  const flowNameById = buildFlowNameMap(inventory.ok ? inventory.flows : []);
  const expectedFlows = inventory.ok
    ? action === 'Update'
      ? findExpectedUpdateInvoiceFlows(inventory.flows, opts.regionKind)
      : findExpectedCreateInvoiceFlows(inventory.flows, opts.regionKind)
    : [];
  if (!inventory.ok) {
    notes.push(`Cloud flow inventory failed: ${inventory.status} ${inventory.errorSnippet}`);
  } else {
    const namedParents = inventory.flows.filter((f) =>
      /(create|update)\s*invoice/i.test(f.name ?? '')
    );
    notes.push(
      `Inventory: ${inventory.flows.length} modern flows; ${namedParents.length} name-match Create/Update Invoice*`
    );
    for (const f of namedParents.slice(0, 16)) {
      notes.push(
        `  catalog: ${f.name} (${f.statecode === 1 ? 'On' : 'Off'}) id=${f.workflowid ?? '?'}`
      );
    }
    if (expectedFlows.length) {
      notes.push(
        `Expected On flow(s) for ${opts.regionKind}: ${expectedFlows.map((f) => f.name).join(', ')}`
      );
    } else {
      notes.push(`No On catalog flow matched ${expectedPattern} for ${opts.regionKind}`);
    }
  }

  const sinceMs = Date.parse(opts.submitStartedAt) - 60_000;
  const { readable, runs, expectedNewRuns, expectedLatest, latestSample } =
    await waitForNewFlowRuns({
      token: opts.token,
      baselineRunIds: opts.baselineRunIds,
      sinceMs,
      timeoutMs: opts.waitMs ?? 30000,
      workflowIds: expectedFlows.map((f) => f.workflowid).filter((id): id is string => !!id),
    });

  if (expectedLatest) {
    notes.push(
      `Latest catalog run for expected flow: status=${expectedLatest.status ?? '?'} start=${expectedLatest.starttime ?? '?'} run=${runIdOf(expectedLatest) || '?'}`
    );
  }

  if (latestSample.length) {
    notes.push('Latest org flowruns sample (unfiltered):');
    for (const r of latestSample) {
      notes.push(
        `  ${resolveFlowName(r, flowNameById)} | status=${r.status ?? '?'} | start=${r.starttime ?? r.createdon ?? '?'} | run=${runIdOf(r) || '?'}`
      );
    }
  }

  if (!readable) {
    notes.push('flowruns table not readable — relying on network capture + UI status.');
  }

  const parentNameRe = action === 'Update' ? /update\s*invoice/i : /create\s*invoice/i;
  let summaries = toFlowRunSummaries(runs, flowNameById, expectedPattern);
  if (!summaries.some((s) => s.matchedExpected || parentNameRe.test(s.flowName))) {
    const sampleHits = toFlowRunSummaries(latestSample, flowNameById, expectedPattern).filter(
      (s) =>
        (s.matchedExpected || parentNameRe.test(s.flowName)) &&
        ((s.starttime && Date.parse(s.starttime) >= sinceMs) || !s.starttime)
    );
    if (sampleHits.length) {
      notes.push(
        `Matched ${action === 'Update' ? 'Update' : 'Create'} Invoice run from latest org sample (not in new-id window).`
      );
      const seen = new Set(summaries.map((s) => s.runId));
      summaries = [...summaries, ...sampleHits.filter((s) => !seen.has(s.runId))];
    }
  }
  const expectedNewSummaries = toFlowRunSummaries(expectedNewRuns, flowNameById, expectedPattern);
  const expectedLatestSummary = expectedLatest
    ? toFlowRunSummaries([expectedLatest], flowNameById, expectedPattern)[0]
    : undefined;
  const matchedCreateFlow =
    expectedNewSummaries.find((s) => s.matchedExpected) ||
    summaries.find((s) => s.matchedExpected) ||
    summaries.find((s) => parentNameRe.test(s.flowName)) ||
    expectedLatestSummary;

  const expectedFlow = expectedFlows[0]
    ? {
        name: expectedFlows[0].name ?? '(unnamed)',
        workflowId: expectedFlows[0].workflowid ?? '',
        state: expectedFlows[0].statecode === 1 ? 'On' : 'Off',
      }
    : undefined;

  const networkHitCount = opts.networkHits.length;
  const flowSucceeded = matchedCreateFlow
    ? isSuccessfulFlowStatus(matchedCreateFlow.status)
    : false;
  const success =
    flowSucceeded ||
    networkHitCount > 0 ||
    summaries.some((s) => isSuccessfulFlowStatus(s.status));

  if (matchedCreateFlow && !flowSucceeded) {
    notes.push(
      `Matched flow "${matchedCreateFlow.flowName}" ended with status=${matchedCreateFlow.status}` +
        (matchedCreateFlow.errormessage ? `: ${matchedCreateFlow.errormessage}` : '')
    );
  }
  if (!expectedNewRuns.length && readable) {
    notes.push(
      `No new ${action === 'Update' ? 'Update' : 'Create'} Invoice flowrun after this ${action} — reporting latest catalog run + other new runs.`
    );
  }
  if (networkHitCount > 0) {
    notes.push(`Captured ${networkHitCount} flow-related network request(s).`);
  }

  const report: FlowReport = {
    action,
    regionKind: opts.regionKind,
    expectedFlowNamePattern: expectedPattern.source,
    expectedFlow,
    expectedFlowLatestRun: expectedLatestSummary,
    submitStartedAt: opts.submitStartedAt,
    project: opts.project,
    flowrunsReadable: readable,
    networkHitCount,
    networkHits: opts.networkHits.map((h) => ({
      method: h.method,
      url: summarizeUrl(h.url),
      at: h.at,
    })),
    runs: summaries,
    matchedCreateFlow,
    success,
    notes,
  };

  await attachFlowReport(opts.testInfo, report);
  return report;
}

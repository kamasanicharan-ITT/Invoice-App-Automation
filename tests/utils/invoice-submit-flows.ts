/**
 * Create Invoice screen — Submit / resubmit flow evidence.
 *
 * A new Submit is expected to fire the region Create Invoice parent
 * ("Create Invoice - NA Region" or "Create Invoice - Other Region").
 * Editing a Flagged/Draft row and submitting again is expected to fire the
 * matching Update Invoice parent. Both Create and Update (NA + Other) are
 * always inventoried so the report shows which of the four actually ran.
 *
 * Attachments (Playwright HTML report):
 *   invoice-submit-evidence.md / .json  — four-flow table + failure detail
 *   flow-family.md / .json              — parent + declared children
 *   invoice-audit.md / .json            — Dataverse row, audits, emails, PDF
 *   flow-failure.md                     — only when a parent run or invoice failed
 */
import { expect, type Page, type TestInfo } from '@playwright/test';
import { captureInvoiceAudit, type InvoiceAuditReport } from './flow-audit';
import { captureFlowFamilyReport, type FlowFamilyReport } from './flow-family';
import {
  attachFlowNetworkCapture,
  buildFlowNameMap,
  expectedMainFlowKey,
  isSuccessfulFlowStatus,
  listCloudFlows,
  listRecentFlowRuns,
  MAIN_INVOICE_FLOW_LABELS,
  pickMainInvoiceFlows,
  regionKindFromFixture,
  waitForNewFlowRuns,
  type CapturedFlowCall,
  type FlowRunSummary,
  type MainInvoiceFlowKey,
  type WorkflowRow,
} from './flow-runs';

export const FLOW_WAIT_MS = Number(process.env.FLOW_WAIT_MS ?? 30000);
export const INVOICE_WAIT_MS = Number(process.env.INVOICE_WAIT_MS ?? 180000);
export const FAMILY_WAIT_MS = Number(process.env.FAMILY_WAIT_MS ?? 30000);
export const FAMILY_CHILD_GRACE_MS = Number(process.env.FAMILY_CHILD_GRACE_MS ?? 15000);

export type SubmitFlowAction = 'Submit' | 'Update';

export type FlowCaptureSession = {
  networkHits: CapturedFlowCall[];
  baselinePromise: ReturnType<typeof listRecentFlowRuns>;
};

export type MainFlowSlot = {
  key: MainInvoiceFlowKey;
  label: string;
  catalogName?: string;
  workflowId?: string;
  state: 'On' | 'Off' | 'missing';
  expected: boolean;
  fired: boolean;
  run?: FlowRunSummary;
};

export type SubmitFlowEvidence = {
  action: SubmitFlowAction;
  regionKind: 'north-america' | 'other' | 'unknown';
  expectedKey?: MainInvoiceFlowKey;
  expectedLabel: string;
  submitStartedAt: string;
  project?: { partnerName: string; projectName: string; region?: string; projectId?: string };
  slots: MainFlowSlot[];
  expectedRun?: FlowRunSummary;
  wrongRegionFired: MainFlowSlot[];
  allSucceeded: boolean;
  failed: boolean;
  failureReasons: string[];
  family: FlowFamilyReport | null;
  audit: InvoiceAuditReport;
  networkHitCount: number;
};

export function beginFlowCapture(page: Page, token: string): FlowCaptureSession {
  return {
    networkHits: attachFlowNetworkCapture(page),
    baselinePromise: listRecentFlowRuns(token, { top: 100 }),
  };
}

function slotFromCatalog(
  key: MainInvoiceFlowKey,
  row: WorkflowRow | undefined,
  expectedKey: MainInvoiceFlowKey | undefined,
  run: FlowRunSummary | undefined
): MainFlowSlot {
  return {
    key,
    label: MAIN_INVOICE_FLOW_LABELS[key],
    catalogName: row?.name,
    workflowId: row?.workflowid,
    state: !row ? 'missing' : row.statecode === 1 ? 'On' : 'Off',
    expected: expectedKey === key,
    fired: !!run,
    run,
  };
}

function runForWorkflow(
  workflowId: string | undefined,
  runs: FlowRunSummary[]
): FlowRunSummary | undefined {
  if (!workflowId) return undefined;
  const id = workflowId.replace(/[{}]/g, '').toLowerCase();
  return runs.find((r) => r.workflowId.replace(/[{}]/g, '').toLowerCase() === id);
}

function toSummariesFromWait(
  runs: { flowrunid?: string; name?: string; status?: string; errorcode?: string; errormessage?: string; workflowid?: string; starttime?: string; endtime?: string; '_workflow_value'?: string }[],
  flowNameById: Map<string, string>
): FlowRunSummary[] {
  return runs.map((r) => {
    const workflowId = (r.workflowid ?? r['_workflow_value'] ?? '').replace(/[{}]/g, '').toLowerCase();
    return {
      flowName: flowNameById.get(workflowId) ?? '(unknown flow)',
      workflowId,
      runId: r.flowrunid || r.name || '',
      status: r.status ?? 'Unknown',
      starttime: r.starttime,
      endtime: r.endtime,
      errorcode: r.errorcode,
      errormessage: r.errormessage,
      matchedExpected: false,
    };
  });
}

async function attachEvidenceMarkdown(
  testInfo: TestInfo,
  evidence: SubmitFlowEvidence
): Promise<void> {
  const slotLine = (s: MainFlowSlot) => {
    const duration =
      s.run?.starttime && s.run.endtime
        ? `${Math.round((Date.parse(s.run.endtime) - Date.parse(s.run.starttime)) / 1000)}s`
        : '?';
    return (
      `| ${s.label} | ${s.expected ? 'YES' : ''} | ${s.catalogName ?? '_(not in catalog)_'} | ${s.state} | ` +
      `${s.fired ? 'YES' : 'no'} | ${s.run?.status ?? ''} | ${s.run?.runId ?? ''} | ${duration} | ` +
      `${(s.run?.errormessage ?? '').replace(/\|/g, '\\|').slice(0, 120)} |`
    );
  };

  const failBlock =
    evidence.failed && evidence.failureReasons.length
      ? [
          '## FAILURE DETAIL',
          '',
          ...evidence.failureReasons.map((r) => `- ${r}`),
          '',
          evidence.expectedRun
            ? [
                `- Failed/parent run: **${evidence.expectedRun.flowName}**`,
                `- Status: **${evidence.expectedRun.status}**`,
                `- Run id: ${evidence.expectedRun.runId}`,
                `- Start: ${evidence.expectedRun.starttime ?? 'n/a'}`,
                `- End: ${evidence.expectedRun.endtime ?? 'n/a'}`,
                `- Error code: ${evidence.expectedRun.errorcode ?? '(none)'}`,
                `- Error message: ${evidence.expectedRun.errormessage ?? '(none)'}`,
              ].join('\n')
            : '- No parent run row synced — see invoice status below as the authoritative outcome.',
          '',
        ]
      : [];

  const lines = [
    `# Invoice submit flow evidence — ${evidence.action}`,
    '',
    `- Region kind: **${evidence.regionKind}**`,
    `- Expected parent: **${evidence.expectedLabel}**`,
    `- Submit started: ${evidence.submitStartedAt}`,
    `- Project: ${
      evidence.project
        ? `${evidence.project.partnerName} / ${evidence.project.projectName} (${evidence.project.region ?? 'n/a'})`
        : 'n/a'
    }`,
    `- Invoice #: **${evidence.audit.invoice?.invoiceNumber || '(not stamped)'}**`,
    `- Invoice status: **${evidence.audit.invoice?.status ?? '(none)'}**`,
    `- Invoice id: ${evidence.audit.invoice?.id ?? '(none)'}`,
    `- Network flow hits: ${evidence.networkHitCount}`,
    `- Outcome: **${evidence.failed ? 'FAILED' : 'OK'}**`,
    '',
    '## Main Create / Update flows',
    '',
    'These four parents own invoice creation and edit-resubmit. Only the region + action',
    'parent is expected; the other three are listed so a wrong-region or unexpected Update',
    'run is visible in the same report.',
    '',
    '| Flow | Expected | Catalog | State | Fired | Status | Run id | Duration | Error |',
    '|---|---|---|---|---|---|---|---|---|',
    ...evidence.slots.map(slotLine),
    '',
    ...failBlock,
    '## Wrong-region / unexpected parent runs',
    evidence.wrongRegionFired.length
      ? evidence.wrongRegionFired
          .map(
            (s) =>
              `- **${s.label}** fired (status=${s.run?.status ?? '?'}, run=${s.run?.runId ?? '?'}) — not the parent for this region/action`
          )
          .join('\n')
      : '_None._',
    '',
    '## Invoice audit (summary)',
    `- Row found: ${evidence.audit.invoiceFound ? 'YES' : 'NO'} (waited ${evidence.audit.waitedMs}ms)`,
    `- Status timeline entries: ${evidence.audit.statusTimeline.length}`,
    `- Audit sources: ${evidence.audit.sources.map((s) => `${s.source}${s.ok ? '' : ' FAIL'}`).join('; ')}`,
    '',
    'Full attachments: `invoice-audit.md`, `flow-family.md`.',
  ].join('\n');

  await testInfo.attach('invoice-submit-evidence.md', {
    body: Buffer.from(lines, 'utf-8'),
    contentType: 'text/markdown',
  });
  await testInfo.attach('invoice-submit-evidence.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          ...evidence,
          audit: {
            ...evidence.audit,
            invoiceRow: undefined,
            sources: evidence.audit.sources.map((s) => ({
              source: s.source,
              ok: s.ok,
              status: s.status,
              count: s.count,
              note: s.note,
            })),
          },
          family: evidence.family
            ? {
                rootName: evidence.family.rootName,
                declaredChildCount: evidence.family.declaredChildCount,
                allSucceeded: evidence.family.allSucceeded,
                waitedMs: evidence.family.waitedMs,
                runs: evidence.family.runs,
                missingRunFlows: evidence.family.missingRunFlows,
                notes: evidence.family.notes,
              }
            : null,
        },
        null,
        2
      ),
      'utf-8'
    ),
    contentType: 'application/json',
  });

  if (evidence.failed) {
    await testInfo.attach('flow-failure.md', {
      body: Buffer.from(
        [
          `# Flow failure — ${evidence.expectedLabel}`,
          '',
          ...evidence.failureReasons.map((r) => `- ${r}`),
          '',
          evidence.expectedRun
            ? [
                '## Parent run',
                `- Name: ${evidence.expectedRun.flowName}`,
                `- Status: **${evidence.expectedRun.status}**`,
                `- Run id: ${evidence.expectedRun.runId}`,
                `- Workflow id: ${evidence.expectedRun.workflowId}`,
                `- Error: ${evidence.expectedRun.errorcode ?? ''} ${evidence.expectedRun.errormessage ?? '(none)'}`,
              ].join('\n')
            : '## Parent run\n_No run row in flowruns within the sweep window._',
          '',
          '## Invoice',
          `- Status: **${evidence.audit.invoice?.status ?? '(none)'}**`,
          `- Invoice #: ${evidence.audit.invoice?.invoiceNumber ?? '(none)'}`,
          `- Id: ${evidence.audit.invoice?.id ?? '(none)'}`,
        ].join('\n'),
        'utf-8'
      ),
      contentType: 'text/markdown',
    });
  }

  console.log('\n=== Invoice submit flow evidence ===');
  console.log(lines);
}

export async function captureSubmitFlowEvidence(opts: {
  token: string;
  testInfo: TestInfo;
  session: FlowCaptureSession;
  action: SubmitFlowAction;
  project?: {
    partnerName: string;
    projectName: string;
    region?: string;
    projectId?: string;
  };
  submitStartedAt: string;
  invoiceId?: string;
  invoiceNumber?: string;
  familyWaitMs?: number;
  invoiceWaitMs?: number;
  flowWaitMs?: number;
}): Promise<SubmitFlowEvidence> {
  const regionKind = regionKindFromFixture(opts.project?.region);
  const expectedKey = expectedMainFlowKey(opts.action, regionKind);
  const expectedLabel = expectedKey
    ? MAIN_INVOICE_FLOW_LABELS[expectedKey]
    : opts.action === 'Update'
      ? 'Update Invoice (region unknown)'
      : 'Create Invoice (region unknown)';

  const baseline = await opts.session.baselinePromise;
  const baselineRunIds = new Set(
    (baseline.ok ? baseline.runs : [])
      .map((r) => r.flowrunid || r.name)
      .filter((id): id is string => !!id)
  );

  const inventory = await listCloudFlows(opts.token);
  const catalog = inventory.ok ? inventory.flows : [];
  const flowNameById = buildFlowNameMap(catalog);
  const main = pickMainInvoiceFlows(catalog);
  const expectedWorkflowId = expectedKey ? main[expectedKey]?.workflowid : undefined;
  const workflowIds = Object.values(main)
    .map((f) => f?.workflowid)
    .filter((id): id is string => !!id);
  const sinceMs = Date.parse(opts.submitStartedAt) - 60_000;
  const waited = await waitForNewFlowRuns({
    token: opts.token,
    baselineRunIds,
    sinceMs,
    timeoutMs: opts.flowWaitMs ?? FLOW_WAIT_MS,
    workflowIds,
  });
  const runSummaries = toSummariesFromWait(
    [...waited.expectedNewRuns, ...waited.runs],
    flowNameById
  );

  const slots = (Object.keys(MAIN_INVOICE_FLOW_LABELS) as MainInvoiceFlowKey[]).map((key) =>
    slotFromCatalog(key, main[key], expectedKey, runForWorkflow(main[key]?.workflowid, runSummaries))
  );
  const expectedSlot = slots.find((s) => s.expected);
  const expectedRun = expectedSlot?.run;
  const wrongRegionFired = slots.filter((s) => !s.expected && s.fired);

  const audit = await captureInvoiceAudit({
    token: opts.token,
    testInfo: opts.testInfo,
    projectId: opts.project?.projectId,
    projectName: opts.project?.projectName ?? '(unknown project)',
    partnerName: opts.project?.partnerName ?? '(unknown partner)',
    submitStartedAt: opts.submitStartedAt,
    expectedWorkflowId,
    matchedRunId: expectedRun?.runId,
    invoiceWaitMs: opts.invoiceWaitMs ?? INVOICE_WAIT_MS,
    invoiceId: opts.invoiceId,
    invoiceNumber: opts.invoiceNumber,
    mode: opts.action === 'Update' ? 'update' : 'create',
  });

  const family =
    expectedWorkflowId && catalog.length
      ? await captureFlowFamilyReport({
          token: opts.token,
          testInfo: opts.testInfo,
          rootWorkflowId: expectedWorkflowId,
          catalog,
          flowNameById,
          submitStartedAt: opts.submitStartedAt,
          regionLabel: expectedLabel,
          familyWaitMs: opts.familyWaitMs ?? FAMILY_WAIT_MS,
          childGraceMs: FAMILY_CHILD_GRACE_MS,
        })
      : null;

  const failureReasons: string[] = [];
  const invoiceStatus = audit.invoice?.status ?? '';
  if (/^Fail-/i.test(invoiceStatus)) {
    failureReasons.push(
      `Invoice landed in **${invoiceStatus}** — the ${opts.action === 'Update' ? 'Update' : 'Create'} flow failed on the record.`
    );
  }
  if (expectedRun && !isSuccessfulFlowStatus(expectedRun.status)) {
    failureReasons.push(
      `Expected parent **${expectedLabel}** ended with status **${expectedRun.status}**` +
        (expectedRun.errormessage ? `: ${expectedRun.errormessage}` : '')
    );
  }
  if (family) {
    for (const run of family.runs) {
      if (!isSuccessfulFlowStatus(run.status)) {
        failureReasons.push(
          `${run.depth === 0 ? 'Parent' : 'Child'} **${run.flowName}** status=${run.status}` +
            (run.errormessage ? ` err=${run.errormessage}` : '')
        );
      }
    }
  }

  const evidence: SubmitFlowEvidence = {
    action: opts.action,
    regionKind,
    expectedKey,
    expectedLabel,
    submitStartedAt: opts.submitStartedAt,
    project: opts.project,
    slots,
    expectedRun,
    wrongRegionFired,
    allSucceeded: !failureReasons.length,
    failed: failureReasons.length > 0,
    failureReasons: [...new Set(failureReasons)],
    family,
    audit,
    networkHitCount: opts.session.networkHits.length,
  };

  await attachEvidenceMarkdown(opts.testInfo, evidence);
  return evidence;
}

/**
 * Soft-assert the evidence: invoice must exist and must not be Fail-*;
 * expected parent catalog row must exist; parent run success is soft because
 * flowruns lag. Missing run rows are not treated as failure when the invoice settled.
 */
export function assertSubmitFlowEvidence(evidence: SubmitFlowEvidence): void {
  expect(evidence.audit.invoiceFound, 'Submit should leave a dia_invoicedetails row').toBeTruthy();
  expect
    .soft(
      evidence.audit.invoice?.status ?? '',
      `Invoice must not land in Fail-* (got "${evidence.audit.invoice?.status ?? ''}")`
    )
    .not.toMatch(/^Fail-/i);

  if (evidence.expectedKey) {
    const expectedSlot = evidence.slots.find((s) => s.key === evidence.expectedKey);
    expect
      .soft(
        expectedSlot?.catalogName,
        `Expected an On catalog flow named like "${evidence.expectedLabel}"`
      )
      .toBeTruthy();
    expect
      .soft(expectedSlot?.state ?? 'missing', `${evidence.expectedLabel} should be On`)
      .toBe('On');
  }

  if (evidence.expectedRun) {
    expect
      .soft(
        isSuccessfulFlowStatus(evidence.expectedRun.status),
        `Flow "${evidence.expectedRun.flowName}" status=${evidence.expectedRun.status}` +
          (evidence.expectedRun.errormessage ? ` err=${evidence.expectedRun.errormessage}` : '')
      )
      .toBeTruthy();
  }

  const invoiceSettledOk = /^(Submitted|Reviewed|Approved|Sent)/i.test(
    evidence.audit.invoice?.status ?? ''
  );
  const parentTracked = !!evidence.expectedRun || (evidence.family?.runs.some((r) => r.depth === 0) ?? false);
  expect
    .soft(
      parentTracked || invoiceSettledOk,
      `Neither a parent run for ${evidence.expectedLabel} nor a settled invoice status ` +
        `(got "${evidence.audit.invoice?.status ?? '?'}") confirmed the parent flow completed`
    )
    .toBeTruthy();

  if (evidence.failed) {
    console.log(`FLOW FAILURE REPORT:\n${evidence.failureReasons.join('\n')}`);
  }
}

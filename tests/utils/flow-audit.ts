/**
 * Post-Submit audit capture for one invoice: the Dataverse row it created, its
 * field-level change history, the flow run tree, the flow's own step definition,
 * and every side effect (emails, PDF notes, approvals, async jobs, sync errors).
 *
 * Each source is probed and reported with its HTTP status, so the attachment doubles
 * as an inventory of what this org actually exposes to the test token.
 *
 * Not reachable with a Dataverse token: per-action inputs/outputs of a flow run.
 * That lives behind api.flow.microsoft.com and needs a different audience.
 */
import type { TestInfo } from '@playwright/test';
import { dvGet, type FlowRunRow } from './flow-runs';

export type AuditSource = {
  source: string;
  endpoint: string;
  ok: boolean;
  status: number;
  count: number;
  note?: string;
  sample: unknown[];
};

export type InvoiceRow = Record<string, unknown>;

export type InvoiceAuditReport = {
  invoiceFound: boolean;
  invoice?: {
    id: string;
    invoiceNumber?: string;
    poNumber?: string;
    status?: string;
    adhoc?: boolean;
    invoiceDate?: string;
    createdOn?: string;
    modifiedOn?: string;
    createdBy?: string;
    modifiedBy?: string;
    total?: number;
  };
  invoiceRow?: InvoiceRow;
  statusTimeline: { at: string; status: string; by?: string; note?: string }[];
  flowSteps: string[];
  runTree: { runId: string; status?: string; start?: string; end?: string; parent?: string }[];
  sources: AuditSource[];
  waitedMs: number;
};

const AUDIT_ACTION_LABELS: Record<number, string> = {
  1: 'Create',
  2: 'Update',
  3: 'Delete',
  4: 'Activate',
  5: 'Deactivate',
  64: 'User Access via Web',
};

function isoMinus(iso: string, ms: number): string {
  return new Date(Date.parse(iso) - ms).toISOString();
}

function str(row: InvoiceRow, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' ? v : v === undefined || v === null ? undefined : String(v);
}

function formatted(row: InvoiceRow, key: string): string | undefined {
  const annotated = Object.keys(row).find(
    (k) => k.startsWith(key) && k.includes('FormattedValue')
  );
  return annotated ? String(row[annotated]) : undefined;
}

const TERMINAL_STATUS =
  /^(Submitted|Reviewed|Approved|Sent|Flagged|Cancelled|Fail-)/i;

/**
 * Wait for the row the Create Invoice flow writes, and keep waiting until it reaches a
 * terminal status. Submit creates the record, the flow stamps dia_invoicenumber and then
 * moves dia_status through an intermediate value (observed: "Pending") before settling on
 * Submitted or a Fail-*. Terminal status is the signal that the parent flow finished —
 * which also gives the lagging flowruns table time to land the parent run row.
 */
export async function waitForSubmittedInvoice(opts: {
  token: string;
  projectId: string;
  submitStartedAt: string;
  timeoutMs?: number;
}): Promise<{ row?: InvoiceRow; waitedMs: number; polls: number }> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const since = isoMinus(opts.submitStartedAt, 120000);
  const filter = `_dia_projectid_value eq ${opts.projectId} and createdon ge ${since}`;
  const query =
    `dia_invoicedetailses?$filter=${encodeURIComponent(filter)}` +
    `&$orderby=createdon desc&$top=5`;

  const started = Date.now();
  let polls = 0;
  let latest: InvoiceRow | undefined;
  let lastLogged = '';

  while (Date.now() - started < timeoutMs) {
    polls++;
    const res = await dvGet<{ value?: InvoiceRow[] }>(opts.token, query);
    if (!res.ok) break;
    const rows = res.body?.value ?? [];
    if (rows.length) {
      latest = rows[0];
      const status = str(latest, 'dia_status') ?? '(blank)';
      const number = str(latest, 'dia_invoicenumber') ?? '';
      const key = `${status}|${number}`;
      if (key !== lastLogged) {
        lastLogged = key;
        console.log(
          `Invoice row ${Math.round((Date.now() - started) / 1000)}s: status=${status} number=${number || '(none)'}`
        );
      }
      if (TERMINAL_STATUS.test(status)) {
        return { row: latest, waitedMs: Date.now() - started, polls };
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  return { row: latest, waitedMs: Date.now() - started, polls };
}

async function probe(
  token: string,
  source: string,
  endpoint: string,
  opts: { note?: string; sampleSize?: number } = {}
): Promise<AuditSource> {
  const res = await dvGet<{ value?: unknown[] } & Record<string, unknown>>(token, endpoint);
  const body = res.body;
  const rows = Array.isArray(body?.value)
    ? (body!.value as unknown[])
    : body && res.ok
      ? [body]
      : [];
  return {
    source,
    endpoint,
    ok: res.ok,
    status: res.status,
    count: rows.length,
    note: res.ok ? opts.note : `${opts.note ? `${opts.note} — ` : ''}${res.raw.slice(0, 180)}`,
    sample: rows.slice(0, opts.sampleSize ?? 10),
  };
}

/** Action names + types from the flow's own definition (workflows.clientdata). */
function extractFlowSteps(clientdata: string | undefined): string[] {
  if (!clientdata) return [];
  try {
    const parsed = JSON.parse(clientdata) as {
      properties?: { definition?: { actions?: Record<string, unknown> } };
    };
    const steps: string[] = [];
    const walk = (actions: Record<string, unknown> | undefined, depth: number) => {
      for (const [name, raw] of Object.entries(actions ?? {})) {
        const action = raw as Record<string, unknown>;
        steps.push(`${'  '.repeat(depth)}${name} [${String(action.type ?? '?')}]`);
        for (const key of ['actions', 'else', 'cases', 'default']) {
          const nested = action[key] as Record<string, unknown> | undefined;
          if (!nested) continue;
          if (key === 'actions') walk(nested, depth + 1);
          else walk((nested.actions as Record<string, unknown>) ?? nested, depth + 1);
        }
      }
    };
    walk(parsed.properties?.definition?.actions, 0);
    return steps;
  } catch {
    return [];
  }
}

function buildStatusTimeline(auditRows: unknown[]): InvoiceAuditReport['statusTimeline'] {
  const timeline: InvoiceAuditReport['statusTimeline'] = [];
  for (const raw of auditRows) {
    const row = raw as Record<string, unknown>;
    const at = String(row.createdon ?? '');
    const action = Number(row.action ?? 0);
    const by =
      (formatted(row, '_userid_value') as string | undefined) ??
      (row['userid'] as string | undefined);
    const changeData = String(row.changedata ?? '');
    const label = AUDIT_ACTION_LABELS[action] ?? `Action ${action}`;
    const statusMatch = /dia_status[^a-zA-Z]{0,12}([A-Za-z-]+)/.exec(changeData);
    timeline.push({
      at,
      status: statusMatch?.[1] ?? label,
      by,
      note: changeData ? changeData.slice(0, 200) : label,
    });
  }
  return timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export async function captureInvoiceAudit(opts: {
  token: string;
  testInfo: TestInfo;
  projectId: string;
  projectName: string;
  partnerName: string;
  submitStartedAt: string;
  expectedWorkflowId?: string;
  matchedRunId?: string;
  invoiceWaitMs?: number;
}): Promise<InvoiceAuditReport> {
  const { token } = opts;
  const sources: AuditSource[] = [];

  const waited = await waitForSubmittedInvoice({
    token,
    projectId: opts.projectId,
    submitStartedAt: opts.submitStartedAt,
    timeoutMs: opts.invoiceWaitMs ?? 120000,
  });
  const row = waited.row;
  const invoiceId = row ? (str(row, 'dia_invoicedetailsid') ?? '') : '';

  sources.push({
    source: 'Invoice row (dia_invoicedetailses)',
    endpoint: `dia_invoicedetailses?$filter=_dia_projectid_value eq ${opts.projectId} and createdon ge ...`,
    ok: !!row,
    status: row ? 200 : 404,
    count: row ? 1 : 0,
    note: row
      ? `resolved in ${waited.waitedMs}ms over ${waited.polls} poll(s); ${Object.keys(row).length} columns`
      : 'no invoice row created for this project after Submit',
    sample: row ? [row] : [],
  });

  if (invoiceId) {
    sources.push(
      await probe(
        token,
        'Line items (dia_invoicelineitemdetailses)',
        `dia_invoicelineitemdetailses?$filter=${encodeURIComponent(`_dia_invoiceid_value eq ${invoiceId}`)}&$top=50`
      )
    );
    sources.push(
      await probe(
        token,
        'Field-level change history (audits)',
        `audits?$filter=${encodeURIComponent(`_objectid_value eq ${invoiceId}`)}&$orderby=createdon desc&$top=50`,
        { note: 'requires table auditing enabled for Invoice Details' }
      )
    );
    sources.push(
      await probe(
        token,
        'Change history (RetrieveRecordChangeHistory)',
        `RetrieveRecordChangeHistory(Target=@t)?@t=${encodeURIComponent(
          JSON.stringify({ '@odata.id': `dia_invoicedetailses(${invoiceId})` })
        )}`,
        { note: 'audit detail with old/new values per field' }
      )
    );
    sources.push(
      await probe(
        token,
        'Notification emails (emails)',
        `emails?$filter=${encodeURIComponent(`_regardingobjectid_value eq ${invoiceId}`)}` +
          `&$select=subject,torecipients,statuscode,createdon&$top=20`,
        { note: 'reviewer/approver notify mails sent by the flow' }
      )
    );
    sources.push(
      await probe(
        token,
        'Notes / attachments (annotations)',
        `annotations?$filter=${encodeURIComponent(`_objectid_value eq ${invoiceId}`)}` +
          `&$select=subject,filename,mimetype,isdocument,createdon&$top=20`,
        { note: 'generated invoice PDF lands here if attached to the record' }
      )
    );
    sources.push(
      await probe(
        token,
        'Async jobs (asyncoperations)',
        `asyncoperations?$filter=${encodeURIComponent(`_regardingobjectid_value eq ${invoiceId}`)}` +
          `&$select=name,operationtype,statuscode,message,createdon&$top=20`
      )
    );
    sources.push(
      await probe(
        token,
        'Integration errors (syncerrors)',
        `syncerrors?$filter=${encodeURIComponent(`_regardingobjectid_value eq ${invoiceId}`)}&$top=20`
      )
    );
    sources.push(
      await probe(
        token,
        'Classic process sessions (processsessions)',
        `processsessions?$filter=${encodeURIComponent(`_regardingobjectid_value eq ${invoiceId}`)}` +
          `&$select=name,statuscode,completedon,createdon&$top=20`
      )
    );
  }

  sources.push(
    await probe(
      token,
      'Approvals (msdyn_flow_approvals)',
      `msdyn_flow_approvals?$orderby=createdon desc&$top=10`,
      { note: 'org-wide latest — Invoice app does not use Approvals connector if empty' }
    )
  );

  // Full flowrun columns (beyond the trimmed $select the run report uses).
  let runTree: InvoiceAuditReport['runTree'] = [];
  if (opts.matchedRunId) {
    const full = await probe(
      token,
      'Flow run, all columns (flowruns)',
      `flowruns?$filter=${encodeURIComponent(`flowrunid eq ${opts.matchedRunId}`)}&$top=1`,
      { note: 'every column the flowruns table exposes for the matched run' }
    );
    sources.push(full);

    const children = await probe(
      token,
      'Child flow runs (flowruns by parentrunid)',
      `flowruns?$filter=${encodeURIComponent(`parentrunid eq '${opts.matchedRunId}'`)}` +
        `&$select=flowrunid,name,status,starttime,endtime,parentrunid,errormessage&$top=50`,
      { note: 'child flows such as Generate Invoice PDF' }
    );
    sources.push(children);

    const rows = [...full.sample, ...children.sample] as FlowRunRow[];
    runTree = rows.map((r) => ({
      runId: r.flowrunid ?? r.name ?? '',
      status: r.status,
      start: r.starttime,
      end: r.endtime,
      parent: r.parentrunid,
    }));
  }

  let flowSteps: string[] = [];
  if (opts.expectedWorkflowId) {
    const wf = await probe(
      token,
      'Flow definition (workflows.clientdata)',
      `workflows(${opts.expectedWorkflowId})?$select=name,uniquename,statecode,statuscode,` +
        `createdon,modifiedon,description,primaryentity,clientdata`,
      { note: 'the flow JSON — yields the ordered action list below' }
    );
    sources.push({ ...wf, sample: [] });
    const wfRow = wf.sample[0] as Record<string, unknown> | undefined;
    flowSteps = extractFlowSteps(wfRow?.clientdata as string | undefined);
  }

  sources.push({
    source: 'Per-action run detail (inputs/outputs)',
    endpoint: 'https://api.flow.microsoft.com/.../runs/{runId}?$expand=properties/actions',
    ok: false,
    status: 0,
    count: 0,
    note: 'NOT available with a Dataverse token — needs a Power Automate audience token',
    sample: [],
  });

  const auditRows = sources.find((s) => s.source.startsWith('Field-level'))?.sample ?? [];
  const statusTimeline = buildStatusTimeline(auditRows);

  const report: InvoiceAuditReport = {
    invoiceFound: !!row,
    invoice: row
      ? {
          id: invoiceId,
          invoiceNumber: str(row, 'dia_invoicenumber'),
          poNumber: str(row, 'dia_ponumber'),
          status: str(row, 'dia_status'),
          adhoc: row['dia_adhocinvoice'] === true,
          invoiceDate: str(row, 'dia_invoicedate'),
          createdOn: str(row, 'createdon'),
          modifiedOn: str(row, 'modifiedon'),
          createdBy: formatted(row, '_createdby_value'),
          modifiedBy: formatted(row, '_modifiedby_value'),
          total: typeof row['dia_total'] === 'number' ? (row['dia_total'] as number) : undefined,
        }
      : undefined,
    invoiceRow: row,
    statusTimeline,
    flowSteps,
    runTree,
    sources,
    waitedMs: waited.waitedMs,
  };

  await attachAuditReport(opts, report);
  return report;
}

async function attachAuditReport(
  opts: {
    testInfo: TestInfo;
    partnerName: string;
    projectName: string;
    submitStartedAt: string;
  },
  report: InvoiceAuditReport
): Promise<void> {
  const inv = report.invoice;
  const lines = [
    '# Invoice audit history',
    '',
    `- Project: **${opts.partnerName} / ${opts.projectName}**`,
    `- Submit started: ${opts.submitStartedAt}`,
    `- Invoice row resolved: **${report.invoiceFound ? 'YES' : 'NO'}** (waited ${report.waitedMs}ms)`,
    '',
    '## Invoice record',
    inv
      ? [
          `- Id: ${inv.id}`,
          `- Invoice #: **${inv.invoiceNumber || '(not stamped)'}**`,
          `- PO #: ${inv.poNumber || '(none)'}`,
          `- Status: **${inv.status || '(blank)'}**`,
          `- Adhoc: ${inv.adhoc ? 'Yes' : 'No'}`,
          `- Invoice date: ${inv.invoiceDate ?? 'n/a'}`,
          `- Created: ${inv.createdOn ?? 'n/a'} by ${inv.createdBy ?? 'n/a'}`,
          `- Modified: ${inv.modifiedOn ?? 'n/a'} by ${inv.modifiedBy ?? 'n/a'}`,
        ].join('\n')
      : '_No invoice row found for this project after Submit._',
    '',
    '## Status / field change timeline',
    ...(report.statusTimeline.length
      ? report.statusTimeline.map(
          (t) => `- ${t.at} — **${t.status}**${t.by ? ` by ${t.by}` : ''}`
        )
      : ['_No audit rows. Enable auditing on Invoice Details to get field-level history._']),
    '',
    '## Flow run tree',
    ...(report.runTree.length
      ? report.runTree.map(
          (r) =>
            `- ${r.runId} | status=${r.status ?? '?'} | ${r.start ?? '?'} → ${r.end ?? '?'}` +
            (r.parent ? ` | parent=${r.parent}` : '')
        )
      : ['_No run rows resolved._']),
    '',
    '## Flow definition steps',
    ...(report.flowSteps.length
      ? report.flowSteps.map((s) => `- ${s}`)
      : ['_Flow definition not readable._']),
    '',
    '## Source availability',
    '| Source | Status | Rows | Note |',
    '|---|---|---|---|',
    ...report.sources.map(
      (s) =>
        `| ${s.source} | ${s.ok ? `OK ${s.status}` : `FAIL ${s.status}`} | ${s.count} | ${(s.note ?? '').replace(/\|/g, '\\|').slice(0, 140)} |`
    ),
  ].join('\n');

  await opts.testInfo.attach('invoice-audit.md', {
    body: Buffer.from(lines, 'utf-8'),
    contentType: 'text/markdown',
  });
  await opts.testInfo.attach('invoice-audit.json', {
    body: Buffer.from(JSON.stringify(report, null, 2), 'utf-8'),
    contentType: 'application/json',
  });

  console.log('\n=== Invoice audit ===');
  console.log(lines);
}

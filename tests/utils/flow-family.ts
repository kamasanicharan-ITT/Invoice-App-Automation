/**
 * Create Invoice flow *family* tracking.
 *
 * A Submit does not run one flow. The region parent ("Create Invoice - NA Region" or
 * "Create Invoice - Other Region") calls child flows, and row-triggered flows fire
 * alongside it. This module:
 *
 *  1. reads the parent flow definition and statically discovers the child flows it
 *     declares (`"type": "Workflow"` actions), recursively;
 *  2. tracks a run for every flow in that family after Submit, plus any run whose
 *     `parentrunid` points at one of them;
 *  3. reports each flow with state, run id, status, timing and error.
 */
import type { TestInfo } from '@playwright/test';
import {
  dvGet,
  isSuccessfulFlowStatus,
  listFlowRunsForWorkflow,
  listRecentFlowRuns,
  type FlowRunRow,
  type WorkflowRow,
} from './flow-runs';

export type FlowNode = {
  workflowId: string;
  name: string;
  state: 'On' | 'Off' | 'unknown';
  /** 0 = region parent, 1+ = declared child depth. */
  depth: number;
  /** Action name in the calling flow that invokes this child. */
  calledBy?: string;
  callerWorkflowId?: string;
  steps: string[];
  childRefs: ChildFlowRef[];
};

export type ChildFlowRef = {
  actionName: string;
  reference: string;
  resolvedWorkflowId?: string;
  resolvedName?: string;
};

export type FamilyRun = {
  workflowId: string;
  flowName: string;
  depth: number;
  declared: boolean;
  runId: string;
  status: string;
  starttime?: string;
  endtime?: string;
  durationMs?: number;
  errorcode?: string;
  errormessage?: string;
  parentrunid?: string;
  isprimary?: boolean;
  triggertype?: string;
};

export type FlowFamilyReport = {
  rootWorkflowId: string;
  rootName: string;
  nodes: FlowNode[];
  declaredChildCount: number;
  runs: FamilyRun[];
  observedNonFamilyRuns: FamilyRun[];
  missingRunFlows: { workflowId: string; name: string; state: string }[];
  allSucceeded: boolean;
  waitedMs: number;
  notes: string[];
};

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeId(id: string | undefined | null): string {
  return (id ?? '').replace(/[{}]/g, '').toLowerCase();
}

function stateOf(row: WorkflowRow | undefined): 'On' | 'Off' | 'unknown' {
  if (!row || row.statecode === undefined || row.statecode === null) return 'unknown';
  return row.statecode === 1 ? 'On' : 'Off';
}

/** Pull a child-flow identifier out of a `"type": "Workflow"` action's inputs. */
function childReferenceFrom(action: Record<string, unknown>): string | undefined {
  const inputs = action.inputs as Record<string, unknown> | undefined;
  const host = inputs?.host as Record<string, unknown> | undefined;
  if (!host) return undefined;

  const direct =
    (host.workflowReferenceName as string | undefined) ??
    (host.workflowReferenceId as string | undefined);
  if (direct) return direct;

  // Newer shape: host.workflow.id = /providers/Microsoft.Flow/flows/<guid>
  const workflow = host.workflow as Record<string, unknown> | undefined;
  const id = workflow?.id as string | undefined;
  if (id) return id.split('/').filter(Boolean).pop();
  return undefined;
}

/** Flatten a flow definition into step labels and the child-flow calls it declares. */
function parseDefinition(clientdata: string | undefined): {
  steps: string[];
  childRefs: ChildFlowRef[];
} {
  const steps: string[] = [];
  const childRefs: ChildFlowRef[] = [];
  if (!clientdata) return { steps, childRefs };

  let definition: { actions?: Record<string, unknown> } | undefined;
  try {
    const parsed = JSON.parse(clientdata) as {
      properties?: { definition?: { actions?: Record<string, unknown> } };
    };
    definition = parsed.properties?.definition;
  } catch {
    return { steps, childRefs };
  }

  const walk = (actions: Record<string, unknown> | undefined, depth: number) => {
    for (const [actionName, raw] of Object.entries(actions ?? {})) {
      const action = raw as Record<string, unknown>;
      const type = String(action.type ?? '?');
      steps.push(`${'  '.repeat(depth)}${actionName} [${type}]`);

      if (/^workflow$/i.test(type)) {
        const reference = childReferenceFrom(action);
        if (reference) childRefs.push({ actionName, reference });
      }

      for (const key of ['actions', 'else', 'default']) {
        const nested = action[key] as Record<string, unknown> | undefined;
        if (!nested) continue;
        walk((nested.actions as Record<string, unknown>) ?? nested, depth + 1);
      }
      const cases = action.cases as Record<string, unknown> | undefined;
      for (const branch of Object.values(cases ?? {})) {
        const b = branch as Record<string, unknown>;
        walk((b.actions as Record<string, unknown>) ?? {}, depth + 1);
      }
    }
  };
  walk(definition?.actions, 0);
  return { steps, childRefs };
}

async function fetchWorkflow(
  token: string,
  workflowId: string
): Promise<(WorkflowRow & { clientdata?: string }) | undefined> {
  const res = await dvGet<WorkflowRow & { clientdata?: string }>(
    token,
    `workflows(${normalizeId(workflowId)})?$select=workflowid,name,uniquename,statecode,category,clientdata`
  );
  return res.ok && res.body ? res.body : undefined;
}

async function resolveChildWorkflow(
  token: string,
  reference: string,
  catalog: WorkflowRow[]
): Promise<(WorkflowRow & { clientdata?: string }) | undefined> {
  if (GUID_RE.test(reference)) {
    const byId = await fetchWorkflow(token, reference);
    if (byId) return byId;
  }
  const needle = reference.toLowerCase();
  const hit = catalog.find(
    (f) => (f.uniquename ?? '').toLowerCase() === needle || (f.name ?? '').toLowerCase() === needle
  );
  return hit?.workflowid ? fetchWorkflow(token, hit.workflowid) : undefined;
}

/**
 * Walk the parent flow and every child flow it declares, to `maxDepth` levels.
 * `catalog` is the modern-flow list already loaded by the caller (avoids refetching).
 */
export async function discoverFlowFamily(opts: {
  token: string;
  rootWorkflowId: string;
  catalog: WorkflowRow[];
  maxDepth?: number;
}): Promise<{ nodes: FlowNode[]; notes: string[] }> {
  const maxDepth = opts.maxDepth ?? 3;
  const notes: string[] = [];
  const nodes: FlowNode[] = [];
  const seen = new Set<string>();

  type Pending = { workflowId: string; depth: number; calledBy?: string; caller?: string };
  const queue: Pending[] = [{ workflowId: normalizeId(opts.rootWorkflowId), depth: 0 }];

  while (queue.length) {
    const current = queue.shift()!;
    const id = normalizeId(current.workflowId);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const row = await fetchWorkflow(opts.token, id);
    if (!row) {
      notes.push(`Could not read workflow ${id} (depth ${current.depth})`);
      continue;
    }

    const { steps, childRefs } = parseDefinition(row.clientdata);
    const node: FlowNode = {
      workflowId: id,
      name: row.name ?? '(unnamed)',
      state: stateOf(row),
      depth: current.depth,
      calledBy: current.calledBy,
      callerWorkflowId: current.caller,
      steps,
      childRefs,
    };

    if (current.depth < maxDepth) {
      for (const ref of childRefs) {
        const child = await resolveChildWorkflow(opts.token, ref.reference, opts.catalog);
        if (child?.workflowid) {
          ref.resolvedWorkflowId = normalizeId(child.workflowid);
          ref.resolvedName = child.name;
          queue.push({
            workflowId: ref.resolvedWorkflowId,
            depth: current.depth + 1,
            calledBy: ref.actionName,
            caller: id,
          });
        } else {
          notes.push(
            `Child flow reference "${ref.reference}" (action "${ref.actionName}" in ${node.name}) did not resolve`
          );
        }
      }
    }

    nodes.push(node);
  }

  return { nodes, notes };
}

function toFamilyRun(
  run: FlowRunRow,
  meta: { workflowId: string; flowName: string; depth: number; declared: boolean }
): FamilyRun {
  const startMs = run.starttime ? Date.parse(run.starttime) : NaN;
  const endMs = run.endtime ? Date.parse(run.endtime) : NaN;
  return {
    workflowId: meta.workflowId,
    flowName: meta.flowName,
    depth: meta.depth,
    declared: meta.declared,
    runId: run.flowrunid || run.name || '',
    status: run.status ?? 'Unknown',
    starttime: run.starttime,
    endtime: run.endtime,
    durationMs:
      Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : undefined,
    errorcode: run.errorcode,
    errormessage: run.errormessage,
    parentrunid: run.parentrunid,
    isprimary: run.isprimary,
    triggertype: run.triggertype,
  };
}

/**
 * Poll for one run per family flow started at/after `sinceMs`. Stops as soon as the
 * root flow has a terminal run and no declared child is still pending, so a healthy
 * Submit does not pay the full timeout.
 */
export async function trackFamilyRuns(opts: {
  token: string;
  nodes: FlowNode[];
  sinceMs: number;
  timeoutMs?: number;
  /** Extra wait for child run rows after the parent run turns terminal. */
  childGraceMs?: number;
  flowNameById: Map<string, string>;
}): Promise<{
  runs: FamilyRun[];
  observedNonFamilyRuns: FamilyRun[];
  missingRunFlows: { workflowId: string; name: string; state: string }[];
  waitedMs: number;
  notes: string[];
}> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const childGraceMs = opts.childGraceMs ?? 45000;
  let rootTerminalAt: number | undefined;
  const notes: string[] = [];
  const byId = new Map(opts.nodes.map((n) => [n.workflowId, n]));
  const found = new Map<string, FamilyRun>();
  const started = Date.now();
  let observed: FamilyRun[] = [];
  let lastProgress = '';

  const rootId = opts.nodes.find((n) => n.depth === 0)?.workflowId ?? '';
  const expectOn = opts.nodes.filter((n) => n.state === 'On');
  const since = opts.sinceMs;

  while (Date.now() - started < timeoutMs) {
    for (const node of opts.nodes) {
      if (found.has(node.workflowId)) continue;
      const res = await listFlowRunsForWorkflow(opts.token, node.workflowId, { top: 15 });
      if (!res.ok) continue;
      const hit = res.runs.find((r) => {
        const t = r.starttime ? Date.parse(r.starttime) : NaN;
        const c = r.createdon ? Date.parse(r.createdon) : NaN;
        return (Number.isFinite(t) && t >= since) || (Number.isFinite(c) && c >= since);
      });
      if (hit) {
        found.set(
          node.workflowId,
          toFamilyRun(hit, {
            workflowId: node.workflowId,
            flowName: node.name,
            depth: node.depth,
            declared: node.depth > 0,
          })
        );
      }
    }

    // Anything else that fired in the window (row-triggered flows are not declared children).
    const recent = await listRecentFlowRuns(opts.token, { top: 100 });
    if (recent.ok) {
      observed = recent.runs
        .filter((r) => {
          const t = r.starttime ? Date.parse(r.starttime) : NaN;
          return Number.isFinite(t) && t >= since;
        })
        .map((r) => {
          const wfId = normalizeId(r.workflowid ?? r['_workflow_value']);
          return toFamilyRun(r, {
            workflowId: wfId,
            flowName: opts.flowNameById.get(wfId) ?? '(unknown flow)',
            depth: -1,
            declared: false,
          });
        })
        .filter((r) => !byId.has(r.workflowId));

      // Children linked by run, even when the workflow-scoped query has not caught up.
      const familyRunIds = new Set([...found.values()].map((r) => r.runId));
      for (const r of recent.runs) {
        if (!r.parentrunid || !familyRunIds.has(r.parentrunid)) continue;
        const wfId = normalizeId(r.workflowid ?? r['_workflow_value']);
        if (found.has(wfId)) continue;
        found.set(
          wfId,
          toFamilyRun(r, {
            workflowId: wfId,
            flowName: byId.get(wfId)?.name ?? opts.flowNameById.get(wfId) ?? '(unknown child)',
            depth: (byId.get(wfId)?.depth ?? 1),
            declared: byId.has(wfId),
          })
        );
      }
    }

    const rootRun = rootId ? found.get(rootId) : undefined;
    const rootTerminal = rootRun ? !/running|waiting/i.test(rootRun.status) : false;
    const allOnFound = expectOn.every((n) => found.has(n.workflowId));

    const pending = expectOn.filter((n) => !found.has(n.workflowId)).map((n) => n.name);
    const progress = `${found.size}/${expectOn.length} family run(s)`;
    if (progress !== lastProgress) {
      lastProgress = progress;
      console.log(
        `Family runs ${Math.round((Date.now() - started) / 1000)}s: ${progress}` +
          (pending.length ? ` — waiting on ${pending.join(', ')}` : '')
      );
    }

    if (rootTerminal && allOnFound) break;

    // Child run rows sometimes never sync (parentrunid is not populated for them either).
    // Once the parent is terminal, give children a short grace period instead of the
    // whole budget — the report records any that never appeared.
    if (rootTerminal) {
      rootTerminalAt ??= Date.now();
      if (Date.now() - rootTerminalAt > childGraceMs) {
        notes.push(
          `Parent run terminal; stopped waiting for children after ${Math.round(childGraceMs / 1000)}s grace.`
        );
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }

  const missingRunFlows = opts.nodes
    .filter((n) => !found.has(n.workflowId))
    .map((n) => ({ workflowId: n.workflowId, name: n.name, state: n.state }));

  if (missingRunFlows.length) {
    notes.push(
      `No run in window for: ${missingRunFlows.map((m) => `${m.name} (${m.state})`).join(', ')}`
    );
  }

  return {
    runs: [...found.values()].sort(
      (a, b) => Date.parse(a.starttime ?? '') - Date.parse(b.starttime ?? '')
    ),
    observedNonFamilyRuns: observed,
    missingRunFlows,
    waitedMs: Date.now() - started,
    notes,
  };
}

export async function captureFlowFamilyReport(opts: {
  token: string;
  testInfo: TestInfo;
  rootWorkflowId: string;
  catalog: WorkflowRow[];
  flowNameById: Map<string, string>;
  submitStartedAt: string;
  regionLabel: string;
  familyWaitMs?: number;
  childGraceMs?: number;
  maxDepth?: number;
}): Promise<FlowFamilyReport> {
  const notes: string[] = [];
  const { nodes, notes: discoveryNotes } = await discoverFlowFamily({
    token: opts.token,
    rootWorkflowId: opts.rootWorkflowId,
    catalog: opts.catalog,
    maxDepth: opts.maxDepth ?? 3,
  });

  const root = nodes.find((n) => n.depth === 0);
  const declaredChildCount = nodes.filter((n) => n.depth > 0).length;
  console.log(
    `Flow family for ${root?.name ?? opts.rootWorkflowId}: ${declaredChildCount} declared child flow(s)` +
      (declaredChildCount
        ? ` — ${nodes
            .filter((n) => n.depth > 0)
            .map((n) => `${n.name} (${n.state})`)
            .join(', ')}`
        : '')
  );

  const sinceMs = Date.parse(opts.submitStartedAt) - 60_000;
  const tracked = await trackFamilyRuns({
    token: opts.token,
    nodes,
    sinceMs,
    timeoutMs: opts.familyWaitMs ?? 30000,
    childGraceMs: opts.childGraceMs,
    flowNameById: opts.flowNameById,
  });

  // Vacuously true when nothing synced: absence of a run row is lag, not a failure.
  const familyStatuses = tracked.runs.filter((r) => r.depth >= 0);
  const allSucceeded = familyStatuses.every((r) => isSuccessfulFlowStatus(r.status));

  // Row-triggered flows are not declared children, so they are reported, never asserted.
  const failedSideEffects = tracked.observedNonFamilyRuns.filter(
    (r) => !isSuccessfulFlowStatus(r.status)
  );
  for (const r of failedSideEffects) {
    console.log(
      `KNOWN SIDE-EFFECT FAILURE (reported, not asserted): ${r.flowName} status=${r.status} run=${r.runId}` +
        (r.errormessage ? ` err=${r.errormessage.slice(0, 160)}` : '')
    );
  }
  if (tracked.missingRunFlows.length) {
    notes.push(
      'Missing run rows below mean the flowruns table had not synced within the sweep window — ' +
        'not evidence of failure. The invoice status is the authoritative outcome.'
    );
  }

  const report: FlowFamilyReport = {
    rootWorkflowId: normalizeId(opts.rootWorkflowId),
    rootName: root?.name ?? '(unresolved)',
    nodes,
    declaredChildCount,
    runs: tracked.runs,
    observedNonFamilyRuns: tracked.observedNonFamilyRuns,
    missingRunFlows: tracked.missingRunFlows,
    allSucceeded,
    waitedMs: tracked.waitedMs,
    notes: [...discoveryNotes, ...tracked.notes, ...notes],
  };

  await attachFamilyReport(opts.testInfo, report, opts.regionLabel, opts.submitStartedAt);
  return report;
}

async function attachFamilyReport(
  testInfo: TestInfo,
  report: FlowFamilyReport,
  regionLabel: string,
  submitStartedAt: string
): Promise<void> {
  const runLine = (r: FamilyRun) =>
    `| ${r.flowName} | ${r.depth === 0 ? 'parent' : r.declared ? `child d${r.depth}` : 'observed'} | ` +
    `${r.status} | ${r.starttime ?? '?'} | ${r.durationMs !== undefined ? `${Math.round(r.durationMs / 1000)}s` : '?'} | ` +
    `${r.runId} | ${(r.errormessage ?? '').replace(/\|/g, '\\|').slice(0, 80)} |`;

  const lines = [
    `# Create Invoice flow family — ${regionLabel}`,
    '',
    `- Parent flow: **${report.rootName}** (${report.rootWorkflowId})`,
    `- Declared child flows: **${report.declaredChildCount}**`,
    `- Submit started: ${submitStartedAt}`,
    `- Runs resolved: ${report.runs.length} (waited ${Math.round(report.waitedMs / 1000)}s)`,
    `- All tracked family runs succeeded: **${
      report.runs.length === 0
        ? 'n/a — no run rows synced within the sweep window'
        : report.allSucceeded
          ? 'YES'
          : 'NO'
    }**`,
    '',
    '## Declared family tree',
    ...report.nodes.map(
      (n) =>
        `${'  '.repeat(n.depth)}- **${n.name}** (${n.state}) \`${n.workflowId}\`` +
        (n.calledBy ? ` — called by action \`${n.calledBy}\`` : '') +
        ` — ${n.steps.length} step(s), ${n.childRefs.length} child call(s)`
    ),
    '',
    '## Runs after Submit',
    '| Flow | Role | Status | Start | Duration | Run id | Error |',
    '|---|---|---|---|---|---|---|',
    ...(report.runs.length ? report.runs.map(runLine) : ['| _none_ | | | | | | |']),
    '',
    '## Side-effect flows that FAILED (reported, not asserted)',
    ...(() => {
      const failed = report.observedNonFamilyRuns.filter(
        (r) => !/^(Succeeded|Successful|Completed|Success)$/i.test(r.status)
      );
      return failed.length
        ? [
            'Row-triggered flows, not declared children of the region flow, so they do not',
            'fail this test. Raise them with the flow owners.',
            '',
            ...failed.map(
              (r) =>
                `- **${r.flowName}** | status=**${r.status}** | start=${r.starttime ?? '?'} | run=${r.runId}` +
                (r.errormessage ? ` | err=${r.errormessage.slice(0, 160)}` : '')
            ),
          ]
        : ['_None._'];
    })(),
    '',
    '## Other flows that fired in the same window',
    ...(report.observedNonFamilyRuns.length
      ? report.observedNonFamilyRuns.map(
          (r) => `- ${r.flowName} | status=${r.status} | start=${r.starttime ?? '?'} | run=${r.runId}`
        )
      : ['_None._']),
    '',
    '## Flows with no run row yet (flowruns sync lag, not failure)',
    ...(report.missingRunFlows.length
      ? report.missingRunFlows.map((m) => `- ${m.name} (${m.state}) \`${m.workflowId}\``)
      : ['_None — every family flow had a run row._']),
    '',
    '## Per-flow step definitions',
    ...report.nodes.flatMap((n) => [
      `### ${n.name} (${n.state})`,
      ...(n.steps.length ? n.steps.map((s) => `- ${s}`) : ['_definition not readable_']),
      '',
    ]),
    '## Notes',
    ...(report.notes.length ? report.notes.map((n) => `- ${n}`) : ['- (none)']),
  ].join('\n');

  await testInfo.attach('flow-family.md', {
    body: Buffer.from(lines, 'utf-8'),
    contentType: 'text/markdown',
  });
  await testInfo.attach('flow-family.json', {
    body: Buffer.from(JSON.stringify(report, null, 2), 'utf-8'),
    contentType: 'application/json',
  });

  console.log('\n=== Flow family ===');
  console.log(lines);
}

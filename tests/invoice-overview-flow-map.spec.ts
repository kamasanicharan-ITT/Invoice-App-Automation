// spec: specs/invoice-overview-test-plan.md
// seed: tests/seed.spec.ts
//
// Inventory the Overview-lifecycle flows Charan named, plus recent runs.
// Does not mutate invoices. Re-run after a Flag / resubmit / Send Instantly
// session to see which of these actually started.

import { test, expect } from '@playwright/test';
import { captureDataverseToken } from './utils/dataverse-fixtures';
import {
  isRetiredInvoiceFlowName,
  listCloudFlows,
  listFlowRunsForWorkflow,
  searchWorkflowsByName,
  type FlowRunRow,
  type WorkflowRow,
} from './utils/flow-runs';

/** Exact product names from the app owner (2026-08-26). */
const TARGET_FLOWS: { key: string; label: string; match: (name: string) => boolean }[] = [
  {
    key: 'notify-initiator',
    label: 'NotifyInvoiceInitiator',
    match: (n) => /notify\s*invoice\s*initiator/i.test(n),
  },
  {
    key: 'post-submitted',
    label: 'Project Invoice (M): Handle Post Submitted Tasks',
    match: (n) => /handle\s*post\s*submitted/i.test(n),
  },
  {
    key: 'update-na',
    label: 'Update Invoice - NA Region',
    match: (n) =>
      /update\s*invoice/i.test(n) && /(na\b|north\s*america)/i.test(n) && !/create|deprecated/i.test(n),
  },
  {
    key: 'update-other',
    label: 'Update Invoice - Other Region',
    match: (n) => /update\s*invoice/i.test(n) && /other/i.test(n) && !/create|deprecated/i.test(n),
  },
  {
    key: 'immediate-send-notify',
    label: 'Notify for Immediate send Invoices',
    match: (n) => /immediate\s*send/i.test(n),
  },
  {
    key: 'send-instant-client',
    label: 'Send instant Invoices to Client',
    match: (n) => /send\s*instant\s*invoices\s*to\s*client/i.test(n),
  },
];

function stateOf(row: WorkflowRow): string {
  if (row.statecode === 1) return 'On';
  if (row.statecode === 0) return 'Off';
  return `statecode=${row.statecode ?? '?'}`;
}

function runLine(r: FlowRunRow): string {
  return (
    `| ${r.starttime ?? r.createdon ?? '?'} | ${r.status ?? '?'} | ${r.flowrunid ?? r.name ?? '?'} | ` +
    `${(r.errormessage ?? '').replace(/\|/g, '/').slice(0, 80)} |`
  );
}

test.describe('Invoice Overview flow catalog', () => {
  test.describe.configure({ timeout: 120000 });

  test('TC-IO-FLOW-01: Catalog the five Overview lifecycle flows and latest runs', async (
    { browser },
    testInfo
  ) => {
    test.skip(testInfo.project.name.toLowerCase().includes('pm'), 'Admin token — org-wide catalog');

    const token = await captureDataverseToken(browser);
    expect(token, 'Dataverse Bearer token from Admin storageState').toBeTruthy();

    const inventory = await listCloudFlows(token);
    expect(inventory.ok, inventory.errorSnippet).toBeTruthy();

    const byUpdateName = await searchWorkflowsByName(token, 'Update Invoice');
    const byImmediateName = await searchWorkflowsByName(token, 'Immediate send');
    const sortedNames = inventory.flows
      .map((f) => f.name ?? '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const mergedById = new Map<string, WorkflowRow>();
    for (const f of [...inventory.flows, ...byUpdateName.flows, ...byImmediateName.flows]) {
      const id = (f.workflowid ?? '').replace(/[{}]/g, '').toLowerCase();
      if (id) mergedById.set(id, f);
    }
    const catalog = [...mergedById.values()];

    const live = catalog.filter((f) => !isRetiredInvoiceFlowName(f.name ?? ''));
    const retiredHits = catalog.filter((f) =>
      TARGET_FLOWS.some((t) => t.match(f.name ?? '')) && isRetiredInvoiceFlowName(f.name ?? '')
    );

    const lines: string[] = [
      '# Overview lifecycle flow catalog',
      '',
      `- Captured: ${new Date().toISOString()}`,
      `- Modern flows in org: **${inventory.flows.length}** (retired names excluded from match: ${live.length} live-named)`,
      `- Catalog name range: **${sortedNames[0] ?? '(empty)'}** … **${sortedNames[sortedNames.length - 1] ?? '(empty)'}**`,
      `- contains(name,'Update Invoice'): **${byUpdateName.ok ? byUpdateName.flows.length : 'query failed'}**`,
      `- contains(name,'Immediate send'): **${byImmediateName.ok ? byImmediateName.flows.length : 'query failed'}**`,
      '',
      '## contains(name) raw hits',
      ...byUpdateName.flows.map(
        (f) => `- Update Invoice search: **${f.name}** | ${stateOf(f)} | cat=${f.category} | \`${f.workflowid}\``
      ),
      ...(byUpdateName.flows.length ? [] : ['- Update Invoice search: _none_']),
      ...byImmediateName.flows.map(
        (f) => `- Immediate send search: **${f.name}** | ${stateOf(f)} | cat=${f.category} | \`${f.workflowid}\``
      ),
      ...(byImmediateName.flows.length ? [] : ['- Immediate send search: _none_']),
      '',
      '## Named targets',
      '',
    ];

    const related = live
      .filter((f) =>
        /invoice|notifyinvoice|post submitted|send instant|update invoice/i.test(f.name ?? '')
      )
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

    for (const target of TARGET_FLOWS) {
      const matches = live.filter((f) => target.match(f.name ?? ''));
      const on = matches.filter((f) => f.statecode === 1);
      const preferred =
        on.find((f) => (f.name ?? '').trim().toLowerCase() === target.label.toLowerCase()) ??
        on[0] ??
        matches[0];

      lines.push(`### ${target.label}`);
      lines.push(`- Match key: \`${target.key}\``);
      lines.push(`- Catalog hits (non-retired): **${matches.length}**`);
      if (!matches.length) {
        lines.push('- **MISSING from catalog** — name may differ; see Related invoice-named flows below.');
        lines.push('');
        continue;
      }

      for (const f of matches) {
        const mark = preferred?.workflowid === f.workflowid ? ' ← used for run query' : '';
        lines.push(
          `- **${f.name}** | ${stateOf(f)} | \`${f.workflowid}\`${mark}`
        );
      }

      if (preferred?.workflowid) {
        const runs = await listFlowRunsForWorkflow(token, preferred.workflowid, { top: 8 });
        lines.push('');
        lines.push(
          runs.ok
            ? `- Latest runs (top ${runs.runs.length}):`
            : `- flowruns query failed: ${runs.status} ${runs.errorSnippet}`
        );
        if (runs.ok && runs.runs.length) {
          lines.push('| Start | Status | Run id | Error |');
          lines.push('|---|---|---|---|');
          lines.push(...runs.runs.map(runLine));
        } else if (runs.ok) {
          lines.push('- _No run rows returned for this workflow._');
        }
      }
      lines.push('');
    }

    if (retiredHits.length) {
      lines.push('## Retired / copy names that also matched (ignored as live parent)');
      for (const f of retiredHits) {
        lines.push(`- ${f.name} | ${stateOf(f)} | \`${f.workflowid}\``);
      }
      lines.push('');
    }

    const sendUpdateInstant = catalog
      .filter((f) => /send\s*instant|immediate send|update\s*invoice/i.test(f.name ?? ''))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

    lines.push('## Send / Update / Instant names (including retired copies)');
    if (!sendUpdateInstant.length) {
      lines.push('- _none_');
    }
    for (const f of sendUpdateInstant) {
      lines.push(
        `- ${f.name} | ${stateOf(f)} | retired=${isRetiredInvoiceFlowName(f.name ?? '')} | \`${f.workflowid}\``
      );
    }
    lines.push('');

    lines.push('## Related invoice-named flows in catalog (context, not asserted)');
    for (const f of related) {
      lines.push(`- ${f.name} | ${stateOf(f)}`);
    }

    const body = lines.join('\n');
    console.log(body);
    await testInfo.attach('overview-flow-catalog.md', {
      body: Buffer.from(body, 'utf-8'),
      contentType: 'text/markdown',
    });

    const foundLabels = TARGET_FLOWS.filter((t) => live.some((f) => t.match(f.name ?? ''))).map(
      (t) => t.label
    );
    expect(
      foundLabels.length,
      `Expected to find the named Overview flows in catalog. Found: ${foundLabels.join(', ') || '(none)'}`
    ).toBeGreaterThan(0);

    const onNamed = (labelKey: string) => {
      const t = TARGET_FLOWS.find((x) => x.key === labelKey)!;
      return live.filter((f) => t.match(f.name ?? '') && f.statecode === 1);
    };
    expect(onNamed('update-na'), 'Update Invoice - NA Region should be On in Dataverse').not.toHaveLength(
      0
    );
    expect(
      onNamed('update-other'),
      'Update Invoice - Other Region should be On in Dataverse'
    ).not.toHaveLength(0);
    expect(
      onNamed('immediate-send-notify'),
      'Notify for Immediate send Invoices should be On (Send Instantly toggle)'
    ).not.toHaveLength(0);
  });
});

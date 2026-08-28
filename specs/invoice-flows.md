# Invoice Power Automate flows

Reference for Create Invoice and Invoice Overview automation. Exact catalog names; do not invent child-flow names in assertions.

Retired / copy names (`Copy of …`, `Deprecated`, old duplicates) are ignored as live parents.

## Create / Update parents (Submit)

| When | Catalog name |
|------|----------------|
| First Submit, North America project | **Create Invoice - NA Region** |
| First Submit, any other region | **Create Invoice - Other Region** |
| Flagged or Draft edit + Submit, NA | **Update Invoice - NA Region** |
| Flagged or Draft edit + Submit, non-NA | **Update Invoice - Other Region** |

Asserted in `tests/create-invoice-screen.spec.ts` (`TC-CIF-01`, `TC-CIF-02`, and CI-057 when Submit fires). Evidence helpers: `tests/utils/invoice-submit-flows.ts`, `flow-family.ts`, `flow-audit.ts`, `flow-runs.ts`.

## Overview lifecycle (catalog; names from product)

| Key | Catalog name | Typical trigger |
|-----|----------------|-----------------|
| notify-initiator | **NotifyInvoiceInitiator** | After submit / notify initiator |
| post-submitted | **Project Invoice (M): Handle Post Submitted Tasks** | After Submitted |
| immediate-send-notify | **Notify for Immediate send Invoices** | Create Invoice **Send Instantly** toggle |
| send-instant-client | **Send instant Invoices to Client** | Overview ⋮ on **Approved** → Send Instantly (not the create-form toggle) |

`TC-IO-FLOW-01` lists these in Dataverse and attaches recent runs. It does not start them.

## How tests should treat children

Create parent **children** (PDF, QuickBooks, reviewer mail, etc.) belong in the flow-family **report**. Assert the four Create/Update parents when region and action match. Record other names that actually started; do not fail the suite on unmatched side-effect names.

## Dataverse schema

Column-level schema for key Invoice tables is generated into `specs/dataverse-schema.md`. Persistent field rules live in `.cursor/rules/20-dataverse.mdc`.

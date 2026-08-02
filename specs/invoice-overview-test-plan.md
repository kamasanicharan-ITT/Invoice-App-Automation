# Invoice Overview test plan

## Application Overview

Single source of truth for the **Invoice Overview** screen of the Invoice Canvas app.
Merged from live Power Apps observation (2026-07-24) plus the prior reference plans
`invoice-overview-cursor-plan.md` and the older `invoice-overview-test-plan.md` scenarios.

All scenarios live in **one** spec: `tests/invoice-overview.spec.ts`.

**Seed:** `tests/seed.spec.ts`

**Persona (default suite):** BDU + Admin (`storageState` / `auth.json`) — sees **My Invoices** and
**All Invoices**; default scope is **All Invoices** checked.

**Canvas host:** entire UI inside `iframe[name="fullscreen-app-host"]`.

---

## Live observations (locator / product notes)

Recorded while exploring the screen; generators and healers must follow these.

| Control | Live behavior |
|---------|----------------|
| Nav | `Dashboard`, `Invoice Overview`, `Create Invoice` buttons |
| Header | Text **Invoice Overview**; header **+ Create Invoice** |
| Scope | `radiogroup` with radios **My Invoices** / **All Invoices**; Admin default = All checked |
| Period | Label **Show Invoices**. Combo button accessible name is `". This Month"` (leading `. `); Playwright `getByRole('button', { name: 'This Month' })` still matches. Options: This Month, Last Month, **Quater to Date**, **Last Quater**, Year to Date, Last Year, Future Months (app typos) |
| Region | Label **Region**. Unselected button name is exactly `"."` — unique vs period’s `". This Month"` |
| Search | `textbox` placeholder **Search** (Partner, Project, Invoice #) |
| Table | Headers: Partner, Project, Invoice #, Action Pending with, Status, Next Step. Rows: `Item N` / invoice `#` like `\d{4}-\d{4}` |
| Next Step | Driven by Status — observed: **Reviewed → Approve**, **Submitted → Review**, **Flagged → Edit**, **Fail-Creation → Report**. Product also: Approved/Sent → View, Draft → Edit/none (assert when present; do not hard-fail if a status is absent this cycle) |
| Pagination | Page buttons `1`, `2`, `3`, … at bottom |
| Refresh | No accessible **Refresh Invoices** label found on the live screen; do **not** assert a Refresh button unless re-observed |
| Empty | Message **No Item to Display** only when the gallery has no rows |

---

## Test Scenarios

### 1. Invoice Overview Screen

#### TC-IO-01 — Screen layout loads with expected controls

Persona: BDU/Admin (also valid structurally for PM, except My/All radios — see TC-IO-02).

1. Open the app and navigate to Invoice Overview (wait for real row data, e.g. invoice `#`).
   - expect: Nav **Dashboard**, **Invoice Overview**, **Create Invoice** visible
   - expect: Header **Invoice Overview**; scope radios **My Invoices** / **All Invoices**
   - expect: **Show Invoices**, **Region**, Search box visible
   - expect: Table headers Partner, Project, Invoice #, Action Pending with, Status, Next Step
   - expect: At least one gallery row (`Item N` or invoice number) and pagination control `1`
   - evidence: mark nav + scope + filters + table headers as groups

#### TC-IO-02 — Admin can switch My Invoices / All Invoices

Persona: BDU/Admin — **visible**; PM would hide radios (future `auth/pm.json` run).

1. Observe default scope.
   - expect: **All Invoices** is checked
2. Select **My Invoices**.
   - expect: My Invoices checked; list still on Overview (rows or empty-state text)
3. Switch back to **All Invoices**.
   - expect: All Invoices checked; list refreshes without leaving Overview
   - evidence: mark radiogroup after each selection

#### TC-IO-03 — Show Invoices period filter

1. Open the period combo (This Month).
   - expect: Options This Month, Last Month, Quater to Date, Last Quater, Year to Date, Last Year, Future Months
2. Select **Last Month**.
   - expect: Period button shows Last Month; screen stays on Invoice Overview
   - evidence: mark open listbox, then applied Last Month button

#### TC-IO-04 — Region filter

1. Open Region (button `.`).
   - expect: Australia, Colombia, India, Netherlands, North America, Saudi Arabia, South Korea, UAE
2. Select **India**.
   - expect: Region shows India; Overview remains; list refreshes (rows or empty)
   - evidence: mark open listbox, then India button

#### TC-IO-05 — Search filters the invoice list

1. Read a live invoice number from the gallery (`/\d{4}-\d{4}/`).
2. Type it into Search.
   - expect: Search has that value; at least one matching row remains visible
   - evidence: mark Search + matching invoice text

#### TC-IO-06 — Status drives the correct Next Step action

1. On All Invoices / This Month (or current filters), inspect Next Step buttons.
   - expect (soft / when present): **Review** (Submitted), **Approve** (Reviewed), **Edit** (Flagged), **Report** (Fail-*)
   - do not click through to detail in this scenario (visibility mapping only)
   - evidence: mark each present Next Step control found

#### TC-IO-07 — Pagination navigates between pages

1. Observe pagination.
   - expect: Page **1** visible; page **2** when enough data (skip nav if only one page)
2. Click page **2**, then return to **1** when both exist.
   - expect: Gallery still shows invoice data after each click; stay on Overview
   - evidence: mark active page button

#### TC-IO-08 — Create Invoice from Overview opens New Invoice

1. Click header **Create Invoice**.
   - expect: **New Invoice** form visible (Create Invoice screen)
   - evidence: mark New Invoice + Close/Submit region

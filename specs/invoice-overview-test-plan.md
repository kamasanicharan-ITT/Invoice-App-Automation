# Invoice Overview test plan

**Status:** Source of truth for Invoice Overview regression + automation  
**Existing suite:** `tests/invoice-overview.spec.ts` (TC-IO-01 … TC-IO-08 — layout, radios, period, region, search, Next Step mapping, pagination, Create Invoice nav)  
**New lifecycle suite (to generate):** `tests/invoice-overview-lifecycle.spec.ts`  
**Seed:** `tests/seed.spec.ts`  
**Source sheet:** `specs/Invoice_Overview_Test_Cases.md` (IO-001 … IO-042)  
**App:** Invoice Canvas (Power Apps) — DEV  
**Last aligned:** 2026-08-26 (live Admin session vs sheet + post-Submit context)

This plan is **our** automation plan, not a copy of the Excel sheet. Sheet IDs are kept for traceability. Product rules and **live DEV** observations supersede the sheet where they disagreed.

Related: `create-invoice-regression.md` (Submit / Update flows), `dashboard-test-plan.md`.

---

## 1. Purpose and scope

| In scope | Out of scope / deferred |
|----------|-------------------------|
| Overview shell, filters, search, gallery, pagination | Dashboard tiles → `dashboard-test-plan.md` |
| **Admin** My / All radios; **PM** radios hidden | Create Invoice form fields → Create Invoice plans |
| Status → Next Step mapping | Email mailbox body (IO-039/040 notify — capture flow run only) |
| **Refresh icon** after async status change | PDF byte-level download (IO-030 — Playwright download event only if live) |
| Review overlay: View Invoice, Flag, Mark as Reviewed, close | Approve overlay chrome (no Reviewed rows on DEV this session) |
| Flagged → Edit → resubmit → **Update Invoice** parent | Send-to-customer after Approved |
| Flow **family** after Submit / Review / Flag / Approve / Flagged-resubmit | Exact names of notify / post-submit child flows until catalog confirms them |
| Dataverse status / invoice # after flows settle | IO-044 / IO-045 (blank in source) |

Starting state: fresh load via `storageState`, host dialogs dismissed, Invoice Overview opened (or Submit already redirected here). Do not depend on leftover gallery filters from a previous test.

---

## 2. Same shell, different scope UI

Confirmed live on DEV, 2026-08-26 (Admin). PM radios still from 2026-08-03 plan (not re-explored this session).

| Aspect | PM | BDU (Admin) |
|--------|----|-------------|
| Nav (Dashboard, Invoice Overview, Create Invoice) | Same | Same |
| Header **Invoice Overview** + **refresh** icon (no accessible name — img next to title) | Same | Same |
| **My Invoices / All Invoices** | **Hidden** | **Visible**; default **All Invoices** checked |
| Show Invoices | Same 7 options incl. **Quater** typos | Same |
| Region (8 regions; unselected button name `.`) | Same | Same |
| Search placeholder **Search** | Same | Same |
| Columns: Partner, Project, Invoice #, Action Pending with, Status, Next Step | Same | Same |
| Next Step mapping | Same when row exists | Same |
| Pagination | Same (fewer pages as PM possible) | Same (this session: pages 1–3 visible, total **6**) |
| List data | Own invoices only | Org-wide when All selected |

---

## 3. Personas

| Persona | storageState | Playwright project |
|---------|--------------|--------------------|
| BDU/Admin | `auth/<env>/admin.json` | `chromium` / `chromium-admin` |
| PM | `auth/<env>/pm.json` | `chromium-pm` |

Detect persona from `testInfo.project.name`. Never add login code.

---

## 4. Live observations (2026-08-26 Admin)

| Control | Live behavior |
|---------|----------------|
| Canvas host | Entire UI in `iframe[name="fullscreen-app-host"]` |
| Screen name in tree | `InvoiceOverview` |
| Period | Button `. This Month`; options: This Month, Last Month, **Quater to Date**, **Last Quater**, Year to Date, Last Year, Future Months |
| Region | Unselected name exactly `.` |
| Search | Placeholder **Search** |
| Invoice # | `/\d{4}-\d{4}/` **or** `INV-\d+` (QuickBooks-style also present, e.g. INV-104351) |
| Status cell | Often a **textbox** whose accessible name is Action Pending With (person) and whose value is status (`Submitted`, `Flagged`, `Fail-Creation`) |
| Next Step | Submitted→**Review**, Flagged→**Edit**, Fail-Creation→**Report**. This session: **0 Reviewed**, **0 Approved** on Dashboard — no **Approve** / **View** on page 1 |
| Action Pending with | Person name **or** `SYSTEM` (Flagged rows) |
| Refresh | Clickable **img** beside header **Invoice Overview** — no `Refresh` accessible name. Gallery does **not** auto-update after flow completion; user must click this |
| Review overlay title | **View Invoice** (not a separate browser tab) |
| Review actions | **Flag**, **Mark as Reviewed**; **Comments**; **Internal Notes (Hidden from Customer)** |
| Review close | Header **img** on the **right** of View Invoice (left img likely download) — no `Close` button name |
| PDF | Nested iframe inside Canvas; region `Page 1`; page indicator `1 / 1`; unlabeled prev/next/zoom buttons |
| Close without action | Overlay dismisses; gallery still on Overview; invoice stays **Submitted** |
| Host alerts | Intermittent Office365Users 404 — dismiss via `host-dialogs.ts` |
| Partner header first icon | Behaved like **sort** (list order changed), not an obvious filter popup |

Invoice # regex in existing suite is `/\d{4}-\d{4}/` only — **INV-*** rows will miss search/count helpers. Lifecycle tests must accept both.

---

## 5. Post-Submit lifecycle (product — from you + live + existing flow helpers)

Happy path on Overview: **Submit → (Pending while flow runs) → refresh → Submitted → Review → Reviewed → Approve → Approved**. Flag at Review or Approve → **Flagged** → **Edit** → resubmit.

| Step | UI | Dataverse `dia_status` | Flows (see §6) |
|------|----|------------------------|----------------|
| After Submit | Redirect to Overview; new row visible | Often **Pending** until parent finishes, then **Submitted** (or Fail-*) | Create Invoice parent by region |
| Status not updating on screen | Click **refresh** img | API may already be Submitted while UI still Pending | — |
| Reviewer | Next Step **Review** | Submitted | Reviewer already notified by create-family (mail) |
| Mark as Reviewed | View Invoice → **Mark as Reviewed** | Reviewed | Capture runs after click; refresh Overview |
| Flag (reviewer) | View Invoice → **Flag** (+ comments) | Flagged | Notify submitter (name from catalog); refresh |
| Approver | Next Step **Approve** | Reviewed | Same overlay pattern expected; **not opened live** (no Reviewed rows) |
| Flag (approver) | Approve overlay → Flag | Flagged | Same notify family |
| Edit Flagged | Next Step **Edit** | Flagged | Opens edit form (not New Invoice) |
| Resubmit Flagged | Submit on edit form | Pending → Submitted | **Update Invoice - NA/Other Region** |

**Do not** Flag / Mark as Reviewed / Approve / Cancel **shared** org invoices during exploration. Lifecycle tests that mutate must create **their own** invoice first (reuse Create Invoice fixtures).

---

## 6. Flows to attach (do not invent names)

Confirmed in `tests/utils/flow-runs.ts` (live catalog labels):

| Key | Exact catalog name | When |
|-----|--------------------|------|
| create-na | **Create Invoice - NA Region** | First Submit, North America project |
| create-other | **Create Invoice - Other Region** | First Submit, non-NA |
| update-na | **Update Invoice - NA Region** | Flagged/Draft edit + Submit, NA |
| update-other | **Update Invoice - Other Region** | Flagged/Draft edit + Submit, non-NA |

**Remembered names that are NOT confirmed in this session** (you asked us not to guess): “handle post submitted task”, “notify invoice initiator when flagged”, “Update NA/non-NA” as separate from the four parents. Automation must:

1. After each mutating action, poll `flowruns` in the time window (reuse `listCloudFlows` / `trackFamilyRuns` / `captureFlowFamilyReport`).
2. **Record** every modern-flow name that actually started (parent + declared children + other runs in the window).
3. **Assert** the four parent names above when region/action match.
4. **Report, do not fail**, unmatched side-effect names until we review the catalog together.

Create parent **children** (PDF, QuickBooks, reviewer mail, etc.) stay in the Create Invoice flow-family report. Overview tests care that: invoice reaches a terminal status, Overview **refresh** shows it, and Update parents fire on flagged resubmit.

---

## 7. Sheet vs live vs existing automation

| Sheet ID | Title (short) | Live 2026-08-26 | Plan ID | Generate? |
|----------|---------------|-----------------|---------|-----------|
| IO-001 | Screen loads | Matches | TC-IO-01 | Already in `invoice-overview.spec.ts` |
| IO-002–008 | Period filters | Options match; **QTD/YTD are calendar in product rules**, not “rolling ~4 months” | TC-IO-03 + TC-IO-09 Dataverse (later) | Options already; **skip rolling-window sheet wording** |
| IO-009 | Future vs This Month overlap | Not re-seeded this session | TC-IO-10 | Later (needs dated fixture) |
| IO-010–011 | Region | Combo present | TC-IO-04 | Already |
| IO-012 | My / All | Admin All default | TC-IO-02 / 02b | Already |
| IO-013–015 | Search partner / project / # | Search box present | TC-IO-05 (# only) | Add partner/project as TC-IO-11/12 later |
| IO-016–019 | Column sort | Partner first icon changed order | TC-IO-13 | Later — locator is unlabeled img |
| IO-020–022 | Column filter | Filter popup **not** confirmed (first icon = sort) | — | **Skip until we confirm filter UI** |
| IO-023–027 | Next Step by status | Review/Edit/Report seen; Approve/View **not** on page 1 | TC-IO-06 | Already (soft if missing) |
| IO-028–031 | PDF viewer | **View Invoice** + nested iframe + unlabeled chrome | TC-IO-20 | **Generate** |
| IO-032a | PDF no error | PDF text loaded for INV-104351 | fold into TC-IO-20 | Generate |
| IO-032b–034 | Delete Draft menu | Overflow click **not** confirmed (timeout) | TC-IO-25 | **Skip** until three-dot menu is mapped |
| IO-035–036 | Cancel Approved | No Approved rows | TC-IO-26 | Skip until fixture |
| IO-037 | Review / Flag / close | Close-no-action confirmed; Mark/Flag not clicked | TC-IO-21 close; TC-IO-22/23 mutate own invoice | Generate close now; mutate later |
| IO-038 | Approve | Overlay not opened | TC-IO-24 | Skip until Reviewed fixture |
| IO-039–040 | Flag + email | Not clicked | TC-IO-23 | Later + flowruns attach |
| IO-041 | Decimals in gallery | **Gallery has no Rate/Total columns** | — | **Skip** (PDF already has 1.00 / ₹50.00) |
| IO-042 | Alpha filter lists | Filter UI unconfirmed | — | Skip |
| IO-043–045 | Missing / blank | — | — | Skip |

---

## 8. Scenarios

### A. Shared UI (already generated — keep green)

See `tests/invoice-overview.spec.ts`: TC-IO-01 … TC-IO-08.

### B. Review overlay (generate now — non-mutating)

#### TC-IO-20 — Review opens View Invoice with PDF and actions (IO-028, IO-029, IO-032a)

Persona: **Admin** (reviewer). Skip if no **Review** button.

1. Open Invoice Overview, All Invoices, wait for gallery.
2. Click **Review** on a Submitted row.
   - expect: **View Invoice** visible
   - expect: **Flag** and **Mark as Reviewed** visible
   - expect: **Comments** and **Internal Notes (Hidden from Customer)** visible
   - expect: nested PDF iframe shows invoice content (Partner/Project or `Invoice`) **without** an error screen
3. Click the **right** header icon to close (no Flag / Mark as Reviewed).
   - expect: **Show Invoices** visible again; row still **Review** / Submitted

#### TC-IO-21 — Close Review without changing status (IO-037 close branch)

Same setup as TC-IO-20; capture invoice # before open; after close search/refresh and expect still Submitted (or still Review button). **Do not** click Flag or Mark as Reviewed.

#### TC-IO-27 — Refresh control is present on Overview

Persona: both.

1. Open Overview.
   - expect: header **Invoice Overview** visible
   - expect: clickable img adjacent to the title (refresh) — click it
   - expect: still on Overview (`Show Invoices` visible); gallery settled (rows or empty)

### C. Mutating lifecycle (own invoice only — generate after Create helpers; do not use org Submitted rows)

#### TC-IO-30 — Submit lands on Overview with the new invoice (your context)

Admin. Create + Submit via existing Create Invoice helpers.

1. Submit a valid invoice.
   - expect: Overview (`Show Invoices`)
   - expect: new row (invoice # or partner/project) visible — search if needed
2. Status may be **Pending** while Create parent runs.
3. Click **refresh** until status is **Submitted** (or Fail-*) matching Dataverse.
   - attach Create Invoice NA/Other family report

#### TC-IO-22 — Mark as Reviewed updates status after refresh (IO-037 reviewed branch)

Own Submitted invoice. Admin.

1. Review → **Mark as Reviewed**.
2. Refresh Overview until **Reviewed** and Next Step **Approve** (or Dataverse `Reviewed`).
   - attach whatever flowruns started after the click (names from catalog, no invented expect)

#### TC-IO-23 — Flag from Review → Flagged + Edit (IO-039)

Own Submitted invoice.

1. Review → **Flag** (comments if required — **if the app demands comments and we have not seen the validation, skip rather than guess**).
2. Refresh until **Flagged**, Next Step **Edit**.
   - attach notify-related runs if they appear

#### TC-IO-32 — Edit Flagged and resubmit fires Update Invoice parent (IO-025 + CI-057)

Own Flagged invoice.

1. **Edit** → change a line → Submit.
2. Overview + refresh until Submitted (or Fail-Update).
   - expect parent **Update Invoice - NA Region** or **Update Invoice - Other Region** by project region

#### TC-IO-24 — Approve Reviewed invoice (IO-038)

**Skip** until a Reviewed row exists (Dashboard was 0 Reviewed this session) **or** TC-IO-22 created one in the same file (ordered tests — prefer independent tests that chain from own invoice).

---

## 9. Generation order

1. TC-IO-20, TC-IO-21, TC-IO-27 (safe, live now).
2. TC-IO-30 + flow attach (reuse `openCreateInvoice` / submit helpers).
3. TC-IO-22, TC-IO-23, TC-IO-32 (mutating, own data).
4. TC-IO-24 Approve; overflow Delete/Cancel after we map the three-dot img.

---

## 10. Questions parked (do not block the cases above)

- Exact catalog names for notify-on-flag and post-submit handler — will take from `flowruns` on first mutating run.
- Approve overlay button labels (assumed similar to View Invoice + Approve/Flag).
- Whether Flag requires Comments before submit.
- Column filter vs sort icons (unlabeled).

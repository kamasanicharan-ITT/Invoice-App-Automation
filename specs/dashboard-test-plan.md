# Dashboard screen test plan

## Application Overview

Test plan for the **Dashboard** screen of the Invoice Canvas application, based on the live
UI observed in Power Apps and the Dataverse backend. This is the **single source of truth**
for the Dashboard suite; all scenarios below live in one spec: `tests/dashboard.spec.ts`.

**Seed:** `tests/seed.spec.ts`

## Billing-cycle count logic (reverse-engineered from the live app)

The Invoice Tasks tiles are **not** a naive `status + date` count. Investigating the app's
own Dataverse traffic and comparing UI counts to API counts revealed the exact rules the
dashboard applies. A test that ignores these will report false failures (this is what the old
`dataverse-check` / `updated-dataverse-check` specs hit on Submitted and Failed).

- **Billing cycle**: 6th of the current month → 5th of the next month. If today is before the
  6th, the active cycle started on the 6th of the previous month. The filter uses
  `dia_invoicedate` and **includes future-dated invoices** inside the window — the dashboard
  genuinely shows them (e.g. 5 of 6 Drafts were future-dated yet all 6 appear on the tile).
  Do **NOT** cap the window end at "today" — that under-counts and was a wrong hypothesis.
- **`dia_isreported eq null`** applies to every tile: already-reported invoices leave the task
  list. This is what corrects **Failed** (raw 13 → 11; two Failed invoices were reported).
  `dia_isreported` is a date-style field, so filter with `eq null` (not `eq true/false`).
- **`dia_adhocinvoice eq true`** applies to the **Submitted** tile only: it counts adhoc
  submitted invoices (raw 92 → 89; three Submitted invoices were non-adhoc). Other tiles are
  NOT adhoc-filtered (e.g. only 2 of 6 Drafts are adhoc, but the tile shows 6).
- **Total Tasks** = Draft + Flagged + Submitted + Reviewed + Approved + Failed (the actionable
  states). Cancelled and Sent are terminal and excluded from Total Tasks.

## Test Scenarios

### 1. Dashboard Screen

#### UI structure (persona: PM — baseline; also valid for BDU / Admin)

##### TC-DB-01 — Header and navigation are visible
1. Open the app on a fresh authenticated session and land on the Dashboard.
   - expect: `Dashboard` header visible; `Dashboard`, `Invoice Overview`, and
     `Create Invoice` navigation controls visible.

##### TC-DB-02 — All four summary cards are visible
1. On the Dashboard, verify the summary cards.
   - expect: `Total Invoices`, `Total Partners`, `Total Project`, `Total Revenue` visible,
     each with `This Month` and `Last Month` sub-labels.

##### TC-DB-03 — Invoice Tasks section has all 9 rows and action buttons
1. Verify the Invoice Tasks section and each task row.
   - expect: `Invoice Tasks` visible and each row shows a numeric count (regex, never
     hard-coded) with its button: Total Tasks/View All, Drafts/View Drafts,
     Flagged/View Flagged, Submitted/View Submitted, Reviewed/View Reviewed,
     Approved/View Approved, Failed/View Failed, Cancelled/View Cancelled, Sent/View Sent.

##### TC-DB-04 — Region dropdown shows all 8 regions
1. Open the Region dropdown.
   - expect: options Australia, Colombia, India, Netherlands, North America, Saudi Arabia,
     South Korea, UAE.

##### TC-DB-05 — Region filter is applied
1. Open the Region dropdown and select a region (e.g. India).
   - expect: the dropdown reflects the selection and the Dashboard stays intact (Invoice
     Tasks still visible, no error). Uses robust waits, no fixed timeout.

##### TC-DB-06 — Create Invoice navigates to the New Invoice screen
1. Click `Create Invoice` from the Dashboard.
   - expect: navigation to the `New Invoice` screen.

Evidence: every scenario (UI and Dataverse) scrolls to the element under observation and
captures a marked `markAndShot` after Playwright auto-wait confirms it is visible — no
dedicated “screenshot-only” test case.

#### Dataverse data validation (UI count == Dataverse count)

Token captured once in `beforeAll` from the Canvas app's Dataverse traffic. Each test compares
the tile count to a Dataverse `$count` built with the billing-cycle logic above.

- TC-DV-01 Draft — `dia_status eq 'Draft'`
- TC-DV-02 Submitted — `dia_status eq 'Submitted' and dia_adhocinvoice eq true`
- TC-DV-03 Reviewed — `dia_status eq 'Reviewed'`
- TC-DV-04 Approved — `dia_status eq 'Approved'`
- TC-DV-05 Flagged — `dia_status eq 'Flagged'`
- TC-DV-06 Failed — `Fail-Creation/Update/Flag/Approval/Review`
- TC-DV-07 Cancelled — `dia_status eq 'Cancelled'`
- TC-DV-08 Sent — `dia_status eq 'Sent'`
- TC-DV-09 Total Tasks — UI Total Tasks equals one Dataverse count of all actionable
  statuses (same UI==API pattern; not a client-side sum assertion). Waits via `expect.poll`
  until the Total Tasks label settles to the sum of the on-screen status tiles (the label can
  briefly show a stale aggregate), then compares to Dataverse.

All Dataverse filters (including Total Tasks) apply `dia_isreported eq null` and the
billing-cycle `dia_invoicedate` window.

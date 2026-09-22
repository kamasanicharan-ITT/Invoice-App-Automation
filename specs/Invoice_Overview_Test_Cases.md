# Synergy Invoice Application — Invoice Overview Screen Test Cases

**Application:** Invoice Application (Canvas App)
**Screen:** Invoice Overview
**Total Test Cases:** 42 documented (IO-001 to IO-042, with a duplicated ID and two blank trailing rows — see note at bottom)

> Note for Cursor: Each test case below includes the original test data (ID, Module, Title, User Role, Preconditions, Steps, Expected Result, Priority, Status, Notes) plus a plain-language "Scenario Explanation" describing the intent of the test, to help generate accurate Playwright automation (Page Object Model, locators, assertions).

---

## IO-001 — Invoice Overview screen loads with all elements
- **Module:** Page Load
- **User Role:** PM / BDU
- **Preconditions:** User is authenticated
- **Steps:**
  1. Navigate to Invoice Overview
  2. Observe all UI elements
- **Expected Result:** Screen loads showing: Show Invoices filter, Region filter, My Invoices/All Invoices radio, Search box, gallery with columns: Partner, Project, Invoice #, Action Pending With, Status, Next Step
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Smoke test for the landing screen. Automation should assert visibility of each named filter/control and the gallery's expected column headers after navigation.

## IO-002 — This Month filter shows only current month invoices
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices exist for current and other months
- **Steps:**
  1. Select 'This Month' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** Only invoices with Invoice Date within the current business cycle are displayed
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Core date-range filter test. Note "current business cycle" is not simply calendar-month — see IO-008/IO-009 which define the cycle as starting after the 5th of the month. Automation should compute the actual business-cycle boundary dynamically rather than assuming a plain calendar month.

## IO-003 — Last Month filter shows only previous month invoices
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices exist for last month
- **Steps:**
  1. Select 'Last Month' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** Only invoices with Invoice Date within the previous month are displayed
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Straightforward date-range filter test, parallel to IO-002 but shifted back one cycle.

## IO-004 — Quarter to Date filter works correctly
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices exist across multiple months
- **Steps:**
  1. Select 'Quarter to Date' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** Invoices from the rolling last ~4 months are displayed
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Rolling-window filter test. The expected result explicitly says "~4 months" (not a strict fiscal quarter), so automation should verify against that rolling window rather than a calendar-quarter boundary — confirm exact day-count with the app owner if precision matters.

## IO-005 — Last Quarter filter works correctly
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices exist from last quarter
- **Steps:**
  1. Select 'Last Quarter' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** Only invoices from the previous quarter date range are displayed
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Fixed prior-quarter range filter test, distinct from IO-004's rolling window — verify the two filters produce genuinely different result sets when tested side by side.

## IO-006 — Year to Date filter works correctly
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices exist from current year
- **Steps:**
  1. Select 'Year to Date' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** Invoices from the rolling last year are displayed
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Rolling 12-month window test (not calendar-year-to-date, per the expected result wording "rolling last year") — same caution as IO-004 about confirming exact semantics.

## IO-007 — Last Year filter works correctly
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices exist from previous year
- **Steps:**
  1. Select 'Last Year' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** Only invoices from the previous calendar year are displayed
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Fixed calendar-year filter, distinct from IO-006's rolling window — again worth confirming the two produce different sets.

## IO-008 — Future Months filter shows only future month invoices
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Future month invoices exist
- **Steps:**
  1. Select 'Future Months' from Show Invoices dropdown
  2. Observe gallery results
- **Expected Result:** The invoices which are created after 5th of next month will be displayed in the Future months filter
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Defines the exact boundary for "future" — the 5th of next month. This is the key reference point for the known overlap bug (see IO-009) and should be used consistently across all date-filter tests.

## IO-009 — Future month invoice does not appear in This Month filter
- **Module:** Filter
- **User Role:** BDU
- **Preconditions:** A future month invoice exists (e.g. August invoice when today is July)
- **Steps:**
  1. Create or open an invoice with Invoice Date = August 6
  2. Select 'This Month' filter
  3. Verify the August invoice is not shown
  4. Select 'Future Months' filter
  5. Verify the August invoice IS shown
- **Expected Result:** The August invoice appears ONLY in Future Months, not in This Month
- **Priority:** High | **Status:** Active
- **Notes:** Key filter overlap bug
- **Scenario Explanation:** ⭐ This is the direct regression test for the **known ADO work item: invoice filter overlap** — future-month invoices incorrectly appearing in both "This Month" and "Future Months". Prioritize this test in automation and run it both before and after the `dia_Start` calculated-column fix (`+1` vs `+6` offset issue between QA and dev) is deployed to QA, to confirm the fix resolves the overlap.

## IO-010 — Region filter — North America shows only NA invoices
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices from both NA and Non-NA regions exist
- **Steps:**
  1. Select 'North America' from Region dropdown
  2. Observe results
- **Expected Result:** Only invoices for North America region projects are displayed
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Standard region filter test — good to pair with a Non-NA region selection to confirm the filter is mutually exclusive.

## IO-011 — Region filter — blank shows all regions
- **Module:** Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices from multiple regions exist
- **Steps:**
  1. Leave Region filter blank (default)
  2. Observe results
- **Expected Result:** Invoices from all regions are displayed
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Default-state test confirming no filter is applied when Region is left blank.

## IO-012 — All Invoices shows all users' invoices and My Invoices shows only current user's invoices
- **Module:** Radio Button
- **User Role:** BDU
- **Preconditions:** Multiple users have created invoices
- **Steps:**
  1. Select 'All Invoices' radio button
  2. Observe gallery results
  3. Select 'My Invoices' radio button
  4. Observe gallery results
- **Expected Result:** 1. For 'All Invoices' invoices from all submitters are displayed regardless of who is logged in. 2. For 'My Invoices' only invoices where the logged-in user is the submitter are displayed
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Ownership-scoping test with two assertions in one test case — automation should verify the submitter/owner field on each visible row against the logged-in user identity for the "My Invoices" state.

## IO-013 — Search by partner name works
- **Module:** Search
- **User Role:** PM / BDU
- **Preconditions:** Invoices with known partner names exist
- **Steps:**
  1. Type a partner name in the search box
  2. Observe gallery results
- **Expected Result:** Gallery filters in real time to show only invoices matching the typed partner name
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Real-time/live-filter search test — automation should assert results update without needing an explicit submit action, and may need a short debounce wait since Canvas Apps often delay search-as-you-type.

## IO-014 — Search by project name works
- **Module:** Search
- **User Role:** PM / BDU
- **Preconditions:** Invoices with known project names exist
- **Steps:**
  1. Type a project name in the search box
  2. Observe results
- **Expected Result:** Gallery filters to show only invoices matching the project name
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Same live-search pattern as IO-013, applied to the Project field — confirms the search box queries across multiple columns, not just Partner.

## IO-015 — Search by invoice number works
- **Module:** Search
- **User Role:** PM / BDU
- **Preconditions:** Invoices with known invoice numbers exist
- **Steps:**
  1. Type an invoice number in the search box
  2. Observe results
- **Expected Result:** Gallery filters to show only the matching invoice
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms the multi-column search also covers Invoice #, and that a full/exact invoice number returns exactly one row.

## IO-016 — Partner column sorts ascending then descending
- **Module:** Sort
- **User Role:** PM / BDU (both)
- **Preconditions:** Multiple invoices with different partners in the active period
- **Live-locked (DEV 15 Sep 2026):** Header starts with **down** arrow + funnel. Click the **arrow** (not the funnel). Control: `icnPartnerDownInvoiceOverview`.
- **Steps:**
  1. Open Invoice Overview → This Month (gallery must have ≥2 distinct partners; else fail with seed message)
  2. Record Partner values in gallery order
  3. Click Partner **sort arrow** once → expect A→Z (e.g. HP Inc. before Unimind)
  4. Click Partner **sort arrow** again → expect Z→A
- **Expected Result:** Toggle A→Z then Z→A (does **not** clear back to default order)
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Assert partner column string order after each click. Icons are unlabeled `powerapps-icon`; prefer `data-control-name` in helpers only if stable, else click by position to the right of the Partner label (arrow left of funnel).

## IO-017 — Project column sorts correctly
- **Module:** Sort
- **User Role:** PM / BDU (both)
- **Preconditions:** Multiple invoices with different project names
- **Live-locked:** Same pattern as Partner — down arrow + funnel (`icnProjectDownInvoiceOverview` / `icnProjectFilterInvoiceOverview`).
- **Steps:**
  1. Click Project **sort arrow** once → A→Z by project name
  2. Click again → Z→A
- **Expected Result:** Same ASC↔DESC toggle as Partner
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Same sort pattern as IO-016 on Project.

## IO-018 — Invoice # column sorts correctly
- **Module:** Sort
- **User Role:** PM / BDU (both)
- **Preconditions:** Multiple rows with invoice numbers (blank # rows may sort to ends — assert on numbered rows)
- **Live-locked:** **Arrow only** (no funnel). Control: `icnInvoiceDownInvoiceOverview`.
- **Steps:**
  1. Click Invoice # arrow once → low→high (e.g. `2026-0176` … before `2026-0448`)
  2. Click again → high→low
  3. Click again → low→high again (ASC↔DESC toggle)
- **Expected Result:** String/numeric year-prefix order toggles ASC↔DESC; does **not** restore original unsorted order
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Live confirmed ASC then DESC then ASC. Not a clear-to-default control.

## IO-019 — Status column sorts correctly
- **Module:** Sort
- **User Role:** PM / BDU (both)
- **Preconditions:** Mixed statuses visible (at least Draft + Submitted)
- **Live-locked:** Down arrow + funnel. Control: `icnStatusDownInvoiceOverview`. First click = **small→big (A→Z)** — Drafts cluster before Submitted/Flagged; second click = reverse (Z→A, e.g. Submitted first). Not lifecycle “highest priority” order.
- **Steps:**
  1. Note default mixed order (arrow points down)
  2. Click Status arrow once → alphabetical ascending (Draft before Submitted)
  3. Click again → alphabetical descending
- **Expected Result:** A→Z then Z→A by status label text
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Status badge text may be empty in a11y tree; assert via visible badge colors or Next Step labels as secondary signal if needed.

## IO-020 — Partner column filter works
- **Module:** Column Filter
- **User Role:** PM / BDU (both)
- **Preconditions:** ≥2 partners in gallery
- **Live-locked:** Funnel → `cnt_PartnerFilter` / `cmb_PartnerFilter` (“Partners”). Click combo → option list; type to narrow (e.g. `HP` → HP* partners); select one. Leave Overview (Dashboard) and return → filter UI/selection cleared.
- **Steps:**
  1. Click Partner **funnel**
  2. Click the Partners search dropdown
  3. Type part of a partner name → matching options appear
  4. Select a partner → gallery only that partner
  5. Navigate to Dashboard then back to Invoice Overview → filter cleared (mixed partners again)
- **Expected Result:** Searchable combo filter; cleared on leaving Overview
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Distinct from global Search box (IO-013). Project funnel mirrors this (`icnProjectFilterInvoiceOverview`).

## IO-021 — Status column filter works
- **Module:** Column Filter
- **User Role:** PM / BDU (both)
- **Preconditions:** ≥2 statuses in gallery
- **Live-locked:** Funnel → `cnt_StatusFilter` / `dd_StatusFilter` (“Status”). Open → type (e.g. `Sub` / `Draft`) → matching status option(s); select → gallery filtered. Clear by leaving Overview and returning.
- **Steps:**
  1. Click Status **funnel**
  2. Open Status dropdown and type a status fragment
  3. Select the status → only that status remains
  4. Dashboard → Overview → filter cleared
- **Expected Result:** Searchable status filter; cleared on nav away
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Same funnel→search→select→clear-by-nav pattern as Partner.

## IO-022 — Action Pending With filter works
- **Module:** Column Filter
- **User Role:** PM / BDU (both)
- **Preconditions:** Rows with different Action Pending With users
- **Live-locked:** **Funnel only — no sort arrow.** Control id is `icnStatusFilterInvoiceOverview_1` (misnamed). Opens `cnt_ActionPendingFilter` labeled “Action Pending With”. No separate sort control on this column.
- **Steps:**
  1. Confirm Action Pending header has funnel only (no arrow)
  2. Click funnel → Action Pending With filter box appears
  3. Open dropdown / search and select a user (when options available)
  4. Gallery shows only rows pending with that user
  5. Dashboard → Overview → filter cleared
- **Expected Result:** User filter via funnel only; no column sort
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Do not assert a sort arrow on this column. If the combo yields no options in an env, fail with a clear seed/data message (do not skip).

## IO-023 — Review button visible for Submitted invoices
- **Module:** Next Step
- **User Role:** BDU/Reviewer
- **Preconditions:** At least one Submitted invoice exists
- **Steps:**
  1. Login as BDU
  2. Find a Submitted invoice in the gallery
- **Expected Result:** Review button is visible in the Next Step column for the Submitted invoice
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** First of five status-to-action mapping tests (IO-023 to IO-027). Automation should build a helper that maps each status → expected Next Step button label, and can loop through these as a single parameterized test.

## IO-024 — Approve button visible for Reviewed invoices
- **Module:** Next Step
- **User Role:** BDU / Approver
- **Preconditions:** At least one Reviewed invoice exists
- **Steps:**
  1. Login as BDU
  2. Find a Reviewed invoice in the gallery
- **Expected Result:** Approve button is visible in the Next Step column for the Reviewed invoice
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Status→action mapping test for the Reviewed state, parallel to IO-023.

## IO-025 — Edit button visible for Draft and Flagged invoices
- **Module:** Next Step
- **User Role:** PM / BDU
- **Preconditions:** Draft and Flagged invoices exist
- **Steps:**
  1. Find a Draft invoice in the gallery
  2. Find a Flagged invoice in the gallery
- **Expected Result:** Edit button is visible for both Draft and Flagged invoices
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Notably this maps TWO statuses to the same action (Edit) — automation should verify both cases independently, since Draft-Edit and Flagged-Edit likely route to different underlying logic (new draft edit vs. resubmit flow per CI-057 in the Create Invoice suite).

## IO-026 — View button visible for Approved and Sent invoices
- **Module:** Next Step
- **User Role:** PM / BDU
- **Preconditions:** Approved and Sent invoices exist
- **Steps:**
  1. Find an Approved invoice
  2. Find a Sent invoice
- **Expected Result:** View button is visible for both Approved and Sent invoices
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Same two-status-to-one-action pattern as IO-025, for the read-only "View" state — confirms these later-lifecycle statuses are no longer editable.

## IO-027 — Report button visible for Fail-Creation invoices
- **Module:** Next Step
- **User Role:** BDU
- **Preconditions:** A Fail-Creation invoice exists
- **Steps:**
  1. Login as BDU
  2. Find a Fail-Creation invoice
- **Expected Result:** Report button is visible in the Next Step column
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Error-state action test — "Fail-Creation" is likely tied to a failed Power Automate flow run (e.g. the Non-NA double-trigger or Fail-Update issues); this test may need a way to deliberately induce or seed a Fail-Creation record for setup.

## IO-028 — Clicking Review opens PDF viewer inline
- **Module:** PDF Viewer
- **User Role:** BDU
- **Preconditions:** A Submitted invoice exists
- **Steps:**
  1. Login as BDU
  2. Click Review button on a Submitted invoice
  3. Observe what opens
- **Expected Result:** PDF viewer popup opens inline within the app showing the invoice PDF
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms the PDF viewer is an in-app modal/popup, not a new browser tab or external download — important for choosing the right Playwright locator strategy (likely another nested iframe within the Canvas App iframe).

## IO-029 — PDF viewer shows navigation and zoom controls
- **Module:** PDF Viewer
- **User Role:** PM / BDU (both)
- **Preconditions:** At least one invoice whose Next Step is **Review**, **Approve**, or **View** (any of these opens the same View Invoice PDF). Else fail: no invoice with PDF Next Step — please create/submit some.
- **Live-locked (DEV 15 Sep 2026 + user screenshot):** Overlay title **View Invoice**. PDF toolbar: search (magnifier), page up/down, page indicator (`1 / 1`), zoom **−** / **+**. Top-right of modal: Download icon + Close (X). Footer actions (Flag / Mark as Reviewed) depend on status — **out of scope** for IO-029 (visibility of viewer chrome only).
- **Steps:**
  1. Open Invoice Overview
  2. Click Next Step **Review** or **Approve** or **View** (whichever is available)
  3. Assert **View Invoice** overlay with PDF loaded
  4. Assert zoom controls visible (− and +)
  5. Assert page nav / page indicator visible
  6. Close without mutating (X) — reuse TC-IO-20 close pattern
- **Expected Result:** Zoom and page navigation controls are visible; no download click in this case
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Visibility-only. Do not assert Flag / Mark as Reviewed here. Download belongs to IO-030.

## IO-030 — Download button in PDF viewer saves the PDF
- **Module:** PDF Viewer
- **User Role:** PM / BDU (both)
- **Preconditions:** Same as IO-029 — a Review / Approve / View Next Step row exists
- **Live-locked:** Top-right **Download** icon (arrow into tray) on View Invoice; click starts a browser download of the invoice PDF.
- **Steps:**
  1. Open View Invoice via Review / Approve / View
  2. Click the Download icon (not zoom, not Close)
  3. Assert a download starts (`page.waitForEvent('download')`); optionally check filename contains invoice # when available
  4. Close the overlay
- **Expected Result:** PDF download starts successfully
- **Priority:** Medium | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Both personas. Prefer `waitForEvent('download')` over file-system path asserts.

## IO-031 — Close button dismisses the PDF viewer
- **Module:** PDF Viewer
- **User Role:** PM / BDU
- **Preconditions:** PDF viewer is open
- **Steps:**
  1. Open PDF viewer
  2. Click the X close button
- **Expected Result:** PDF viewer closes and Invoice Overview gallery is visible again
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Simple modal-dismissal test — confirm the underlying gallery/page state is unaffected by opening/closing the viewer.

## IO-032 (a) — Verify Invoice PDF Loads Without Error Screen on Review or Approve
- **Module:** PDF Viewer
- **User Role:** *(not specified in source — appears role-agnostic/BDU)*
- **Preconditions:** *(not specified — implied: Submitted and Reviewed invoices exist)*
- **Steps:**
  1. Open the invoice application
  2. Navigate to the Invoice Overview screen
  3. Select an invoice with status "Submitted" and click the "Review" button
  4. Close and select an invoice with status "Reviewed" and click the "Approve" button
- **Expected Result:** 1. The application opens successfully. 2. Invoice Overview screen is displayed with the list of invoices. 3. The invoice PDF opens successfully without any error
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Negative/error-state check ensuring the PDF viewer never shows a broken/error state for either the Review or Approve entry points — a good baseline reliability test to run broadly across many invoices (e.g. as a smoke sweep) since PDF generation failures would otherwise surface silently.

## IO-032 (b) — Three-dot menu shows Delete Draft for Draft invoices
- **Module:** Actions Menu
- **User Role:** PM / BDU (both — different visibility rules)
- **Preconditions:** At least one **Draft** the persona can see. Else fail: no Draft available — please create a draft.
- **Live-locked (15 Sep 2026):**
  - **PM:** **Delete Draft** only on drafts **they own** (My Invoices / own rows).
  - **Admin (BDU):** On **All Invoices**, can see **Delete Draft** on **other users’ drafts** as well as their own.
  - ⋮ also shows **Send Notification** (bell) — out of scope for this case except not to click it.
- **Steps:**
  1. Open Invoice Overview (Admin: All Invoices)
  2. Find a Draft row the persona should be allowed to delete
  3. Click row **⋮**
  4. Assert **Delete Draft** (red) is visible
  5. Optional companion: PM on someone else’s draft (if visible) → Delete Draft **hidden**; or skip if PM cannot see others’ drafts
- **Expected Result:** Delete Draft visibility matches owner vs Admin/All rules above
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Visibility only — do **not** click Delete Draft here (that is IO-034).

## IO-033 — Delete Draft removes the draft (no confirmation popup)
- **Module:** Actions Menu
- **User Role:** PM / BDU
- **Live-locked:** Clicking **Delete Draft** deletes immediately — **no** confirmation popup.
- **Steps:**
  1. Ensure an Edit Draft row exists (seed a disposable Draft if needed)
  2. ⋮ → **Delete Draft**
  3. Do not wait for Continue / Yes / OK
  4. Assert Edit Draft is gone from Overview
- **Expected Result:** Draft row is deleted; no popup
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Excel expected a confirm gate; product deletes immediately. IO-033 asserts that delete. IO-034 is the same path with a row marker.

## IO-034 — Confirming Delete Draft removes the invoice
- **Module:** Actions Menu
- **User Role:** PM / BDU (both — each deletes a draft they are allowed to delete)
- **Preconditions:** A **disposable Draft** (prefer one created for the test, or a clearly throwaway row). Else fail: no disposable Draft — please create one.
- **Live-locked:** ⋮ → **Delete Draft** → invoice removed **immediately** (no confirm). Gallery refreshes; that draft is gone.
- **Steps:**
  1. Note partner/project (and invoice # if any) of a disposable Draft
  2. ⋮ → Delete Draft
  3. Assert no confirmation dialog
  4. Assert that draft row is no longer in the gallery
- **Expected Result:** Draft deleted immediately; row gone
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Mutating. Never delete shared/production-important drafts. Title keeps Excel ID; behaviour is direct delete, not “confirm”.

## IO-035 — Cancel option available for Approved invoices
- **Module:** Actions Menu
- **User Role:** BDU / Admin only (`@admin`)
- **Preconditions:** At least one **Approved** invoice visible under All Invoices. Else fail: no Approved invoice — please create/approve one.
- **Live-locked (15 Sep 2026 + screenshots):** On Approved row ⋮ menu: **Send Notification**, **Cancel Invoice** (red), **Send Instantly**. PM not confirmed to see Cancel — treat as Admin-only until told otherwise.
- **Steps:**
  1. Login as Admin → Invoice Overview → All Invoices
  2. Find an Approved row (Next Step **View**)
  3. Click ⋮ → assert **Cancel Invoice** visible (red)
  4. Do **not** confirm cancel in this case (visibility only)
- **Expected Result:** Cancel Invoice present on Approved ⋮ for Admin
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Visibility only. Full cancel flow is IO-036.

## IO-036 — Cancelling invoice changes status to Cancelled
- **Module:** Actions Menu
- **User Role:** BDU / Admin only (`@admin`)
- **Preconditions:** A **disposable Approved** invoice (prefer throwaway). Else fail with seed message.
- **Live-locked:**
  1. ⋮ → **Cancel Invoice**
  2. **Comments** modal — placeholder “Type here.”; **Cancel Invoice** button **disabled** until text entered
  3. Type a reason → button enables (red) → click **Cancel Invoice**
  4. Toast: **Invoice has been cancelled**
  5. Status becomes **Cancelled**; app opens **edit mode** with the comment visible; user can **Save Draft** / **Submit** (resubmit) again
- **Steps:**
  1. Admin opens disposable Approved → ⋮ → Cancel Invoice
  2. Assert Comments modal; assert Cancel Invoice disabled while empty
  3. Type reason (e.g. `automation cancel`) → assert button enabled → click
  4. Assert toast **Invoice has been cancelled**
  5. Assert edit form (or Cancelled status + comments field showing the reason)
  6. Close without mandatory resubmit (resubmit optional companion later)
- **Expected Result:** Cancelled + toast + comments required + lands in editable state with comment
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Mutating. Never cancel shared production invoices. Excel “confirm” = Comments modal + enabled Cancel Invoice button, not a separate Yes/No dialog.

## IO-037 — BDU / Reviewer can review a Submitted invoice
- **Module:** Review Action
- **User Role:** BDU / Admin (`@admin`)
- **Preconditions:** A Submitted invoice (Next Step **Review**) exists. Else fail: no Submitted invoice — please submit one.
- **Live-locked (DEV 16 Sep 2026):** Review opens **View Invoice** with PDF, **Flag**, and **Mark as Reviewed**. Close-without-action is TC-IO-20; Flag is IO-039. This case is the **Mark as Reviewed** branch.
- **Steps:**
  1. Admin → Invoice Overview → All Invoices
  2. Click **Review** on a Submitted row
  3. Assert **View Invoice**, PDF, **Flag**, **Mark as Reviewed**
  4. Click **Mark as Reviewed** (fill Comments if the button stays disabled)
  5. After **Mark as Reviewed**, poll Dataverse `dia_status` for that invoice # until **Reviewed** (live: **Pending** while the review flow runs). Flow-run evidence is a later add-on.
- **Expected Result:** `dia_status` = **Reviewed**. Confirmed DEV 16 Sep 2026 on **2026-0441**. Do not treat other gallery rows’ Approve as success.
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Mutating. Wait through Pending until Reviewed. Do not Flag here (IO-039). Close-only is TC-IO-20.

## IO-038 — BDU / Approver can approve a Reviewed invoice
- **Module:** Approve Action
- **User Role:** BDU / Admin (`@admin`)
- **Preconditions:** A Reviewed invoice (Next Step **Approve**) exists. Else fail: no Reviewed invoice — please review a disposable invoice.
- **Live-locked (DEV 16 Sep 2026):** **View Invoice** overlay footer is **Flag** + **Approve** (orange). Do not Flag here (IO-040). After approve, poll Dataverse `dia_status` (live: **Pending** while the approval flow runs). Flow-run evidence is a later add-on.
- **Steps:**
  1. Admin → Invoice Overview → All Invoices
  2. Click **Approve** on a Reviewed row
  3. Assert **View Invoice**, PDF, **Flag**, and the approve action
  4. Click approve (fill Comments if the button stays disabled)
  5. Poll Dataverse `dia_status` for that invoice # until **Approved**
- **Expected Result:** `dia_status` = **Approved**. Do not treat other gallery rows’ View as success.
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Mutating. Wait through Pending until Approved. Flag-from-Reviewed is IO-040.

## IO-039 — BDU / Reviewer can flag a Submitted invoice
- **Module:** Flag Action
- **User Role:** BDU / Admin (`@admin`)
- **Preconditions:** A Submitted invoice (Next Step **Review**) exists. Else fail: no Submitted invoice — please submit a disposable invoice.
- **Live-locked (DEV 16 Sep 2026):** Overlay **Flag** then **Flag Reason** (“Please add your reason for flagging this invoice.”) + **Finish**. Poll Dataverse `dia_status` until **Flagged**. Email and flow-run evidence are later add-ons.
- **Steps:**
  1. Admin → Invoice Overview → All Invoices
  2. Click **Review** on a Submitted row
  3. Click overlay **Flag** → fill **Flag Reason** → **Finish**
  4. Poll Dataverse `dia_status` for that invoice # until **Flagged**
- **Expected Result:** `dia_status` = **Flagged**. Next Step **Edit**. Do not treat other rows as success.
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Mutating IO-037 Flag branch. Email is out of scope for now. Flag-from-Reviewed is IO-040.

## IO-040 — BDU / Approver can flag a Reviewed invoice
- **Module:** Flag Action
- **User Role:** BDU / Admin (`@admin`)
- **Preconditions:** A Reviewed invoice (Next Step **Approve**) exists. Else fail: no Reviewed invoice — please review a disposable invoice.
- **Live-locked (DEV 16 Sep 2026):** Same Flag path as IO-039. Entry is **Approve** → View Invoice → overlay **Flag** → **Flag Reason** → **Finish**. Poll Dataverse `dia_status` until **Flagged**. Email and flow-run evidence are later add-ons.
- **Steps:**
  1. Admin → Invoice Overview → All Invoices
  2. Click **Approve** on a Reviewed row
  3. Click overlay **Flag** → fill **Flag Reason** → **Finish**
  4. Poll Dataverse `dia_status` for that invoice # until **Flagged**
- **Expected Result:** `dia_status` = **Flagged**. Next Step **Edit**. Do not treat other rows as success.
- **Priority:** High | **Status:** Active | **Automation:** Locked
- **Scenario Explanation:** Mutating. Same overlay Flag flow as IO-039; entry is Reviewed/Approve instead of Submitted/Review.

## IO-041 — Invoice amounts display correct decimal values
- **Module:** Decimal Values
- **User Role:** PM / BDU
- **Preconditions:** Invoice with decimal amounts exists
- **Steps:**
  1. View an invoice in the gallery with decimal rate/amount
  2. Check displayed values
- **Expected Result:** Decimal values are displayed correctly. Rate and Total values limited to 4 decimal places
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Ties directly to the ongoing **Non-NA PDF quantity formatting** work (minimum 2 decimals, preserving 3–4 when intentionally entered). Automation here is at the gallery/overview level rather than the PDF, so it's a good complementary check — verify the same N2/N3/N4 formatting logic applies consistently in the gallery view, not just the generated PDF.
- **Automated steps (16 Sep 2026):** Admin creates an **adhoc** invoice on a non-NA project (fixtures pick the active partner/project pair), adds five line items using Editable Rate products that carry **no default catalog rate**, Qty 1 each, rates `2 / 1.2 / 1.21 / 1.123 / 1.1234`. Submit, then find the row on Overview by **project name** (search by invoice number does not match) and wait out the disabled "Background Invoice Process Running" Next Step by refreshing the gallery. Open the row's Next Step to get **View Invoice**, read the PDF.js text layer, and compare each row's Rate against what was typed — anchored on the row description so a neighbouring row cannot satisfy the check. Close the overlay with `icn_closeViewInvoiceInvoiceOverview`; no Flag / Mark as Reviewed.
- **Current result:** PASS criteria updated 21 Sep 2026 — PDF Rate and Amount are **2 decimals** (`2`→`2.00`, `1.2`→`1.20`, `1.21`→`1.21`, `1.123`→`1.12`, `1.1234`→`1.12`). That is the intended product rule. The form may still keep 3–4 decimals in the Rate field; IO-041 only asserts the PDF.

## IO-042 — Alphabetical Order
- **Module:** Alphabetical Order
- **User Role:** PM / BDU
- **Preconditions:** Multiple partners/projects exist
- **Steps:**
  1. Click filter icon on Partner column
  2. Observe the order of values shown
- **Expected Result:** Partner, Project, and other dropdown filter values are displayed in alphabetical order
- **Priority:** Low | **Status:** Active
- **Scenario Explanation:** General UX/consistency check that all column-filter dropdown value lists (not just Partner) are alphabetically sorted — worth expanding into a small parameterized test across Partner, Project, and Status filter dropdowns.
- **Automated steps (16 Sep 2026):** One audit test. Sort arrows (`clickColumnSortArrow`) on Partner, Project and Invoice # are clicked twice each and the gallery values checked ascending then descending. Then each funnel (`clickColumnFunnel` → `cmb_PartnerFilter` / `cmb_ProjectFilter` / `cnt_ActionPendingFilter` / `dd_StatusFilter`) is opened and its value list read and checked A→Z. Findings are attached as a markdown report.
- **Current result:** Sorts pass both directions. FAILS on funnel order — Partner (194 values, starts `Test Account1, Hearfit21, CN…`), Project (294 values, `27th aug, qq, ttt, AOC…`) and Action Pending with (14 values, `Sohan Lal, Aryan Kotiyal…`) are in creation order. The Status funnel is lifecycle-ordered (Draft, Reviewed, Approved, Flagged, Submitted, Fail-*, Cancelled, Sent) — reported for confirmation, not asserted.

---

## Data Gaps in Source Document (flag before automating)

- **Duplicate ID:** Two distinct test cases were both labeled **IO-032** in the source PDF — one for "PDF Loads Without Error" (module: PDF Viewer) and one for "Three-dot menu shows Delete Draft" (module: Actions Menu). Both are included above, labeled IO-032 (a) and IO-032 (b). Recommend confirming the correct IDs with the source-of-truth test plan (e.g. renumber the second one to IO-043) before generating Playwright test file names from these IDs.
- **Missing IO-043:** No test case content was provided for this ID — likely where the renumbered duplicate above should go.
- **Blank rows IO-044 and IO-045:** These IDs appear in the source document with no title, role, steps, or expected result populated. They are placeholders only — no test content exists to automate. Flag these as "TBD" in the Cursor project and follow up with the app owner (Arun or the QA lead) for the missing details before writing any test code against them.

---

## Automation Notes for Cursor / Playwright Suite

- **Framework:** Playwright on Windows, Node.js 18+, TypeScript recommended
- **Structure:** Reuse the same `invoice-automation/` project (`tests/`, `pages/`, `fixtures/`, `playwright.config.ts`) as the Create Invoice suite — add a new `invoice-overview.spec.ts` file and a corresponding `InvoiceOverviewPage` Page Object.
- **Canvas App locator strategy:** Same iframe-based approach as Create Invoice screen — the gallery, filters, and PDF viewer popup likely live in nested/dynamic iframes; use `page.frameLocator(...)` and accessible names over generated control IDs.
- **Date-filter tests (IO-002–IO-009):** Seed test data with invoices dated relative to "today" at test-run time (e.g. `today - 1 month`, `today + 1 month` relative to the 5th-of-month boundary) rather than hardcoded dates, so the suite stays valid across calendar months.
- **Priority test cases to automate first (tied to known active bugs/fixes):**
  - IO-009 (future-month filter overlap — direct ADO bug regression test, linked to the `dia_Start` +1 vs +6 formula fix)
  - IO-041 (decimal display — linked to Non-NA PDF quantity formatting fix)
  - IO-025, IO-039, IO-040 (Flag/Edit — linked to the Fail-Update resubmit Patch bug, CI-057)
  - IO-027 (Fail-Creation Report button — linked to flow failure handling / Non-NA double-trigger investigation)
- **Branching tests:** Split IO-037 into three separate test cases (Review→Mark Reviewed, Review→Flag, Review→Close-no-action) for clean pass/fail reporting per branch.
- **PDF verification:** Reuse the `pdf-parse`-based helper from the Create Invoice suite for IO-030 (download) and any content checks.
- **Email verification:** IO-039, IO-040 require the same test-mailbox/email API integration used for the Create Invoice suite's email tests (CI-058, CI-065–069).
- **Duplicate/missing IDs:** Resolve the IO-032 duplicate and the blank IO-044/IO-045 rows (see "Data Gaps" section above) before generating final Playwright test names, so file/test IDs map 1:1 with the test plan.

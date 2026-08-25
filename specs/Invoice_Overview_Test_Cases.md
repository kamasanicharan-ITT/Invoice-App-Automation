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
- **User Role:** PM / BDU
- **Preconditions:** Multiple invoices with different partners exist
- **Steps:**
  1. Click Partner column header
  2. Observe sort order
  3. Click again
- **Expected Result:** First click sorts A-Z, second click sorts Z-A
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Two-state toggle-sort test — automation should read the full Partner column values before/after each click and assert strict alphabetical ordering both directions.

## IO-017 — Project column sorts correctly
- **Module:** Sort
- **User Role:** PM / BDU
- **Preconditions:** Multiple invoices with different projects exist
- **Steps:**
  1. Click Project column header
  2. Observe sort order
- **Expected Result:** Invoice list sorts by project name
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Same sort pattern as IO-016 applied to the Project column.

## IO-018 — Invoice # column sorts correctly
- **Module:** Sort
- **User Role:** PM / BDU
- **Preconditions:** Multiple invoices with invoice numbers exist
- **Steps:**
  1. Click Invoice # column header
  2. Observe sort order
- **Expected Result:** Invoice list sorts by invoice number
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Sort test for Invoice # — worth checking whether sort is numeric or string-based, since invoice numbers include a year prefix (e.g. "2026-0265") which sorts differently under each scheme.

## IO-019 — Status column sorts correctly
- **Module:** Sort
- **User Role:** PM / BDU
- **Preconditions:** Invoices with different statuses exist
- **Steps:**
  1. Click Status column header
  2. Observe sort order
- **Expected Result:** Invoice list sorts by status value
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Sort test for the Status column — clarify with the app owner whether this is alphabetical or a custom lifecycle-order sort (Draft → Submitted → Reviewed → Approved → Sent), since that affects the expected assertion.

## IO-020 — Partner column filter works
- **Module:** Column Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices with multiple partners exist
- **Steps:**
  1. Click filter icon on Partner column
  2. Select a specific partner
  3. Observe results
- **Expected Result:** Gallery shows only invoices for the selected partner
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Column-level (not global-search) filter test — distinct UI control from IO-013's search box; verify it's an independent filter mechanism.

## IO-021 — Status column filter works
- **Module:** Column Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices with multiple statuses exist
- **Steps:**
  1. Click filter icon on Status column
  2. Select a specific status
  3. Observe results
- **Expected Result:** Gallery shows only invoices with the selected status
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Same column-filter pattern as IO-020, applied to Status — good to parameterize across all known status values (Draft, Submitted, Reviewed, Approved, Sent, Flagged, Cancelled, Fail-Creation).

## IO-022 — Action Pending With filter works
- **Module:** Column Filter
- **User Role:** PM / BDU
- **Preconditions:** Invoices assigned to multiple users exist
- **Steps:**
  1. Click filter icon on Action Pending With column
  2. Select a user
  3. Observe results
- **Expected Result:** Gallery shows only invoices pending action with the selected user
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Confirms the "Action Pending With" column filter correctly ties to the workflow-assignment logic (whoever needs to act next), not just a static owner field.

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
- **User Role:** BDU
- **Preconditions:** A Submitted invoice exists and PDF viewer is open
- **Steps:**
  1. Click Review on a Submitted invoice
  2. Observe the PDF viewer controls
- **Expected Result:** PDF viewer shows: page up/down buttons, page number indicator (e.g. 1/1), zoom in (+), zoom out (-), search icon, download button, close (X) button
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Control-inventory test for the PDF viewer chrome — assert each named control is present; a good candidate to combine with IO-030/IO-031 which exercise the Download and Close buttons specifically.

## IO-030 — Download button in PDF viewer saves the PDF
- **Module:** PDF Viewer
- **User Role:** PM / BDU
- **Preconditions:** An invoice PDF is open in the viewer
- **Steps:**
  1. Open PDF viewer for an invoice
  2. Click the Download button
- **Expected Result:** PDF file is downloaded to the user's local machine
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Download-mechanics test — use Playwright's `page.waitForEvent('download')` pattern, same approach as CI-071 in the Create Invoice suite.

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
- **User Role:** PM / BDU
- **Preconditions:** A Draft invoice exists
- **Steps:**
  1. Find a Draft invoice
  2. Click the three-dot menu icon on that row
- **Expected Result:** Delete Draft option is visible in the menu
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** ⚠️ **Duplicate ID in source document** — this test case shares the ID "IO-032" with the PDF-loads-without-error test above. Recommend renumbering this one to **IO-032a** (PDF check) and **IO-032b** (Delete Draft menu) — or renumbering this one to **IO-043** to fill the gap before IO-044/IO-045 — when building the Playwright test file, so test names/IDs stay unique. Functionally, this checks that the row-level three-dot context menu correctly conditions its options on invoice status (Delete Draft only for Draft).

## IO-033 — Delete Draft shows confirmation popup
- **Module:** Actions Menu
- **User Role:** PM / BDU
- **Preconditions:** A Draft invoice exists
- **Steps:**
  1. Click three-dot menu on a Draft invoice
  2. Click Delete Draft
- **Expected Result:** A confirmation popup appears before deletion
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms a destructive action is gated behind a confirmation step — should also verify a "Cancel"/dismiss path on the popup leaves the draft intact (not explicitly stated but a sensible companion assertion).

## IO-034 — Confirming Delete Draft removes the invoice
- **Module:** Actions Menu
- **User Role:** PM / BDU
- **Preconditions:** A Draft invoice exists
- **Steps:**
  1. Click Delete Draft from three-dot menu
  2. Confirm deletion in the popup
- **Expected Result:** Invoice is deleted. Gallery refreshes and the draft invoice is no longer visible
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Completes the delete flow started in IO-033 — assert both the gallery no-longer-shows-the-row AND (if feasible) that the underlying Dataverse record is actually removed, not just hidden from view.

## IO-035 — Cancel option available for Approved invoices
- **Module:** Actions Menu
- **User Role:** BDU
- **Preconditions:** Invoices in Submitted, Reviewed, Approved status exist
- **Steps:**
  1. Login as BDU
  2. Click three-dot on Approved invoice
- **Expected Result:** Cancel option is visible
- **Priority:** High | **Status:** Active
- **Notes:** BDU only
- **Scenario Explanation:** Role-gated menu-option test — "BDU only" note implies a PM login should NOT see this Cancel option; consider adding a negative-case assertion for a PM user on the same invoice if role-based UI differs (worth confirming with the app owner, since preconditions mention Submitted/Reviewed/Approved but steps only exercise Approved).

## IO-036 — Cancelling invoice changes status to Cancelled
- **Module:** Actions Menu
- **User Role:** BDU
- **Preconditions:** An Approved invoice exists
- **Steps:**
  1. Login as BDU
  2. Click Cancel from three-dot menu on Approved invoice
  3. Enter the reason for cancellation
  4. Confirm cancellation
- **Expected Result:** Invoice status changes to Cancelled
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Completes the Cancel flow from IO-035 — note the mandatory "reason" text entry; automation should assert the reason field is required (try submitting blank) and that the entered reason persists on the record.

## IO-037 — BDU / Reviewer can review a Submitted invoice
- **Module:** Review Action
- **User Role:** BDU / Reviewer
- **Preconditions:** A Submitted invoice exists
- **Steps:**
  1. Open the invoice overview screen
  2. Click Review on the Submitted invoice
  3. View the PDF
  4. Click Mark as Reviewed or Flag or close
- **Expected Result:** PDF viewer opens. BDU can choose to Review, Flag, or close without action. Invoice status updates accordingly
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Branching-outcome test with three distinct paths from one entry point (Mark as Reviewed / Flag / Close-no-action). Recommend splitting this into three separate Playwright test cases — one per branch — each asserting the correct resulting status (Reviewed, Flagged, or unchanged/Submitted).

## IO-038 — BDU / Approver can approve a Reviewed invoice
- **Module:** Approve Action
- **User Role:** BDU / Approver
- **Preconditions:** A Reviewed invoice exists
- **Steps:**
  1. Open the invoice overview screen
  2. Click Approve on the Reviewed invoice
  3. Confirm approval
- **Expected Result:** Invoice status changes to Approved
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Core happy-path status-transition test for the Approve action — pairs with CI-053/CI-055 (full lifecycle) in the Create Invoice suite.

## IO-039 — BDU / Reviewer can flag a Submitted invoice
- **Module:** Flag Action
- **User Role:** BDU / Reviewer
- **Preconditions:** A Submitted invoice exists
- **Steps:**
  1. Open the Application as BDU or reviewer
  2. Click on Review
  3. Click on Flag
- **Expected Result:** Invoice status changes to Flagged. Email notification sent to submitter
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** One of the three IO-037 branches, isolated as its own test — verify both the status change AND the email trigger (ties to CI-058 in the Create Invoice suite, same notification).

## IO-040 — BDU / Approver can flag a Reviewed invoice
- **Module:** Flag Action
- **User Role:** BDU / Approver
- **Preconditions:** A Reviewed invoice exists
- **Steps:**
  1. Open the Application as BDU / Approver
  2. Flag a Reviewed invoice
- **Expected Result:** Invoice status changes to Flagged. Notification email sent
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms Flag is available from a second entry point (Reviewed, not just Submitted) — good to verify the resulting Flagged invoice re-enters the Edit/resubmit flow (IO-025, CI-057) the same way regardless of which stage it was flagged from.

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

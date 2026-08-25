# Synergy Invoice Application — Create Invoice Screen Test Cases

**Application:** Invoice Application (Canvas App)
**Screen:** Create Invoice
**Total Test Cases:** 75 (CI-001 to CI-075)

> Note for Cursor: Each test case below includes the original test data (ID, Module, Title, User Role, Preconditions, Steps, Expected Result, Priority, Status, Notes) plus a plain-language "Scenario Explanation" describing the intent of the test, to help generate accurate Playwright automation (Page Object Model, locators, assertions).

---

## CI-001 — Create Invoice screen loads with all form elements
- **Module:** Page Load
- **User Role:** PM / BDU
- **Preconditions:** User clicks Create Invoice from header nav
- **Steps:**
  1. Click 'Create Invoice' link in header
  2. Observe the screen
- **Expected Result:** Screen loads showing: title 'New Invoice', Brand New/Start with Last Invoice radio buttons, Adhoc Invoice toggle (OFF), Send Instantly toggle (OFF), Invoice Number field, PO Number field, Invoice Date picker, Partner combo, Project combo, Service Start Date, Service End Date, line items gallery, Add new item, Internal Notes, Close/Save Draft/Submit buttons
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** This is a smoke test verifying that the Create Invoice screen renders all expected UI controls after navigation. Automation should assert visibility/presence of each named control after clicking the header nav link.

## CI-002 — Brand New creates empty form with defaults
- **Module:** Start Mode
- **User Role:** PM / BDU
- **Preconditions:** User is on Create Invoice screen
- **Steps:**
  1. Select 'Brand New' radio button
  2. Observe form state
- **Expected Result:** All fields are empty except: Service Start Date defaults to first day of current month, Service End Date defaults to last day of current month, Invoice Date defaults to last day of current month
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms the "Brand New" mode initializes a clean form with only date fields pre-populated using current-month logic. Automation should compute expected dates dynamically based on the current system date rather than hardcoding.

## CI-003 — Start with Last Invoice pre-fills fields from previous invoice
- **Module:** Start Mode
- **User Role:** PM / BDU
- **Preconditions:** At least one previous invoice exists for a project
- **Steps:**
  1. Select 'Start with last invoice' radio button
  2. Select the same Partner and Project
  3. Observe fields
- **Expected Result:** Partner and Project are pre-filled. Line items (Product/Service, Description, Quantity, Rate) are pre-filled from last invoice. Dates reset to current month defaults. Invoice Number is blank
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Validates the "clone from last invoice" convenience feature copies line-item data but NOT dates or invoice number. A good regression check for the recycling/copy logic that previously had gallery template issues.

## CI-004 — Adhoc Invoice toggle switches to Yes
- **Module:** Adhoc Toggle
- **User Role:** BDU
- **Preconditions:** User is on Create Invoice screen
- **Steps:**
  1. Click the Adhoc Invoice toggle
  2. Observe toggle state
- **Expected Result:** Toggle switches to 'Yes' state
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Basic toggle-control state test. Simple click-and-assert automation.

## CI-005 — Adhoc bypasses future date restriction
- **Module:** Adhoc Toggle
- **User Role:** BDU
- **Preconditions:** User is on Create Invoice screen with Adhoc ON
- **Steps:**
  1. Turn on Adhoc toggle
  2. Set Invoice Date to 6 months in the future
  3. Observe Submit button
- **Expected Result:** Submit button remains enabled for future dates beyond the 3-month non-adhoc limit as long as contract covers the date
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms adhoc invoices are exempt from the standard 3-month future-date cap that applies to normal invoices, provided the contract range still covers the date. Ties into the DisplayMode/contract validation logic (relevant to BUG 147908 area).

## CI-006 — Non-adhoc PM restricted to 3 months future
- **Module:** Create Invoice
- **User Role:** PM
- **Preconditions:** User is PM
- **Steps:**
  1. Open create Invoice screen
  2. Fill the Project and partner
  3. Set Invoice Date to 3 months ahead (September 30)
  4. Set Invoice Date to 4 months ahead (October 1)
  5. Observe Submit button
- **Expected Result:** September 30 → Submit enabled. October 1 → Submit disabled
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Boundary-value test for the 3-month future date rule for non-adhoc PM invoices. Automation should test the exact boundary date and the day immediately after it.

## CI-007 — Send Instantly toggle switches on and off
- **Module:** Send Instantly
- **User Role:** BDU / PM
- **Preconditions:** User is on Create Invoice screen
- **Steps:**
  1. Click Send Instantly toggle
  2. Observe state
  3. Click again
- **Expected Result:** Toggle switches between Yes and No states
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Simple two-way toggle test, verifying idempotent click behavior.

## CI-008 — Invoice creation blocked when no active contract exists
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** A project exists with no active contract
- **Steps:**
  1. Select a partner
  2. Select a project that has no active contract
  3. Observe the error message
- **Expected Result:** Toast notification shows 'No active contracts found for the selected project'. Submit and Save Draft buttons are disabled
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Verifies error handling/guard-rail when a project has zero active contracts — both the toast message text and button disable state should be asserted.

## CI-009 — Active contract is shown in contract dropdown
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** A project with active contract exists
- **Steps:**
  1. Select a partner
  2. Select a project with an active contract
  3. Observe the success message
- **Expected Result:** Active contract is selected
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Happy-path check that a project with a valid active contract auto-selects/populates it correctly.

## CI-010 — Inactive contract is not shown in contract dropdown
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** A project has both active and inactive contracts
- **Steps:**
  1. Select a partner and project with inactive contracts
  2. Observe contract dropdown
- **Expected Result:** Inactive contracts do not appear in the dropdown. Only active contracts are shown
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Filtering test — the contract dropdown/collection should only be populated via a filter on active status. Good candidate to verify via delegable query correctness.

## CI-011 — Contract must cover Invoice Date
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** A contract with specific date range exists (e.g. July 1-10)
- **Steps:**
  1. Select a project with contract July 1-10
  2. Set Invoice Date to July 15 (outside contract)
  3. Observe warning and button states
- **Expected Result:** Contract warning banner appears. Submit and Save Draft buttons are disabled because contract does not cover the invoice date
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Core contract-date validation test for Invoice Date specifically. Relevant to the `CountRows(Filter(col_ContractDetails, ...))` validation logic used in Save Draft/Submit DisplayMode formulas.

## CI-012 — Contract must cover Service End Date
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** Contract exists for July 1-10
- **Steps:**
  1. Select a project with contract July 1-10
  2. Set Invoice Date to July 5 (within contract)
  3. Change Service End Date to July 11 (outside contract)
  4. Observe warning and button states
- **Expected Result:** Contract warning banner appears. Submit and Save Draft buttons are disabled because Service End Date is outside contract coverage
- **Priority:** High | **Status:** Active
- **Notes:** Key bug scenario
- **Scenario Explanation:** ⭐ This is the direct regression test for **BUG 147908** — Save Draft was incorrectly enabling for adhoc invoices when Service End Date fell outside the contract range. This test case should be prioritized in automation and run against both adhoc and non-adhoc branches to confirm the fix (contract validation added to both DisplayMode branches).

## CI-013 — Contract warning clears when valid dates are reselected
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** Contract exists for specific date range
- **Steps:**
  1. Set an invalid Service End Date outside contract
  2. Observe warning
  3. Change Service End Date back to within contract range
- **Expected Result:** Contract warning disappears. Submit and Save Draft buttons re-enable
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Verifies the warning/button state is reactive and reversible, not "sticky" — important because DisplayMode formulas must recalculate live as date fields change.

## CI-014 — Multiple active contracts — user can select one
- **Module:** Contract
- **User Role:** PM / BDU
- **Preconditions:** A project has multiple active contracts
- **Steps:**
  1. Select a partner and project with multiple active contracts
  2. Observe contract selection behavior
- **Expected Result:** User is prompted to select from the available active contracts. Invoice can be created after selection
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Tests the multi-contract disambiguation UI/flow — ensures the dropdown/selector appears rather than the app silently picking one or erroring.

## CI-015 — Service Start Date defaults to first day of current month
- **Module:** Date Validation
- **User Role:** PM / BDU
- **Preconditions:** New invoice form is open
- **Steps:**
  1. Open Create Invoice with Brand New
  2. Observe Service Start Date value
- **Expected Result:** Service Start Date defaults to the first day of the current month (e.g. July 1, 2026)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Date-default test; automation should calculate "first day of current month" dynamically at run time, not hardcode a date.

## CI-016 — Service End Date defaults to last day of current month
- **Module:** Date Validation
- **User Role:** PM / BDU
- **Preconditions:** New invoice form is open
- **Steps:**
  1. Open Create Invoice with Brand New
  2. Observe Service End Date value
- **Expected Result:** Service End Date defaults to the last day of the current month (e.g. July 31, 2026)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Same as CI-015 but for end-of-month; watch for month-length edge cases (28/29/30/31 days) when parameterizing tests across months.

## CI-017 — Invoice Date defaults to last day of current month
- **Module:** Date Validation
- **User Role:** PM / BDU
- **Preconditions:** New invoice form is open
- **Steps:**
  1. Open Create Invoice with Brand New
  2. Observe Invoice Date value
- **Expected Result:** Invoice Date defaults to the last day of the current month
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms Invoice Date and Service End Date share the same default logic on a fresh form.

## CI-018 — Toast error when Service Start Date >= Service End Date
- **Module:** Date Validation
- **User Role:** PM / BDU
- **Preconditions:** User is on Create Invoice
- **Steps:**
  1. Set Service Start Date to July 15
  2. Set Service End Date to July 10 (before start)
  3. Observe behavior
- **Expected Result:** Toast error message appears indicating Service End Date must be after Start Date. Submit and Save Draft are disabled
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Cross-field validation test ensuring the app prevents illogical date ranges. Should test both the exact equal-dates case (Start == End) and the reversed case (Start > End) since the rule says ">=".

## CI-019 — Invoice Date follows Service End Date
- **Module:** Date Validation
- **User Role:** PM / BDU
- **Preconditions:** User is on Create Invoice
- **Steps:**
  1. Open Create Invoice Screen
  2. Change the Service End Date to a new date
  3. Observe Invoice Date
- **Expected Result:** Invoice Date automatically updates to match the new Service End Date when changed
- **Priority:** High | **Status:** Active
- **Notes:** Key edit mode behavior
- **Scenario Explanation:** Tests an auto-sync/OnChange behavior between two date fields. Important for edit-mode automation — after editing Service End Date, assert Invoice Date field value updates without manual entry.

## CI-020 — Future date red banner appears when date exceeds limit
- **Module:** Date Validation
- **User Role:** PM
- **Preconditions:** Adhoc is OFF
- **Steps:**
  1. Login as PM
  2. Set Invoice Date to 4 months ahead (beyond PM 3-month limit)
  3. Observe the screen
- **Expected Result:** Red banner/warning appears indicating the selected date is beyond the allowed future limit
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** UI-warning test paired with CI-006's button-disable test — this checks the visual banner specifically, complementing the Submit button state check.

## CI-021 — No red banner for dates within allowed future limit
- **Module:** Date Validation
- **User Role:** PM
- **Preconditions:** Adhoc is OFF
- **Steps:**
  1. Login as PM
  2. Set Invoice Date to 1 month ahead (within 3-month PM limit)
  3. Observe the screen
- **Expected Result:** No red banner appears. Submit button remains enabled (if other validations pass)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Negative-case counterpart to CI-020 — ensures the banner doesn't show false positives within the valid range.

## CI-022 — Partner combo box is required
- **Module:** Partner/Project
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open
- **Steps:**
  1. Leave Partner field empty
  2. Fill all other required fields
  3. Observe Submit button
- **Expected Result:** Submit and Save Draft buttons remain disabled when Partner is not selected
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Required-field validation test; Partner should be treated as a hard blocker for both Submit and Save Draft DisplayModes.

## CI-023 — Project combo box filters based on selected Partner
- **Module:** Partner/Project
- **User Role:** PM / BDU
- **Preconditions:** Partners with associated projects exist
- **Steps:**
  1. Select a Partner from the dropdown
  2. Observe Project dropdown options
- **Expected Result:** Project dropdown shows only projects associated with the selected Partner
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Cascading-dropdown filter test. Automation should capture the Project list before and after Partner selection and assert the filtered set only contains related projects.

## CI-024 — Free text in Partner without selecting is invalid
- **Module:** Partner/Project
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open
- **Steps:**
  1. Click Partner field
  2. Type a partner name but do NOT select from dropdown
  3. Observe Submit and Save Draft buttons
- **Expected Result:** Submit and Save Draft buttons remain disabled. Only a valid dropdown selection enables the buttons
- **Priority:** High | **Status:** Active
- **Notes:** new scenario not yet fixed
- **Scenario Explanation:** ⚠️ Flagged as **not yet fixed** — this is a known outstanding defect where free-text entry without an actual selection may incorrectly enable buttons. This should be automated as a regression guard once fixed, and currently may fail (expected fail / known issue) — flag this in the Playwright test with a `test.fixme()` or skip annotation until resolved.

## CI-025 — Free text in Project without selecting is invalid
- **Module:** Partner/Project
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open
- **Steps:**
  1. Select a valid Partner
  2. Click Project field
  3. Type a project name but do NOT select from dropdown
  4. Observe Submit and Save Draft buttons
- **Expected Result:** Submit and Save Draft buttons remain disabled
- **Priority:** High | **Status:** Active
- **Notes:** new scenario not yet fixed
- **Scenario Explanation:** ⚠️ Same known-issue category as CI-024 but for the Project field. Same automation caveat applies (mark as known-failing until fixed).

## CI-026 — Clearing Partner selection disables Submit
- **Module:** Partner/Project
- **User Role:** PM / BDU
- **Preconditions:** Partner is selected and form is valid
- **Steps:**
  1. Select a valid Partner
  2. Clear the Partner field
  3. Observe Submit button
- **Expected Result:** Submit and Save Draft buttons become disabled when Partner is cleared
- **Priority:** High | **Status:** Active
- **Notes:** new scenario not yet fixed
- **Scenario Explanation:** ⚠️ Also flagged as **not yet fixed**. Tests reactive re-validation when a previously valid selection is removed — likely related to delegation/non-delegable LookUp issues noted in prior debugging (combo box selected item ID references).

## CI-027 — At least one line item is required for submission
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open
- **Steps:**
  1. Fill all required header fields
  2. Remove the Line items
  3. Observe Submit button
- **Expected Result:** Submit and Save Draft buttons are disabled when no line items exist
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Ensures an invoice cannot be created with zero line items — a core business rule guard.

## CI-028 — Add new item link adds a row to the gallery
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** At least one line item exists
- **Steps:**
  1. Click the '+ Add new item' link
  2. Observe the gallery
- **Expected Result:** A new empty row is added to the line items gallery. Existing rows are unaffected
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Basic gallery-append test. Given known "gallery template recycling" issues causing cross-row interference, automation should also assert existing row data is untouched (not just row count).

## CI-029 — New row appears blank with no pre-filled product
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** A line item with a preset product is in row 1
- **Steps:**
  1. Click '+ Add new item'
  2. Observe the new row's Product/Service field
- **Expected Result:** New row's Product/Service field is blank ('Find items' placeholder shown). It does NOT inherit the previous row's product selection
- **Priority:** High | **Status:** Active
- **Notes:** Known flicker fix applied
- **Scenario Explanation:** Directly tests the fix for gallery template recycling / cross-row interference (row-scoped Patch into a collection). Good regression test to guard against the old Reset()-based bug reappearing. Consider re-testing after rapid successive "Add new item" clicks for flicker.

## CI-030 — Selecting a Product with preset rate auto-fills Rate
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** A product with preset rate exists (e.g. Abundance Coaching = $100)
- **Steps:**
  1. Click Product/Service dropdown in a line item row
  2. Select a product that has a preset rate
  3. Observe the Rate field
- **Expected Result:** Rate field is automatically populated with the preset rate immediately upon product selection, without needing to enter quantity first
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Auto-fill/OnSelect behavior test — verifies the Rate field updates immediately, decoupled from Quantity entry order.

## CI-031 — Quantity must be greater than zero
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** A line item row exists
- **Steps:**
  1. Set Quantity to 0 in a line item
  2. Observe Submit button
- **Expected Result:** Submit and Save Draft buttons are disabled when any row has Quantity = 0
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Validation rule test — zero quantity should block submission for any row, even if other rows are valid.

## CI-032 — Line item total = Quantity × Rate
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** A line item row exists
- **Steps:**
  1. Enter Quantity = 2 and Rate = 100
  2. Observe Total column
- **Expected Result:** Total shows $200 (2 × 100)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Core calculation test. Good candidate to parameterize with multiple Quantity/Rate combos, including decimals (ties to PDF quantity formatting/decimal precision work).

## CI-033 — Discount line item shows negative total
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** A discount product type exists
- **Steps:**
  1. Select a Discount type product in a line item
  2. Enter quantity and rate
  3. Observe Total
- **Expected Result:** Total is displayed as a negative value reducing the invoice total
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Tests special product-type behavior (Discount) that inverts the sign of the calculated total, and should also verify the overall invoice total reflects the reduction.

## CI-034 — Deleting a line item removes it from the gallery
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** Multiple line items exist
- **Steps:**
  1. Click the delete (trash) icon on a line item row
  2. Observe the gallery
- **Expected Result:** The deleted row is removed from the gallery. Other rows and their data remain unchanged. Total recalculates
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Deletion + row isolation test, again relevant to the row-scoped Patch/collection state-isolation fix — confirm remaining rows keep their exact data after a deletion.

## CI-035 — Completely empty line item row blocks submission
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** An empty row has been added (all 4 fields blank)
- **Steps:**
  1. Click '+ Add new item'
  2. Leave all fields blank in the new row
  3. Try to click Submit
- **Expected Result:** Submit and Save Draft buttons are disabled when a completely empty row exists in the gallery
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Guards against orphaned blank rows sneaking into a submission.

## CI-036 — Incomplete line item (missing any of 4 fields) blocks submission
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** A line item has only 3 of 4 required fields filled
- **Steps:**
  1. Fill Product/Service, Description, Quantity but leave Rate blank
  2. Observe Submit button
- **Expected Result:** Submit button is disabled when any required field in any row is missing
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Should be parameterized across all 4 fields (Product/Service, Description, Quantity, Rate) individually left blank to ensure each one independently blocks submission.

## CI-037 — Create invoice with 10 line items
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** No preconditions
- **Steps:**
  1. Create a new invoice
  2. Add 10 line items with different products, descriptions, quantities and rates
  3. Submit the invoice
- **Expected Result:** All 10 line items are saved correctly. Invoice is submitted successfully. PDF shows all 10 line items
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Volume/scale test for the gallery and PDF generation — good candidate for a longer-running E2E test; also stresses the Canvas App gallery rendering performance with more rows.

## CI-038 — Rate accepts up to 4 decimal places only
- **Module:** Line Items
- **User Role:** PM / BDU
- **Preconditions:** Line item row exists
- **Steps:**
  1. Enter a rate with more than 4 decimal places (e.g. 10.12345)
  2. Observe behavior
- **Expected Result:** Error or value is truncated. More than 4 decimal places are not accepted
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Precision-limit test relevant to the Non-NA PDF quantity/decimal formatting fix — decide whether the app truncates, rounds, or rejects the extra digits, and assert the exact behavior once confirmed.

## CI-039 — Tax selector is optional — invoice can be submitted without tax
- **Module:** Tax
- **User Role:** PM / BDU
- **Preconditions:** Invoice form is complete without tax selection and project should be NA region
- **Steps:**
  1. Fill all required fields
  2. Leave Tax selector blank
  3. Submit the invoice
- **Expected Result:** Invoice is submitted successfully. Total displayed equals Subtotal (no tax applied)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** NA-region-specific tax optionality check — confirms Tax is not a required field and the totals math correctly omits tax when unset.

## CI-040 — Selecting tax shows Subtotal, Sales Tax, and Grand Total
- **Module:** Tax
- **User Role:** PM / BDU
- **Preconditions:** Tax configurations exist in the system and Project should be in NA region
- **Steps:**
  1. Fill line items
  2. Select a tax rate from Tax dropdown (e.g. TexasTax 7.50%)
  3. Observe the total section
- **Expected Result:** Subtotal, Sales Tax amount, and Grand Total (Subtotal + Tax) are all displayed correctly
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** UI-display test for the three-part total breakdown; should assert all three labels/values render, not just the final total.

## CI-041 — Sales Tax calculation is correct
- **Module:** Tax
- **User Role:** PM / BDU
- **Preconditions:** Tax selector is active with a NA region product
- **Steps:**
  1. Set line items total to $200
  2. Apply 10% tax
  3. Observe Sales Tax and Total values
- **Expected Result:** Sales Tax = $20 (10% of $200). Grand Total = $220
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Arithmetic correctness test for tax calculation — good to parameterize with multiple tax rates and totals, including rounding edge cases (e.g. odd cents).

## CI-042 — Total amount with tax is saved correctly on submit
- **Module:** Tax
- **User Role:** PM / BDU
- **Preconditions:** Tax is selected and NA region invoice is submitted
- **Steps:**
  1. Create invoice with tax selected
  2. Submit the invoice
  3. View the invoice PDF
- **Expected Result:** PDF shows correct Subtotal, Sales Tax, and Grand Total amounts
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** End-to-end check that tax data persists correctly from form → Dataverse → PDF generation (QuickBooks/NA flow). Requires PDF content verification, likely via downloaded file text extraction.

## CI-043 — PO Number field is disabled
- **Module:** PO Number
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open
- **Steps:**
  1. Click PO Number field
  2. Observe the field
- **Expected Result:** PO number in disabled state
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Simple field-state assertion — PO Number should be read-only/disabled on this screen (likely auto-populated elsewhere or in a later stage).

## CI-044 — Internal Notes is optional and accepts free text
- **Module:** Internal Notes
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open
- **Steps:**
  1. Type notes in the Internal Notes field
  2. Submit the invoice
- **Expected Result:** Invoice is submitted. Internal notes are saved on the invoice record
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Confirms free-text field persists correctly and is not a required/blocking field.

## CI-045 — Internal Notes displays on invoice but NOT in PDF
- **Module:** Internal Notes
- **User Role:** PM / BDU
- **Preconditions:** invoice with internal notes exists
- **Steps:**
  1. Create invoice with internal notes
  2. Submit and approve
  3. View the PDF
- **Expected Result:** Notes are visible in the app on the invoice record but do NOT appear in the generated PDF
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Important data-exposure/business-rule test — internal notes must be excluded from the client-facing PDF. Automation should extract PDF text and assert the notes string is absent while also checking it IS present in the app UI.

## CI-046 — Duplicate popup appears for same project same month
- **Module:** Duplicate Check
- **User Role:** PM / BDU
- **Preconditions:** An invoice already exists for this project for last month
- **Steps:**
  1. Select a project that already has an invoice for last month
  2. Set Invoice Date within last month
  3. Observe behavior
- **Expected Result:** 'Duplicate Project!' popup appears with a Verify button and redirects to the Invoice overview screen
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Duplicate-prevention guard test — asserts the exact popup text and Verify button, plus the eventual navigation/redirect behavior.

## CI-047 — User can't proceed past duplicate warning
- **Module:** Duplicate Check
- **User Role:** PM / BDU
- **Preconditions:** Duplicate popup is showing
- **Steps:**
  1. Click Verify or Proceed button on the duplicate popup
- **Expected Result:** Popup closes and takes the user to the invoice overview screen of that particular invoice
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Follow-up interaction test to CI-046 — verifies the popup's action button correctly navigates to the specific existing invoice record (not just a generic overview).

## CI-048 — Submit button disabled when total is zero
- **Module:** Submit Validation
- **User Role:** PM / BDU
- **Preconditions:** Invoice form is open
- **Steps:**
  1. Add line items with 0 quantity or 0 rate
  2. Observe Submit button
- **Expected Result:** Submit button is disabled when invoice total amount is zero
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Overlaps with CI-031/CI-059 but focuses on the aggregate Total being zero rather than a single row's quantity — worth testing a combination like Rate=0, Quantity>0 too.

## CI-049 — Submit button enables when all validations pass
- **Module:** Submit Validation
- **User Role:** PM / BDU
- **Preconditions:** All required fields are correctly filled
- **Steps:**
  1. Fill all required fields with valid data
  2. Ensure contract covers all dates
  3. Ensure all line items are complete
  4. Observe Submit button
- **Expected Result:** Submit button is enabled
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** The canonical happy-path "everything valid" test — a good baseline/setup helper function for many other tests (build a valid form state, then mutate one field per test).

## CI-050 — Save Draft saves invoice as Draft status
- **Module:** Save Draft
- **User Role:** PM / BDU
- **Preconditions:** Required fields are filled
- **Steps:**
  1. Fill required fields
  2. Click Save Draft
- **Expected Result:** Invoice is saved with Draft status. Toast notification shows. Screen navigates back to Invoice Overview. Invoice appears in gallery with Draft status
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Core Save Draft happy-path test — checks toast, navigation, and gallery status all in one flow.

## CI-051 — Save Draft with Adhoc ON allows future dates beyond limit
- **Module:** Save Draft
- **User Role:** BDU
- **Preconditions:** Adhoc is ON, Service End Date is 3+ months ahead
- **Steps:**
  1. Turn on Adhoc toggle
  2. Set Service End Date to November (4 months ahead)
  3. Fill all other required fields
  4. Click Save Draft
- **Expected Result:** Save Draft button is enabled and saves successfully. Future date restriction does NOT apply for Adhoc invoices on Save Draft
- **Priority:** High | **Status:** Active
- **Notes:** Adhoc bypass for Save Draft
- **Scenario Explanation:** ⭐ Directly tests the intended behavior around **BUG 147908** — Save Draft should stay enabled for adhoc invoices beyond the normal future-date limit, as long as the contract still covers the date. Pair this test with CI-012 (contract-out-of-range case) to confirm the fix distinguishes "future date beyond limit but within contract" (should pass) from "date outside contract range entirely" (should fail).

## CI-052 — Save Draft with Adhoc OFF enforces future date limit
- **Module:** Save Draft
- **User Role:** PM
- **Preconditions:** Adhoc is OFF, Service End Date beyond limit
- **Steps:**
  1. Keep Adhoc OFF
  2. Set Service End Date to 4 months ahead
  3. Fill other fields
  4. Observe Save Draft button
- **Expected Result:** Save Draft button is disabled when Service End Date exceeds the 3-month future limit for non-adhoc invoices
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Negative-case counterpart to CI-051 — confirms non-adhoc invoices are still capped at 3 months even on Save Draft (not just Submit), matching the "extend consistency to Submit as well" fix logic.

## CI-053 — Full NA invoice lifecycle: Create → Submit → Review → Approve → Send
- **Module:** Invoice Lifecycle (NA)
- **User Role:** BDU
- **Preconditions:** NA region project with active contract exists
- **Steps:**
  1. Create invoice for NA region project
  2. Submit invoice
  3. BDU reviews invoice
  4. BDU approves invoice
  5. Invoice sent on scheduled date
- **Expected Result:** Each status transition works: Pending→Submitted→Reviewed→Approved→Sent. Invoice number generated by QuickBooks. PDF generated and stored in SharePoint. Emails sent at each stage
- **Priority:** High | **Status:** Active
- **Notes:** End-to-end NA flow
- **Scenario Explanation:** The full, longest-running E2E test in the suite. Covers Power Automate flows, QuickBooks integration, SharePoint storage, and email notifications end-to-end. Best implemented as a dedicated long-running Playwright test with generous waits/polling for async flow completion, separate from the faster UI-only tests.

## CI-054 — Invoice number generated after submission for NA region
- **Module:** Invoice Lifecycle (NA)
- **User Role:** PM
- **Preconditions:** NA region invoice has been submitted and flow completed
- **Steps:**
  1. Submit an NA invoice
  2. Wait for flow to complete
  3. View invoice in overview
- **Expected Result:** Invoice number is visible (format from QuickBooks, e.g. 2026-0265). It was blank during creation and becomes populated after the Create Invoice NA flow completes
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Verifies async QuickBooks-driven invoice numbering. Automation should poll/wait for the flow to finish rather than asserting immediately after submission (flow completion is asynchronous).

## CI-055 — Full Non-NA invoice lifecycle: Create → Submit → Review → Approve
- **Module:** Invoice Lifecycle (Non-NA)
- **User Role:** BDU
- **Preconditions:** Non-NA region project with active contract exists
- **Steps:**
  1. Create invoice for Non-NA region project
  2. Submit invoice
  3. BDU reviews
  4. BDU approves
- **Expected Result:** Each status transition works. PDF is generated from HTML template. No QuickBooks integration. Email notifications sent
- **Priority:** High | **Status:** Active
- **Notes:** End-to-end Non-NA flow
- **Scenario Explanation:** Non-NA counterpart to CI-053 — no QuickBooks step, but PDF comes from an HTML template instead. Relevant to the ongoing Non-NA double-trigger and PDF quantity-formatting workstreams — worth adding assertions on the idempotency guard (`ittdev_invoicejobrunning`) not double-firing during this flow.

## CI-056 — Currency displays correctly for Non-NA regions
- **Module:** Invoice Lifecycle (Non-NA)
- **User Role:** BDU
- **Preconditions:** Non-NA project with specific currency exists
- **Steps:**
  1. Create invoice for UAE region project
  2. Observe currency symbol in line items and total
  3. Select US dollar as currency
  4. Submit and view PDF
- **Expected Result:** Currency displays according to the project's configured currency. Currency symbol shown correctly in PDF
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Localization/currency-formatting test — should be parameterized across multiple non-NA currencies, and verify both in-app display and PDF output match.

## CI-057 — Flagged invoice can be edited and resubmitted
- **Module:** Flag & Resubmit
- **User Role:** PM
- **Preconditions:** A Flagged invoice exists
- **Steps:**
  1. Login as PM
  2. Find a Flagged invoice
  3. Click Edit
  4. Make changes
  5. Click Submit
- **Expected Result:** Edit screen opens with existing invoice data. Changes can be made. Submit resubmits the invoice. Status changes back to Submitted→Reviewed cycle
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Relevant to the **Intermittent Fail-Update bug** investigation — this is the exact flow (edit + resubmit a flagged invoice) where `ittdev_totalinvoiceamount` was found missing from the resubmit Patch. Strongly recommend prioritizing this test in automation and asserting the Total Amount field is correctly persisted after resubmission, not just the deprecated Total Amount field.

## CI-058 — Flagging sends notification to submitter
- **Module:** Flag & Resubmit
- **User Role:** BDU
- **Preconditions:** A Submitted invoice exists
- **Steps:**
  1. BDU flags a Submitted invoice
  2. Observe email notifications
- **Expected Result:** Email notification is sent to the invoice submitter informing them the invoice has been flagged
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Notification test — email verification typically requires a test mailbox/inbox API integration rather than pure UI automation.

## CI-059 — Adhoc invoice with zero amount cannot be submitted
- **Module:** Adhoc Flow
- **User Role:** BDU
- **Preconditions:** Adhoc toggle is ON
- **Steps:**
  1. Turn on Adhoc toggle
  2. Add line items with quantity 0
  3. Observe Submit button
- **Expected Result:** Submit button is disabled. Total must be > 0 even for adhoc invoices
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms the zero-total rule (CI-048) still applies even when Adhoc bypasses date restrictions — Adhoc only bypasses date rules, not amount rules.

## CI-060 — Adhoc invoice — full flow: submit, review, approve, sent
- **Module:** Adhoc Flow
- **User Role:** BDU
- **Preconditions:** Adhoc toggle is ON, contract covers the date
- **Steps:**
  1. Create adhoc invoice with future date
  2. Submit
  3. Review
  4. Approve
  5. Observe sent behavior
- **Expected Result:** Full lifecycle completes successfully. Adhoc invoice sent to client (submitter, reviewer, approver notified)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Adhoc-specific end-to-end lifecycle test, similar in structure to CI-053/CI-055 but exercising the adhoc-specific future-date path.

## CI-061 — Send Instantly — invoice sent immediately upon approval
- **Module:** Adhoc Flow
- **User Role:** BDU
- **Preconditions:** Adhoc invoice with Send Instantly = ON is Approved
- **Steps:**
  1. Create adhoc invoice with Send Instantly toggle ON
  2. Submit, Review, Approve the invoice
  3. Observe behavior after approval
- **Expected Result:** Invoice email is sent immediately to client, submitter, reviewer, and approver upon reaching Approved status. Does not wait for scheduled send date
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Tests the "Send Instantly" toggle's effect on the send-timing logic — bypasses the scheduled send date entirely. Good candidate to test alongside CI-068 (recipient list correctness).

## CI-062 — Edit draft opens invoice in editable state
- **Module:** Edit Draft
- **User Role:** PM / BDU
- **Preconditions:** A Draft invoice exists
- **Steps:**
  1. Find a Draft invoice in Invoice Overview
  2. Click Edit
- **Expected Result:** Create Invoice screen opens showing the draft invoice data in all fields. All fields are editable
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Basic edit-mode load test — confirm data hydration is complete and no fields are locked unexpectedly for a Draft.

## CI-063 — Save Draft saves changes to existing draft
- **Module:** Edit Draft
- **User Role:** PM / BDU
- **Preconditions:** A Draft invoice is open in Edit mode
- **Steps:**
  1. Open a draft invoice
  2. Change line items or dates
  3. Click Save Draft
- **Expected Result:** Changes are saved to the existing draft record. Toast notification shows success. Gallery refreshes
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms edit-mode Save Draft updates the existing record (not creating a duplicate) — worth asserting record ID/count stays the same before/after.

## CI-064 — Close button returns to Invoice Overview without saving
- **Module:** Navigation
- **User Role:** PM / BDU
- **Preconditions:** Create Invoice screen is open with unsaved data
- **Steps:**
  1. Fill some fields
  2. Click the Close button
- **Expected Result:** Screen returns to Invoice Overview. No data is saved. No toast notification shown
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Negative-save/navigation test — confirm no record is created and no toast fires, distinguishing Close from Save Draft/Submit.

## CI-065 — Submit triggers notification email
- **Module:** Email Notifications
- **User Role:** PM / BDU
- **Preconditions:** Invoice is submitted
- **Steps:**
  1. Submit an invoice
  2. Check email for the submitter/reviewer
- **Expected Result:** Notification email is sent after invoice is submitted. Email contains invoice details and a link
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Email-trigger test at Submit stage — requires mailbox verification tooling for full automation.

## CI-066 — Review notification sent when invoice is reviewed
- **Module:** Email Notifications
- **User Role:** PM / BDU
- **Preconditions:** Invoice transitions to Reviewed status
- **Steps:**
  1. Reviews an invoice
  2. Check submitter email
- **Expected Result:** Notification email sent to invoice initiator when status changes to Reviewed
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Status-transition email trigger test — pairs with CI-065/CI-067 to cover each lifecycle stage's notification.

## CI-067 — Approve notification sent when invoice is approved
- **Module:** Email Notifications
- **User Role:** PM / BDU
- **Preconditions:** Invoice transitions to Approved status
- **Steps:**
  1. Approves an invoice
  2. Check submitter email
- **Expected Result:** Notification email sent to invoice initiator when status changes to Approved
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Final status-transition email test in the Submitted→Reviewed→Approved chain.

## CI-068 — Sent email includes correct recipients
- **Module:** Email Notifications
- **User Role:** PM / BDU
- **Preconditions:** Invoice reaches Sent status
- **Steps:**
  1. Invoice is sent on scheduled customer sent date
  2. Check email recipients
- **Expected Result:** Email is sent from the configured sending email. Recipients include submitter, reviewer, approver, CC list, and To list from project invoice configuration
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Recipient-list accuracy test — most complex email test since it must validate multiple recipient categories sourced from project configuration data, not just a single fixed address.

## CI-069 — Invoice can be reviewed/approved from email link
- **Module:** Email Notifications
- **User Role:** PM / BDU
- **Preconditions:** Notification email received with invoice link
- **Steps:**
  1. Open notification email
  2. Click the link in the email
  3. Review or approve the invoice from the link
- **Expected Result:** Link opens the invoice in the app. BDU can review or approve directly from the email link
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Deep-link test — verifies the email link correctly deep-links into the specific invoice record and that in-app actions (Review/Approve) work from that entry point.

## CI-070 — Invoice PDF contains all correct data after submission
- **Module:** PDF
- **User Role:** PM / BDU
- **Preconditions:** Invoice is submitted and flow completes
- **Steps:**
  1. Submit and approve an invoice
  2. View the PDF
  3. Check all fields
- **Expected Result:** PDF shows: invoice number, invoice date, due date, partner name, project name, line items with quantities and amounts, total, payment terms, company details, logo
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Comprehensive PDF content-verification test — requires PDF text/data extraction tooling in the Playwright suite (e.g. pdf-parse) to assert each field is present and correct.

## CI-071 — Download invoice PDF from app
- **Module:** PDF
- **User Role:** PM / BDU
- **Preconditions:** An approved invoice with PDF exists
- **Steps:**
  1. Click View on an Approved invoice
  2. Click download button in PDF viewer
- **Expected Result:** PDF downloads successfully to user's local machine
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Download-mechanics test — in Playwright, use the `page.waitForEvent('download')` pattern to confirm the file downloads and has a valid PDF signature/size.

## CI-072 — Download invoice PDF from email
- **Module:** PDF
- **User Role:** PM / BDU
- **Preconditions:** Invoice email with PDF attachment received
- **Steps:**
  1. Open the invoice notification email
  2. Download the PDF attachment
- **Expected Result:** PDF downloads correctly and shows all invoice data
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Similar to CI-071 but sourced from the email attachment rather than in-app — requires mailbox integration to automate fully.

## CI-073 — Service Start/End Date fields retain user-entered values after selecting a Partner
- **Module:** Date Reset
- **User Role:** PM / BDU
- **Preconditions:** Partner is already selected
- **Steps:**
  1. Open the Invoice Application
  2. Click on "Create Invoice" from the top navigation bar
  3. Click on the Service Start Date field and select a custom date (e.g., 5/15/2026)
  4. Click on the Service End Date field and select a custom date (e.g., 5/31/2026)
- **Expected Result:**
  1. Invoice Application launches successfully
  2. Create Invoice screen is displayed
  3. Service Start Date field shows 5/15/2026
  4. Service End Date field shows 5/31/2026
  5. Selected partner appears in the Partner field
  6. Service Start Date should still show 5/15/2026 and Service End Date should still show 5/31/2026 after Partner selection (values are not reset)
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Regression-guard test to ensure selecting a Partner does NOT trigger an unwanted OnChange side-effect that resets manually-entered custom dates back to defaults. Good candidate for a bug caused by an overly broad `Reset()` or default-value formula tied to the Partner control.

## CI-074 — Refreshing the page clears all data to defaults
- **Module:** Date Reset
- **User Role:** PM / BDU
- **Preconditions:** Form has data entered
- **Steps:**
  1. Enter data in various fields
  2. Refresh the browser page
- **Expected Result:** All entered data is cleared. Dates reset to defaults. Form is blank
- **Priority:** Medium | **Status:** Active
- **Scenario Explanation:** Confirms there is no unintended state persistence (e.g., browser storage) across a hard refresh — form should behave as a fresh Canvas App session. Note: per project constraints, Canvas Apps/Power Apps do not use localStorage, so this should simply reflect a clean app reload.

## CI-075 — Gallery refreshes after submit and shows updated status
- **Module:** Gallery Refresh
- **User Role:** PM / BDU
- **Preconditions:** Invoice has been submitted
- **Steps:**
  1. Submit an invoice from Create Invoice screen
  2. Observe Invoice Overview gallery
- **Expected Result:** Gallery refreshes and shows the submitted invoice with updated status (Submitted or Pending while flow runs)
- **Priority:** High | **Status:** Active
- **Scenario Explanation:** Confirms the Invoice Overview gallery auto-refreshes/re-queries after navigation back from Submit, rather than showing stale cached data. Since flow completion is async, automation should assert an intermediate state (Submitted/Pending) immediately, and optionally poll for the final state separately.

---

## Automation Notes for Cursor / Playwright Suite

- **Framework:** Playwright on Windows, Node.js 18+, TypeScript recommended
- **Structure:** `invoice-automation/` → `tests/`, `pages/`, `fixtures/`, `playwright.config.ts`
- **Auth:** Microsoft SSO via saved storage state (avoid re-authenticating per test)
- **Canvas App locator strategy:** All controls render inside a dynamic iframe — use `page.frameLocator(...)` and prefer accessible name / aria-label selectors over auto-generated Power Apps control IDs where possible; codegen-produced selectors have proven unstable.
- **Waits:** Canvas App load times are inconsistent — use explicit waits for known post-load elements (e.g. the 'New Invoice' title) rather than fixed `page.waitForTimeout()` delays.
- **Priority test cases to automate first (tied to known active bugs/fixes):**
  - CI-012, CI-051, CI-052 (BUG 147908 — contract date validation on Save Draft/Submit)
  - CI-057 (Fail-Update bug — resubmit Patch missing `ittdev_totalinvoiceamount`)
  - CI-029 (gallery template recycling / row isolation fix)
  - CI-073 (date reset side-effect on Partner selection)
  - CI-024, CI-025, CI-026 (marked "new scenario not yet fixed" — expect failing until fixed; use `test.fixme()`)
- **PDF verification:** Use a PDF text-extraction library (e.g. `pdf-parse`) for CI-042, CI-045, CI-070–072.
- **Email verification:** CI-058, CI-065–069, CI-072 require a test mailbox or email API integration outside pure UI automation.
- **Async flow waits:** CI-053, CI-054, CI-055, CI-060, CI-061, CI-075 depend on Power Automate flow completion — implement polling helpers rather than fixed timeouts.

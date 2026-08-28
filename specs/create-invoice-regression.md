# Create Invoice regression test plan

**Status:** Source of truth for Create Invoice (New Invoice) regression + `create-invoice-complete` automation  
**Spec file:** `tests/create-invoice-complete.spec.ts` (to generate)  
**Existing suite:** `tests/create-invoice.spec.ts` (partial coverage — see traceability)  
**Seed:** `tests/seed.spec.ts`  
**Source sheet:** `specs/Create_Invoice_Test_Cases.md` (CI-001 … CI-075)  
**App:** Invoice Canvas (Power Apps) — DEV  
**Last aligned:** 2026-08-18 (live Admin + PM sessions)

This plan is **our** automation plan, not a copy of the Excel sheet. Sheet IDs are kept for traceability. Product rules below supersede the sheet where they disagreed with the live app (default radio, Adhoc visibility, calendar-month dates).

Related plans: `create-invoice-test-plan.md` (current suite), `dashboard-test-plan.md`, `invoice-overview-test-plan.md`.  
**Coverage trace (78 IDs, last Admin + PM run):** `specs/create-invoice-regression-trace.md`.

---

## 1. Purpose and scope

| In scope | Out of scope / deferred |
|----------|-------------------------|
| New Invoice UI, defaults, radios, toggles | Dashboard tiles → `dashboard-test-plan.md` |
| Partner → Project cascade, line items, tax | Overview My/All radios → `invoice-overview-test-plan.md` |
| Contract coverage (Invoice Date + Service End) | Email mailbox (CI-058, CI-065–069, CI-072) |
| Non-adhoc 3-month future cap; Adhoc bypass | PDF text extract / email attachment (CI-042, CI-045, CI-070–072) |
| Duplicate Project! popup | Full Review → Approve → Send flow polling (CI-053–056, CI-060–061) |
| Save Draft / Submit / Close | Flipping Security Roles mid-suite |
| Role matrix: **PM** vs **BDU/Admin** on Adhoc | Production |

Starting state for every scenario: fresh app load via `storageState`, host dialogs dismissed, Create Invoice opened. Do not depend on leftover form data from a previous test.

---

## 2. Same form shell, different Adhoc access

Confirmed live on DEV, 2026-08-18.

| Aspect | PM (Rashwanth EM) | BDU / Admin (Kamasani Charan) |
|--------|-------------------|-------------------------------|
| Nav + **New Invoice** heading | Same | Same |
| Brand New / Start with last invoice | Same; **Start with last checked by default** | Same |
| **Adhoc Invoice** | **Hidden** (no label, no switch) | **Visible**; default **No**; ON forces Brand New |
| Send Instantly | Same; default No; **only switch** on the form | Same; **second** switch (after Adhoc) |
| Invoice # / PO # | Disabled | Disabled |
| Calendar-month date defaults | Start 8/1/2026, End + Invoice Date 8/31/2026 | Same |
| Partner → Project, line items, notes, Close / Save Draft / Submit | Same chrome | Same |
| Save Draft / Submit on empty form | Disabled | Disabled |
| Adhoc unlimited / future-date bypass | **N/A** | Yes (still needs contract + total > 0) |
| Find Tax (NA projects) | Same when NA project is selectable | Same |
| Partner combo on DEV this session | **No items** | Full partner list |

Implications:

- Shared UI cases run under **both** `chromium-admin` and `chromium-pm`.
- Adhoc cases (CI-004, CI-004b, CI-005, CI-051, CI-059, CI-060, CI-061) are **Admin only** — skip on PM.
- CI-011b (Adhoc hidden) is **PM only** — skip on Admin.
- `waitForCreateInvoiceReady` must **not** require the Adhoc label for PM.
- Partner-dependent **PM** tests must **skip** until Rashwanth has visible partners/projects (or seed is assigned). Admin create/submit is the path that can run today.

---

## 3. Personas and authentication

| Persona | Who | Power Apps role | storageState | Playwright project |
|---------|-----|-----------------|--------------|--------------------|
| **BDU / Admin** | Kamasani Charan | BDU + Security Roles `admin` | `auth/dev/admin.json` | `chromium` / `chromium-admin` |
| **PM** | Rashwanth EM | Invoice application basic user 2.0 | `auth/dev/pm.json` | `chromium-pm` |

```powershell
npx playwright test tests/create-invoice-complete.spec.ts --project=chromium-admin
npx playwright test tests/create-invoice-complete.spec.ts --project=chromium-pm
npx playwright test tests/create-invoice-complete.spec.ts --project=chromium-admin --project=chromium-pm
```

Detect persona from `testInfo.project.name` (contains `pm` → PM). Never add login code. Always dismiss host consent / connector alerts via `tests/utils/host-dialogs.ts`.

PM session note: host may show `Attempted to perform an unauthorized operation` — dismiss Close; do not treat that as a Create Invoice assertion.

---

## 4. Live product rules (Create Invoice)

These override the regression sheet where they conflict.

| Rule | Live / product |
|------|----------------|
| Screen title | **New Invoice** (not “Create Invoice”) |
| Default start mode | **Start with last invoice** checked. Brand New is a selection (CI-002). |
| Date defaults | **Calendar month**: Service Start = 1st; Service End + Invoice Date = last day. **Not** Dashboard billing cycle 6th→5th. Use `getCalendarMonthDates()`. |
| Adhoc | Admin only. Toggle ON forces Brand New. After ON, Start with last can still be clicked (do not assert it stays locked). |
| 3-month future cap | Non-adhoc only (PM always; Admin when Adhoc OFF). Adhoc bypasses the cap **if the contract still covers the date**. |
| Contract | Active covering contract required. 0 active → toast `No active contracts found for the selected project`. Service End outside range must disable Save Draft **and** Submit even when Adhoc is ON (**BUG 147908**). |
| Duplicate | Non-adhoc: one invoice per project per duplicate window. Popup title **Duplicate Project!**. |
| Tax | `Find Tax` for **North America** projects only. Optional. |
| Currency | Totals may be `$` or `₹` — assert `/(?:\$|₹)\s*[1-9]/`. |
| Zero total | Blocks Submit even for Adhoc. |
| Locators | Entire UI in `iframe[name="fullscreen-app-host"]`. Radios: `getByRole('radio', { name: 'Brand New' })`. Partner: `Find Partner` then `getByRole('option')`. Product: `Find items`. Delete row: `getByRole('img', { name: /delete/i })`. |

Corrections vs `Create_Invoice_Test_Cases.md`:

- CI-001 listed Adhoc for PM/BDU — **PM does not have Adhoc**.
- CI-002 implied Brand New is the default — **Start with last invoice** is the default.
- CI-015–017 calendar-month defaults **match live**; do not use billing-cycle dates on this screen.

---

## 5. Traceability

| Source | What we took |
|--------|----------------|
| Regression sheet CI-001 … CI-075 | Intent, expected text, bug flags (147908, gallery recycling, free-text combo) |
| Live Admin session | Form chrome, defaults, Adhoc Yes/Brand New force, Partner listbox, Add new item → Item 2 |
| Live PM session | Adhoc hidden, one Send Instantly switch, same dates, Partner **No items**, Overview **No Item to Display**, no My/All radios |
| Existing `tests/create-invoice.spec.ts` | TC-CI-01, 02, 03, 10, 11, 11b, 12, 13, 20, 21, 30, 31, 32, 34, 40–42, 50, 51, 60, 70 |

| Bucket | Count |
|--------|-------|
| In this complete spec (UI + Dataverse create) | CI cases mapped below |
| Already automated (reuse helpers) | TC-CI-* in `create-invoice.spec.ts` |
| Known issue (`test.fixme`) | CI-024, CI-025, CI-026 |
| Deferred (mailbox / PDF / long flow) | CI-037 PDF, CI-042, CI-045, CI-053–056, CI-058, CI-060–061, CI-065–072 |

---

## 6. Implementation status legend

| Status | Meaning |
|--------|---------|
| **Automated** | Already in `tests/create-invoice.spec.ts` |
| **Planned** | Generate into `tests/create-invoice-complete.spec.ts` |
| **Planned (Admin)** | Skip on `chromium-pm` |
| **Planned (PM)** | Skip on Admin; skip partner-dependent if Partner list is empty |
| **fixme** | Sheet: not yet fixed |
| **Deferred** | Needs mailbox, PDF parse, or flow polling |

**Priority:** High / Medium from the sheet. Generate High first: CI-001, CI-012, CI-029, CI-046, CI-051, CI-052, CI-057, CI-073, CI-011b.

---

## 7. Fixtures (do not hardcode DEV names)

Reuse `loadCreateInvoiceFixtures` in `tests/utils/dataverse-fixtures.ts`. Add when missing:

| Fixture | Used by |
|---------|---------|
| `eligibleNonAdhoc` | CI-049, CI-050, CI-075 |
| `duplicateNonAdhoc` | CI-046, CI-047 |
| `noLastMonthInvoice` | CI-003 negative path / TC-CI-13 |
| `withLastInvoice` (previous invoice **with line items**, selectable without Duplicate) | CI-003 prefill assertion |
| `northAmerica` / `nonNorthAmerica` | CI-039–041 |
| Project with **no active contract** | CI-008 |
| Project with **known short contract range** | CI-011, CI-012, CI-013 |
| Project with **multiple active contracts** | CI-014 (skip if none) |
| `editableProduct` / `nonEditableProduct` | CI-030, CI-032 |
| Discount product type | CI-033 (skip if none) |
| Flagged invoice | CI-057 (skip if none) |
| Draft invoice | CI-062, CI-063 |

PM create tests: skip unless a project is visible to Rashwanth (Partner combo is currently empty).

---

## Test Scenarios

### 1. Page load and defaults

**Seed:** `tests/seed.spec.ts`

#### 1.1. CI-001 New Invoice form loads with all expected controls

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Open the Invoice app with storageState for the persona and click Create Invoice in the header. Dismiss host dialogs.
    - expect: New Invoice heading is visible
    - expect: Brand New and Start with last invoice radios are visible
    - expect: Start with last invoice is checked by default
    - expect: Send Instantly is visible and Off (No)
    - expect: Invoice number and PO number textboxes are disabled
    - expect: Invoice Date, Service Start Date, and Service End Date show calendar-month defaults
    - expect: Find Partner, Find Project, line-item headers, Add new item, Internal Notes, Close, Save Draft, and Submit are visible
    - expect: Save Draft and Submit are disabled
    - expect: [Admin] Adhoc Invoice label and switch are visible and Off (No)
    - expect: [PM] Adhoc Invoice is not present (count 0)

#### 1.2. CI-002 Brand New empty form keeps calendar-month date defaults

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. On New Invoice, select Brand New.
    - expect: Brand New is checked
    - expect: Partner and Project remain empty (Find Partner / Find Project)
    - expect: Line item row is blank (Find items, empty description, qty 0)
    - expect: Service Start Date is first day of current calendar month
    - expect: Service End Date and Invoice Date are last day of current calendar month
    - expect: Invoice number stays blank and disabled

#### 1.3. CI-015 CI-016 CI-017 Date fields default to calendar month bounds

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Open New Invoice (Brand New or default). Read the three date textboxes.
    - expect: Do not hardcode dates — compute first and last day of the current calendar month at runtime
    - expect: Service Start Date equals month start (e.g. 8/1/2026 in August)
    - expect: Service End Date and Invoice Date equal month end (e.g. 8/31/2026)
    - expect: These are calendar bounds, not Dashboard billing cycle 6th→5th

#### 1.4. CI-043 PO Number is disabled on create

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Open New Invoice and observe PO Number.
    - expect: PO number textbox is disabled
    - expect: Invoice number textbox is also disabled

#### 1.5. CI-007 Send Instantly toggle on and off

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Click the Send Instantly switch, then click it again.
    - expect: First click: nearby state is Yes and switch is checked
    - expect: Second click: state is No
    - expect: Works for both Admin (second switch) and PM (only switch)

### 2. Role access Adhoc

**Seed:** `tests/seed.spec.ts`

#### 2.1. CI-004 Admin Adhoc Invoice toggle switches to Yes

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As Admin, click the Adhoc Invoice switch.
    - expect: Adhoc shows Yes and switch is checked
    - expect: Skip on PM

#### 2.2. CI-011b PM does not see Adhoc Invoice

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As PM, open New Invoice.
    - expect: Adhoc Invoice text is not visible
    - expect: Only Send Instantly switch is present
    - expect: Skip on Admin

#### 2.3. CI-004b Adhoc ON forces Brand New

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As Admin, select Start with last invoice, then turn Adhoc Invoice ON.
    - expect: Adhoc is Yes
    - expect: Brand New becomes checked
    - expect: Skip on PM

#### 2.4. CI-005 Adhoc bypasses 3-month future date cap when contract covers the date

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As Admin, turn Adhoc ON, select a project whose contract covers a date 4+ months ahead, set Invoice Date / Service End to that future date, fill a valid line item.
    - expect: No future-limit red banner for the 3-month cap
    - expect: Submit is enabled if contract covers the date and other validations pass
    - expect: Skip on PM

#### 2.5. CI-059 Adhoc zero amount cannot be submitted

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As Admin, turn Adhoc ON, fill partner/project, add a line with quantity 0.
    - expect: Submit stays disabled
    - expect: Adhoc does not bypass the total > 0 rule
    - expect: Skip on PM

### 3. Start with last invoice

**Seed:** `tests/seed.spec.ts`

#### 3.1. CI-003 Start with last invoice prefills line items not dates or invoice number

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Read the project's previous invoice and its line items from Dataverse first, then select Start with last invoice and that Partner / Project.
    - expect: Row count equals the previous invoice's line count
    - expect: No `Find items` buttons remain — every prefilled row already carries a product
    - expect: Description, Quantity and Rate match the previous invoice row for row
    - expect: Dates reset to current calendar-month defaults (not inherited)
    - expect: Invoice number stays blank
    - expect: The no-last-invoice toast must NOT appear for a project that has one
    - expect: If no last invoice, toast: No invoice has been generated for this project over the last month (existing TC-CI-13)

### 4. Contract validation

**Seed:** `tests/seed.spec.ts`

#### 4.1. CI-008 No active contract blocks create

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a partner then a project with no active contract (Dataverse fixture). Observe toast and buttons.
    - expect: Toast: No active contracts found for the selected project
    - expect: Submit and Save Draft stay disabled

#### 4.2. CI-009 Active contract is applied for the selected project

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a partner and project that has exactly one active covering contract.
    - expect: No no-contract toast
    - expect: Form can proceed once line items are valid

#### 4.3. CI-010 Inactive contracts are not used

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a project that has only inactive contracts, or both active and inactive.
    - expect: Inactive contracts are not treated as covering
    - expect: Only active contracts enable create

#### 4.4. CI-011 Invoice Date must fall inside the contract

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a project with a known contract range. Set Invoice Date outside that range.
    - expect: Contract warning appears
    - expect: Submit and Save Draft are disabled

#### 4.5. CI-012 Service End Date must fall inside the contract BUG 147908

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Keep Invoice Date inside the contract. Set Service End Date one day past contract end. Repeat with Adhoc ON (Admin) and Adhoc OFF.
    - expect: Contract warning appears for both Adhoc ON and OFF
    - expect: Save Draft and Submit stay disabled
    - expect: This is the BUG 147908 regression: Adhoc must not skip contract coverage on Save Draft

#### 4.6. CI-013 Contract warning clears when dates are brought back in range

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Set Service End Date outside contract, then set it back inside.
    - expect: Warning disappears
    - expect: Save Draft and Submit re-enable if the rest of the form is valid

#### 4.7. CI-014 Multiple active contracts require user selection

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a project with more than one active contract (skip if no fixture).
    - expect: User is prompted to pick a contract
    - expect: Invoice can be created after a selection

### 5. Date validation

**Seed:** `tests/seed.spec.ts`

#### 5.1. CI-018 Service Start must be before Service End

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Set Service Start after Service End, and also the equal-dates case.
    - expect: Toast that Service End must be after Start
    - expect: Submit and Save Draft disabled for Start >= End

#### 5.2. CI-019 Invoice Date follows Service End Date

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Change Service End Date to a new in-range date.
    - expect: Invoice Date updates to match the new Service End Date

#### 5.3. CI-006 CI-020 CI-021 Non-adhoc 3-month future limit for PM

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As PM (Adhoc hidden/off), fill partner and project. Set Invoice Date to last day of month 3 months ahead, then to the day after that month starts.
    - expect: At the 3-month boundary Submit can enable if other rules pass
    - expect: One day past the cap: red future-date banner and Submit disabled
    - expect: One month ahead: no red banner

#### 5.4. CI-052 Save Draft disabled when non-adhoc Service End exceeds 3-month cap

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As PM, keep Adhoc off, set Service End 4 months ahead, fill other fields.
    - expect: Save Draft is disabled

#### 5.5. CI-073 Custom service dates survive Partner selection

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Set custom Service Start and Service End, then select a Partner.
    - expect: Dates are not reset to calendar-month defaults after Partner OnChange

#### 5.6. CI-074 Browser refresh clears unsaved form to defaults

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Enter partner/notes, then reload the page and reopen Create Invoice if needed.
    - expect: Unsaved data is gone
    - expect: Dates return to calendar-month defaults

### 6. Partner and Project

**Seed:** `tests/seed.spec.ts`

#### 6.1. CI-022 Partner is required

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Leave Partner empty; fill other fields if possible.
    - expect: Submit and Save Draft stay disabled

#### 6.2. CI-023 Project list filters by selected Partner

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a Partner that has projects. Open Find Project.
    - expect: Only that partner's projects appear
    - expect: PM with empty Partner list: skip or assert No items

#### 6.3. CI-024 CI-025 CI-026 Free text and clearing Partner/Project keep buttons disabled

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Type a partner name without selecting; type a project name without selecting; select then clear Partner.
    - expect: Submit and Save Draft stay disabled
    - expect: Mark test.fixme — sheet notes these as not yet fixed

### 7. Line items

**Seed:** `tests/seed.spec.ts`

#### 7.1. CI-027 At least one complete line item is required

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Fill header fields then remove all line items.
    - expect: Submit and Save Draft disabled

#### 7.2. CI-028 CI-029 Add new item appends a blank row without copying the previous product

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Fill row 1 product, click Add new item.
    - expect: Item 2 appears
    - expect: New row Find items placeholder is blank and does not inherit row 1 product
    - expect: Row 1 data is unchanged

#### 7.3. CI-030 Preset-rate product fills Rate immediately

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a Non-Editable / preset-rate product.
    - expect: Rate populates without entering quantity first

#### 7.4. CI-031 CI-048 Quantity or rate of zero blocks submit

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Set quantity 0, or rate 0 with quantity > 0.
    - expect: Submit and Save Draft disabled when any row qty is 0 or invoice total is 0

#### 7.5. CI-032 Line total equals Quantity times Rate

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Enter Quantity 2 and Rate 100 on an editable product.
    - expect: Row Total shows 200 with $ or ₹

#### 7.6. CI-033 Discount product shows a negative line total

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a Discount product type (skip if no fixture), enter qty and rate.
    - expect: Line total is negative
    - expect: Grand total is reduced

#### 7.7. CI-034 Deleting a line item removes only that row

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Add two filled rows, click delete on one.
    - expect: Deleted row is gone
    - expect: Remaining row data unchanged
    - expect: Total recalculates

#### 7.8. CI-035 CI-036 Empty or incomplete line item blocks submit

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Add a blank extra row, or leave Product, Description, Quantity, or Rate missing on a row.
    - expect: Submit and Save Draft disabled

#### 7.9. CI-038 Rate accepts at most 4 decimal places

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Enter a rate such as 10.12345.
    - expect: Value is truncated, rounded, or rejected — assert the live behavior once, do not invent it

### 8. Tax North America

**Seed:** `tests/seed.spec.ts`

#### 8.1. CI-039 Tax is optional for NA invoices

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select an NA project, complete the form, leave tax blank, enable Submit.
    - expect: Find Tax is visible for NA only
    - expect: Submit can succeed without tax
    - expect: Total equals subtotal

#### 8.2. CI-040 CI-041 Selecting tax shows Subtotal Sales Tax and Grand Total

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. On an NA invoice with line total 200, select a known tax rate.
    - expect: Subtotal, Sales Tax, and Grand Total display
    - expect: Sales tax math matches the selected percent

#### 8.3. CI-040b Tax control is absent for Non-NA projects

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a Non-NA project (existing TC-CI-40).
    - expect: Find Tax is not shown

### 9. Duplicate Submit Save Draft Close

**Seed:** `tests/seed.spec.ts`

#### 9.1. CI-046 CI-047 Duplicate Project popup for same project same month

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Select a project that already has a non-adhoc invoice in the duplicate window.
    - expect: Duplicate Project! popup appears
    - expect: Verify/Proceed navigates to Invoice Overview for that invoice

#### 9.2. CI-049 Submit enables when all validations pass

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Fill partner, project with covering contract, complete line item, dates in range.
    - expect: Submit is enabled

#### 9.3. CI-050 Save Draft saves as Draft and returns to Overview

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Fill required fields, click Save Draft.
    - expect: Toast shown
    - expect: Navigate to Invoice Overview
    - expect: Record status Draft in UI and Dataverse

#### 9.4. CI-051 Adhoc Save Draft allows future dates inside contract

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As Admin, Adhoc ON, Service End 4 months ahead but inside contract, click Save Draft.
    - expect: Save Draft is enabled and succeeds
    - expect: Skip on PM

#### 9.5. CI-064 Close returns without saving

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Enter some fields, click Close.
    - expect: Returns to Dashboard or Invoice Overview
    - expect: No new invoice record
    - expect: No save toast

#### 9.6. CI-075 Overview gallery shows submitted invoice after Submit

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Submit a valid invoice.
    - expect: Land on Invoice Overview
    - expect: Row shows Submitted or Pending while the flow runs

### 10. Edit draft and flagged

**Seed:** `tests/seed.spec.ts`

#### 10.1. CI-062 CI-063 Edit existing Draft and Save Draft updates same record

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. From Overview, Edit a Draft, change a line, Save Draft.
    - expect: Form hydrates existing data
    - expect: Fields are editable
    - expect: Same record is updated (no duplicate id)
    - expect: Skip on PM if Overview is empty

#### 10.2. CI-057 Flagged invoice can be edited and resubmitted

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. As PM or Admin, Edit a Flagged invoice, change it, Submit.
    - expect: Existing data loads
    - expect: Status returns toward Submitted
    - expect: Assert total amount persisted (Fail-Update / ittdev_totalinvoiceamount)
    - expect: Skip if no Flagged fixture

### 11. Deferred email PDF lifecycle

**Seed:** `tests/seed.spec.ts`

#### 11.1. CI-053 CI-054 CI-055 CI-056 CI-060 CI-061 Full lifecycle and invoice number after flow

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Do not automate full Review→Approve→Send in this spec without a flow-polling helper.
    - expect: Document as deferred / long-running
    - expect: NA vs Non-NA PDF and QuickBooks numbering need async waits

#### 11.2. CI-058 CI-065 through CI-069 CI-072 Email notifications

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Do not automate mailbox checks in this UI spec.
    - expect: Deferred until a test mailbox API exists

#### 11.3. CI-042 CI-045 CI-070 CI-071 PDF content and in-app download

**File:** `tests/create-invoice-complete.spec.ts`

**Steps:**
  1. Defer PDF text extraction; optional later: download via page download event.
    - expect: Internal notes must not appear in PDF when PDF checks are added
    - expect: In-app download is a later helper, not a Create Invoice form blocker

---

## 8. Sheet ID → this plan (CI-001 … CI-075)

| Sheet | This plan | Persona | Status | Notes |
|-------|-----------|---------|--------|-------|
| CI-001 | §1.1 | Both | Planned (Automated as TC-CI-01) | Adhoc **Admin only** — sheet listed PM/BDU |
| CI-002 | §1.2 | Both | Planned (TC-CI-02 / TC-CI-10) | Default is **Start with last**, not Brand New |
| CI-003 | §3.1 | Both | Planned | Prefill lines, not dates / invoice # |
| CI-004 | §2.1 | Admin | Planned (TC-CI-11 partial) | Skip PM |
| — | §2.3 CI-004b | Admin | Planned | Adhoc ON forces Brand New — local ID, avoids clashing with CI-011 |
| CI-005 | §2.4 | Admin | Planned | Adhoc bypasses 3-month cap, not contract |
| CI-006 | §5.3 | PM | Planned | 3-month boundary |
| CI-007 | §1.5 | Both | Planned (TC-CI-12) | PM: only switch |
| CI-008 | §4.1 | Both | Planned | Toast + buttons disabled |
| CI-009 | §4.2 | Both | Planned | |
| CI-010 | §4.3 | Both | Planned | Inactive contracts ignored |
| CI-011 | §4.4 | Both | Planned | Invoice Date vs contract |
| CI-012 | §4.5 | Both + Admin Adhoc | **High** Planned | **BUG 147908** |
| CI-013 | §4.6 | Both | Planned | Warning not sticky |
| CI-014 | §4.7 | Both | Planned | Skip if no multi-contract fixture |
| CI-015 / 016 / 017 | §1.3 | Both | Planned (TC-CI-02) | Calendar month, compute at runtime |
| CI-018 | §5.1 | Both | Planned | Start >= End |
| CI-019 | §5.2 | Both | Planned | Invoice Date follows Service End |
| CI-020 / 021 | §5.3 | PM | Planned | Banner on / off |
| CI-022 | §6.1 | Both | Planned (TC-CI-70) | |
| CI-023 | §6.2 | Both | Planned (TC-CI-20 / 21) | PM may skip — No items |
| CI-024 / 025 / 026 | §6.3 | Both | **fixme** | Sheet: not yet fixed |
| CI-027 | §7.1 | Both | Planned | |
| CI-028 / 029 | §7.2 | Both | Planned (TC-CI-30) | Gallery recycling regression |
| CI-030 | §7.3 | Both | Planned (TC-CI-32) | |
| CI-031 / 048 | §7.4 | Both | Planned | Zero qty / zero total |
| CI-032 | §7.5 | Both | Planned (TC-CI-31) | |
| CI-033 | §7.6 | Both | Planned | Skip if no Discount product |
| CI-034 | §7.7 | Both | Planned (TC-CI-30) | |
| CI-035 / 036 | §7.8 | Both | Planned | Empty / incomplete row |
| CI-037 | §11 | — | Deferred | 10 lines + PDF |
| CI-038 | §7.9 | Both | Planned | Confirm live truncate vs reject |
| CI-039 | §8.1 | Both | Planned (TC-CI-40/41) | NA optional tax |
| CI-040 / 041 | §8.2 | Both | Planned | |
| CI-042 | §11.3 | — | Deferred | PDF tax amounts |
| CI-043 | §1.4 | Both | Planned | PO # disabled |
| CI-044 | notes in TC-CI-34 | Both | Automated partial | Optional notes |
| CI-045 | §11.3 | — | Deferred | Notes not in PDF |
| CI-046 / 047 | §9.1 | Both | Planned (TC-CI-51) | Duplicate Project! |
| CI-049 | §9.2 | Both | Planned (TC-CI-50) | PM skip if no partner |
| CI-050 | §9.3 | Both | Planned | Save Draft → Draft |
| CI-051 | §9.4 | Admin | **High** Planned | Adhoc Save Draft future date |
| CI-052 | §5.4 | PM | **High** Planned | Non-adhoc Save Draft cap |
| CI-053 / 054 | §11.1 | — | Deferred | NA lifecycle + QB number |
| CI-055 / 056 | §11.1 | — | Deferred | Non-NA lifecycle + currency |
| CI-057 | §10.2 | Both | **High** Planned | Flag resubmit / Fail-Update |
| CI-058 | §11.2 | — | Deferred | Flag email |
| CI-059 | §2.5 | Admin | Planned | Adhoc still needs total > 0 |
| CI-060 / 061 | §11.1 | Admin | Deferred | Adhoc / Send Instantly lifecycle |
| CI-062 / 063 | §10.1 | Both | Planned | PM skip if empty Overview |
| CI-064 | §9.5 | Both | Planned (TC-CI-03) | Close without save |
| CI-065–069 | §11.2 | — | Deferred | Email |
| CI-070–072 | §11.3 | — | Deferred | PDF |
| CI-073 | §5.5 | Both | **High** Planned | Dates survive Partner select |
| CI-074 | §5.6 | Both | Planned | Refresh clears form |
| CI-075 | §9.6 | Both | Planned | Gallery after Submit |
| — | §2.2 CI-011b | PM | Planned (TC-CI-11b) | Adhoc hidden — not in the sheet |

---

## 9. Generator notes

- One spec file: `tests/create-invoice-complete.spec.ts`.
- `describe` names = section titles in § Test Scenarios (Page load and defaults, Role access Adhoc, …).
- Comment `// spec: specs/create-invoice-regression.md` and `// seed: tests/seed.spec.ts`.
- Reuse helpers from `tests/create-invoice.spec.ts` (`openCreateInvoice`, `waitForCreateInvoiceReady`, `setToggle`, `selectPartnerAndProject`, `selectProduct`, `fillLineItem`).
- Canvas locators only through `iframe[name="fullscreen-app-host"]`. Prefer `getByRole` / `getByText` / placeholders. No appmagic IDs.
- Evidence: `markGroupAndShot` after the screen has real data.
- Do not generate the Deferred suite as runnable tests — leave a `test.describe.skip` or omit it.
- `test.fixme` for CI-024 / CI-025 / CI-026 until the combo free-text defect is fixed.

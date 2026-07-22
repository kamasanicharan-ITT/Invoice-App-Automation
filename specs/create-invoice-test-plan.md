# Create Invoice Screen

## Application Overview

Single source of truth for the Create Invoice (New Invoice) screen of the Invoice Canvas app. Replaces the fragmented adhoc/UI plans which were incomplete and had incorrect assumptions (e.g. editable Invoice/PO numbers, free-text Partner in adhoc).

Live UI (admin/BDU session, Jul 2026): heading New Invoice; radios Brand New | Start with last invoice (default Start with last); Adhoc Invoice + Send Instantly switches (default No); Invoice Number and PO Number DISABLED; Invoice Date defaults to service-period end (observed 7/31/2026); Service Start/End default to **calendar month** 1st → last day (7/1–7/31/2026) — not the Dashboard billing 6th→5th window; Partner Find Partner + Project Find Project cascading lookups; line-item gallery (Find items, Description, Qty, Rate, Total); Add new item; Internal Notes; Tax Find Tax (when applicable); Close / Save Draft / Submit (Save+Submit disabled until form valid). Adhoc ON forces Brand New checked and Yes on the toggle.

### Reverse-engineered rules (from Canvas `cmbProjectCreateInvoice` Items / OnSelect / OnChange)

**Project list (`Items`)**
- Only projects with `Status` text = `"Active"`.
- If Partner selected → filter Projects where `Account.'Account Name'` (or `PartnerID` in `colFilterProjects`) matches selected partner.
- Admin-style Security Roles row (role ≠ `"Read-All Create-Own"`) uses `Projects` table; otherwise uses collection `colFilterProjects`.
- Sorted by `dia_projectname` ascending.

**On project select — Contracts (`ittdev_contract` / EntitySetName `ittdev_contracts`)**
- Lookup to Project: `ittdev_dia_Project` (relationship `ittdev_Contract_dia_Project_dia_Project`).
- Date window: `ittdev_StartDate` ≤ Invoice Date ≤ `ittdev_EndDate`; Status Active (`statecode`).
- **0 contracts in range** → `lv_InactiveContract = true`, **project dropdown is Reset** (selection cleared).
- **>1 contracts in range** → show Contract selector (`lv_SelectContract`); may toast contract type.
- **Exactly 1** → proceed; toast may show contract type (`ShowContractType`).
- Other useful fields: `ittdev_Name`, `ittdev_PONumber`, `ittdev_InvoiceFrequency`, `ittdev_ContractType`.

**Tax (confirmed)**
- **`Find Tax` (`cmbTaxSelector`) is visible only when a North America project is selected**; hidden when project is cleared or non-NA.
- Project OnChange resets tax selector and totals (`varTaxAmount`, `varSubtotal`, `varGrandTotal`).

**Products (`dia_productservices`) — rate types (`ittdev_productservicetype`)**
- Editable Rate — e.g. `IT Retainer`, `Onshore Architects & Executive…`, reimbursements.
- Non-Editable Rate — e.g. `US UI/UX`, `Abundance Coaching`.
- Discount — e.g. `Discount`, `Celiveo Americas`.

**After Submit (confirmed)**
- Toast: invoice submitted (copy ≈ “you have submitted an invoice”).
- Navigate to **Invoice Overview**.
- Dataverse: new `dia_invoicedetails` row (status Submitted / Draft for Save Draft).

### Known DEV fixtures (smoke)
- Partner **Neo** + Project **test for cursor** — active enough to select; no last-month invoice → Brand New toast; NA tax appears when this project is selected (if region = North America).

### Business rules for this suite

- **Phase 1** = create+submit with Dataverse-backed test data (BDU/Admin).
- **Phase 2** = role matrix (PM vs Admin Adhoc visibility; Security Roles / `Read-All Create-Own` project list path).
- Non-adhoc: one invoice per billing period per project (active contract covering Invoice Date); eligible = Active project + active contract in range + **no** non-adhoc invoice in This Month filter window.
- Adhoc: admin only; unlimited; Brand New forced; still needs active contract for dates.
- Products: Editable vs Non-Editable Rate (`ittdev_productservicetype`).
- North America → Tax (`Find Tax`); tax recalculates Total.

**Seed:** `tests/seed.spec.ts`. **Target spec:** `tests/create-invoice.spec.ts`. **Persona Phase 1:** BDU/Admin (`auth.json` / `auth/bdu.json`).

### Implementation roadmap (next)

1. **Dataverse helpers** (Bearer token) — resolve fixtures:
   - Active Partner + Active Project (no non-adhoc invoice in This Month window) + exactly 1 Active Contract covering Invoice Date.
   - Project with prior non-adhoc invoice (for Start with last / prefill).
   - Project with 0 contracts / inactive date (clears project).
   - Editable + Non-Editable products; NA vs non-NA project for tax.
2. **Generate Phase 1A** — UI defaults, radios/toggles, Close (no Dataverse writes).
3. **Generate Phase 1B** — Partner→Project cascade; no-previous toast; Duplicate Project! popup; inactive contract clears project.
4. **Generate Phase 1C** — Line items + Submit non-adhoc → Overview toast + Dataverse assert; then Adhoc submit; Save Draft.
5. **Defer** roles + multi-contract selector until Phase 1C is green.
6. **Dataverse MCP** — optional; only if OData joins (Contracts ↔ Project ↔ invoices) become too painful.

## Test Scenarios

### 1. Create Invoice — UI structure and defaults

**Seed:** `tests/seed.spec.ts`

#### 1.1. TC-CI-01: New Invoice form loads with all expected controls

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Open the app from an authenticated BDU/Admin session, land on Dashboard, click Create Invoice (header or Dashboard button).
    - expect: New Invoice heading is visible inside iframe fullscreen-app-host
    - expect: Navigation shows Dashboard, Invoice Overview, Create Invoice
    - expect: Brand New and Start with last invoice radios are visible
    - expect: Adhoc Invoice and Send Instantly toggles are visible
    - expect: Invoice Number, PO Number, Invoice Date, Partner, Project, Service Start/End Date labels are visible
    - expect: Line item headers Product/Service, Description, Quantity, Rate, Total are visible
    - expect: Find items placeholder and Add new item button are visible
    - expect: Internal Notes, Close, Save Draft, and Submit are visible

#### 1.2. TC-CI-02: Default field states match product rules

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Inspect default values and enabled/disabled state on first load (Adhoc OFF).
    - expect: Start with last invoice is selected by default (or Brand New if product changes — assert actual checked radio)
    - expect: Adhoc Invoice shows No; Send Instantly shows No
    - expect: Invoice Number and PO Number textboxes are disabled
    - expect: Invoice Date is populated (defaults to service end / period end — assert non-empty date)
    - expect: Service Start Date and Service End Date are populated
    - expect: Exactly one empty line item row (Find items visible)
    - expect: Save Draft and Submit buttons are disabled until required fields are filled

#### 1.3. TC-CI-03: Close returns to prior screen

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Click Close on the New Invoice form.
    - expect: Form navigates away from New Invoice
    - expect: Dashboard or previous screen becomes visible

### 2. Create Invoice — Mode radios and toggles

**Seed:** `tests/seed.spec.ts`

#### 2.1. TC-CI-10: Brand New vs Start with last invoice selection (Adhoc OFF)

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. With Adhoc OFF, select Brand New then Start with last invoice.
    - expect: Each radio can be selected and shows checked state
    - expect: Form remains interactive with no error toast

#### 2.2. TC-CI-11: Adhoc ON forces Brand New

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Toggle Adhoc Invoice from No to Yes.
    - expect: Toggle shows Yes and switch is checked
    - expect: Brand New radio becomes checked
    - expect: Form stays on New Invoice without error

#### 2.3. TC-CI-12: Send Instantly toggle works for all users

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Toggle Send Instantly ON then OFF.
    - expect: Label/state switches between No and Yes
    - expect: Rest of form remains visible and interactive

#### 2.4. TC-CI-13: Start with last invoice — no previous invoice popup

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Choose Partner+Project with an active contract but NO prior invoice in last-month / last-invoice collections (e.g. live fixture Partner Neo / Project "test for cursor"), with radio Start with last invoice (or switch to it after project select).
    - expect: Toast visible with text matching `/No invoice has been generated for this project over the last month/i`
    - expect: Brand New radio becomes selected
    - expect: Form remains usable for Brand New entry

#### 2.5. TC-CI-14: Start with last invoice — prefills from prior invoice

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select a Partner+Project that already has at least one prior invoice; choose Start with last invoice.
    - expect: Line items and/or key fields prefill from the last invoice
    - expect: Partner and Project remain selected
    - expect: User can edit editable fields before Submit

### 3. Create Invoice — Partner / Project / dates

**Seed:** `tests/seed.spec.ts`

#### 3.1. TC-CI-20: Partner dropdown opens with Dataverse-backed options

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Open Find Partner and wait for options.
    - expect: Partner dropdown opens
    - expect: At least one partner option is listed (do not hardcode names in assertions beyond presence, or use Dataverse-fetched name)

#### 3.2. TC-CI-21: Project dropdown filters by selected Partner

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select a known Partner (from Dataverse helper), then open Find Project.
    - expect: Project dropdown opens
    - expect: Only projects for that partner appear (spot-check against Dataverse dia_project filtered by ittdev_account)

#### 3.3. TC-CI-22: No active contract covering Invoice Date clears Project

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select a Partner+Project that has no Active Contract covering the current Invoice Date (or change Invoice Date outside all contract windows).
    - expect: Project selection is cleared / reset (Canvas `Reset(cmbProjectCreateInvoice)`)
    - expect: Form does not proceed as if a valid project is selected

#### 3.4. TC-CI-23: Duplicate Project popup when non-adhoc already exists this billing period

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select Partner+Project that already has a non-adhoc invoice in the This Month `Invoice Filtering Options` window (Adhoc OFF).
    - expect: Popup title `Duplicate Project!` with button `Verify`
    - expect: Duplicate flag prevents a second non-adhoc create for that period

### 4. Create Invoice — Line items, products, totals

**Seed:** `tests/seed.spec.ts`

#### 4.1. TC-CI-30: Add and delete line item rows

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Click Add new item, then delete the extra row via the delete img/control.
    - expect: A second Find items / row appears
    - expect: After delete, row count returns to one
    - expect: Table remains interactive

#### 4.2. TC-CI-31: Quantity × Rate auto-calculates line Total

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select an Editable Rate product, enter Quantity and Rate.
    - expect: Line Total updates to Quantity × Rate
    - expect: Invoice Total footer reflects the line total(s)

#### 4.3. TC-CI-32: Non-Editable Rate product locks the Rate field

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select a product with ittdev_productservicetype = Non-Editable Rate (from Dataverse).
    - expect: Rate is pre-populated from dia_productservicerate / unit price
    - expect: Rate control is not freely editable (disabled or rejects change)

#### 4.4. TC-CI-33: Editable Rate product allows changing Rate

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select a product with ittdev_productservicetype = Editable Rate; change Rate.
    - expect: Rate accepts the new value
    - expect: Total recalculates

#### 4.5. TC-CI-34: Internal Notes accepts rich/plain text

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Enter text into Internal Notes.
    - expect: Text is retained and visible

### 5. Create Invoice — North America tax

**Seed:** `tests/seed.spec.ts`

#### 5.1. TC-CI-40: Tax control appears only for North America projects

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. With no project selected (or after clearing project), confirm `Find Tax` is not visible. Select a North America project (e.g. Partner Neo / Project test for cursor when region is NA).
    - expect: Tax option is not shown without an NA project
    - expect: `Find Tax` becomes visible for North America project
    - expect: Selecting a non-NA project keeps Tax hidden

#### 5.2. TC-CI-41: Selecting tax recalculates invoice Total

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. On a North America project with a filled line item, select a tax option.
    - expect: Tax amount is applied
    - expect: Invoice Total updates to include tax

### 6. Create Invoice — Non-adhoc happy path (Dataverse-driven)

**Seed:** `tests/seed.spec.ts`

#### 6.1. TC-CI-50: Create and Submit non-adhoc invoice for eligible project

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Using Bearer token + Dataverse, resolve Partner/Project with: Active status; exactly one Active Contract covering Invoice Date; NO existing non-adhoc invoice for this project in the This Month filter window (`dia_invoicefilteringoptions` / billing cycle). Open Create Invoice; Adhoc OFF; Brand New; select that Partner+Project; keep default calendar service dates (1st–last of month) if inside contract, else adjust; add ≥1 line item (Qty>0, Rate>0); click Submit.
    - expect: Save Draft / Submit become enabled once form is valid
    - expect: Toast indicating invoice was submitted (match `/submitted/i`)
    - expect: Navigation to Invoice Overview
    - expect: Dataverse: new `dia_invoicedetails` row for that project with `dia_status = Submitted` and non-adhoc (`dia_adhocinvoice` false/No)
    - expect: Invoice Number populated after submit (UI Overview and/or API)

#### 6.2. TC-CI-51: Duplicate non-adhoc in same billing cycle is rejected

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Reuse the same Partner+Project from TC-CI-50 (now has an invoice this cycle); attempt another non-adhoc create by selecting the project again.
    - expect: Popup `Duplicate Project!` with `Verify`
    - expect: No second Submitted non-adhoc invoice for that project in the This Month window

#### 6.3. TC-CI-52: Save Draft creates Draft status in Dataverse

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Fill a valid non-adhoc form for another eligible project; click Save Draft.
    - expect: Save completes without error
    - expect: Dataverse record has dia_status = Draft

### 7. Create Invoice — Adhoc happy path (admin)

**Seed:** `tests/seed.spec.ts`

#### 7.1. TC-CI-60: Create and Submit adhoc invoice for any active-contract project

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Toggle Adhoc ON (forces Brand New). Select any Partner+Project with an active contract. Set service dates within contract; Invoice Date = Service End. Add line item(s); Submit.
    - expect: Adhoc remains Yes; Brand New selected
    - expect: Submit succeeds
    - expect: Dataverse: new row with dia_adhocinvoice = true and dia_status = Submitted

#### 7.2. TC-CI-61: Adhoc can be created even if non-adhoc already exists this cycle

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Pick a project that already has a non-adhoc invoice this cycle; create Adhoc invoice and Submit.
    - expect: Submit succeeds
    - expect: Dataverse shows an additional adhoc Submitted invoice for that project

### 8. Create Invoice — Validation negatives

**Seed:** `tests/seed.spec.ts`

#### 8.1. TC-CI-70: Submit blocked when Partner/Project missing

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Leave Partner and/or Project empty; attempt Submit.
    - expect: Submit stays disabled or validation appears
    - expect: No new Dataverse invoice row

#### 8.2. TC-CI-71: Submit blocked when line item Qty/Rate invalid

**File:** `tests/create-invoice.spec.ts`

**Steps:**
  1. Select Partner+Project but leave line Qty/Rate at 0 or empty; attempt Submit.
    - expect: Submit stays disabled or validation appears
    - expect: No successful submit

### 9. Create Invoice — Phase 2 role matrix (planned, not Phase 1)

**Seed:** `tests/seed.spec.ts`

#### 9.1. TC-CI-R01: PM cannot see or use Adhoc Invoice toggle

**File:** `tests/create-invoice-roles.spec.ts`

**Steps:**
  1. Open Create Invoice with auth/pm.json (Basic User, not admin).
    - expect: Adhoc Invoice toggle is hidden or non-interactive
    - expect: PM can still create non-adhoc invoices for eligible projects

#### 9.2. TC-CI-R02: BDU/Admin can use Adhoc

**File:** `tests/create-invoice-roles.spec.ts`

**Steps:**
  1. Open Create Invoice with auth/bdu.json or admin storageState.
    - expect: Adhoc Invoice toggle is visible and usable

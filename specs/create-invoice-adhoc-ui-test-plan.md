# Create Invoice Adhoc UI test plan

## Application Overview

Create Invoice Adhoc Flow UI test plan for the Power Apps canvas app, based on the requested scenarios and the current app structure.

## Test Scenarios

### 1. Create Invoice - Adhoc Flow

**Seed:** `tests/seed.spec.ts`

#### 1.1. TC-CI-01: Page load — all form elements visible

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Open the app from a fresh authenticated session and navigate to the Create Invoice screen.
    - expect: The New Invoice heading is visible inside the app frame.
    - expect: The Brand New and Start with last invoice radio options are visible.
    - expect: The Adhoc Invoice toggle is visible and defaults to OFF/No.
    - expect: The Send Instantly toggle is visible and defaults to OFF/No.
    - expect: The Invoice Number and PO Number fields are visible.
    - expect: The Partner and Project dropdowns are visible.
    - expect: The Invoice Date, Service Start Date, and Service End Date controls are visible.
    - expect: The line item table and Add new item button are visible.
    - expect: The Close button is visible.

#### 1.2. TC-CI-02: Adhoc toggle ON forces Brand New

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Toggle the Adhoc Invoice switch ON from the default state.
    - expect: The toggle changes state to ON/Yes.
    - expect: The Brand New radio option becomes selected automatically.
    - expect: The screen remains on the Create Invoice form without errors.

#### 1.3. TC-CI-03: Brand New and Start with last invoice radio selection works

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Toggle between Brand New and Start with last invoice while Adhoc is OFF.
    - expect: Each radio option can be selected.
    - expect: The selected state changes as expected.
    - expect: The form remains interactive after each change.

#### 1.4. TC-CI-04: Send Instantly toggle can be switched

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Toggle Send Instantly ON and OFF.
    - expect: The toggle changes state between OFF/No and ON/Yes.
    - expect: The rest of the form remains present and interactive.

#### 1.5. TC-CI-05: Invoice Number field accepts text input

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Type text into the Invoice Number field.
    - expect: The input accepts the text.
    - expect: The entered value remains visible in the field.

#### 1.6. TC-CI-06: PO Number field accepts text input

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Type text into the PO Number field.
    - expect: The input accepts the text.
    - expect: The entered value remains visible in the field.

#### 1.7. TC-CI-07: Partner dropdown opens and shows options

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Open the Partner dropdown.
    - expect: The dropdown opens successfully.
    - expect: At least one partner option is rendered from the Dataverse-backed lookup.

#### 1.8. TC-CI-08: Project dropdown responds to Partner selection

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Select a Partner from the Partner dropdown, then open the Project dropdown.
    - expect: The Project dropdown opens successfully.
    - expect: The options shown are related to the selected Partner only.

#### 1.9. TC-CI-09: Invoice Date field shows a value

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Inspect the Invoice Date control.
    - expect: The Invoice Date field is visible and contains a date value.

#### 1.10. TC-CI-10: Service Start and End Date fields show values

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Inspect the Service Start Date and Service End Date controls.
    - expect: Each date field is visible and populated with a date value.

#### 1.11. TC-CI-11: Add line item adds a row

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Click the Add new item button.
    - expect: A new line item row appears beneath the first row.
    - expect: The table remains interactive after the row is added.

#### 1.12. TC-CI-13: Delete line item removes a row

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Add a second row, then click the delete button on the second row.
    - expect: The second row is removed from the table.
    - expect: The table still contains the remaining row(s).

#### 1.13. TC-CI-14: Internal Notes accepts text input

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Type text into Internal Notes.
    - expect: The text is accepted and retained in the field.

#### 1.14. TC-CI-17: Close returns to the previous screen

**File:** `specs/create-invoice-adhoc-ui-test-plan.md`

**Steps:**
  1. Click Close from the Create Invoice form.
    - expect: The user is navigated away from the Create Invoice form.
    - expect: The previous screen becomes visible.

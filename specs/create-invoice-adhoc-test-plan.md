# Create Invoice Adhoc test plan

## Application Overview

Test plan for the Adhoc-only Create Invoice screen in the Invoice Application canvas app, based on the live app navigation path and the layout described by the user.

## Test Scenarios

### 1. Create Invoice - Adhoc only

**Seed:** `tests/seed.spec.ts`

#### 1.1. Page load - default Adhoc form state and visibility

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Open the app from a fresh authenticated session and navigate to the Create Invoice screen using the Create Invoice button from the Dashboard or navigation bar.
    - expect: The New Invoice heading is visible.
    - expect: The Brand New and Start with last invoice radio buttons are visible.
    - expect: The Adhoc Invoice toggle is visible and is in the default OFF/No state.
    - expect: The Send Instantly toggle is visible and is in the default OFF/No state.
    - expect: The Invoice Number, PO Number, Invoice Date, Partner, Project, Service Start Date, Service End Date, and line item controls are visible on first load.
    - expect: A single empty line item row is present by default, with the add-item control available.

#### 1.2. Switching to Adhoc mode changes the form behaviour

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Toggle the Adhoc Invoice switch from OFF to ON.
    - expect: The toggle changes state to Yes/ON.
    - expect: The form switches into adhoc mode.
    - expect: Any non-adhoc-specific lookup or partner/project dependency behavior is no longer required or is changed as the app defines for adhoc invoices.
    - expect: The Save Draft and Submit buttons remain available.

#### 1.3. Brand New versus Start with last invoice

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Observe the radio buttons and switch between Brand New and Start with last invoice while adhoc mode is active.
    - expect: The selected radio button changes state visibly.
    - expect: The form updates according to the selected option; the Adhoc Invoice flow remains intact.
    - expect: The screen remains stable and does not error when switching between the two options.

#### 1.4. Send Instantly toggle behaviour

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Toggle the Send Instantly switch on and off while in adhoc mode.
    - expect: The toggle changes state from OFF/No to ON/Yes and back.
    - expect: The control remains responsive and does not break the rest of the form.

#### 1.5. Invoice Number field accepts text input

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Focus the Invoice Number input and type text into it.
    - expect: The field accepts the typed text without error.
    - expect: The entered value is retained in the field.

#### 1.6. PO Number field accepts text input

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Focus the PO Number input and type text into it.
    - expect: The field accepts the typed text without error.
    - expect: The entered value is retained in the field.

#### 1.7. Partner field behaviour in adhoc mode

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Inspect the Partner field while the Adhoc Invoice toggle is ON.
    - expect: The field behaves according to the adhoc workflow instead of the standard partner lookup requirement.
    - expect: The field is either optional, accepts free-text input, or otherwise differs from the standard non-adhoc workflow as implemented by the app.
    - expect: The form does not throw an error when the field is left blank if the adhoc flow allows it.

#### 1.8. Project field behaviour in adhoc mode

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Inspect the Project field while the Adhoc Invoice toggle is ON.
    - expect: The field behaves according to the adhoc workflow instead of the standard partner/project dependency requirement.
    - expect: The field is either optional, accepts free-text input, or otherwise differs from the standard non-adhoc workflow as implemented by the app.
    - expect: The form does not throw an error when the field is left blank if the adhoc flow allows it.

#### 1.9. Invoice Date picker can be changed

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Open the Invoice Date picker and change the date to a different value.
    - expect: The picker opens successfully.
    - expect: The selected date changes to the new value and is reflected in the control.

#### 1.10. Service Start Date and End Date can be changed

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Open the Service Start Date and Service End Date pickers and change each date.
    - expect: Each date picker opens successfully.
    - expect: Each date changes to the selected value and remains visible in the input.

#### 1.11. Add line item row

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Click the Add new item button on the line items table.
    - expect: A new line item row is added to the table.
    - expect: The new row contains the same editable controls as the original empty row.

#### 1.12. Fill line item and verify total calculation

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Populate at least one line item row with Product/Service, Description, Quantity, and Rate values.
    - expect: The entered values are retained in the row.
    - expect: The Total field updates to the calculated value based on Quantity × Rate.
    - expect: The calculation is visible and correct for the entered values.

#### 1.13. Delete line item row

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Click the delete-row icon on an existing line item row.
    - expect: The selected row is removed from the table.
    - expect: The remaining rows are updated accordingly and the table remains usable.

#### 1.14. Internal Notes accepts text input

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Type text into the Internal Notes rich text area.
    - expect: The entered note content is retained and visible in the field.

#### 1.15. Save Draft action

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Click Save Draft after entering the required data for an adhoc invoice.
    - expect: The save action completes without an error if the form is valid.
    - expect: The app either shows a success message, redirects to a confirmation or invoice list screen, or remains on the form with a saved-state indication as implemented by the app.

#### 1.16. Submit action

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Click Submit after entering the required data for an adhoc invoice.
    - expect: The submit action completes without an error if the form is valid.
    - expect: The app either shows a success message, redirects to a confirmation or invoice list screen, or stays on the form with a submitted-state indication as implemented by the app.

#### 1.17. Close action cancels and returns

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Click Close from the Create Invoice form.
    - expect: The form closes or navigates away to the previous screen.
    - expect: The user is returned to the prior screen such as Dashboard or Invoice Overview as implemented by the app.

#### 1.18. Validation when required fields are missing

**File:** `specs/create-invoice-adhoc-test-plan.md`

**Steps:**
  1. Leave required adhoc fields blank and click Save Draft or Submit.
    - expect: The app displays validation feedback for the missing required fields.
    - expect: The save/submit action does not complete successfully until the required values are supplied.
    - expect: The validation message is clearly visible and anchored to the affected field or control.

# Invoice Overview Test Plan

## Application Overview

Test plan for the Invoice Overview screen of the Invoice Application canvas app, based on the live UI observed in Power Apps.

## Test Scenarios

### 1. Invoice Overview

**Seed:** `tests/seed.spec.ts`

#### 1.1. Invoice Overview loads with expected controls and table layout

**File:** `specs/invoice-overview-test-plan.md`

**Steps:**
  1. Open the app from a fresh authenticated session and navigate to Invoice Overview.
    - expect: The Invoice Overview navigation item is visible and selected.
    - expect: The screen shows the Invoice Overview title or header region.
    - expect: The Show Invoices section is visible.
    - expect: The filter controls for Region and This Month are visible.
    - expect: The table header row includes Partner, Project, Invoice #, Action Pending with, Status, and Next Step.
    - expect: The Refresh Invoices control is visible.
  2. Verify the invoice list and pagination are displayed.
    - expect: At least one invoice row is visible in the list.
    - expect: Row entries contain invoice metadata such as Item number, project name, invoice number, partner name, and status action labels like Review or Report.
    - expect: Pagination controls show page numbers such as 1, 2, 3, and 10 if available.
    - expect: A no-data message 'No Item to Display' appears only when the list is empty.

#### 1.2. Invoice Overview switch between My Invoices and All Invoices

**File:** `specs/invoice-overview-test-plan.md`

**Steps:**
  1. Locate the My Invoices and All Invoices radio options.
    - expect: The My Invoices option is visible.
    - expect: The All Invoices option is visible.
    - expect: Only one option can be active at a time.
  2. Select All Invoices and verify the list refreshes.
    - expect: The invoice list updates to include all invoices accessible to the user.
    - expect: The selected option changes to All Invoices without errors.
    - expect: The header or row values remain visible after switching.
  3. Switch back to My Invoices and verify the list refreshes.
    - expect: The invoice list updates to show only the user's invoices.
    - expect: The selected option changes back to My Invoices.
    - expect: The screen remains on Invoice Overview and does not navigate away unexpectedly.

#### 1.3. Filter and refresh behavior

**File:** `specs/invoice-overview-test-plan.md`

**Steps:**
  1. Open or activate the Region filter control.
    - expect: The Region filter is visible and interactive.
    - expect: Region selection displays available region options when opened.
  2. Select a region and observe the invoice list refresh.
    - expect: The table data updates to reflect the selected region.
    - expect: Row contents change and the invoice list remains visible.
    - expect: No navigation error appears on filter application.
  3. Click Refresh Invoices.
    - expect: The invoice list refreshes.
    - expect: The screen remains on Invoice Overview.
    - expect: No error message appears after refresh.

#### 1.4. Invoice row actions and status labels

**File:** `specs/invoice-overview-test-plan.md`

**Steps:**
  1. Identify row-level action labels such as Review and Report on the invoice list.
    - expect: Each row shows an action label or button for its current status (for example, Review or Report).
    - expect: The displayed statuses are visible in row content where applicable.
  2. Click a row action such as Review or Report if available.
    - expect: The app responds to the row action without producing a UI error.
    - expect: The user is taken to the expected invoice detail or action path when clicking the row action button.

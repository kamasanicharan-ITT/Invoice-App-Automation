# Invoice Overview (Cursor Setup Check)

## Application Overview

Test plan for the Invoice Overview screen of the Invoice Canvas app, composed from live exploration via the Playwright MCP. Persona: current authenticated session (Admin/BDU - can see both My Invoices and All Invoices). The screen renders inside iframe[name="fullscreen-app-host"]. It provides a scope toggle (My Invoices / All Invoices), a Show Invoices period filter, a Region filter, a Search box, a 6-column invoice table (Partner, Project, Invoice #, Action Pending with, Status, Next Step) where the row status drives the Next Step action (Submitted->Review, Fail-Creation->Report, Flagged->Edit), and pagination. Each test is clearly labeled so the scenario is identifiable in the trace/video recording.

## Test Scenarios

### 1. Invoice Overview (Cursor Setup Check)

**Seed:** `tests/seed.spec.ts`

#### 1.1. TC-IOC-01 Screen layout loads with all controls

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Navigate to Invoice Overview from the Dashboard
    - expect: Nav buttons Dashboard, Invoice Overview and Create Invoice are visible
    - expect: The Invoice Overview title is visible
    - expect: My Invoices and All Invoices radio options are visible
    - expect: Show Invoices and Region filters and the Search box are visible
    - expect: Table headers Partner, Project, Invoice #, Action Pending with, Status and Next Step are visible
    - expect: The Create Invoice button and pagination controls are visible

#### 1.2. TC-IOC-02 Admin can switch between My Invoices and All Invoices

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Observe default scope
    - expect: All Invoices is selected by default for this persona
  2. Select My Invoices
    - expect: My Invoices becomes selected
    - expect: The invoice list refreshes and remains on Invoice Overview
  3. Switch back to All Invoices
    - expect: All Invoices becomes selected again
    - expect: The invoice list refreshes and remains visible

#### 1.3. TC-IOC-03 Show Invoices period filter

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Open the Show Invoices period dropdown
    - expect: Options This Month, Last Month, Quarter to Date, Last Quarter, Year to Date, Last Year and Future Months are visible
  2. Select Last Month
    - expect: The list refreshes and the screen stays on Invoice Overview without error

#### 1.4. TC-IOC-04 Region filter

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Open the Region dropdown
    - expect: Regions Australia, Colombia, India, Netherlands, North America, Saudi Arabia, South Korea and UAE are visible
  2. Select India
    - expect: The list refreshes and the screen stays on Invoice Overview without error

#### 1.5. TC-IOC-05 Search filters the invoice list

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Type an invoice number into the Search box
    - expect: The list narrows to rows matching the searched invoice number

#### 1.6. TC-IOC-06 Status drives the correct Next Step action

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Inspect the invoice rows
    - expect: Rows show Partner, Project, Invoice #, Action Pending with and Status
    - expect: A Submitted invoice shows a Review action
    - expect: A Fail-Creation invoice shows a Report action
    - expect: A Flagged invoice shows an Edit action where present

#### 1.7. TC-IOC-07 Pagination navigates between pages

**File:** `tests/invoice-overview-cursor-test.spec.ts`

**Steps:**
  1. Observe pagination controls
    - expect: Page buttons 1, 2, 3 and the last page number are visible
  2. Click page 2 then return to page 1
    - expect: The list updates when navigating to page 2
    - expect: The list returns to the first page

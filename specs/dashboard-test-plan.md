# Dashboard screen test plan

## Application Overview

Test plan for the Dashboard screen of the Invoice Application canvas app, based on the live UI observed in Power Apps.

## Test Scenarios

### 1. Dashboard screen

**Seed:** `tests/seed.spec.ts`

#### 1.1. Dashboard loads with all expected elements visible

**File:** `specs/dashboard-dashboard-load.spec.md`

**Steps:**
  1. Open the app from a fresh authenticated session and land on the Dashboard screen.
    - expect: The Dashboard header is displayed.
    - expect: The Region filter control is displayed and enabled.
    - expect: The four summary cards are visible: Total Invoices, Total Partners, Total Project, and Total Revenue.
    - expect: The Invoice Tasks section is visible.
    - expect: All task rows are visible: Total Tasks, Drafts, Flagged, Submitted, Reviewed, Approved, Failed, Cancelled, and Sent.
    - expect: The Create Invoice button is visible in the top-right of the screen.

#### 1.2. Region filter changes the dashboard data

**File:** `specs/dashboard-region-filter.spec.md`

**Steps:**
  1. Locate the Region dropdown and open it.
    - expect: The dropdown presents the expected region options: Australia, Colombia, India, Netherlands, North America, Saudi Arabia, South Korea, and UAE.
  2. Select a region such as Australia and wait for the dashboard to refresh.
    - expect: The summary card values update from the previous state.
    - expect: The task counts and descriptions update to reflect the selected region.
    - expect: The page remains on the Dashboard screen without error.
  3. Repeat the selection for at least one additional region such as India or North America.
    - expect: The dashboard data changes again for the new selection.
    - expect: The region filter is responsive and does not break the layout or clear the page.

#### 1.3. Task action buttons navigate to the correct invoice views

**File:** `specs/dashboard-task-buttons.spec.md`

**Steps:**
  1. Review the Invoice Tasks rows and identify each button label.
    - expect: Each task row has its corresponding button: View All, View Drafts, View Flagged, View Submitted, View Reviewed, View Approved, View Failed, View Cancelled, and View Sent.
  2. Click each task button one by one in a fresh session or after returning to Dashboard.
    - expect: Each click navigates away from the Dashboard to the relevant invoice list or task-specific view.
    - expect: The resulting screen shows invoices relevant to the selected task state.
    - expect: The user can return to Dashboard and continue testing the next button without a UI error.

#### 1.4. Create Invoice button navigates to the Create Invoice screen

**File:** `specs/dashboard-create-invoice.spec.md`

**Steps:**
  1. Click the Create Invoice button from the Dashboard.
    - expect: The app navigates to the Create Invoice screen.
    - expect: The Create Invoice screen is displayed with its input and action elements available.
    - expect: The user can return to Dashboard if needed.

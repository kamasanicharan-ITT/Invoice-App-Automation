# Invoice Overview lifecycle

## Application Overview

Invoice Overview is the Canvas gallery after Dashboard or after Submit. Admin sees My/All radios (default All). Filters: Show Invoices (Quater typos), Region, Search. Columns: Partner, Project, Invoice #, Action Pending with, Status, Next Step. Refresh is an unlabeled img next to the Invoice Overview title — gallery does not auto-update after Power Automate. Submitted → Review opens View Invoice overlay with nested PDF iframe, Flag, Mark as Reviewed, Comments, Internal Notes; close via right header icon without changing status. Flagged → Edit. Fail-* → Report. Create Invoice parents: Create Invoice - NA Region / Create Invoice - Other Region. Flagged resubmit: Update Invoice - NA Region / Update Invoice - Other Region. Do not Flag or Mark as Reviewed on shared org invoices.

## Test Scenarios

### 1. Invoice Overview Review overlay

**Seed:** `tests/seed.spec.ts`

#### 1.1. TC-IO-20 Review opens View Invoice with PDF and actions

**File:** `tests/invoice-overview-review-overlay.spec.ts`

**Steps:**
  1. Open the Invoice Canvas app as Admin, dismiss host dialogs, click Invoice Overview, wait for Show Invoices and the gallery (rows or No Item to Display).
    - expect: Invoice Overview header is visible
    - expect: Show Invoices is visible
    - expect: All Invoices radio is checked
  2. If no Review button exists, skip. Otherwise click Review on a Submitted gallery row.
    - expect: View Invoice heading is visible
    - expect: Flag button is visible
    - expect: Mark as Reviewed button is visible
    - expect: Comments label is visible
    - expect: Internal Notes (Hidden from Customer) is visible
    - expect: A nested PDF iframe shows invoice content without an error screen
  3. Click the right header icon on View Invoice to close without Flag or Mark as Reviewed.
    - expect: Show Invoices is visible again
    - expect: A Review button is still present for a Submitted row

#### 1.2. TC-IO-21 Close Review without changing status

**File:** `tests/invoice-overview-review-close.spec.ts`

**Steps:**
  1. Open Invoice Overview as Admin and capture the invoice number (or INV- number) of a Submitted row that has Review.
    - expect: A Review button is visible
  2. Click Review, wait for View Invoice, then close with the right header icon. Do not click Flag or Mark as Reviewed.
    - expect: Show Invoices is visible
    - expect: Search or gallery still shows that invoice with Review / Submitted
  3. Optionally click the refresh img next to Invoice Overview title.
    - expect: Still on Overview with Show Invoices visible

#### 1.3. TC-IO-27 Refresh control is present on Overview

**File:** `tests/invoice-overview-refresh.spec.ts`

**Steps:**
  1. Open Invoice Overview as Admin.
    - expect: Invoice Overview text is visible
    - expect: Show Invoices is visible
  2. Click the unlabeled image immediately to the right of the Invoice Overview header title (refresh).
    - expect: Show Invoices remains visible
    - expect: Gallery still has rows or empty state

# Create Invoice Screen UI Test Plan

## Overview

This test plan covers the Create Invoice screen for the Power Apps Canvas Invoice Application. It focuses on the adhoc invoice flow, UI element visibility, interaction behavior, validation, and core actions.

## Assumptions

- The app is already authenticated via `auth.json`.
- The user lands on the Dashboard or the app home screen before navigating to Create Invoice.
- The Create Invoice screen is rendered inside the Canvas app iframe `name="fullscreen-app-host"`.

## Seed

- `tests/seed.spec.ts`

## Test Scenarios

### 1. Navigation and Page Load

1. Open the app from an authenticated session.
2. Navigate to the Create Invoice screen using the Dashboard or Create Invoice navigation.
   - expect: The Create Invoice / New Invoice heading is visible.
   - expect: The page loads inside the Canvas app iframe.
   - expect: No authentication/login page is shown.

### 2. Default Form State and Visibility

1. Confirm all expected fields and controls are visible:
   - Brand New radio
   - Start with last invoice radio
   - Adhoc Invoice toggle
   - Send Instantly toggle
   - Invoice Number
   - PO Number
   - Partner
   - Project
   - Invoice Date
   - Service Start Date
   - Service End Date
   - Line item table
   - Add new item button
   - Internal Notes
   - Save Draft
   - Submit
   - Close
   - expect: A single empty line item row is present by default.

### 3. Adhoc Mode Behavior

1. Toggle Adhoc Invoice ON.
   - expect: The toggle changes to ON/Yes.
   - expect: The form enters adhoc mode.
   - expect: Brand New remains selected or updates per app logic.
   - expect: Form remains stable and interactive.

2. Toggle Adhoc Invoice OFF.
   - expect: The toggle changes back to OFF/No.
   - expect: Standard invoice behavior returns.

### 4. Brand New / Start with Last Invoice Selection

1. Select Brand New.
   - expect: Brand New becomes selected.
2. Select Start with last invoice.
   - expect: Start with last invoice becomes selected.
3. Repeat switch while adhoc is OFF.
   - expect: No UI breakage.

### 5. Send Instantly Toggle

1. Toggle Send Instantly ON.
   - expect: Toggle changes to ON/Yes.
   - expect: UI remains responsive.
2. Toggle it OFF again.
   - expect: Toggle returns to OFF/No.

### 6. Text Input Fields

1. Type into Invoice Number.
   - expect: Text is accepted and retained.
2. Type into PO Number.
   - expect: Text is accepted and retained.

### 7. Partner and Project Controls

1. Open Partner dropdown / lookup.
   - expect: Options appear.
   - expect: At least one partner choice is visible.
2. Select a Partner.
3. Open Project dropdown.
   - expect: Project options are available.
   - expect: Options reflect the selected Partner if the app uses dependent lookup behavior.

### 8. Date Field Interaction

1. Open and change Invoice Date.
   - expect: Date picker opens.
   - expect: Selected date updates.
2. Open and change Service Start Date.
   - expect: Date picker opens and updates.
3. Open and change Service End Date.
   - expect: Date picker opens and updates.

### 9. Line Item Table Behavior

1. Verify initial line item row is present.
2. Click Add new item.
   - expect: A new line item row is added.
3. Populate a line item with values:
   - Product/Service or Description
   - Quantity
   - Rate
   - expect: Values are retained.
4. Verify Total calculation updates.
   - expect: Total = Quantity × Rate.
5. Delete a line item row.
   - expect: The row is removed.
   - expect: Remaining rows remain functional.

### 10. Internal Notes

1. Enter text into Internal Notes.
   - expect: Text is accepted and retained.

### 11. Save Draft Action

1. Enter required data for an adhoc invoice.
2. Click Save Draft.
   - expect: The save completes without error.
   - expect: The app shows success feedback or remains on the form with a saved indication.

### 12. Submit Action

1. Enter required data for an adhoc invoice.
2. Click Submit.
   - expect: Submit completes without error.
   - expect: The app shows success feedback or navigates to the next confirmation/list screen.

### 13. Close / Cancel Action

1. Click Close from the Create Invoice screen.
   - expect: The app navigates away from Create Invoice.
   - expect: The prior screen (Dashboard or previous view) becomes visible.

### 14. Validation and Negative Cases

1. Leave required fields blank and click Save Draft.
   - expect: Validation messages appear.
   - expect: Save does not complete.
2. Leave required fields blank and click Submit.
   - expect: Validation messages appear.
   - expect: Submit does not complete.
3. Add invalid line item values if possible.
   - expect: The app handles invalid input gracefully or shows field-level validation.

## Additional Notes

- Verify the Create Invoice UI remains stable after toggling modes and after row additions/deletions.
- Prioritize observations around the adhoc-specific behavior in the Partner/Project fields.
- Include checks for whether the app uses default date values on load.s
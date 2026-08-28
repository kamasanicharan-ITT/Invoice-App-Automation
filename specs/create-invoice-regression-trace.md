# Create Invoice regression trace

**Sheet:** `specs/Create_Invoice_Test_Cases.md` (CI-001 … CI-075)  
**Plan extras:** CI-004b, CI-011b, CI-040b  
**Automation file:** `tests/Create-Invoice-complete.spec.ts`  
**Personas:** `chromium-admin` (Kamasani Charan) · `chromium-pm` (Rashwanth EM)

This file tracks the **78 regression IDs**, not Playwright `test()` count. Several sheet IDs share one test. Deferred IDs have no test.

---

## 1. Counts

| Bucket | Count |
|--------|------:|
| Regression IDs (75 sheet + 3 extras) | **78** |
| IDs with a test in the complete spec | **59** |
| IDs with no test (deferred) | **19** |
| Playwright `test()` functions | **49** |
| Persona projects | **2** (Admin, PM) |
| Slots if both projects run | **98** (49 × 2) |

**Covered from the sheet = 59 / 78 (76%).**  
**Not automated = 19 / 78 (24%).**

Why Playwright showed **51** on the last Admin-only run: 49 complete-spec tests + 2 flow tests (`TC-CIF-01/02`) that are **not** on the 78-ID sheet. That run also did **not** execute PM.

---

## 2. Last dual-persona run

Completed **2026-08-25** (~1.4h, `workers=1`). Playwright JSON reporter is not wired in this project; results below are from the list reporter.

| Field | Value |
|-------|--------|
| Command | `npx playwright test tests/Create-Invoice-complete.spec.ts --project=chromium-admin --project=chromium-pm --retries=0 --workers=1` |
| Slots | **98** (49 tests × 2 personas) |
| Passed | **62** |
| Failed | **26** |
| Skipped | **10** |
| Admin | 44 passed · 2 failed · 3 skipped |
| PM | 18 passed · 24 failed · 7 skipped |

**Sheet coverage is unchanged by this run:** 59 IDs have a `test()`, 19 IDs are deferred. Pass/fail is execution, not coverage.

### Why PM failed so many

Fixtures resolve the same Dataverse partners for both personas (`AOC / Tech Stack`, `Unimind / Cursor Test`, `Demo Patner / Skyroot`, …). Those names are **not in the PM Partner combo**. Failures look like:

`getByRole('option', { name: 'AOC', exact: true })` not visible.

That is PM seed / visibility, not a missing sheet ID. Form-only tests (defaults, Send Instantly, Partner required, line-item math without a partner) still passed for PM.

Persona **skip** (expected, not a gap in the 59):

| ID | Admin | PM |
|----|-------|-----|
| CI-004, CI-004b, CI-005, CI-051, CI-059 | run | skip (Adhoc hidden) |
| CI-011b | skip (Adhoc visible) | run |
| CI-006 / 020 / 021 | skip (PM-only case) | parked (`test.skip(true)` future-date bug) |

Other skips this run (still in the 59; did not assert the sheet step):

| ID | Admin | PM |
|----|-------|-----|
| CI-075 | skip (Duplicate Project on seed) | fail (AOC not in PM Partner list) |
| CI-062 / 063 | pass | skip (no PM Draft to edit) |

---

## 3. ID → test (all 78)

Legend: **in suite** = a `test()` exists · **deferred** = no test · **bundled** = shares a `test()` with sibling IDs.

### 3.1 In the complete spec (59)

| ID | Persona | Playwright test | Bundled with |
|----|---------|-----------------|--------------|
| CI-001 | Both | CI-001 New Invoice form loads with all expected controls | — |
| CI-002 | Both | CI-002 Brand New empty form keeps calendar-month date defaults | — |
| CI-003 | Both | CI-003 Start with last invoice prefills line items not dates or invoice number | — |
| CI-004 | Admin | CI-004 Admin Adhoc Invoice toggle switches to Yes | — |
| CI-004b | Admin | CI-004b Adhoc ON forces Brand New | — |
| CI-005 | Admin | CI-005 Adhoc ON allows Invoice Date past 3 months when contract covers it | — |
| CI-006 | PM | CI-006 CI-020 CI-021 Non-adhoc 3-month future limit for PM | 020, 021 |
| CI-007 | Both | CI-007 Send Instantly toggle on and off | — |
| CI-008 | Both | CI-008 No active contract shows toast and keeps both buttons disabled | — |
| CI-009 | Both | CI-009 Active contract is applied for the selected project | — |
| CI-010 | Both | CI-010 Contract picker lists only Active contracts | — |
| CI-011 | Both | CI-011 Invoice Date in 4th month with covering contract disables both buttons | — |
| CI-011b | PM | CI-011b PM does not see Adhoc Invoice | — |
| CI-012 | Both | CI-012 Service End in 4th month follows Invoice Date and disables both buttons | — |
| CI-013 | Both | CI-013 Contract warning clears when dates are brought back in range | — |
| CI-014 | Both | CI-014 Multiple Active contracts require the user to pick one | — |
| CI-015 | Both | CI-015 CI-016 CI-017 Date fields default to calendar month bounds | 016, 017 |
| CI-016 | Both | *(same test)* | 015, 017 |
| CI-017 | Both | *(same test)* | 015, 016 |
| CI-018 | Both | CI-018 Service Start must be before Service End | — |
| CI-019 | Both | CI-019 Invoice Date follows Service End Date | — |
| CI-020 | PM | *(same as CI-006)* | 006, 021 |
| CI-021 | PM | *(same as CI-006)* | 006, 020 |
| CI-022 | Both | CI-022 Partner is required | — |
| CI-023 | Both | CI-023 Project list filters by selected Partner | — |
| CI-024 | Both | CI-024 Partner junk search after a valid form disables both buttons | — |
| CI-025 | Both | CI-025 Project junk search after a valid form disables both buttons | — |
| CI-026 | Both | CI-026 Product junk search after a valid form disables both buttons | — |
| CI-027 | Both | CI-027 At least one complete line item is required | — |
| CI-028 | Both | CI-028 CI-029 Add new item appends a blank row without copying the previous product | 029 |
| CI-029 | Both | *(same test)* | 028 |
| CI-030 | Both | CI-030 Preset-rate product fills Rate immediately | — |
| CI-031 | Both | CI-031 CI-048 Quantity or rate of zero blocks submit | 048 |
| CI-032 | Both | CI-032 Line total equals Quantity times Rate | — |
| CI-033 | Both | CI-033 Discount line item shows a negative total | — |
| CI-034 | Both | CI-034 Deleting a line item removes only that row | — |
| CI-035 | Both | CI-035 CI-036 Empty or incomplete line item blocks submit | 036 |
| CI-036 | Both | *(same test)* | 035 |
| CI-038 | Both | CI-038 Rate accepts at most 4 decimal places | — |
| CI-039 | Both | CI-039 Tax is optional for NA invoices | — |
| CI-040 | Both | CI-040 CI-041 Selecting tax shows Subtotal Sales Tax and Grand Total | 041 |
| CI-040b | Both | CI-040b Tax control is absent for Non-NA projects | — |
| CI-041 | Both | *(same as CI-040)* | 040 |
| CI-043 | Both | CI-043 PO Number is disabled on create | — |
| CI-046 | Both | CI-046 CI-047 Duplicate Project popup for same project same month | 047 |
| CI-047 | Both | *(same test)* | 046 |
| CI-048 | Both | *(same as CI-031)* | 031 |
| CI-049 | Both | CI-049 Submit enables when all validations pass | — |
| CI-050 | Both | CI-050 Save Draft saves as Draft and returns to Overview | — |
| CI-051 | Admin | CI-051 Adhoc Save Draft allows future dates inside contract | — |
| CI-052 | Both | CI-052 Non-adhoc 4th month with no covering contract keeps Save Draft enabled | — |
| CI-057 | Both | CI-057 Flagged invoice can be edited and resubmitted | — |
| CI-059 | Admin | CI-059 Adhoc zero amount cannot be submitted | — |
| CI-062 | Both | CI-062 CI-063 Edit existing Draft and Save Draft updates same record | 063 |
| CI-063 | Both | *(same test)* | 062 |
| CI-064 | Both | CI-064 Close returns without saving | — |
| CI-073 | Both | CI-073 Custom service dates survive Partner selection | — |
| CI-074 | Both | CI-074 Browser refresh clears unsaved form to defaults | — |
| CI-075 | Both | CI-075 Overview gallery shows submitted invoice after Submit | — |

### 3.2 Not in the complete spec — skipped as deferred (19)

These IDs are on the 78 list and **do not** have a `test()`. They are why coverage is not 78/78. Persona skip is not the reason they are missing.

| ID | Reason (from the regression plan) |
|----|-----------------------------------|
| CI-037 | 10 line items + PDF |
| CI-042 | PDF tax amounts |
| CI-044 | Internal Notes optional — only in old `TC-CI-34`, not the complete spec |
| CI-045 | Notes not in PDF |
| CI-053 | Full NA lifecycle Create → Send |
| CI-054 | NA invoice number after QuickBooks |
| CI-055 | Full Non-NA lifecycle |
| CI-056 | Non-NA currency / PDF |
| CI-058 | Flag email to submitter |
| CI-060 | Adhoc full lifecycle |
| CI-061 | Send Instantly after approval |
| CI-065 | Submit notification email |
| CI-066 | Review notification email |
| CI-067 | Approve notification email |
| CI-068 | Sent-mail recipients |
| CI-069 | Review/approve from email link |
| CI-070 | PDF content after submit |
| CI-071 | Download PDF from app |
| CI-072 | Download PDF from email |

---

## 4. Bundling (10 extra IDs inside 8 tests)

49 tests contain 59 IDs because these groups share one `test()`:

| Test | IDs |
|------|-----|
| CI-015 CI-016 CI-017 | 3 |
| CI-006 CI-020 CI-021 | 3 |
| CI-028 CI-029 | 2 |
| CI-031 CI-048 | 2 |
| CI-035 CI-036 | 2 |
| CI-040 CI-041 | 2 |
| CI-046 CI-047 | 2 |
| CI-062 CI-063 | 2 |

`49 + 10 = 59`.

---

## 5. Last-run results (Admin / PM)

`ok` = passed · `x` = failed · `-` = skipped.

| Playwright test | Admin | PM |
|-----------------|-------|-----|
| CI-001 New Invoice form loads with all expected controls | ok | ok |
| CI-002 Brand New empty form keeps calendar-month date defaults | ok | ok |
| CI-015 CI-016 CI-017 Date fields default to calendar month bounds | ok | ok |
| CI-043 PO Number is disabled on create | ok | ok |
| CI-007 Send Instantly toggle on and off | ok | ok |
| CI-004 Admin Adhoc Invoice toggle switches to Yes | ok | skip (Adhoc) |
| CI-011b PM does not see Adhoc Invoice | skip (Admin) | ok |
| CI-004b Adhoc ON forces Brand New | ok | skip (Adhoc) |
| CI-005 Adhoc ON allows Invoice Date past 3 months when contract covers it | ok | skip (Adhoc) |
| CI-059 Adhoc zero amount cannot be submitted | ok | skip (Adhoc) |
| CI-003 Start with last invoice prefills line items not dates or invoice number | ok | x (AOC not in PM list) |
| CI-009 Active contract is applied for the selected project | ok | x (partner option) |
| CI-008 No active contract shows toast and keeps both buttons disabled | ok | x (partner option) |
| CI-010 Contract picker lists only Active contracts | ok | x (partner option) |
| CI-014 Multiple Active contracts require the user to pick one | ok | x (partner option) |
| CI-011 Invoice Date in 4th month with covering contract disables both buttons | ok | x (partner option) |
| CI-012 Service End in 4th month follows Invoice Date and disables both buttons | ok | x (partner option) |
| CI-013 Contract warning clears when dates are brought back in range | ok | x (partner option) |
| CI-018 Service Start must be before Service End | ok | ok |
| CI-019 Invoice Date follows Service End Date | ok | ok |
| CI-006 CI-020 CI-021 Non-adhoc 3-month future limit for PM | skip (PM-only) | skip (parked) |
| CI-052 Non-adhoc 4th month with no covering contract keeps Save Draft enabled | ok | x (partner option) |
| CI-073 Custom service dates survive Partner selection | ok | x (partner option) |
| CI-074 Browser refresh clears unsaved form to defaults | x (120s timeout) | ok |
| CI-022 Partner is required | ok | ok |
| CI-023 Project list filters by selected Partner | ok | x (partner option) |
| CI-024 Partner junk search after a valid form disables both buttons | ok | x (partner option) |
| CI-025 Project junk search after a valid form disables both buttons | ok | x (partner option) |
| CI-026 Product junk search after a valid form disables both buttons | ok | x (partner option) |
| CI-027 At least one complete line item is required | ok | ok |
| CI-028 CI-029 Add new item appends a blank row without copying the previous product | ok | ok |
| CI-030 Preset-rate product fills Rate immediately | ok | ok |
| CI-031 CI-048 Quantity or rate of zero blocks submit | ok | ok |
| CI-032 Line total equals Quantity times Rate | ok | ok |
| CI-034 Deleting a line item removes only that row | ok | ok |
| CI-035 CI-036 Empty or incomplete line item blocks submit | ok | x (partner option) |
| CI-038 Rate accepts at most 4 decimal places | ok | ok |
| CI-033 Discount line item shows a negative total | ok | x (partner option) |
| CI-039 Tax is optional for NA invoices | ok | x (partner option) |
| CI-040 CI-041 Selecting tax shows Subtotal Sales Tax and Grand Total | ok | x (partner option) |
| CI-040b Tax control is absent for Non-NA projects | ok | x (partner option) |
| CI-046 CI-047 Duplicate Project popup for same project same month | ok | x (partner option) |
| CI-049 Submit enables when all validations pass | ok | x (partner option) |
| CI-050 Save Draft saves as Draft and returns to Overview | ok | x (partner option) |
| CI-051 Adhoc Save Draft allows future dates inside contract | ok | skip (Adhoc) |
| CI-064 Close returns without saving | ok | ok |
| CI-075 Overview gallery shows submitted invoice after Submit | skip (duplicate seed) | x (AOC not in PM list) |
| CI-062 CI-063 Edit existing Draft and Save Draft updates same record | ok | skip (no PM Draft) |
| CI-057 Flagged invoice can be edited and resubmitted | x (Fail-Creation; Update NA Off/deprecated) | x (no Edit button) |

### Fail notes (this run)

- **Admin CI-074:** test timeout 120s after refresh (PM passed the same case).
- **Admin CI-057:** row landed in `Fail-Creation`; catalog did not have a live **Update Invoice - NA Region** parent (deprecated Off copy was ignored by design).
- **PM (24 fails):** almost all `selectPartner` waiting for Admin-seeded names (`AOC`, Unimind, Skyroot, …). **CI-057** then had no Flagged row with **Edit**.
- **Admin CI-075 skip:** Duplicate Project on the Submit seed, not a locator miss.

---

## 6. Outside this trace

| File | Tests | On the 78? |
|------|------:|------------|
| `tests/create-invoice-flow.spec.ts` TC-CIF-01 / TC-CIF-02 | 2 | No — NA/Other flow family |
| `tests/create-invoice.spec.ts` TC-CI-* | 21 | No — older overlapping suite |

Do not add those 2 or 21 into the 78 coverage number.

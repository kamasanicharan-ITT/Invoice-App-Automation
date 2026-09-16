# Invoice Overview screen plan

**Status:** Source of truth for Invoice Overview  
**Spec file:** `tests/invoice-overview-screen.spec.ts`  
**Seed:** `tests/seed.spec.ts`  
**Source sheet:** `specs/Invoice_Overview_Test_Cases.md` (IO-001 … IO-042)  
**Related:** `dashboard-screen-plan.md`, `create-invoice-screen-plan.md`, `invoice-flows.md`

This is the automation plan, not a copy of the Excel sheet. Sheet IDs are kept for traceability. Live Canvas behaviour supersedes the sheet (including **Quater** spelling, billing cycle vs calendar for This/Last Month, QTD/YTD as **calendar** windows).

---

## 1. Purpose and scope

| In scope | Out of scope / deferred |
|----------|-------------------------|
| Overview shell, filters, search, gallery, pagination | Dashboard tiles → `dashboard-screen-plan.md` |
| Admin My / All radios; PM radios hidden | Create Invoice form fields → `create-invoice-screen-plan.md` |
| Status → Next Step mapping | Email mailbox body |
| Refresh icon | PDF byte-level download until locators are confirmed |
| Review overlay: View Invoice, close without Flag / Mark as Reviewed | Mutating Flag / Approve / Cancel on **shared** org invoices |
| Read-only Overview flow catalog | |

Starting state: fresh load via `storageState`, host dialogs dismissed, Invoice Overview opened.

---

## 2. Same shell, different scope UI

| Aspect | PM | BDU (Admin) |
|--------|----|-------------|
| Nav (Dashboard, Invoice Overview, Create Invoice) | Same | Same |
| Header **Invoice Overview** + unlabeled **refresh** img | Same | Same |
| **My Invoices / All Invoices** | **Hidden** | **Visible**; default **All Invoices** |
| Show Invoices (7 options, **Quater** typos) | Same | Same |
| Region (8 regions; unselected button name `.`) | Same | Same |
| Search placeholder **Search** | Same | Same |
| Columns: Partner, Project, Invoice #, Action Pending with, Status, Next Step | Same | Same |
| Next Step mapping | Same when row exists | Same |
| Pagination | Same | Same |
| List data | Own invoices | Org-wide when All selected |

---

## 3. Personas and run commands

| Persona | storageState | Playwright project |
|---------|--------------|--------------------|
| BDU/Admin | `auth/<env>/admin.json` | `chromium` / `chromium-admin` |
| PM | `auth/<env>/pm.json` | `chromium-pm` |

```powershell
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-admin
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-pm
```

---

## 4. Live product rules

- Entire UI in `iframe[name="fullscreen-app-host"]`.
- Period options: This Month, Last Month, **Quater to Date**, **Last Quater**, Year to Date, Last Year, Future Months.
- This / Last Month use the **billing cycle** (6th → 5th). QTD / YTD / Last Quarter / Last Year use **calendar** bounds (not “rolling 4 months”).
- Invoice # matches `/\d{4}-\d{4}|INV-\d+/`.
- Next Step: Submitted → **Review**, Reviewed → **Approve**, Draft/Flagged → **Edit**, Fail-* → **Report**, Approved/Sent → **View**.
- Refresh: unlabeled img to the right of the **Invoice Overview** title. Gallery does **not** auto-update after Power Automate.
- Review overlay title is **View Invoice**. Close via the **right** header icon (no `Close` name). Nested PDF iframe. Do not Flag or Mark as Reviewed on shared org invoices.
- **Send Instantly** on Overview (Approved row ⋮ menu) is **not** the Create Invoice form toggle. See `invoice-flows.md`.

---

## 5. Automated scenarios (no duplicates)

Helpers: `tests/utils/invoice-overview-ui.ts`.

### Shell (TC-IO)

| ID | Sheet overlap | What it proves |
|----|---------------|----------------|
| TC-IO-01 | IO-001 | Layout: nav, filters, radios by persona, headers, rows or empty |
| TC-IO-02 | IO-012 | Admin switches My / All (default All) |
| TC-IO-02b | IO-012 PM | PM does not see radios |
| TC-IO-03 | IO-002 / 003 | Period options listed; Last Month applied |
| TC-IO-04 | IO-010 / 011 | Region options listed; India applied |
| TC-IO-05 | IO-015 | Search by invoice number |
| TC-IO-06 | IO-023–027 | At least one Next Step action present |
| TC-IO-07 | — | Pagination page 1 ↔ 2 when a second page exists |
| TC-IO-08 | — | Create Invoice from Overview opens New Invoice |
| TC-IO-20 | IO-028, 031, 032, 037 | Review → View Invoice + PDF; close without mutating |
| TC-IO-27 | — | Header refresh still on Overview |

### Extra period / region / search (not covered by TC-IO-03–05)

| ID | What it proves |
|----|----------------|
| IO-004 | Apply **Quater to Date** |
| IO-005 | Apply **Last Quater** |
| IO-006 | Apply Year to Date |
| IO-007 | Apply Last Year |
| IO-008 | Apply Future Months |
| IO-010 | Apply Region North America (TC-IO-04 uses India) |
| IO-011 | Default region unselected (all regions) |
| IO-013 | Search by partner name |
| IO-014 | Search by project name |

### Flow catalog (read-only)

| ID | What it proves |
|----|----------------|
| TC-IO-FLOW-01 | Named Overview-lifecycle flows exist in Dataverse; attach recent runs. Admin only. Does not mutate invoices. |

---

## 6. Deferred (skipped in the spec until you confirm)

| ID | Why it is parked |
|----|------------------|
| IO-033 | Superseded — live app deletes Draft with no confirm popup |

**Batch 1 locked & scripted (15 Sep 2026):** IO-008, 009, 016–022, 029, 030, 032b, 034, 035, 036.

**Batch 2 locked & scripted (16 Sep 2026):** IO-037–040 (lifecycle, Dataverse `dia_status` polling), IO-041, IO-042.

### Open defects the scripted cases report

| Case | Live behaviour | Expected |
|------|----------------|----------|
| IO-041 | PDF (non-NA template) prints Rate/Amount at 2 decimals — 1.123 and 1.1234 both render `AU$1.12`; grid Total and invoice Total (`AU$6.65` for 6.6564) round the same way. Rate field and Dataverse `dia_rate` keep all 4 decimals. | Rate and Total shown to 4 decimals |
| IO-042 | Partner (194), Project (294) and Action Pending with (14) funnel value lists come back in creation order, not A→Z. Sort arrows on Partner / Project / Invoice # work both directions. | Funnel value lists alphabetical |
| IO-041 side finding | Overview **Search** does not match an invoice number such as `INV-104502`; the same row is found by project name. Non-NA invoices also number `INV-1045xx` rather than `2026-xxxx`. | Confirm expected |

Mutating lifecycle (Mark as Reviewed, Flag, Approve, Send Instantly from ⋮) stays out of the suite until you give fixtures and expected overlays.

---

## 7. Generation / heal notes

- Comment `// spec: specs/invoice-overview-screen-plan.md`.
- Reuse `tests/utils/invoice-overview-ui.ts`. Do not add a second Overview spec.
- Do not Flag / Mark as Reviewed / Approve / Cancel shared org invoices.

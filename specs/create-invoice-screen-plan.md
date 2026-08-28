# Create Invoice screen plan

**Status:** Source of truth for the Create Invoice (New Invoice) screen  
**Spec file:** `tests/create-invoice-screen.spec.ts`  
**Seed:** `tests/seed.spec.ts`  
**Source sheet:** `specs/Create_Invoice_Test_Cases.md` (CI-001 … CI-075)  
**Related:** `dashboard-screen-plan.md`, `invoice-overview-screen-plan.md`, `invoice-flows.md`

One suite. Sheet IDs (CI-*) are kept for Excel traceability. Extra IDs (TC-CI-*, TC-CIF-*) cover behaviour the sheet missed. Product rules and the live app supersede the sheet where they disagree (default radio, Adhoc visibility, calendar-month dates).

---

## 1. Purpose and scope

| In scope | Out of scope |
|----------|--------------|
| New Invoice UI, defaults, radios, toggles | Dashboard tiles → `dashboard-screen-plan.md` |
| Partner → Project cascade, line items, tax | Overview gallery / radios → `invoice-overview-screen-plan.md` |
| Contract coverage (Invoice Date + Service End) | Email mailbox, PDF text extract |
| Non-adhoc 3-month future cap; Adhoc bypass | Full Review → Approve → Send on Overview |
| Duplicate Project! popup | Production |
| Save Draft / Submit / Close | Flipping Security Roles mid-suite |
| Admin vs PM on Adhoc | |
| Submit → Create Invoice NA / Other Region flow family | Child-flow internals (reported, not guessed) |

Starting state: fresh load via `storageState`, host dialogs dismissed, Create Invoice opened.

---

## 2. Same form shell, different Adhoc access

| Aspect | PM | BDU / Admin |
|--------|----|-------------|
| Nav + **New Invoice** heading | Same | Same |
| Brand New / Start with last invoice | Same | Same |
| **Adhoc Invoice** toggle | **Hidden** | **Visible**; default OFF; ON forces Brand New |
| Send Instantly | Same | Same |
| Invoice # / PO # disabled until Submit | Same | Same |
| Partner → Project, line items, notes | Same | Same |
| Non-adhoc: 1 per billing period / project | Same | Same |
| Duplicate Project! on second non-adhoc | Same | Same |
| Adhoc unlimited create | N/A | Yes |
| Find Tax (North America only) | Same when NA project | Same |

- Shared cases run under **both** `chromium-admin` and `chromium-pm`.
- Adhoc cases and TC-CIF-* are **Admin only** (skip on PM).
- PM-only: Adhoc hidden (CI-011b).
- `waitForCreateInvoiceReady` must **not** require the Adhoc label for PM.

---

## 3. Personas and run commands

| Persona | storageState | Playwright project |
|---------|--------------|--------------------|
| BDU/Admin | `auth/<env>/admin.json` | `chromium` / `chromium-admin` |
| PM | `auth/<env>/pm.json` | `chromium-pm` |

```powershell
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-pm
```

Detect persona from `testInfo.project.name`. Dismiss host consent via `tests/utils/host-dialogs.ts`.

---

## 4. Live product rules

- **Dates:** Invoice Date / Service Start–End default to **calendar month** bounds (not Dashboard 6th→5th billing cycle).
- **Non-adhoc 3-month cap:** Invoice Date / Service End cannot sit in the 4th calendar month unless Adhoc is ON and a covering contract exists.
- **Contracts:** Active project + covering contract required. Zero contracts → toast and project cleared. Multiple Active contracts → picker.
- **Non-adhoc duplicate window:** billing cycle ∪ calendar month (see Dataverse fixtures).
- **Tax:** `Find Tax` only for North America projects.
- **Currency:** Totals may show `$` (NA) or `₹` (India) — assert with `/(?:\$|₹)\s*[1-9]/`.
- **After Submit:** toast + navigate to Invoice Overview.
- **Flows:** first Submit → **Create Invoice - NA Region** or **Create Invoice - Other Region**. Flagged resubmit → **Update Invoice - NA/Other Region**. Names: `invoice-flows.md`.

---

## 5. Automated scenarios (no duplicates)

Helpers: `tests/utils/create-invoice-ui.ts`, fixtures in `tests/utils/dataverse-fixtures.ts`.

### Page load and defaults

| ID | What it proves |
|----|----------------|
| CI-001 | New Invoice form controls; Adhoc visible Admin / hidden PM |
| TC-CI-02 | Default radio is Start with last; Invoice/PO disabled; Save/Submit disabled |
| CI-002 | Brand New keeps calendar-month date defaults |
| CI-015 / 016 / 017 | Date fields default to calendar month bounds |
| CI-043 | PO Number disabled on create |
| CI-007 | Send Instantly on then off |
| TC-CI-10 | Brand New and Start with last both selectable (Adhoc OFF) |

### Adhoc

| ID | What it proves |
|----|----------------|
| CI-004 | Admin Adhoc toggle to Yes |
| CI-011b | PM does not see Adhoc |
| CI-004b | Adhoc ON forces Brand New |
| CI-005 | Adhoc ON allows Invoice Date past 3 months when contract covers it |
| CI-059 | Adhoc zero amount cannot be submitted |

### Start with last / contracts / dates

| ID | What it proves |
|----|----------------|
| CI-003 | Start with last prefills line items, not dates or invoice number |
| TC-CI-13 | No previous-invoice toast; radio snaps to Brand New |
| CI-009 | Active contract applied |
| CI-008 | No active contract → toast; both buttons disabled |
| CI-010 | Contract picker lists Active contracts only |
| CI-014 | Multiple Active contracts require a pick |
| CI-011 / 012 / 013 | 4th-month Invoice Date / Service End disable buttons; warning clears in range |
| CI-018 | Service Start before Service End |
| CI-019 | Invoice Date follows Service End |
| CI-006 / 020 / 021 | Non-adhoc 3-month future limit for PM |
| CI-052 | Non-adhoc 4th month with no covering contract keeps Save Draft enabled |
| CI-073 | Custom service dates survive Partner selection |
| CI-074 | Browser refresh clears unsaved form |

### Partner, project, line items, tax

| ID | What it proves |
|----|----------------|
| CI-022 | Partner required (Submit disabled) |
| TC-CI-20 | Partner dropdown opens with options |
| CI-023 | Project list filters by Partner |
| CI-024 / 025 / 026 | Junk search on Partner / Project / Product disables buttons |
| CI-027 | At least one complete line item |
| CI-028 / 029 | Add new item appends a blank row |
| CI-030 | Preset-rate product fills Rate |
| TC-CI-32 | Non-Editable Rate product locks Rate |
| CI-031 / 048 | Qty or rate of zero blocks submit |
| CI-032 | Line total = Qty × Rate |
| CI-034 | Deleting a line removes only that row |
| CI-035 / 036 | Empty / incomplete line blocks submit |
| CI-038 | Rate at most 4 decimal places |
| CI-033 | Discount line shows negative total |
| TC-CI-34 | Internal Notes accepts text |
| CI-039 | Tax optional for NA |
| CI-040 / 041 | Selecting tax shows Subtotal / Sales Tax / Grand Total |
| CI-040b | Tax control absent for non-NA |

### Duplicate, save, submit, close

| ID | What it proves |
|----|----------------|
| CI-046 / 047 | Duplicate Project popup same project same month |
| CI-049 | Submit enables when validations pass |
| CI-050 | Save Draft → Draft on Overview |
| CI-051 | Adhoc Save Draft allows future dates inside contract |
| CI-064 | Close returns without saving |
| CI-075 | Overview gallery shows submitted invoice |
| CI-062 / 063 | Edit existing Draft and Save Draft updates same record |
| CI-057 | Flagged invoice edited and resubmitted (Update parent when Submit fires) |
| TC-CI-42 | Adhoc NA + tax + Submit |
| TC-CI-50 | Non-adhoc Submit increases Dataverse count |
| TC-CI-60 | Adhoc Submit (any eligible project) |

### Region flow family (Admin)

| ID | What it proves |
|----|----------------|
| TC-CIF-01 | Adhoc Submit NA → **Create Invoice - NA Region** family (evidence attached) |
| TC-CIF-02 | Adhoc Submit non-NA → **Create Invoice - Other Region** family |

---

## 6. Deferred (no test, or skipped)

Email mailbox (CI-058, CI-065–069, CI-072), PDF extract / attachment (CI-042 sheet PDF, CI-045, CI-070–072), full Review → Approve → Send polling (CI-053–056, CI-060–061 as mailbox). Do not invent those steps.

---

## 7. Generation / heal notes

- Comment `// spec: specs/create-invoice-screen-plan.md` and `// seed: tests/seed.spec.ts`.
- Reuse `tests/utils/create-invoice-ui.ts`. Do not duplicate locators in new files.
- Do not add a second Create Invoice spec.

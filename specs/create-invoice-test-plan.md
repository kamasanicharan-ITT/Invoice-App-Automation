# Create Invoice test plan

**Status:** Source of truth for the Create Invoice (New Invoice) screen  
**Spec file:** `tests/create-invoice.spec.ts` (single suite — replaces adhoc/screen duplicate specs)  
**Seed:** `tests/seed.spec.ts`  
**App:** Invoice Canvas (Power Apps) — DEV  
**Last aligned:** 2026-08-03 (Admin vs PM; Adhoc admin-only)

This document replaces fragmented plans:
`create-invoice-adhoc-test-plan.md`, `create-invoice-adhoc-ui-test-plan.md`,
`create invoice screen UI test.md`.

---

## 1. Purpose and scope

| In scope | Out of scope |
|----------|--------------|
| New Invoice UI defaults, radios, toggles | Dashboard tiles → `dashboard-test-plan.md` |
| Partner → Project cascade, line items, tax | Overview My/All → `invoice-overview-test-plan.md` |
| Non-adhoc create/submit + Duplicate popup | Power Automate deep flow checks |
| **Adhoc** create/submit (**Admin only**) | Multi-contract selector edge cases (future) |
| Role matrix: **PM** vs **BDU/Admin** on Adhoc | Flipping Security Roles mid-suite |

---

## 2. Same form shell, different Adhoc access (core principle)

| Aspect | PM | BDU (Admin) |
|--------|----|-------------|
| Nav + New Invoice heading | Same | Same |
| Brand New / Start with last invoice | Same | Same |
| **Adhoc Invoice** toggle | **Hidden** (not available) | **Visible**; default OFF; ON forces Brand New |
| Send Instantly | Same | Same |
| Invoice # / PO # disabled until Submit | Same | Same |
| Partner → Project, line items, notes | Same | Same |
| Non-adhoc create (1 per billing period / project) | Same | Same |
| Duplicate Project! on second non-adhoc | Same | Same |
| Adhoc unlimited create | **N/A** | Yes |
| Find Tax (North America only) | Same when NA project | Same |

Implications:

- Shared cases run under **both** `chromium-admin` and `chromium-pm`.
- Adhoc cases (**TC-CI-11**, **TC-CI-42**, **TC-CI-60**) are **Admin only** (skip on PM).
- **TC-CI-11b** (Adhoc hidden) is **PM only** (skip on Admin).
- `waitForCreateInvoiceReady` must **not** require Adhoc label for PM.

---

## 3. Personas and authentication

| Persona | storageState | Playwright project |
|---------|--------------|--------------------|
| BDU/Admin | `auth/admin.json` | `chromium` / `chromium-admin` |
| PM | `auth/pm.json` | `chromium-pm` |

```bash
npx playwright test tests/create-invoice.spec.ts --project=chromium-admin
npx playwright test tests/create-invoice.spec.ts --project=chromium-pm
npx playwright test tests/create-invoice.spec.ts --project=chromium-admin --project=chromium-pm
```

Detect persona from `testInfo.project.name` (contains `pm` → PM) — same as Dashboard / Overview.

Always dismiss host consent via `tests/utils/host-dialogs.ts` after navigate.

---

## 4. Live product rules (summary)

- **Dates:** Invoice Date / Service Start–End default to **calendar month** bounds (not Dashboard 6th→5th).
- **Contracts:** Active project + covering contract required; 0 contracts → project cleared.
- **Non-adhoc duplicate window:** billing cycle ∪ calendar month (see Dataverse fixtures).
- **Tax:** `Find Tax` only for North America projects.
- **Currency:** Totals may show `$` (NA) or `₹` (India) — assert with `/(?:\$|₹)\s*[1-9]/`.
- **After Submit:** toast + navigate to Invoice Overview.

---

## 5. Test scenarios

### Shared UI (both personas)

#### TC-CI-01 — New Invoice form loads with expected controls
- expect: New Invoice, nav, Brand New / Start with last, Send Instantly, dates, Partner/Project, line headers, Add new item, Notes, Close / Save Draft / Submit
- expect **[Admin]:** Adhoc Invoice **visible**
- expect **[PM]:** Adhoc Invoice **hidden** (count 0)

#### TC-CI-02 — Default field states
- Start with last checked (Adhoc OFF path); Send Instantly OFF; Invoice/PO disabled; dates populated; Save/Submit disabled
- **[Admin]:** Adhoc switch present and unchecked
- **[PM]:** no Adhoc switch

#### TC-CI-03 — Close returns to prior screen
- Close → Dashboard **or** Invoice Overview

#### TC-CI-10 — Brand New vs Start with last (Adhoc OFF)
- Both radios selectable

#### TC-CI-12 — Send Instantly toggle
- ON then OFF for both personas

#### TC-CI-13 — No previous invoice toast (Start with last)
- Dataverse `noLastMonthInvoice` fixture; skip if toast not produced

#### TC-CI-20 / TC-CI-21 — Partner options; Project filters by Partner

#### TC-CI-30 / TC-CI-31 / TC-CI-32 / TC-CI-34 — Line items add/delete; Qty×Rate total; locked rate; Internal Notes

#### TC-CI-40 / TC-CI-41 — Tax only for NA; tax updates Total (non-adhoc)

#### TC-CI-50 / TC-CI-51 — Submit non-adhoc eligible; Duplicate Project! for blocking project

#### TC-CI-70 — Submit disabled without Partner/Project

### Admin-only

#### TC-CI-11 — Adhoc ON forces Brand New
- Skip on PM

#### TC-CI-42 — Adhoc NA + tax + Submit
- Skip on PM

#### TC-CI-60 — Adhoc create + Submit
- Skip on PM

### PM-only

#### TC-CI-11b — PM does not see Adhoc Invoice toggle
- Skip on Admin
- expect: Adhoc label / switch not present; Brand New / Start with last / Send Instantly still usable

---

## 6. File inventory (after consolidation)

| Keep | Remove (obsolete duplicates) |
|------|------------------------------|
| `tests/create-invoice.spec.ts` | `tests/create-invoice-adhoc.spec.ts` |
| `specs/create-invoice-test-plan.md` (this file) | `tests/create-invoice-screen.spec.ts` |
| | `specs/create-invoice-adhoc-test-plan.md` |
| | `specs/create-invoice-adhoc-ui-test-plan.md` |
| | `specs/create invoice screen UI test.md` |

# Invoice Overview test plan

**Status:** Source of truth for the Invoice Overview screen (regression + automation)  
**Spec file:** `tests/invoice-overview.spec.ts`  
**Seed:** `tests/seed.spec.ts`  
**App:** Invoice Canvas (Power Apps) — DEV  
**Last aligned:** 2026-08-03 (Admin vs PM UI difference on My/All radios)

---

## 1. Purpose and scope

| In scope | Out of scope |
|----------|--------------|
| Overview layout, filters, search, table, pagination | Dashboard tiles → `dashboard-test-plan.md` |
| **Admin** My Invoices / All Invoices radios | Create Invoice form → `create-invoice-test-plan.md` |
| **PM** — radios **hidden**; own invoices only | Dataverse list-count parity (future) |
| Period / Region / Search / Next Step / Create Invoice nav | Clicking through Review/Approve flows |

---

## 2. Same shell, different scope UI (core principle)

| Aspect | PM | BDU (Admin) |
|--------|----|-------------|
| Nav (Dashboard, Overview, Create Invoice) | Same | Same |
| Header **Invoice Overview** | Same | Same |
| **My Invoices / All Invoices** radios | **Hidden** — no radiogroup | **Visible**; default **All Invoices** checked |
| Show Invoices period filter | Same options (incl. Quater typos) | Same |
| Region filter (8 regions) | Same | Same |
| Search | Same | Same |
| Table columns | Same | Same |
| Next Step by status | Same mapping when rows exist | Same |
| Pagination | Same (may have fewer pages as PM) | Same |
| List data | Own invoices only | Org-wide when All selected |

Implications:

- Shared cases (layout filters, period, region, search, Next Step, pagination, Create Invoice) run under **both** `chromium-admin` and `chromium-pm` with the **same expects**, except radio visibility.
- **TC-IO-02** (switch My ↔ All) is **Admin only** — skipped for PM.
- **TC-IO-02b** (radios absent) is **PM only** — skipped for Admin (or folded into layout via persona branch).

---

## 3. Personas and authentication

| Persona | storageState | Playwright project |
|---------|--------------|--------------------|
| BDU/Admin | `auth/admin.json` | `chromium` / `chromium-admin` |
| PM | `auth/pm.json` | `chromium-pm` |

```bash
npx playwright test tests/invoice-overview.spec.ts --project=chromium-admin
npx playwright test tests/invoice-overview.spec.ts --project=chromium-pm
npx playwright test tests/invoice-overview.spec.ts --project=chromium-admin --project=chromium-pm
```

Detect persona in code from `testInfo.project.name` (contains `pm` → PM, else Admin) — same pattern as Dashboard.

---

## 4. Live observations (locator notes)

| Control | Live behavior |
|---------|----------------|
| Canvas host | Entire UI in `iframe[name="fullscreen-app-host"]` |
| Period | Button often `". This Month"`; options include **Quater to Date** / **Last Quater** |
| Region | Unselected name exactly `"."` |
| Search | Placeholder **Search** |
| Invoice # | `/\d{4}-\d{4}/` |
| Next Step | Reviewed→Approve, Submitted→Review, Flagged→Edit, Fail-*→Report, Approved/Sent→View |
| Empty | **No Item to Display** when gallery has no rows |
| Refresh | No accessible Refresh label — do not assert |

---

## 5. Test scenarios

### Shared UI (both personas)

#### TC-IO-01 — Screen layout loads with expected controls

1. Open Overview (wait for rows or empty state).
   - expect: Nav + header visible
   - expect **[Admin]:** My Invoices + All Invoices radios **visible**
   - expect **[PM]:** My Invoices + All Invoices radios **hidden** (count 0 / not visible)
   - expect: Show Invoices, Region, Search, table headers
   - expect: gallery row **or** empty state; pagination `1` when rows exist
   - evidence: mark nav; mark filters; mark scope radios (Admin) or header without radios (PM)

#### TC-IO-03 — Show Invoices period filter

1. Open period combo → all 7 options (incl. Quater typos).
2. Select Last Month → stays on Overview.
   - both personas

#### TC-IO-04 — Region filter

1. Open Region → 8 regions.
2. Select India → Overview remains.
   - both personas

#### TC-IO-05 — Search filters the invoice list

1. Capture a live invoice `#` when rows exist; else skip.
2. Search → matching row remains.
   - both personas (PM may skip if no rows)

#### TC-IO-06 — Status drives the correct Next Step action

1. **[Admin]** Prefer All Invoices for broader statuses.
2. Soft-assert Review / Approve / Edit / Report / View when present (≥1 required if rows exist).
   - both personas; skip if empty gallery

#### TC-IO-07 — Pagination navigates between pages

1. Page 1 visible; page 2 when enough data (annotate + return if only one page).
2. Navigate 2 → back to 1 (page button or prev chevron).
   - both personas

#### TC-IO-08 — Create Invoice from Overview opens New Invoice

1. Click Create Invoice → **New Invoice** visible.
   - **[Admin]** Adhoc Invoice label may be visible
   - **[PM]** do not require Adhoc toggle/controls
   - both personas: Close + Submit visible

### Admin-only

#### TC-IO-02 — Admin can switch My Invoices / All Invoices

Persona: **Admin** (`[Admin] allow`). Skip on PM.

1. Default All Invoices checked.
2. Switch My → list settles on Overview.
3. Switch All → list settles.
   - evidence: radiogroup after each change

### PM-only

#### TC-IO-02b — PM does not see My / All Invoices radios

Persona: **PM** (`[PM] hidden`). Skip on Admin.

1. Open Overview.
   - expect: radiogroup / My Invoices / All Invoices **not visible**
   - expect: Show Invoices + table still usable
   - evidence: mark header + filters without radios

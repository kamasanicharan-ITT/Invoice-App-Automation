# Dashboard screen plan

**Status:** Source of truth for the Dashboard screen  
**Spec file:** `tests/dashboard-screen.spec.ts`  
**Seed:** `tests/seed.spec.ts`  
**App:** Invoice Canvas (Power Apps)  
**Last aligned:** 2026-07-30 (PM/Admin same UI, data-only difference)

---

## 1. Purpose and scope

| In scope | Out of scope (other plans) |
|----------|----------------------------|
| Dashboard landing UI (same layout for PM and Admin) | Invoice Overview list behaviour → `invoice-overview-screen-plan.md` |
| Invoice Tasks tiles + View buttons (visibility) | Create Invoice form fields → `create-invoice-screen-plan.md` |
| Region filter on Dashboard | Flow names and parents → `invoice-flows.md` |
| UI counts vs Dataverse (**same tiles**, role-specific data) | Summary **card KPI numbers** vs Dataverse (not yet) |
| Role matrix: **PM** vs **BDU (Admin)** — **data scope only** | Flipping one user’s Security Roles mid-suite |

---

## 2. Same UI, different data (core principle)

**Confirmed product behaviour**

| Aspect | PM | BDU (Admin) |
|--------|----|-------------|
| Dashboard layout | Same | Same |
| Header / nav (Dashboard, Overview, Create Invoice) | Same | Same |
| KPI summary cards (labels) | Same | Same |
| Invoice Tasks rows | Same set: Total Tasks, Drafts, Flagged, Submitted, Reviewed, Approved, Failed, Cancelled, Sent + View actions | Same |
| Region filter control | Same | Same |
| **Numbers on tiles / cards** | **User-specific** (only invoices relevant to that PM) | **Org-wide** (overall / all invoices in scope) |

Implications for testing:

- **UI structure cases** (DB-001, DB-002, DB-003, DB-004, DB-007, DB-008, DB-009, DB-019) run under **both** roles with the **same expects** — no separate “PM UI” vs “Admin UI”.
- **Data / count cases** use the **same tile labels** but **different Dataverse filters**: Admin = org-wide; PM = user-scoped. Do not assert Admin totals while logged in as PM.
- Role differences on **other screens** (e.g. Overview My/All, Adhoc on Create Invoice) are **out of Dashboard scope**; Dashboard itself does not hide Submitted/Sent/etc. for PM.

---

## 3. Personas and authentication

| Persona | Power Apps role | Security Roles table | storageState | Playwright project (target) |
|---------|-----------------|----------------------|--------------|-------------------------------|
| **PM** | Invoice application basic user 2.0 | No `admin` row | `auth/pm.json` | `chromium-pm` (deferred until captured) |
| **BDU (Admin)** | BDU + app admin | `role = admin` for user email | `auth/admin.json` | `chromium` / `chromium-admin` (**current default**) |

**Rules**

- Tests never log in. Session comes only from `storageState`.
- **BDU (Admin)** in the Excel = elevated app admin (org-wide Dashboard data; Adhoc / All Invoices on **other** screens). Extra Dataverse *system admin* on the same mailbox is OK for admin runs; do **not** use that mailbox as PM while an admin row exists.
- Until `auth/pm.json` exists, automate and stabilize **BDU (Admin)** data cases first; PM **reuses the same UI tests** and adds **user-scoped** Dataverse expects later.
- Role is chosen by **project → auth file**. Optional later: read Security Roles only as a sanity check / to pick the correct count filter — not as a substitute for a second auth file.

**Run (admin today)**

```powershell
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin
```

---

## 4. Product rules (Dashboard Invoice Tasks)

These rules are what automation must encode. They supersede older plan text (e.g. “Submitted = adhoc only”).

| Rule | Detail |
|------|--------|
| Billing cycle | `dia_invoicedate` from **6th of cycle month** (inclusive) to **5th of next month**. |
| Date filter vs UI | Canvas tile counts match **`ge start` and `lt end`** (date-only). Invoices **dated on the cycle end day** (e.g. Aug 5) appear in inclusive API counts but **not** on Dashboard tiles. |
| Unreported | Task tiles use blank `dia_isreported` (`null` or `''`). Reported Fail-* leave Failed. |
| Submitted | **Adhoc + non-adhoc** (`dia_status eq 'Submitted'` only — **not** adhoc-only). |
| Failed | Any `Fail-Creation` / `Fail-Update` / `Fail-Flag` / `Fail-Approval` / `Fail-Review` + unreported. |
| Total Tasks (observed UI) | Draft + Flagged + Submitted + Reviewed + Approved + Failed + **Cancelled**. **Sent** excluded. Same formula for PM and Admin; only the invoice **set** differs. |
| Admin task counts | **Org-wide** within billing cycle (+ rules above). |
| PM task counts | **Same tiles and status filters**, restricted to invoices **relevant to that user** (e.g. submitter / reviewer / approver / assign-to — exact field mapping confirmed on first PM run). |
| Summary cards | Four KPIs: Total Invoices, Total Partners, Total Project, Total Revenue (This/Last Month). **Separate** from Invoice Tasks. Labels identical for both roles; whether KPI **numbers** are also user-scoped for PM is TBD (see open questions). |
| Regions | Same 8 options for both roles. Filter applies on top of that role’s data set (Admin: org ∩ region; PM: user-scope ∩ region). |

**UI naming clarification (Excel)**  
Regression sheet “summary tiles” that list Submitted / Reviewed / … refer to **Invoice Tasks**, not the four KPI summary cards.

---

## 5. Traceability summary

| Source | What we took |
|--------|----------------|
| **Existing automation** (`tests/dashboard-screen.spec.ts`) | TC-DB-01…06 UI; TC-DV-01…09 Dataverse count match (admin filters) |
| **Regression Excel** (screenshot) | DB-001…007 — page load, nav, header, region (BDU), PM total tasks user-specific |
| **Added in this plan** | Same UI / different data principle; Overview nav; Help/profile/bell; cards vs tasks; Dataverse Excel rows; region + dual-role **data** matrix; cycle-end date |

| Category | Count (approx.) |
|----------|-----------------|
| From Excel (refined) | DB-001 … DB-007 |
| From existing automation (Excel-shaped) | DB-008 … DB-018 |
| Newly proposed | DB-019 … DB-024 |

Automation ID mapping is in the **Notes** column (`TC-DB-*` / `TC-DV-*` / *New*).

---

## 6. Implementation status legend

| Status | Meaning |
|--------|---------|
| **Automated (Admin)** | Implemented; run under `auth/admin.json` |
| **Partial** | Some asserts exist; gaps listed in Notes |
| **Planned** | In this plan; not automated yet |
| **Planned (PM)** | Specified for PM; execute after `auth/pm.json` |

**Priority:** High / Medium / Low (aligned with Excel).

---

## 7. Test case catalogue (Excel-compatible)

Copy rows into the regression workbook. Columns match:  
**TC ID | Module | Test Case Title | User Role | Preconditions | Test Steps | Expected Result | Priority | Status | Notes**

### 7.1 From regression Excel (refined)

#### DB-001 — Dashboard screen loads successfully after login

| Field | Value |
|-------|--------|
| **TC ID** | DB-001 |
| **Module** | Page Load |
| **Test Case Title** | Dashboard screen loads successfully after login |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User authenticated; app access granted; correct `storageState` for the persona under test |
| **Test Steps** | 1. Open the Invoice Application URL (via Playwright storageState). 2. Observe the landing screen. |
| **Expected Result** | Dashboard loads with header navigation, summary cards, Invoice Tasks section visible. Notification bell and user profile icon visible if present in the build. |
| **Priority** | High |
| **Status** | Partial → Automated (Admin) for nav + cards + tasks; bell/profile Planned |
| **Notes** | Excel origin. Automation: **TC-DB-01**, **TC-DB-02**, **TC-DB-03**. Add Help/bell/profile under DB-007 / DB-019. |

---

#### DB-002 — Navigate to Invoice Overview from Dashboard

| Field | Value |
|-------|--------|
| **TC ID** | DB-002 |
| **Module** | Navigation |
| **Test Case Title** | Navigate to Invoice Overview from Dashboard |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User is on Dashboard |
| **Test Steps** | 1. Click **Invoice Overview** in the header. 2. Observe the screen that loads. |
| **Expected Result** | Invoice Overview loads and shows the invoice gallery (or empty state) with expected Overview chrome. |
| **Priority** | High |
| **Status** | Planned (nav button only visible today in TC-DB-01) |
| **Notes** | Excel origin. **New automation** — click + Overview assert. |

---

#### DB-003 — Navigate to Create Invoice from Dashboard

| Field | Value |
|-------|--------|
| **TC ID** | DB-003 |
| **Module** | Navigation |
| **Test Case Title** | Navigate to Create Invoice from Dashboard |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User is on Dashboard |
| **Test Steps** | 1. Click **Create Invoice** in the header. 2. Observe the screen that loads. |
| **Expected Result** | Create Invoice (**New Invoice**) screen loads with form chrome (Brand New, Find Partner, Close / Save Draft / Submit). |
| **Priority** | High |
| **Status** | Automated (Admin) |
| **Notes** | Excel origin. Automation: **TC-DB-06**. |

---

#### DB-004 — Invoice Tasks status rows show counts (structure)

| Field | Value |
|-------|--------|
| **TC ID** | DB-004 |
| **Module** | Invoice Tasks |
| **Test Case Title** | Dashboard Invoice Tasks rows show numeric counts for all statuses |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | At least some invoices may exist; Dashboard task section loaded |
| **Test Steps** | 1. Navigate to Dashboard. 2. Observe Invoice Tasks rows. |
| **Expected Result** | Rows visible with numeric counts (regex): Total Tasks, Drafts, Flagged, Submitted, Reviewed, Approved, Failed, Cancelled, Sent — each with its View action. |
| **Priority** | High |
| **Status** | Automated (Admin) for structure; numeric correctness → DB-010…DB-018 |
| **Notes** | Excel DB-004 renamed: was “summary tiles” but listed statuses = **Invoice Tasks**. Automation: **TC-DB-03**. Do not confuse with KPI cards (DB-008). |

---

#### DB-005 — Total Tasks count is user-specific (PM)

| Field | Value |
|-------|--------|
| **TC ID** | DB-005 |
| **Module** | Invoice Tasks |
| **Test Case Title** | Total task count is user-specific |
| **User Role** | **PM** |
| **Preconditions** | Multiple invoices exist for different users; session is `auth/pm.json`; Dashboard UI same as Admin |
| **Test Steps** | 1. Open Dashboard as PM (same tiles as Admin). 2. Read Total Tasks (and related task tiles). 3. Compare to Dataverse using **PM user-scope** filter (same statuses as Admin Total Tasks formula). |
| **Expected Result** | Same Total Tasks / status **tiles** as Admin; **numbers** reflect only invoices relevant to the logged-in PM (not org-wide). |
| **Priority** | High |
| **Status** | Planned (PM) |
| **Notes** | Excel origin. **Data** case only (UI same as Admin). Covered under **DB-018** when run as PM; keep DB-005 in Excel as the PM-focused Total Tasks story if desired. |

---

#### DB-006 — Dashboard region filter works correctly

| Field | Value |
|-------|--------|
| **TC ID** | DB-006 |
| **Module** | Region Filter |
| **Test Case Title** | Dashboard region filter works correctly |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | Invoices from multiple regions exist (for Admin: org-wide; for PM: within that user’s set); correct session |
| **Test Steps** | 1. Open Dashboard. 2. Open Region and select a region (e.g. India). 3. Observe Invoice Tasks tiles. |
| **Expected Result** | Same Region UI for both roles. Control shows selected region; Dashboard stays intact; tile counts update for that region **within the role’s data scope** (Admin: org ∩ region; PM: user-scope ∩ region). |
| **Priority** | High |
| **Status** | Partial — Automated (Admin) select + stay on Dashboard (**TC-DB-05**); count change Planned (**DB-020**); PM run Planned |
| **Notes** | Excel listed BDU only; UI is shared — both roles. Strengthen counts via DB-020 / DB-024. |

---

#### DB-007 — Dashboard navigation links are all visible

| Field | Value |
|-------|--------|
| **TC ID** | DB-007 |
| **Module** | Header |
| **Test Case Title** | Dashboard navigation links are all visible |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User is logged in |
| **Test Steps** | 1. Navigate to Dashboard. 2. Observe the header area. |
| **Expected Result** | Header shows: Dashboard (active), Invoice Overview, Create Invoice; Help icon and User profile icon if present in the build. |
| **Priority** | High |
| **Status** | Partial — Automated (Admin) for three nav links (**TC-DB-01**); Help/profile Planned |
| **Notes** | Excel origin. |

---

### 7.2a UI cases from automation (both roles)

#### DB-008 — Four KPI summary cards are visible

| Field | Value |
|-------|--------|
| **TC ID** | DB-008 |
| **Module** | Summary Cards |
| **Test Case Title** | Dashboard shows four KPI summary cards |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User on Dashboard |
| **Test Steps** | 1. Open Dashboard. 2. Observe summary card strip. |
| **Expected Result** | **Total Invoices**, **Total Partners**, **Total Project**, **Total Revenue** visible with This Month / Last Month labels. |
| **Priority** | High |
| **Status** | Automated (Admin); same UI expects for PM when enabled |
| **Notes** | From automation **TC-DB-02**. Distinct from Invoice Tasks. |

---

#### DB-009 — Region dropdown lists all 8 regions

| Field | Value |
|-------|--------|
| **TC ID** | DB-009 |
| **Module** | Region Filter |
| **Test Case Title** | Region dropdown shows all 8 regions |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User on Dashboard |
| **Test Steps** | 1. Open Region dropdown. 2. List options. |
| **Expected Result** | Australia, Colombia, India, Netherlands, North America, Saudi Arabia, South Korea, UAE. |
| **Priority** | High |
| **Status** | Automated (Admin); same UI expects for PM when enabled |
| **Notes** | From automation **TC-DB-04**. |

---

### 7.2b Dataverse count match (same tiles for PM and Admin)

**Applies to both roles.** Same Invoice Tasks rows (Drafts, Flagged, Submitted, Reviewed,
Approved, Failed, Cancelled, Sent, Total Tasks — as on the live Dashboard). Same status /
billing-cycle / unreported / `lt end` rules. **Only the invoice population differs:**

| Persona | Dataverse scope added to every tile query |
|---------|-------------------------------------------|
| **BDU (Admin)** | Org-wide (no user restriction) |
| **PM** | User-scoped (invoices relevant to that PM — exact clause confirmed on first PM run) |

Automation today: **TC-DV-01…09** under Admin only. When `auth/pm.json` exists, **the same
DB-010…DB-018 cases** run under the PM project with a PM scope helper. Do not treat count
match as Admin-only.

---

#### DB-010 — Draft count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-010 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Drafts tile count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct `storageState` for persona; Bearer token from Canvas; billing cycle dates available |
| **Test Steps** | 1. Read UI Drafts count. 2. Query Dataverse: Draft + cycle + unreported (`lt` end) + **persona scope** (Admin: none; PM: user-scope). 3. Compare. |
| **Expected Result** | UI count equals Dataverse `@odata.count` for that persona’s scope. |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | Automation **TC-DV-01**. Both roles in Excel. |

---

#### DB-011 — Submitted count matches Dataverse — adhoc + non-adhoc

| Field | Value |
|-------|--------|
| **TC ID** | DB-011 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Submitted tile count matches Dataverse (adhoc and non-adhoc) |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | 1. Read UI Submitted. 2. Query `dia_status eq 'Submitted'` + cycle + unreported (`lt` end) + persona scope. 3. Compare. |
| **Expected Result** | UI equals Dataverse for that persona. Includes non-adhoc Submitted within scope. |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | Automation **TC-DV-02**. Supersedes old adhoc-only plan text. |

---

#### DB-012 — Reviewed count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-012 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Reviewed tile count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | Same pattern as DB-010 for Reviewed + persona scope. |
| **Expected Result** | UI equals Dataverse for that persona. |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | **TC-DV-03** |

---

#### DB-013 — Approved count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-013 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Approved tile count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | Same pattern for Approved + persona scope. |
| **Expected Result** | UI equals Dataverse for that persona. |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | **TC-DV-04** |

---

#### DB-014 — Flagged count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-014 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Flagged tile count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | Same pattern for Flagged + persona scope. |
| **Expected Result** | UI equals Dataverse for that persona. |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | **TC-DV-05** |

---

#### DB-015 — Failed count matches Dataverse — unreported Fail-*

| Field | Value |
|-------|--------|
| **TC ID** | DB-015 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Failed tile count matches Dataverse (unreported Fail-* only) |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | 1. Read UI Failed. 2. Query all five Fail-* + unreported + cycle (`lt` end) + persona scope. 3. Compare. |
| **Expected Result** | UI equals Dataverse for that persona. Reported failures excluded. |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | **TC-DV-06**. Failed tile = all Fail-* families. |

---

#### DB-016 — Cancelled count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-016 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Cancelled tile count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | Same pattern for Cancelled + persona scope. |
| **Expected Result** | UI equals Dataverse for that persona. |
| **Priority** | Medium |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | **TC-DV-07** |

---

#### DB-017 — Sent count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-017 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Sent tile count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | Same pattern for Sent + persona scope. |
| **Expected Result** | UI equals Dataverse for that persona. |
| **Priority** | Medium |
| **Status** | Automated (Admin); Planned (PM) |
| **Notes** | **TC-DV-08**. Sent is not in Total Tasks. |

---

#### DB-018 — Total Tasks count matches Dataverse

| Field | Value |
|-------|--------|
| **TC ID** | DB-018 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Total Tasks count matches Dataverse |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Correct session for persona |
| **Test Steps** | 1. Read status tiles + Cancelled. 2. Poll until Total Tasks equals sum of those tiles. 3. Compare Total Tasks to Dataverse TOTAL_TASKS_FILTER + persona scope (includes Cancelled; excludes Sent). |
| **Expected Result** | UI Total Tasks equals Dataverse for that persona and matches on-screen tile sum (including Cancelled). Admin = org-wide; PM = user-scoped (same formula). |
| **Priority** | High |
| **Status** | Automated (Admin); Planned (PM) — also covers Excel DB-005 under PM |
| **Notes** | **TC-DV-09**. Older docs wrongly excluded Cancelled from Total Tasks. |

---

### 7.3 Newly proposed (add to Excel + automate later)

#### DB-019 — Help / notification / profile chrome visible

| Field | Value |
|-------|--------|
| **TC ID** | DB-019 |
| **Module** | Header |
| **Test Case Title** | Help, notification bell, and user profile are visible on Dashboard |
| **User Role** | PM / BDU (Admin) |
| **Preconditions** | User on Dashboard; controls exist in current build |
| **Test Steps** | 1. Open Dashboard. 2. Locate Help, notification, profile controls. |
| **Expected Result** | Each present control is visible (soft-assert if a control is absent in a given build). |
| **Priority** | Medium |
| **Status** | Planned |
| **Notes** | Closes Excel DB-001 / DB-007 gaps. |

---

#### DB-020 — Region filter changes Invoice Tasks counts (Dataverse)

| Field | Value |
|-------|--------|
| **TC ID** | DB-020 |
| **Module** | Region Filter |
| **Test Case Title** | Selecting a region updates task tile counts to region-scoped data |
| **User Role** | **PM / BDU (Admin)** |
| **Preconditions** | Multi-region data in that persona’s scope; correct session |
| **Test Steps** | 1. Capture baseline counts. 2. Select India. 3. Compare UI counts to Dataverse filtered by project region **and** persona scope. |
| **Expected Result** | Counts change appropriately and match region ∩ persona-scoped Dataverse. |
| **Priority** | High |
| **Status** | Planned (Admin first; PM after auth) |
| **Notes** | Strengthens Excel DB-006 for both roles. |

---

#### DB-021 — *(merged)* Per-tile PM Dataverse match

| Field | Value |
|-------|--------|
| **TC ID** | DB-021 |
| **Module** | Dataverse Validation |
| **Test Case Title** | *(Merged into DB-010…DB-018)* |
| **User Role** | **PM** |
| **Preconditions** | — |
| **Test Steps** | — |
| **Expected Result** | — |
| **Priority** | — |
| **Status** | **Superseded** |
| **Notes** | Do **not** duplicate in Excel. PM count match = same IDs DB-010…DB-018 with User Role PM / BDU and PM scope filter. Keep DB-022 for Admin vs PM comparison. |

---

#### DB-022 — Admin vs PM counts differ when multi-user data exists

| Field | Value |
|-------|--------|
| **TC ID** | DB-022 |
| **Module** | Role Matrix |
| **Test Case Title** | Admin counts are org-wide; PM counts are user-scoped (same Dashboard UI) |
| **User Role** | PM **and** BDU (Admin) — two runs |
| **Preconditions** | Data where PM scope ⊂ org-wide; both auth files; identical Dashboard UI |
| **Test Steps** | 1. As Admin, record key tile counts (e.g. Submitted, Total Tasks). 2. As PM, record the same tiles. 3. Compare each to its Dataverse rule. |
| **Expected Result** | Both users see the same tile labels/layout; N_pm ≤ N_admin for shared statuses; each matches its own Dataverse scope. |
| **Priority** | High |
| **Status** | Planned (after PM auth) |
| **Notes** | Cross-project comparison. Never assert Admin numbers under the PM project. |

---

#### DB-023 — Cycle end-day invoices excluded from tiles

| Field | Value |
|-------|--------|
| **TC ID** | DB-023 |
| **Module** | Dataverse Validation |
| **Test Case Title** | Invoices dated on billing cycle end day are excluded from Dashboard tile counts |
| **User Role** | **BDU (Admin)** (same date rule expected for PM once enabled) |
| **Preconditions** | At least one invoice with `dia_invoicedate` = cycle end day |
| **Test Steps** | 1. Count via inclusive `le end`. 2. Count via UI / `lt end`. 3. List end-day rows. |
| **Expected Result** | UI matches `lt end`; end-day rows explain any inclusive–exclusive delta. |
| **Priority** | Medium |
| **Status** | Planned (behaviour already encoded in Admin helpers; optional explicit case) |
| **Notes** | Documents DEV observation used to fix Submitted 104 vs 107. |

---

#### DB-024 — PM Region filter (same UI, scoped data)

| Field | Value |
|-------|--------|
| **TC ID** | DB-024 |
| **Module** | Region Filter |
| **Test Case Title** | PM Region filter uses the same control; counts stay within user scope ∩ region |
| **User Role** | **PM** |
| **Preconditions** | PM session; multi-region data in PM’s invoice set if possible |
| **Test Steps** | 1. Open Region as PM (same control as Admin). 2. Select a region. 3. Observe Invoice Tasks. |
| **Expected Result** | Same Region UI as Admin; filter applies; Dashboard stays usable; counts = user-scope ∩ region (validate vs Dataverse when automated). |
| **Priority** | Medium |
| **Status** | Planned (PM) |
| **Notes** | Merges with DB-006 for shared UI; this ID keeps a PM data-focus case for Excel. |

---

## 8. Automation ID crosswalk

| Plan TC ID | Automation ID | Role focus | Notes |
|------------|---------------|------------|-------|
| DB-001 | TC-DB-01 (+02/+03) | Both | Partial chrome |
| DB-002 | — | Both | **To implement** |
| DB-003 | TC-DB-06 | Both | Done (Admin run today) |
| DB-004 | TC-DB-03 | Both | Structure |
| DB-005 | TC-DV-09 (PM) | PM | Same as DB-018 under PM project |
| DB-006 | TC-DB-05 | Both | Partial; counts → DB-020 |
| DB-007 | TC-DB-01 | Both | Partial |
| DB-008 | TC-DB-02 | Both | Add to Excel |
| DB-009 | TC-DB-04 | Both | Add to Excel |
| DB-010 | TC-DV-01 | **Both** | Admin automated; PM Planned |
| DB-011 | TC-DV-02 | **Both** | Admin automated; PM Planned |
| DB-012 | TC-DV-03 | **Both** | Admin automated; PM Planned |
| DB-013 | TC-DV-04 | **Both** | Admin automated; PM Planned |
| DB-014 | TC-DV-05 | **Both** | Admin automated; PM Planned |
| DB-015 | TC-DV-06 | **Both** | Admin automated; PM Planned |
| DB-016 | TC-DV-07 | **Both** | Admin automated; PM Planned |
| DB-017 | TC-DV-08 | **Both** | Admin automated; PM Planned |
| DB-018 | TC-DV-09 | **Both** | Admin automated; PM Planned |
| DB-019 | — | Both | New |
| DB-020 | — | Both | New |
| DB-021 | — | — | **Superseded** by DB-010…018 |
| DB-022…024 | — | Mixed | New |

---

## 9. Redesign order (what we do next)

1. **Stabilize Admin data** — keep running under `auth/admin.json`; Admin Dataverse filters stay org-wide.
2. **Update Excel** — paste Section 7; stress **same UI / different data** for PM vs Admin.
3. **Shared UI gaps (both roles)** — DB-002 Overview nav, DB-019 chrome; same asserts for PM later.
4. **Region data** — DB-020 (Admin counts); DB-006/DB-024 for PM when auth exists.
5. **Capture PM auth** — `auth/pm.json`; enable `chromium-pm`.
6. **PM data layer** — run **the same DB-010…DB-018** under `chromium-pm` with user-scope on the Dataverse helper (not a second set of tile cases). DB-022 compares Admin vs PM numbers.

---

## 10. Evidence and conventions

- Canvas UI only via `page.frameLocator('iframe[name="fullscreen-app-host"]')`.
- Counts: regex only (e.g. `/\d+\s*Drafts/`) — never hard-coded expected integers in locators.
- Evidence: `markAndShot` / `markGroupAndShot` after asserts.
- On UI ≠ Dataverse mismatch: log/attach row details (and cycle end-day extras when relevant).
- Do not commit `auth.json` or `auth/*.json`.
- Prefer **one** Dashboard spec file: shared UI cases for both projects; count cases branch on persona/project (Admin org-wide vs PM user-scope).

---

## 11. Open questions (confirm when convenient)

1. **PM “relevant” invoices** — Exact rule for user-scope: submitter only, or submitter **or** reviewer **or** approver (mail list / `dia_assignto`)?  
2. **KPI summary cards** — For PM, are Total Invoices / Partners / Project / Revenue also user-scoped, or only Invoice Tasks tiles?  
3. **Empty PM tiles** — If a PM has zero Submitted, is the row still shown as `0 Submitted` (expected: yes, same UI)?


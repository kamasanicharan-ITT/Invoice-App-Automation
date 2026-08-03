# Phase 1 — Invoice Canvas Automation User Story

Use the **Description** and **Acceptance Criteria** sections below for Azure DevOps.
Use the **Journey & Progress Context** section at the end to brief another agent or teammate.

---

## Description

### Overview

This user story covers Phase 1 of automated UI and backend validation for the Invoice Canvas application (Synergy) using Playwright + TypeScript.

Phase 1 delivers:
- Automation infrastructure and AI-assisted test authoring in Cursor
- Core screen suites: Dashboard, Create Invoice, Invoice Overview
- Dataverse API validation alongside UI checks
- Role-based auth scaffolding (BDU/Admin vs PM) and persona-aware Dashboard counts

Primary target: DEV. Multi-environment execution and ADO CI are deferred to later phases.

---

### Tool Evaluation — Test Studio vs Playwright

Power Apps Test Studio was evaluated and rejected because of:
- No practical CI/CD support
- No Dataverse API validation from tests
- Environment / app-version lock-in
- No role-based session execution

Playwright was selected because it supports iframe piercing (required for Canvas apps), Dataverse API validation alongside UI testing, storageState session reuse, HTML reports with screenshots, and future ADO pipeline integration.

---

### Automation Journey

Stage 1 — Codegen
Playwright Codegen was trialed for recording tests. Adopted for auth session capture only. Abandoned for test logic because Canvas app auto-generated IDs and iframe nesting caused unreliable recordings.

Stage 2 — VS Code Copilot with MCP Servers
Moved to AI-assisted generation using GitHub Copilot with the playwright-test MCP server. Three agents were configured: playwright-test-planner (inspects live app, produces scenario plans), playwright-test-generator (writes TypeScript tests from approved plans using live locators), and playwright-test-healer (repairs broken locators when UI changes). MCP inspection confirmed critical Canvas facts: all locators must pierce iframe[name="fullscreen-app-host"], toggles are clicked via label text, Partner/Project open via Find placeholders, and delete icons are image elements.

Stage 3 — Cursor IDE
Migrated to Cursor IDE after Copilot token limits. Persistent app/domain context lives in .cursor/rules/*.mdc (replaces legacy .cursorrules). Planning, generation, healing, and role-auth capture run through Cursor skills and commands in one Composer interface.

---

### Infrastructure Built

- TypeScript Playwright project with Chromium, headed mode, retries, HTML reporter, screenshots, and video/trace on failure
- storageState auth — login once, all tests reuse the session; no login code in specs; auth/ is gitignored
- Role-based Playwright projects:
  - chromium / chromium-admin → auth/admin.json (BDU + admin)
  - chromium-pm → auth/pm.json
- Cursor setup: rules, skills (planner / generator / healer / capture-role-auth), commands (/plan-tests, /generate-test, /heal-tests), and playwright-test MCP
- Shared helpers: Dashboard open helpers, billing-cycle date helpers, Dataverse count helpers, Dataverse fixture helpers (tests/utils/dataverse-fixtures.ts), and marked-screenshot evidence (tests/utils/screenshot.ts)
- Test plans under specs/; private GitHub repository; setup reproducible on a new machine

Note: Multi-environment support via ENV / .env files is designed but not implemented in Phase 1 (tracked in specs/cursor-roadmap.md).

---

### Test Suites Delivered

Smoke
- App loads with saved session and does not show a login screen

Dashboard (tests/dashboard.spec.ts) — 16 tests
- 7 UI structure tests (TC-DB-01 to TC-DB-07): header/nav, summary cards, Invoice Tasks rows, region filter, Create Invoice navigation, Overview navigation
- 9 Dataverse validation tests (TC-DV-01 to TC-DV-09): Drafts, Submitted, Reviewed, Approved, Flagged, Failed, Cancelled, Sent, and Total Tasks counts matched to live Dataverse via Bearer token interception and OData
- Billing cycle logic (6th of cycle month → 5th of next month) mirrored from Canvas Power Fx
- Failed = all Fail-* statuses where dia_isReported is blank
- Submitted includes both adhoc and non-adhoc
- Admin counts are org-wide; PM counts are user-scoped (submitter / reviewer / approver)

Create Invoice (tests/create-invoice.spec.ts) — ~20 tests
- UI defaults, radios, toggles, Partner → Project cascade, line items, Internal Notes, Close, validation
- North America tax visibility and tax total behavior
- Dataverse-backed non-adhoc create and submit
- Duplicate Project popup for second non-adhoc invoice in the billing window
- Adhoc create and submit (admin)

Invoice Overview (tests/invoice-overview.spec.ts) — 8 tests
- TC-IO-01 to TC-IO-08: layout, My Invoices / All Invoices (Admin), period filter, region filter, search, Next Step by status, pagination, Create Invoice navigation

Supporting (not core regression gate)
- Dataverse schema discovery / export specs
- Power Automate flow-tracking exploration specs

---

### Role-Based Testing (Phase 1 Closure)

BDU/Admin and PM have different access outside Dashboard layout:
- BDU/Admin: Adhoc toggle, All Invoices, org-wide Dashboard counts, review/approve/flag/send
- PM: no Adhoc toggle, My Invoices only, own task counts, one non-adhoc invoice per billing period per project

Phase 1 solution:
- Two dedicated test accounts with captured sessions (auth/admin.json, auth/pm.json)
- Two Playwright projects that select the correct storageState automatically
- Dashboard Dataverse validation is persona-aware (same UI asserts, different OData filters)

Admin elevation is application-level via the Security Roles table (role = admin), not a Power Apps environment role alone. Dedicated PM UI matrix suites for Overview and Create Invoice are deferred to Phase 2.

---

### Out of Scope for Phase 1

- Multi-environment execution (SIT / QA / UAT via ENV)
- ADO pipeline integration
- Service Principal / non-interactive authentication
- Email notification testing
- PDF download testing
- Full PM vs Admin UI matrix on Overview and Create Invoice as separate passing suites
- Summary card KPI numbers vs Dataverse
- Production environment

---

## Acceptance Criteria

### Infrastructure
- Playwright is configured with TypeScript for the Invoice Canvas app and runs on Chromium
- Tests reuse authenticated sessions via storageState; no manual login steps exist in specs
- auth/ and auth.json are gitignored and never committed
- Playwright projects are configured for Admin (auth/admin.json) and PM (auth/pm.json)
- Cursor rules document application behavior, Canvas locator conventions, Dataverse schema/filters, roles, and test conventions
- AI-assisted planner, generator, and healer skills work with the playwright-test MCP in Cursor
- Slash commands /plan-tests, /generate-test, and /heal-tests are available
- Code is in a private GitHub repository and the setup is reproducible on a new machine

### Test Coverage
- Smoke test confirms the app loads with a saved session and does not show a login screen
- Dashboard suite includes 7 UI tests (TC-DB-01 to TC-DB-07) and 9 Dataverse validation tests (TC-DV-01 to TC-DV-09)
- Dashboard Dataverse tests intercept the Bearer token and validate Invoice Tasks counts against OData using the Canvas billing-cycle and Failed/Submitted rules
- Create Invoice suite covers form UI plus Dataverse-backed non-adhoc submit, duplicate restriction, and adhoc submit
- Invoice Overview suite includes 8 implemented UI tests (TC-IO-01 to TC-IO-08) under the Admin persona
- Markdown test plans exist under specs/ for Dashboard, Create Invoice, and Invoice Overview

### Role-Based Testing
- Admin and PM auth sessions are captured and usable (auth/admin.json, auth/pm.json)
- Dashboard tests can run under chromium-admin and chromium-pm projects
- Dashboard Dataverse expectations are persona-aware (Admin org-wide; PM involvement-scoped)
- Role and persona model is documented (Basic User vs BDU + Security Roles admin elevation)

### Quality
- No hardcoded Invoice Tasks / status counts — regex patterns and live Dataverse values are used
- No arbitrary waitForTimeout-based flow control — waits are element/data visibility based (except the documented Dashboard count-read helper)
- All Canvas locators pierce iframe[name="fullscreen-app-host"]; no auto-generated CSS/appmagic IDs are used
- Tests follow TC-ID naming (TC-DB, TC-DV, TC-CI, TC-IO)
- HTML report is generated with screenshots after runs; marked evidence uses the shared screenshot helper where applicable

### Explicitly Not Required to Close Phase 1
- Multi-environment ENV / .env.dev|.sit|.qa|.uat execution
- ADO pipeline integration
- Dedicated PM-only Overview and Create Invoice UI suites (Adhoc hidden, My Invoices only) as a Phase 1 gate

---

## Journey & Progress Context (for other agents)

Feed this section to another agent when continuing automation work. It is the factual progress state as of Phase 1 closeout drafting (Aug 2026).

### What this project is

- Playwright E2E automation for the **Invoice Canvas** Power App (Synergy program).
- Companion app: Project Management (model-driven) — feeds partners/projects/contracts into Invoice.
- Entire Canvas UI lives inside `iframe[name="fullscreen-app-host"]`.
- Backend: Dataverse (`https://dev-itt-apps.crm8.dynamics.com`), entity `dia_invoicedetailses`.
- Dev app URL and tenant are documented in `.cursor/rules/00-project-overview.mdc`.
- Never automate against production.

### Source of truth (read these first)

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Repo map and hard rules |
| `.cursor/rules/00-project-overview.mdc` | Apps, envs, entry URL |
| `.cursor/rules/10-canvas-app-conventions.mdc` | Locator patterns |
| `.cursor/rules/20-dataverse.mdc` | Schema, filters, token capture |
| `.cursor/rules/30-roles-and-security.mdc` | PM vs BDU/Admin |
| `.cursor/rules/40-test-conventions.mdc` | Spec style, helpers, screenshots |
| `.cursor/rules/50-app-functionality.mdc` | Screens, lifecycle, billing, business rules |
| `.cursor/skills/*` | Planner / Generator / Healer / capture-role-auth |
| `.cursor/commands/*` | `/plan-tests`, `/generate-test`, `/heal-tests` |
| `specs/cursor-roadmap.md` | Explicit later-phase work (multi-env, ADO) |
| `specs/*-test-plan.md` | Screen test plans |

Legacy `.cursorrules` is replaced by the `.mdc` rules above. `.github/agents/*.agent.md` are Copilot leftovers; Cursor skills are authoritative.

### How we got here (chronology)

1. **Tool choice** — Rejected Power Apps Test Studio; chose Playwright.
2. **Codegen** — Kept only for `--save-storage` auth capture; not for assertions.
3. **VS Code + Copilot + MCP** — Built planner/generator/healer agent pattern; learned Canvas locator quirks live.
4. **Cursor migration** — Moved domain knowledge into rules/skills/commands; continued generation and healing in Composer.
5. **Dashboard first** — UI structure + Dataverse count parity (billing cycle, Failed/Submitted rules refined over iterations).
6. **Create Invoice** — Early adhoc-only UI specs evolved into consolidated `tests/create-invoice.spec.ts` with Dataverse fixtures and submit paths.
7. **Invoice Overview** — Plan finalized; consolidated suite implemented (`tests/invoice-overview.spec.ts`).
8. **Role scaffolding** — `auth/admin.json` + `auth/pm.json`; Playwright projects; Dashboard persona-scoped Dataverse filters.
9. **Supporting exploration** — Schema export specs; Power Automate flow-tracking specs (not core gate).

### What is DONE (Phase 1)

**Infrastructure**
- Playwright + TypeScript project (`playwright.config.ts`, `package.json`, `tsconfig.json`).
- Config projects: `chromium`, `chromium-admin` → `auth/admin.json`; `chromium-pm` → `auth/pm.json`.
- Auth captured locally (gitignored). Default bare `npx playwright test` uses Admin.
- Cursor rules, skills, commands, MCP wired.
- Shared utilities: Dashboard helpers inside dashboard spec; `tests/utils/dataverse-fixtures.ts`; `tests/utils/screenshot.ts`.
- HTML report + screenshots on; video/trace retain-on-failure.

**Suites (primary)**
| File | Status | Notes |
|------|--------|-------|
| `tests/smoke.spec.ts` | Done | Session lands in app |
| `tests/dashboard.spec.ts` | Done | 7 UI + 9 Dataverse; persona-aware counts |
| `tests/create-invoice.spec.ts` | Done | ~20 tests; UI + submit/duplicate/adhoc/tax |
| `tests/invoice-overview.spec.ts` | Done | 8 Admin UI tests |

**Plans**
| File | Status |
|------|--------|
| `specs/dashboard-test-plan.md` | Source of truth; PM/Admin same UI, different data |
| `specs/create-invoice-test-plan.md` | Source of truth; Phase 1 = Admin; role matrix deferred |
| `specs/invoice-overview-test-plan.md` | Source of truth; Admin default |

**Domain knowledge locked in**
- Billing “This Month” = 6th current cycle month → 5th next (not calendar month for Dashboard tiles).
- On calendar days 1–5, “This Month” already points at the upcoming cycle.
- Failed tile = Fail-* + unreported only.
- Submitted tile = adhoc + non-adhoc.
- Admin = Security Roles table row (`role = admin`), typically on BDU account.
- PM alone = My Invoices only, no Adhoc, own-scoped Dashboard counts.
- Create Invoice service date defaults observed as calendar month (form), while Dashboard filters use billing cycle — do not conflate.

### What is PARTIAL / scaffolding only

- **PM runs for Overview & Create Invoice** — auth + projects exist; dedicated PM UI assertions (Adhoc hidden, no All Invoices radios, duplicate as PM) not delivered as a Phase 1 gate.
- **Dashboard under PM** — filters implemented for user scope; full dual-project green runs depend on valid `auth/pm.json` and live PM data.
- **Flow tracking** (`tests/flow-tracking.spec.ts`) — exploratory classify + adhoc submit network/flowruns; not regression gate.
- **Dataverse schema/explorer specs** — discovery aids; not product regression.
- **Create Invoice** — single suite `tests/create-invoice.spec.ts` + plan `specs/create-invoice-test-plan.md` (Admin vs PM; Adhoc Admin-only).

### What is NOT done (Phase 2+)

Documented also in `specs/cursor-roadmap.md`:
- Multi-env parameterization (`ENV=dev|sit|qa|uat`, per-env auth, no prod).
- ADO `azure-pipelines.yml`, JUnit publish, secure auth files.
- Service Principal / non-interactive auth.
- Email notification tests.
- PDF download tests.
- Summary card KPI numbers vs Dataverse.
- Full role matrix suites for Overview + Create Invoice under `chromium-pm`.
- End-to-end lifecycle deep checks beyond Create→Submit (Review / Approve / Send / Flag workflows as full suites).
- Optional Cursor extras (Bugbot, cloud auto-heal, scheduled planner).

### Hard rules every agent must follow

1. Every Canvas locator: `page.frameLocator('iframe[name="fullscreen-app-host"]')`.
2. Never add login code; never commit `auth.json` or `auth/`.
3. Never hardcode counts — use regex or live Dataverse.
4. Prefer `getByRole` / `getByText`; never appmagic/CSS IDs.
5. Match real app text including typos (`Quater to Date`, `Last Quater`).
6. State persona + expected allow/deny on role scenarios.
7. Do not invent multi-env or ADO support as already built — it is roadmap only.

### Key commands

```powershell
# Admin (default)
npx playwright test tests/dashboard.spec.ts --project=chromium-admin

# PM
npx playwright test tests/dashboard.spec.ts --project=chromium-pm

# Create Invoice / Overview (Admin session)
npx playwright test tests/create-invoice.spec.ts --project=chromium-admin
npx playwright test tests/invoice-overview.spec.ts --project=chromium-admin

# Report
npx playwright show-report
```

Capture / refresh auth (headed):

```powershell
npx playwright open --save-storage=auth/admin.json "<APP_URL>"
npx playwright open --save-storage=auth/pm.json "<APP_URL>"
```

### Suggested next work (when Phase 2 starts)

1. Stabilize dual-project Dashboard runs (Admin + PM) and document expected count deltas.
2. Add PM Overview suite: no My/All radios; My Invoices only behavior.
3. Add PM Create Invoice suite: Adhoc hidden; duplicate restriction; no admin-only actions.
4. Implement `ENV` map + per-env auth paths (see `specs/cursor-roadmap.md`).
5. Add ADO pipeline with secure auth download and HTML/JUnit publish.
6. Optionally promote flow-tracking into a formal lifecycle suite after Submit.

### Progress snapshot

| Workstream | Progress |
|------------|----------|
| Tooling & repo | Complete |
| Cursor AI workflow | Complete |
| Smoke | Complete |
| Dashboard UI + Dataverse | Complete (Phase 1) |
| Create Invoice UI + submit paths | Complete (Admin / Phase 1) |
| Invoice Overview UI | Complete (Admin / Phase 1) |
| Role auth scaffolding | Complete |
| Role UI matrix (PM vs Admin on Overview/Create) | Not started (Phase 2) |
| Multi-env | Not started |
| ADO CI | Not started |
| Email / PDF / SPN auth | Not started |

**Phase 1 verdict:** Infrastructure, core Admin suites (Dashboard + Create Invoice + Overview), Dataverse Dashboard validation, and role auth scaffolding are in place. Phase 1 can close with multi-env, ADO, and full PM UI matrix explicitly deferred.
`)
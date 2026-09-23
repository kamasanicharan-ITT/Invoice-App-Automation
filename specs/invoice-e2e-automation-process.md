# Invoice Canvas Automation — End-to-End Process

**Document type:** Process and reference guide for the current automation  
**Application:** Synergy Invoice Canvas (Power Apps)  
**Repository:** Invoice App Automation (tests only)  
**Status date:** 23 September 2026  
**Audience:** QA, developers, and anyone who runs, maintains, or extends the suite

Copy this document into Word, Confluence, or Google Docs. Headings, tables, and command blocks are the source text.

---

## 1. Purpose

This document describes the automation as it exists today: what is tested, how a run is prepared, how tests execute locally and in Azure DevOps, how results are read, and how new tests are added.

The repository contains **Playwright tests only**. The Invoice Canvas app and the Project Management model-driven app are deployed from **ApplicationComponents**. This repo does not deploy the product.

---

## 2. System under test

The Synergy program has two Power Apps that share one Dataverse environment.

| Application | Type | Role in automation |
|---|---|---|
| Project Management | Model-driven | Source of partners, projects, contracts, and resources. Not the app under test. |
| Invoice Application | Canvas | Create, review, approve, send, and track invoices. This is the application under test. |

The Canvas app renders inside `iframe[name="fullscreen-app-host"]`. Every UI locator is scoped to that iframe. Host dialogs (Microsoft consent and connector alerts) appear on the page outside the iframe and are dismissed by a shared helper.

Backend data lives in Dataverse (`https://{org}.crm8.dynamics.com`). Invoice rows are stored in **Invoice Details**, entity set `dia_invoicedetailses`.

Sign-in is Azure AD with MFA. Tests do not type a username or password. A signed-in browser session is saved once and reused.

---

## 3. What the automation covers

### 3.1 In scope

- UI behavior of Dashboard, Create Invoice, and Invoice Overview.
- Role differences between Admin and Project Manager (PM).
- Dataverse checks: Dashboard task counts versus live OData counts, and environment-specific partner, project, contract, and product fixtures.
- Power Automate evidence after Submit (parent flow family for North America and other regions) and a catalog of Overview lifecycle flows.
- Invoice lifecycle actions that the current specs perform: Save Draft, Submit, edit a Draft, edit and resubmit a Flagged invoice, Review, Approve, Flag, Cancel (with comments), Delete Draft, PDF view and download, and decimal display on the PDF.
- Execution on DEV, SIT, QA, and UAT. Production is rejected by configuration.

### 3.2 Out of scope

- Production execution. `ENV=prod` or `ENV=production` throws before any test starts.
- Login automation, service-principal sign-in, or storing passwords in the repo.
- Email body or mailbox verification.
- QuickBooks and other child-flow side effects as pass/fail gates. Child flow names are recorded in the flow-family report. The suite asserts the four Create/Update parent flows when region and action match.
- Deploying the Canvas app. Deployment stays in ApplicationComponents. This pipeline is started manually after that deploy and its post-deploy steps.

---

## 4. How a run moves from deploy to result

```
ApplicationComponents deploy + post-deploy
        |
        v
Choose environment: dev | sit | qa | uat
        |
        v
Signed-in session for that environment
  Local:  auth/<env>/admin.json  and  auth/<env>/pm.json
  Azure DevOps: secure files copied into those same paths
        |
        v
Playwright project
  chromium-admin  -> Admin session, skips titles tagged @pm
  chromium-pm     -> PM session, skips titles tagged @admin
        |
        v
Spec file
  smoke | dashboard | create-invoice | invoice-overview
        |
        v
Browser opens the env app URL (headed locally, headless in CI)
  dismiss host dialogs
  act inside fullscreen-app-host
  optional Dataverse call with the persona Bearer token
        |
        v
Reports
  JUnit (Azure DevOps Tests tab)
  Allure single-file HTML (pipeline artifact)
  Playwright HTML, screenshots, video, and trace
```

Local authoring uses the same path, with `ENV` defaulting to `dev` when it is unset.

---

## 5. Environments

Configuration is `config/env.ts`. Playwright reads it at startup. Optional overrides: `APP_URL`, `DATAVERSE_URL`, `TENANT_ID`.

| ENV | App | Dataverse | Auth files |
|---|---|---|---|
| dev (default) | Power Apps play URL for the DEV environment | `https://dev-itt-apps.crm8.dynamics.com` | `auth/dev/admin.json`, `auth/dev/pm.json` |
| sit | Power Apps play URL for Integration | `https://integration-itt-apps.crm8.dynamics.com` | `auth/sit/admin.json`, `auth/sit/pm.json` |
| qa | Power Apps play URL for QA | `https://qa-itt-apps.crm8.dynamics.com` | `auth/qa/admin.json`, `auth/qa/pm.json` |
| uat | Power Apps play URL for UAT | `https://uat-itt-apps.crm8.dynamics.com` | `auth/uat/admin.json`, `auth/uat/pm.json` |

Tenant ID (shared): `18323149-cc4d-4bff-809d-3eda6caec73a`.

Play URLs omit session-specific `hint` and `sourcetime` query parameters. Exact URLs are in `config/env.ts`.

Unknown `ENV` values throw. Production throws with: `ENV=prod is forbidden. Invoice automation must never run against Production.`

Seed partners, projects, and contracts are created in each Dataverse org and discovered at runtime. Tests do not hardcode DEV names or GUIDs.

---

## 6. Personas and security

Two Power Apps environment roles exist. By themselves they look the same in the Invoice UI until the user also has an admin row.

| Persona | Power Apps role | Security Roles table | Session file | Playwright project |
|---|---|---|---|---|
| Admin | BDU (Business Development User) | Row with `role = admin` for that email | `auth/<env>/admin.json` | `chromium-admin` (and `chromium`, same session) |
| PM | Invoice application basic user 2.0 | No admin row | `auth/<env>/pm.json` | `chromium-pm` |

Admin is an application row in Dataverse table **Security Roles** (`dia_securityroles`). It is not a separate Power Apps environment role. In practice the elevated account is a BDU user with that admin row. The suite treats BDU plus admin row as the Admin persona. There is no third `bdu.json` project.

The same two people are used in DEV, SIT, QA, and UAT. Each environment needs its own session file because cookies and tokens are org-specific.

| Capability | PM | Admin |
|---|---|---|
| My Invoices | Yes | Yes |
| My Invoices / All Invoices radios | Hidden. PM is always on own invoices. | Visible. Admin can switch. |
| Adhoc Invoice toggle | Hidden | Visible. Unlimited adhoc invoices. Adhoc forces Brand New. |
| Non-adhoc invoice | One per project per billing period. A second attempt shows the duplicate dialog. | Same duplicate rule for non-adhoc. |
| Dashboard task counts | Invoices where the user is Submitter, Reviewer, or Approver | All invoices in the billing cycle |
| Review, Approve, Flag, Cancel, Send | Not available as PM-only actions in these specs | Covered by Admin-tagged Overview tests |
| Dataverse fixtures | Projects on the user's Invoice Mail List | Org-wide |

Role-only test titles end with `@admin` or `@pm`. Projects use `grepInvert`:

- Admin projects do not schedule `@pm` tests.
- The PM project does not schedule `@admin` tests.
- Shared tests have neither tag and run on both projects.

---

## 7. Product rules the tests follow

### 7.1 Invoice lifecycle

Happy path: **Create → Submit → Review → Approve → Send**.

| Status | Meaning | Overview next step |
|---|---|---|
| Draft | Editable, not submitted | Edit |
| Submitted | Awaiting review | Review |
| Reviewed | Awaiting approval | Approve |
| Approved | Waiting to send | View |
| Sent | Sent to customer | View |
| Flagged | Sent back for edit | Edit |
| Cancelled | Cancelled | — |
| Fail-Creation, Fail-Update, Fail-Flag, Fail-Approval, Fail-Review | Power Automate failure | Report |

Each workflow step runs a Power Automate flow. A flow failure sets the matching `Fail-*` status.

**Dashboard Failed** counts the five `Fail-*` statuses where `dia_isReported` is blank (unreported only).

### 7.2 Invoice types

- **Non-adhoc (standard):** one invoice per billing period per project per contract. A second attempt in that window raises the duplicate error. Available to PM and Admin.
- **Adhoc:** unlimited, Admin only. Turning **Adhoc Invoice** on forces **Brand New**.

### 7.3 Billing period

`dia_invoicedate` drives period filters. **This Month** and **Last Month** are billing cycles, not calendar months. Canvas uses the 6th of a month through the 5th of the next month, inclusive.

| Period | Range |
|---|---|
| This Month | 6th of the current calendar month through the 5th of the next month |
| Last Month | 6th of the previous calendar month through the 5th of the current calendar month |
| Future Months | From the 6th of the next month onward |
| Quarter / Year to Date, Last Quarter / Year | Calendar boundaries |

On calendar days 1–5, This Month already points at the upcoming cycle. The prior cycle is under Last Month.

Example, any day in August 2026, This Month: 2026-08-06 through 2026-09-05.

Create Invoice date defaults for a brand-new form follow **calendar-month** bounds. Service dates must fall inside an active contract. Non-adhoc PM dates are limited to three months ahead. Adhoc Admin can use a later invoice date when the contract covers it.

Shared helpers: `getBillingCycleDates()` and related functions in `tests/utils/dataverse-fixtures.ts`.

### 7.4 Screens

**Dashboard (landing)**

- Header Dashboard, **+ Create Invoice**, Region filter.
- Regions: Australia, Colombia, India, Netherlands, North America, Saudi Arabia, South Korea, UAE.
- Summary cards for This Month and Last Month, excluding Cancelled, region-filtered: Total Invoices, Total Partners, Total Project, Total Revenue.
- Invoice Tasks: Total Tasks, Drafts, Flagged, Submitted, Reviewed, Approved, Failed, Cancelled, Sent, each with a view action.

**Invoice Overview**

- Navigation **Invoice Overview**, **+ Create Invoice**.
- Radios **My Invoices** and **All Invoices** for Admin. PM does not see the radios.
- Period dropdown labels, including the app spelling **Quater to Date** and **Last Quater**: This Month, Last Month, Quater to Date, Last Quater, Year to Date, Last Year, Future Months.
- Region filter and search (partner, project, invoice number).
- Columns: Partner, Project, Invoice #, Action Pending with, Status, Next Step, and the row menu (⋮).
- Pagination at the bottom.
- Row menu and Next Step actions used by tests: Edit Draft, Delete Draft, Review, Approve, Flag, Cancel Invoice, PDF view, Download.

**Create Invoice**

- Radios: **Brand New** and **Start with last invoice** (pre-fills line items). Adhoc on forces Brand New.
- Toggles: **Adhoc Invoice** (default No, Admin only) and **Send Instantly**.
- Invoice number and PO number stay disabled on create. Invoice number is assigned after Submit.
- Partner filters Project. Line items: Product/Service, Description, Quantity, Rate, Total. Total = Quantity × Rate.
- Product types: locked rate, editable rate, and discount (negative total).
- Rate accepts at most four decimal places. PDF Rate and Amount display at most two decimal places.
- North America projects can show tax (Subtotal, Sales Tax, Grand Total). Non-NA projects do not show the tax control.
- Internal Notes is optional rich text.
- Actions: Close, Save Draft (status Draft, no submit flow), Submit (starts the approval flow).
- Validation includes partner, project, at least one complete line with quantity and rate greater than zero, and service dates inside the contract.

### 7.5 Power Automate parents the suite names exactly

| When | Catalog name |
|---|---|
| First Submit, North America | Create Invoice - NA Region |
| First Submit, any other region | Create Invoice - Other Region |
| Flagged or Draft edit then Submit, North America | Update Invoice - NA Region |
| Flagged or Draft edit then Submit, other regions | Update Invoice - Other Region |
| After submit / notify initiator | NotifyInvoiceInitiator |
| After Submitted | Project Invoice (M): Handle Post Submitted Tasks |
| Create form Send Instantly | Notify for Immediate send Invoices |
| Overview menu on Approved, Send Instantly | Send instant Invoices to Client |

Retired names (`Copy of …`, `Deprecated`, old duplicates) are ignored as live parents. Flow reference: `specs/invoice-flows.md`.

---

## 8. Repository layout

| Path | Purpose |
|---|---|
| `tests/smoke.spec.ts` | Proves the saved session opens the app |
| `tests/dashboard-screen.spec.ts` | Dashboard UI and Dataverse task counts |
| `tests/create-invoice-screen.spec.ts` | Create Invoice form, validation, draft, submit, flows |
| `tests/invoice-overview-screen.spec.ts` | Overview filters, lifecycle actions, PDF, flow catalog |
| `tests/seed.spec.ts` | Template for the AI generator. Not a product test. Do not edit it by hand. |
| `tests/utils/` | Shared UI, Dataverse, flow, screenshot, and session helpers |
| `config/env.ts` | Environment URLs and auth paths |
| `playwright.config.ts` | Timeout, reporters, viewport, role projects |
| `specs/*-screen-plan.md` | Approved scenario plans for Dashboard, Create Invoice, and Overview |
| `specs/Create_Invoice_Test_Cases.md` | Excel dump CI-001 … CI-075. Traceability only. |
| `specs/Invoice_Overview_Test_Cases.md` | Excel dump IO-001 … IO-042. Traceability only. |
| `specs/dataverse-schema.md` | Schema snapshot |
| `specs/invoice-flows.md` | Flow catalog names |
| `specs/automation-setup.md` | Laptop setup guide. Auth examples in that file still show older root `auth/*.json` paths. Current sessions live under `auth/<env>/`. |
| `azure-pipelines.yml` | Manual Azure DevOps pipeline: environment, suite, optional single-test filter, optional PM |
| `Invoice-E2E.yml` | Smaller manual pipeline: DEV Admin smoke only |
| `.cursor/rules/` | Domain rules the AI authoring workflow follows |
| `.cursor/skills/` | Planner, generator, healer, and auth-capture workflows |
| `.cursor/commands/` | `/plan-tests`, `/generate-test`, `/heal-tests` |
| `auth/` | Local sessions. Gitignored. Never commit. |
| `test-results/`, `playwright-report/`, `allure-results/`, `allure-report/` | Run output. Gitignored. |
| `test-log-details/` | Local probe logs, screenshots, and notes. Gitignored except folder markers. |

Excel sheets are traceability. Where an Excel row disagrees with the screen plan or the live app, the plan and the live app win.

---

## 9. Playwright configuration

From `playwright.config.ts`:

| Setting | Value | Effect |
|---|---|---|
| Test directory | `tests/` | Discovers `*.spec.ts` |
| Timeout | 90 seconds | Per test |
| Retries | 1 locally | The Azure pipeline passes `--retries=0` |
| fullyParallel | false | Safer against shared Dataverse data |
| Workers | 1 when `CI` is set | Local worker count is Playwright's default |
| Headless | On when `CI` is set | Local runs show the browser |
| forbidOnly | On when `CI` is set | `test.only` fails the pipeline |
| baseURL | `env.appUrl` | Selected environment |
| Viewport | 1920 × 1080 | Overview row menu and Next Step sit on the right. 1280 × 720 clips them. |
| Screenshot | on | Every test |
| Video | retain-on-failure | |
| Trace | retain-on-failure | |

Projects:

| Project | Session | Scheduled tests |
|---|---|---|
| `chromium` | Admin | All tests except titles containing `@pm` |
| `chromium-admin` | Admin | Same filter as `chromium` |
| `chromium-pm` | PM | All tests except titles containing `@admin` |

Run with an explicit `--project`. A command with no project runs all three, which executes Admin cases twice (`chromium` and `chromium-admin`) and also runs the PM project.

Reporters, all active together:

| Reporter | Output |
|---|---|
| list | Console |
| html | `playwright-report/` (`open: never`) |
| junit | `test-results/junit.xml` |
| allure-playwright | `allure-results/`, with environment name and app label Invoice Canvas |

Allure HTML is generated by `allurerc.json` (`name: Invoice E2E`, single-file report under `allure-report/`).

---

## 10. Shared helpers

| File | Responsibility |
|---|---|
| `tests/utils/host-dialogs.ts` | Clicks **Allow** on the Invoice Application consent dialog and closes connector alerts. Never clicks Don't allow. |
| `tests/utils/assert-app-session.ts` | Before a screen suite, opens the app and fails fast with `SessionExpiredError` when Microsoft sign-in is shown, so the rest of the file is skipped instead of each test waiting on a login page. |
| `tests/utils/screenshot.ts` | `markAndShot`, `markGroupAndShot`, and `shot`. Evidence is a full-context screenshot with a highlight, attached under a `test.step` of the same name. |
| `tests/utils/create-invoice-ui.ts` | Open Create Invoice, partner/project/product selection, line items, toggles, dates, duplicate dialog, contract picker, submit navigation. |
| `tests/utils/invoice-overview-ui.ts` | Open Overview, period and region, search, sort, column filters, pagination, row menu, PDF, disposable draft. |
| `tests/utils/invoice-decimal-rates.ts` | Multi-row decimal rates and PDF text checks (at most two decimal places on the PDF). |
| `tests/utils/dataverse-fixtures.ts` | Billing-cycle dates, Bearer token capture, persona-scoped projects, contracts, products, duplicate and draft eligibility. |
| `tests/utils/flow-runs.ts` | Cloud flow catalog and recent runs from Dataverse. |
| `tests/utils/flow-family.ts` | Parent-and-child family after Submit. |
| `tests/utils/flow-audit.ts` | Wait until the invoice reaches the expected status and attach an audit. |
| `tests/utils/invoice-submit-flows.ts` | Capture and assert Submit/Update parent-flow evidence. Wait defaults: flow 30s, invoice status up to 180s, family 30s, child grace 15s. Override with `FLOW_WAIT_MS`, `INVOICE_WAIT_MS`, `FAMILY_WAIT_MS`, `FAMILY_CHILD_GRACE_MS`. |

Dataverse token capture listens for the signed-in app's own requests to `crm8.dynamics.com` that carry `Authorization: Bearer`. The token is the active persona's token. Admin queries are org-wide. PM queries are limited to projects where that user is Submitter, Reviewer, or Approver.

---

## 11. Current test catalog

Counts below are Playwright `test()` cases in the repository on the status date. A title that lists two IDs (for example `CI-015 CI-016 CI-017`) is one test. Some cases call `test.skip` when the target environment has no matching partner, contract, product, or invoice row. A skip is a missing-data result, not a product failure.

### 11.1 Smoke — 1 test

File: `tests/smoke.spec.ts`

| Test | What it checks |
|---|---|
| lands on invoice app already logged in | Opens the environment app URL and expects the text Invoice Application within 20 seconds. |

This test reads the host page. It does not enter the Canvas iframe. It is the first proof that Node, Chromium, the URL, and the session file work.

### 11.2 Dashboard — 16 tests

File: `tests/dashboard-screen.spec.ts`  
Describe: `Dashboard Screen`  
Plan: `specs/dashboard-screen-plan.md`

These tests are shared. The same titles run as Admin and as PM. Counts differ because the Dataverse filter follows the persona.

| ID | What it checks |
|---|---|
| TC-DB-01 | Dashboard header and navigation are visible |
| TC-DB-02 | All four summary cards are visible |
| TC-DB-03 | Invoice Tasks has all 9 rows and action buttons |
| TC-DB-04 | Region dropdown shows all 8 regions |
| TC-DB-05 | Region filter can be applied |
| TC-DB-06 | Create Invoice opens the New Invoice screen |
| TC-DB-07 | Invoice Overview navigation from Dashboard |
| TC-DV-01 | Draft count matches Dataverse |
| TC-DV-02 | Submitted count matches Dataverse (adhoc and non-adhoc) |
| TC-DV-03 | Reviewed count matches Dataverse |
| TC-DV-04 | Approved count matches Dataverse |
| TC-DV-05 | Flagged count matches Dataverse |
| TC-DV-06 | Failed count matches Dataverse (five Fail-* statuses, unreported only) |
| TC-DV-07 | Cancelled count matches Dataverse |
| TC-DV-08 | Sent count matches Dataverse |
| TC-DV-09 | Total Tasks count matches Dataverse |

Summary-card numbers are checked for visibility. Numeric parity of Total Invoices, Total Partners, Total Project, and Total Revenue against Dataverse is not a current assertion. Task-row counts are the Dataverse parity checks.

### 11.3 Create Invoice — 62 tests

File: `tests/create-invoice-screen.spec.ts`  
Describe: `Create Invoice Screen`  
Plan: `specs/create-invoice-screen-plan.md`

**Form load, defaults, and toggles**

| ID | Persona | What it checks |
|---|---|---|
| CI-001 | Shared | New Invoice form loads with expected controls |
| CI-002 | Shared | Brand New empty form keeps calendar-month date defaults |
| CI-015 CI-016 CI-017 | Shared | Date fields default to calendar month bounds |
| CI-043 | Shared | PO Number is disabled on create |
| CI-007 | Shared | Send Instantly toggles on and off |
| CI-004 | Admin | Adhoc Invoice toggle switches to Yes |
| CI-011b | PM | Adhoc Invoice is not shown |
| CI-004b | Admin | Adhoc ON forces Brand New |
| TC-CI-02 | Shared | Default field states match product rules |
| TC-CI-10 | Shared | Brand New versus Start with last invoice while Adhoc is off |
| TC-CI-34 | Shared | Internal Notes accepts text |

**Contracts and dates**

| ID | Persona | What it checks |
|---|---|---|
| CI-003 | Shared | Start with last invoice prefills line items, not dates or invoice number. Skips without a token, a prior invoice, or partner options. |
| TC-CI-13 | Shared | Start with last invoice shows the no-previous-invoice toast when that project has none |
| CI-009 | Shared | Active contract is applied for the selected project |
| CI-008 | Shared | No active contract shows a toast and keeps Save Draft and Submit disabled |
| CI-010 | Shared | Contract picker lists only Active contracts |
| CI-014 | Shared | Multiple Active contracts require the user to pick one |
| CI-011 | Shared | Invoice Date outside the covering contract disables both buttons |
| CI-012 | Shared | Service End outside the covering contract disables both buttons |
| CI-013 | Shared | Contract warning clears when dates are brought back in range |
| CI-018 | Shared | Service Start must be before Service End |
| CI-019 | Shared | Invoice Date follows Service End Date |
| CI-005 | Admin | Adhoc ON allows an Invoice Date past three months when the contract covers it |
| CI-006 | PM | Non-adhoc PM is restricted to three months in the future |
| CI-020 | PM | Future date shows a red banner when it exceeds the three-month limit |
| CI-021 | PM | No red banner for dates inside the three-month limit |
| CI-052 | Shared | Non-adhoc Save Draft is disabled past the three-month limit |
| CI-073 | Shared | Custom service dates survive Partner selection |
| CI-074 | Shared | Browser refresh clears an unsaved form back to defaults |

**Partner, project, and line items**

| ID | Persona | What it checks |
|---|---|---|
| CI-022 | Shared | Partner is required |
| CI-023 | Shared | Project list filters by the selected Partner |
| TC-CI-20 | Shared | Partner dropdown opens with options |
| CI-024 | Shared | Partner junk search after a valid form disables both buttons |
| CI-025 | Shared | Project junk search after a valid form disables both buttons |
| CI-026 | Shared | Product junk search after a valid form disables both buttons |
| CI-027 | Shared | At least one complete line item is required |
| CI-028 CI-029 | Shared | Add new item appends a blank row and does not copy the previous product |
| CI-030 | Shared | Preset-rate product fills Rate immediately |
| TC-CI-32 | Shared | Non-Editable Rate product locks the Rate field |
| CI-031 CI-048 | Shared | Quantity or rate of zero blocks submit |
| CI-032 | Shared | Line total equals Quantity times Rate |
| CI-034 | Shared | Deleting a line item removes only that row |
| CI-035 CI-036 | Shared | Empty or incomplete line item blocks submit |
| CI-038 | Shared | Rate accepts at most four decimal places |
| CI-033 | Shared | Discount line item shows a negative total |
| CI-059 | Admin | Adhoc zero amount cannot be submitted |

**Tax (North America)**

| ID | Persona | What it checks |
|---|---|---|
| CI-039 | Shared | Tax is optional for NA invoices |
| CI-040 CI-041 | Shared | Selecting tax shows Subtotal, Sales Tax, and Grand Total |
| CI-040b | Shared | Tax control is absent for non-NA projects |

**Draft, close, submit, and flows**

| ID | Persona | What it checks |
|---|---|---|
| CI-046 CI-047 | Shared | Duplicate Project popup for the same project in the same month |
| CI-049 | Shared | Submit enables when all validations pass |
| CI-050 | Shared | Save Draft saves as Draft and returns to Overview |
| CI-051 | Admin | Adhoc Save Draft allows future dates inside the contract |
| CI-064 | Shared | Close returns without saving |
| CI-062 CI-063 | Shared | Edit an existing Draft and Save Draft updates the same record |
| CI-057 | Shared | Flagged invoice can be edited and resubmitted |
| CI-075 | Shared | Overview gallery shows the invoice after Submit |
| TC-CI-50 | Shared | Create and Submit a non-adhoc invoice for an eligible project |
| TC-CI-60 | Admin | Create and Submit an adhoc invoice |
| TC-CI-42 | Admin | Create and Submit an adhoc NA invoice with tax selected |
| TC-CIF-01 | Admin | Submit NA invoice and track the Create Invoice - NA Region family |
| TC-CIF-02 | Admin | Submit non-NA invoice and track the Create Invoice - Other Region family |

### 11.4 Invoice Overview — 42 tests

File: `tests/invoice-overview-screen.spec.ts`  
Describe: `Invoice Overview Screen`  
Plan: `specs/invoice-overview-screen-plan.md`

**Layout, scope, and filters**

| ID | Persona | What it checks |
|---|---|---|
| TC-IO-01 | Shared | Screen layout loads with expected controls |
| TC-IO-02 | Admin | Admin can switch My Invoices / All Invoices |
| TC-IO-02b | PM | PM does not see My / All radios |
| TC-IO-03 | Shared | Show Invoices period filter |
| TC-IO-04 | Shared | Region filter |
| TC-IO-05 | Shared | Search filters the invoice list |
| TC-IO-06 | Shared | Status drives the correct Next Step action |
| TC-IO-07 | Shared | Pagination navigates between pages |
| TC-IO-08 | Shared | Create Invoice from Overview opens New Invoice |
| TC-IO-27 | Shared | Refresh control is present |
| IO-004 | Shared | Quarter to Date can be applied |
| IO-005 | Shared | Last Quarter can be applied |
| IO-006 | Shared | Year to Date can be applied |
| IO-007 | Shared | Last Year can be applied |
| IO-008 | Shared | Future Months shows invoices after the 5th of next month |
| IO-009 | Shared | A future-month invoice does not appear in This Month |
| IO-010 | Shared | Region filter North America |
| IO-011 | Shared | Blank region shows all regions |
| IO-013 | Shared | Search by partner name |
| IO-014 | Shared | Search by project name |

**Sort, column filter, PDF, draft delete**

| ID | Persona | What it checks |
|---|---|---|
| IO-016 | Shared | Partner column sorts ascending then descending |
| IO-017 | Shared | Project column sorts |
| IO-018 | Shared | Invoice # column sorts |
| IO-019 | Shared | Status column sorts |
| IO-020 | Shared | Partner column filter works |
| IO-021 | Shared | Status column filter works |
| IO-022 | Shared | Action Pending With filter works |
| IO-042 | Shared | Column sort arrows and funnel filters still work |
| TC-IO-20 | Shared | Review opens View Invoice with PDF and actions |
| IO-029 | Shared | PDF viewer shows navigation and zoom |
| IO-030 | Shared | Download in the PDF viewer saves the PDF |
| IO-032b | Shared | Three-dot menu shows Delete Draft for Draft invoices |
| IO-033 | Shared | Delete Draft removes the draft with no confirmation popup |
| IO-034 | Shared | Delete Draft removes the invoice immediately |
| IO-041 | Admin | PDF Rate and Amount show at most two decimal places |

**Lifecycle actions (Admin)**

| ID | Persona | What it checks |
|---|---|---|
| IO-035 | Admin | Cancel Invoice option on an Approved row menu |
| IO-036 | Admin | Cancelling an Approved invoice requires comments |
| IO-037 | Admin | Reviewer can Mark as Reviewed on a Submitted invoice |
| IO-038 | Admin | Approver can approve a Reviewed invoice |
| IO-039 | Admin | Reviewer can flag a Submitted invoice |
| IO-040 | Admin | Approver can flag a Reviewed invoice |
| TC-IO-FLOW-01 | Admin | Lists Overview lifecycle flows and recent runs. It does not start those flows. |

Lifecycle cases need a row already in the right status (Submitted, Reviewed, Approved, or Draft). If that row is absent, the test skips.

### 11.5 How the lifecycle is covered across files

There is no single test that walks one invoice from Create through Send in one script. The path is covered as separate cases that create or reuse data:

1. Create Invoice submits a new invoice and checks Overview plus the Create/Update flow family.
2. Overview Review marks Submitted as Reviewed.
3. Overview Approve marks Reviewed as Approved.
4. Overview Flag sends Submitted or Reviewed back to Flagged.
5. Create Invoice edits a Flagged invoice and resubmits it.
6. Overview Cancel on Approved requires comments.
7. Draft save, edit, and delete are covered on Create Invoice and Overview.

Send Instantly is covered as a Create Invoice toggle (CI-007) and as named flows in the catalog (`Notify for Immediate send Invoices`, `Send instant Invoices to Client`). A dedicated UI case that sends an Approved invoice to the client and asserts status Sent is not in the current catalog.

---

## 12. Locator and assertion standards

These rules are how the suite stays stable on Canvas.

1. Canvas controls are located only through `page.frameLocator('iframe[name="fullscreen-app-host"]')`.
2. Prefer `getByRole`, `getByText`, and placeholders. `getByLabel` does not work on this app. Auto-generated appmagic CSS ids are not used.
3. Controls are absolutely positioned siblings. A label's parent is not a reliable scope.
4. Match the live label, including **Quater**.
5. Dynamic counts use a pattern such as `/\d+\s*Drafts/`. A test does not expect a fixed draft total.
6. `expect.soft` is used for structure (is the control visible). A hard `expect` is used for navigation and for values that must match.
7. After navigation, tests wait for real data (a row or a count), not for `networkidle`.
8. `waitForTimeout` is limited to the Dashboard task-count helper.
9. Host consent is dismissed with **Allow** via `dismissHostDialogs` after open.
10. Specs contain no login steps.
11. Evidence screenshots use `markAndShot` / `markGroupAndShot` / `shot`, wrapped in `test.step`. Element-only screenshots are not used for evidence because they crop away the screen.

Create Invoice control patterns used by the helpers:

- Mode radios: text **Brand New** and **Start with last invoice**.
- Toggles: click **Adhoc Invoice** or **Send Instantly**, then read nearby Yes / No.
- Combos: placeholder **Find Partner**, **Find Project**, **Find items**, then `option` role.
- Delete row: image role whose name matches delete.
- Dates: visible as month/day/year.

---

## 13. Local setup

### 13.1 Prerequisites

| Requirement | Notes |
|---|---|
| Windows 10 or 11 | Current authoring machines |
| Git | Clone the tests repo |
| Node.js 20.x | Pipeline uses Node 20. Local LTS 20 or 22 is suitable. |
| Cursor | Used when planning, generating, or healing tests |
| Microsoft account | Admin account and PM account, with MFA |
| Network | `apps.powerapps.com` and `*.crm8.dynamics.com` |

Access required before the first run:

1. Invoice Canvas in the target environment.
2. Admin account: BDU plus a Security Roles row `role = admin`.
3. PM account: Invoice application basic user 2.0, with no admin row.
4. Partners, projects, and active contracts in that Dataverse org. Create Invoice and many Overview cases skip when this seed is missing.
5. Clone access to this tests repository.

### 13.2 Install

```powershell
cd C:\Invoice-App-Automation
npm ci
npx playwright install chromium
```

On a locked-down laptop:

```powershell
npx playwright install --with-deps chromium
```

### 13.3 Capture a session

Create the environment folder, open the **stable play URL for that environment** from `config/env.ts`, sign in, complete MFA, click **Allow** if the consent dialog appears, wait until Dashboard is visible, then close the browser. Closing the window writes the file.

DEV Admin example:

```powershell
New-Item -ItemType Directory -Force -Path auth\dev
npx playwright open --save-storage=auth/dev/admin.json "<DEV_APP_URL from config/env.ts>"
```

DEV PM:

```powershell
npx playwright open --save-storage=auth/dev/pm.json "<DEV_APP_URL from config/env.ts>"
```

SIT, QA, and UAT use the same commands with `auth\sit`, `auth\qa`, or `auth\uat`, and that environment's play URL. Do not nest an extra `auth` folder under the environment folder.

Recapture a session when tests land on a Microsoft login page, Dataverse returns 401, or conditional access rotates the session. Sessions last days to weeks depending on tenant policy. Auth files stay on the machine. They are listed in `.gitignore` and must not be committed.

### 13.4 Prove the machine

```powershell
npx playwright test tests/smoke.spec.ts --project=chromium-admin
npx playwright show-report
```

A green smoke test means the Admin session, Chromium, and the app URL work. The browser is visible on a local run.

---

## 14. Local execution

Set `ENV` in PowerShell before the Playwright command. If `ENV` is omitted, the run targets DEV.

```powershell
# DEV Admin — one suite
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin

# DEV PM
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-pm

# SIT Admin, Create Invoice
$env:ENV="sit"
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin

# QA Admin and PM, Overview
$env:ENV="qa"
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-admin
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-pm

# One case
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin --grep "TC-CI-50"
```

npm scripts in `package.json`:

| Script | Command |
|---|---|
| `npm test` | `playwright test` (all projects — prefer an explicit project) |
| `npm run test:smoke` | Smoke, default project selection |
| `npm run test:ci:smoke` | Smoke on `chromium-admin` |
| `npm run test:dashboard` | Dashboard on `chromium-admin` |
| `npm run test:create-invoice` | Create Invoice on `chromium-admin` |
| `npm run test:overview` | Overview on `chromium-admin` |
| `npm run test:admin` | All tests on `chromium-admin` |
| `npm run test:pm` | All tests on `chromium-pm` |
| `npm run report` | Open the Playwright HTML report |
| `npm run report:allure` | Generate Allure HTML from `allure-results` |

`ENV` still applies when using npm scripts. Example:

```powershell
$env:ENV="uat"
npm run test:smoke
```

---

## 15. Azure DevOps execution

The suite does not run on git push or on pull requests. Both YAML files set `trigger: none` and `pr: none`.

After ApplicationComponents is deployed to an environment and post-deploy is finished, start the test pipeline by hand.

Company tests repo name: **InvoiceAppAutomation**. App deploy remains in **ApplicationComponents**.

### 15.1 Parameterized pipeline — `azure-pipelines.yml`

Comment in the file: Pipelines → Invoice-E2E → Run pipeline.

| Parameter | Default | Allowed values |
|---|---|---|
| Environment (`targetEnv`) | dev | dev, qa, sit, uat |
| Tests to run (`testSuite`) | smoke | smoke, dashboard, overview, create-invoice, all-main |
| Single-case filter (`testGrep`) | none | A Playwright `--grep` string. `none` runs the whole selected suite. |
| Also run as PM (`runPm`) | false | true requires secure file `auth-<env>-pm.json` |

`all-main` runs Dashboard, Invoice Overview, and Create Invoice. It does not add the smoke file on top of those suites.

Runtime:

| Item | Value |
|---|---|
| Agent | `ubuntu-latest` |
| Job timeout | 180 minutes |
| Node | 20.x |
| Variable group | `invoice-e2e-<targetEnv>` (for example `invoice-e2e-dev`) |
| Environment variables passed to Playwright | `ENV` and `CI` from that variable group |
| Retries | 0 (overrides the local retry of 1) |
| Browser | Chromium, installed with system dependencies, headless because `CI` is set |

Auth placement:

1. Download secure file `auth-<env>-admin.json`.
2. Copy it to `auth/<env>/admin.json` in the job.
3. If **Also run as PM** is true, download `auth-<env>-pm.json` and copy it to `auth/<env>/pm.json`.

Secure files are uploaded in Azure DevOps Library. They are the same JSON produced by `npx playwright open --save-storage`. Refresh them when the session expires. Do not commit them.

The Admin suite always runs. The PM suite runs only when the parameter is true, against the same files and grep.

### 15.2 DEV smoke pipeline — `Invoice-E2E.yml`

This second definition is narrower:

- Variable group `invoice-e2e-dev`
- Secure file `auth-dev-admin.json` only
- Runs `npm run test:ci:smoke` (Admin smoke)
- Publishes JUnit, Allure, and the Playwright HTML report
- No environment picker, no suite picker, no PM switch

Use the parameterized pipeline when the run is a full screen, another environment, a single case, or a PM pass.

### 15.3 What the pipeline publishes

Published even when tests fail (`condition: always()`):

| Artifact or tab | How to read it |
|---|---|
| Tests tab | JUnit from `test-results/junit.xml`. One row per test. Run title includes environment and suite. |
| `allure-report` | Download `index.html` and open it in a browser. It is a single file, so screenshots are inside it. |
| `playwright-html-report` | Download the whole artifact, unzip, then locally run `npx playwright show-report playwright-report`. Opening `index.html` by itself does not load the report assets. |
| `playwright-test-results` | Screenshots, videos, and traces. Open a failed `trace.zip` at https://trace.playwright.dev |

The pipeline also writes a short “How to read this run” note onto the Azure DevOps summary.

---

## 16. How to add or repair a test

Human review sits between the plan and the generated code. The live browser step is required. Guessed Canvas locators are the usual cause of false failures.

### 16.1 Plan

In Cursor Agent chat, with this repo open at the root and the `playwright-test` MCP connected:

```
/plan-tests Create Invoice
```

The planner opens the live app, snapshots the Canvas iframe, and writes a markdown plan under `specs/`. It does not write Playwright code. Read the plan and remove weak scenarios before generation.

MCP note: after navigation, do not wait for the word Dashboard on the top-level page. That text is inside the iframe and the wait can hang. Wait briefly, then snapshot. Iframe refs look like `f1e*`. Snapshot again if a ref is not found.

### 16.2 Generate

One scenario at a time:

```
/generate-test specs/create-invoice-screen-plan.md -> TC-CI-50
```

The generator replays the steps in a live browser, then writes the spec using the project helpers and the iframe locator rule. Generated files start with:

```
// spec: specs/<plan>.md
// seed: tests/seed.spec.ts
```

Team convention is one spec file per screen. New cases are added to the existing screen file rather than a new file per scenario.

### 16.3 Heal

```
/heal-tests tests/create-invoice-screen.spec.ts
```

The healer runs the test, reads the snapshot, console, and network, fixes the locator or assertion, and reruns. `test.fixme` is a last resort and needs a comment that states what was observed.

### 16.4 Cursor assets that drive authoring

| Asset | Role |
|---|---|
| `.cursor/rules/00-project-overview.mdc` | Apps, environments, entry |
| `.cursor/rules/10-canvas-app-conventions.mdc` | Iframe locators and host dialogs |
| `.cursor/rules/20-dataverse.mdc` | Schema, billing filter, token capture |
| `.cursor/rules/30-roles-and-security.mdc` | Admin and PM |
| `.cursor/rules/40-test-conventions.mdc` | Spec style and helpers |
| `.cursor/rules/50-app-functionality.mdc` | Screens, lifecycle, billing |
| `.cursor/skills/playwright-test-planner` | Plan workflow |
| `.cursor/skills/playwright-test-generator` | Generate workflow |
| `.cursor/skills/playwright-test-healer` | Heal workflow |
| `.cursor/skills/capture-role-auth` | Session capture per persona and environment |
| `.cursor/mcp.json` | Starts `npx playwright run-test-mcp-server` |

MCP server entry:

```json
{
  "mcpServers": {
    "playwright-test": {
      "command": "cmd",
      "args": ["/c", "npx", "playwright", "run-test-mcp-server"]
    }
  }
}
```

Enable it in Cursor Settings → MCP. If it fails to connect, run `npm ci` and `npx playwright install chromium`, then restart Cursor.

---

## 17. Data the suite expects in each environment

Fixtures query the target org at runtime. Minimum useful seed:

| Data | Why tests need it |
|---|---|
| At least one partner with projects visible to the persona | Partner and project cases. PM only sees mail-list projects. |
| An active contract whose dates cover the service period | Submit, draft, and contract-warning cases |
| A project with no active contract | CI-008 |
| A project with two or more active covering contracts | CI-010 and CI-014 |
| Editable-rate, non-editable-rate, and discount products | Line-item and lock-rate cases |
| A North America project and a non-NA project | Tax visibility and TC-CIF-01 / TC-CIF-02 |
| A project that already has a non-adhoc invoice in the current duplicate window | Duplicate popup |
| A project with no invoice in the last-month prefill window | No-previous-invoice toast |
| Overview rows in Draft, Submitted, Reviewed, and Approved | Menu, review, approve, flag, cancel, and PDF cases |

When the row or product is missing, the affected test skips with a reason such as `No eligible project` or `No Submitted invoice with Review on Overview`. Provision the seed in that environment and rerun. Do not point the test at another environment's GUID.

---

## 18. Failure handling

| Symptom | What to do |
|---|---|
| Microsoft sign-in page, or `SessionExpiredError` | Recapture `auth/<env>/admin.json` or `pm.json` for the environment you ran. In Azure DevOps, replace the matching secure file. |
| Smoke cannot find Invoice Application | Confirm `ENV`, the play URL, VPN, and that consent was allowed during capture. |
| File not found for storageState | The path must be `auth/<env>/<persona>.json`. The pipeline copies the secure file to that path. |
| Canvas control not found | Confirm the locator is inside `fullscreen-app-host`. Heal against the live screen. Do not switch to appmagic ids. |
| Consent dialog blocks the UI | The open helpers call `dismissHostDialogs`. The click must be **Allow**. |
| Dataverse count mismatch on Dashboard | Confirm the Bearer token is from the same persona, the billing window is 6th through 5th, and Failed includes only unreported `Fail-*` rows. |
| Create Invoice skip | Read the skip reason. Add the missing partner, contract, or product in that org. |
| Overview lifecycle skip | The gallery has no row in the required status for that persona and period. |
| Flow assertion timeout | Parent flow did not reach a success status inside the wait (default invoice wait 180 seconds). Check the flow run in Power Automate and the attached flow report. |
| Duplicate popup when a brand-new submit was expected | That project already has a non-adhoc invoice in the billing window. The fixture should pick a clear project; if every project is used, create another contract-backed project. |
| Clipped Overview menu | Viewport must stay 1920 × 1080. |
| Pipeline red on auth download | The Library secure file name must match `auth-<env>-admin.json` (and `auth-<env>-pm.json` when PM is selected). The variable group `invoice-e2e-<env>` must exist and supply `ENV` and `CI`. |

---

## 19. Secrets and files that stay local

Never commit:

- `auth/` and `auth.json`
- Passwords, client secrets, or raw Bearer tokens
- `node_modules/`
- `test-results/`, `playwright-report/`, `allure-results/`, `allure-report/`
- Probe logs and screenshots at the repo root or under `test-log-details/` (except `.gitkeep`)

Pipeline auth is an Azure DevOps secure file, downloaded only for that job.

---

## 20. Command card

```powershell
cd C:\Invoice-App-Automation
npm ci
npx playwright install chromium

New-Item -ItemType Directory -Force -Path auth\dev
npx playwright open --save-storage=auth/dev/admin.json "<APP_URL>"
npx playwright open --save-storage=auth/dev/pm.json "<APP_URL>"

npx playwright test tests/smoke.spec.ts --project=chromium-admin
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-admin

$env:ENV="sit"
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-pm

npx playwright show-report
```

Cursor chat:

```
/plan-tests Invoice Overview
/generate-test specs/invoice-overview-screen-plan.md -> TC-IO-01
/heal-tests tests/invoice-overview-screen.spec.ts
```

Azure DevOps: open the manual pipeline, choose Environment and Tests to run, leave the single-case filter as `none` unless one ID is required, and turn on PM only when that environment's PM secure file is current.

---

## 21. Related documents in this repository

| Document | Use |
|---|---|
| `README.md` | Short entry point |
| `AGENTS.md` | Orientation for people and for the AI authoring workflow |
| `specs/automation-setup.md` | Longer laptop and Cursor setup. Prefer this document for current auth paths (`auth/<env>/`). |
| `specs/phase2.md` | Original multi-environment and Create Invoice deployment story |
| `specs/cursor-roadmap.md` | Later items: finish multi-env proof on every org, optional Azure Playwright Workspaces |
| `specs/dashboard-screen-plan.md` | Dashboard scenario plan |
| `specs/create-invoice-screen-plan.md` | Create Invoice scenario plan |
| `specs/invoice-overview-screen-plan.md` | Overview scenario plan |
| `specs/invoice-flows.md` | Exact flow catalog names |
| `specs/dataverse-schema.md` | Field snapshot |
| `.cursor/rules/*.mdc` | Rules enforced while tests are written |

---

*This document describes the Invoice Canvas Playwright automation in the tests repository as of 23 September 2026: four screen specs, two personas, four non-production environments, local headed runs, and a manual Azure DevOps pipeline that publishes JUnit, Allure, and Playwright results.*

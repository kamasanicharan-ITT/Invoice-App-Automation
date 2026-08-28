# Phase 2 — Multi-Environment Readiness & Create Invoice Deployment Suite

Use the **Title**, **Description**, and **Acceptance Criteria** sections below for Azure DevOps.
Copy each section into the matching ADO user story fields.

---

## User Story Title

**Phase 2: Multi-environment automation readiness (SIT/QA/UAT) and deployment-ready Create Invoice test suite**

---

## Description

### Overview

This user story covers **Phase 2** of Invoice Canvas (Synergy) Playwright automation.

Phase 1 delivered the DEV-targeted foundation: Playwright + TypeScript infrastructure, Cursor AI authoring workflow, role-based auth scaffolding (Admin / PM), and core suites for Dashboard, Create Invoice, and Invoice Overview (Admin-focused), plus Dataverse-backed Dashboard count validation.

Phase 2 has two linked goals:

1. **Make the existing automation environment-portable and production-quality for non-prod** — parameterize DEV / SIT / QA / UAT (never Production), capture per-environment auth, stabilize Phase 1 suites so they run cleanly outside DEV, and prove execution at least on **SIT and QA**.
2. **Compose and harden Create Invoice test cases into a deployment-ready suite** — complete, clear, role-aware, data-safe, and runnable in SIT/QA (and prepared for UAT) without DEV-only hardcoding.

Phase 2 is the bridge between “works on DEV for the author” and “can be trusted as shared automation across Synergy non-prod environments.”

---



### Business / Delivery Value

- Same regression suite can validate Invoice Canvas behavior across **SIT and QA** (and be ready for UAT) without rewriting tests per environment.
- Create Invoice coverage becomes the first **deployment-ready** functional suite — usable as a quality gate before / after environment deployments.
- Reduces risk of environment-specific breakage (URLs, Dataverse orgs, auth sessions, partner/project seed data) being discovered only manually.
- Keeps Production out of scope by design (hard fail if `ENV=prod`).

---



### Phase 1 Baseline (context — already done)

Do not re-deliver Phase 1 work. Phase 2 builds on:


| Area                                                 | Phase 1 status                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Playwright + TypeScript project                      | Done (Chromium, headed, retries, HTML report, screenshots/video/trace) |
| storageState auth (no login in specs)                | Done for DEV (`auth/admin.json`, `auth/pm.json`)                       |
| Role projects (`chromium-admin`, `chromium-pm`)      | Done                                                                   |
| Cursor rules / skills / commands / MCP               | Done                                                                   |
| Smoke                                                | Done                                                                   |
| Dashboard UI + Dataverse count validation            | Done (persona-aware)                                                   |
| Create Invoice suite (Admin-focused)                 | Done on DEV (~20 tests)                                                |
| Invoice Overview suite (Admin UI)                    | Done on DEV (8 tests)                                                  |
| Multi-env (`ENV` / per-env auth / env map)           | **Not started**                                                        |
| Create Invoice deployment-ready / PM matrix complete | **Partial — needs Phase 2**                                            |
| ADO CI pipeline                                      | Deferred (may be Phase 3; not a Phase 2 gate unless pulled forward)    |


Reference: roadmap notes in `specs/cursor-roadmap.md`. Setup: `specs/automation-setup.md`.

---



### Phase 2 Scope



#### Workstream A — Multi-environment enablement

Implement configuration so the suite targets any non-prod environment via a single switch (e.g. `ENV=dev|sit|qa|uat`).

**In scope**

- Central env map (e.g. `config/env.ts` or equivalent) resolving:
  - `APP_URL` (Invoice Canvas play URL per env)
  - `DATAVERSE_URL` (org URL per env)
  - `TENANT_ID` (if shared or per-env as required)
  - Auth storage paths: `auth/<env>/admin.json`, `auth/<env>/pm.json` (and `bdu.json` if used)
- Remove / replace hardcoded DEV URLs and org endpoints from specs and helpers so tests read config, not literals.
- Document capture steps per environment (headed Playwright open + save-storage).
- Fail fast if `ENV=prod` (or any production URL) is requested.
- Default behavior: if `ENV` unset, behave as today (`dev`) for local developer continuity.
- Capture and validate auth sessions for **at least SIT and QA** (Admin + PM where role tests apply).
- Run and stabilize Phase 1 core suites on **SIT and QA**:
  - Smoke
  - Dashboard (Admin; PM where auth + data allow)
  - Create Invoice (as matured under Workstream B)
  - Invoice Overview (smoke-level / existing Admin suite stability — full Overview expansion is not the Phase 2 centerpiece)
- Document environment prerequisites: test accounts, Security Roles admin row, sample partners/projects/contracts, known data differences between DEV and SIT/QA.
- Document known env deltas (billing cycle data volume, missing seed partners, region availability) and skip/fixture strategy so suites fail for real product bugs, not missing seed data.

**Out of scope for Workstream A (unless explicitly pulled into this story)**

- Azure DevOps pipeline (`azure-pipelines.yml`) as a hard gate — recommended follow-on; design should not block CI later.
- Service Principal / non-interactive auth.
- Production execution.
- Email notification or PDF download automation.



#### Workstream B — Stabilize Phase 1 suites for multi-env clarity

Before expanding Create Invoice, ensure the foundation is clear and reliable:

- Inventory Phase 1 tests: which are DEV-only assumptions vs portable.
- Fix flaky waits, brittle locators, and any remaining hardcoded counts or org URLs.
- Ensure helpers (Dataverse fixtures, billing-cycle dates, host dialogs, screenshots) are env-aware where needed.
- Confirm Dashboard Dataverse validation still matches Canvas billing rules (6th → 5th cycle) in SIT/QA.
- Confirm role model still holds: Admin = Security Roles table elevation; PM = Basic User without admin row.
- Produce a short “how to run per env” runbook section (commands + auth capture) suitable for ADO / wiki paste.



#### Workstream C — Create Invoice: deployment-ready test composition

Compose Create Invoice automation into a **clear, complete, environment-portable** suite suitable for SIT/QA (and UAT-ready).

**Goals**

- Align implemented tests to `specs/create-invoice-screen-plan.md` (source of truth).
- Make Admin vs PM behavior explicit and passing:
  - **Admin:** Adhoc visible; Adhoc create/submit; NA tax paths as applicable
  - **PM:** Adhoc hidden; shared non-adhoc create/duplicate; no admin-only cases
- Cover the deployment-critical Create Invoice behaviors:
  - Form load / defaults / radios / toggles
  - Partner → Project cascade
  - Line items (add/delete, Qty × Rate, locked vs editable rates)
  - Validation (Partner/Project required; Submit disabled until ready)
  - Save Draft / Close
  - Non-adhoc Submit happy path
  - Duplicate Project restriction (second non-adhoc in billing window)
  - Adhoc Submit (Admin only)
  - North America tax visibility / total behavior where seed data exists
- Use Dataverse fixtures that resolve partners/projects/contracts **in the target environment** (not DEV-only GUIDs or names assumed to exist everywhere).
- Tag or structure tests so teams can run:
  - Full Create Invoice suite
  - Smoke / critical path subset suitable for post-deploy checks
- Evidence: HTML report + screenshots; TC-ID naming retained (`TC-CI-*`).
- Update the Create Invoice test plan to mark Phase 2 / multi-env readiness status.

**Explicitly deferred beyond Phase 2 Create Invoice composition**

- Full Review → Approve → Send → Flag lifecycle deep suites (post-Submit workflow automation as a dedicated phase).
- Summary card KPI number parity vs Dataverse.
- Multi-contract exotic edge cases not already in the Create Invoice plan.
- ADO pipeline wiring (unless pulled forward).

---



### Environments


| Environment | Phase 2 expectation                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV         | Continue as primary authoring / debug target; remains default when `ENV` unset                                                                                          |
| SIT         | **Must** run and pass agreed Phase 2 gate suites                                                                                                                        |
| QA          | **Must** run and pass agreed Phase 2 gate suites                                                                                                                        |
| UAT         | Configuration + auth path prepared; full gate run preferred if accounts/data available; not a hard blocker if SIT+QA green and UAT blocked only by account provisioning |
| Production  | **Never** — fail fast                                                                                                                                                   |


---



### Personas (unchanged model; per-env sessions)


| Persona   | Power Apps role                    | Security Roles table | storageState (per env)  | Create Invoice expectations           |
| --------- | ---------------------------------- | -------------------- | ----------------------- | ------------------------------------- |
| PM        | Invoice application basic user 2.0 | Not present          | `auth/<env>/pm.json`    | No Adhoc; non-adhoc + duplicate rules |
| BDU/Admin | BDU + admin row                    | `role = admin`       | `auth/<env>/admin.json` | Adhoc + full Admin create paths       |


---



### Success Definition

Phase 2 is complete when:

1. Switching `ENV` to `sit` or `qa` runs the automation against that environment’s app and Dataverse without code edits.
2. Auth for Admin (and PM for role cases) exists for SIT and QA and is documented (never committed).
3. Phase 1 core suites are stabilized and no longer DEV-URL-bound.
4. Create Invoice suite is composed, role-aware, plan-aligned, and demonstrated green (or acceptably skipped only for missing seed data) on **SIT and QA**.
5. Runbook exists so another engineer can capture auth and execute the same suites in those environments.

---



### Dependencies / Risks


| Risk                                                | Mitigation                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SIT/QA lack Admin or PM test accounts               | Provision accounts + Security Roles admin row before gate runs                                        |
| Seed partners/projects/contracts differ per env     | Env-aware fixtures; skip with clear reason when data missing; document minimum seed set               |
| Auth MFA / session expiry                           | Document refresh procedure; keep auth gitignored; plan for later SPN/ADO secure files                 |
| Canvas UI differences between envs (version skew)   | Heal locators; treat env skew as a finding; do not hardcode appmagic IDs                              |
| Billing cycle / calendar date edge cases (days 1–5) | Keep existing billing helpers; validate behavior on SIT/QA around cycle boundaries if runs land there |


---



### Out of Scope (Phase 2)

- Production testing
- ADO CI/CD pipeline as mandatory deliverable (design-compatible only)
- Service Principal authentication
- Email / PDF automation
- Full post-Submit lifecycle suites (Review / Approve / Send / Flag) as Phase 2 gate
- Expanding Invoice Overview beyond stabilization of the existing Admin suite
- Changing product behavior in the Canvas app (automation only)

---



## Acceptance Criteria



### A. Multi-environment configuration

1. An environment configuration mechanism exists (e.g. `ENV=dev|sit|qa|uat`) that selects `APP_URL`, `DATAVERSE_URL`, and per-env `storageState` paths.
2. Specs and helpers do not hardcode the DEV app URL or DEV Dataverse org URL; they consume the env config.
3. Passing `ENV=prod` (or a production URL) fails immediately with a clear error.
4. When `ENV` is unset, the suite defaults to DEV behavior for local continuity.
5. Per-environment auth layout is documented and used: `auth/<env>/admin.json` and `auth/<env>/pm.json` (gitignored; never committed).
6. Auth capture steps for SIT and QA are documented (headed Playwright save-storage against the correct app URL).



### B. Environment execution proof (minimum gate)

1. Smoke test passes on **SIT** and **QA** using that env’s Admin session.
2. Dashboard suite (Admin) runs successfully on **SIT** and **QA**, including Dataverse count validation against that env’s Dataverse (persona filters preserved).
3. Invoice Overview existing Admin suite is runnable on **SIT** and **QA** (stabilize; no requirement to expand coverage in this story).
4. Create Invoice deployment suite (Workstream C) passes on **SIT** and **QA** under Admin; PM project runs for PM-applicable cases where PM auth and seed data exist.
5. UAT env entries exist in the config map; UAT auth capture is documented. Full UAT green run is completed if accounts/data are available; if blocked only by provisioning, the gap is logged without failing the story when SIT+QA gates are met.



### C. Stabilization & clarity

1. A short Phase 2 runbook exists (in this story’s wiki/ADO notes or `specs/phase2.md` / project docs) covering: how to set `ENV`, capture auth per env, which projects to run (Admin vs PM), and minimum seed-data expectations.
2. Flaky DEV-only assumptions that break on SIT/QA are removed or replaced with env-aware fixtures / conditional skips with explicit reasons.
3. Role model remains documented and enforced: Admin vs PM Create Invoice access (Adhoc visible vs hidden).
4. No production credentials or auth files are committed; `auth/` remains gitignored.



### D. Create Invoice — deployment-ready suite

1. Create Invoice scenarios are composed against `specs/create-invoice-screen-plan.md` with clear TC-IDs (`TC-CI-*`) and persona tags (shared / Admin-only / PM-only).
2. Shared UI and non-adhoc create/submit/duplicate cases are implemented and passing for Admin; PM shared cases pass under `chromium-pm` when PM auth is available.
3. Admin-only Adhoc cases (toggle forces Brand New; Adhoc submit; Adhoc + NA tax where applicable) pass on Admin and are skipped on PM.
4. PM-only case (Adhoc toggle hidden) passes on PM and is skipped on Admin.
5. Dataverse-backed create paths resolve eligible partners/projects/contracts in the **target environment** (no DEV-only hardcoded entity assumptions that break SIT/QA).
6. Validation, Close, line-item math, and Partner→Project cascade coverage remain in the suite and are env-portable.
7. A critical-path / smoke subset of Create Invoice tests is identified for faster post-deploy checks (documented which TC-IDs belong to that subset).
8. Create Invoice test plan is updated to reflect Phase 2 multi-env / deployment-ready status.
9. HTML report + screenshots are produced for SIT and QA Create Invoice runs as evidence for the ADO story.



### E. Explicitly not required to close Phase 2

1. Azure Pipelines YAML and ADO secure-file download are **not** required to close this story (may be Phase 3).
2. Full Review / Approve / Send / Flag lifecycle automation is **not** required.
3. Email, PDF, and Service Principal auth are **not** required.
4. Production execution is **forbidden**, not deferred.

---



## Suggested ADO Fields (optional paste aids)


| Field                | Value                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Title**            | Phase 2: Multi-environment automation readiness (SIT/QA/UAT) and deployment-ready Create Invoice test suite |
| **Area / Iteration** | *(set in ADO)*                                                                                              |
| **Priority**         | *(set in ADO)*                                                                                              |
| **Tags**             | `automation`, `playwright`, `phase-2`, `multi-env`, `create-invoice`, `SIT`, `QA`                           |
| **Related**          | Phase 1 Invoice Canvas Automation user story                                                                |


---



## Implementation Checklist (team working notes — not ADO AC)

Use during delivery; do not paste as Acceptance Criteria unless desired.

### Multi-env

- [ ] Add `config/env.ts` (or equivalent) with DEV / SIT / QA / UAT URLs
- [ ] Wire `playwright.config.ts` to `ENV` + `auth/<env>/…`
- [ ] Prod guard (`ENV=prod` → throw)
- [ ] Remove hardcoded DEV URLs from specs/helpers
- [ ] Capture `auth/sit/admin.json`, `auth/sit/pm.json`
- [ ] Capture `auth/qa/admin.json`, `auth/qa/pm.json`
- [ ] Optional: prepare `auth/uat/…` placeholders + docs
- [ ] Document run commands: `ENV=sit npx playwright test …`



### Stabilize

- [ ] Smoke / Dashboard / Overview green on SIT
- [ ] Smoke / Dashboard / Overview green on QA
- [ ] Fix fixture / seed gaps with documented skips
- [ ] Write runbook section



### Create Invoice deployment suite

- [ ] Align suite to `specs/create-invoice-screen-plan.md`
- [ ] Complete Admin + PM matrix (Adhoc visible/hidden)
- [ ] Env-aware Dataverse fixtures
- [ ] Critical-path subset documented
- [ ] Green evidence on SIT + QA
- [ ] Update Create Invoice plan status for Phase 2



### Example commands (target end state)

```powershell
# DEV (default)
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin

# SIT
$env:ENV="sit"; npx playwright test tests/smoke.spec.ts --project=chromium-admin
$env:ENV="sit"; npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin
$env:ENV="sit"; npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin
$env:ENV="sit"; npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-pm

# QA
$env:ENV="qa"; npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin
$env:ENV="qa"; npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-pm
```

---



## Phase Boundary Summary


| Phase                    | Focus                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 (done)**       | DEV infrastructure, Cursor workflow, Dashboard + Create Invoice + Overview (Admin), Dataverse Dashboard counts, role auth scaffolding |
| **Phase 2 (this story)** | Multi-env config; prove SIT + QA; stabilize suites; compose deployment-ready Create Invoice (Admin + PM)                              |
| **Phase 3+ (later)**     | ADO CI pipeline, SPN auth, full lifecycle (Review/Approve/Send/Flag), email/PDF, Overview/KPI expansions                              |



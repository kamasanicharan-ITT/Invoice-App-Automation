# Invoice App Automation

Playwright end-to-end tests for the **Synergy Invoice Canvas** app (Power Apps). This repo is **tests only**. The Canvas and model-driven apps live in **ApplicationComponents**.

## Setup and run

Full laptop setup, auth capture, and smoke test: [`specs/automation-setup.md`](specs/automation-setup.md).

```powershell
npm ci
npx playwright install chromium
# capture auth/<env>/admin.json and pm.json (gitignored) — see automation-setup.md
npx playwright test tests/smoke.spec.ts --project=chromium-admin
```

Environment: `ENV=dev|sit|qa|uat` (default `dev`). Production is forbidden.

## Layout

| Path | Purpose |
|------|---------|
| `tests/` | Playwright specs (one file per screen, plus smoke) |
| `config/env.ts` | App URL, Dataverse URL, auth paths per env |
| `specs/` | Screen plans and supporting docs (table below) |
| `auth/` | Signed-in sessions — **never commit** |

Screen plans drive Playwright generation. One plan per screen; one spec per screen.

| Plan | Spec |
|------|------|
| `specs/dashboard-screen-plan.md` | `tests/dashboard-screen.spec.ts` |
| `specs/create-invoice-screen-plan.md` | `tests/create-invoice-screen.spec.ts` |
| `specs/invoice-overview-screen-plan.md` | `tests/invoice-overview-screen.spec.ts` |

Other files in `specs/`: `automation-setup.md` (clone/auth/smoke), Excel dumps (`Create_Invoice_Test_Cases.md`, `Invoice_Overview_Test_Cases.md` — traceability only), `dataverse-schema.md`, `invoice-flows.md`, `phase2.md`, `cursor-roadmap.md`. Excel sheets are **not** the source of truth where they disagree with the screen plans or the live app.

## Azure DevOps

Company copy of this repo: **InvoiceAppAutomation**. App deploy stays in **ApplicationComponents**. After an environment is deployed and post-deploy is done, run the test pipeline **manually** (not on every app PR).

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
| `specs/` | Screen **plans** and supporting docs — see [`specs/README.md`](specs/README.md) |
| `auth/` | Signed-in sessions — **never commit** |

## Azure DevOps

Company copy of this repo: **InvoiceAppAutomation**. App deploy stays in **ApplicationComponents**. After an environment is deployed and post-deploy is done, run the test pipeline **manually** (not on every app PR).

# Cursor Automation Roadmap (later phases)

Multi-env scaffolding (`config/env.ts`, per-env auth, prod guard) is in progress under
Phase 2 — see `phase2.md`. Items below remain for later.

## 1. Complete multi-environment proof (Phase 2)

- Fill SIT / QA / UAT `appUrl` + `dataverseUrl` in `config/env.ts` (or env overrides).
- Capture `auth/<env>/admin.json` (you) and `auth/<env>/pm.json` (teammate).
- Prove Smoke → Dashboard → Create Invoice → Overview on **SIT and QA**.
- Seed partners/projects/contracts per env; fixtures discover via Dataverse.

## 2. ADO (Azure DevOps) integration (Phase 3)

Project deploys via Azure DevOps — add `azure-pipelines.yml` with a stage per env.

- Steps: `npm ci` → `npx playwright install --with-deps` → `ENV=<env> npx playwright test`.
- JUnit reporter + `PublishTestResults@2`; publish HTML report as artifact.
- Store per-env auth as **secure files** / variable group; download into `auth/<env>/`.
- Trigger: PR validation on non-prod + scheduled nightly; also triggerable via ADO REST API.

## 3. Optional — Azure Playwright Workspaces

Cloud-hosted browsers + portal reports (`@azure/playwright`). Evaluate after ADO pipeline
works; not required for Phase 2 multi-env gates.

## 4. Optional Cursor extras

- Bugbot, cloud auto-heal, scheduled planner runs — evaluate later.

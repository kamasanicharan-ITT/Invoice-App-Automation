# Cursor Automation Roadmap (later phases)

This captures work that is designed but NOT yet built. The current Cursor setup
(rules, skills, commands, MCP, role-based auth scaffolding) is complete; the items below
extend it toward multi-environment execution and ADO CI.

## 1. Multi-environment support (dev / SIT / QA / UAT — never prod)

Tests must run in every non-prod environment. Prod is excluded.

Approach: parameterize `playwright.config.ts` by `process.env.ENV`.

- One config block per env supplying its `APP_URL`, `DATAVERSE_URL`, and `storageState`.
- Keep a small env map (e.g. `config/env.ts`) resolving `ENV` -> `{ appUrl, dataverseUrl }`.
- Store per-env auth outside git: `auth/<env>/pm.json`, `auth/<env>/bdu.json`,
  `auth/<env>/admin.json` (the `auth/` dir is already git-ignored).
- Move the currently hardcoded dev URLs out of `tests/dashboard.spec.ts` into the env map so
  specs read `APP_URL` / `DATAVERSE_URL` from config.

Run examples:

```bash
ENV=sit npx playwright test --project=chromium-pm
ENV=qa  npx playwright test
```

Guardrail: fail fast if `ENV=prod` is ever passed.

## 2. ADO (Azure DevOps) integration

Project is managed in Azure DevOps. Add an `azure-pipelines.yml` with a stage per env.

- Steps per stage: `npm ci` -> `npx playwright install --with-deps` ->
  `ENV=<env> npx playwright test`.
- Add a JUnit reporter to `playwright.config.ts` and publish results via
  `PublishTestResults@2`; publish the HTML report as a pipeline artifact.
- Store each env's auth states as **secure files** / a **variable group** in ADO Library;
  download them into `auth/<env>/` at runtime. Never commit auth or prod credentials.
- Trigger: PR validation on non-prod + scheduled nightly full run.

## 3. Optional Cursor extras (evaluate later)

- **Bugbot** — automated review of test-code PRs.
- **Background / Cloud agents** — nightly auto-heal of failing tests via the healer skill.
- **Automations** — schedule planner runs to keep `specs/` coverage current.
- **Custom Modes** — dedicated Planner / Generator / Healer modes if the skills+commands
  workflow proves insufficient.

## Notes

- `.github/agents/*.agent.md` (Copilot format) are left in place but are not used by Cursor;
  the `.cursor/skills/*` are the source of truth.

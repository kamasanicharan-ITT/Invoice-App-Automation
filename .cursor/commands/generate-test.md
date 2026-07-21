# /generate-test

Generate a Playwright test from a saved test plan item.

Use the `playwright-test-generator` skill. Execute each plan step live via the
`playwright-test` MCP, then write one spec file to `tests/` following the project
conventions in `.cursor/rules/40-test-conventions`.

**Argument:** the plan file and scenario to generate (e.g.
`specs/dashboard-test-plan.md -> TC-DB-05 Create Invoice navigation`). For a persona-tagged
scenario, use that persona's `storageState` (`auth/pm.json` / `auth/bdu.json` /
`auth/admin.json`).

Scenario: **$ARGUMENTS**

# Invoice App Automation — Agent Guide

Playwright end-to-end automation for the **Invoice Canvas application** (Power Apps),
part of the **Synergy** program. It works alongside the **Project Management**
model-driven app (projects, partners, contracts). Project Managers (PMs) use the
Invoice app to raise invoices for their projects.

## Where things live

- `tests/` — Playwright specs (`*.spec.ts`). UI structure + Dataverse data validation.
- `specs/` — Test plans (markdown) produced by the planner workflow.
- `tests/seed.spec.ts` — template used when generating a new test. Do not edit manually.
- `playwright.config.ts` — headless off, `storageState: auth.json`, chromium, retries 1.

## Cursor configuration

- **Rules** — `.cursor/rules/*.mdc` hold all persistent app/domain/test knowledge.
  Read these first; they are the source of truth (they replace the legacy `.cursorrules`).
- **Skills** — `.cursor/skills/*` rebuild the Playwright agents:
  `playwright-test-planner`, `playwright-test-generator`, `playwright-test-healer`,
  and `capture-role-auth`.
- **Commands** — `.cursor/commands/*` expose `/plan-tests`, `/generate-test`, `/heal-tests`.
- **MCP** — `.cursor/mcp.json` wires the `playwright-test` MCP server used by the skills.

## Hard rules (see `.cursor/rules/` for detail)

- Every Canvas locator MUST go through `page.frameLocator('iframe[name="fullscreen-app-host"]')`.
- Never add login code; auth is handled via `storageState`. Never commit `auth.json` or `auth/`.
- Never hardcode counts — use regex (e.g. `/\d+\s*Drafts/`).
- Use `getByRole` / `getByText`; never auto-generated CSS/appmagic IDs.

## App domain knowledge (persistent for future chats)

| Rule | Contents |
|------|----------|
| `00-project-overview` | Synergy apps, envs, entry URL |
| `10-canvas-app-conventions` | Locator patterns |
| `20-dataverse` | Schema, filters, token capture |
| `30-roles-and-security` | PM vs BDU/Admin (admin table) |
| `40-test-conventions` | Spec style, helpers, screenshots |
| `50-app-functionality` | Screens, lifecycle, billing, business rules |

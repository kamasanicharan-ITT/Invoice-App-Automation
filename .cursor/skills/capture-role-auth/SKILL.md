---
name: capture-role-auth
description: Produce a signed-in Playwright storageState per persona (PM / BDU / Admin) for role-based Invoice app testing. Use when the user needs to capture, refresh, or set up auth states for a role, or mentions auth/pm.json, auth/bdu.json, auth/admin.json, or role-based storageState.
---

# Capture Role Auth States

Role-based tests run the same scenario under different personas by pointing Playwright at a
different `storageState`. This skill captures one signed-in session per persona.

See `.cursor/rules/30-roles-and-security` for the persona/role mapping.

## Personas and files

| Persona | Security role                       | storageState    |
|---------|-------------------------------------|-----------------|
| PM      | Invoice application basic user 2.0  | `auth/pm.json`  |
| BDU     | BDU                                 | `auth/bdu.json` |
| Admin   | BDU + `admin` in security table     | `auth/admin.json` |

`auth/` is git-ignored. Never commit these files.

## Capture procedure (per persona)

1. Ensure the `auth/` directory exists.
2. Launch a headed browser and open the app URL (from `.cursor/rules/00-project-overview`):

   ```bash
   npx playwright open --save-storage=auth/pm.json "https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a"
   ```

3. Sign in interactively as the target persona's account and wait until the Dashboard loads
   inside `iframe[name="fullscreen-app-host"]`.
4. Close the browser — Playwright writes the session to the `--save-storage` path.
5. Repeat with `auth/bdu.json` and `auth/admin.json` for the other personas.

## Wiring into Playwright

Expose one project per persona in `playwright.config.ts`, each with its own `storageState`:

```ts
projects: [
  { name: 'chromium-pm',    use: { ...devices['Desktop Chrome'], storageState: 'auth/pm.json' } },
  { name: 'chromium-bdu',   use: { ...devices['Desktop Chrome'], storageState: 'auth/bdu.json' } },
  { name: 'chromium-admin', use: { ...devices['Desktop Chrome'], storageState: 'auth/admin.json' } },
],
```

Run a persona with `npx playwright test --project=chromium-pm`. Tests never contain login
code; the storageState handles the session.

## Persona tagging in scenarios

When planning or generating, tag each role-based scenario with the persona(s) and the
expected outcome (allow / deny / visible / hidden). Example:

- `[PM] deny` — PM cannot see the Approve action on another PM's invoice.
- `[BDU] allow` — BDU can review and approve any invoice.
- `[Admin] visible` — Admin sees admin-only configuration entries.

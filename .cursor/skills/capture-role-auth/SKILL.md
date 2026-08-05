---
name: capture-role-auth
description: Produce a signed-in Playwright storageState per persona (Admin / PM) for role-based Invoice app testing across ENV=dev|sit|qa|uat. Use when the user needs to capture, refresh, or set up auth states for a role, or mentions auth/pm.json, auth/admin.json, or role-based storageState.
---

# Capture Role Auth States

Role-based tests run the same scenario under different personas by pointing Playwright at a
different `storageState`. This skill captures one signed-in session per persona **per environment**.

See `.cursor/rules/30-roles-and-security` and `config/env.ts`.

## Personas and files

| Persona | Who | storageState |
|---------|-----|--------------|
| Admin | You (BDU + Security Roles admin) | `auth/<env>/admin.json` |
| PM | Teammate (Basic User 2.0) | `auth/<env>/pm.json` |

`<env>` is `dev`, `sit`, `qa`, or `uat`. `auth/` is git-ignored. Never commit these files.

DEV also accepts legacy flat files `auth/admin.json` / `auth/pm.json` if the nested
path is missing.

## Capture procedure (per persona, per env)

1. Ensure the folder exists, e.g. `mkdir auth\sit`.
2. Resolve the app URL for that env from `config/env.ts` (or `APP_URL` override).
3. Launch headed Playwright and save storage:

   ```powershell
   npx playwright open --save-storage=auth/sit/admin.json "<SIT_APP_URL>"
   npx playwright open --save-storage=auth/sit/pm.json "<SIT_APP_URL>"
   ```

4. Sign in as **you** for Admin, or as **teammate** for PM. Wait until Dashboard loads
   inside `iframe[name="fullscreen-app-host"]`.
5. Close the browser — Playwright writes the session file.
6. Repeat for each environment you need to test.

## Wiring

`playwright.config.ts` reads `config/env.ts` and sets:

- `chromium` / `chromium-admin` → `env.authAdmin`
- `chromium-pm` → `env.authPm`

```powershell
npx playwright test --project=chromium-admin
$env:ENV="sit"; npx playwright test --project=chromium-pm
```

Tests never contain login code.

## Persona tagging in scenarios

- `[Admin] allow/visible` — your elevated account
- `[PM] deny/hidden` — teammate basic account (e.g. Adhoc hidden)

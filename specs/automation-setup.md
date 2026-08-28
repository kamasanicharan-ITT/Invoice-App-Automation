# Invoice App Automation — Complete Setup & AI Test Authoring Guide

This guide is for engineers setting up the **Invoice Canvas Playwright automation** on a **new laptop**, confirming it works with a simple smoke test, and using **Cursor AI** to plan, generate, and heal tests.

Follow the sections in order. By the end you will be able to:

1. Clone and install the project
2. Capture signed-in auth sessions (Admin / PM)
3. Run a smoke test that proves auth + Playwright + the app work
4. Use Cursor rules, skills, commands, and the Playwright MCP to author tests with AI

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [How the stack fits together](#2-how-the-stack-fits-together)
3. [Prerequisites (new laptop)](#3-prerequisites-new-laptop)
4. [Clone and install](#4-clone-and-install)
5. [Cursor IDE setup](#5-cursor-ide-setup)
6. [Authentication (storageState)](#6-authentication-storagestate)
7. [Confirm setup with a smoke test](#7-confirm-setup-with-a-smoke-test)
8. [Running existing tests](#8-running-existing-tests)
9. [AI test authoring workflow](#9-ai-test-authoring-workflow)
10. [What Cursor needs to generate good tests](#10-what-cursor-needs-to-generate-good-tests)
11. [Repository layout](#11-repository-layout)
12. [Hard rules every engineer must follow](#12-hard-rules-every-engineer-must-follow)
13. [Roles and personas](#13-roles-and-personas)
14. [Troubleshooting](#14-troubleshooting)
15. [Quick reference commands](#15-quick-reference-commands)

---

## 1. What this project is

### Business context

The **Synergy** program has two Power Apps that share one Dataverse environment:

| App | Type | Purpose |
|-----|------|---------|
| **Project Management** | Model-driven | Partners, Projects, Contracts, Resources — feeds data into Invoice |
| **Invoice Application** | Canvas | Create, manage, and track invoices — **this is what we automate** |

Project Managers (PMs) raise invoices for their projects. BDUs with an Admin elevation can see all invoices, create adhoc invoices, and review/approve/send.

### What we automate

- **UI end-to-end tests** of the Invoice Canvas app (Playwright + TypeScript)
- **Dataverse API validation** (e.g. Dashboard counts in the UI vs live OData counts)
- **Role-based testing** (Admin vs PM) using separate saved browser sessions

### Environments

| Environment | Purpose | Automation target? |
|-------------|---------|--------------------|
| DEV | Primary authoring / debug | Yes (current default) |
| SIT / QA / UAT | Non-prod validation | Planned (Phase 2) |
| Production | Live | **Never** |

Primary app URL (DEV):

```
https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a
```

Tenant ID: `18323149-cc4d-4bff-809d-3eda6caec73a`  
DEV Dataverse: `https://dev-itt-apps.crm8.dynamics.com`

### Why Playwright (not Power Apps Test Studio)

Test Studio was evaluated and rejected (weak CI story, no Dataverse API checks from tests, env lock-in). Playwright was chosen because it can:

- Pierce the Canvas **iframe** (`fullscreen-app-host`)
- Call Dataverse APIs from the same test run
- Reuse Azure AD sessions via `storageState` (no login code in specs)
- Produce HTML reports, screenshots, video, and traces

---

## 2. How the stack fits together

```
┌─────────────────────────────────────────────────────────────┐
│  Cursor IDE                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Rules (.mdc)│  │ Skills       │  │ Commands           │ │
│  │ App domain  │  │ Planner      │  │ /plan-tests        │ │
│  │ conventions │  │ Generator    │  │ /generate-test     │ │
│  │ roles       │  │ Healer       │  │ /heal-tests        │ │
│  └─────────────┘  │ Auth capture │  └────────────────────┘ │
│                   └──────┬───────┘                          │
│                          │ uses                             │
│                   ┌──────▼───────┐                          │
│                   │ playwright-  │  MCP server              │
│                   │ test MCP     │  (live browser control)  │
│                   └──────┬───────┘                          │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ Playwright + Chromium  │
              │ storageState auth      │
              │ tests/*.spec.ts        │
              └────────────┬───────────┘
                           │
              ┌────────────▼───────────┐
              │ Invoice Canvas (DEV)   │
              │ inside iframe          │
              │ + Dataverse (crm8)     │
              └────────────────────────┘
```

**Plain English:**

- **Playwright** runs the tests.
- **`auth/*.json`** holds your signed-in Microsoft session so tests never type a password.
- **Cursor Rules** teach the AI how the Invoice app works (screens, locators, Dataverse, roles).
- **Cursor Skills + Commands** are the AI workflows: plan → generate → heal.
- **Playwright MCP** lets Cursor open a real browser, click the live app, and invent reliable locators instead of guessing.

---

## 3. Prerequisites (new laptop)

Install these before cloning.

### 3.1 Required software

| Tool | Version / notes | Why |
|------|-----------------|-----|
| **Windows 10/11** | Team standard | Matches current authoring machines |
| **Git** | Latest | Clone the repo |
| **Node.js** | **LTS 20.x or 22.x** (recommended) | Runs npm + Playwright |
| **Cursor IDE** | Latest | AI authoring + MCP |
| **Microsoft account access** | Org Azure AD | Sign in to Power Apps + MFA |

### 3.2 Access you must request

Without these, setup will fail at login or Dataverse steps:

1. **Access to the Invoice Canvas app** in the **DEV** environment (Power Apps play URL above)
2. At least one of:
   - **Admin test account** — BDU user who also has a row in the Dataverse **Security Roles** table with `role = admin` (full access, Adhoc, All Invoices)
   - **PM test account** — Invoice application basic user 2.0 (own invoices only; no Adhoc; no All Invoices radios)
3. Ideally **both** Admin and PM accounts if you will run role-based suites
4. Access to the **private GitHub repository** for this project
5. Network path to `apps.powerapps.com` and `*.crm8.dynamics.com` (VPN if your org requires it)

### 3.3 Verify Node and Git

Open **PowerShell** and run:

```powershell
node -v
npm -v
git --version
```

You should see versions printed (no “command not found”).

---

## 4. Clone and install

### 4.1 Clone the repository

```powershell
cd C:\
git clone <REPO_URL> Invoice-App-Automation
cd Invoice-App-Automation
```

Replace `<REPO_URL>` with the team’s GitHub clone URL.

### 4.2 Install npm dependencies

```powershell
npm install
```

This installs `@playwright/test` and TypeScript-related types from `package.json`.

### 4.3 Install Playwright browsers

```powershell
npx playwright install chromium
```

On a locked-down laptop you may need:

```powershell
npx playwright install --with-deps chromium
```

### 4.4 Confirm project files exist

You should see (among others):

| Path | Purpose |
|------|---------|
| `playwright.config.ts` | Timeouts, reporters, role projects, storageState paths |
| `tests/` | Spec files (`*.spec.ts`) |
| `tests/smoke.spec.ts` | Minimal “are we logged in?” check |
| `tests/seed.spec.ts` | Template used by the AI generator (do not edit by hand) |
| `specs/` | Markdown test plans from the planner |
| `.cursor/rules/` | Persistent domain knowledge for the AI |
| `.cursor/skills/` | Planner / Generator / Healer / Auth-capture skills |
| `.cursor/commands/` | `/plan-tests`, `/generate-test`, `/heal-tests` |
| `.cursor/mcp.json` | Wires the `playwright-test` MCP server |
| `AGENTS.md` | Short agent/project orientation |

---

## 5. Cursor IDE setup

### 5.1 Install and open the project

1. Install **Cursor** from [https://cursor.com](https://cursor.com)
2. Sign in with your Cursor account (team license if provided)
3. **File → Open Folder** → select `C:\Invoice-App-Automation` (or your clone path)
4. When prompted, allow the workspace to use project MCP / agent features

Opening the **repo root** matters: Cursor loads `.cursor/rules`, `.cursor/skills`, `.cursor/commands`, and `.cursor/mcp.json` from there.

### 5.2 Enable the Playwright Test MCP server

The project already defines MCP in `.cursor/mcp.json`:

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

There is also a VS Code–style copy under `.vscode/mcp.json` (same server, slightly different schema).

**What to do:**

1. Open Cursor **Settings → MCP** (or Features → MCP)
2. Confirm **`playwright-test`** appears and is enabled / connected
3. If it shows an error, run `npm install` and `npx playwright install chromium` again from the repo root, then restart Cursor
4. First connect may download the MCP server via `npx` — needs network

**Why MCP matters:** Without it, Cursor cannot drive a live browser to explore the Invoice app or empirically verify locators. Planner / Generator / Healer skills all depend on this MCP.

### 5.3 Confirm Cursor Rules are active

Rules live in `.cursor/rules/*.mdc`. They are the **source of truth** for app behavior and test conventions (they replaced the old `.cursorrules` file).

| Rule file | Contents |
|-----------|----------|
| `00-project-overview` | Synergy apps, envs, entry URL |
| `10-canvas-app-conventions` | iframe locators, control patterns, host dialogs |
| `20-dataverse` | Schema, filters, Bearer token capture |
| `30-roles-and-security` | PM vs BDU/Admin personas |
| `40-test-conventions` | Spec style, helpers, marked screenshots |
| `50-app-functionality` | Screens, lifecycle, billing cycle, business rules |

You do not need to “turn them on” manually if the folder is open as the workspace. In a new Agent chat, the AI should already follow them. You can still say: “Follow the project rules under `.cursor/rules`.”

### 5.4 Confirm Skills and Commands

**Skills** (under `.cursor/skills/`):

| Skill | When used |
|-------|-----------|
| `playwright-test-planner` | Explore app → write markdown plan in `specs/` |
| `playwright-test-generator` | Execute plan steps live → write `tests/*.spec.ts` |
| `playwright-test-healer` | Run failing tests → fix locators/assertions → re-run |
| `capture-role-auth` | Capture / refresh `auth/pm.json`, `auth/admin.json`, etc. |

**Commands** (type `/` in Cursor chat):

| Command | Purpose |
|---------|---------|
| `/plan-tests` | Run the planner skill for a screen/flow |
| `/generate-test` | Generate one Playwright test from a plan scenario |
| `/heal-tests` | Debug and fix failing tests |

### 5.5 Agent / model tips

- Use **Agent / Composer** mode when planning, generating, or healing (needs tools + MCP + file edits)
- Keep chats focused: one screen or one failing suite per conversation when possible
- Point the agent at `AGENTS.md` if it seems lost: “Read AGENTS.md and the `.cursor/rules` first”

---

## 6. Authentication (storageState)

### 6.1 Concept

Tests **never contain login code**. You sign in once in a headed browser; Playwright saves cookies/tokens to a JSON file; every test reuses that session.

| Persona | Who | File (gitignored) | Playwright project |
|---------|-----|-------------------|--------------------|
| **Admin** | BDU + `admin` row in Security Roles | `auth/admin.json` | `chromium` / `chromium-admin` |
| **PM** | Invoice application basic user 2.0 (no admin row) | `auth/pm.json` | `chromium-pm` |
| **BDU** (optional) | BDU without treating as admin in tests | `auth/bdu.json` | Only if you add a project |

**Never commit** `auth.json`, `auth/`, or any storageState files. They are in `.gitignore`.

### 6.2 Create the auth folder

```powershell
cd C:\Invoice-App-Automation
New-Item -ItemType Directory -Force -Path auth
```

### 6.3 Capture Admin session (required for smoke + most suites)

```powershell
npx playwright open --save-storage=auth/admin.json "https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a"
```

**In the browser that opens:**

1. Sign in with the **Admin** Microsoft account
2. Complete **MFA** if prompted
3. If you see **“Allow Invoice Application to access your data?”** → click **Allow** (not Don’t allow)
4. Wait until the app loads — you should see the **Dashboard** (header “Dashboard”, Create Invoice, Invoice Tasks, etc.)
5. Confirm content is inside the Canvas host (the automation later targets `iframe[name="fullscreen-app-host"]`)
6. Close the browser window — Playwright writes `auth/admin.json`

### 6.4 Capture PM session (needed for role-based tests)

```powershell
npx playwright open --save-storage=auth/pm.json "https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a"
```

Sign in as the **PM** account, wait for Dashboard, close the browser.

### 6.5 Optional: ask Cursor to walk you through capture

In Agent chat you can say:

> Capture role auth for Admin and PM using the `capture-role-auth` skill.

The skill documents the same procedure and persona → file mapping.

### 6.6 When to refresh auth

Re-capture when:

- Tests suddenly land on a Microsoft login page
- You get 401s against Dataverse
- MFA / conditional access rotated sessions
- You joined a new machine (auth files are local and not in git)

Sessions typically last days to weeks depending on org policy — treat refresh as normal maintenance.

---

## 7. Confirm setup with a smoke test

This is the **minimum bar** that everything works: Node, Playwright, Chromium, `auth/admin.json`, network, and the Invoice app URL.

### 7.1 What the smoke test does

File: `tests/smoke.spec.ts`

It:

1. Opens the DEV Invoice app URL
2. Asserts text **“Invoice Application”** is visible within 20 seconds
3. Relies on `storageState: auth/admin.json` from `playwright.config.ts` (project `chromium` / `chromium-admin`)

If auth is missing or expired, you will see a login page and the assertion fails.

### 7.2 Run the smoke test

```powershell
cd C:\Invoice-App-Automation
npx playwright test tests/smoke.spec.ts --project=chromium-admin
```

Or the default `chromium` project (also points at Admin auth):

```powershell
npx playwright test tests/smoke.spec.ts --project=chromium
```

**Expected:** headed Chromium opens, app loads already signed in, test **passes**.

### 7.3 View the HTML report

```powershell
npx playwright show-report
```

### 7.4 Success checklist

| Check | Pass means |
|-------|------------|
| Smoke test green | Auth + Playwright + app URL work |
| No login page | `auth/admin.json` is valid |
| Browser headed | Matches project config (`headless: false`) |
| Report opens | Reporters configured correctly |

If smoke fails, see [Troubleshooting](#14-troubleshooting) before running larger suites.

---

## 8. Running existing tests

### 8.1 Playwright projects (roles)

From `playwright.config.ts`:

| Project | storageState | Use for |
|---------|--------------|---------|
| `chromium` | `auth/admin.json` | Default / MCP-friendly Admin runs |
| `chromium-admin` | `auth/admin.json` | Explicit Admin |
| `chromium-pm` | `auth/pm.json` | PM persona |

### 8.2 Common run commands

```powershell
# All tests as Admin (default project name also works)
npx playwright test --project=chromium-admin

# Dashboard suite (Admin)
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin

# Same suite as PM (persona-scoped counts / visibility)
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-pm

# Create Invoice
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin

# Invoice Overview
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-admin

# Run Admin and PM in one go
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin --project=chromium-pm
```

### 8.3 Config defaults (know these)

- **Headed** (`headless: false`) — you will see the browser
- **Timeout** 90s per test
- **Retries** 1
- **Screenshots** on; **video** and **trace** retained on failure
- **Not fully parallel** (`fullyParallel: false`) — safer for shared Dataverse data

### 8.4 Existing Phase 1 coverage (high level)

| Suite | File | Focus |
|-------|------|--------|
| Smoke | `tests/smoke.spec.ts` | Session + app load |
| Dashboard | `tests/dashboard-screen.spec.ts` | UI structure + Dataverse count validation |
| Create Invoice | `tests/create-invoice-screen.spec.ts` | Form, validation, submit, Adhoc (Admin), etc. |
| Invoice Overview | `tests/invoice-overview-screen.spec.ts` | Overview UI / filters |

Test plans that describe intended coverage live under `specs/` (e.g. `dashboard-screen-plan.md`, `create-invoice-screen-plan.md`).

---

## 9. AI test authoring workflow

This is how the team **generates test cases with AI** inside Cursor. Do not skip the live MCP exploration step — that is what keeps Canvas locators reliable.

### 9.1 Overview of the three agents

```
  /plan-tests          /generate-test           /heal-tests
       │                      │                      │
       ▼                      ▼                      ▼
  Explore live app      Replay plan steps      Run failing test
  with MCP              live with MCP          with MCP
       │                      │                      │
       ▼                      ▼                      ▼
  Markdown plan         TypeScript spec        Fixed locators /
  in specs/             in tests/              assertions
```

| Stage | Skill | Input | Output |
|-------|-------|-------|--------|
| **Plan** | `playwright-test-planner` | Screen/flow name (+ optional persona) | `specs/<name>-test-plan.md` |
| **Generate** | `playwright-test-generator` | One scenario from a plan | One `tests/<scenario>.spec.ts` (or merged suite file by team convention) |
| **Heal** | `playwright-test-healer` | Failing spec / test name / `all` | Updated test code until green |

Human review sits between Plan and Generate: **approve the plan before generating dozens of tests**.

### 9.2 Prerequisites specific to AI authoring

Before asking Cursor to plan or generate:

1. Repo opened in Cursor at the project root
2. `npm install` and Chromium installed
3. **`auth/admin.json`** present (and `auth/pm.json` if planning PM scenarios)
4. **`playwright-test` MCP** connected and healthy
5. You can already pass the **smoke test** (Section 7)
6. Network access to the DEV app and Dataverse

### 9.3 Step A — Plan tests (`/plan-tests`)

**What it does:** Opens the live Invoice app via MCP, snapshots the Canvas UI (including iframe content), maps flows, and writes a reviewable markdown plan under `specs/`. It does **not** write Playwright code.

**How to run:**

1. Open Cursor Agent chat
2. Type `/plan-tests` and an argument, for example:
   - `/plan-tests Dashboard`
   - `/plan-tests Create Invoice`
   - `/plan-tests Invoice Overview for PM and Admin`
3. Or describe in natural language:
   > Plan tests for the Create Invoice screen. Include Admin Adhoc scenarios and PM deny cases for the Adhoc toggle.

**What the planner should produce:**

- Clear headings and scenario IDs (e.g. `TC-CI-01`)
- Numbered steps and expected results
- Persona tags where relevant (`[Admin] visible`, `[PM] deny`, etc.)
- Seed reference: `tests/seed.spec.ts`
- Dataverse cross-check scenarios when UI shows counts

**Your job after planning:** Read the markdown in `specs/`. Edit or delete weak scenarios before generating.

### 9.4 Step B — Generate a test (`/generate-test`)

**What it does:** For **one** plan scenario, executes each step in a live browser via MCP, verifies elements with `browser_verify_*`, then writes a Playwright spec under `tests/` using project conventions.

**How to run:**

```
/generate-test specs/dashboard-screen-plan.md -> TC-DB-05 Create Invoice navigation
```

Or:

> Generate a Playwright test for scenario TC-CI-03 Partner → Project cascade from `specs/create-invoice-screen-plan.md` using Admin auth.

**Conventions the generator must follow** (enforced by rules + skill):

- Header comments: `// spec: specs/...` and `// seed: tests/seed.spec.ts`
- Locators go through `page.frameLocator('iframe[name="fullscreen-app-host"]')`
- Prefer `getByRole` / `getByText` / placeholders — **never** appmagic CSS IDs
- Dynamic counts via regex (e.g. `/\d+\s*Drafts/`)
- No login code — use the correct `storageState` / project for the persona
- Marked screenshots via `tests/utils/screenshot.ts` (`markAndShot` / `markGroupAndShot`)
- Dismiss host consent/alerts via `tests/utils/host-dialogs.ts` helpers when using shared open helpers

**Important Canvas MCP tip:** After navigate, do **not** `browser_wait_for({ text: "Dashboard" })` at the top-level page — Canvas text lives in the iframe and that wait can hang. Wait by time, then `browser_snapshot` (iframe refs look like `f1e*`). Re-snapshot if a ref is “not found”.

### 9.5 Step C — Heal failing tests (`/heal-tests`)

**What it does:** Runs the target test(s), inspects failures (snapshot, console, network), fixes selectors/assertions/timing, re-runs until green. Uses `test.fixme()` only as a last resort with a comment explaining observed vs expected.

**How to run:**

```
/heal-tests tests/dashboard-screen.spec.ts
```

```
/heal-tests all
```

Or:

> Heal the failing Create Invoice Adhoc tests under chromium-admin.

### 9.6 End-to-end example (new engineer walkthrough)

Goal: add coverage for a small Dashboard check.

1. Ensure smoke test passes (Section 7)
2. Run `/plan-tests Dashboard` (or open existing `specs/dashboard-screen-plan.md`)
3. Pick one scenario, e.g. navigation to Create Invoice
4. Run `/generate-test` for that scenario
5. Run the new/updated spec:
   ```powershell
   npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin
   ```
6. If red, run `/heal-tests` on that file
7. Commit **only** the plan + test source (never `auth/`)

### 9.7 What AI generation is *not*

- Not a replacement for reviewing plans and assertions
- Not licensed to commit secrets or auth files
- Not allowed to hardcode Dashboard counts as fixed numbers
- Not meant to use Power Apps Test Studio or recorded codegen as the primary authoring path (codegen is useful mainly for `--save-storage` auth capture)

---

## 10. What Cursor needs to generate good tests

Treat this as the **checklist of inputs** for quality AI output.

### 10.1 Project knowledge (already in the repo)

| Asset | Role |
|-------|------|
| `.cursor/rules/*.mdc` | Domain + locator + Dataverse + role + convention truth |
| `.cursor/skills/*` | Exact workflows for plan / generate / heal / auth |
| `.cursor/commands/*` | Slash-command entry points |
| `.cursor/mcp.json` | Live browser MCP |
| `AGENTS.md` | Short orientation |
| `specs/*-test-plan.md` | Approved scenarios |
| `tests/utils/*` | Shared helpers (dialogs, screenshots, Dataverse fixtures) |
| `tests/seed.spec.ts` | Generator seed template |

### 10.2 Local secrets / sessions (you provide; never commit)

| Asset | Role |
|-------|------|
| `auth/admin.json` | Admin session for most generation and suites |
| `auth/pm.json` | PM session for role scenarios |
| Working org accounts | Interactive MFA when capturing auth |

### 10.3 Runtime dependencies

| Asset | Role |
|-------|------|
| Node + `node_modules` | Playwright + MCP launch |
| Chromium for Playwright | Headed browser |
| DEV app + Dataverse reachability | Live exploration and API checks |
| Cursor with MCP enabled | Tool calls from skills |

### 10.4 Human prompts that work well

**Good:**

> `/plan-tests Create Invoice` including Admin Adhoc submit and PM Adhoc hidden. Tag each scenario with persona and allow/deny/visible/hidden.

> `/generate-test specs/create-invoice-screen-plan.md -> TC-CI-12 Submit non-adhoc happy path` using `auth/admin.json`.

> `/heal-tests tests/create-invoice-screen.spec.ts` — Partner dropdown locator is flaky after reload.

**Weak:**

> “Write all invoice tests” (too broad; no plan review)

> “Fix tests” with no file name and MCP disconnected

---

## 11. Repository layout

```
Invoice-App-Automation/
├── AGENTS.md                 # Agent / project guide
├── package.json              # npm scripts + Playwright dependency
├── playwright.config.ts      # Projects, storageState, reporters
├── tsconfig.json
├── auth/                     # GITIGNORED — your local sessions
│   ├── admin.json
│   └── pm.json
├── tests/
│   ├── smoke.spec.ts         # Setup confirmation test
│   ├── seed.spec.ts          # Generator template (do not hand-edit)
│   ├── dashboard-screen.spec.ts
│   ├── create-invoice-screen.spec.ts
│   ├── invoice-overview-screen.spec.ts
│   └── utils/
│       ├── host-dialogs.ts
│       ├── screenshot.ts
│       ├── create-invoice-ui.ts
│       ├── invoice-overview-ui.ts
│       └── dataverse-fixtures.ts
├── specs/                    # Plans and setup docs
│   ├── automation-setup.md   # This document
│   ├── phase2.md
│   ├── dashboard-screen-plan.md
│   ├── create-invoice-screen-plan.md
│   ├── invoice-overview-screen-plan.md
│   ├── invoice-flows.md
│   └── cursor-roadmap.md
└── .cursor/
    ├── rules/                # Persistent AI knowledge
    ├── skills/               # Planner, Generator, Healer, Auth
    ├── commands/             # /plan-tests, /generate-test, /heal-tests
    └── mcp.json              # playwright-test MCP
```

---

## 12. Hard rules every engineer must follow

These are non-negotiable for stable Canvas automation:

1. **Every Canvas locator** must use:
   ```ts
   const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
   ```
   Never locate Canvas controls on the top-level `page` only.

2. **Never add login code** in specs. Use `storageState` only.

3. **Never commit** `auth.json`, `auth/`, passwords, or tokens.

4. **Never hardcode counts** (Drafts, Total Tasks, etc.). Use regex such as `/\d+\s*Drafts/`.

5. Prefer **`getByRole` / `getByText` / placeholders**. Never rely on auto-generated appmagic CSS IDs.

6. Match **real UI text**, including existing typos (e.g. **Quater** to Date).

7. After `goto` / reload, dismiss intermittent host dialogs (**Allow** consent, connector alerts) via shared helpers — do not click Don’t allow.

8. Avoid `waitForTimeout` except inside sanctioned helpers (e.g. `getDashboardTaskCount`). Do not wait for `networkidle`.

9. For evidence, use **`markAndShot` / `markGroupAndShot` / `shot`** — not cropped `locator.screenshot()`.

10. Production is out of scope. Do not point automation at prod URLs or prod credentials.

---

## 13. Roles and personas

### Power Apps environment roles

Two environment roles exist. Alone, they behave similarly in the Invoice UI until Admin elevation is applied:

| Role | Typical user |
|------|----------------|
| Invoice application basic user 2.0 | Project Manager (PM) |
| BDU (Business Development User) | Business Development |

### Application Admin (separate Dataverse table)

Admin is **not** a Power Apps environment role by itself. It is a row in the **Security Roles** table (`role = admin` for the user’s email). That elevation unlocks:

- **All Invoices** (not only My Invoices)
- Full Dashboard counts (org-wide for the billing cycle)
- **Adhoc Invoice** toggle
- Review / Approve / Flag / Send actions

In practice, BDUs are the users elevated to Admin. Treat **BDU + Admin row** as the elevated persona in tests (`auth/admin.json`).

### Expected access matrix (for planning)

| Capability | PM | Admin (BDU + admin) |
|------------|----|---------------------|
| My Invoices | Yes | Yes |
| All Invoices radios | No (My only) | Yes |
| Adhoc Invoice | Hidden / unavailable | Yes, unlimited |
| Non-adhoc create (1 per project per billing period) | Yes | Yes |
| Review / Approve / Send | No | Yes |
| Dashboard task counts | Only invoices where user is Submitter, Reviewer, or Approver | All invoices in cycle (admin view) |

Always tag role scenarios with persona + expected outcome (`allow` / `deny` / `visible` / `hidden`).

---

## 14. Troubleshooting

### Smoke test fails / login page appears

- Re-capture `auth/admin.json` (Section 6)
- Confirm you used the **DEV** app URL
- Complete MFA and click **Allow** on consent
- Check VPN / corporate proxy

### `storageState: auth/admin.json` file not found

```powershell
New-Item -ItemType Directory -Force -Path auth
# then re-run playwright open --save-storage=...
```

### MCP `playwright-test` not connecting

- Open folder at repo root
- Run `npm install` and `npx playwright install chromium`
- Restart Cursor
- Check Settings → MCP for error text
- Ensure `npx` works in PowerShell outside Cursor

### Canvas locators “not found” / flaky

- Confirm you scoped through `iframe[name="fullscreen-app-host"]`
- Wait for real data (e.g. a count pattern), not only a static label
- Re-snapshot in MCP before clicking stale `f1e*` refs
- Use `/heal-tests` rather than blindly swapping CSS selectors

### Consent dialog blocks the test

- Use `dismissHostDialogs` / `dismissHostDialogsSettling` from `tests/utils/host-dialogs.ts`
- Click **Allow**, never Don’t allow

### Dataverse count mismatches

- Confirm Bearer token capture from `crm8.dynamics.com` requests
- Confirm billing cycle helper (6th → 5th) matches Canvas
- Confirm persona: Admin org-wide vs PM user-scoped filters
- Failed tile = all `Fail-*` **and** `dia_isReported` blank

### `npm install` or Playwright install blocked

- Use the org’s approved Node installer / mirror
- Ask IT to allow Playwright browser download or vendor the browser cache
- Retry: `npx playwright install chromium`

---

## 15. Quick reference commands

```powershell
# --- Install ---
cd C:\Invoice-App-Automation
npm install
npx playwright install chromium

# --- Auth (Admin) ---
New-Item -ItemType Directory -Force -Path auth
npx playwright open --save-storage=auth/admin.json "https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a"

# --- Auth (PM) ---
npx playwright open --save-storage=auth/pm.json "https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a"

# --- Confirm setup ---
npx playwright test tests/smoke.spec.ts --project=chromium-admin
npx playwright show-report

# --- Day-to-day runs ---
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-admin
npx playwright test tests/create-invoice-screen.spec.ts --project=chromium-admin
npx playwright test tests/invoice-overview-screen.spec.ts --project=chromium-admin
npx playwright test tests/dashboard-screen.spec.ts --project=chromium-pm
```

**In Cursor chat:**

```
/plan-tests Dashboard
/generate-test specs/dashboard-screen-plan.md -> TC-DB-01 ...
/heal-tests tests/dashboard-screen.spec.ts
```

---

## Appendix A — New laptop setup checklist

Copy this for onboarding:

- [ ] Node.js LTS installed (`node -v`, `npm -v`)
- [ ] Git installed; repo cloned
- [ ] Cursor installed; folder opened at repo root
- [ ] `npm install` completed
- [ ] `npx playwright install chromium` completed
- [ ] DEV Invoice app access verified in a normal browser
- [ ] Admin (and optionally PM) test accounts available
- [ ] `auth/admin.json` captured; optional `auth/pm.json`
- [ ] MCP `playwright-test` shows connected in Cursor
- [ ] `npx playwright test tests/smoke.spec.ts --project=chromium-admin` **passes**
- [ ] Read `AGENTS.md` and skim `.cursor/rules/`
- [ ] Tried `/plan-tests` on a small screen (optional first AI exercise)

---

## Appendix B — Billing cycle reminder (for Dashboard/Overview)

Canvas “This Month” is **not** a calendar month. It uses dates from the **6th of the current calendar month** through the **5th of the next month** (inclusive). On calendar days **1–5**, “This Month” already points at the upcoming cycle.

Example (any day in August 2026 for This Month): `2026-08-06` → `2026-09-05`.

Dataverse filters in tests must mirror this via shared helpers — do not invent calendar-month filters for those tiles.

---

## Appendix C — Related docs in the repo

| Doc | Use when |
|-----|----------|
| `AGENTS.md` | Quick orientation for humans and AI agents |
| `specs/phase2.md` | Multi-env (SIT/QA/UAT) and deployment-ready Create Invoice |
| `specs/cursor-roadmap.md` | Future ADO CI and env parameterization design |
| `specs/*-screen-plan.md` | Scenario source of truth before generating code |
| `.cursor/rules/*.mdc` | Detailed domain and coding rules |

---

*Document purpose: enable any teammate to set up Invoice Canvas automation on a new machine, prove it with smoke, and use Cursor’s planner / generator / healer workflow safely and consistently.*

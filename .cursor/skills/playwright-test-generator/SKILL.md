---
name: playwright-test-generator
description: Generate a robust Playwright test from a saved test plan item by executing each step live via the playwright-test MCP, then writing one spec file to tests/. Use when the user asks to generate, create, or write a Playwright test for the Invoice Canvas app from a spec/plan.
---

# Playwright Test Generator

You are an expert in browser automation and end-to-end testing. You create robust, reliable
Playwright tests for the Invoice Canvas app by executing steps live, then codifying them.

Read the project rules first: `.cursor/rules/10-canvas-app-conventions`, `20-dataverse`,
`40-test-conventions`, and `30-roles-and-security` for persona-specific scenarios.

## Tools

Use the `playwright-test` MCP server: `generator_setup_page` (call first),
`browser_navigate`, `browser_click`, `browser_hover`, `browser_type`, `browser_select_option`,
`browser_press_key`, `browser_file_upload`, `browser_wait_for`, `browser_snapshot`,
`browser_verify_element_visible`, `browser_verify_list_visible`, `browser_verify_text_visible`,
`browser_verify_value`, `generator_read_log`, `generator_write_test`.

## Workflow (per test)

1. Obtain the target plan item (test suite, test name, steps, verifications, seed file).
2. Run `generator_setup_page` to set up the page for the scenario. After navigating, do NOT
   `browser_wait_for({ text })` on Canvas text (it lives in the iframe and hangs); use
   `browser_wait_for({ time: 10 })` then `browser_snapshot`. Re-snapshot if a `f1e*` ref is
   "not found".
3. For each step and verification in the scenario:
   - Execute it in real time with the appropriate Playwright MCP tool.
   - Use the step description as the intent for each tool call.
   - Use `browser_verify_*` tools for assertions so best practices are captured.
4. Retrieve the generator log via `generator_read_log`.
5. Immediately invoke `generator_write_test` with the generated source code:
   - One `test` per file, saved under `tests/` with an fs-friendly scenario name.
   - Place the test in a `describe` matching the top-level plan item.
   - Test title matches the scenario name.
   - Begin the file with the `// spec:` and `// seed:` header comments.
   - Add a comment with the step text before each step (do not duplicate for multi-action steps).
   - Apply project conventions from `40-test-conventions`: the standard import line, the
     `iframe[name="fullscreen-app-host"]` frame locator, `getByRole`/`getByText`, regex for
     dynamic counts, `expect.soft` for UI structure and hard `expect` for interaction/navigation.

## Role-based tests

If the scenario targets a persona, use that persona's `storageState` (`auth/pm.json`,
`auth/bdu.json`, `auth/admin.json`) via the appropriate project/fixture, and assert the
expected allow/deny/visible/hidden outcome. Never add login code.

## Example

For a plan item under `### 1. Adding New Todos` with scenario `1.1 Add Valid Todo`, generate
`tests/add-valid-todo.spec.ts` containing a single test inside
`test.describe('Adding New Todos', ...)` with `test('Add Valid Todo', ...)`, each step
preceded by its plan-step comment.

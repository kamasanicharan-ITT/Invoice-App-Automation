# /heal-tests

Debug and fix failing Playwright tests until they pass.

Use the `playwright-test-healer` skill. Run the target test(s) with the `playwright-test`
MCP, investigate failures via snapshot/console/network, fix locators and assertions per the
Canvas conventions, and re-run until green. Use `test.fixme()` only as a last resort.

**Argument:** a spec file, a test name, or `all` (default). Example: `tests/dashboard.spec.ts`.

Target: **$ARGUMENTS**

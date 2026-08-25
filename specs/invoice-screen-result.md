# Create Invoice — plan vs. generated tests, group-by-group result sheet

**Plan:** `specs/create-invoice-regression.md`
**Spec under review:** `tests/Create-Invoice-complete.spec.ts` (42 tests)
**Helpers:** `tests/utils/create-invoice-ui.ts`
**Source sheet:** `specs/Create_Invoice_Test_Cases.md` (CI-001 … CI-075)
**Reviewed:** 2026-08-20 — static comparison only, no verified run yet

---

## 0. How to read this document

Every test in the spec is listed under the group (module) it belongs to, with the steps
the code actually performs — not the steps the plan asked for. Where the two differ, the
difference is called out in **Finding**.

| Column | Meaning |
|---|---|
| **Scenario** | The business behaviour the case is supposed to prove |
| **Steps** | What the generated code really does, in order |
| **Result** | Outcome of a real run. `Not run` until we execute that group |
| **Finding** | Gap vs. plan, predicted failure, or weak assertion found by review |

Finding severity:

- **Defect** — the test is broken and will fail or error regardless of the app.
- **Vacuous** — the test will pass, but it would also pass if the feature were broken. It proves nothing.
- **Weak** — the assertion is swallowed by `.catch()` or wrapped in `if`, so a real failure is silently tolerated.
- **Gap** — the code checks less than the plan asked for.
- **Risk** — likely to be flaky or environment-dependent.

The earlier full-suite attempt died mid-run on `net::ERR_INTERNET_DISCONNECTED`, so the 13
failures recorded in `test-results/.last-run.json` are network casualties and were discarded.
We are now executing one group at a time and filling in Result cells as we go.

**Progress: all 10 groups run on Admin. 35 passes, 0 open failures (CI-011 / CI-012 / CI-051 skipped for later).**

| Group | Admin | PM |
|---|---|---|
| 1. Page load and defaults | 5/5 pass | 5/5 pass |
| 2. Role access Adhoc | 3 pass, 1 skip (PM-only case) | 1 pass, 3 skip (Admin-only cases) |
| 3. Start with last invoice | 1/1 pass | not run |
| 4. Contract validation | 2 pass, 2 skipped (CI-011, CI-012 — revisit at end) | not run |
| 5. Date validation | 4 pass, 2 skip (PM-only cap cases) | not run |
| 6. Partner and Project | 2 pass, 1 fixme skip (CI-024/025/026) | not run |
| 7. Line items | 8/8 pass | not run |
| 8. Tax North America | 3/3 pass | not run |
| 9. Duplicate Submit Save Draft Close | 5 pass, 1 skipped (CI-051 — revisit at end) | not run |
| 10. Edit draft and flagged | 1 pass, 1 skip (CI-057 — no Flagged row) | not run |

---

## 1. Coverage summary — plan vs. spec

| # | Group (describe) | Cases planned | Cases generated | Missing |
|---|---|---|---|---|
| 1 | Page load and defaults | 5 | 5 | — |
| 2 | Role access Adhoc | 5 | 4 | CI-005 |
| 3 | Start with last invoice | 1 | 1 | — |
| 4 | Contract validation | 7 | 4 | CI-008, CI-010, CI-014 |
| 5 | Date validation | 6 | 6 | — |
| 6 | Partner and Project | 3 | 3 | — |
| 7 | Line items | 9 | 8 | CI-033 |
| 8 | Tax North America | 3 | 3 | — |
| 9 | Duplicate Submit Save Draft Close | 6 | 6 | — |
| 10 | Edit draft and flagged | 2 | 2 | — |
| 11 | Deferred (email / PDF / lifecycle) | — | 0 | intentionally omitted |
| | **Total** | **47** | **42** | **5** |

The five missing cases are listed in section 13 with the reason each one was dropped.

---

## 2. Group 1 — Page load and defaults

Run: `npx playwright test tests/Create-Invoice-complete.spec.ts --project=chromium-admin -g "Page load and defaults"`

**Group status: 5/5 pass on Admin (1.4m) and 5/5 pass on PM (1.3m) — 2026-08-20.**
Logs: `run-group1-admin.txt`, `run-group1-pm.txt`. Dataverse fixtures resolved on both runs:
eligible `IDLA AUS / AUS GOV CONS`, duplicate `HP Inc. / HP ITSM MPS QA`, NA `AOC / Home Publishing`,
non-NA `IDLA AUS / AUS GOV CONS`, editable product `IT Retainer`, non-editable `Abundance Coaching`.

### CI-001 — New Invoice form loads with all expected controls

**Scenario:** A user opening Create Invoice sees the complete form in its initial state, and the two personas differ only in Adhoc visibility.

**Steps:**
1. Open the app URL with the persona's `storageState`, dismiss host dialogs, wait for Dashboard, click **Create Invoice**.
2. Assert **New Invoice** heading, both radios visible, **Start with last invoice** checked by default.
3. Assert Send Instantly visible and unchecked — switch index 1 for Admin, index 0 for PM.
4. Assert Invoice number and PO number textboxes are disabled.
5. Assert the three date boxes: index 0 Invoice Date = month end, index 1 Service Start = month start, index 2 Service End = month end.
6. Assert Find Partner, Find Project, Product/Service header, Add new item, Internal Notes, Close all visible; Save Draft and Submit disabled.
7. Admin branch: Adhoc Invoice label visible and switch unchecked. PM branch: Adhoc Invoice count is 0.
8. Screenshot the marked control group.

**Result:** **Pass** — Admin 15.1s, PM 12.4s

**Finding:** None. Both branches of the role matrix are now proven by execution: Admin renders the Adhoc label with two switches, PM renders zero Adhoc elements with one switch.

### CI-002 — Brand New empty form keeps calendar-month date defaults

**Scenario:** Switching to Brand New clears nothing about the date defaults and leaves the form blank.

**Steps:**
1. Open Create Invoice, click the **Brand New** radio, assert it is checked.
2. Assert Find Partner and Find Project still show unselected labels.
3. Assert first line row shows **Find items** and an empty description.
4. Assert the three dates still equal calendar-month start/end.
5. Assert Invoice number is empty and disabled.

**Result:** **Pass** — Admin 13.0s, PM 15.6s

**Finding:** *Gap.* The plan also asks to assert quantity is 0 on the blank row. The code checks only the description. Passing, but slightly under-covered.

### CI-015 / CI-016 / CI-017 — Date fields default to calendar month bounds

**Scenario:** Create Invoice uses calendar-month bounds (1st → last), not the Dashboard billing cycle (6th → 5th).

**Steps:**
1. Open Create Invoice.
2. Compute month start and month end at runtime with `calendarMonthUsDates()`.
3. Assert Service Start = start, Service End = end, Invoice Date = end.

**Result:** **Pass** — Admin 12.4s, PM 12.1s. Confirms the app really does use calendar-month bounds (8/1/2026 → 8/31/2026 in August), not the Dashboard billing cycle, for both personas.

**Finding:** None. Dates are computed, not hardcoded, so this stays valid in any month.

### CI-043 — PO Number is disabled on create

**Scenario:** Invoice # and PO # are system-populated after Submit, so they must be locked on create.

**Steps:**
1. Open Create Invoice.
2. Assert PO number textbox disabled.
3. Assert Invoice number textbox disabled.

**Result:** **Pass** — Admin 12.0s, PM 11.7s

**Finding:** *Gap.* Fully duplicated by CI-001 step 4. Harmless, but it buys no new coverage for the 12s it costs.

### CI-007 — Send Instantly toggle on and off

**Scenario:** The Send Instantly switch flips both ways for both personas, at a different switch index each.

**Steps:**
1. Open Create Invoice, resolve the Send Instantly switch (index 1 Admin, index 0 PM).
2. `setSendInstantly(true)`, assert checked, assert a **Yes** label is visible.
3. `setSendInstantly(false)`, assert unchecked.

**Result:** **Pass** — Admin 12.3s, PM 11.6s. The differing switch index (1 for Admin, 0 for PM) resolves correctly on both.

**Finding:** *Weak.* `getByText('Yes').first()` is not scoped to the Send Instantly row, so it could match another control's state label. Asserting the switch's checked state is what actually carries the test — and that part did pass.

---

## 3. Group 2 — Role access Adhoc

Run: `... -g "Role access Adhoc"` (run under both `chromium-admin` and `chromium-pm`)

**Group status: Admin 3 pass / 1 skip (1.3m), PM 1 pass / 3 skip (29s) — 2026-08-20.**
Logs: `run-group2-admin.txt`, `run-group2-pm.txt`. The two runs are exact complements —
every case that executes on one persona skips on the other, which is precisely the role
matrix the plan describes. Combined, the group has no untested case and no double-run case.

### CI-004 — Admin Adhoc Invoice toggle switches to Yes

**Scenario:** Admin can turn on Adhoc; PM cannot see the control at all.

**Steps:**
1. Skip when persona is PM.
2. Open Create Invoice as Admin, call `setAdhoc(true)`.
3. Assert switch 0 is checked and a **Yes** label is visible.

**Result:** **Pass** on Admin (16.1s); correctly **skipped** on PM.

**Finding:** *Weak.* Same unscoped **Yes** text as CI-007. The switch-checked assertion is the one doing the work.

### CI-011b — PM does not see Adhoc Invoice

**Scenario:** Adhoc is an admin-only capability, hidden entirely for PM. Not in the regression sheet; added from the live PM session.

**Steps:**
1. Skip when persona is Admin.
2. Open Create Invoice as PM.
3. Assert **Adhoc Invoice** has count 0, exactly one switch exists, Send Instantly is visible.

**Result:** **Pass** on PM (12.1s); correctly **skipped** on Admin. Confirms live that PM's form carries exactly one switch and zero Adhoc elements.

**Finding:** None. This is the clearest PM/Admin differentiator in the suite.

### CI-004b — Adhoc ON forces Brand New

**Scenario:** Turning Adhoc on must force the form out of "Start with last invoice", because an adhoc invoice has no prior invoice to copy.

**Steps:**
1. Skip when persona is PM.
2. Open as Admin, click **Start with last invoice**, assert checked.
3. `setAdhoc(true)`.
4. Assert Adhoc switch checked and **Brand New** now checked.

**Result:** **Pass** on Admin (19.6s); correctly **skipped** on PM. The product rule holds: switching Adhoc on while "Start with last invoice" is selected moves the form to Brand New.

**Finding:** Resolved 2026-08-20. This test was previously labelled CI-011, colliding with the contract case in group 4. Renamed **CI-004b** — a local ID, since the sheet has no entry for it. CI-011 now refers only to "Invoice Date must fall inside the contract".

### CI-059 — Adhoc zero amount cannot be submitted

**Scenario:** Adhoc relaxes the frequency and future-date rules, but it does not relax "invoice total must be greater than zero".

**Steps:**
1. Skip when PM; skip when no eligible project or no editable product fixture.
2. Open as Admin, `setAdhoc(true)`, select partner and project, skip if Duplicate Project! appears.
3. Select the editable product, fill description, quantity **0**, rate 100.
4. Assert Submit is disabled.

**Result:** **Pass** on Admin (26.2s); correctly **skipped** on PM. This is the first test to exercise the full chain — partner select, project select, product select, line fill — and it held. Adhoc does not bypass the total-greater-than-zero rule.

**Finding:** *Risk* retired for now: both fixtures resolved and the test ran for real. The underlying concern stands — if `beforeAll` token capture ever fails, this skips silently instead of failing.

---

## 4. Group 3 — Start with last invoice

Run: `... -g "Start with last invoice"`

**Group status: 1/1 pass on Admin (27.4s) — 2026-08-20, after a rewrite.** Log: `run-group3-admin.txt`.

### CI-003 — Start with last invoice prefills line items, not dates or invoice number

**Scenario:** The whole point of the option is the *line items*. Choosing "Start with last invoice" copies Product/Service, Description, Quantity and Rate from the project's previous invoice, while the dates stay on the current calendar month and the invoice number stays blank. So the test has to prove the copied rows are correct, not just that the dates were left alone.

**Steps (rewritten 2026-08-20):**
1. Skip without a Dataverse token or a `withLastInvoice` fixture.
2. Query Dataverse for that project's most recent non-Cancelled invoice dated before this calendar month, and read its Billing Info rows (`dia_invoicelineitemdetailses` → description, quantity, rate). Skip if it carries no rows.
3. Open Create Invoice, click **Start with last invoice**, assert it is checked.
4. Select the partner and project; skip on Duplicate Project!.
5. Assert the outcome is **not** `no-last-invoice` — the project provably has a previous invoice, so that toast would be a bug.
6. Poll until the form's row count equals the number of rows on the previous invoice.
7. Assert **zero** `Find items` buttons remain — every prefilled row must already carry a product.
8. Read every row back and assert the whole array equals the Dataverse rows: description, quantity and rate, in order.
9. Assert Service Start = month start, Service End and Invoice Date = month end, and Invoice number is empty — none of these may be inherited.

**Result:** **Pass** — Admin 27.4s. Prefill matched Dataverse exactly:

| | Description | Qty | Rate |
|---|---|---|---|
| Form after prefill | `Automation line item — Create Invoice suite` | 1 | 100 |
| Last invoice (2026-07-31) | `Automation line item — Create Invoice suite` | 1 | 100 |

Fixture resolved to `IDLA AUS / AUS GOV CONS`. Dates held at 8/1 → 8/31 and the invoice number stayed blank, so nothing leaked across from the source invoice.

**Finding:** The original gap is closed — the test previously checked only dates and the invoice number and could not have detected a prefill regression. Two caveats on the current result:

- The source invoice has **one** line item, so multi-row prefill and per-row ordering are still unproven. A source invoice with two or more differing rows would make step 8 much stronger.
- That source invoice was itself created by an earlier automation run (note the description). Real user data would be a better source, but the assertion is against whatever Dataverse actually holds, so it stays valid either way.

---

## 5. Group 4 — Contract validation

Run: `... -g "Contract validation"` (Admin)

**Group status: 2 pass, 2 fail on Admin (3.1m) — 2026-08-20.** Log: `run-group4-admin.txt`.
Fixture throughout: `IDLA AUS / AUS GOV CONS`, product `IT Retainer`. Date used as "one day past contract" was **11/1/2026**. That date is also the first day past the non-adhoc 3-month cap (from August: last allowed 10/31, first blocked 11/1), so contract coverage and the 3-month cap collide on this fixture.

### CI-009 — Active contract is applied for the selected project

**Scenario:** A project with exactly one active covering contract proceeds without a contract warning.

**Steps:**
1. Skip without an eligible fixture or partner options.
2. Click Brand New, select partner and project.
3. Assert the outcome is not `duplicate`.
4. Assert the "No active contracts found…" toast has count 0.

**Result:** **Pass** — Admin 24.2s. Partner IDLA AUS / project AUS GOV CONS selected; no no-contract toast; no Duplicate Project! popup.

**Finding:** *Risk* retired for this run — the eligible fixture is still clean. The hard `expect(outcome).not.toBe('duplicate')` is still stricter than its siblings, which skip.

### CI-011 — Invoice Date must fall inside the contract

**Scenario:** An Invoice Date outside the contract window blocks both Save Draft and Submit.

**Steps:**
1. Skip without eligible project / editable product / partner options.
2. Brand New, select partner and project, skip on duplicate, fill a valid line.
3. Read the covering contract end from Dataverse and set Invoice Date to the next day (`firstDayPastContract` → **11/1/2026**). Service Start/End stay at 8/1 and 8/31.
4. Observe whether a contract warning appears.
5. Assert Submit disabled, then Save Draft disabled.

**Result:** **Fail** on Admin (38.9s), then **skipped 2026-08-20** pending end-of-suite discussion. Screenshot: Invoice Date **11/1/2026**, Service End still 8/31/2026, no contract warning visible.

- Submit assertion **passed** (disabled).
- Save Draft assertion **failed** — the button stayed **enabled**.

**Finding:** Two overlapping rules fire on 11/1/2026 for this fixture, so this result does not isolate "Invoice Date vs contract":

1. If the AUS GOV CONS contract really ends 10/31/2026, then 11/1 is past the contract. Submit blocking is correct; Save Draft staying enabled is a product gap against the plan (the sheet says both buttons disable).
2. If the contract ends later than 11/1, then Submit disabled is the **3-month cap**, not contract coverage — and Save Draft not being capped is exactly what CI-052 exists to check (that case is about Service End, on PM).

Need the real contract end date for AUS GOV CONS before rewriting the assertion. I am not changing the test until you confirm which rule is supposed to disable Save Draft here.

### CI-012 — Service End Date must fall inside the contract (BUG 147908)

**Scenario:** Keep Invoice Date inside the contract, set Service End one day past contract end. Save Draft and Submit must stay disabled with Adhoc OFF and with Adhoc ON.

**Steps:**
1. Skip without fixtures / partner options.
2. Brand New; Admin forces Adhoc OFF.
3. Select partner and project, skip on duplicate, fill a valid line.
4. Set Service End to 11/1/2026 (Invoice Date follows it — CI-019).
5. Reset Invoice Date back to 8/31/2026 so only Service End is out of range.
6. Assert Submit and Save Draft disabled, then repeat with Adhoc ON.

**Result:** **Fail** on Admin (42.9s), then **skipped 2026-08-20** pending end-of-suite discussion. Screenshot after step 5: Service End **11/1/2026**, Invoice Date **8/31/2026**, Adhoc No. Submit stayed **enabled** — the test never reached the Adhoc-ON half.

**Finding:** CI-013, run immediately after, proved the same 11/1/2026 date **does** disable Submit when Invoice Date is allowed to follow Service End. So the picker applied the date correctly. The app then **re-enables Submit when Invoice Date is brought back inside 8/31**, even though Service End is still 11/1.

That is the BUG 147908 shape: Service End outside the window is not enough on its own. Either:

- **147908 is still open on DEV** (you said it was fixed — this run disagrees), or
- 11/1 is still inside the AUS GOV CONS contract, and Submit-disabled in CI-013 was only the 3-month cap on Invoice Date.

Same blocker as CI-011: we need the contract end date before calling this a product regression.

### CI-013 — Contract warning clears when dates are brought back in range

**Scenario:** The contract / date warning is not sticky — restoring valid dates re-enables Submit.

**Steps:**
1. Skip without fixtures / partner options.
2. Brand New, select partner and project, skip on duplicate, fill a valid line.
3. Set Service End to 11/1/2026 (Invoice Date follows), assert Submit disabled.
4. Restore Service Start 8/1, Service End 8/31, Invoice Date 8/31.
5. Assert Submit becomes enabled within 20s.

**Result:** **Pass** — Admin 30.8s. Out-of-range Service End disabled Submit; restoring calendar-month dates re-enabled it. This also proves the eligible fixture's contract covers August 2026.

**Finding:** Step 3 passing is what makes CI-012's failure meaningful — the out-of-range date is real. This case does not prove the warning *text* disappeared, only that Submit recovered.

---

## 6. Group 5 — Date validation

Run: `... -g "Date validation"` (Admin)

**Group status: 4 pass, 2 skip on Admin — 2026-08-20.** Logs: `run-group5-admin.txt`, `run-group5-ci019.txt`.
CI-006 / CI-020 / CI-021 and CI-052 skip on Admin by design (PM-only). CI-019 failed once on a closed date picker, then passed after `fillDateField` was taught to reopen it.

### CI-018 — Service Start must be before Service End

**Scenario:** Start on or after End is invalid and must block submission.

**Steps:**
1. Open Create Invoice.
2. Set Service Start to the 20th and Service End to the 10th of the current month.
3. Assert Submit and Save Draft are disabled.

**Result:** **Pass** — Admin 14.2s. Dates applied; both buttons disabled.

**Finding:** **Vacuous (still).** No partner, project, or line item is selected, so the buttons were already disabled. The date helper did apply 8/20 then 8/10, but this would pass even if the start-before-end rule were deleted. Toast is still not asserted.

### CI-019 — Invoice Date follows Service End Date

**Scenario:** Changing Service End drags Invoice Date with it.

**Steps:**
1. Open Create Invoice.
2. Set Service End to the 20th of this month.
3. Assert Invoice Date now reads the 20th.

**Result:** **Pass** — Admin 10.5s on retry (first attempt timed out 2.1m waiting for a closed Pikaday). Invoice Date followed Service End to 8/20/2026.

**Finding:** First-run failure was the helper, not the product: the calendar button click did not leave `.pika-single` visible. `fillDateField` now reopens the picker if it is hidden. The follow-Invoice-Date rule itself is confirmed.

### CI-006 / CI-020 / CI-021 — Non-adhoc 3-month future limit for PM

**Scenario:** A non-adhoc invoice cannot be dated more than three months ahead; at the boundary it is allowed, one day past it is blocked with a red banner.

**Steps:**
1. Skip on Admin; skip without fixtures / partner options.
2. Brand New as PM, select partner and project, skip on duplicate, fill a valid line.
3. Set Invoice Date to `cap.lastAllowed` (last day of month +3), expect Submit enabled — wrapped in `.catch()`.
4. Set Invoice Date to `cap.firstBlocked` (next day), assert Submit disabled.

**Result:** **Skipped** on Admin (PM-only). Not run on PM yet.

**Finding:** *Weak,* plus a blocker. The positive half in step 3 is swallowed by `.catch(() => undefined)`, so only the negative half really asserts. More importantly this cannot run today: the PM account has **no partners visible on DEV**, so `partnerComboHasOptions` skips the test. The plan also expects the red banner to be asserted; only button state is checked.

### CI-052 — Save Draft disabled when non-adhoc Service End exceeds the 3-month cap

**Scenario:** The cap applies to Save Draft too, not just Submit.

**Steps:**
1. Skip on Admin; skip without fixtures / partner options.
2. Brand New as PM, select partner and project, skip on duplicate, fill a valid line.
3. Set Service End to `cap.firstBlocked`.
4. Assert Save Draft is disabled.

**Result:** **Skipped** on Admin (PM-only). Not run on PM yet.

**Finding:** *Blocked.* Same PM-has-no-partners problem — will skip on DEV until PM is granted a project.

### CI-073 — Custom service dates survive Partner selection

**Scenario:** Regression guard: selecting a Partner must not reset dates the user already customised.

**Steps:**
1. Skip without eligible project / partner options.
2. Set Service Start to the 15th and Service End to the 20th.
3. Select the partner.
4. Assert both dates are unchanged.

**Result:** **Pass** — Admin 15.9s. Custom 8/15 and 8/20 survived selecting partner IDLA AUS.

**Finding:** None. Good, focused regression test.

### CI-074 — Browser refresh clears unsaved form to defaults

**Scenario:** Nothing is persisted client-side; a refresh returns a clean form.

**Steps:**
1. Open Create Invoice, type into the Internal Notes rich-text area if present.
2. `page.reload()`, then reopen Create Invoice.
3. Assert Service Start = month start, Invoice Date = month end, Find Partner visible again.

**Result:** **Pass** — Admin 19.9s. After reload, dates returned to 8/1 and 8/31 and Find Partner was empty again.

**Finding:** *Gap.* It never asserts the notes text is gone, which is the actual "unsaved data is cleared" claim. It only re-checks the date defaults.

---

## 7. Group 6 — Partner and Project

Run: `... -g "Partner and Project"` (Admin)

**Group status: 2 pass, 1 skipped (`fixme`) on Admin — 2026-08-20.** Logs: `run-group6-admin.txt`, `run-group6-ci023b.txt`.

### CI-022 — Partner is required

**Scenario:** No partner means no submission.

**Steps:**
1. Open Create Invoice.
2. Assert Find Partner is visible (i.e. nothing selected).
3. Assert Submit and Save Draft disabled.

**Result:** **Pass** — Admin 12.7s.

**Finding:** **Vacuous (still).** Untouched form; buttons are disabled for many reasons at once. Does not isolate Partner as the missing field.

### CI-023 — Project list filters by selected Partner

**Scenario:** The Project combo only offers projects belonging to the chosen partner.

**Steps:**
1. Skip without eligible project / partner options.
2. Select Partner IDLA AUS, click **Find Project**.
3. Assert the option list is visible and contains **AUS GOV CONS**.
4. Assert HP Inc.'s project (`HP ITSM MPS QA`) is **not** in the list.
5. Screenshot the open option list (not the Partner button — the dropdown covers it).

**Result:** **Pass** — Admin 18.6s after a screenshot-locator fix. First two runs failed in `markGroupAndShot` while the dropdown was open (Partner / Find Project names change). The filter assertion itself held.

**Finding:** Live list for IDLA AUS showed **AUS GOV CONS** and **IDLA AUS T1** — both look like that partner's projects; HP's project was absent. The `if (visible)` swallow is gone.

### CI-024 / CI-025 / CI-026 — Free text and clearing Partner/Project keep buttons disabled

**Scenario:** Typing a partner name without picking from the list must not count as a selection.

**Steps:** Marked `test.fixme(true)` — never executes. The body types `zzzz-not-a-real-partner` into the Partner search, clicks away, and asserts both buttons stay disabled.

**Result:** **Skipped** by design (`fixme`) — confirmed on this run.

**Finding:** Correct per the plan — the sheet flags this defect as not yet fixed. Revisit when the combo free-text defect is closed.

---

## 8. Group 7 — Line items

Run: `... -g "Line items"` (Admin). Note: that grep also picked up CI-003 (title contains "line items"); it passed again and is not counted twice here.

**Group status: 8/8 line-item tests pass on Admin — 2026-08-20.** Logs: `run-group7-admin.txt`, `run-group7-ci034c.txt`.
CI-034 needed three locator/confirm fixes; the last run passed in 24.1s.

### CI-027 — At least one complete line item is required

**Scenario:** A header without a usable line item cannot be submitted.

**Steps:**
1. Open Create Invoice.
2. Assert Submit and Save Draft disabled.

**Result:** **Pass** — Admin 22.7s.

**Finding:** **Vacuous (still).** Blank form; same fact as CI-018 / CI-022.

### CI-028 / CI-029 — Add new item appends a blank row without copying the previous product

**Scenario:** The gallery-recycling regression — row 2 must not inherit row 1's product.

**Steps:**
1. Skip without editable product.
2. Select IT Retainer on row 1, read `getLineItemCount()` into `before`.
3. Click **Add new item**.
4. Poll until the description-row count is greater than `before`.
5. Assert the last **Find items** button is visible.
6. Assert the last row's description is empty.

**Result:** **Pass** — Admin 23.7s. Row 2 arrived as Find items + empty description. The `getLineItemCount()` fix held.

**Finding:** Does not yet assert that row 1 still shows IT Retainer after add (only that row 2 is blank). Good enough for the recycling regression.

### CI-030 — Preset-rate product fills Rate immediately

**Scenario:** A non-editable/fixed-rate product populates Rate without the user entering quantity first.

**Steps:**
1. Skip without a non-editable product fixture.
2. Select Abundance Coaching.
3. Assert the rate box is not `0.00`, falling back in `.catch()` to asserting it is not empty.

**Result:** **Pass** — Admin 22.7s.

**Finding:** *Weak* `.catch()` remains — we did not record the actual preset rate.

### CI-031 / CI-048 — Quantity or rate of zero blocks submit

**Scenario:** Zero quantity, or a zero invoice total, blocks submission.

**Steps:**
1. Skip without editable product.
2. Select IT Retainer; fill description, quantity **0**, rate 100.
3. Assert Submit and Save Draft disabled.

**Result:** **Pass** — Admin 27.9s.

**Finding:** *Vacuous-adjacent (still).* No partner/project selected. Rate-zero half of CI-048 still not exercised.

### CI-032 — Line total equals Quantity × Rate

**Scenario:** Row total is computed as qty × rate and rendered with a currency symbol.

**Steps:**
1. Skip without editable product.
2. Select IT Retainer; fill description, quantity 2, rate 100.
3. Assert some element matching `/(?:\$|₹)\s*[1-9]\d*/` is visible.

**Result:** **Pass** — Admin 40.2s.

**Finding:** *Gap (still).* Does not assert the total is **200**. Group 4 screenshots showed `AUS 200` for qty 2 × rate 100, so the arithmetic is likely right, but this test still does not prove it.

### CI-034 — Deleting a line item removes only that row

**Scenario:** Deleting row 2 leaves row 1's data intact and recalculates the total.

**Steps:**
1. Select IT Retainer on row 1, click **Add new item**, wait for two description rows.
2. Click the unnamed trash Icon on the last gallery `listitem` (right-edge click — no accessible name).
3. Confirm **Really delete?** → **Continue**.
4. Poll until the description-row count drops.

**Result:** **Pass** — Admin 24.1s after three test-side fixes (not a product bug):
1. `getByRole('img', { name: /delete/i })` matches nothing — the control is an unnamed Icon.
2. Clicking it opens a **Really delete?** dialog; Continue is required.
3. Screenshot must not look for **Find items** on the remaining row (it still shows IT Retainer).

**Finding:** *Gap.* Still does not assert that row 1's product/description survived. The confirm dialog is a live product detail the original plan did not mention.

### CI-035 / CI-036 — Empty or incomplete line item blocks submit

**Scenario:** A blank extra row invalidates an otherwise-complete invoice.

**Steps:**
1. Brand New, select IDLA AUS / AUS GOV CONS, fill a valid line.
2. Click **Add new item**.
3. Assert Submit is disabled.

**Result:** **Pass** — Admin 38.2s.

**Finding:** Still no "Submit was enabled before adding the blank row" assertion, but the rest of this group plus CI-049-style fills make that likely.

### CI-038 — Rate accepts at most 4 decimal places

**Scenario:** Rate precision is capped at four decimals.

**Steps:**
1. Select IT Retainer, assert the rate box is editable.
2. `.fill('10.12345')`, Tab, read the value back.
3. Record the observed value; assert only that the field is non-empty.

**Result:** **Pass** as an observation — Admin 23.5s. Annotation: entered `"10.12345"`, field showed `"0"`.

**Finding:** That is **not** truncation to four decimals (that would be `10.1234`). Either Canvas rejected the extra precision and reset the field, or `.fill()` did not stick (other rate tests use `pressSequentially` as fallback). Do not encode a 4-decimal rule until we retry with the same typing path as `fillLineItem`. Parked with CI-011/CI-012 for end-of-suite discussion.

---

## 9. Group 8 — Tax North America

Run: `... -g "Tax North America"` (Admin)

**Group status: 3/3 pass on Admin — 2026-08-20.** Logs: `run-group8-admin.txt`, `run-group8-ci040.txt`.
NA fixture: `AOC / Home Publishing`. Non-NA: `IDLA AUS / AUS GOV CONS`.

### CI-039 — Tax is optional for NA invoices

**Scenario:** North America projects expose Find Tax, but an invoice can be submitted without a tax selection.

**Steps:**
1. Brand New, select AOC / Home Publishing, fill a valid line, leave tax blank.
2. Soft-assert **Find Tax** is visible.
3. Assert Submit is enabled.

**Result:** **Pass** — Admin 39.3s. Submit enabled with no tax chosen.

**Finding:** *Gap (still).* Did not assert Total equals Subtotal when tax is blank.

### CI-040 / CI-041 — Selecting tax shows Subtotal, Sales Tax and Grand Total

**Scenario:** Choosing a tax rate reveals the three-line total breakdown with correct arithmetic.

**Steps:**
1. Brand New, select AOC / Home Publishing, fill qty 2 × rate 100 (line total $200).
2. Open Find Tax, pick the first option.
3. Assert **Subtotal** and **Sales Tax** labels are visible.
4. Screenshot those labels (not Find Tax — the button name becomes the selected tax).

**Result:** **Pass** — Admin 28.6s after a screenshot-locator fix. First run already applied the tax; `markGroupAndShot` still looked for **Find Tax**.

Live values from the failed-run screenshot (same flow):

| | Amount |
|---|---|
| Line / Subtotal | $200.00 |
| Tax | Tucson(9.10%) |
| Sales Tax | $18.20 |
| Total | $218.20 |

200 × 9.10% = 18.20, 200 + 18.20 = 218.20 — the arithmetic matches. The automated assertion still only checks the labels, not the numbers.

**Finding:** Product behaviour is correct. Test coverage of the maths is still visual/manual unless we parse the selected percent next.

### CI-040b — Tax control is absent for Non-NA projects

**Scenario:** Find Tax is North America only.

**Steps:**
1. Brand New, select IDLA AUS / AUS GOV CONS.
2. Assert **Find Tax** has count 0.

**Result:** **Pass** — Admin 34.5s.

**Finding:** None. Clean negative assertion.

---

## 10. Group 9 — Duplicate, Submit, Save Draft, Close

Run: `... -g "Duplicate Submit Save Draft Close"` (Admin) — **this group writes real records to Dataverse.**

**Group status: 5 pass, 1 skipped (CI-051 deferred) — 2026-08-20.** Log: `run-group9-admin.txt`.
CI-050 created a Draft on IDLA AUS / AUS GOV CONS, so later fixture reloads moved `eligibleNonAdhoc` to AOC projects. CI-075 then submitted on that new eligible project.

### CI-046 / CI-047 — Duplicate Project popup for the same project in the same month

**Scenario:** A second non-adhoc invoice for the same project in the same window raises **Duplicate Project!**, and Verify navigates to the existing invoice.

**Steps:**
1. Brand New, select HP Inc. / HP ITSM MPS QA (duplicate fixture).
2. If the popup appears: assert title and **Verify**, click Verify, land on Invoice Overview.

**Result:** **Pass** — Admin 32.3s. The popup appeared; Verify navigated to Overview. The weak "pass if popup missing" branch was not taken.

**Finding:** The skip-if-absent branch is still in the code. This run did not exercise it.

### CI-049 — Submit enables when all validations pass

**Scenario:** A fully valid form enables Submit.

**Steps:**
1. Brand New, select eligible partner/project, fill a valid line.
2. Assert Submit is enabled.

**Result:** **Pass** — Admin 44.8s. Still used IDLA AUS / AUS GOV CONS (before the Draft was saved).

**Finding:** None. This is the gate for Submit-related cases.

### CI-050 — Save Draft saves as Draft and returns to Overview

**Scenario:** Save Draft persists a Draft record and returns to Overview.

**Steps:**
1. Fill required fields, count Drafts in Dataverse, click Save Draft.
2. Assert Invoice Overview; poll until Draft count increases.

**Result:** **Pass** — Admin 38.7s. Draft count for AUS GOV CONS increased; Overview showed Draft.

**Finding:** Created a real Draft. The next worker then treated AUS GOV CONS as ineligible (duplicate window), so later tests switched to AOC projects. Expected with "create DEV data is fine."

### CI-051 — Adhoc Save Draft allows future dates inside contract

**Scenario:** Adhoc bypasses the 3-month cap as long as the contract still covers the date.

**Steps:**
1. Admin, Adhoc ON, select partner/project, fill a line.
2. Set Service End to 11/1/2026 (`cap.firstBlocked`).
3. Assert Save Draft enabled — or skip if disabled.

**Result:** **Fail** twice, then **skipped 2026-08-20** pending end-of-suite discussion.

1. First run: after Adhoc ON, a **Sign in required / Please select sign in to continue** overlay sat on the form. Find Partner clicks hit the Fluent overlay until the 120s timeout.
2. Retry: overlay gone, Find Partner clicked, but **no partner options** appeared (Adhoc Yes, combo empty).

**Finding:** Did not reach the Save Draft / future-date assertion. Adhoc ON is triggering a connector sign-in prompt that the suite does not handle (and must not click **Sign in** — that is login). Same parking lot as CI-011 / CI-012.

### CI-064 — Close returns without saving

**Scenario:** Close abandons the form with no record created.

**Steps:**
1. Open Create Invoice, Brand New, click Close.
2. Assert New Invoice is gone; land on Dashboard or Overview.

**Result:** **Pass** — Admin 29.1s.

**Finding:** *Gap (still).* Navigation only; no Dataverse before/after count.

### CI-075 — Overview gallery shows submitted invoice after Submit

**Scenario:** Submit a valid invoice; Overview shows Submitted or Pending.

**Steps:**
1. Fill eligible form, click Submit, wait for toast + Overview.
2. Assert a Submitted/Pending row.

**Result:** **Pass** — Admin 37.8s. Ran after fixtures reloaded; eligible was then an AOC project (Home Publishing on the first worker restart). A real Power Automate flow was started.

**Finding:** Creates data and consumes that project's duplicate window for the rest of the billing cycle. Accepted as-is.

---

## 11. Group 10 — Edit draft and flagged

Run: `... -g "Edit draft and flagged"` (Admin)

**Group status: 1 pass, 1 skipped — 2026-08-20.** Live product detail: the edit screen heading is **Edit Invoice**, not New Invoice.

### CI-062 / CI-063 — Edit an existing Draft and Save Draft updates the same record

**Scenario:** Editing a Draft hydrates the form and saving updates that record rather than creating a second one.

**Steps:**
1. Open Create Invoice, go to Invoice Overview, select **All Invoices** if present.
2. Click the first Next Step **Edit**.
3. Wait for heading **Edit Invoice**.
4. Overwrite the description; if Save Draft is enabled, click it and wait for Overview.

**Result:** **Pass** — Admin 31.0s after two test-side fixes:
1. First run skipped — no button named exactly `^Edit$`. Next Step matches `/^Edit/`.
2. Second run opened the form but waited for **New Invoice**. The heading is **Edit Invoice**. Invoice # `2026-0352` was populated; partner AOC / Home Publishing; line IT Retainer qty 2 × $100.

**Finding:** *Gap (still).* Does not capture the record id or prove no second invoice was created. It clicks the first Edit on the gallery, which may not be a Draft. Hydration is proven.

### CI-057 — Flagged invoice can be edited and resubmitted

**Scenario:** A Flagged invoice returns to the submitter, who edits and resubmits it.

**Steps:**
1. Open Overview (All Invoices).
2. Skip if no Flagged text; skip if no Edit.

**Result:** **Skipped** — no Flagged invoice on Overview. No Flagged fixture in the Dataverse loader.

**Finding:** Expected skip until a Flagged row exists. When it is added, wait for **Edit Invoice**, not New Invoice.

---

## 12. Cross-cutting findings

These affect many tests at once and are worth fixing before we spend runs on individual groups.

1. ~~**`getLineItemCount()` is not a stable row count**~~ — **fixed 2026-08-20.** It now counts description placeholders only. Unblocks CI-028/029 and CI-034.
2. **Blank-form assertions are vacuous** — CI-018, CI-022, CI-027 and partly CI-031/048 all assert "Submit is disabled" on an untouched form. Four tests, one trivial fact, no coverage. Each should build a valid form and then introduce exactly one defect.
3. **`.catch(() => undefined)` on hard assertions** — CI-006/020/021, CI-011, CI-030, CI-039, CI-040/041. A failing assertion becomes a pass. Either assert properly or drop the check.
4. **Pikaday year range** — any date beyond roughly ±10 years silently becomes a different date. Affects CI-011, CI-012, CI-013. Acceptable for "far future" intent, but the code and the doc should say 2036, not 2099.
5. **Skip-on-failure patterns** — CI-051 and, to a lesser degree, CI-046/047 skip or pass exactly where they should fail. They cannot report a regression.
6. **PM coverage is blocked on DEV** — the PM account sees no partners, so every partner-dependent PM test skips. Today PM meaningfully covers only CI-001, CI-011b, CI-007, CI-043, CI-002 and the date-default cases. CI-006/020/021 and CI-052 are PM-only *and* partner-dependent, so they cannot run at all until PM is granted a project.
7. **`partnerComboHasOptions()` opens the Partner dropdown and closes it by clicking the heading** — if the overlay does not dismiss, the following `selectPartner` click can land on the overlay. A plausible source of flake across roughly 15 tests.
8. **Data accumulation** — CI-050 and CI-075 write real records on every run. Accepted as-is on 2026-08-20: creating DEV data is fine. The practical consequence still stands — once CI-075 submits for the eligible project, CI-009, CI-013, CI-049 and CI-050 will hit **Duplicate Project!** and skip for the rest of that billing window, so group 9 gives a full result only on its first run each cycle.

---

## 13. Planned but not generated

| Case | Plan § | Scenario | Why it is missing |
|---|---|---|---|
| CI-005 | §2.4 | Adhoc bypasses the 3-month future cap when the contract covers the date | Needs a project whose contract extends 4+ months out. No such fixture exists, and the Pikaday year range makes an arbitrary far date unreliable. |
| CI-008 | §4.1 | No active contract → "No active contracts found for the selected project" toast, buttons stay disabled | No `projectWithNoActiveContract` fixture in `dataverse-fixtures.ts`. |
| CI-010 | §4.3 | Inactive contracts are not treated as covering | Same missing fixture — needs a project with only inactive contracts. |
| CI-014 | §4.7 | Multiple active contracts prompt the user to choose | No multi-contract project on DEV; the plan already allowed skipping. |
| CI-033 | §7.6 | Discount product produces a negative line total and reduces the grand total | No Discount product type surfaced by the product fixture loader. |

CI-008 and CI-010 are the two I would most want back — they are pure validation cases with no flow side effects, and they only need one seeded project each.

---

## 14. Decisions and open questions

### Answered 2026-08-20

| # | Question | Decision | Applied |
|---|---|---|---|
| 1 | CI-011 used twice | The Adhoc case becomes **CI-004b**; CI-011 stays with the contract case | Spec, plan §2.3 + mapping table, this document |
| 2 | Is BUG 147908 fixed in DEV? | Originally "fixed". Live Admin run 2026-08-20: CI-012 failed (Submit stayed enabled). **Skipped pending end-of-suite discussion.** | `test.skip` on CI-011 and CI-012 |
| 3 | CI-038 rate precision | Do not guess — observe the live value first, then write the assertion | CI-038 now records an `observed` annotation and asserts only non-empty |
| 4 | CI-050 / CI-075 creating DEV data | **Acceptable as-is**, no cleanup | No code change; consequence noted in §12.8 |

### Still open

5. **CI-008 / CI-010 fixtures** — I need a DEV project with no active contract, and one with only inactive contracts. With those two names I can add both cases, and they are the two most worth recovering since they are pure validation with no flow side effects.
6. **PM partners** — is Rashwanth expected to get a project on DEV? Until then roughly a dozen PM tests can only skip, including CI-006/020/021 and CI-052, which are PM-only *and* partner-dependent.
7. **CI-011 / CI-012 (deferred to end of suite)** — On AUS GOV CONS, 11/1/2026 is both "contract end + 1" and the first day past the 3-month cap. Need the real contract end date, and a decision on whether Save Draft should disable when only Invoice Date is out of range, and whether Service End out of range should disable Submit when Invoice Date is still in range (147908).
8. **CI-038 rate precision** — typing `10.12345` then Tab left the field showing `0`, not `10.1234`. Confirm whether Canvas rejects extra decimals (reset) or whether `.fill()` failed; then write the real assertion.
9. **CI-051 Adhoc Save Draft future date** — Adhoc ON raised a **Sign in required** overlay, then on retry Find Partner had no options. Do not click Sign in (that is login). Revisit with a stable connector session.

---

## 15. Proposed run order

Cheapest and most diagnostic first. Read-only groups before anything that writes.

| Order | Group | Persona | Writes data | Why here |
|---|---|---|---|---|
| 1 | Page load and defaults | Admin, then PM | No | Proves auth, iframe, and the role matrix. If this fails nothing else is trustworthy. |
| 2 | Role access Adhoc | Admin, then PM | No | Confirms the persona split end to end. |
| 3 | Partner and Project | Admin | No | Confirms fixtures resolve and the combo behaves. |
| 4 | Line items | Admin | No | Will expose the `getLineItemCount` defect immediately. |
| 5 | Date validation | Admin | No | Exercises the reworked Pikaday helper hardest. |
| 6 | Contract validation | Admin | No | Depends on the date helper being proven in step 5. |
| 7 | Tax North America | Admin | No | Needs the NA fixture. |
| 8 | Start with last invoice | Admin | No | Depends on prior-invoice data. |
| 9 | Duplicate Submit Save Draft Close | Admin | **Yes** | Run only after everything read-only is green. |
| 10 | Edit draft and flagged | Admin | **Yes** | Needs Drafts, which group 9 will have produced. |

Every run needs the browser path set first, otherwise Playwright looks in a temp sandbox that does not exist on this machine:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:USERPROFILE\AppData\Local\ms-playwright"
npx playwright test tests/Create-Invoice-complete.spec.ts --project=chromium-admin --retries=0 -g "Page load and defaults"
```

As each group finishes, its Result cells above get replaced with `Pass`, `Fail — <reason>`, or `Skipped — <reason>`.

# Invoice Overview — items that need your explanation

**Date:** 2026-08-26  
**Screen:** Invoice Overview  
**Source sheet:** `specs/Invoice_Overview_Test_Cases.md` (IO-001 … IO-042)

Use this file as the review list. For each item: **title**, **steps (as I would automate)**, **what I understood**, **what is blocking / wrong**. Cases I am already clear on are listed at the bottom so you can skip them.

---

## Confirmed (no explanation needed on this point)

**Send instant Invoices to Client** is **not** the Create Invoice form toggle.

| | |
|--|--|
| Who | **Admin only** |
| Where | Invoice Overview gallery |
| When | Invoice **Status = Approved** |
| How | Row **⋮** (three dots) → **Send Instantly** (paper-plane, blue) |
| Flow | **Send instant Invoices to Client** |

From your screenshot of an Approved row menu:

1. **Send Notification** (bell)
2. **Cancel Invoice** (red)
3. **Send Instantly** (blue)

Next Step on that row stays **View**. After Send Instantly I assume status becomes **Sent**, but that is **not** confirmed — see C-13 below.

The Create Invoice form still has a **Send Instantly** Yes/No toggle. That is a **different** control. I will **not** treat it as this Overview menu action.

---

## Confusion cases

### C-01 — IO-004 / IO-006: Quarter to Date and Year to Date windows

- **Sheet title:** Quarter to Date / Year to Date filter works correctly  
- **Sheet expected:** QTD = “rolling last ~4 months”; YTD = “rolling last year”  
- **Steps I would automate:**
  1. Open Invoice Overview.
  2. Open Show Invoices.
  3. Select **Quater to Date** (app spelling), then **Year to Date**.
  4. Compare visible invoice dates to Dataverse `dia_invoicedate`.
- **What I understood:** Product rules (`50-app-functionality`) say QTD/YTD are **calendar** quarter/year, not rolling windows. Live dropdown uses **Quater**.
- **Problem:** If I assert the sheet’s rolling window, the test will fail against the live app. If I assert calendar, I disagree with the Excel. **Which date range should automation use?**

---

### C-02 — IO-009: Future Months vs This Month overlap

- **Sheet title:** Future month invoice does not appear in This Month filter  
- **Sheet steps:** Invoice dated e.g. Aug 6 while “today” is July; This Month must **not** show it; Future Months **must**.  
- **What I understood:** Billing cycle is 6th → 5th. On calendar days 1–5, “This Month” already points at the *upcoming* cycle. IO-009 is the known overlap bug (`dia_Start` +1 vs +6).
- **Problem:** I do not know whether that bug is **still open on DEV**, whether we should **fail** (regression) or **pass** (fixed), or how you want the seed invoice dated relative to “today”. I will not invent a dated fixture until you say pass vs fail.

---

### C-03 — IO-019: Status column sort order

- **Sheet title:** Status column sorts correctly  
- **Steps:** Click Status header once (maybe twice). Read status pills.  
- **What I understood:** Partner first header icon looked like **sort** (order changed). Status also has two unlabeled icons (sort + filter?).
- **Problem:** Is sort **A–Z on the word** (Approved, Flagged, Sent…) or **lifecycle order** (Draft → Submitted → Reviewed → Approved → Sent)? I will assert the wrong order if I guess.

---

### C-04 — IO-020 / IO-021 / IO-022 / IO-042: Column filter vs sort

- **Sheet titles:** Partner / Status / Action Pending With **filter**; Partner filter values alphabetical  
- **Steps (sheet):** Click **filter icon** on the column → pick a value → gallery shrinks. IO-042: that list is A–Z.  
- **What I understood:** Each of Partner / Project / Status has **two** clickable images. Invoice # and Action Pending With have **one**. My first Partner-icon click **reordered rows** (sort), it did **not** open a filter list.
- **Problem:** I cannot tell which icon is filter. I never saw a Partner/Status checkbox list. **Which icon is filter, and what does the filter UI look like** (combo, checkboxes, search)? Until then IO-020–022 and IO-042 stay blocked.

---

### C-05 — IO-027: Report for which Fail-* statuses?

- **Sheet title:** Report button visible for Fail-Creation  
- **Steps:** Find Fail-Creation → Next Step is **Report**.  
- **What I understood:** Product table maps **all** Fail-Creation / Fail-Update / Fail-Flag / Fail-Approval / Fail-Review → **Report**. Live page 1 showed Fail-Creation → Report.
- **Problem:** Should the test require Report on **every** Fail-* , or **only Fail-Creation** as the sheet says? Same for **who** can click Report (Admin only vs PM on own fail).

---

### C-06 — IO-029 / IO-030: PDF chrome (zoom, download, search)

- **Sheet title:** PDF viewer shows navigation and zoom; Download saves the file  
- **Steps:** Review → assert page up/down, `1/1`, zoom +/−, search, download, close X. Click download → file on disk.  
- **What I understood:** Overlay title is **View Invoice**, not “PDF viewer”. Nested iframe shows the invoice. Chrome buttons are **unlabeled images**. Right header icon closed the overlay; left header icon might be download.
- **Problem:** I cannot map sheet names (zoom, search, download) to those images without clicking them. Download may be the **Power Apps host** Download button, not the overlay. **Which control is Download, and should IO-030 click the overlay icon or the host bar?**

---

### C-07 — IO-032 (a) vs IO-032 (b): duplicate ID + Approve PDF

- **Sheet titles:** (a) PDF loads without error on Review **or Approve**; (b) three-dot shows Delete Draft  
- **Steps (a):** Review a Submitted PDF; close; Approve a Reviewed PDF; both without error screen.  
- **What I understood:** Review overlay works (TC-IO-20). I have **not** opened **Approve**. Duplicate ID in the Excel.
- **Problem:** Is Approve the **same View Invoice overlay** (Flag + a **Approve** button instead of Mark as Reviewed)? Any extra confirm popup? Also: **keep both IDs or renumber 032b?**

---

### C-08 — IO-032b / IO-033 / IO-034: Delete Draft three-dot

- **Sheet title:** Menu shows Delete Draft; confirm popup; confirm removes the row  
- **Steps:** Draft row → ⋮ → Delete Draft → popup → confirm → row gone (and Dataverse deleted?).  
- **What I understood:** Three-dot exists (your Approved screenshot). I did not open it on a **Draft** row (click timed out earlier). Draft Next Step is **Edit** (same as Flagged).
- **Problem:** Exact menu label (**Delete Draft** vs Delete)? Popup buttons? Does **refresh** need to be clicked before the row disappears? Hard-delete vs status change?

---

### C-09 — IO-035 / IO-036: Cancel Invoice

- **Sheet title:** Cancel visible on Approved (BDU only); cancel + reason → Cancelled  
- **Sheet preconditions (035):** Submitted, Reviewed, **and** Approved exist — but steps only open ⋮ on **Approved**.  
- **Steps I would automate:** Admin → Approved ⋮ → **Cancel Invoice** → enter reason → confirm → refresh → **Cancelled**.  
- **What I understood:** Your screenshot shows **Cancel Invoice** on Approved ⋮ (Admin). Flow **Project Invoice (M): Cancel flow run for approved invoice** is On.  
- **Problem:**
  1. Is Cancel on **Submitted / Reviewed** as well, or **Approved only**?
  2. Does **PM** see Cancel Invoice on their own Approved row, or Admin-only?
  3. Is reason **required**? What happens if blank?
  4. After cancel, do we wait on that Cancel flow, then refresh?

---

### C-10 — Overview ⋮ **Send Notification** (not in the Excel)

- **Title (observed):** Send Notification on Approved ⋮  
- **Steps (guess):** Admin → Approved ⋮ → Send Notification.  
- **What I understood:** Extra menu item next to Cancel / Send Instantly. Not IO-001–042.  
- **Problem:** **What does it do? Which flow? Who can see it (Admin only)?** Skip until you describe it, or add a new IO id?

---

### C-11 — Create Invoice **Send Instantly** toggle vs Overview **Send Instantly**

- **Title:** Two different “Send Instantly” features  
- **Create Invoice steps:** On New Invoice, turn toggle **Yes**, fill form, Submit.  
- **Overview steps (confirmed):** Approved ⋮ → Send Instantly → **Send instant Invoices to Client**.  
- **What I understood:** They are different. Catalog also has **Notify for Immediate send Invoices** (On, **zero** `flowruns` in DEV).  
- **Problem:** When the **Create form** toggle is Yes, which flow runs (if any)? **Notify for Immediate send Invoices**, **Send instant Invoices to Client**, both, or none until Overview ⋮ is used? I will not wire the form toggle to **Send instant Invoices to Client**.

---

### C-12 — IO-037 / IO-039: Flag from Review (comments + flow)

- **Sheet title:** Reviewer can Mark as Reviewed / Flag / close; Flag sends email to submitter  
- **Steps:** Submitted → Review → View Invoice → **Flag** (maybe comments) → close → refresh → **Flagged** + **Edit**. Flow: **NotifyInvoiceInitiator**.  
- **What I understood:** Overlay has Flag, Mark as Reviewed, **Comments**, Internal Notes. Close-without-action leaves Submitted.  
- **Problem:**
  1. Must **Comments** be filled before Flag / Mark as Reviewed?
  2. Does Flag also start **Handle Post Submitted Tasks**, or only NotifyInvoiceInitiator?
  3. Should we assert **email body**, or only the flow **Succeeded** run?

---

### C-13 — Overview Send Instantly after Approved (new vs sheet)

- **Title:** Admin sends an Approved invoice to the client from ⋮  
- **Steps I would automate:**
  1. Login Admin, Invoice Overview.
  2. Find **Approved**, Next Step **View**.
  3. Open ⋮ → **Send Instantly**.
  4. Handle any confirm popup (unknown).
  5. Click Overview **refresh**.
  6. Expect **Send instant Invoices to Client** Succeeded in the time window.
  7. Expect status **Sent** (?) and Next Step still **View**.
- **What I understood:** Admin-only; not the Create toggle; flow name as above.  
- **Problem:** Confirm popup? Status after success (**Sent** or still **Approved**)? Can PM see the menu item (hidden vs visible-disabled)? Does **Send Notification** have to be used first? Any Fail-* if the flow errors?

---

### C-14 — IO-038 / IO-040: Approve overlay and Flag from Approve

- **Sheet title:** Approver confirms → Approved; can also Flag a Reviewed invoice  
- **Steps:** Reviewed → **Approve** → (confirm?) → refresh → Approved + View. Or Approve overlay → Flag → Flagged + NotifyInvoiceInitiator.  
- **What I understood:** Same pattern as Review, but I have **not** opened Approve (no Reviewed row when I explored).  
- **Problem:** Button labels on that overlay (**Approve** vs **Mark as Approved**)? Confirm dialog? Same PDF iframe? Does Approve start **Handle Post Submitted Tasks** or only a status patch?

---

### C-15 — IO-025 + Flagged resubmit: Draft Edit vs Flagged Edit

- **Sheet title:** Edit on Draft and Flagged; resubmit is CI-057  
- **Steps (Flagged):** Flagged → Edit → change line → Submit → refresh → **Update Invoice - NA Region** or **Update Invoice - Other Region** by project region.  
- **What I understood:** Both statuses show **Edit**. Flagged Submit uses the **Update** parents (now confirmed On). Draft Save Draft / Submit may still be Create, not Update.  
- **Problem:** Does **Draft → Submit** (first time from a saved draft) fire **Create** or **Update**? I must not assert Update on a brand-new Draft submit.

---

### C-16 — IO-041: Decimals on Overview gallery

- **Sheet title:** Rate and Total limited to 4 decimal places on the gallery  
- **Steps:** Look at an Overview row with decimal amounts.  
- **What I understood:** Gallery columns are Partner, Project, Invoice #, Action Pending with, Status, Next Step. **No Rate/Total on the row.** PDF inside View Invoice showed `1.00` / `₹50.00`.  
- **Problem:** Is IO-041 **wrong for Overview**, and should it be a **PDF/View Invoice** check instead? If amounts appear somewhere on Overview (tooltip, extra column on scroll), where?

---

### C-17 — **Handle Post Submitted Tasks** — which UI action?

- **Title:** When does **Project Invoice (M): Handle Post Submitted Tasks** run?  
- **Steps (unknown):** Could be after Submit, Review, Approve, Flag, or resubmit.  
- **What I understood:** Flow is On; many Succeeded runs. It often sits near NotifyInvoiceInitiator and Update NA in time, but I did not pair a run to one click.  
- **Problem:** **List the Overview/Create actions that must start this flow.** I will not attach it to every test.

---

### C-18 — IO-043 / IO-044 / IO-045: missing sheet rows

- **Title:** No content in the source document  
- **Steps:** None  
- **What I understood:** Placeholders.  
- **Problem:** Drop them, or did you mean new cases (Send Instantly ⋮, Send Notification, refresh-after-flow)?

---

### C-19 — Action Pending with = **SYSTEM**

- **Title:** Flagged rows show Action Pending with **SYSTEM**  
- **Steps:** Open Flagged row; read Action Pending with.  
- **What I understood:** Some Flagged rows use SYSTEM, not a person.  
- **Problem:** Is that expected after Flag? After which flow? Should My Invoices / filters treat SYSTEM as a user?

---

### C-20 — Who may Review / Approve / Flag (mail list vs Admin)

- **Sheet role:** BDU / Reviewer / Approver  
- **Steps:** Login as Admin vs PM; look for Review / Approve.  
- **What I understood:** Admin (you) sees Review on Submitted. PM is not Admin and has no All Invoices. Product: reviewer/approver come from Invoice Mail List, not only the admin table.  
- **Problem:** For automation, is **chromium-admin** enough for Review/Approve/Flag, or must the user be **on that project’s mail list**? If Admin is always allowed, say so. If PM can Review when listed as reviewer, IO-023 as “BDU only” is wrong.

---

## Clear enough — skip unless you disagree

| ID | Why I think I can automate |
|----|----------------------------|
| IO-001 | Layout, filters, columns — live match |
| IO-002 / IO-003 / IO-008 | This / Last / Future Months vs 6th–5th cycle |
| IO-010 / IO-011 | Region combo; blank = all |
| IO-012 | Admin My/All; PM radios hidden |
| IO-013–015 | Search Partner / Project / Invoice # (accept `2026-nnnn` and `INV-n`) |
| IO-016–018 | Sort if we know which icon (still slightly tied to C-04) |
| IO-023–026 | Next Step: Review / Approve / Edit / View — screenshot matches |
| IO-028 / IO-031 | Review opens View Invoice; close returns to Overview |
| IO-007 style pagination | Pages 1, 2, 3 + total |
| Refresh icon | Unlabeled img next to **Invoice Overview** title; required after flows |
| Update NA / Other | Flagged Edit + Submit, by region |

---

## How to answer

For each **C-nn** you care about, a short note is enough: expected UI, expected status after refresh, expected **flow name**, Admin vs PM. I will then write scenarios and tests only from that.

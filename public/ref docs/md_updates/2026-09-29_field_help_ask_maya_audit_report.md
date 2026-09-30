# Audit Report: Field Help (ⓘ) and "Ask Maya" Pre-filled Questions, 29 Sep 2026

**Scope:** everything built in the 29 Sep 2026 session. Phase 1 added help on confusing form fields. Phase 2 added help on hard-to-read read-only data. A final senior code review of both followed.
**State:** uncommitted, in the working tree of `dev`. 19 source files modified and 6 added, plus the two briefs under `.agents/prompts/`.
**Workspace:** phases 1–2 were employee only. Phase 3 (§10, same day) extends it to the manager workspace and to HR wherever HR renders the same component. It is gated in config, not in code.
**Verified by:**
- a production build, with `dist/` restored afterwards;
- ESLint compared per file against `HEAD`;
- three Playwright suites on test harness pages;
- a before/after layout measurement of the real screens, rendered with a fake employee session and fixture data, at 1366×768 and 390×844.

---

## 1. Summary

| | |
|---|---|
| What it does | A small ⓘ sits beside selected confusing fields and figures. Hover, keyboard focus or tap shows a one-line plain-English explanation. Where the config allows it, an **Ask Maya about this** link opens Maya with a pre-written question already in her input box. Nothing is sent until the user presses Send. |
| Coverage | 32 config entries on 24 surfaces. 10 are form fields (phase 1) and 22 are data points (phase 2). 28 have Ask Maya enabled. |
| Files | 19 source files modified, 6 added. |
| Bugs and issues found and fixed while building | 18 (§3, §4) |
| Further bugs found by the final code review | 7, plus 1 regression that a fix introduced, caught by the test suite (§5) |
| Lint | **Every modified file is identical to `HEAD`.** No new errors or warnings; the 7 pre-existing errors and 2 warnings are unchanged. New files are clean. |
| Build | Passes. `dist/` was restored as CLAUDE.md requires (`git status --short dist/` is empty). |
| Tests (final run) | Phase 1: 50/50, stable over 6 runs. Phase 2: 19/19, over 2 runs. Review regressions: 13/13, over 2 runs. |
| Layout | After the fixes, all **48 host measurements (24 hosts × 2 widths) are unchanged in height**, no table got wider, and nothing went missing. |
| Workspace gate | 0 ⓘ on every shared screen in the HR and manager workspaces, at both widths. |

Severity used below: **High** means wrong behaviour or lost user input. **Medium** means a broken interaction, an accessibility failure or a house-rule violation users would notice. **Low** means an edge case, fragility or consistency issue.

---

## 2. What was built

### Architecture

| Piece | File | Role |
|---|---|---|
| Config | `src/shared/fieldHelp/fieldHelp.json` | The single source. v2 shape: `surfaces` → `{ kind: "form" \| "data", description, workspaces, fields }`. Each field has `{ hint, askMaya: { enabled, question } }`. Keys are stable surface ids plus API keys, never visible labels. |
| Lookup and validator | `src/shared/fieldHelp/fieldHelpMeta.js` | `getFieldHelp(surface, field, workspace)` returns `{ hint, question }` or `null`. The dev-only validator warns and never throws. It checks `kind`, workspaces, hint length (≤160) and question length (≤1000). |
| Toggletip | `src/shared/fieldHelp/FieldHelp.jsx` | The ⓘ button plus a portalled popover. Its props are `tone="onDark"`, `size="sm"`, `overlay` and `ariaLabel`. |
| Label helper | `HelpLabel` (same file) | Glues the ⓘ to a label's last word so it can never wrap onto its own line. It returns plain text when there is no help for the workspace. |
| Bridge | `src/shared/maya/mayaBridge.js` | `askMaya()` fills a pending slot and fires an event, so an ask survives Maya's lazy mount. Stale asks older than 30 s are dropped. `registerMaya(available, limit)` records whether Maya can take a question and how long one may be. |
| Hook | `src/shared/maya/useMayaQueryLimit.js` | Returns the longest question Maya takes now, or 0 when she's unavailable. |
| Workspace | `src/shared/contexts/WorkspaceContext.jsx` | Provided by `DashboardLayout` from its resolved role. There is no URL parsing. |
| Maya | `src/shared/components/ChatbotWidget.jsx` | Takes pre-filled questions and never auto-sends. When asked from a form she is raised to `z-[160]`, above form dialogs. Escape pressed inside Maya is handled in the capture phase and stopped. |
| Shared hooks | `DetailDialog.jsx`, `StatutoryBreakdown.jsx` | `DetailGrid` and `DetailStats` items take `help`. `DetailSection` takes a `help` prop. Statutory lines are wired by `line.key`, and the config chooses which lines show an ⓘ. |

### Layer order (z-index)

| Layer | z-index |
|---|---|
| Maya (normal) | `z-[70]` |
| Form dialogs | `z-[100]`–`z-[150]` |
| ⓘ popover | `z-[155]` |
| Maya raised from an ask | `z-[160]` |
| Attachment viewer | `z-[165]` |
| Reason prompt | `z-[170]` |

### Config entries

| Kind | Surface · key | Hint (chars) | Ask Maya question |
|---|---|---|---|
| form | `payroll.tax_declaration` · `section` | 101 | Which income tax section should I choose when declaring an investment or expense, and what kinds of payments count under 80C, 80D, 80CCD(1B), HRA and LTA? |
| form | `payroll.tax_declaration` · `proof_reference` | 108 | Hint only |
| form | `payroll.tax_declaration` · `verified_amount` | 137 | Hint only |
| form | `payroll.tax_regime` · `regime_code` | 127 | What is the difference between the old and new income tax regime, and how do I decide which one to choose for this financial year? |
| form | `payroll.bank_details` · `ifsc_code` | 124 | Hint only |
| form | `payroll.bank_details` · `account_type` | 97 | Should my salary be paid into a savings account or a current account, and what is the difference between them for salary payments? |
| form | `attendance.regularization` · `work_mode` | 125 | When I request an attendance correction, what does the ‘Worked from’ option mean, and what is the difference between office, remote, field and hybrid work? |
| form | `payroll.reimbursement_claim` · `category_id` | 124 | How do I choose the right expense category for a reimbursement claim, and when do I need to attach a receipt? |
| form | `documents.upload` · `document_number` | 136 | Hint only |
| form | `documents.upload` · `is_confidential` | 123 | What happens when I mark a document as confidential, who can still see it, and can I change it back later? |
| form | `leaves.apply` · `leave_type_id` | 132 | What is the difference between leave types such as casual, sick and earned leave, and what happens if I apply for more days than my leave balance? |
| form | `leaves.apply` · `pending_hold` | 116 | What does pending hold mean on my leave balance, and when are held days given back or taken from my balance? |
| data | `attendance.summary` · `punctuality_percentage` | 128 | How is on-time arrival worked out in attendance, and what is the grace period for clocking in late? |
| data | `attendance.daily_log` · `effective_hours` | 107 | What are effective working hours, how are breaks taken out of them, and how many hours do I need for a full day or a half day? |
| data | `attendance.anomalies` · `type` | 132 | What does it mean when my attendance is flagged, for example outside the office location or a break over the limit, and what should I do about it? |
| data | `attendance.overtime` · `overtime_minutes` | 142 | How is overtime calculated from my attendance, does it need my manager’s approval, and what do I get for approved overtime? |
| data | `leaves.balances` · `total_accrued` | 142 | How is leave added to my balance during the year, and what happens to unused leave at the end of the year? |
| data | `leaves.request_detail` · `unpaid_days` | 127 | What is leave without pay (LWP), when does leave become unpaid, and how does it reduce my salary? |
| data | `payroll.my_salary` · `annual_ctc` | 144 | What is CTC (cost to company), and why is my take-home pay lower than my CTC? |
| data | `payroll.my_salary` · `take_home_monthly` | 132 | Why can the salary that reaches my bank differ from month to month, and what affects my take-home pay? |
| data | `payroll.statutory` · `pf` | 128 | What is the provident fund (EPF) deduction from salary, how much is deducted, and how can I withdraw or check my PF balance? |
| data | `payroll.statutory` · `pt` | 122 | What is professional tax, how is it calculated, and why does it differ between states? |
| data | `payroll.payslip` · `payable_days` | 121 | What are paid days on a payslip, and why can they be fewer than the days in the month? |
| data | `payroll.tax_summary` · `remaining_tds` | 145 | How is income tax (TDS) deducted from my salary each month, and why does the monthly amount change during the year? |
| data | `payroll.tax_summary` · `previous_employer` | 130 | Why does income from my previous employer this year affect my tax, and what is Form 12B? |
| data | `payroll.tax_projection` · `standard_deduction` | 134 | What is the standard deduction on salary income, and how does it reduce my income tax? |
| data | `payroll.form16` · `form16` | 153 | What is Form 16, what is the difference between Part A and Part B, and how do I use it to file my income tax return? |
| data | `payroll.loans` · `interest_method` | 141 | What is the difference between flat interest and reducing balance interest on a salary loan? |
| data | `payroll.encashment` · `divisor_days` | 112 | How is the amount for leave encashment calculated, and what does dividing the month by a number of days mean? |
| data | `payroll.reimbursement_limits` · `period_limit` | 134 | How do reimbursement limits work, what is the difference between a per-claim limit and a period limit, and when do they reset? |
| data | `documents.my_documents` · `status` | 130 | What do the document statuses in review, action required, not finished and expiring soon mean, and what do I need to do for each? |
| data | `documents.company_documents` · `compliance_state` | 123 | What do I need to do with documents issued to me by the company, and what do needs you, overdue and excused mean? |

`pending_hold` and `verified_amount` are data points inside a form surface. They sit under that form's surface id because they belong to that screen area.

### Considered and dropped (phase 2)

| Item | Why it was dropped |
|---|---|
| Comp-off "Available balance" | The page already has a banner explaining the balance, how to use it and when it expires. |
| Apply-leave "Effective" | Merged into the Pending hold hint, which explains both figures. This saves an icon in a three-column strip. |
| Statutory "ESI" line | Its row note already explains when ESI doesn't apply. |
| "Paid by the company (not deducted from you)" | The title explains itself. Keeping it would put 5 ⓘ on the expanded salary view, over the budget of 4. The `DetailSection` hook is still built and tested. |

---

## 3. Issues found and fixed while building phase 1 (form fields)

| Sev | Issue | Fix | Files |
|---|---|---|---|
| High | **Maya would open behind the form.** She sits at `z-[70]` and most form dialogs are `z-[100]`–`z-[150]` (reimbursement claim `z-[120]`, bank editor `z-[140]`, document upload `z-[150]`), so "Ask Maya" looked broken. | While opened from an ask she is raised to `z-[160]`, and she drops back on close. A normal open from the FAB is unchanged. | `ChatbotWidget.jsx` |
| High | **Escape in Maya closed the form and lost what the user typed.** `ClaimEditorDialog`, `RegularizationFormModal` and `DocumentUploadDialog` close on *any* Escape. | Maya takes Escape in the capture phase and stops it when focus is inside her panel. Escape elsewhere behaves as before. | `ChatbotWidget.jsx` |
| High | **A click toward Maya closed the form.** It landed on the form's backdrop, whose `onMouseDown` closes the form. | The same fix: raised, she is the click target. The test "click inside Maya keeps the form open" passes. | `ChatbotWidget.jsx` |
| Medium | **An ask made before the lazy widget mounted was lost.** A bare window event has no listener yet. | A pending slot in the bridge is consumed on mount. Asks older than 30 s are dropped. | `mayaBridge.js` |
| Medium | **"Employee only" can't be decided by file location.** Every pilot screen also mounts under `/dashboard/hr/*` and `/dashboard/manager/*`, and `DocumentUploadDialog` is shared. | A `workspaces` gate in config, read through `WorkspaceContext` from `DashboardLayout`. | `fieldHelpMeta.js`, `WorkspaceContext.jsx`, `DashboardLayout.jsx` |
| Medium | **A button inside a `<label>` pollutes the input's accessible name**, which read "IFSC code What is an IFSC code?". | The ⓘ sits beside the label in a flex row. On the Confidential checkbox, whose whole card is a label, the input is named with `aria-labelledby` and described with `aria-describedby`. | Phase-1 call sites, `DocumentUploadDialog.jsx` |
| Medium | **In Safari, the link could unmount mid-click.** Buttons don't take focus on click there, so a blur fired first and closed the popover. | The panel cancels `mousedown`. | `FieldHelp.jsx` |
| Medium | **Portal clicks bubble through the React tree**, so a click on the hint text could open a row's `rowPreviewProps` preview. | Clicks stop at the panel. This was narrowed further in review; see §5 #3. | `FieldHelp.jsx` |
| Low | **`role="tooltip"` can't hold a link.** | A non-modal toggletip: `role="dialog"`, `aria-expanded`, `aria-controls`, and Tab moves from the ⓘ into the link and back out. | `FieldHelp.jsx` |

## 4. Issues found and fixed while building phase 2 (read-only data)

Most of these were found by measuring the real screens before and after the change.

| Sev | Issue | Fix | Files |
|---|---|---|---|
| Medium | **Four hosts grew taller at 390px.** "Pending hold" grew 15px, the PF row 16px, the "Standard deduction" tile 16.5px and the company-documents tab row 32px, because the ⓘ's 26px pushed a line or tab onto the next row. | A new `overlay` mode: the ⓘ is zero-width and draws in padding the host already has. Line breaking is unchanged. The re-measurement shows 0 px difference. | `FieldHelp.jsx`, `StatutoryBreakdown.jsx`, `MyTaxAndInvestmentsPage.jsx`, `LeaveDashboard.jsx`, `MyDocumentsPage.jsx`, `IssuedDocumentsPage.jsx` |
| Medium | **The dashboard "On-time arrival" label was cut to "On…" on phones.** It was already truncated to "On-time a…" at 390px. | Its ⓘ is hidden below `sm` (640px). It sits beside the truncating span, not inside it, so an ellipsis can never swallow the icon. | `EmployeeDashboard.jsx` |
| Medium | **The icon failed WCAG 1.4.11 non-text contrast.** slate-400 on white measured 2.56:1 against a 3:1 minimum. | The resting colour is slate-500, measured at 4.76:1. On purple the icon uses purple-200, measured at 3.95:1. This also darkens the phase-1 icons slightly. | `FieldHelp.jsx` |
| Medium | **The slate icon was invisible on the purple Take-home tile.** | Added `tone="onDark"`. | `FieldHelp.jsx`, `MySalaryPage.jsx` |
| Medium | **The brief had wrong API keys.** It used `effective_minutes`, which doesn't exist; the value is `effective_hours` / `worked_duration_formatted`. It used `divisor`, where the field is `divisor_days`. | Corrected against the code and `update_overtime_fields_2026_09_22.md`. | `fieldHelp.json` |
| Low | **The loan hint used different words from the screen.** It said "reducing balance"; the screen says "On what’s still owed". | The hint now uses the on-screen wording. The Maya question keeps the standard term, because it retrieves better. | `fieldHelp.json` |
| Low | **"What is these statuses?" was ungrammatical as an aria-label.** | Added an `ariaLabel` prop; it now reads "What do these statuses mean?". | `FieldHelp.jsx`, document screens |
| Low | **A shared label changed its DOM in HR/manager.** It gained a wrapper span even though there was no ⓘ. | `HelpLabel` checks the config itself and returns the plain text. Tests confirm the HR `th` and `dt` `innerHTML` are unchanged. | `FieldHelp.jsx` |
| Low | **Nested interactive elements risked.** `DetailSection`'s header is a fold `<button>`, and `FilterTabs` is a `role="tablist"`. | The section ⓘ goes in the header's right-hand slot. The status ⓘ sits beside the tablist, outside it. | `DetailDialog.jsx`, document screens |

## 5. Final code review: bugs found and fixed

| # | Sev | Bug | Scenario | Fix | Files |
|---|---|---|---|---|---|
| 1 | Medium | **Keyboard focus dropped to `<body>` when asking while Maya is answering.** The input is disabled mid-stream, and the link that had focus unmounts. | Ask from a form while Maya is streaming. Focus is lost for keyboard users, and a later Escape is no longer "inside Maya", so it also closes the form under her. | The panel is focusable (`tabIndex={-1}`) and holds focus while she answers. Focus moves to the input when the stream ends, unless the user has gone back to the page by then. | `ChatbotWidget.jsx` |
| 2 | Medium | **A question longer than Maya's live `maxQueryLength` was pre-filled cut off mid-sentence.** The widget slices input to the limit. | A workspace configures a shorter query limit than a stored question. | The bridge carries the live limit. `useMayaQueryLimit()` returns it, or 0 when she's unavailable. The ⓘ omits the Ask link for any question that won't fit. | `mayaBridge.js`, `useMayaQueryLimit.js` (renamed from `useMayaAvailable.js`), `FieldHelp.jsx`, `ChatbotWidget.jsx` |
| 3 | Low | **Every click on the ⓘ was stopped from propagating**, which hid it from other components' document-level "click outside" listeners. | `AttendanceRosterPage` and `EmployeeProfilePage` use such listeners. They are HR-only today, so nothing was broken yet, but the design was fragile. | `stopPropagation` now happens only on the portalled panel, which is the one place it is needed. A test confirms a document click listener still sees ⓘ clicks. | `FieldHelp.jsx` |
| 4 | Low | **The "skip reopen on programmatic focus" flag could get stuck.** | `focus()` silently fails, for example on an anchor hidden by `hidden sm:inline-flex` or inside an inert region. The next genuine keyboard focus would then not open the hint. | The flag is reset synchronously right after `el.focus()`, because focus events fire inside the call. | `FieldHelp.jsx` |
| 5 | Low | **`DetailSection` with `help` rendered an empty 12px header slot in HR/manager**, where the config has no help. It also rendered no header at all when a section had `help` but no title, so the ⓘ was silently dropped. | A non-collapsible, action-less section shared with HR. A title-less section with help. | Help is resolved in `DetailSection` itself (`getFieldHelp` plus workspace), and the header condition includes it. Tests cover both cases. | `DetailDialog.jsx` |
| 6 | Low | **The phase-1 `th` hosts used a hand-rolled `<span>` wrapper.** Their DOM differed in HR/manager, and their icon could land on a line of its own. | Tax "Section" and "Proof Reference" columns. | Moved to `HelpLabel`. | `MyTaxAndInvestmentsPage.jsx` |
| 7 | Low | **Static element ids** (`doc-confidential-title`, `-note`). | Two upload dialogs mounted at once would share ids. | Replaced with `useId()`. | `DocumentUploadDialog.jsx` |
| 8 | Medium | **Regression introduced by fix #1, caught by the phase-1 suite.** After an ask, the textarea no longer took focus when focus was in a form field. The "user moved on" guard was meant only for the delayed mid-stream case, but it also applied to the immediate ask. | Type in a form field, then click Ask Maya. | Focus moves are now tagged `now` or `deferred`, and the guard applies only to `deferred`. Phase 1 is back to 50/50. | `ChatbotWidget.jsx` |

**Investigated, not a bug.** The phase-1 check "hover waits before opening" failed intermittently. Timing inside the page showed the popover appearing **152–155 ms** after `pointerenter`, against the 150 ms design. The test itself was flaky: Playwright's `hover()` round-trip can exceed 150 ms. It was rewritten to time inside the page and has passed on every run since.

**Checked and found clean:**
- **Config vs code:** every surface/field pair in code exists in the config, and every config entry is wired.
- **Length limits:** no hint is over 160 characters (longest 153), and no question is over 1000 (longest 155).
- **Hook order:** no hook comes after an early return; `DocumentUploadDialog`'s new `useId` sits above its first return.
- **Listeners:** listeners and timers are removed on close and on unmount.
- **One popover at a time:** only one popover is open app-wide.
- **Keyboard:** Enter or Space on the Ask link never reaches the Maya textarea, so nothing is auto-sent.
- **StrictMode:** double-mount consumes a pending ask only once.

---

## 6. Verification

### Test suites (Playwright, system Chrome, harness pages removed afterwards)

| Suite | What it covers | Result |
|---|---|---|
| Phase 1 (50 checks) | - Workspace gate<br>- Hover delay and grace period<br>- Keyboard Tab in and out<br>- Tap at 390px<br>- Ask Maya pre-fills, focuses and never sends; Enter sends exactly the question<br>- Maya above the form<br>- Escape in Maya or the popover leaves the form and its typed text intact<br>- Clicks inside Maya keep the form open<br>- One popover at a time<br>- Hint-only fields<br>- Maya hidden → no link<br>- Ask before Maya mounts<br>- Screen-edge placement | **50/50**, stable over 6 runs |
| Phase 2 (19 checks) | - `onDark` contrast 3.95:1, default 4.76:1<br>- Tile, `th`, `DetailGrid`, `DetailStats` and `DetailSection` hosts<br>- The section ⓘ doesn't fold the section<br>- Ask Maya from inside a `DetailDialog`: pre-filled, `z-160`, nothing sent<br>- Escape keeps the dialog open<br>- Tap on a phone<br>- HR: no ⓘ and an unchanged label DOM | **19/19**, over 2 runs |
| Review regressions (13 checks) | - Document click listeners still see ⓘ clicks; panel clicks are stopped<br>- Query-limit gate<br>- Busy-ask focus hold and hand-off<br>- Focus not stolen once the user moves on<br>- Queued question not sent<br>- Title-less section ⓘ<br>- No empty HR slot | **13/13**, over 2 runs |

### Layout measurement (real screens)

A fake employee JWT plus fixture responses for every API called. Bounding boxes of each host element (tile, header row, dialog grid, tab bar) and every table's `scrollWidth` were recorded before and after, at 1366×768 and 390×844.

| State | Hosts measured | Height changes | Table width changes | Most ⓘ in one screen state |
|---|---|---|---|---|
| Final code, employee | 24 × 2 widths = 48 | **0** | **0** | 4 (expanded My Salary) |
| HR, 11 shared screen states | n/a | n/a | n/a | **0 ⓘ** at both widths |
| Manager, 11 shared screen states | n/a | n/a | n/a | **0 ⓘ** at both widths |

No page errors in any run.

### Lint (per file, against `HEAD`)

All 19 modified files have the same error and warning counts as at `HEAD`. The pre-existing problems are 7 errors (6 unused `React` imports and 1 unescaped apostrophe in `RegularizationCard.jsx`) and 2 `react-refresh` warnings in `DetailDialog.jsx`. The 6 new source files have no lint problems.

---

## 7. Known limitations (accepted)

1. **Screen readers and `aria-modal` dialogs.** `ClaimEditorDialog` and `DocumentUploadDialog` set `aria-modal="true"`, so a strict screen reader may treat Maya, who sits outside the dialog, as out of reach in browse mode. Focus is moved into Maya programmatically, so she remains usable.
2. **A pinned popover follows its anchor on scroll.** If the anchor scrolls out of a modal's body, the popover can float over the modal header until it is closed.
3. **Maya stays raised if left open.** If the user leaves a raised Maya open and then opens a different dialog, she stays above it. Closing her resets it.
4. **Escape outside Maya is unchanged.** While Maya is open, Escape pressed *outside* her still closes both her and a form that closes on any Escape. That behaviour is kept deliberately.
5. **Phase-1 wrappers in HR and manager.** The phase-1 flex wrappers beside labels also render there, without an ⓘ. The screens look identical, but each label's own click target shrinks to its text.
6. **A new heading in all workspaces.** Phase 1 added a "Your tax regime" heading above the Regime cards, and it shows in all three workspaces. It is consistent across roles, as the parity rule requires.
7. **Column-header names include the ⓘ.** A `th`'s accessible name includes the ⓘ's name ("Effective What is effective hours?"). This is accepted for headers.
8. **On phones, the dashboard "On-time arrival" figure has no ⓘ** (see §4).
9. **Deliberate break from HR/manager parity.** The employee workspace shows ⓘ where HR and manager don't. Rolling out is a JSON edit (`workspaces`).
10. **Real screens were checked with fixtures, not a live login.** The fixture shapes follow the parsing code and specs; a pass with a live employee login is recommended before rollout.

## 8. Open items for a human

1. **Test all 28 Ask Maya questions against live Maya.** Her knowledge base (DocMind) is not in the repo, so no question is verified to retrieve a good answer. Switch off any poor one with `"enabled": false`; no code change is needed.
2. **Fact-check these hints**:
   - on-time arrival: the exact `punctuality_percentage` formula is undocumented;
   - flags: "you don't need to raise it anywhere else";
   - Annual CTC: worded to make no claim about employer contributions, since pre-2026-09-19 structures were never backfilled;
   - paid days: "unrecorded absences";
   - the phase-1 tax hints.
3. **Existing copy that looks wrong, left unchanged.** The Regime tab says the old regime has "lower slabs".
4. **The verification scripts aren't in the repo.** They lived in the session scratchpad: `common.cjs` (fake JWT and fixture routing), `fixtures.cjs`, `measure.cjs`, and three suites. Adding them under a `tools/` or `e2e/` folder would let this check run again for later ⓘ additions.

## 9. Files

**Added**
- `src/shared/fieldHelp/fieldHelp.json`: the config.
- `src/shared/fieldHelp/fieldHelpMeta.js`: the lookup and the dev-only validator.
- `src/shared/fieldHelp/FieldHelp.jsx`: the ⓘ toggletip and `HelpLabel`.
- `src/shared/maya/mayaBridge.js`: the pending slot, availability and query limit.
- `src/shared/maya/useMayaQueryLimit.js`
- `src/shared/contexts/WorkspaceContext.jsx`
- `.agents/prompts/data-help-ask-maya.md`: the phase-2 brief. The phase-1 brief `.agents/prompts/field-help-ask-maya.md` was modified.

**Modified**
- `src/shared/components/ChatbotWidget.jsx`: pre-fill, raised layer, capture-phase Escape, availability and limit, focus hand-off.
- `src/shared/hooks/useDocMindChat.js`: exports `DOCMIND_CONFIGURED`.
- `src/shared/layouts/DashboardLayout.jsx`: provides `WorkspaceContext`.
- `src/shared/components/DetailDialog.jsx`: `help` on `DetailGrid`, `DetailStats` and `DetailSection`.
- `src/shared/components/StatutoryBreakdown.jsx`: lines wired by `line.key`.
- `src/shared/documents/DocumentUploadDialog.jsx`: Document number and Confidential; checkbox naming via `useId`.
- `src/shared/screens/MyDocumentsPage.jsx`, `IssuedDocumentsPage.jsx`: status ⓘ beside the tabs.
- `src/roles/employee/screens/EmployeeDashboard.jsx`, `EmployeeAttendancePage.jsx`, `AttendanceAnomaliesPage.jsx`, `EmployeeOvertimePage.jsx`, `LeaveDashboard.jsx`
- `src/roles/employee/components/RegularizationCard.jsx`
- `src/roles/employee/payroll/screens/MySalaryPage.jsx`, `MyPayslipsPage.jsx`, `MyTaxAndInvestmentsPage.jsx`, `MyLoansAndAdvancesPage.jsx`, `MyReimbursementsPage.jsx`

---

## 10. Phase 3: manager workspace, shared with HR

**Brief:** `.agents/prompts/manager-help-ask-maya.md`.
**Decision (user, 29 Sep 2026):** where a manager screen uses a component HR also renders, HR gets the same ⓘ. The same applies to the self-service screens HR mounts. The new entries are gated `["manager", "hr"]` on shared components and `["manager"]` on manager-only screens. The employee workspace is unchanged.

### 10.1 Summary

| | |
|---|---|
| New entries | 32 on 18 new surfaces: 16 form fields and 16 data points. 20 have Ask Maya enabled. |
| Reused entries | The 32 employee entries now also show for managers and HR on their own self-service pages. The exception is `attendance.summary`, which renders only on the employee dashboard. |
| Config total | 42 surfaces, 64 entries. |
| Files | 24 source files: 23 modified and 1 added (`fieldHelp/fieldHelpLayer.js`). Also `CLAUDE.md` (§3 stacking line, new §10) and the brief. |
| Layout | 214 host measurements before and after, over 3 workspaces at 1366 and 390. **0 host height changes.** Tables grow only by the icon (§10.5). |
| Tests | Phase 3 behaviour suite: 40/40, twice. Phase 2 suite: 19/19. Review regressions: 13/13. |
| Lint | Every touched file matches its baseline; the new file is clean. |
| Build | Passes; `dist/` restored. |

### 10.2 New code

- **Host-relative layering (`fieldHelp/fieldHelpLayer.js`).** Three manager dialogs sat at or above the fixed layers: the claim review at z-160, and the recommendation and document request dialogs at z-170. The popover would have opened *behind* them, and so would a Maya raised from them.
  - When the ⓘ opens, it now reads the z-index of its outermost positioned ancestor.
  - The popover sits at `max(155, host + 5)`. The host layer travels with `askMaya()`, and the widget rises to `max(160, host + 10)`.
  - Both are capped below the toasts at z-200.
  - Every employee host still resolves to 155/160, which the phase 2 suite and the employee check in §10.6 confirm.
  - A global bump was rejected: it would put Maya over a `ReasonDialog` or `AttachmentViewer` opened later.
- **`DetailTable` columns take `help`**, like `DetailGrid` items. Without help for the workspace, the header is the same plain text as before.
- **Wire by key, config decides** on `PayrollReportsView`, where every header is wired by its column key. Unpaid days reuse `payroll.pay_days`. `AttendanceApprovalQueue` columns carry an optional `help`.
- **`DocumentUploadDialog` chooses its wording from `subjectName`.** It uses `documents.upload` for your own file and `documents.upload_for_report` when uploading into someone else's.
  - *Deviation from the brief (§2b), which asked for a `helpSurface` prop.* Self-service callers never pass `subjectName`, and every upload-for-someone caller always does: the manager team screens, HR requests, and both profile panels. So no caller has to remember a second prop.

### 10.3 Config entries added

| Kind | Surface · key | Shows in | Hint (chars) | Ask Maya question |
|---|---|---|---|---|
| form | `payroll.adjustment_proposal` · `adjustment_type` | manager | 115 | What is a one-off salary adjustment, and how is an extra earning or a deduction for one month different from a salary revision? |
| form | `payroll.adjustment_proposal` · `component_name` | manager | 105 | — (hint only) |
| form | `payroll.adjustment_proposal` · `period_month` | manager | 108 | — (hint only) |
| form | `payroll.bonus_proposal` · `bonus_type` | manager | 134 | What is the difference between basic pay and gross pay, and how is a bonus worked out as a percentage of each? |
| form | `payroll.loan_recommendation` · `loan_type` | manager | 134 | What is the difference between a salary advance and a company loan, and how is each paid back from salary? |
| form | `payroll.loan_recommendation` · `tenure_months` | manager | 92 | — (hint only) |
| form | `payroll.loan_recommendation` · `start_period_month` | manager | 94 | — (hint only) |
| form | `payroll.salary_revision` · `annual_ctc` | manager | 132 | What is included in CTC (cost to company), and how does a change in CTC affect monthly take-home pay? |
| form | `payroll.salary_revision` · `revision_type` | manager | 144 | What is the difference between a salary increment, a promotion, a correction and a restructure when revising someone’s salary? |
| form | `payroll.salary_revision` · `effective_from` | manager | 151 | — (hint only) |
| form | `payroll.encashment_proposal` · `period_month` | manager | 114 | — (hint only) |
| form | `payroll.claim_review` · `category_limits` | manager, hr | 136 | How do expense category limits work for reimbursement claims, and what happens when an approved amount would go over the limit? |
| form | `documents.recommendation` · `recommendation` | manager | 133 | What does a manager’s recommendation to verify or reject an employee’s document mean, and who makes the final decision? |
| form | `documents.request` · `due_on` | manager, hr | 120 | — (hint only) |
| form | `documents.upload_for_report` · `document_number` | manager, hr | 136 | — (hint only) |
| form | `documents.upload_for_report` · `is_confidential` | manager, hr | 135 | What happens when a document is marked confidential, who can still see it, and can it be made visible again later? |
| data | `attendance.team` · `final_absent_count` | manager, hr | 117 | How is an employee marked present, late, absent or half day in attendance, and when does a missing punch count as absent? |
| data | `attendance.team` · `late_minutes` | manager, hr | 130 | — (hint only) |
| data | `attendance.team` · `effective_hours` | manager, hr | 102 | What are effective working hours in attendance, how are breaks taken out, and how many hours make a full day or a half day? |
| data | `attendance.team` · `late_early` | manager, hr | 123 | — (hint only) |
| data | `attendance.team` · `overtime_minutes` | manager, hr | 140 | How is overtime calculated from attendance, when does it need a manager’s approval, and how is approved overtime paid? |
| data | `attendance.approval_queue` · `work_mode` | manager, hr | 126 | — (hint only) |
| data | `attendance.approval_queue` · `days_earned` | manager, hr | 142 | How is comp-off earned for working on a holiday or weekly off, how many days does it give, and when does it expire? |
| data | `leaves.approval` · `paid_split` | manager | 142 | What is leave without pay (LWP), when does leave become unpaid, and how does it reduce an employee’s salary? |
| data | `leaves.approval` · `balance_after` | manager | 147 | Can a leave balance go below zero, how are the extra days paid back, and what happens when a request needs more days than allowed? |
| data | `payroll.team_salary` · `team_ctc_total` | manager | 126 | What is CTC (cost to company), and what is the difference between CTC, gross pay and take-home pay? |
| data | `payroll.pay_days` · `lop_days` | manager, hr | 131 | What are loss of pay (LOP) days, what causes them, and how are they deducted from salary? |
| data | `payroll.reports` · `ctc_cost` | manager, hr | 112 | What does cost to company include beyond gross salary, and what are employer PF and ESI contributions? |
| data | `payroll.reports` · `total_employer_contributions` | manager, hr | 110 | What are employer contributions to PF and ESI, how are they calculated, and why are they not deducted from the employee’s salary? |
| data | `payroll.salary_structure` · `calculation_basis` | manager, hr | 133 | How are salary components calculated — as a fixed amount, a percentage of basic or CTC, or a balancing amount — and why is one part the remainder? |
| data | `documents.team_compliance` · `compliance_state` | manager | 144 | What do the document compliance states waiting, overdue and excused mean, and who can acknowledge or sign a company document? |
| data | `documents.proposals` · `outcome_counts` | manager | 108 | — (hint only) |

**Changed text:** the `attendance.anomalies.type` hint now says "Your manager or HR reviews each flag…". HR can resolve flags too, and the old text was wrong for an HR user's own flags. It is still correct for employees.

### 10.4 Considered and dropped

- **Flag severity (`attendance.approval_queue.severity`):** the attendance contract says it is free text with a default of `medium`. Nothing defines what makes a flag high or low, so there's nothing true to say.
- **Required documents (`documents.team_requests.checklist`):** the tab bar has no place for an ⓘ that doesn't change its layout at phone width. The tab's own empty state already explains the list.
- **Paid days in a team member's payslip:** its tile already says how many were unpaid.
- **From the brief's list:**
  - leave rejection reason;
  - attendance decision remarks (each dialog's notice explains the outcome);
  - claim "Approved amount" (the header explains lowering);
  - encashment "Which days";
  - recommendation note;
  - monthly gross;
  - the Flags column;
  - cancellation requests;
  - "Escalated to" chips;
  - team leave balances.
- **Kept although partly on screen:** `documents.upload_for_report` mirrors the phase-1 upload entries, so the same dialog looks the same for everyone. Its note line already mentions the masking and the manager rule. The hint adds that even the uploading manager loses sight of the document.

### 10.5 Layout findings and fixes

The first "after" run found 8 host height changes. All are fixed:

| Host | Problem | Fix |
|---|---|---|
| Dashboard › "Absent today" tile | Label wrapped (+14px) at both widths | `overlay` (zero width, drawn in tile padding) |
| "Lateness" column (Dashboard, Live Attendance) | At 390 the wider header squeezed other columns and rows grew +48px | `overlay`; checked by screenshot: the right-aligned ⓘ sits inside the header's 20px padding |
| Attendance History "Effective", "Late / Early", "Overtime" | Header row +20px at 390 | `overlay` |
| Comp-off queue "Credit" | Header row +20px at 390 | `overlay` |

**Accepted width growth.** It is the icon only, and no table's `min-w` passes 960:
- At 1366, only the salary-structure component table grows (+17px).
- At 390, the scrolling tables grow by 5–52px: the overtime queue, Payroll Reports, and the manager's and HR's own declarations table.

### 10.6 Verification

- **Behaviour suite** (real pages, fake manager, HR and employee sessions, fixture API): 40/40, twice.
  - Claim review: the popover is at z-165 and on top; Maya is at z-170 and on top with the question pre-filled and nothing sent. A click inside Maya keeps the dialog, and Escape in Maya closes only Maya.
  - Recommendation (nested over `DocumentDetailDialog`): keyboard focus opens the popover at z-175, on top. Escape closes only the popover. Maya is at z-180, on top, and nothing is sent.
  - Document request: the popover is at z-175, with no Ask link because the entry is hint-only. Escape closes only the popover.
  - Salary adjustment form (z-50): popover 155, Maya 160. The typed amount survives Escape in Maya.
  - Hosts: a tile opens on focus, a `th` and a section heading on hover, and a `DetailGrid` item on click (the manager's own payslip). On a phone, a tap opens it and the popover stays on screen.
  - Employee regression: the claim editor popover is still at 155 and Maya still at 160.
  - HR shows the shared queue's ⓘ.
- **Phase 2 suite** 19/19 and **review-regression suite** 13/13, on a temporary harness that was then deleted. Their "HR shows no ⓘ" checks now run against the guest workspace, because HR sees the ⓘ by design.
- **Layout:** 214 hosts, 0 height changes, none missing. The employee workspace has the same ⓘ count on every measured screen at both widths.
- **Dev validator:** no `[fieldHelp]` warnings.

### 10.7 Known limitations (accepted)

- The "Balance impact" ⓘ is on each card's strip, and a strip appears only when the manager opens it. If several are opened at once, the ⓘ repeats.
- The popover layer is read when it opens. A host whose z-index changes while the popover is open isn't tracked; no current host does that.
- Raised Maya above a z-170 host sits at z-180, over any `ReasonDialog` that the same flow opens after her. None of the three hosts does that.

### 10.8 Open items for a human

- Test all 20 new questions on live Maya before relying on them. The corpus may be written for employees; the manager-side questions name the concept, not the role.
- Fact-check these hints:
  - `payroll.salary_revision.effective_from`: "the difference comes in a later payroll". This is from the arrears design (D-12, phase 7); arrears are reconciled by HR.
  - `attendance.team.late_minutes` and `late_early`: whether early exits have a grace period.
  - `payroll.reports.ctc_cost`: see the CTC note in §7.
  - `documents.upload_for_report.is_confidential`: "even one who uploaded it". This is from the documents phase 1 walkthrough.
- **Labels that contradict house wording (flagged, not changed):**
  - "Payable / LOP" on manager Payslips should say unpaid days.
  - The leave-balance strip says "overdraft limit" where the house term is "extra days below zero".
- No check with a live manager or HR login yet.

### 10.9 Files (phase 3)

- **Added:** `src/shared/fieldHelp/fieldHelpLayer.js`.
- **Field help core:** `fieldHelp.json`, `FieldHelp.jsx` (host layer, `HelpLabel` `ariaLabel`), `fieldHelpMeta.js` (header comment).
- **Maya:** `src/shared/maya/mayaBridge.js` (`layer`), `src/shared/components/ChatbotWidget.jsx` (raise to the host layer).
- **Shared components:**
  - `DetailDialog.jsx` (`DetailTable` column `help`);
  - `ClaimDecisionDialog.jsx`;
  - `SalaryStructurePanel.jsx`;
  - `attendance/AttendanceApprovalQueue.jsx`;
  - `documents/DocumentUploadDialog.jsx`, `DocumentDetailDialog.jsx`, `RequestDocumentDialog.jsx`;
  - `roles/hr/payroll/PayrollReportsView.jsx`.
- **Manager screens:**
  - `ManagerDashboard.jsx`, `ManagerTeamHistoryPage.jsx`, `ManagerLeavePage.jsx`;
  - `components/LeaveRequestCard.jsx`;
  - `payroll/screens/ManagerAdjustmentsPage.jsx`, `TeamSalaryPage.jsx`, `TeamEncashmentsPage.jsx`, `TeamPayslipsPage.jsx`;
  - `documents/screens/TeamCompliancePage.jsx`, `OrgProposalsPage.jsx`.
- **`CLAUDE.md`:**
  - §3 gains a stacking line;
  - a new §10 makes the ⓘ pass part of every new form and screen.

---

## 11. Phase 4: HR workspace (HR-only screens)

Brief: `.agents/prompts/hr-help-ask-maya.md`. Phase 3 gave HR everything it shares
with the manager; phase 4 covers the screens only HR sees.

### 11.1 Summary

**46 new entries in 18 new surfaces, across 24 files.** HR now resolves **96**
entries in total (24 shared self-service + the manager-shared set + these).

The brief's premise was that HR was "mostly uncovered". The measurement was more
specific: HR already saw 34 entries through shared components, and **the whole
SETUP section — the 21 screens that configure leave, pay, attendance and
documents for everybody — had none.** That inversion (widest blast radius, least
help) is what this phase fixed first.

### 11.2 What was added

| Surface | Kind | Entries |
|---|---|---|
| `payroll.component_setup` | form | `calculation_type`, `is_basic`, `is_part_of_ctc`, `pf_applicable` |
| `payroll.statutory_config` | form | `pf_wage_ceiling`, `pf_restrict_to_ceiling`, `esi_wage_threshold`, `tds_no_pan_rate` |
| `payroll.structure_template` | form | `definition_mode`, `calculation_type` |
| `payroll.settings` | form | `lop_basis` |
| `payroll.bonus_rule` | form | `bonus_type` |
| `payroll.benefit_plan` | form | `employee_component_id` |
| `leaves.policy_setup` | form | `max_carry_forward`, `max_negative_balance`, `notice_period_max_days` |
| `attendance.policy_setup` | form | `half_day_min_hours`, `missing_punch_action` |
| `attendance.comp_off_policy` | form | `validity_days` |
| `payroll.run_item` | data | `ctc_cost`, `lop_divisor`, `carry_forward_out`, `pf_wage` |
| `payroll.arrears` | data | `net_delta` |
| `payroll.bank_verification` | data | `is_verified` |
| `payroll.tax_verification` | form | `verified_amount` |
| `organization.invite` | form | `role` |
| `payroll.year_end` | data | `is_provisional` |

15 of the 28 carry an Ask Maya question. The rest are hint-only on purpose: they
describe *our* settings, which Maya's corpus does not cover.

**Parity fixes (no new config).** Three HR screens rendered concepts the config
already allowed but were never wired: the HR dashboard's "Absent today" tile and
Live Attendance's "Hours" column (`attendance.team`), and `leaves.approval`,
which was manager-only although its hints are written to whoever is deciding.
It is now `["manager", "hr"]` and wired into HR's leave dialog.

### 11.3 Considered and deliberately left with none

This codebase is already written to §6, so most screens explain themselves and a
second explanation would be noise. Checked and skipped, with the reason:

- **Payroll Settings** — every switch but one already carries its own prose line.
  The brief guessed five entries here; only `lop_basis` survived.
- **Attendance Policies** — every `NumberField` has a range/consequence hint and
  every toggle a description. 2 of ~20 fields qualified.
- **Comp-off Policies, Leave Types, Exits & Final Pay, Settlement flow, Lock
  Attendance, Document Types, Shifts, Leave Automation, Loans** — all carry their
  own explanations. The loan `interest_method` labels ("Flat — on the full amount
  throughout" / "On what's still owed") already *are* the explanation.
- **Run status** — `RUN_STATUS_META` already renders a hint per status.
- **Departments, Office Locations, Weekly Offs, Holidays (names/dates)** — ordinary
  fields; §10 says these never get one.

### 11.4 Blocked on facts, not skipped by choice

Two candidates were real but could not be written truthfully (§10: settle facts
from code or `public/ref docs/`, or leave them out):

1. **Holiday type** (`public` / `optional` / `restricted`, AttendanceHolidaysPage).
   Nothing on screen or in code says what the system does differently, and
   `ATTENDANCE_MODULE_AUDIT.md` flags the enum ↔ `is_optional` mismatch as
   *Backend Clarification Required*. An admin outside India cannot guess what a
   restricted holiday is — this is worth an ⓘ the moment the behaviour is settled.
2. **Leave-payout amount** (PayrollEncashmentsPage). Whether a standalone payout
   uses the `fnf_encashment_*` rate basis and divisor from Payroll Settings is not
   evidenced anywhere; the hint would have to assert it.

### 11.5 Layout decisions

`overlay` (zero width, drawn in room the host already has) was used wherever a
26px icon would wrap a label and grow the row — the same rule as §10.5:

- the statutory rate fields (half-width columns in a 2-col grid);
- attendance-policy number fields (five to a row on a laptop);
- comp-off "Valid for (days)", bonus "How it's worked out", the benefit
  component select, the template "Calculation" row, the invite "Role";
- the HR dashboard's "Absent today" tile, which wrapped at 390 exactly as the
  manager's did.

Right-aligned headers (`Difference`, `Verify amount`, `Hours`) take the plain
icon: overlay would hang the icon past the cell edge. That is the accepted
icon-only width growth from §10.5.

### 11.6 Traps hit while building (worth keeping)

- **The ⓘ must sit outside a `<label>` that wraps its own input.** Salary
  Components, Tax Configurations and the invite form all use
  `<label><input …/>Text</label>`; the icon goes in a `flex items-center`
  wrapper *beside* the label, or it joins the control's accessible name.
- **Descriptor-driven forms wire once, by key.** Tax Configurations and
  Attendance Policies render from field arrays, so `field={f.key}` / `field={name}`
  covers every field and the config alone decides which show an ⓘ — the pattern
  `fieldHelpMeta.js` was designed for.
- **`DetailGrid` tuples cannot carry `help`.** `["label", value]` had to become
  `{ label, value, help }` for the four run-item entries.
- **A file that uses only `help` props must not import `FieldHelp`** — it becomes
  an unused-variable lint error. `PayrollRunDetailPage` and `HRLeaveRequestsPage`
  were corrected.
- **A shared label whose meaning flips must not reuse a hint.** HR's leave dialog
  shows "Balance after approval" *or* "Balance if denied" in the same slot; the
  `balance_after` help is wired only on the approval case.

### 11.7 Verification

- **Config validator** (the checks in `fieldHelpMeta.js`, replicated in the merge
  script): every entry has `kind`, valid `workspaces`, a hint ≤ 160 characters,
  a curly apostrophe and an explicit `askMaya.enabled`. No warnings.
- **Wiring cross-check:** 87 static surface/field pairs across 46 files all
  resolve to a config entry; no entry is wired to a surface that does not exist;
  no new surface is left unwired. (Four older surfaces are wired through helper
  indirection — `PayrollReportsView`, `StatutoryBreakdown`, `DocumentUploadDialog`
  — and are not orphans.)
- **Lint:** 34 pre-existing errors across the 17 touched files before, 34 after.
  No new errors.
- **Build:** `npm run build` clean; `dist/` reset and `git status --short dist/`
  empty.
- **Not done:** no live-browser pass. Layout calls here are from the audit's own
  measured rules (§10.5), not from a fresh measurement at 1366/390.

### 11.8 Open items for a human

1. **Test the 15 new Ask Maya questions against live Maya.** The statutory ones
   (PF wages, PF ceiling, ESI limit, no-PAN TDS, CTC, unpaid-day pricing,
   backdated pay) are general Indian-payroll concepts and should retrieve; switch
   off any that do not with `"enabled": false` — no code change.
2. **Fact-check three hints** that state behaviour rather than definition:
   `payroll.run_item.carry_forward_out` ("carried over and taken from a later
   payroll"), `payroll.arrears.net_delta` (from the file header's contract note),
   and `payroll.bank_verification.is_verified` ("nobody may clear their own
   account" — a UI guard today, per `verifyAction`'s own comment).
3. **Settle the two blocked candidates in 11.4.**
4. **Wording bug, flagged not changed** (as in §10.8): HR's leave dialog still says
   "the overdraft limit"; §6's term is "extra days below zero".
5. **Raw JSON on screen.** `YearEndClosurePage` renders the whole Form 16 Part B
   response as `JSON.stringify` in a `<pre>` — raw API keys, and ids among them.
   That is a §4/§6 problem found during this pass; it is out of this phase's scope
   and is not fixed here.

### 11.9 Parity sweep and second pass (same day, after review)

The first pass was judged too thin: 30 HR-only entries, and several screens the
manager already had help on had none in HR. Two rounds followed.

**Round 1 — role parity (§2).** Four manager surfaces were extended to
`["manager", "hr"]` after checking each hint reads correctly to both, and the
matching HR screens were wired:

| Surface | HR screen now wired | Entries |
|---|---|---|
| `payroll.adjustment_proposal` | Salary Adjustments (pay month, type, payslip line) | 3 |
| `payroll.bonus_proposal` | Salary Adjustments | 1 |
| `payroll.loan_recommendation` | Loans & Advances (type, tenure, first repayment) | 3 |
| `payroll.salary_revision` | Employee Salaries (CTC, effective from, revision type) | 3 |

Three needed an HR-specific entry instead, because the manager wording is wrong
when HR is the one acting: `payroll.encashment_admin.period_month` (the manager's
says "once HR approves it"), `payroll.adjustment_admin.category` and
`payroll.structure_assign.template_id` (HR-only fields with no manager twin).

**Five surfaces stay manager-only, each because HR has no host for them:**
`documents.recommendation` (HR decides, it never recommends), `payroll.team_salary`
("everyone who reports to you" — HR's screen has no team-total tile),
`documents.team_compliance` (HR's compliance screen is a document-level roll-up,
not a per-person state column), `documents.proposals` (the "(this page)" tiles
exist only on the manager's Org Proposals screen) and
`payroll.encashment_proposal` (superseded by `payroll.encashment_admin`).

**Round 2 — screens with no help at all.** The Income-Tax Regimes cards are pure
tax vocabulary with nothing on screen to explain it, so `payroll.tax_regime_config`
covers standard deduction, the 87A income limit and Chapter VI-A; `payroll.pt_slabs`
explains that professional tax is set by the state, not by the organisation; and
`documents.verification.recommendation` says the manager's advice is not a decision.
The regime cards wire through the `Row` helper by key, so the config decides which
lines carry an ⓘ.

**Totals now:** 65 surfaces, HR resolves 59 of them and 96 entries, 66 of which
offer an Ask Maya question. Hints still carry no figure that changes with the
finance act.

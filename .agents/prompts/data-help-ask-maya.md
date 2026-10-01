# Task: ⓘ help on hard-to-read data — phase 2 of field help (employee workspace)

Read `CLAUDE.md` first; it is binding. Then read what phase 1 built, because this
task extends it and must not fork it:

- `src/shared/fieldHelp/fieldHelp.json`: the config.
- `src/shared/fieldHelp/fieldHelpMeta.js`: `getFieldHelp()` and the dev-only
  validator.
- `src/shared/fieldHelp/FieldHelp.jsx`: the ⓘ toggletip. Its header comment lists
  every trap it already handles.
- `src/shared/maya/mayaBridge.js`: the pre-fill bridge. Maya never auto-sends.
- `src/shared/contexts/WorkspaceContext.jsx`: the workspace gate.
- `.agents/prompts/field-help-ask-maya.md`: the phase 1 brief.

## What we're building and why

Phase 1 put ⓘ help on confusing **form fields**. It shipped and works. The same
problem exists on the **read-only side** of the employee workspace. People see
numbers, columns and statuses they can't interpret: "Annual CTC", "Pending hold",
"Paid days", "Effective" hours, "Income tax still to deduct", "In review", "Period
limit". Nobody is around to ask, and a vague question to Maya gets a vague answer.

So phase 2 adds the **same ⓘ** beside selected data points. That means stat-tile
labels, table column headers, detail-dialog labels, section headings and status
filters. The behaviour and config are unchanged:

- Hover, focus or tap shows a short plain-English explanation of **what the
  number or status means and what moves it**.
- Where the config enables it, the popover shows **"Ask Maya about this"**. It
  pre-fills a stored, precise question. The user presses Send.
- One JSON config drives everything. Anything missing from the config renders
  nothing.

This is **employee workspace only**. The ⓘ must be added **without changing the
existing UI**: no layout shift, no taller tiles, no wrapped labels, no wider
tables. Someone comparing before and after screenshots should find only the icon.

## 1. Config: one file, generalised from "forms" to "surfaces"

A data point is not a form field, and the config will be edited by people who
don't read code. Don't bolt a second file on. Generalise the existing one:

- Bump to `"version": 2`. Rename the top-level `forms` to `surfaces`. Give each
  surface `"kind": "form" | "data"`. Everything else in an entry stays the same:
  `description`, `workspaces`, `fields`, `hint`, `askMaya`.
- **Migrate the 7 phase-1 surfaces** to `kind: "form"` without changing their text.
  Rename `FieldHelp`'s `form` prop to `surface` and update the phase-1 call sites
  (MyTaxAndInvestmentsPage, MySalaryPage, RegularizationCard, MyReimbursementsPage,
  DocumentUploadDialog, LeaveDashboard). Keep no alias, because a dual path is how
  configs rot.
- The validator must warn about a missing or unknown `kind`. It still never throws
  and still runs in dev only.
- **Keys:** use the API response key when the value maps 1:1 to one (`annual_ctc`,
  `total_accrued`, `payable_days`, `redeemable`). When the shown value is derived
  (take-home, "Effective" balance), use a stable snake_case concept key and say what
  it's derived from in the surface `description`. Never key by the visible label.
- **Same concept, same entry.** "Effective" hours appears in several attendance
  tables, so it is one entry (`attendance.daily_log.effective_minutes`) wired
  wherever that column appears. Don't copy the text.

## 2. Hooks into the shared primitives (additive, invisible when unused)

Most data renders through shared components. Add an **optional** help hook to each.
An item without it must render byte-for-byte as today, because HR and manager
screens use the same components. Check at least one HR screen per changed
component to confirm it didn't move.

- **`DetailGrid` and `DetailStats`** (`shared/components/DetailDialog.jsx`): an item
  may carry `help: { surface, field }`. The ⓘ renders inline after the label text,
  inside the `<dt>`/label `<p>`. That's safe here because these aren't `<label>`
  elements.
- **`DetailSection`**: an optional `help` prop. **Never put the ⓘ inside the
  header's toggle `<button>`**, because nested interactive elements are invalid and
  a click would also fold the section. Render it in the header's right-hand area
  before the chevron, like `action`.
- **`StatutoryBreakdown` lines**: pass each line's own `line.key` (`pf`, `esi`, `pt`,
  `tds`, `pf_employer`, `esi_employer`, `edli`, `pf_admin`) as the field, under
  surface `payroll.statutory`. The component wires every line generically. **The
  config decides which lines actually get an ⓘ.** Use this "wire by data key, let
  config choose" pattern for any list-shaped data.
- **Page-local tiles** (`Stat` in MyTaxAndInvestmentsPage, the tile map in
  MySalaryPage, the `headline` and `cards` arrays on the attendance and comp-off
  screens): add a `help` field to the item and render the ⓘ after the label. Don't
  extract a new shared tile component in this task.
- **`FieldHelp` gets `tone="onDark"`** for purple surfaces: the "Take-home / month"
  hero tile and anything inside `PageHeader`. Slate-400 on purple-600 fails
  contrast. Use a purple-200 icon that turns white on hover or focus, with a white
  focus ring. Also add a size option for 10px uppercase labels if the 14px icon
  looks heavy there. Judge that from a screenshot, not by default.

## 3. Placement rules ("without distorting the existing UI")

1. **No layout shift.** The ⓘ keeps its negative vertical margin, so line-height is
   unchanged. Group label and ⓘ with `inline-flex items-center whitespace-nowrap`
   so the icon never wraps onto its own line. Measure it: record the bounding box of
   every host element (tile, header row, dialog grid) at 1366×768 and 390×844
   before and after. Heights must be equal. Widths may grow only by the icon, and
   **no table's `min-w` may pass 960px at 1366**, which is the house limit.
2. **Never inside another interactive element.** That rules out buttons, links,
   `<summary>`, clickable cards, the `DetailSection` toggle, a `FilterTabs` tab
   (it's a `role="tablist"`, and a non-tab inside it breaks the pattern), and rows
   using `rowPreviewProps`. If the host is clickable, put the ⓘ beside it or skip
   the item and report it. For example, the MySalaryPage bank card is a button.
3. **Headers, not cells.** Explain a column once in its `<th>`, never per row.
   Explain statuses once, beside the filter bar or on the Status column header.
   Never put one on each chip.
4. **Once per concept per screen.** A label repeated on every card ("given so far"
   on each leave balance card) gets one ⓘ on the section heading ("Leave Balances").
5. **Don't repeat what the screen already says.** Many tiles already have a hint
   line ("Estimated at this month's rate"), and the tax Projection tab has a
   "What this estimate leaves out" block. If the explanation is already right there,
   skip that item and list it in your report.
6. **Density budget:** at most 4 ⓘ visible in any one screen state. Phase 1's form
   icons count toward this where they share a screen.
7. **Conditional data:** some tiles only render with data, such as Previous
   Employer (Form 12B) and the Form 16 result. The ⓘ goes on the element that
   exists in that state. Don't force a heading into existence for it.
8. Keep **purple only**. The icon matches the house ⓘ used elsewhere
   (`HiInformationCircle`, `react-icons/hi`).

## 4. Wording rules for data

- **The hint explains the concept, never the user's own value.** Say what the figure
  means, what makes it go up or down, and the consequence (§6: "what reaches the
  bank", "before deductions — not take-home", "kept for next year"). Keep it to 1–2
  sentences and ≤160 characters. Don't restate the label.
- **No figures that change with law, state or financial year** in hints: slab rates,
  the standard deduction amount, the ESI wage ceiling, PT slabs. Those belong to
  Maya.
- **Questions must be conceptual, because Maya can't see this person's data.** She's
  an external document RAG with no access to their payslip or balance. "How is
  professional tax calculated and why does it differ between states?" is right. "Why
  is my PT ₹200?" is wrong, and it would also leak data. No interpolation, as in
  phase 1.
- **CTC and employer contributions need a sourcing check.** Repo sources disagree
  about whether `annual_ctc` includes employer statutory costs. Compare the header
  of `StatutoryBreakdown.jsx` (the "CTC-inclusive cost model, integration note
  2026-09-20") with the note in `md_payrolls` and `md_updates`. If you can't settle
  it from the current code and docs, write the hint so it makes neither claim, and
  flag it.

## 5. Pilot scope: the data points to cover

These are the ones I chose. For each, confirm the key in the real payload or the
code that computes it, confirm the element exists in the employee workspace, apply
rules 1–8, and drop anything that fails. **Don't add others without sign-off.**
"✓" means askMaya is enabled.

| # | Surface · key | Where (employee route) | What confuses people | Ask |
|---|---|---|---|---|
| A1 | `attendance.summary` · `punctuality_percentage` | Dashboard › "On-time arrival" headline | How on-time is judged (grace time) | ✓ |
| A2 | `attendance.daily_log` · `effective_minutes` | "Effective" column: Dashboard › Recent days, My Attendance table | Effective vs time on the clock vs breaks | ✓ |
| A3 | `attendance.anomalies` · `anomaly_type` | Anomalies › "Flag" column | What a flag is and what to do about it | ✓ |
| A4 | `attendance.comp_offs` · `redeemable` | Comp-offs › "Available balance" tile | What comp-off is and how it's earned and used | ✓ |
| A5 | `attendance.overtime` · `overtime_minutes` | My Overtime › "Overtime" column | Where it comes from and what approval gives | ✓ |
| L1 | `leaves.balances` · `total_accrued` | My Leaves › "Leave Balances" heading (covers "given so far" on every card) | Leave building up over the year | ✓ |
| L2 | `leaves.apply` · `pending_hold` | Apply drawer › "Pending hold" (the existing phase-1 surface, now also covering data in the form) | Days held by requests not yet approved | ✓ |
| L3 | `leaves.apply` · `effective_balance` | Apply drawer › "Effective" | Available minus held | – |
| L4 | `leaves.request_detail` · `unpaid_days` | Leave request detail › "Unpaid" | Leave without pay and its effect on salary | ✓ |
| S1 | `payroll.my_salary` · `annual_ctc` | My Salary › "Annual CTC" | CTC vs what reaches the bank (see the §4 sourcing check) | ✓ |
| S2 | `payroll.my_salary` · `take_home_monthly` | My Salary › purple "Take-home / month" tile (`tone="onDark"`) | Why it's lower than gross | ✓ |
| S3 | `payroll.statutory` · `pf` | Statutory breakdown line | PF, and that it's your savings | ✓ |
| S4 | `payroll.statutory` · `esi` | Statutory breakdown line | Why it may not apply to you | ✓ |
| S5 | `payroll.statutory` · `pt` | Statutory breakdown line | State-based professional tax | ✓ |
| S6 | `payroll.statutory` · `employer_contributions` | "Paid by the company (not deducted from you)" section, via `DetailSection` `help` | Money the company pays that you never see | ✓ |
| P1 | `payroll.payslip` · `payable_days` | Payslip dialog › "Paid days" | Why paid days can be fewer than calendar days | ✓ |
| T1 | `payroll.tax_summary` · `remaining_tds` | Tax › Summary › "Income tax still to deduct" | How yearly tax is spread over the remaining months | ✓ |
| T2 | `payroll.tax_projection` · `standard_deduction` | Tax › Projection › "Standard deduction" | A flat allowance you don't claim | ✓ |
| T3 | `payroll.tax_summary` · `previous_employer` | Tax › Summary › "Previous Employer (Form 12B)" (only when present) | Why a past job's pay matters this year | ✓ |
| T4 | `payroll.form16` · `form16` | Tax › Form 16 card heading | What Form 16 Parts A and B are and when they come | ✓ |
| T5 | `payroll.tax_declaration` · `verified_amount` | Declarations › "Verified ₹" column (phase-1 surface) | Declared vs what HR accepted | – |
| LN1 | `payroll.loans` · `interest_method` | Loan detail › "How interest is worked out" | Flat vs reducing interest | ✓ |
| LN2 | `payroll.encashment` · `divisor` | Encashment detail › "Month divided by" | How the per-day rate is found | ✓ |
| R1 | `payroll.reimbursement_limits` · `period_limit` | Reimbursements › limits table › "Period limit" column | Per-claim vs period limits and when they reset | ✓ |
| D1 | `documents.my_documents` · `status` | My Personal Documents, beside the status `FilterTabs` | "In review", "Action required", "Not finished" | ✓ |
| D2 | `documents.company_documents` · `status` | My Company Documents, beside the `FilterTabs` | "Needs you", "Overdue", "Excused" | ✓ |

About 26 items. After rules 5–6 I expect a few to drop. Report which ones and why.

## 6. Traps already known

- **Every screen above also mounts under `/dashboard/hr/*` and `/dashboard/manager/*`**
  (My Salary, My Tax, My Leaves, My Attendance, the document screens).
  `AttendanceCard` is also used by `ManagerDashboard`. `StatutoryBreakdown` and
  `DetailDialog` are used by HR payroll screens. The workspace gate in config is
  what keeps this employee-only. Test it on the shared screens, not just the
  employee routes.
- `DetailDialog` is `z-[140]`. The popover at `z-[155]` and raised Maya at `z-[160]`
  already clear it. Don't change the stack.
- Payroll tiles often use `tabular-nums` and large numerals. The ⓘ goes on the
  **label**, never the number.
- For `th` hosts, the ⓘ's name becomes part of the column header's accessible name.
  That's accepted for headers. Keep the `label` prop short (e.g. "effective hours").

## Out of scope

- No new explanatory text blocks, tooltips on chart axes or legends, or changes to
  existing labels or copy. The one exception: if an existing label contradicts its
  hint, flag it; don't fix it.
- No manager or HR rollout (config only, later). No backend changes. No auto-send.

## Definition of done

- [ ] Config migrated to v2 (`surfaces`, `kind`). Phase-1 entries are unchanged in
      text and still work. The `form`→`surface` prop rename is done at every call
      site. The validator is updated.
- [ ] The `help` hooks exist on `DetailGrid`, `DetailStats`, `DetailSection`,
      `StatutoryBreakdown` lines and the page tiles. `tone="onDark"` exists. Header
      comments record the "wire by key, config decides" rule and the
      nested-interactive rule.
- [ ] Pilot items are wired and checked against code and ref docs. Hints follow §4.
- [ ] **No-distortion check:** before and after bounding boxes of every host at
      1366×768 and 390×844, with heights equal and no table past 960px. Include the
      numbers in the report, and before/after screenshots of My Salary and My Leaves.
- [ ] Behaviour check with a temporary harness page and Playwright, as in phase 1
      (delete it afterwards):
  - [ ] Hover, focus and tap work on tile, th, `DetailGrid` and `DetailSection`
        hosts.
  - [ ] The ⓘ in a `DetailSection` header doesn't fold the section.
  - [ ] Ask Maya works from inside a `DetailDialog`.
  - [ ] `onDark` meets contrast.
  - [ ] HR and manager render no ⓘ on shared components.
- [ ] An HR payroll screen and a manager dashboard look unchanged.
- [ ] `npm run lint` adds no new errors against the baseline for touched files.
- [ ] `npm run build` passes, then restore `dist/` as `CLAUDE.md` says.
- [ ] Report:
  - Files changed and the final config diff.
  - Items dropped, and why.
  - Every hint whose facts you're unsure of.
  - Every question to test on live Maya before enabling, since her corpus isn't in
    the repo.
  - Any existing label or copy that contradicts its hint.

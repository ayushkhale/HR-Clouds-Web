# Task: ⓘ help + "Ask Maya" — phase 3, manager workspace (forms and data), shared with HR

> Decision (2026-09-29): where a manager screen uses a component HR also renders,
> HR gets the same ⓘ. Changing a shared manager field changes it in HR too, and
> that is accepted. HR's own self-service pages get the reused entries as well.

Read `CLAUDE.md` first; it is binding. Then read what phases 1 and 2 built, because
this task extends that system and must not fork it:

- `.agents/prompts/field-help-ask-maya.md`: the phase 1 brief (form fields).
- `.agents/prompts/data-help-ask-maya.md`: the phase 2 brief (read-only data). Its
  placement rules (§3) and wording rules (§4) apply here unchanged.
- `public/ref docs/md_updates/2026-09-29_field_help_ask_maya_audit_report.md`: what
  was built, every bug found in review, and the known limitations. Read §5 and §7
  before touching `FieldHelp.jsx` or `ChatbotWidget.jsx`.
- The code: `src/shared/fieldHelp/` (`fieldHelp.json`, `fieldHelpMeta.js`,
  `FieldHelp.jsx` with `HelpLabel`), `src/shared/maya/` (`mayaBridge.js`,
  `useMayaQueryLimit.js`), `src/shared/contexts/WorkspaceContext.jsx`, and the
  `help` hooks on `DetailGrid`, `DetailStats`, `DetailSection` and
  `StatutoryBreakdown`.

## What we're building and why

The employee pilot shipped. The ⓘ sits beside confusing form fields and hard-to-read
data. It shows a short plain-English hint, and "Ask Maya about this" pre-fills a
stored question in Maya's input for the user to send.

Managers need it more than employees, because they wear two hats:

1. **Their own self-service.** My Salary, My Tax, My Leaves, My Attendance, My
   Documents and the rest mount under `/dashboard/manager/*` too. Today the workspace
   gate hides every ⓘ there.
2. **Decisions about other people.** Approving a claim item by item, crediting a
   comp-off, proposing a salary revision, recommending a loan, asking for a
   document. These are forms full of payroll and policy terms, filled in on
   someone else's behalf, and a wrong choice costs that person money. Managers
   also read team numbers that are easy to misread, such as "Absent today",
   "Payable / LOP", "Employer share" and "Cost to company".

So this phase covers **more than the employee pilot**: the existing entries on the
manager's own screens, plus about 35 new form and data points on manager screens.
Same component, same config file, same behaviour. Maya **never auto-sends**.

The new entries are for the **manager workspace, plus HR wherever the component is
shared** (see §1). Nothing may change for employees: no new ⓘ, no layout change,
and the same DOM on shared components.

## 1. Decisions already made (don't relitigate)

- **Same config, no schema change.** Add entries to
  `src/shared/fieldHelp/fieldHelp.json` v2 (`surfaces`, `kind`, `workspaces`,
  `fields`, `hint`, `askMaya`). No per-workspace hint variants and no second file.
  One hint must read correctly in every workspace it is enabled for.
- **Surface ids name the domain, never the role.** Use `attendance.approval_queue`,
  not `manager.approvals`. Many manager screens use components HR also uses, and
  rolling out to HR later must be a one-word `workspaces` edit.
- **Voice decides reuse.** Existing entries are written *to the employee about
  their own data* ("your balance", "your manager"). They are correct on a manager's
  own self-service screens, so reuse them there. They are wrong on team screens, so
  team screens get their own entries, written about "this person" or "your team".
  Never enable an employee-voiced entry on a screen about someone else.
- **Role parity (CLAUDE.md §2) is kept.** Entries on components HR also renders
  are gated `["manager", "hr"]`: `AttendanceApprovalQueue` (HR Inbox and queues),
  `ClaimDecisionDialog` (HR final review), `RequestDocumentDialog` (HR requests),
  `PayrollReportsView`, `SalaryStructurePanel` and `DocumentUploadDialog` (HR's
  upload-for-someone flows). Write their hints so they read correctly to both:
  say "the employee" or "this person", never "your report". Entries on
  manager-only screens are gated `["manager"]`.

## 2. New code this phase needs

### 2a. Layering: the popover and raised Maya must beat their host dialog

Phase 1 fixed the layers at: ⓘ popover `z-[155]`, raised Maya `z-[160]`. That
cleared every employee form (60 to 150). **Three manager dialogs sit at or above
those layers:**

| Dialog | Layer | Used for |
|---|---|---|
| `shared/components/ClaimDecisionDialog.jsx` | `z-[160]` | Claims & Benefits › Review this claim |
| `RecommendDialog` in `shared/documents/DocumentDetailDialog.jsx` | `z-[170]` | Employee Documents › Recommend a decision |
| `shared/documents/RequestDocumentDialog.jsx` | `z-[170]` | Document Requests › ask for a document |

Inside these, the popover would render **behind** the dialog, and Ask Maya would open
Maya behind it, or tied with it at 160, where DOM order decides.

**Fix it relative to the host, not with a global bump.** A global bump would put
raised Maya above `AttachmentViewerDialog` (165) and `ReasonDialog` (170) when they
open later, which breaks the §3 stack.

- When `FieldHelp` opens, walk up from the anchor to find the highest `z-index` among
  its `position: fixed` ancestors. Call it `hostLayer`, with 0 when there is none.
- The popover layer is `max(155, hostLayer + 5)`.
- Pass `layer: hostLayer` through `askMaya()`. `ChatbotWidget` raises to
  `max(160, hostLayer + 10)`.
- Keep both below the toasts at `z-[200]`. The `z-[171]`–`z-[199]` range is unused
  today; check again before relying on it.
- Every existing host resolves to today's numbers, so the employee pilot must not
  change. Prove that in the regression run.
- Update the layer comments in `FieldHelp.jsx`, `ChatbotWidget.jsx` and `mayaBridge.js`.
  Add one line to the CLAUDE.md §3 stacking note: the popover and raised Maya sit
  just above whatever dialog hosts them.

Escape is already safe, so don't change it. Maya and the popover both listen on
`window` in the capture phase, which runs before these dialogs' `document` capture
listeners. Test it anyway (see Definition of done).

### 2b. One dialog, two contexts: `DocumentUploadDialog`

A manager reaches this dialog in two ways:
- their own My Documents upload, where the employee-voiced `documents.upload` is
  right;
- **Upload for a team member**, from `TeamDocumentsPage` and `TeamRequestsPage`.

In the second case, "Hides this document from your manager" is wrong. Add a
`helpSurface` prop to the dialog, defaulting to `"documents.upload"`. The two team
screens pass `"documents.upload_for_report"`. Don't branch on the URL or the role.

### 2c. Wire lists by key, and let the config choose

Follow phase 2's `StatutoryBreakdown` pattern wherever columns are data-driven:
- `PayrollReportsView` columns carry `key`, so wire every header by `c.key` under
  `payroll.reports`.
- `AttendanceApprovalQueue` columns carry `header`. Add a `help` key to the column
  definitions that should have one, not to all of them.

## 3. Placement rules

Phase 2 §3 applies in full:
- no layout shift;
- never nested in an interactive element;
- headers, not cells;
- once per concept per screen;
- don't repeat what the screen already says;
- **at most 4 ⓘ per screen state**;
- purple only;
- `overlay` where a label would otherwise wrap.

Manager screens add these cases:

- **Card lists are lists.** Leave approvals are cards (`LeaveRequestCard`), not rows.
  The section heading ("Pending Approval") is the list's header, so a concept shown
  on every card gets one ⓘ there, never one per card.
- **A control with no visible label.** The recommendation radiogroup in
  `RecommendDialog` has only an `aria-label`. Put the ⓘ beside the dialog's `<h2>`,
  not inside the radiogroup.
- **Tab bars.** The ⓘ never goes inside a tablist (`TeamRequestsPage`, the Salary
  Adjustments tabs, `FilterTabs`). Put it beside the bar, as D1 and D2 did in phase 2.
- **Mixed screens.** A self-service entry and a team entry can share a screen: the
  dashboard shows both "My attendance" and "Team today". They count toward the
  same budget of 4.
- **Masked pay.** When the organisation hides team pay from managers, the server
  omits amounts and those columns disappear. An ⓘ belongs to its header, so it goes
  with it. Don't leave a stray ⓘ beside a "hidden" notice.

## 4. Wording rules for manager entries

Phase 2 §4 applies:
- explain the concept, never a value;
- no figures that change with law, state or financial year;
- questions are conceptual and static;
- no names, amounts or ids in a question.

Additionally:

- **Say what the manager's action does and who acts next.** For example: "HR gives
  the final approval", "Approving adds it to this month's payroll", "You can remind,
  but only they can sign". The approval chain is what managers get wrong.
- **Use house terms** (CLAUDE.md §6). If an existing label contradicts one, flag it
  and don't fix it. Known cases:
  - "Payable / LOP" should say unpaid days.
  - "overdraft limit" in the leave-balance strip should be "extra days below zero".
- **Questions in a manager's words, precise and conceptual.** For example: "What is
  the difference between a salary advance and a company loan, and how is each paid
  back from salary?" Maya's corpus may be written for employees, so name the
  concept, not the role. Every question is still ≤ `maxQueryLength` (1000). Keep
  them under about 160 characters like the existing ones.
- **Settle facts from code and `public/ref docs/md_payrolls`, `md_leave`,
  `md_attendance` and `md_docs`, or don't state them.** In particular:
  - whether a salary revision can be backdated, and what happens to the difference;
  - whether an adjustment can target a month whose payroll is already processed;
  - what drives a flag's severity;
  - whether a manager can still see a document they marked confidential;
  - the CTC sourcing question from phase 2 §4.

## 5. Scope

"✓" means askMaya is enabled. Confirm every key against the real payload or
response, and every element against the rendered screen, before writing text. Drop
anything that fails the rules in §3 and report why.

### Part A: the manager's own self-service screens (config edit)

Add `"manager"` and `"hr"` to the `workspaces` of each existing entry that renders
under `/dashboard/manager/*` and `/dashboard/hr/*` (the same self-service
components). Some render only on employee-only screens:
`attendance.summary.punctuality_percentage` is on `EmployeeDashboard` only. Those
change nothing; list them.

Read every hint and question as a manager reading **their own** data. Suspects:
- `attendance.anomalies.type`: "Your manager reviews each flag". Check who reviews
  a manager's own flags.
- `documents.upload.is_confidential`.
- `leaves.apply.leave_type_id`.

If one doesn't hold, leave that entry employee-only and report it. Don't reword it
in a way that makes it worse for employees.

### Part B: manager forms (new surfaces, `kind: "form"`)

| # | Surface · key | Where (manager route) | What confuses people | Ask |
|---|---|---|---|---|
| MF1 | `payroll.adjustment_proposal` · `adjustment_type` | Salary Adjustments › Propose Adjustment › "Type" | One-off earning vs deduction; affects only that month | ✓ |
| MF2 | `payroll.adjustment_proposal` · `component_name` | same › "Label" | It's the line name the person sees on their payslip | – |
| MF3 | `payroll.adjustment_proposal` · `period_month` | same › "Month" (ⓘ on Month, not Year) | Which month's payroll it lands in (see the §4 fact check) | – |
| MF4 | `payroll.bonus_proposal` · `bonus_type` | Propose Bonus › "Type" (also covers "Value") | Flat ₹ vs % of basic vs % of gross; Value is ₹ or % accordingly | ✓ |
| MF5 | `payroll.loan_recommendation` · `loan_type` | Recommend Loan › "Type" | Salary advance vs company loan | ✓ |
| MF6 | `payroll.loan_recommendation` · `tenure_months` | same › "Tenure" | It's in months, one instalment a month; the label doesn't say so | – |
| MF7 | `payroll.loan_recommendation` · `start_period_month` | same › "Month" | The first month an instalment is taken from pay | – |
| MF8 | `payroll.salary_revision` · `annual_ctc` | Employee Salaries › Propose revision › "New annual CTC" | Full yearly cost, not take-home (see the §4 sourcing check) | ✓ |
| MF9 | `payroll.salary_revision` · `revision_type` | same › "Revision type" | Increment vs promotion vs correction vs restructure | ✓ |
| MF10 | `payroll.salary_revision` · `effective_from` | same › "Effective from" | When the new pay starts; backdating (see the §4 fact check) | – |
| MF11 | `payroll.encashment_proposal` · `period_month` | Encashments › Cash out › "Pay it in" | The payroll month it's paid in, if HR approves | – |
| MF12 | `payroll.claim_review` · `category_limits` | Claims & Benefits › Review this claim › "Category limits" (z-160, §2a) | What the limit is, what "left after this" means, and what happens over it | ✓ |
| MF13 | `documents.recommendation` · `recommendation` | Employee Documents › document › Recommend a decision, beside the `<h2>` (z-170, §2a) | You recommend and HR decides. Some organisations let a manager's recommendation decide, so the hint must hold either way | ✓ |
| MF14 | `documents.request` · `due_on` | Document Requests › ask › "Due by (optional)" (z-170, §2a) | Leaving it blank uses the organisation's standard window | – |
| MF15 | `documents.upload_for_report` · `is_confidential` | Upload for a team member (§2b) | Who can still see it afterwards, including you | ✓ |
| MF16 | `documents.upload_for_report` · `document_number` | same | The number printed on the document; stored masked | – |

Considered and left out, because the screen already explains them or the field is
obvious:
- the leave rejection reason;
- attendance decision remarks (each dialog's notice explains the outcome);
- the claim "Approved amount" (the dialog header explains lowering);
- encashment "Which days" (the picker explains itself);
- the recommendation note.

Add one only if you find it isn't explained after all, and say so.

### Part C: manager data (new surfaces, `kind: "data"`)

| # | Surface · key | Where (manager route) | What confuses people | Ask |
|---|---|---|---|---|
| MD1 | `attendance.team` · `final_absent_count` | Dashboard › Team today › "Absent today" | It counts everyone not present or on leave, including people who haven't clocked in yet | ✓ |
| MD2 | `attendance.team` · `late_minutes` | "Lateness" column of `TeamDirectoryTable` (Dashboard and Live Attendance) | Late means after the grace period; a late day still counts as present. Use this and not the "Late arrivals" tile, because it's one concept per screen | – |
| MD3 | `attendance.team` · `effective_hours` | Attendance History › "Effective"; Overtime queue › "Effective" | Time on the clock minus breaks; decides full, half or absent | ✓ |
| MD4 | `attendance.team` · `late_early` | Attendance History › "Late / Early" (concept key: `late_minutes` + `early_exit_minutes`) | Arrived after grace, left before the day's end | – |
| MD5 | `attendance.team` · `overtime_minutes` | Attendance History › "Overtime"; Overtime queue › "Overtime" | Beyond the policy's full-day hours, not the shift; approval sends it to payroll | ✓ |
| MD6 | `attendance.approval_queue` · `work_mode` | Attendance Corrections queue › "Mode" | Recorded → requested; it changes only if approved | – |
| MD7 | `attendance.approval_queue` · `days_earned` | Comp-off queue › "Credit" (also covers "Expires") | Days credited for working a day off, and that they expire | ✓ |
| MD8 | `attendance.approval_queue` · `severity` | Flags queue › "Severity" | What makes a flag high or low; drop it if code and docs don't say | – |
| MD9 | `leaves.approval` · `paid_split` | Leave Requests › "Pending Approval" heading (covers every card's "Pay" tile) | Paid days come off the balance; unpaid (LWP) days lower that month's pay | ✓ |
| MD10 | `leaves.approval` · `balance_after` | A card's "Balance impact" strip, beside "after approval" | What going below zero means (see §4: "extra days below zero") | ✓ |
| MD11 | `payroll.team_salary` · `team_ctc_total` | Employee Salaries › "Total CTC" tile (also covers Average) | Yearly cost, not pay; shown even when individual pay is hidden | ✓ |
| MD12 | `payroll.pay_days` · `lop_days` | Payslips › "Payable / LOP"; run dialog › "Unpaid days"; Payroll Reports › "Unpaid days" | LOP means loss of pay: days not paid for | ✓ |
| MD13 | `payroll.reports` · `ctc_cost` | Payroll Reports › "Cost to company" | What the company spends in total, beyond gross (see the §4 sourcing check) | ✓ |
| MD14 | `payroll.reports` · `total_employer_contributions` | Payroll Reports › "Employer share" | PF and ESI the company pays on top, never deducted from the employee | ✓ |
| MD15 | `payroll.salary_structure` · `calculation_basis` | `SalaryStructurePanel` › "How it’s worked out" (Team › member › Salary; Employee Salaries history) | Fixed vs % of basic vs the balancing part | ✓ |
| MD16 | `documents.team_compliance` · `compliance_state` | Document Compliance › "Where they’re at" | The states, and that managers can remind but not act for them | ✓ |
| MD17 | `documents.team_requests` · `checklist` | Document Requests, beside the tab bar (the "Required documents" tab) | What the required-documents list is, and where it comes from | – |
| MD18 | `documents.proposals` · `outcome_counts` | Document Proposals › the stat tiles marked "(this page)" | The counts cover only the proposals loaded on this page | – |

Considered and left out:
- "Monthly gross": its hint already says "before deductions".
- The Flags "Flag" column: the page description and dialog notice explain it.
- Leave cancellation requests: the card says approving refunds the balance.
- The "Escalated to" chip: chips never get an ⓘ.
- The team "Leave balances" heading: its subtitle explains it.

That is 16 form and 18 data entries: 34 new, plus Part A's reuse. Expect a few to
drop under §3. Report which and why. **Don't add others without sign-off.**

## 6. Traps already known

- **Two form layers below Maya.** The Salary Adjustments modals and the leave
  reject modal are `z-50`, below Maya's resting `z-[70]`. The ask path raises Maya,
  so this is fine, but test one.
- **`DecisionDialog` (`z-[100]`) closes on any `document` Escape in the bubble
  phase.** Maya's capture handler already stops it; test it.
- **Masked compensation (EC-25, EC-67).** Test Employee Salaries, Encashments and
  Payroll Reports with pay hidden: the server omits amounts and the per-head
  table, so the ⓘ on a hidden column must go too.
- **Team history pages oldest-first and is re-sorted client-side**
  (`ManagerTeamHistoryPage` header). Don't touch the data flow; add the ⓘ to the
  `<th>` only.
- **`TeamDirectoryTable` lives in `ManagerDashboard.jsx`** and renders on two
  routes. Wire it once and check both.
- **The `id` trap.** Roster rows key people by `user_id`. Nothing here needs an id,
  and no id goes into config, hints or questions (CLAUDE.md §4).
- **A dialog nested in a dialog.** The recommendation dialog opens over
  `DocumentDetailDialog` (`z-[140]`). Its host is the z-170 layer, not the 140 one;
  the walk-up in §2a must pick the highest.

## Out of scope

- HR screens that aren't shared with managers (HR's own adjustment, leave and
  document pages). Guest stays untouched.
- Backend changes. Auto-send.
- New explanatory copy, or rewording existing labels: flag them instead.
- A shared tile component.
- Telemetry beyond the existing `source` field.

## Definition of done

- [ ] Part A: `"manager"` added to every existing entry that reads correctly for a
      manager's own data, and the rest listed with a reason.
- [ ] Parts B and C are wired with manager-voiced text checked against code and
      ref docs. The validator is clean in dev.
- [ ] Host-relative layering (§2a) is in, with its header comments and the CLAUDE.md
      §3 line. The `helpSurface` prop (§2b) is in.
- [ ] **No-distortion check.** Record the bounding box of every host at 1366×768
      and 390×844, before and after, in the manager workspace:
  - heights must be equal;
  - no table's `min-w` may pass 960px at 1366;
  - include the numbers in the report.
- [ ] **Isolation check:**
  - the employee workspace shows exactly the ⓘ it has today;
  - HR shows the same ⓘ as managers on the shared components (HR Inbox and
    queues, claim review, document requests, Payroll Reports, an employee's
    Salary tab) and on its own self-service pages, with no layout change.
- [ ] **Behaviour check** with Playwright and a fake manager JWT, as in phases 1–2:
      an unsigned `{ id, role: "manager", orgId, exp }` token plus route fixtures.
      Delete the harness afterwards.
  - [ ] Hover, focus and tap work on a form label, a `th`, a tile, a section
        heading and a `DetailGrid` item.
  - [ ] The popover is visible and on top inside `ClaimDecisionDialog`,
        `RecommendDialog` and `RequestDocumentDialog`.
  - [ ] Ask Maya from each of those three opens Maya **above** the dialog, with the
        question pre-filled and nothing sent.
  - [ ] Escape in Maya closes only Maya, and the dialog and its input survive.
        Escape in the popover closes only the popover.
  - [ ] A click inside Maya never closes the dialog behind her.
  - [ ] The employee pilot's suites still pass: phase 1 50/50, phase 2 19/19,
        review regressions 13/13, with the popover and Maya on the same layers as
        before.
- [ ] `npm run lint` adds no new errors against the baseline for touched files.
- [ ] `npm run build` passes, then restore `dist/` as `CLAUDE.md` says
      (`git status --short dist/` is empty).
- [ ] Report (append a phase 3 section to the audit report file):
  - Files changed and the config diff.
  - Items dropped, and why.
  - Each entry that also shows in HR, and where.
  - Every hint whose facts you're unsure of, and each §4 fact check with its answer
    and source.
  - Every question to test on live Maya before enabling.
  - Every existing label that contradicts house wording.

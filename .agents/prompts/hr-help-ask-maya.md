# Task: ⓘ help + "Ask Maya" — phase 4, HR workspace (every HR screen)

> **Status (2026-09-29): all five sub-phases worked through — 28 entries,
> 15 surfaces, 18 files.** 4d and most of 4e yielded almost nothing: those
> screens already explain themselves.
> What was built, what was deliberately left with none, and what is blocked on
> facts is recorded in §11 of the audit report
> (`public/ref docs/md_updates/2026-09-29_field_help_ask_maya_audit_report.md`).
> Read §11.3 and §11.4 before adding more: the per-screen estimates below
> are high, because this codebase is already written to §6.

> Goal: an HR admin never meets a field, figure or status on an HR-only screen
> that only a payroll specialist could read. Phases 1–3 covered the employee,
> the manager, and the components those two share with HR. Phase 4 covers what
> is left: the ~50 HR-only screens where the organisation's rules are set.

Read `CLAUDE.md` first — §10 (the ⓘ pass is part of every build), §2 (role
parity), §6 (wording), §4 (never show an id). Then read what already exists,
because this extends that system and must not fork it:

- `.agents/prompts/field-help-ask-maya.md` — phase 1 brief (form fields).
- `.agents/prompts/data-help-ask-maya.md` — phase 2 brief (read-only data).
  Its placement (§3) and wording (§4) rules apply here unchanged.
- `.agents/prompts/manager-help-ask-maya.md` — phase 3 brief. Its §1 decisions
  (surface ids name the domain, voice decides reuse) are binding here.
- `public/ref docs/md_updates/2026-09-29_field_help_ask_maya_audit_report.md` —
  §5 (review bugs), §7 and §10.7 (accepted limits), §10.5 (layout fixes).
  Read these before touching `FieldHelp.jsx` or `ChatbotWidget.jsx`.
- The code: `src/shared/fieldHelp/` (`fieldHelp.json`, `fieldHelpMeta.js`,
  `FieldHelp.jsx` + `HelpLabel`, `fieldHelpLayer.js`), `src/shared/maya/`,
  `src/shared/contexts/WorkspaceContext.jsx`, and the `help` hooks on
  `DetailGrid`, `DetailStats`, `DetailSection`, `DetailTable` columns and
  `StatutoryBreakdown`.

## 0. Where HR stands today (measured, not assumed)

`fieldHelp.json` has **44 surfaces**. HR already sees:

- **24 surfaces gated `["employee","manager","hr"]`** — every self-service
  screen mounted under `/dashboard/hr/*` (My Salary, My Tax, My Leaves, My
  Attendance, My Documents…). Nothing to do there.
- **10 surfaces gated `["manager","hr"]`**, which reach HR through shared
  components it already renders: `AttendanceApprovalQueue` (Regularizations,
  Comp-offs, Inbox), `ClaimDecisionDialog` (Claims), `SalaryStructurePanel`
  (profile › Salary), `StatutoryBreakdown` (Employee Salaries),
  `DocumentUploadDialog` / `DocumentDetailDialog` / `RequestDocumentDialog`
  (Requests, Verification, Search, Compliance, Org Documents),
  `BulkIssueLettersDialog` (Issued Letters), `PayrollReportsView`.
- **2 HR-only surfaces**: `documents.letter_bulk`, `documents.letter_settings`.

Inside `src/roles/hr/` (84 files) exactly **two** are wired directly:
`documents/screens/DocumentSettingsPage.jsx` and `payroll/PayrollReportsView.jsx`.

So: the HR sidebar has **60 destinations** across 9 sections; roughly **8** of
them show any ⓘ, and all 8 get it second-hand. **The whole SETUP section — the
21 screens where leave rules, shift rules, salary components, statutory rates
and document automation are configured — has none.** That is the inversion this
phase fixes: the screens with the most jargon and the widest blast radius are
the ones with the least help.

There is no free gate flip. The manager-only surfaces (`payroll.salary_revision`,
`leaves.approval`, `documents.team_compliance`…) are wired inside manager-only
files, so adding `"hr"` to their `workspaces` changes nothing on screen. HR's
equivalents are separate files and need their own wiring.

## 1. Decisions already made (don't relitigate)

- **Same config, no schema change.** Entries go in
  `src/shared/fieldHelp/fieldHelp.json` v2 (`surfaces` → `kind`, `workspaces`,
  `fields` → `hint`, `askMaya`). No second file, no per-workspace hint variants.
- **Surface ids name the domain, never the role**: `leaves.policy_setup`, not
  `hr.leave_policies`. A later manager read-only view is then a one-word edit.
- **Keys are API payload/response keys**, never labels (CLAUDE.md §6 rewords
  labels). A derived figure with no API key gets a stable concept key, explained
  in the surface `description`.
- **Voice decides reuse, and HR's voice is new.** Existing entries are written
  to the employee about their own data ("your balance") or to an approver about
  one person ("this person"). An HR setup screen is neither: it is **a rule the
  organisation is about to apply to everybody**. So a config screen gets its own
  surface, and its hint says *what changes for the people it lands on* — "Sets
  how many days everyone on this policy starts the year with", not "your
  entitlement". Never extend an employee-gated surface with `"hr"` unless the
  one hint reads correctly to both.
- **Absence is safe.** No entry for a surface, field or workspace → nothing
  renders, so wiring may be added ahead of copy.
- **Caps stay** (CLAUDE.md §10): ≤ 4 ⓘ per screen state, once per concept per
  screen, never where the screen already explains itself. Setup screens are
  dense — 4 is a ceiling, not a target. Prefer the ⓘ on the *rule that costs
  money if misread* over the one that is merely unfamiliar.
- **Maya never auto-sends.** Questions stay static and conceptual: no name,
  amount, id or org detail.
- **No layout change.** Someone diffing before/after screenshots at 1366 and 390
  should find the icon and nothing else. `overlay` where a label would wrap.

## 2. What qualifies, on an HR screen

Apply CLAUDE.md §10's ladder, read for an administrator:

| On an HR screen | Gets an ⓘ? |
|---|---|
| Name, code, description, date, amount, reason, search | No |
| A rule switch we invented (`is_default`, priority, `applies_to`) | Yes — what changes for the people it covers |
| A statutory or payroll term (PF wage ceiling, PT slab, TDS regime, pro-rata basis) | Yes — plain words, + Ask Maya |
| A figure we computed (run totals, variance, liability, CTC cost) | Yes — what it is worked out from |
| A config choice that silently changes someone's pay or leave | Yes — say whose, and from when |
| A state machine step (run status, verification status, batch status) | Yes — once, on the column or filter header |

If a screen is all names and dates (Departments, Office Locations), it gets
none. Say so in the report; don't force one in.

## 3. Sub-phases

Each sub-phase is independently shippable: config entries + wiring + layout
check + lint + report. Ship in this order — it is value-descending.

### 4a — SETUP (21 screens) — the core of this phase

Where a wrong toggle quietly changes everyone's pay. Target ~45 entries.

| Screen | Candidate fields (confirm against the screen) |
|---|---|
| Salary Components | `type` (earning/deduction/reimbursement), `calculation_type` (flat vs % of what), `is_taxable`, pro-rata behaviour |
| Structure Templates | which component is the balancing one, how the template fills a CTC |
| Tax & Legal Deductions | PF wage ceiling and its effect, ESI eligibility threshold, PT state slab, TDS regime default |
| Payroll Settings | `Unpaid days: month divided by` (Always 30 / days in month / working days), Rounding Policy, `Payout look-ahead months`, `Component used to recover short notice`, `Leave types paid out` |
| Payroll Automation | what each automation actually fires, and what it does *not* do |
| Benefit Plans | Company pays / month vs Employee pays / month, `End cover` / last day of cover |
| Bonus Rules | `How it's worked out`, `Minimum time with us`, `Most one person can get`, `Paid in` |
| Leave Types | `Document Required After (days)`, code's role in policies |
| Leave Policies | `How Leave Is Given` (all at once / every month), `Unused Days Kept For Next Year`, `Wait After Joining`, `Extra Days Allowed Below Zero`, `Leave During Notice Period` |
| Leave Automation | what runs, when, and who it touches |
| Attendance Policies | `Default policy` / used by shifts without one, `When a punch is missing`, grace rules |
| Comp-off Policies | `Multiplier`, `Hours for full day` / `half day`, `Maximum balance`, `Priority`, `Auto-credited` |
| Work Shifts | shift-window fields that decide lateness and overtime |
| Weekly Offs / Holidays / Office Locations | probably none — check and say so |
| Document Types, Form Templates, Document Automation | mandatory vs optional, expiry, who the automation emails |
| Letterhead, Letter Templates | descriptor/merge-field concepts only; `documents.letter_settings` already exists — extend it, don't duplicate |

### 4b — The payroll cycle (12 screens)

Target ~35 entries. `PayrollRunDetailPage` (1121 lines) is the densest screen in
the app and needs the 4-per-state cap applied per tab, not per page.

Payroll Runs (status machine, what locks when) · Run detail (variance vs last
month, unpaid days, employer cost, why an employee is excluded) · Employee
Salaries (effective date, revision vs correction) · Bank Verification (what a
failed check blocks) · Salary Adjustments (one-off vs recurring, taxability) ·
Claims / Loans / Leave Payouts (HR-side fields the manager surfaces don't
cover) · Pay Differences (backdated pay: which month it lands in) · Exits &
Final Pay (notice recovery, settlement components) · Lock Attendance (what a
lock stops) · Payslips & Documents (release vs generate).

### 4c — People, time and leave (10 screens)

Target ~20 entries. Invites (role choice, what an expired invite means) ·
Employees / profile tabs (HR-side fields on Profile, Department, Reports tabs) ·
Live Attendance · Shift Management (roster conflicts) · Leave Requests (HR's own
queue — `leaves.approval` is manager-wired, so HR needs its own entries or the
surface extended after a voice check) · Regularizations / Comp-offs (already
covered via the shared queue — verify, add nothing) · Biometric devices.

### 4d — Documents we collect and issue (8 screens)

Target ~15 entries. Verification Queue (what verifying certifies) · Document
Compliance (mandatory gate, why "overdue" is never a filter) · Employee
Documents · Find a Document · Issued Letters (reissue vs re-download,
idempotency) · Letter Proposals (maker-checker) · Organisation Documents
(acknowledge vs sign).

### 4e — Tax, insights, dashboard, inbox (9 screens)

Target ~20 entries. Tax Declarations (proof states, what HR's approval commits)
· Year-End & Form 16 (what closure freezes) · the four report screens and two
export screens (each metric's basis) · Audit Log · HR Dashboard hero tiles ·
Inbox counts.

## 4. Wiring mechanics (unchanged from phase 3)

- Form field: `<FieldHelp>` **beside** the `<label>` in a `flex items-center`
  row, never inside it. Match the label's bottom margin.
- Column header / tile / section heading: `HelpLabel`.
- Inside a `DetailDialog`: the `help` hook on `DetailGrid`/`DetailStats` items,
  `DetailSection`, `DetailTable` columns — never hand-rolled.
- Descriptor-driven forms (Payroll Settings, Tax Configurations render from a
  field array) get a `help: { surface, field }` on the descriptor, resolved in
  the renderer. One wiring, many fields — do this rather than 14 call sites.
- Never inside a button, link, `<summary>`, clickable card, a fold toggle or a
  `FilterTabs` tablist.
- Layers come from `fieldHelpLayer.js`; nothing new should be needed. If a new
  host sits above z-150, check the popover and a raised Maya land above it.

## 5. Definition of done, per sub-phase

1. Dev validator silent — no `[fieldHelp]` warnings (hint ≤ 160 chars,
   workspaces valid, `kind` present).
2. Every new entry gated to **`["hr"]` only**, unless the component is shared
   with manager (§2 parity) — then both, with a hint that reads right to both.
3. Layout measured at **1366 and 390**: host heights unchanged. Use `overlay`
   for any header or label that grows a row (see audit §10.5 for the pattern).
4. `npm run lint` — compare to the baseline for the touched files only.
5. `npm run build && git checkout -- dist/ && git clean -fdq dist/` —
   `git status --short dist/` empty.
6. Report line per CLAUDE.md §10: surface ids, entry count, Ask Maya questions
   added, and every screen deliberately left with none, with the reason.
7. Append a `## 11. Phase 4` section to
   `public/ref docs/md_updates/2026-09-29_field_help_ask_maya_audit_report.md`
   in the shape of §10: what was built, considered and dropped, layout findings,
   verification, limits, open items.

## 6. Open questions for a human

1. **Facts we can't settle from the repo.** Statutory hints (PF ceiling, ESI
   threshold, PT slabs, TDS regime defaults) must carry no figure that changes
   with law, state or year (CLAUDE.md §10). Confirm the wording avoids numbers
   entirely, or name a source in `public/ref docs/`.
2. **Maya's corpus is employee-shaped.** Phase 3 left 20 questions unverified
   against live Maya. HR questions are about configuration; if the corpus has
   nothing on setup, ship those entries hint-only (`askMaya.enabled: false`)
   rather than sending an admin to a dead end.
3. **Does HR's Leave Requests queue reuse `leaves.approval`?** It is a separate
   file from the manager's card. Extend the surface only if one hint reads right
   to both an approving manager and HR acting for the organisation.
4. **Run detail's density.** If the 4-per-state cap can't be met per tab without
   dropping something genuinely confusing, flag it rather than exceeding it.

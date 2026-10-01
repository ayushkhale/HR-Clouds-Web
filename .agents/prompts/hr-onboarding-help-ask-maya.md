# Task: ⓘ help + "Ask Maya" — phase 5, full beginner coverage of the HR workspace

> Goal: **an HR admin in their first month — someone who knows people admin but has
> never run Indian payroll, set a shift rule or configured a leave policy — can work
> every HR screen without getting stuck or setting something wrong.** Every form
> field, data field, column, tile, status, section, tab and screen where such a
> person could hesitate gets an ⓘ.
>
> This phase **deliberately goes further than CLAUDE.md §10 allows today**, for the HR
> workspace only, and it is built so the extra help can be switched off or thinned
> later in one config edit when HR teams are used to the product. Read §1 and §2
> before you write a single entry.

Read `CLAUDE.md` first: §10 (field help), §2 (role parity), §6 (wording and the
established terms), §4 (never show an id), §5 (visual language). Then read what
already exists, because this phase extends that system and must not fork it:

- `.agents/prompts/hr-help-ask-maya.md`, the phase 4 brief. **This brief supersedes
  its caps and its "already explains itself" rule (see §1). Everything else in its
  §1 still binds.**
- `.agents/prompts/data-help-ask-maya.md` §3 (placement) and §4 (wording), and
  `.agents/prompts/manager-help-ask-maya.md` §1 (surface ids name the domain; voice
  decides reuse).
- `public/ref docs/md_updates/2026-09-29_field_help_ask_maya_audit_report.md`:
  - §5 (review bugs) and §7 and §10.7 (accepted limits);
  - §10.5 and §11.5 (layout fixes, `overlay`) and §11.6 (traps);
  - §11.3, which lists the screens phase 4 left with none. **Those screens are now in
    scope.**
  - §11.4 (blocked facts).
- The code: `src/shared/fieldHelp/` (`fieldHelp.json`, `fieldHelpMeta.js`,
  `FieldHelp.jsx` + `HelpLabel`, `fieldHelpLayer.js`), `src/shared/maya/`,
  `src/shared/contexts/WorkspaceContext.jsx`, and the `help` hooks on `DetailGrid`,
  `DetailStats`, `DetailSection`, `DetailTable` columns and `StatutoryBreakdown`.

## 0. Why this phase exists (measured 2026-10-01)

Phase 4 was built to §10's "only the confusing ones" rule, and its report explained
why most screens got nothing: "this codebase is already written to §6, so most
screens explain themselves". Real HR users disagree. A beginner is stuck on attendance
policies, shifts, leave rules and payroll, and phase 4 left almost all of that bare.

The numbers:

- `fieldHelp.json` has **74 surfaces and 127 entries**. HR resolves 121 of those
  entries, but most of them live on self-service and shared screens, not on the screens
  where HR does its own work.
- **28 of the 84 `.jsx` files under `src/roles/hr/` wire any help.** They carry about
  **67 wiring sites** against about **1,270** labels, headers and descriptor labels.
- Attendance Policies has about 15 rule fields: `grace_minutes`,
  `late_threshold_minutes`, `late_count_half_day_threshold`,
  `consecutive_late_penalty_days`, `overtime_min_minutes`,
  `regularization_window_days`, `auto_clock_out_after_hours`, auto-detect shift,
  default policy and others. **Two** of them have an ⓘ. A beginner can't tell grace
  from the late threshold, and that difference decides who gets marked late.
- **Screens with no help at all** include Work Shifts (rotation, cycle, sequence),
  Leave Types, Shift Management, Payroll Automation, Leave Automation, Document
  Automation, Lock Attendance, Payslips & Documents, the Payroll Runs list, Claims,
  Invites, Departments detail, Document Types, Form Templates, Letter Templates,
  Letterhead, all the export and report screens, the Audit Log, and every tab of the
  employee profile.

Most of the attendance-policy gap is **config-only work**: descriptor-driven forms
already wire every field by key (`field={name}`), so the entries alone make the ⓘ
appear. Check for this before you add call sites.

## 1. What changes from phase 4, and what does not

### Overridden, for the HR workspace only, while the onboarding tier is on

| Phase 4 / CLAUDE.md §10 rule | Phase 5 rule |
|---|---|
| At most 4 ⓘ per screen state | **No numeric cap.** Coverage follows the beginner test (§3). Keep the limits in §1's second table. |
| "Never where the screen already explains itself" | An inline line counts as an explanation **only if a beginner learns what the field means and what it changes from it.** A range ("0–60 min"), a format, an example value or a line written in jargon is not an explanation. Keep the inline line and add the ⓘ; don't delete existing copy. |
| "Ordinary fields: never" | Still never for the truly ordinary (§3, "Still none"). But a field that *looks* ordinary and carries a system meaning is not ordinary: a leave type's `code`, a shift's `sequence`, "Effective from" on a salary revision, "Priority" and "Applies to". Those get one. |
| "Prefer the rule that costs money; 4 is a ceiling, not a target" | Every field where a beginner could get stuck **or set it wrong**. |
| Screens and tabs get no help of their own | **Page-level and tab-level ⓘ are new** (§5). |

### Unchanged, still binding

- One config: `src/shared/fieldHelp/fieldHelp.json` v2. No second file and no
  per-workspace hint variants.
- Surface ids name the domain, never the role. Keys are API payload or response keys,
  never labels. A concept key is allowed where there is no API key, and must be
  explained in the surface `description`.
- **Once per concept per screen state.** Put the ⓘ on the column header, never on
  each row. Don't repeat the same ⓘ on a tile and a column that show the same number.
- **One ⓘ per label.** Never two icons on one field.
- Placement: beside a `<label>`, never inside it. Never inside a button, link,
  `<summary>`, clickable card, fold toggle or tablist.
- **No layout change.** Anyone diffing screenshots at 1366 and 390 should see the icon
  and nothing else. Use `overlay` wherever a label would wrap.
- Voice: HR is setting a rule for everybody, or acting on someone's behalf. Write
  "everyone on this policy" or "the employee", never "you" or "your balance".
- Hints: at most 160 characters, and a curly `’` apostrophe. Name the consequence, not
  the mechanism. Use the §6 terms and `DICTIONARY.TERMS`. **No figure that changes
  with law, state or year.** Facts come from the code or `public/ref docs/`, or they
  stay out.
- Maya never auto-sends. Questions stay static and conceptual: no name, amount, id or
  org detail.
- Don't change a label, layout or behaviour in this phase. If a label is wrong, put it
  on the report's open-items list.

## 2. Make the extra help reversible: the `onboarding` tier

The user expects to thin this help out once HR teams are used to the product.
Deleting 300 entries by hand is how configs rot, so the extra entries are tagged and
switched as one group. This is a small additive change to v2, not a new schema:

```jsonc
// fieldHelp.json (top level, next to "surfaces")
"tiers": {
  "onboarding": {
    "description": "Beginner help for new HR admins (phase 5). Switch off or trim workspaces when HR teams no longer need it.",
    "workspaces": ["hr"]
  }
},
// …and on each phase 5 entry:
"grace_minutes": { "tier": "onboarding", "hint": "…", "askMaya": { … } }
```

- `getFieldHelp()` returns `null` for an entry whose `tier` is not switched on for the
  current workspace. The entry's own `workspaces` gate still applies on top of the
  tier.
- **An entry with no `tier` is core**, and core entries are always on. All 127
  existing entries stay core, so leave them as they are.
- Validator: warn on an unknown tier, on a tier with no `workspaces`, and on a tier
  workspace that is not in `FIELD_HELP_WORKSPACES`.
- The rule for tagging: if an entry would pass phase 4's strict test (jargon, money at
  stake, a derived figure), make it **core**. If it is there because a beginner might
  hesitate, make it **onboarding**. When unsure, choose onboarding.
- Thinning out later is then one of three edits: remove `"hr"` from the tier, move a
  hint to core, or delete individual entries. Record this in the `fieldHelpMeta.js`
  header.
- If the surface `description` explains a concept key (§5), include the page and tab
  keys too.

## 3. The beginner test

The reader is **an HR generalist in their first month on HR Clouds**. They know:

- what an employee, a department, a leave request and a salary are;
- how to read a date, an amount and a status word like "Approved".

They do not know:

- Indian payroll and statutory rules;
- how our attendance engine judges a day;
- what our automations fire;
- which of our settings are org-wide;
- what locking, releasing or verifying commits them to.

Walk every element in the inventory (§4) and ask two questions:

1. **Could this person pause here, unsure what it means or which option to pick?**
2. **Could this person set it wrong without noticing, and would someone's pay, leave,
   attendance or documents change because of it?**

If either answer is yes, the element gets an ⓘ.

### Gets an ⓘ

| Element | The hint says |
|---|---|
| A rule field or toggle on a setup screen | What it changes, for whom, and from when. Where it helps, a short example ("Set to 10: a 9:10 punch still counts as on time"), but only if the example is settled by the code. |
| Two fields a beginner would confuse (grace vs late threshold; full-day vs half-day hours; multiplier vs credit) | Each one names how it differs from the other. |
| A field that looks ordinary but carries system meaning (`code`, `priority`, `sequence`, `applies_to`, `is_default`, "Effective from") | What the system does with it. |
| A select whose options are our own vocabulary (rounding policy, missing-punch action, definition mode) | What picking one changes. Don't list every option if the options already say it. |
| A domain term (PF, ESI, PT, TDS, CTC, pro-rata, arrears, F&F, Form 16) | Plain words, plus an Ask Maya question. |
| A derived figure (run totals, variance, employer cost, balance, liability) | What it is worked out from. |
| A status column or filter | What the stages mean and what each one locks, on the header. It needs one line; if it needs more, use a `status.<value>` key in the record inspector (§5). |
| An action whose consequence isn't obvious (Lock, Release, Verify, Finalise, Reissue) | Put the ⓘ on the section or the dialog field, never inside the button. What happens, and whether it can be undone. |
| A screen whose purpose or timing isn't obvious from its name | Page-level ⓘ (§5): what it's for and when in the month you'd use it. |
| A tab whose content isn't obvious from its label | Tab-level ⓘ (§5). |
| An automation card | What it does, when it runs, who it touches, and **what it does not do**. |

### Still none

- Names, titles, descriptions, notes, reasons, email, phone, search boxes and
  pagination.
- A plain record date, an "Actions" column, and a single ordinary amount field.
- Confirm dialogs and reason prompts. If a confirm doesn't say its consequence, that is
  a copy bug: list it, don't ⓘ it.
- Anything self-evident: Departments, Office Locations (name and address), Holiday
  name and date, Org Chart, and the Company Profile's contact fields. Record them in
  the matrix as "ordinary" so the next person doesn't redo the check.

## 4. Method: inventory first, then write

Phase 4 decided screen by screen from memory, and that is how it came out thin. This
phase decides **element by element, from a written inventory**.

1. **Walk every HR route.**
   - Start from the HR block of `src/shared/components/DashboardSidebar.jsx` (60
     destinations) and `src/routes/AppRoutes.jsx`.
   - Follow each route into every component it renders, including those in
     `src/shared/**` (queues, `ClaimDecisionDialog`, `SalaryStructurePanel`, document
     dialogs, `LetterProposalsScreen`, `IssuedDocumentsPage`…), **every dialog and
     form it opens**, and **every tab**.
   - Include the employee profile tabs (`screens/employee-profile/*`),
     `SettlementFlow`, `RunPayslipsPanel`, `CtcMoneyFlow` and `CtcBudgetBar`.
2. **Write a coverage matrix** in the scratchpad, one row per element: route · file ·
   element (label as shown) · key · kind (form/data/page/tab/section/status) · verdict
   (`core` / `onboarding` / `ordinary` / `explained inline` / `blocked on fact`) · why.
   "Explained inline" needs the inline text quoted, so a reviewer can judge it.
3. **Write the config** for one sub-phase at a time. Extend an existing surface where
   one fits (`attendance.policy_setup`, `leaves.policy_setup`,
   `payroll.component_setup`…), and add surfaces for screens that have none.
4. **Wire it.** Descriptor-driven forms first, because there the config alone does the
   work. Then `HelpLabel` on headers, tiles and sections, `<FieldHelp>` beside labels,
   and the `help` hooks inside `DetailDialog`.
5. **Measure, lint, build and report** (§8).

If you split the work across subagents, give each one a sidebar section. Each one
returns a JSON fragment plus its wiring, and **one merge step** writes
`fieldHelp.json`. Parallel edits to the one config file will conflict.

## 5. New wiring points

- **Page-level ⓘ.** Put it beside the page `<h1>`, grouped with
  `inline-flex items-center`, using `HelpLabel` or `<FieldHelp>`, key `page`. The h1 is
  hand-written in each of the 59 HR screens (there is no shared page header to hook),
  so wire it per file. Give it only to screens whose name doesn't say what they're for,
  such as:
  - Lock Attendance, Pay Differences, Payroll Automation, Leave Automation;
  - Document Automation, Letter Proposals, Bank Verification, Year-End & Form 16;
  - Payslips & Documents, Document Compliance, Organisation Documents.

  Departments, Invites and Holidays don't need one. The hint says what the page is
  for, and when in the month, or in what situation, you would use it.
- **Tab-level ⓘ.** Put one ⓘ **beside** the tab strip, outside the tablist, keyed
  `tab.<value>` of the **active** tab, so its content follows the selected tab.
  - For `FilterTabs`, place it between the tabs and the search box.
  - For `ProfileTabStrip`, place it outside the scroll container and its arrows, and
    never inside the strip.
  - One icon per strip, and only tabs with a config entry show it.
- **Status meaning.**
  - The column or filter header gets the lifecycle in one line.
  - Where a single status needs its own explanation, the record inspector carries it
    on the `DetailGrid` "Status" item, keyed `status.<value>`.
  - Where `*Meta.js` already renders a per-status hint (`RUN_STATUS_META`), don't add
    one.
- **Section and card headings** (automation cards, `DetailSection`, policy form
  sections such as "Late arrival penalties"). Use `HelpLabel` or the `DetailSection`
  `help` prop, and never put it inside the fold toggle.
- Concept keys (`page`, `tab.*`, `status.*`) go in the surface `description`, per the
  v2 rule.

## 6. Scope, in order: each sub-phase ships on its own

Seed candidates below come from a read of the code, not a full inventory. **The
matrix decides, not this list.** Every screen phase 4 marked "left with none" (audit
§11.3) is now in scope and must appear in the matrix again with a new verdict.

### 5a — SETUP (21 screens): first, because a wrong toggle changes everyone

- **Attendance Policies**
  - All rule fields: grace, late threshold, early exit, full/half-day hours, late
    arrivals per half day, consecutive late days, overtime after and overtime
    approval, correction window, auto clock-out, max breaks and duration, auto-detect
    shift, default policy.
  - Each section heading.
  - Mostly config-only: it already wires by `name`.
- **Work Shifts**: rotation, cycle, sequence, shift type, working hours, the policy a
  shift uses, and what happens to a shift with none.
- **Weekly Offs**: alternate or specific-week patterns, if present. **Holidays**:
  holiday type is still blocked (audit §11.4). Keep it blocked and say so.
- **Comp-off Policies**: multiplier, credit, half/full-day hours, max balance,
  validity, priority, applies to, approval, auto-credit.
- **Leave Types**:
  - `code` (used in policies and reports);
  - document required after N days;
  - weekends in between (sandwich rule);
  - type (paid or unpaid).
- **Leave Policies**: the phase 4 three, plus how leave is given, wait after joining,
  pro-rata for joiners, leave during notice, applies-to or assignment, and effective
  dates.
- **Leave Automation**: each job: what, when, who, and what it does not do.
- **Salary Components**: the phase 4 four, plus type, taxable, pro-rata or unpaid-day
  behaviour, payslip visibility and balancing.
- **Structure Templates**: balancing component, how a CTC is filled, and
  `CtcBudgetBar` / `CtcMoneyFlow` figures.
- **Tax & Legal Deductions**: the whole PF/ESI/PT/LWF/TDS surface, with no figures.
- **Benefit Plans**:
  - who pays what;
  - end cover;
  - the employee component, which is already done.
- **Payroll Settings**: every setting, including the switches phase 4 skipped for
  having a prose line, if that line fails the §1 test.
- **Payroll Automation**: each of the five cards.
- **Document Types**: mandatory, expiry, reminder, who uploads and who verifies.
- **Form Templates**, **Document Settings** (extend `documents.letter_settings`),
  **Document Automation**, **Letterhead & Branding**, **Letter Templates**: merge
  fields, descriptor concepts and auto-issue.

### 5b — PAYROLL cycle (12 screens + run detail)

- Employee Salaries: effective date, revision vs correction, structure assignment.
- Bank Verification.
- Salary Adjustments and Bonus Rules: the remaining fields after phase 4's parity
  entries.
- Claims: the HR-side fields; there are 0 today.
- Loans & Advances.
- Leave Payouts: the payout amount is still blocked (§11.4).
- Pay Differences.
- Exits & Final Pay and `SettlementFlow`: notice recovery, settlement heads, final
  date.
- Lock Attendance: what a lock stops, source, unlock.
- Payroll Runs list and `PayrollRunDashboard`.
- **Run detail**: per tab. The cap is gone, but "once per concept per state" still
  holds.
- Payslips & Documents and `RunPayslipsPanel`: generate vs release, what employees see
  and when.
- Approvals.

### 5c — PEOPLE, TIME & LEAVE

- Invites, including `InviteMemberModal`: every field beyond name and email.
- Employees.
- **Employee profile**: page plus every tab (Overview, Profile, Department, Leave,
  Attendance, Salary, Documents, Reports); tab-level ⓘ.
- Departments detail: head or manager meaning, if not obvious.
- Live Attendance and `AttendanceDirectory`.
- Shift Management (roster): conflicts, overrides, rotation.
- Leave Requests (HR queue).
- Regularizations and Comp-offs: the shared queue.
- Biometric devices.
- HR Dashboard tiles and Inbox cards.

### 5d — DOCUMENTS WE COLLECT and WE ISSUE

- Document Requests.
- Verification Queue: what verifying certifies.
- Employee Documents.
- Document Compliance: the mandatory gate, and why overdue is not a filter.
- Find a Document.
- Issued Letters: reissue vs re-download.
- Letter Proposals: maker–checker.
- Organisation Documents: acknowledge vs sign.

### 5e — TAX, INSIGHTS, COMPANY

- Tax Declarations: proof states and what HR's approval commits.
- Year-End & Form 16: provisional, closure, what it freezes.
- Attendance, Payroll and Document Reports: each metric's basis.
- Payroll and Document Exports: what each file contains and who it's for.
- Document Emails: delivery states.
- Audit Log: what is and isn't recorded.
- Company Profile: statutory identifiers only.

### Shared components

For shared components that manager and HR both render (queues, claim dialog, salary
panel, document dialogs):

- Gate the entry `["manager","hr"]` when its hint reads right to both (§2 parity), and
  tag it `onboarding`.
- The tier's own `workspaces: ["hr"]` keeps it off for managers until someone decides
  otherwise (open question 1).
- **Don't** write an HR-only variant of a shared hint.

## 7. Writing hints for a beginner

- The shape is **what it is → what it changes → for whom or from when**. Use two short
  sentences at most. Add a tiny example when it's clearer than a definition and the
  code settles it.
- Don't define a term by restating the label. "Grace period: the grace period
  before…" is useless.
- For a pair a beginner would confuse, each hint names how it differs from the other.
- Settle every behavioural claim from the code, `*Meta.js` or `public/ref docs/`. If
  you can't settle it, mark the entry `blocked on fact` in the matrix. **Don't guess.**
  Phase 4 left three hints that state behaviour without evidence (audit §11.8.2).
  Don't add more.
- **Ask Maya**:
  - **Every entry gets a conceptual question** — domain terms, our own settings,
    statuses, page and tab help alike (user decision, 2026-10-01, superseding the
    earlier hint-only rule for our own settings).
  - Set `"enabled": true` explicitly on every entry; the validator warns otherwise.

## 8. Definition of done, per sub-phase

1. **Coverage matrix complete** for the sub-phase. Every element has a verdict, and
   every "explained inline" has the quote.
2. Dev validator silent, including the new tier checks.
3. Every new entry carries `"tier": "onboarding"` unless it passes phase 4's strict
   test. Workspaces are `["hr"]`, or `["manager","hr"]` for shared components (§6).
4. **Live-browser layout check at 1366 and 390**, on the real dev server with an HR
   login.
   - Phase 4 skipped this. At this density it is not optional.
   - The user supplies credentials; never store them.
   - Scratchpad Playwright through system Chrome, per the UI review memory notes.
   - Host heights must be unchanged. Where a row grows, use `overlay`.
   - Also look at the screen as a whole. If a form section is a column of icons,
     say so in the report.
5. With the tier switched **off**, the HR DOM matches pre-phase-5 output (spot-check
   three screens). That proves the switch works.
6. `npm run lint`, compared to the baseline for the touched files only.
7. `npm run build && git checkout -- dist/ && git clean -fdq dist/`, then check that
   `git status --short dist/` is empty.
8. **Report** (CLAUDE.md §10):
   - surface ids and entry count, split core / onboarding;
   - Ask Maya questions added;
   - screens left with none, with the reason;
   - blocked facts;
   - copy bugs found (confirms with no consequence, jargon labels).
9. Append `## 12. Phase 5: HR onboarding coverage` to the audit report, in the shape of
   §10 and §11. Add a summary of the matrix: per screen, elements seen vs ⓘ added.

### Also update the rules, in the same change

- **`CLAUDE.md` §10.** After "Keep the cap…", add:

  > **Exception: the HR onboarding tier.** Entries tagged `"tier": "onboarding"`
  > cover every HR field a first-month HR admin could stall on. They are exempt from
  > the 4-per-screen cap and the "screen already explains itself" rule. They keep
  > once-per-concept, no layout shift and every placement and wording rule. The tier
  > is switched per workspace under `tiers` in `fieldHelp.json`. New HR screens get
  > onboarding entries as part of the build. Don't remove them one by one: thin them
  > by switching the tier.
- **`FieldHelp.jsx` and `fieldHelpMeta.js` headers**: the tier and why it exists.
- **Memory**: update `field-help-ask-maya.md` with the tier decision and the date.

## 9. Open questions for a human (ask before 5a ships, don't block on them)

1. **Managers.** Shared components will carry onboarding entries gated to both roles,
   but the tier is on for HR only. Should managers get it too? That is a one-word
   config change.
2. **An in-app "hide beginner tips" switch per user.** Useful once some admins are
   experienced and others are new. Not built here. The tier is the hook for it.
3. **Maya's corpus.** The 15 phase 4 questions and all new ones are unverified against
   live Maya. Which ones retrieve?
4. **Still-blocked facts.** Holiday type, leave-payout rate basis, and the three
   behaviour hints from audit §11.8.2. Who can settle them?

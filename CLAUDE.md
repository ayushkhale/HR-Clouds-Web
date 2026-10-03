# CLAUDE.md

HR Clouds Web — React SPA for HR / payroll / attendance / documents. Four workspaces
(`employee`, `manager`, `hr`, `guest`) plus a marketing site and auth screens.

House rules below are decisions already made, most after something was built wrong
once. Don't relitigate them. `.agents/rules/uirule.md` is the short form of §4.
Anything new ships with its ⓘ field help already wired (§10) — that pass is part
of the build, not a follow-up someone has to ask for.

React 18 · Vite 6 · React Router 7 · Tailwind 3.4 · ESLint 9 flat · Recharts ·
icons from `react-icons/hi` only · motion is in-house (`shared/motion`) — **never add
Framer Motion or GSAP**.

```bash
npm run dev · npm run build · npm run lint
```

**`dist/` is committed (~334 files) and deploys on push to `dev`/`main`.** After any
build, unless shipping one was the task:

```bash
npm run build && git checkout -- dist/ && git clean -fdq dist/   # git status --short dist/ must be empty
```

---

## 1. Layout

```
src/auth · landing · routes/AppRoutes.jsx (all lazy)
src/roles/{employee,manager,hr,guest}/{screens,components,payroll,documents,attendance,leaves}
src/shared/
  api/        one file per domain + client.js (fetch wrapper). No fetch in components
  components/ cross-role UI      screens/  whole pages used by 2+ roles
  documents/  planes + dialogs   attendance/ normalize, dates, enums, ui
  utils/ contexts/ hooks/ motion/ layouts/ config/ data/
```

**Never put "cookie", "ads", "advert", "tracking", "consent" or "privacy" in a
source file name.** `npm run dev` serves each module at its file path, ad/privacy
blockers drop those URLs, and one blocked static import blanks the whole app
(`legal/CookiePolicy.jsx` did, 2026-10-01 — it is `BrowserStoragePolicy.jsx` now;
`legal/PrivacyPolicy.jsx` did, 2026-10-03 — it is `DataHandlingPolicy.jsx` now).

One role → `roles/<role>/`. Two or more → `shared/`, taking a `viewer`/`plane` prop
rather than branching on the URL. Domain knowledge (labels, state machines, enum maps,
error copy) goes in a `*Meta.js`, not inline in JSX.

## 2. Role parity — the most important structural rule

**A manager may be promoted to HR, so the two workspaces must feel like one product.**
Same screen, layout, wording, columns, dialog shape and action placement; only data
scope differs. The mechanism is a `viewer` prop on one shared component, never a fork:

```jsx
export default function SalaryTab({ userId, viewer = "hr" }) { … }   // manager passes viewer="manager"
```

`viewer` picks the endpoints. It must not change the layout. See `SalaryTab`,
`SalaryStructurePanel`, `PayrollReportsView`, `MyProfilePage`.

- **Never fork a screen to give a role a different look.** Hide a field with a flag.
- A capability a role lacks is **absent, not broken** — the plane-adapter pattern
  (`DOCUMENT_PLANES`, `REQUEST_PLANES`, `TEMPLATE_PLANES`, `ORG_PLANES`) puts `null`
  there and the UI hides the control. Never show a button that 403s.
- Self-service pages mount in all three workspaces under each one's prefix, so the
  sidebar never ejects anyone (`SELF_SERVICE_BASE`, `MY_DOCUMENT_PATHS` in
  `shared/attendance/paths.js`).
- **One role, one workspace — the route gate is exact, not cumulative.**
  `workspaceForRole()` (`shared/auth/permissions.js`) maps super-admin/admin/hr →
  `hr`, manager → `manager`, employee → `employee`, guest → `guest`, and
  `ProtectedRoute` renders a workspace only for its own role, failing closed on an
  unknown one. HR must never render `/dashboard/employee/*` or
  `/dashboard/manager/*`, even though the self-service APIs behind them accept
  HR — that is exactly how HR once walked the employee tabs (2026-10-01). If a
  role lacks a page, mount it under that role's own prefix; never widen the
  gate. Links on shared pages come from `useCurrentWorkspace()` and the
  `useOrgPaths`/`useMyPayPaths`/`useMyDocumentPaths` hooks — never default a
  missing workspace to `"employee"`, never hardcode another workspace's URL,
  and never treat the raw role as a workspace (`admin` is not one). Cumulative
  role lists are API capabilities only (`canSelfServeAttendance`…).
- Sidebar label = page `<h1>` = top bar title, identical across roles.

## 3. Data flow: list → row → record inspector

**1. The list** is a table of scannable rows — who, when, how much, what state.
Everything else belongs in the detail. Tall cards for tabular data were rejected.

**2. The row opens it.** Spread `rowPreviewProps` from `shared/components/DetailDialog.jsx`
on the `<tr>`; it supplies click, Enter/Space, `tabIndex`, `aria-haspopup`, hover, and
guards so inner buttons pass through and text selection doesn't trigger it.

```jsx
<tr {...rowPreviewProps(() => setSelected(row), "Loan details")}>
```

- **No View/Review/eye button in a row** — keep only real actions (Approve, Cancel,
  Download). `RowOpenButton` was deleted.
- Don't hand-roll `onClick` + `cursor-pointer` on a `<tr>` — that loses keyboard access.
- A row that can't open anything gets a plain hover class, not the preview props.

**3. The detail is the `DetailDialog` record-inspector** (a master–detail overlay).
This is the house standard for **every popup showing data**, in every role. Compose
from `shared/components/DetailDialog.jsx` — never hand-roll a modal for data:

`DetailDialog` (shell: eyebrow, icon, title, subtitle, badge, loading, footer) ·
`DetailStats` (headline numbers) · `DetailSection` (titled, collapsible card) ·
`DetailGrid` (label-above-value, **max 4 cols**) · `DetailTable` (line items) ·
`DetailText` (reasons/notes) · `DetailPill` · `DetailFooterNote` (says *why* there are
no actions) · `displayValue()`.

Long/secondary sections start folded (`defaultOpen={false}`) with totals in the title;
`collapsible={false}` pins one open. Actions go in the `footer`, not the row. Money
splits Earnings / Deductions side by side. Reference: the salary history dialog in
`roles/hr/payroll/screens/EmployeeSalaryStructuresPage.jsx`.

**Excluded:** forms, confirms, reason prompts and pickers stay as they are
(`InviteMemberModal`, `TemplateFormDialog`, `HolidayModal`, `DecisionDialog`,
`ReasonDialog`). A form is not a record inspector. Big forms copy Create Attendance
Policy instead: `max-w-5xl`/`6xl`, `max-h-[92vh]`, uppercase 11px labels, pinned footer.

**A form dialog must not make the user scroll.** Four or more fields means wide
and gridded — `max-w-3xl` up to `5xl`, `grid sm:grid-cols-2 gap-x-6 gap-y-4`,
long fields (`PersonSelect`, `CompOffPicker`, a reason box) on `sm:col-span-2`.
Wrap an existing pair in `className="contents"` to lift it into the form's own
grid rather than re-nesting every field. `max-w-md` on a multi-field form is a
bug, not a style: salary adjustments, leave payouts, exits, document requests
and attendance corrections were all fixed this way. Single-field confirms,
reason prompts and person pickers stay narrow (`max-w-sm`/`md`).

**Stacking:** `DetailDialog` `z-[140]` < `AttachmentViewerDialog` `z-[165]` <
`ReasonDialog` `z-[170]`. Render those as **siblings** of `DetailDialog`, not children.
The ⓘ popover and a Maya raised by "Ask Maya" sit just above whatever dialog hosts
the ⓘ (`z-[155]`/`z-[160]` up to a z-150 host, host + 5 / + 10 above that — see
`fieldHelp/fieldHelpLayer.js`); keep new layers below the toasts at `z-[200]`.

## 4. Never show an ID

**No UUID, database id or raw enum reaches the screen** — not in a table, detail,
audit line or toast. Use the existing machinery:

| Need | Use |
|---|---|
| Is this an id? | `isUuid()` — `shared/attendance/normalize.js` |
| Name from a row | `personName()` — same file |
| Name from a bare `user_id` | `nameOf()` from `useEmployeeDirectory` (payroll) / `useTeamNames` (attendance) |
| Pick a person | `PersonSelect` / `PersonMultiSelect` — never a native `<select>` of people |

- An unloaded name reads **"Loading…"** — never "not found", never the id. An
  unresolvable id reads "Unknown user" / "A colleague" / "System".
- No id "just in case": no `(#a3f2…)` suffixes, no id column, no id in a tooltip. Show
  `employee_code` when an identifier is genuinely useful.
- Prettify enums with the existing `humanize()` (`attendance/enums.js`),
  `humanizeCode()` (`documents/documentMeta.js`) or `prettifyCode()`
  (`hr/payroll/runMeta.js`). Don't write a fourth.

## 5. Visual language

**Purple only.** Map green/emerald/teal/lime → **violet** (success);
amber/yellow/orange/pink → **fuchsia** (pending/warning); sky/blue/cyan → **indigo**
(info). **rose/red stay** for errors, destructive actions, lateness, deductions —
nothing else. Tone keys in `enums.js` keep old names but render purple. Never add a new
green/amber/orange/blue class.

- Every screen is full width (`max-w-7xl`). **Grid, don't narrow.**
- Dashboards keep the purple hero header (`PageHeader`); new header info goes *inside*
  it, same size in every role.
- **Never render a dash.** Unknown → **N/A** (`displayValue`, `formatUtils`, `dates.js`);
  unmeasured duration → **0m**; no action → empty cell. If no row in a list has an
  action, drop the Actions column.

Don't rebuild these: `GenderAvatar` (never hand-roll initials or `<img>` avatars) ·
`TimeField` (**never `<input type="time">`**) · `PersonPicker` · `FilterTabs`
(`attendance/ui.jsx` — tabs left, search right, counts in labels; a plain `<select>` of
roles was rejected) · `ReasonDialog` · `Skeleton` · `SalaryStructurePanel` ·
`ProfileTabStrip` (the employee-profile tabs, shared by HR and the manager —
it **scrolls horizontally**; a wrapped bar grew to three rows on a laptop, and a
bare scroll strip hid the last tabs, so the strip carries arrows, edge fades and
scroll-the-selected-tab-into-view. Don't turn it back into `flex-wrap`).
`.no-scrollbar` is defined in `index.css`; it hides the bar only, never `overflow`.

## 6. Wording

**Write for someone who doesn't work in HR or payroll.** Say the consequence, not the
mechanism ("Approving refunds their balance", not "triggers a balance reversal").
Labels are sentences, not enum names ("How it's worked out", "Still to repay").
Empty states say what to do next. Errors map through the domain's `*Errors.js`
(`payrollErrors`, `leaveErrors`, `documentErrors`) — never a raw code or Joi message.

Established: Override Config → **Customise Leave Rules** · accrued → **given so far** ·
upfront/monthly → **All at once / Every month** · carry forward → **kept for next
year** · probation → **wait after joining** · overdraft → **extra days below zero** ·
TDS YTD → **Income tax so far** · Net Pay → **what reaches the bank** · Gross →
**before deductions — not take-home** · encashment → **Leave Payout** (the action
is "pay out", never "encash" or "cash out") · Exits & Settlements → **Exits &
Final Pay** · Statutory & Tax → **Tax & Legal Deductions** · statutory deductions
→ **PF, ESI and tax** (or "deductions required by law") · LOP / LWP → **unpaid
days** · EMI → **monthly repayment** · disbursement → **money paid out on** ·
arrear → **backdated pay**. Words with a single source live in
`DICTIONARY.TERMS` (`shared/config/dictionary.js`) — put a new one there rather
than typing it on each screen.

**A day is whole or half, never a decimal.** `formatDayCount()`
(`shared/utils/formatUtils.js`) is the only way to print a day count, in leave,
comp-off, payout, payroll and attendance alike: `0.5` → **"1 Half Day"**, `2.5` →
**"2 Days and 1 Half Day"**, with `{ lower: true }` mid-sentence. Never `2.5`,
`2½` or "2 and a half". The phrase carries its own unit, so a tile or column
beside it must not add a "days" caption — say "left", "paid", "unpaid". Eight
hand-rolled copies of this disagreed with each other once; don't write a ninth.

Use `’` (U+2019) in JSX text — `react/no-unescaped-entities` is on.

## 7. Data and API

- All calls go through `shared/api/*.api.js`.
- **Binary downloads (PDF/CSV/ZIP) never use `request()`** (JSON-only) — use
  `downloadFile()` from `shared/utils/download.js`. It appends a one-item array once
  while the api layer's `qs()` repeats it, so route array params through
  `repeatSingles()` rather than changing `download.js`.
- **Gate UI on what the server returned**, not on the spec. Absent key → hidden
  feature. A missing backend feature degrades to a hidden control, never a crash.
- **`window.confirm` returns a Promise** (`GlobalAlertProvider` overrides it):
  `if (!(await window.confirm("…"))) return;` — ~20 unawaited calls once fired their
  API before the user clicked OK.
- Guard stale responses with a `cancelled` flag or a request token ref.
- No request per row — use the bulk endpoint, refresh one row after a write.
- **People come from one place: `useEmployeeDirectory()`**
  (`shared/contexts/EmployeeDirectoryContext`). Never call
  `organizationAPI.getEmployees()` from a screen and never add a second roster
  fetch — a `purpose` narrower than `emp_report` drops `avatar_url`, and an
  unpaginated call stops at 100 people, which is how the same colleague ended up
  with a photo on one screen and initials on the next. It gives `rows` /
  `activeRows` (leavers are a filter, never another read), `options` /
  `activeOptions` for pickers, `byId`, `nameOf` and `entryOf`. After anything
  that changes who is in the organisation — an invite, a deactivation, a delete
  — call `refreshEmployeeDirectory()`. Photos are presigned links that die in
  ~5 minutes; the store re-reads them, so never cache a roster row's
  `avatar_url` anywhere else.
- Distinguish **"nothing on file"** from **"couldn't load"**: a failed read shows
  "Couldn't load", never "Not set" (which invites a duplicate assignment). Use a
  sentinel, not `null`, for a failed lookup.
- **A decision that empties a queue must clear its count without a reload.** There
  is no query cache, so emit `emitAttendanceChanged(ATTENDANCE_EVENTS.<kind>)`
  (`shared/attendance/events.js`) the moment an approve/reject/cancel succeeds, and
  list the kind in `INBOX_EVENT_KINDS` — the sidebar badge and the inbox cards both
  subscribe to it. The bus is app-wide despite the folder: leave, claims, loans,
  salary proposals and tax declarations all emit. A new approval queue joins that
  list on the day it is added, or its badge goes stale until F5.
- Pollers check `document.visibilityState`. Bulk writes use `settleWithLimit`, never a
  sequential await loop. Duplicate dev requests are StrictMode, not a bug.

## 8. Code style

Match the file you're editing. Non-trivial files open with a `─────` header comment
saying **what the screen is for and why it's built this way**, including contract traps
— keep this up, it's the main defence against a later change undoing a deliberate
choice. Comments explain **why**, not what. Functional components and hooks only;
`export default` the component, named exports for helpers; move helpers to a `*Meta.js`
when `react-refresh/only-export-components` complains.

Before finishing, run `npm run lint` and compare against the **baseline for the files
you touched** — this repo has pre-existing errors (unused `React` imports, unescaped
apostrophes). Don't mass-fix unrelated ones; don't add new ones.

## 9. Reference docs

`public/ref docs/` is the contract source of truth and beats any assumption:
`api_registry.md` (every endpoint, with implemented marks — **tick the rows you
implement**), plus `md_payrolls/`, `md_docs/`, `md_attendance/`, `md_leave/`,
`md_organization/`, `md_auth/`, `md_updates/`.

The spec is occasionally wrong. When live behaviour contradicts it, trust the live API,
fix the code, and record the deviation in the file's header comment so the next person
doesn't "correct" it back.

## 10. ⓘ help and "Ask Maya" — part of every new form and screen

**Ship every new development with its ⓘ help already in it — nobody has to ask.**
A feature, form, dialog, column, tile or data screen is not done until it has had a
field-help pass, in every role that renders it. Treat it as part of the build, like
the empty state or the loading skeleton: same task, same commit, same lint run. The
same pass runs when you change what an existing field means — a reworded label, a
new status, a changed calculation — because the old hint is now wrong, not missing.

**How much help a thing gets follows how far it sits from everyday knowledge.** Walk
the new surface and rate each field on that distance:

| The field is… | Do |
|---|---|
| Ordinary (name, date, title, amount, reason, search, notes) | No ⓘ — never |
| Ours: a system-specific field, toggle or state set we invented | ⓘ saying what it changes for the person, plus an Ask Maya question |
| Domain: a payroll, tax, leave, attendance or compliance term | ⓘ in plain words (§6), plus an Ask Maya question |
| Derived: a figure we computed (balances, pro-rata, net, accruals) | ⓘ saying what it is worked out from, plus an Ask Maya question |
| On someone else's behalf: an HR/manager choice that lands on an employee | ⓘ saying who feels the consequence, plus an Ask Maya question |

**Never on everyday data people read daily** (user decision, 2026-10-01 — they
were removed as annoying): dashboard counts (present/absent/late), Live
Attendance, attendance status / hours / effective / late / overtime columns and
day inspectors, routine queue status columns. Seen every day, understood after
the first; an ⓘ there is noise. Help belongs on setup, payroll and rarer screens.

Keep the cap: at most 4 per screen state, once per concept, and nothing where the
screen already explains itself. If the whole surface is ordinary fields, it gets
none — say so when you report the work rather than forcing one in.

**Exception: the HR onboarding tier** (2026-10-01). Entries tagged
`"tier": "onboarding"` cover every HR field, column, tab and screen a first-month
HR admin could stall on or set wrong. They are exempt from the 4-per-screen cap
and the "screen already explains itself" rule — an inline range, format or jargon
line is not an explanation. They keep once-per-concept, no layout shift and every
placement and wording rule. The tier is switched per workspace under `tiers` in
`fieldHelp.json` (HR only today). New HR screens get onboarding entries as part of
the build. Don't remove them one by one: thin them by switching the tier. Page
help is the key `page` beside the `<h1>`; tab help is one ⓘ beside the tab strip
keyed `tab.<value>` of the open tab. Brief: `.agents/prompts/hr-onboarding-help-ask-maya.md`.

**Reporting:** every hand-off of new UI states the field-help outcome in one line —
the surface id, how many hints, and any Ask Maya questions added, or "no field
qualifies" with the reason. A hand-off that doesn't mention ⓘ help is unfinished.

- **One source:** `src/shared/fieldHelp/fieldHelp.json` (v2 `surfaces`). Surface
  ids name the domain, not the role (`attendance.approval_queue`); keys are the API
  payload/response key, never the label. No hint text in JSX. The dev-only
  validator in `fieldHelpMeta.js` flags mistakes.
- **Wiring:** `<FieldHelp>` *beside* a form `<label>` in a `flex items-center` row
  (never inside it); `HelpLabel` on a `th`, tile or heading; the `help` hook on
  `DetailGrid`/`DetailStats` items, `DetailSection` and `DetailTable` columns.
  List-shaped data is wired by key and the config chooses which rows get one.
- **Placement:** no layout shift (measure at 1366 and 390; `overlay` where a label
  would wrap), never inside another interactive element or a tablist, headers not
  cells, once per concept per screen, at most 4 per screen state, and not where the
  screen already explains it. The header of `FieldHelp.jsx` has the full rules.
- **Workspaces:** gate each entry to every workspace that renders its component —
  a component shared by manager and HR gets both (§2). Write the hint in a voice
  that is right for all of them ("the employee", not "your report"); a screen about
  someone else never reuses an entry written to the employee about their own data.
- **Wording:** hint ≤ 160 characters, the consequence, not the mechanism (§6); no
  figures that change with law, state or year. Settle facts from code and
  `public/ref docs/`, or leave them out. Ask Maya questions are static and
  conceptual — never a name, amount or id — and Maya **never auto-sends**.
- **Every hint has an Ask Maya question** (user decision, 2026-10-01) — domain
  terms, our own settings, statuses, page and tab help alike; `"enabled": false`
  is no longer an option. Phrase it for the workspaces that see it (the employee
  about their own data; neutral for manager/HR). The dev validator warns on any
  entry without one.
- Briefs and history: `.agents/prompts/*-ask-maya.md` and the audit report in
  `public/ref docs/md_updates/`.

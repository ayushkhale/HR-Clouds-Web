# CLAUDE.md

HR Clouds Web — React SPA for HR / payroll / attendance / documents. Four workspaces
(`employee`, `manager`, `hr`, `guest`) plus a marketing site and auth screens.

House rules below are decisions already made, most after something was built wrong
once. Don't relitigate them. `.agents/rules/uirule.md` is the short form of §4.

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

**Stacking:** `DetailDialog` `z-[140]` < `AttachmentViewerDialog` `z-[165]` <
`ReasonDialog` `z-[170]`. Render those as **siblings** of `DetailDialog`, not children.

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
roles was rejected) · `ReasonDialog` · `Skeleton` · `SalaryStructurePanel`.

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
**before deductions — not take-home**.

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
  `fetchAllOrgEmployees()` caches 5 min per token and shares in-flight calls.
- Distinguish **"nothing on file"** from **"couldn't load"**: a failed read shows
  "Couldn't load", never "Not set" (which invites a duplicate assignment). Use a
  sentinel, not `null`, for a failed lookup.
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

# Frontend triage — Employee & Manager panel audits (2026-10-14)

**Source reports:** `public/ref docs/employee-panel-audit/2026-10-14/` (E-01 … E-24) ·
`public/ref docs/manager-panel-audit/2026-10-14/` (M-01 … M-34)
**Scope of this pass:** frontend only. Nothing that originates in backend logic, API
payloads or seeded data was changed, per the triage brief.
**Checks run:** `npm run lint` (no new errors against the baseline for the touched
files) · `npm run build` (clean) · dev-server smoke load (only the pre-existing
DocMind 403 on localhost) · node harnesses over the duration tidier, the salary
earnings buckets and the dashboard KPI tiles.

**Second pass (2026-10-14, later):** every finding in both folders was re-verified
one by one against code and against `public/ref docs/` rather than triaged in
groups. That turned up two defects the first pass missed (E-08, M-14) and let
several reports be answered with evidence instead of deferred — see §3.

---

## 1. Fixed — confirmed frontend defects

| Finding | Root cause found in code | Change |
| :--- | :--- | :--- |
| **E-02** (display half) | `workedLabel()` prefers the server's `worked_duration_formatted`; `tidyDuration()` needed a digit first, so `"-1h 58m"` fell through untouched. `fmtHours()` had always clamped the *number*, so the two disagreed. | `shared/attendance/dates.js` — the tidier now reads a sign and clamps a negative duration to `0m`; `totalWorkedLabel()` goes through the same tidier. |
| **E-15 / M-29** | The payslip **list** (#53/#55) carries gross, net and `statutory_status` but not deductions — that is on the detail (#54/#56, under `figures`). The employee card printed `N/A` on every row and the manager table printed **`₹0`** (`formatMoney(undefined)`), which reads as "nothing was deducted" while net sits below gross. | Both screens now read `total_deductions ?? figures.total_deductions` and show the line/column **only when the payload carries it** (§7). The manager table drops the column entirely when no row has it. |
| **E-05** | `statutory_status: "not_applied"` was returned and never surfaced in a list. | A plain-words flag on the employee payslip card and the manager payslip row: PF, ESI and tax were not taken off, so the figure is not take-home. |
| **E-20** (employee half) | The leave balance card led with a mono chip of `leave_type.code` (`ECL_2026`) and the Apply-Leave options appended `(code)`. | Both removed — the name is already there (§4). HR's employee-profile leave tab keeps the code: HR configures policies by it. |
| **M-30** | Team Cost rows rendered `employee_name \|\| user.profile.display_name \|\| user.identifier` inside a `<span>`. Run items name their person by `user_id`, so every cell was an empty element — and because it was an element, `DetailTable`'s "N/A" fallback never fired. Status rendered the raw enum and was `N/A` on every row. | Names resolve through `personName()` → `useEmployeeDirectory().nameOf()` (§4: "Loading…", never an id). Status is `humanize()`d and the column appears only when the items carry a state. |
| **M-31 / M-15** | Team History cards were plain `<div>`s — the reason, the paid/unpaid split, the attachment and who decided it were unreachable from the screen. | The card now opens a `DetailDialog` record inspector (§3) with the same field set and wording as HR's leave preview, minus the actions, plus a `DetailFooterNote` saying why there are none. Status pills use `humanize()`. |
| **M-32** | `loadRequests` sets `loading` inside an effect, i.e. one render after the tab changed; that render drew the settled `loading: false` against an empty history list and flashed "No History Found". | Tab, status-filter and page changes mark the list busy in the same update that changes it. |
| **E-08** | `MySalaryPage.breakdownOf` bucketed earnings as `component_type === "earning"`, so an `employer_contribution` component (AI_RECHARGE, 6,250) was dropped from both tables — while the gross it is headed with comes from `figures.monthly_gross`, which counts it. The Earnings heading therefore read 1,25,000 over rows adding to 1,18,750, and the employee saw one component fewer than HR, whose shared `SalaryStructurePanel` buckets `!== "deduction"`. | The employee screen now buckets like the shared panel (same rows in all three roles) and each earnings table is totalled by the sum of its own rows, as `SalaryStructurePanel` already does with "Total earnings". No money tile moved: gross and take-home still come from the statutory breakdown, and the cash-only fallback still excludes employer contributions. |
| **M-14** (frontend half) | The manager dashboard read `s.team_size` and `s.counts?.late` straight into KPI tiles through `num()`, which turns a null into **0**. The endpoint documents both as numbers (`md_updates/2026-10-04_…_attendance_calculation_and_api_sync.md`) but ships them null, so "Team members" and "Late arrivals" stated a measurement where the server had said nothing — and "Late arrivals 0" could sit above a Lateness column reading "12m" on the same screen. | Both tiles use the server's number when it sent one, else count the team list the screen has already loaded (the roster the tile is about), else **N/A** (§5). Lateness is client-derived by contract §8 anyway (`late_minutes > 0`, there is no `late` status), which is what the column below already does. A real `0` from the server still prints `0`. |
| — (house-rule leftover) | Three `help={{ surface: "attendance.team" … }}` props pointed at a surface that does not exist in `fieldHelp.json`, so they rendered nothing. §10 bans ⓘ on dashboard counts and Live Attendance columns, which is why the entries were removed in the first place. | Dead props removed from `ManagerDashboard` and `HRDashboard`. |

## 2. Reported but not a frontend defect

- **E-03, E-04, E-07, E-12, E-13, E-14 · M-02, M-10, M-12, M-13, M-16, M-17, M-20, M-23** — value and arithmetic
  problems behind the screen: a balance that does not equal accrued − used, a paid
  month with all-zero statutory fields, EPS copied from PF, sub-second breaks stored
  as whole minutes, a stale `next_due_period_month`, a projection that does not model
  HRA. Each screen already renders the parts the figure is made of — the Sick Leave
  card shows "10d left · 10d given so far · 2d used", which is how the auditor saw
  E-03 in the browser — so the UI is exposing the server's arithmetic, not hiding it.
  Clamping or recomputing in the UI would paper over a payroll-adjacent defect.
- **E-22** — the backend stores the email *in* the `name` field, and `personName()`
  already prefers every real name field before falling back to an email as a last
  resort. The frontend has no better source here: `useEmployeeDirectory` reports
  `status: "unavailable"` for an employee or guest, because that role may not read
  the roster. Substituting "A colleague" would remove the only identifying detail
  left. Resolving actor names belongs where the hierarchy endpoint already has them.
  (Where the roster *is* readable — the manager's Team Cost rows — this was fixed:
  see M-30.)
- **E-19** — the slow screens already render `Skeleton`s while loading; the latency
  (projection 6.3 s, graph 3.7 s) is server-side.
- **M-01 / M-25** — one task id, two payloads. The UI cannot produce this: the
  planes differ only in which endpoint they call (`taskPlanes.js`), and priority and
  kind each run through one pure map (`taskPriorityLabel`, `taskCategoryLabel`) used
  by the one `TaskTable` and the one detail dialog. Preferring either endpoint's
  value in the UI would hide a real divergence. Rendering a timezone on the due time
  is not the fix either — no screen in the app labels one, and M-17 shows the stored
  zone is itself inconsistent (`Asia/Kolkata` vs `Asia/Calcutta`).
- **M-02 / M-26** — the two buckets overlap (absent 4 **and** pending 4 for a team of
  4) and their precedence is undocumented — the finding asks for that documentation
  itself. The dashboard already drops `final_pending_count`, which is why the tiles
  on screen reconcile to team size; any UI arithmetic across two overlapping buckets
  would be a guess, and relabelling "Absent" without fixing the bucket would make the
  KPI disagree with its own total.
- **M-04** — `punctuality_percentage` is **not rendered anywhere in the manager
  panel** (only the employee dashboard and HR's profile overview), so the
  divide-by-zero fallback has no manager-panel surface. The fallback is backend.
- **M-05** — already answered in the UI: the chart's bar is labelled
  `DICTIONARY.STATUS.LEAVE_AND_OFF` — leave **and** offs, not "leave" — and member
  history renders Weekly off and Holiday as their own statuses.
- **M-06** — `metric()` (`dayStatus.js`) keeps null ≠ 0 on purpose ("averaging them
  together is how a month of Sundays silently drags an average down"), and the
  formatters print N/A or 0m, so the split never reaches the screen.
- **M-08** — nothing is summed: no arithmetic anywhere in `src/` over
  `total_days`, `worked_hours` or `total_hours`, and the formatters coerce with
  `Number()`. Strings in, formatted days and rupees out.
- **M-19** — `current_streak` is not rendered anywhere in `src/` (no match at all),
  so the provisional-absent streak has no UI surface.
- **M-34** — **partly incorrect.** The pending-approvals counter already exists: the
  sidebar inbox badge, refreshed live through the attendance event bus
  (`INBOX_EVENT_KINDS`, `DashboardSidebar.jsx:133,170`) so a decision clears it
  without a reload (§7). The team-task strip is a new dashboard section — product call.

## 3. Reported but not a bug (verified against code)

- **E-10** — 15 Nov 2026 is a **Sunday**, so a 15 → 16 Nov request spanning two
  calendar days with `total_days 1.00` is correct under the weekly-off exclusion
  the apply form itself advertises ("Holidays and weekends are automatically
  excluded"). The finding's expected arithmetic — inclusive calendar range — is the
  one rule the system deliberately does not use. The form also already shows its own
  computed span beside the range, which is what the finding asks for.
- **E-01** — no `dangerouslySetInnerHTML` anywhere in `src/`, so React escapes these
  fields by construction; the finding's own browser note ("rendered as inert text")
  matches. Sanitising on write and purging the probe rows is server-side work.
- **E-06** — the UI does not sum `upcoming`: it lists rows, and already deduplicates
  the bonus/adjustment overlap by id (a bonus *is* an adjustment, same ids from both
  reads). The three same-amount rows carry distinct ids, so collapsing them in the UI
  would hide real records; the finding's own fix is an idempotency key at write time.
- **E-09** — already handled defensively: the apply-form catalog filters to types with
  both an id and a name, balance cards fall back to the type name, and the form derives
  options from balances only when the types list is empty. A balance whose type is not
  in `my-leave-types` simply offers no option, which is what ineligibility should look
  like. Eligibility filtering itself is server-side.
- **E-16** — the empty states already say what to do next and carry the action where one
  exists ("What I can add", "My Document Requests"). Zero documents is seed data, and a
  `storage.example.com` attachment URL can only be rejected where it is saved.
- **E-17** — the anomalies inbox exists (**My Flags**: filters, row → detail, N/A
  handling, field help). The 415 km geofence text is the server's own `description`
  string, printed verbatim; parsing distances out of API prose would be worse than
  showing it. One-tap regularization per flag is a feature request.
- **E-18** — all three 403 endpoints (`/leaves/types`, `/leaves/templates`,
  `/organizations/me/setup-status`) are called only from `roles/hr/` screens and HR-only
  dialogs, which the exact route gate renders for HR alone; the employee document plane
  uses `/me/documents/types` instead. No employee path reaches them. The 404s are GETs
  against routes the app only ever PATCHes/PUTs. Sweep artefact.
- **E-21 / E-23** — `final_leave_days` is not rendered anywhere in the employee panel,
  and punctuality is shown once per screen from a single endpoint, so the 83.33 / 87.8
  disagreement is never visible side by side. Both are backend definitions.
- **E-24** — the employee's own `ReviewSection` deliberately shows only "Decided on",
  "Submitted on" and the note, so a `reviewed_at` with a null `reviewed_by` prints no
  phantom reviewer. 3 Oct 2026 is a Saturday, consistent with a configured half day.
- **E-11** — the three identical 31 Dec rows are distinct records, keyed by id with a
  composite fallback, so this is not a duplicate-render defect.
- **M-07 / M-27** — there is one avatar component and 35 files use it.
  `GenderAvatar` resolves photo → gender illustration → purple initials, falls
  through on an image error and calls `markDirectoryPhotosStale()` for the
  300-second presigned links of M-13; the header passes an explicit `name` so
  initials can always be formed. Both illustrations decode to well-formed,
  self-contained 280×280 SVG data URIs, so neither can half-render, and the only
  raw `<img>` tags in `src/` are Maya's own avatar and the crop preview in the
  upload dialog. The "AH" initials the audit saw on a comment author are that same
  component's third fallback, not a second one — the fallback is not inconsistent,
  the **inputs** are (`avatar_url` null on some endpoints, which is M-07's API
  half). No person avatar hand-rolls initials; the ones in `OrgLogo` /
  `OrgSwitcher` are **organisation** logos, where initials are the deliberate
  stand-in for a missing logo.
- **M-09** — all four envelopes are handled. `normalizePaginated()` reads
  `totalPages ?? total_pages ?? pages` and `total ?? totalItems ?? total_count ??
  totalCount ?? count`, from `pagination` or `meta`, inside `data` or beside it;
  the one odd shape (task comments' `total_items`) is read at its own call site,
  `TaskDiscussion.jsx:118`. Standardising the envelope is still worth doing, but no
  screen mis-pages today.
- **M-11** — not reachable from a manager screen. `GET /manager/team/anomalies` and
  the regularization queue are **pending-only**, so an approved record's null
  requested times never render in a manager row; where they do render,
  `RequestedTime` prints N/A for a null (§5). The one place a reviewer id is shown
  resolves it through `nameOf()` (`ManagerLeavePage.jsx:122`) — no UUID reaches the
  screen (§4) — and anomaly resolution already **requires** remarks client-side
  (`requireRemarks: true`), which is the finding's third ask.
- **M-18** — derived rows are keyed defensively already: team history falls back to
  a date-plus-index composite when `r.id` is null, the roster to the member's name,
  and `isSynthesizedDay()` exists precisely to recognise an `id: null` day. No null
  key and no null literal reaches the DOM.
- **M-21 / M-33** — `GET /manager/team/anomalies` returns **unresolved rows only**
  and accepts no query params (`api_registry.md:95`,
  `md_attendance/ATTENDANCE_API_CONTRACT.md:832`), so a status or resolution column
  would read the same on every row — the same reason §5 drops an Actions column no
  row can fill. The truncated Details cell carries the full text in a `title`
  tooltip **and** the row opens the decision dialog, where `AnomalyDetails` fetches
  the day's punch record. The `is_resolved` field the finding cites comes from
  `/attendance/anomalies/mine` — the employee endpoint, not the Flags screen it
  describes.
- **M-22** — verified (the audit left this open): `purpose: "emp_report"` is sent on
  every employee read. `utils/orgEmployees.js:44` is the only caller of
  `getEmployees` in the whole app and no screen calls it directly (§7), which is why
  the directory loads. The bare-call 400 is a contract-documentation note.
- **M-17** (UI half) — no CSS uppercases a location value anywhere; "HEAD OFFICE" is
  the stored string. Seed data, as reported.

## 4. Left for a product decision

- **M-24** — the manager's Team Directory already shows only his four reports, so
  the UI is team-scoped; the endpoint is what returns all eight org members to a
  manager caller. Narrowing it is the same policy call as M-03, and it has to be
  made at the endpoint — client-side filtering would still have delivered the other
  members' rows to the browser.

- **M-28 / M-03** — the manager member profile reuses HR's `ProfileTab` deliberately
  (§2 role parity), and the PII it shows is what `GET /organizations/employees/:id`
  returns to a manager. Narrowing it is a policy change, best made at the endpoint
  (M-03); hiding fields behind a `viewer` flag is a one-line follow-up once that call
  is made.

## 5. Field help (§10)

One new ⓘ, from the E-08 fix: `payroll.my_salary` › `monthly_gross`, on the
"Gross / month" tile, because that figure now has visible arithmetic under it and
the audit showed an employee could not reconcile it. Gated to employee, manager and
HR (every workspace that mounts the screen), 142 characters, with an Ask Maya
question; the dev validator passes.

The manager pass added none: §10 bans ⓘ on dashboard counts (present / absent /
late) outright, and the three dead `attendance.team` props removed in §1 were on
those very tiles. The M-14 fix changes where a count comes from, not what it means,
so no hint went stale.

Nothing else qualified. The other new surfaces are: View buttons (ordinary actions), a statutory flag
that is itself the plain-words explanation, and a leave record inspector whose only
non-obvious field — the paid/unpaid split — already carries
`leaves.approval.paid_split`, gated to `manager` and `hr`. Nothing else on these
screens sits beyond everyday knowledge, and §10 bars a hint where the screen already
explains itself.

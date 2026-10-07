# Frontend Integration Prompt — Attendance Calculation & Data Contract Sync

**Date:** 2026-10-04
**For:** Frontend engineers (Web + Mobile) integrating the HR, Manager and Employee attendance panels
**Backend branch:** `claude/ecstatic-turing-uhasvq` (commits `f914457`, `9a31d3e`)
**Change type:** Additive API changes + **documentation corrections you must act on**

---

## How to use this file

Everything below is a self-contained brief. Paste the **§0 prompt** into your coding agent, or read
§1–§7 directly. Copy this file and the two sync guides named in §1 into the frontend repo's
`public/md_updates/` folder so the frontend project carries its own record of the change.

---

## §0 — Copy-paste prompt

> You are integrating the HRMS frontend with a backend overhaul of the attendance calculation engine
> and read planes across three panels: HR (org dashboard), Manager (team views) and Employee
> (self-service).
>
> **Read these files from the backend repo first, in this order. They are authoritative; do not
> infer the contract from existing frontend code, which is known to be built against incorrect
> documentation:**
>
> 1. `public/md_updates/2026-10-04_employee_and_manager_attendance_calculation_and_api_sync.md`
>    (**v1.2.0** — employee + manager contracts, exact TypeScript interfaces, invariants, UI mapping)
> 2. `public/md_updates/2026-10-04_hr_attendance_calculation_and_graph_data_sync.md`
>    (**v1.1.0** — HR org dashboard + manager aggregate contracts, §5 has the new fields)
> 3. `public/md_updates/2026-10-04_attendance_day_status_provenance_contract.md`
>    (the `status_source` / `status_reason` / `is_provisional` sibling contract)
> 4. `public/md_system/employee_and_manager_attendance_calculation_source_of_truth.md`
>    (single-employee precedence ladder and monthly invariant — read when a number looks wrong)
> 5. `public/md_system/attendance_calculation_source_of_truth.md`
>    (org-wide precedence, expected man-days, department aggregation)
> 6. `public/md_system/api_registry.md`
>    (canonical endpoint list — the single source of truth for URLs)
>
> **Critical first task.** Every employee attendance endpoint was documented with a `/user/` path
> segment that does not exist. Audit the frontend for `"/attendance/user/"` and fix each to the real
> path in §2 below. These calls return **404** today.
>
> Then work §3 (new additive fields), §4 (invariants and percentage rules), §5 (UI/rendering), and
> verify against §6 (acceptance criteria). Nothing in this change is breaking at the JSON level: no
> key was renamed or removed. Everything new is additive.
>
> Reference backend sources only if you need to confirm behaviour:
> `src/modules/attendance/services/clock.service.js`,
> `src/modules/attendance/services/user_attendance_read.service.js`,
> `src/modules/attendance/services/manager_attendance_read.service.js`,
> `src/modules/attendance/services/hr_attendance_read.service.js`,
> `src/modules/attendance/utilities/attendance_batch_evaluator.utils.js`,
> `src/modules/attendance/utilities/day_status.utils.js`,
> `src/modules/attendance/utilities/dense_history.utils.js`.
> Executable examples of every guarantee live in
> `tests/unit/attendance/review_findings_regression.test.js`.

---

## §1 — Documents to read (and what each is for)

| File | Version | Use it for |
|---|---|---|
| `public/md_updates/2026-10-04_employee_and_manager_attendance_calculation_and_api_sync.md` | 1.2.0 | Employee + manager request/response contracts, TS interfaces, nullability, invariants, UI mapping |
| `public/md_updates/2026-10-04_hr_attendance_calculation_and_graph_data_sync.md` | 1.1.0 | HR dashboard + manager aggregate fields; §5 lists every new field |
| `public/md_updates/2026-10-04_attendance_day_status_provenance_contract.md` | — | The three provenance siblings on every day-shaped object |
| `public/md_system/employee_and_manager_attendance_calculation_source_of_truth.md` | — | Why a given day resolved the way it did (6-step precedence ladder) |
| `public/md_system/attendance_calculation_source_of_truth.md` | — | Org-wide rollups, department aggregation laws |
| `public/md_system/api_registry.md` | — | Canonical URLs for every endpoint |

> Read the two `md_updates` files in full. The `md_system` files are reference material — consult
> them when a number needs justifying, not as integration instructions.

---

## §2 — Endpoint paths (there is no `/user/` segment)

The employee routers mount at `/api/v1/attendance` directly. Earlier documentation showed
`/api/v1/attendance/user/...`, which **404s**.

**Employee / self-service**

| Correct | Previously documented (404) |
|---|---|
| `GET /api/v1/attendance/today` | ~~`/attendance/user/today`~~ |
| `GET /api/v1/attendance/history` | ~~`/attendance/user/history`~~ |
| `GET /api/v1/attendance/summary` | ~~`/attendance/user/summary`~~ |
| `GET /api/v1/attendance/graph-data` | ~~`/attendance/user/graph-data`~~ |
| `GET /api/v1/attendance/daily-log` | — |
| `GET /api/v1/attendance/trends` | — |
| `GET /api/v1/attendance/weekly-calendar` | — |
| `GET /api/v1/attendance/holidays` | — |

**Manager**

- `GET /api/v1/attendance/manager/team/summary?date=YYYY-MM-DD`
- `GET /api/v1/attendance/manager/team/graph-data?month=MM&year=YYYY`
- `GET /api/v1/attendance/manager/team/member/:userId/summary?month=MM&year=YYYY`
- `GET /api/v1/attendance/manager/team/member/:userId/history?from=&to=&page=&limit=`
- `GET /api/v1/attendance/manager/team/member/:userId/daily-log?date=`

**HR**

- `GET /api/v1/attendance/hr/dashboard/live?date=YYYY-MM-DD`
- `GET /api/v1/attendance/hr/dashboard/graph-data?month=MM&year=YYYY` (or `?from=&to=`)
- `GET /api/v1/attendance/hr/dashboard/department-summary`
- `GET /api/v1/attendance/hr/dashboard/top-defaulters`
- `GET /api/v1/attendance/hr/dashboard/work-mode-distribution`

Validation bounds: `month` 1–12, `year` 2000–2100, `page` ≥ 1, `limit` 1–100 (default 20).

---

## §3 — New fields (all additive — nothing renamed or removed)

### 3.1 `GET /api/v1/attendance/summary` and `/graph-data` → `summary`

Also present on `GET /api/v1/attendance/manager/team/member/:userId/summary` → `data.summary`.

| Field | Type | Meaning |
|---|---|---|
| `pre_joining_days` | `number` | Days before the employee's `joining_date` |
| `pending_clock_in_days` | `number` | Today, not punched yet (`0` or `1`) |
| `upcoming_days` | `number` | Future days in the month |
| `days_in_month` | `number` | 28–31, leap-year correct |
| `eligible_days` | `number` | `days_in_month − pre_joining − pending − upcoming` |
| `expected_working_days` | `number` | `max(0, eligible_days − final_leave_days)` |
| `attendance_percentage` | `number` | `final_present_days / expected_working_days`; `100` when none expected |

### 3.2 `GET /api/v1/attendance/hr/dashboard/live` and `/manager/team/summary` (top level)

| Field | Type | Meaning |
|---|---|---|
| `eligible_headcount` | `number` | Members employed on this date = `team_size`/`total_employees` − `final_pre_joining_count` |
| `final_pending_count` | `number` | Unpunched-but-punchable **today**; already inside `final_absent_count`. Always `0` for other dates |
| `final_pre_joining_count` | `number` | Not yet employed on this date |
| `final_upcoming_count` | `number` | Future date; owes nothing |
| `counts.pre_joining` | `number` | Same as `final_pre_joining_count`, inside the existing `counts` object |

### 3.3 `graph-data` → `daily[]` entries (HR + manager)

`eligible_headcount`, `pre_joining_count`, `pending_clock_in_count`, `upcoming_count`,
`not_marked_count`, `unknown_status_count`, plus `counts.not_marked` and `counts.pre_joining`.

> `unknown_status_count` should always be `0`. A non-zero value is a backend defect to report — not
> a UI state to render.

### 3.4 Behaviour corrections (no contract change, but your numbers will move)

- **Pre-joining employees are no longer counted absent.** `/hr/dashboard/live` and
  `/manager/team/summary` previously reported a new joiner as absent for every date before their
  start, and included them in the attendance denominator. Back-dated queries will now return
  different (correct) numbers.
- **A future `?date=` no longer marks the whole roster absent.** It now returns
  `final_absent_count: 0`, `final_upcoming_count: N`, `attendance_percentage: 100`.
- **`data.date` is always `"YYYY-MM-DD"` (IST).** It previously echoed a full ISO timestamp
  (`"2026-10-04T00:00:00.000Z"`) when `?date=` was supplied. Any `date.slice(0, 10)` you added is now
  a harmless no-op.
- **Month-range averages are no longer diluted by future days.** `avg_attendance_percentage` and
  `avg_hours_per_day` on `graph-data` previously trended toward zero across a partly-elapsed month.

---

## §4 — Invariants and percentage rules

### 4.1 Per day — the sum is 0 **or** 1, not always 1

```
final_present_count + final_absent_count + final_leave_count ∈ {0, 1}
```

It is `0` on the three `status: "not_marked"` classes — `before_joining`, `pending_clock_in`,
`upcoming`. Any chart code assuming `=== 1` will divide by zero mid-month.

### 4.2 Per month — now closes exactly

```
days_in_month === present_days + half_days + absent_days
                + on_leave_days + weekly_off_days + holiday_days
                + pre_joining_days + pending_clock_in_days + upcoming_days
```

### 4.3 Per day, aggregate planes

```
eligible_headcount === final_present_count + final_absent_count + final_leave_count
                      + final_upcoming_count
team_size          === eligible_headcount + final_pre_joining_count
```

### 4.4 Percentages — use the backend's, never `days_in_month`

Use `attendance_percentage` from the response. Do **not** recompute, and never divide by
`days_in_month` or `team_size`: on 4 October a perfect-attendance employee has
`final_present_days = 3`, which against 31 reads as **9.68%**.

### 4.5 Reconciling an employee's summary against the team card

A ledger and a live roster deliberately differ about **today**: the employee plane does not count
today's unpunched day as an absence; the live team card does, because a roster must show who is
missing. Reconcile with:

```ts
const ledgerAbsent = team.final_absent_count - team.final_pending_count;
```

`final_pending_count` is `0` for every date except today, so historical dates agree with no
adjustment.

---

## §5 — UI and rendering

### 5.1 Three-bar rollup card

```tsx
const bars = [
  { name: 'Present',     count: s.final_present_days, color: '#10B981' },
  { name: 'Absent',      count: s.final_absent_days,  color: '#EF4444' },
  { name: 'Leave & Off', count: s.final_leave_days,   color: '#3B82F6' },
];
```

- Label the third bar **"Leave & Off"**, not "Leave" — it folds together approved leave, weekly-offs
  and holidays. Break out `on_leave_days` / `weekly_off_days` / `holiday_days` in a tooltip.
- Show the denominator: `"{final_present_days} of {expected_working_days} expected working days"`.
- Add a muted **"Remaining"** segment from `upcoming_days + pending_clock_in_days`, or state
  `eligible_days` — otherwise a mid-month card silently omits most of the month.
- Render `pre_joining_days` as **"Before joining"** in a muted tone, or omit it. Never as absent.
- **Do not render `late_days` as a bar** — it overlaps the present bar. Use a badge.
- Show "—" when `expected_working_days === 0` (new joiner, future month, all-leave month). The
  backend returns `100`, which is defensible but misleading as an achievement.

### 5.2 Branch on `status_reason`, not `status`

`not_marked` means three different things and must render three different ways:

| `status_reason` | Render |
|---|---|
| `before_joining` | Greyed-out non-cell, "Before joining" |
| `pending_clock_in` | Actionable — "Not clocked in yet" + clock-in affordance |
| `upcoming` | Empty future cell |
| `awaiting_absent_cron` | "Absent (unconfirmed)" — **not** a settled "Absent" |
| `holiday` / `weekly_off` | Settled non-working day |
| `record` / `in_progress` | Backed by a real punch; `in_progress` is still running |

Never render `is_provisional: true` as a settled fact.

### 5.3 Calendar grids

- The backend returns **every** calendar day in range — stop synthesizing empty cells client-side.
- `/history` is **newest-first** and clamped to today; reverse it for a left-to-right calendar.
- `pagination.total` counts **calendar days**, not records. Prefer `total_pages` over `totalPages`
  (both are returned with identical values).
- Distinguish a real zero-hours day from a synthesized one with `status_source`, **not** by testing
  `effective_hours === 0`.

### 5.4 Two shapes that are easy to get wrong

```ts
// /attendance/summary SPREADS the summary fields; the manager endpoint NESTS them.
const summary = 'summary' in data ? data.summary : data;
```

`GET /attendance/history` and `GET /manager/team/member/:userId/history` have **different item
shapes** — the employee endpoint returns numeric `0` for metric fields on synthesized days and has no
`worked_duration_formatted`; the manager endpoint returns `null` and does include it. Do not share a
renderer without a mapping layer. Full interfaces are in §3.2/§3.5 of the employee sync guide.

`GET /attendance/today` omits five fields entirely (not `null`) when there is no punch yet:
`total_hours`, `early_exit_minutes`, `overtime_minutes`, `half_day_type`, `work_mode`. Use `??`.
Neither branch returns `is_regularized` — read that from `/history` or `/daily-log`.

---

## §6 — Acceptance criteria

- [ ] No occurrence of `/attendance/user/` remains anywhere in the frontend.
- [ ] No attendance percentage is computed by dividing by `days_in_month`, `team_size` or
      `total_employees`; `attendance_percentage` from the payload is used instead.
- [ ] Chart code tolerates `final_present_count + final_absent_count + final_leave_count === 0`.
- [ ] §4.2 closes for a mid-month view, a new joiner's first month, and a future month.
- [ ] All three `not_marked` reasons render distinctly; `is_provisional: true` is visually distinct.
- [ ] `pre_joining_days` / `final_pre_joining_count` never render as absent.
- [ ] Employee summary and manager member summary render identical numbers for the same user/month.
- [ ] Employee absent count and team card absent count reconcile via §4.5 on today.
- [ ] `data.date` handled as `"YYYY-MM-DD"`; `?date=` on a future date does not show the roster as absent.
- [ ] Employee and manager `/history` use separate mappers.

---

## §7 — Verification

Every guarantee above is covered by executable tests in the backend repo:

```bash
node --test tests/unit/attendance/*.test.js     # 189/189 pass
npm test                                        # 2828/2828 pass
```

The most useful file to read as a spec is
`tests/unit/attendance/review_findings_regression.test.js` — each test is named after the guarantee
it pins (monthly invariant, pre-joining exclusion, future-date bucketing, pending reconciliation,
provenance key parity, leap-year enumeration).

The `/attendance/summary` example payload in §3.3 of the employee sync guide was **generated from the
running implementation**, not hand-written — use it as the reference fixture for mocks and tests.

**Questions on a specific number?** Trace it through the precedence ladder in
`public/md_system/employee_and_manager_attendance_calculation_source_of_truth.md` (single employee)
or `public/md_system/attendance_calculation_source_of_truth.md` (org-wide) before filing a bug.

# Frontend Synchronization Guide: Employee & Manager Attendance Calculation Parity

**Document Version**: 1.2.0
**Effective Date**: 2026-10-04
**Applies To**: Frontend Web App, Mobile App, Manager Panel, Employee Self-Service
**Modules**: `Attendance (Employee & Manager Read Planes)`

> **v1.2.0 revision note — the backend caught up to this document.** The three divergences that
> v1.1.0 had to document as "known and unresolved" are now **fixed in the backend**, and the summary
> gained the fields that make the monthly invariant checkable:
>
> - **The monthly invariant is now closeable from the response.** `pre_joining_days`,
>   `pending_clock_in_days` and `upcoming_days` are published, plus `days_in_month`,
>   `eligible_days`, `expected_working_days` and a backend-computed `attendance_percentage`. §4 is
>   rewritten; the manual residual arithmetic v1.1.0 asked you to do is no longer necessary.
> - **Pre-joining employees are no longer counted absent** by `/manager/team/summary` or
>   `/hr/dashboard/live`, and **future dates no longer report the whole roster absent**. Former
>   §7 items 2 and 3 are resolved and removed.
> - **The today-bucketing difference is now an explicit, subtractable term** (`final_pending_count`)
>   rather than a silent discrepancy. Former §7 item 1 is resolved; see §7.
>
> Everything in the v1.1.0 note below still applies — the URLs, shapes and nullability rules it
> corrected are unchanged.
>
> **v1.1.0 revision note.** v1.0.0 of this document was verified line-by-line against the
> implementation and corrected. Four classes of error were fixed, listed here because integrations
> written against v1.0.0 need rework:
>
> 1. **Every employee endpoint URL was wrong.** v1.0.0 documented `/api/v1/attendance/user/...`.
>    There is no `/user` path segment — the routers mount at `/api/v1/attendance` directly
>    (`attendance.index.js`), so those URLs return **404**. Correct paths are in §3.
> 2. **The daily conservation invariant in §3.2 was overstated.** v1.0.0 claimed
>    `final_present_count + final_absent_count + final_leave_count ≡ 1` for every day. It is `0`
>    for three day classes. See §4 — this is load-bearing for chart code.
> 3. **The `/history` item shape in §3.3 was wrong.** It showed `effective_hours: null`,
>    `total_hours: null` and a `worked_duration_formatted` field. The employee endpoint returns
>    numeric `0`, never `null`, and has **no** `worked_duration_formatted` key. v1.0.0 described
>    the *manager* endpoint's shape. The two differ; both are now specified separately.
> 4. **`summary` nesting differs between the two planes** and was not mentioned. The employee
>    endpoint spreads summary fields at the top level of `data`; the manager endpoint nests them
>    under `data.summary`. See §3.3 and §5.2.

---

## 1. Context & Purpose

Previously, an inconsistency existed between the **Employee Self-Service Dashboard** and the
**Manager Team View**:

1. `GET /api/v1/attendance/summary` counted only rows physically stored in `attendance_records`,
   so `holiday_days` and `weekly_off_days` came back `0` for unclocked weekends and public
   holidays.
2. The manager's view of the same employee
   (`GET /api/v1/attendance/manager/team/member/:userId/summary`) synthesized weekends and
   holidays and reported accurate non-zero numbers. An employee and their manager therefore saw
   contradictory summaries for the same calendar month.
3. `GET /api/v1/attendance/history` returned only days with a physical punch row, so weekly-offs
   and holidays were simply missing from calendar grids.

This release establishes **mathematical parity between the employee and manager read planes for
single-employee monthly summaries**, introduces canonical 3-bar charting metrics, and upgrades the
employee history endpoint to the dense-calendar standard.

Both planes now resolve through one function, `userAttendanceReadService.getGraphData`, so the
parity is structural rather than two implementations kept in step by hand.

**Scope note.** The structural parity guarantee covers *single-employee monthly summary*
endpoints. The live team/org dashboards (`/manager/team/summary`, `/hr/dashboard/live`) answer a
deliberately different question about **today** — who has not turned up yet — and publish
`final_pending_count` so the two can be reconciled exactly. §7 gives the one-line subtraction.
For every date other than today the planes agree without adjustment.

---

## 2. Breaking Changes Summary

> [!NOTE]
> **Zero breaking changes to the API itself.** No existing JSON key has been renamed or removed;
> every change to the endpoints is additive or a correction to a previously wrong *value*. Existing
> charts keep working.

> [!IMPORTANT]
> **Document-level breaking changes.** If you integrated against v1.0.0 of this guide, see the
> revision note at the top — the URLs and the `/history` item shape it specified were incorrect.

---

## 3. Endpoint Contracts

All responses are wrapped in the standard envelope. `data` is detailed per endpoint below.

```ts
interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}
```

### 3.0 Provenance siblings (present on every day-shaped object)

Every object that carries a `status` also carries these three fields, on all three panels. Defined
in `attendance/utilities/day_status.utils.js`; derived values come from
`clockService.resolveDerivedDayStatus`, the single source of truth for precedence.

```ts
type StatusSource = 'record' | 'derived';

type StatusReason =
  // status_source === 'record'
  | 'record'                // a persisted attendance_records row; settled
  | 'in_progress'           // persisted row, still clocked in; WILL change on clock-out
  // status_source === 'derived' (no row exists for this date)
  | 'before_joining'        // date precedes the employee's joining_date; never employed
  | 'holiday'               // an applicable, active holiday
  | 'weekly_off'            // a scheduled weekly off
  | 'awaiting_absent_cron'  // PAST working day, no punch; our absent projection
  | 'pending_clock_in'      // TODAY, no punch yet; still punchable
  | 'upcoming';             // FUTURE date; nothing owed yet

interface DayProvenance {
  status_source: StatusSource;
  status_reason: StatusReason;
  is_provisional: boolean;  // can this value still change on its own?
}
```

**`is_provisional` semantics.** `true` means the value is a projection that may change without any
user action. The auto-absent cron only ever writes `absent` rows and deliberately skips holidays
and weekly-offs, so a derived `holiday`/`weekly_off` is already permanent (`false`), while a
derived `absent`/`not_marked` may still be replaced by a punch or by the cron (`true`). A persisted
row is authoritative (`false`) except `in_progress` (`true`).

**UI rule:** never render a `is_provisional: true` day as a settled fact. Show `absent` +
`awaiting_absent_cron` as "Absent (unconfirmed)" and `pending_clock_in` as "Not clocked in yet",
not "Absent".

**`status` alone is ambiguous — always branch on `status_reason`.** `not_marked` means three
different things (`before_joining`, `pending_clock_in`, `upcoming`) which must render differently:
a greyed-out non-cell, an actionable "clock in" prompt, and an empty future cell respectively.

---

### 3.1 `GET /api/v1/attendance/today`

Message: `"Today's attendance fetched"`. No query parameters.

> [!WARNING]
> **The two branches return different key sets.** When no record exists for today, five fields are
> **absent from the payload entirely** (not `null`): `total_hours`, `early_exit_minutes`,
> `overtime_minutes`, `half_day_type`, `work_mode`. Treat them as optional and use `??`, not a
> truthiness check on a key you assume exists.
>
> Note also that `/today` returns **no `is_regularized` field in either branch**, unlike
> `/history` (§3.2). Read regularization state from `/history` or `/daily-log`.

```ts
interface AttendanceTodayBase extends DayProvenance {
  date: string;                 // 'YYYY-MM-DD', IST calendar day
  status: AttendanceStatus;
  clock_in_time: string | null;
  clock_out_time: string | null;
  effective_hours: number | null;
  break_duration_minutes: number;
  late_minutes: number;
  active_break: { id: string; start_time: string } | null;
  breaks: Array<{ id: string; start_time: string; end_time: string | null; duration_minutes: number | null }>;
  shift: { name: string; start_time: string; end_time: string; type: string } | null;
  is_holiday: boolean;
  is_weekly_off: boolean;
}

// status_source === 'record'  — a punch exists
interface AttendanceTodayWithRecord extends AttendanceTodayBase {
  total_hours: number | null;
  early_exit_minutes: number;
  overtime_minutes: number;
  half_day_type: string | null;
  work_mode: string | null;
}

// status_source === 'derived' — no punch yet; the six fields above are ABSENT
type AttendanceTodayDerived = AttendanceTodayBase;

type AttendanceTodayResponse = AttendanceTodayWithRecord | AttendanceTodayDerived;
```

**Overnight shifts.** If an overnight shift opened yesterday is still live, `date` is **yesterday's**
date, not today's — the endpoint reports the day the live record belongs to. Do not assume
`date === today`; render the returned `date`.

Example — no punch yet on a working day:

```json
{
  "success": true,
  "message": "Today's attendance fetched",
  "data": {
    "date": "2026-10-04",
    "status": "not_marked",
    "status_source": "derived",
    "status_reason": "pending_clock_in",
    "is_provisional": true,
    "clock_in_time": null,
    "clock_out_time": null,
    "effective_hours": null,
    "break_duration_minutes": 0,
    "active_break": null,
    "breaks": [],
    "shift": { "name": "General", "start_time": "09:30", "end_time": "18:30", "type": "fixed" },
    "late_minutes": 0,
    "is_holiday": false,
    "is_weekly_off": false
  }
}
```

---

### 3.2 `GET /api/v1/attendance/history` (dense calendar)

Message: `"Attendance history fetched"`.
Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20` (`limit` capped at 100, default 20;
`page` default 1). Omitting `from`/`to` defaults to the **current month**.

**What changed.** Previously a sparse array of punch rows only. Now every calendar day in the
range is returned, **newest first**, with virtual days synthesized for holidays, weekly-offs and
unclocked absences.

**`to` is clamped to today.** Future days are never returned, and `pagination.total` is the number
of calendar days from `from` through `min(to, today)` — **not** the number of records. If `from` is
in the future, `records` is `[]` and `total` is `0`.

```ts
interface AttendanceHistoryItem extends DayProvenance {
  id: string | null;            // null for a synthesized day
  date: string;                 // 'YYYY-MM-DD'
  status: AttendanceStatus;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number;          // 0 on synthesized days — NEVER null
  effective_hours: number;      // 0 on synthesized days — NEVER null
  break_duration_minutes: number;
  late_minutes: number;
  early_exit_minutes: number;
  overtime_minutes: number;
  work_mode: string | null;
  half_day_type: string | null;
  is_regularized: boolean;
  shift: { name: string; start_time: string; end_time: string } | null;  // no `type` here
}

interface AttendanceHistoryResponse {
  records: AttendanceHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;        // CALENDAR DAYS in range, not record count
    totalPages: number;   // legacy camelCase — retained
    total_pages: number;  // snake_case — identical value; prefer this one
  };
}
```

> [!NOTE]
> `pagination` intentionally carries **both** `totalPages` and `total_pages` with the same value,
> for backward compatibility. Prefer `total_pages`.

Distinguish a real zero-hours day from a synthesized one with `status_source`, **not** by testing
`effective_hours === 0` — both yield `0`.

Example — synthesized weekly-off day:

```json
{
  "id": null,
  "date": "2026-10-04",
  "status": "weekly_off",
  "status_source": "derived",
  "status_reason": "weekly_off",
  "is_provisional": false,
  "clock_in_time": null,
  "clock_out_time": null,
  "total_hours": 0,
  "effective_hours": 0,
  "break_duration_minutes": 0,
  "late_minutes": 0,
  "early_exit_minutes": 0,
  "overtime_minutes": 0,
  "work_mode": null,
  "half_day_type": null,
  "is_regularized": false,
  "shift": null
}
```

---

### 3.3 `GET /api/v1/attendance/summary`

Message: `"Monthly summary fetched"`. Query: `?month=MM&year=YYYY` (`month` 1–12, `year`
2000–2100; both optional, defaulting to the current IST month/year).

**What changed.** `holiday_days` and `weekly_off_days` previously reported `0` when no physical row
existed. The endpoint now synthesizes the whole month and delegates to
`userAttendanceReadService.getGraphData`, so it is **mathematically identical** to the manager's
member-summary endpoint.

> [!IMPORTANT]
> The summary fields are **spread at the top level of `data`** here, alongside `month`, `year` and
> `total_records`. The manager endpoint nests the same fields under `data.summary`. A shared
> TypeScript client must account for both — see §5.2.

```ts
interface AttendanceMonthlySummary {
  // Raw per-status day counts (mutually exclusive)
  present_days: number;      // includes in_progress days
  half_days: number;
  absent_days: number;
  holiday_days: number;
  weekly_off_days: number;
  on_leave_days: number;

  // The three non-bar categories (added in v1.2.0). With these, every day of the month is
  // accounted for — see §4.
  pre_joining_days: number;       // date < joining_date
  pending_clock_in_days: number;  // today, not punched yet (0 or 1)
  upcoming_days: number;          // future dates in the month

  // Denominators, computed by the backend (added in v1.2.0) — use these instead of deriving them.
  days_in_month: number;          // 28..31, leap-year correct
  eligible_days: number;          // days_in_month - pre_joining - pending - upcoming
  expected_working_days: number;  // max(0, eligible_days - final_leave_days)
  attendance_percentage: number;  // final_present_days / expected_working_days, 100 when none

  // NOT a bucket — overlaps present_days/half_days
  late_days: number;

  // Canonical 3-bar rollup (additive)
  final_present_days: number;   // present_days + half_days
  final_absent_days: number;    // absent_days
  final_leave_days: number;     // on_leave_days + weekly_off_days + holiday_days

  total_hours_worked: number;
  total_worked_duration_formatted: string;   // e.g. "8h 0m"
  average_hours_per_day: number;             // over worked days only
  total_overtime_minutes: number;
  total_break_minutes: number;
  punctuality_percentage: number;            // 100 when no worked days
}

interface AttendanceSummaryResponse extends AttendanceMonthlySummary {
  month: number;
  year: number;
  total_records: number;   // days in the month backed by a PERSISTED row
}
```

> [!WARNING]
> `late_days` is a **cross-cutting flag count**, not a fourth bucket. Never add it to the three
> `final_*` bars — a late present day is already inside `final_present_days` and adding it
> double-counts.

`total_records` counts only days whose `status_source === 'record'`. For a current, partly-elapsed
month it is much smaller than the number of days in the month. It is **not** a denominator — do not
use it for percentages.

Example — October 2026 queried on 2026-10-04 by an employee who joined 2026-10-01, was present on
the 1st, on approved leave on the 2nd, had a weekly off on the 3rd, and has not yet punched in today.
**This payload is generated from the implementation, not hand-written:**

```json
{
  "success": true,
  "message": "Monthly summary fetched",
  "data": {
    "month": 10,
    "year": 2026,
    "total_records": 2,
    "present_days": 1,
    "half_days": 0,
    "absent_days": 0,
    "late_days": 0,
    "holiday_days": 0,
    "weekly_off_days": 1,
    "on_leave_days": 1,
    "pre_joining_days": 0,
    "pending_clock_in_days": 1,
    "upcoming_days": 27,
    "days_in_month": 31,
    "eligible_days": 3,
    "expected_working_days": 1,
    "attendance_percentage": 100,
    "final_present_days": 1,
    "final_absent_days": 0,
    "final_leave_days": 2,
    "total_hours_worked": 8,
    "total_worked_duration_formatted": "8h 0m",
    "average_hours_per_day": 8,
    "total_overtime_minutes": 0,
    "total_break_minutes": 30,
    "punctuality_percentage": 100
  }
}
```

Reading it:

- `31 = 1 (P) + 0 (HD) + 0 (A) + 1 (L) + 1 (WO) + 0 (H) + 0 (pre) + 1 (pending) + 27 (up)` — the
  month closes exactly (§4.2).
- `eligible_days = 31 - 0 - 1 - 27 = 3`; `expected_working_days = 3 - 2 = 1`; so
  `attendance_percentage = 1/1 = 100`. Dividing `final_present_days` by `days_in_month` instead
  would have reported 3.23%.
- `total_records = 2` because only the 1st and 2nd have persisted rows; the weekly off was
  synthesized. It is **not** a denominator.

---

### 3.4 `GET /api/v1/attendance/graph-data`

Message: `"Graph data fetched"`. Query: `?month=MM&year=YYYY`, same bounds as §3.3.

Returns a dense entry for **every day of the calendar month**, including future days (unlike
`/history`, this endpoint does *not* clamp to today).

```ts
interface AttendanceGraphDay extends DayProvenance {
  date: string;                   // 'YYYY-MM-DD'
  day_of_week: string;            // e.g. 'Sunday'
  status: AttendanceStatus;
  final_present_count: 0 | 1;
  final_absent_count: 0 | 1;
  final_leave_count: 0 | 1;
  effective_hours: number | null; // null when no persisted row
  worked_duration_formatted: string;  // '0h 0m' when null
  late_minutes: number;
  overtime_minutes: number;
}

interface AttendanceGraphDataResponse {
  month: number;
  year: number;
  summary: AttendanceMonthlySummary;  // identical shape to §3.3, minus month/year/total_records
  daily: AttendanceGraphDay[];
}
```

---

### 3.5 Manager endpoints

| Endpoint | `data` shape |
|---|---|
| `GET /api/v1/attendance/manager/team/member/:userId/summary` | `{ user_id, month, year, summary: AttendanceMonthlySummary }` |
| `GET /api/v1/attendance/manager/team/member/:userId/history` | `{ member, pagination, records: ManagerHistoryItem[] }` |
| `GET /api/v1/attendance/manager/team/member/:userId/daily-log` | single-day detail, includes `status_context` |
| `GET /api/v1/attendance/manager/team/summary?date=YYYY-MM-DD` | `{ date, team_size, counts, attendance_percentage, final_present_count, final_absent_count, final_leave_count, eligible_headcount, final_pending_count, final_pre_joining_count, final_upcoming_count, members[] }` |
| `GET /api/v1/attendance/manager/team/graph-data?month=MM&year=YYYY` | `{ month, year, team_summary, daily[] }` |

Query params take `month` 1–12, `year` 2000–2100, `page` ≥ 1, `limit` 1–100 (default 20).

**Authorization.** All four member-scoped endpoints resolve the requester's accessible user set
first. A manager restricted to direct reports gets **`403 EMPLOYEE_NOT_IN_TEAM`** for anyone else;
global approvers (HR / admin / super-admin) retain org-wide visibility. An id from another tenant
yields **`404 EMPLOYEE_NOT_FOUND`**. Handle both distinctly — 403 means "not your report", 404
means "no such employee here".

> [!WARNING]
> **`ManagerHistoryItem` is NOT the same shape as `AttendanceHistoryItem` (§3.2).** On a
> synthesized day the manager endpoint returns `effective_hours: null`, `late_minutes: null`,
> `overtime_minutes: null` and adds `worked_duration_formatted`; it has **no** `total_hours`,
> `break_duration_minutes`, `early_exit_minutes` or `half_day_type`. The employee endpoint returns
> numeric `0` for those and omits `worked_duration_formatted`. Do not share one renderer across
> both without a mapping layer.

```ts
interface ManagerHistoryItem extends DayProvenance {
  id: string | null;
  date: string;
  status: AttendanceStatus;
  clock_in_time: string | null;
  clock_out_time: string | null;
  effective_hours: number | null;      // null on synthesized days
  worked_duration_formatted: string;
  late_minutes: number | null;         // null on synthesized days
  overtime_minutes: number | null;     // null on synthesized days
  work_mode: string | null;
  is_regularized: boolean;
  shift: { name: string } | null;      // name only
}
```

**Aggregate reconciliation fields** on `/manager/team/summary` (added v1.2.0, mirrored on
`/hr/dashboard/live`):

```ts
interface TeamSummaryTotals {
  team_size: number;                 // full roster
  eligible_headcount: number;        // employed on this date = team_size - final_pre_joining_count
  final_present_count: number;
  final_absent_count: number;        // includes final_pending_count on today
  final_leave_count: number;
  final_pending_count: number;       // unpunched-but-punchable today; 0 on any other date
  final_pre_joining_count: number;   // not yet employed on this date
  final_upcoming_count: number;      // future date; owes nothing
  attendance_percentage: number;
}
// eligible_headcount === present + absent + leave + upcoming
// team_size          === eligible_headcount + pre_joining
```

> [!NOTE]
> **Resolved in v1.2.0:** `data.date` is now **always** a plain `"2026-10-04"` (IST) on both
> `/manager/team/summary` and `/hr/dashboard/live`, whether or not `?date=` was supplied. It
> previously echoed a full ISO timestamp when supplied, because the parameter is Joi-validated as an
> ISO date. A defensive `date.slice(0, 10)` is now a harmless no-op.

---

## 4. Conservation invariants — exact statements

### 4.1 Per day (`/graph-data` `daily[]`)

The three `final_*_count` fields are mutually exclusive, so their sum is never greater than 1. It is
**not always equal to 1**.

$$\text{final\_present\_count} + \text{final\_absent\_count} + \text{final\_leave\_count} \in \{0, 1\}$$

The sum is **0** on exactly these three day classes, all of which carry `status: "not_marked"`:

| `status_reason` | When | Why unbucketed |
|---|---|---|
| `before_joining` | date < `joining_date` | Not employed; must not count as absent |
| `pending_clock_in` | today, no punch yet | Still punchable; not yet absent |
| `upcoming` | future dates | Nothing owed yet |

### 4.2 Per month (`/summary` and `/graph-data` `summary`)

As of v1.2.0 the month closes exactly, and every term is a published field:

$$\text{days\_in\_month} \equiv P + HD + A + L + WO + H + \text{pre} + \text{pending} + \text{up}$$

```ts
// This assertion holds for every employee and every month. It is covered by a regression test.
const closes =
  s.days_in_month === s.present_days + s.half_days + s.absent_days +
                     s.on_leave_days + s.weekly_off_days + s.holiday_days +
                     s.pre_joining_days + s.pending_clock_in_days + s.upcoming_days;
```

> [!NOTE]
> `pending_clock_in_days` refines the source-of-truth document's `D_upcoming` term: both mean "no
> obligation has crystallised yet". It is reported separately because today is actionable in the UI
> (the employee can still clock in) whereas a future day is not.

### 4.3 Percentages — use the backend's

v1.1.0 asked you to derive the denominator yourself. **Do not.** The backend now publishes
`eligible_days`, `expected_working_days` and `attendance_percentage`, computed per the source of
truth (§4.3 of `employee_and_manager_attendance_calculation_source_of_truth.md`):

```ts
const rate = s.attendance_percentage;   // already excludes pre-joining, today and future days
```

> [!CAUTION]
> Never divide by `days_in_month`. On 4 October a perfect-attendance employee has
> `final_present_days = 3`; against 31 that reads as 9.68% attendance. `attendance_percentage`
> correctly reports 100 because `expected_working_days` counts only elapsed, eligible, working days.

## 5. UI integration

### 5.1 The 3-bar rollup card

```tsx
const bars = [
  { name: 'Present',    count: s.final_present_days, color: '#10B981' }, // green
  { name: 'Absent',     count: s.final_absent_days,  color: '#EF4444' }, // red
  { name: 'Leave & Off', count: s.final_leave_days,  color: '#3B82F6' }, // blue
];
```

Guidance:

- **Label the third bar "Leave & Off", not "Leave".** `final_leave_days` folds together approved
  leave, weekly-offs and public holidays. Users read a large "Leave" number as unauthorised
  absence. Break the three out from `on_leave_days` / `weekly_off_days` / `holiday_days` in a
  tooltip.
- **Show the month-to-date denominator explicitly** — `"{final_present_days} of
  {expected_working_days} expected working days"` — so a mid-month card cannot be misread as a
  full-month result. Both numbers come straight from the payload.
- **Use `attendance_percentage` from the response.** Do not recompute it, and never divide by
  `days_in_month` (§4.3).
- **Do not render `late_days` as a bar.** It overlaps the present bar (see §3.3). Use a badge.
- **Suppress the percentage when `expected_working_days === 0`** (a brand-new joiner, a future
  month, or a month entirely of leave/holidays). The backend returns `100` in that case, which is
  mathematically defensible but misleading to show as an achievement — render "—" instead.
- **Surface the non-bar categories rather than hiding them.** A card showing only three bars for a
  mid-month view silently omits `upcoming_days`. Either add a muted "Remaining" segment from
  `upcoming_days` + `pending_clock_in_days`, or state the `eligible_days` denominator.
- **`pre_joining_days` is not an attendance outcome.** Render it as "Before joining" in a muted
  tone, or omit it. Never colour it as absent.

### 5.2 Sharing one client across both planes

```ts
// /attendance/summary spreads the fields; the manager endpoint nests them.
const summary: AttendanceMonthlySummary =
  'summary' in data ? data.summary : data;
```

### 5.3 Dense calendar grids

- Backend guarantees complete coverage of every date in the range (clamped to today for
  `/history`), so stop synthesizing empty cells client-side.
- Branch cell rendering on `status_reason`, not `status` (see §3.0).
- `/history` is **newest-first**; reverse it for a left-to-right calendar.
- Render `is_provisional: true` days with a distinct "unconfirmed" affordance.

---

## 6. Status vocabulary

```ts
type AttendanceStatus =
  | 'present' | 'half_day' | 'in_progress'   // -> final_present_count
  | 'absent'                                 // -> final_absent_count
  | 'on_leave' | 'weekly_off' | 'holiday'    // -> final_leave_count
  | 'not_marked';                            // -> unbucketed (see §4)
```

`in_progress` means the employee is currently clocked in; it counts toward **present**, and its
`effective_hours` is a running total that will change on clock-out.

---

## 7. Cross-panel reconciliation

All three divergences listed here in v1.1.0 are **resolved**. What remains is one deliberate
difference in meaning, which is now an explicit subtractable term rather than a silent mismatch.

### 7.1 Resolved

| Was | Now |
|---|---|
| `/manager/team/summary` and `/hr/dashboard/live` counted **pre-joining** employees as absent on historical dates, and disagreed with the `graph-data` endpoints | Both report them in `counts.pre_joining` / `final_pre_joining_count` and exclude them from the absent bar and the denominator. All four endpoints now agree. |
| Those endpoints reported the **entire roster absent** for a future date | `final_absent_count: 0`, `final_upcoming_count: N`, `attendance_percentage: 100` |
| The monthly residual was unexplained and unverifiable | `pre_joining_days` / `pending_clock_in_days` / `upcoming_days` published; §4.2 closes exactly |

### 7.2 The one remaining difference, and how to reconcile it

A **ledger** (what is settled) and a **live roster** (who has not turned up yet) legitimately answer
different questions about *today*:

- The employee plane (`/attendance/summary`, `/attendance/graph-data`) does **not** count today's
  unpunched day as an absence — it reports it as `pending_clock_in_days`.
- The live planes (`/manager/team/summary`, `/hr/dashboard/live`) **do** include it in
  `final_absent_count`, because a roster whose job is to show who is missing must show it.

This is intentional. To reconcile exactly:

```ts
// Sum of members' ledger absences === team card's absences, net of today's still-punchable members.
const ledgerAbsent = team.final_absent_count - team.final_pending_count;
```

`final_pending_count` is always `0` for any date other than today, so for historical dates the two
planes agree without adjustment.

**UI guidance:** label the live planes' absent bar "Absent / Not in yet" on today, and
"Absent" on a past date. Do not place an employee-plane absent count beside a team-plane absent
count without applying the subtraction above.

## 8. Reference

- Calculation precedence and invariants:
  `public/md_system/employee_and_manager_attendance_calculation_source_of_truth.md`
- HR / org-wide plane: `public/md_updates/2026-10-04_hr_attendance_calculation_and_graph_data_sync.md`
- Provenance contract: `public/md_updates/2026-10-04_attendance_day_status_provenance_contract.md`
- Canonical endpoint registry: `public/md_system/api_registry.md`

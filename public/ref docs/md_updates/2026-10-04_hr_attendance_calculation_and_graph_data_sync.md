# Frontend Integration Notice: HR Attendance Calculation & Graph Data Sync

**Date:** 2026-10-04  
**Document Version:** 1.1.0  
**Module:** Attendance Dashboard (`/api/v1/attendance/hr/dashboard/*` & `/api/v1/attendance/manager/team/*`)  
**Target Audience:** Frontend Web & Mobile Developers  
**Change Type:** Mathematical Correction & Data Parity Fix (Zero Breaking Schema Changes)  

> **v1.1.0 revision note — two corrections and one retraction.**
>
> 1. **Retraction.** v1.0.0 stated that `/hr/dashboard/live` and `/manager/team/summary` "were already
>    calculating correctly". They were not. Both folded *every* `not_marked` member into the absent
>    bar, which meant (a) an employee who had **not yet joined** was reported absent for every date
>    before their joining date and inflated the attendance denominator, and (b) a **future** date
>    reported the entire roster as absent. Both are fixed; see §5.
> 2. **The conservation invariant in §1.4 was overstated.** It is not an unconditional identity. The
>    exact statement, and the additive counters that now make it checkable, are in §5.2.
> 3. **New additive fields** on `/hr/dashboard/live`, `/manager/team/summary` and every `daily[]`
>    entry. Nothing was renamed or removed. See §5.
>
> Also fixed, with no contract change: `avg_attendance_percentage` / `avg_hours_per_day` were
> diluted toward zero by any range extending past today; a supplied `?date=` echoed back as a full
> ISO timestamp instead of `YYYY-MM-DD`; and a range clamp compared "today" in the host timezone
> while assigning it in IST, dropping the final day of the range between 18:30 and 24:00 UTC.

---

## 1. Summary of Changes

The backend attendance calculation logic for the time-series graph endpoints (`GET /api/v1/attendance/hr/dashboard/graph-data` and `GET /api/v1/attendance/manager/team/graph-data`) has been overhauled to fix an issue where **headcount exceeded the total organization/team size on non-working days or duty days**, and **absent counts disappeared for past days**.

### The Problem That Was Fixed
In a 10-person organization:
* **October 3rd (Saturday):** 9 employees worked on duty/shift. The previous backend code counted 9 employees as `present` AND simultaneously counted all 10 employees as `weekly_off`, returning `final_present_count: 9` and `final_leave_count: 10` (Total = **19**!).
* **October 4th (Sunday):** 1 employee worked (`in_progress: 1`). The backend returned `final_present_count: 1` and `final_leave_count: 10` (Total = **11**!).
* **October 1st (Thursday):** 1 employee was present, 9 were absent. The graph returned `absent_count: 0` and `final_absent_count: 0` because past unclocked absences were dropped before cron execution.

### The Resolution
1. **Physical Record Dominance:** If an employee clocks in and works on a scheduled weekly off or holiday, they are counted under `final_present_count`. They are **no longer** counted under `weekly_off_count` or `final_leave_count`.
2. **Policy-Aware Classification:** Weekly off calculations now evaluate your organization's actual weekly-off rules (e.g., Sales having Wednesday off vs Tech having Saturday off) rather than a hardcoded Saturday/Sunday assumption.
3. **Past Absence Retention:** Unclocked past working days correctly populate `absent_count` and `final_absent_count` on the graph, matching `/dashboard/live`.
4. **Conservation of Headcount:** every day now closes its books exactly. The precise statement —
   including the terms that v1.0.0 omitted — is in §5.2. In short, the three bars account for every
   **eligible** employee, and employees who were not yet employed on that date are reported
   separately rather than being silently counted as absent.

---

## 2. Affected Endpoints

| Endpoint | Method | Change Details |
|---|---|---|
| `/api/v1/attendance/hr/dashboard/graph-data` | `GET` | Fixed calculations in `data.daily[]` and `data.overall_summary`. |
| `/api/v1/attendance/manager/team/graph-data` | `GET` | Fixed calculations in `data.daily[]` and `data.team_summary`. |
| `/api/v1/attendance/hr/dashboard/department-summary` | `GET` | Fixed working-day calculation to respect department weekly off rules. |

| `/api/v1/attendance/hr/dashboard/live` | `GET` | **Corrected** (v1.1.0): pre-joining and future-dated members no longer counted absent. New additive fields. See §5. |
| `/api/v1/attendance/manager/team/summary` | `GET` | **Corrected** (v1.1.0): same fix, plus `counts.pre_joining`. See §5. |

> [!WARNING]
> v1.0.0 of this notice claimed the two endpoints in the last two rows were already correct. That
> was wrong — see the revision note at the top of this document. If you built a reconciliation or a
> "team absent today" widget on their previous output, re-read §5 before trusting those numbers for
> any date other than today.

---

## 3. Response Structure & Field Reference

**No fields have been removed or renamed.** All existing keys remain present.

### Sample Response: `GET /api/v1/attendance/hr/dashboard/graph-data?month=10&year=2026`

```json
{
  "success": true,
  "message": "Dashboard graph data fetched successfully",
  "data": {
    "overall_summary": {
      "avg_attendance_percentage": 96.67,
      "avg_hours_per_day": 8.24,
      "total_late_incidents": 2,
      "total_overtime_hours": 0
    },
    "daily": [
      {
        "date": "2026-10-01",
        "is_working_day": true,
        "present_count": 1,
        "half_day_count": 0,
        "late_count": 0,
        "in_progress_count": 0,
        "absent_count": 9,
        "on_leave_count": 0,
        "weekly_off_count": 0,
        "holiday_count": 0,
        "avg_effective_hours": 8.0,
        "total_overtime_minutes": 0,
        "attendance_percentage": 10.0,
        "final_present_count": 1,
        "final_absent_count": 9,
        "final_leave_count": 0
      },
      {
        "date": "2026-10-02",
        "is_working_day": false,
        "present_count": 0,
        "half_day_count": 0,
        "late_count": 0,
        "in_progress_count": 0,
        "absent_count": 0,
        "on_leave_count": 0,
        "weekly_off_count": 0,
        "holiday_count": 1,
        "avg_effective_hours": 0,
        "total_overtime_minutes": 0,
        "attendance_percentage": 100.0,
        "final_present_count": 0,
        "final_absent_count": 0,
        "final_leave_count": 1
      },
      {
        "date": "2026-10-03",
        "is_working_day": true,
        "present_count": 8,
        "half_day_count": 1,
        "late_count": 2,
        "in_progress_count": 0,
        "absent_count": 0,
        "on_leave_count": 0,
        "weekly_off_count": 1,
        "holiday_count": 0,
        "avg_effective_hours": 8.34,
        "total_overtime_minutes": 0,
        "attendance_percentage": 100.0,
        "final_present_count": 9,
        "final_absent_count": 0,
        "final_leave_count": 1
      },
      {
        "date": "2026-10-04",
        "is_working_day": false,
        "present_count": 0,
        "half_day_count": 0,
        "late_count": 0,
        "in_progress_count": 1,
        "absent_count": 0,
        "on_leave_count": 0,
        "weekly_off_count": 9,
        "holiday_count": 0,
        "avg_effective_hours": 0,
        "total_overtime_minutes": 0,
        "attendance_percentage": 100.0,
        "final_present_count": 1,
        "final_absent_count": 0,
        "final_leave_count": 9
      }
    ]
  }
}
```

---

## 4. Frontend Rendering Guide

### How to Render the 3 Chart Bars
The frontend dashboard chart should use the three primary aggregate fields:

| Bar / Series | Primary Field | Composition Breakdown |
|---|---|---|
| **Present** (Green) | `final_present_count` | `present_count + half_day_count + in_progress_count` |
| **Absent** (Red) | `final_absent_count` | `absent_count` (includes unclocked past absences) |
| **Leave / Off** (Orange/Blue) | `final_leave_count` | `on_leave_count + weekly_off_count + holiday_count` |

### Chart Tooltip Recommendations
When a user hovers over a date on the chart, display the breakdown tooltip using the granular fields:
* **Present:** `present_count` Full Day + `half_day_count` Half Day + `in_progress_count` Clocked In
* **Absences:** `absent_count`
* **Leave / Non-Working:** `on_leave_count` Approved Leaves, `weekly_off_count` Weekly Offs, `holiday_count` Holidays
* **Metrics:** Attendance % (`attendance_percentage`), Late Incidents (`late_count`), Average Effective Hours (`avg_effective_hours`).

### Re-Sync Checklist for Frontend:
1. Verify that your chart component maps directly to `final_present_count`, `final_absent_count`, and `final_leave_count`.
2. Remove any frontend hack or workaround that manually subtracted `present_count` from `total_employees` on weekends.
3. Validate that tooltips properly display `weekly_off_count` and `holiday_count` from each daily object.

---

## 5. v1.1.0 Additions & Corrections (HR + Manager aggregate planes)

### 5.1 What was wrong

Both live aggregate endpoints classified a day per member via the shared resolver, which correctly
reports **three different reasons** for a `not_marked` day — `before_joining`, `pending_clock_in`
(today, not punched yet) and `upcoming` (a future date) — and then threw that distinction away:

```js
// before
const finalAbsentCount = counts.absent + counts.not_marked   // all three reasons -> "absent"
```

Observable consequences, both reachable from the UI:

| Request | Previous (wrong) | Now |
|---|---|---|
| `live?date=2026-10-01`, employee joins `2026-10-20` | that employee counted **absent**, and included in the attendance denominator | counted in `counts.pre_joining`, excluded from both |
| `live?date=` any future date | **whole roster absent**, `attendance_percentage: 0` | `final_absent_count: 0`, `final_upcoming_count: N`, `attendance_percentage: 100` |

Because `/dashboard/graph-data` (batch evaluator) always excluded pre-joining members correctly,
the two HR endpoints **disagreed with each other for the same date**. They now agree.

### 5.2 The exact conservation invariant

```
total_employees    === eligible_headcount + final_pre_joining_count
eligible_headcount === final_present_count + final_absent_count + final_leave_count
                       + final_upcoming_count
```

and, for a ledger-style view that must not count members who can still punch in today:

```
ledger_absent_count === final_absent_count - final_pending_count
```

On `daily[]` entries of `graph-data` the same identity reads:

```
eligible_headcount === final_present_count + final_absent_count + final_leave_count
                       + upcoming_count + unknown_status_count
roster size        === eligible_headcount + pre_joining_count
```

### 5.3 New additive fields

**On `/hr/dashboard/live` and `/manager/team/summary` (top level):**

| Field | Type | Meaning |
|---|---|---|
| `eligible_headcount` | `number` | Members actually employed on this date. The only valid percentage denominator base. |
| `final_pending_count` | `number` | Members who have not punched in **yet today** and are still inside `final_absent_count`. Subtract to get a ledger absent count. Always `0` for any date other than today. |
| `final_pre_joining_count` | `number` | Members not yet employed on this date. Mirrors `counts.pre_joining`. |
| `final_upcoming_count` | `number` | Members on a future date, who owe nothing. `0` for today and past dates. |
| `counts.pre_joining` | `number` | Same value, inside the existing `counts` object. |

**On every `daily[]` entry of `graph-data`:**

| Field | Type | Meaning |
|---|---|---|
| `eligible_headcount` | `number` | Roster size minus `pre_joining_count`. |
| `pre_joining_count` | `number` | Members not yet employed on this date. |
| `pending_clock_in_count` | `number` | Unclocked-but-punchable members (today only); already inside `final_absent_count`. |
| `upcoming_count` | `number` | Members on a future date. |
| `not_marked_count` | `number` | `pending_clock_in_count + upcoming_count`. |
| `unknown_status_count` | `number` | Persisted statuses outside the known eight. **Should always be `0`** — a non-zero value is a backend defect worth reporting, not a UI state to render. |
| `counts.not_marked`, `counts.pre_joining` | `number` | The same values inside the existing `counts` object. |

### 5.4 `date` echo is now normalized

`?date=` is validated as an ISO date, so it previously echoed back as `"2026-10-04T00:00:00.000Z"`
when supplied and `"2026-10-04"` when omitted. `data.date` is now **always** `YYYY-MM-DD` (IST) on
both endpoints. If you were defensively running `date.slice(0, 10)`, that is now a no-op and safe to
keep or drop.

### 5.5 Frontend guidance

- **Percentages:** divide by `eligible_headcount`-derived expectations, never by `total_employees` /
  `team_size`. The backend's own `attendance_percentage` already does this correctly — prefer it.
- **Date pickers:** a future date is now answered honestly (`final_absent_count: 0`,
  `attendance_percentage: 100`). Neither endpoint rejects a future date, so if "100% attendance
  tomorrow" would confuse users, keep the picker bounded to today in the UI.
- **Historical views:** `live` and `team/summary` are now safe for back-dated queries. Previously
  only the `graph-data` endpoints were.
- **New-joiner rendering:** show `final_pre_joining_count` members as a muted "Not yet joined"
  segment, or omit them. Do not colour them as absent.
- **Reconciling an employee's own summary against the team card:** use
  `final_absent_count - final_pending_count`. The employee self-service plane never counts today as
  an absence; the live team card deliberately does. That is now an explicit, subtractable term
  rather than a silent discrepancy.

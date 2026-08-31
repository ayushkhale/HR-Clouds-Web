# Phase 7: Role-Scoped Attendance Read & Analytics APIs
**Complete API Documentation with UI/UX Integration Guide**

This document is the definitive technical reference for Phase 7 Attendance APIs. Every endpoint includes the full request/response specification, deep explanation of what the API does, why it exists, and — most importantly — **exactly how the frontend should render, style, and interact with the data** to create a world-class attendance experience.

---

## 🧭 Global UI/UX Philosophy for Phase 7

1. **Data Sovereignty:** Every byte of data returned is scoped. An employee cannot see another employee's records. A manager cannot see HR's records. A user from Org A cannot see Org B's data. The UI should reflect confidence in this by never showing "redacted" placeholders — if the data doesn't exist in the response, the user simply doesn't have access.
2. **Graph-First Design:** Phase 7 APIs are designed to feed charts and dashboards, not just data tables. The `graph-data` endpoints return arrays indexed by date with pre-computed metrics — plug directly into Chart.js, Recharts, or ApexCharts.
3. **Progressive Disclosure:** The UI should follow a drill-down pattern: Dashboard (overview) → List (filterable) → Detail (individual). Each step has its own API.
4. **Color Consistency Across All Views:** Use the same color for the same status everywhere in the app so users build visual muscle memory:
---

## 👤 Section A: Employee APIs (Self-Only Data)

**Base Path:** `/api/v1/attendance`
**Authorization:** Requires `Authorization: Bearer <token>` in the header for all endpoints.

> [!NOTE] 
> **Standardized User Profile Data:** All APIs returning user/member details now utilize a unified `formatUserProfile` logic. Regardless of whether the user is an Employee, Manager, or HR, the response will successfully return their `name`, `employee_code`, `department`, `designation`, and `avatar_url`. This guarantees consistent rendering across all HR and Manager dashboards without null values for higher-level roles.

**Data Scope:** Only the authenticated user's own data (`req.user.id`). The employee never passes their own `userId` — it's always extracted from the JWT token on the server side, making it impossible for one employee to access another's data.

---

### API 7.1: Get Daily Log (Detailed Single-Day View)

**Endpoint:** `GET /api/v1/attendance/daily-log`

**What This API Does:**
This API retrieves the complete, granular attendance record for the logged-in employee on a specific date. Unlike the existing `/today` endpoint which only works for the current day, this API lets the employee look back at **any historical date**. It returns not just the top-level record (clock-in time, status, hours worked), but also every individual **session** (useful for multi-session shifts where an employee clocked out for lunch and clocked back in), every **break** taken during the day, any **anomalies** flagged by the system (like out-of-bounds geofence, excessive break, missing GPS coordinates), and the assigned **shift** details. Think of it as opening a specific day on a timeline and seeing everything that happened.

**Why This API Exists:**
The existing `/today` endpoint only shows the current day. When an employee's monthly summary shows "3 late days" and they want to know *which* days were late and *why*, they currently have no way to drill into a specific past date. This API solves that. It also lets employees verify break recordings, check system-flagged anomalies, and see which shift rules were applied. Without this, employees must contact HR for past-day details — creating unnecessary support burden.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | The target date to view |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Daily attendance log fetched",
  "data": {
    "date": "2026-08-07",
    "status": "present",
    "clock_in_time": "2026-08-07T09:02:00Z",
    "clock_out_time": "2026-08-07T18:15:00Z",
    "total_hours": 9.22,
    "effective_hours": 8.72,
    "break_duration_minutes": 30,
    "late_minutes": 2,
    "early_exit_minutes": 0,
    "overtime_minutes": 42,
    "work_mode": "office",
    "half_day_type": null,
    "is_regularized": false,
    "is_holiday": false,
    "is_weekly_off": false,
    "shift": {
      "name": "General Shift",
      "start_time": "09:00",
      "end_time": "18:00",
      "type": "fixed"
    },
    "sessions": [
      {
        "id": "session-uuid",
        "opened_at": "2026-08-07T09:02:00Z",
        "closed_at": "2026-08-07T18:15:00Z",
        "status": "closed"
      }
    ],
    "breaks": [
      {
        "id": "break-uuid",
        "start_time": "2026-08-07T13:00:00Z",
        "end_time": "2026-08-07T13:30:00Z",
        "duration_minutes": 30
      }
    ],
    "anomalies": []
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Top Section — Status Header:** Display a large color-coded status badge at the top using the global color palette. Include the date as "Thursday, August 7, 2026" in large readable text. Below the badge, show clock-in and clock-out times in `hh:mm a` format (e.g., "09:02 AM → 6:15 PM") with a horizontal timeline bar between them. If the shift has a defined start/end, overlay the shift window as a lighter background band so the employee can visually see if they were early/late relative to the expected shift.

* **Stats Grid (2×3):** Render 6 stat cards in a grid:
  - **Effective Hours** (large font) with a progress ring showing % of expected shift hours
  - **Late Minutes** — "0 min ✅" (green) or "12 min ⚠️" (amber) with clock icon
  - **Break Time** — total minutes with coffee cup icon ☕
  - **Overtime** — only render if > 0; bolt icon ⚡
  - **Early Exit** — only render if > 0; door icon 🚪
  - **Work Mode** — "Office" 🏢 or "Remote" 🏠

* **Sessions Timeline:** Render as vertical connected blocks. Each session shows `opened_at → closed_at` with duration. Multiple sessions show as separate segments connected by dashed lines (gap = clock-out to next clock-in). If `status === 'open'`, animate a subtle pulse on the current session.

* **Breaks as Nested Pills:** Within the sessions timeline, show breaks as amber pill-shaped entries. Each shows `start → end` and `duration_minutes`. If a break triggered an anomaly, show a warning icon next to it.

* **Anomalies Section:** Only render if the array is non-empty. Use a light red card with alert icon. Show each anomaly's `type` (humanized), `description`, `severity` (color-coded), and resolution status.

* **Shift Footer:** A collapsible section showing applied shift: name, start/end, type. Useful for rotation-shift employees.

---

### API 7.2: Get Graph Data (Monthly Chart Data)

**Endpoint:** `GET /api/v1/attendance/graph-data`

**What This API Does:**
Returns a structured, day-by-day array of attendance data points for an entire month. For **every single day** in the month (including weekends, holidays, and days with no records), it returns a data point with `date`, `day_of_week`, `status`, `effective_hours`, `late_minutes`, and `overtime_minutes`. The response also includes a `summary` object with aggregate counts and `punctuality_percentage`. This is fundamentally different from `/summary` which only gives totals — this API gives the **raw daily data points** that let frontends render actual charts.

**Why This API Exists:**
Modern dashboards must show visual charts — "How many hours each day?", "Which days was I late?", "Is overtime increasing?". The existing `/summary` says "3 late days" but not *which* days. The existing `/history` is a raw list that excludes non-working days. This API provides day-by-day granularity with zero-value entries for holidays/weekly-offs so chart X-axes have no gaps.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `1-12` | No | Current month | Target month |
| `year` | `YYYY` | No | Current year | Target year |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Graph data fetched",
  "data": {
    "month": 8,
    "year": 2026,
    "summary": {
      "present_days": 18,
      "half_days": 1,
      "absent_days": 2,
      "late_days": 3,
      "holiday_days": 1,
      "weekly_off_days": 8,
      "on_leave_days": 1,
      "total_hours_worked": 152.5,
      "average_hours_per_day": 8.03,
      "total_overtime_minutes": 120,
      "total_break_minutes": 540,
      "punctuality_percentage": 85.71
    },
    "daily": [
      {
        "date": "2026-08-01",
        "day_of_week": "Saturday",
        "status": "weekly_off",
        "effective_hours": null,
        "late_minutes": 0,
        "overtime_minutes": 0
      },
      {
        "date": "2026-08-03",
        "day_of_week": "Monday",
        "status": "present",
        "effective_hours": 8.5,
        "late_minutes": 0,
        "overtime_minutes": 30
      },
      {
        "date": "2026-08-04",
        "day_of_week": "Tuesday",
        "status": "late",
        "effective_hours": 7.8,
        "late_minutes": 15,
        "overtime_minutes": 0
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Bar Chart — Daily Hours (Hero):** X-axis = dates (day numbers 1–31). Y-axis = hours (0–12). Color each bar by status using the global color palette. Draw a dashed reference line at 8.0h (full_day_min_hours). Add hover tooltips showing exact `effective_hours` and `status`.

* **Summary KPI Cards (Row Above Chart):** 4–5 compact cards from `summary`:
  - **Present Days**: "20" green card, subtitle "out of 22 working days"
  - **Late Days**: "3" amber card, "85.7% punctuality"
  - **Avg Hours**: "8.2h" neutral card
  - **Overtime**: "2h 30m" purple card (only if > 0)
  - **Punctuality Score**: Circular progress ring (donut) at `punctuality_percentage`

* **Mini Calendar Heatmap (Alternative View):** Month grid (7 cols × 4-5 rows). Color each cell by status. Tap cell → navigate to daily-log (API 7.1).

* **Late Minutes Sparkline:** Small line chart below the main chart showing `late_minutes` trend across the month.

* **Month Navigation:** Left/right arrows or dropdown picker. Each change re-fetches with new month/year.

---

### API 7.3: Get Attendance Trends (Multi-Month Engagement Metrics)

**Endpoint:** `GET /api/v1/attendance/trends`

**What This API Does:**
Computes engagement and punctuality metrics across multiple months (1–12 months back). Returns: **current streak** (consecutive days with a specific status, e.g., "12 days present"), **overall punctuality percentage**, **average hours per working day**, and a **month-by-month comparison array** with aggregated stats per month. This is fully computed analytics — not raw records.

**Why This API Exists:**
Employee engagement improves when employees can track performance over time. Gamification elements like streaks ("🔥 12 days on time!") and month-over-month comparisons ("Attendance ↑5% from last month") encourage positive behavior. The existing `/summary` covers one month with no cross-month metrics. This API enables self-service performance tracking that reduces HR intervention for minor attendance issues.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `months` | `1-12` | No | `3` | How many past months to analyze |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Attendance trends fetched",
  "data": {
    "current_streak": {
      "type": "present",
      "days": 12,
      "since": "2026-07-22"
    },
    "punctuality_percentage": 91.3,
    "average_hours_per_day": 8.2,
    "months": [
      {
        "month": 8,
        "year": 2026,
        "present_days": 15,
        "absent_days": 1,
        "late_days": 2,
        "total_hours": 127.5,
        "avg_hours": 8.1,
        "punctuality_percentage": 88.2
      },
      {
        "month": 7,
        "year": 2026,
        "present_days": 22,
        "absent_days": 0,
        "late_days": 1,
        "total_hours": 184.0,
        "avg_hours": 8.36,
        "punctuality_percentage": 95.5
      },
      {
        "month": 6,
        "year": 2026,
        "present_days": 20,
        "absent_days": 2,
        "late_days": 3,
        "total_hours": 165.0,
        "avg_hours": 7.85,
        "punctuality_percentage": 86.9
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Streak Card (Hero — Top of Dashboard):** If `current_streak.days > 3`, show fire/flame animation: "🔥 12-Day Streak!" with warm gradient background. If broken, show: "Start a new streak today!" in neutral tones.

* **Punctuality Gauge:** Semi-circular speedometer. 0-60% Red, 60-80% Amber, 80-100% Green. Current value as needle. Below: "On time 91.3% of working days."

* **Avg Hours Card:** "8.2h / day" with ▲/▼ arrow vs last month. Green for improvement, red for decline.

* **Month Comparison Chart:** Grouped bar chart — each group is a month with bars for present/absent/late. Or a line chart of `punctuality_percentage` across months — rising line is gratifying.

* **Month Summary Cards (Carousel):** Horizontal scrollable cards for each month with key stats. Tap to navigate to graph-data (API 7.2) for that month.

---

### API 7.4: Get Weekly Calendar *(NEW)*

**Endpoint:** `GET /api/v1/attendance/weekly-calendar`

**What This API Does:**
Returns attendance data for a 7-day window (ISO week containing the target date). Provides the same data points as graph-data but scoped to exactly 7 days. Includes a `week_summary` with totals: total hours, days present, days late.

**Why This API Exists:**
Mobile-first attendance apps (Keka, Zoho People, GreytHR) predominantly show a **swipeable week calendar** as the default view. Employees most frequently review "this week" or "last week", not the entire month. Fetching month-level data and extracting 7 days wastes bandwidth. A dedicated week API is faster (7 records vs 30), cheaper, and maps directly to the most common mobile UI pattern.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | Returns the ISO week containing this date |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly calendar fetched",
  "data": {
    "week_start": "2026-08-03",
    "week_end": "2026-08-09",
    "week_summary": {
      "total_hours": 38.5,
      "days_present": 4,
      "days_late": 1,
      "days_absent": 0,
      "days_off": 2
    },
    "daily": [
      {
        "date": "2026-08-03",
        "day_of_week": "Monday",
        "status": "present",
        "clock_in_time": "2026-08-03T09:00:00Z",
        "clock_out_time": "2026-08-03T18:00:00Z",
        "effective_hours": 8.5,
        "late_minutes": 0
      },
      {
        "date": "2026-08-09",
        "day_of_week": "Sunday",
        "status": "weekly_off",
        "clock_in_time": null,
        "clock_out_time": null,
        "effective_hours": null,
        "late_minutes": 0
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Swipeable Week Strip:** 7 horizontal day cells. Each shows day abbreviation (Mon, Tue...), date number, and colored status dot. Today's cell has a highlighted border ring. Swipe left/right to navigate weeks.

* **Selected Day Detail Panel:** Tap a cell → expand detail panel showing clock-in/out, hours, late minutes. "View Details" button → API 7.1.

* **Week Summary Bar:** Compact bar: "This Week: 38.5h | 5 present | 0 late" with icons.

---

## 👔 Section B: Manager APIs (Direct Reports Only)

**Base Path:** `/api/v1/attendance/manager`
**Authorization:** `manager`, `hr`, `admin`, `super-admin`
**Data Scope:** Only employees who directly report to the manager (via `EmployeeProfile.manager_id`). Users with `hr`/`admin`/`super-admin` roles are automatically **excluded** from results.

---

### API 7.5: Get Team Summary (Dashboard Overview)

**Endpoint:** `GET /api/v1/attendance/manager/team/summary`

**What This API Does:**
Returns an aggregated attendance snapshot for the manager's entire team on a specific date. Computes counts for each status, calculates `attendance_percentage`, and returns a list of individual members with their profile info and attendance details. It also computes `not_marked` — employees who haven't clocked in yet — by cross-referencing the team member list against actual records.

**Why This API Exists:**
The existing `/team/today` returns raw records without aggregation. A manager with 15 reports must mentally count "how many present?". This API does the math server-side. The `not_marked` count is critical — it tells HR about employees who are "missing" (no record = no row), which the existing endpoint can't detect.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | Target date |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Team summary fetched",
  "data": {
    "date": "2026-08-07",
    "team_size": 10,
    "counts": {
      "present": 7,
      "absent": 1,
      "half_day": 1,
      "late": 2,
      "on_leave": 1,
      "not_marked": 0,
      "holiday": 0,
      "weekly_off": 0,
      "in_progress": 0
    },
    "attendance_percentage": 85.0,
    "final_present_count": 8,
    "final_absent_count": 1,
    "members": [
      {
        "user_id": "uuid-001",
        "name": "Rahul Sharma",
        "employee_code": "EMP-042",
        "department": "Engineering",
        "designation": "Software Engineer",
        "avatar_url": "https://...",
        "status": "present",
        "clock_in_time": "2026-08-07T09:00:00Z",
        "clock_out_time": "2026-08-07T18:00:00Z",
        "effective_hours": 8.5,
        "late_minutes": 0,
        "work_mode": "office"
      },
      {
        "user_id": "uuid-002",
        "name": "Priya Mehta",
        "employee_code": "EMP-067",
        "department": "Engineering",
        "designation": "QA Lead",
        "avatar_url": "https://...",
        "status": "not_marked",
        "clock_in_time": null,
        "clock_out_time": null,
        "effective_hours": null,
        "late_minutes": 0,
        "work_mode": null
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Summary Donut (Hero):** Donut chart using `counts`. Center text: `attendance_percentage` as "85%". Standard colors from the global palette.

* **Status Chips:** Row of scrollable chips: "✅ 7 Present", "❌ 1 Absent", "⏰ 2 Late". Tapping chips filters the member list below.

* **Team Member List:** Avatar + name + designation | clock-in time | hours worked | right chevron (→ navigate to member detail APIs 7.6/7.7). "Not marked" members shown in muted style with red "Not Clocked In" text.

* **Date Navigation:** Week date strip. Today highlighted. Past dates tappable. Future disabled.

---

### API 7.6: Get Team Member History (Individual Drill-Down)

**Endpoint:** `GET /api/v1/attendance/manager/team/member/:userId/history`

**What This API Does:**
Paginated attendance history for a specific team member within a date range. Before querying, validates that `userId` is a direct report via `getAccessibleUserIds()`. Returns employee profile + paginated records sorted by date descending.

**Why This API Exists:**
Managers need data-backed 1-on-1 conversations. When Rahul is frequently late, the manager needs to see the pattern: every Monday? 5 min or 30+ min? Compensating with overtime? The existing `/team/history` returns ALL records for ALL members with no filtering/pagination — unusable.

**Route Params:** `userId` — The target employee's user ID.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `from` | `YYYY-MM-DD` | No | 30 days ago | Start date |
| `to` | `YYYY-MM-DD` | No | Today | End date |
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Records per page (max 100) |

**Security:** If `userId` is NOT in the manager's team → `403 EMPLOYEE_NOT_IN_TEAM`.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Member attendance history fetched",
  "data": {
    "employee": {
      "user_id": "uuid-001",
      "name": "Rahul Sharma",
      "employee_code": "EMP-042",
      "department": "Engineering"
    },
    "records": [
      {
        "id": "record-uuid",
        "date": "2026-08-07",
        "status": "present",
        "clock_in_time": "2026-08-07T09:00:00Z",
        "clock_out_time": "2026-08-07T18:00:00Z",
        "total_hours": 9.0,
        "effective_hours": 8.5,
        "late_minutes": 0,
        "overtime_minutes": 30,
        "work_mode": "office",
        "shift": { "name": "General Shift" }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 22,
      "total_pages": 2
    }
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Profile Header (Fixed):** Avatar + name + employee code + department. Back arrow to team summary.
* **Date Range Picker:** Dual inputs with presets: "This Month", "Last Month", "Last 30 Days", "Last 90 Days".
* **History Timeline:** Vertical cards. Each: date | status badge | clock-in → clock-out | stats row (hours, late, overtime). Amber left-border for late. Red left-border for absent.
* **Summary Strip:** "Aug 1–31: 20 present, 1 absent, 3 late, 168.5h worked"
* **Pagination:** Previous / Page X of Y / Next.

---

### API 7.7: Get Team Member Summary (Individual Monthly Stats)

**Endpoint:** `GET /api/v1/attendance/manager/team/member/:userId/summary`

**What This API Does & Why:**
Computed monthly summary for a specific team member (present/absent/late counts, hours, punctuality %). Validates `userId` is in manager's team. Powers monthly 1-on-1 reviews and performance conversations.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `1-12` | No | Current month | Target month |
| `year` | `YYYY` | No | Current year | Target year |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Member summary fetched",
  "data": {
    "employee": {
      "user_id": "uuid-001",
      "name": "Rahul Sharma",
      "employee_code": "EMP-042"
    },
    "month": 8,
    "year": 2026,
    "present_days": 20,
    "half_days": 1,
    "absent_days": 1,
    "late_days": 3,
    "holiday_days": 1,
    "weekly_off_days": 8,
    "on_leave_days": 0,
    "total_hours_worked": 168.5,
    "average_hours_per_day": 8.02,
    "total_overtime_minutes": 90,
    "total_break_minutes": 600,
    "punctuality_percentage": 85.71
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Summary Grid (2×4):** 8 stat cards: Present (green), Absent (red), Late (amber), Half Days, Holidays, Weekly Offs, Total Hours, Avg Hours/Day.
* **Punctuality Ring:** Circular progress ring showing `punctuality_percentage`. Below: "On time 18 out of 21 working days."
* **Month Navigation:** Arrows to switch months.
* **Comparison Badge:** If previous month available, show delta: "Punctuality: 85.7% (▼ 9.8% from last month)".

---

### API 7.8: Get Team Graph Data (Monthly Team Analytics)

**Endpoint:** `GET /api/v1/attendance/manager/team/graph-data`

**What This API Does & Why:**
Daily aggregated attendance for the entire team across a month. Pre-computed on server using SQL `GROUP BY`. Returns daily `present_count`, `absent_count`, `late_count` etc. plus `team_summary` with month-level averages. Lets managers identify team-level patterns ("Most absences on Mondays?").

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `1-12` | No | Current month | Target month |
| `year` | `YYYY` | No | Current year | Target year |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Team graph data fetched",
  "data": {
    "month": 8,
    "year": 2026,
    "team_size": 10,
    "team_summary": {
      "avg_attendance_percentage": 88.5,
      "total_late_incidents": 15,
      "total_overtime_hours": 12.5,
      "avg_effective_hours_per_day": 7.8
    },
    "daily": [
      {
        "date": "2026-08-03",
        "day_of_week": "Monday",
        "present_count": 8,
        "absent_count": 1,
        "late_count": 2,
        "half_day_count": 1,
        "in_progress_count": 0,
        "on_leave_count": 0,
        "avg_effective_hours": 8.1,
        "total_overtime_minutes": 45,
        "attendance_percentage": 85.0,
        "final_present_count": 9,
        "final_absent_count": 1
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Stacked Bar Chart (Hero):** X = dates. Y = team member count. Stacks: Present (green), Late (amber), Absent (red), Leave (blue). Weekends = gray. Tap bar → tooltip with counts.
* **Avg Hours Line Overlay:** Thin line on secondary Y-axis showing `avg_effective_hours`. Dashed reference at 8h.
* **KPI Cards (Above Chart):** Avg Attendance %, Late Incidents, Total Overtime, Avg Hours/Day.
* **Day-of-Week Heatmap:** Compute avg attendance by day-of-week (Mon–Fri) from daily data. 5 colored cells reveal patterns like "low attendance on Mondays".

---

## 🏢 Section C: HR APIs — Employee & Manager Attendance

**Base Path:** `/api/v1/attendance/hr`
**Authorization:** `hr`, `admin`, `super-admin`
**Data Scope:** ALL users in the organization (`req.user.orgId`).

---

### API 7.9: Get All Employees Attendance (Filterable List)

**Endpoint:** `GET /api/v1/attendance/hr/employees/attendance`

**What This API Does:**
The main HR attendance workhorse. Paginated, filterable list of attendance records for all org employees. Supports filtering by: date, date range, status (multi-select), department, text search (name/employee code), and pagination. Each record includes employee profile info alongside attendance data.

**Why This API Exists:**
Existing HR reports are inflexible — daily report is locked to one date, monthly report gives only aggregates. HR needs a searchable, filterable data table: "Show me all Engineering absent employees today", "Who was late between Aug 1–7?", "Search Rahul's attendance". Pagination is critical for 500+ employee orgs.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | Single date mode |
| `from` | `YYYY-MM-DD` | No | — | Start of range (overrides `date`) |
| `to` | `YYYY-MM-DD` | No | — | End of range |
| `status` | `string` | No | — | Comma-separated: `present,absent,late,half_day` |
| `department` | `string` | No | — | Filter by department |
| `search` | `string` | No | — | Search name or employee code |
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `50` | Records per page (max 100) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Employee attendance fetched",
  "data": {
    "filters_applied": {
      "date": "2026-08-07",
      "status": null,
      "department": null,
      "search": null
    },
    "records": [
      {
        "user_id": "uuid-001",
        "name": "Rahul Sharma",
        "employee_code": "EMP-042",
        "department": "Engineering",
        "designation": "Software Engineer",
        "avatar_url": "https://...",
        "date": "2026-08-07",
        "status": "present",
        "clock_in_time": "2026-08-07T09:00:00Z",
        "clock_out_time": "2026-08-07T18:00:00Z",
        "effective_hours": 8.5,
        "late_minutes": 0,
        "early_exit_minutes": 0,
        "overtime_minutes": 30,
        "work_mode": "office",
        "is_regularized": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 148,
      "total_pages": 3
    }
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Sticky Filter Bar:** Calendar picker (default "Today", presets: "Today", "Yesterday", "This Week", "Custom Range") | status chips (multi-select, colored) | department dropdown (searchable) | search input (debounce 300ms) | "📥 Export CSV" button.

* **Data Table (Desktop):** Sortable columns: Employee (avatar+name+code), Dept, Status (badge), Clock In, Clock Out, Effective Hours, Late Min (green if 0, red if >15), Overtime, Work Mode, Regularized (✏️ icon). Absent rows = red tint. Late rows = amber tint.

* **Card List (Mobile):** Each card: avatar + name + status badge on one line. Clock-in/out + hours below. Tap → API 7.10.

* **Pagination Footer:** "Showing 1–50 of 148" + Previous/Next + page size selector.

* **Empty State:** Illustration + "No records match your filters" + "Clear Filters" button.

---

### API 7.10: Get Individual Employee Attendance Detail

**Endpoint:** `GET /api/v1/attendance/hr/employees/:userId/attendance`

**What This API Does & Why:**
Paginated attendance history for a specific employee. Accessed when HR clicks a name in API 7.9. Validates `userId` belongs to `req.user.orgId`. Used for performance reviews, disciplinary actions, payroll reconciliation.

**Query Parameters:** `?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20`

**Response:** Same structure as Manager API 7.6, with full employee profile info.

**How Frontend Should Style & Use This Data:**

* **Profile Header (Fixed):** Large avatar (80×80) + name + designation + department + employee code + "View Full Profile" link.
* **Quick Stats Bar:** "38 records | 35 present | 2 absent | 1 late | 161.5h total"
* **Date Range + Presets:** Same as API 7.9 filter bar.
* **Record List/Timeline:** Same as Manager API 7.6 styling.
* **Print Button:** 🖨️ Print-friendly layout with org logo for employee files.

> [!TIP]
> **Data Enhancement:** This API natively resolves `month` and `year` query parameters to fetch the full month if `from`/`to` aren't provided. Additionally, every record row now includes `early_exit_minutes`, `breaks`, and `sessions` inline. The UI can display a ☕ icon or an expandable accordion on rows with nested breaks/sessions.

---

### API 7.10.1: Get Individual Employee Daily Log

**Endpoint:** `GET /api/v1/attendance/hr/employees/:userId/daily-log`
*(Also available as `/hr/managers/:userId/daily-log` and `/hr/hrs/:userId/daily-log`)*

**What This API Does & Why:**
Fetches the granular breakdown of a specific historical date for an employee. When HR needs to audit missing hours or un-ended breaks on a specific day, this provides the raw timeline. It dynamically calculates virtual statuses (e.g., "holiday", "weekly_off") if the employee didn't punch in, avoiding blunt "not_marked" errors.

**Query Parameters:** `?date=YYYY-MM-DD` (Optional, defaults to today)

**Response:** Same structure as Employee API 7.1.

**How Frontend Should Style & Use This Data:**
* **Drilldown Modal:** When HR clicks a row in the history table (API 7.10) or a cell in a monthly calendar view, pop open a large modal using this API.
* **Timeline View:** Render the same `sessions` and `breaks` timeline graph described in API 7.1 so HR sees exactly what the employee sees.

---

### API 7.11: Get Individual Employee Monthly Summary

**Endpoint:** `GET /api/v1/attendance/hr/employees/:userId/summary`

**What This API Does & Why:**
Same as Manager API 7.7 but accessible to HR for any org employee. Powers payroll processing, compliance audits, performance reviews.

**Query Parameters:** `?month=MM&year=YYYY`

**Response:** Same as Manager API 7.7.

**How Frontend Should Style:** Same as API 7.7, positioned as collapsible monthly card on employee detail page. Add 🖨️ Print button for formal summary sheets.

---

### API 7.12: Get All Managers Attendance

**Endpoint:** `GET /api/v1/attendance/hr/managers/attendance`

**What This API Does:**
Same as API 7.9 but returns records **exclusively for users with the `manager` role**. Service fetches `user_ids` from `UserRole` where `role.key === 'manager'`, then queries records for only those IDs.

**Why This API Exists:**
HR needs to monitor management attendance separately — "Are managers leading by example?". Mixing managers into the general list makes comparison impossible. A dedicated tab allows independent analysis.

**Query Parameters:** Same as API 7.9.
**Response:** Same structure as API 7.9, manager records only.

**How Frontend Should Style:** Use tab layout: "👤 Employees" | "👔 Managers". Same table, different data. Add subtle 👔 badge next to manager names.

---

### API 7.13: Get Individual Manager Attendance Detail

**Endpoint:** `GET /api/v1/attendance/hr/managers/:userId/attendance`

Same as API 7.10 but validates target user has `manager` role. Returns `404 MANAGER_NOT_FOUND` if not.

---

### API 7.14: Get Individual Manager Monthly Summary

**Endpoint:** `GET /api/v1/attendance/hr/managers/:userId/summary`

Same as API 7.11 but validates target user has `manager` role.

---

## 📊 Section D: HR Dashboard & Analytics APIs

**Base Path:** `/api/v1/attendance/hr/dashboard`
**Authorization:** `hr`, `admin`, `super-admin`
**Data Scope:** Org-wide aggregates.

---

### API 7.15: Get Live Dashboard (Real-Time Org Snapshot)

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/live`

**What This API Does:**
Returns a real-time attendance snapshot for the entire organization. Counts every employee and categorizes them by status. Computes `attendance_percentage` and `on_time_percentage`. The `not_marked` count reveals employees who haven't punched in yet — critical at 10:30 AM for monitoring.

**Why This API Exists:**
This is the **first thing HR sees**. No existing endpoint provides this. Existing `/reports/daily` returns individual records requiring manual counting. This pre-computes everything in one query.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | Target date |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Live dashboard data fetched",
  "data": {
    "date": "2026-08-07",
    "total_employees": 203,
    "counts": {
      "present": 140,
      "absent": 23,
      "half_day": 5,
      "late": 12,
      "on_leave": 8,
      "not_marked": 15,
      "holiday": 0,
      "weekly_off": 7,
      "in_progress": 5
    },
    "attendance_percentage": 73.89,
    "on_time_percentage": 91.72,
    "final_present_count": 150,
    "final_absent_count": 38
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Hero Metric — Attendance Rate:** Very large animated counter "89.2%" with count-up animation on load. Thick circular progress ring. Green ≥ 85%, amber 70-84%, red < 70%. Label: "Org Attendance Rate".

* **Status Icon Cards (6-Grid):** Present (👤 145 on green), Absent (🚫 23 on red), Late (⏰ 12 on amber), On Leave (📋 8 on blue), Half Day (🌓 5 on yellow), Not Marked (❓ 15 on gray). Each card clickable → navigates to API 7.9 pre-filtered by that status.

* **On-Time Secondary Metric:** "On-Time Rate: 91.7% (134 of 145 arrived on time)".

* **Auto-Refresh:** "Last updated: 10:30 AM" with refresh icon. Auto-poll every 60s or manual refresh.

---

### API 7.16: Get Dashboard Graph Data (Time-Series Analytics)

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/graph-data`

**What This API Does:**
Daily aggregated attendance time-series across a month or custom range. For each day: `present_count`, `absent_count`, `late_count`, `avg_effective_hours`, `attendance_percentage`, etc. Flags each day with `is_working_day`. Includes `overall_summary` with month-level averages.

**Why This API Exists:**
HR dashboards universally need trend charts: "Is attendance improving?", "Worst attendance days?", "Overtime trending up?". Existing `/reports/monthly` gives per-employee aggregates, not per-day. This API fills the gap using SQL `GROUP BY date`.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `1-12` | No | Current month | Target month |
| `year` | `YYYY` | No | Current year | Target year |
| `from` | `YYYY-MM-DD` | No | — | Custom range start (overrides month/year) |
| `to` | `YYYY-MM-DD` | No | — | Custom range end |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Dashboard graph data fetched",
  "data": {
    "period": {
      "from": "2026-08-01",
      "to": "2026-08-31"
    },
    "overall_summary": {
      "avg_attendance_percentage": 89.2,
      "avg_effective_hours": 7.9,
      "total_late_incidents": 45,
      "total_overtime_hours": 67.5,
      "total_absent_days": 120
    },
    "daily": [
      {
        "date": "2026-08-01",
        "day_of_week": "Saturday",
        "is_working_day": false,
        "present_count": 0,
        "absent_count": 0,
        "late_count": 0,
        "half_day_count": 0,
        "in_progress_count": 0,
        "on_leave_count": 0,
        "weekly_off_count": 203,
        "holiday_count": 0,
        "avg_effective_hours": 0,
        "total_overtime_minutes": 0,
        "attendance_percentage": 0,
        "final_present_count": 0,
        "final_absent_count": 0
      },
      {
        "date": "2026-08-03",
        "day_of_week": "Monday",
        "is_working_day": true,
        "present_count": 165,
        "absent_count": 18,
        "late_count": 8,
        "half_day_count": 3,
        "in_progress_count": 2,
        "on_leave_count": 5,
        "weekly_off_count": 0,
        "holiday_count": 0,
        "avg_effective_hours": 8.1,
        "total_overtime_minutes": 180,
        "attendance_percentage": 89.6,
        "final_present_count": 170,
        "final_absent_count": 18
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Multi-Line Trend Chart (Primary):** X = dates. Three lines: Present (green solid), Absent (red dashed), Late (amber dotted). Non-working days have gray vertical band overlay. Hover tooltip shows all counts.

* **Stacked Area Chart (Alternative):** Status areas stacked showing composition changes over time.

* **Avg Hours Bar Chart (Secondary):** Bars = `avg_effective_hours` per working day. Red bars below 8h reference line.

* **KPI Row (Above Charts):** Avg Attendance (89.2% + trend arrow), Avg Hours/Day (7.9h), Late Incidents (45), Total Overtime (67.5h).

* **Month/Range Picker:** Month arrows or custom range. Presets: "This Month", "Last Month", "Last Quarter".

---

### API 7.17: Get Department Summary

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/department-summary`

**What This API Does:**
Aggregates attendance by department using `EmployeeProfile.department`. Returns per-department counts (present, absent, late, etc.) and computed `attendance_percentage`. Can be queried for a single date or across a month.

**Why This API Exists:**
HR needs department comparison: "Engineering 95% vs Operations 72% — investigate". Currently requires manual Excel pivot table. This API does it in 200ms. Department comparison is one of the most requested HR analytics features.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | Single date mode |
| `month` | `1-12` | No | — | Monthly mode (overrides `date`) |
| `year` | `YYYY` | No | Current year | Used with `month` |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Department summary fetched",
  "data": {
    "date": "2026-08-07",
    "departments": [
      {
        "department": "Engineering",
        "total_employees": 45,
        "present": 38,
        "absent": 3,
        "late": 4,
        "half_day": 1,
        "in_progress": 0,
        "on_leave": 3,
        "attendance_percentage": 86.67,
        "final_present_count": 39,
        "final_absent_count": 3
      },
      {
        "department": "Marketing",
        "total_employees": 20,
        "present": 18,
        "absent": 1,
        "late": 1,
        "half_day": 0,
        "in_progress": 0,
        "on_leave": 1,
        "attendance_percentage": 90.0,
        "final_present_count": 18,
        "final_absent_count": 1
      },
      {
        "department": "Operations",
        "total_employees": 35,
        "present": 22,
        "absent": 8,
        "late": 5,
        "half_day": 2,
        "in_progress": 0,
        "on_leave": 3,
        "attendance_percentage": 68.57,
        "final_present_count": 24,
        "final_absent_count": 8
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Horizontal Bar Chart (Hero):** Bars = departments. Length = `attendance_percentage`. Sorted ascending (worst at top). Color gradient: red (<70%) → amber (70-85%) → green (>85%). Percentage at bar end.

* **Comparison Table (Below Chart):** Columns: Department, Total, Present, Absent, Late, Leave, Attendance %. Rows with <75% have red tint + ⚠️.

* **Click-Through:** Tap department row → navigate to API 7.9 pre-filtered: `?department=Engineering`.

---

### API 7.18: Get Top Defaulters *(NEW)*

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/top-defaulters`

**What This API Does:**
Identifies employees with the worst attendance for a given month. Returns two rankings: **Most Absent** (by total absent days DESC) and **Most Late** (by total late days/minutes DESC). Each entry includes employee profile and relevant metric. Capped by `limit`.

**Why This API Exists:**
Every production HRMS dashboard (Darwinbox, GreytHR, Keka) has a "top defaulters" widget. HR can't scroll 200+ employees to find 5 who need attention. This API surfaces actionable outliers automatically — bridging data and managerial action.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `1-12` | No | Current month | Target month |
| `year` | `YYYY` | No | Current year | Target year |
| `limit` | `integer` | No | `10` | Top N per category (max 25) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Top defaulters fetched",
  "data": {
    "month": 8,
    "year": 2026,
    "most_absent": [
      {
        "rank": 1,
        "user_id": "uuid-045",
        "name": "Vikram Patel",
        "employee_code": "EMP-045",
        "department": "Operations",
        "designation": "Operations Executive",
        "avatar_url": "https://...",
        "absent_days": 5,
        "total_working_days": 22
      },
      {
        "rank": 2,
        "user_id": "uuid-089",
        "name": "Sneha Gupta",
        "employee_code": "EMP-089",
        "department": "Sales",
        "designation": "Sales Manager",
        "avatar_url": "https://...",
        "absent_days": 4,
        "total_working_days": 22
      }
    ],
    "most_late": [
      {
        "rank": 1,
        "user_id": "uuid-023",
        "name": "Amit Kumar",
        "employee_code": "EMP-023",
        "department": "Engineering",
        "designation": "Senior Developer",
        "avatar_url": "https://...",
        "late_days": 8,
        "total_late_minutes": 127,
        "total_working_days": 22
      }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Two-Tab Card:** Tabs: "🚫 Most Absent" | "⏰ Most Late". Default = Most Absent.

* **Ranked List:** Rank (gold/silver/bronze for top 3) | avatar + name + department | metric ("5 absent days" or "127 min late (8 days)") | right arrow → API 7.10.

* **Severity Coloring:** Absent ≥ 3 = red text. Late ≥ 5 days = amber text.

* **Empty State:** "🎉 No defaulters this month! Everyone has strong attendance."

---

### API 7.19: Get Work Mode Distribution *(NEW)*

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/work-mode-distribution`

**What This API Does:**
Breaks down `work_mode` values across the org for a date or month. Counts: office, remote, hybrid, field, unspecified (`null`). Returns raw counts and percentages.

**Why This API Exists:**
Post-2020 hybrid work requires monitoring: "Our policy says 3 office days/week — are employees following it?". The `work_mode` field exists in records but no endpoint aggregates it. Valuable for facilities planning, compliance, and leadership insights.

**Query Parameters (`req.query`):**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | `YYYY-MM-DD` | No | Today | Single date mode |
| `month` | `1-12` | No | — | Monthly mode |
| `year` | `YYYY` | No | Current year | Used with `month` |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Work mode distribution fetched",
  "data": {
    "date": "2026-08-07",
    "total_clocked_in": 157,
    "distribution": [
      { "work_mode": "office", "count": 98, "percentage": 62.4 },
      { "work_mode": "remote", "count": 42, "percentage": 26.8 },
      { "work_mode": "hybrid", "count": 12, "percentage": 7.6 },
      { "work_mode": "field", "count": 3, "percentage": 1.9 },
      { "work_mode": null, "count": 2, "percentage": 1.3 }
    ]
  }
}
```

**How Frontend Should Style & Use This Data:**

* **Donut Chart:** Segments by work mode. Colors: Office (#3B82F6 blue), Remote (#22C55E green), Hybrid (#8B5CF6 purple), Field (#F59E0B amber), Unspecified (#9CA3AF gray). Center: total count.

* **Legend with Counts:** "🏢 Office: 98 (62.4%)" | "🏠 Remote: 42 (26.8%)" | ...

* **Monthly Trend (Stacked Bar):** In month mode, one bar per day showing daily work mode distribution. Reveals "Remote increases on Fridays".

---

## 🔐 Security Rules Summary

### Cross-Org Isolation
| Check | Enforced At | How |
|-------|------------|-----|
| Org boundary | Repository | Every `WHERE` clause includes `org_id = req.user.orgId` |
| User verification | Service | `userId` from route params verified against org membership |

### Hierarchical Access
| Actor | Can See | Cannot See |
|-------|---------|------------|
| Employee | Own records only | Any other employee, manager, or HR |
| Manager | Direct reports (excl. HR/Admin) | Other managers, HR, admin, other teams |
| HR | All employees & managers in their org | Users from other organizations |

### Parameter Tampering Prevention
| Attack Vector | Defense |
|---------------|---------|
| Employee passes another `userId` | Employee APIs don't accept `userId` — always `req.user.id` |
| Manager passes non-reportee `userId` | `getAccessibleUserIds` validates → `403` |
| HR passes cross-org `userId` | `EmployeeProfile.findOne({ user_id, org_id })` validates → `404` |
| Massive `limit` | `Math.min(limit, 100)` enforced in validator |
| Excessive date range | Validator caps at 366 days |

---

## 🚨 Standard Error Codes for Phase 7

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `403` | `EMPLOYEE_NOT_IN_TEAM` | Manager accessing non-reportee | Toast: "No permission to view this employee" |
| `403` | `FORBIDDEN` | Wrong role for endpoint | Redirect to own dashboard |
| `404` | `EMPLOYEE_NOT_FOUND` | User not in this org | Toast: "Employee not found" |
| `404` | `MANAGER_NOT_FOUND` | User doesn't hold manager role | Toast: "Manager not found" |
| `400` | `INVALID_DATE_RANGE` | `from > to` or range > 366 days | Highlight date pickers |
| `400` | `INVALID_MONTH_YEAR` | Month not 1-12 | Highlight month selector |
| `400` | `INVALID_DATE_FORMAT` | Not YYYY-MM-DD | Highlight date input |
| `429` | `RATE_LIMIT_EXCEEDED` | Too many analytics requests | Toast: "Please wait before refreshing" |

# Phase 7: Role-Scoped Attendance Read & Analytics APIs
**Existing System Analysis & Implementation Plan**

This document provides a deep analysis of the existing attendance clock-in/clock-out system, the underlying data models, access control patterns, identified gaps, and the complete implementation plan for building role-scoped **read-only data APIs** and **graph-ready analytics endpoints** for Employees, Managers, and HR.

---

## 📋 Table of Contents

1. [Existing Clock In/Out Flow Analysis](#1-existing-clock-inout-flow-analysis)
2. [Data Model Deep Dive](#2-data-model-deep-dive)
3. [Existing Access Control Analysis](#3-existing-access-control-analysis)
4. [Gap Analysis: What's Missing](#4-gap-analysis-whats-missing)
5. [Phase 7 API Specification — Employee](#5-phase-7-api-specification--employee-apis)
6. [Phase 7 API Specification — Manager](#6-phase-7-api-specification--manager-apis)
7. [Phase 7 API Specification — HR](#7-phase-7-api-specification--hr-apis)
8. [Security Architecture](#8-security-architecture)
9. [Implementation Plan](#9-implementation-plan)

---

## 1. Existing Clock In/Out Flow Analysis

### 1.1 Clock-In Flow (`ClockService.clockIn`)

The clock-in operation is a **transactional, multi-step pipeline** that touches 5+ database tables in a single atomic transaction. Here's the exact flow:

```
User Request → Lock Period Check → Duplicate Punch Check → Resolve Shift → Resolve Policy
→ Holiday/Weekly Off Check → Server Timestamp → Calculate Late Minutes
→ Insert AttendanceLogs (immutable) → Create AttendanceRecords → Create AttendanceSessions
→ Geofence Validation → COMMIT
```

**Key Design Decisions Already Made:**
| Decision | Implementation | Impact on Phase 7 |
|----------|---------------|-------------------|
| Server-authoritative timestamps | `const serverNow = new Date()` — client timestamps stored separately in `client_timestamp` | Read APIs can trust `clock_in_time` / `clock_out_time` as canonical |
| Shift snapshots saved at punch time | `shift_snapshot` (JSONB) captured in `AttendanceRecords` | Historical queries don't need to join `shift_templates` for accuracy |
| Policy snapshots saved at punch time | `policy_snapshot` (JSONB) captured in `AttendanceRecords` | Calculation rules are frozen per-record; policy changes don't retroactively alter data |
| `org_id` on EVERY table | All models carry `org_id` as a required field | Cross-org isolation is architecturally enforced at the data layer |

### 1.2 Clock-Out Flow (`ClockService.clockOut`)

Clock-out triggers the **calculation engine** which computes all derived fields:

```
Find In-Progress Record → Auto-close Active Break → Insert Clock-Out Log
→ Close Open Session → Update Record Clock-Out Time → Geofence Validation
→ Run Calculation Engine → COMMIT
```

**Calculation Engine (`AttendanceCalculationService.calculateRecord`) computes:**

| Computed Field | Source | Calculation Logic |
|----------------|--------|-------------------|
| `total_hours` | `clock_out - clock_in` | Raw milliseconds → hours (2 decimal places) |
| `break_duration_minutes` | `SUM(breaks.duration_minutes)` | All closed breaks for the record |
| `effective_hours` | `total_hours - break_duration` | Net productive time |
| `late_minutes` | `clock_in - (shift_start + grace_minutes)` | Only if positive, floored to minutes |
| `early_exit_minutes` | `shift_end - clock_out` | Only if positive, above threshold |
| `overtime_minutes` | `effective_hours - full_day_min_hours` | Only if overtime_enabled in policy |
| `status` | Effective hours thresholds | `present` / `half_day` / `absent` based on policy hours |
| `half_day_type` | Midpoint of shift | `first_half` / `second_half` |

### 1.3 Existing Read APIs

The system already has some basic read endpoints, but they are **limited in scope**:

| Endpoint | Actor | What It Does | Limitations |
|----------|-------|-------------|-------------|
| `GET /api/v1/attendance/today` | Employee (self) | Today's record with breaks, shift info | Self-only, no team view |
| `GET /api/v1/attendance/history` | Employee (self) | Paginated date-range history | Self-only, no filtering by status |
| `GET /api/v1/attendance/summary` | Employee (self) | Monthly summary counts | No graph-ready data, no daily breakdown |
| `GET /api/v1/attendance/manager/team/today` | Manager | Team members' today records | No pagination, no filtering |
| `GET /api/v1/attendance/manager/team/history` | Manager | Team members' full history | No pagination, no date filtering, no summary |
| `GET /api/v1/attendance/hr/reports/daily` | HR | All employees for a single date | No pagination, no filtering |
| `GET /api/v1/attendance/hr/reports/monthly` | HR | Monthly aggregates per employee | No graph data, no trend analytics |
| `GET /api/v1/attendance/hr/reports/employee/:userId` | HR | Raw records for one employee in range | No computed summary or analytics |

---

## 2. Data Model Deep Dive

### 2.1 Core Schema Relationships

```
┌─────────────────────────┐
│    AttendanceRecords     │  ← The central fact table (1 row per user per day)
│─────────────────────────│
│ id (PK, UUID)           │
│ org_id (FK → Org)       │  ← CRITICAL: org isolation key
│ user_id (FK → User)     │
│ date (DATEONLY, UNIQUE with org_id + user_id)
│ shift_id (FK → ShiftTemplates, nullable)
│ policy_id (FK → AttendancePolicies, nullable)
│ clock_in_time (DATE)    │
│ clock_out_time (DATE)   │
│ total_hours (DECIMAL 5,2)
│ break_duration_minutes (INT)
│ effective_hours (DECIMAL 5,2)
│ late_minutes (INT)      │
│ early_exit_minutes (INT)│
│ overtime_minutes (INT)  │
│ work_mode (STRING)      │
│ half_day_type (STRING)  │
│ status (STRING)         │  ← 'absent'|'in_progress'|'present'|'half_day'|'holiday'|'weekly_off'|'on_leave'
│ shift_snapshot (JSONB)  │
│ policy_snapshot (JSONB) │
│ is_regularized (BOOL)   │
│ is_manually_corrected   │
│ is_locked (BOOL)        │
│ remarks (TEXT)          │
└─────────┬───────────────┘
          │
          │ hasMany
          ▼
┌─────────────────────────┐     ┌──────────────────────────┐
│   AttendanceSessions    │     │    AttendanceBreaks       │
│ record_id (FK)          │     │ record_id (FK)            │
│ opened_at / closed_at   │     │ start_time / end_time     │
│ status: open|closed     │     │ duration_minutes          │
└─────────────────────────┘     └──────────────────────────┘

┌─────────────────────────┐     ┌──────────────────────────┐
│  AttendanceAnomalies    │     │   AttendanceOvertime      │
│ record_id (FK)          │     │ record_id (FK)            │
│ type / severity         │     │ overtime_minutes          │
│ is_resolved             │     │ status: pending|approved  │
└─────────────────────────┘     └──────────────────────────┘

┌─────────────────────────┐     ┌──────────────────────────┐
│ AttendanceRegularizations│    │   AttendanceCompOffs      │
│ record_id (FK)          │     │ record_id (FK)            │
│ status: pending|approved│     │ worked_type / earned_date │
│ requested_clock_in/out  │     │ status: earned|approved   │
└─────────────────────────┘     └──────────────────────────┘
```

### 2.2 User Hierarchy Model

```
┌──────────────────────┐        ┌──────────────────────┐
│   User               │        │  EmployeeProfile     │
│ id (PK)              │───────▶│ user_id (FK → User)  │
│ identifier (email)   │        │ org_id (FK → Org)    │
│                      │        │ manager_id (FK → User) │  ← Hierarchy link
│ has one:             │        │ department            │
│  - profile           │        │ designation           │
│  - employee_profile  │        └──────────────────────┘
│  - manager_profile   │
│  - hr_profile        │
│ has many:            │        ┌──────────────────────┐
│  - user_roles        │───────▶│  UserRole            │
└──────────────────────┘        │ user_id + org_id     │
                                │ role (FK → Role.key) │
                                └──────────────────────┘
```

**Key Hierarchy Insight:** The `EmployeeProfile.manager_id` field is the **single source of truth** for the reporting hierarchy. A manager can only see employees where `employee_profile.manager_id === manager.user_id`.

**Key Profile Output Insight:** Because different roles possess different profiles (e.g. `manager_profile` instead of `employee_profile`), querying any attendance lists or aggregates must join across **all three** profile tables. The API enforces a unified `formatUserProfile` mapper to standardize `name`, `employee_code`, `department`, and `designation` for all dashboards, eliminating undefined properties for non-employees.

### 2.3 Database Indexes Available for Read APIs

| Index | Table | Fields | Purpose for Phase 7 |
|-------|-------|--------|---------------------|
| `ar_org_user_date_unique_idx` | `attendance_records` | `org_id, user_id, date` (UNIQUE) | Fast single-user single-day lookup |
| `ar_org_date_idx` | `attendance_records` | `org_id, date` | Org-wide daily queries (HR dashboard) |
| `ar_status_idx` | `attendance_records` | `status` | Filtering by attendance status |
| `ar_user_id_idx` | `attendance_records` | `user_id` | User-specific history queries |

---

## 3. Existing Access Control Analysis

### 3.1 `req.user` Object (JWT Payload)

```javascript
req.user = {
  id: 'uuid',            // User's ID
  identifier: 'email',   // Email/phone
  identifierType: 'email',
  role: 'employee',      // Single role string: 'employee' | 'manager' | 'hr' | 'admin' | 'super-admin'
  orgId: 'uuid',         // Organization ID — THE isolation key
  tokenHash: 'sha256',
  tokenExp: 1234567890
}
```

### 3.2 `AttendanceAccessControl.getAccessibleUserIds`

This is the existing access control utility that determines which users a requester can view:

| Requester Role | Behavior | Returns |
|----------------|----------|---------|
| `super-admin`, `admin`, `hr` | **Full org access** | `null` (means "no filter, all users") |
| `manager` | Queries `EmployeeProfile.manager_id` to find direct reports, then **excludes** anyone with `super-admin`, `admin`, or `hr` roles | `[userId1, userId2, ...]` (filtered list) |
| `employee` / other | **No access** to team APIs | `[]` (empty array = no results) |

### 3.3 Route-Level Authorization

| Route Prefix | Allowed Roles | Middleware |
|--------------|---------------|-----------|
| `/api/v1/attendance` (user routes) | ALL org roles | `authenticate → authorize(allOrgRoles) → requireFeature('attendance.access')` |
| `/api/v1/attendance/manager` | `manager, hr, admin, super-admin` | `authenticate → authorize(managerRoles)` |
| `/api/v1/attendance/hr` | `hr, admin, super-admin` | `authenticate → authorize(['hr', 'admin', 'super-admin'])` |

---

## 4. Gap Analysis: What's Missing

### 4.1 Employee Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| **No daily breakdown data for graphs** | `getSummary` only returns aggregate counts, not a day-by-day array | Frontend cannot render line/bar charts |
| **No status filtering on history** | `/history` endpoint lacks `?status=late,absent` filter | UI can't implement quick filters |
| **No "week view" or "date-specific" lookup** | Employee can only see "today" or paginated "all history" | Can't jump to a specific past date easily |
| **No attendance streak/trend data** | No endpoint that computes current streak, punctuality score, etc. | Dashboards feel hollow without engagement metrics |
| **No weekly calendar view data** | No endpoint that returns a 7-day view optimized for a calendar component | Common mobile UI pattern (swipeable week) has no API |

### 4.2 Manager Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| **No team summary/aggregate** | Manager can see raw records but no computed stats like "8/10 present today" | Manager dashboard has no overview card |
| **No individual team member detail** | Manager can't drill into a specific reportee's monthly view | Can't have 1-on-1 performance conversations with data |
| **No pagination on team endpoints** | `getTeamToday` and `getTeamHistory` return unbounded arrays | Performance degrades with large teams |
| **No date filtering on team history** | `getTeamHistory` returns ALL records for ALL time | Massive data transfer, unusable |
| **No graph-ready team analytics** | No daily trend, no late arrival distribution, no department comparison | Dashboard is just a raw data dump |

### 4.3 HR Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| **No org-wide live dashboard data** | No endpoint returning "Right now: 45 present, 12 absent, 3 on leave" | HR dashboard landing page is blank |
| **Reports lack pagination** | Monthly report returns all employees at once | Breaks on orgs with 500+ employees |
| **No department-wise breakdown** | HR can't filter attendance by department | Cross-department analysis requires manual Excel work |
| **No graph-ready time-series data** | No endpoint that returns day-by-day values for a given period | Can't render trend charts |
| **No separate employee vs manager attendance views** | HR sees everyone in one flat list | Can't analyze management attendance separately |
| **No computed attendance percentage** | No single endpoint that says "Org attendance rate: 92.3% this month" | Executive reports need this number |
| **No "top defaulters" or chronic late-comers view** | HR can't quickly identify employees with worst attendance | Performance management has no data-driven starting point |
| **No work-mode distribution (WFH/Office/Hybrid)** | HR can't see how many people are working from home vs office | Policy compliance monitoring is blind |

### 4.4 Security Gaps

| Gap | Risk |
|-----|------|
| **Manager team endpoints don't validate `manager_id` is still active** | Deactivated manager might still have a valid token |
| **HR report endpoints don't enforce `org_id` filtering in the query layer** | Report service passes `orgId` but some repository methods could be stronger |
| **No rate limiting on data-heavy endpoints** | A rogue client could hammer `/reports/monthly` and overload the DB |

---

## 5. Phase 7 API Specification — Employee APIs

All endpoints are scoped to `req.user.orgId` + `req.user.id`. **An employee can ONLY see their own data.** The employee never passes their own `userId` as a parameter — it's always extracted from the JWT token on the server side, making it impossible for one employee to access another employee's attendance data.

---

### API 7.1: `GET /api/v1/attendance/daily-log`

**What This API Does:**
This API retrieves the complete, granular attendance record for the logged-in employee on a specific date. Unlike the existing `/today` endpoint which only works for the current day, this API lets the employee look back at any historical date. It returns not just the top-level record (clock-in time, status, hours worked), but also every individual **session** (useful for multi-session shifts), every **break** taken during the day, any **anomalies** that were flagged by the system (like out-of-bounds geofence, excessive break, etc.), and the assigned **shift** details. This is the "deep detail" view — think of it as opening a specific day on a timeline and seeing everything that happened.

**Why This API Exists:**
The existing `/today` endpoint only shows the current day. When an employee notices their monthly summary shows "3 late days" and wants to know *which* days were late and *why* the system flagged them as late, they currently have no way to drill into a specific past date. This API solves that problem. It also lets employees verify that their breaks were recorded correctly, check if the system detected any anomalies they weren't aware of, and see exactly which shift rules were applied to their day. Without this, employees have to contact HR to get details about a past day — creating unnecessary support burden.

**Query Params:** `?date=YYYY-MM-DD` (defaults to today if omitted)

**How Frontend Can Style & Use This Data:**

The daily log is best presented as a **timeline card** or **day detail sheet** that the employee sees after tapping a specific date on a calendar or history list.

* **Top Section — Status Header:** Display a large, color-coded status badge at the top. Use green for "present", amber for "half_day", red for "absent", purple for "on_leave", blue for "holiday" / "weekly_off". Include the date formatted as "Thursday, August 7, 2026" in large readable text. Below the badge, show the clock-in and clock-out times in `hh:mm a` format (e.g., "09:02 AM → 6:15 PM") with a horizontal timeline bar between them that visually represents the day. If the shift had a defined start/end, overlay the shift window as a lighter background band so the employee can visually see if they were early/late.

* **Middle Section — Stats Grid:** Render a 2×3 or 3×2 grid of stat cards, each containing one metric:
  - **Effective Hours** (main number, large font) with a small progress ring showing percentage of expected shift hours (e.g., 8.72 / 9.00 = 97%)
  - **Late Minutes** — show as "0 min ✅" (green) or "12 min ⚠️" (amber/red with a clock icon)
  - **Break Time** — show total minutes with a coffee cup icon
  - **Overtime** — only show this card if overtime_minutes > 0; use a bolt icon ⚡
  - **Early Exit** — only show if > 0; use a door icon 🚪
  - **Work Mode** — show "Office" with a building icon or "Remote" with a home icon

* **Sessions Timeline:** Below the stats, render a vertical timeline of sessions. Each session is a segment showing `opened_at → closed_at` with duration. If there were multiple sessions (e.g., employee clocked out for lunch and clocked back in), show each as a separate connected block. Use a solid line for active work segments and a dashed line for gaps between sessions.

* **Breaks List:** Show breaks as pill-shaped entries nested within the sessions timeline. Each pill shows `start_time → end_time` and `duration_minutes`. If any break triggered an "excessive_break" anomaly, show a subtle warning icon next to it.

* **Anomalies Section:** Only render this section if the `anomalies` array is non-empty. Use a light red/orange background card with an alert icon. List each anomaly with its `type` (humanized: "Out of Bounds" instead of "out_of_bounds"), `description`, `severity` (color-coded), and resolution status. This section helps the employee understand *why* their record might have been flagged.

* **Shift Info Footer:** A collapsible section at the bottom showing the shift that was applied: name, start/end time, type. This is useful for employees on rotation shifts who might forget which shift they were on a particular day.

---

### API 7.2: `GET /api/v1/attendance/graph-data`

**What This API Does:**
This API returns a structured, day-by-day array of attendance data points for an entire month. For every single day in the month (including weekends, holidays, and days with no records), it returns a data point containing the `date`, `day_of_week`, `status`, `effective_hours`, `late_minutes`, and `overtime_minutes`. The response also includes a pre-computed `summary` object with aggregate counts (present days, absent days, late days, etc.) and computed percentages like `punctuality_percentage`. This is fundamentally different from the existing `/summary` endpoint which only returns aggregate counts — this API returns the **raw daily data points** that let the frontend render actual charts.

**Why This API Exists:**
Modern employee self-service dashboards are expected to show visual charts — "How many hours did I work each day this month?", "Which days was I late?", "Is my overtime increasing or decreasing?". The existing `/summary` endpoint only tells you "you had 3 late days" but not which days. The existing `/history` is a raw paginated list that doesn't include non-working days and isn't structured for chart consumption. This API fills both gaps: it provides the day-by-day granularity needed for charts and includes zero-value entries for holidays/weekly-offs so the chart has no gaps on the X-axis.

**Query Params:** `?month=MM&year=YYYY` (defaults to current month/year)

**How Frontend Can Style & Use This Data:**

This is the employee's **personal attendance dashboard** — the first thing they see when they open the attendance module. The data from this API feeds multiple visual components simultaneously.

* **Bar Chart — Daily Hours Worked:** This is the hero chart. Use the `daily[]` array to render a vertical bar chart where each bar represents one day. The X-axis shows dates (use day-of-month numbers: 1, 2, 3...). The Y-axis shows hours (0 to 12). Color each bar by status:
  - `present` → Solid green bar (#22C55E)
  - `half_day` → Half-height amber bar (#F59E0B)
  - `absent` → Very short red bar or a red "X" marker (#EF4444)
  - `holiday` / `weekly_off` → Light gray bar (#E5E7EB) or a subtle stripe pattern
  - `on_leave` → Blue bar (#3B82F6)
  - `in_progress` → Animated pulse bar (today, still working)
  
  Draw a horizontal dashed reference line at 8.0 hours (or whatever `full_day_min_hours` is from the policy) so the employee can visually see days where they fell short. Add hover/tap tooltips showing the exact `effective_hours` and `status` for that day.

* **Summary KPI Cards — Row Above the Chart:** Use the `summary` object to render 4-5 compact metric cards in a horizontal scrollable row:
  - **Present Days**: Large number "20" with a green background, subtitle "out of 22 working days"
  - **Late Days**: "3" with amber background, subtitle "85.7% punctuality"
  - **Avg Hours**: "8.2h" with a neutral background
  - **Overtime**: "2h 30m" with a purple background, shown only if > 0
  - **Punctuality Score**: Render `punctuality_percentage` as a circular progress indicator (donut chart) — 91.3% shown as a nearly-full green ring

* **Mini Calendar Heatmap (Alternative View):** Some apps prefer a calendar-style heatmap over a bar chart. Render a month grid (7 columns for days of week, 4-5 rows for weeks). Color each cell by status. This gives an instant visual "attendance at a glance". Employee can tap any cell to navigate to the **daily-log** API (API 7.1) for that date.

* **Trend Sparkline — Late Minutes:** Below the main chart, add a small sparkline (thin line chart, no axis labels) showing `late_minutes` across the month. This helps the employee spot if their late arrivals are getting worse or improving.

* **Month Navigation:** Add left/right arrow buttons or a month picker to switch months. Each navigation fetches this API with the new month/year values.

---

### API 7.3: `GET /api/v1/attendance/trends`

**What This API Does:**
This API computes engagement and punctuality metrics by analyzing the employee's attendance across multiple months (configurable: 1 to 12 months back). It calculates the employee's **current streak** (consecutive days with a specific status — like "12 days present in a row"), their **overall punctuality percentage** (percentage of working days where `late_minutes === 0`), their **average hours per working day**, and a **month-by-month comparison array** where each month has its own aggregated stats. This is not raw record data — it's fully computed analytics derived from `AttendanceRecords`.

**Why This API Exists:**
Employee engagement is proven to improve when employees can track their own performance metrics over time. Gamification elements like streaks ("🔥 You've been on time for 12 consecutive days!") and month-over-month comparison ("Your attendance improved 5% from last month ↑") give employees a sense of progress and encourage positive behavior. No existing endpoint provides this — the existing `/summary` only covers one month at a time and doesn't compute cross-month metrics like streaks. HR benefits indirectly: engaged employees with visibility into their own metrics tend to self-correct issues like chronic lateness before they escalate to managerial intervention.

**Query Params:** `?months=3` (default 3, max 12 — how many months to look back)

**How Frontend Can Style & Use This Data:**

This data powers the "gamification layer" of the employee dashboard. It should feel motivating and personal — not clinical.

* **Streak Card (Hero Element):** At the top of the dashboard, render a prominent streak card. If `current_streak.type` is "present" and `current_streak.days` is > 3, show a fire emoji or flame animation: "🔥 12-Day Streak!" with the subtitle "Present since July 22". Use warm gradient background (orange to amber). If the streak is broken (days = 0 or 1), show a gentler message: "Start a new streak today!" in neutral tones. The streak card should feel like a badge of honor — something the employee glances at each morning.

* **Punctuality Gauge:** Render `punctuality_percentage` as a large semi-circular gauge or speedometer. 0-60% = Red zone, 60-80% = Amber, 80-100% = Green. The needle points to the current value. Below the gauge, show the raw text: "You were on time 91.3% of working days". This is more visually impactful than just showing a number.

* **Average Hours Stat:** A simple card showing `average_hours_per_day` as "8.2h / day" with a small ▲ or ▼ arrow showing if it's higher or lower than last month. Color the arrow green for improvement, red for decline.

* **Month-Over-Month Comparison Chart:** Use the `months[]` array to render a grouped bar chart or a multi-line chart comparing 3+ months. Recommended approach: a grouped bar chart where each group is a month, and within each group you have bars for `present_days`, `absent_days`, `late_days`. This lets the employee visually see "Am I getting better or worse?". Alternatively, render `punctuality_percentage` as a line chart across months — a rising line is instantly gratifying.

* **Month Cards (Carousel):** Below the chart, render the `months[]` array as horizontal scrollable summary cards. Each card shows the month name ("July 2026"), key stats (20 present, 1 absent, 2 late), and `avg_hours`. Cards can be tapped to navigate to the graph-data view (API 7.2) for that specific month.

---

### API 7.4: `GET /api/v1/attendance/weekly-calendar` *(NEW — Suggested Addition)*

**What This API Does:**
This API returns attendance data for a 7-day window centered around a target date (or the current ISO week). It provides the same day-by-day data points as the graph-data API but scoped to exactly 7 days. It also includes a `week_summary` with totals for the week: total hours worked, days present, days late.

**Why This API Exists (Suggestion Rationale):**
Mobile-first attendance apps (like Keka, Zoho People, GreytHR) predominantly show a **swipeable week calendar** as the default view — not a month view. Employees most frequently need to review "this week" or "last week", not the entire month. Calling the month-level graph-data API and extracting 7 days on the client side wastes bandwidth and forces the frontend to do date math. A dedicated week API is cheaper (7 records vs 30), faster, and maps directly to the most common UI pattern in attendance mobile apps. It also enables a smooth "swipe left to see last week" interaction without fetching an entire new month of data.

**Query Params:** `?date=YYYY-MM-DD` (returns the ISO week containing this date; defaults to current week)

**How Frontend Can Style & Use This Data:**

* **Swipeable Week Strip:** Render 7 day cells in a horizontal row. Each cell shows the day-of-week abbreviation (Mon, Tue, Wed...), the date number (3, 4, 5...), and a colored dot/circle indicating status. Today's cell should have a highlighted border (primary color ring). The user can swipe left/right to navigate weeks; each swipe calls this API with the new date.

* **Selected Day Detail:** When the user taps a day cell, expand a detail panel below the strip showing the summary for that day: clock-in time, clock-out time, effective hours, late minutes. This is a lighter version of the full daily-log (API 7.1). If the user wants full detail (sessions, breaks, anomalies), a "View Details" button navigates to API 7.1.

* **Week Summary Bar:** Below the week strip, show a compact summary bar: "This Week: 38.5h worked | 5 days present | 0 late" in a single row with icons.

---

## 6. Phase 7 API Specification — Manager APIs

All Manager endpoints are filtered through `AttendanceAccessControl.getAccessibleUserIds`. A manager can ONLY see employees who report directly to them (via `EmployeeProfile.manager_id`), and users with `hr`/`admin`/`super-admin` roles are automatically **excluded** from the result set. This means a manager cannot see another manager's team, cannot see HR's attendance, and cannot see their own boss's attendance. The only people visible are their direct downward reports.

---

### API 7.5: `GET /api/v1/attendance/manager/team/summary`

**What This API Does:**
This API returns an aggregated attendance snapshot for the manager's entire team on a specific date. It computes counts for each status category (present, absent, half_day, late, on_leave, not_marked, holiday, weekly_off), calculates the overall `attendance_percentage` for the team, and also returns a list of individual team members with their name, status, clock-in time, and key metrics. Think of it as a "roll call" API — the manager opens their dashboard and instantly sees who's in, who's out, who's late.

**Why This API Exists:**
The existing `GET /manager/team/today` endpoint returns raw records without any aggregation. A manager with 15 direct reports has to mentally count "how many are present?" by scanning through 15 records. This API does the math on the server, returning a clean `counts` object that the frontend can render instantly. It also adds the `not_marked` count — employees who haven't clocked in yet. The existing endpoint can't tell you about employees who are "missing" because a missing record is a missing row (null), not an explicit status. This API cross-references the team member list against actual records for the date to compute the "not_marked" count, which is critically important at, say, 10:00 AM when not everyone has clocked in yet.

**Query Params:** `?date=YYYY-MM-DD` (defaults to today)

**How Frontend Can Style & Use This Data:**

This is the **manager's landing page** — the first screen they see. It should communicate team health at a glance.

* **Summary Donut (Hero):** At the top, render a donut chart using the `counts` object. Each segment represents a status category with its count. Center text shows `attendance_percentage` as "85%". The donut should use the standard color palette: green (present), red (absent), amber (late), blue (on_leave), gray (not_marked). This gives the manager an instant "temperature check" of their team.

* **Status Count Chips:** Below the donut, render a row of horizontally scrollable status chips (similar to filter tabs). Each chip shows an icon + count: "✅ 7 Present", "❌ 1 Absent", "⏰ 2 Late", "📋 1 Leave", "❓ 0 Not Marked". Tapping a chip should filter the team member list below to show only members with that status.

* **Team Member List:** A vertically scrollable list of team members. Each row shows:
  - Avatar (circular, from `avatar_url`) with a colored status dot overlay (green/red/amber) at bottom-right
  - Name and designation in two lines
  - Clock-in time on the right side (e.g., "9:02 AM")
  - A compact stat like effective hours ("8.5h") or late minutes ("12 min late")
  - Right chevron icon to indicate the row is tappable (navigates to member detail — API 7.6)
  
  For employees marked as "not_marked", show the row in a muted/grayed-out style with "Not Clocked In" in red text instead of a clock-in time.

* **Date Navigation:** A horizontal date strip at the top showing the current week's dates. Today is highlighted. Manager can tap any past date to load that day's summary. Future dates are disabled. This lets managers quickly review "how was my team's attendance on Monday?" without switching to a calendar.

---

### API 7.6: `GET /api/v1/attendance/manager/team/member/:userId/history`

**What This API Does:**
This API fetches the paginated attendance history for a **specific team member** within a date range. Before querying the database, it validates that the requested `userId` is actually a direct report of the logged-in manager (by checking `getAccessibleUserIds`). If the `userId` is not in the manager's team, it returns a `403 EMPLOYEE_NOT_IN_TEAM` error — even if the employee exists in the same organization. The response includes the employee's basic profile info (name, employee code, department) and a paginated list of attendance records sorted by date descending, along with standard pagination metadata.

**Why This API Exists:**
Managers need to have data-backed conversations with their team members. When a manager notices from the team summary (API 7.5) that Rahul has been frequently late, they need to drill into Rahul's specific history to see the pattern: Is it every Monday? Is it always 5-10 minutes or sometimes 30+ minutes? Is he compensating with overtime? The existing `/manager/team/history` endpoint returns ALL records for ALL team members with no date filtering and no pagination — completely unusable for this purpose. This API solves it by scoping to a single member, supporting date range filtering, and paginating results. The access control validation is critical here — without it, a manager could manipulate the `userId` in the URL to spy on employees from other teams, which violates the hierarchical access principle.

**Query Params:** `?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20`

**How Frontend Can Style & Use This Data:**

This is the **member detail page** — accessed when a manager taps on a team member's row in the summary view.

* **Employee Profile Header:** At the top, show the employee's avatar, full name, employee code, department, and designation. This header stays fixed as the user scrolls through the history below. Include a back arrow to return to the team summary.

* **Date Range Picker:** Below the header, render a compact date range picker (two date inputs: "From" and "To") pre-filled with the last 30 days. Include quick-select buttons: "This Month", "Last Month", "Last 30 Days", "Last 90 Days". Changing the range re-fetches this API.

* **History Timeline:** Render the `records[]` array as a vertical timeline. Each record is a card showing:
  - Date (left side, formatted as "Mon, Aug 3")
  - Status badge (color-coded pill: "Present ✅", "Half Day 🟡", "Absent ❌")
  - Clock-in → Clock-out time (e.g., "9:00 AM → 6:00 PM")
  - Three mini-stats in a row: Effective Hours, Late Minutes, Overtime
  - Shift name in small gray text
  
  Cards where `late_minutes > 0` should have a subtle amber left-border to draw attention. Cards where `status === 'absent'` should have a red left-border.

* **Pagination:** At the bottom, show standard pagination controls (Previous / Page X of Y / Next). Or implement infinite scroll that loads the next page as the user reaches the bottom.

* **Summary Quick-View:** At the top of the history list, before the first record, show a light-background summary strip: "Showing Aug 1 – Aug 31: 20 present, 1 absent, 3 late, 168.5h worked". This gives the manager instant context before they start scrolling through individual records.

---

### API 7.7: `GET /api/v1/attendance/manager/team/member/:userId/summary`

**What This API Does:**
This API returns the computed monthly attendance summary for a specific team member. It aggregates all attendance records for the given month into meaningful counts and averages: present days, half days, absent days, late days, holiday days, weekly off days, on-leave days, total hours worked, average hours per working day, total overtime minutes, total break minutes, and a computed `punctuality_percentage` (percentage of working days where the employee arrived on time). Like API 7.6, it validates that the target `userId` is in the manager's accessible team before returning any data.

**Why This API Exists:**
This complements the history API (7.6). While the history API shows the *what* (raw day-by-day records), this summary API shows the *so what* (aggregated insights). A manager doing a monthly 1-on-1 doesn't want to scroll through 22 records — they want to see "20 present, 1 absent, 3 late, 85% punctuality" at a glance. This API powers that view. It's also useful for internal performance reviews where the manager needs to provide objective attendance metrics to HR. The `punctuality_percentage` is particularly valuable — it's a single number that captures an employee's timeliness across the entire month.

**Query Params:** `?month=MM&year=YYYY` (defaults to current month/year)

**How Frontend Can Style & Use This Data:**

This is the **member summary card** — shown alongside or above the member's history, or as a popup/modal when the manager taps a "Summary" tab.

* **Summary Grid (2×4):** Render an 8-cell grid of stat cards:
  - **Present**: Large green number "20" with leaf/checkmark icon
  - **Absent**: Red number "1" with X icon
  - **Late Days**: Amber number "3" with clock icon
  - **Half Days**: Yellow number "1" with half-circle icon
  - **Holidays**: Blue number "1" with star icon
  - **Weekly Offs**: Gray number "8"
  - **Total Hours**: "168.5h" with timer icon
  - **Avg Hours/Day**: "8.02h" with chart icon

* **Punctuality Ring:** Render `punctuality_percentage` as a prominent circular progress ring. 85.71% = green ring, 85.71% text in the center. Below the ring, in small text: "On time 18 out of 21 working days."

* **Month Navigation:** Arrow buttons to switch months. Each switch re-fetches with new month/year.

* **Comparison Badge:** If previous month's data is available (you can call this API twice — current month and previous month), show a delta indicator: "Punctuality: 85.7% (▼ 9.8% from last month)" in red, or "▲ 5.2%" in green.

---

### API 7.8: `GET /api/v1/attendance/manager/team/graph-data`

**What This API Does:**
This API returns daily aggregated attendance data for the **entire team** across a month, structured for chart rendering. For each day in the month, it returns counts: `present_count`, `absent_count`, `late_count`, `half_day_count`, `on_leave_count`, plus `avg_effective_hours` and `total_overtime_minutes`. It also includes a `team_summary` object with month-level aggregates like `avg_attendance_percentage`, `total_late_incidents`, `total_overtime_hours`, and `avg_effective_hours_per_day`. Unlike the member-specific APIs which show individual data, this API shows the collective performance of the manager's entire team.

**Why This API Exists:**
A manager needs to understand team-level patterns, not just individual ones. Questions like "Is my team's attendance declining this month?", "Which day of the week has the most absences?", "Is overtime increasing?" can only be answered with aggregated trend data. The existing manager endpoints return individual records — there's no aggregation. This API pre-computes the aggregates on the server (using SQL `GROUP BY`) so the frontend can render charts instantly without doing heavy computation on thousands of records in JavaScript.

**Query Params:** `?month=MM&year=YYYY` (defaults to current month/year)

**How Frontend Can Style & Use This Data:**

This is the **team analytics page** — accessible from a "Team Insights" or "Analytics" tab on the manager dashboard.

* **Stacked Bar Chart (Hero):** The primary visualization. X-axis = dates (1 through 31). Y-axis = number of team members. Each bar is stacked with colored segments:
  - Bottom segment (green): Present count
  - Next segment (amber): Late count (these are people who were present but late)
  - Next segment (red): Absent count
  - Top segment (blue): On Leave count
  
  This shows the team composition for each day. Weekends and holidays should show a single gray bar. The chart should be scrollable horizontally on mobile. Add tap interaction: tapping a bar shows a tooltip with exact counts.

* **Trend Line Overlay:** On the same chart (or a secondary chart below), overlay a thin line showing `avg_effective_hours` per day. This line should have its own Y-axis on the right side (0 to 10 hours). This creates a powerful dual-axis visualization: "My team had 8 people present on Monday and they averaged 8.2 hours."

* **KPI Cards Row:** Above the chart, render 4 cards using `team_summary`:
  - **Avg Attendance**: "88.5%" in a donut mini-chart
  - **Late Incidents**: "15 this month" with a small up/down trend arrow
  - **Total Overtime**: "12.5 hours" with a clock icon
  - **Avg Hours/Day**: "7.8h" with a chart icon

* **Day-of-Week Heatmap (Bonus):** From the daily data, compute average attendance by day-of-week (Monday through Friday). Show as 5 colored cells. This reveals patterns like "My team tends to be absent on Mondays" — a very common managerial insight.

---

## 7. Phase 7 API Specification — HR APIs

HR APIs provide **organization-wide visibility**. The data scope is the entire organization (all employees, all managers) filtered by `req.user.orgId`. HR never sees data from other organizations — even if they somehow obtain a valid user ID from another org, the `org_id` filtering in the repository will return zero rows.

---

### API 7.9: `GET /api/v1/attendance/hr/employees/attendance`

**What This API Does:**
This is the main attendance workhorse for HR. It returns a **paginated, filterable list** of attendance records for all employees in the organization. HR can filter by: a specific date, a date range, attendance status (present, absent, late, half_day), department, and a text search (by employee name or employee code). Each record in the response includes the employee's profile information (name, employee code, department, designation, avatar) alongside their attendance data (status, clock-in/out times, effective hours, late minutes, overtime).

**Why This API Exists:**
The existing HR report endpoints (`/reports/daily`, `/reports/monthly`) are inflexible — the daily report locks you to a single date with no filters, and the monthly report gives only aggregates without the ability to see individual records. HR teams need a flexible, searchable, paginated view where they can answer questions like: "Show me all Engineering employees who were absent today", "Who was late between Aug 1 and Aug 7?", "Search for Rahul and see his attendance this week". This API is the equivalent of a sophisticated data table with server-side filtering — the kind of view that HR people live in all day. The pagination is critical for large organizations (500+ employees) where returning all records at once would crash the frontend.

**Query Params:**
- `?date=YYYY-MM-DD` — Single date mode (default: today)
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — Date range mode (overrides `date`)
- `?status=present,absent,late` — Comma-separated status filter
- `?department=Engineering` — Department filter
- `?search=rahul` — Text search by name or employee code
- `?page=1&limit=50` — Pagination (max limit: 100)

**How Frontend Can Style & Use This Data:**

This is the **HR attendance master list** — the primary operational view for daily HR work.

* **Filter Bar (Sticky at Top):** Render a horizontal filter bar that stays visible as the user scrolls the table below. Components:
  - **Date picker / Range selector:** A calendar dropdown. Default to "Today". Offer quick presets: "Today", "Yesterday", "This Week", "Custom Range". When a range is selected, the date fields switch to a dual-input (From / To).
  - **Status filter chips:** Horizontally scrollable colored chips: "All" (default, no filter), "Present" (green), "Absent" (red), "Late" (amber), "Half Day" (yellow), "On Leave" (blue). Multiple chips can be active simultaneously. Each selection adds to the `status` query param.
  - **Department dropdown:** A searchable single-select dropdown listing all departments. Selecting one filters by `department`.
  - **Search input:** A text input with a magnifying glass icon. Debounce at 300ms before sending the request.
  - **Export button:** A "📥 Export CSV" button at the far right of the filter bar. This exports the currently filtered data.

* **Data Table:** The main content area. Render as a responsive table (on desktop) or card list (on mobile). Columns:
  - **Employee** (sticky first column): Avatar + Name + Employee Code stacked vertically. Clicking the name navigates to the individual detail page (API 7.10).
  - **Department**: Short text (e.g., "Engineering")
  - **Status**: Color-coded badge ("Present ✅", "Absent ❌", "Late ⏰", "Half Day 🟡")
  - **Clock In**: Time in `hh:mm a` format
  - **Clock Out**: Time or "—" if still in progress
  - **Effective Hours**: Number with 2 decimal places
  - **Late (min)**: Show "0" in green, non-zero values in amber/red bold
  - **Overtime (min)**: Show only if > 0
  - **Work Mode**: "Office" / "Remote" / "—"
  - **Regularized**: Show a small ✏️ icon if `is_regularized === true`
  
  Table should be sortable by clicking column headers (sort by Name, Clock In, Late Minutes, etc.). Rows with `status === 'absent'` should have a subtle red background tint. Rows with `late_minutes > 15` should have an amber tint.

* **Pagination Footer:** Show "Showing 1–50 of 148 records" with Previous/Next buttons and a page size selector (20, 50, 100).

* **Empty State:** If no records match the filters, show an illustration with "No attendance records match your filters" and a "Clear Filters" button.

---

### API 7.10: `GET /api/v1/attendance/hr/employees/:userId/attendance`

**What This API Does:**
This API fetches the detailed, paginated attendance history for a single specific employee. HR navigates here when they click on an employee's name in the master list (API 7.9). It returns the employee's profile information plus a paginated list of their attendance records within a date range. Before querying, the service validates that the target `userId` belongs to `req.user.orgId` by checking their `EmployeeProfile` — this prevents cross-org data access even if HR somehow obtains a valid user ID from another organization.

**Why This API Exists:**
HR frequently needs to examine an individual employee's attendance in detail — for performance reviews, disciplinary actions, payroll reconciliation, or simply investigating an employee's complaint about incorrect attendance marking. The existing `/reports/employee/:userId` endpoint returns raw records with no pagination and no summary. This new API adds proper pagination, date range filtering, and comprehensive employee profile info. The org-membership validation is a critical safety net that the existing report endpoint lacks.

**Query Params:** `?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20`

**How Frontend Can Style & Use This Data:**

This is the **employee attendance detail page** — a deep-dive into one person's attendance record.

* **Profile Header (Fixed):** Show a larger profile card at the top: avatar (80×80), full name, designation, department, employee code, and a "View Full Profile" link that navigates to the employee module. The header remains fixed during scroll.

* **Quick Stats Bar:** Below the header, show 4-5 inline stat pills summarizing the currently displayed records: "38 records | 35 present | 2 absent | 1 late | 161.5h total". These update as the date range changes.

* **Date Range + Presets:** A date range picker with presets (same as API 7.9) to control the `from`/`to` window.

* **Record List:** Similar to the manager's member history (API 7.6) — a vertical timeline or table of records sorted by date descending. Each row shows date, status badge, clock-in/out times, effective hours, late minutes, overtime. Color-coded left borders for visual scanning.

* **Pagination:** Standard pagination controls at the bottom.

---

### API 7.11: `GET /api/v1/attendance/hr/employees/:userId/summary`

**What This API Does & Why It Exists:**
Identical in purpose and response shape to the manager's member summary (API 7.7), but accessible to HR for any employee in the org. HR uses this during payroll processing, performance reviews, and compliance audits. The summary provides a single month's aggregated view: present/absent/late/holiday counts, total hours, average hours, punctuality percentage. This is the data HR copies into payroll spreadsheets or presents in quarterly review meetings.

**Query Params:** `?month=MM&year=YYYY`

**How Frontend Can Style & Use This Data:**

Same styling approach as Manager API 7.7, but positioned within the HR individual employee detail page:

* Render as a **collapsible monthly summary card** at the top of the employee detail page. By default, it shows the current month. HR can expand it, change the month, and compare months.

* **Print-Friendly Format:** Since HR often prints these summaries for employee files, add a "🖨️ Print" button that renders a clean, logo-included print layout with the employee's name, month, and all stats in a formal table.

---

### API 7.12: `GET /api/v1/attendance/hr/managers/attendance`

**What This API Does:**
This API is functionally identical to the employee attendance list (API 7.9), but it returns records **exclusively for users who hold the `manager` role** in the organization. The service layer first queries the `UserRole` + `Role` tables to fetch all user IDs with `role.key === 'manager'`, then queries `attendance_records` only for those IDs. All the same filters apply (date, status, department, search, pagination).

**Why This API Exists:**
In many organizations, management accountability is tracked separately from general employee attendance. HR may need to answer questions like: "Are our managers leading by example? Are they late more or less often than their teams?". Mixing manager attendance into the general employee list makes this analysis impossible. By providing a dedicated endpoint, the frontend can render two separate tabs or views — "Employee Attendance" and "Manager Attendance" — giving HR the ability to monitor and compare both populations independently. This is especially valuable during executive reports where leadership attendance patterns are scrutinized.

**Query Params:** Same as API 7.9

**How Frontend Can Style & Use This Data:**

* **Tab-based Layout:** On the HR attendance page, add a tab bar: "👤 Employees" | "👔 Managers". The Employees tab calls API 7.9; the Managers tab calls API 7.12. Same table design, same filters — just different data populations.

* **Visual Differentiation:** When showing manager records, add a subtle 👔 badge next to each name, or use a different accent color (e.g., blue tint instead of the green tint used for employee rows) to make it instantly clear that this is the manager view.

---

### API 7.13: `GET /api/v1/attendance/hr/managers/:userId/attendance`

**What This API Does & Why It Exists:**
Same as the employee detail API (7.10), but validates that the target `userId` holds a `manager` role. If someone tries to pass a non-manager's user ID, it returns `404 MANAGER_NOT_FOUND`. This prevents accidental mixing of employee and manager detail views. Used when HR clicks on a specific manager in the manager attendance list.

**Query Params:** Same as API 7.10

**How Frontend Can Style & Use This Data:** Same as API 7.10, with the manager badge in the profile header.

---

### API 7.14: `GET /api/v1/attendance/hr/managers/:userId/summary`

**What This API Does & Why It Exists:**
Same as the employee summary API (7.11), but restricted to manager-role users.

**Query Params:** Same as API 7.11

**How Frontend Can Style & Use This Data:** Same as API 7.11.

---

### API 7.15: `GET /api/v1/attendance/hr/dashboard/live`

**What This API Does:**
This API returns a **real-time attendance snapshot** for the entire organization on a specific date (defaults to today). It counts every employee in the org and categorizes them: how many are present, absent, on a half-day, late, on leave, haven't marked attendance yet (not_marked), on a holiday, or on a weekly off. It also computes two percentages: `attendance_percentage` (present + half_day) / total working employees × 100, and `on_time_percentage` (present employees who arrived on time / all present employees × 100).

**Why This API Exists:**
This is the **first thing HR sees** when they open the attendance module. It answers the most fundamental question: "How is our organization doing right now?". No existing endpoint provides this. The existing `/reports/daily` returns individual records — HR has to count them manually. This API pre-computes everything. The `not_marked` count is particularly powerful — it tells HR how many employees haven't punched in yet, which is critical at, say, 10:30 AM when HR is actively monitoring morning attendance. The two percentage metrics instantly communicate org health without HR needing to do mental math.

**Query Params:** `?date=YYYY-MM-DD` (defaults to today)

**How Frontend Can Style & Use This Data:**

This powers the **HR dashboard landing page** — the command center.

* **Hero Metric — Attendance Rate:** Render `attendance_percentage` as a very large animated counter (e.g., "89.2%") at the center-top of the dashboard. Use a smooth count-up animation from 0 to the value on page load. Surround it with a thick circular progress ring that fills proportionally. Color: green if ≥ 85%, amber if 70-84%, red if < 70%. Below the number, show "Org Attendance Rate" as a label.

* **Status Distribution — Icon Cards Row:** Below the hero metric, render a row of 6 cards, each representing a status:
  - Present: 👤 + count (145) on green background
  - Absent: 🚫 + count (23) on red background
  - Late: ⏰ + count (12) on amber background
  - On Leave: 📋 + count (8) on blue background
  - Half Day: 🌓 + count (5) on yellow background
  - Not Marked: ❓ + count (15) on gray background
  
  Each card should be clickable — navigating to the employee attendance list (API 7.9) pre-filtered by that status. For example, clicking the "Absent" card shows `GET /employees/attendance?date=today&status=absent`.

* **On-Time Percentage:** Show `on_time_percentage` as a smaller secondary metric below the cards: "On-Time Rate: 91.7% (134 of 145 present employees arrived on time)".

* **Auto-Refresh Badge:** Show a subtle "Last updated: 10:30 AM" badge with a refresh icon. Either auto-poll every 60 seconds or show a manual refresh button. Add a small animation (pulse or ripple) when data refreshes.

* **Comparative Note:** If yesterday's data is available (HR can pass `?date=yesterday`), show a small delta: "Attendance ▲ 2.3% vs yesterday" in green or "▼ 1.5% vs yesterday" in red.

---

### API 7.16: `GET /api/v1/attendance/hr/dashboard/graph-data`

**What This API Does:**
This API returns daily aggregated attendance data across a month or custom date range, structured as a time-series array. For each day, it provides: `present_count`, `absent_count`, `late_count`, `half_day_count`, `on_leave_count`, `weekly_off_count`, `holiday_count`, `avg_effective_hours`, `total_overtime_minutes`, and `attendance_percentage`. It also flags each day with `is_working_day` (false for weekends/holidays) so the frontend can visually differentiate working and non-working days. The response includes an `overall_summary` with month-level averages.

**Why This API Exists:**
HR dashboards universally need trend charts. Questions like "Is our attendance improving or declining this month?", "Which days had the worst attendance?", "Is overtime trending up?" require time-series data. The existing `/reports/monthly` returns per-employee aggregates but not per-day aggregates — it can't power a daily trend chart. This API fills that gap by pre-computing daily aggregates using SQL `GROUP BY date`, which is far more efficient than returning all raw records and aggregating in JavaScript.

**Query Params:**
- `?month=MM&year=YYYY` — Month mode (returns one data point per day in the month)
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — Custom range mode (overrides month)

**How Frontend Can Style & Use This Data:**

This is the **analytics section** of the HR dashboard — placed below the live snapshot.

* **Multi-Line Trend Chart (Primary):** Render a multi-line chart where the X-axis shows dates and the Y-axis shows counts. Draw three lines:
  - **Present** (green line with circles at data points): Shows daily present count
  - **Absent** (red line, dashed): Shows daily absent count
  - **Late** (amber line, dotted): Shows daily late arrivals
  
  Non-working days (`is_working_day === false`) should have a light gray vertical band overlay on the chart so they're visually distinct from working days. Hover/tap on any data point shows a tooltip with all counts for that day.

* **Stacked Area Chart (Alternative):** For a different visual, render a stacked area chart where each status is a colored area stacked on top of each other. This shows how the "composition" of attendance changes over time. It's particularly effective for showing growing/shrinking absence patterns.

* **Bar Chart — Average Effective Hours:** A second chart below the trend chart. Simple vertical bars showing `avg_effective_hours` for each working day. Draw a horizontal dashed reference line at 8.0 hours. Days where the average fell below the reference are colored red. This chart answers: "How productively is our org working?"

* **KPI Summary Row:** Above the charts, show `overall_summary` as 4 KPI cards:
  - **Avg Attendance**: "89.2%" with a trend arrow
  - **Avg Hours/Day**: "7.9h"
  - **Total Late Incidents**: "45 this month"
  - **Total Overtime**: "67.5 hours"

* **Month Navigation / Range Picker:** Allow switching between months or selecting custom ranges. Include "This Month", "Last Month", "Last Quarter" presets.

---

### API 7.17: `GET /api/v1/attendance/hr/dashboard/department-summary`

**What This API Does:**
This API aggregates attendance data **by department**. It joins `AttendanceRecords` with `EmployeeProfile` to group employees by their `department` field, then counts each status category per department. The response is an array of department objects, each containing: `department` name, `total_employees`, `present`, `absent`, `late`, `half_day`, `on_leave`, and a computed `attendance_percentage`. This can be queried for a single date or aggregated across an entire month.

**Why This API Exists:**
Organizations with multiple departments (Engineering, Marketing, Sales, Operations, etc.) need to compare attendance across departments. Common scenarios: "The Engineering team has 95% attendance this month but Operations is at 72% — we need to investigate." The existing endpoints provide no department-level aggregation. HR has to export all records to Excel, add a VLOOKUP for department, then build a pivot table — a manual, error-prone process that takes 30+ minutes. This API does it in 200ms. Department comparison is one of the most requested features in HR analytics tools, and it's essential for organizations with departmental budget allocation tied to attendance.

**Query Params:**
- `?date=YYYY-MM-DD` — Single date mode (default: today)
- `?month=MM&year=YYYY` — Monthly mode (overrides `date`)

**How Frontend Can Style & Use This Data:**

This is the **department analytics section** of the HR dashboard.

* **Horizontal Bar Chart (Hero):** Render a horizontal bar chart where each bar represents a department. Bar length = `attendance_percentage`. Sort departments by attendance percentage ascending (worst at top, best at bottom). Color bars on a gradient: red (< 70%) → amber (70-85%) → green (> 85%). This instantly highlights underperforming departments. Include the percentage number at the end of each bar.

* **Department Comparison Table:** Below the chart, render a detailed table with columns: Department, Total Employees, Present, Absent, Late, On Leave, Attendance %. Sort by attendance % ascending. Rows with attendance % below a threshold (e.g., 75%) should have a red background tint with a ⚠️ warning icon.

* **Pie / Donut Chart (Alternative):** If HR prefers a composition view, render a donut chart where each segment represents a department's share of total employees. Color segments by attendance performance. Center text: "X departments".

* **Click-Through:** Clicking a department row/bar should navigate to the employee attendance list (API 7.9) pre-filtered by that department: `GET /employees/attendance?department=Engineering`.

---

### API 7.18: `GET /api/v1/attendance/hr/dashboard/top-defaulters` *(NEW — Suggested Addition)*

**What This API Does:**
This API identifies and returns the employees with the **worst attendance patterns** in the organization for a given month. It computes two rankings: **Most Absent** (employees ranked by total absent days descending) and **Most Late** (employees ranked by total late days or total late minutes descending). Each entry includes the employee's profile info and their relevant metric. The list is capped (configurable via `limit`, default 10).

**Why This API Exists (Suggestion Rationale):**
Every HR dashboard in production-grade HRMS tools (Darwinbox, GreytHR, Keka, BambooHR) features a "top defaulters" or "chronic absentees" widget. HR can't scroll through 200+ employees to find the 5 people who need attention. This API surfaces the actionable outliers automatically. It transforms the dashboard from "here's data, figure it out" to "here are the people you need to talk to today." This is the bridge between data analytics and managerial action. Without it, HR has to export the monthly report, sort by absent days in Excel, and manually pick the top offenders — a daily ritual that this single API eliminates.

**Query Params:**
- `?month=MM&year=YYYY` — Target month (default: current month)
- `?limit=10` — How many top defaulters per category (default: 10, max: 25)

**How Frontend Can Style & Use This Data:**

This is a **"Needs Attention" widget** on the HR dashboard — placed prominently, usually as a sidebar panel or a dedicated card below the charts.

* **Two-Tab Card Layout:** Render a card with two tabs: "🚫 Most Absent" and "⏰ Most Late". Default to "Most Absent". Each tab shows a ranked list.

* **Ranked List Items:** Each item shows:
  - Rank number (1, 2, 3... with gold/silver/bronze highlighting for top 3)
  - Avatar + Employee Name + Department
  - Key metric on the right: "5 absent days" or "87 late minutes (6 days)"
  - A right arrow icon to navigate to the employee's detail page (API 7.10)
  
  Top 3 entries should have slightly larger typography or a subtle highlight to draw HR's eye immediately.

* **No Data State:** If everyone has perfect attendance (no absences or late arrivals), show a celebratory message: "🎉 No defaulters this month! Everyone has strong attendance." This positive reinforcement matters for HR morale too.

* **Color Coding:** Absent days ≥ 3 → Red text. Late days ≥ 5 → Amber text. This ensures the severity is immediately visible.

---

### API 7.19: `GET /api/v1/attendance/hr/dashboard/work-mode-distribution` *(NEW — Suggested Addition)*

**What This API Does:**
This API returns a breakdown of `work_mode` values across the organization for a given date or month. It counts how many employees worked from "office", "remote" (WFH), "hybrid", "field", or have no work mode recorded (`null`). The response includes both raw counts and percentages.

**Why This API Exists (Suggestion Rationale):**
Post-2020, work mode tracking has become a core HR function. Organizations with hybrid policies need to monitor compliance: "Our policy says 3 days in office per week, but are employees actually following it?" or "How many people are working remotely today vs. in office?". The `work_mode` field already exists in `AttendanceRecords` (captured during clock-in), but no endpoint exposes aggregated data from it. This API unlocks a new category of insight that's invisible today. It's particularly valuable for facilities teams (planning office space), compliance teams (hybrid policy enforcement), and leadership (understanding the actual working pattern of the organization).

**Query Params:**
- `?date=YYYY-MM-DD` — Single date mode (default: today)
- `?month=MM&year=YYYY` — Monthly mode (shows average distribution over the month)

**How Frontend Can Style & Use This Data:**

* **Donut Chart:** Render a donut chart where each segment represents a work mode. Suggested colors:
  - Office: Blue (#3B82F6)
  - Remote/WFH: Green (#22C55E)
  - Hybrid: Purple (#8B5CF6)
  - Field: Amber (#F59E0B)
  - Not Specified: Gray (#9CA3AF)
  
  Center text: Total employees who clocked in.

* **Legend with Counts:** Below the donut, show a legend with both count and percentage for each mode: "🏢 Office: 98 (62.4%)" | "🏠 Remote: 42 (26.8%)" | ...

* **Monthly Trend (If month mode):** In month mode, show a small stacked bar chart with one bar per day showing work mode distribution over time. This reveals patterns like "Remote work increases on Fridays."

---

## 8. Security Architecture

### 8.1 Multi-Layer Data Isolation

Phase 7 enforces **three independent layers of data protection**:

```
Layer 1: Route-Level Authorization
└─ Middleware checks: authenticate → authorize(allowedRoles) → requireFeature
   Employee routes: ALL roles → but service only returns self data
   Manager routes: manager, hr, admin, super-admin
   HR routes: hr, admin, super-admin

Layer 2: Organization Isolation (Anti Cross-Org)
└─ Every repository query MUST include WHERE org_id = req.user.orgId
   This is enforced in the repository layer, NOT optional
   Even if a user somehow sends another org's userId, org_id mismatch returns 0 rows

Layer 3: Hierarchical Data Scoping (Anti Cross-Level)
└─ Employee: user_id = req.user.id (hardcoded, not from request body/params)
   Manager: user_id IN (getAccessibleUserIds result)
   HR: org_id = req.user.orgId (full org access, but still org-bounded)
```

### 8.2 Specific Security Rules

| Rule | Enforcement Point | Description |
|------|-------------------|-------------|
| **No cross-org data leakage** | Repository layer | Every query includes `org_id` from `req.user.orgId`, never from request params |
| **Employee can't see others** | Service layer | `user_id` is always `req.user.id`, never from request body |
| **Manager can't see upward** | `AttendanceAccessControl` | Manager's team excludes users with `hr`/`admin`/`super-admin` roles |
| **Manager can't see laterally** | `EmployeeProfile.manager_id` | Only direct reports are included, not peers or other managers' teams |
| **HR can't cross orgs** | Repository layer | `org_id` filtering on all queries |
| **Parameter tampering blocked** | Service/Controller | `userId` from route params is validated against the authorized user list before any DB query |
| **Pagination limits enforced** | Validator layer | `limit` is capped (e.g., `Math.min(limit, 100)`) to prevent data exfiltration |

### 8.3 Validation Rules for New Endpoints

```javascript
// Every manager "member" endpoint MUST validate before querying:
const allowedUserIds = await accessControl.getAccessibleUserIds(orgId, requesterUser)
if (allowedUserIds !== null && !allowedUserIds.includes(targetUserId)) {
  throw new AppError(403, 'Access denied to this employee', 'EMPLOYEE_NOT_IN_TEAM')
}

// Every HR "individual" endpoint MUST validate org membership:
const userOrgCheck = await EmployeeProfile.findOne({
  where: { user_id: targetUserId, org_id: orgId }
})
if (!userOrgCheck) {
  throw new AppError(404, 'Employee not found in this organization', 'EMPLOYEE_NOT_FOUND')
}
```

---

## 9. Implementation Plan

### 9.1 New Files to Create

| Layer | File | Purpose |
|-------|------|---------|
| **Service** | `attendance_read.service.js` | All read-only business logic for employee, manager, and HR data retrieval |
| **Controller** | `user_attendance_read.controller.js` | Employee read endpoints (daily-log, graph-data, trends, weekly-calendar) |
| **Controller** | `manager_attendance_read.controller.js` | Manager team read endpoints (summary, member history, member summary, graph) |
| **Controller** | `hr_attendance_read.controller.js` | HR read endpoints (employee/manager lists, dashboard, analytics, top-defaulters, work-mode) |
| **Validator** | `user_attendance_read.validator.js` | Joi schemas for employee read query params |
| **Validator** | `manager_attendance_read.validator.js` | Joi schemas for manager read query params |
| **Validator** | `hr_attendance_read.validator.js` | Joi schemas for HR read query params |
| **Route** | `user_attendance_read.routes.js` | Employee read route definitions |
| **Route** | `manager_attendance_read.routes.js` | Manager read route definitions |
| **Route** | `hr_attendance_read.routes.js` | HR read route definitions |

### 9.2 Existing Files to Modify

| File | Change |
|------|--------|
| `attendance_records.repository.js` | Add new query methods for graph data, department-wise aggregates, paginated team queries, top-defaulters, work-mode distribution |
| `attendance_access.utils.js` | Add `validateUserInTeam()`, `validateUserInOrg()`, and `validateManagerRole()` helper methods |
| `attendance.index.js` | Mount new read route files |

### 9.3 Complete API Count Summary

| Actor | API Count | API IDs |
|-------|-----------|---------|
| **Employee** | 4 | 7.1, 7.2, 7.3, 7.4 |
| **Manager** | 4 | 7.5, 7.6, 7.7, 7.8 |
| **HR — Employee Data** | 3 | 7.9, 7.10, 7.11 |
| **HR — Manager Data** | 3 | 7.12, 7.13, 7.14 |
| **HR — Dashboard** | 5 | 7.15, 7.16, 7.17, 7.18, 7.19 |
| **Total** | **19** | |

### 9.4 Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Org-wide queries on 1000+ employees | Use `COUNT` and `SUM` SQL aggregations in the repository instead of JS-level loops |
| Graph data for 30 days × 500 users | Pre-aggregate at the DB level using `GROUP BY date`, return only counts not raw records |
| Live dashboard hit on every page load | Consider Redis caching with 60-second TTL for `findLiveDashboardCounts` |
| N+1 query risk on profile joins | Use Sequelize `include` with selective `attributes` to limit columns |
| Pagination stability | Use keyset pagination or consistent `ORDER BY date DESC, id DESC` |
| Top defaulters sorting | Use SQL `ORDER BY absent_count DESC LIMIT N` — never sort in JS |

---

## 🚨 Standard Error Codes for Phase 7

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `403` | `EMPLOYEE_NOT_IN_TEAM` | Manager trying to access a user not in their team | Toast: "You don't have permission to view this employee" |
| `403` | `FORBIDDEN` | Employee trying to access manager/HR endpoints | Redirect to own dashboard |
| `404` | `EMPLOYEE_NOT_FOUND` | HR trying to access a user not in their org | Toast: "Employee not found" |
| `404` | `MANAGER_NOT_FOUND` | HR trying to access a non-manager user via manager endpoints | Toast: "Manager not found" |
| `400` | `INVALID_DATE_RANGE` | `from` is after `to`, or range exceeds 366 days | Highlight date pickers |
| `400` | `INVALID_MONTH` | Month is not 1-12 or year is unreasonable | Highlight month/year selectors |
| `429` | `RATE_LIMIT_EXCEEDED` | Too many requests to analytics endpoints | Toast: "Please wait before refreshing" |

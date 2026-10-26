# Employee and Manager Attendance Calculation: Authoritative Source of Truth

**Classification**: Core Architecture Specification  
**Status**: APPROVED & ACTIVE  
**Last Updated**: 2026-10-04  
**Applies To**: Employee Self-Service Panel, Manager Team Panel, HR Roster & Payroll Reconciliation  

---

## 1. Executive Summary & Purpose

This document serves as the absolute, non-negotiable **Source of Truth** for how attendance is calculated, classified, synthesized, and aggregated for **Individual Employees** and **Manager Teams** across the HRMS backend.

Historically, discrepancies arose because different endpoints applied different calculation methodologies:
- `GET /attendance/user/summary` counted only physical records in the database, ignoring holidays, weekly-offs, and derived absences.
- `GET /attendance/user/graph-data` synthesized missing calendar days using virtual status resolution.
- `GET /attendance/manager/team/member/:userId/summary` used the dense graph-data calculation, creating a direct discrepancy between what a manager saw for an employee and what the employee saw for themselves.
- `GET /attendance/user/history` returned sparse physical records, while `GET /attendance/manager/team/member/:userId/history` returned a dense, day-by-day calendar grid.

This document establishes the **unified mathematical model**, precedence rules, and invariants that bind all Employee and Manager endpoints to a single, identical calculation engine.

---

## 2. Core Axiom: Action Trumps Schedule

In all attendance evaluations across both Employee and Manager scopes:
> **A physical record in `attendance_records` represents reality (an employee's actual action) and ALWAYS overrides any calendar schedule, holiday, or weekly-off.**

### Axiom Truth Rules:
1. **Weekend Duty**: If an employee clocks in or has an approved regularization on a scheduled weekly off (e.g., Saturday), they are **PRESENT** (or `half_day` / `in_progress`), **NOT** on weekly off.
2. **Holiday Work**: If an employee clocks in on an org-wide public holiday (e.g., Gandhi Jayanti), they are **PRESENT**, **NOT** on holiday.
3. **Approved Leave**: If an employee has an approved leave request (`status: on_leave`), this is persisted as a physical record and takes precedence over calendar weekly-offs.
4. **Schedule Fallback**: Calendar schedules (holidays, weekly-offs) are evaluated **ONLY** when no physical record exists for that date.

---

## 3. Individual Employee Single-Day Resolution Precedence (6-Step Hierarchy)

When evaluating any calendar date $D$ for an employee $U$:

```
                             [Date D for Employee U]
                                        │
                         Does a physical record exist?
                                ├── YES ──► [Step 1: Use Record Status]
                                │           (present, half_day, in_progress, on_leave, absent)
                                └── NO
                                        │
                          Is D before joining date?
                                ├── YES ──► [Step 2: NOT_MARKED (before_joining)]
                                └── NO
                                        │
                        Is there an approved exception?
                                ├── YES (non_working) ──► [Step 3: HOLIDAY (exception)]
                                ├── YES (working)     ──► [Skip to Step 6]
                                └── NO
                                        │
                           Is D an active holiday?
                                ├── YES ──► [Step 4: HOLIDAY]
                                └── NO
                                        │
                         Is D a scheduled weekly off?
                                ├── YES ──► [Step 5: WEEKLY_OFF]
                                └── NO
                                        │
                                  Compare D to Today
                                ├── D < Today ──► [Step 6a: ABSENT (past unclocked)]
                                ├── D = Today ──► [Step 6b: NOT_MARKED (pending_clock_in)]
                                └── D > Today ──► [Step 6c: NOT_MARKED (upcoming)]
```

### Precedence Table

| Step | Condition | Resolved Status | Provenance Reason | Counts as Working Day? |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Record exists in `attendance_records` | `record.status` | `recordStatusMeta(record)` | Yes (if worked/absent) |
| **2** | `D < profile.joining_date` | `not_marked` | `before_joining` | No (ineligible) |
| **3** | Approved `non_working_day` exception | `holiday` | `exception_non_working` | No |
| **4** | Matches active `attendance_holidays` | `holiday` | `holiday` | No |
| **5** | Matches active `weekly_off_rules` | `weekly_off` | `weekly_off` | No |
| **6a**| Unclocked past working day (`D < Today`) | `absent` | `awaiting_absent_cron` | Yes |
| **6b**| Unclocked today (`D === Today`) | `not_marked` | `pending_clock_in` | Yes |
| **6c**| Unclocked future day (`D > Today`) | `not_marked` | `upcoming` | Yes |

---

## 4. Single-Employee Monthly Aggregates & Invariants

When evaluating an employee's monthly summary over $N$ calendar days in a month:

### 4.1 The Fundamental Headcount-Days Invariant

Every day in the month belongs to **exactly one mutually exclusive category**:

$$\text{DaysInMonth} \equiv D_{present} + D_{half\_day} + D_{absent} + D_{on\_leave} + D_{weekly\_off} + D_{holiday} + D_{pre\_joining} + D_{upcoming}$$

### 4.2 The 3 Canonical Charting Bars for Employee

To achieve 100% parity with Manager and HR dashboards:

| Bar Name | Formula Components | Description |
| :--- | :--- | :--- |
| `final_present_days` | $D_{present} + D_{half\_day} + D_{in\_progress}$ | Days the employee actually worked |
| `final_absent_days` | $D_{absent}$ | Days the employee was expected to work but did not |
| `final_leave_days` | $D_{on\_leave} + D_{weekly\_off} + D_{holiday}$ | Days the employee was not expected to work |

### 4.3 Working Days & Percentage Calculations

1. **Eligible Days**:
   $$\text{EligibleDays} = \text{DaysInMonth} - D_{pre\_joining} - D_{upcoming}$$
2. **Total Expected Working Days**:
   $$\text{ExpectedWorkingDays} = \max(0, \text{EligibleDays} - \text{final\_leave\_days})$$
3. **Attendance Percentage**:
   $$\text{AttendancePercentage} = \begin{cases} \text{round}\left(\frac{\text{final\_present\_days}}{\text{ExpectedWorkingDays}} \times 100, 2\right) & \text{if ExpectedWorkingDays} > 0 \\ 100\% & \text{if ExpectedWorkingDays} = 0 \end{cases}$$
4. **Punctuality Percentage**:
   $$\text{WorkedDays} = D_{present} + D_{half\_day}$$
   $$\text{PunctualityPercentage} = \begin{cases} \text{round}\left(\frac{\text{WorkedDays} - D_{late}}{\text{WorkedDays}} \times 100, 2\right) & \text{if WorkedDays} > 0 \\ 100\% & \text{if WorkedDays} = 0 \end{cases}$$
5. **Average Effective Hours**:
   $$\text{AverageHoursPerDay} = \begin{cases} \text{round}\left(\frac{\sum \text{effective\_hours}}{\text{WorkedDays}}, 2\right) & \text{if WorkedDays} > 0 \\ 0 & \text{if WorkedDays} = 0 \end{cases}$$

---

## 5. Manager Team Aggregates & Parity Rules

When a Manager views their team summary (`GET /attendance/manager/team/summary` or `GET /attendance/manager/team/graph-data`):

### 5.1 Team Headcount Invariant

For team size $M$ on any date $D$:

$$M \equiv \text{final\_present\_count} + \text{final\_absent\_count} + \text{final\_leave\_count}$$

Where:
- $\text{final\_present\_count} = \sum (\text{present} + \text{half\_day} + \text{in\_progress})$
- $\text{final\_absent\_count} = \sum (\text{absent} + \text{unclocked past working days})$
- $\text{final\_leave\_count} = \sum (\text{on\_leave} + \text{weekly\_off} + \text{holiday})$

### 5.2 Parity Law: Single Employee vs Manager View

For any employee $U$ on month $M$ and year $Y$:
$$\text{GET /attendance/user/summary}(U, M, Y) \equiv \text{GET /attendance/manager/team/member/}U\text{/summary}(M, Y)$$

Every metric (`present_days`, `absent_days`, `half_days`, `late_days`, `holiday_days`, `weekly_off_days`, `on_leave_days`, `average_hours_per_day`, `punctuality_percentage`) **MUST BE IDENTICAL** across both endpoints.

---

## 6. Dense Calendar History Contract

### 6.1 The Problem with Sparse History
Previously, `GET /attendance/user/history` executed a simple SQL `SELECT` on `attendance_records`. Days with no row in the database were completely missing. This broke frontend calendar rendering, as the frontend could not distinguish between:
- A day the employee was absent
- A scheduled weekly-off
- A public holiday
- A day prior to joining

### 6.2 The Dense Calendar Standard
Both `GET /attendance/user/history` and `GET /attendance/manager/team/member/:userId/history` must follow the **Dense Calendar Pattern** via `buildDenseHistoryPage`:
1. Every calendar day in the requested date range $[D_{from}, D_{to}]$ is represented by a row.
2. If a physical row exists in `attendance_records`, its metrics (`clock_in_time`, `clock_out_time`, `effective_hours`, `late_minutes`, `status`) are populated.
3. If no physical row exists, the date is synthesized using the 6-Step Resolution Precedence, populating `status` (`weekly_off`, `holiday`, `absent`, or `not_marked`) and provenance metadata (`status_source: 'derived'`, `status_reason`, `is_provisional`).
4. Metric fields (`clock_in_time`, `effective_hours`) are `null` for synthesized non-working days.

---

## 7. Endpoint Parity Matrix (Employee & Manager)

| Category | Endpoint | Service Handler | Calculation Model | Dense Grid? |
| :--- | :--- | :--- | :--- | :---: |
| **User Today** | `GET /attendance/user/today` | `clockService.getToday` | Real-time punch + overnight shift resolution + joining date boundary | N/A (1 Day) |
| **User Daily Log** | `GET /attendance/user/daily-log` | `userAttendanceReadService.getDailyLog` | Record details + sessions + breaks + anomalies + derived status | N/A (1 Day) |
| **User Summary** | `GET /attendance/user/summary` | `clockService.getSummary` $\to$ **Unified Engine** | Dense month evaluation (real + synthesized holidays/weekends/absences) | Aggregated |
| **User Graph Data**| `GET /attendance/user/graph-data` | `userAttendanceReadService.getGraphData` | Dense 31-day evaluation + daily list + summary | Yes (All Days) |
| **User History** | `GET /attendance/user/history` | `clockService.getHistory` $\to$ `buildDenseHistoryPage` | Dense calendar pagination (real + synthesized) | Yes (All Days) |
| **User Trends** | `GET /attendance/user/trends` | `userAttendanceReadService.getTrends` | N-month trends + 100-day backwards streak walking | Aggregated |
| **User Calendar** | `GET /attendance/user/weekly-calendar` | `userAttendanceReadService.getWeeklyCalendar` | 7-day ISO week dense grid (Monday to Sunday) | Yes (7 Days) |
| **Mgr Team Today** | `GET /attendance/manager/team/today` | `teamService.getTeamToday` | Real-time team roster + punch records + derived unclocked | N/A (1 Day) |
| **Mgr Team Summary**| `GET /attendance/manager/team/summary`| `managerAttendanceReadService.getTeamSummary` | Per-member resolved status + headcount conservation | Aggregated |
| **Mgr Team Graph** | `GET /attendance/manager/team/graph-data` | `managerAttendanceReadService.getTeamGraphData` | `evaluatePeriodAttendance` batch evaluator | Yes (All Days) |
| **Mgr Member Summary**| `GET /attendance/manager/team/member/:id/summary` | `managerAttendanceReadService.getMemberSummary` | Mirrors User Summary via unified engine | Aggregated |
| **Mgr Member History**| `GET /attendance/manager/team/member/:id/history` | `managerAttendanceReadService.getMemberHistory` | Dense calendar pagination via `buildDenseHistoryPage` | Yes (All Days) |
| **Mgr Member Daily Log**| `GET /attendance/manager/team/member/:id/daily-log` | `managerAttendanceReadService.getMemberDailyLog` | Mirrors HR Member Daily Log | N/A (1 Day) |

---

## 8. Provenance & Metadata Standard

Every synthesized status returned to the frontend must carry the standard provenance siblings so the UI knows why the record is displayed:

```json
{
  "status": "weekly_off",
  "status_source": "derived",
  "status_reason": "weekly_off",
  "is_provisional": false
}
```

### Possible Reasons:
- `before_joining`: Date is before employee's official start date.
- `holiday`: Date matched an active holiday rule.
- `weekly_off`: Date matched the employee's weekly off rule.
- `exception_non_working`: Overridden by a calendar exception.
- `awaiting_absent_cron`: Past working day unclocked, treated as absent.
- `pending_clock_in`: Today, working hours have not concluded yet.
- `upcoming`: Future calendar date.

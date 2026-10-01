# Attendance API Guide for Frontend Developers

This document explains the recent updates to the Attendance APIs, specifically regarding time calculation, breaks, and overtime formatting.

## The Core Issue
Previously, the frontend was attempting to calculate the total time worked by subtracting `clock_in_time` from `clock_out_time`. This approach is **incorrect** because it fails to account for unpaid breaks. Consequently, the frontend UI was displaying confusing numbers that did not match the strict policy constraints managed by the backend (such as a 7-hour full day minimum).

## The Solution
To fix this, we have standardized the response payload for **ALL** attendance and overtime endpoints across the User, Manager, and HR namespaces. The backend is now the absolute single source of truth for all time arithmetic.

### Key Concepts

1. **Total Hours (`total_hours`)**
   This is the raw time elapsed between clock in and clock out, represented as a decimal.

2. **Breaks (`break_duration_minutes`)**
   The sum of all breaks taken during the shift.

3. **Effective Hours (`effective_hours`)**
   This is the true working time, calculated by the backend as:
   `effective_hours = total_hours - (break_duration_minutes / 60)`

4. **Overtime Minutes (`overtime_minutes`)**
   Overtime is strictly calculated by comparing `effective_hours` to the `full_day_min_hours` threshold set in the organization's policy. **Overtime is completely independent of shift duration.** 

### 🚨 Action Required: The New `worked_duration_formatted` Field 🚨
We have injected a new string field into every response: `worked_duration_formatted`. 

**The frontend should stop doing any math** for "Worked Time" on the UI. Simply render this exact string anywhere you need to show the duration a person worked. It already correctly handles breaks and matches the backend's policy state.

Example value: `"8h 32m"`

---

## Response Structure Examples

### 1. Daily Logs & History API
Endpoints like `/attendance/user/history`, `/attendance/manager/team/today`, and `/attendance/hr/history` now output:

```json
{
  "date": "2023-10-25",
  "status": "present",
  "clock_in_time": "2023-10-25T04:26:00.000Z",
  "clock_out_time": "2023-10-25T13:58:00.000Z",
  "effective_hours": 8.53,
  "worked_duration_formatted": "8h 32m",
  "break_duration_minutes": 60,
  "late_minutes": 0,
  "early_exit_minutes": 0,
  "overtime_minutes": 92,
  "work_mode": "office",
  "is_regularized": false
}
```

### 2. Overtime & Pending Approval APIs
Endpoints like `/attendance/manager/pending-overtime` and `/attendance/user/overtime/mine` now map the internal record and expose the exact formatted duration:

```json
{
  "id": "uuid-1234",
  "status": "pending",
  "date": "2023-10-25",
  "overtime_minutes": 92,
  "worked_duration_formatted": "8h 32m",
  "record": {
    "effective_hours": 8.53,
    "break_duration_minutes": 60,
    "total_hours": 9.53
  }
}
```

### 3. Summary APIs
The monthly summary payload `/attendance/user/summary` now includes `total_worked_duration_formatted` at the summary level:

```json
{
  "summary": {
    "present_days": 21,
    "absent_days": 1,
    "total_hours_worked": 175.5,
    "total_worked_duration_formatted": "175h 30m",
    "total_overtime_minutes": 450,
    "total_break_minutes": 1260
  }
}
```

> [!CAUTION]
> Do not attempt to derive `worked_duration_formatted` from `overtime_minutes` + `shift_duration`. The backend calculates overtime dynamically based on HR's lenient policy thresholds (which might be less than the actual shift duration). Always consume `worked_duration_formatted` directly from the API.

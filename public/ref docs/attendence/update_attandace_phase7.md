# Phase 7 Attendance Module Updates

This document outlines the recent updates applied to the Phase 7 Attendance Dashboard APIs. These updates were implemented to simplify frontend integration and provide a unified, highly accurate metric for total "Present" and total "Absent" headcounts, avoiding the need for the frontend to perform complex, error-prone client-side calculations.

## What Was Updated?

Two new derived fields were added to all dashboard and summary endpoints:
1. `final_present_count`: Sum of `present`, `half_day`, and `in_progress`.
2. `final_absent_count`: Sum of `absent` and missing punches (`not_marked`). 

## Why Was It Updated?

Previously, the frontend had to manually sum `present + half_day + in_progress` to determine the total productive workforce for the day, and do similar math to deduce how many people were truly absent (especially for the current day where crons haven't fired yet). 
By moving this to the backend, we guarantee:
- **Accuracy**: The backend correctly accounts for active holidays, weekly offs, and leaves when determining missing punches.
- **Consistency**: The logic matches exactly across HR live dashboards, Manager team summaries, graph views, and department-wise aggregates.

---

## 1. Manager Team Summary (API 7.5)

**Endpoint:** `GET /api/v1/attendance/manager/team/summary`

**Explanation:** Provides a live snapshot of the manager's team for today (or a specific date). 
- `final_present_count` natively includes `in_progress` employees.
- `final_absent_count` accurately flags anyone who hasn't punched in yet today.

**Expected Request:**
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:** `?date=YYYY-MM-DD` (Optional)

**Updated Response Example:**
```json
{
  "success": true,
  "message": "Team summary fetched successfully",
  "data": {
    "date": "2026-08-11",
    "team_size": 10,
    "counts": {
      "present": 7,
      "absent": 1,
      "half_day": 0,
      "late": 2,
      "on_leave": 1,
      "not_marked": 0,
      "holiday": 0,
      "weekly_off": 0,
      "in_progress": 1
    },
    "attendance_percentage": 88.89,
    "final_present_count": 8,
    "final_absent_count": 1,
    "members": [
      {
        "user_id": "uuid-001",
        "name": "Jane Doe",
        "employee_code": "EMP-001",
        "department": "Engineering",
        "status": "in_progress",
        "clock_in_time": "2026-08-11T09:05:00.000Z",
        "clock_out_time": null
      }
    ]
  }
}
```

---

## 2. Manager Team Graph Data (API 7.8)

**Endpoint:** `GET /api/v1/attendance/manager/team/graph-data`

**Explanation:** Returns the historical attendance data for a given month.
- `final_present_count` natively includes `in_progress` employees.
- `final_absent_count` relies on the database's `absent_count` for past days, and dynamically calculates missing punches for the current day.

**Expected Request:**
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:** `?month=08&year=2026`

**Updated Response Example:**
```json
{
  "success": true,
  "message": "Team graph data fetched successfully",
  "data": {
    "month": 8,
    "year": 2026,
    "team_summary": {
      "avg_attendance_percentage": 85.0,
      "total_late_incidents": 5,
      "total_overtime_hours": 12.5,
      "avg_effective_hours_per_day": 8.2
    },
    "daily": [
      {
        "date": "2026-08-11",
        "day_of_week": "Tuesday",
        "counts": {
          "present_count": 8,
          "absent_count": 1,
          "late_count": 2,
          "half_day_count": 0,
          "in_progress_count": 1,
          "on_leave_count": 1
        },
        "avg_effective_hours": 8.1,
        "total_overtime_minutes": 45,
        "final_present_count": 9,
        "final_absent_count": 1
      }
    ]
  }
}
```

---

## 3. HR Live Dashboard (API 7.15)

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/live`

**Explanation:** Provides the complete org-wide live attendance snapshot. 
- `final_present_count` is identical in logic to the Manager equivalent but scoped globally.
- `final_absent_count` includes both `counts.absent` and `counts.not_marked`.

**Expected Request:**
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:** `?date=YYYY-MM-DD` (Optional)

**Updated Response Example:**
```json
{
  "success": true,
  "message": "Dashboard live stats fetched successfully",
  "data": {
    "date": "2026-08-11",
    "total_employees": 200,
    "counts": {
      "present": 140,
      "absent": 23,
      "half_day": 5,
      "late": 12,
      "on_leave": 10,
      "not_marked": 15,
      "holiday": 0,
      "weekly_off": 0,
      "in_progress": 7
    },
    "attendance_percentage": 80.00,
    "on_time_percentage": 91.44,
    "final_present_count": 152,
    "final_absent_count": 38
  }
}
```

---

## 4. HR Dashboard Graph Data (API 7.16)

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/graph-data`

**Explanation:** Returns org-wide historical data for the trend charts.
- Identical logic to API 7.8, but scoped to the entire organization.

**Expected Request:**
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:** `?month=08&year=2026` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`

**Updated Response Example:**
```json
{
  "success": true,
  "message": "Dashboard graph data fetched successfully",
  "data": {
    "overall_summary": {
      "avg_attendance_percentage": 89.2,
      "avg_hours_per_day": 7.9,
      "total_late_incidents": 45,
      "total_overtime_hours": 67.5
    },
    "daily": [
      {
        "date": "2026-08-11",
        "is_working_day": true,
        "present_count": 145,
        "absent_count": 20,
        "late_count": 15,
        "half_day_count": 5,
        "in_progress_count": 8,
        "on_leave_count": 12,
        "weekly_off_count": 0,
        "holiday_count": 0,
        "avg_effective_hours": 8.1,
        "total_overtime_minutes": 180,
        "attendance_percentage": 84.04,
        "final_present_count": 158,
        "final_absent_count": 30
      }
    ]
  }
}
```

---

## 5. HR Department Summary (API 7.17)

**Endpoint:** `GET /api/v1/attendance/hr/dashboard/department-summary`

**Explanation:** Aggregates attendance statistics by department for a date or date range.
- Effectively merges "present", "half-day", and "in-progress" records per department.
- Calculates missing punches across the entire date range and factors them into the `final_absent_count`.

**Expected Request:**
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:** `?date=YYYY-MM-DD` or `?month=08&year=2026`

**Updated Response Example:**
```json
{
  "success": true,
  "message": "Department summary fetched successfully",
  "data": [
    {
      "department": "Engineering",
      "total_employees": 45,
      "present": 38,
      "absent": 2,
      "late": 4,
      "half_day": 1,
      "in_progress": 0,
      "on_leave": 4,
      "attendance_percentage": 95.12,
      "final_present_count": 39,
      "final_absent_count": 2
    },
    {
      "department": "Sales",
      "total_employees": 20,
      "present": 15,
      "absent": 4,
      "late": 2,
      "half_day": 0,
      "in_progress": 0,
      "on_leave": 1,
      "attendance_percentage": 78.95,
      "final_present_count": 15,
      "final_absent_count": 4
    }
  ]
}
```

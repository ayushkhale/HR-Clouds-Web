# Daily Attendance Roster Synthesis & Unclocked Status Fix

**Date:** 2026-10-03  
**Module:** Attendance (`/api/v1/attendance/hr/*`)  
**Affected Endpoints:**
- `GET /api/v1/attendance/hr/hrs/attendance`
- `GET /api/v1/attendance/hr/employees/attendance`
- `GET /api/v1/attendance/hr/managers/attendance`

---

## 1. Problem Description

When querying single-date attendance for dates where employees or HRs did not clock in (such as **October 2nd Gandhi Jayanti**, weekend weekly-offs, or past days where staff members were absent), the endpoints returned an empty list:
```json
{
  "success": true,
  "message": "HR staff attendance list fetched successfully",
  "data": {
    "pagination": { "total": 0, "page": 1, "limit": 20, "total_pages": 0 },
    "records": []
  }
}
```
Frontend UI showed an empty table ("No records found") instead of showing the company's staff members with their proper daily status (e.g. `status: "holiday"`, `status: "weekly_off"`, or `status: "absent"`).

---

## 2. Root Cause Analysis

1. In `src/modules/attendance/services/hr_attendance_read.service.js`, the routing helper `_isRosterRead(filters)` previously included:
   ```javascript
   return dayjs(filters.date).format('YYYY-MM-DD') >= dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD')
   ```
   This forced any date before today (`date < today`) to evaluate to `isRosterMode = false`.
2. When `isRosterMode === false`, requests were routed to `_getAttendanceListViaRecords`, which queries **only physical rows in the `attendance_records` table**.
3. Because no employees or HR clocked in on public holidays (or unclocked days), zero rows existed in `attendance_records`.
4. The dynamic synthesis path `_getAttendanceListViaUsers` (which checks holidays via `clockService._isHoliday`, weekly-offs, and absent days) was completely bypassed for all past single dates.

---

## 3. Changes Made

1. **Roster Mode Route Decision (`_isRosterRead`)**:
   - Single-date attendance queries (`!filters.from && !filters.to`) now always route to the roster synthesis path (`_getAttendanceListViaUsers`), whether the date is today, past, or future.
   - Only date range requests (`from` and `to`) or filters strictly querying physical punch statuses (`status=present,half_day`) route directly to the physical `attendance_records` table.
   - Status filters containing synthetic statuses (`not_marked`, `absent`, `holiday`, `weekly_off`) or omitted status filters route to `_getAttendanceListViaUsers`.

2. **Clean Left-Join without False Absents**:
   - In `_getAttendanceListViaUsers`, removed pre-filtering on `recordWhere.status` during the left join on `AttendanceRecords`. The user's actual attendance record is joined first, and status filtering is applied in memory against the resolved status (`finalStatus`), preventing employees who were present from being falsely synthesized as absent when filtering by `status=absent`.

---

## 4. Expected Responses After Fix

### Example A: Single Date on a Public Holiday (`2026-10-02` Gandhi Jayanti)
`GET /api/v1/attendance/hr/hrs/attendance?date=2026-10-02`
```json
{
  "success": true,
  "message": "HR staff attendance list fetched successfully",
  "data": {
    "pagination": { "total": 1, "page": 1, "limit": 20, "total_pages": 1 },
    "records": [
      {
        "user_id": "71639be3-1a97-4408-8bac-5b8039336755",
        "name": "Abhishek HR",
        "role": "HR",
        "employee_code": "HR-A43457",
        "department": "HR Department",
        "designation": "HR Head",
        "avatar_url": null,
        "date": "2026-10-02",
        "status": "holiday",
        "clock_in_time": null,
        "clock_out_time": null,
        "effective_hours": null,
        "worked_duration_formatted": "0h 0m",
        "late_minutes": 0,
        "overtime_minutes": 0,
        "work_mode": null,
        "is_regularized": false
      }
    ]
  }
}
```

### Example B: Past Working Day with No Clock-in (`2026-10-01`)
`GET /api/v1/attendance/hr/employees/attendance?date=2026-10-01`
```json
{
  "success": true,
  "message": "Attendance list fetched successfully",
  "data": {
    "pagination": { "total": 5, "page": 1, "limit": 20, "total_pages": 1 },
    "records": [
      {
        "user_id": "...",
        "name": "Gopal Sharma",
        "role": "Employee",
        "date": "2026-10-01",
        "status": "absent",
        "clock_in_time": null,
        "clock_out_time": null,
        "effective_hours": null,
        "worked_duration_formatted": "0h 0m"
      }
    ]
  }
}
```

### Example C: Current Day Unclocked Staff (`2026-10-03`)
`GET /api/v1/attendance/hr/employees/attendance?date=2026-10-03`
```json
{
  "success": true,
  "message": "Attendance list fetched successfully",
  "data": {
    "pagination": { "total": 5, "page": 1, "limit": 20, "total_pages": 1 },
    "records": [
      {
        "user_id": "...",
        "name": "Gopal Sharma",
        "role": "Employee",
        "date": "2026-10-03",
        "status": "not_marked",
        "clock_in_time": null,
        "clock_out_time": null,
        "effective_hours": null,
        "worked_duration_formatted": "0h 0m"
      }
    ]
  }
}
```

---

## 5. Follow-up Corrections (2026-10-03)

Two defects introduced/exposed by §3's "all single dates route to the active-member roster path"
were fixed. They affect the same three endpoints.

### 5.1 Past single-date list dropped a deactivated member's real record

**Problem.** Routing every single-date read to the active-only roster meant a mid-period leaver
(membership deactivated) who had actually clocked in on a **past** date disappeared from the list,
even though their `attendance_records` row still exists. This contradicts the register HR
reconciles payroll against.

**Fix.** The single-date member set is now `active members ∪ now-inactive members who hold a REAL
record on that date`. A deactivated member is re-admitted **only** when carrying a real record, so
their earned punches stay visible while they are never synthesised into a phantom
`absent`/`not_marked` on a day they were no longer employed. For **today/future** the union
collapses to the active set (a deactivated member has no record), so behaviour is unchanged there.

**Frontend impact.** For past single-date queries, the list may now include rows for employees who
are no longer active, each carrying their real punch/status. `pagination.total` grows accordingly.

### 5.2 Status filter broke pagination on the roster path

**Problem.** A synthetic status filter (`absent`, `holiday`, `weekly_off`, `not_marked`) is resolved
in memory, but the query still paginated at the DB level. `pagination.total` reported the whole
roster rather than the match count, `total_pages` was wrong, and any match beyond the first page was
stranded on a page `total_pages` claimed did not exist (silent data loss).

**Fix.** When a status filter is present, the whole roster is resolved, filtered, then paginated in
memory, so `total`/`total_pages` reflect the matches and every match is reachable. Without a status
filter, DB-level pagination is unchanged.

**Frontend impact.** For single-date reads with a synthetic `status` filter, `pagination.total` and
`total_pages` now reflect the number of matching members (previously the full roster count). Paging
through such a filtered list now returns every match.

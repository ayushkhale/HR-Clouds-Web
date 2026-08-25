# Phase 6: Attendance Period Locking & Reports API Documentation

This document provides a detailed technical reference for the Phase 6 Attendance APIs, specifically for **Period Locking** and **Attendance Reports**. These endpoints allow HR and Administrators to lock down historical periods for payroll and extract aggregated analytical data.

---

## 🔒 Payroll Lock Period APIs

Locks are used to freeze attendance modifications (punches, regularizations, overtime, comp-offs) within a specific date range, ensuring data integrity during payroll runs.

### 1. Get All Lock Periods
Retrieves all historical and active lock periods for the organization.

- **URL:** `/api/v1/attendance/hr/locks`
- **Method:** `GET`
- **Auth:** `Bearer Token` (Requires HR/Admin role)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Locks fetched successfully",
  "data": [
    {
      "id": "uuid-123",
      "org_id": "org-uuid",
      "start_date": "2026-06-01",
      "end_date": "2026-06-30",
      "reason": "June 2026 Payroll",
      "locked_by": "user-uuid",
      "created_at": "2026-07-01T10:00:00Z"
    }
  ]
}
```

### 2. Create a Lock Period
Locks a specific date range.

- **URL:** `/api/v1/attendance/hr/locks`
- **Method:** `POST`
- **Auth:** `Bearer Token` (Requires HR/Admin role)

**Request Payload (`req.body`):**
```json
{
  "start_date": "2026-07-01", // Required (ISO Date)
  "end_date": "2026-07-31",   // Required (ISO Date)
  "reason": "July 2026 Payroll" // Optional (Max 1000 chars)
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Period locked successfully",
  "data": {
    "id": "uuid-124",
    "start_date": "2026-07-01",
    "end_date": "2026-07-31",
    "reason": "July 2026 Payroll"
  }
}
```

**Error (409 Conflict):**
Thrown if the requested dates overlap with an existing lock.
```json
{
  "success": false,
  "error": {
    "code": "OVERLAPPING_LOCK",
    "message": "This period overlaps with an existing lock"
  }
}
```

### 3. Delete / Revert a Lock Period
Removes an active lock, re-opening the period for edits.

- **URL:** `/api/v1/attendance/hr/locks/:id`
- **Method:** `DELETE`
- **Auth:** `Bearer Token` (Requires HR/Admin role)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Lock removed successfully"
}
```

---

## 📊 Analytics & Reporting APIs

These APIs generate data-heavy aggregates for HR review and payroll processing.

### 4. Get Daily Report
Retrieves attendance statuses for all employees for a specific date.

- **URL:** `/api/v1/attendance/hr/reports/daily?date=YYYY-MM-DD`
- **Method:** `GET`
- **Auth:** `Bearer Token` (Requires HR/Admin role)

**Query Parameters (`req.query`):**
- `date`: Target date (Required, ISO Format e.g., `2026-07-15`)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Daily report generated",
  "data": [
    {
      "user_id": "uuid-001",
      "first_name": "John",
      "last_name": "Doe",
      "record_id": "rec-uuid",
      "status": "present",
      "clock_in_time": "2026-07-15T09:05:00Z",
      "clock_out_time": "2026-07-15T18:00:00Z",
      "late_minutes": 5,
      "early_leave_minutes": 0,
      "overtime_minutes": 0,
      "is_anomaly": false
    }
  ]
}
```

### 5. Get Monthly Report
Generates a summarized payroll view for an entire month across all employees.

- **URL:** `/api/v1/attendance/hr/reports/monthly?month=YYYY-MM`
- **Method:** `GET`
- **Auth:** `Bearer Token` (Requires HR/Admin role)

**Query Parameters (`req.query`):**
- `month`: Target month (Required, YYYY-MM Format e.g., `2026-07`)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Monthly report generated",
  "data": {
    "month": "2026-07",
    "employees": [
      {
        "user_id": "uuid-001",
        "first_name": "John",
        "last_name": "Doe",
        "summary": {
          "total_present": 21,
          "total_absent": 1,
          "total_late": 3,
          "total_overtime_minutes": 120
        }
      }
    ]
  }
}
```

### 6. Get Detailed Employee Report
Fetches the granular day-by-day attendance log for a specific employee across a custom date range.

- **URL:** `/api/v1/attendance/hr/reports/employee/:userId?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
- **Method:** `GET`
- **Auth:** `Bearer Token` (Requires HR/Admin role)

**Query Parameters (`req.query`):**
- `start_date`: (Required, ISO Date)
- `end_date`: (Required, ISO Date)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Employee report generated",
  "data": {
    "user_id": "uuid-001",
    "period": {
      "start": "2026-07-01",
      "end": "2026-07-31"
    },
    "records": [
      {
        "date": "2026-07-01",
        "status": "present",
        "clock_in_time": "2026-07-01T09:00:00Z",
        "clock_out_time": "2026-07-01T18:00:00Z",
        "late_minutes": 0,
        "overtime_minutes": 0,
        "is_anomaly": false
      }
    ],
    "summary": {
      "total_present": 21,
      "total_absent": 1,
      "total_late": 0,
      "total_overtime_minutes": 0
    }
  }
}
```

---

## 🚨 Globally Handled Errors (Applies to all Mutating APIs)

If a user or manager attempts to hit any endpoint targeting a date that falls inside an active lock period, the server will instantly reject the request and return:

**Error (403 Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "PERIOD_LOCKED",
    "message": "Cannot modify records. Date 2026-07-15 is locked for payroll."
  }
}
```
**Frontend Integration:** All dashboards must intercept `403` responses with the code `PERIOD_LOCKED` and display a Toast/Notification alerting them of the payroll freeze.

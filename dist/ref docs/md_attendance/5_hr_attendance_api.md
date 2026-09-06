# HR Attendance Management APIs

**Base URL:** `/api/v1/attendance/hr` (HR Context)  
**Source of Truth:** `hr_attendance.routes.js`, `hr_attendance_read.routes.js`, `hr_attendance.controller.js`, `hr_attendance_read.controller.js`, `policy.service.js`, `shift.service.js`, `holiday.service.js`, `weekly_off.service.js`, `device.service.js`, `comp_off_policy.service.js`, `comp_off.service.js`, `lock.service.js`, `report.service.js`  
**Last Verified:** September 3, 2026

> **Note:** The specific function and ORM method names (e.g., `Organization.create()`) used in the internal execution flows are conceptual/dummy names intended to clearly illustrate the business logic. The internal execution logic, database interactions, transactions, side-effects, and validations described are strictly accurate and verified against the actual codebase.

---

## 1. Core Configuration (Policies & Shifts)

### Policies
**Endpoints:** 
- `POST /api/v1/attendance/hr/policies`
- `GET /api/v1/attendance/hr/policies`
- `GET /api/v1/attendance/hr/policies/:id`
- `PUT /api/v1/attendance/hr/policies/:id`
- `PATCH /api/v1/attendance/hr/policies/:id/deactivate`

**Business Purpose:** Defines the rules for attendance calculation (grace periods, half-day rules, overtime flags, auto clock-out rules).

**Key Configuration Fields:**
- `name`: Policy display name.
- `grace_minutes`: Allowed lateness before penalizing.
- `half_day_min_hours`: Minimum effective hours to avoid being marked absent.
- `full_day_min_hours`: Minimum effective hours to be marked present.
- `max_break_duration_minutes`: Allowed total break time.
- `regularization_allowed` & `regularization_window_days`: Controls backdated corrections.
- `overtime_enabled` & `overtime_min_minutes`: Overtime thresholds.

**Complete Internal Execution Flow (POST):**
```text
POST /api/v1/attendance/hr/policies
        ↓
AuthMiddleware.authorize(['hr', 'admin', 'super-admin'])
        ↓
HRAttendanceController.handlePostPolicy()
        ↓
PolicyService.createPolicy()
        ↓
Database Insert (attendance_policies)
        ↓
HTTP 201 Created
```

### Shifts
**Endpoints:** 
- `POST /api/v1/attendance/hr/shifts`
- `GET /api/v1/attendance/hr/shifts`
- `GET /api/v1/attendance/hr/shifts/:id`
- `PUT /api/v1/attendance/hr/shifts/:id`
- `DELETE /api/v1/attendance/hr/shifts/:id`

**Business Purpose:** Defines working hours. Can be `fixed` (09:00 - 18:00), `flexible` (duration-based), `split`, `night`, or `rotational`. Linked to a specific Policy (`policy_id`).

### Rotation Patterns
**Endpoints:** 
- `POST /api/v1/attendance/hr/rotations`
- `GET /api/v1/attendance/hr/rotations`
- `DELETE /api/v1/attendance/hr/rotations/:id`

**Business Purpose:** Defines complex repeating shift schedules (e.g., 5 days Morning Shift, 2 days Off, 5 days Night Shift) over a defined `rotation_cycle_days`.

---

## 2. Shift Assignments

### Assign Shift
**Endpoint Contract:** 
- **Method:** `POST`
- **Full Endpoint:** `/api/v1/attendance/hr/shifts/assign`
- **Authorization:** `hr`, `admin`, `super-admin`

**Request Body:**
```json
{
  "user_id": "uuid-v4",
  "shift_id": "uuid-v4",
  "effective_from": "2026-08-01"
}
```

### List, Delete & End Shift Assignments
- `GET /api/v1/attendance/hr/shifts/assignments` — List historical and active employee shift assignments.
- `DELETE /api/v1/attendance/hr/shifts/assignments/:assignment_id` — Remove an assignment record.
- `POST /api/v1/attendance/hr/shifts/assignments/:assignment_id/end` — Closes an active shift assignment by setting `effective_to`.

---

## 3. Exceptions (Holidays & Weekly Offs)

### Holidays
**Endpoints:** 
- `POST /api/v1/attendance/hr/holidays`
- `GET /api/v1/attendance/hr/holidays`
- `PUT /api/v1/attendance/hr/holidays/:id`
- `DELETE /api/v1/attendance/hr/holidays/:id`

**Business Purpose:** Creates and manages organizational, department-wise, or location-specific holidays. Targets can be filtered by `target_departments`, `target_locations`, `target_employment_types`, or individual `included_users`/`excluded_users`.

### Weekly Off Rules
**Endpoints:** 
- `POST /api/v1/attendance/hr/weekly-offs`
- `GET /api/v1/attendance/hr/weekly-offs`
- `PUT /api/v1/attendance/hr/weekly-offs/:id`
- `DELETE /api/v1/attendance/hr/weekly-offs/:id`

**Business Purpose:** Defines weekly rest days (e.g. `days_of_week: [0, 6]` for Saturday and Sunday), scoped by department, shift, or employment type.

---

## 4. Hardware Integrations (Biometric Devices & Mappings)

### Register & Manage Devices
- `POST /api/v1/attendance/hr/devices` — Registers a biometric device and returns a one-time plain API Key (hashed with SHA-256/bcrypt at rest).
- `GET /api/v1/attendance/hr/devices` — Lists registered biometric devices.
- `PUT /api/v1/attendance/hr/devices/:id` — Updates device configuration.
- `DELETE /api/v1/attendance/hr/devices/:id` — Deactivates/removes a registered device.

### Map Employee to Device
- `POST /api/v1/attendance/hr/devices/:id/mappings` — Links an employee ID (`user_id`) to the biometric hardware's `device_employee_id`.
- `GET /api/v1/attendance/hr/devices/:id/mappings` — Lists mappings for a device.
- `DELETE /api/v1/attendance/hr/devices/:id/mappings/:mappingId` — Unlinks an employee from a device.

---

## 5. Comp-Off Policies & Overrides

### Comp-Off Policies CRUD
- `POST /api/v1/attendance/hr/comp-off-policies` — Creates comp-off rules (e.g., `min_hours_for_half_day`, `min_hours_for_full_day`, `multiplier`, `validity_days`, `requires_approval`).
- `GET /api/v1/attendance/hr/comp-off-policies` — Lists all comp-off policies.
- `PUT /api/v1/attendance/hr/comp-off-policies/:id` — Updates a policy.
- `DELETE /api/v1/attendance/hr/comp-off-policies/:id` — Deletes a policy.

### Organization Comp-Off Requests & HR Overrides
- `GET /api/v1/attendance/hr/comp-offs` — Lists all comp-off requests organization-wide.
- `POST /api/v1/attendance/hr/comp-offs/:id/approve` — HR override approval for a comp-off request (credits leave balance).
- `POST /api/v1/attendance/hr/comp-offs/:id/reject` — HR override rejection.

---

## 6. Payroll Lock Periods & Maintenance

### Payroll Locks
- `GET /api/v1/attendance/hr/locks` — Lists all payroll lock periods.
- `POST /api/v1/attendance/hr/locks` — Freezes a date range (start date to end date) preventing clock-in, regularization, or overtime modifications for that period.
- `DELETE /api/v1/attendance/hr/locks/:id` — Removes a lock period to allow backdated corrections.

### Maintenance Sweep
- `POST /api/v1/attendance/hr/records/recompute-stale` — Recomputes attendance records stuck in `in_progress` despite having a clock-out (accepts optional `{ "date": "YYYY-MM-DD" }`).

---

## 7. Reporting

### Generate Reports
- `GET /api/v1/attendance/hr/reports/daily` — Flattened daily attendance report for CSV/Excel export.
- `GET /api/v1/attendance/hr/reports/monthly` — Consolidated monthly attendance report.
- `GET /api/v1/attendance/hr/reports/employee/:userId` — Detailed attendance report for a specific employee over a date range.

---

## 8. HR Read Queries (Employees, Managers & HR Staff)

### HR Staff Attendance (Accessible by HR and Managers)
- `GET /api/v1/attendance/hr/hrs/attendance` — Lists HR team members' attendance.
- `GET /api/v1/attendance/hr/hrs/:userId/attendance` — History for an HR staff member.
- `GET /api/v1/attendance/hr/hrs/:userId/summary` — Summary for an HR staff member.
- `GET /api/v1/attendance/hr/hrs/:userId/daily-log` — Minute-by-minute log for an HR staff member.

### Employee Attendance (HR Exclusive)
- `GET /api/v1/attendance/hr/employees/attendance` — Org-wide employee attendance list.
- `GET /api/v1/attendance/hr/employees/:userId/attendance` — Deep history for any employee.
- `GET /api/v1/attendance/hr/employees/:userId/summary` — Summary metrics for any employee.
- `GET /api/v1/attendance/hr/employees/:userId/daily-log` — Daily punch logs for any employee.

### Manager Attendance (HR Exclusive)
- `GET /api/v1/attendance/hr/managers/attendance` — Org-wide manager attendance list.
- `GET /api/v1/attendance/hr/managers/:userId/attendance` — History for any manager.
- `GET /api/v1/attendance/hr/managers/:userId/summary` — Summary metrics for any manager.
- `GET /api/v1/attendance/hr/managers/:userId/daily-log` — Daily punch logs for any manager.

---

## 9. Dashboards & Analytics

- `GET /api/v1/attendance/hr/dashboard/live` — Real-time live counts (present, absent, on break, late).
- `GET /api/v1/attendance/hr/dashboard/graph-data` — Organization-wide time-series attendance trends.
- `GET /api/v1/attendance/hr/dashboard/department-summary` — Aggregated attendance metrics grouped by department.
- `GET /api/v1/attendance/hr/dashboard/top-defaulters` — Top employees with highest late minutes or missing punches.
- `GET /api/v1/attendance/hr/dashboard/work-mode-distribution` — Breakdown of Remote vs Office vs Hybrid clock-ins.


# Phase 6: Period Locking & Analytics (Reports)
**Frontend Integration & UI/UX Guide**

This document outlines the Phase 6 Attendance APIs, focusing on **Payroll Lock Enforcement** and **Attendance Reporting/Analytics**. It provides HR and Admins with tools to freeze historical records for payroll processing and generate comprehensive attendance insights.

---

## 🧭 Global UI/UX Concepts for Phase 6

1. **Immutable Truth:** Once a period is locked, no changes (punches, regularizations, comp-offs) can be made. The UI must clearly reflect this "locked" state to avoid user frustration.
2. **Data Density & Clarity:** Reports involve massive amounts of data. The UI must prioritize readability, filtering, and exportability (CSV/Excel) over flashy graphics.
3. **Actionable Insights:** Analytics shouldn't just be numbers; they should highlight anomalies (e.g., "5 employees have chronic late arrivals this month").

---

## 🔒 HR Workflows: Period Locking

### 1. Manage Lock Periods (CRUD)
**Endpoints:**
* `GET /api/v1/attendance/hr/locks`
* `POST /api/v1/attendance/hr/locks`
* `DELETE /api/v1/attendance/hr/locks/:id` (Unlock/Revert)

**What is this API & Why is it being used:**
Before running payroll, HR needs to ensure nobody can retroactively change their attendance (e.g., a manager approving a 3-week-old regularization). The lock period explicitly freezes a date range (e.g., `2026-07-01` to `2026-07-31`). Any mutation attempt within this range will be rejected by the backend.

**How Frontend Can Integrate:**
* **List View:** Fetch active locks using the `GET` endpoint.
* **Create Lock:** A form to specify a `start_date` and `end_date`.

**Suggested Design and UI/UX:**
* **Calendar Visualizer:** Instead of simple date inputs, use a calendar component that shades out previously locked periods and allows HR to drag-select the next period to lock.
* **Warning Modal:** When creating a lock, present a strong confirmation modal: "Locking July 2026 will reject all pending regularizations and comp-off requests for this period. Are you sure?"

### 2. Lock Enforcement (UI State Reflection)
**Affected Workflows:**
* Employee: Clock In/Out (retroactive), Regularizations
* Manager: Approvals
* HR: Manual Overrides

**How Frontend Can Integrate:**
* Before rendering an action button (e.g., "Request Regularization" for July 15), the UI can check if July 15 falls within a locked period. If so, disable the button and show a tooltip: "Period locked for payroll."

---

## 📊 HR Workflows: Reports & Analytics

### 3. Generate Attendance Reports
**Endpoints:**
* `GET /api/v1/attendance/hr/reports/daily?date=YYYY-MM-DD`
* `GET /api/v1/attendance/hr/reports/monthly?month=YYYY-MM`
* `GET /api/v1/attendance/hr/reports/employee/:userId?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

**What is this API & Why is it being used:**
Provides aggregated data from `attendance_records`, `attendance_logs`, and `attendance_sessions`. Used to calculate total present days, absent days, late days, overtime hours, and comp-offs for payroll generation.

**How Frontend Can Integrate:**
* Provide dynamic filter controls (Date Range, Department, Shift, Status).
* Display results in a paginated, sortable data table.

**Suggested Design and UI/UX:**
* **Dashboard Widgets:** At the top of the reports page, show high-level metrics (e.g., "Avg Attendance: 92%", "Total Overtime: 45h").
* **Export First (Crucial):** Every report MUST have a prominent "Export to CSV/Excel" button. This is the primary way HR interacts with reports for payroll software integration.
* **Visual Status Indicators:** Use a heatmap or color-coded calendar for the Employee Report (Green = Present, Red = Absent, Yellow = Late).

---

## ⚙️ The Invisible Workflow: Middleware & Service Lock Checks

**Implementation Note for Backend:**
* The backend will introduce a `checkLockPeriod` utility inside services (or via middleware).
* Any `POST`, `PUT`, or `DELETE` request affecting a date (e.g., `clockIn`, `approveRegularization`) must query `attendance_lock_periods`. If the target date falls between a `start_date` and `end_date` for that `org_id`, the system will throw a `403 Period Locked` error.
* `lock.service.js` will encapsulate the checking logic, ensuring `Op.between` is used correctly to validate dates before any mutation occurs.

---

## 🚨 Standard Error Codes for Phase 6

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `403` | `PERIOD_LOCKED` | Attempting to mutate data in a locked date range | Show toast: "Cannot modify records in a locked payroll period" |
| `400` | `INVALID_DATE_RANGE` | Start date is after end date, or range is too large | Highlight date inputs |
| `409` | `OVERLAPPING_LOCK` | Attempting to lock a period that overlaps an existing lock | Show error: "Period overlaps with an existing lock" |

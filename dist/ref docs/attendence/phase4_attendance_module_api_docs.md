# Phase 4: Regularization & Overtime APIs
**Frontend Integration & UI/UX Guide**

This document outlines the Phase 4 Attendance APIs, which focus on **Employee Exception Handling (Regularizations)** and **Manager/HR Approval Workflows**. It provides the technical details (endpoints, payloads) and UI/UX recommendations to help the Frontend team integrate seamlessly.

---

## 🧭 Global UI/UX Concepts for Phase 4

1. **The Fallibility of Punches:** Regularization is the formal process for an employee to request a correction to their punch times.
2. **Manager Inbox Concept:** Managers need an action-oriented UI (like an inbox) to quickly approve or reject requests.
3. **Immutability of History:** Frontend must never allow an employee to "edit" a past attendance record directly. They must use the Regularization workflow to submit a `pending` request.

---

## 🧑‍💻 Employee Workflows (Regularization)

### 1. Submit Regularization Request
**Endpoint:** `POST /api/v1/attendance/regularization`

**Why we have this API:**
Employees use this to fix missed punches, accidental early clock-outs, or network failures.

**UI/UX Recommendations:**
* **Trigger:** A "Fix Attendance" or "Regularize" button next to past `absent` or `anomaly` records on their history view.
* **Form:** Provide a date picker (disabled to the specific day if triggered from a history row), time pickers for `requested_clock_in` and `requested_clock_out`, and a required Textarea for the `reason`.
* **Validation:** Show a user-friendly error if the date falls outside the company's allowed window.

**Request Payload:**
```json
{
  "date": "2026-08-01",
  "requested_clock_in": "2026-08-01T09:00:00.000Z",
  "requested_clock_out": "2026-08-01T18:00:00.000Z",
  "reason": "Forgot to clock in due to network outage"
}
```
*(Note: `requested_clock_in` and `requested_clock_out` are optional, but at least one should be provided based on what they are fixing. `reason` is strictly required and must be min 5 characters).*

**Response:**
```json
{
  "success": true,
  "message": "Regularization request submitted",
  "data": {
    "id": "uuid-here",
    "status": "pending"
  }
}
```

### 2. View My Regularization Requests
**Endpoint:** `GET /api/v1/attendance/regularizations?page=1&limit=20`

**Why we have this API:**
Employees need to track the status of their requests (Pending, Approved, Rejected).

**UI/UX Recommendations:**
* **Status Badges:** Use colors! Pending (Orange/Yellow), Approved (Green), Rejected (Red).
* **Details:** Show the manager's review remarks if the request was rejected.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "page": 1,
    "totalPages": 1,
    "requests": [
      {
        "id": "uuid-here",
        "date": "2026-08-01",
        "status": "pending",
        "reason": "Network issue",
        "reviewer": null,
        "review_remarks": null
      }
    ]
  }
}
```

---

## 👔 Manager & HR Workflows (Approvals & Insights)

*Note: All endpoints below require the user to have a Manager, HR, Admin, or Super-Admin role. They are mounted under the `/api/v1/attendance/manager` namespace.*

### 3. View Real-time Team Dashboard
**Endpoint:** `GET /api/v1/attendance/manager/team/today`

**Why we have this API:**
Managers need to know who is working *right now*, who is late, and who is on break.

**UI/UX Recommendations:**
* **Widgets:** Create a quick summary row (e.g., "15 Present, 2 on Break, 3 Absent").
* **Live Indicators:** Show a green pulsing dot next to employees currently in an `in_progress` status.

**Response:**
```json
{
  "success": true,
  "message": "Team today fetched",
  "data": [
    {
      "id": "uuid-here",
      "user_id": "uuid-here",
      "date": "2026-08-02",
      "status": "in_progress",
      "user": {
        "id": "uuid-here",
        "identifier": "john.doe@example.com",
        "profile": {
          "first_name": "John",
          "last_name": "Doe",
          "display_name": "John Doe",
          "avatar_url": "https://example.com/avatar.png"
        },
        "employee_profile": {
          "id": "uuid",
          "employee_code": "EMP-001",
          "department": "Engineering",
          "designation": "Software Engineer",
          "work_location": "Office"
        },
        "manager_profile": null,
        "hr_profile": null
      }
    }
  ]
}
```

### 3.5 View Team Historical Attendance
**Endpoint:** `GET /api/v1/attendance/manager/team/history`

**Why we have this API:**
Allows managers and HR to review past performance and attendance habits of their team.

**Query Parameters:**
* `from`: (Optional) Start date YYYY-MM-DD
* `to`: (Optional) End date YYYY-MM-DD
* `user_id`: (Optional) Filter by a specific employee

**Response:**
```json
{
  "success": true,
  "message": "Team history fetched",
  "data": [
    {
      "id": "uuid-here",
      "user_id": "uuid-here",
      "date": "2026-08-01",
      "status": "present",
      "late_minutes": 0,
      "early_exit_minutes": 0,
      "user": {
        "id": "uuid-here",
        "identifier": "EMP-001",
        "profile": {
          "first_name": "John",
          "last_name": "Doe",
          "display_name": "John Doe",
          "avatar_url": "https://example.com/avatar.png"
        },
        "employee_profile": {
          "id": "uuid",
          "employee_code": "EMP-001",
          "department": "Engineering",
          "designation": "Software Engineer",
          "work_location": "Office"
        },
        "manager_profile": null,
        "hr_profile": null
      }
    }
  ]
}
```

### 4. View Pending Regularizations (Inbox)

**Endpoint:** `GET /api/v1/attendance/manager/regularizations/pending`

**Why we have this API:**
Provides the list of employee requests waiting for a manager's decision.

**UI/UX Recommendations:**
* **Quick Actions:** Next to each row, show a "✅ Approve" and "❌ Reject" button. Clicking them should open a small modal asking for optional `remarks`.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "date": "2026-08-01",
      "status": "pending",
      "reason": "Forgot to clock in",
      "user": {
        "id": "uuid-here",
        "identifier": "john.doe",
        "profile": {
          "first_name": "John",
          "last_name": "Doe",
          "display_name": "John Doe",
          "avatar_url": null
        },
        "employee_profile": {
          "id": "uuid",
          "employee_code": "EMP-001",
          "department": "Engineering",
          "designation": "Software Engineer",
          "work_location": "Office"
        },
        "manager_profile": null,
        "hr_profile": null
      },
      "record": { ... } // Includes their original attendance record if it exists
    }
  ]
}
```

### 5. Approve / Reject Regularization
**Endpoint:** `POST /api/v1/attendance/manager/regularizations/:id/approve`
**Endpoint:** `POST /api/v1/attendance/manager/regularizations/:id/reject`

**Why we have this API:**
Finalizes the employee's request. **Approving instantly triggers a recalculation of their official attendance hours.**

**UI/UX Recommendations:**
* **Feedback:** After a successful approve/reject call, instantly remove the row from the pending table and show a toast notification ("Request Approved").

**Request Payload:**
```json
{
  "remarks": "Approved, make sure to punch in on time next time."
}
```
*(Note: `remarks` is optional, max 1000 characters).*

### 6. View Pending Overtime
**Endpoint:** `GET /api/v1/attendance/manager/overtime/pending`

**Why we have this API:**
If the org policy mandates approval for overtime, the calculation engine automatically creates `pending` Overtime records when employees work beyond their shift. Managers must approve these before they hit payroll.

**UI/UX Recommendations:**
* **Data Table:** Clearly highlight the "Computed Overtime Minutes" alongside the standard shift hours so the manager has context on why the OT was generated.

### 7. Approve / Reject Overtime
**Endpoint:** `POST /api/v1/attendance/manager/overtime/:id/approve`
**Endpoint:** `POST /api/v1/attendance/manager/overtime/:id/reject`

**Why we have this API:**
Finalizes the overtime payout eligibility.

**Request Payload:**
```json
{
  "remarks": "Approved for project release."
}
```

### 8. View Team Anomalies
**Endpoint:** `GET /api/v1/attendance/manager/team/anomalies`

**Why we have this API:**
Anomalies (e.g., missing clock-out, late arrivals exceeding thresholds) are automatically flagged by the system. This allows managers to proactively track chronic lateness or process discipline issues without manually checking everyone's timesheet.

**UI/UX Recommendations:**
* **Inbox Style:** Treat anomalies like a task list. Provide a "Remind Employee" button that perhaps sends a nudge to the employee to submit a regularization request.

### 9. Resolve Anomaly
**Endpoint:** `POST /api/v1/attendance/manager/anomalies/:id/resolve`

**Why we have this API:**
Once a manager speaks to an employee or reviews the situation, they can mark the system-detected anomaly as resolved to clear it from their inbox.

**Request Payload:**
```json
{
  "remarks": "Spoke to John, he was stuck in traffic."
}
```

---

## 🏢 HR / Admin Workflows (Overtime)

### 10. View Pending Overtime
**Endpoint:** `GET /api/v1/attendance/manager/overtime/pending`

**Why we have this API:**
If the org policy mandates approval for overtime, the calculation engine automatically creates `pending` Overtime records when employees work beyond their shift. Managers must approve these before they hit payroll.

**UI/UX Recommendations:**
* **Data Table:** Clearly highlight the "Computed Overtime Minutes" alongside the standard shift hours so the manager has context on why the OT was generated.

### 11. Approve / Reject Overtime
**Endpoint:** `POST /api/v1/attendance/manager/overtime/:id/approve`
**Endpoint:** `POST /api/v1/attendance/manager/overtime/:id/reject`

**Why we have this API:**
Finalizes the overtime payout eligibility.

**Request Payload:**
```json
{
  "remarks": "Approved for project release."
}
```

---

## 🚨 Standard Error Codes for Phase 4

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `400` | `INVALID_REGULARIZATION_DATE` | Date is outside allowed window | Show error under date picker |
| `400` | `ALREADY_PROCESSED` | Request was already approved/rejected | Refresh the list |
| `403` | `UNAUTHORIZED_MANAGER` | Manager trying to approve non-direct report | Show toast error |
| `423` | `ATTENDANCE_LOCKED` | Date is in a locked payroll period | Alert: "Cannot regularize locked period" |

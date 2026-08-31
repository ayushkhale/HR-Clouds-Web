# Phase 4: Regularization & Manager Workflows
**Frontend Integration & UI/UX Guide**

This document outlines the Phase 4 Attendance APIs, which focus on **Employee Exception Handling (Regularizations)** and **Manager/HR Approval Workflows**. It is designed to help the Frontend team build the necessary UI/UX for these workflows.

---

## 🧭 Global UI/UX Concepts for Phase 4

1. **The Fallibility of Punches:** Employees forget to clock in, accidentally clock out early, or get locked out due to network issues. **Regularization** is the formal process for an employee to say, "I messed up my punch, here is what my real time should be," and wait for a manager to approve it.
2. **Approval States:** Regularizations and Overtime records move through a state machine: `pending` ➡️ `approved` (or `rejected`). UI must clearly distinguish these states (e.g., Yellow for pending, Green for approved).
3. **Audit Trails:** Every approval/rejection generates a backend audit log. The UI should always prompt the Manager/HR for a "Reason/Remarks" when approving or rejecting.

---

## 🧑‍💻 Employee Workflows

### 1. View My Regularization Requests
**Endpoint:** `GET /api/v1/attendance/regularizations`

**Why we have this API:**
Employees need a dedicated page to see the status of their past correction requests (Pending, Approved, Rejected).

**UI/UX Recommendations:**
* **Data Table:** Show Date, Requested In, Requested Out, Reason, Status, and Manager Remarks.
* **Status Indicators:** Use a yellow "Pending Approval" badge. Once approved, show a green "Approved" badge and allow the user to click to see their updated attendance record.

### 2. Submit a Regularization Request
**Endpoint:** `POST /api/v1/attendance/regularization`

**Why we have this API:**
Allows the employee to formally request a fix to a specific past date.

**Request Payload:**
```json
{
  "date": "2026-08-01",
  "requested_clock_in": "2026-08-01T09:00:00+05:30",
  "requested_clock_out": "2026-08-01T18:00:00+05:30",
  "reason": "Forgot to clock in, was in a client meeting."
}
```

**UI/UX Recommendations:**
* **Trigger:** Add a "Request Correction" button on the *Attendance History* table next to past records (especially those marked Absent or Half Day).
* **Validation:** The frontend should prevent requesting regularizations for dates older than the policy's `regularization_window_days` (usually 7-30 days).
* **Form:** Provide a clear Date Picker, Time Pickers for In/Out, and a mandatory Text Area for the reason.

---

## 👔 Manager Workflows

*Note: Manager APIs check the reporting hierarchy. For MVP, they might scope to all employees if the hierarchy table is not yet built.*

### 3. Team Attendance Dashboard (Today)
**Endpoint:** `GET /api/v1/attendance/manager/team/today`

**Why we have this API:**
Managers need a real-time view of who is working right now, who is on break, and who is absent.

**UI/UX Recommendations:**
* **Live Feed:** Show a grid/list of team members.
* **Status Badges:** 
  * 🟢 Working (Clocked In)
  * 🟡 On Break
  * 🔴 Absent (Not clocked in yet)
  * 🔵 Shift Completed

### 4. Team Historical Attendance
**Endpoint:** `GET /api/v1/attendance/manager/team/history?from=YYYY-MM-DD&to=YYYY-MM-DD&user_id=uuid`

**Why we have this API:**
Allows managers to review past performance and attendance habits of their team.

**UI/UX Recommendations:**
* **Filters:** Essential to have Date Range and Employee dropdown filters.
* **Red Flags:** Highlight records where `late_minutes > 0` or `early_exit_minutes > 0`.

### 5. View Team Anomalies
**Endpoint:** `GET /api/v1/attendance/manager/team/anomalies`

**Why we have this API:**
The backend calculation engine silently flags anomalies (e.g., `excessive_break`, `missing_clock_out`, `gps_mismatch`). Managers use this view to investigate suspicious behavior.

**UI/UX Recommendations:**
* **Inbox Style:** Treat this like an inbox. Managers should be able to click an anomaly, read the details, and mark it as "Resolved" after talking to the employee.

### 6. Resolve Team Anomaly
**Endpoint:** `POST /api/v1/attendance/manager/anomalies/:id/resolve`

**Why we have this API:**
Once a manager investigates an anomaly (e.g., they ask the employee why they didn't clock out, or why they were 2 hours late), they need a way to clear it from their "Anomalies Inbox". Marking it as resolved acknowledges that management is aware of the infraction. It ensures HR compliance and creates an audit trail of the conversation.

**Request Payload:**
```json
{
  "remarks": "Spoke to the employee, it was a genuine network issue."
}
```

**UI/UX Recommendations:**
* **Prompt for Action:** Provide a "Mark as Resolved" button on each anomaly card.
* **Audit Remarks:** Always pop open a modal requiring the manager to type in their remarks (what action was taken?) before calling the API.

### 7. View Pending Regularizations
**Endpoint:** `GET /api/v1/attendance/manager/regularizations/pending`

**Why we have this API:**
This is the Manager's action queue. It lists all correction requests waiting for their approval.

**UI/UX Recommendations:**
* **Card View:** Display each request as a card comparing the *Original Record* vs the *Requested Times*.
* **Highlight Changes:** Use a diff-style UI (e.g., old time crossed out in red, new time in green).

### 8. Approve / Reject Regularization
**Endpoint:** `POST /api/v1/attendance/manager/regularizations/:id/approve`
**Endpoint:** `POST /api/v1/attendance/manager/regularizations/:id/reject`

**Why we have this API:**
Closes the loop. Approving a request triggers the backend calculation engine to instantly recalculate the employee's hours and statuses based on the new times.

**Request Payload:**
```json
{
  "review_remarks": "Approved, I remember you being in the meeting."
}
```

**UI/UX Recommendations:**
* **Action Buttons:** Large "Approve" (Green) and "Reject" (Red) buttons on the pending request cards.
* **Prompt for Remarks:** When they click Reject, always pop up a modal asking for the rejection reason.

---

## 🏢 HR / Admin Workflows (Overtime)

### 9. View Pending Overtime
**Endpoint:** `GET /api/v1/attendance/manager/overtime/pending`

**Why we have this API:**
If the org policy has `overtime_enabled` and `overtime_requires_approval`, the calculation engine creates pending Overtime records when employees work beyond their shift. HR/Managers must approve these before they hit payroll.

**UI/UX Recommendations:**
* **Data Table:** Show Employee, Date, Standard Shift Hours, Effective Hours Worked, and **Computed Overtime Minutes**.

### 10. Approve / Reject Overtime
**Endpoint:** `POST /api/v1/attendance/manager/overtime/:id/approve`
**Endpoint:** `POST /api/v1/attendance/manager/overtime/:id/reject`

**Why we have this API:**
Finalizes the overtime payout eligibility.

**UI/UX Recommendations:**
* **Bulk Actions:** Allow HR to select multiple overtime records with checkboxes and hit "Approve All".

---

## 🚨 Standard Error Codes for Phase 4

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `400` | `INVALID_REGULARIZATION_DATE` | Date is outside allowed window | Show error under date picker |
| `400` | `ALREADY_PROCESSED` | Request was already approved/rejected | Refresh the list |
| `403` | `UNAUTHORIZED_MANAGER` | Manager trying to approve non-direct report | Show toast error |
| `423` | `ATTENDANCE_LOCKED` | Date is in a locked payroll period | Alert: "Cannot regularize locked period" |

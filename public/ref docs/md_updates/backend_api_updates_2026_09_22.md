# Backend API Updates for Frontend Developers (Bug Fixes)

This document details the recent updates to the Payroll APIs addressing specific backend findings (bugs) that impact the frontend implementation.

## 1. New API: List Automated Jobs (BACKEND-008)

The frontend automation UI previously lacked a way to query the background cron jobs and their schedules. A new endpoint has been created.

* **Endpoint:** `GET /api/v1/payroll/hr/jobs`
* **Purpose:** Retrieves a list of all configured automated background jobs with their metadata and schedules.
* **Authentication:** Bearer Token (`hr` role).
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Jobs retrieved successfully",
    "data": [
      {
        "id": "calendar-reminders",
        "name": "Calendar Reminders",
        "description": "Sends email reminders for payroll cutoffs, paydays, and tax deadlines",
        "schedule": "0 8 * * *",
        "status": "active"
      },
      {
        "id": "auto-draft",
        "name": "Auto Draft Payroll",
        "description": "Automatically drafts a new payroll run on the configured generation day",
        "schedule": "0 1 * * *",
        "status": "active"
      },
      {
        "id": "run-sweeper",
        "name": "Stale Run Sweeper",
        "description": "Reclaims runs stuck in a calculating state",
        "schedule": "*/15 * * * *",
        "status": "active"
      },
      {
        "id": "attachment-sweeper",
        "name": "Attachment Sweeper",
        "description": "Cleans up pending or expired attachment uploads",
        "schedule": "0 2 * * 0",
        "status": "active"
      }
    ]
  }
  ```
* **Frontend Action:** Use this API to dynamically render the Job Schedules list in the Automation UI instead of hardcoding "UNKNOWN" values.

## 2. Exports API Status Field Update (BACKEND-006)

Previously, generating an export (e.g., Payroll Register) that resulted in 0 rows incorrectly marked the export audit record as `'completed'`, causing the frontend to download empty files.

* **Affected Endpoint:** `GET /api/v1/payroll/hr/exports`
* **Response Update:** The `status` field in the response rows can now return `'no_data'`.
* **Frontend Action:** Ensure the UI logic that renders badges for the Export status accounts for `'no_data'`. Disable the download button if `status === 'no_data'` and display a relevant tooltip or tag (e.g., "Empty / No Data").

## 3. Revoked Payslip Visibility (BACKEND-007)

Previously, when a payslip was revoked or superseded during an off-cycle run, the backend updated its status but left `visible_to_employee: true`.

* **Behavior Change:** The backend now strictly enforces `visible_to_employee: false` when a payslip is revoked or superseded. 
* **Frontend Action:** If your self-service portal UI filters payslips directly using the API response, you can now trust the `visible_to_employee` boolean to accurately reflect whether the payslip should be hidden from the employee. (This doesn't require an explicit API shape change, but it fixes data leaks on the frontend.)

## 4. Bonus Rules Engine (BACKEND-002)

* **Behavior Change:** The bonus engine correctly scopes eligible users to active tenant members. 
* **Frontend Action:** No changes are required on the frontend. The `POST /api/v1/payroll/bonus-rules/:id/apply` API retains the same structure, but the preview and apply impacts will no longer falsely include deactivated users or users from outside the organization.

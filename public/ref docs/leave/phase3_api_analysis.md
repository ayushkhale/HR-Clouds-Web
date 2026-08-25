# Phase 3: Leave Application & Approval APIs — Frontend Integration Guide

This document provides a comprehensive, production-level analysis and integration guide for the **Leave Application and Approval APIs** built in Phase 3. These APIs handle the core workflows of employees applying for leaves, and managers/HR approving or rejecting them.

The implementation contains extensive, highly secure business logic (BOLA protections, race-condition transaction locks, Phantom Holds, Sandwich Rule dynamic prevention, and Shift-Rotation temporal mapping). Frontend developers **must** strictly adhere to the error handling and validation guidelines below to ensure a smooth UX without triggering security blocks.

---

## Global Requirements & Middlewares
All APIs documented below share the following security and context requirements:
* **Authentication:** Required. Must provide a valid `Bearer` JWT token.
* **Feature Gate:** Required. The organization's subscription must have the `leave.access` feature enabled.
* **Tenant Isolation:** All operations are strictly scoped to the `org_id` derived from the authenticated user's token (`req.user.org_id`).

---

## Part 1: Self-Service APIs (Employees & Managers)

These APIs are accessible to **all** authenticated users to manage their *own* leaves.

### 1. Get My Balances
* **Endpoint:** `GET /api/v1/leaves/my-balances`
* **Purpose:** Fetches the authenticated user's leave balances.
* **Why it exists:** Frontend needs this to display the available quota for each leave type before the user submits an application.

#### Query Parameters
| Field | Type | Required | Description |
|---|---|---|---|
| `year` | Integer | No | The calendar year to fetch balances for. Defaults to the current year. |

#### Responses
* **200 OK**
  ```json
  {
    "success": true,
    "message": "Your leave balances fetched successfully",
    "data": [
      {
        "id": "uuid",
        "leave_type_id": "uuid",
        "year": 2026,
        "total_accrued": 12.0,
        "total_used": 2.0,
        "current_balance": 10.0,
        "leave_type": { "name": "Sick Leave" }
      }
    ]
  }
  ```

---

### 2. Submit a Leave Request
* **Endpoint:** `POST /api/v1/leaves/request`
* **Purpose:** Allows an employee to apply for leave.
* **Why it exists:** Core entry point for leave application. Automatically handles holiday/weekend exclusion, sandwich rules, LWP (Leave Without Pay) splitting, and balance deduction holds.
* **Database Entities Affected:** `leave_requests` (INSERT).
* **Side Effects (Hidden Logic):**
  - **Phantom Holds:** Pending requests do not immediately deduct from `leave_balances.current_balance`. Instead, the system calculates an `effectiveBalance` on the fly by summing up all pending requests.
  - **LWP Fallback:** If the requested days exceed the user's `effectiveBalance` + `max_negative_balance`, the system automatically splits the request into `paid_days` and `unpaid_days` (LWP) rather than failing outright.
  - **Sandwich Rule Exploit Prevention:** The API dynamically checks for adjacent leaves within a 3-day window. If the user attempts to split a leave (e.g., Friday and Monday) to dodge a weekend deduction, the API forcefully aborts with a 400 error.
  - **Escalation:** If the user has no active manager, the request's `escalated_to_role` is set to `hr` or `admin`.

#### Request Body
| Field | Type | Required | Default | Validation / Constraints |
|---|---|---|---|---|
| `leave_type_id` | UUID | **Yes** | - | Must exist in `leave_types`. |
| `start_date` | String | **Yes** | - | Literal format: `YYYY-MM-DD`. |
| `end_date` | String | **Yes** | - | Literal format: `YYYY-MM-DD`. Must be >= `start_date`. Both dates must fall in the same calendar year. |
| `is_half_day` | Boolean | No | `false` | If true, `start_date` and `end_date` **must be identical**. |
| `half_day_type` | String | No | - | Required if `is_half_day` is true. Must be `first_half` or `second_half`. Forbidden otherwise. |
| `reason` | String | No | `null` | Max 1000 characters. |
| `document_url` | String | No | `null` | Valid URI (Max 255 chars). Required by HR if leave exceeds policy thresholds. |

#### Responses & Errors
* **201 Created**
  ```json
  {
    "success": true,
    "message": "Leave request submitted successfully",
    "data": {
      "leaveRequest": {
        "id": "uuid",
        "status": "pending",
        "total_days": 2.0,
        "paid_days": 1.5,
        "unpaid_days": 0.5,
        "escalated_to_role": null
      },
      "breakdown": [
        { "date": "2026-10-10", "is_working_day": true, "reason": "Full Day Leave" }
      ]
    }
  }
  ```
* **400 Bad Request:** Payload validation failure, or a Business Logic violation. Common messages:
  - *"Cross-Year Constraint: start_date and end_date must fall within the same calendar year."*
  - *"A leave request already exists for these dates."* (Overlap)
  - *"The selected date range does not contain any deductible working days."*
  - *"Sandwich Rule Exploit Prevention: You have an adjacent leave request..."* (Prompt user to cancel and resubmit as a single block).

#### Frontend Guidance
* **Usage:** Never send timezone offsets in dates. Always send strictly `"2026-10-10"`. Be prepared to display the exact 400 error message directly to the user, as the backend calculates highly complex calendar exceptions (holidays/weekends/sandwich).

---

### 3. Cancel a Leave Request
* **Endpoint:** `POST /api/v1/leaves/requests/:id/cancel`
* **Purpose:** Allows an employee to cancel an ongoing or upcoming leave request.
* **Why it exists:** Prevents payroll fraud. If a user cancels a leave in the future, it is deleted automatically. If they try to cancel a leave for *today or the past*, it enters `cancellation_pending` and requires manager approval.
* **Database Entities Affected:** `leave_requests` (UPDATE), `attendance_records` (DELETE), `leave_balances` (UPDATE).

#### Request Params
* **Param `id`:** UUID (Required)

#### Responses & Errors
* **200 OK:**
  ```json
  {
    "success": true,
    "message": "Leave request cancelled successfully", // OR "Cancellation pending manager approval"
    "data": { "status": "cancelled" }
  }
  ```
* **400 Bad Request:** Cannot cancel an already cancelled/rejected request.
* **404 Not Found:** `Leave request not found or access denied` (User trying to cancel someone else's leave).

#### Frontend Guidance
* **Usage:** The frontend must parse the `message` field. If it says "Cancellation pending manager approval", show a toast indicating HR/Manager must approve the cancellation since the date has already passed.

---

### 4. Get My Requests
* **Endpoint:** `GET /api/v1/leaves/my-requests`
* **Purpose:** Fetches the authenticated user's own leave request history.
* **Responses:** **200 OK** returning an array of request objects ordered by `created_at` DESC.
  ```json
  {
    "success": true,
    "message": "Leave requests fetched successfully",
    "data": [
      {
        "id": "uuid",
        "start_date": "2026-10-10",
        "end_date": "2026-10-10",
        "status": "pending",
        "total_days": 1.0
      }
    ]
  }
  ```

---

## Part 2: Approver APIs (Managers, HR, Admins)

These APIs are protected by strict BOLA (Broken Object Level Authorization) guards. A manager can **only** view and approve leaves for users directly beneath them in the `user_reporting_mappings` hierarchy. HR and Admins have global access.

* **Authorization:** Required. `req.user.role` must be `manager`, `hr`, `admin`, or `super-admin`.

### 5. List Team Pending Requests
* **Endpoint:** `GET /api/v1/leaves/team/requests/pending`
* **Purpose:** Returns all pending and cancellation-pending requests that the authenticated user is authorized to approve.

#### Responses
* **200 OK**
  ```json
  {
    "success": true,
    "message": "Pending team requests fetched successfully",
    "data": [
      {
        "id": "uuid",
        "status": "pending",
        "total_days": 2.0,
        "applicant": { "id": "uuid", "first_name": "John", "last_name": "Doe", "email": "john@example.com" },
        "leave_type": { "id": "uuid", "name": "Sick Leave" }
      }
    ]
  }
  ```

> [!WARNING]
> **Scalability Gap:** This endpoint currently lacks pagination. For HR Admins in massive organizations, this will return the entire global queue in a single array. Frontend should prepare virtual scrolling or local pagination.

---

### 6. Approve Leave Request
* **Endpoint:** `POST /api/v1/leaves/requests/:id/approve`
* **Purpose:** Finalizes a pending request or approves a past cancellation.
* **Database Entities Affected:** `leave_requests`, `leave_balances`, `attendance_records` (UPSERT).
* **Side Effects (Hidden Logic):**
  - **Negative Balance Guard:** Verifies the `current_balance` minus `paid_days` does not exceed the allowed `max_negative_balance`. If an admin manually tweaked the balance while the request was pending, this will fail safely.
  - **Shift-Rotation Temporal Awareness:** For workers on overnight shifts (e.g., 10 PM to 6 AM), taking a full day off will automatically insert TWO `on_leave` records into `attendance_records` (for both calendar dates) while only deducting 1.0 day of balance. Half-days strictly bypass this to prevent payroll double-charging.
  - **Cron Race Condition Prevention:** Uses a safe UPSERT mechanism when interacting with `attendance_records` to prevent race conditions if the daily absent cron fires simultaneously.

#### Request Params
* **Param `id`:** UUID (Required)

#### Responses & Errors
* **200 OK:**
  ```json
  {
    "success": true,
    "message": "Leave request approved successfully",
    "data": { "id": "uuid", "status": "approved" }
  }
  ```
* **403 Forbidden:** `Unauthorized to approve this request` (Triggered by the BOLA security guard if a manager attempts to approve a leave for someone outside their reporting chain).
* **400 Bad Request:** 
  - *"Approval denied: This would push the employee's balance below the allowed negative limit..."* -> **Frontend Action:** Manager must Reject the request so the employee can reapply for LWP.
  - *"Conflict on 2026-10-10: Employee is marked present."* -> Employee swiped into work. Request cannot be approved.

---

### 7. Reject Leave Request
* **Endpoint:** `POST /api/v1/leaves/requests/:id/reject`
* **Purpose:** Rejects a pending request or denies a cancellation attempt.

#### Request Body
| Field | Type | Required | Description |
|---|---|---|---|
| `rejection_reason` | String | **Yes** | Max 1000 characters. Mandatory justification. |

#### Responses & Errors
* **200 OK:**
  ```json
  {
    "success": true,
    "message": "Leave request rejected successfully",
    "data": { "id": "uuid", "status": "rejected", "rejection_reason": "Not enough coverage" }
  }
  ```
* **403 Forbidden:** BOLA violation.
* **404 Not Found:** Request doesn't exist.

---

## Discrepancies & Recommendations

* **Missing Route Parameters Validation:** The Approver APIs (`/approve` and `/reject`) do not currently have Joi validation for the `:id` URL parameter. Sending a non-UUID string will result in a generic `500 Internal Server Error` from Sequelize rather than a `400 Bad Request`. Frontend should strictly ensure only valid UUIDs are passed to avoid generic errors.
* **Pagination Missing:** As noted in the `GET /team/requests/pending` section, pagination is omitted.
* **Document Upload API:** The system accepts a `document_url`, but Phase 3 does not include an API to actually upload the file to S3/Cloud Storage. The frontend must utilize the Global File Upload API (if it exists) to obtain the URL before calling the submission endpoint.

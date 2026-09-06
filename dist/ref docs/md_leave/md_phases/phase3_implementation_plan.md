# Phase 3: Leave Application & Approval Workflow - Implementation Plan

## 1. Scope and Objectives
Phase 3 focuses on the core user-facing functionality of the Leave Management System. It enables any organization member (employee, manager, HR, admin) to apply for leaves through a **unified API**, and enables managers/HR to approve or reject them. 

The primary objectives are:
- Build the **Leave Calculator Engine** to accurately compute deductible leave days (handling holidays, weekends, sandwich rules).
- Build the **Approval Chain Resolver** to automatically route requests to the correct manager/HR.
- Build the **Self-Service APIs** for users to apply for and cancel leaves.
- Build the **Approver APIs** for managers to view pending requests, verify balances, and approve/reject.
- Integrate safely with the Attendance module by pushing `on_leave` records without race conditions.

## 2. Database & Schema Verification
The tables were created in Phase 1. Before beginning Phase 3, we must verify the `leave_requests` table has the following fields (as noted in Phase 1 bug fixes):
- `org_id` (UUID, NOT NULL)
- `actioned_at` (DATE)
- `rejection_reason` (TEXT)
- `is_half_day` (BOOLEAN, default false)
- `half_day_type` (ENUM: `null`, `first_half`, `second_half`)
- `requested_at` (DATE, default `NOW()`)
- `status` (ENUM must include `pending`, `approved`, `rejected`, `cancelled`, `cancellation_pending`, `terminated_cancelled`)
- `paid_days` (FLOAT) and `unpaid_days` (FLOAT) — Required to safely handle LWP auto-splits within a single request.
- `escalated_to_role` (STRING/ENUM) — Tracks if a request bypassed a direct manager and requires HR/Admin intervention.

## 3. Core Engines & Utilities (The Brains)

### 3.1 Leave Calculator Engine (`leave_calculator.utils.js`)
This utility computes the exact number of days to deduct for a given date range.
**Inputs:** `start_date`, `end_date`, `user_id`, `org_id`, `leave_type_id`, `is_half_day`, `half_day_type`
**Logic:**
1. Fetch `attendance_holidays` for the date range, filtering by the user's `department_id`, `location_id`, and excluding `excluded_users` (Edge Case 15).
2. Fetch `attendance_weekly_off_rules` applicable to the user.
3. Fetch `attendance_calendar_exceptions` to account for forced working/non-working days (Edge Case 22).
4. Iterate through each date from `start_date` to `end_date`:
   - If `sandwich_rule_applies` is true, count all days (ignore holidays/weekends). **To prevent users from exploiting the sandwich rule by splitting requests (e.g., applying for Friday and Monday separately), the application API must check for adjacent approved leaves (`start_date - 1` and `end_date + 1`) and apply the sandwich deduction dynamically if an adjoining leave is found.**
   - Otherwise, skip days that are holidays, weekly offs, or non-working exceptions.
   - For half-days, add `0.5` instead of `1.0`.
**Output:** `{ total_days, breakdown: [{ date, is_working_day, reason }] }`

### 3.2 Approval Chain Resolver (`approval_chain.utils.js`)
Determines who should approve the leave.
**Inputs:** `user_id`, `org_id`
**Logic:**
1. Query `user_reporting_mappings` where `user_id = requester_id` and `is_active = true`.
2. Based on the requester's role, find the active `reporting_to_id`.
3. If a circular reference is detected (`reporting_to_id === user_id`), or if no active mapping exists, auto-escalate.
4. **Escalation:** Do not assign a specific `approver_user_id`. Instead, set `escalated_to_role = 'hr'` (or `'admin'`) on the request so that any user with that role in the org can see and approve it from a shared queue.
**Output:** `approver_user_id`

### 3.3 Leave Access Control (`leave_access.utils.js`)
Determines which subordinates a manager/HR can see.
**Inputs:** `org_id`, `requesterUser` (the manager/HR)
**Logic:**
- If `hr` or `admin`, return `null` (has access to all org users).
- If `manager`, query `user_reporting_mappings` to get an array of **direct** subordinate `user_id`s (do not query recursively to maintain strict reporting lines).
- If `employee`, return `[]`.

## 4. API Endpoints

### 4.1 Self-Service APIs (`leave_self.routes.js`)
Available to all roles (`employee`, `manager`, `hr`, `admin`). Applicant is always `req.user.id`.

- `POST /api/v1/leaves/request` (Unified Application)
  - **Validations:**
    - Prevent overlap: No existing pending/approved requests for the same date range.
    - Payroll lock: Check `attendance_lock_periods`.
    - Config Rules: Query `employee_leave_configs` to enforce `probation_restriction_days` and `max_negative_balance`.
    - Documents: Require `document_url` if `total_days > requires_document_threshold` (also pulled from config/type).
    - Notice period: Enforce caps if `job_status === 'notice_period'` (Requires querying `employee_profiles`).
    - Cross-Year Constraint: `start_date` and `end_date` must fall within the same calendar year. If spanning years, require the employee to submit two separate requests. Block requests for future years if the `leave_balances` record hasn't been generated yet.
  - **Balance & Concurrency Check (Strict Ordering):**
    - 1. Open Database Transaction.
    - 2. `SELECT ... FOR UPDATE` on the user's `leave_balances` row (Acquire Lock).
    - 3. Query `leave_requests` to sum pending days.
    - 4. Calculate **Effective Balance**: `current_balance - sum(pending_requests_days)`.
    - 5. If `total_days > effective_balance`, compute the split: `paid_days = effective_balance`, `unpaid_days = total_days - effective_balance` (LWP Fallback) or handle Negative Balance (`max_negative_balance`).
  - **Action:** Resolve approver via `approval_chain.utils.js`, create `leave_requests` record (with `paid_days`/`unpaid_days` and `escalated_to_role`), and Commit Transaction.

- `GET /api/v1/leaves/my-requests`
  - Fetch user's own request history with filters (status, date range, type).

- `POST /api/v1/leaves/requests/:id/cancel`
  - **If request is still `pending`:** Set status to `cancelled` immediately (releases phantom hold). No manager approval required.
  - **If request is `approved` and `start_date > today`:** Set status to `cancelled`, refund **`paid_days`** to `current_balance`, decrease `total_used`, and remove `on_leave` from `attendance_records`.
  - **If request is `approved` and `start_date <= today`:** Set status to `cancellation_pending`. Requires manager approval to finalize via the approver APIs, to prevent payroll fraud.

### 4.2 Approver APIs (`leave_approver.routes.js`)
Available to `manager`, `hr`, `admin`.

- `GET /api/v1/leaves/team/requests/pending`
  - Use `getAccessibleUserIds()` to filter requests.
- `GET /api/v1/leaves/team/balances`
  - View subordinates' balances.
- `POST /api/v1/leaves/requests/:id/approve`
  - **Security:** Verify approver has authority over the applicant.
  - **State Handling (Must be wrapped in a Transaction with `SELECT FOR UPDATE` on `leave_requests` and `leave_balances` to prevent double-approvals):** 
    - **If `status === 'pending'` (Normal Approval):** 
      - **ADD** `paid_days` to `leave_balances.total_used` and **SUBTRACT** `paid_days` from `current_balance`.
      - **Attendance Sync (UPSERT):** Push `on_leave` to `attendance_records`. If a record exists with `absent`, update it. If `present`, return a 409 Conflict (rollback transaction). If `half_day`, allow only if the `half_day_type` does not overlap (e.g., worked first-half, leave second-half). **Crucially, copy `half_day_type` from the request to the attendance record if applicable.**
      - Set `leave_requests.status = 'approved'`, `actioned_at = NOW()`, `approved_by = req.user.id`.
    - **If `status === 'cancellation_pending'` (Approving a Cancellation):**
      - **ADD** `paid_days` back to `leave_balances.current_balance` and **SUBTRACT** from `total_used`.
      - Remove future `on_leave` records from `attendance_records` and revert past ones to `absent` (so the cron re-evaluates them).
      - Set `leave_requests.status = 'cancelled'`, `actioned_at = NOW()`, `approved_by = req.user.id`.

- `POST /api/v1/leaves/requests/:id/reject`
  - **State Handling:**
    - **If `status === 'pending'`:** Set `status = 'rejected'`, store `rejection_reason`, free up the "phantom hold" on the balance.
    - **If `status === 'cancellation_pending'`:** Set `status = 'approved'` (reverts the cancellation attempt, leave remains active), store `rejection_reason`.

## 5. Critical Edge Cases & Integrity Handling

### 5.1 Concurrency (The Double-Spend & Double-Approve Problem)
If a user submits two requests simultaneously, they might bypass balance checks. If two managers approve simultaneously, they might double-deduct.
**Solution:** The transaction order must be strictly enforced for Applications: `START TRANSACTION` -> `SELECT FOR UPDATE` on `leave_balances` -> Read `leave_requests` for pending sum -> Check effective balance -> Insert new request -> `COMMIT`. For Approvals, use `SELECT FOR UPDATE` on BOTH the `leave_requests` row and the `leave_balances` row before mutating state.

### 5.2 The "Phantom Hold" (Pending Balances)
A user with 5 days balance applies for 4 days. It is pending. They apply for 2 more days.
**Solution:** The application API dynamically calculates `effective_balance` by summing up all `pending` requests for that leave type and subtracting it from `current_balance` before allowing submission.

### 5.3 Auto-Mark-Absent Cron Race Condition
The `auto_mark_absent` cron runs at 7:00 AM. A manager approves a leave at 8:00 AM.
**Solution:** The approval API uses an **UPSERT** pattern. It attempts to insert `on_leave`. If it hits a unique constraint violation for `(org_id, user_id, date)`, it updates the existing row *only* if the status is `absent`. If the status is `present`, it aborts and warns the manager.

### 5.4 Shift-Rotation Awareness (Night Shifts)
An employee works 10 PM to 6 AM and takes leave.
**Solution:** During approval, query `employee_shift_assignments`. If the shift spans midnight, insert TWO `on_leave` records into `attendance_records` (one for each calendar date) but only deduct `1.0` day from the leave balance.

## 6. Implementation Order (Sequential Workflow)
1. **Utility Layer:** Build `leave_calculator.utils.js`, `approval_chain.utils.js`, and `leave_access.utils.js`. Write exhaustive unit tests for the calculator.
2. **Self-Service Reads:** Implement `GET /my-requests`.
3. **Application API:** Implement `POST /request` with transaction locks and effective balance checks.
4. **Approver Reads:** Implement `GET /team/requests/pending`.
5. **Approval/Rejection API:** Implement `POST /approve` and `POST /reject`, focusing heavily on the Attendance module UPSERT bridge.
6. **Cancellation API:** Implement the split-logic cancellation (direct vs pending).

## 7. Testing Strategy
- **Unit Tests:** Mock the calendar and test the Leave Calculator Engine against holidays, weekends, and the Sandwich Rule.
- **Concurrency Tests:** Fire 5 simultaneous POST requests to `/request` for an employee with 1 day of balance. Verify exactly 1 succeeds and 4 fail.
- **Integration Tests:** 
  - Apply for leave → Check phantom hold → Approve leave → Check Attendance Records.
  - Approve leave where an `absent` record already exists (simulating cron race).
  - Manager applies for leave → Verify it escalates to HR.

## 8. Dependencies and Risks
- **Dependency:** Phase 3 relies completely on Phase 2's personalized `employee_leave_configs` and `leave_balances`.
- **Risk:** Tight coupling with `attendance_records`. If the attendance schema changes, the UPSERT logic in the Approval API will break.
- **Risk:** The `user_reporting_mappings` table must be perfectly maintained. Broken hierarchies will cause leaves to escalate to HR constantly.

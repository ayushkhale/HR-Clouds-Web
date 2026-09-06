# Combined API Analysis: Leave Management (Phases 1, 2, 3, and 5)

This document contains a comprehensive, combined analysis of all APIs implemented across Phases 1, 2, 3, and 5 of the Leave Management Module. Phase 4 and 6 do not introduce net-new endpoints but provide logic/payload enforcements to existing ones. The information herein is derived exclusively from the source implementation and phase analysis Markdown documents.

---

# Phase 1 APIs (Foundation & Rules Engine)

## 1. Create a Leave Type
* **API name / purpose**: Create a Leave Type
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/types`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "name": "Sick Leave",
    "code": "SL",
    "description": "For medical emergencies",
    "is_paid": true,
    "requires_document_threshold": 3,
    "sandwich_rule_applies": false
  }
  ```
* **Request Fields**:
  * `name` (String, Required): The name of the leave type. Min 2, max 100 chars.
  * `code` (String, Required): The identifier code. Alphanumeric, max 10 chars. Must be UNIQUE within the organization.
  * `description` (String, Optional): Max 500 chars.
  * `is_paid` (Boolean, Required): `true` for paid, `false` for LWP. Must be a strict boolean.
  * `requires_document_threshold` (Integer, Optional): Days after which proof (e.g., doctor note) is required.
  * `sandwich_rule_applies` (Boolean, Required): If `true`, intervening weekends are counted as leave.
* **Detailed API Function**: This API creates a global category of leave. It runs Joi validations against the payload and checks for uniqueness of the `code`. If successful, it inserts a new row into the `LeaveType` database table, marking it `is_active: true`. It does not assign any leaves to employees.
* **Error handling**: 409 Conflict (`LEAVE_TYPE_EXISTS`), 400 Bad Request (Validation failure).
* **What This API Gives/Does**: This API accepts a JSON payload to define a new foundational leave rule category. It creates a dictionary record in the `LeaveType` table and returns the generated database record (including its UUID) to the caller.

## 2. List Leave Types
* **API name / purpose**: List Leave Types
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/types`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: 
  * `include_inactive` (Query Parameter, Boolean, Optional): Pass `true` to see soft-deleted types. Pass `false` or omit to only see active ones.
* **Detailed API Function**: This API queries the `LeaveType` table to fetch all global leave types for the organization. It filters out inactive types unless the `include_inactive` query parameter is explicitly provided as `true`.
* **What This API Gives/Does**: This API queries the database and returns an array of existing `LeaveType` objects. The caller receives the active (and optionally inactive) dictionary categories used to populate UI tables and dropdown menus.

## 3. Update a Leave Type
* **API name / purpose**: Update a Leave Type
* **HTTP method**: `PUT`
* **Endpoint / route**: `/api/v1/leaves/types/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`.
* **Request JSON Payload**:
  ```json
  {
    "description": "Updated medical emergency rules"
  }
  ```
* **Request Fields**: 
  * `id` (Path Parameter, UUID, Required): The ID of the leave type to update.
  * The body accepts all fields from the POST schema (`name`, `code`, `description`, `is_paid`, `requires_document_threshold`, `sandwich_rule_applies`). All fields are optional. Only send what changed.
* **Detailed API Function**: This API updates an existing `LeaveType` row. It verifies the record exists via the `id` path parameter and ensures the new `code` (if provided) does not clash with an existing record. It then updates the provided fields in the database.
* **Error handling**: 404 Not Found (`LEAVE_TYPE_NOT_FOUND`), 409 Conflict (`LEAVE_TYPE_EXISTS` if code clashes).
* **What This API Gives/Does**: This API accepts partial JSON updates, modifies the targeted `LeaveType` record in the database, and returns the newly updated database object to the caller.

## 4. Deactivate Leave Type (Soft Delete)
* **API name / purpose**: Deactivate Leave Type
* **HTTP method**: `DELETE`
* **Endpoint / route**: `/api/v1/leaves/types/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required): The ID of the leave type to deactivate.
  * `force` (Query Parameter, Boolean, Optional): If `true`, bypasses the warning about active employee balances.
* **Detailed API Function**: This API deprecates old leave policies without breaking historical balance ledgers. It performs database constraint checks: if pending requests exist, it forcefully aborts. If active balances exist and `force` is not `true`, it aborts with a warning. Otherwise, it updates the `LeaveType` row, setting `is_active = false`. It uses database transaction locks to prevent concurrent data corruption during these checks.
* **Error handling**: 409 Conflict (`ACTIVE_BALANCES_EXIST`), 409 Conflict (`PENDING_REQUESTS_EXIST`).
* **What This API Gives/Does**: This API performs a safe soft-delete on a leave type by changing its `is_active` status to `false` in the database. The caller receives a success message indicating the type is no longer active for new assignments.

## 5. Create a Policy Template
* **API name / purpose**: Create a Policy Template
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/templates`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`.
* **Request JSON Payload**:
  ```json
  {
    "name": "Standard Employee Policy",
    "description": "Applies to all full-time engineers"
  }
  ```
* **Request Fields**:
  * `name` (String, Required): Max 100 chars. Must be unique.
  * `description` (String, Optional): Max 500 chars.
* **Detailed API Function**: This API creates an empty template bucket to hold leave quotas. It validates the payload and inserts a new row into the Policy Templates table.
* **What This API Gives/Does**: This API accepts a template name and creates a new, empty policy template record in the database. It returns the newly created template entity to the caller.

## 6. List Policy Templates
* **API name / purpose**: List Policy Templates
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/templates`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: None.
* **Detailed API Function**: This API queries the database to fetch all policy templates belonging to the organization.
* **What This API Gives/Does**: This API retrieves an array of all policy template records in the organization and returns them to the caller.

## 7. Update a Policy Template
* **API name / purpose**: Update a Policy Template
* **HTTP method**: `PUT`
* **Endpoint / route**: `/api/v1/leaves/templates/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "name": "Updated Policy Name",
    "description": "Updated policy description"
  }
  ```
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
  * `name` (String, Optional): Max 100 chars. Must be unique.
  * `description` (String, Optional): Max 500 chars.
* **Detailed API Function**: This API updates an existing policy template. It verifies the record exists and updates the provided fields in the database.
* **Error handling**: 404 Not Found (`TEMPLATE_NOT_FOUND`).
* **What This API Gives/Does**: This API accepts partial JSON updates, modifies the targeted policy template in the database, and returns the newly updated database object to the caller.

## 8. Delete a Policy Template
* **API name / purpose**: Delete a Policy Template
* **HTTP method**: `DELETE`
* **Endpoint / route**: `/api/v1/leaves/templates/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
* **Detailed API Function**: This API performs a hard cascade delete of a policy template. Wrapped in a database transaction, it first verifies the template exists. It then deletes all child entitlements via `leavePolicyEntitlementRepo.deleteByTemplateId` to ensure no orphaned quotas remain, before finally deleting the template record itself.
* **Error handling**: 404 Not Found (`TEMPLATE_NOT_FOUND`).
* **What This API Gives/Does**: This API completely removes a policy template and all its associated entitlement rules from the database to ensure data integrity, returning a success confirmation to the caller.

## 9. Add Entitlement (Quota) to a Template
* **API name / purpose**: Add Entitlement
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/templates/:templateId/entitlements`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`.
* **Request JSON Payload**:
  ```json
  {
    "leave_type_id": "a1b2c3d4-...",
    "annual_quota": 12,
    "accrual_type": "upfront",
    "max_carry_forward": 5,
    "probation_restriction_days": 90,
    "max_negative_balance": 0
  }
  ```
* **Request Fields**:
  * `templateId` (Path Parameter, UUID, Required): The parent policy template.
  * `leave_type_id` (UUID, Required): Must be an active leave type.
  * `annual_quota` (Number, Required): 0 to 365. Can be decimal.
  * `accrual_type` (String, Required): Must be `'upfront'` or `'monthly'`.
  * `max_carry_forward` (Number, Optional, Default `0`): Days that roll over.
  * `probation_restriction_days` (Integer, Optional, Default `0`): Strict integer representing days from joining before use.
  * `max_negative_balance` (Number, Optional, Default `0`): Overdraft limit.
* **Detailed API Function**: This API creates the mathematical rule linking a Leave Type to a Policy Template. It validates that the parent template exists and that no duplicate entitlement for this specific leave type exists in this template. It inserts a new `LeavePolicyEntitlement` record.
* **Error handling**: 409 Conflict (`ENTITLEMENT_EXISTS`).
* **What This API Gives/Does**: This API validates mathematical constraints and creates a new configuration record linking a leave type to a policy template. It returns the inserted database entitlement row to the caller.

## 10. Update / Delete Entitlements
* **API name / purpose**: Update / Delete Entitlements
* **HTTP method**: `PUT`, `DELETE`
* **Endpoint / route**: `/api/v1/leaves/templates/:templateId/entitlements/:entitlementId`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`.
* **Request JSON Payload**:
  * `PUT`: Takes the same JSON body schema as the POST entitlement endpoint. Note: `leave_type_id` is IMMUTABLE and cannot be changed.
  * `DELETE`: This API does not use a JSON body.
* **Request Fields**:
  * `templateId` (Path Parameter, UUID, Required)
  * `entitlementId` (Path Parameter, UUID, Required)
* **Detailed API Function**: 
  * `PUT` modifies the non-immutable fields of the entitlement in the database. It does NOT retroactively recalculate existing employee balances.
  * `DELETE` removes the `LeavePolicyEntitlement` row.
* **What This API Gives/Does**: The PUT API modifies an existing entitlement rule and returns the updated record. The DELETE API permanently removes the rule from the template and returns a success confirmation. Neither API affects employees who were previously assigned the template.

---

# Phase 2 APIs (Policy Assignment & Balance Engine)

## 11. Assign Policy to User
* **API name / purpose**: Assign Policy to User
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/assign-policy`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "template_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0"
  }
  ```
* **Request Fields**:
  * `userId` (Path Parameter, UUID, Required): The employee receiving the policy.
  * `template_id` (UUID, Required): Valid ID from the `leave_policy_templates` table.
* **Detailed API Function**: This API assigns a template bundle to an employee and triggers the backend Pro-Rata Math Engine. It wraps the following in a strict database transaction:
  1. Identifies any existing, orphaned configurations and soft-deletes them.
  2. Copies the rules from the template and inserts new historical config records for the user.
  3. Calculates prorated `total_accrued` days for the current year based on the employee's `joining_date` and leap years, rounded to the nearest 0.5 days.
  4. Upserts the calculated values into the user's `leave_balances` ledger.
* **Error handling**: 404 (`EMPLOYEE_NOT_FOUND`), 404 (`TEMPLATE_NOT_FOUND`), 500 (Transaction failure).
* **What This API Gives/Does**: This API runs an automated math engine to calculate prorated quotas based on joining dates, closes obsolete policies, creates new config records, deposits the calculated leave balances into the database ledger, and returns a success confirmation.

## 12. Override Employee Leave Configuration
* **API name / purpose**: Override Employee Leave Configuration
* **HTTP method**: `PUT`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/configs/:leaveTypeId`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "assigned_annual_quota": 24,
    "max_negative_balance": 5
  }
  ```
* **Request Fields**:
  * `userId` (Path Parameter, UUID, Required).
  * `leaveTypeId` (Path Parameter, UUID, Required).
  * `assigned_annual_quota` (Number, Optional).
  * `accrual_type` (String, Optional, 'upfront' or 'monthly').
  * `max_carry_forward` (Number, Optional).
  * `probation_restriction_days` (Integer, Optional).
  * `max_negative_balance` (Number, Optional).
* **Detailed API Function**: This API detaches an individual employee's rule from the strict template defaults. Unsent fields remain at their current values. It creates a new historical config record. If the `assigned_annual_quota` is increased for an 'upfront' policy, the engine calculates the difference and automatically updates the `leave_balances` wallet to reflect the new total.
* **Error handling**: 404 (`CONFIG_NOT_FOUND`), 400 Bad Request if no fields are provided.
* **What This API Gives/Does**: This API accepts partial rule updates, creates a new active historical config record in the database, recalculates the user's ledger balances automatically, and returns the newly generated configuration record.

## 13. Get User Balances (Admin)
* **API name / purpose**: Get User Balances (Admin)
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/balances`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `userId` (Path Parameter, UUID, Required).
  * `year` (Query Parameter, Integer, Optional): Defaults to the current calendar year.
* **Detailed API Function**: This API fetches the leave ledger for an employee. It performs a database `SELECT` on `leave_balances` and joins the `leave_types` table to fetch the human-readable names and codes. If a user has no policy assigned, it safely returns an empty array `[]`. It intentionally returns `0` mid-month for monthly accruals until cron jobs run.
* **Response structure**: Returns an array of objects where `total_accrued`, `total_used`, and `current_balance` are returned as strings (PostgreSQL DECIMAL preservation).
* **What This API Gives/Does**: This API executes a joined query to retrieve a user's numerical leave balances and the textual metadata for each leave type. It returns this ledger data as an array to the caller.

## 14. Get My Balances (Employee Self-Service)
* **API name / purpose**: Get My Balances
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/my-balances`
* **Authentication / authorization requirements**: Requires Token. Roles: Any authenticated user. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `year` (Query Parameter, Integer, Optional): Defaults to the current calendar year.
* **Detailed API Function**: Functions exactly identically to the Admin balance fetcher, but strictly scopes the query to the authenticated user's ID derived from their token.
* **What This API Gives/Does**: This API queries the database for the authenticated user's personal leave ledger and returns an array of balance records to display available quotas.

## 14b. Get My Leave Types
* **API name / purpose**: Get My Leave Types
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/my-leave-types`
* **Authentication / authorization requirements**: Requires Token. Roles: Any authenticated user. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Detailed API Function**: Uses `leaveBalanceService.getMyLeaveTypes` to return only active leave types applicable to the caller, including their per-user configuration. Used for populating the leave application form dropdown.
* **What This API Gives/Does**: Retrieves an array of leave types configured specifically for the authenticated user.

---

# Phase 3 APIs (Leave Application & Approval)

## 15. Submit a Leave Request
* **API name / purpose**: Submit a Leave Request
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/request`
* **Authentication / authorization requirements**: Requires Token. Feature: `leave.access`. Tenant isolated.
* **Request JSON Payload**:
  ```json
  {
    "leave_type_id": "a1b2...",
    "start_date": "2026-10-10",
    "end_date": "2026-10-10",
    "is_half_day": false,
    "half_day_type": null,
    "reason": "Personal time",
    "document_url": null
  }
  ```
* **Request Fields**:
  * `leave_type_id` (UUID, Required): Must exist in `leave_types`.
  * `start_date` (String, Required): Literal format `YYYY-MM-DD`. No timezones.
  * `end_date` (String, Required): Literal format `YYYY-MM-DD`. Must be >= `start_date` and within the same year.
  * `is_half_day` (Boolean, Optional, Default `false`): If true, `start_date` and `end_date` must be identical.
  * `half_day_type` (String, Required if `is_half_day` is true): Must be `first_half` or `second_half`.
  * `reason` (String, Optional): Max 1000 characters.
  * `document_url` (String, Optional): Valid URI. Required if the requested duration exceeds the config's document threshold.
* **Detailed API Function**: This is the core entry point for leave applications. It executes a complex engine:
  - **Phantom Holds**: Calculates an `effectiveBalance` dynamically by summing up all pending requests in the database to prevent double-spending.
  - **LWP Fallback**: Automatically splits the request into `paid_days` and `unpaid_days` (LWP) if the request exceeds the effective balance + max negative balance.
  - **Sandwich Rule Checks**: Dynamically searches the database for adjacent leaves within a 3-day window to prevent exploits dodging weekend deductions.
  - **Database Interaction**: Inserts the final calculated object into the `leave_requests` table with `status: "pending"`.
* **Error handling**: 400 Bad Request (Overlap exist, cross-year failure, no working days, or Sandwich rule violation).
* **What This API Gives/Does**: This API runs a calendar engine against the requested dates, enforces sandwich rules and LWP fallbacks, calculates exactly how many days are paid vs unpaid, creates a pending request row in the database, and returns the inserted request along with a detailed day-by-day breakdown array.

## 16. Cancel a Leave Request
* **API name / purpose**: Cancel a Leave Request
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/requests/:id/cancel`
* **Authentication / authorization requirements**: Requires Token. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
* **Detailed API Function**: This API allows employees to cancel leaves. To prevent payroll fraud, it checks the timeline. If the leave is entirely in the future, it automatically updates `leave_requests` to `cancelled`, deletes associated `attendance_records`, and refunds `leave_balances`. If the leave date is today or in the past, it changes the status to `cancellation_pending` and halts, waiting for Manager/HR approval.
* **Error handling**: 400 Bad Request (Cannot cancel already rejected/cancelled). 404 Not Found (User attempting to cancel someone else's leave).
* **What This API Gives/Does**: This API evaluates the date of a leave, refunds the database ledger if the leave is in the future, or flags the record for managerial review if it is in the past, returning the new status (`cancelled` or `cancellation_pending`) to the caller.

## 17. Get My Requests
* **API name / purpose**: Get My Requests
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/my-requests`
* **Authentication / authorization requirements**: Requires Token. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: None.
* **Detailed API Function**: This API performs a `SELECT` query on the `leave_requests` table filtering strictly by the authenticated user's ID, ordered by `created_at` DESC.
* **What This API Gives/Does**: This API queries the database for all leave request records belonging to the caller and returns the chronologically sorted array of history data.

## 17b. Get Single Request
* **API name / purpose**: Get Single Leave Request
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/requests/:id`
* **Authentication / authorization requirements**: Requires Token. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
* **Detailed API Function**: Fetches a single leave request. Enforces self-ownership in the database query predicate (`user_id` + `org_id`) to prevent Insecure Direct Object Reference (IDOR). Returns 404 on miss.
* **What This API Gives/Does**: Returns the details of a single historical leave application owned by the caller.

## 18. List Team Pending Requests
* **API name / purpose**: List Team Pending Requests
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/team/requests/pending`
* **Authentication / authorization requirements**: Requires Token. Roles: `manager`, `hr`, `admin`, `super-admin`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: None.
* **Detailed API Function**: This API retrieves all `pending` and `cancellation_pending` requests. It utilizes strict Broken Object Level Authorization (BOLA) guards: Managers only receive results for users directly beneath them in the `user_reporting_mappings` table. Global roles (HR, Admin) bypass the filter and receive the entire organizational queue.
* **Important edge cases explicitly handled**: Currently lacks pagination, returning the entire authorized queue in a single array.
* **What This API Gives/Does**: This API evaluates the user's role and hierarchy, queries the database for pending requests within their allowed scope, joins applicant metadata, and returns the comprehensive list of pending items requiring action.

## 19. Approve Leave Request
* **API name / purpose**: Approve Leave Request
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/requests/:id/approve`
* **Authentication / authorization requirements**: Requires Token. Roles: `manager`, `hr`, `admin`, `super-admin`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
* **Detailed API Function**: This API finalizes a pending request.
  1. Enforces BOLA guards (managers cannot approve outside their chain) and blocks Self-Approval exploits.
  2. **Negative Guard**: Re-verifies that `current_balance` minus `paid_days` does not exceed the allowed `max_negative_balance` at the exact moment of approval.
  3. **Shift Rotation**: For overnight workers, taking a full day off generates TWO `on_leave` records in `attendance_records` but deducts only 1.0 day from the balance. Half-days strictly bypass this logic.
  4. Performs a safe database UPSERT on `attendance_records` to prevent cron race conditions, deducts balances, and updates the request status to `approved`.
* **Error handling**: 403 Forbidden (BOLA/Self-Approval). 400 Bad Request (Negative limit hit, or employee marked present). 500 (If non-UUID passed).
* **What This API Gives/Does**: This API verifies the approver's permissions, performs final mathematical checks against the ledger, updates the request to "approved" in the database, generates explicit attendance records for those dates, and returns the finalized database object.

## 20. Reject Leave Request
* **API name / purpose**: Reject Leave Request
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/requests/:id/reject`
* **Authentication / authorization requirements**: Requires Token. Roles: `manager`, `hr`, `admin`, `super-admin`.
* **Request JSON Payload**:
  ```json
  {
    "rejection_reason": "Not enough coverage"
  }
  ```
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
  * `rejection_reason` (String, Required): Max 1000 characters. Mandatory justification for rejection.
* **Detailed API Function**: This API rejects a request or denies a cancellation. It strictly enforces BOLA and blocks Self-Rejection exploits. It verifies the payload contains the mandatory reason, then updates the `status` to `rejected` and stores the `rejection_reason` in the `leave_requests` table.
* **Error handling**: 403 Forbidden (BOLA/Self-Rejection). 404 Not Found.
* **What This API Gives/Does**: This API verifies approver privileges, updates the database status of the leave request to "rejected", saves the provided reason text, and returns the modified database object to the caller.

## 20b. Get Team Leave Requests
* **API name / purpose**: Get Team Leave Requests
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/team/requests`
* **Authentication / authorization requirements**: Requires Token. Roles: `manager`, `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: 
  * `status` (Query Parameter, String, Optional).
  * `user_id` (Query Parameter, UUID, Optional).
  * `page`, `limit` (Query Parameters, Integer, Optional).
* **Detailed API Function**: Retrieves team leave history (any status). Scoped to direct reports for managers, or org-wide for HR. Includes bounded pagination. For managers, the `user_id` filter is validated against their scope as a BOLA guard.

## 20c. Get Team Member Leave Requests
* **API name / purpose**: Get Team Member Leave Requests
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/team/member/:userId/requests`
* **Authentication / authorization requirements**: Requires Token. Roles: `manager`, `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `userId` (Path Parameter, UUID, Required).
* **Detailed API Function**: Retrieves a specific direct report's leave history. Fully scoped to ensure managers can only access their direct reports.

## 20d. Get Team Member Leave Balances
* **API name / purpose**: Get Team Member Leave Balances
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/team/member/:userId/balances`
* **Authentication / authorization requirements**: Requires Token. Roles: `manager`, `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `userId` (Path Parameter, UUID, Required).
* **Detailed API Function**: Fetches a specific direct report's leave wallet at approval time. Reuses the core `leaveBalanceService`. Fully scoped.

---

# Phase 5 APIs (Automation & Maintenance)

## 21. Trigger Monthly Accrual (Manual Run)
* **API name / purpose**: Trigger Monthly Accrual (Manual Run)
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/automation/accrual/run`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "reference_date": "2026-09-01"
  }
  ```
* **Request Fields**:
  * `reference_date` (String, Optional): Format `YYYY-MM-DD`. Allows testing in future or past.
* **Detailed API Function**: Executes the Monthly Accrual engine for the caller's organization. Provides a deterministic way to trigger the monthly quota generation without waiting for the cron. Idempotent.
* **What This API Gives/Does**: Calculates and updates `total_accrued`, `current_balance`, and sets `last_accrued_period` in `LeaveBalance`, safely skipping those already credited.

## 22. Trigger Year-End Rollover (Manual Run)
* **API name / purpose**: Trigger Year-End Rollover (Manual Run)
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/automation/rollover/run`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "reference_date": "2027-01-01"
  }
  ```
* **Request Fields**:
  * `reference_date` (String, Optional): Format `YYYY-MM-DD`. Allows testing across year boundaries.
* **Detailed API Function**: Executes the Year-End Rollover engine for the caller's organization. Closes the previous year (sets `lapsed_balance`) and opens the new year (carries forward balances, seeds new quotas). Idempotent.
* **What This API Gives/Does**: Triggers Jan 1st rollover logic safely skipping finalized balances.

---
*End of Analysis*

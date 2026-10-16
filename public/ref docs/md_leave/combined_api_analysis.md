# Combined API Analysis: Leave Management (Phases 1, 2, 3, 5, and 7)

This document contains a comprehensive, combined analysis of all APIs implemented across Phases 1, 2, 3, 5, and 7 of the Leave Management Module. Phase 7 (2026-10-02) adds the policy assignment ledger, coverage roster, bulk assignment, ending and reverting. Phase 4 and 6 do not introduce net-new endpoints but provide logic/payload enforcements to existing ones. The information herein is derived exclusively from the source implementation and phase analysis Markdown documents.

---

# Phase 1 APIs (Foundation & Rules Engine)

## 1. Create a Leave Type
* **API name / purpose**: Create a Leave Type
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/types`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: 
  * `include_inactive` (Query Parameter, Boolean, Optional): Pass `true` to see soft-deleted types. Pass `false` or omit to only see active ones.
* **Detailed API Function**: This API queries the `LeaveType` table to fetch all global leave types for the organization. It filters out inactive types unless the `include_inactive` query parameter is explicitly provided as `true`.
* **What This API Gives/Does**: This API queries the database and returns an array of existing `LeaveType` objects. The caller receives the active (and optionally inactive) dictionary categories used to populate UI tables and dropdown menus.

## 3. Update a Leave Type
* **API name / purpose**: Update a Leave Type
* **HTTP method**: `PUT`
* **Endpoint / route**: `/api/v1/leaves/types/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: None.
* **Detailed API Function**: This API queries the database to fetch all policy templates belonging to the organization, with their entitlements. Since Phase 7 each template also carries `assigned_user_count`: the number of members whose live (not yet ended) assignment is on it, computed in one grouped query over the assignment ledger. Members whose membership was removed do not count. It is the same count the delete guard (§8) refuses on.
* **Response structure**: An array of templates, each with `entitlements[]` and `assigned_user_count` (integer, `0` when nobody is on it).
* **What This API Gives/Does**: This API retrieves an array of all policy template records in the organization, each with its headcount, and returns them to the caller.

## 7. Update a Policy Template
* **API name / purpose**: Update a Policy Template
* **HTTP method**: `PUT`
* **Endpoint / route**: `/api/v1/leaves/templates/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
* **Detailed API Function**: This API deletes a policy template (soft delete) and its entitlements. Wrapped in a database transaction, it locks the template row `FOR UPDATE`, so an assignment in flight (which share-locks the row) either finishes first and is counted, or waits and finds the template gone. It then counts members with a live assignment on the template. If any exist, it refuses. Otherwise it deletes all child entitlements via `leavePolicyEntitlementRepo.deleteByTemplateId`, then the template record. Ended assignments do not block deletion; their history keeps the name through `template_name_snapshot`.
* **Error handling**: 404 Not Found (`TEMPLATE_NOT_FOUND`); 409 Conflict (`TEMPLATE_IN_USE`, `details: { assigned_user_count }`) while anyone is on the policy.
* **What This API Gives/Does**: This API removes an unused policy template and its entitlement rules, refuses while people are on it, and returns a success confirmation to the caller.

## 9. Add Entitlement (Quota) to a Template
* **API name / purpose**: Add Entitlement
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/templates/:id/entitlements`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Endpoint / route**: `/api/v1/leaves/templates/:id/entitlements/:entitlementId`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  {
    "template_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "effective_from": "2026-10-02"
  }
  ```
* **Request Fields**:
  * `userId` (Path Parameter, UUID, Required): The employee receiving the policy.
  * `template_id` (UUID, Required): Valid ID from the `leave_policy_templates` table.
  * `effective_from` (String `YYYY-MM-DD`, Optional, Phase 7): Must equal today on the IST business calendar. Future-dated assignments are not supported yet.
* **Detailed API Function**: This API assigns a template bundle to an employee and triggers the backend Pro-Rata Math Engine. It wraps the following in a strict database transaction:
  1. Share-locks the template row and loads its usable entitlements (active leave types only). A template with none is refused (`TEMPLATE_EMPTY`). Before Phase 7, such a template closed every config the person had.
  2. Takes the per-member advisory lock `leaveassign:{org}:{user}`, so concurrent assignments (for example a double-click) serialise instead of failing on the config unique index.
  3. Resolves the member's **membership role** profile, never a fixed employee → manager → hr probe. It requires an active membership (`EMPLOYEE_INACTIVE`) and a joining date (`NO_JOINING_DATE`; no longer silently "today").
  4. If the member's current assignment is already on this template, nothing is written (`outcome: "unchanged"`, overrides kept).
  5. Otherwise it closes the current ledger row and inserts a new one (`assigned_by`, template name snapshot). It closes orphaned configs, keeping their balances, and copies the rules into new configs linked to the assignment. The as-copied values go in `template_values`, and `overridden_fields` is empty.
  6. Calculates `total_accrued` for the current IST year. Same-type upfront changes apply the quota difference pro-rated from 1 January (or the joining date if the person joined this year). A type re-added after another policy removed it this year is diffed against its closed config, so it is not credited twice. Accrual is floored at `total_used`; taken days are never reset.
  7. Upserts the calculated values into the user's `leave_balances` ledger.
* **Response structure**: `{ "success": true, "message": "...", "data": { "assignment_id", "outcome": "assigned" | "unchanged", "types_added": [codes], "types_removed": [codes], "types_updated": [codes], "overrides_replaced": [codes] } }`.
* **Error handling**:
  * 404: `EMPLOYEE_NOT_FOUND`, `TEMPLATE_NOT_FOUND`.
  * 409: `EMPLOYEE_INACTIVE`.
  * 400: `TEMPLATE_EMPTY`, `NO_JOINING_DATE`, `EFFECTIVE_DATE_NOT_SUPPORTED`.
* **What This API Gives/Does**: This API records the assignment in the ledger, calculates prorated quotas from joining dates, closes obsolete configs, creates new linked config records, deposits the balances, and returns what changed.

## 12. Override Employee Leave Configuration
* **API name / purpose**: Override Employee Leave Configuration
* **HTTP method**: `PUT`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/configs/:leaveTypeId`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
  * `notice_period_max_days` (Integer or null, Optional).
* **Detailed API Function**: This API detaches an individual employee's rule from the strict template defaults. Unsent fields remain at their current values. Under the per-member advisory lock, it creates a new historical config record. The record keeps the config's `assignment_id`, its `template_values` and the end date of an assignment that is ending. `overridden_fields` lists the fields that now differ from the policy as assigned; it is empty for a legacy config with no recorded policy. If the `assigned_annual_quota` is increased for an 'upfront' policy, the engine calculates the difference and automatically updates the `leave_balances` wallet to reflect the new total. A missing joining date is `NO_JOINING_DATE`.
* **Error handling**: 404 (`CONFIG_NOT_FOUND`); 409 (`LEAVE_CONFIG_ENDED`) when the config's assignment already ended; 400 (`NO_JOINING_DATE`); 400 Bad Request if no fields are provided.
* **What This API Gives/Does**: This API accepts partial rule updates, creates a new active historical config record in the database, recalculates the user's ledger balances automatically, and returns the newly generated configuration record.

## 13. Get User Balances (Admin)
* **API name / purpose**: Get User Balances (Admin)
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/balances`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `all` (`employee`, `manager`, `hr`, `admin`, `super-admin`). Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**:
  * `year` (Query Parameter, Integer, Optional): Defaults to the current calendar year.
* **Detailed API Function**: Functions exactly identically to the Admin balance fetcher, but strictly scopes the query to the authenticated user's ID derived from their token.
* **What This API Gives/Does**: This API queries the database for the authenticated user's personal leave ledger and returns an array of balance records to display available quotas.

## 14b. Get My Leave Types
* **API name / purpose**: Get My Leave Types
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/my-leave-types`
* **Authentication / authorization requirements**: Requires Token. Roles: `all` (`employee`, `manager`, `hr`, `admin`, `super-admin`). Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Detailed API Function**: Uses `leaveBalanceService.getMyLeaveTypes` to return only active leave types applicable to the caller, including their per-user configuration. Used for populating the leave application form dropdown. Since Phase 7 a config whose assignment was ended (§29) stays listed until its `config.effective_to` date (returned in `config`) and drops out after it.
* **What This API Gives/Does**: Retrieves an array of leave types configured specifically for the authenticated user.

---

# Phase 3 APIs (Leave Application & Approval)

## 15. Submit a Leave Request
* **API name / purpose**: Submit a Leave Request
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/request`
* **Authentication / authorization requirements**: Requires Token. Roles: `all` (`employee`, `manager`, `hr`, `admin`, `super-admin`). Feature: `leave.access`. Tenant isolated.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `all` (`employee`, `manager`, `hr`, `admin`, `super-admin`). Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `all` (`employee`, `manager`, `hr`, `admin`, `super-admin`). Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: None.
* **Detailed API Function**: This API performs a `SELECT` query on the `leave_requests` table filtering strictly by the authenticated user's ID, ordered by `created_at` DESC.
* **What This API Gives/Does**: This API queries the database for all leave request records belonging to the caller and returns the chronologically sorted array of history data.

## 17b. Get Single Request
* **API name / purpose**: Get Single Leave Request
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/requests/:id`
* **Authentication / authorization requirements**: Requires Token. Roles: `all` (`employee`, `manager`, `hr`, `admin`, `super-admin`). Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`, `admin`, `super-admin`. Feature: `leave.access`.
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

# Phase 7 APIs (Assignment Ledger, Bulk Assignment & Coverage)

All Phase 7 routes require a token with role **`hr`** only. `admin` and `super-admin` are platform roles with no organisation and are refused. Feature: `leave.access`. Dates are IST business dates (`YYYY-MM-DD`, inclusive). The ledger (`employee_leave_policy_assignments`, migration 00066) records which template each member is on. Members who had configs before the ledger existed get one **legacy** row with `template_id = null`; re-assigning a policy makes them tracked.

## 23. Leave Assignment Coverage Roster
* **API name / purpose**: Who is on which leave policy, and who is on none.
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/assignments`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields** (query):
  * `template_id` (UUID, Optional).
  * `coverage` (`on_policy` | `legacy` | `none`, Optional).
  * `has_overrides` (Boolean, Optional).
  * `department_id` (UUID, Optional).
  * `role` (`employee` | `manager` | `hr`, Optional).
  * `q` (String ≤ 150, Optional): matches name, email or employee code.
  * `page` (Integer ≥ 1, default 1).
  * `limit` (Integer 1–100, default 20).
* **Detailed API Function**: The base set is the active members of the organisation (active membership, active user), the same people `GET /organizations/employees` lists. Each member's current assignment (activated, started, not ended on today) is joined. The role profile is joined on the membership role. Filters and the total run in SQL; the page is hydrated with the #8 user block (presigned avatars) and `assigned_by` names, with no N+1.
* **Response structure**:
  ```json
  { "total": 150, "page": 1, "limit": 20, "rows": [ {
      "user": { "user_id": "…", "name": "Asha Menon", "email": "…", "role": "employee", "employee_code": "E-104", "department": "Engineering", "designation": "Backend Dev", "avatar_url": null, "gender": "female" },
      "coverage": "on_policy",
      "assignment": { "id": "…", "template": { "id": "…", "name": "Standard 2026", "entitlement_count": 4 }, "legacy": false,
                      "effective_from": "2026-01-01", "effective_to": null, "state": "ongoing", "override_count": 0,
                      "assigned_by": { "id": "…", "name": "Rahul Gupta" }, "assigned_at": "2026-01-01T06:12:44.000Z" } } ] }
  ```
  `assignment` is `null` when `coverage` is `none`.
* **Error handling**: 400 (`VALIDATION_ERROR`) for an unknown or invalid query parameter; 403 (`FORBIDDEN`) for a non-HR role.
* **What This API Gives/Does**: Returns one paginated, filterable row per active member with their current policy, dates, state and override count, including members with no policy.

## 24. Leave Assignment Summary
* **API name / purpose**: Coverage tile counts.
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/assignments/summary`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: None.
* **Detailed API Function**: One aggregate query over the same population as §23, plus per-template headcounts (the §6 count).
* **Response structure**: `{ "on_policy": 142, "legacy": 3, "unassigned": 8, "with_overrides": 11, "templates": [{ "id": "…", "name": "Standard 2026", "assigned_user_count": 118 }] }`.
* **What This API Gives/Does**: Returns the counts behind the coverage tiles in one call.

## 25. Get a Member's Effective Leave Configuration
* **API name / purpose**: What applies to one member now, against their policy.
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/leave-config`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: `userId` (Path Parameter, UUID, Required). Any member of the organisation, active or not.
* **Detailed API Function**: Loads the current assignment and the member's live configs still in force today (retired leave types included, flagged). For each type it returns:
  * `effective`: the config values now;
  * `policy_default`: the template values as assigned;
  * `template_current`: the template's live entitlement, so drift after a template edit is visible. It is null if the entitlement or template is gone, or the config belongs to another assignment;
  * the override flags.

  Legacy configs report `null` for `policy_default`, `template_current`, `is_overridden` and `overridden_fields`.
* **Response structure**: `{ "user_id", "assignment": { …as §23 } | null, "types": [{ "leave_type_id", "leave_type": { "name", "code", "is_active" }, "config_id", "effective_from", "effective_to", "effective": { "assigned_annual_quota", "accrual_type", "max_carry_forward", "probation_restriction_days", "max_negative_balance", "notice_period_max_days" }, "policy_default": { "annual_quota", … } | null, "template_current": { … } | null, "is_overridden": true | false | null, "overridden_fields": ["assigned_annual_quota"] | null }] }`.
* **Error handling**: 404 (`EMPLOYEE_NOT_FOUND`).
* **What This API Gives/Does**: Lets the Customise form prefill current values and show the policy default beside each override.

## 26. Get a Member's Assignment History
* **API name / purpose**: Every policy a member has been on.
* **HTTP method**: `GET`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/assignments`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: `userId` (Path Parameter, UUID, Required).
* **Detailed API Function**: Lists the member's ledger rows, newest first, ended ones included, at most 100. The template name survives a rename or delete via the snapshot.
* **Response structure**: An array of the §23 `assignment` shape plus `source` (`assign` | `bulk` | `legacy_backfill`), `ended_by` `{ id, name }`, `ended_at` and `end_reason`.
* **Error handling**: 404 (`EMPLOYEE_NOT_FOUND`).
* **What This API Gives/Does**: Answers "who put her on this, and when" for the record inspector.

## 27. Preview a Bulk Assignment
* **API name / purpose**: Dry run of assigning one policy to many people; writes nothing.
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/assignments/preview`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**:
  ```json
  { "template_id": "uuid", "effective_from": "2026-10-02",
    "target_departments": ["uuid"], "target_locations": [], "target_employment_types": ["full_time"],
    "target_job_statuses": [], "included_users": [], "excluded_users": [], "scope": "selection" }
  ```
* **Request Fields**:
  * `template_id` (UUID, Required).
  * `effective_from` (Optional, today only).
  * `target_departments`, `target_locations`, `included_users`, `excluded_users` (UUID arrays, ≤ 500 each).
  * `target_employment_types`: `full_time` | `part_time` | `contract` | `intern`. Only employee profiles carry an employment type, so managers and HR never match a non-empty filter.
  * `target_job_statuses`: `probation` | `confirmed` | `notice_period` | `terminated` | `trainee` | `contract` | `temporary`.
  * `scope` (`selection` | `all`, default `selection`): must be `all` when every array is empty.
* **Detailed API Function**:
  1. Validates the template (`TEMPLATE_EMPTY`) and that the targeted departments and locations belong to the org.
  2. Resolves the active members, matched with the same targeting predicate as holidays, weekly-offs and org documents. Precedence: excluded wins, included restricts, then each attribute array.
  3. Classifies each member:
     * `unchanged`: already on this template;
     * `changing`: moving from another policy, from a legacy one, or from none (`from_template: null`), with `types_added`, `types_removed` and `overrides_replaced`;
     * `blocked`: `NO_JOINING_DATE` or `NO_ROLE_PROFILE`.
  4. Returns a `preview_token`: a fingerprint of the template's entitlements and of each matched member's current assignment.
* **Response structure**: `{ "template": { "id", "name" }, "matched": 34, "cap": 200, "over_cap": false, "preview_token": "64-hex", "unchanged": [{ "user_id", "name", "reason": "ALREADY_ON_TEMPLATE" }], "changing": [{ "user_id", "name", "from_template", "legacy", "types_added", "types_removed", "overrides_replaced" }], "blocked": [{ "user_id", "name", "reason" }] }`.
* **Error handling**:
  * 400: `TARGETING_REQUIRED`, `INVALID_TARGETING` (`details.unknown_departments` / `unknown_locations`), `TEMPLATE_EMPTY`, `EFFECTIVE_DATE_NOT_SUPPORTED`, `VALIDATION_ERROR`.
  * 404: `TEMPLATE_NOT_FOUND`.
* **What This API Gives/Does**: Shows HR exactly what a bulk assignment will do, before it happens.

## 28. Bulk Assign a Policy
* **API name / purpose**: Assign one policy to a selection.
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/assignments/bulk`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: As §27, plus optional `"preview_token": "<64-hex from the preview>"`.
* **Request Fields**: As §27; `preview_token` (64 hex chars, Optional).
* **Detailed API Function**:
  1. Re-resolves the selection exactly like the preview.
  2. Refuses above the cap of 200 people, or when the supplied token no longer matches.
  3. Runs **one transaction per person** (template share lock plus member lock, then the §11 engine with `source = 'bulk'` and a shared `bulk_request_id`).
  4. A failure is isolated to that person and reported with its code. Retrying is safe: people already done come back as `skipped`.
* **Response structure**: `{ "bulk_request_id": "uuid", "template": { "id", "name" }, "matched": 34, "assigned": [{ "user_id", "name", "assignment_id", "outcome", "types_added", "types_removed", "types_updated", "overrides_replaced" }], "skipped": [{ "user_id", "name", "reason" }], "failed": [{ "user_id", "name", "code", "message"? }] }`. HTTP 200 even when some people failed.
* **Error handling**: 400 (`BULK_LIMIT_EXCEEDED`, `details: { cap, matched }`); 409 (`PREVIEW_STALE`); plus the §27 errors.
* **What This API Gives/Does**: Assigns a policy to up to 200 people and reports the outcome per person.

## 29. End an Assignment
* **API name / purpose**: Stop a policy applying from a date.
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/leaves/assignments/:id/end`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: `{ "effective_to": "2026-10-31", "reason": "Resigned" }`
* **Request Fields**:
  * `id` (Path Parameter, UUID, Required).
  * `effective_to` (String `YYYY-MM-DD`, Required): today or later, and not before the assignment started.
  * `reason` (String ≤ 500, Optional).
* **Detailed API Function**: Under the member lock and the per-(user, leave type) submission locks, the assignment is refused while any pending, approved or cancellation-pending leave of its types ends after `effective_to`. On success it stamps `effective_to`, `ended_by`, `ended_at` and `end_reason` on the assignment, and `effective_to` on its live configs.
  * **Balances are left unchanged.**
  * Leave dated after the end can no longer be applied for (`LEAVE_CONFIG_ENDED` on submit).
  * The apply-form catalog drops those types after the end date.
  * Monthly accrual and the rollover stop at the end date.
  * A later assignment closes the ended configs and keeps their earlier end date.
* **Response structure**: The updated assignment row.
* **Error handling**:
  * 404: `ASSIGNMENT_NOT_FOUND`.
  * 409: `ASSIGNMENT_ALREADY_ENDED`, `ASSIGNMENT_HAS_LEAVES_AFTER_END` (`details.request_ids`).
  * 400: `EFFECTIVE_TO_IN_PAST`, `INVALID_DATE`.
* **What This API Gives/Does**: Ends a policy assignment without rewriting any balance.

## 30. Revert a Leave Type to the Policy Default
* **API name / purpose**: Drop a per-person override.
* **HTTP method**: `DELETE`
* **Endpoint / route**: `/api/v1/leaves/users/:userId/configs/:leaveTypeId`
* **Authentication / authorization requirements**: Requires Token. Roles: `hr`. Feature: `leave.access`.
* **Request JSON Payload**: This API does not use a JSON body.
* **Request Fields**: `userId`, `leaveTypeId` (Path Parameters, UUID, Required).
* **Detailed API Function**: Under the member lock, it rewrites the config with its `template_values`: the policy as assigned, not the template's current values, so the person lands where their peers are. It clears `overridden_fields` and recalculates the balance with the same engine as §12. It is idempotent: a config with no overrides returns `unchanged` and writes nothing.
* **Response structure**: `{ "outcome": "reverted" | "unchanged", "config": { …config row } }`.
* **Error handling**: 404 (`CONFIG_NOT_FOUND`); 409 (`NO_POLICY_DEFAULT`) for a legacy config; 409 (`LEAVE_CONFIG_ENDED`); 400 (`NO_JOINING_DATE`).
* **What This API Gives/Does**: Puts one leave type back on the policy default and adjusts the balance.

## 31. Deleting an Assignment (not available yet)
* **API name / purpose**: Remove a wrong assignment.
* **Detailed API Function**: Not provided for an assignment that has started. Its balances are already written, and accrual or leave may have happened since, so a delete could not honestly reverse them. **End it (§29), or assign the correct policy (§11).** After the A → B → A fix, re-assigning the correct policy gives the same upfront balance as assigning it in the first place. Deleting a not-yet-started assignment arrives with future-dated scheduling.

---
*End of Analysis*

# Leave Management System — Phased Development Plan

This document breaks down the implementation of the Leave Management System into logical, incremental phases. Each phase is self-contained and delivers testable, deployable functionality.

> **Rule:** No phase should begin until the previous phase is fully tested and verified.

---

## Phase 1: Foundation — Schema, Models & HR Admin CRUD

**Goal:** Build the database layer and give HR the ability to configure the leave system before any employee interacts with it.

### 1.1 Database Migrations
- [ ] Create `leave_types` table (with `org_id`, `is_active` — see Bug Fix from Final Review)
- [ ] Create `leave_policy_templates` table (with `org_id`)
- [ ] Create `leave_policy_entitlements` table (with `org_id` — see Gap 4)
- [ ] Create `employee_leave_configs` table (with `org_id`, `accrual_type`, `max_carry_forward`)
- [ ] Create `leave_balances` table (with `org_id`)
- [ ] Create `leave_requests` table (with `org_id`, `actioned_at`, `rejection_reason`, `is_half_day`, `half_day_type`, `requested_at`)

### 1.2 Sequelize Models & Associations
- [ ] `leave_types.model.js`
- [ ] `leave_policy_templates.model.js`
- [ ] `leave_policy_entitlements.model.js`
- [ ] `employee_leave_configs.model.js`
- [ ] `leave_balances.model.js`
- [ ] `leave_requests.model.js`
- [ ] Define all FK associations between leave models and existing models (`Organization`, `User`)

### 1.3 Repositories
- [ ] `leave_types.repository.js`
- [ ] `leave_policy_templates.repository.js`
- [ ] `leave_policy_entitlements.repository.js`
- [ ] `employee_leave_configs.repository.js`
- [ ] `leave_balances.repository.js`
- [ ] `leave_requests.repository.js`

### 1.4 HR Admin APIs — Leave Types & Templates CRUD
- [ ] `POST /api/v1/leaves/types` — Create a leave type
- [ ] `GET /api/v1/leaves/types` — List all leave types for the org
- [ ] `PUT /api/v1/leaves/types/:id` — Update a leave type
- [ ] `DELETE /api/v1/leaves/types/:id` — Delete a leave type
- [ ] `POST /api/v1/leaves/templates` — Create a policy template
- [ ] `GET /api/v1/leaves/templates` — List all templates
- [ ] `PUT /api/v1/leaves/templates/:id` — Update a template
- [ ] `DELETE /api/v1/leaves/templates/:id` — Delete a template
- [ ] `POST /api/v1/leaves/templates/:id/entitlements` — Add entitlements to a template
- [ ] `PUT /api/v1/leaves/templates/:id/entitlements/:entitlementId` — Update entitlement
- [ ] `DELETE /api/v1/leaves/templates/:id/entitlements/:entitlementId` — Remove entitlement

### 1.5 Validators
- [ ] `leave_types.validator.js`
- [ ] `leave_templates.validator.js`
- [ ] `leave_entitlements.validator.js`

### 1.6 Route Registration
- [ ] Create `leave_admin.routes.js` (HR/Admin policy management routes)
- [ ] Register the new route file in the main Express app (`app.js` or `index.js`)
- [ ] Apply `authenticate`, `authorize(['hr', 'admin', 'super-admin'])`, and `requireFeature('leave.access')` middleware

### Phase 1 Verification
- [ ] Run `sequelize.sync()` or migration — verify all 6 tables are created
- [ ] Use Postman/cURL to create Leave Types (SL, CL, EL, LWP, CO)
- [ ] Create a "Standard Employee Policy" template with entitlements
- [ ] Verify GET endpoints return correct data

---

## Phase 2: Policy Assignment & Balance Engine

**Goal:** HR can assign a policy template to individual employees, generating their personalized configs and seeding their leave balances.

### 2.1 Policy Assignment Service
- [ ] `POST /api/v1/leaves/users/:userId/assign-policy`
  - Accepts `{ template_id }` in the body
  - Copies all entitlements from the template into `employee_leave_configs` for that user
  - Seeds `leave_balances` for the current year
  - Handles **Edge Case 1 (Pro-rata)**: If `joining_date` is mid-year, calculates pro-rated quotas

### 2.2 Individual Config Override
- [ ] `PUT /api/v1/leaves/users/:userId/configs/:leaveTypeId`
  - Allows HR to override an individual employee's annual quota, accrual type, or carry forward limit
  - Recalculates `leave_balances` after the override

### 2.3 Balance Viewing
- [ ] `GET /api/v1/leaves/users/:userId/balances` — HR views any employee's balance
- [ ] `GET /api/v1/leaves/my-balances` — Employee views their own balance

### 2.4 Validators
- [ ] `leave_assignment.validator.js`
- [ ] `leave_config.validator.js`

### Phase 2 Verification
- [ ] Assign "Standard Employee Policy" to an employee
- [ ] Verify `employee_leave_configs` has correct rows
- [ ] Verify `leave_balances` has correct pro-rated values
- [ ] Override one employee's SL quota from 12 to 15
- [ ] Verify the balance reflects the new quota

---

## Phase 3: Leave Application & Approval Workflow (Unified)

**Goal:** Any org member (employee, manager, HR) can apply for leaves through a single unified API. Their reporting person (resolved via `user_reporting_mappings`) approves them.

### 3.1 Leave Calculator Engine (Core Utility)
This is the most critical piece. It calculates the actual number of leave days to deduct.
- [ ] Build `leave_calculator.utils.js`
  - Input: `start_date`, `end_date`, `user_id`, `org_id`, `leave_type_id`
  - Queries `attendance_holidays` (respecting `target_departments`, `target_locations`, `excluded_users` — **Edge Case 15**)
  - Queries `attendance_weekly_off_rules` (respecting targeting logic)
  - Applies the **Sandwich Rule** if `leave_type.sandwich_rule_applies === true` (**Edge Case 4**)
  - Handles **half-day** calculations at `0.5` resolution (**Edge Case 8**)
  - Returns: `{ total_days, breakdown: [{ date, is_holiday, is_weekend, is_leave_day }] }`

### 3.2 Leave Access Control Utility
- [ ] Build `leave_access.utils.js` (mirrors existing `attendance_access.utils.js`)
  - `getAccessibleUserIds(orgId, requesterUser)` → Returns subordinate user IDs based on `user_reporting_mappings`
  - HR/Admin → returns `null` (full org access)
  - Manager → returns direct reports only
  - Employee → returns `[]` (no subordinates)

### 3.3 Approval Chain Resolver
- [ ] Build `approval_chain.utils.js`
  - Input: `user_id`, `org_id`
  - Queries `user_reporting_mappings` for the user's active `reporting_to_id`
  - Employee → looks for `employee_to_manager` mapping
  - Manager → looks for `manager_to_hr` or `manager_to_admin` mapping
  - HR → looks for `hr_to_admin` mapping
  - If no mapping found → auto-escalates to any `hr` or `admin` in the org
  - Prevents circular references (`user_id === reporting_to_id`)

### 3.4 Self-Service APIs — `leave_self.routes.js`
**Roles:** `allOrgRoles = ['employee', 'manager', 'hr', 'admin', 'super-admin']`

A single route file for ALL roles to apply for their own leave:
- [ ] `POST /api/v1/leaves/request` — Unified leave application
  - Uses `req.user.id` as the applicant (regardless of role)
  - Validates: Overlap check (**Edge Case 2**)
  - Validates: Payroll lock check (**Edge Case 5**)
  - Validates: Balance sufficiency with `SELECT ... FOR UPDATE` (**Edge Case 14**)
  - Validates: **Effective balance** must account for pending requests (**Edge Case 24 — Phantom Hold**)
  - Validates: `requires_document_threshold` — if `total_days > threshold`, require `document_url`
  - Validates: Probation restriction (**Edge Case 9**)
  - Validates: Notice period restriction via `job_status === 'notice_period'` (**Edge Case 11**)
  - Validates: `is_half_day` + `half_day_type` field enforcement (**Edge Case 28**)
  - Handles: LWP auto-split if balance insufficient (**Edge Case 3**)
  - Handles: Negative balance advance if `max_negative_balance` allows (**Edge Case 12**)
  - Resolves: Approval chain via `approval_chain.utils.js` (**Edge Case 19**)
- [ ] `GET /api/v1/leaves/my-balances` — View own balances
- [ ] `GET /api/v1/leaves/my-requests` — List own requests with filters
- [ ] `POST /api/v1/leaves/requests/:id/cancel` — Cancel own request
  - If future: Direct cancel, refund balance, remove `on_leave` attendance records
  - If past/today: Set to `cancellation_pending`, require approver confirmation (**Edge Case 6**)

### 3.5 Approver APIs — `leave_approver.routes.js`
**Roles:** `managerRoles = ['manager', 'hr', 'admin', 'super-admin']`

A single route file for anyone with approval authority:
- [ ] `GET /api/v1/leaves/team/requests/pending` — Fetches pending requests for subordinates (filtered by `getAccessibleUserIds()`)
- [ ] `GET /api/v1/leaves/team/balances` — View subordinates' leave balances
- [ ] `POST /api/v1/leaves/requests/:id/approve`
  - Verifies the approver has authority over the applicant via `getAccessibleUserIds()`
  - Uses **UPSERT** pattern for attendance records — updates `absent` → `on_leave`, flags conflicts for `present`/`half_day` (**Edge Case 21 — Cron Race Condition**)
  - Checks attendance record conflicts before inserting `on_leave` (**Edge Case 16**)
  - For night-shift employees, creates `on_leave` records for both calendar dates (**Edge Case 23**)
  - Copies `half_day_type` to `attendance_records` when applicable (**Edge Case 28**)
  - Deducts from `leave_balances`
  - Pushes `on_leave` records into `attendance_records`
- [ ] `POST /api/v1/leaves/requests/:id/reject`
  - Sets status to `rejected`, stores `rejection_reason`, sets `actioned_at`

### 3.6 Validators
- [ ] `leave_request.validator.js`

### Phase 3 Verification
- [ ] **Employee** applies for 5 days leave spanning a public holiday → system deducts 4 days
- [ ] **Manager** applies for leave using the SAME API → approval routes to HR/Admin (not to themselves)
- [ ] **HR** applies for leave → approval routes to Admin
- [ ] Employee applies for overlapping dates → `409 Conflict`
- [ ] Employee in probation applies for EL → blocked
- [ ] Employee with 1 SL left applies for 3 days → 1 SL + 2 LWP
- [ ] Approver approves → `attendance_records` updated to `on_leave`
- [ ] Approver approves leave where employee already clocked in → conflict flagged
- [ ] Applicant cancels future leave → balance refunded
- [ ] Applicant cancels past leave → goes to `cancellation_pending`
- [ ] Manager with no `user_reporting_mapping` applies → auto-escalates to HR

---

## Phase 4: Attendance Integration Bridge

**Goal:** Connect the Leave module with the existing Attendance module so both systems stay in sync.

### 4.1 Comp Off Bridge (Earning → Leave Balance)
- [ ] When a comp off is approved in `comp_off.service.js`, fire a hook that credits `+1` to the employee's `leave_balances` for the "Comp Off" leave type
- [ ] When a comp off leave request is approved (burning), update `attendance_comp_offs.used_on_date` and `used_leave_id`

### 4.2 Comp Off Expiry Sync Cron (**Edge Case 13**)
- [ ] Build a nightly cron job that:
  - Queries `attendance_comp_offs` where `status = 'approved'` AND `expiry_date < today`
  - Deducts `1` from `leave_balances.current_balance` for "Comp Off" type
  - Updates `attendance_comp_offs.status = 'expired'`

### 4.3 Employee Deactivation Hook (**Edge Case 20**)
- [ ] When an employee is soft-deleted via `DELETE /organizations/employees/:id`:
  - Auto-cancel future approved leave requests (set status `terminated_cancelled`)
  - Remove future `on_leave` entries from `attendance_records`
  - Refund unused leave days back to `leave_balances`

### 4.4 Regularization ↔ Leave Conflict Hook (**Edge Case 25**)
- [ ] Modify the existing `regularization.service.js` approval flow:
  - Before approving, check if the target date has `status = 'on_leave'` in `attendance_records`
  - If yes, notify the approver of the conflict
  - If approved anyway, automatically: reduce `leave_request.total_days` by 1, refund `1.0` to `leave_balances`, update attendance record status

### 4.5 Leave Type Soft-Delete Safety (**Edge Case 26**)
- [ ] Implement the `is_active` flag check:
  - Before deactivating a leave type, check for pending requests and warn about non-zero balances
  - Deactivated types hidden from employee leave application dropdown
  - Historical records remain visible

### Phase 4 Verification
- [ ] Approve a comp off → verify `leave_balances` for "CO" type increments by 1
- [ ] Wait for comp off to expire (or simulate) → verify balance decrements
- [ ] Deactivate an employee mid-leave → verify future leave requests cancelled and attendance records cleaned

---

## Phase 5: Cron Jobs & Year-End Automation

**Goal:** Automate recurring operations — monthly accruals and year-end rollover.

### 5.1 Monthly Accrual Cron (**Edge Case 18**)
- [ ] Build a cron job that runs on the 1st of every month
- [ ] For each employee with `accrual_type = 'monthly'`:
  - Credit `annual_quota / 12` to `leave_balances.total_accrued` and `current_balance`
- [ ] Does NOT retroactively validate/invalidate existing pending requests

### 5.2 Year-End Rollover Cron (**Edge Case 7**)
- [ ] Build a cron job that runs on January 1st at 00:00
- [ ] For each employee and each leave type:
  - Calculate `carry_forward = min(current_balance, max_carry_forward)`
  - Create new `leave_balances` row for the new year with `total_accrued = carry_forward`
  - Mark excess as `lapsed` in the old year's record

### 5.3 Policy Reassignment Service (**Edge Case 17**)
- [ ] When HR reassigns a new template:
  - Snapshot `total_used` from current balances
  - Calculate new pro-rata quotas from reassignment date
  - Carry over `total_used` so nothing is double-counted

### Phase 5 Verification
- [ ] Simulate monthly accrual for an employee with `monthly` policy → verify balance increments
- [ ] Simulate year-end with 5/12 carry forward limit → verify only 5 carried, 7 lapsed
- [ ] Reassign a policy mid-year → verify balances correctly adjusted

---

## Phase 6: Advanced Features & Hardening

**Goal:** Implement the remaining edge cases and harden the system for production.

### 6.1 Sandwich Rule Engine (**Edge Case 4** — Full Implementation)
- [ ] Complete implementation in `leave_calculator.utils.js`
- [ ] Test: Friday + Monday off with sandwich rule ON → 4 days deducted
- [ ] Test: Friday + Monday off with sandwich rule OFF → 2 days deducted

### 6.2 Calendar Exceptions Integration (**Edge Case 22**)
- [ ] Extend `leave_calculator.utils.js` to query `attendance_calendar_exceptions`
- [ ] If a weekly off is overridden to a working day → count as leave day
- [ ] If a working day is overridden to a non-working day → exclude from deduction

### 6.3 Night Shift / Shift-Rotation Awareness (**Edge Case 23**)
- [ ] Query `employee_shift_assignments` to detect night shifts spanning midnight
- [ ] For night shifts: create `on_leave` records for both calendar dates, deduct only 1.0 day
- [ ] Test: Night shift (10 PM Tue → 6 AM Wed) leave → records for both Tue and Wed

### 6.4 Gender Field Migration (**Bug 4 from Final Review**)
- [ ] Create migration to add `gender` column to `employee_profiles`, `manager_profiles`, `hr_profiles`
- [ ] Implement demographic-specific leave type validation (**Edge Case 10**)

### 6.5 Document Upload Enforcement
- [ ] If `total_days > requires_document_threshold`, require `document_url` in leave request
- [ ] Integrate with existing file upload infrastructure (if any)

### 6.6 Negative Balance / Leave Advance (**Edge Case 12**)
- [ ] Full implementation with `max_negative_balance` config
- [ ] Monthly accrual cron offsets negative balances first before crediting new balance

### 6.7 Notice Period Hard Cap (**Edge Case 11**)
- [ ] Implement `job_status === 'notice_period'` check with configurable per-type caps

### Phase 6 Verification
- [ ] Full regression test of all 28 edge cases
- [ ] Load test the concurrent request flow (**Edge Case 14**)
- [ ] Test cron race condition: run auto_mark_absent, then approve leave → verify UPSERT works (**Edge Case 21**)
- [ ] Test regularization on an on_leave day → verify balance refund (**Edge Case 25**)
- [ ] Test calendar exception: Saturday made working day → leave deducted (**Edge Case 22**)
- [ ] Test night shift leave → verify two attendance records created (**Edge Case 23**)
- [ ] Verify all audit trails have complete timestamps

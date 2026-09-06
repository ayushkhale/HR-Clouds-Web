# Production-Level Leave Management System - Implementation Plan

## Goal Description
To build a highly flexible, production-grade Leave Management System in a new `src/modules/leave` directory. HR/Managers can define base Leave Policies and assign them to individual employees, with full support for **individualized policy overrides**. The system will seamlessly integrate with the existing Compensatory Off (Comp Off) and Holiday modules.

## Proposed Architecture & Schema

### 1. The Core Tables

#### `leave_types` (Global)
Defines all types of leaves across the company.
- `id` (UUID)
- `name` (Sick Leave, Casual Leave, Comp Off, LWP)
- `code` (SL, CL, CO, LWP)
- `is_paid` (Boolean)
- `requires_document_threshold` (Integer - e.g. 3 days)
- `sandwich_rule_applies` (Boolean)

#### `leave_policy_templates` (The Base Rules)
HR creates template policies.
- `id`
- `name` (e.g., "Standard Permanent Employee Policy 2026")
- `description`

#### `leave_policy_entitlements` (Template Quotas)
Maps a template to how many leaves it grants.
- `id`
- `policy_template_id` (FK)
- `leave_type_id` (FK)
- `annual_quota` (Integer: e.g., 12)
- `accrual_type` (Enum: `upfront`, `monthly`)
- `max_carry_forward` (Integer)

#### `employee_leave_configs` (Individualized Policies)
When an employee is assigned a template, it copies the rules here. HR/Manager can then edit this specific row to give one employee a custom quota.
- `id`
- `user_id` (FK)
- `leave_type_id` (FK)
- `assigned_annual_quota` (Integer)
- `effective_from` (Date)
- `effective_to` (Date)

#### `leave_balances` (The Live Wallet)
The live tracking ledger for an employee.
- `id`
- `user_id` (FK)
- `leave_type_id` (FK)
- `year` (Integer)
- `total_accrued` (Float)
- `total_used` (Float)
- `current_balance` (Float)

#### `leave_requests` (The Application)
- `id`
- `user_id`
- `leave_type_id`
- `start_date`, `end_date`
- `total_days` (Calculated)
- `status` (`pending`, `approved`, `rejected`, `cancelled`)
- `reason`, `document_url`
- `approved_by` (FK -> Manager/HR)

---

## 2. Integration with Existing Modules

### A. Integrating with `attendance_comp_offs`
1. **Earning:** When an employee works on a weekend and their Manager approves a Comp Off in the existing `comp_offs` module...
2. **The Bridge:** A hook fires in the background, finds the employee's `leave_balances` for the `Comp Off` type, and adds `+1`.
3. **Burning:** The employee can "Apply for Leave", choose "Comp Off", and use that balance.

### B. Integrating with `attendance_holidays` and `weekly_offs`
When calculating the `total_days` for a leave application, the system queries the existing `attendance_holidays` and `attendance_weekly_off_rules`. Public holidays falling within the leave period are subtracted from the deduction balance.

### C. Integrating with `attendance_records` (Live Sync)
When a `leave_request` is Approved, the system pushes records into `attendance_records` for those dates, forcing the `status` to `on_leave` to prevent the cron jobs from marking the employee as "Absent".

---

## 3. Edge Cases & Proposed Fixes

Building a production-grade leave system requires handling complex HR edge cases. Below are the identified edge cases and our strategy for fixing them:

### Edge Case 1: Mid-Year Joining (Pro-rata Calculation)
- **Problem:** If an employee joins on July 1st, they should not receive the full 12 days of annual upfront Sick Leave.
- **Fix:** Implement a **Pro-Rata Engine** during policy assignment. The system will calculate: `(Days remaining in year / Total days in year) * Annual Quota`. If they join exactly mid-year, they will receive 6 days instead of 12.

### Edge Case 2: Overlapping Leave Applications
- **Problem:** An employee applies for leave from Monday to Wednesday, and then mistakenly submits another request for Tuesday to Thursday.
- **Fix:** Implement strong application-level validation during the `POST /leave/request` flow. The system will query the `leave_requests` table for any `pending` or `approved` requests that fall within the new date range and block the submission with a `409 Conflict` error.

### Edge Case 3: Insufficient Balance & Leave Without Pay (LWP)
- **Problem:** An employee has 1 Sick Leave left, but is sick for 3 days and applies for 3 days.
- **Fix:** The system will evaluate the balance. Instead of blocking the request outright, we will support an auto-split/fallback mechanism (if enabled by policy). It will deduct 1 day from `Sick Leave` and log the remaining 2 days as `LWP` (Leave Without Pay), which correctly syncs with payroll deductions.

### Edge Case 4: The "Sandwich Rule"
- **Problem:** An employee takes Friday and Monday off. Some companies consider the Saturday and Sunday in between as leave days (deducting 4 days instead of 2).
- **Fix:** We added a `sandwich_rule_applies` boolean to the `leave_types` table. If this is `true`, the Leave Calculator will *ignore* the holiday/weekend subtraction logic for that specific request and charge the employee for the full contiguous period.

### Edge Case 5: Retrospective Leaves vs Payroll Locks
- **Problem:** An employee forgot to apply for sick leave last month and tries to apply for it today. However, HR has already locked last month's attendance for payroll processing.
- **Fix:** The Leave Application engine will query the existing `attendance_lock_periods` table. If the `start_date` or `end_date` of the leave falls within a locked period, the system will reject the request, requiring a super-admin override.

### Edge Case 6: Cancelling an Already Approved Leave
- **Problem:** An employee cancels a leave that was already approved by the manager. The system needs to refund the balance and revert the attendance records.
- **Fix:** 
  - If the leave is in the *future*, the employee can cancel it directly. The system refunds the `leave_balances` and removes the `on_leave` entries from `attendance_records`.
  - If the leave is in the *past* (or today), the cancellation goes into a `cancellation_pending` state and requires Manager/HR approval to prevent payroll fraud.

### Edge Case 7: Year-End Rollover (Carry Forward)
- **Problem:** On Dec 31st, remaining balances need to carry forward to the next year, up to a maximum limit.
- **Fix:** A scheduled cron job (`EndOfYearLeaveRollover`) will run on Jan 1st at 00:00. It will calculate `min(current_balance, max_carry_forward)` for each employee, add it to their opening balance for the new year, and mark the excess as `lapsed`.

### Edge Case 8: Half-Day Leaves & Fractional Deductions
- **Problem:** An employee applies for a half-day leave on a day that is later declared a half-day holiday, or they apply for 1.5 days of leave and the 0.5 falls on a weekend.
- **Fix:** The leave calculator engine will operate with precise fractional day resolution (`0.5` increments). If a public holiday is a half-day (0.5), and the employee applies for a full-day leave (1.0), the system deducts only `0.5` days from their balance.

### Edge Case 9: Probation Period Restrictions
- **Problem:** A new employee is in their probation period (e.g., first 3-6 months) and shouldn't be allowed to take Earned Leaves (EL) or Privilege Leaves (PL).
- **Fix:** Add a `probation_restriction_days` field to `leave_policy_entitlements`. The system checks the employee's `joining_date` from their profile and blocks the request if they are still within the restriction period.

### Edge Case 10: Demographic Specific Leaves (Gender/Marital Status)
- **Problem:** Maternity leave should only be accessible to female employees; Paternity leave to male employees.
- **Fix:** The policy engine will validate the `gender` and `marital_status` fields from the employee's master profile against rules defined in the `leave_types` or `leave_policy_entitlements` before allowing the request to proceed.

### Edge Case 11: Resignation / Notice Period Restrictions
- **Problem:** An employee is serving their notice period. Company policy dictates they cannot take Earned Leaves during this time, or are restricted to a maximum of 1-2 days of Sick leave.
- **Fix:** The system will check the employee's `status` (e.g., `is_in_notice_period` flag). If true, it enforces a notice-period-specific hard cap or blocks specific leave types entirely based on the global policy configuration.

### Edge Case 12: Negative Leave Balances (Leave Advances)
- **Problem:** An employee needs 5 days of sick leave but only has 2 accrued. The company allows them to go into negative balance (up to -3 days) which will be offset by future monthly accruals.
- **Fix:** Introduce a `max_negative_balance` configuration in `leave_policy_entitlements`. The `total_used` can exceed `total_accrued` up to this limit, allowing `current_balance` to temporarily be a negative number without immediately triggering the LWP (Leave Without Pay) fallback.

### Edge Case 13: Comp Off Expiry Before Usage (Integration-Specific)
- **Problem:** The existing `attendance_comp_offs` model has an `expiry_date` field (set to 90 days from `earned_date` in `comp_off.service.js` line 39). An employee earns a comp off, the bridge credits `+1` to their leave balance, but they never use it before the 90-day expiry. Their leave balance now shows a phantom credit.
- **Fix:** Implement a nightly cron job (`CompOffExpirySync`) that queries `attendance_comp_offs` for records where `status = 'approved'` and `expiry_date < today`. For each expired comp off, the cron deducts `1` from the employee's `leave_balances.current_balance` for the "Comp Off" leave type and updates the comp off status to `expired`. This keeps both systems in sync.

### Edge Case 14: Race Condition on Balance Deduction (Concurrent Requests)
- **Problem:** An employee has exactly 1 day of Casual Leave left. They submit two leave requests simultaneously from two browser tabs (or a mobile app and web app at the same time). Both requests read `current_balance = 1` before either writes, and both get approved, resulting in `current_balance = -1` — a double-spend.
- **Fix:** Wrap the entire "check balance → create request → deduct balance" flow inside a Sequelize transaction with a `SELECT ... FOR UPDATE` row-level lock on the employee's `leave_balances` row. This forces the second concurrent request to wait until the first transaction commits, at which point the balance will be `0` and the second request will be correctly rejected.

### Edge Case 15: Holiday Targeting Rules (Department/Location Scoped Holidays)
- **Problem:** The existing `attendance_holidays` model has `target_departments`, `target_locations`, `included_users`, and `excluded_users` fields. A holiday might only apply to the "Engineering" department. If an "HR" department employee applies for leave spanning that holiday, the leave calculator must NOT subtract that holiday from their total — it's not applicable to them.
- **Fix:** The Leave Calculator engine must replicate the existing holiday targeting logic. When checking if a holiday falls within a leave range, it must also check: (1) Is the employee's `department_id` in the holiday's `target_departments` array (or is the array empty, meaning org-wide)? (2) Is their `location_id` in `target_locations`? (3) Are they in `excluded_users`? Only subtract the holiday from `total_days` if the employee is actually eligible for that holiday.

### Edge Case 16: Attendance Record Conflict on Approval (Employee Already Clocked In)
- **Problem:** An employee applies for leave for tomorrow (Wednesday). Their manager doesn't approve it until Thursday. Meanwhile, on Wednesday, the employee actually clocked in and worked a full day. When the manager approves the leave on Thursday, the system tries to insert an `on_leave` record into `attendance_records` for Wednesday, but there's already a `present` record there (enforced by the unique index `ar_org_user_date_unique_idx` on `[org_id, user_id, date]`).
- **Fix:** Before inserting `on_leave` records, the approval service must check for existing `attendance_records` for each date in the leave range. If a record already exists with `status = 'present'` or `status = 'half_day'`, the system must: (a) Flag the conflict to the approving manager, (b) Allow partial approval (skip the conflicting day and only deduct the remaining days), (c) Or require the manager to explicitly choose whether to override the attendance record.

### Edge Case 17: Policy Reassignment Mid-Year (Template Switch)
- **Problem:** HR assigns an employee "Intern Policy" (6 SL, 0 EL) on January 1st. On July 1st, the employee is confirmed and HR reassigns them to "Permanent Policy" (12 SL, 15 EL). What happens to the 3 Sick Leaves they already used under the old policy? Do they get a fresh 12, or 12 minus 3 = 9?
- **Fix:** When reassigning a policy mid-year, the system must: (1) Snapshot the current `leave_balances` (specifically `total_used`), (2) Calculate the new quota using pro-rata from the reassignment date, (3) Carry over the `total_used` from the old policy so nothing is double-counted. The formula becomes: `new_balance = pro_rata_new_quota - total_already_used`. If the result is negative (they used more under the old policy than the new one allows), it stays negative and accrues back over the remaining months.

### Edge Case 18: Multi-Day Leave Spanning Across Months (Split Accrual Impact)
- **Problem:** An employee has a `monthly` accrual policy. They apply for leave from January 28 to February 3 (7 days). On February 1st, the monthly accrual cron runs and credits `+1` to their balance. Should the system allow the request based on the balance at the time of application (January 28), or re-evaluate after the accrual?
- **Fix:** The system evaluates balance **at the time of request submission only**. The employee must have sufficient balance when they click "Apply". The monthly accrual cron will not retroactively validate or invalidate existing pending/approved requests. This prevents confusion and ensures deterministic behavior.

### Edge Case 19: Manager Self-Approval Prevention
- **Problem:** A manager applies for their own leave. The approval flow must route to their own reporting person (typically an HR or Admin). But what if the manager has no active mapping in `user_reporting_mappings`, or their `reporting_to_id` is themselves (circular reference)?
- **Fix:** The system must use the existing `user_reporting_mappings` table (which has `mapping_relation` values like `manager_to_hr` and `manager_to_admin`) to resolve the approval chain. Specifically: (1) A `leave_request` where `user_id === approved_by` is blocked at the application layer, (2) The service queries `user_reporting_mappings` for `user_id = requester` and `is_active = true` to find the `reporting_to_id`, (3) If no active mapping exists, the request is automatically escalated to any user with the `hr` or `admin` role in the same organization, (4) The `POST /leave/request` endpoint must resolve and store `escalated_to` in the request record for audit trail.

### Edge Case 20: Employee Termination / Deactivation Mid-Leave
- **Problem:** An employee has an approved leave from Monday to Friday. On Wednesday, HR soft-deletes (deactivates) the employee via the existing `DELETE /organizations/employees/:id` endpoint (which uses `paranoid: true` soft-delete on `employee_profiles`). The remaining Thursday and Friday `on_leave` attendance records are now orphaned — they belong to a deactivated user.
- **Fix:** When an employee is deactivated, a post-deletion hook must: (1) Find all `leave_requests` with `status = 'approved'` where `end_date >= today`, (2) Auto-cancel them and set status to `terminated_cancelled`, (3) Remove future `on_leave` entries from `attendance_records` for dates after the termination date, (4) Refund the unused portion back to `leave_balances` (for final settlement/encashment calculations).

### Edge Case 21: Auto-Mark-Absent Cron Race Condition (Critical Integration)
- **Problem:** The existing `auto_mark_absent.cron.js` runs at **7:00 AM IST daily** and checks: "Does this employee have an `attendance_records` entry for yesterday? If no → insert `status: 'absent'`." Now suppose a manager approves an employee's leave request at 8:00 AM (after the cron already ran). The cron would have already inserted an `absent` record for that date. The leave approval service then tries to insert an `on_leave` record but crashes on the unique index `ar_org_user_date_unique_idx`.
- **Fix:** The leave approval service must use an **UPSERT** pattern instead of a plain INSERT for `attendance_records`. When pushing `on_leave` records, it should: (1) Check if a record already exists for that `(org_id, user_id, date)`, (2) If the existing record has `status = 'absent'`, update it in-place to `status = 'on_leave'`, (3) If the existing record has `status = 'present'` or `status = 'half_day'`, flag it as a conflict (as described in Edge Case 16). This ensures the cron and the leave system can run in any order without crashing.

### Edge Case 22: Calendar Exceptions Not Accounted For
- **Problem:** The codebase has an `attendance_calendar_exceptions` table with `exception_type`, `target_departments`, `target_locations`, and `target_users` fields. Calendar exceptions can override a normal working day to become a working day, or vice versa (e.g., "Saturday Dec 30 is a working day due to year-end closing"). The current leave calculator plan only accounts for `attendance_holidays` and `attendance_weekly_off_rules` but **ignores calendar exceptions entirely**.
- **Fix:** The Leave Calculator engine must also query `attendance_calendar_exceptions` for the leave date range. If an exception converts a weekly off into a working day, that day should count as a leave day (deducted from balance). If an exception converts a working day into a non-working day, it should be excluded (not deducted). This is the same logic the existing attendance cron uses.

### Edge Case 23: Leave on a Shift-Rotation Day (Multi-Shift Employees)
- **Problem:** The codebase has `employee_shift_assignments` and `shift_rotation_patterns` models. An employee assigned to a rotating night shift (e.g., 10 PM to 6 AM) takes a leave on Tuesday. The leave straddles two calendar dates. The system might create an `on_leave` record for Tuesday, but the employee's shift actually ends on Wednesday at 6 AM. The attendance cron might then mark them absent on Wednesday morning because there is no record for Wednesday.
- **Fix:** The leave service must be **shift-aware**. When creating `on_leave` records in `attendance_records`, it must query the employee's `employee_shift_assignments` to determine their active shift for that date. If the shift spans midnight (night shift), the system should create `on_leave` records for **both calendar dates** that the shift covers. The `total_days` deduction from balance should still be `1.0` (one shift = one leave day), but `attendance_records` may have entries for two dates.

### Edge Case 24: Pending Leave Requests Blocking Balance (Phantom Hold)
- **Problem:** An employee has 5 Sick Leaves. They apply for 3 days (status: `pending`). Before the manager approves, they apply for another 3 days. The system checks `current_balance = 5` and allows the second request. Now there are 6 days of pending leave against 5 days of balance. When both are approved, the balance goes negative unexpectedly.
- **Fix:** When checking balance sufficiency, the system must calculate an **effective available balance**: `effective_balance = current_balance - sum(total_days WHERE status = 'pending' AND leave_type_id = X)`. This "holds" the pending balance so new requests cannot over-commit. The formula becomes: `if (requested_days > effective_balance) → reject or trigger LWP fallback`.

### Edge Case 25: Regularization Conflict with Approved Leave
- **Problem:** An employee has an approved leave for Monday (status: `on_leave` in `attendance_records`). Later, they realize they actually worked that day and submit an attendance regularization request (via the existing `POST /regularization` endpoint) for Monday. The regularization service creates a record or updates the status to `present`. Now the `attendance_records` says `present` but `leave_requests` says `approved` and `leave_balances` has already been deducted.
- **Fix:** When the regularization approval service detects that the target date has `status = 'on_leave'` in `attendance_records`: (1) It must notify the approver that this day is currently marked as an approved leave, (2) If the regularization is approved anyway, the system must automatically reverse the leave — update the `leave_request`'s `total_days` (if it was a multi-day leave, reduce by 1), refund `1.0` to `leave_balances`, and update the attendance record status from `on_leave` to whatever the regularization resolves to (`present`, `half_day`, etc.). This cross-module hook must be built into the existing regularization service.

### Edge Case 26: Deleting/Deactivating a Leave Type That Has Active Balances
- **Problem:** HR deletes or deactivates the "Bereavement Leave" type after 5 employees have already been assigned balances and 2 have pending requests for it. The `leave_balances`, `employee_leave_configs`, and `leave_requests` rows still reference this now-deleted type.
- **Fix:** Implement a **soft-delete** for `leave_types` (add `is_active` boolean, default `true`). The DELETE endpoint should set `is_active = false` instead of hard-deleting. Before deactivation, the system must check: (1) Are there pending requests? → Block deactivation with error: "Cannot deactivate: 2 pending requests exist", (2) Are there employees with non-zero balances? → Warn but allow if no pending requests. Deactivated types should not appear in the employee's leave application dropdown but should remain visible in historical request records.

### Edge Case 27: `leave_policy_entitlements` Missing `org_id` — Indirect Multi-Tenant Leak
- **Problem:** The `leave_policy_entitlements` table has no `org_id`. It relies on the FK through `policy_template_id → leave_policy_templates.org_id`. While this is technically safe, any direct query to `leave_policy_entitlements` (e.g., for reporting or bulk operations) without joining through templates could accidentally surface entitlements from another organization.
- **Fix:** Add `org_id` to `leave_policy_entitlements` as a denormalized safety field. This ensures every query that touches this table can be scoped to the org directly, following the same pattern used by every other table in the codebase (`attendance_records`, `attendance_comp_offs`, `attendance_policies`, etc.).

### Edge Case 28: `leave_requests` Missing `half_day_type` Field
- **Problem:** The `leave_requests` table has `is_half_day` (implied in Edge Case 8) but does not specify whether it's a **first-half** or **second-half** leave. This distinction matters because: (a) For attendance integration, the `attendance_records` table has a `half_day_type` field (values: `first_half`, `second_half`), (b) Two employees cannot both claim first-half leave if only one was intended, and (c) The employee might need to clock in after lunch (second-half leave) or leave at lunch (first-half leave).
- **Fix:** Add `half_day_type` (Enum: `null`, `first_half`, `second_half`) to `leave_requests`. When `is_half_day = true`, this field becomes required. When pushing `on_leave` records to `attendance_records`, the `half_day_type` value must be copied over so the attendance system correctly displays whether the employee is expected in the morning or afternoon.

---

## 4. Architectural Decision: Unified API Approach

### Why Unified APIs (Not Separate Employee / Manager Routes)

After reviewing the existing codebase, the **attendance module already follows a unified pattern**:
- `user_attendance.routes.js` uses `allOrgRoles = ['employee', 'manager', 'hr', 'admin', 'super-admin']` for self-service actions (clock-in, regularization requests). A **single API** serves all roles — the `req.user` determines who the applicant is.
- `manager_attendance.routes.js` uses `managerRoles = ['manager', 'hr', 'admin', 'super-admin']` for approvals. A **single API** handles approvals — `getAccessibleUserIds()` dynamically determines which subordinates the approver can act on.
- The `user_reporting_mappings` table already has `mapping_relation` values like `employee_to_manager`, `manager_to_hr`, `hr_to_admin` — the hierarchy already supports multi-level escalation.

**Creating separate leave APIs for employees vs managers is unnecessary and would cause:**
1. Duplicated business logic across two controllers/services.
2. Different bug surfaces for the same core workflow.
3. Confusion about which API a frontend should call based on the user's role.

**The correct approach (matching our existing codebase):**
- **One "Self-Service" route file** (`leave_self.routes.js`) — Any authenticated org member (employee, manager, HR) can apply for leave, view their own balance, and cancel their own requests. The `req.user.id` is always the applicant.
- **One "Approver" route file** (`leave_approver.routes.js`) — Managers, HR, and Admins can view/approve/reject leave requests from their subordinates. The `getAccessibleUserIds()` utility determines who they can approve.
- **One "Admin" route file** (`leave_admin.routes.js`) — HR and Admins can manage types, templates, policies, and assign them to users.

### How the Approval Chain Works

```
Employee applies for leave
  → System queries `user_reporting_mappings` for `mapping_relation = 'employee_to_manager'`
  → Routes to the Manager

Manager applies for leave
  → System queries `user_reporting_mappings` for `mapping_relation = 'manager_to_hr'` or `'manager_to_admin'`
  → Routes to HR/Admin

HR applies for leave
  → System queries `user_reporting_mappings` for `mapping_relation = 'hr_to_admin'`
  → Routes to Admin

No mapping found?
  → Auto-escalates to any user with 'hr' or 'admin' role in the org
```

---

## 5. API Endpoints Plan (Unified)

### A. Admin APIs — `leave_admin.routes.js`
**Roles:** `hr, admin, super-admin`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/leaves/types` | Create a leave type |
| GET | `/api/v1/leaves/types` | List all leave types for the org |
| PUT | `/api/v1/leaves/types/:id` | Update a leave type |
| DELETE | `/api/v1/leaves/types/:id` | Delete a leave type |
| POST | `/api/v1/leaves/templates` | Create a policy template |
| GET | `/api/v1/leaves/templates` | List all templates |
| PUT | `/api/v1/leaves/templates/:id` | Update a template |
| DELETE | `/api/v1/leaves/templates/:id` | Delete a template |
| POST | `/api/v1/leaves/templates/:id/entitlements` | Add entitlements to a template |
| PUT | `/api/v1/leaves/templates/:id/entitlements/:eid` | Update an entitlement |
| DELETE | `/api/v1/leaves/templates/:id/entitlements/:eid` | Remove an entitlement |
| POST | `/api/v1/leaves/users/:userId/assign-policy` | Assign a template to an employee |
| PUT | `/api/v1/leaves/users/:userId/configs/:leaveTypeId` | Override individual quota |
| GET | `/api/v1/leaves/users/:userId/balances` | View any employee's balance |

### B. Self-Service APIs — `leave_self.routes.js`
**Roles:** `employee, manager, hr, admin, super-admin` (all org roles)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/leaves/my-balances` | View own leave balances |
| GET | `/api/v1/leaves/my-requests` | View own leave request history |
| POST | `/api/v1/leaves/request` | Apply for a leave (works for ANY role — employee, manager, HR) |
| POST | `/api/v1/leaves/requests/:id/cancel` | Cancel own leave request |

### C. Approver APIs — `leave_approver.routes.js`
**Roles:** `manager, hr, admin, super-admin`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/leaves/team/requests/pending` | View pending requests from subordinates |
| GET | `/api/v1/leaves/team/balances` | View subordinates' leave balances |
| POST | `/api/v1/leaves/requests/:id/approve` | Approve a subordinate's leave request |
| POST | `/api/v1/leaves/requests/:id/reject` | Reject a subordinate's leave request |

---

## 5. Final Review — Schema Bugs & Gaps Found

After a final pass, the following issues and gaps were identified in the plan that **must be addressed before development begins**:

### Bug 1: `leave_requests` Table Missing `org_id`
- **Issue:** The `leave_requests` table as defined has no `org_id` field. Every other table in the codebase (`attendance_records`, `attendance_comp_offs`, `attendance_holidays`, etc.) uses `org_id` for multi-tenant scoping. Without it, queries like "get all pending leave requests for this organization" would require a JOIN through `user_id → employee_profiles → org_id`, which is slow and error-prone.
- **Fix:** Add `org_id` (UUID, NOT NULL, FK → Organizations) to `leave_requests`. Also add it to `leave_balances` and `employee_leave_configs` for the same reason. All tables that will be queried at the organization level need this field.

### Bug 2: `leave_requests` Missing `rejected_at` / `approved_at` Timestamps
- **Issue:** The table has `approved_by` but no timestamp of *when* the approval/rejection happened. This is critical for audit trails and SLA tracking (e.g., "requests pending for more than 3 days").
- **Fix:** Add `actioned_at` (DATE) and `rejection_reason` (TEXT) fields to `leave_requests`.

### Bug 3: `employee_leave_configs` Missing `accrual_type` and `max_carry_forward`
- **Issue:** When a template is copied to the individual config, only `assigned_annual_quota` is stored. But the `accrual_type` (upfront vs monthly) and `max_carry_forward` from the template entitlement are lost. HR cannot override these per-employee without these fields.
- **Fix:** Add `accrual_type` (Enum) and `max_carry_forward` (Integer) to `employee_leave_configs`.

### Bug 4: Edge Case 10 References `gender` Field — But It Does Not Exist
- **Issue:** Edge Case 10 (Demographic Specific Leaves) says the system will validate `gender` from the employee's profile. However, **there is no `gender` field in any of the profile models** (`employee_profiles`, `manager_profiles`, `hr_profiles`). The field simply does not exist in the current codebase.
- **Fix:** Either (a) Add a `gender` column to the profile models via a new migration, or (b) Defer Edge Case 10 to a later phase and remove the dependency for the initial release. The `marital_status` field does exist in `employee_profiles` and can be used.

### Bug 5: Edge Case 11 References `is_in_notice_period` Flag — But It's an Enum, Not a Boolean
- **Issue:** Edge Case 11 says the system checks `is_in_notice_period`. In reality, the employee profile uses a `job_status` ENUM with value `'notice_period'`. It's not a separate boolean flag.
- **Fix:** The leave service should check `employee_profile.job_status === 'notice_period'` instead of looking for a separate boolean field. This is a code-level fix, not a schema change.

### Gap 1: No `leave_types` Scoping to `org_id`
- **Issue:** The `leave_types` table is defined as "Global" with no `org_id`. This means every organization in the system shares the same leave types. In a multi-tenant SaaS, Company A might have "Bereavement Leave" while Company B does not.
- **Fix:** Add `org_id` (UUID, NOT NULL) to `leave_types` so each organization can define its own leave types. Alternatively, support a `system` flag for default types (SL, CL, EL) that are auto-seeded for every organization.

### Gap 2: No `leave_policy_templates` Scoping to `org_id`
- **Issue:** Same as Gap 1. Templates must be org-scoped.
- **Fix:** Add `org_id` to `leave_policy_templates`.

### Gap 3: Missing API Endpoints for Read/Update/Delete Operations
- **Issue:** The API plan lists `POST` endpoints for creating types, templates, and entitlements, but no `GET` (list/detail), `PUT` (update), or `DELETE` (remove) endpoints for them. HR needs full CRUD.
- **Fix:** Added the missing `GET` endpoints above. Full CRUD for types, templates, and entitlements will be built in Phase 1.

### Bug 6: `leave_types` Missing `is_active` Field for Soft-Delete (Edge Case 26)
- **Issue:** The `leave_types` table has no `is_active` flag. If HR deletes a type that has active balances or pending requests, it will either crash (FK constraint) or orphan data.
- **Fix:** Add `is_active` (Boolean, default `true`) to `leave_types`. The DELETE endpoint should soft-delete by setting `is_active = false`.

### Bug 7: `leave_requests` Missing `is_half_day` and `half_day_type` Fields (Edge Case 28)
- **Issue:** The `leave_requests` schema has no `is_half_day` boolean or `half_day_type` enum. Without these, the system cannot distinguish between a full-day and half-day leave, and cannot tell the attendance module whether the employee is expected in the morning or afternoon.
- **Fix:** Add `is_half_day` (Boolean, default `false`) and `half_day_type` (Enum: `null`, `first_half`, `second_half`) to `leave_requests`.

### Gap 4: `leave_policy_entitlements` Missing `org_id` (Edge Case 27)
- **Issue:** The entitlements table relies on an indirect org scope through its parent template. This is fragile for direct queries and reporting.
- **Fix:** Add `org_id` (UUID, NOT NULL) to `leave_policy_entitlements`.

### Gap 5: `leave_requests` Missing `requested_at` (Submission Timestamp)
- **Issue:** The table uses Sequelize's `created_at` for the submission time. While this technically works, having an explicit `requested_at` field gives the service layer control over when the request was formally submitted (vs when the DB row was created), which matters for audit logs and backdated requests.
- **Fix:** Add `requested_at` (DATE, NOT NULL, default `NOW()`) to `leave_requests`.

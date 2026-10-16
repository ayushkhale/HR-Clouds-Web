# HR Attendance Management APIs (Administration & Governance)

**Base URL:** `/api/v1/attendance/hr` (Mounted via `hr_attendance.routes.js` and `hr_attendance_read.routes.js`)  
**Module:** Attendance & Time Tracking  
**Source of Truth:** 
- Routes: `src/modules/attendance/routes/hr_attendance.routes.js`, `src/modules/attendance/routes/hr_attendance_read.routes.js`
- Controllers: `src/modules/attendance/controllers/hr_attendance.controller.js`, `src/modules/attendance/controllers/hr_attendance_read.controller.js`
- Validators: `src/modules/attendance/validators/hr_attendance.validator.js`, `src/modules/attendance/validators/hr_attendance_read.validator.js`
- Services: `policy.service.js`, `shift.service.js`, `rotation.service.js`, `holiday.service.js`, `weekly_off.service.js`, `device.service.js`, `comp_off_policy.service.js`, `comp_off.service.js`, `lock.service.js`, `clock.service.js`, `report.service.js`, `hr_attendance_read.service.js`
- Repositories: `attendance_policies.repository.js`, `shift_templates.repository.js`, `employee_shift_assignments.repository.js`, `shift_rotation_patterns.repository.js`, `shift_rotation_entries.repository.js`, `attendance_holidays.repository.js`, `attendance_weekly_off_rules.repository.js`, `attendance_devices.repository.js`, `attendance_device_employee_mappings.repository.js`, `attendance_comp_off_policies.repository.js`, `attendance_comp_offs.repository.js`, `attendance_lock_periods.repository.js`, `attendance_records.repository.js`
- Models: `AttendancePolicies`, `ShiftTemplates`, `EmployeeShiftAssignments`, `ShiftRotationPatterns`, `ShiftRotationEntries`, `AttendanceHolidays`, `AttendanceWeeklyOffRules`, `AttendanceDevices`, `AttendanceDeviceEmployeeMappings`, `AttendanceCompOffPolicies`, `AttendanceCompOffs`, `AttendanceLockPeriods`, `AttendanceRecords`, `AttendanceBreaks`, `AttendanceSessions`, `LeaveBalances`, `LeaveTypes`

---

## Architectural Principles & HR Governance Invariants

1. **Global Authentication & Role Separation**:
   - Configuration and mutation endpoints (`/policies`, `/shifts`, `/rotations`, `/holidays`, `/weekly-offs`, `/devices`, `/comp-off-policies`, `/locks`, `/records/recompute-stale`) require `authenticate` -> `authorize(['hr', 'admin', 'super-admin'])` -> `requireFeature('attendance.access')`.
   - HR Staff Attendance read endpoints (`/hrs/*`) allow both `hr` and `manager` roles (`authorize(['hr', 'manager', 'admin', 'super-admin'])`), enabling cross-functional managerial oversight while restricting general employee queries strictly to HR.
2. **Strict Multi-Tenancy**:
   - Every read, create, update, and delete operation is rigidly scoped by `req.user.orgId`. Cross-tenant record leakage is prevented at both the service and repository layers.
3. **Pessimistic Locking & Financial Data Freezes (Payroll Locks)**:
   - Modifications affecting attendance ledgers or comp-off balances are verified against active payroll lock periods (`lockService.checkLock(orgId, date)`). Once a payroll period is locked, attendance records and comp-offs in that date window are immutable until HR deletes the lock.
4. **Single Default Policy Invariant**:
   - The organization must have exactly one active default policy. Marking a policy as default automatically clears the default flag on the previous default policy within an atomic database transaction. The default policy cannot be directly unset or deactivated.
5. **Shift & Pattern Lifecycle Guarding**:
   - Shifts and rotation patterns that are currently assigned to active employees cannot be deleted or deactivated (`SHIFT_IN_USE`, `PATTERN_IN_USE`).
6. **Biometric Webhook Security & Idempotency**:
   - Physical devices communicate using SHA-256 hashed API keys. Punch events are checked against a 60-second idempotency window before materializing real attendance sessions.

---

## Table of Contents

- **1. Core Configuration — Attendance Policies (APIs 1–5)**
- **2. Shift Assignments (APIs 6–9)**
- **3. Shift Templates (APIs 10–14)**
- **4. Shift Rotation Patterns (APIs 15–17)**
- **5. Exceptions — Holidays Management (APIs 18–21)**
- **6. Exceptions — Weekly Off Rules (APIs 22–25)**
- **7. Hardware Integrations — Biometric Devices (APIs 26–29)**
- **8. Hardware Integrations — Device Employee Mappings (APIs 30–32)**
- **9. Comp-Off Policies (APIs 33–36)**
- **10. Organization Comp-Off Requests & HR Overrides (APIs 37–39)**
- **11. Payroll Lock Periods (APIs 40–42)**
- **12. Maintenance & Reconciliation (API 43)**
- **13. Export & Attendance Reporting (APIs 44–46)**
- **14. HR Staff Attendance Queries (APIs 47–50)**
- **15. Organization-Wide Employee Attendance Queries (APIs 51–54)**
- **16. Organization-Wide Manager Attendance Queries (APIs 55–58)**
- **17. Dashboards & Real-Time Analytics (APIs 59–63)**

---

## 1. Core Configuration — Attendance Policies

### API 1 — Create Attendance Policy

1. **API Number and Name:** API 1 — Create Attendance Policy
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/policies`
4. **Purpose:** Creates a new organizational attendance policy defining grace periods, work-hour thresholds, overtime rules, break allowances, and penalty triggers.
5. **Business Problem Solved:** Provides HR with granular rule sets to evaluate employee attendance, calculate half-days/absences, and automate regularization constraints.
6. **Why the API Exists:** Serves as the calculation contract referenced by shift templates and the attendance calculation engine during daily punch processing.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`. Requires `attendance.access` feature flag.
8. **Real-World Usage:** Called during organization onboarding or when setting up custom rules for specific branches, departments, or shifts.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "Standard Corporate Policy",
       "is_default": true,
       "is_active": true,
       "grace_minutes": 15,
       "late_threshold_minutes": 30,
       "half_day_min_hours": 4.00,
       "full_day_min_hours": 8.00,
       "early_exit_threshold_minutes": 15,
       "overtime_enabled": true,
       "overtime_min_minutes": 60,
       "overtime_requires_approval": true,
       "auto_clock_out_enabled": true,
       "auto_clock_out_after_hours": 12.00,
       "auto_detect_shift": false,
       "missing_punch_action": "flag",
       "max_break_duration_minutes": 60,
       "max_breaks_per_day": 3,
       "regularization_allowed": true,
       "regularization_window_days": 7,
       "comp_off_on_holiday_work": true,
       "late_count_half_day_threshold": 3,
       "consecutive_late_penalty_days": 2
     }
     ```
10. **Field Meanings:**
    - `name` (string, required): Policy name (max 150 chars).
    - `is_default` (boolean, optional): If true, unsets any existing default and makes this the org-wide fallback.
    - `grace_minutes` (number, optional, 0–120): Minutes past shift start before an employee is marked late.
    - `late_threshold_minutes` (number, optional, 0–480): Maximum lateness allowed before penalty calculation.
    - `half_day_min_hours` (number, optional, 1–24): Minimum effective hours required to qualify for half-day credit (default 4.00).
    - `full_day_min_hours` (number, optional, 1–24): Minimum effective hours required to qualify for full-day credit (default 8.00).
    - `early_exit_threshold_minutes` (number, optional, 0–480): Minutes before shift end that triggers an early-exit penalty.
    - `overtime_enabled` (boolean, optional): Enables tracking extra hours worked.
    - `overtime_min_minutes` (number, optional, 0–480): Minimum extra minutes required before overtime begins accumulating.
    - `overtime_requires_approval` (boolean, optional): Whether accumulated overtime requires managerial sign-off.
    - `auto_clock_out_enabled` (boolean, optional): Enables automatic clock-out if employee forgets to punch out.
    - `auto_clock_out_after_hours` (number, optional, 1–24): Hours after which auto clock-out triggers.
    - `missing_punch_action` (string, optional): One of `'flag'`, `'half_day'`, or `'absent'`.
    - `max_break_duration_minutes` (number, optional): Total allowed cumulative break duration.
    - `max_breaks_per_day` (number, optional): Allowed number of break sessions per day.
    - `regularization_allowed` (boolean, optional): Allows employees to raise regularization requests.
    - `regularization_window_days` (number, optional, 1–365): Backdated day window within which regularization is accepted.
    - `comp_off_on_holiday_work` (boolean, optional): Auto-generates comp-off credit when working on holidays/offs.
    - `late_count_half_day_threshold` (number, optional): Number of late marks that trigger a half-day deduction.
11. **Backend Processing Flow:**
    - `hr_attendance.routes.js` validates payload via `validator.createPolicySchema`.
    - Controller calls `policyService.createPolicy(orgId, userId, body)`.
    - Starts Sequelize database transaction.
    - If `data.is_default` is true, finds active default policy in org and updates `is_default = false`.
    - If `data.is_default` is false and org has no existing active default, automatically sets `data.is_default = true`.
    - Inserts record into `attendance_policies` with `created_by` and `updated_by`.
    - Commits transaction and returns created policy entity.
12. **Database Impact:** Inserts 1 row into `attendance_policies`. May update 1 row in `attendance_policies` if unsetting previous default.
13. **Validation Rules:**
    - `name` is required, max 150 chars.
    - `half_day_min_hours` and `full_day_min_hours` must be positive numbers with precision up to 2 decimals.
    - `missing_punch_action` must be one of `['flag', 'half_day', 'absent']`.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Policy created successfully",
        "data": {
          "id": "c61b1a43-85dc-468f-9a1b-689e4726f1a2",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "name": "Standard Corporate Policy",
          "is_default": true,
          "is_active": true,
          "grace_minutes": 15,
          "half_day_min_hours": 4.00,
          "full_day_min_hours": 8.00,
          "created_at": "2026-09-13T04:00:00.000Z",
          "updated_at": "2026-09-13T04:00:00.000Z"
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Validation error in thresholds or unsupported enum values.
    - `401 UNAUTHORIZED`: Invalid or expired JWT token.
    - `403 FORBIDDEN`: Caller lacks HR or admin permissions.
16. **Security / Authorization Behavior:** Scoped to caller's `org_id`. Cannot affect policies in other organizations.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`. Retrying with identical name will create duplicate records unless prevented by database constraints.
18. **Transactions / Concurrency Behavior:** Wrapped in a database transaction with atomic updates to maintain single-default integrity.
19. **Side Effects:** If set as default, modifies existing default policy's `is_default` flag.
20. **Important Edge Cases:** First policy created for an organization is automatically forced to `is_default: true` regardless of payload value.
21. **Related APIs / Dependencies:** `GET /policies`, `PUT /policies/:id`, `POST /shifts`.
22. **What the API Gives / Does:** Creates and persists a comprehensive attendance calculation policy.

---

### API 2 — List Attendance Policies

1. **API Number and Name:** API 2 — List Attendance Policies
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/policies`
4. **Purpose:** Retrieves all attendance policies configured for the organization.
5. **Business Problem Solved:** Allows HR administrators to view and compare all configured attendance policies.
6. **Why the API Exists:** Provides data for policy selection dropdowns in shift template configuration and HR admin tables.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Executed when opening the Policy Management tab in the HRMS admin console.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** Optional filters (`is_active`, `is_default`).
10. **Field Meanings:** Query filters allow filtering by active status or default designation.
11. **Backend Processing Flow:**
    - Extracts `orgId` from JWT.
    - Calls `policyService.getPolicies(orgId, req.query)`.
    - Queries `attendance_policies` ordered by `created_at DESC`.
    - Returns array of policies.
12. **Database Impact:** Read-only `SELECT` on `attendance_policies`.
13. **Validation Rules:** None on query string.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Policies fetched successfully",
        "data": [
          {
            "id": "c61b1a43-85dc-468f-9a1b-689e4726f1a2",
            "name": "Standard Corporate Policy",
            "is_default": true,
            "is_active": true,
            "grace_minutes": 15,
            "half_day_min_hours": "4.00",
            "full_day_min_hours": "8.00"
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Filtered strictly by `org_id`.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** Plain read query.
19. **Side Effects:** None.
20. **Important Edge Cases:** If no policies exist, returns `data: []`.
21. **Related APIs / Dependencies:** `POST /policies`, `GET /policies/:id`.
22. **What the API Gives / Does:** Complete list of attendance policies for the organization.

---

### API 3 — Get Attendance Policy By ID

1. **API Number and Name:** API 3 — Get Attendance Policy By ID
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/policies/:id`
4. **Purpose:** Retrieves full configuration details for a single specific attendance policy.
5. **Business Problem Solved:** Enables viewing specific rules, penalties, and threshold configurations for auditing or editing.
6. **Why the API Exists:** Provides details required to populate policy edit forms.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Triggered when clicking "Edit Policy" or "View Details" on a policy card.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **URL Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** `id` is the primary key of the attendance policy.
11. **Backend Processing Flow:**
    - Validates `id` format using `validator.idParamSchema`.
    - Queries `attendance_policies` by primary key.
    - Verifies record exists and matches `org_id`. Throws `404 POLICY_NOT_FOUND` if mismatched or missing.
    - Returns policy object.
12. **Database Impact:** Read-only `SELECT` on `attendance_policies`.
13. **Validation Rules:** `id` must be a valid UUID v4.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Full policy configuration JSON.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Invalid UUID parameter.
    - `404 POLICY_NOT_FOUND`: Policy does not exist or belongs to another organization.
16. **Security / Authorization Behavior:** Enforces tenant isolation.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Accessing another tenant's policy ID returns 404.
21. **Related APIs / Dependencies:** `PUT /policies/:id`, `PATCH /policies/:id/deactivate`.
22. **What the API Gives / Does:** Complete configuration object of the requested policy.

---

### API 4 — Update Attendance Policy

1. **API Number and Name:** API 4 — Update Attendance Policy
2. **HTTP Method:** `PUT`
3. **Endpoint:** `/api/v1/attendance/hr/policies/:id`
4. **Purpose:** Modifies threshold parameters, grace minutes, overtime rules, or default status of an existing policy.
5. **Business Problem Solved:** Allows policy evolution without breaking existing historical attendance logs.
6. **Why the API Exists:** Core update endpoint for attendance administration.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR increases grace period during severe weather or modifies overtime approval thresholds.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** Any valid subset of policy fields from `createPolicySchema` (e.g. `{ "grace_minutes": 20 }`).
10. **Field Meanings:** Partial or full replacement values for policy attributes.
11. **Backend Processing Flow:**
    - Validates `id` and body schemas.
    - Opens transaction and fetches policy with row lock (`LOCK.UPDATE`).
    - Verifies ownership (`org_id`). Throws `404 POLICY_NOT_FOUND` if missing.
    - Verifies policy is active. Throws `400 POLICY_DEACTIVATED` if inactive.
    - If `data.is_default === false` and policy was default, throws `400 CANNOT_UNSET_DEFAULT` (default can only be changed by setting another policy as default).
    - If `data.is_default === true` and policy was not default, unsets old default policy.
    - Updates record in `attendance_policies` with `updated_by = req.user.id`.
    - Commits transaction and returns updated record.
12. **Database Impact:** Updates 1 row in `attendance_policies` (and potentially updates previous default policy).
13. **Validation Rules:** All fields optional; validated against ranges defined in `createPolicySchema`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated policy object.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 POLICY_DEACTIVATED`: Attempting to edit a deactivated policy.
    - `400 CANNOT_UNSET_DEFAULT`: Attempting to set `is_default: false` directly.
    - `404 POLICY_NOT_FOUND`: Policy not found in tenant.
16. **Security / Authorization Behavior:** Strictly enforces org boundaries.
17. **Idempotency and Retry Behavior:** Idempotent `PUT` with identical payload.
18. **Transactions / Concurrency Behavior:** Uses row-level lock and transaction to ensure default flag consistency.
19. **Side Effects:** Modifies future attendance calculations using this policy.
20. **Important Edge Cases:** Modifying policy does not retroactively recalculate past finalized records.
21. **Related APIs / Dependencies:** `GET /policies/:id`, `PATCH /policies/:id/deactivate`.
22. **What the API Gives / Does:** Updates and returns the revised policy.

---

### API 5 — Deactivate Attendance Policy

1. **API Number and Name:** API 5 — Deactivate Attendance Policy
2. **HTTP Method:** `PATCH`
3. **Endpoint:** `/api/v1/attendance/hr/policies/:id/deactivate`
4. **Purpose:** Soft-deactivates an attendance policy, preventing it from being assigned to shifts or employees.
5. **Business Problem Solved:** Deprecates obsolete policies while preserving historical integrity.
6. **Why the API Exists:** Provides safe archival mechanism without violating relational constraints.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Retiring a legacy policy after migrating all employees to a unified standard policy.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Validates `id` parameter.
    - Starts transaction and fetches policy under lock.
    - Asserts policy exists and belongs to `org_id`.
    - Checks `policy.is_default`. If true, throws `400 CANNOT_DEACTIVATE_DEFAULT`.
    - Updates `is_active = false` and `updated_by = req.user.id`.
    - Commits transaction and returns deactivated policy.
12. **Database Impact:** Sets `is_active = false` on 1 row in `attendance_policies`.
13. **Validation Rules:** `id` must be valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Policy deactivated successfully", "data": { ... } }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 CANNOT_DEACTIVATE_DEFAULT`: Default policy cannot be deactivated.
    - `404 POLICY_NOT_FOUND`: Record not found in org.
16. **Security / Authorization Behavior:** Scoped to caller tenant.
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Transactional update under row lock.
19. **Side Effects:** Deactivated policies cannot be selected in shift configuration.
20. **Important Edge Cases:** If this is the only policy, error `CANNOT_DEACTIVATE_DEFAULT` prevents leaving the org without an active default.
21. **Related APIs / Dependencies:** `PUT /policies/:id`, `GET /policies`.
22. **What the API Gives / Does:** Flags policy as inactive.

---

## 2. Shift Assignments

### API 6 — Assign Shift or Rotation to Employee

1. **API Number and Name:** API 6 — Assign Shift or Rotation to Employee
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/assign`
4. **Purpose:** Assigns an employee to a specific shift template or dynamic rotation pattern starting from an effective date.
5. **Business Problem Solved:** Associates workers with scheduled work hours, enabling accurate calculation of late minutes, early departures, and overtime.
6. **Why the API Exists:** Core assignment engine connecting workforce members to scheduling rules.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Executed when onboarding new hires, transferring employees between departments, or rotating factory staff to night shifts.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "user_id": "5a61d281-9b6f-40e8-8d07-6f8d38e23bb4",
       "shift_id": "7ca19283-bc2a-4a2f-98ec-7ea88f5539ab",
       "effective_from": "2026-10-01",
       "effective_to": null
     }
     ```
10. **Field Meanings:**
    - `user_id` (UUID, required): The target employee.
    - `shift_id` (UUID, optional): Static shift template ID.
    - `rotation_pattern_id` (UUID, optional): Rotational schedule pattern ID. Note: Exactly one of `shift_id` or `rotation_pattern_id` must be provided (enforced via `.xor()`).
    - `effective_from` (ISO date string, required): Start date of the assignment.
    - `effective_to` (ISO date string, optional): End date. If `null`, assignment remains indefinitely active.
11. **Backend Processing Flow:**
    - Validates body via `assignShiftSchema` (enforces XOR between shift and rotation).
    - Checks user exists and is a member of the caller's organization (`EMPLOYEE_NOT_FOUND`).
    - Verifies the selected shift or rotation exists, is active, and belongs to `org_id`.
    - Opens transaction. Queries existing active assignments for this employee overlapping with `effective_from` using `LOCK.UPDATE`.
    - Automatically truncates prior active assignments: sets existing `effective_to` to `effective_from - 1 day` (or destroys record if start date was eclipsed).
    - Inserts new record into `employee_shift_assignments` with `assigned_by = req.user.id`.
    - Commits transaction and returns assignment object.
12. **Database Impact:** Inserts 1 row into `employee_shift_assignments`; updates or deletes overlapping prior assignment rows.
13. **Validation Rules:**
    - Exactly one of `shift_id` or `rotation_pattern_id` must be present.
    - `effective_from` must be a valid ISO date.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Shift assigned successfully",
        "data": {
          "id": "e81f7d23-...",
          "org_id": "b782fd72-...",
          "user_id": "5a61d281-...",
          "shift_id": "7ca19283-...",
          "rotation_pattern_id": null,
          "effective_from": "2026-10-01T00:00:00.000Z",
          "effective_to": null,
          "assigned_by": "1c92a10b-..."
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 INVALID_SHIFT`: Selected shift template does not exist or is inactive.
    - `400 INVALID_PATTERN`: Selected rotation pattern does not exist or is inactive.
    - `404 EMPLOYEE_NOT_FOUND`: Target user is not an active member in this tenant.
16. **Security / Authorization Behavior:** Prevents assigning employees outside the tenant.
17. **Idempotency and Retry Behavior:** Truncates overlaps, making retries safe but sequential.
18. **Transactions / Concurrency Behavior:** Uses pessimistic row-level locking on existing assignments to prevent schedule conflicts.
19. **Side Effects:** Truncates previous active shift assignments for this employee.
20. **Important Edge Cases:** If an assignment exists that started in the future and is completely superseded by this new assignment, the superseded record is destroyed.
21. **Related APIs / Dependencies:** `GET /shifts/assignments`, `POST /shifts/assignments/:id/end`.
22. **What the API Gives / Does:** Establishes working schedule for the employee.

---

### API 7 — List Shift Assignments

1. **API Number and Name:** API 7 — List Shift Assignments
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/assignments`
4. **Purpose:** Retrieves a historical and active ledger of employee shift assignments.
5. **Business Problem Solved:** Enables roster visibility, shift audit checks, and scheduling verification across the workforce.
6. **Why the API Exists:** Provides data for employee roster tables and scheduling matrices in the HR portal.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Reviewing team shift coverage for the upcoming quarter.
9. **Request Parameters and Payload:**
   - **Query Parameters:** Optional filters (`user_id`, `shift_id`).
10. **Field Meanings:** Filter by specific employee or shift template.
11. **Backend Processing Flow:**
    - Queries `employee_shift_assignments` scoped by `org_id`.
    - Eager-loads associated `User` (including `UserProfile`, `EmployeeProfile`, `ManagerProfile`, `HrProfile`), `ShiftTemplates`, and `ShiftRotationPatterns`.
    - Orders results by `effective_from DESC`.
12. **Database Impact:** Read-only `SELECT` with multi-table joins.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns array of assignment records with populated user and shift metadata.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-isolated.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if no assignments match filters.
21. **Related APIs / Dependencies:** `POST /shifts/assign`, `DELETE /shifts/assignments/:assignment_id`.
22. **What the API Gives / Does:** Detailed roster assignments with full employee profile details.

---

### API 8 — Delete Shift Assignment Record

1. **API Number and Name:** API 8 — Delete Shift Assignment Record
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/assignments/:assignment_id`
4. **Purpose:** Hard-deletes an erroneous or duplicate shift assignment record.
5. **Business Problem Solved:** Corrects accidental or mistaken shift assignments.
6. **Why the API Exists:** Clean-up endpoint for erroneous roster entries.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Removing an erroneously assigned shift before the employee starts work.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `assignment_id` (UUID, required).
10. **Field Meanings:** Primary key of the assignment record.
11. **Backend Processing Flow:**
    - Validates `assignment_id` format via `assignmentIdParamSchema`.
    - Finds record by ID and `org_id`. Throws `404 ASSIGNMENT_NOT_FOUND` if missing.
    - Executes hard delete (`assignment.destroy()`).
    - Returns success response.
12. **Database Impact:** Deletes 1 row from `employee_shift_assignments`.
13. **Validation Rules:** `assignment_id` must be valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Shift assignment deleted successfully" }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 ASSIGNMENT_NOT_FOUND`: Assignment ID does not exist in organization.
16. **Security / Authorization Behavior:** Tenant-scoped deletion.
17. **Idempotency and Retry Behavior:** Idempotent; second call returns 404.
18. **Transactions / Concurrency Behavior:** Single record delete.
19. **Side Effects:** Employee will fall back to organization default shift if no other active assignment exists.
20. **Important Edge Cases:** Deleting an active assignment may cause subsequent punches to resolve to the default shift.
21. **Related APIs / Dependencies:** `POST /shifts/assign`, `POST /shifts/assignments/:assignment_id/end`.
22. **What the API Gives / Does:** Removes the assignment record completely.

---

### API 9 — End Active Shift Assignment

1. **API Number and Name:** API 9 — End Active Shift Assignment
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/assignments/:assignment_id/end`
4. **Purpose:** Closes an open-ended shift assignment by setting its `effective_to` date.
5. **Business Problem Solved:** Allows terminating an employee's shift assignment on a planned date without deleting historical schedule context.
6. **Why the API Exists:** Provides graceful roster termination.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Offboarding an employee from a temporary night shift assignment at the end of the month.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `assignment_id` (UUID, required).
   - **Body:**
     ```json
     {
       "effective_to": "2026-10-31"
     }
     ```
10. **Field Meanings:** `effective_to` is the final date the assignment remains active.
11. **Backend Processing Flow:**
    - Validates parameters via `assignmentIdParamSchema` and `endShiftAssignmentSchema`.
    - Finds assignment record matching `assignment_id` and `org_id`.
    - Validates `effective_to >= effective_from`. Throws `400 INVALID_DATE` if `effective_to` is before `effective_from`.
    - Updates `assignment.effective_to = effectiveToDate` and saves record.
    - Returns updated assignment.
12. **Database Impact:** Updates 1 row in `employee_shift_assignments`.
13. **Validation Rules:** `effective_to` is required ISO date and cannot precede `effective_from`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated assignment object with populated `effective_to`.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 INVALID_DATE`: End date precedes assignment start date.
    - `404 ASSIGNMENT_NOT_FOUND`: Assignment record not found.
16. **Security / Authorization Behavior:** Scoped to caller tenant.
17. **Idempotency and Retry Behavior:** Idempotent when called with the same end date.
18. **Transactions / Concurrency Behavior:** Standard atomic save.
19. **Side Effects:** From `effective_to + 1 day` onwards, employee is no longer bound to this shift.
20. **Important Edge Cases:** If `effective_to` is set to today, assignment ends immediately after today.
21. **Related APIs / Dependencies:** `POST /shifts/assign`, `GET /shifts/assignments`.
22. **What the API Gives / Does:** Finalizes and caps an active shift assignment.

---

## 3. Shift Templates

### API 10 — Create Shift Template

1. **API Number and Name:** API 10 — Create Shift Template
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/shifts`
4. **Purpose:** Creates a shift template defining the work-hour window and overnight behavior.
5. **Business Problem Solved:** Defines standard working time windows required for automated punch evaluation.
6. **Why the API Exists:** Forms the core schedule definition entity in the attendance module.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Configuring standard morning (09:00–18:00), night (22:00–06:00), or flexible retail shifts.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "General Morning Shift",
       "type": "fixed",
       "start_time": "09:00",
       "end_time": "18:00",
       "timezone": "Asia/Kolkata",
       "is_overnight": false,
       "is_active": true,
       "policy_id": "c61b1a43-85dc-468f-9a1b-689e4726f1a2"
     }
     ```

    > ⚠️ **Migration 00046 removed seven fields** from this payload and from every shift response: `min_hours`, `core_start_time`, `core_end_time`, `split_start_time_2`, `split_end_time_2`, `buffer_minutes_before`, `buffer_minutes_after`. They were stored but never read by the calculation engine. Sending them still returns `201` (unknown keys are stripped); **reading** them will break. Use the policy's `full_day_min_hours` / `half_day_min_hours` in place of `min_hours`, and `grace_minutes` for lateness. See `ATTENDANCE_API_CONTRACT.md` §5.2.

10. **Field Meanings:**
    - `name` (string, required): Shift title.
    - `type` (string, required): One of `'fixed'`, `'flexible'`, `'split'`, `'night'`, `'rotational'`. Only `fixed`, `night` and `rotational` carry distinct behaviour — `split` and `flexible` are descriptive labels (see Edge Cases).
    - `start_time` / `end_time` (string `HH:mm`): Required for `fixed`, `night` and `split` shifts.
    - `is_overnight` (boolean): Flags shifts crossing midnight into next day.
    - `timezone` (string): Timezone the shift times are interpreted in. Defaults to `Asia/Kolkata`.
    - `policy_id` (UUID, optional): Associated custom policy ID; falls back to org default policy if null.
11. **Backend Processing Flow:**
    - Validates payload against `createShiftSchema`.
    - Enforces the one type-specific invariant: `fixed`, `night` or `split` requires both `start_time` and `end_time` (`INVALID_SHIFT_DATA`). `flexible` and `rotational` require neither.
    - Opens transaction, assigns `org_id`, `created_by`, `updated_by`.
    - Inserts record into `shift_templates`.
    - Commits transaction and returns created shift template.
12. **Database Impact:** Inserts 1 row into `shift_templates`.
13. **Validation Rules:** Time strings must match `HH:mm` or `HHmm`. Type must be valid enum.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns created shift object with UUID primary key.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 INVALID_SHIFT_DATA`: Missing required time bounds for specified shift type.
    - `401 UNAUTHORIZED`: Invalid credentials.
16. **Security / Authorization Behavior:** Scoped to tenant.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`.
18. **Transactions / Concurrency Behavior:** Executed inside database transaction.
19. **Side Effects:** Makes template available for employee assignment.
20. **Important Edge Cases:**
    - If `policy_id` is omitted, runtime attendance calculations link this shift to the organization's active default policy.
    - 🔴 `type: 'split'` records intent only. With the second window removed there is no way to express one, and the engine has never evaluated one: hours are computed from first clock-in to last clock-out minus breaks, exactly as for `fixed`. `type: 'flexible'` likewise now carries no type-specific field; because it has no `start_time`/`end_time`, late and early-exit minutes are simply not computed for it, and status comes purely from effective hours against the policy thresholds.
21. **Related APIs / Dependencies:** `GET /shifts`, `PUT /shifts/:id`, `DELETE /shifts/:id`.
22. **What the API Gives / Does:** Creates reusable shift template.

---

### API 11 — List Shift Templates

1. **API Number and Name:** API 11 — List Shift Templates
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/shifts`
4. **Purpose:** Retrieves all shift templates configured within the organization.
5. **Business Problem Solved:** Provides complete list of work shifts for administration, assignment, and scheduling.
6. **Why the API Exists:** Powers shift catalog views in HR console.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Populating shift selection menus in employee profile and roster assignment modals.
9. **Request Parameters and Payload:**
   - **Query Parameters:** Optional filters (`is_active`, `type`).
10. **Field Meanings:** Filter by activity state or shift type.
11. **Backend Processing Flow:**
    - Queries `shift_templates` filtered by `org_id` and query parameters.
    - Orders results by `created_at DESC`.
    - Returns array of shifts.
12. **Database Impact:** Read-only `SELECT` on `shift_templates`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Array of shift template records.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** Plain read.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if none configured.
21. **Related APIs / Dependencies:** `POST /shifts`, `GET /shifts/:id`.
22. **What the API Gives / Does:** Returns list of all defined shift templates.

---

### API 12 — Get Shift Template By ID

1. **API Number and Name:** API 12 — Get Shift Template By ID
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/:id`
4. **Purpose:** Retrieves detailed configuration for a specific shift template.
5. **Business Problem Solved:** Allows viewing exact time bounds, buffers, and policy associations for a shift.
6. **Why the API Exists:** Provides data for shift edit forms.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Triggered when clicking on a shift card to view its detailed timing rules.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Primary key of shift template.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Finds shift template by primary key.
    - Validates ownership (`org_id`). Throws `404 SHIFT_NOT_FOUND` if missing or from another tenant.
    - Returns shift template.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Detailed shift configuration JSON.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 SHIFT_NOT_FOUND`: Shift does not exist in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Accessing other org's shift ID returns 404.
21. **Related APIs / Dependencies:** `PUT /shifts/:id`, `DELETE /shifts/:id`.
22. **What the API Gives / Does:** Full shift definition object.

---

### API 13 — Update Shift Template

1. **API Number and Name:** API 13 — Update Shift Template
2. **HTTP Method:** `PUT`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/:id`
4. **Purpose:** Modifies working hours, buffers, or linked policy for an existing shift template.
5. **Business Problem Solved:** Adapts shift schedules to business operational adjustments.
6. **Why the API Exists:** Editing endpoint for shift configuration.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Adjusting shift start time from 09:00 to 09:30 for winter timings.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** Any valid subset of fields from `createShiftSchema`.
10. **Field Meanings:** Revised shift attributes.
11. **Backend Processing Flow:**
    - Validates `id` and body schemas.
    - Opens transaction, finds shift under lock.
    - Checks shift exists and matches `org_id` (`404 SHIFT_NOT_FOUND`).
    - Verifies shift is active (`400 SHIFT_DEACTIVATED`).
    - Updates shift record with `updated_by = req.user.id`.
    - Commits transaction and returns updated record.
12. **Database Impact:** Updates 1 row in `shift_templates`.
13. **Validation Rules:** All fields optional; validated against shift schema.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated shift template entity.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 SHIFT_DEACTIVATED`: Attempting to edit an inactive shift.
    - `404 SHIFT_NOT_FOUND`: Shift not found in tenant.
16. **Security / Authorization Behavior:** Strictly tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent `PUT`.
18. **Transactions / Concurrency Behavior:** Transactional update under row lock.
19. **Side Effects:** Updates will apply to subsequent attendance calculations for employees assigned to this shift.
20. **Important Edge Cases:** Does not retroactively alter past finalized attendance records.
21. **Related APIs / Dependencies:** `GET /shifts/:id`, `DELETE /shifts/:id`.
22. **What the API Gives / Does:** Returns updated shift template.

---

### API 14 — Deactivate / Delete Shift Template

1. **API Number and Name:** API 14 — Deactivate / Delete Shift Template
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/shifts/:id`
4. **Purpose:** Soft-deactivates a shift template, preventing future employee assignments.
5. **Business Problem Solved:** Safely phases out legacy shift schedules without breaking historical punch links.
6. **Why the API Exists:** Archival endpoint for obsolete shifts.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Decommissioning an experimental evening shift template.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Shift primary key.
11. **Backend Processing Flow:**
    - Validates `id` format.
    - Starts transaction, fetches shift under lock.
    - Verifies shift exists and belongs to `org_id` (`404 SHIFT_NOT_FOUND`).
    - Queries `EmployeeShiftAssignments` to check for active assignments (`effective_to IS NULL` or `effective_to >= NOW()`).
    - If active assignments exist, throws `400 SHIFT_IN_USE` ("Cannot deactivate a shift that is currently assigned to employees").
    - Updates `is_active = false` and `updated_by = req.user.id`.
    - Commits transaction and returns updated shift.
12. **Database Impact:** Sets `is_active = false` on 1 row in `shift_templates`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Shift deactivated successfully", "data": { ... } }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 SHIFT_IN_USE`: Shift cannot be deactivated while actively assigned to workers.
    - `404 SHIFT_NOT_FOUND`: Shift does not exist in tenant.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent deactivation.
18. **Transactions / Concurrency Behavior:** Enforces relational integrity checks inside transaction under row lock.
19. **Side Effects:** Shift can no longer be assigned to employees.
20. **Important Edge Cases:** HR must first end or reassign all active employee assignments before deactivating the shift template.
21. **Related APIs / Dependencies:** `POST /shifts/assignments/:id/end`, `GET /shifts`.
22. **What the API Gives / Does:** Flags shift template as inactive.

---

## 4. Shift Rotation Patterns

### API 15 — Create Shift Rotation Pattern

1. **API Number and Name:** API 15 — Create Shift Rotation Pattern
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/rotations`
4. **Purpose:** Creates a recurring multi-shift rotation schedule (e.g. 5 days Morning, 2 days Off, 5 days Night).
5. **Business Problem Solved:** Automates complex rotating shift patterns in 24/7 continuous operations (hospitals, manufacturing, support centers) without requiring manual weekly shift reassignments.
6. **Why the API Exists:** Core rotational scheduling definition endpoint.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Setting up a 14-day rotational cycle for security personnel.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "24/7 Plant Rotation Cycle",
       "rotation_cycle_days": 14,
       "start_reference_date": "2026-10-01",
       "entries": [
         {
           "shift_id": "7ca19283-bc2a-4a2f-98ec-7ea88f5539ab",
           "sequence_order": 1,
           "duration_days": 7
         },
         {
           "shift_id": "9ea21481-cd3b-4c3e-87ef-6fb99e4428cd",
           "sequence_order": 2,
           "duration_days": 7
         }
       ]
     }
     ```
10. **Field Meanings:**
    - `name` (string, required): Pattern title (max 150 chars).
    - `rotation_cycle_days` (integer, required, 1–365): Total cycle length in days.
    - `start_reference_date` (ISO date, required): Anchor date from which rotation arithmetic is computed.
    - `entries` (array of objects, min 1, required):
      - `shift_id` (UUID, required): Template ID for this stage.
      - `sequence_order` (integer, required): Execution order (1, 2, ...).
      - `duration_days` (integer, required): Days spent in this shift before moving to next sequence.
11. **Backend Processing Flow:**
    - Validates payload via `createRotationSchema`.
    - Asserts sum of `duration_days` across all entries exactly equals `rotation_cycle_days`. Throws `400 INVALID_ROTATION_DURATIONS` if unequal.
    - Opens database transaction.
    - Inserts rotation pattern header into `shift_rotation_patterns`.
    - Validates each referenced `shift_id` exists, belongs to `org_id`, and is active (`INVALID_SHIFT`).
    - Inserts child entries into `shift_rotation_entries`.
    - Commits transaction and returns pattern entity.
12. **Database Impact:** Inserts 1 row into `shift_rotation_patterns` and N rows into `shift_rotation_entries`.
13. **Validation Rules:** Sum of entry durations must match `rotation_cycle_days`. All shifts must be active.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns created rotation pattern object with UUID.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 INVALID_ROTATION_DURATIONS`: Sum of entry durations does not equal `rotation_cycle_days`.
    - `400 INVALID_SHIFT`: One or more shift templates are invalid or inactive.
16. **Security / Authorization Behavior:** Scoped to caller tenant.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`.
18. **Transactions / Concurrency Behavior:** Atomic transaction inserting header and entries together.
19. **Side Effects:** Makes rotation pattern available for employee assignment via API 6.
20. **Important Edge Cases:** If cycle length is 14 days, the sum of `duration_days` must be exactly 14; 13 or 15 triggers an immediate 400 rejection.
21. **Related APIs / Dependencies:** `GET /rotations`, `DELETE /rotations/:id`, `POST /shifts/assign`.
22. **What the API Gives / Does:** Creates rotation pattern and associated sequence stages.

---

### API 16 — List Shift Rotation Patterns

1. **API Number and Name:** API 16 — List Shift Rotation Patterns
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/rotations`
4. **Purpose:** Retrieves all shift rotation patterns configured for the organization.
5. **Business Problem Solved:** Provides complete inventory of rotational scheduling templates.
6. **Why the API Exists:** Feeds rotation catalog tables and assignment selection dropdowns.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Browsing existing rotation schemes during workforce planning.
9. **Request Parameters and Payload:**
   - **Query Parameters:** Optional filters (`is_active`).
10. **Field Meanings:** Filter by active/inactive state.
11. **Backend Processing Flow:**
    - Queries `shift_rotation_patterns` for `org_id`.
    - For each pattern, fetches and embeds child entries from `shift_rotation_entries`.
    - Returns array of patterns with populated entries.
12. **Database Impact:** Read-only `SELECT` on patterns and entries.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns array of rotation patterns with nested `entries`.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** Plain read.
19. **Side Effects:** None.
20. **Important Edge Cases:** Patterns without entries return `entries: []`.
21. **Related APIs / Dependencies:** `POST /rotations`, `DELETE /rotations/:id`.
22. **What the API Gives / Does:** List of all configured rotation patterns with entry sequences.

---

### API 17 — Deactivate Shift Rotation Pattern

1. **API Number and Name:** API 17 — Deactivate Shift Rotation Pattern
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/rotations/:id`
4. **Purpose:** Deactivates a shift rotation pattern, preventing future assignments.
5. **Business Problem Solved:** Retires obsolete rotation cycles safely.
6. **Why the API Exists:** Deactivation endpoint ensuring relational scheduling integrity.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Retiring a discontinued rotation schedule.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Rotation pattern primary key.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Opens transaction, fetches pattern under lock.
    - Verifies pattern exists and belongs to `org_id` (`404 PATTERN_NOT_FOUND`).
    - Queries `EmployeeShiftAssignments` for active assignments using this pattern (`effective_to IS NULL` or `>= NOW()`).
    - If active assignments exist, throws `400 PATTERN_IN_USE`.
    - Updates `is_active = false`.
    - Commits transaction and returns updated pattern.
12. **Database Impact:** Sets `is_active = false` on 1 row in `shift_rotation_patterns`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Rotation pattern deactivated successfully", "data": { ... } }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 PATTERN_IN_USE`: Pattern is currently assigned to employees and cannot be deactivated.
    - `404 PATTERN_NOT_FOUND`: Pattern not found in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Transactional check under row lock.
19. **Side Effects:** Pattern can no longer be assigned.
20. **Important Edge Cases:** Employees must be transitioned to other shifts before deactivation can succeed.
21. **Related APIs / Dependencies:** `GET /rotations`, `POST /shifts/assign`.
22. **What the API Gives / Does:** Flags rotation pattern as inactive.

---

## 5. Exceptions — Holidays Management

### API 18 — Create Holiday

1. **API Number and Name:** API 18 — Create Holiday
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/holidays`
4. **Purpose:** Creates a public, optional, or restricted holiday applicable org-wide or scoped to specific departments, locations, or user groups.
5. **Business Problem Solved:** Ensures employees are not penalized as absent on official holidays, and automates holiday comp-off eligibility for employees who work on these days.
6. **Why the API Exists:** Core calendar exception definition endpoint.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Adding national holidays or regional festival holidays for specific branch offices.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "Independence Day",
       "date": "2026-08-15",
       "type": "public",
       "target_departments": [],
       "target_locations": ["a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"],
       "target_employment_types": ["full_time", "intern"],
       "target_job_statuses": ["confirmed", "probation"],
       "included_users": [],
       "excluded_users": []
     }
     ```
10. **Field Meanings:**
    - `name` (string, required): Holiday title (max 255 chars).
    - `date` (string `YYYY-MM-DD`, required): Exact calendar date.
    - `type` (string, optional): One of `'public'`, `'optional'`, `'restricted'`. Default `'public'`.
    - `target_departments` (UUID[]): Department IDs where this holiday applies (empty array = all).
    - `target_locations` (UUID[]): Office location IDs where this holiday applies (empty array = all).
    - `target_employment_types` (string[]): Applicable employment types.
    - `target_job_statuses` (string[]): Applicable job statuses.
    - `included_users` / `excluded_users` (UUID[]): Explicit individual employee inclusions/exclusions overriding group rules.
11. **Backend Processing Flow:**
    - Validates date format using Day.js strict parser (`YYYY-MM-DD`).
    - Opens database transaction.
    - Inserts holiday into `attendance_holidays` with `org_id` and `created_by = req.user.id`.
    - Commits transaction and returns created holiday.
12. **Database Impact:** Inserts 1 row into `attendance_holidays`.
13. **Validation Rules:** Date must be valid calendar date in `YYYY-MM-DD` format. Type must be valid enum.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns created holiday entity with UUID.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Invalid date format or unrecognized enum.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`.
18. **Transactions / Concurrency Behavior:** Transactional insert.
19. **Side Effects:** Automatically exempts matching employees from clocking in on this date during daily calculation.
20. **Important Edge Cases:** If an employee belongs to `target_locations` but is listed in `excluded_users`, they will be expected to work normally on this date.
21. **Related APIs / Dependencies:** `GET /holidays`, `PUT /holidays/:id`, `DELETE /holidays/:id`.
22. **What the API Gives / Does:** Creates and activates a holiday rule.

---

### API 19 — List Holidays

1. **API Number and Name:** API 19 — List Holidays
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/holidays`
4. **Purpose:** Retrieves all active holidays configured for the organization, optionally filtered by calendar year.
5. **Business Problem Solved:** Provides company holiday calendar for employee display and annual planning.
6. **Why the API Exists:** Powers the holiday list table in HR admin and employee calendar views.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Fetching the 2026 organizational holiday calendar.
9. **Request Parameters and Payload:**
   - **Query Parameters:** `year` (integer, optional, e.g. `2026`).
10. **Field Meanings:** `year` restricts results to holidays occurring between `Jan 1` and `Dec 31` of that year.
11. **Backend Processing Flow:**
    - Extracts `orgId` from JWT.
    - Constructs where clause with `org_id` and `is_active: true`.
    - If `year` is provided, adds date range filter `[Op.gte]: YYYY-01-01` and `[Op.lte]: YYYY-12-31`.
    - Queries `attendance_holidays` ordered by `date ASC`.
    - Returns array of holidays.
12. **Database Impact:** Read-only `SELECT` on `attendance_holidays`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Array of holiday records sorted chronologically.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If no holidays exist for the requested year, returns `data: []`.
21. **Related APIs / Dependencies:** `POST /holidays`, `GET /holidays/:id`.
22. **What the API Gives / Does:** Chronological list of active holidays.

---

### API 20 — Update Holiday

1. **API Number and Name:** API 20 — Update Holiday
2. **HTTP Method:** `PUT`
3. **Endpoint:** `/api/v1/attendance/hr/holidays/:id`
4. **Purpose:** Modifies holiday details, date, or target scopes (departments, locations, inclusions/exclusions).
5. **Business Problem Solved:** Enables adjustments to holiday schedules (e.g. date shifts for moon sightings).
6. **Why the API Exists:** Editing endpoint for holiday management.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Changing a regional holiday's date or expanding it to include remote contractors.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** Any valid subset of fields from `createHolidaySchema`.
10. **Field Meanings:** Updated holiday attributes.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema` and body via `updateHolidaySchema`.
    - Starts transaction, fetches holiday under lock.
    - Verifies ownership (`404 HOLIDAY_NOT_FOUND`).
    - Verifies holiday is active (`400 HOLIDAY_DELETED`).
    - Updates holiday record with `updated_by = req.user.id`.
    - Commits transaction and returns updated record.
12. **Database Impact:** Updates 1 row in `attendance_holidays`.
13. **Validation Rules:** All fields optional; validated against holiday schema.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated holiday entity.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 HOLIDAY_DELETED`: Attempting to edit a deactivated holiday.
    - `404 HOLIDAY_NOT_FOUND`: Holiday does not exist in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent `PUT`.
18. **Transactions / Concurrency Behavior:** Transactional update under row lock.
19. **Side Effects:** Alters holiday evaluation for dates matching this rule.
20. **Important Edge Cases:** Updating a holiday date for a past date does not automatically recompute past attendance records unless maintenance sweep is run.
21. **Related APIs / Dependencies:** `GET /holidays`, `DELETE /holidays/:id`.
22. **What the API Gives / Does:** Returns revised holiday object.

---

### API 21 — Deactivate / Delete Holiday

1. **API Number and Name:** API 21 — Deactivate / Delete Holiday
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/holidays/:id`
4. **Purpose:** Soft-deletes a holiday by setting its `is_active` flag to false.
5. **Business Problem Solved:** Cancels a declared holiday while preserving audit history.
6. **Why the API Exists:** Safe removal endpoint for holiday entries.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Revoking an announced special holiday.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Holiday primary key.
11. **Backend Processing Flow:**
    - Validates `id` parameter.
    - Starts transaction, fetches holiday under lock.
    - Asserts holiday exists and matches `org_id` (`404 HOLIDAY_NOT_FOUND`).
    - Updates `is_active = false` and `updated_by = req.user.id`.
    - Commits transaction.
12. **Database Impact:** Sets `is_active = false` on 1 row in `attendance_holidays`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Holiday deleted successfully", "data": { ... } }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 HOLIDAY_NOT_FOUND`: Holiday not found in tenant.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Transactional update.
19. **Side Effects:** Employees will be expected to work on this date unless it is a weekly off.
20. **Important Edge Cases:** Soft delete ensures past payroll reports and logs maintain relational integrity.
21. **Related APIs / Dependencies:** `POST /holidays`, `GET /holidays`.
22. **What the API Gives / Does:** Flags holiday as deleted/inactive.

---

## 6. Exceptions — Weekly Off Rules

### API 22 — Create Weekly Off Rule

1. **API Number and Name:** API 22 — Create Weekly Off Rule
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/weekly-offs`
4. **Purpose:** Defines recurring weekly rest days (e.g. Saturday and Sunday, or Friday only) scoped by department, location, shift, or employment type.
5. **Business Problem Solved:** Prevents workers from being marked absent on their contracted rest days and enables comp-off eligibility for weekend work.
6. **Why the API Exists:** Core weekly rest rule definition endpoint.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Setting up standard weekend off rules (Sat/Sun) for corporate staff and Monday off rules for retail staff.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "Standard Corporate Weekend",
       "days_of_week": [0, 6],
       "priority": 10,
       "target_departments": [],
       "target_locations": [],
       "target_employment_types": ["full_time"],
       "target_job_statuses": ["confirmed"],
       "target_shifts": [],
       "target_users": [],
       "effective_from": "2026-01-01",
       "effective_to": null
     }
     ```
10. **Field Meanings:**
    - `name` (string, required): Title of the weekly off rule.
    - `days_of_week` (integer[], required): Days of the week where 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
    - `priority` (integer, optional, default 0): Conflict resolution priority when multiple rules match an employee.
    - `target_departments`, `target_locations`, `target_employment_types`, `target_job_statuses`, `target_shifts`, `target_users`: Targeting scope arrays.
    - `effective_from` (ISO date, required): Rule start date.
    - `effective_to` (ISO date, optional): Rule end date.
11. **Backend Processing Flow:**
    - Validates payload via `createWeeklyOffRuleSchema`.
    - Opens database transaction.
    - Inserts record into `attendance_weekly_off_rules` with `org_id` and `created_by = req.user.id`.
    - Commits transaction and returns created rule.
12. **Database Impact:** Inserts 1 row into `attendance_weekly_off_rules`.
13. **Validation Rules:** `days_of_week` elements must be integers between 0 and 6. `effective_from` is required.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns created rule object with UUID.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Days outside 0–6 or missing required date fields.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`.
18. **Transactions / Concurrency Behavior:** Transactional insert.
19. **Side Effects:** Automatically marks matching days as weekly off during daily calculation.
20. **Important Edge Cases:** When multiple rules match an employee, the calculation engine selects the rule with the highest `priority`.
21. **Related APIs / Dependencies:** `GET /weekly-offs`, `PUT /weekly-offs/:id`, `DELETE /weekly-offs/:id`.
22. **What the API Gives / Does:** Creates active weekly off rule.

---

### API 23 — List Weekly Off Rules

1. **API Number and Name:** API 23 — List Weekly Off Rules
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/weekly-offs`
4. **Purpose:** Retrieves all active weekly off rules configured for the organization.
5. **Business Problem Solved:** Enables visibility into rest day configurations across departments and shifts.
6. **Why the API Exists:** Provides data for the Weekly Offs admin management table.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Auditing rest day policies across regional facilities.
9. **Request Parameters and Payload:**
   - **Query Parameters:** Optional filters (`target_department`, `target_shift`).
10. **Field Meanings:** Scope filter parameters.
11. **Backend Processing Flow:**
    - Queries `attendance_weekly_off_rules` matching `org_id` and `is_active: true`.
    - Returns array of rules.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Array of weekly off rule objects.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-isolated.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if no rules are configured.
21. **Related APIs / Dependencies:** `POST /weekly-offs`, `GET /weekly-offs/:id`.
22. **What the API Gives / Does:** Complete list of active weekly off rules.

---

### API 24 — Update Weekly Off Rule

1. **API Number and Name:** API 24 — Update Weekly Off Rule
2. **HTTP Method:** `PUT`
3. **Endpoint:** `/api/v1/attendance/hr/weekly-offs/:id`
4. **Purpose:** Modifies days of week, target criteria, priority, or effective validity dates for a weekly off rule.
5. **Business Problem Solved:** Allows altering rest day schedules (e.g. changing from a 6-day to a 5-day workweek).
6. **Why the API Exists:** Editing endpoint for weekly off rules.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Transitioning an operations department to alternate Saturday offs.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** Any valid subset of fields from `createWeeklyOffRuleSchema`.
10. **Field Meanings:** Updated rule configuration fields.
11. **Backend Processing Flow:**
    - Validates `id` and body schemas.
    - Starts transaction, fetches rule under lock.
    - Asserts rule exists and belongs to `org_id` (`404 WEEKLY_OFF_NOT_FOUND`).
    - Verifies rule is active (`400 WEEKLY_OFF_DELETED`).
    - Updates rule with `updated_by = req.user.id`.
    - Commits transaction and returns updated rule.
12. **Database Impact:** Updates 1 row in `attendance_weekly_off_rules`.
13. **Validation Rules:** All fields optional; validated against weekly off schema.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated rule object.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 WEEKLY_OFF_DELETED`: Attempting to edit a deleted rule.
    - `404 WEEKLY_OFF_NOT_FOUND`: Rule not found in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent `PUT`.
18. **Transactions / Concurrency Behavior:** Transactional update under row lock.
19. **Side Effects:** Subsequent punch evaluations apply the updated rest day rules.
20. **Important Edge Cases:** Past finalized attendance is preserved; only future punch processing applies the update.
21. **Related APIs / Dependencies:** `GET /weekly-offs`, `DELETE /weekly-offs/:id`.
22. **What the API Gives / Does:** Returns updated weekly off rule.

---

### API 25 — Deactivate / Delete Weekly Off Rule

1. **API Number and Name:** API 25 — Deactivate / Delete Weekly Off Rule
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/weekly-offs/:id`
4. **Purpose:** Soft-deactivates a weekly off rule.
5. **Business Problem Solved:** Retires obsolete rest day rules without losing historical auditing context.
6. **Why the API Exists:** Deactivation endpoint for weekly off rules.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Discontinuing a temporary weekend rule.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Rule primary key.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Starts transaction, fetches rule under lock.
    - Asserts rule exists and belongs to `org_id` (`404 WEEKLY_OFF_NOT_FOUND`).
    - Updates `is_active = false` and `updated_by = req.user.id`.
    - Commits transaction and returns updated record.
12. **Database Impact:** Sets `is_active = false` on 1 row in `attendance_weekly_off_rules`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Weekly off rule deleted successfully", "data": { ... } }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 WEEKLY_OFF_NOT_FOUND`: Rule not found in tenant.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Transactional update.
19. **Side Effects:** Employees previously covered by this rule will revert to lower priority rules or have no weekly off.
20. **Important Edge Cases:** Soft-delete preserves relational references in past attendance snapshots.
21. **Related APIs / Dependencies:** `POST /weekly-offs`, `GET /weekly-offs`.
22. **What the API Gives / Does:** Flags weekly off rule as inactive.

---

## 7. Hardware Integrations — Biometric Devices

### API 26 — Register Biometric Hardware Device

1. **API Number and Name:** API 26 — Register Biometric Hardware Device
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/devices`
4. **Purpose:** Registers physical biometric hardware (fingerprint scanner, facial recognition terminal, RFID card reader, kiosk) and generates a one-time plain API key for webhook communication.
5. **Business Problem Solved:** Securely integrates on-premises biometric hardware with cloud HRMS attendance processing.
6. **Why the API Exists:** Provisioning endpoint that issues device credentials.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Installing a new ZKTeco facial recognition terminal at the headquarters entrance.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "Main Entrance Face Terminal",
       "type": "biometric_face",
       "serial_number": "ZK-FAC-889102",
       "location_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
       "is_active": true
     }
     ```
10. **Field Meanings:**
    - `name` (string, required): Friendly device name (max 255 chars).
    - `type` (string, required): One of `'biometric_fingerprint'`, `'biometric_face'`, `'card_reader'`, `'kiosk'`.
    - `serial_number` (string, optional): Manufacturer hardware serial number.
    - `location_id` (UUID, optional): Associated office location ID.
    - `is_active` (boolean, optional, default true): Operational status.
11. **Backend Processing Flow:**
    - Validates body via `createDeviceSchema`.
    - Generates a cryptographically secure 32-byte random hex string (`apiKeyPlain`).
    - Calculates SHA-256 hash (`apiKeyHash = crypto.createHash('sha256').update(apiKeyPlain).digest('hex')`).
    - Persists device in `attendance_devices` storing `api_key_hash` (the plain key is NEVER stored in the database).
    - Returns device record including `api_key_plain` and the dedicated webhook URL `/api/v1/attendance/devices/webhook`.
12. **Database Impact:** Inserts 1 row into `attendance_devices`.
13. **Validation Rules:** `type` must be one of the four supported hardware types. `name` is required.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Device registered successfully. Keep API key secure.",
        "data": {
          "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          "name": "Main Entrance Face Terminal",
          "type": "biometric_face",
          "serial_number": "ZK-FAC-889102",
          "location_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "api_key_plain": "7f8b9a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
          "webhook_url": "/api/v1/attendance/devices/webhook"
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Unsupported device type or missing name.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Plain API key is returned **EXACTLY ONCE** in this response and cannot be recovered if lost. The database only retains the SHA-256 digest.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`.
18. **Transactions / Concurrency Behavior:** Single atomic insert.
19. **Side Effects:** Hardware terminal can now authenticate to the biometric webhook.
20. **Important Edge Cases:** If the plain key is lost, the administrator must delete and re-register the device.
21. **Related APIs / Dependencies:** `GET /devices`, `POST /devices/:id/mappings`, `POST /devices/webhook`.
22. **What the API Gives / Does:** Provisions device and returns credentials.

---

### API 27 — List Registered Devices

1. **API Number and Name:** API 27 — List Registered Devices
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/devices`
4. **Purpose:** Retrieves all biometric and hardware devices registered within the organization.
5. **Business Problem Solved:** Provides inventory and operational status of all deployed physical terminals.
6. **Why the API Exists:** Feeds hardware device management table in HR settings.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Checking which biometric terminals are currently active across branch offices.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Extracts `orgId` from JWT.
    - Queries `attendance_devices` where `org_id = orgId`.
    - Returns array of devices (excluding plain API keys).
12. **Database Impact:** Read-only `SELECT` on `attendance_devices`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Array of device records with hardware type, serial number, and status.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped. Plain API key is never returned.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if no devices are registered.
21. **Related APIs / Dependencies:** `POST /devices`, `GET /devices/:id/mappings`.
22. **What the API Gives / Does:** Inventory of registered devices.

---

### API 28 — Update Device Settings

1. **API Number and Name:** API 28 — Update Device Settings
2. **HTTP Method:** `PUT`
3. **Endpoint:** `/api/v1/attendance/hr/devices/:id`
4. **Purpose:** Modifies device name, serial number, assigned location, or activity state.
5. **Business Problem Solved:** Updates terminal metadata when physical devices are relocated or renamed.
6. **Why the API Exists:** Editing endpoint for device management.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Updating device name after moving terminal from Floor 1 to Floor 3.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** Any valid subset of fields from `createDeviceSchema`.
10. **Field Meanings:** Updated device properties.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema` and body via `updateDeviceSchema`.
    - Checks device exists and matches `org_id` (`404 DEVICE_NOT_FOUND`).
    - Updates record in `attendance_devices`.
    - Returns updated device.
12. **Database Impact:** Updates 1 row in `attendance_devices`.
13. **Validation Rules:** Valid UUID; supported device type if included.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated device object.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 DEVICE_NOT_FOUND`: Device does not exist in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent `PUT`.
18. **Transactions / Concurrency Behavior:** Standard update.
19. **Side Effects:** None.
20. **Important Edge Cases:** Cannot update `api_key_hash` through this endpoint.
21. **Related APIs / Dependencies:** `GET /devices`, `DELETE /devices/:id`.
22. **What the API Gives / Does:** Returns updated device record.

---

### API 29 — Deactivate / Delete Biometric Device

1. **API Number and Name:** API 29 — Deactivate / Delete Biometric Device
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/devices/:id`
4. **Purpose:** Deactivates a biometric device, preventing any future punch webhook requests from being processed.
5. **Business Problem Solved:** Immediately blocks compromised, broken, or retired hardware terminals from submitting attendance punches.
6. **Why the API Exists:** Security and decommissioning endpoint for hardware.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Deactivating a malfunctioning biometric machine being sent for hardware repairs.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Device primary key.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Verifies device exists and belongs to `org_id` (`404 DEVICE_NOT_FOUND`).
    - Sets `is_active = false` in `attendance_devices`.
    - Returns success response.
12. **Database Impact:** Updates 1 row in `attendance_devices` setting `is_active = false`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Device deactivated successfully" }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 DEVICE_NOT_FOUND`: Device not found in organization.
16. **Security / Authorization Behavior:** Webhook requests from deactivated devices will fail authentication (`401 DEVICE_INACTIVE`).
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Standard update.
19. **Side Effects:** Terminal punches will immediately be rejected by the webhook.
20. **Important Edge Cases:** Historical attendance logs previously submitted by this device remain intact.
21. **Related APIs / Dependencies:** `POST /devices`, `GET /devices`.
22. **What the API Gives / Does:** Revokes device activity.

---

## 8. Hardware Integrations — Device Employee Mappings

### API 30 — Map Employee to Device

1. **API Number and Name:** API 30 — Map Employee to Device
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/devices/:id/mappings`
4. **Purpose:** Maps an employee's HRMS UUID to their internal hardware ID on a specific physical device (e.g. employee card number or biometric fingerprint slot).
5. **Business Problem Solved:** Bridges the gap between proprietary biometric hardware numeric IDs (e.g. `1042`) and the HRMS database's UUID-based user entities.
6. **Why the API Exists:** Essential mapping required for the biometric webhook to resolve punch events to actual employees.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Enrolling an employee's fingerprint as user ID `1042` on the physical machine, and linking it to their HRMS profile.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, device ID, required).
   - **Body:**
     ```json
     {
       "user_id": "5a61d281-9b6f-40e8-8d07-6f8d38e23bb4",
       "device_employee_id": "1042"
     }
     ```
10. **Field Meanings:**
    - `user_id` (UUID, required): The HRMS employee ID.
    - `device_employee_id` (string, required): The ID/badge number assigned to this employee inside the physical device hardware.
11. **Backend Processing Flow:**
    - Validates device ID via `idParamSchema` and body via `mapEmployeeDeviceSchema`.
    - Verifies device exists and belongs to `org_id` (`404 DEVICE_NOT_FOUND`).
    - Checks for existing active mapping for this device and `device_employee_id`. Throws `409 MAPPING_ALREADY_EXISTS` if already mapped.
    - Inserts record into `attendance_device_employee_mappings` with `enrolled_at = NOW()` and `created_by = req.user.id`.
    - Returns created mapping record.
12. **Database Impact:** Inserts 1 row into `attendance_device_employee_mappings`.
13. **Validation Rules:** `user_id` must be valid UUID. `device_employee_id` is required (max 255 chars).
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns mapping record with `id`, `device_id`, `user_id`, `device_employee_id`, and `enrolled_at`.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 DEVICE_NOT_FOUND`: Device does not exist in organization.
    - `409 MAPPING_ALREADY_EXISTS`: Hardware employee ID is already mapped on this device.
16. **Security / Authorization Behavior:** Scoped to caller tenant.
17. **Idempotency and Retry Behavior:** Non-idempotent; second call triggers 409 conflict.
18. **Transactions / Concurrency Behavior:** Standard insert.
19. **Side Effects:** Device webhook punches containing this `device_employee_id` will now resolve to this employee.
20. **Important Edge Cases:** One employee can be mapped to multiple devices across different offices, but a single device cannot map the same hardware ID to multiple employees.
21. **Related APIs / Dependencies:** `GET /devices/:id/mappings`, `DELETE /devices/:id/mappings/:mappingId`.
22. **What the API Gives / Does:** Creates biometric user link.

---

### API 31 — List Mappings for Device

1. **API Number and Name:** API 31 — List Mappings for Device
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/devices/:id/mappings`
4. **Purpose:** Retrieves all active employee mappings registered for a specific biometric device.
5. **Business Problem Solved:** Allows verification of which employees are enrolled on a specific hardware terminal.
6. **Why the API Exists:** Provides data for the enrolled users list in device management.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Auditing enrolled biometric templates before a physical device synchronization.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, device ID, required).
10. **Field Meanings:** Device primary key.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Verifies device exists and belongs to `org_id` (`404 DEVICE_NOT_FOUND`).
    - Queries `attendance_device_employee_mappings` where `device_id = id` and `is_active: true`.
    - Returns array of mappings.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Array of active mapping objects.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 DEVICE_NOT_FOUND`: Device not found in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if no employees are mapped to this device.
21. **Related APIs / Dependencies:** `POST /devices/:id/mappings`, `DELETE /devices/:id/mappings/:mappingId`.
22. **What the API Gives / Does:** Array of enrolled employee mappings for the terminal.

---

### API 32 — Remove Employee Device Mapping

1. **API Number and Name:** API 32 — Remove Employee Device Mapping
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/devices/:id/mappings/:mappingId`
4. **Purpose:** Soft-deletes a device mapping, unlinking an employee from a physical terminal.
5. **Business Problem Solved:** Revokes biometric access and punch resolution when an employee leaves or transfers out of a facility.
6. **Why the API Exists:** De-enrollment endpoint for biometric integrations.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Unlinking a transferred employee's badge from their former branch terminal.
9. **Request Parameters and Payload:**
   - **Path Parameters:**
     - `id` (UUID, device ID, required).
     - `mappingId` (UUID, mapping ID, required).
10. **Field Meanings:** Device primary key and mapping primary key.
11. **Backend Processing Flow:**
    - Validates parameters via `deviceMappingParamSchema`.
    - Verifies device exists and belongs to `org_id` (`404 DEVICE_NOT_FOUND`).
    - Finds mapping by `mappingId`. Asserts mapping exists and belongs to this `device_id` (`404 MAPPING_NOT_FOUND`).
    - Sets `is_active = false` on mapping record.
    - Returns success response.
12. **Database Impact:** Updates 1 row in `attendance_device_employee_mappings` setting `is_active = false`.
13. **Validation Rules:** Both parameters must be valid UUIDs.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Device mapping removed successfully" }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 DEVICE_NOT_FOUND`: Device does not exist in tenant.
    - `404 MAPPING_NOT_FOUND`: Mapping record does not exist on this device.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Standard update.
19. **Side Effects:** Subsequent punches from this hardware employee ID will be rejected by the webhook with `404 MAPPING_NOT_FOUND`.
20. **Important Edge Cases:** Past punches already materialized as attendance records are unaffected.
21. **Related APIs / Dependencies:** `POST /devices/:id/mappings`, `GET /devices/:id/mappings`.
22. **What the API Gives / Does:** Unlinks employee from biometric device.

---

## 9. Comp-Off Policies

### API 33 — Create Comp-Off Policy

1. **API Number and Name:** API 33 — Create Comp-Off Policy
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/comp-off-policies`
4. **Purpose:** Creates compensatory off (comp-off) rules defining how hours worked on holidays or weekly offs are converted into redeemable leave days.
5. **Business Problem Solved:** Automates comp-off accrual, validity windows, multipliers, and minimum hour thresholds.
6. **Why the API Exists:** Core policy configuration endpoint for compensatory leave rules.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Setting up a comp-off rule where working at least 4 hours on Sunday earns a 0.5 comp-off day, and 8 hours earns 1.0 day valid for 90 days.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "name": "Standard Weekend Comp-Off Policy",
       "target_departments": [],
       "target_locations": [],
       "target_employment_types": ["full_time"],
       "target_job_statuses": ["confirmed"],
       "min_hours_for_half_day": 4.00,
       "min_hours_for_full_day": 8.00,
       "multiplier": 1.00,
       "validity_days": 90,
       "requires_approval": true,
       "max_accumulation": 5,
       "priority": 10
     }
     ```
10. **Field Meanings:**
    - `name` (string, required): Policy name (max 150 chars).
    - `min_hours_for_half_day` (number, optional): Minimum hours required to earn a half-day comp-off.
    - `min_hours_for_full_day` (number, optional): Minimum hours required to earn a full-day comp-off.
    - `multiplier` (number, optional, default 1.00): Accrual multiplier.
    - `validity_days` (integer, optional, 1–365): Days before earned comp-off credits expire.
    - `requires_approval` (boolean, optional, default true): Whether earned comp-offs require manager/HR approval before being credited to leave balances.
    - `max_accumulation` (integer, optional): Maximum unredeemed comp-offs an employee can hold simultaneously.
    - `priority` (integer, optional, default 0): Priority used when multiple policies match.
11. **Backend Processing Flow:**
    - Validates payload via `createCompOffPolicySchema`.
    - Opens database transaction.
    - Inserts policy into `attendance_comp_off_policies` with `org_id` and `created_by = req.user.id`.
    - Commits transaction and returns created policy.
12. **Database Impact:** Inserts 1 row into `attendance_comp_off_policies`.
13. **Validation Rules:** `name` is required. Hours and multipliers must be positive numbers.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns created comp-off policy object with UUID.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Validation error in thresholds.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Non-idempotent `POST`.
18. **Transactions / Concurrency Behavior:** Transactional insert.
19. **Side Effects:** Enables automated comp-off generation during holiday/weekend punch calculation.
20. **Important Edge Cases:** If `requires_approval` is false, comp-offs are automatically marked as approved upon generation (subject to leave module integration).
21. **Related APIs / Dependencies:** `GET /comp-off-policies`, `PUT /comp-off-policies/:id`, `DELETE /comp-off-policies/:id`.
22. **What the API Gives / Does:** Creates active comp-off accrual policy.

---

### API 34 — List Comp-Off Policies

1. **API Number and Name:** API 34 — List Comp-Off Policies
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/comp-off-policies`
4. **Purpose:** Retrieves all active comp-off policies for the organization.
5. **Business Problem Solved:** Provides visibility into all configured compensatory off rules.
6. **Why the API Exists:** Powers the comp-off policy management table.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Reviewing validity windows and accumulation limits across departments.
9. **Request Parameters and Payload:**
   - **Query Parameters:** Optional filters (`is_active`).
10. **Field Meanings:** Filter parameters.
11. **Backend Processing Flow:**
    - Queries `attendance_comp_off_policies` matching `org_id` and `is_active: true`.
    - Orders results by `priority DESC`.
    - Returns array of policies.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Array of comp-off policies sorted by priority.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if none configured.
21. **Related APIs / Dependencies:** `POST /comp-off-policies`, `GET /comp-offs`.
22. **What the API Gives / Does:** Priority-sorted list of active comp-off policies.

---

### API 35 — Update Comp-Off Policy

1. **API Number and Name:** API 35 — Update Comp-Off Policy
2. **HTTP Method:** `PUT`
3. **Endpoint:** `/api/v1/attendance/hr/comp-off-policies/:id`
4. **Purpose:** Modifies validity days, thresholds, accumulation caps, or approval requirements of a comp-off policy.
5. **Business Problem Solved:** Enables tuning compensatory off rules as company leave policies evolve.
6. **Why the API Exists:** Editing endpoint for comp-off policies.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Extending comp-off validity from 60 days to 90 days.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:** Any valid subset of fields from `createCompOffPolicySchema`.
10. **Field Meanings:** Updated policy fields.
11. **Backend Processing Flow:**
    - Validates `id` and body schemas.
    - Starts transaction, fetches policy under lock.
    - Asserts policy exists and belongs to `org_id` (`404 POLICY_NOT_FOUND`).
    - Verifies policy is active (`400 POLICY_DELETED`).
    - Updates policy with `updated_by = req.user.id`.
    - Commits transaction and returns updated policy.
12. **Database Impact:** Updates 1 row in `attendance_comp_off_policies`.
13. **Validation Rules:** Valid UUID; values within permitted ranges.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns updated comp-off policy object.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 POLICY_DELETED`: Cannot edit a deactivated policy.
    - `404 POLICY_NOT_FOUND`: Policy not found in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent `PUT`.
18. **Transactions / Concurrency Behavior:** Transactional update under row lock.
19. **Side Effects:** Future earned comp-offs apply updated rules.
20. **Important Edge Cases:** Does not retroactively alter the expiry date of already-approved comp-offs.
21. **Related APIs / Dependencies:** `GET /comp-off-policies`, `DELETE /comp-off-policies/:id`.
22. **What the API Gives / Does:** Returns updated policy entity.

---

### API 36 — Deactivate / Delete Comp-Off Policy

1. **API Number and Name:** API 36 — Deactivate / Delete Comp-Off Policy
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/comp-off-policies/:id`
4. **Purpose:** Soft-deactivates a comp-off policy.
5. **Business Problem Solved:** Deprecates a comp-off policy without breaking existing comp-off records linked to it.
6. **Why the API Exists:** Deactivation endpoint for comp-off policies.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Retiring an obsolete branch-specific comp-off policy.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Policy primary key.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Starts transaction, fetches policy under lock.
    - Asserts policy exists and belongs to `org_id` (`404 POLICY_NOT_FOUND`).
    - Sets `is_active = false` and `updated_by = req.user.id`.
    - Commits transaction.
12. **Database Impact:** Updates 1 row in `attendance_comp_off_policies` setting `is_active = false`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Comp off policy deleted successfully" }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 POLICY_NOT_FOUND`: Policy not found in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent operation.
18. **Transactions / Concurrency Behavior:** Transactional update.
19. **Side Effects:** Future holiday/weekend work will no longer match this policy.
20. **Important Edge Cases:** Comp-offs already earned under this policy remain valid until redeemed or expired.
21. **Related APIs / Dependencies:** `POST /comp-off-policies`, `GET /comp-off-policies`.
22. **What the API Gives / Does:** Flags comp-off policy as inactive.

---

## 10. Organization Comp-Off Requests & HR Overrides

### API 37 — List Organization Comp-Off Requests

1. **API Number and Name:** API 37 — List Organization Comp-Off Requests
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/comp-offs`
4. **Purpose:** Retrieves all earned, approved, redeemed, and expired compensatory off records across the entire organization.
5. **Business Problem Solved:** Gives HR centralized oversight of extra days earned and allows auditing approval workflows company-wide.
6. **Why the API Exists:** Primary administrative ledger for compensatory off management.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Reviewing all pending comp-off requests waiting for manager or HR review before month-end payroll.
9. **Request Parameters and Payload:**
   - **Query Parameters:** Optional filters (`status`, `user_id`).
10. **Field Meanings:** `status` can filter by `'earned'`, `'approved'`, `'used'`, `'expired'`, `'cancelled'`.
11. **Backend Processing Flow:**
    - Resolves caller access permissions: HR role has organization-wide access (`allowedUserIds = null`).
    - Queries `attendance_comp_offs` for `org_id` matching query filters.
    - Eager-loads employee profiles and shift context.
    - Returns array of comp-off records.
12. **Database Impact:** Read-only `SELECT` with joins.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Comp offs fetched successfully",
        "data": [
          {
            "id": "2b3c4d5e-...",
            "user_id": "5a61d281-...",
            "earned_date": "2026-09-06",
            "hours_worked": "8.50",
            "status": "earned",
            "expiry_date": null,
            "used_on_date": null
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Unrestricted within the tenant for HR roles.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if no comp-offs match filters.
21. **Related APIs / Dependencies:** `POST /comp-offs/:id/approve`, `POST /comp-offs/:id/reject`.
22. **What the API Gives / Does:** Organization-wide compensatory off records.

---

### API 38 — HR Override Approve Comp-Off

1. **API Number and Name:** API 38 — HR Override Approve Comp-Off
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/comp-offs/:id/approve`
4. **Purpose:** Administratively approves an earned comp-off request, setting an expiry date and atomically crediting +1 day to the employee's compensatory leave balance wallet.
5. **Business Problem Solved:** Enables HR to override or grant approvals when a reporting manager is absent, while maintaining strict transactional synchronization between the attendance ledger and the leave ledger.
6. **Why the API Exists:** Core approval bridge connecting attendance extra hours to usable leave balances.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR approves a weekend deployment comp-off for a DevOps engineer whose direct manager is on annual leave.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:**
     ```json
     {
       "remarks": "Approved as per production deployment on Sunday"
     }
     ```
10. **Field Meanings:** `remarks` (string, optional, max 1000 chars): Administrative approval notes.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema` and body via `reviewCompOffSchema`.
    - Checks comp-off exists and belongs to `org_id` (`404 COMP_OFF_NOT_FOUND`).
    - Verifies earned date is not inside an active payroll lock period (`lockService.checkLock(orgId, earned_date)`). Throws `403 PERIOD_LOCKED` if locked.
    - Starts database transaction.
    - Re-reads comp-off with row lock (`LOCK.UPDATE`) to guard against concurrent double-approval.
    - Asserts status is `'earned'` (`400 COMP_OFF_NOT_EARNED`).
    - Resolves organization's Comp-Off leave type by stable code (`'CO'`). Throws `409 CO_TYPE_MISSING` or `409 CO_TYPE_INACTIVE` if missing/disabled.
    - Atomically credits +1 day to employee's `LeaveBalances` record for the earned year (`total_accrued + 1`, `current_balance + 1`).
    - Calculates expiry date (earned date + 90 days).
    - Updates comp-off record: `status = 'approved'`, `expiry_date = expiryDate`, `approved_by = req.user.id`, `approved_at = NOW()`.
    - Commits transaction and returns updated comp-off record.
12. **Database Impact:** Updates 1 row in `attendance_comp_offs` and updates/inserts 1 row in `leave_balances`.
13. **Validation Rules:** Remarks max 1000 chars.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns approved comp-off entity with populated `expiry_date` and `approved_at`.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 COMP_OFF_NOT_EARNED`: Comp-off is not in `earned` status.
    - `403 PERIOD_LOCKED`: Earned date falls in a locked payroll period.
    - `404 COMP_OFF_NOT_FOUND`: Record not found.
    - `409 CO_TYPE_MISSING` / `CO_TYPE_INACTIVE`: Organization has no configured active 'CO' leave type.
16. **Security / Authorization Behavior:** Atomic bridge ensures leave wallet credit and status change succeed or fail together.
17. **Idempotency and Retry Behavior:** Row-level lock and status check prevent duplicate credits on retries.
18. **Transactions / Concurrency Behavior:** Enclosed in a strict database transaction with row locks on `attendance_comp_offs` and `leave_balances`.
19. **Side Effects:** Increments employee's `CO` leave balance by +1 in the leave module.
20. **Important Edge Cases:** If the organization has not configured a 'CO' leave type in the Leave module, the endpoint throws a clean 409 error with zero partial data commits.
21. **Related APIs / Dependencies:** `POST /comp-offs/:id/reject`, `GET /comp-offs`.
22. **What the API Gives / Does:** Approves comp-off and credits leave wallet.

---

### API 39 — HR Override Reject Comp-Off

1. **API Number and Name:** API 39 — HR Override Reject Comp-Off
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/comp-offs/:id/reject`
4. **Purpose:** Administratively rejects an earned comp-off request, marking it as cancelled.
5. **Business Problem Solved:** Allows HR to reject illegitimate, accidental, or non-compliant comp-off claims.
6. **Why the API Exists:** Rejection endpoint for comp-off governance.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR rejects an unapproved weekend punch that did not have prior client authorization.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
   - **Body:**
     ```json
     {
       "remarks": "Weekend work was not pre-authorized by project manager"
     }
     ```
10. **Field Meanings:** `remarks` (string, optional, max 1000 chars): Rejection reason.
11. **Backend Processing Flow:**
    - Validates `id` and body schemas.
    - Fetches comp-off and checks ownership (`404 COMP_OFF_NOT_FOUND`).
    - Verifies earned date is not inside an active payroll lock period (`403 PERIOD_LOCKED`).
    - Opens transaction, acquires row lock.
    - Asserts status is `'earned'` (`400 COMP_OFF_NOT_EARNED`).
    - Updates comp-off: `status = 'cancelled'`, `rejection_remarks = remarks`.
    - Commits transaction.
12. **Database Impact:** Updates 1 row in `attendance_comp_offs`.
13. **Validation Rules:** Remarks max 1000 chars.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Comp off rejected" }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 COMP_OFF_NOT_EARNED`: Cannot reject comp-off that is not in `earned` status.
    - `403 PERIOD_LOCKED`: Cannot modify records in a locked payroll period.
    - `404 COMP_OFF_NOT_FOUND`: Record not found.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Second call returns 400 because status is no longer `earned`.
18. **Transactions / Concurrency Behavior:** Transactional update under row lock.
19. **Side Effects:** Record is marked cancelled; no leave balances are credited.
20. **Important Edge Cases:** Already-approved comp-offs cannot be rejected via this endpoint.
21. **Related APIs / Dependencies:** `POST /comp-offs/:id/approve`, `GET /comp-offs`.
22. **What the API Gives / Does:** Cancels the comp-off claim.

---

## 11. Payroll Lock Periods

### API 40 — List Payroll Lock Periods

1. **API Number and Name:** API 40 — List Payroll Lock Periods
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/locks`
4. **Purpose:** Retrieves all configured payroll lock periods for the organization.
5. **Business Problem Solved:** Provides visibility into date ranges that are currently frozen for payroll processing.
6. **Why the API Exists:** Informs HR which historical periods are protected against modifications.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Checking if August 2026 is currently locked before attempting to process retro punches.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Queries `attendance_lock_periods` where `org_id = orgId`.
    - Orders by `start_date DESC`.
    - Returns array of lock periods.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Locks fetched successfully",
        "data": [
          {
            "id": "7b8c9d0e-...",
            "org_id": "b782fd72-...",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "reason": "August 2026 Payroll Finalized",
            "locked_by": "1c92a10b-...",
            "created_at": "2026-09-01T10:00:00.000Z"
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if no periods are locked.
21. **Related APIs / Dependencies:** `POST /locks`, `DELETE /locks/:id`.
22. **What the API Gives / Does:** Complete list of frozen payroll periods.

---

### API 41 — Create Payroll Lock Period

1. **API Number and Name:** API 41 — Create Payroll Lock Period
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/locks`
4. **Purpose:** Freezes a date range, making all attendance punches, regularizations, overtime approvals, and comp-offs within that period completely immutable.
5. **Business Problem Solved:** Guarantees financial finality and compliance. Prevents post-payroll attendance edits that would cause salary discrepancies or ledger corruption.
6. **Why the API Exists:** Foundational audit control for attendance-payroll synchronization.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Executed immediately before running monthly payroll to freeze attendance from August 1 to August 31.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "start_date": "2026-08-01",
       "end_date": "2026-08-31",
       "reason": "August 2026 Payroll Finalized"
     }
     ```
10. **Field Meanings:**
    - `start_date` (ISO date, required): Beginning of frozen date range.
    - `end_date` (ISO date, required): End of frozen date range (must be `>= start_date`).
    - `reason` (string, optional, max 1000 chars): Descriptive reason.
11. **Backend Processing Flow:**
    - Validates body via `createLockSchema`.
    - Validates `start_date <= end_date` (`400 INVALID_DATE_RANGE`).
    - Checks for overlapping lock periods in `attendance_lock_periods` for `org_id` using `Op.or` across bounds.
    - If overlap detected, throws `409 OVERLAPPING_LOCK`.
    - Inserts lock record into `attendance_lock_periods` with `locked_by = req.user.id`.
    - Returns created lock entity.
12. **Database Impact:** Inserts 1 row into `attendance_lock_periods`.
13. **Validation Rules:** `start_date` must be on or before `end_date`.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:** Returns created lock record with UUID.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 INVALID_DATE_RANGE`: `start_date` is after `end_date`.
    - `409 OVERLAPPING_LOCK`: Requested period overlaps with an existing lock.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Non-idempotent; duplicate attempts will trigger 409 overlap.
18. **Transactions / Concurrency Behavior:** Atomic check and insert.
19. **Side Effects:** Immediately blocks all attendance mutation endpoints (clock-in, clock-out, break, regularization, overtime, comp-off) across all modules for dates within this window.
20. **Important Edge Cases:** An open-ended clock-in cannot be edited or regularized if its calendar date falls inside this window.
21. **Related APIs / Dependencies:** `DELETE /locks/:id`, `GET /locks`.
22. **What the API Gives / Does:** Creates immutable payroll freeze window.

---

### API 42 — Delete Payroll Lock Period

1. **API Number and Name:** API 42 — Delete Payroll Lock Period
2. **HTTP Method:** `DELETE`
3. **Endpoint:** `/api/v1/attendance/hr/locks/:id`
4. **Purpose:** Unlocks a previously frozen date range, allowing backdated attendance regularizations and corrections.
5. **Business Problem Solved:** Enables retroactive corrections when an audit discovers unrecorded leaves or punches for a finalized month.
6. **Why the API Exists:** Unlock mechanism for exceptional administrative corrections.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Temporarily unlocking August 2026 to allow an employee to submit a missed punch regularization before locking it again.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `id` (UUID, required).
10. **Field Meanings:** Lock period primary key.
11. **Backend Processing Flow:**
    - Validates `id` via `idParamSchema`.
    - Finds lock by ID and checks `org_id` (`404 LOCK_NOT_FOUND`).
    - Executes hard delete on `attendance_lock_periods`.
    - Returns success response.
12. **Database Impact:** Deletes 1 row from `attendance_lock_periods`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "success": true, "message": "Lock period deleted successfully" }`
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 LOCK_NOT_FOUND`: Lock period does not exist in organization.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent; second call returns 404.
18. **Transactions / Concurrency Behavior:** Standard delete.
19. **Side Effects:** Re-enables attendance modifications for dates previously frozen by this lock.
20. **Important Edge Cases:** HR should promptly re-lock the period after making required corrections to prevent unmonitored backdated changes.
21. **Related APIs / Dependencies:** `POST /locks`, `GET /locks`.
22. **What the API Gives / Does:** Removes lock constraint and restores editability.

---

## 12. Maintenance & Reconciliation

### API 43 — Recompute Stale Clocked-Out Records

1. **API Number and Name:** API 43 — Recompute Stale Clocked-Out Records
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/hr/records/recompute-stale`
4. **Purpose:** Maintenance sweep that identifies attendance records carrying a `clock_out_time` but stuck in `'in_progress'` status (due to worker interruptions, migration seedings, or legacy calculations), and forces recalculation through the core attendance calculation engine.
5. **Business Problem Solved:** Heals corrupted or stalled attendance records, ensuring effective hours, late minutes, overtime, and final status (`present`, `half_day`, `absent`) are properly computed.
6. **Why the API Exists:** Diagnostic and self-healing operational endpoint for HR administrators and background jobs.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Executed after data migration or when HR spots an employee who clocked out yesterday but whose status still reads "in progress".
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
   - **Body:**
     ```json
     {
       "date": "2026-09-12"
     }
     ```
10. **Field Meanings:** `date` (string `YYYY-MM-DD`, optional): Restricts sweep to a specific calendar date. If omitted, scans all historical stale records across the tenant.
11. **Backend Processing Flow:**
    - Validates optional `date` format via `recomputeStaleSchema`.
    - Queries `recordRepository.findStaleClockedOutRecords(orgId, date)`.
    - If none found, returns `{ scanned: 0, recomputed: 0, skipped: 0, failed: 0 }`.
    - Iterates through each stale record sequentially:
      - Starts an isolated database transaction per record.
      - Re-reads record under row lock (`LOCK.UPDATE`) and re-verifies `status === 'in_progress'` and `clock_out_time != null`. If condition no longer holds, rolls back and increments `skipped`.
      - Resolves point-in-time shift and policy snapshots (falls back to active templates if legacy snapshots are null).
      - Checks holiday and weekly off status for that record's date and user.
      - Calls `calculationService.calculateRecord(record.id, policy, shift, isHoliday, isWeeklyOff, transaction)`.
      - Commits transaction and increments `recomputed`.
      - On error, rolls back that record's transaction, logs error, and increments `failed`.
    - Returns summary statistics object.
12. **Database Impact:** Updates multiple rows in `attendance_records` (sets `status`, `effective_hours`, `late_minutes`, `overtime_minutes`).
13. **Validation Rules:** Optional `date` must match `YYYY-MM-DD`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Stale attendance records recomputed",
        "data": {
          "success": true,
          "scanned": 14,
          "recomputed": 14,
          "skipped": 0,
          "failed": 0
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Invalid date format.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped. Individual record failures do not abort the entire batch.
17. **Idempotency and Retry Behavior:** Highly idempotent; calling it a second time scans 0 stale records.
18. **Transactions / Concurrency Behavior:** Uses per-record database transactions with `LOCK.UPDATE` to ensure concurrency safety against live clock-outs.
19. **Side Effects:** Moves stalled records from `in_progress` to finalized statuses (`present`, `half_day`, etc.).
20. **Important Edge Cases:** Does NOT touch open shifts where `clock_out_time` is null (those represent currently working employees).
21. **Related APIs / Dependencies:** `GET /dashboard/live`, `GET /reports/daily`.
22. **What the API Gives / Does:** Batch recomputes and repairs stalled attendance records.

---

## 13. Export & Attendance Reporting

### API 44 — Daily Attendance Report

1. **API Number and Name:** API 44 — Daily Attendance Report
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/reports/daily`
4. **Purpose:** Generates a flattened, comprehensive attendance data array for a specific date suitable for CSV or Excel export.
5. **Business Problem Solved:** Provides raw, unaggregated daily attendance logs for payroll auditing, compliance filings, and third-party BI tools.
6. **Why the API Exists:** Core export endpoint for daily attendance records.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Exporting today's complete attendance roster to Excel for physical plant roll-call.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `date` (ISO date, required).
     - `department` (string, optional).
     - `status` (string, optional).
     - `search` (string, optional).
10. **Field Meanings:** Filter by calendar day, department name, status, or employee name/code.
11. **Backend Processing Flow:**
    - Validates query parameters via `dailyReportSchema`.
    - Queries `recordRepository.findTeamRecordsWithProfiles(orgId, date)`.
    - Eager-loads employee profiles, departments, designations, shifts, and timestamps.
    - Returns flattened record array.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** `date` is mandatory.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns array of detailed daily attendance records with populated user and profile metadata.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Missing `date` query parameter.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If an employee had multiple sessions on a split shift, cumulative effective hours and break minutes are summarized.
21. **Related APIs / Dependencies:** `GET /reports/monthly`, `GET /reports/employee/:userId`.
22. **What the API Gives / Does:** Flattened daily attendance dataset for reporting and export.

---

### API 45 — Monthly Consolidated Attendance Report

1. **API Number and Name:** API 45 — Monthly Consolidated Attendance Report
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/reports/monthly`
4. **Purpose:** Generates a consolidated monthly attendance aggregation grouped by employee, summing present days, absences, late arrivals, overtime, and effective hours.
5. **Business Problem Solved:** Eliminates manual spreadsheet calculations by providing pre-aggregated monthly attendance totals directly consumable by payroll engines.
6. **Why the API Exists:** Primary reporting feed used by HR and payroll specialists during monthly payroll runs.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Generating August 2026 payroll input report to calculate deductions and overtime pay.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `month` (string `YYYY-MM` or integer 1–12, required).
     - `year` (integer 2000–2100, optional if `YYYY-MM` format is used).
10. **Field Meanings:** Identifies target billing month.
11. **Backend Processing Flow:**
    - Validates parameters via `monthlyReportSchema`.
    - Normalizes `month` and `year` into a standard `YYYY-MM` format.
    - Computes first and last calendar dates of the target month.
    - Queries all attendance records for `org_id` within that date range.
    - Aggregates metrics per employee in memory:
      - `total_present`: Sum of present days (+0.5 for half_day).
      - `total_absent`: Count of absent days.
      - `total_late_days` and `total_late_minutes`.
      - `total_early_exits`.
      - `total_overtime_minutes`.
      - `total_effective_hours`.
    - Returns array of employee aggregation objects.
12. **Database Impact:** Read-only `SELECT` on `attendance_records`.
13. **Validation Rules:** `month` is required.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Monthly report generated",
        "data": [
          {
            "user_id": "5a61d281-9b6f-40e8-8d07-6f8d38e23bb4",
            "identifier": "alex@company.com",
            "name": "Alex Miller",
            "total_present": 21.5,
            "total_absent": 1,
            "total_late_days": 2,
            "total_late_minutes": 25,
            "total_early_exits": 0,
            "total_overtime_minutes": 120,
            "total_effective_hours": 172.50
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Missing or invalid month format.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Half-day statuses increment `total_present` by `0.5`.
21. **Related APIs / Dependencies:** `GET /reports/daily`, `GET /reports/employee/:userId`.
22. **What the API Gives / Does:** Employee-wise monthly attendance totals for payroll processing.

---

### API 46 — Employee Attendance Report

1. **API Number and Name:** API 46 — Employee Attendance Report
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/reports/employee/:userId`
4. **Purpose:** Generates a date-range attendance ledger for a single specific employee.
5. **Business Problem Solved:** Enables deep-dive investigation into an individual worker's attendance history during performance reviews, dispute resolution, or disciplinary audits.
6. **Why the API Exists:** Targeted reporting query for single-employee attendance audits.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Auditing an employee's exact punch records over the last 90 days following multiple late arrival warnings.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:**
     - `start_date` or `from` (ISO date, optional).
     - `end_date` or `to` (ISO date, optional).
10. **Field Meanings:** Date range bounds for the employee report.
11. **Backend Processing Flow:**
    - Validates `userId` via `userIdParamSchema` and dates via `employeeReportSchema`.
    - Queries `recordRepo.findAllInDateRange(orgId, userId, startDate, endDate)`.
    - Returns array of attendance records for the target employee.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** `userId` must be valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns array of attendance records with punch times and calculated metrics.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Invalid UUID parameter.
    - `401 UNAUTHORIZED`: Authentication failure.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty array if employee has no records in date range.
21. **Related APIs / Dependencies:** `GET /reports/daily`, `GET /reports/monthly`.
22. **What the API Gives / Does:** Complete historical punch records for a single employee.

---

## 14. HR Staff Attendance Queries (Accessible by HR & Managers)

### API 47 — List HR Staff Attendance

1. **API Number and Name:** API 47 — List HR Staff Attendance
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/hrs/attendance`
4. **Purpose:** Retrieves attendance records specifically for members of the HR department, with pagination, department filtering, and date range support.
5. **Business Problem Solved:** Allows operational managers and senior HR leaders to monitor HR team attendance without exposing non-HR employee data.
6. **Why the API Exists:** Dedicated query endpoint for HR team attendance, intentionally accessible by both `hr` and `manager` roles.
7. **Allowed Roles and Permissions:** `hr`, `manager`, `admin`, `super-admin`.
8. **Real-World Usage:** An HR Director or Operations Manager reviewing the punch status of HR Generalists and Recruiters.
9. **Request Parameters and Payload:**
   - **Query Parameters:**
     - `date`, `from`, `to` (ISO dates, optional).
     - `status`, `department`, `search` (strings, optional).
     - `page` (integer, default 1).
     - `limit` (integer, default 50, max 100).
10. **Field Meanings:** Standard pagination and filtering parameters.
11. **Backend Processing Flow:**
    - Checks authorization: allows `hr`, `manager`, `admin`, `super-admin`.
    - Calls `hrAttendanceReadService.getHrStaffAttendanceList(orgId, filters)`.
    - Queries users with role `'hr'` in `user_roles`.
    - Resolves records with pagination, formatted user profiles, and punch statuses.
    - Returns paginated data.
12. **Database Impact:** Read-only `SELECT` with pagination.
13. **Validation Rules:** `page >= 1`, `limit <= 100`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** `{ "pagination": { "total": 5, "page": 1, "limit": 50, "total_pages": 1 }, "records": [ ... ] }`
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Restricts returned records strictly to users holding the HR role.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If organization has no users in the HR role, returns empty records array.
21. **Related APIs / Dependencies:** `GET /hrs/:userId/attendance`, `GET /hrs/:userId/summary`.
22. **What the API Gives / Does:** Paginated attendance list for HR department personnel.

---

### API 48 — Get HR Member History

1. **API Number and Name:** API 48 — Get HR Member History
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/hrs/:userId/attendance`
4. **Purpose:** Retrieves paginated historical attendance records, session intervals, and breaks for a specific HR team member.
5. **Business Problem Solved:** Enables attendance tracking and dispute resolution for HR staff members.
6. **Why the API Exists:** History drill-down endpoint for HR personnel.
7. **Allowed Roles and Permissions:** `hr`, `manager`, `admin`, `super-admin`.
8. **Real-World Usage:** Auditing an HR recruiter's monthly attendance logs.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `from`, `to`, `month`, `year`, `page`, `limit`.
10. **Field Meanings:** Date bounds and pagination limits.
11. **Backend Processing Flow:**
    - Validates `userId` and query schemas.
    - Verifies target user is an active member in `org_id` and holds the `hr` role (`_verifyUserIsHr`). Throws `404 EMPLOYEE_NOT_FOUND` if mismatched.
    - Fetches paginated records with embedded `breaks`, `sessions`, and `shift` details.
    - Returns member profile header, pagination metadata, and records array.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** `userId` must be valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns `{ "member": { ... }, "pagination": { ... }, "records": [ ... ] }`.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `404 EMPLOYEE_NOT_FOUND`: Target user is not an HR member in this tenant.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Target user must have the `hr` role; attempting to query a regular employee via this endpoint returns 404.
21. **Related APIs / Dependencies:** `GET /hrs/attendance`, `GET /hrs/:userId/daily-log`.
22. **What the API Gives / Does:** Detailed historical attendance logs for an HR staff member.

---

### API 49 — Get HR Member Attendance Summary

1. **API Number and Name:** API 49 — Get HR Member Attendance Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/hrs/:userId/summary`
4. **Purpose:** Retrieves monthly aggregated summary metrics (present days, absent days, late count, overtime hours, average work hours) for a specific HR team member.
5. **Business Problem Solved:** Provides quick performance summary cards for HR staff without requiring client-side calculation.
6. **Why the API Exists:** Summary card endpoint for HR profiles.
7. **Allowed Roles and Permissions:** `hr`, `manager`, `admin`, `super-admin`.
8. **Real-World Usage:** Displaying monthly summary cards when viewing an HR team member's profile.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `month` (1–12), `year` (2000–2100).
10. **Field Meanings:** Billing month and year. Defaults to current month if omitted.
11. **Backend Processing Flow:**
    - Validates `userId` and query schemas.
    - Verifies user has `hr` role (`_verifyUserIsHr`).
    - Aggregates records for the month and computes attendance KPIs.
    - Returns summary object.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID; month 1–12; year 2000–2100.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns `{ "user_id": "...", "present_days": 21, "absent_days": 1, "late_days": 2, "overtime_hours": 3.5, "avg_work_hours": 8.2 }`.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Automatically resolves missing punches as absent or not_marked based on current date.
21. **Related APIs / Dependencies:** `GET /hrs/:userId/attendance`.
22. **What the API Gives / Does:** Monthly attendance summary KPIs for HR personnel.

---

### API 50 — Get HR Member Daily Punch Log

1. **API Number and Name:** API 50 — Get HR Member Daily Punch Log
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/hrs/:userId/daily-log`
4. **Purpose:** Retrieves minute-level punch logs, break timestamps, and sessions for an HR staff member on a specific date.
5. **Business Problem Solved:** Enables granular investigation into punch sequences (e.g. clock-in time, break durations, clock-out time).
6. **Why the API Exists:** Provides data for daily timeline visualizations.
7. **Allowed Roles and Permissions:** `hr`, `manager`, `admin`, `super-admin`.
8. **Real-World Usage:** Examining punch timestamps after an HR employee reports a missed clock-out.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `date` (ISO date, optional, defaults to today).
10. **Field Meanings:** Target calendar date.
11. **Backend Processing Flow:**
    - Validates `userId` and `date`.
    - Verifies user has `hr` role (`_verifyUserIsHr`).
    - Fetches daily record with associated `breaks` and `sessions`.
    - If no record exists, calculates virtual status (`holiday`, `weekly_off`, `absent`, or `not_marked`).
    - Returns timeline payload.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Detailed timeline record with clock-in, clock-out, break intervals, and active status.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If target date is a weekly off and employee did not clock in, returns virtual status `'weekly_off'`.
21. **Related APIs / Dependencies:** `GET /hrs/:userId/attendance`.
22. **What the API Gives / Does:** Minute-by-minute daily punch details for HR staff.

---

## 15. Organization-Wide Employee Attendance Queries

### API 51 — List Employee Attendance

1. **API Number and Name:** API 51 — List Employee Attendance
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/employees/attendance`
4. **Purpose:** Retrieves organization-wide employee attendance records with multi-criteria filtering (date ranges, status, department, search) and pagination.
5. **Business Problem Solved:** Provides HR administrators with a centralized workforce attendance ledger.
6. **Why the API Exists:** Primary attendance monitoring table endpoint in the HR portal.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`. (Managers cannot call this endpoint).
8. **Real-World Usage:** Loading the main Attendance Overview page in the HR console to inspect today's clock-in status across all company employees.
9. **Request Parameters and Payload:**
   - **Query Parameters:**
     - `date`, `from`, `to` (ISO dates, optional).
     - `status` (string, optional, e.g. `'present,late,absent,not_marked'`).
     - `department`, `search` (strings, optional).
     - `page` (integer, default 1).
     - `limit` (integer, default 50, max 100).
10. **Field Meanings:** Search covers employee name, email, or employee code. Status allows comma-separated multi-status filters.
11. **Backend Processing Flow:**
    - Restricts access strictly to HR/Admin roles (`authorize(['hr', 'admin', 'super-admin'])`).
    - Fetches all user IDs holding the `'employee'` role in `org_id`.
    - If filtering by `not_marked` on a single date, executes an outer join from `Users` to `AttendanceRecords` to identify employees who have not clocked in.
    - Otherwise, queries `AttendanceRecords` directly with pagination and filters.
    - Formats profiles and returns paginated records.
12. **Database Impact:** Read-only `SELECT` with pagination.
13. **Validation Rules:** `page >= 1`, `limit <= 100`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Paginated list of employee attendance records with employee codes, departments, designations, and punch metrics.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Strictly restricted to HR administrators.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Supports searching across both first/last name and employee code simultaneously.
21. **Related APIs / Dependencies:** `GET /employees/:userId/attendance`, `GET /dashboard/live`.
22. **What the API Gives / Does:** Organization-wide employee attendance ledger.

---

### API 52 — Get Employee History

1. **API Number and Name:** API 52 — Get Employee History
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/employees/:userId/attendance`
4. **Purpose:** Retrieves deep, paginated attendance history for any employee in the organization.
5. **Business Problem Solved:** Enables comprehensive attendance audits for any worker.
6. **Why the API Exists:** Employee history view endpoint for HR.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR specialist investigating an employee's attendance record across the previous 6 months.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `from`, `to`, `month`, `year`, `page`, `limit`.
10. **Field Meanings:** Date range or month/year filters and pagination limits.
11. **Backend Processing Flow:**
    - Validates `userId` and query schemas.
    - Verifies user exists and belongs to `org_id` (`404 EMPLOYEE_NOT_FOUND`).
    - Queries `attendance_records` paginated with child `breaks`, `sessions`, and `shift`.
    - Returns member profile header, pagination info, and records array.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Returns `{ "member": { ... }, "pagination": { ... }, "records": [ ... ] }`.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If month and year are passed without from/to, automatically resolves start and end of that month.
21. **Related APIs / Dependencies:** `GET /employees/attendance`, `GET /employees/:userId/summary`.
22. **What the API Gives / Does:** Complete historical punch records for any organization employee.

---

### API 53 — Get Employee Attendance Summary

1. **API Number and Name:** API 53 — Get Employee Attendance Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/employees/:userId/summary`
4. **Purpose:** Retrieves aggregated monthly summary metrics (present, absent, late, overtime, average hours) for any employee in the organization.
5. **Business Problem Solved:** Provides instant high-level performance metrics for individual employee reviews.
6. **Why the API Exists:** Feeds summary metric widgets on employee profile views.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR viewing an employee's monthly summary card before conducting a performance appraisal.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `month` (1–12), `year` (2000–2100).
10. **Field Meanings:** Month and year.
11. **Backend Processing Flow:**
    - Validates parameters via `userIdParamSchema` and `hrMemberSummarySchema`.
    - Verifies employee belongs to `org_id` (`404 EMPLOYEE_NOT_FOUND`).
    - Computes monthly attendance aggregates across all records.
    - Returns summary metrics.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID; month 1–12; year 2000–2100.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Summary object containing counts of present days, absences, late marks, overtime, and work hours.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Correctly accounts for joining date; dates prior to employment joining are not penalized as absences.
21. **Related APIs / Dependencies:** `GET /employees/:userId/attendance`.
22. **What the API Gives / Does:** Monthly attendance summary metrics for an employee.

---

### API 54 — Get Employee Daily Punch Log

1. **API Number and Name:** API 54 — Get Employee Daily Punch Log
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/employees/:userId/daily-log`
4. **Purpose:** Retrieves granular daily punch logs, break intervals, and session details for any employee on a specific date.
5. **Business Problem Solved:** Resolves punch discrepancies, missing clock-outs, and break compliance questions.
6. **Why the API Exists:** Provides exact punch timeline for any worker.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Checking exact clock-in and break timestamps for an employee contesting a late penalty.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `date` (ISO date, optional).
10. **Field Meanings:** Target date.
11. **Backend Processing Flow:**
    - Validates `userId` and `date`.
    - Asserts employee exists in `org_id` (`404 EMPLOYEE_NOT_FOUND`).
    - Fetches daily record with associated sessions and breaks.
    - Resolves virtual status if no punch was recorded.
    - Returns detailed log object.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Daily log entity with punch timestamps and break intervals.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If employee joined after the target date, final status returns `'not_marked'`.
21. **Related APIs / Dependencies:** `GET /employees/:userId/attendance`.
22. **What the API Gives / Does:** Detailed daily punch log for an employee.

---

## 16. Organization-Wide Manager Attendance Queries

### API 55 — List Manager Attendance

1. **API Number and Name:** API 55 — List Manager Attendance
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/managers/attendance`
4. **Purpose:** Retrieves attendance records specifically for users holding the `manager` role across the organization.
5. **Business Problem Solved:** Allows HR to monitor leadership attendance and supervisory presence across departments.
6. **Why the API Exists:** Specialized administrative endpoint for managerial oversight.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR auditing manager attendance compliance during quarterly leadership reviews.
9. **Request Parameters and Payload:**
   - **Query Parameters:** `date`, `from`, `to`, `status`, `department`, `search`, `page`, `limit`.
10. **Field Meanings:** Filtering and pagination parameters.
11. **Backend Processing Flow:**
    - Calls `hrAttendanceReadService.getHrManagerAttendanceList(orgId, filters)`.
    - Restricts query to user IDs holding the `'manager'` role.
    - Formats profiles and returns paginated records.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** `page >= 1`, `limit <= 100`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Paginated list of manager attendance records.
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped, HR-only.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Excludes non-manager personnel.
21. **Related APIs / Dependencies:** `GET /managers/:userId/attendance`.
22. **What the API Gives / Does:** Paginated list of manager attendance records.

---

### API 56 — Get Manager History

1. **API Number and Name:** API 56 — Get Manager History
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/managers/:userId/attendance`
4. **Purpose:** Retrieves deep paginated attendance history for any manager in the organization.
5. **Business Problem Solved:** Provides attendance records for managers.
6. **Why the API Exists:** Manager history view endpoint for HR.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Auditing a manager's attendance records.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `from`, `to`, `month`, `year`, `page`, `limit`.
10. **Field Meanings:** Range filters and pagination limits.
11. **Backend Processing Flow:**
    - Validates `userId` and query schemas.
    - Verifies user has `manager` role (`_verifyUserIsManager`). Throws `404 EMPLOYEE_NOT_FOUND` if not.
    - Queries paginated records with breaks, sessions, and shift.
    - Returns member profile header, pagination metadata, and records.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Paginated records for the manager.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Target user must have the `manager` role.
21. **Related APIs / Dependencies:** `GET /managers/attendance`.
22. **What the API Gives / Does:** Detailed historical records for a manager.

---

### API 57 — Get Manager Attendance Summary

1. **API Number and Name:** API 57 — Get Manager Attendance Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/managers/:userId/summary`
4. **Purpose:** Retrieves monthly summary metrics (present, absent, late, overtime, average hours) for a manager.
5. **Business Problem Solved:** Provides quick performance KPI cards for managers.
6. **Why the API Exists:** Feeds summary metric cards on manager profile views.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Reviewing manager attendance statistics during managerial appraisals.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `month` (1–12), `year` (2000–2100).
10. **Field Meanings:** Target month and year.
11. **Backend Processing Flow:**
    - Validates `userId` and query parameters.
    - Verifies user has `manager` role (`_verifyUserIsManager`).
    - Aggregates monthly records into summary KPIs.
    - Returns summary object.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Monthly summary KPI metrics.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Correctly handles mid-month joiners.
21. **Related APIs / Dependencies:** `GET /managers/:userId/attendance`.
22. **What the API Gives / Does:** Monthly attendance summary KPIs for a manager.

---

### API 58 — Get Manager Daily Punch Log

1. **API Number and Name:** API 58 — Get Manager Daily Punch Log
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/managers/:userId/daily-log`
4. **Purpose:** Retrieves minute-level punch logs, break intervals, and sessions for a manager on a specific date.
5. **Business Problem Solved:** Enables granular verification of manager punch sequences.
6. **Why the API Exists:** Provides daily timeline data for managers.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Checking exact punch times for a manager.
9. **Request Parameters and Payload:**
   - **Path Parameters:** `userId` (UUID, required).
   - **Query Parameters:** `date` (ISO date, optional).
10. **Field Meanings:** Target calendar date.
11. **Backend Processing Flow:**
    - Validates `userId` and `date`.
    - Verifies user has `manager` role (`_verifyUserIsManager`).
    - Fetches daily record with sessions and breaks.
    - Returns detailed log object.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Valid UUID.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:** Detailed timeline record with clock-in, clock-out, and break intervals.
15. **Error Scenarios, Status Codes, and Error Codes:** `404 EMPLOYEE_NOT_FOUND`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns virtual status if no punch exists.
21. **Related APIs / Dependencies:** `GET /managers/:userId/attendance`.
22. **What the API Gives / Does:** Detailed daily punch log for a manager.

---

## 17. Dashboards & Real-Time Analytics

### API 59 — Live Organization Attendance Dashboard

1. **API Number and Name:** API 59 — Live Organization Attendance Dashboard
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/dashboard/live`
4. **Purpose:** Provides real-time, organization-wide attendance metrics (total active employees, attendance percentage, on-time percentage, counts of present, absent, late, on break, on leave, weekly off, holiday) for today or a specified date.
5. **Business Problem Solved:** Gives executive leadership and HR immediate operational visibility into workforce presence and absenteeism without manual roll-calls.
6. **Why the API Exists:** Core data feed powering the real-time HR attendance dashboard.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Displayed on the main executive dashboard when HR opens the HRMS portal in the morning.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `date` (ISO date, optional, defaults to today).
10. **Field Meanings:** `date` allows viewing live metrics for a historical date.
11. **Backend Processing Flow:**
    - Validates optional `date` parameter.
    - Fetches all active users in the organization via `userRepository.findAllActiveUsers(orgId)`.
    - Fetches all attendance records for `targetDate`.
    - Concurrently resolves virtual statuses (`holiday`, `weekly_off`, `absent`, `not_marked`) for employees without records, taking into account joining dates and individual holiday/off rules.
    - Computes:
      - `total_employees`: Total active workforce.
      - `totalWorkingExpected`: Total employees minus holidays, weekly offs, and approved leaves.
      - `finalPresentCount`: Present + half-day + currently clocked-in (`in_progress`).
      - `finalAbsentCount`: Explicit absent + not marked.
      - `attendance_percentage`: `(finalPresentCount / totalWorkingExpected) * 100`.
      - `on_time_percentage`: Percentage of present employees who arrived within the grace period.
    - Returns comprehensive counts and percentages.
12. **Database Impact:** Read-only `SELECT`.
13. **Validation Rules:** Optional `date` must be ISO format.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Dashboard live stats fetched successfully",
        "data": {
          "date": "2026-09-13",
          "total_employees": 120,
          "attendance_percentage": 91.67,
          "on_time_percentage": 88.18,
          "final_present_count": 110,
          "final_absent_count": 10,
          "counts": {
            "present": 95,
            "absent": 8,
            "half_day": 5,
            "late": 13,
            "on_leave": 2,
            "not_marked": 2,
            "holiday": 0,
            "weekly_off": 0,
            "in_progress": 10
          }
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If today is an org-wide holiday, `totalWorkingExpected` becomes 0 and `attendance_percentage` returns 100%.
21. **Related APIs / Dependencies:** `GET /dashboard/graph-data`, `GET /dashboard/department-summary`.
22. **What the API Gives / Does:** Real-time workforce attendance statistics and KPI percentages.

---

### API 60 — Dashboard Graph & 30-Day Trend Data

1. **API Number and Name:** API 60 — Dashboard Graph & 30-Day Trend Data
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/dashboard/graph-data`
4. **Purpose:** Provides time-series chart data (daily present count, absent count, late count, overtime minutes, average effective hours, daily attendance percentage) over a date range or the past 30 days, along with an overall period summary.
5. **Business Problem Solved:** Enables trend visualization, identifying attendance dips, day-of-week absenteeism patterns (e.g. Monday/Friday dips), and overtime surges.
6. **Why the API Exists:** Feeds the main time-series attendance trend line and bar charts in the HR dashboard.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** Visualizing daily attendance trends and average working hours across the organization for the current month.
9. **Request Parameters and Payload:**
   - **Query Parameters:**
     - `month` (string `MM` or `M`, optional).
     - `year` (string `YYYY`, optional).
     - `from`, `to` (ISO dates, optional).
10. **Field Meanings:** Date range or month/year for time-series aggregation.
11. **Backend Processing Flow:**
    - Validates query parameters via `dashboardGraphSchema`.
    - Resolves `from` and `to` dates (caps `to` at today's date).
    - Queries raw daily aggregates from `recordRepository.getOrgDailyAggregates(orgId, from, to)`.
    - Generates a continuous daily map spanning every calendar day between `from` and `to`.
    - Detects holidays and weekend rest days for each date.
    - Computes daily attendance percentages, average effective hours, and overtime totals.
    - Computes period `overall_summary` (`avg_attendance_percentage`, `avg_hours_per_day`, `total_late_incidents`, `total_overtime_hours`).
    - Returns `{ overall_summary, daily: [ ... ] }`.
12. **Database Impact:** Read-only `SELECT` with SQL aggregations (`GROUP BY date, status`).
13. **Validation Rules:** Valid date patterns.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Dashboard graph data fetched successfully",
        "data": {
          "overall_summary": {
            "avg_attendance_percentage": 92.4,
            "avg_hours_per_day": 8.15,
            "total_late_incidents": 42,
            "total_overtime_hours": 38.5
          },
          "daily": [
            {
              "date": "2026-09-01",
              "is_working_day": true,
              "present_count": 110,
              "absent_count": 5,
              "late_count": 4,
              "half_day_count": 2,
              "in_progress_count": 0,
              "on_leave_count": 3,
              "weekly_off_count": 0,
              "holiday_count": 0,
              "avg_effective_hours": 8.25,
              "total_overtime_minutes": 180,
              "attendance_percentage": 93.22,
              "final_present_count": 112,
              "final_absent_count": 5
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Days in the date range with zero punches are preserved in the array with 0 counts to maintain unbroken chart axes.
21. **Related APIs / Dependencies:** `GET /dashboard/live`, `GET /dashboard/department-summary`.
22. **What the API Gives / Does:** Continuous time-series graph dataset and period averages.

---

### API 61 — Department Attendance Summary

1. **API Number and Name:** API 61 — Department Attendance Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/dashboard/department-summary`
4. **Purpose:** Aggregates attendance statistics grouped by department for a specific date or month, sorting departments by attendance percentage in ascending order.
5. **Business Problem Solved:** Identifies low-performing or struggling departments with high absenteeism or chronic lateness.
6. **Why the API Exists:** Provides departmental comparison charts in the HR analytics dashboard.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR identifies that the "Customer Support" department has an attendance rate of 76% compared to the company average of 92%.
9. **Request Parameters and Payload:**
   - **Query Parameters:**
     - `date` (ISO date, optional).
     - `month` (string `MM`, optional).
     - `year` (string `YYYY`, optional).
10. **Field Meanings:** Target date or month/year for departmental aggregation.
11. **Backend Processing Flow:**
    - Validates query parameters via `departmentSummarySchema`.
    - Resolves date range bounds.
    - Groups active users by department across employee, manager, and HR profiles to establish the total denominator per department.
    - Fetches department aggregates from `recordRepository.getDepartmentAggregates(orgId, from, to)`.
    - Computes present, absent, late, half-day, and attendance percentage per department.
    - Sorts departments by `attendance_percentage ASC`.
    - Returns array of department summary objects.
12. **Database Impact:** Read-only `SELECT` with `GROUP BY department, status`.
13. **Validation Rules:** Valid date patterns.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Department summary fetched successfully",
        "data": [
          {
            "department": "Customer Support",
            "total_employees": 30,
            "present": 22,
            "absent": 6,
            "late": 8,
            "half_day": 1,
            "in_progress": 1,
            "on_leave": 0,
            "attendance_percentage": 80.00,
            "final_present_count": 24,
            "final_absent_count": 6
          },
          {
            "department": "Engineering",
            "total_employees": 50,
            "present": 48,
            "absent": 1,
            "late": 2,
            "half_day": 0,
            "in_progress": 0,
            "on_leave": 1,
            "attendance_percentage": 97.96,
            "final_present_count": 48,
            "final_absent_count": 1
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Employees with unassigned departments are grouped under `'Unassigned'`.
21. **Related APIs / Dependencies:** `GET /dashboard/live`, `GET /dashboard/top-defaulters`.
22. **What the API Gives / Does:** Department-wise comparative attendance metrics sorted by lowest attendance first.

---

### API 62 — Top Attendance Defaulters

1. **API Number and Name:** API 62 — Top Attendance Defaulters
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/dashboard/top-defaulters`
4. **Purpose:** Identifies and ranks employees with the highest number of absences and highest cumulative late minutes across the organization during a month.
5. **Business Problem Solved:** Surfaces chronic absenteeism and persistent tardiness to HR for corrective action and counseling.
6. **Why the API Exists:** Power ranking query for the "Top Defaulters" widget on the HR dashboard.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR reviews the top 10 most absent and top 10 most tardy employees at the end of the month before issuing warnings.
9. **Request Parameters and Payload:**
   - **Query Parameters:**
     - `month` (string `MM`, optional).
     - `year` (string `YYYY`, optional).
     - `limit` (integer, default 10, max 50).
10. **Field Meanings:** Target month, year, and maximum number of defaulters to return per category.
11. **Backend Processing Flow:**
    - Validates parameters via `topDefaultersSchema`.
    - Resolves month date range.
    - Calls `recordRepository.getTopDefaulters(orgId, from, to, limit)`.
    - Queries `attendance_records` to rank employees by `COUNT(*) WHERE status = 'absent'` (descending).
    - Queries `attendance_records` to rank employees by `SUM(late_minutes)` and `COUNT(*) WHERE late_minutes > 0` (descending).
    - Formats user profiles (name, avatar, department, designation).
    - Returns `{ most_absent: [ ... ], most_late: [ ... ] }`.
12. **Database Impact:** Read-only `SELECT` with `GROUP BY user_id`, `ORDER BY ... DESC LIMIT N`.
13. **Validation Rules:** `limit` must be an integer between 1 and 50.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Top defaulters fetched successfully",
        "data": {
          "most_absent": [
            {
              "user_id": "5a61d281-9b6f-40e8-8d07-6f8d38e23bb4",
              "name": "Alex Miller",
              "avatar_url": null,
              "department": "Operations",
              "designation": "Associate",
              "absent_days": 4
            }
          ],
          "most_late": [
            {
              "user_id": "8c91d281-...",
              "name": "Sarah Connor",
              "avatar_url": null,
              "department": "Engineering",
              "designation": "DevOps Engineer",
              "late_days": 6,
              "total_late_minutes": 145
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If no employees were absent or late, returns empty arrays for both categories.
21. **Related APIs / Dependencies:** `GET /dashboard/live`, `GET /employees/:userId/attendance`.
22. **What the API Gives / Does:** Ranked lists of most absent and most tardy employees.

---

### API 63 — Work Mode Distribution Breakdown

1. **API Number and Name:** API 63 — Work Mode Distribution Breakdown
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/hr/dashboard/work-mode-distribution`
4. **Purpose:** Provides a breakdown of clock-ins categorized by work mode (`office`, `remote`, `hybrid`, `field`, `not_specified`) with counts, percentages, and daily trends over a date range.
5. **Business Problem Solved:** Enables monitoring of flexible work arrangements, office seat utilization, and remote work compliance.
6. **Why the API Exists:** Powers the Work Mode donut and trend charts in the HR analytics dashboard.
7. **Allowed Roles and Permissions:** `hr`, `admin`, `super-admin`.
8. **Real-World Usage:** HR checks what percentage of employees are working from the office versus remotely on Wednesdays.
9. **Request Parameters and Payload:**
   - **Query Parameters:**
     - `date` (ISO date, optional).
     - `month` (string `MM`, optional).
     - `year` (string `YYYY`, optional).
10. **Field Meanings:** Target date or month/year. Defaults to current date if omitted.
11. **Backend Processing Flow:**
    - Validates parameters via `workModeSchema`.
    - Resolves date range bounds (caps `to` at today).
    - Queries raw mode counts from `recordRepository.getWorkModeDistribution(orgId, from, to)`.
    - Aggregates total clock-ins per work mode category.
    - Computes percentage distribution across each work mode.
    - Generates daily trend array showing mode breakdown per day.
    - Returns `{ overall_distribution: [ ... ], daily_trend: [ ... ] }`.
12. **Database Impact:** Read-only `SELECT` with `GROUP BY date, work_mode`.
13. **Validation Rules:** Valid date patterns.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Work mode distribution fetched successfully",
        "data": {
          "overall_distribution": [
            { "mode": "office", "count": 85, "percentage": 70.83 },
            { "mode": "remote", "count": 25, "percentage": 20.83 },
            { "mode": "hybrid", "count": 10, "percentage": 8.33 },
            { "mode": "field", "count": 0, "percentage": 0 },
            { "mode": "not_specified", "count": 0, "percentage": 0 }
          ],
          "daily_trend": [
            {
              "date": "2026-09-13",
              "office": 85,
              "remote": 25,
              "hybrid": 10,
              "field": 0,
              "not_specified": 0
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.
16. **Security / Authorization Behavior:** Tenant-scoped.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Records with `work_mode = null` are reported under `not_specified`.
21. **Related APIs / Dependencies:** `GET /dashboard/live`, `GET /dashboard/graph-data`.
22. **What the API Gives / Does:** Work mode percentage breakdown and daily trends.

---

## Field Locations & Field Assignments (added 2026-10-05)

Eight endpoints for Work Mode enforcement and multi-site field geofencing were added to this
router under `/api/v1/attendance/hr`:

| Method | Endpoint | Purpose |
| :-- | :-- | :-- |
| `POST` | `/field-locations` | Register a client site / project facility |
| `GET` | `/field-locations` | List and search sites (paginated) |
| `GET` | `/field-locations/:id` | One site plus who is assigned to it |
| `PUT` | `/field-locations/:id` | Edit a site |
| `DELETE` | `/field-locations/:id` | Retire a site (soft delete, cascades to assignments) |
| `POST` | `/field-assignments` | Assign an employee to a site |
| `DELETE` | `/field-assignments/:assignment_id` | Unassign |
| `GET` | `/field-assignments/user/:user_id` | A user's active assignments |

They are mounted identically on the HR and Manager routers with identical payloads; only the
authorization scope differs. **Creation is org-wide** (a registered site is visible to every manager
and HR, so client sites are reused rather than duplicated), while **editing or retiring** a site is
limited to an HR admin or the manager who created it, and **assignment** is hierarchy-scoped:
org-wide for HR, **direct reports only** for a manager (one level, not a recursive tree), and never
to themselves.

Full request/response contracts, validation rules, error codes, the work-mode decision matrix and
the frontend implementation checklist:
**`public/md_attendance/7_work_mode_and_field_geofencing_api.md`**.

Related behaviour changes on this router: approving a regularization now also resolves that day's
geofence anomalies and returns `geofence_anomalies_resolved`; `missing_coordinates` anomalies were
upgraded from `medium` to `high`; and two anomaly types were added
(`geofence_unresolved`, `work_mode_claim_mismatch`).

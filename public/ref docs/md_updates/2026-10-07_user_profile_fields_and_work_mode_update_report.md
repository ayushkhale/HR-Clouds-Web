# Architectural & Engineering Report: User Profile Field Updates (Work Mode & Job Attributes) for HR and Managers

**Document Date:** October 7, 2026  
**Status:** Architectural Review & Implementation Proposal  
**Target Modules:**  
- Organization Module (`src/modules/organization`)  
- Attendance & Geofencing Module (`src/modules/attendance`)  
**Audience:** Backend Team, Frontend Team, System Architect, Product Owner  

---

## 1. Executive Summary & Problem Statement

### The Problem
During our audit of the site assignment feature, we identified a **critical operational blocker**:
1. When a Manager or HR assigns an employee to a client field site via `POST /api/v1/attendance/[manager|hr]/field-assignments`, the assignment succeeds, but the API returns:
   ```json
   "work_mode_warning": "Note: this employee's work mode is 'office', not 'field', so field geofencing will not apply until HR changes it."
   ```
2. The attendance engine enforces geofencing strictly based on the employee's contractual `work_mode` stored in their profile (`employee_profiles.work_mode`):
   - If `work_mode` is `'field'`, the engine evaluates **all assigned client sites + base office location** (Composite Resolution).
   - If `work_mode` is `'office'` (or `null`), the engine **ignores all assigned field sites** and evaluates only the office location. A punch at a client site is immediately flagged as **`out_of_bounds`** (High Severity Anomaly) and raises **`work_mode_claim_mismatch`**.
3. **The Current Blocker:** `work_mode` can currently **ONLY be set at invitation time**. Once an employee is created, there is **NO API ENDPOINT** anywhere in the system for HR or Managers to update `work_mode`.
   - `PATCH /organizations/me/job-profile` deliberately banned `work_mode` and `location_id` to prevent employees from self-exempting from geofencing (by picking `remote`).
   - Prior documentation noted that *"HR corrects both through PATCH /employees/:id/hr-fields"*, but `work_mode` and `location_id` were **never actually implemented** in `employee.validator.js` or `organization.service.js`.
   - As a result, transitioning an existing employee to `'field'` mode is currently **impossible** without manual database modification.

---

## 2. Current State Analysis: What Can Be Updated Today?

| Endpoint | Who Can Call | Whitelisted Fields Today | What Is Missing? |
| :--- | :--- | :--- | :--- |
| **`PATCH /api/v1/organizations/me`** | Employee (Self) | Personal contact & demographic fields only (`first_name`, `last_name`, `phone`, `current_address`, `dob`, `blood_group`, etc.) | Cannot touch any job/org field. |
| **`PATCH /api/v1/organizations/me/job-profile`** | Employee (Self) | Fill-once blanks on onboarding: `joining_date`, `department_id`, `designation`, `employment_type`, `gender`, `marital_status` | `work_mode` and `location_id` are **strictly blocked** (`400 VALIDATION_ERROR`). |
| **`PATCH /api/v1/organizations/employees/:id`** | **Manager** (for direct reports)<br>**HR** (for anyone) | Same personal whitelist as self-service (`first_name`, `last_name`, `phone`, `avatar_url`, `personal_email`, `address`, `dob`, `blood_group`). | **All job fields are stripped/ignored** (`work_mode`, `location_id`, `department_id`, `designation`, etc.). |
| **`PATCH /api/v1/organizations/employees/:id/hr-fields`** | **HR Admin Only** | `gender`, `marital_status`, `joining_date` (fill-once), and `reason` (required). | **`work_mode` and `location_id` are NOT present!** `designation`, `job_status`, and `employee_code` are also absent. |
| **`PUT /api/v1/organizations/users/:id/department-transfer`** | **HR Admin Only** | `new_department_id`, `new_manager_id`, `is_new_hod`, `replacement_hod_id`. | Focuses strictly on department and reporting lines; does not touch work mode. |

---

## 3. Scope of Profile Fields Needed for Site Assignments & Job Management

### Group A: Geofence & Location Enforcement (Direct Dependency for Site Assignments)
1. **`work_mode`** (`'on-site'` / `'office'`, `'remote'`, `'hybrid'`, `'field'`):
   - **Critical:** Controls whether punches evaluate client field sites (`'field'`), office pins (`'office'`), or bypass geofencing entirely (`'remote'`).
2. **`location_id`** (UUID of `organization_locations`):
   - **HR-Only Base Office Anchor:** Represents the company's permanent branch office (e.g. "Indore HQ").
   - **Why Managers DO NOT touch `location_id`:** The system implements **Composite Resolution** (`clock.service.js#1455`). When an employee is in `field` mode, the geofencing engine automatically evaluates `[base office location] + [all assigned client sites]`. The manager only assigns client sites (`field_location_id`) via `employee_field_assignments`. They never need to touch or reassign the employee's base corporate office (`location_id`). That field remains strictly owned by HR.

### Group B: Core Job & Employment Attributes (Operational Needs)
3. **`designation`** (String): Job title / designation. Currently fill-once by employee; HR cannot update promotions or correct typos.
4. **`employee_code`** (String): Internal company badge/employee ID.
5. **`employment_type`** (`full_time`, `part_time`, `contract`, `intern`): Currently cannot be updated post-onboarding.
6. **`job_status`** (`probation`, `confirmed`, `notice_period`, `terminated`, `trainee`, `contract`, `temporary`): Tracks lifecycle; currently cannot be changed via API.
7. **`notice_period_started_on`** (Date `YYYY-MM-DD`): Used to anchor leave notice-period caps.

---

## 4. Architectural Dilemma: Should Managers Be Allowed to Update `work_mode`?

Allowing a **Manager** to update an employee's profile involves security and governance trade-offs:

### Risk Assessment of Manager Updating `work_mode`
* **The "Remote" Geofence Bypass Risk:**
  If a Manager can freely set `work_mode: 'remote'`, they can completely exempt their team members from all geofencing and GPS verification.
* **Contractual & Payroll Implications:**
  In many organizations, `work_mode` dictates travel allowances, daily per diems, and office equipment reimbursements. Changing an employee from `office` to `remote` is a contractual change normally reserved for HR.
* **The Manager Bottleneck in Field Operations:**
  Conversely, field assignments are dynamic: a site engineer, sales executive, or auditor may need to be dispatched to a client site tomorrow. If the Manager assigns the site, but has to file an HR ticket just to flip `work_mode` to `'field'`, field assignments will stall and employees will get false `out_of_bounds` anomalies.

---

## 5. Architectural Options & Recommendations

### Option 1: HR-Only Update (Safe, but introduces administrative friction)
* Add `work_mode` and `location_id` strictly to `PATCH /api/v1/organizations/employees/:id/hr-fields` (HR only).
* Managers can assign sites, but HR must be requested to switch the employee's mode to `'field'`.
* **Verdict:** Fails to empower managers for rapid client site dispatch.

### Option 2: Full Manager Access to `work_mode` for Direct Reports (High Flexibility, Higher Risk)
* Add `work_mode` to `PATCH /api/v1/organizations/employees/:id` (accessible by Managers for direct reports).
* **Verdict:** Opens a vulnerability where managers can grant unverified `'remote'` status without HR oversight.

### Option 3 (RECOMMENDED): Tiered Permissions & Integrated Site Assignment Workflow
We recommend a balanced, production-grade hybrid approach:

#### 1. HR Admins: Full Capability on `PATCH /employees/:id/hr-fields`
* HR can update **any** profile field: `work_mode` (`'on-site'`, `'remote'`, `'hybrid'`, `'field'`), `location_id`, `designation`, `job_status`, `employment_type`, and `employee_code`.
* Requires `reason` for audit tracking.

#### 2. Managers: Scoped Transition to `'field'` Mode
Provide managers with two clean paths:
* **Path A (Integrated with Site Assignment):**
  In `POST /api/v1/attendance/manager/field-assignments`, accept an optional boolean:
  ```json
  {
    "user_id": "...",
    "field_location_id": "...",
    "effective_from": "2026-11-01",
    "effective_to": "2026-11-30",
    "set_work_mode_to_field": true
  }
  ```
  If `set_work_mode_to_field: true` is passed by a manager, the backend atomically transitions the direct report's profile `work_mode` to `'field'`, eliminating the warning and instantly enabling client site punches!
* **Path B (Restricted Mode Transition on Profile):**
  If `work_mode` is exposed on `PATCH /employees/:id` for managers, validate that managers can only toggle between `['office', 'field']` (or `['on-site', 'field']`), but **CANNOT** set `'remote'` without HR approval.

---

## 6. Proposed Technical Implementation (Backend API Changes)

### 6.1 Update `PATCH /api/v1/organizations/employees/:id/hr-fields`

#### Validator Schema (`src/modules/organization/validators/employee.validator.js`):
```javascript
const WORK_MODES = ['on-site', 'office', 'remote', 'hybrid', 'field']
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern']
const JOB_STATUSES = ['probation', 'confirmed', 'notice_period', 'terminated', 'trainee', 'contract', 'temporary']

exports.fieldValidation_UpdateHrOwnedFields = Joi.object({
  // Existing fields
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').allow(null),
  marital_status: Joi.string().trim().max(50).allow(null),
  joining_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),

  // NEW: Geofence & Location fields
  work_mode: Joi.string().valid(...WORK_MODES).optional(),
  location_id: Joi.string().guid({ version: ['uuidv4'] }).allow(null).optional(),

  // NEW: Job Attributes
  designation: Joi.string().trim().max(150).allow(null).optional(),
  employee_code: Joi.string().trim().max(100).allow(null).optional(),
  employment_type: Joi.string().valid(...EMPLOYMENT_TYPES).optional(),
  job_status: Joi.string().valid(...JOB_STATUSES).optional(),
  notice_period_started_on: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null).optional(),

  // Audit reason
  reason: Joi.string().trim().min(3).max(500).required()
}).min(2) // At least one field + reason
```

#### Service Logic (`src/modules/organization/services/organization.service.js`):
In `updateHrOwnedFields`:
1. When `work_mode` is passed:
   - Normalize `'office'` -> `'on-site'` for profile storage.
   - Update `roleProfile.work_mode`.
2. When `location_id` is passed:
   - Verify `location_id` belongs to `org_id`.
   - Denormalize `location.name` into `roleProfile.work_location`.
3. When `designation`, `employee_code`, `employment_type`, `job_status` are passed:
   - Update corresponding columns on `roleProfile`.
4. Log all modified fields in `[ORG_AUDIT]`.

---

### 6.2 Update `POST /api/v1/attendance/manager/field-assignments`

#### Feature: Auto-promote to Field Mode
Allow manager to pass `set_work_mode_to_field: true` in the assignment body:
```javascript
if (payload.set_work_mode_to_field && assignedMode !== WORK_MODES.FIELD) {
  await organizationRepository.updateRoleProfileFields(
    orgId, payload.user_id, context.roleKey, { work_mode: 'field' }, transaction
  )
}
```
* **Result:** In one single API call, the manager assigns the site AND activates field geofencing for their team member.

---

## 7. Frontend Impact & Implementation Blueprint

### 7.1 HR Employee Profile / Job Details Screen
* **Job Attributes Section:**
  * Add dropdowns for **Work Mode** (`On-Site / Office`, `Remote`, `Hybrid`, `Field`).
  * Add dropdown for **Base Office Location** (fetched from `GET /api/v1/organizations/locations`).
  * Add editable inputs for **Designation**, **Employment Type**, and **Job Status**.
* **Edit Confirmation Modal:**
  * When saving, open a modal prompting for `"Reason for update"` (required by `PATCH /employees/:id/hr-fields`).

### 7.2 Manager Field Site Assignment Modal
* **UI Flow:**
  1. Manager selects an employee from their direct reports list.
  2. Manager selects an active field location from `GET /api/v1/attendance/manager/field-locations`.
  3. If the selected employee is currently in `Office` mode:
     * Display a checkbox:  
       `☑ Set employee's work mode to 'Field' to enable client site GPS attendance` (checked by default).
  4. Submit payload with `set_work_mode_to_field: true`.
  5. Shows success notification: *"Employee assigned to Tata Steel Pune Plant and updated to Field work mode."*

---

## 8. Summary Comparison Table

| Attribute | Current Backend State | Proposed State |
| :--- | :--- | :--- |
| **`work_mode` update for HR** | ❌ Blocked (Only set at invite) | ✅ Allowed via `PATCH /employees/:id/hr-fields` |
| **`location_id` update for HR** | ❌ Blocked (Only set at invite) | ✅ Allowed via `PATCH /employees/:id/hr-fields` |
| **`work_mode` update for Manager** | ❌ Blocked | ✅ Allowed to promote direct report to `'field'` on site assignment |
| **`designation` / `employment_type` update**| ❌ Fill-once on self onboarding | ✅ Editable by HR with audit reason |
| **Audit Logging** | ⚠️ Partial | ✅ Full `[ORG_AUDIT]` logging with `reason` and before/after diff |

# System Update: Compensatory Off (`CO`) Auto-Provisioning & Immutability Protection

**Date:** 2026-10-11  
**Module:** Leave Management (`leave`) / Organization Onboarding (`organization`) / Attendance (`attendance`)  
**Audience:** Frontend Engineers, Fullstack Engineers, QA, Backend Maintainers  

---

## 1. Summary of Changes

To guarantee seamless operation of attendance compensatory off credits, leave applications, nightly expiry crons, monthly accruals, year-end rollovers, and payroll encashment, the backend has implemented automatic provisioning and protection for the system-managed **Compensatory Off (`CO`)** leave type:

1. **Auto-Provisioning on Registration:**
   - Every organization registered on the platform (both immediate free-tier registration and post-payment subscription activation) is automatically initialized with the system `Compensatory Off` leave type (`code: 'CO'`).
2. **Immutability & Deletion Safeguards:**
   - The system `CO` leave type cannot be deleted or deactivated by HR.
   - The unique identifier code `CO` cannot be renamed or altered.
   - HR retains full control to customize its display name (e.g., "Comp Off", "Compensatory Leave"), document requirements, or sandwich rules.
3. **Defense-in-Depth Fallback:**
   - Internal resolvers and attendance engines check `code: 'CO'` first and fall back gracefully to `code: 'COMP_OFF'` if an organization already had an alias.
4. **Database Backfill:**
   - An idempotent seeder (`013-seed-default-comp-off-leave-types.js`) is provided to backfill existing active organizations that currently lack the `CO` leave type.

---

## 2. Default Provisioned Leave Type Specification

When a new organization is activated, the following leave type is created within the organization's database scope:

| Field | Provisioned Default Value | Notes |
| :--- | :--- | :--- |
| `name` | `'Compensatory Off'` | HR can edit to custom display name |
| `code` | `'CO'` | **Immutable system code** (cannot be modified) |
| `is_paid` | `true` | Comp-offs are paid by definition |
| `is_active` | `true` | **Protected** (cannot be deactivated) |
| `requires_document_threshold` | `0` | HR can customize (e.g. proof of weekend work) |
| `sandwich_rule_applies` | `false` | HR can customize based on company policy |
| `allowed_genders` | `null` | Open to all employees |
| `allowed_marital_statuses` | `null` | Open to all employees |

---

## 3. API Contract & Error Responses

### A. Updating a Leave Type (`PUT /api/v1/leave/admin/leave-types/:id`)

HR administrators may update the display `name`, `requires_document_threshold`, `sandwich_rule_applies`, and demographic eligibility rules. However:

#### Attempting to change the code of `CO`
- **Request Body:**
  ```json
  {
    "code": "EL"
  }
  ```
- **Response:** `400 Bad Request`
  ```json
  {
    "success": false,
    "message": "The code for system-managed Compensatory Off (CO) leave type cannot be modified",
    "errorCode": "SYSTEM_LEAVE_TYPE_CODE_IMMUTABLE"
  }
  ```

#### Attempting to deactivate `CO`
- **Request Body:**
  ```json
  {
    "is_active": false
  }
  ```
- **Response:** `400 Bad Request`
  ```json
  {
    "success": false,
    "message": "System-managed Compensatory Off (CO) leave type cannot be deactivated",
    "errorCode": "SYSTEM_LEAVE_TYPE_IMMUTABLE"
  }
  ```

### B. Deleting a Leave Type (`DELETE /api/v1/leave/admin/leave-types/:id`)

#### Attempting to delete `CO`
- **Response:** `400 Bad Request`
  ```json
  {
    "success": false,
    "message": "System-managed Compensatory Off (CO) leave type cannot be deactivated or deleted",
    "errorCode": "SYSTEM_LEAVE_TYPE_IMMUTABLE"
  }
  ```

---

## 4. Frontend UI/UX Recommendations for HR Admin Panel

1. **Leave Types Table / List (`/settings/leave-types` or `/leave/admin/types`):**
   - For rows where `code === 'CO'`, display a **"System Default"** or **"Core Policy"** badge alongside the leave type name.
   - Disable or hide the **"Delete"** / **"Deactivate"** button. If disabled, show a tooltip:
     > *"System-managed leave type required for attendance and compensatory off tracking."*
2. **Edit Leave Type Modal / Form:**
   - For `code === 'CO'`, render the **Leave Code** input as `disabled` / read-only with helper text:
     > *"System code 'CO' is required by attendance calculation services and cannot be altered."*
   - Keep the **Leave Name**, **Document Threshold**, and **Sandwich Rule** inputs fully editable so HR can tailor the presentation to their organization.
3. **Leave Policy Template Entitlements:**
   - HR can add `CO` into policy templates or leave it managed via dynamic attendance credits. If policy templates assign comp-offs, the stable `CO` leave type is immediately selectable from the dropdown without requiring manual leave type creation first.

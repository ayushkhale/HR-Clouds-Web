# Phase 1: Foundation & Rules Engine APIs — Frontend Integration Guide

This document provides complete integration specifications for Frontend Developers implementing the **Leave Foundation (Rules Engine)** module. It covers endpoints for defining the organizational rules for Leave Types, Policy Templates, and Entitlements (Quotas).

> [!IMPORTANT]
> **Architectural Note:** The Phase 1 module acts as a strict configuration layer. None of these APIs assign leaves directly to employees; they build the "templates" that HR will assign in Phase 2. All configurations are heavily protected by relational database constraints.

---

## 1. Create a Leave Type
**What it is:** Creates a global category of leave (e.g., "Sick Leave").
**Why it exists:** To define *what* people can apply for and the overarching rules (paid/unpaid, documentation requirements).
**Frontend Workflow:** HR clicks "Add Leave Type", fills out the modal form, and saves.
**Database Models Affected:** `LeaveType`
**Side Effects:** None. This simply creates a dictionary item.

**Endpoint:** `POST /api/v1/leaves/types`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `leave.access`

### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `name` | String | Yes | Min 2, max 100 chars. |
| `code` | String | Yes | Alphanumeric, max 10 chars. Must be UNIQUE within the organization. |
| `description` | String | No | Max 500 chars. |
| `is_paid` | Boolean | Yes | `true` for paid, `false` for LWP (Leave Without Pay). |
| `requires_document_threshold`| Integer| No | Days after which proof (e.g., doctor note) is required. (e.g. `2`). |
| `sandwich_rule_applies` | Boolean | Yes | If `true`, intervening weekends are counted as leave. |

**Example Request:**
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

### Success Response (201 Created)
```json
{
  "success": true,
  "message": "Leave type created successfully",
  "data": {
    "id": "e6a0d2f0-...",
    "name": "Sick Leave",
    "code": "SL",
    "is_paid": true,
    "requires_document_threshold": 3,
    "sandwich_rule_applies": false,
    "is_active": true
  }
}
```

### Error Scenarios
- **409 Conflict:** `LEAVE_TYPE_EXISTS` (The `code` is already used). **UI Action:** Show field-level error on `code` input.
- **400 Bad Request:** Joi Validation error (e.g., `code` contains spaces).

---

## 2. List Leave Types
**What it is:** Fetches all global leave types.
**Frontend Workflow:** Populates the Data Table on the Leave Types settings page, and populates the `<select>` dropdown when creating Entitlements.

**Endpoint:** `GET /api/v1/leaves/types`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `include_inactive` | Boolean | Optional | Pass `true` for the main data table to see deleted types. Pass `false` (or omit) for dropdown menus to only see active ones. |

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Leave types fetched successfully",
  "data": [
    {
      "id": "e6a0...",
      "name": "Sick Leave",
      "code": "SL",
      "is_paid": true,
      "is_active": true,
      "requires_document_threshold": 3,
      "sandwich_rule_applies": false
    }
  ]
}
```

---

## 3. Update a Leave Type
**What it is:** Edits an existing leave type.
**Frontend Workflow:** HR clicks "Edit" on a table row, a modal opens, they change details, and save.

**Endpoint:** `PUT /api/v1/leaves/types/:id`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

### Path Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | The ID of the leave type to update. |

### Request Body (JSON)
*All fields are optional. Send only what changed, or all fields.* (Same schema as POST).

### Success Response (200 OK)
Returns the updated object in the `data` field.

### Error Scenarios
- **404 Not Found:** `LEAVE_TYPE_NOT_FOUND`
- **409 Conflict:** `LEAVE_TYPE_EXISTS` (If changing the `code` to one that already exists).

---

## 4. Deactivate Leave Type (Soft Delete)
**What it is:** Removes a leave type from active use.
**Why it exists:** To deprecate old leave policies without breaking historical balance ledgers.
**Database Implication:** Sets `is_active = false`. This is a **Soft Delete**.
**Concurrency/Safety:** The backend locks the database and checks for active assignments or pending requests to prevent data corruption.

**Endpoint:** `DELETE /api/v1/leaves/types/:id`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `force` | Boolean | Optional | `true` bypasses the warning about active employee balances. |

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Leave type deactivated successfully"
}
```

### Error Scenarios & Complex Workflows
This API requires a multi-step UI flow based on Error Codes:
1. **Scenario A (200 OK):** No one uses it. The UI simply removes it from the active table.
2. **Scenario B (409 Conflict: `ACTIVE_BALANCES_EXIST`):** 
   - **Triggered if:** Employees still have unused leave balances for this type.
   - **UI Action:** Show a warning modal: *"Warning: Employees still hold balances for this leave. Deactivating will prevent them from applying. Force deactivate?"*. If HR clicks YES, call the API again with `?force=true`.
3. **Scenario C (409 Conflict: `PENDING_REQUESTS_EXIST`):**
   - **Triggered if:** Someone applied for this leave and it is pending manager approval.
   - **UI Action:** Show a strict error block. *"Cannot deactivate. Please approve/reject all pending requests first."* This **cannot** be bypassed.

---

## 5. Create a Policy Template
**What it is:** Creates an empty bucket (Template) to hold leave quotas.
**Frontend Workflow:** HR clicks "Create Policy", enters Name/Description, and clicks Save.

**Endpoint:** `POST /api/v1/leaves/templates`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `name` | String | Yes | Max 100 chars. Must be unique. |
| `description` | String | No | Max 500 chars. |

**Example Request:**
```json
{
  "name": "Standard Employee Policy",
  "description": "Applies to all full-time engineers"
}
```

### Success Response (201 Created)
Returns the created template object in the `data` field.

---

## 6. Add Entitlement (Quota) to a Template
**What it is:** Links a Leave Type to a Policy Template and defines the math (annual quota, accrual, carry-forward).
**Why it exists:** This creates the actual "Rule" that the Phase 2 Math Engine will run on.
**Frontend Workflow:** On the Template Details page, HR clicks "Add Quota", selects a Leave Type, inputs numbers, and saves.
**Database Implication:** Creates a `LeavePolicyEntitlement` record.

**Endpoint:** `POST /api/v1/leaves/templates/:templateId/entitlements`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

### Path Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `templateId` | UUID | Yes | The ID of the parent policy template. |

### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `leave_type_id` | UUID | Yes | Must be an active leave type. |
| `annual_quota` | Number | Yes | 0 to 365. Can be decimal (e.g. `12.5`). |
| `accrual_type` | String | Yes | Must be `'upfront'` or `'monthly'`. |
| `max_carry_forward` | Number | No | Default `0`. Days that roll over to next year. |
| `probation_restriction_days`| Integer| No | Default `0`. Days from joining before use. |
| `max_negative_balance`| Number | No | Default `0`. Overdraft limit. |

**Example Request:**
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

### Success Response (201 Created)
Returns the created entitlement in the `data` field.

### Error Scenarios
- **409 Conflict:** `ENTITLEMENT_EXISTS` (The template already has a quota rule for this specific Leave Type). **UI Action:** Display a toast error.

---

## 7. Update / Delete Entitlements
**Endpoints:**
- `PUT /api/v1/leaves/templates/:templateId/entitlements/:entitlementId`
- `DELETE /api/v1/leaves/templates/:templateId/entitlements/:entitlementId`

> [!CAUTION]
> **Business Rule:** The `leave_type_id` is IMMUTABLE once created. You cannot change a "Sick Leave" rule into a "Casual Leave" rule via PUT. HR must delete the entitlement and create a new one. The UI should disable the Leave Type dropdown in the Edit modal.

---

## 🛑 Technical Edge Cases & Implications for Frontend Developers

1. **Stale Data on Template Updates (The Disconnect):** 
   - When HR updates a Policy Template or Entitlement, any employees *currently* assigned to that policy **DO NOT** get their balances recalculated immediately. The template dictates *new assignments* and *yearly chron jobs*. 
   - **UI UX Requirement:** The frontend should show a warning message when editing a live template: *"Note: Changes to this policy will only apply to new assignments or at year-end. To immediately adjust existing employees, use the Override Config feature."*

2. **Hard vs. Soft Deletes:**
   - **Leave Types:** Deleting is a soft-delete (`is_active = false`). Use `include_inactive=true` when building historical audit tables, but `false` for active dropdowns.
   - **Templates:** Deleting a Template (`DELETE /templates/:id`) is a **hard cascade delete**. It wipes all child Entitlements instantly. Employees holding that template will be stranded and must be reassigned.

3. **Empty Template Traps:**
   - The backend allows a Template to exist with 0 Entitlements. If HR assigns an empty template to an employee in Phase 2, the employee receives 0 leaves. 
   - **UI UX Requirement:** Ideally, disable the "Assign" button if a template is totally empty, or show a warning icon.

4. **Type Parsing Strictness:**
   - Fields like `is_paid` require exact booleans (`true`/`false`), not strings (`"true"`).
   - `annual_quota` allows decimals (`12.5`).
   - `probation_restriction_days` requires strict integers (`90`). The UI HTML input must block decimal input for probation days. 

5. **Missing APIs required for Phase 3:**
   - Currently, there is no API to fetch a user's *Probation Restriction Status* directly, though it can be inferred by checking the `joining_date` vs `probation_restriction_days` in the config on the client-side. The backend will enforce it strictly during `POST /apply` in Phase 3.

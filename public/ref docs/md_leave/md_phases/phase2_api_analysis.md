# Phase 2: Policy Assignment & Balance Engine APIs — Frontend Integration Guide

This guide is designed for Frontend Developers integrating the **Policy Assignment and Balance Engine** module. It covers endpoints for assigning HR policies to employees, overriding individual leave quotas, and fetching leave balances.

> [!IMPORTANT]
> **Architectural Note:** The Backend utilizes a strict **Pro-Rata Math Engine**. When a policy is assigned mid-year, the engine automatically calculates fractional days based on the employee's `joining_date`, leap years, and rounds to the nearest `0.5` days. The frontend does **not** need to perform any pro-rata math.

---

## 1. Assign Policy to User
**What it is:** Assigns a Leave Policy Template (a bundle of leave types) to an employee.
**Why it exists:** To initialize or re-assign an employee's leave entitlements for the year based on a standardized HR template.
**Frontend Workflow:** HR selects an employee in the UI, picks a Policy Template from a dropdown, and clicks "Assign".
**Side Effects:** 
1. Any orphaned configurations (leave types not in the new template) are automatically soft-deleted and closed historically.
2. New configurations are created.
3. The Ledger (`leave_balances`) is automatically credited with prorated `total_accrued` days for the current year.

**Endpoint:** `POST /api/v1/leaves/users/:userId/assign-policy`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `leave.access`

### Path Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | UUID | Yes | The ID of the employee receiving the policy. |

### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `template_id` | UUID | Yes | Must be a valid ID from the `leave_policy_templates` table. |

**Example Request:**
```json
{
  "template_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0"
}
```

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Policy assigned successfully."
}
```

### Error Scenarios
- **404 Not Found:** `EMPLOYEE_NOT_FOUND` (Invalid `userId`).
- **404 Not Found:** `TEMPLATE_NOT_FOUND` (Invalid `template_id`).
- **400 Bad Request:** Joi Validation error (e.g. invalid UUID format).
- **500 Internal Error:** Database transaction failure.

> [!WARNING]
> **Idempotency & Concurrency:** This API is fully wrapped in an atomic database transaction. If the frontend double-submits, the backend database unique constraints will catch it. One request will succeed, the other will safely fail without corrupting the balance ledger.

---

## 2. Override Employee Leave Configuration
**What it is:** Overrides specific leave rules for a *single* leave type for a specific employee, detaching them from the strict template defaults.
**Why it exists:** HR needs to negotiate custom limits (e.g., giving a Senior Executive 24 privilege leaves instead of the standard 12).
**Frontend Workflow:** HR opens the employee's Leave Profile, clicks "Edit" next to a specific Leave Type, changes the quota or carry-forward limit, and saves.

**Endpoint:** `PUT /api/v1/leaves/users/:userId/configs/:leaveTypeId`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `leave.access`

### Path Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | UUID | Yes | The ID of the employee. |
| `leaveTypeId` | UUID | Yes | The specific leave type config to override (e.g. ID for "Sick Leave"). |

### Request Body (JSON)
*Note: You only need to send the fields you wish to override. Unsent fields remain at their current values.*

| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `assigned_annual_quota` | Number | Optional | 0 to 365. The new absolute annual quota. |
| `accrual_type` | String | Optional | `'upfront'` or `'monthly'`. |
| `max_carry_forward` | Number | Optional | 0 to 365. |
| `probation_restriction_days` | Integer | Optional | 0 to 365. Days from joining before leave can be taken. |
| `max_negative_balance` | Number | Optional | 0 to 365. How many days they can overdraft. |

**Example Request:**
```json
{
  "assigned_annual_quota": 24,
  "max_negative_balance": 5
}
```

### Success Response (200 OK)
Returns the newly created historical config record.

```json
{
  "success": true,
  "message": "Configuration overridden successfully",
  "data": {
    "id": "c9e8f7...",
    "user_id": "...",
    "leave_type_id": "...",
    "assigned_annual_quota": 24,
    "max_negative_balance": 5,
    "effective_from": "2026-08-24",
    "effective_to": null
  }
}
```

> [!TIP]
> **Balance Auto-Correction:** If you increase the `assigned_annual_quota` for an `'upfront'` policy, the Backend will automatically deposit the difference into the user's current `leave_balances` wallet! The UI does not need to call a separate API to adjust the balance.

### Error Scenarios
- **404 Not Found:** `CONFIG_NOT_FOUND` (The user does not currently have this leave type assigned via a policy).
- **400 Bad Request:** At least one field must be provided to override.

---

## 3. Get User Balances (Admin)
**What it is:** Fetches the leave wallet (ledger) for an employee.
**Frontend Workflow:** Displayed on the HR dashboard when viewing an employee's profile to see how many leaves they have left.

**Endpoint:** `GET /api/v1/leaves/users/:userId/balances`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `leave.access`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | Integer | Optional | The year to query. Defaults to the current calendar year if omitted. |

### Success Response (200 OK)
Returns an array of balances. It automatically joins the `leave_types` table to give you the human-readable name of the leave.

```json
{
  "success": true,
  "message": "User balances fetched successfully",
  "data": [
    {
      "id": "b1a2...",
      "user_id": "u1...",
      "leave_type_id": "lt1...",
      "year": 2026,
      "total_accrued": "12.00",
      "total_used": "3.50",
      "current_balance": "8.50",
      "leave_type": {
        "id": "lt1...",
        "name": "Privilege Leave",
        "code": "PL"
      }
    }
  ]
}
```

> [!NOTE]
> `total_accrued`, `total_used`, and `current_balance` are returned as Strings by the database (PostgreSQL returns `DECIMAL` as strings to preserve precision). The frontend should use `parseFloat()` or a safe math library if performing client-side additions.

---

## 4. Get My Balances (Employee Self-Service)
**What it is:** Fetches the logged-in employee's own leave wallet.
**Frontend Workflow:** Displayed on the employee's main dashboard. This powers the "Available Leaves" widget.

**Endpoint:** `GET /api/v1/leaves/my-balances`
**Auth Required:** Yes (Token)
**Roles Required:** Any authenticated user.
**Feature Required:** `leave.access`

### Query Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | Integer | Optional | The year to query. Defaults to the current calendar year. |

### Success Response (200 OK)
Exactly the same structure as the Admin endpoint.

```json
{
  "success": true,
  "message": "Your leave balances fetched successfully",
  "data": [
    {
      "leave_type_id": "lt2...",
      "year": 2026,
      "total_accrued": "6.00",
      "total_used": "0.00",
      "current_balance": "6.00",
      "leave_type": {
        "name": "Sick Leave",
        "code": "SL"
      }
    }
  ]
}
```

---

## Technical Edge Cases for Frontend Developers

1. **Empty States:** If an employee has no policy assigned, the `/balances` endpoints will return an empty array `[]`. The UI should detect this and display a message: *"No leave policy assigned."*
2. **Decimals:** Balances can be fractional (e.g. `2.5` days). The UI should elegantly handle displaying `.5` values. Do not aggressively `Math.floor()` the display.
3. **Mid-Year Accrual UI Delays:** If an employee has a `monthly` accrual type and is assigned a policy mid-month, their balance might show `0` until the 1st of the next month (when the background chron job runs). This is intentional and legally correct.
4. **Inactive Leave Types:** The API allows fetching balances for leave types that HR has marked as `is_active: false`. This ensures employees can still see historical records of leaves they used in the past, even if the company discontinued that leave type.

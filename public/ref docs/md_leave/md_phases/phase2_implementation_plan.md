# Phase 2: Policy Assignment & Balance Engine
*(Production-Level Implementation Plan)*

## 1. Goal Description
The purpose of Phase 2 is to bridge the gap between abstract HR Rules (Templates) and live Employee Wallets (Balances). 
In this phase, we build the engine that assigns a Template to an Employee. This process calculates their exact entitlement (factoring in joining dates) and seeds their `leave_balances` ledger so they can begin applying for leaves in Phase 3.

## 2. Directory Structure Updates
We will add the following components to the existing `leave` module:
```text
src/
└── modules/
    └── leave/
        ├── controllers/
        │   ├── leave_admin.controller.js (Append assignment endpoints)
        │   └── leave_self.controller.js (New: for /my-balances)
        ├── repositories/
        │   ├── employee_leave_configs.repository.js (New)
        │   └── leave_balances.repository.js (New)
        ├── routes/
        │   ├── leave_admin.routes.js (Append assignment endpoints)
        │   └── leave_self.routes.js (New)
        ├── services/
        │   ├── leave_assignment.service.js (New)
        │   └── leave_balance.service.js (New)
        └── validators/
            └── leave_assignment.validator.js (New)
```

## 3. Core Logic: The Assignment Engine

The heart of Phase 2 is the `assignPolicyToUser` method. When HR assigns Template A to User B, the engine performs the following:

### Step 1: Fetch Employee Data
Retrieve `joining_date` from `employee_profiles`. If the user has no profile, assignment is blocked.

### Step 2: Pro-Rata Calculation (Edge Case 1)
If `joining_date` falls in the current year, the employee does not get the full Annual Quota.
**Formula:**
`Days Remaining = Days in Year - Day of Year(joining_date)`
`Pro-Rata Quota = (Days Remaining / Days in Year) * Annual Quota`
*(Values will be rounded to the nearest 0.5)*

### Step 3: Handle Policy Reassignment (Edge Case 17)
If the employee already has an active `employee_leave_configs` and `leave_balances` for the current year:
1. Snapshot `leave_balances.total_used`.
2. Apply the new Template's rules.
3. Calculate the new Pro-Rata Quota starting from the *reassignment date* (today), plus whatever they accrued earlier in the year.
4. Create/Update the balance row ensuring `current_balance = total_accrued - total_used`.

### Step 4: Accrual Type Handling
- **Upfront:** `total_accrued` in `leave_balances` is immediately set to the Pro-Rata Quota.
- **Monthly:** `total_accrued` is set to `(Pro-Rata Quota / 12) * Months Worked This Year`. The automated Monthly Cron (Phase 5) will handle the rest.

## 4. Repositories
### `employee_leave_configs.repository.js`
- Must enforce `org_id` on all queries.
- Needs an `upsertConfig` method to handle reassignments gracefully.

### `leave_balances.repository.js`
- Must enforce `org_id` and `year`.
- Needs a `findOrCreateBalance` and `updateBalance` method.

## 5. API Endpoints

### HR Admin APIs (`leave_admin.routes.js`)
*Secured by `hr` role.*
1. `POST /api/v1/leaves/users/:userId/assign-policy`
   - **Body:** `{ "template_id": "UUID" }`
2. `PUT /api/v1/leaves/users/:userId/configs/:leaveTypeId`
   - **Body:** `{ "assigned_annual_quota": 15, "max_carry_forward": 5 }`
3. `GET /api/v1/leaves/users/:userId/balances`
   - **Query:** `?year=2026`

### Self-Service APIs (`leave_self.routes.js`)
*Secured by any valid org role (employee, manager, hr).*
1. `GET /api/v1/leaves/my-balances`
   - Uses `req.user.id`.

## 6. Edge Cases & Technical Hardening Covered in Phase 2
| Edge Case / Issue | Description | Senior Technical Solution |
| :--- | :--- | :--- |
| **Edge Case 1 (Pro-Rata & Leap Years)** | Mid-Year Joining | Pro-Rata engine calculates exact fractional quota based on `joining_date`. *Fix:* The mathematical formula must dynamically determine days in the year (e.g., 366 for leap years) instead of hardcoding 365. |
| **Edge Case 17 (Reassignment)** | Template Reassignment | Re-assignment snapshots `total_used` and adjusts `total_accrued` without losing historical data. *Fix:* Sets `effective_to` of the old config to yesterday for perfect historical auditing. |
| **Schema Gap Identified** | Missing Entitlement Limits | `employee_leave_configs` is missing `probation_restriction_days` and `max_negative_balance`. *Fix:* We must run a migration to `ALTER TABLE employee_leave_configs` to include these fields so Phase 3 calculator has access to them. |
| **JS Float Precision** | Decimals bleeding (`0.300000004`) | Javascript handles decimals poorly. *Fix:* All fractional balance calculations must use precise rounding utilities (rounded to nearest `0.5`) *before* DB insertion. |
| **Transaction & Idempotency** | Partial DB failures or Double Clicks | *Fix:* The `assignPolicy` service MUST wrap all DB calls in a single transaction. It must also use DB `UPSERT` commands on the unique `[user_id, leave_type_id]` index to safely handle concurrent double-clicks from HR. |

# Phase 5: Cron Jobs & Year-End Automation APIs — Frontend Integration Guide

This document provides the complete integration specifications for Frontend Developers and DevOps/Support Engineers implementing the **Phase 5 Leave Automation** manual triggers.

> [!IMPORTANT]
> **Architectural Note:** In a standard production environment (Linux), Phase 5 relies heavily on automated background Node-cron jobs (`leave_monthly_accrual.cron.js` and `leave_year_end_rollover.cron.js`). However, these crons do not register in development environments (Windows/macOS). The APIs defined below expose the exact same service logic behind guarded HR endpoints. These are primarily used for **development verification**, **manual testing**, and **incident recovery** (e.g., catching up missed automated runs).

---

## 1. Trigger Monthly Accrual (Manual Run)
**What it is:** Executes the Monthly Accrual engine for the caller's organization.
**Why it exists:** Provides a deterministic way to trigger the monthly quota generation without waiting for the `01:00 IST` 1st-of-the-month cron.
**Frontend/Support Workflow:** An Admin/HR user clicks a "Run Monthly Accrual" button in an internal Dev/Ops dashboard to force a recalculation.
**Database Models Affected:** `LeaveBalance` (updates `total_accrued`, `current_balance`, and sets `last_accrued_period`).
**Side Effects:** Idempotent. The engine checks `last_accrued_period` and securely skips anyone who has already been credited for the target month.

**Endpoint:** `POST /api/v1/leaves/automation/accrual/run`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `leave.access`

### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `reference_date` | String | No | Format: `YYYY-MM-DD`. Allows testing the engine in the future or past. If omitted, the server's current date/time is used. |

**Example Request:**
```json
{
  "reference_date": "2026-09-01"
}
```

### Success Response (200 OK)
Returns a summary of the batch processing logic. The engine processes users in chunks of 200 via separate transactions.
```json
{
  "success": true,
  "message": "Monthly accrual executed",
  "data": {
    "success": true,
    "period": "2026-09",
    "orgs": 1,
    "processed": 150,
    "credited": 145,
    "skipped": 5,
    "failed": 0
  }
}
```

### Error Scenarios
- **401 Unauthorized:** Invalid or missing token.
- **403 Forbidden:** The user does not have the `hr` role or `leave.access` feature.

---

## 2. Trigger Year-End Rollover (Manual Run)
**What it is:** Executes the Year-End Rollover engine for the caller's organization.
**Why it exists:** Provides a deterministic way to trigger the Jan 1st (`00:00 IST`) rollover logic for testing, or to run it manually if the server was down during the New Year boundary.
**Frontend/Support Workflow:** An Admin/HR user clicks a "Run Year-End Rollover" button in an internal Dev/Ops dashboard.
**Database Models Affected:** `LeaveBalance` (closes the previous year by setting `lapsed_balance`, and opens/completes the new year by carrying forward balances and seeding new quotas).
**Side Effects:** Idempotent. The engine checks `rolled_over_at` and securely skips balances that have already been finalized.

**Endpoint:** `POST /api/v1/leaves/automation/rollover/run`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `leave.access`

### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `reference_date` | String | No | Format: `YYYY-MM-DD`. Allows testing the engine across year boundaries. If omitted, the server's current date/time is used. |

**Example Request:**
```json
{
  "reference_date": "2027-01-01"
}
```

### Success Response (200 OK)
Returns a summary of the rollover operations.
```json
{
  "success": true,
  "message": "Year-end rollover executed",
  "data": {
    "success": true,
    "oldYear": 2026,
    "newYear": 2027,
    "orgs": 1,
    "processed": 150,
    "rolled": 150,
    "skipped": 0,
    "failed": 0
  }
}
```

### Error Scenarios
- **401 Unauthorized:** Invalid or missing token.
- **403 Forbidden:** The user does not have the `hr` role or `leave.access` feature.

---

## Workflow 1: The Monthly Accrual Lifecycle

The monthly accrual engine runs silently in the background (via cron) or manually via the API. It ensures that employees on 'monthly' accrual policies receive their quota credits seamlessly, accounting for mid-year joiners and partial assignments.

### Step 1: The Cron Trigger (System Action)
- **Action:** At 01:00 AM IST on the 1st of every month, the server executes `leave_monthly_accrual.cron.js`.
- **The Phase 5 Magic:** The system fetches all active employees and iterates over their assigned leave policies. It filters out any policies that are strictly 'upfront' or 'comp-off'.

### Step 2: Evaluation & Idempotency Check (System Action)
- **Action:** The engine compares the current month against the `last_accrued_period` watermark on the employee's `LeaveBalance` ledger.
- **The Phase 5 Magic:** If the watermark matches the current month, the employee is safely skipped (preventing double-credits if the cron re-runs). If the balance row doesn't exist yet (e.g., a mid-month assignment), the engine relies on the safe seeding logic implemented in Phase 5 to correctly calculate the prorated amount based on the `effective_from` date.

### Step 3: Ledger Credit (System Action)
- **Action:** The engine calculates the `(annual_quota / 12)` and credits the wallet.
- **The Phase 5 Magic:** The engine updates the `total_accrued` and `current_balance` using strict math bounds, stamping the `last_accrued_period` to the current month to seal the ledger until next month.

---

## Workflow 2: The Year-End Rollover Transition

The year-end rollover engine orchestrates the delicate transition between December 31st and January 1st, managing carry-forwards, lapsing stale leaves, and seeding the new year's ledger.

### Step 1: The New Year Boundary (System Action)
- **Action:** At 00:00 AM IST on January 1st, the server executes `leave_year_end_rollover.cron.js`.
- **The Phase 5 Magic:** The engine selects all active balances from the previous calendar year. It locks these rows for processing to prevent active transactions from colliding with the rollover math.

### Step 2: Carry-Forward Calculation (System Action)
- **Action:** The system evaluates the `max_carry_forward` rule from the employee's `EmployeeLeaveConfig`.
- **The Phase 5 Magic:** If the employee has 10 days remaining, but the carry-forward limit is 5, the engine calculates `lapsed_balance = 5`. It stamps the old year's row as `rolled_over_at = NOW()`, permanently sealing it.

### Step 3: Seeding the New Ledger (System Action)
- **Action:** The engine creates the new year's balance row.
- **The Phase 5 Magic:** It seeds the new row with `carried_forward = 5`. If the policy is 'upfront', it also injects the full `annual_quota` immediately. The employee wakes up on Jan 1st with their fresh balances securely computed.

---

## 🛑 Technical Edge Cases & Implications for Frontend Developers / Testers

1. **Idempotency Guarantee:** 
   - You can spam these APIs via the frontend/Postman without fear of double-crediting users or fabricating duplicate year-end rows. 
   - If an employee has already received their monthly credit (verified by `last_accrued_period`), they will simply be included in the `skipped` count.
   - If a year-end row is finalized (verified by `rolled_over_at`), it will also be skipped.

2. **Cross-Boundary Accrual Interactions (Testing Note):**
   - If you are testing the End-of-Year flow manually via the frontend, you **must run the Rollover API before running the January Accrual API**. 
   - The Rollover API is responsible for creating the clean January 1st `LeaveBalance` row (with `carried_forward` values). If you run the January Accrual first without the Rollover having run, the engine will create an isolated row missing the carried balances. The actual Node-cron jobs naturally execute Rollover at 00:00 and Accrual at 01:00 to enforce this precedence.

3. **Comp-Offs Are Excluded:**
   - Neither of these APIs will touch Comp-Off (CO) leave types. Comp-Offs operate strictly on an earned/expired 90-day rolling window, completely bypassing standard monthly accrual and annual rollover.

4. **Negative Balances Carry Forward:**
   - If an employee has a `-2` balance on Dec 31, the Year-End Rollover API will literally carry `-2` into the new year. Negative balances are an intentional design feature (representing an consumed advance) and are not forgiven silently at year-end.

5. **Cross-Boundary Leave Approvals:**
   - If a manager approves a leave request in December that takes place in January, the system "pre-seeds" a January row. When you execute the Year-End Rollover API afterward, it detects this pre-seeded row and carefully recalculates the quotas and carry-forward to ensure the employee is credited perfectly.

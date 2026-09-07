# Phase 2: Payroll Engine & Calculation Module — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint analysis of the **20 APIs** implemented in Phase 2 of the Payroll module. 

> [!IMPORTANT]
> **Architectural Premise:** Payroll is exclusively a **tenant-plane** module. Platform roles (`admin`, `super-admin`) are strictly blocked. Every route demands an organizational `orgId` and the `payroll.access` feature flag.

---

## 1. HR Administration APIs (Engine Operations) — `/api/v1/payroll/hr/runs`
*Auth stack:* `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`

### API 01: Get Run Eligibility
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/eligibility`
* **Purpose:** To evaluate the organization's readiness for a payroll run for a specific month.
* **Business Problem Solved:** Before calculating payroll for thousands of employees, HR needs to know if the month is actually ready to be processed. Running payroll blindly and discovering half the org is missing salary structures or bank accounts wastes time and database resources.
* **Why This API Exists:** To provide a dry-run pre-flight check. It acts as the gateway to the payroll wizard.
* **Who / Roles Allowed:** `hr` only.
* **When Used / Real-World Situation:** When an HR administrator opens the "Run Payroll" UI dashboard and selects a month (e.g., September 2026), this API is immediately called to render the readiness checklist.
* **Request Structure & Parameters:** Query param `period_month` (Format: `YYYY-MM`).
* **Backend Processing Flow:** The controller validates the query. The service calls the pure aggregator (`aggregatorService.aggregate`) without persisting any data. It dry-runs the calendar and checks structures, leaving a memory-only trace.
* **Database Impact:** Read-only across profiles, structures, leave, and attendance.
* **Validation Rules:** `period_month` must be a valid month string.
* **Response Structure (Success):**
  ```json
  {
    "period_month": "2026-09",
    "period_start": "2026-09-01",
    "period_end": "2026-09-30",
    "headcount": 120,
    "missing_structure_count": 2,
    "missing_structure": [{ "user_id": "...", "employee_code": "EMP-01" }],
    "exit_date_required_count": 1,
    "joiners_count": 5,
    "leavers_count": 1,
    "missing_bank_account_count": 4,
    "already_run": null,
    "period_locked": false,
    "locked_ranges": []
  }
  ```
* **Failure Scenarios:** Returns HTTP 400 if period_month is malformed.
* **Security & Idempotency:** Idempotent read. Safe to poll.

### API 02: Create Payroll Run
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs`
* **Purpose:** To initiate a new payroll run, locking the period to prevent duplicates.
* **Business Problem Solved:** Ensures that an organization cannot accidentally create multiple overlapping payroll runs for the same month, which would lead to double payments and reporting chaos.
* **Why This API Exists:** It establishes the run's header row, captures the current organizational settings (so future settings changes don't alter past arithmetic), and starts the `draft` state.
* **Who / Roles Allowed:** `hr` only.
* **When Used / Real-World Situation:** HR clicks "Start Run" after reviewing the eligibility check.
* **Request Structure:**
  ```json
  {
    "period_month": "2026-09",
    "run_type": "regular",
    "notes": "September 2026 Salary"
  }
  ```
* **Validation Rules:** `period_month` must be valid. `run_type` must be `regular` (Phase 2 limitation).
* **Backend Processing Flow:** 
  1. Takes an advisory lock `payroll:run:{orgId}:{period_month}`.
  2. Fetches current `payroll_settings`.
  3. Checks partial unique index on `(org_id, period_month, run_type)`.
  4. Inserts row into `payroll_runs`.
  5. Audits the action via `payrollAuditService`.
* **Database Impact:** Creates 1 row in `payroll_runs`.
* **State Changes:** Run enters `draft` status.
* **Response Structure (Success 201):**
  ```json
  {
    "id": "uuid",
    "period_month": "2026-09",
    "status": "draft",
    "settings_snapshot": { "lop_basis": "calendar_days" }
  }
  ```
* **Failure Scenarios:** `409 DUPLICATE_RUN` if a run already exists for this month.
* **Idempotency:** No.

### API 03: List Payroll Runs
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs`
* **Purpose:** Provides a paginated history of all payroll runs.
* **Business Problem Solved:** HR needs a dashboard to view historical runs (approved/paid) and active work-in-progress runs (draft/calculated).
* **Who / Roles Allowed:** `hr` only.
* **Request Parameters:** `status`, `period_month`, `run_type`, `page`, `limit`.
* **Response Structure (Success):** Array of run headers and total count.

### API 04: Get Payroll Run Header
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id`
* **Purpose:** Fetches the overarching state of a specific run (status, totals, employee counts) to render the run overview page.
* **Database Impact:** Simple lookup on `payroll_runs` by ID and org.
* **Response Structure:** Run header with aggregated totals.

### API 05: Calculate Run
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/calculate`
* **Purpose:** The core engine trigger. Evaluates attendance, applies proration and LOP, resolves components, and persists itemized payslips.
* **Business Problem Solved:** Automates complex payroll mathematics accurately. It isolates the calculation step from approval, allowing HR to iteratively correct data (e.g., missing structures) and recalculate until perfect.
* **Why This API Exists:** It executes the heavy lifting of the payroll lifecycle asynchronously (via batching) yet gives synchronous feedback.
* **Who / Roles Allowed:** `hr` only.
* **When Used / Real-World Situation:** HR clicks "Calculate" on a draft run, or "Recalculate" after fixing an underlying data issue.
* **Request Structure:** Empty body. URL param `id`.
* **Validation Rules:** Run must be in `draft`, `calculated`, or a stale `calculating` state. Cannot be `approved`.
* **Backend Processing Flow:** 
  1. **Claims the run** via advisory lock; sets status to `calculating`.
  2. **Aggregates** attendance, leave, and structures in cohorts of 200 users to bound memory limits.
  3. **Computes** the pure math (`computePayrollItem`) independently for each employee.
  4. **UPSERTs** `payroll_run_items` using a stable UUID.
  5. **Replaces** `payroll_run_item_components` wholesale.
  6. **Prunes** users who left the population.
  7. **Finalizes** header totals and sets status to `calculated`.
* **Database Impact:** Massive UPSERT across `payroll_run_items` and `payroll_run_item_components`. Updates `payroll_runs` header. Audit trails the calculation event.
* **State Changes:** `draft` → `calculating` → `calculated`.
* **Response Structure (Success 200):**
  ```json
  {
    "id": "uuid",
    "status": "calculated",
    "total_gross": "12500000.00",
    "total_net": "11200000.00"
  }
  ```
* **Failure Scenarios:** `409 RUN_CALCULATION_IN_PROGRESS` if already calculating. `409 RUN_IMMUTABLE` if approved.
* **Edge Cases:** If the node crashes mid-calculation, a 30-minute stale-claim recovery allows a re-issued request to reclaim the run.
* **Idempotency:** Safe to call multiple times; cleanly overwrites previous `draft` calculations without mutating historical UUIDs.

### API 06: Get Run Preview
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/preview`
* **Purpose:** Gives HR macro-level aggregates (department-wise cost breakdown) and exception flags (errors/warnings) required to make an approval decision.
* **Business Problem Solved:** HR needs a high-level summary to verify totals against budget expectations before clicking the irreversible "Approve" button.
* **Backend Flow:** Fetches lean figures (avoiding heavy JSONB snapshots) to group and sum by department.
* **Response Structure:** `{ department_breakdown, error_items, excluded_items, warnings }`.

### API 07: List Run Items
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/items`
* **Purpose:** Drives the datatable showing all employees processed in the run.
* **Request Parameters:** `status`, `departmentId`, `userId`, pagination.
* **Response Structure:** Paginated list of `payroll_run_items` (summary level).

### API 08: Get Run Item Details
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/items/:itemId`
* **Purpose:** Deep dive into a single employee's calculation.
* **Business Problem Solved:** Crucial for auditing discrepancies, answering "Why is John's net pay exactly ₹43,200? How was LOP applied?".
* **Response Structure:** Includes the item, the frozen `structure_snapshot`, the `attendance_snapshot` (day ledger showing exactly which days were paid vs LOP), and granular `components` lines.

### API 09: Exclude Item
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/items/:itemId/exclude`
* **Purpose:** Temporarily holds pay for a specific employee without delaying the entire org's payroll.
* **Business Problem Solved:** If an employee has a severe dispute or a blocking error (e.g., missing bank data) that cannot be fixed in time for payout, HR must exclude them so the rest of the company gets paid.
* **Request Structure:**
  ```json
  { "exclusion_reason": "Disciplinary action hold" }
  ```
* **Validation Rules:** Requires an `exclusion_reason`. Fails with `409 RUN_CALCULATION_IN_PROGRESS` if actively calculating.
* **Database Impact:** Sets item status to `excluded`. Sets `requires_recalculation: true` on the run header.
* **State Changes:** Item becomes `excluded`. Run header becomes stale.
* **Idempotency:** Yes.

### API 10: Include Item
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/items/:itemId/include`
* **Purpose:** Undoes an exclusion. The item returns to `pending` and the run requires a recalculation to recompute the math.

### API 11: Override Item Period
* **HTTP Method:** `PATCH`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/items/:itemId/period`
* **Purpose:** Solves the mid-month leaver problem without global exit dates. HR explicitly sets the `period_end` to narrow the payable window.
* **Business Problem Solved:** When an employee absconds or is terminated mid-month, and no formal exit date exists in the HR module, payroll must still correctly prorate their final salary.
* **Request Structure:**
  ```json
  { 
    "period_end": "2026-09-15",
    "period_override_reason": "Mid-month termination"
  }
  ```
* **Validation Rules:** Requires a `period_override_reason`. Dates must be within the run's calendar month.
* **Backend Flow:** Sets the item's override and flips `requires_recalculation: true`. The next calculation reads this override and applies strict proration.

### API 12: Approve Run
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/approve`
* **Purpose:** The point of no return. Freezes the math, generates payslips, and creates an attendance lock.
* **Business Problem Solved:** Protects the integrity of the payroll data. Once approved, no attendance changes can retroactively invalidate the math that was agreed upon.
* **Validation Rules:** Refuses approval (`409 RUN_HAS_ERRORS`) if any item is in `error` status. Refuses (`409 RUN_STALE`) if `requires_recalculation` is true.
* **Database Impact:** Changes run status to `approved`. Critically, it **creates an attendance lock** via `lock.service.js`.
* **State Changes:** `calculated` → `approved`.
* **Downstream Effect:** Payslips instantly become visible to managers and employees via the `/me/payslips` routes.

### API 13: Cancel Run
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/cancel`
* **Purpose:** Aborts a finalized run if a massive error is discovered pre-disbursement.
* **Validation:** Only allowed if the run is `approved` (NOT `paid`).
* **Database Impact:** Sets status to `cancelled`. Destroys the attendance lock, freeing the period for a fresh run.

### API 14: Pay Run
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/pay`
* **Purpose:** Terminal workflow step acknowledging that money has actually left the org's bank account.
* **Validation:** Irreversible. Status becomes `paid`.

---

## 2. Manager APIs — `/api/v1/payroll/manager`
*Auth stack:* `authenticate` → `authorize(['manager', 'hr'])` → `requireFeature('payroll.access')`

> **BOLA (Broken Object Level Authorization) Note:** EVERY manager API resolves the hierarchy scope before querying existence. Accessing a non-report yields a `403 FORBIDDEN`, never a `404`, preventing employee enumeration.

### API 15: Get Team Run Summary
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/runs/:runId/team-summary`
* **Purpose:** Gives a manager a high-level view of their department's cost for a finalized run.
* **Visibility Rule:** Always returns aggregates (headcount, total gross, net, employer cost) even if detailed compensation visibility is toggled off by HR.
* **Response:** `{ headcount: 12, total_gross: 450000.00, total_lop_days: 2.5 }`.

### API 16: Get Team Run Items
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/runs/:runId/team-items`
* **Purpose:** Lists the payslips for direct reports in a specific run.
* **Visibility Rule:** If `manager_can_view_team_compensation` is false, the payload strips all monetary figures, leaving only headcount and averages, protecting sensitive PII.

### API 17: List Report's Payslips
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/employees/:userId/payslips`
* **Purpose:** Gives a manager historical access to a specific report's payslips.
* **Visibility Rule:** Strictly scopes to `approved` and `paid` runs. Drafts are completely hidden so managers don't see work-in-progress numbers that might change.

### API 18: Get Report's Payslip
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/employees/:userId/payslips/:runId`
* **Purpose:** Detailed JSON payslip for a direct report.
* **Visibility Rule:** Blocked entirely (`403`) if the manager compensation visibility toggle is OFF.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`
*Auth stack:* `authenticate` → `requireFeature('payroll.access')`

### API 19: List My Payslips
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/payslips`
* **Purpose:** Self-service portal for employees to view their historical compensation.
* **Business Problem Solved:** Reduces HR overhead by allowing employees to autonomously access their financial records.
* **Visibility Rule:** Only returns items where the parent run is `approved` or `paid`. An employee never sees a `calculating` draft, preventing premature expectations.
* **Response Structure:**
  ```json
  [
    {
      "period_month": "2026-09",
      "gross_earnings": "50000.00",
      "net_pay": "48000.00",
      "payable_days": "29.0",
      "lop_days": "1.0",
      "statutory_status": "not_applied"
    }
  ]
  ```

### API 20: Get My Payslip
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/payslips/:runId`
* **Purpose:** The detailed, immutable payslip.
* **Business Problem Solved:** Employees need to see exactly how their pay was derived, including LOP deductions and component breakdowns, to trust the system.
* **Response Structure:** Contains the day ledger (present days vs LOP), component lines (earnings vs deductions), and the structure version applied. Explains exactly how the net pay was derived mathematically.

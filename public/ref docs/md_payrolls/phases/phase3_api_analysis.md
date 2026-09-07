# Phase 3: Variable Pay (Bonuses, Adjustments, Loans & Advances) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint analysis of the **38 APIs (#57–#94)** implemented in Phase 3 of the Payroll module.

> [!IMPORTANT]
> **Architectural Premise:** Payroll is exclusively a **tenant-plane** module. Platform roles (`admin`, `super-admin`) are strictly blocked. Every route demands an organizational `orgId` and the `payroll.access` feature flag. Variable pay is applied *on top of* the base salary structure and processed during payroll execution with strict commit-at-approval / reverse-at-cancel guarantees.

---

## 1. HR Administration APIs — `/api/v1/payroll/hr`
*Auth stack:* `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`

### API 57: Create Payroll Adjustment
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments`
* **Purpose:** Creates a one-off variable pay line (earning or deduction) for a single employee.
* **Business Problem Solved:** HR needs to apply ad-hoc additions (special performance bonus, spot award, relocation stipend) or deductions (unauthorized equipment loss, advance recovery) to an employee's upcoming salary.
* **Why This API Exists:** Provides direct single-employee adjustment entry with optional Maker-Checker review.
* **Who / Roles Allowed:** `hr` only.
* **When Used / Real-World Situation:** When HR is instructed to add a ₹10,000 spot award to John's October salary.
* **Request Structure & Parameters:**
  ```json
  {
    "user_id": "uuid-v4",
    "period_month": "2026-10",
    "adjustment_type": "earning",
    "category": "bonus",
    "component_id": "optional-catalog-component-uuid",
    "component_name": "Spot Award",
    "amount": 10000,
    "reason": "Outstanding Q3 project delivery",
    "is_taxable": true,
    "pf_applicable": false,
    "esi_applicable": false
  }
  ```
* **Validation Rules:** `amount > 0` (no negative money). `category` must be one of `bonus`, `incentive`, `ad_hoc_earning`, `ad_hoc_deduction`, `recovery` (`arrear` is rejected in Phase 3). `period_month` format `YYYY-MM`.
* **Backend Processing Flow:** 
  1. Resolves `period_month` collision (checks if target run is closed; marks active draft run as `requires_recalculation: true`).
  2. If `payroll_require_separate_checker` is enabled in settings, status is set to `pending`; otherwise, directly `approved`.
  3. Inserts into `payroll_adjustments`.
  4. Audits the action in `payroll_audit_logs`.
* **Database Impact:** Creates 1 row in `payroll_adjustments`.
* **State Changes:** Enters `approved` (or `pending`).
* **Response Structure (Success 201):** Returns full adjustment object with generated UUID.
* **Failure Scenarios:** `422 PERIOD_CLOSED_FOR_ADJUSTMENT` if targeting an approved/paid run. `409 RUN_CALCULATION_IN_PROGRESS` if target run is calculating.

---

### API 58: List Payroll Adjustments
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/adjustments`
* **Purpose:** Paginated list of all organization adjustments.
* **Query Parameters:** `period_month`, `user_id`, `status`, `category`, `adjustment_type`, `batch_id`, `page`, `limit`.
* **Response Structure:** Array of adjustments with pagination metadata.

---

### API 59: Get Adjustment Details
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/:id`
* **Purpose:** Fetches full metadata of a single adjustment, including creation source, batch ID, and approval history.
* **Failure Scenarios:** `404 ADJUSTMENT_NOT_FOUND`.

---

### API 60: Approve Adjustment (Checker)
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/:id/approve`
* **Purpose:** Approves a pending adjustment proposal.
* **Business Problem Solved:** Enforces Maker-Checker separation of duties on financial disbursements.
* **Validation Rules:** Target adjustment must be `status === 'pending'`. The approver cannot be the same person who proposed it (`403 SEPARATE_CHECKER_REQUIRED`).
* **Backend Processing Flow:** Updates status to `approved`, sets `approved_by` and `actioned_at`. Flags active target run as `requires_recalculation: true`.

---

### API 61: Reject Adjustment (Checker)
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/:id/reject`
* **Request Structure:** `{ "rejection_reason": "Insufficient justification provided" }` (mandatory).
* **State Changes:** Sets status to `rejected`.

---

### API 62: Cancel Adjustment
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/:id/cancel`
* **Purpose:** Cancels an unapplied adjustment.
* **Validation Rules:** Can only cancel `pending` or `approved`-and-unapplied adjustments. If `applied_run_id` is already set on an approved run, returns `409 ADJUSTMENT_ALREADY_APPLIED` (must use Phase 7 arrears).

---

### API 63: Preview Bulk Adjustments CSV
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/bulk/preview`
* **Purpose:** Pre-flight dry-run parser and validator for bulk variable pay uploads.
* **Business Problem Solved:** Prevents bad CSV data (invalid employee codes, negative amounts, closed periods) from corrupting the ledger.
* **Request Structure:**
  ```json
  {
    "period_month": "2026-10",
    "csv_content": "employee_code,adjustment_type,category,component_name,amount,reason\nEMP-001,earning,bonus,Festive Bonus,5000,Diwali\nEMP-002,deduction,recovery,Laptop Recovery,2000,Damaged screen"
  }
  ```
* **Database Impact:** **Zero persistence.** Reads user profiles and catalog entries.
* **Response Structure (Success):**
  ```json
  {
    "total_rows": 2,
    "valid_rows": 2,
    "error_rows": 0,
    "total_earning_amount": 5000,
    "total_deduction_amount": 2000,
    "rows": [
      { "line": 1, "employee_code": "EMP-001", "user_id": "...", "status": "ok", "amount": 5000 },
      { "line": 2, "employee_code": "EMP-002", "user_id": "...", "status": "ok", "amount": 2000 }
    ]
  }
  ```

---

### API 64: Commit Bulk Adjustments Batch
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/bulk`
* **Purpose:** Atomically commits a validated bulk adjustments CSV.
* **Backend Processing Flow:** Generates a unique `batch_id` UUID. In a single transaction, inserts up to 5,000 rows into `payroll_adjustments` with the shared `batch_id`. Flags the target payroll run as `requires_recalculation: true`.
* **Idempotency & Safety:** All-or-nothing transaction.

---

### API 65: Cancel Bulk Adjustments Batch
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/adjustments/batches/:batchId/cancel`
* **Purpose:** Cancels all unapplied adjustment rows belonging to a bulk batch.
* **Response Structure:** Returns count of cancelled rows and count of skipped rows (already locked in approved runs).

---

### API 66: Create Bonus Rule
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules`
* **Purpose:** Declaratively defines an automated bonus distribution policy for an eligible population.
* **Request Structure:**
  ```json
  {
    "name": "Annual Performance Bonus 2026",
    "period_month": "2026-12",
    "bonus_type": "performance",
    "calculation_mode": "percent_of_basic",
    "value": 15.0,
    "eligibility_source": "department",
    "eligibility_criteria": {
      "department_ids": ["dept-uuid-1"],
      "min_tenure_days": 180,
      "exclude_notice_period": true
    },
    "reason": "Q4 Performance Allocation"
  }
  ```
* **Validation Rules:** `calculation_mode` in `flat`, `percent_of_basic`, `percent_of_gross`, `percent_of_ctc`. `eligibility_source` in `all_employees`, `department`, `manual`, `csv_upload`.

---

### API 67: List Bonus Rules
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules`
* **Query Parameters:** `period_month`, `status`, `bonus_type`, `page`, `limit`.

---

### API 68: Get Bonus Rule Details
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id`

---

### API 69: Update Bonus Rule
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id`
* **Validation Rules:** Editable only while in `pending` status. Approved rules must be cancelled and recreated.

---

### API 70: Approve Bonus Rule
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id/approve`
* **Purpose:** Approves a bonus rule, making it eligible for application.

---

### API 71: Reject Bonus Rule
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id/reject`
* **Request Structure:** `{ "rejection_reason": "Budget cap exceeded" }`

---

### API 72: Preview Bonus Rule Impact
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id/preview-impact`
* **Purpose:** Resolves eligible employees, computes exact bonus amounts, and simulates net pay impact without writing any database records.
* **Business Problem Solved:** Allows HR and CFO to view total bonus liability before applying it.
* **Database Impact:** Read-only evaluation.
* **Response Structure:**
  ```json
  {
    "rule_id": "uuid",
    "eligible_count": 45,
    "total_bonus_liability": 675000,
    "employees": [
      { "user_id": "...", "name": "Jane", "basic_salary": 50000, "bonus_amount": 7500 }
    ]
  }
  ```

---

### API 73: Apply Bonus Rule
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id/apply`
* **Purpose:** Materializes the bonus rule by generating individual `payroll_adjustments` rows.
* **Backend Processing Flow:**
  1. Validates rule is `approved` and `applied_at IS NULL`.
  2. Evaluates eligible employees and computes amounts.
  3. Generates a shared `batch_id` and bulk-inserts all `payroll_adjustments` rows.
  4. Updates bonus rule: `applied_at = NOW()`, `applied_batch_id = batch_id`, `applied_count = N`.
  5. Flags active target run as `requires_recalculation: true`.
* **State Changes:** Materializes adjustments; locks rule against re-application.

---

### API 74: Cancel Bonus Rule
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/bonus-rules/:id/cancel`
* **Validation Rules:** Allowed only if the rule has not been applied yet (`applied_at IS NULL`).

---

### API 75: Grant Employee Loan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/loans`
* **Purpose:** Grants a company loan or salary advance to an employee.
* **Request Structure:**
  ```json
  {
    "loan_type": "general",
    "principal_amount": 60000,
    "annual_interest_rate": 0,
    "interest_type": "flat",
    "tenure_months": 6,
    "start_period_month": "2026-10",
    "disbursement_date": "2026-09-25",
    "reason": "Personal medical requirement"
  }
  ```
* **Validation Rules:** `principal_amount > 0`, `tenure_months >= 1`, `start_period_month` format `YYYY-MM`.
* **Backend Processing Flow:** Computes EMI schedule using pure `loan_schedule.utils`. If separate-checker is OFF, generates `loan_installments` rows and marks status `active`; otherwise marks `pending`.

---

### API 76: List Loans
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/loans`
* **Query Parameters:** `user_id`, `status`, `loan_type`, `page`, `limit`.

---

### API 77: Get Loan Details
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/loans/:id`
* **Response Structure:** Loan header, total principal, interest, recovered amount, outstanding balance.

---

### API 78: Get Loan Installments Schedule
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/loans/:id/installments`
* **Purpose:** Lists all generated monthly installments (EMI, principal component, interest component, status `scheduled` | `deducted` | `skipped` | `cancelled`, and applied payroll run ID).

---

### API 79: Approve Loan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/loans/:id/approve`
* **Purpose:** Approves a pending loan proposal and generates its installment schedule.
* **State Changes:** Sets loan status to `active` and creates `scheduled` installment rows.

---

### API 80: Reject Loan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/loans/:id/reject`
* **Request Structure:** `{ "rejection_reason": "Not eligible as per policy" }`

---

### API 81: Cancel Loan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/loans/:id/cancel`
* **Validation Rules:** Allowed only if in `pending` status or `active` with **zero** deducted installments.

---

### API 82: Foreclose Loan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/loans/:id/foreclose`
* **Purpose:** Early closure of an active loan.
* **Request Structure:**
  ```json
  {
    "settlement_mode": "recover_via_payroll",
    "recovery_period_month": "2026-11",
    "reason": "Employee early repayment request"
  }
  ```
* **Backend Processing Flow:**
  1. Computes remaining outstanding principal across scheduled installments.
  2. Cancels remaining scheduled installments (interest on cancelled installments is forgiven).
  3. If `settlement_mode === 'recover_via_payroll'`, creates a single `payroll_adjustments` deduction row for the outstanding principal in the specified `recovery_period_month`.
  4. Marks loan status as `closed`.

---

## 2. Manager APIs — `/api/v1/payroll/manager`
*Auth stack:* `authenticate` → `authorize(['manager', 'hr'])` → `requireFeature('payroll.access')`  
*Every handler verifies hierarchical BOLA scope before existence lookup.*

### API 83: Propose Team Adjustment
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/manager/employees/:userId/adjustments/propose`
* **Purpose:** Manager proposes a performance incentive or spot bonus for a direct report.
* **State Changes:** Lands `pending` for HR review. (If `manager_direct_compensation_authority` is ON and separate-checker is OFF, directly lands `approved`).

---

### API 84: List Team Adjustments
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/adjustments`
* **Purpose:** Lists adjustments for direct reports.
* **Security & BOLA:** Gated by `manager_can_view_team_compensation`. If toggle is false, financial figures are masked.

---

### API 85: Cancel Own Adjustment Proposal
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/manager/adjustments/:id/cancel`
* **Validation Rules:** Manager can only cancel their **own** pending proposals.

---

### API 86: Propose Team Bonus Rule
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/manager/bonus-rules/propose`
* **Validation Rules:** Restricted strictly to `eligibility_source: 'manual'` targeting only direct reports.

---

### API 87: List Team Bonus Proposals
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/bonus-rules`
* **Purpose:** Views status of bonus proposals submitted by the manager.

---

### API 88: Recommend Team Loan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/manager/employees/:userId/loans/recommend`
* **Purpose:** Manager recommends a company loan or emergency salary advance for a direct report.
* **State Changes:** Lands in `pending` status awaiting HR approval.

---

### API 89: List Team Loans
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/loans`
* **Purpose:** Lists active and historical loans for direct reports (scoped by BOLA).

---

### API 90: Get Team Loan Details
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/loans/:id`
* **Purpose:** Views loan schedule and repayment status for a subordinate.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`
*Auth stack:* `authenticate` → `requireFeature('payroll.access')`  
*Employees only see approved/finalized records; pending and rejected proposals are strictly hidden.*

### API 91: Get My Bonuses
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/bonuses`
* **Purpose:** Returns the employee's approved bonuses and incentives.
* **Response Structure:** Split into `earned` (processed in an approved/paid run) and `upcoming` (scheduled for future runs).

---

### API 92: Get My Adjustments
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/adjustments`
* **Purpose:** Lists all approved additions and deductions applicable to the employee's payroll.

---

### API 93: Get My Loans
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/loans`
* **Purpose:** Lists the employee's active and closed loans, including outstanding principal and recovered amounts.

---

### API 94: Get My Loan Installment Schedule
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/loans/:id/installments`
* **Purpose:** Displays month-by-month EMI schedule, deducted status, and next due EMI for the employee's active loan.

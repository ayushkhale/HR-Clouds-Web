# Phase 3: Variable Pay — Business Walkthrough & Scenarios

This document explains **why** Phase 3 exists and how the entire variable pay functionality solves real HR, financial, and management business problems. It maps technical APIs to realistic business scenarios, demonstrating how HR administrators, managers, and employees interact with adjustments, bonuses, loans, advances, and negative net pay recoveries.

---

## Scenario 1: The Golden Path — Company-Wide Annual Performance Bonus

**Business Problem:** The leadership team approves a 10% performance bonus on basic pay for all active engineers in the Product & Engineering department with at least 6 months of service, excluding anyone currently serving notice period. HR needs to simulate total financial liability, obtain CFO sign-off, and inject the bonus into the December payroll without manually calculating 100+ payslips.

### Step 1: Defining the Bonus Rule (HR Action)
HR creates the declarative bonus rule.
* **API Interaction:** `POST /api/v1/payroll/hr/bonus-rules` (**API 66**).
* **Payload:** `{ name: "Q4 Engineering Bonus", period_month: "2026-12", bonus_type: "performance", calculation_mode: "percent_of_basic", value: 10.0, eligibility_source: "department", eligibility_criteria: { department_ids: ["eng-dept-id"], min_tenure_days: 180, exclude_notice_period: true } }`.
* **DB Impact:** Creates a row in `bonus_rules` in `pending` status.

### Step 2: Impact Simulation & CFO Review (Pre-flight Check)
Before committing the money, HR previews the exact payout and headcount impact.
* **API Interaction:** `POST /api/v1/payroll/hr/bonus-rules/:id/preview-impact` (**API 72**).
* **Backend Processing:** Pure evaluator resolves eligible employees against department rosters, tenure criteria, and notice period flags. Computes `10% of basic` for each person. **Writes zero database records.**
* **Result:** Returns `{ eligible_count: 85, total_bonus_liability: 850000, employees: [...] }`.

### Step 3: Approval & Materialisation (HR Action)
With budget approved, HR approves the rule and applies it to December.
* **API Interaction:** `POST /api/v1/payroll/hr/bonus-rules/:id/approve` (**API 70**) followed by `POST /api/v1/payroll/hr/bonus-rules/:id/apply` (**API 73**).
* **Backend Processing & DB Impact:** 
  1. Generates a shared `batch_id` UUID.
  2. Materializes 85 individual rows into `payroll_adjustments` with `category: 'bonus'`, `amount = computed_bonus`, and `period_month = '2026-12'`.
  3. Updates bonus rule with `applied_at: NOW()` and `applied_count: 85`.
  4. Flags the December payroll run as `requires_recalculation: true`.
* **Execution:** When the December payroll run calculates (**API 41**), the cohort-batched variable pay aggregator pulls these 85 adjustments into Step 6b, accurately adding ₹850,000 to gross pay and payslips.

---

## Scenario 2: Maker-Checker Protection on High-Value Adjustments

**Business Problem:** To prevent payroll fraud, company policy dictates that any ad-hoc compensation adjustment added by an HR executive must be verified and approved by the HR Director before it reaches payroll.

* **User Action:** HR Executive adds a ₹50,000 relocation reimbursement bonus for a new joiner using `POST /api/v1/payroll/hr/adjustments` (**API 57**).
* **Backend Processing:** The backend reads `payroll_settings` and sees `payroll_require_separate_checker: true`.
* **DB Impact:** The adjustment is saved with `status: 'pending'`, `proposed_by = hr_executive_id`.
* **Checker Action:** The HR Director opens the pending queue (**API 58**) and reviews the request details (**API 59**).
* **Approval API Interaction:** HR Director approves using `POST /api/v1/payroll/hr/adjustments/:id/approve` (**API 60**).
* **Security Guard:** If the HR Executive tries to approve their own proposal, the backend stops the transaction with `403 SEPARATE_CHECKER_REQUIRED`. Once approved by the Director, the adjustment enters `approved` and is pulled into the next run calculation.

---

## Scenario 3: Bulk Discretionary Festive Bonus via CSV

**Business Problem:** Finance provides an Excel/CSV sheet with custom festival bonus amounts for 500 factory workers. Typing 500 adjustments one by one would take days.

### 1. Pre-flight Validation
* **API Interaction:** `POST /api/v1/payroll/hr/adjustments/bulk/preview` (**API 63**).
* **Processing:** The pure CSV parser validates syntax, checks employee codes against active tenant users, validates non-negative numbers, and verifies the target month is not locked.
* **Result:** UI shows a summary: "500 Rows. 498 Valid, 2 Errors (Invalid Employee Code: EMP-999)."

### 2. Atomic Commit
* **User Action:** HR fixes the 2 erroneous codes in the CSV and clicks "Import & Commit".
* **API Interaction:** `POST /api/v1/payroll/hr/adjustments/bulk` (**API 64**).
* **Backend Processing:** Wrapped in a single database transaction, the backend inserts all 500 rows into `payroll_adjustments` linked by a shared `batch_id`. If even one row fails database constraints, the entire transaction rolls back cleanly.

---

## Scenario 4: Employee Loan Grant, EMI Amortisation & Foreclosure

**Business Problem:** An employee requests a company loan of ₹60,000 for emergency medical expenses, repayable over 6 months with 0% interest. Later, after 2 months, the employee receives an external windfall and requests to foreclose the remaining balance early.

### Step 1: Granting the Loan (HR Action)
* **API Interaction:** `POST /api/v1/payroll/hr/employees/:userId/loans` (**API 75**).
* **Payload:** `{ principal_amount: 60000, tenure_months: 6, annual_interest_rate: 0, start_period_month: '2026-10', reason: 'Medical emergency' }`.
* **DB Impact:** Generates the loan header and creates 6 `scheduled` rows in `loan_installments` (October 2026 to March 2027), each with `emi_amount: 10000`.

### Step 2: Payroll Deduction (Automated Engine Action)
* In October and November, payroll calculates and pays.
* The variable pay aggregator pulls the October and November installments. The engine deducts ₹10,000 in Step 8b of the deduction waterfall.
* When the October and November runs are approved (**API 48**), the installments transition from `scheduled` to `deducted`.

### Step 3: Early Foreclosure (HR Action)
In December, the employee requests to close the remaining ₹40,000 loan balance in one go via December payroll.
* **API Interaction:** `POST /api/v1/payroll/hr/loans/:id/foreclose` (**API 82**).
* **Payload:** `{ settlement_mode: 'recover_via_payroll', recovery_period_month: '2026-12', reason: 'Employee requested early payoff' }`.
* **Backend Processing & DB Impact:**
  1. The remaining 4 scheduled installments (Dec, Jan, Feb, Mar) are marked `cancelled`.
  2. The loan status is updated to `closed`.
  3. A single `payroll_adjustments` deduction row for ₹40,000 is automatically generated for December 2026 (`category: 'recovery'`).
* **Result:** December payroll deducts ₹40,000, fully clearing the loan.

---

## Scenario 5: Negative Net Pay & Shortfall Carry-Forward

**Business Problem:** An employee's gross pay this month is ₹30,000, but due to a ₹35,000 asset damage recovery deduction, the raw calculated net pay would be −₹5,000. Under labor law, an employer cannot issue a negative payslip or demand the employee pay cash on payday.

* **Engine Evaluation:** The calculation engine evaluates Step 9. Raw net is −₹5,000.
* **Policy Check:** `payroll_settings.negative_net_handling` is set to `clamp_and_carry_forward`.
* **Waterfall & Invariant Preservation:**
  1. To maintain the strict balance invariant (`Gross − Deductions + Rounding == Net`), the engine emits a balancing adjustment earning line: `component_code: 'NET_PAY_SHORTFALL_CARRIED'`, `amount: 5000`.
  2. Net pay is clamped to **₹0.00**.
  3. The payslip records `carry_forward_out: 5000` and emits a warning `NEGATIVE_NET_CLAMPED`.
* **Next Month's Recovery:** In the next month (when the employee earns ₹30,000), the variable pay aggregator reads the ₹5,000 carry-forward balance. The engine automatically injects a `CARRY_FORWARD_RECOVERY` deduction of ₹5,000 (Step 8d), resulting in net pay of ₹25,000. The debt is recovered automatically without manual tracking.

---

## Scenario 6: Loan EMI Insufficiency & Skipped Installment (EC-15)

**Business Problem:** An employee took excessive unpaid leave (LOP), reducing their monthly earnings to ₹4,000. Their scheduled loan EMI is ₹10,000. Deducting the full EMI would result in negative net pay.

* **Waterfall Priority (Step 8b):** The deduction waterfall prioritizes fixed statutory and core deductions before loan repayments.
* **Insufficiency Handling:** The engine detects that remaining net pay after earnings and adjustments is insufficient to cover the ₹10,000 EMI.
* **Engine Action:** Instead of breaking the run, the engine **skips the EMI** for this month.
* **DB & Ledger Impact:**
  1. The installment status remains `scheduled` and is not stamped as deducted.
  2. The engine emits a warning `LOAN_EMI_SKIPPED` on the payslip.
  3. The employee receives their ₹4,000 earnings.
  4. In the following month, the aggregator will re-evaluate the pending installment.

---

## Scenario 7: Manager Proposal & BOLA Visibility Gating

**Business Problem:** A Team Lead wants to recommend a ₹15,000 spot award for a high-performing developer, but the company does not allow managers to view other departments' variable pay allocations.

* **Manager Action:** Team Lead submits the proposal via `POST /api/v1/payroll/manager/employees/:userId/adjustments/propose` (**API 83**).
* **BOLA Verification:** The backend verifies that `:userId` reports directly to the manager. If a manager attempts to propose an adjustment for a developer on another team, the backend blocks it with `403 FORBIDDEN` before querying the database.
* **Review Queue:** The proposal lands in HR's pending queue (**API 58**).
* **Visibility Control:** When the manager lists their team adjustments (**API 84**), the backend checks `manager_can_view_team_compensation`. If false, amounts are masked; if true, amounts are displayed.
* **Employee View:** The developer cannot see the proposal until HR formally approves it (**API 91** / **API 92**), preventing premature compensation expectations.

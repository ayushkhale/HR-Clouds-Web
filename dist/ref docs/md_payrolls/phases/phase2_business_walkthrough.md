# Phase 2: Payroll Engine — Business Walkthrough & Scenarios

This document explains **why** Phase 2 exists and how the entire functionality solves real HR and payroll business problems. It maps the technical APIs to realistic business scenarios, demonstrating how HR administrators, managers, and employees interact with the system during the payroll lifecycle.

---

## Scenario 1: The Golden Path (Normal Payroll Workflow)

**Business Problem:** HR needs to reliably calculate and disburse monthly salaries for the entire organization, ensuring all prorations and LOPs are mathematically accurate and frozen in time before money leaves the bank.

**1. User Action (Pre-flight Check):**
At the end of the month (e.g., September 26th), the HR administrator opens the "Run Payroll" dashboard.
**API Interaction:** The UI calls **API 01 (`GET /runs/eligibility`)**.
**Backend Processing & DB Impact:** The backend dry-runs the employee population against their salary structures and the month's attendance. It does not write to the DB.
**Final Result:** The UI shows a green checklist: "120 Employees. All have structures. 0 missing bank accounts. Ready to process."

**2. User Action (Initiate Draft):**
HR clicks "Start Run".
**API Interaction:** UI calls **API 02 (`POST /runs`)**.
**Backend Processing & Validation:** The backend validates that no duplicate run exists. It takes a transactional lock and captures the organization's current payroll settings (like rounding rules).
**DB Impact:** Creates the `payroll_runs` header in a `draft` state.

**3. User Action (Trigger Engine):**
HR clicks "Calculate".
**API Interaction:** UI calls **API 05 (`POST /runs/:id/calculate`)**.
**Backend Processing:** The engine slices the 120 employees into cohorts. It fetches their attendance day ledgers. For each employee, it computes the pure math (`computePayrollItem`), prorating based on join dates and deducting for LOP.
**DB Impact:** UPSERTs 120 `payroll_run_items` and ~1000 `payroll_run_item_components` (Earnings, Deductions). The run status becomes `calculated`.
**Final Result:** The UI updates to show the total liability (e.g., Total Net Pay: ₹4,500,000).

**4. User Action (Final Review & Lock):**
HR reviews the department-wise breakdown (**API 06**) and clicks "Approve & Lock".
**API Interaction:** UI calls **API 12 (`POST /runs/:id/approve`)**.
**Validation:** The backend verifies that no items are in an `error` state. 
**DB Impact:** The run becomes `approved`. Crucially, the backend creates an **attendance lock** in the Leave/Attendance module for September. No one can ever retroactively add a leave or change a timesheet for September.
**Final Result:** Payslips are instantly generated and become visible to employees.

**5. User Action (Disbursement):**
HR uploads the bank file to the corporate bank. Once the transfer clears, HR clicks "Mark as Paid".
**API Interaction:** UI calls **API 14 (`POST /runs/:id/pay`)**.
**DB Impact:** Run status becomes `paid`. The lifecycle is complete.

---

## Scenario 2: Handling Exception Data (Missing Structure)

**Business Problem:** The system must not crash or halt the entire organization's payroll just because one newly onboarded employee is missing a salary structure.

**User Action:** HR clicks "Calculate" on the draft run.
**Backend Processing:** While computing the 120 employees, the engine discovers "Jane Doe" has no salary structure assigned.
**Validation & DB Impact:** Instead of failing the transaction, the `computePayrollItem` catches the exception. Jane's `payroll_run_item` is saved with `status: 'error'`, `error_code: 'NO_SALARY_STRUCTURE'`, and all financial figures set to `0`. The other 119 employees are calculated successfully (**API 05**).
**Final Result:** The UI displays a warning banner: "1 Error Item Requires Attention".
**Failure Scenario Prevention:** If HR tries to click "Approve" (**API 12**), the backend blocks it with `409 RUN_HAS_ERRORS`. A payroll run can never be finalized while errors exist. HR must either fix Jane's profile and hit Recalculate (**API 05**) or explicitly exclude her (**API 09**).

---

## Scenario 3: The Exclusion Workflow (Disciplinary Hold)

**Business Problem:** An employee is under disciplinary review, and the finance team mandates their pay be withheld this month. However, the rest of the company must be paid on time.

**User Action:** HR views the Run Items list, selects the employee, and clicks "Exclude from Run".
**API Interaction:** UI calls **API 09 (`POST /runs/:id/items/:itemId/exclude`)**.
**Backend Processing:** The backend requires an `exclusion_reason`. It updates the employee's item to `excluded`. 
**DB Impact:** It flags the overarching run header as `requires_recalculation: true` because the total org cost has now changed.
**Final Result:** The employee is visually struck out in the UI. 
**Validation:** If HR tries to approve the run right now, **API 12** will reject it (`409 RUN_STALE`) because the header totals no longer match the items. HR must hit "Recalculate" (**API 05**) which will fast-track skip the excluded employee, re-sum the header, and allow approval.

---

## Scenario 4: The Mid-Month Leaver (Period Override)

**Business Problem:** John absconds on September 15th. The formal separation workflow in the core HR module hasn't been completed yet (so he doesn't have a global exit date), but payroll must be finalized today and he should only be paid for 15 days.

**User Action:** HR edits John's payslip inside the active payroll run and changes the "Period End Date" to Sept 15.
**API Interaction:** UI calls **API 11 (`PATCH /runs/:id/items/:itemId/period`)**.
**Backend Processing:** The backend records `period_end: '2026-09-15'` specifically on John's run item. 
**DB Impact:** It flips `requires_recalculation: true` on the run header.
**Final Result:** When HR clicks "Recalculate" (**API 05**), the engine reads this local override. Instead of dividing his salary by 30 days, it divides and prorates strictly for the 15-day window, dropping the remaining 15 days. John receives a perfectly prorated final settlement slip.

---

## Scenario 5: Manager Visibility & BOLA Constraints

**Business Problem:** Managers need to see the total cost of their department, but depending on company policy, they may or may not be allowed to see the exact take-home pay of individual direct reports (to prevent PII leakage).

**User Action:** An Engineering Manager opens the "Team Payroll" tab after a run is approved.
**API Interaction:** UI calls **API 16 (`GET /manager/runs/:runId/team-items`)**.
**Backend Processing (BOLA Check):** The backend immediately checks the BOLA hierarchy. It restricts the query to *only* return users where `manager_id` matches the caller.
**Backend Processing (Visibility Toggle):** The backend checks the global org setting `manager_can_view_team_compensation`. 
* If **TRUE**: The API returns the full payslips including `net_pay` and `gross_earnings`.
* If **FALSE**: The backend strips all financial numbers at the network layer. The manager only sees "Count: 15 reports processed" but cannot see what they earned.

---

## Scenario 6: Concurrent Execution Protection

**Business Problem:** Two HR administrators in different offices both open the September Draft Run and click "Calculate" at the exact same second. If both transactions proceed, it will cause a catastrophic race condition, duplicating component rows or corrupting header totals.

**User Action:** Admin A and Admin B click "Calculate" simultaneously.
**API Interaction:** Two concurrent requests hit **API 05 (`POST /runs/:id/calculate`)**.
**Backend Processing:** 
1. Admin A's thread reaches `payroll_run.service.js` first and executes `pg_advisory_xact_lock('payroll:run:ORG1:2026-09')`. 
2. Admin B's thread hits the same line and is forced to wait at the database level.
3. Admin A's thread updates the run status from `draft` to `calculating` and commits the tiny locking transaction.
4. Admin B's thread is released. It re-reads the row, sees `status: 'calculating'`, and instantly throws a `409 RUN_CALCULATION_IN_PROGRESS`.
**Final Result:** Admin A's screen shows a loading spinner as calculation proceeds. Admin B's screen shows a toast error: "A calculation is currently in progress. Please wait." Absolute data integrity is maintained.

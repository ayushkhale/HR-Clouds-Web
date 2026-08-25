# Leave Module: Phase 1, Phase 2 & Phase 3 Completion Report

This report outlines the functionality achieved after completing the first three phases of the Leave Management Module. We have successfully built the **Core Foundation**, the **Policy Assignment & Balance Engine**, and the **Application Workflow & Approvals Engine**, creating a fully functional, highly secure leave management system.

**Evolution of the Leave Module:**
Phase 1 → Rules & Configuration → Phase 2 → Policy Assignment & Balance Ledger → Phase 3 → Leave Application Workflow → Phase 4 → Approvals → Phase 5 → Background Jobs

---

## 1. What We Have Built

### Phase 1: Foundation (The Rules Engine)
We created the master configuration system that allows the organization to define *how* leaves work.
*   **Database Schema:** Created all core tables (`leave_types`, `leave_policy_templates`, `leave_policy_entitlements`, `employee_leave_configs`, `leave_balances`, and `leave_requests`).
*   **Leave Types API:** Logic to create and manage standalone leave types (e.g., Sick Leave, Privilege Leave) along with their behavioral rules.
*   **Policy Templates & Entitlements API:** Logic to group Leave Types into assignable packages and configure their strict rules (Annual Quota, Upfront vs. Monthly Accrual).

### Phase 2: Policy Assignment & Ledger (The Math Engine)
We built the transactional ledger that connects the company's rules (Phase 1) to individual employees, calculating exactly how many days they get.
*   **The Pro-Rata Math Engine:** A bulletproof calculation engine handling fractional leave days, leap years, joining dates, and mid-year reassignments.
*   **Assignment & Overrides APIs:** Allows HR to assign templates or break template rules for specific employees.
*   **Balance Ledger APIs:** APIs to view exact accrued, used, and remaining leaves.

### Phase 3 & 4: Application Workflow & Approvals (The Transaction Engine)
We built the transactional workflow that allows employees to spend their accrued leaves, and for managers/HR to approve or reject them.
*   **Business Day Calculator:** A dynamic engine that evaluates requested dates against Shift Definitions, Weekly Offs, Public Holidays, and Calendar Exceptions. It knows exactly which days should be deducted and which should be skipped.
*   **Sandwich Rule Engine:** If a leave policy enforces the "Sandwich Rule", the API checks adjacent leave requests and forcefully bridges absences over weekends/holidays to prevent policy exploitation.
*   **Phantom Hold Logic & LWP Fallback:** Pending requests calculate against an "effective balance" in memory so balances don't drop below zero prematurely. If a user exceeds their balance, the engine gracefully splits the request into `paid_days` and `unpaid_days` (Leave Without Pay).
*   **Self-Service APIs:** Endpoints for employees to submit (`/request`), cancel (`/cancel`), and view their own history.
*   **Approver APIs:** Endpoints for Managers and HR to view team pending queues, and rigidly approve or reject requests.
*   **Shift-Rotation Temporal Awareness:** For workers on overnight shifts (e.g., 10 PM to 6 AM), taking a full day off intelligently interacts with the Attendance Module to mark both calendar dates as "On Leave" without double-deducting their balance.

---

## 2. What Users Can Do Right Now

### As an HR Admin, I can:
1.  **Configure the Organization:** Define leave types, rules, and assign policies to employees with automatic pro-rata calculations.
2.  **Global Approvals:** Access the global pending queue to forcefully approve or reject leaves for any employee in the company.

### As a Manager, I can:
1.  **View Team To-Do List:** Call the pending queue API to see all incoming leave requests for direct subordinates.
2.  **Make Decisions:** Approve or reject requests. Rejections require a mandatory textual reason.

### As an Employee, I can:
1.  **View My Dashboard:** Instantly see my leave wallet (e.g., "You have 8.5 Privilege Leaves remaining this year").
2.  **Apply for Leave:** Submit a date range. The system will automatically ignore holidays and weekends if my policy allows, and tell me exactly how many days will be deducted.
3.  **Cancel Requests:** Cancel a pending request instantly, or submit a cancellation request for manager approval if the date has already passed.

---

## 3. How the Generated Code Runs (Under the Hood)

The system operates strictly like a financial banking ledger with high security:
*   **Concurrency Locks & Transactions:** Every application and approval runs inside an ACID-compliant Postgres transaction using `LOCK.UPDATE`. If two managers click "Approve" at the same millisecond, the database serializes them to prevent double-deduction.
*   **BOLA Protection (Broken Object Level Authorization):** The Approver APIs deeply verify the `user_reporting_mappings`. A manager cannot spoof an API call to approve a request for an employee outside their direct reporting chain.
*   **Self-Approval Exploits Blocked:** Hardcoded guards prevent a manager from approving or rejecting their own leave requests, regardless of data-entry errors in the reporting hierarchy.
*   **No Hard Deletions on Ledger:** Canceled or modified leaves update the `leave_balances` ledger safely. The original policies and requests are historically preserved.

---

## 4. What Functionality is Missing (Next Steps)

With the ledger fully funded and employees able to spend leaves, the transactional loops are complete. 

To completely finalize the Leave Module, we must implement:
1.  **Phase 5: Background Jobs (Cron Engine):**
    *   **Monthly Accrual Cron:** A scheduled job that runs on the 1st of every month to deposit +1 day of leave for policies configured as `monthly` accrual.
    *   **Year-End Carry Forward Cron:** A massive December 31st job that freezes the current year's ledger, calculates the allowed `max_carry_forward` for every employee, lapses the remaining balance, and initializes the ledger for the new year.
2.  **File Upload Integration:** Connecting the `document_url` field in the Leave Application API to the actual AWS S3 / Cloud Storage upload microservice (when a sick leave requires a medical certificate).

# Leave Module: Phases 1 to 6 Completion Report

This report outlines the functionality achieved after completing all six phases of the Leave Management Module. We have successfully built the **Core Foundation**, the **Policy Assignment & Balance Engine**, the **Application Workflow**, the **Attendance Bridge**, the **Background Jobs**, and the **Advanced Feature Hardening**, creating a fully functional, highly secure leave management system.

**Evolution of the Leave Module:**
Phase 1 → Rules & Configuration → Phase 2 → Policy Assignment & Balance Ledger → Phase 3 → Leave Application Workflow → Phase 4 → Leave ↔ Attendance Bridge → Phase 5 → Background Automation → Phase 6 → Advanced Features & Hardening

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

### Phase 3: Application Workflow & Approvals (The Transaction Engine)
We built the transactional workflow that allows employees to spend their accrued leaves, and for managers/HR to approve or reject them.
*   **Business Day Calculator:** A dynamic engine that evaluates requested dates against Shift Definitions, Weekly Offs, Public Holidays, and Calendar Exceptions.
*   **Sandwich Rule Engine:** Checks adjacent leave requests and forcefully bridges absences over weekends/holidays to prevent policy exploitation.
*   **Phantom Hold Logic & LWP Fallback:** Pending requests calculate against an "effective balance" in memory. Gracefully splits requests into `paid_days` and `unpaid_days` (LWP) if needed.
*   **Self-Service & Approver APIs:** Endpoints for employees to submit/cancel requests, and for Managers/HR to rigidly approve/reject them.

### Phase 4: The Leave ↔ Attendance Bridge
We securely tied the Attendance Module to the Leave Module using background hooks, bridges, and automated workflows.
*   **Comp-Off Lifecycle:** Fully automated earning of Compensatory Offs for weekend/holiday work, depositing into the leave wallet upon manager approval, and deducting upon usage.
*   **Regularization Overrides:** Automated refunds of leave balances when a day previously marked as "On Leave" is corrected via an approved regularization.
*   **Graceful Unwinding:** Post-deletion hooks automatically cancel future leaves and refund balances when an employee is deactivated.
*   **Expiry & Absent Engines:** Nightly cron jobs that expire unused Comp-Offs after 90 days and safely mark un-clocked days as absent with race-condition protections against concurrent leave approvals.

### Phase 5: Automation & Maintenance (Cron Jobs)
We implemented robust background automation engines to securely maintain ledger integrity over time.
*   **Monthly Accrual Engine:** A cron job running on the 1st of every month to compute and deposit pro-rated leaves for 'monthly' policies.
*   **Year-End Rollover Engine:** An end-of-year transition job (Jan 1st) that lapses stale leaves based on `max_carry_forward` rules and seamlessly seeds the new year's ledger.
*   **Manual Trigger APIs:** Exposed deterministic endpoints to execute accrual and rollover logic manually for HR oversight, manual testing, or incident recovery.

### Phase 6: Advanced Features & Security Hardening
We strengthened existing APIs with powerful new payload parameters and deep business-logic enforcements.
*   **Demographic Eligibility:** Restricted specific leave types to certain genders or marital statuses (e.g., Maternity Leave).
*   **Notice Period Caps:** Hard blocks or capped allowances for taking leave during an employee's notice period.
*   **Rotation-Aware Overnight Shifts:** Dynamic evaluation of shift schedules to accurately plot overnight spillovers, injecting dual attendance records without double-deducting balances.
*   **Cross-Year Smurf Guard:** Implemented database-level locks to thwart concurrent double-spend exploits aiming to bypass Document Thresholds across year boundaries.

---

## 2. What Users Can Do Right Now

### As an HR Admin, I can:
1.  **Configure the Organization:** Define leave types, rules, demographic limitations, notice-period caps, and assign policies with automatic pro-rata calculations.
2.  **Global Approvals:** Access the global pending queue to forcefully approve or reject leaves for any employee.
3.  **Trigger Automations:** Manually run monthly accruals or year-end rollovers for the organization.

### As a Manager, I can:
1.  **View Team To-Do List:** Call the pending queue API to see all incoming leave requests for direct subordinates.
2.  **Make Decisions:** Approve or reject requests with mandatory textual justifications.
3.  **Approve Earned Comp-Offs:** Review and approve system-generated comp-offs from team members working on weekends or holidays.

### As an Employee, I can:
1.  **View My Dashboard:** Instantly see my leave wallet and available quotas.
2.  **Apply for Leave:** Submit a date range. The system will automatically ignore holidays/weekends based on policy and enforce document/notice-period validations.
3.  **Earn & Spend Comp-Offs:** Automatically earn comp-offs by working on holidays, and track their 90-day expiry directly in the wallet.
4.  **Cancel Requests:** Cancel a pending request instantly, or submit a cancellation request for manager approval if the date has already passed.

---

## 3. How the Generated Code Runs (Under the Hood)

The system operates strictly like a financial banking ledger with high security:
*   **Concurrency Locks & Transactions:** Every application and approval runs inside an ACID-compliant Postgres transaction using `LOCK.UPDATE`. If two managers click "Approve" at the same millisecond, the database serializes them to prevent double-deduction.
*   **PostgreSQL Advisory Locks:** Employs `pg_advisory_xact_lock` using a hash of the user ID and leave type to mathematically guarantee serializability of requests and prevent concurrent "smurfing" exploits across calendar years.
*   **BOLA Protection (Broken Object Level Authorization):** The Approver APIs deeply verify the `user_reporting_mappings`. A manager cannot spoof an API call to approve a request for an employee outside their direct reporting chain.
*   **Idempotent Background Jobs:** Cron engines heavily rely on watermark timestamps (`last_accrued_period`, `rolled_over_at`) to ensure that even if a job is executed multiple times, an employee's balance is never incorrectly double-credited.
*   **Self-Approval Exploits Blocked:** Hardcoded guards prevent a manager from approving or rejecting their own leave requests.
*   **No Hard Deletions on Ledger:** Canceled or modified leaves update the `leave_balances` ledger safely. The original policies and requests are historically preserved.

---

## 4. What Functionality is Missing (Next Steps)

With all six phases complete, the core Leave Module is fully functional, hardened, and automated. To achieve total system maturity, the following remaining items exist:
1.  **File Upload Integration:** Connecting the `document_url` field in the Leave Application API to the actual AWS S3 / Cloud Storage upload microservice (when a sick leave requires a medical certificate).
2.  **Notification Webhooks / Emails:** Bridging the leave request status changes to an external Email/Slack/Teams notification microservice.

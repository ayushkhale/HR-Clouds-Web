# HRMS Payroll Guide: Monthly Payroll Runs, Calculations & Payslips (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to monthly payroll runs, cross-module data integration with Attendance and Leave, proration rules, exception handling, approval workflows, period locks, and employee payslips within the HRMS Payroll module.

---

### Understanding Monthly Payroll Runs

**Q: What is a Payroll Run in the HRMS?**
**A:** A Payroll Run is an organization-wide monthly batch process that computes, reviews, approves, and disburses salaries for all eligible employees for a designated calendar month.

During a payroll run, the system brings together employee salary structures, attendance records (total days worked, weekend offs, holidays), leave records (paid leaves and unpaid loss of pay days), overtime hours, variable pay adjustments, statutory deductions (PF, ESI, Professional Tax), and income tax withholdings to calculate the final net salary for each employee.

---

**Q: What are the different stages in the Payroll Run lifecycle?**
**A:** A payroll run progresses through five distinct stages:

1. **Draft:** The run header is initiated for a specific month (for example, September 2026). At this stage, employee rosters and configuration settings are established, but financial figures have not yet been calculated.
2. **Calculating:** The computation engine is currently processing attendance, leave, and compensation rules. To preserve data integrity, the system locks the run during this active calculation to prevent simultaneous edits.
3. **Calculated:** The engine has finished computing gross earnings, statutory withholdings, and net pay for all employees. HR administrators can now review individual payslips, inspect warnings, and check department summaries.
4. **Approved:** HR administrators have completed verification and formally approved the run. Approving the run immediately locks the corresponding month's attendance and leave records against future changes and publishes official payslips to employees.
5. **Paid:** Salary disbursements have cleared through the organization's corporate bank. The run is stamped as paid and permanently closed.

---

**Q: What is the "Pre-flight Eligibility Check" before starting a payroll run?**
**A:** The Pre-flight Eligibility Check is an automated diagnostic scan that evaluates whether the organization's employee population is ready for payroll calculation.

Before starting a run, HR administrators run the eligibility check to verify:
- How many active employees are in the organization.
- Whether any employees are missing an active, approved salary structure.
- Whether any employees have unverified or missing bank account information.
- Whether there are unresolved attendance anomalies or unapproved leaves for the target month.

The system returns a readiness checklist (for example: "120 employees ready; 1 missing salary structure; 2 pending bank account verifications"), enabling HR to resolve data gaps before initiating calculations.

---

**Q: Can multiple administrators run payroll calculations at the same time?**
**A:** No. The system has built-in concurrent execution protection to prevent financial discrepancies and race conditions.

If Administrator A initiates a calculation for September payroll, the system places a temporary processing lock on the September payroll cycle. If Administrator B simultaneously attempts to trigger a calculation for the same month, the system displays an alert indicating that a calculation is already in progress and asks Administrator B to wait until the ongoing run completes.

---

### Data Ingestion: Attendance, Leave & Proration Rules

**Q: How does the Attendance module connect with Payroll calculations?**
**A:** The payroll engine automatically fetches daily attendance ledgers for the entire payroll month from the Attendance module.

The system counts:
- Total calendar days in the month.
- Total days worked (present shifts, half-days).
- Weekly off days and recognized company holidays.
- Approved overtime hours and overtime rate multipliers.

These attendance counts determine the exact payable days for each employee and form the basis for prorating salaries.

---

**Q: How does Loss of Pay (LOP) or unpaid leave affect employee salary?**
**A:** When an employee takes unapproved absences or approved unpaid leaves (Leave Without Pay / LOP) recorded in the Leave module, the payroll engine automatically deducts a proportional amount from their salary.

For components configured as "Is LOP Applicable" (such as Basic Pay and Special Allowance), the engine calculates the daily wage rate (monthly component amount divided by the total calendar or working days in the month) and multiplies it by the total LOP days. This LOP deduction is subtracted from gross earnings. Components where LOP is disabled (such as fixed equipment allowances) remain untouched.

---

**Q: How does the system calculate pay for employees who join mid-month?**
**A:** For employees whose joining date falls after the first day of the payroll month, the system automatically applies mid-month joining proration.

If an employee joins on September 16th in a 30-day month, the system identifies that the employee was active for only 15 days. For all earning components configured to prorate on joining, the engine calculates pay strictly for the 15 active calendar days (15 / 30 × monthly amount). Components configured as non-prorated are paid in full.

---

**Q: How does the system calculate pay for employees leaving or resigning mid-month?**
**A:** If an employee resigns or separates mid-month and their exit date is recorded in their profile, the payroll engine automatically bounds their payable period between the 1st of the month and their recorded exit date.

The employee's earnings, statutory contributions, and deductions are prorated strictly for the days worked prior to their exit date, generating an accurate final settlement payslip for that month.

---

**Q: What is a "Local Period Override" for an employee in a payroll run?**
**A:** A Local Period Override allows HR administrators to manually adjust the start or end date of an individual employee's payable period for a specific monthly run without altering their master employment profile.

*Scenario:* An employee leaves unexpectedly on September 15th, but the formal HR exit workflow has not yet been processed. HR can open the employee's item in the draft September payroll run and set the period end date to September 15th. When payroll is recalculated, the engine prorates their pay strictly for 15 days, allowing the organization to disburse an accurate final salary on schedule.

---

**Q: How are approved Overtime hours calculated and paid in payroll?**
**A:** When overtime tracking is enabled, the payroll engine imports all approved overtime minutes from the Attendance module for the payroll period.

The system determines the employee's hourly base rate (derived from their Basic Pay or Gross Salary depending on company overtime policy) and applies the approved overtime rate multiplier (for example, 1.5× for regular workdays or 2.0× for holidays). The resulting overtime pay is added as an earning line item on the employee's monthly payslip.

---

### Exception Handling, Errors & The Exclusion Workflow

**Q: What happens if an employee is missing a salary structure during calculation?**
**A:** The payroll engine features error isolation, meaning an issue with one employee does not crash or stop the payroll run for the rest of the organization.

If the engine encounters an employee without an active salary structure:
1. The engine marks that individual employee's payroll item with an "Error" status and records the specific error code (`NO_SALARY_STRUCTURE`).
2. The employee's monetary figures are set to zero.
3. The engine continues calculating all other employees successfully.
4. The payroll run dashboard displays a warning alert: "1 Employee Error Requires Attention."

---

**Q: Can HR approve a payroll run that contains employee errors?**
**A:** No. The system strictly prohibits approving a payroll run while any employee item remains in an "Error" state.

To finalize payroll, HR administrators must resolve the error by either:
- Assigning and approving a valid salary structure for the employee and clicking "Recalculate", or
- Explicitly excluding the employee from the current monthly run.

---

**Q: What is the "Exclude from Run" feature, and when should it be used?**
**A:** The "Exclude from Run" feature allows HR administrators to temporarily remove an individual employee from a monthly payroll run so that the rest of the organization can be paid on time.

*Common Scenarios:*
- An employee is under disciplinary review, and finance has placed a temporary hold on their salary.
- An employee joined at the very end of the month and their onboarding paperwork or bank details are incomplete.

When excluding an employee, HR must provide a documented exclusion reason. The employee's item is marked as "Excluded," and their salary will not be disbursed in that run.

---

**Q: Why does the system say "Run Requires Recalculation" after excluding or editing an employee?**
**A:** Whenever an individual employee is excluded, included, or has their payable period modified, the overall organization financial totals (such as Total Gross Earnings and Total Net Pay) change.

To guarantee that the summary header totals match the sum of individual payslips to the exact rupee, the system flags the run as "Stale" or "Requires Recalculation." If an administrator attempts to approve the run in this state, the system halts the action and prompts them to click "Recalculate." Recalculation quickly refreshes the totals and allows approval.

---

### Department Previews, Run Approval & Period Locking

**Q: What can HR administrators review on the Payroll Run Preview screen?**
**A:** The Preview screen provides a comprehensive organizational breakdown before final approval, showing:

- **Total Headcount:** Total eligible, calculated, excluded, and errored employees.
- **Financial Totals:** Total Gross Pay, Total Employee Deductions, Total Employer Statutory Contributions, and Total Net Payout.
- **Department Breakdown:** Aggregated salary costs per department (for example, Engineering vs. Sales vs. Operations).
- **Component Breakdown:** Total organization payout for each individual component (Basic, HRA, PF, PT, Special Allowance).
- **Warning Logs:** Notifications of unusual events, such as skipped loan EMIs or negative net pay adjustments.

---

**Q: What happens when an HR administrator clicks "Approve Payroll Run"?**
**A:** Approving a payroll run is a critical milestone that executes three key actions:

1. **Locks the Payroll Period:** The run status changes to "Approved." The system automatically creates an immutable attendance and leave lock for that calendar month. From that moment forward, no employee, manager, or administrator can retroactively add leaves, change clock-in times, or regularize attendance for that month.
2. **Publishes Employee Payslips:** Finalized payslips become instantly available to employees on their self-service dashboards.
3. **Locks Historical Figures:** The calculations are permanently frozen. Future changes to company salary templates or employee structures will not affect this approved period.

---

**Q: What is the purpose of the automatic Attendance and Leave Lock?**
**A:** The automatic lock prevents retroactive attendance tampering after money has been calculated and disbursed.

If an employee could apply for leaves or regularize missed punches for a month that was already paid, the company's financial records would fall out of sync with attendance ledgers. By locking the month upon payroll approval, the system guarantees audit consistency. Any legitimate retroactive attendance adjustments must be addressed in subsequent payroll cycles via manual salary adjustments.

---

**Q: Can an Approved Payroll Run be cancelled?**
**A:** An approved run can only be cancelled if it has not yet been marked as "Paid."

If HR discovers a major organizational error before funds leave the corporate bank, an administrator can click "Cancel Run" and enter a mandatory cancellation reason. Cancelling the run releases the attendance and leave locks, voids the generated payslips, and returns the month to an open state so corrections can be made. Once a run is marked as "Paid," it is permanently finalized and cannot be cancelled.

---

### Bank Advice Export & Salary Disbursement

**Q: What is Bank Advice Export in the Payroll module?**
**A:** Bank Advice Export is the process of generating a formatted financial file that contains the net pay disbursement instructions for the organization's corporate bank.

Once a payroll run is approved, HR can download standard bank advice files (such as NEFT, RTGS, or NACH formats). The file includes employee account holder names, masked bank account numbers, IFSC codes, and exact net payment amounts. This file is uploaded directly to the corporate banking portal to execute bulk salary transfers.

---

**Q: What does the "Mark as Paid" action do?**
**A:** "Mark as Paid" is the final action in the payroll run lifecycle, executed after the corporate bank confirms that salary transfers have cleared.

Clicking "Mark as Paid" transitions the run status to "Paid." This permanently stamps the payment disbursement date on all employee payslips, closes the payroll cycle for that month, and records a permanent success entry in the organization's payroll audit trail.

---

### Employee Payslip Self-Service

**Q: Where can employees view their monthly payslips?**
**A:** Employees can view and download their monthly payslips by navigating to the **My Payroll** section and selecting **My Payslips**.

Employees can browse their complete payslip history by financial year and month. Clicking on any month opens an interactive digital payslip, with an option to download a clean, printable copy.

---

**Q: What information is displayed on an employee's payslip?**
**A:** A standard HRMS payslip contains:

- **Employee & Organization Details:** Employee Name, Employee ID, Designation, Department, Date of Joining, and Organization Name.
- **Banking & Compliance Identifiers:** Masked Bank Account Number, Bank Name, IFSC, Provident Fund (PF) UAN, and ESI Number.
- **Attendance Summary:** Total Days in Month, Work Days Present, Paid Leaves, and Loss of Pay (LOP) Days.
- **Earnings Breakdown:** Individual line items for Basic Pay, HRA, Conveyance, Special Allowance, Overtime Pay, and Bonuses.
- **Deductions Breakdown:** Line items for Provident Fund, Professional Tax, Employee State Insurance, Income Tax (TDS), and Loan EMI repayments.
- **Reimbursements:** Non-taxable expense claim repayments paid alongside salary.
- **Net Pay:** The final take-home salary transferred to the employee's bank account, displayed in both figures and words.

---

**Q: Can employees or managers view payslips while a payroll run is in "Draft" or "Calculating" status?**
**A:** No. Payslips are strictly hidden from employees and team managers while a run is in Draft, Calculating, or Under Review status.

The system ensures that provisional, incomplete, or unverified financial figures are never exposed. Payslips become visible on self-service and manager dashboards only after HR formally executes the "Approve" action.

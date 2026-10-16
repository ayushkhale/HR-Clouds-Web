# HRMS Payroll Guide: Manager Supervision, HR Dashboards & Financial Reports (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to manager supervision, team compensation visibility, organization-wide HR payroll dashboards, variance reports, cost center breakdowns, bank disbursement advice, and audit trails within the HRMS Payroll module.

---

### Team Manager Supervision & Permissions

**Q: What can Team Managers see on their Payroll dashboard?**
**A:** Team Managers have a dedicated "Team Payroll" view designed to provide financial insights into their direct reporting hierarchy while respecting organizational privacy policies:

- **Team Compensation Structures:** Managers can view the salary structures of their direct reports if permitted by organization settings.
- **Team Payslips:** Once a payroll run is formally approved or paid by HR, managers can review the finalized monthly payslips of their direct reports.
- **Team Variable Pay:** Managers can track bonus proposals, spot award requests, and loan recommendations they have submitted for their team members.

---

**Q: Can a Manager view the salary of employees in other departments?**
**A:** No. The system strictly enforces reporting hierarchy boundaries:

Managers are restricted to viewing only those employees who report directly to them within the company's organizational chart. Any attempt by a manager to search for, view, or propose compensation changes for employees in other departments or peer teams is blocked by the system with an access restriction alert.

---

**Q: What is the "Manager Compensation Visibility" setting?**
**A:** The "Manager Compensation Visibility" setting is an organization-wide configuration controlled by HR that dictates whether managers can see exact currency amounts or only high-level headcount data:

- **When Enabled (True):** Managers can see exact salary figures, including gross pay, deductions, and take-home amounts, for their direct reports.
- **When Disabled (False):** The system automatically masks monetary figures for managers. The manager can see headcount metrics (such as "15 team members processed") and attendance summaries, but all individual salary amounts, gross earnings, and net pay figures are hidden to protect privacy.

---

**Q: Can Managers view an employee's personal tax declarations or Form 16?**
**A:** No. Due to strict personal data privacy standards, tax planning and statutory declarations are completely walled off from managers.

Managers cannot view an employee's selected tax regime, rent receipts, landlord PAN, home loan interest, medical insurance claims, or Form 16 certificates. On an approved payslip, a manager can see the final total tax deducted (for example, "TDS: ₹5,000"), but the personal investment declarations behind that calculation are visible only to the employee and authorized HR administrators.

---

**Q: What compensation actions can a Team Manager initiate?**
**A:** Depending on company permissions, managers can initiate three key compensation recommendations:

1. **Propose Salary Increments:** During appraisal cycles, managers can recommend salary raises or new structure templates for direct reports.
2. **Propose Variable Pay & Spot Awards:** Managers can submit one-time spot bonuses or performance awards for high-achieving team members.
3. **Recommend Company Loans:** Managers can submit or endorse employee requests for emergency company loans or salary advances.

All manager recommendations flow directly to HR's pending queue for final financial review and approval.

---

### HR Payroll Overview & Executive Dashboards

**Q: What does the HR Payroll Dashboard display?**
**A:** The HR Payroll Dashboard serves as the central executive command center for the entire organization's compensation operations:

- **Current Payroll Run Status:** Displays the active monthly cycle (Draft, Calculating, Calculated, Under Review, Approved, or Paid) with live progress indicators.
- **Organization Headcount:** Total active employees, employees with approved salary structures, and employees with pending onboarding data.
- **Total Payroll Liability:** Real-time totals for Gross Earnings, Employee Deductions, Employer Statutory Outlays (Employer PF, Employer ESI, EDLI), and Net Bank Payout.
- **Action Queues:** Quick-access counts of pending salary proposals, unverified bank accounts, open reimbursement claims, and pending investment proofs requiring review.

---

**Q: What is the "Month-over-Month Variance Report" in Payroll?**
**A:** The Month-over-Month (MoM) Variance Report is an analytical tool that compares financial figures between consecutive payroll months (for example, comparing September payroll against August payroll) to identify changes and cost drivers.

The variance report highlights:
- **Total Salary Delta:** Percentage and absolute currency increase or decrease in organizational payroll cost.
- **Headcount Changes:** New joiners added to payroll and separated employees removed from payroll.
- **Overtime & Variable Pay Swings:** Spikes in overtime payouts or large seasonal bonus disbursements.
- **Loss of Pay (LOP) Impacts:** Reductions in total payout caused by seasonal absenteeism or unpaid leaves.

This report allows HR and Finance leaders to verify that budget increases are legitimate before approving payroll.

---

**Q: What is a Department Cost Center Breakdown?**
**A:** A Department Cost Center Breakdown groups total employment costs by department, business unit, office location, or project code.

For corporate accounting and financial planning, the breakdown itemizes:
- Direct Salary Costs (gross earnings per department).
- Social Security & Statutory Costs (employer PF and ESI contributions allocated to each department).
- Operational Reimbursements (travel and expense payouts charged to department budgets).

Finance teams use this report to post accurate journal entries to general ledgers and monitor departmental budget utilization.

---

**Q: What is the Payroll Register?**
**A:** The Payroll Register is the master accounting record for a completed payroll cycle.

It presents a comprehensive, line-by-line tabular report for every employee processed in the run, including:
- Employee ID, Name, Department, and Designation.
- Total days in month, days worked, and LOP days.
- Itemized breakdown of all earning components (Basic, HRA, Allowances, Overtime, Bonuses).
- Itemized breakdown of all deductions (PF, ESI, PT, TDS, Loan EMIs).
- Reimbursement payouts.
- Final Net Take-Home Salary.

HR and Finance administrators can filter the register by department or download the complete report as an Excel/CSV spreadsheet for reconciliation.

---

### Bank Disbursement Advice & Payment Operations

**Q: What is Bank Disbursement Advice, and how does HR use it?**
**A:** Bank Disbursement Advice is an electronic payment file generated after a payroll run is approved, formatted specifically for upload to corporate banking portals.

Supported formats include standard batch payment protocols (such as NEFT, RTGS, and NACH files). The file contains each employee's legal name, bank name, IFSC / routing code, masked account number, and exact net payment amount. The finance team uploads this file directly to the corporate bank to execute automatic salary credits into employee accounts on payday.

---

**Q: What safety checks occur when generating Bank Disbursement Advice?**
**A:** Before exporting bank advice, the system runs a disbursement validation:

- Checks for missing bank account numbers or invalid IFSC codes.
- Alerts HR if any employee in the run has an "Unverified" bank account.
- Confirms that the total file payout matches the approved payroll run net pay to the exact rupee.

This ensures that salary files uploaded to the bank do not fail or return payment rejections.

---

### The Payroll Audit Trail & Compliance Logging

**Q: What is the Payroll Audit Trail in the HRMS?**
**A:** The Payroll Audit Trail is an immutable, tamper-proof historical log that automatically records every financial and administrative action taken within the Payroll module.

To comply with statutory financial regulations and corporate governance standards, the system tracks:
- The exact action performed (for example, "Salary Structure Assigned," "Bonus Rule Approved," "Bank Account Verified," or "Payroll Run Approved").
- The identity and role of the user who performed the action.
- The precise timestamp of the transaction.
- The previous value and the new updated value.
- Any justification notes or cancellation reasons entered by the user.

---

**Q: Can entries in the Payroll Audit Trail be modified or deleted?**
**A:** No. The Payroll Audit Trail is strictly append-only.

Neither HR administrators nor system managers can delete, edit, or overwrite audit log records. This ensures that a reliable historical record is always available for internal financial audits, labor department inspections, and compliance reviews.

---

**Q: How does the HRMS protect payroll data from unauthorized administrative access?**
**A:** The HRMS enforces strict tenant-plane isolation and role-based access control (RBAC):

- **Tenant Isolation:** Platform-level administrators cannot view an organization's private employee compensation or banking details.
- **HR Role Authority:** Within an organization, the **HR** role is the designated financial authority with permission to configure salary components, review tax declarations, and approve payroll runs.
- **Data Masking:** Highly sensitive information—such as complete bank account numbers and permanent tax identifiers—is masked on general screens to prevent shoulder-surfing and accidental data exposure.

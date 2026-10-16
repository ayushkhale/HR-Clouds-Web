# HRMS Payroll Guide: Salary Components, Structure Templates & Compensation Management (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to salary components, salary structure templates, employee compensation assignments, approval workflows, and bank account management within the HRMS Payroll module.

---

### Salary Components & Compensation Building Blocks

**Q: What is a Salary Component in the HRMS Payroll module?**
**A:** A Salary Component is an individual earning, deduction, employer contribution, or reimbursement item that forms the building block of an employee's total compensation package.

Every organization defines its own catalog of components—such as Basic Pay, House Rent Allowance (HRA), Dearness Allowance, Conveyance, Provident Fund (PF), Professional Tax, and Special Allowance. Each component carries specific mathematical calculation rules, tax treatments, and compliance flags that govern how it behaves during monthly payroll processing.

---

**Q: What are the primary Component Types available when configuring salary components?**
**A:** The HRMS supports four component types:

- **Earning:** Monetary amounts paid directly to the employee that increase their gross salary (for example, Basic Pay, House Rent Allowance, or Medical Allowance).
- **Deduction:** Amounts subtracted from the employee's gross earnings before pay disbursement (for example, Employee Provident Fund, Professional Tax, or Income Tax / TDS).
- **Employer Contribution:** Amounts contributed by the employer toward employee social security or statutory funds (for example, Employer PF or Employer ESI). These contribute to the total Cost to Company (CTC) but are not paid directly into the employee's bank account.
- **Reimbursement:** Monetary repayments made to employees for business-related expenses incurred on behalf of the organization. Reimbursements are paid alongside net pay but are strictly excluded from gross earnings and statutory wage bases.

---

**Q: What Calculation Types can be assigned to a salary component?**
**A:** When setting up a salary component, HR administrators can choose from five distinct calculation types:

- **Flat:** A fixed, static currency amount (for example, a flat Conveyance Allowance of ₹1,600 per month).
- **Percent of Basic:** Calculated as a specified percentage of the employee's Basic Pay (for example, HRA set to 40% or 50% of Basic Pay).
- **Percent of Gross:** Calculated as a percentage of the subtotal of all standard earning components, excluding the balancing component.
- **Percent of CTC:** Calculated as a specified percentage of the employee's total annual Cost to Company (CTC).
- **Balancing:** Automatically calculates the remaining amount required to make the sum of all components match the employee's total CTC exactly. It absorbs all rounding differences so that compensation breakdowns reconcile to the exact rupee and paise.

---

**Q: What is the purpose of the "Balancing Component" in a salary structure?**
**A:** The Balancing Component (frequently designated as "Special Allowance") ensures that an employee's total compensation matches their assigned Cost to Company (CTC) without manual adjustments.

When an employee is assigned an annual CTC, fixed components (such as Basic Pay at 50% of CTC and HRA at 40% of Basic) are calculated first. Any remaining unallocated CTC automatically flows into the designated balancing component. A salary template or employee structure may have only one balancing component. If the total of all fixed components exceeds the assigned CTC, the balancing amount becomes negative, and the system prompts the administrator that the CTC is insufficient.

---

**Q: What does the "Is Basic" setting do on a salary component?**
**A:** The "Is Basic" flag designates the core wage component of an employee's salary package upon which other percentages and statutory calculations depend.

Only one earning component in the organization can be flagged as "Is Basic" (typically named "Basic Pay" or "Basic Salary"). Components configured as "Percent of Basic" (such as HRA) and statutory formulas (such as Employee Provident Fund) look directly at this component to derive their values.

---

**Q: What does the "Is Part of CTC" setting mean?**
**A:** The "Is Part of CTC" flag indicates whether the monetary value of the component should be counted toward the employee's total Cost to Company.

Most regular earnings and employer contributions (like Employer PF) are marked as part of CTC. Conversely, optional ad-hoc benefits, discretionary allowances, or non-guaranteed variable rewards may be excluded from the fixed CTC definition depending on company policy.

---

**Q: How do the "Is LOP Applicable" and "Is Prorated on Joining" settings affect salary calculations?**
**A:** These settings determine whether an earning component is reduced when an employee does not work the full month:

- **Is LOP Applicable:** If enabled, the component is reduced proportionally for any unpaid leaves or Loss of Pay (LOP) days recorded in the Attendance module during the payroll period. If disabled, the employee receives the full component value regardless of unpaid absences.
- **Is Prorated on Joining:** If enabled, the component is prorated based on the employee's date of joining or exit. For example, an employee joining on the 16th of a 30-day month will receive half of the component value. If disabled, the full monthly amount is awarded even for partial months.

---

**Q: What are the "PF Applicable" and "ESI Applicable" settings on earning components?**
**A:** These flags define whether an earning component contributes to the statutory wage ceiling and contribution calculations for Provident Fund (PF) and Employee State Insurance (ESI).

When calculating statutory PF, the system sums only those earning components where "PF Applicable" is turned on to determine the PF wage base. Similarly, the "ESI Applicable" flag determines which earnings are included in gross wages when evaluating ESI eligibility (up to the statutory threshold of ₹21,000 per month).

---

**Q: What happens when HR clicks "Bootstrap Default Components"?**
**A:** The "Bootstrap Default Components" feature automatically populates the organization's catalog with standard, legally compliant salary components.

This action seeds standard components including Basic Pay, House Rent Allowance, Conveyance Allowance, Special Allowance, Provident Fund (Employee & Employer), Employee State Insurance, Professional Tax, and Income Tax (TDS). This feature is safe and idempotent: it only creates components that do not already exist in the organization and will never overwrite or alter any existing components previously configured by HR.

---

**Q: Can system-created salary components be modified or deleted?**
**A:** System-created components (such as the default Basic Pay or PF) have protected core identifiers to maintain payroll integrity, but their behavioral properties remain customizable.

HR administrators cannot change the internal system code or core calculation type of a system component. However, administrators are free to adjust display names, taxability flags, LOP applicability, and display order. Deleting a system component or a component that is currently in use by active salary templates or employee structures is prevented by the system to preserve historical audit trails.

---

### Salary Structure Templates

**Q: What is a Salary Structure Template in HRMS?**
**A:** A Salary Structure Template is a reusable compensation blueprint that defines the formula and component mix for a specific job grade, department, or employment type.

Instead of manually defining salary line items for every new hire, HR administrators create templates such as "Software Engineer Template," "Executive Sales Template," or "Junior Staff Structure." When a new employee joins or receives a promotion, HR simply selects the appropriate template and inputs the employee's annual CTC; the system automatically computes all individual monthly and annual figures.

---

**Q: How do I create a Salary Structure Template?**
**A:** HR administrators can create a template from the Payroll Administration section by navigating to Structure Templates and clicking "Create Template."

1. Enter a Template Name (for example, "Senior Staff Structure") and an optional description.
2. Add desired salary components from the organization's component catalog.
3. For each component, specify whether it uses a flat amount, a percentage of Basic, a percentage of CTC, or acts as the balancing component.
4. Set the display order to determine how components appear on employee compensation sheets.
5. Save the template.

---

**Q: What does the "Preview Template" feature do?**
**A:** The "Preview Template" feature allows HR administrators to test a salary structure template with a hypothetical CTC amount before saving or assigning it to employees.

When previewing a template, you enter a sample annual CTC (for example, ₹12,00,000). The system immediately runs the complete mathematical evaluation engine, displaying the resulting monthly and annual breakdown across all earnings, deductions, and employer contributions. This allows HR to verify that percentages are accurate, the balancing component resolves correctly, and no rounding anomalies occur.

---

**Q: Why does the system display an error saying "Multiple Balancing Components Found" when saving a template?**
**A:** The system enforces a mathematical rule that each salary structure template can have at most one balancing component.

Because the balancing component absorbs the remaining unallocated CTC, having two or more balancing components would create mathematical ambiguity about how the remaining funds should be distributed. If this error appears, edit the template and ensure only one component (typically Special Allowance) has its calculation type set to "Balancing."

---

**Q: Why does the system reject a template with the error "No Basic Component Found"?**
**A:** If any component in the template is configured to calculate as a "Percent of Basic" (such as House Rent Allowance), the template must include an earning component designated with the "Is Basic" flag.

Without a designated Basic component, percentage-of-basic formulas cannot resolve their base values. To resolve this error, ensure that Basic Pay is added to the template and flagged as the primary basic component.

---

**Q: Can an active Salary Structure Template be deleted?**
**A:** A salary structure template cannot be deleted if it is currently assigned to one or more active employees.

To maintain historical payroll integrity and prevent orphaned compensation records, the system checks whether any employee structure is currently referencing the template. If employees are linked to the template, the system will block deletion. If an organization wants to retire an older structure, administrators can update the template's active status or reassign employees to a newer template before retiring the old one.

---

### Assigning Salary Structures to Employees

**Q: How do HR administrators assign a salary structure to an employee?**
**A:** HR administrators assign a salary structure by opening the Employee Compensation section, selecting the target employee, and initiating a structure assignment:

1. Select the employee and click "Assign Structure."
2. Choose whether to assign from an existing **Salary Structure Template** or build a **Custom Structure**.
3. Enter the employee's **Annual Cost to Company (CTC)**.
4. Specify the **Effective Date** (the date from which this compensation takes effect).
5. Review the evaluated monthly and annual breakdowns.
6. Submit the structure assignment.

Depending on company policy, the structure will either become active immediately or enter a "Pending" state for review under the Maker-Checker workflow.

---

**Q: What is the "Effective Date" of an employee salary structure?**
**A:** The Effective Date is the specific calendar date on which an employee's compensation structure becomes active and legally binding for payroll calculations.

When a monthly payroll run is executed, the engine looks at the employee's active salary structure corresponding to that calendar period. If an employee receives a mid-year increment with an effective date of October 1st, the payroll engine automatically uses the previous structure for September payroll and switches to the new structure for October payroll.

---

**Q: How does the system handle salary structure revisions and historical changes?**
**A:** The HRMS maintains an immutable, versioned historical ledger of all salary structures assigned to an employee.

When a new salary structure is approved for an employee, the system automatically closes the previous structure by setting its end date to the day before the new structure's effective date. The past structure remains permanently saved in the employee's salary history for historical audit trails and retroactive verification. The system strictly prohibits overlapping date ranges between two active structures for the same employee.

---

**Q: Can a salary structure have an effective date in the past (retroactive assignment)?**
**A:** A salary structure can have a past effective date provided that the payroll runs covering those past dates have not already been finalized and locked.

If an organization has already executed and approved payroll for a past month, that period is legally locked. The system will prevent assigning a new structure that conflicts with an already finalized payroll run. In such cases, HR administrators typically set the effective date to the beginning of the current open payroll cycle and record retroactive differences as one-time salary arrears.

---

### The Maker-Checker Approval Workflow

**Q: What is the Maker-Checker workflow in the Payroll module?**
**A:** The Maker-Checker workflow is a dual-authorization financial control designed to prevent compensation errors, unauthorized salary adjustments, and payroll fraud.

Under this rule, any compensation change proposed by one user (the "Maker") cannot take effect until it is reviewed and approved by a separate authorized user (the "Checker"). For example, if an HR executive or team manager submits a salary revision for an employee, the system places the revision in a "Pending" status until an authorized HR manager or director formally approves it.

---

**Q: Can the person who created a salary proposal approve their own request?**
**A:** No. If the organization has enabled the separate checker policy, the system strictly blocks self-approval.

If the user who submitted the salary proposal attempts to click "Approve," the system halts the transaction with an alert stating that a separate checker is required. A different administrator with HR approval authority must log in to review and approve the proposal.

---

**Q: Can Team Managers propose salary increments for their direct reports?**
**A:** Yes. Team Managers can submit salary increment recommendations for their direct reports if permitted by organization settings.

From the Team Compensation tab, a manager can select a team member, input a recommended CTC or percentage increase, and submit the proposal. The proposal is automatically routed to HR's pending approval queue. Managers can only propose revisions for employees who report directly to them within the organization hierarchy; attempting to submit proposals for employees in other departments is blocked.

---

**Q: What happens when an HR administrator rejects a salary proposal?**
**A:** When an administrator rejects a pending salary proposal, the proposal is marked as "Rejected" and does not take effect.

The reviewer is required to provide a rejection reason (for example, "Exceeds approved department budget"). The system logs the rejection in the audit trail, and the employee's existing, previously approved salary structure remains active without interruption. The employee never sees the rejected proposal on their personal dashboard.

---

**Q: Can an employee see a pending salary proposal before it is approved?**
**A:** No. Employees can only view approved, currently active salary structures on their self-service portal.

Pending salary proposals submitted by managers or HR executives remain completely invisible to the employee until final approval is granted. This privacy guard prevents employee confusion or premature compensation expectations if a proposed raise is adjusted or rejected during review.

---

### Employee Bank Account Management

**Q: How do employees view and manage their bank account details in the HRMS?**
**A:** Employees can view and update their payout bank details through the My Payroll section under Bank Account Details.

Employees can input their Account Holder Name, Bank Name, Account Number, and IFSC / Routing Code. For security and privacy, bank account numbers are masked on the display screen (e.g., showing only the last four digits).

---

**Q: What happens when an employee updates their bank account information?**
**A:** When an employee enters a new bank account number or modifies existing banking information, the system automatically marks the account as "Unverified."

To safeguard against unauthorized account changes or payroll diversion right before payday, modifying bank details immediately revokes any prior verification status. The account information is securely stored, and an alert is flagged in HR's pending verification queue.

---

**Q: Why must HR verify an employee's bank account before payout?**
**A:** HR verification ensures that payment disbursement files generated for corporate banks (such as NEFT or RTGS advice files) contain valid, verified account numbers that match the employee's identity.

HR administrators inspect the employee's uploaded cancelled cheque, bank passbook copy, or verified bank statement. Once confirmed, HR clicks "Verify Bank Account." This stamps the account with a trusted status and records the verifying administrator's identity and timestamp in the audit trail.

---

**Q: What validations does the system perform when entering bank details?**
**A:** The system validates that:

- The Account Number contains valid numeric digits and meets standard bank length requirements.
- The IFSC code matches standard 11-character alphanumeric banking formats.
- Required fields (Account Holder Name, Bank Name, Account Number, IFSC) are complete.
- The confirmation account number exactly matches the primary account number to eliminate typographical errors.

If any format is invalid, the system displays an immediate validation message preventing submission.

---

### Common Errors, Validations & Troubleshooting

**Q: Why does the system say "CTC Below Sum of Fixed Components" when assigning a salary?**
**A:** This error occurs when the entered annual CTC is less than the mandatory total of all fixed flat components and percentage components defined in the structure.

For example, if fixed allowances and basic pay add up to ₹6,00,000 annually, entering an annual CTC of ₹5,00,000 would cause the balancing component to calculate to a negative value (−₹1,00,000). The system rejects negative earnings. To fix this, either increase the annual CTC to meet or exceed the fixed requirements, or adjust the salary structure to lower the fixed component values.

---

**Q: Why does the system report "Overlapping Structure Effective Dates"?**
**A:** This error occurs if you attempt to assign a salary structure with an effective date that conflicts with an existing approved structure's date range.

An employee cannot have two active salary structures on the same calendar day. If an employee already has a structure starting on October 1st, a new structure must either have an effective date after October 1st or the existing structure's dates must be appropriately updated.

---

**Q: What should HR do if a component calculation produces unexpected decimal amounts?**
**A:** Organizations can configure global rounding rules in the Payroll Settings to standardize how decimals and minor currency units are handled.

The HRMS supports nearest-rupee rounding, rounding up, or rounding down. When rounding rules are applied, fractional paise are automatically resolved by the balancing component so that the employee's gross pay, deductions, and net pay remain clean integers without rounding discrepancies across months.

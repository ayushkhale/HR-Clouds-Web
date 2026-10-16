# HRMS Payroll Guide: Variable Pay, Bonuses, Employee Loans & Adjustments (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to one-time salary adjustments, bulk CSV uploads, automated bonus rules, company loans, EMI repayment schedules, early foreclosure, and negative net pay protections within the HRMS Payroll module.

---

### Ad-Hoc One-Time Salary Adjustments

**Q: What is an Ad-Hoc Salary Adjustment in the HRMS Payroll module?**
**A:** An Ad-Hoc Salary Adjustment is a one-time monetary addition or deduction applied to an employee's salary for a specific monthly payroll cycle without permanently altering their recurring salary structure.

Common additions include salary arrears, spot performance awards, referral bonuses, relocation allowances, and travel expense settlements. Common deductions include asset loss or damage recovery, unpaid advance recoveries, mobile overage charges, and disciplinary penalties.

---

**Q: How do HR administrators add a one-time adjustment for an employee?**
**A:** HR administrators can create an adjustment from the Payroll Adjustments section by selecting "Add Adjustment":

1. Select the **Employee**.
2. Choose the **Adjustment Type**: **Earning** (adds to pay) or **Deduction** (subtracts from pay).
3. Select an **Adjustment Category** (for example, Arrears, Bonus, Incentive, Recovery, or Penalty).
4. Enter the **Amount** in currency units.
5. Specify the **Target Payroll Month** (for example, `2026-10`).
6. Indicate whether the adjustment is **Taxable** (which controls whether Income Tax / TDS is withheld on it).
7. Enter a mandatory **Reason or Justification Note**.
8. Submit the adjustment.

---

**Q: How does the Maker-Checker rule apply to salary adjustments?**
**A:** When the organization's separate checker policy is active, all ad-hoc adjustments created by an HR executive or manager enter a "Pending" status.

To prevent payroll fraud and unauthorized disbursements, the adjustment cannot be included in a payroll run until a separate authorized HR administrator or director reviews and approves it from the Pending Adjustments queue. The user who created the adjustment cannot approve it.

---

**Q: Can Team Managers propose adjustments for their direct reports?**
**A:** Yes. If enabled by company policy, Team Managers can propose one-time spot awards or bonuses for their direct reports from the Team Variable Pay section.

The manager selects the team member, enters the proposed award amount and business justification, and submits the request. The request is routed to HR's pending approval queue. Managers can only propose adjustments for employees who report directly to them; the system blocks any attempt to propose adjustments for employees outside their reporting hierarchy.

---

**Q: What happens if an adjustment is approved for a payroll month that is already closed and paid?**
**A:** The system enforces strict period protection: you cannot add or apply an adjustment to a payroll period that is already approved or marked as paid.

If you attempt to target an already closed payroll month, the system rejects the operation. Administrators should target the next open or upcoming payroll cycle. If retroactive adjustment is necessary, the adjustment should be recorded with the category "Arrears" targeting the current open month.

---

### Bulk Adjustments via CSV Upload

**Q: When should HR use the Bulk Adjustment CSV Upload feature?**
**A:** The Bulk Adjustment feature is designed for processing hundreds of adjustments simultaneously, such as company-wide festive bonuses, annual performance awards, or seasonal factory incentives.

Instead of manually entering adjustments one by one, HR administrators upload a single structured CSV file containing employee identifiers, categories, amounts, and notes.

---

**Q: How does the Pre-Flight Preview work for Bulk CSV Adjustments?**
**A:** When HR uploads a CSV file, the system performs an immediate pre-flight validation scan without saving any data to the database.

The preview validates:
- That employee codes or IDs belong to active employees within the organization.
- That all monetary amounts are non-negative and valid numbers.
- That required columns (Employee ID, Category, Amount, Month) are present.
- That the target payroll month is currently open for payroll processing.

The preview screen displays a clear summary: "500 Rows Scanned: 498 Valid, 2 Errors (Invalid Employee Code: EMP-999)." HR can correct the specific errors in the spreadsheet before proceeding.

---

**Q: What does "Atomic Batch Commit" mean when importing bulk adjustments?**
**A:** Atomic batch commit means that the entire CSV upload is processed as a single, all-or-nothing transaction.

All valid rows in the spreadsheet are inserted together and tagged with a shared Batch ID. If even one record violates a system constraint during the final commit, the entire file is rejected and no partial records are saved. This guarantees that half-uploaded data or duplicate adjustments never enter the payroll system.

---

**Q: Can HR cancel an entire batch of uploaded adjustments?**
**A:** Yes. If an entire batch of adjustments was uploaded by mistake, HR can cancel all adjustments in that batch with a single action using the Batch ID, provided the target payroll run has not yet been approved or paid.

Cancelling the batch immediately marks all associated adjustments as cancelled and removes them from any pending draft calculations for that month.

---

### Automated Bonus Rules

**Q: What is a Bonus Rule in the HRMS Payroll module?**
**A:** A Bonus Rule is an automated policy that calculates and allocates bonuses to a group of employees based on predefined business criteria.

Rather than calculating individual bonuses in spreadsheets, HR defines a rule (for example, "Q4 Engineering Performance Bonus") that automatically evaluates employee tenure, department, and salary structures to distribute bonus payouts.

---

**Q: What calculation modes are supported for Bonus Rules?**
**A:** Bonus Rules support three calculation modes:

- **Flat Amount:** Every eligible employee receives the same fixed monetary amount (for example, ₹10,000 festive bonus).
- **Percent of Basic:** The bonus is calculated as a percentage of each eligible employee's monthly or annual Basic Pay (for example, 10% of Basic Pay).
- **Percent of Gross:** The bonus is calculated as a percentage of each employee's monthly gross earnings.

---

**Q: What eligibility filters can be applied to a Bonus Rule?**
**A:** HR administrators can configure fine-grained eligibility rules, including:

- **Department Selection:** Target specific departments (such as Engineering, Sales, or All Departments).
- **Minimum Tenure:** Restrict bonuses to employees who have completed a minimum number of service days (for example, at least 180 days of employment).
- **Notice Period Exclusion:** Automatically exclude employees who have submitted their resignation and are currently serving their notice period.

---

**Q: What is the "Preview Impact" feature on Bonus Rules?**
**A:** The "Preview Impact" feature allows HR and Finance to simulate the total financial liability and headcount of a bonus rule before approving it.

When HR clicks "Preview Impact," the engine evaluates the rule against the current employee roster and compensation tables. It displays the exact number of eligible employees, lists each employee with their calculated payout, and shows the total company expenditure (for example: "Eligible Headcount: 85; Total Bonus Liability: ₹8,50,000"). No financial records are created until the rule is formally approved and applied.

---

**Q: How does an approved Bonus Rule reach employee payslips?**
**A:** After the bonus rule is approved, HR clicks "Apply Rule."

The system automatically generates individual approved adjustment records for all eligible employees for the specified target month. When the monthly payroll run for that period calculates, the engine pulls these bonus adjustments into the earnings section of each employee's payslip.

---

### Employee Loans & Salary Advances

**Q: How do Employee Loans and Salary Advances work in the HRMS?**
**A:** The HRMS allows organizations to grant internal company loans or emergency salary advances to employees, which are automatically repaid through monthly salary deductions over a defined tenure.

When a loan is granted, the system generates a structured Equated Monthly Installment (EMI) amortization schedule. Each month, the payroll engine automatically deducts the scheduled EMI from the employee's salary until the loan is fully repaid.

---

**Q: What information is required when granting an Employee Loan?**
**A:** HR administrators input:

- **Employee Name:** The recipient of the loan.
- **Principal Amount:** The total borrowed loan amount (for example, ₹60,000).
- **Tenure in Months:** The number of monthly installments (for example, 6 months).
- **Annual Interest Rate:** The interest rate applied (0% for interest-free emergency advances, or a specified annual percentage).
- **Start Period Month:** The payroll month in which monthly EMI deductions will begin (for example, `2026-10`).
- **Disbursement Mode:** Bank transfer, cheque, or direct credit.
- **Reason:** Purpose of the loan (for example, medical emergency or education assistance).

---

**Q: How does the system deduct monthly loan installments during a payroll run?**
**A:** During monthly payroll calculation, the variable pay aggregator checks for active loans with scheduled installments matching the payroll period.

The engine places the scheduled EMI amount into the deductions section of the employee's payslip. When the payroll run is formally approved by HR, the system updates the installment status from "Scheduled" to "Deducted." Employees can view their updated remaining balance and past installments directly on their self-service portal.

---

**Q: What is Early Loan Foreclosure, and how is it processed?**
**A:** Early Loan Foreclosure allows an employee to pay off the remaining balance of their loan ahead of the scheduled tenure.

HR administrators can initiate foreclosure using one of two settlement modes:
1. **Recover via Payroll:** The entire remaining loan balance is scheduled as a single lump-sum deduction in the upcoming payroll cycle.
2. **External Settlement:** The employee pays the remaining balance directly to the company via bank transfer, cheque, or cash. HR records the external reference number.

Once foreclosed, all remaining future installments are marked as "Cancelled," and the loan status updates to "Closed."

---

### Edge Cases: Negative Net Pay & Loan Insufficiency Protections

**Q: What happens if an employee has high unpaid leaves (LOP) and cannot cover their loan EMI?**
**A:** The system has an automated Loan Insufficiency Protection rule to prevent negative salary calculations.

*Scenario:* An employee earns ₹5,000 this month due to extensive unpaid leaves, but their scheduled loan EMI is ₹10,000.
1. The deduction engine prioritizes statutory deductions (such as PF and Professional Tax) first.
2. It evaluates whether remaining net earnings are sufficient to cover the ₹10,000 EMI.
3. Because the salary is insufficient, the engine **skips the loan EMI** for that month.
4. The installment remains in "Scheduled" status, the payroll run emits a warning note (`LOAN_EMI_SKIPPED`), and the employee receives their remaining earnings. In the next payroll cycle, the unpaid installment is carried forward for deduction.

---

**Q: What is "Negative Net Pay Clamping" and "Shortfall Carry-Forward"?**
**A:** Under labor regulations, an employee cannot receive a negative paycheck (where the employee owes the company money on payday). Negative Net Pay Clamping protects against this situation.

*Scenario:* An employee's gross pay is ₹30,000, but a one-time recovery deduction of ₹35,000 is applied, resulting in a theoretical net pay of −₹5,000.
- The engine clamps net pay to **₹0.00** so the employee receives a valid zero-rupee payslip.
- The system automatically captures the unpaid ₹5,000 balance as a **Shortfall Carry-Forward**.
- In the following month's payroll run, when the employee earns normal wages, the engine automatically injects a ₹5,000 carry-forward recovery deduction. The debt is recovered automatically without manual bookkeeping.

---

**Q: Can employees view their active loans and repayment progress?**
**A:** Yes. Employees can navigate to **My Payroll > My Loans** on their self-service dashboard.

Employees can inspect their original principal, interest rate, tenure, total amount repaid to date, remaining outstanding balance, and a complete schedule of all past and upcoming monthly installments.

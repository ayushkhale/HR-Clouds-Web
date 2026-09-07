# Phase 1 Walkthrough: Payroll Foundation & Salary Structures

## 1. Phase 1 Overview

Welcome to the **Phase 1 Walkthrough** for the Payroll Module. Phase 1 focuses on building the structural and mathematical foundation of the payroll system. It establishes how an organization defines its compensation rules, how salaries are assigned to employees, and how those salaries are securely approved and tracked over time.

### What is Being Delivered
In this phase, we have delivered the **Compensation Master and Salary Structures**. This allows an organization to:
- Define standard earning and deduction categories (e.g., Basic Pay, House Rent Allowance, Provident Fund).
- Create reusable salary templates for different job roles.
- Assign mathematically sound, effective-dated salary structures to employees.
- Enforce strict approval workflows (Maker-Checker) for any salary increments.
- Securely collect and verify employee bank account details.

*Note: The actual generation of monthly payslips and the disbursement of funds will be handled in subsequent phases. Phase 1 ensures the numbers are correct, approved, and ready for those future steps.*

---

## 2. HR Dashboard – Phase 1 Walkthrough

**Dashboard Purpose:** The HR dashboard is the command center for the organization. HR administrators use this space to configure global payroll rules, set up templates, oversee employee compensation, and maintain absolute control over financial approvals.

### Major Functionality & Workflows

#### A. Defining Compensation Building Blocks
Before assigning salaries, HR needs to define what makes up a salary.
* **User Scenario:** An HR administrator logs in for the first time and navigates to the Payroll Settings. They click a button to load standard government-compliant components (like Basic and HRA). They then manually create a custom "Internet Allowance" component.
* **Major System Operations:** Component Management.
* **Supporting Operations:** Creating, listing, updating, and deactivating individual salary components.
* **Expected Outcome:** The organization now has a library of compensation rules that can be used to build employee salaries.

#### B. Creating Reusable Salary Templates
Instead of manually calculating complex tax percentages for every new hire, HR can create templates.
* **User Scenario:** HR creates a "Senior Engineer" template. They attach the "Basic" component (set to 50% of the total salary) and the "Internet Allowance" (set to a flat ₹2,000). They use the system's "Preview" tool to test the math with a hypothetical ₹15,00,000 salary before saving the template.
* **Major System Operations:** Template Configuration & Preview.
* **Supporting Operations:** Creating templates, attaching components, and running mathematical dry-runs.
* **Expected Outcome:** A standardized, error-free blueprint is ready to be assigned to all incoming Senior Engineers.

#### C. Assigning & Approving Salaries (The Maker-Checker Workflow)
This is the core engine of Phase 1. To prevent financial errors or fraud, the system can require that the person who *proposes* a salary cannot be the same person who *approves* it.
* **User Scenario:** An HR executive assigns a new salary structure to an employee. Because the organization has the "Separate Checker" rule enabled, this salary enters a "Pending" state. A senior HR manager logs in, reviews the pending proposal in their queue, and clicks "Approve."
* **Major System Operations:** Salary Structure Assignment & Approval.
* **Supporting Operations:** Submitting proposals, viewing the pending queue, approving, and rejecting proposals.
* **Expected Outcome:** The employee receives a legally binding, mathematically perfect salary structure. The system automatically ensures there are no overlapping dates between their old salary and their new one.

#### D. Verifying Employee Bank Accounts
* **User Scenario:** HR receives an alert that an employee has updated their bank details. HR reviews the physical voided check provided by the employee, compares it to the masked account number on the dashboard, and clicks "Verify."
* **Major System Operations:** Bank Account Verification.
* **Expected Outcome:** The payment instrument is marked as trusted, ensuring future payouts go to the correct destination.

---

## 3. Manager Dashboard – Phase 1 Walkthrough

**Dashboard Purpose:** The Manager dashboard provides team leaders with insights into their team's compensation and the ability to recommend salary changes, without exposing organization-wide financial data.

### Major Functionality & Workflows

#### A. Viewing Team Compensation
Managers need to understand their team's budget, but privacy is paramount.
* **User Scenario:** A manager opens their Team Payroll view. Depending on the global privacy settings defined by HR, the manager will either see a high-level summary (e.g., Total Team Budget: ₹1,00,00,000) or they will see the exact salary breakdown of each direct report.
* **Major System Operations:** Team Visibility & Read-Access.
* **Expected Outcome:** The manager gains financial visibility strictly limited to their own reporting hierarchy. Attempting to view employees on other teams is automatically blocked by the system.

#### B. Proposing Salary Increments
During performance reviews, managers need to recommend raises.
* **User Scenario:** A manager decides to give an employee a 10% raise. They enter the new total salary amount and submit the recommendation. The system calculates the breakdown and sends the proposal to the HR department's pending queue.
* **Major System Operations:** Manager Salary Proposals.
* **Supporting Operations:** Submitting proposals, viewing the status of past proposals, and canceling proposals if a mistake was made.
* **Expected Outcome:** The manager successfully flags an employee for a raise without having the final authority to permanently alter the company's payroll ledger (unless HR has explicitly granted them direct approval authority).

---

## 4. Employee Dashboard – Phase 1 Walkthrough

**Dashboard Purpose:** The Employee dashboard is a private, self-service portal where individuals can view their own finalized compensation and securely manage where their money is deposited.

### Major Functionality & Workflows

#### A. Viewing Personal Compensation
Employees need clear visibility into what they are being paid.
* **User Scenario:** An employee logs in and views their Salary Structure page. They see a clear breakdown of their Earnings (Basic, HRA) and Deductions.
* **Major System Operations:** Personal Salary Read-Access.
* **Expected Outcome:** The employee sees their active, legally binding salary. Crucially, the system hides any "Pending" proposals to prevent the employee from seeing a manager's recommended raise before HR has officially approved it.

#### B. Managing Bank Details
Employees must be able to update their deposit destinations securely.
* **User Scenario:** An employee switches banks. They log in and enter their new Account Number and routing code. The moment they hit save, the system securely encrypts the account number and instantly revokes the "Verified" status of their profile.
* **Major System Operations:** Secure Bank Account Upsert.
* **Expected Outcome:** The employee's sensitive data is safely stored. By automatically removing the "Verified" status, the system prevents potential fraudsters from quietly changing an employee's deposit destination right before payday.

---

## 5. End-to-End Phase 1 User Journey

To see how these dashboards work together, consider the annual appraisal cycle:

1. **The Setup:** HR logs into their dashboard and creates a new salary template for the upcoming year, ensuring all new tax rules are applied.
2. **The Proposal:** A Team Manager logs into their dashboard, reviews their team's current compensation, and submits a 15% salary increment proposal for their top performer using the new template.
3. **The Approval:** The proposal lands in the HR dashboard's pending queue. An HR Administrator reviews the math, ensures it fits the budget, and clicks "Approve." The system seamlessly closes the employee's old salary and activates the new one without any date overlaps.
4. **The Visibility:** The Employee logs into their self-service dashboard the next morning and sees their newly approved salary structure reflected on their profile.
5. **The Deposit Destination:** The employee realizes they want this new salary deposited into a different account, so they update their bank details. The system immediately flags this change for HR to verify.

---

## 6. Phase 1 Completion Summary

With the completion of Phase 1, the organization now possesses a highly secure, mathematically rigorous compensation engine. 

**What Managers and Users Can Expect Now:**
- A fully functional system for defining complex salary breakdowns.
- A secure, role-based environment where managers can propose raises and HR can approve them.
- A strict audit trail that records who made financial changes and when.
- Encrypted storage for sensitive banking information.

**What is Outside Phase 1:**
- Actual payroll processing (calculating monthly attendance, leaves, and generating payslips).
- Disbursing funds to banks.
- Tax declarations and year-end tax computations.

The foundational ledger is now locked in, verified, and ready to support the live monthly payroll processing that will be introduced in the next phases.

# Phase 4: Statutory Compliance & Tax — Business Walkthrough

This document provides a comprehensive, user-facing guide to **Phase 4 of the Payroll module**. It explains how the system handles Indian statutory compliance (PF, ESI, PT) and Income Tax (TDS) calculations, investment declarations, tax regimes, and Form 16 generation. 

This guide is written for HR administrators, Managers, and Employees to understand how to interact with the system, the workflows involved, and how Phase 4 connects with the core payroll engine (Phases 1-3).

---

## 🚀 What Phase 4 Provides
Phase 4 layers legal tax compliance on top of the existing payroll calculation engine. It introduces:
* **Statutory Rules Engine:** Automated Provident Fund (PF), Employee State Insurance (ESI), and Professional Tax (PT) deductions.
* **Income Tax Engine (TDS):** Fully automated Old vs. New Regime tax liability projections and month-by-month TDS recovery.
* **Investment Declarations Workflow:** A self-service portal for employees to declare tax-saving investments (like House Rent, 80C) and an HR review queue to verify the proofs.
* **Year-End Closure:** Financial Year (FY) finalization, Form 16 (Part A & B) generation, and statutory challan reporting.

---

## 🏢 1. HR Administration Workflows

HR users are responsible for setting up the tax environment, reviewing employee submissions, and executing year-end closure.

### 1.1 Managing Statutory Configurations (PF, ESI, PT)
**What it is:** The central control panel where HR sets the organization-wide rates and rules for PF, ESI, and PT.
* **Who uses it:** HR Only.
* **How to start:** Navigate to *Settings > Statutory Config*.
* **What you can do:**
  * Toggle PF and ESI on or off.
  * Adjust PF employer/employee contribution rates and wage ceilings (e.g., capping PF at ₹15,000).
  * Upload and activate State-wise Professional Tax (PT) slabs (e.g., different tax brackets for Karnataka vs. Maharashtra).
* **What happens next:** Once a statutory head (like PF) is enabled, the system automatically activates the corresponding component in the payroll catalog. The calculation engine will instantly begin deducting these amounts from employee payslips in the next payroll run.
* **What can go wrong?** If HR enters overlapping or gapped PT slabs (e.g., ₹10,000-₹15,000 and ₹14,000-₹20,000), the system will reject the save with a `Range Invalid` error to prevent miscalculation.

### 1.2 Bootstrapping & Managing Income Tax Regimes
**What it is:** The system allows HR to define the standard "Old Regime" and "New Regime" tax brackets for each financial year.
* **Who uses it:** HR Only.
* **How to start:** Navigate to *Payroll > Tax Settings > Regimes*.
* **Workflow:**
  1. At the start of a new financial year, HR clicks **"Bootstrap Tax Tables"**.
  2. The system automatically seeds the government-standard default tax slabs, standard deductions, and rebates (like 87A) for that year.
  3. HR can manually review and edit these if the government announces mid-year emergency budget changes.
* **Important Restriction:** To protect historical calculations, editing an existing regime only affects *future* or *draft* payroll runs.

### 1.3 Verifying Employee Investment Declarations
**What it is:** The review queue where HR approves or rejects employee tax-saving claims.
* **Who uses it:** HR Only.
* **How to start:** Navigate to *Payroll > Tax Declarations*.
* **Workflow:**
  1. HR views the list of `submitted` employee declarations.
  2. HR clicks on an employee's declaration to see the line items (e.g., ₹1.5L claimed under 80C LIC).
  3. HR reviews the attached proof documents.
  4. **Available Actions:**
     * **Verify:** Accept the amount. (HR can verify a *lesser* amount if the receipt falls short of the claim).
     * **Reject Item:** Mark a specific item as rejected (reduces verified amount to zero).
     * **Reject Entire Declaration:** Completely discard a fraudulent submission.
     * **Reopen:** Send the declaration back to `draft` so the employee can fix a mistake.
* **What happens next:** The moment HR clicks "Verify", the employee's projected TDS liability recalculates. If their tax liability decreases, their next payslip's net take-home pay will increase.

### 1.4 Managing "Previous Employer" Figures (Form 12B)
**What it is:** Recording the income and tax already paid by a new employee at their previous company during the current financial year.
* **How to start:** Navigate to *Employee Profile > Tax Summary > Previous Employer*.
* **Workflow:** HR inputs the Gross Income and TDS amounts from the new hire's Form 12B.
* **Why it matters:** The tax engine combines the previous employer's income with the current company's projected income to ensure the employee is taxed correctly in the right slab, avoiding heavy tax penalties at year-end.

### 1.5 Year-End Finalization & Form 16
**What it is:** The process of permanently locking a financial year and issuing Form 16s.
* **How to start:** Navigate to *Payroll > Year End > Finalize*.
* **Workflow:**
  1. Once March payroll is paid, HR initiates Financial Year Finalization.
  2. **Pre-flight Readiness Check:** The system verifies that every month in the financial year has a closed (`approved` or `paid`) payroll run. If any months are missing (e.g., organizations that onboarded mid-year), HR must explicitly check the acknowledgment flag and provide a business justification reason to proceed.
  3. **Batch Finalization:** The system runs a cohort-batched freeze across all eligible employees with per-employee error isolation and idempotency. Tax records, deductions, and Form 16 Part-B snapshots are permanently frozen. Any declaration items that were never verified by HR are frozen without exemption credit.
  4. **Individual Resignation Finalization:** HR can also finalize an individual departing employee at any time during the year to generate an authoritative exit Form 16.
* **What happens next:** The FY is locked. Employees can immediately view and download their finalized Form 16 (Part B) from their self-service portal.
* **Important Restriction:** Once a year is finalized, **nobody**—not even HR—can alter the tax regime, previous employer figures, or declarations for that year.

---

## 👥 2. Manager Actions (Visibility & Restrictions)

Because tax declarations often contain highly sensitive personal information (such as a landlord's PAN card, private life insurance details, or spouse income), **Phase 4 introduces strict privacy walls.**

* **No Manager Tax Portal:** There is no dedicated tax or declaration dashboard for managers.
* **What Managers CAN see:** If organizational policy permits compensation visibility, a manager reviewing an approved payslip will see the final deducted amounts (e.g., "TDS: ₹5,000", "PF: ₹1,800").
* **What Managers CANNOT see:** Managers cannot see *why* the TDS is ₹5,000. They cannot view a subordinate's tax regime choice, their investment declarations, or their Form 16.

---

## 🧑‍💻 3. Employee Self-Service

Phase 4 empowers employees to independently manage their tax liabilities without overwhelming the HR helpdesk.

### 3.1 Choosing a Tax Regime
**What it is:** Employees elect whether they want to be taxed under the Old Regime or the New Regime.
* **How to start:** Navigate to *My Payroll > Tax Planner*.
* **Workflow:** 
  1. Employee clicks "Switch Regime" and selects their preference.
  2. The system instantly recalculates their projected annual tax.
* **Restriction:** If HR has disabled regime switching (e.g., after the January deadline), the system will prevent the change.

### 3.2 Submitting Tax Declarations
**What it is:** The portal where employees claim tax exemptions to lower their TDS.
* **How to start:** Navigate to *My Payroll > Declarations*.
* **Workflow:**
  1. Employee adds declaration items across eligible sections (e.g., HRA rent paid, 80C, 80D medical insurance).
  2. The system calculates a live preview of how much tax they will save.
  3. Employee attaches proof references or document links for each claim.
  4. Employee clicks **"Submit to HR"**.
* **Statuses Explained:**
  * `Draft`: Employee is editing. Tax engine projects benefits based on declared amount.
  * `Submitted`: Sent to HR. Employee can no longer edit the declared amounts, but can still attach missing proof references.
  * `Verified`: HR has accepted the proofs and verified the amounts.
  * `Partially Verified`: HR verified some items while reducing or rejecting others.
  * `Rejected`: HR has declined the claims; the tax benefit is lost.
* **Success Scenario:** The employee submits ₹1.5L in 80C. HR verifies it. The employee's monthly TDS drops from ₹10,000 to ₹6,000.

### 3.3 Understanding the Tax Projection ("Why is my TDS this amount?")
**What it is:** A deeply detailed, transparent trace of how the system arrived at the employee's monthly TDS deduction.
* **How to start:** Navigate to *My Payroll > Tax Projection*.
* **What you see:** A step-by-step mathematical breakdown showing:
  1. Projected annual gross salary.
  2. Minus standard deduction.
  3. Minus verified 80C/HRA exemptions.
  4. Tax calculated across age-specific slab brackets.
  5. Divided by the remaining months in the year to arrive at the exact TDS on this month's payslip.
* **Use Case:** This completely eliminates the need for an employee to ask HR, "Why did my tax go up this month?" because the math is fully visible.

### 3.4 Downloading Form 16
**What it is:** The employee retrieves their annual tax certificate for filing IT returns.
* **How to start:** Navigate to *My Payroll > Form 16*.
* **Workflow:** Employee selects the financial year and clicks "Download".
* **Important Restriction:** If HR has not yet finalized the financial year, the system will return a `404 Not Found` error. The system will *never* issue a provisional, un-finalized Form 16 to an employee to prevent them from filing legally incorrect tax returns.

---

## 🔄 4. Real-World Workflows & Scenarios

### Scenario A: The Rent Receipt Panic
**Situation:** It's February. HR has frozen the declaration submission window. An employee realized they submitted their rent claim in January but forgot to attach the PDF receipt.
**Resolution:** 
1. Because the declaration is `submitted` but not yet `verified`, the employee does not need HR to reopen the form.
2. The employee uses the **"Attach Proof"** feature to upload the receipt directly to the existing item.
3. The system allows this because attaching a file does not alter the monetary amount claimed.
4. HR reviews the newly attached proof and verifies the amount.

### Scenario B: Mid-Year Promotion Causes a Tax Spike
**Situation:** An employee on the Old Regime receives a massive 40% salary hike in October (Phase 3 variable pay). Their November payslip shows their TDS deduction has tripled.
**Resolution:**
1. The engine detects the new salary structure.
2. It projects the new higher income across the remaining 5 months of the year, pushing the employee into a higher 30% tax bracket.
3. Because TDS must be recovered before March, the system recalculates the remaining total tax liability and divides it by 5 (the remaining months).
4. The employee opens their *Tax Projection* tab and clearly sees the math showing how the promotion increased their annual liability.

---

## ❓ 5. Frequently Asked Questions (FAQ)

**Q: If an employee's loan EMI and their TDS deduction combined exceed their net pay, what happens?**
**A:** Statutory deductions (PF, ESI, TDS) are legally prioritized. The engine will deduct the full TDS amount first. If there is insufficient net pay remaining for the loan EMI, the engine will *skip* the loan EMI for that month (carrying it forward) rather than creating a negative payslip.

**Q: Can a manager see that their employee is paying a heavy home loan?**
**A:** No. Managers are strictly blocked from viewing the Tax and Statutory modules due to privacy laws.

**Q: What happens if an employee forgets to declare their previous employer's income?**
**A:** The system will only tax them on income earned at the current company. At year-end, they will likely face a massive tax penalty from the government when filing their personal returns because they claimed the basic exemption limit twice. HR should actively track Form 12B submissions.

**Q: Why can't I edit my tax regime in April?**
**A:** If HR has clicked "Finalize Financial Year" for the previous year, historical records are locked to preserve audit integrity. You can only edit regimes for the *current, active* financial year.

---
title: "Payroll, Salary & Tax — Employee Guide"
role: "employee"
module: "payroll"
status: "implemented"
ui_available: "none"
source_document: "Payroll & Salary Module.md"
last_verified: "2026-09-10"
tags: ["payslip", "salary slip", "salary structure", "ctc breakup", "bank account", "tax", "tds", "investment declaration", "80c", "tax regime", "form 16", "bonus", "loan", "emi"]
---

# Payroll, Salary & Tax — Employee Guide

**Document Information**
Role: Employee · Module: Payroll · Availability: Implemented · User interface: None (no employee payroll screen) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Payroll, Salary & Tax Does for an Employee

Payroll, Salary & Tax lets an employee see their pay and manage a few pay-related details themselves. An employee can view their salary structure (the CTC breakup / pay components), view and update their bank account, view payslips (salary slips), view bonuses, adjustments, and loans, see tax figures (TDS), manage their investment declaration (the 80C / tax-saving declaration), switch tax regime where the organization allows it, and obtain Form 16 once the financial year is finalized.

## 2. Availability and Access for the Employee Role

Payroll, Salary & Tax is **implemented and extensive** for the Employee role. Most of it is view-only; the employee can write in only three areas: their bank account, their tax declaration, and their tax regime.

Access depends on:

- **Role:** the employee role can reach every payroll self-service capability described here for their own data only.
- **Subscription entitlement:** payroll is subscription-gated. If an organization's plan does not include payroll, the system reports that the feature is not available on the current subscription plan (`FEATURE_NOT_AVAILABLE`), and no payroll action will work.

**User interface:** none. There is **no employee payroll screen** in the reference dashboard. Every capability in this document is available through the platform's Employee self-service interface, but a dedicated payroll screen has not been released. Where this document describes viewing or updating something, it describes what the system does, not where to click.

## 3. Where to Find Payroll, Salary & Tax

There is no dedicated employee payroll screen today. Salary, payslip, bank, and tax capabilities are available through the platform's Employee self-service interface. This is the feature with the largest gap between what exists and what has a screen: the capability is real and complete, but not yet surfaced in the reference dashboard.

## 4. Capabilities Available to an Employee in Payroll, Salary & Tax

| Capability | Status | Notes |
| --- | --- | --- |
| View current salary structure | Available (no screen yet) | Read-only |
| View salary structure history | Available (no screen yet) | Read-only |
| View bank account | Available (no screen yet) | Shown masked |
| Add or update bank account | Available (no screen yet) | Resets verification |
| View payslip list | Available (no screen yet) | Approved/paid runs only |
| View a specific payslip | Available (no screen yet) | Returned as data |
| View bonuses | Available (no screen yet) | Approved only |
| View adjustments | Available (no screen yet) | Approved only |
| View loans and installment schedule | Available (no screen yet) | Read-only |
| View tax summary, projection, monthly breakdown | Available (no screen yet) | Read-only |
| Create or update tax declaration | Available (no screen yet) | Only while in draft |
| Submit tax declaration | Available (no screen yet) | Moves to submitted |
| Record proof references | Available (no screen yet) | After submission |
| Switch tax regime | Available with limitations | Organization must allow it |
| Obtain Form 16 | Available with limitations | Only after the year is finalized |

## 5. Viewing Salary Structure and History

An employee can view their current salary structure — the breakup of pay components such as basic pay, allowances, and any fixed or variable components the organization has configured — and the history of past salary structures. Both are read-only. The exact components, including any statutory deductions such as provident fund or professional tax, are configured by the organization.

## 6. Viewing and Updating the Bank Account

An employee can view their own bank account (shown masked for security) and add or update it. Updating the bank account is one of the few write actions an employee has in payroll.

1. The employee provides the account holder name, account number, IFSC code, and bank name; branch name and account type are optional.
2. The system validates the account number and IFSC format.
3. On success the account is saved.
4. **Any change resets the account's verification status** — after an update, the account must be re-verified before it is treated as confirmed. Changing bank details is therefore not instantaneous in effect.

## 7. Viewing Payslips, Bonuses, Adjustments, and Loans

- **Payslips (salary slips / pay stubs):** an employee can view a list of their payslips and open a specific one. Only payslips from approved or paid payroll runs appear; runs still in progress do not. A payslip is returned as structured pay data, not as a downloadable PDF file.
- **Bonuses and adjustments:** an employee can view their bonuses and adjustments. Only approved records appear; pending or rejected ones are never shown. Bonuses are split into earned and upcoming.
- **Loans and advances:** an employee can view company loans or salary advances and the installment (EMI) schedule. These are read-only.

## 8. Managing the Tax Declaration

The investment declaration (also called the 80C or tax-saving declaration) is where an employee declares tax-saving investments so tax is computed correctly. It moves through a lifecycle, and an employee can only edit it at the right stage.

1. **Draft** — the employee creates or updates the set of declared items. Editing is allowed **only while the declaration is in draft.**
2. **Submit** — the employee submits the declaration, which moves it out of draft for review.
3. **Record proofs** — after submission, the employee can attach proof references to items without reopening the declaration. This does not change declared amounts or the declaration's status.
4. **Review outcome** — the organization verifies the declaration; it becomes verified, partially verified, or rejected. Reopening a declaration back to draft is done by the organization, not the employee.

Declaration submission is only possible while the organization's declaration window is open. The window and the proof deadline are organization settings (for example a declaration window that opens and closes on configured months, and a proof deadline on a configured month and day), which is why submission is sometimes refused.

## 9. Tax Figures, Regime, and Form 16

- **Tax summary, projection, and monthly breakdown:** an employee can view their tax figures — the deducted tax (TDS), a projection for the year, and a month-by-month breakdown. These are read-only and are selected by financial year.
- **Tax regime:** only two regimes exist — **old** and **new**. Whether an employee may switch is controlled by an organization setting; see Section 12.
- **Form 16:** an employee can obtain their Form 16 for a financial year, but **only after that financial year has been finalized.** Before finalization there is no Form 16 to issue. Form 16 is returned as data; the platform does not perform tax filing — it provides the declaration and the Form 16 data, not a filing service.

## 10. Fields and Input Rules for the Bank Account

| Field | Purpose | Required | Type | Allowed values | Default | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| Account holder name | Name on the account | **Yes** | Text | up to 150 characters | none | — |
| Account number | Bank account number | **Yes** | Digits | 6 to 20 digits | none | "Account number must be 6–20 digits" |
| IFSC code | Bank branch IFSC | **Yes** | Text | valid IFSC format | none | "Invalid IFSC code format" |
| Bank name | Name of the bank | **Yes** | Text | up to 150 characters | none | — |
| Branch name | Name of the branch | No | Text | up to 150 characters | none | May be blank |
| Account type | Kind of account | No | Selection | savings, current | savings | — |

The account number is stored securely and is shown masked when the account is viewed; it is never displayed in full.

## 11. Fields and Input Rules for the Tax Declaration

| Field | Purpose | Required | Type | Rules |
| --- | --- | --- | --- | --- |
| Items | The set of declared investment items | **Yes** | List | The list must be present; an empty list clears the declaration |
| Section | The tax section for an item | **Yes** (per item) | Text | up to 20 characters |
| Sub-category | The item's sub-category | No (per item) | Text | up to 150 characters; a reserved system value is not accepted |
| Declared amount | The amount declared | **Yes** (per item) | Amount | zero or more |
| Proof reference | A reference to proof | No (per item) | Text | up to 500 characters |

For recording proofs after submission, each entry requires the item and a proof reference (1 to 500 characters).

## 12. Switching Tax Regime — Availability Depends on the Organization

- Only two regimes exist: **old** and **new**.
- Whether an employee may switch regime at all is an **organization setting**. In many organizations this is turned off, and a switch is refused. This is an expected outcome, not an error the employee can fix.
- A switch is tied to a specific financial year and is blocked once that year has been finalized.
- The target regime must be available for that financial year.

## 13. Statuses in the Tax Declaration and What They Mean

| Status | Meaning for the employee | Can the employee edit |
| --- | --- | --- |
| Draft | Being prepared; not yet submitted | Yes — edit items |
| Submitted | Sent for review | No — proofs can still be recorded |
| Under review | Being verified by the organization | No — proofs can still be recorded |
| Verified | Fully verified | No |
| Partially verified | Some items verified, some not | No |
| Rejected | Declaration rejected | No |

## 14. Rules and Restrictions That Apply to Payroll, Salary & Tax

- Everything is scoped to the employee's **own** data.
- Most capabilities are **read-only**; the only writes are bank account, tax declaration, and tax regime.
- **Payslips show approved or paid runs only**; in-progress runs are not visible.
- **Bonuses and adjustments show approved records only.**
- **A bank-account change resets verification.**
- **Tax declaration edits are allowed only in draft**, and submission only while the declaration window is open.
- **Regime switching requires the organization to allow it** and a non-finalized year.
- **Form 16 is available only after the financial year is finalized.**

## 15. Error Messages in Payroll, Salary & Tax and How to Resolve Them

| Message | Meaning |
| --- | --- |
| The investment declaration window is closed | Submission is outside the org's declaration window |
| The declaration is not in draft state | Edits are only possible while in draft |
| No declaration exists for this financial year | Nothing has been created for that year yet |
| Proofs can only be recorded on a submitted declaration | Record proofs only after submitting |

### You are not allowed to switch tax regime
This appears when an employee tries to switch regime but the organization has not enabled employee regime switching. The system reports it as REGIME_SWITCH_NOT_ALLOWED. This is an organization setting — the employee cannot change it; contact HR.

### The financial year is finalized
This appears when an employee tries to switch regime for a financial year that has already been finalized. The system reports that the financial year is finalized (`FINANCIAL_YEAR_FINALIZED`). Changes for a finalized year are no longer possible.

### Form 16 is not yet available
This appears when an employee requests Form 16 for a financial year that has not been finalized. The system reports that Form 16 is available only after the financial year is finalized (`FORM16_NOT_FINALIZED`). There is no provisional Form 16; wait until the year is finalized.

### The declaration window is closed
This appears when an employee tries to submit an investment declaration outside the organization's declaration window. The system reports it as DECLARATION_WINDOW_CLOSED. Submission is only possible while the window is open; the window months are set by the organization.

## 16. Successful Outcomes in Payroll, Salary & Tax

- A saved bank account is stored and shown masked; its verification status is reset pending re-verification.
- A submitted declaration moves out of draft for review; recorded proofs attach to items without changing amounts.
- A permitted regime switch is applied to the selected financial year.
- A finalized-year Form 16 request returns the Form 16 data.

## 17. When No Data Is Shown in Payroll, Salary & Tax

- No payslips appear until a payroll run for the employee has been approved or paid.
- No bonuses, adjustments, or loans appear if none have been approved or granted.
- No declaration appears for a year until the employee creates one.
- No Form 16 appears until the financial year is finalized.
- If the whole payroll area is unavailable, the organization's plan may not include payroll (see Section 18).

## 18. Limitations of Payroll, Salary & Tax

- **No employee payroll screen** exists yet; the capability is available but has no dedicated interface.
- **Subscription gating:** all payroll capabilities require the organization's plan to include payroll (`FEATURE_NOT_AVAILABLE` otherwise).
- **Payslips and Form 16 are returned as data, not as downloadable PDF files.**
- **The platform does not file taxes** — it supports declarations and Form 16 data, not income-tax filing.
- **Regime switching may be disabled** by the organization.
- **Most payroll data is read-only** to the employee.

## 19. Not Currently Available in Payroll, Salary & Tax

- Downloading a payslip or Form 16 as a PDF file is not available (they are returned as data).
- "Annual salary slips" as a separate document are not available.
- Submitting or tracking expense reimbursements is not available here — "reimbursement" on a payslip is a salary component, not an expense claim. See the Expense & Reimbursement document.
- Income-tax filing is not available; the platform provides declarations and Form 16 data only.

## 20. Related Employee Features

- **Attendance & Time Tracking** — clocking out records worked hours that feed pay calculation; see the Attendance document.
- **Profile Management** — the bank account is owned by payroll, not the profile; personal data is separate. See the Profile Management document.
- **Expense & Reimbursement** — expense claims are not a payroll feature and are not available; see that document.

## 21. Terminology Used in Payroll, Salary & Tax

| Term | Definition | Also called |
| --- | --- | --- |
| Payslip | A statement of one period's pay | Salary slip, pay stub, monthly salary statement |
| Salary structure | The breakup of an employee's pay | CTC breakup, salary breakdown, pay components |
| Tax declaration | A declaration of tax-saving investments | Investment declaration, 80C declaration, tax-saving proof |
| Tax regime | The old or new tax computation basis | — |
| Form 16 | The annual tax certificate for a finalized year | Tax certificate, annual tax statement |
| TDS | Tax deducted from pay | Tax deduction |

## 22. Common Employee Questions About Payroll, Salary & Tax

### Where do I see my salary slip / payslip?
An employee can view a list of their payslips and open a specific one. Only payslips from approved or paid payroll runs appear. A payslip is returned as pay data; there is no dedicated payroll screen and no PDF file download.

### Can I download my payslip or Form 16 as a PDF?
No. Payslips and Form 16 are returned as structured data, not as downloadable PDF files.

### How do I update my bank account for salary?
An employee can update their bank account by providing the account holder name, account number, IFSC code, and bank name (branch and account type are optional). Any change resets the account's verification, so it must be re-verified before it is treated as confirmed.

### Why can't I switch my tax regime?
Whether an employee may switch between the old and new tax regime is controlled by an organization setting. If the organization has not enabled employee regime switching, a switch is refused (reported as REGIME_SWITCH_NOT_ALLOWED). Switching is also blocked for a financial year that has been finalized.

### When can I get my Form 16?
Form 16 is available only after the financial year has been finalized. Before that there is no Form 16 to issue, and a request returns that Form 16 is available only after the year is finalized.

### Why can't I submit my investment declaration?
Submission is only possible while the organization's declaration window is open. Outside the window the system reports that the investment declaration window is closed. The window months are set by the organization.

### Why can't I edit my declaration after submitting it?
An investment declaration can be edited only while it is in draft. Once submitted, the declared items are locked; the employee can still record proof references, but cannot change amounts.

### How do I claim reimbursement for travel or phone bills here?
Expense reimbursement claims are not part of payroll and are not available in the platform. A "reimbursement" line on a payslip is a salary component, not an expense claim. See the Expense & Reimbursement document.

### Where do I see my bonuses and loans?
An employee can view their approved bonuses (split into earned and upcoming), approved adjustments, and any company loans or advances with their installment schedule. All of these are read-only.

### Why can't I use payroll at all?
If the whole payroll area is unavailable, the organization's subscription plan may not include payroll. The system reports the feature is not available on the current plan. Contact your HR administrator.

## 23. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| View and download monthly payslips in PDF format | Payslips are returned as data; there is no PDF file download |
| Access annual salary slips with cumulative breakdown | No separate "annual salary slip"; tax summary/projection provide annual figures |
| Download Form 16 for income tax filing | Form 16 is returned as data only after the year is finalized; the platform does not file taxes |
| Reimbursement claim submission and tracking | No expense feature; "reimbursement" is a salary component — see Expense & Reimbursement |
| Investment declaration "Update Now" any time | Declarations can be edited only in draft and submitted only within the org's window |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed available:** View salary structure and history, view and update bank account, view payslip list and detail, view bonuses/adjustments/loans, view tax summary/projection/monthly, create/update/submit tax declaration, record proofs, switch tax regime (where allowed), obtain Form 16 (after finalization).
**Confirmed unavailable:** PDF file download of payslips/Form 16, annual salary slips as a separate document, expense reimbursement submission, income-tax filing.
**Available without a user interface:** All payroll capabilities — there is no dedicated employee payroll screen.
**Could not be verified (excluded from this document):** None.

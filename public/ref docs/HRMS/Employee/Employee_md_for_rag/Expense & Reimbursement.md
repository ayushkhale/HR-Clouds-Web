---
title: "Expense & Reimbursement — Availability Status for the Employee Role"
role: "employee"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Expense & Reimbursement.md"
last_verified: "2026-09-10"
tags: ["expense", "reimbursement", "expense claim", "receipt upload", "travel expense", "multi-currency", "claim status", "not available"]
---

# Expense & Reimbursement — Availability Status for the Employee Role

**Document Information**
Role: Employee · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Expense & Reimbursement

**Status: Not currently available.** There is no expense or reimbursement capability for the Employee role in the platform today. An employee cannot submit an expense claim, upload a receipt, or track a reimbursement, because no expense and reimbursement feature is implemented.

## 2. What This Means for an Employee Today

An employee has no way to raise a claim for money spent on travel, meals, accommodation, or any other work expense through the platform. There is no claim form, no receipt upload, no approval flow, and no claim status to track. Reimbursement of out-of-pocket expenses is handled entirely through whatever process an employee's organization uses outside the platform.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in a requirements document and are not available to an employee:

- Submitting expense or reimbursement claims for travel, meals, accommodation, communication, or miscellaneous costs
- Uploading supporting receipts, invoices, or bills
- Tagging expenses under categories such as Travel, Meals, or Accommodation
- Real-time reimbursement status tracking (Submitted → Under Review → Approved/Rejected → Processed)
- Multi-currency expense entry and automatic currency conversion
- Department-wise approval workflow and automatic escalation
- Policy-compliance validation and duplicate-claim flagging

## 4. Where Related Needs Are Handled Today

There is no in-platform way to claim or track a reimbursement. An employee should follow the expense process their organization provides outside the platform.

One point prevents a common misunderstanding: the word "reimbursement" can appear on a payslip as the **name of a salary component** (a fixed or variable pay element set up by the organization in Payroll). That is a pay component within an employee's salary structure — it is **not** an expense claim, and it does not mean an employee can submit expenses. Salary components are described in the Payroll, Salary & Tax document.

## 5. Common Employee Questions About Expense & Reimbursement

### How do I submit an expense claim?
Expense and reimbursement submission is not available in the platform. There is no expense claim feature for employees. Contact your HR or finance team for the process your organization uses.

### How do I upload a receipt or bill for reimbursement?
There is no receipt or bill upload for reimbursements, because no expense feature exists. Submit receipts through your organization's existing process outside the platform.

### How do I check the status of my reimbursement?
The platform does not track reimbursement claims, so there is no claim status to view. Your organization will tell you how it communicates reimbursement status.

### I see "reimbursement" on my payslip — does that mean I can file expenses here?
No. "Reimbursement" on a payslip is the name of a salary pay component configured by your organization; it is part of your salary structure, not an expense claim. There is no feature to submit expenses. Salary components are explained in the Payroll, Salary & Tax document.

### Does the platform support claiming expenses in a foreign currency?
No. There is no expense feature at all, so multi-currency expense claims and currency conversion are not available.

## 6. Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed unavailable:** Expense claim submission, receipt upload, reimbursement tracking, multi-currency expenses, expense approval workflow.
**Search notes:** No expense module exists anywhere in the platform. A search for "reimbursement" returns matches only in the Payroll module, where "reimbursement" is a **salary component** name — an unrelated concept that is not an expense-claim feature.
**Could not be verified (excluded from this document):** None.

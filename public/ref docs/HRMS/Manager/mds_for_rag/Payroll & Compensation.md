---
title: "Payroll & Compensation — Manager Guide"
role: "manager"
module: "payroll"
status: "implemented-propose-only"
ui_available: "partial"
source_document: "Payroll & Compensation.md"
last_verified: "2026-09-10"
tags: ["manager payroll", "salary structure", "propose increment", "salary hike", "maker checker", "payroll proposal", "team compensation", "payslip", "adjustment", "bonus rule", "employee loan", "recommend loan", "propose salary", "team payroll summary"]
---

# Payroll & Compensation — Manager Guide

**Document Information**
Role: Manager · Module: Payroll · Availability: Implemented (propose-only, maker-checker) · User interface: Partial (reference Team Payroll page) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. Where a screen or navigation path is described, it reflects the
> reference Manager dashboard prototype. Where no screen exists, this document describes
> what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Payroll & Compensation Does for a Manager

A Manager participates in payroll for their **direct reports** as a **proposer and recommender under maker-checker control**. A Manager can propose a salary structure change (for example, a salary increment), propose a pay adjustment, propose a bonus rule, and recommend a loan for a report. A Manager can also view team compensation summaries and view a report's payslips for finalized payroll runs.

A Manager **cannot run payroll, cannot approve any compensation change (including their own proposals), and cannot disburse loans.** Every proposal a Manager submits is completed only when **HR approves** it. This is the single most important fact about the Manager payroll role: the Manager is the **maker**, HR is the **checker**.

## 2. Manager Access and Roles

The manager payroll endpoints are reachable by the roles `manager` and `hr`, and require the organization's subscription to include the `payroll.access` feature. HR is admitted to the manager endpoints so an HR user can exercise the manager views without a second login; an HR user is resolved to organization-wide (global) scope, whereas a Manager is limited to direct reports.

Platform roles (`admin`, `super-admin`) are **excluded** from manager payroll endpoints.

### 2.1 Team scope

A Manager acts only on **active direct reports**, resolved from the reporting hierarchy (`user_reporting_mappings`). Acting on an employee outside the reporting line is rejected with an authorization error. A non-existent employee ID and a valid-but-out-of-scope employee ID return the **same** authorization error, so the API does not reveal whether a given employee exists.

### 2.2 The team-compensation visibility toggle

Whether a Manager can see **per-employee compensation figures** for the team is controlled by an organization setting, `manager_can_view_team_compensation`:

- **When ON:** the Manager can view per-head team compensation (salary structures, adjustments, loans) for their reports.
- **When OFF:** the Manager sees **aggregate figures only** and, for lists, sees **only the proposals they themselves authored** — never other reports' individual figures. Viewing an individual report's payslip is blocked entirely when the toggle is OFF.
- An HR user viewing the manager endpoints always sees compensation.

This toggle is a common reason a Manager sees aggregates but not per-person numbers.

## 3. Where to Find Payroll & Compensation

In the reference Manager dashboard, a **Team Payroll Management** panel links to a **Team Payroll** page (`payroll_manager_team.html`). That page shows a **Team Compensation Summary**, a list of **Direct Reports** with **Current CTC** and **Proposed CTC**, a **Propose Salary Increment / Propose Hike** action, and a **My Increment Proposals** list. The dashboard links to it via an "Open Payroll Workspace" action.

## 4. Capabilities Available to a Manager

| Capability | Status | Notes |
| --- | --- | --- |
| View team salary summary | Available | Aggregates always; per-head only when the visibility toggle is ON |
| View a report's salary structure history | Available | Scoped; requires compensation view |
| View a report's current salary structure | Available | Scoped; requires compensation view |
| Propose a salary structure change (increment) | Available (propose-only) | Lands pending for HR approval |
| List own salary-structure proposals | Available | With outcomes |
| Cancel own salary-structure proposal | Available | Only while pending |
| View team payroll summary for a run | Available | Approved/paid runs only |
| View team payroll items for a run | Available | Per-head only when toggle is ON; else aggregates |
| View a report's payslip list | Available | Approved/paid runs only; requires compensation view |
| View a report's payslip detail | Available | Blocked when the visibility toggle is OFF |
| Propose a pay adjustment for a report | Available (propose-only) | Lands pending for HR approval |
| List adjustments | Available | Toggle OFF → only own proposals |
| Cancel own adjustment proposal | Available | Own, pending only |
| Propose a bonus rule | Available (propose-only) | Eligibility source must be "manual"; targets must be direct reports |
| List own bonus-rule proposals | Available | With outcomes |
| Recommend a loan for a report | Available (recommend-only) | Always lands pending; HR approval creates the schedule |
| List loans | Available | Toggle OFF → only own recommendations |
| View a loan detail with schedule | Available | Toggle OFF → only loans the Manager recommended |
| Run / generate payroll | Not available to Managers | HR-only |
| Approve any compensation proposal | Not available to Managers | HR-only (including the Manager's own) |
| Disburse a loan | Not available to Managers | HR approval generates the schedule |

## 5. The Maker-Checker Model — How a Proposal Flows

1. A Manager submits a proposal or recommendation for a direct report (salary structure, adjustment, bonus rule, or loan).
2. The item is created in a **pending** state and enters HR's approval queue.
3. **HR reviews and approves or rejects** it. Only on HR approval does the change take effect (for a loan, HR approval generates the repayment schedule).
4. The Manager tracks the outcome in their own proposals/recommendations list.

There is one nuance for salary structures and adjustments: if the organization has granted managers direct authority **and** the checker step is turned off, a Manager's proposal can land **approved** immediately rather than pending. In that case the system reports the change was "applied" rather than "proposed for HR approval". By default, and in the common case, proposals land **pending for HR approval**. Loans always land pending regardless of settings.

## 6. Proposing a Salary Structure Change — Step by Step

1. On the Team Payroll page, the Manager selects a direct report and chooses **Propose Salary Increment / Propose Hike**.
2. The Manager enters the new **annual CTC** and an **effective-from** date.
3. The Manager supplies either a **template** to base the structure on **or** an explicit list of **components** — not both.
4. The Manager optionally records a **revision type** (initial, increment, correction, promotion, restructure) and a **revision reason**.
5. The Manager submits. The system reports "Salary structure revision proposed for HR approval" (or "applied" if manager authority is on and the checker is off).
6. The Manager can later **cancel** the proposal while it is still pending.

## 7. Proposal Fields and Input Rules (Salary Structure)

| Field | Purpose | Required | Type | Rules |
| --- | --- | --- | --- | --- |
| Annual CTC | The proposed yearly cost-to-company | **Yes** | Positive amount | Must be greater than zero |
| Effective from | When the structure takes effect | **Yes** | Date | Format YYYY-MM-DD |
| Currency | Currency of the amount | No | 3-letter code | Uppercase; defaults to INR |
| Revision type | Nature of the change | No | Selection | initial, increment, correction, promotion, restructure |
| Revision reason | Why the change is proposed | No | Text | Up to 1000 characters |
| Template ID | A salary template to apply | Conditional | Identifier | Provide a template **or** components, not both |
| Components | Explicit component breakdown | Conditional | List | At least one item; provide components **or** a template, not both |

## 8. Other Proposal Types — Key Rules

- **Pay adjustment:** proposed for a specific report (the target comes from the URL, never the request body). Lands pending unless manager authority is on and the checker is off. A Manager can cancel only their **own** pending adjustment proposal.
- **Bonus rule:** the eligibility source **must be "manual"**, and every target must be a direct report; otherwise the system refuses with an authorization error. Note that a `performance_rating` eligibility source exists in the system generally but is not a usable population source here.
- **Loan:** a Manager **recommends** a loan (the wording is "recommend", not "propose"). It **always** lands pending; only HR approval generates the repayment schedule. The message on submit is "Loan recommended for HR approval".

## 9. Viewing Payslips and Payroll Runs

- A Manager can view a **team payroll summary** and **team payroll items** for a given run, and a report's **payslip list** and **payslip detail** — but only for runs that are **approved or paid**. Draft/in-progress runs are not visible to Managers.
- **Team payroll summary** (the cost aggregate for a run) is always available regardless of the visibility toggle.
- **Team payroll items** and **per-report payslips** show per-head figures only when the visibility toggle is ON; when OFF, the Manager sees aggregates and cannot open an individual payslip.

## 10. Statuses in Manager Payroll

| Status | Meaning | Manager relevance |
| --- | --- | --- |
| Proposed | Submitted, awaiting HR | The Manager's default landing state; can be cancelled while pending |
| Approved | HR approved; change applied | Terminal for the Manager |
| Rejected | HR rejected | Terminal for the Manager |
| Cancelled | The Manager withdrew the proposal | Only possible while pending |

## 11. Permission Behavior

- **Role:** `manager` (scoped to direct reports) and `hr` (global) reach these endpoints under `payroll.access`. Platform roles are excluded.
- **Subscription entitlement:** if the plan does not include payroll, no manager payroll action works.
- **Compensation visibility:** governed by `manager_can_view_team_compensation` (see Section 2.2).
- **Scope:** direct reports only; out-of-scope and non-existent IDs return the same authorization error.
- **No self-approval, no execution:** a Manager cannot approve any proposal or run payroll.

## 12. Error Behavior

| Situation | What the Manager sees |
| --- | --- |
| Acting on a non-report (or a non-existent employee) | "You are not authorized to access this employee" (403) |
| Viewing per-head compensation when the toggle is OFF | "Viewing team compensation is disabled for managers in this organization" (403) |
| Proposing a bonus rule with a non-manual eligibility source | Authorization error (eligibility source not permitted) |
| Cancelling a proposal that is not the Manager's own, or not pending | Authorization error; no existence disclosure |
| Feature not in the subscription plan | Feature-not-available error |

## 13. Success Behavior

- "Salary structure revision proposed for HR approval" (or "applied" when authority is on and checker off).
- "Adjustment proposed for HR approval" (or "Adjustment applied").
- "Bonus rule proposed for HR approval" (or "Bonus rule applied").
- "Loan recommended for HR approval".
- "Proposal cancelled" / "Adjustment proposal cancelled".

## 14. Empty States

- A Manager with no direct reports has no team compensation rows and nothing to propose.
- With the visibility toggle OFF, list views return only the Manager's own proposals; other reports' figures do not appear.
- Payslip views are empty for runs that are not yet approved or paid.

## 15. Limitations

- **Propose-only:** a Manager cannot run payroll, approve proposals, or disburse loans.
- **Direct reports only:** no organization-wide payroll reach for a Manager.
- **Compensation visibility is org-controlled:** per-head figures may be hidden by the `manager_can_view_team_compensation` toggle.
- **Finalized runs only:** payslips and run items are visible only for approved/paid runs.
- **Own proposals only for cancellation:** a Manager can cancel only their own pending proposals.
- **No push notifications** of proposal outcomes; the Manager checks their proposals list.

## 16. Not Available to Managers in This Area

- Running or generating a payroll run (HR-only).
- Approving or rejecting any compensation proposal, including the Manager's own (HR-only).
- Directly modifying (rather than proposing) a salary structure.
- Disbursing a loan or generating a repayment schedule (HR approval does this).
- Viewing draft/in-progress payroll runs.

## 17. Related Manager Features

- **Employee Management Panel** — the reporting hierarchy that defines the reports a Manager can propose for; see the Employee Management Panel document.
- **Manager Dashboard** — links to the Team Payroll workspace; see the Dashboard Overview document.
- **Performance Management** — not implemented; a performance-linked bonus is a payroll outcome, not an appraisal; see the Performance Management document.

## 18. Terminology

| Term | Definition | Also called |
| --- | --- | --- |
| Maker-checker | The Manager proposes; HR approves | Propose-and-approve |
| Proposal | A pending compensation change awaiting HR | — |
| CTC | Cost to company; total annual compensation | Annual CTC |
| Salary structure | The breakdown of an employee's pay | Salary components |
| Adjustment | A one-off change to pay | Payroll adjustment |
| Bonus rule | A configured rule that produces a bonus | — |
| Recommend (a loan) | The Manager's propose action for a loan | Loan recommendation |
| Compensation visibility toggle | The org setting that hides/shows per-head figures from Managers | `manager_can_view_team_compensation` |

## 19. Common Manager Questions

### Can I give my team member a raise?
You can **propose** a salary increment for a direct report, but you cannot apply it yourself. The proposal goes to HR, and the raise takes effect only when HR approves it.

### Why can't I see my team's individual salaries?
Per-employee compensation figures are controlled by an organization setting (`manager_can_view_team_compensation`). When it is off, you see aggregate figures and your own proposals only. Ask HR if you need per-head visibility.

### Can I run this month's payroll?
No. Running or generating payroll is HR-only. A Manager can view summaries and payslips for finalized (approved/paid) runs but cannot execute a run.

### Who approves my salary proposal?
HR. Every Manager compensation proposal is completed by HR approval (the maker-checker model). By default your proposal lands "pending for HR approval".

### How do I request a bonus for my team?
Propose a bonus rule with a manual eligibility source, targeting your direct reports. It lands pending for HR approval. A non-manual eligibility source is refused for Managers.

### What is the difference between proposing an adjustment and recommending a loan?
Both are propose-only. An adjustment can, in some org configurations, land approved immediately; a **loan always lands pending**, and only HR approval generates the repayment schedule.

### Why can't I open a team member's payslip?
Either the run is not yet approved/paid, or your organization has the compensation-visibility toggle turned off, which blocks opening an individual payslip.

### Can I cancel a proposal after submitting it?
You can cancel your **own** proposal while it is still **pending**. Once HR has decided, or if it is not your proposal, it cannot be cancelled.

## 20. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| Generate Monthly Payroll | HR-only; a Manager cannot run payroll |
| View/Modify Salary Structures | A Manager can view (subject to the toggle) and **propose** changes, but not modify directly |
| Process Bonuses, Incentives, and Deductions | A Manager **proposes** bonus rules/adjustments; HR approves and processes |
| Manage Reimbursements and Benefits | Not a verified Manager capability |
| Download Salary Reports & Payslips | A Manager can view payslips for approved/paid runs (subject to the toggle); there is no salary-report download for Managers |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code (payroll manager route, controller, and validator; the shared payroll access/authority utility) and the reference Team Payroll page.

**Confirmed available:** Team salary summary; report structure history/current; propose/list/cancel salary-structure proposals; team run summary/items; report payslip list/detail (approved/paid runs); propose/list/cancel adjustments; propose/list bonus rules; recommend/list/detail loans — all scoped to direct reports and governed by the compensation-visibility toggle.
**Confirmed unavailable to Managers:** Running payroll, approving any proposal (including own), directly modifying structures, disbursing loans, viewing draft runs.
**Role set verified from source:** manager payroll routes admit `manager, hr` under `payroll.access`; platform roles excluded.
**Could not be verified (excluded from this document):** The full list of payroll settings that flip a proposal from pending to auto-approved beyond manager-authority and checker toggles.

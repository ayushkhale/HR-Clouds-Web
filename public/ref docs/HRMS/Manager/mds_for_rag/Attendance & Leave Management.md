---
title: "Attendance & Leave Management — Manager Guide"
role: "manager"
module: "attendance, leave"
status: "implemented"
ui_available: "partial"
source_document: "📋 Attendance & Leave Management.md"
last_verified: "2026-09-10"
tags: ["manager attendance", "team attendance", "regularization approval", "overtime approval", "comp-off approval", "attendance anomaly", "leave approval", "approve leave", "reject leave", "team leave", "leave balance", "pending approvals", "direct reports", "team summary"]
---

# Attendance & Leave Management — Manager Guide

**Document Information**
Role: Manager · Modules: Attendance, Leave · Availability: Implemented · User interface: Partial (reference Manager Dashboard) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. Where a screen or navigation path is described, it reflects the
> reference Manager Dashboard prototype. Where no screen exists, this document describes
> what the system does, not where to click.
> **Last verified against source:** 2026-09-10

> **Note on scope:** This document intentionally covers two related domains — team
> **Attendance** management and team **Leave** approval — because the source feature
> document combined them. They are kept as two clearly separated parts (Part A and
> Part B) inside this single document, per the one-document-per-source-file rule.

## 1. What Attendance & Leave Management Does for a Manager

A Manager uses Attendance & Leave Management to oversee their **direct reports'** working time and time off. In the Attendance domain, a Manager views the team's daily and historical attendance, watches for attendance anomalies, and approves or rejects four kinds of employee requests: attendance **regularizations**, **overtime**, **comp-off (compensatory off)**, and **attendance anomaly resolutions**. In the Leave domain, a Manager reviews the team's pending leave requests and approves or rejects them, and can look at a specific team member's leave history and leave balances before deciding.

A Manager is a **scoped approver over their direct reports** — not an organization-wide administrator. A Manager cannot configure attendance policies, shifts, holidays, or leave types; those are HR responsibilities.

## 2. Manager Access and Roles

### 2.1 Team Attendance (Part A)

The manager attendance endpoints are reachable by the roles `manager`, `hr`, `admin`, and `super-admin`, and require the organization's subscription to include the `attendance.access` feature.

### 2.2 Team Leave Approval (Part B)

The leave approver endpoints are reachable by the roles `manager`, `hr`, `admin`, and `super-admin`, and require the organization's subscription to include the `leave.access` feature.

### 2.3 How "team" is determined (applies to both parts)

A Manager's team is resolved from the organization's **reporting hierarchy** (`user_reporting_mappings`), not from a display field. Specifically:

- A **Manager** sees and can act on their **active direct reports** only.
- A report who themselves holds an HR, admin, or super-admin role is **excluded** from a Manager's actionable set — a Manager cannot act on a global approver's requests.
- An **HR** user (and admin / super-admin) acts as a **global approver**: no hierarchy filter, they can act on anyone in the organization.
- A Manager with **no active reports** sees an empty team and has nothing to approve.

**Cross-team protection:** a Manager cannot act on an employee outside their reporting line by substituting a different employee ID in a request. The system rejects such attempts with an authorization error (an IDOR/BOLA guard). This applies to every per-member read and every approve/reject action.

## 3. Where to Find Attendance & Leave Management

In the reference **Manager Workspace** dashboard prototype (`manager_dashboard.html`), the landing screen surfaces the team attendance trend, a **Team Status Today** panel, **Active Anomalies**, and four pending-approval queues: **Pending Regularizations**, **Pending Overtime**, **Pending Comp Offs**, and **Pending Leave Requests**. The dashboard's structure is described in the Manager Dashboard document; this document describes the workflows those panels drive.

---

# PART A — Team Attendance Management

## 4. Attendance Capabilities Available to a Manager

| Capability | Status | Notes |
| --- | --- | --- |
| View team status for today | Available | Present / absent / on-leave counts and per-member status |
| View team attendance history | Available | Recent team records |
| View team attendance summary | Available | For a given date |
| View team attendance graph data | Available | By month and year, for trend charts |
| View a team member's attendance history | Available | Date-range filtered, paginated |
| View a team member's monthly summary | Available | By month and year |
| View active attendance anomalies | Available | Team-scoped |
| Resolve an attendance anomaly | Available | With optional remarks |
| Approve / reject a regularization request | Available | With optional remarks |
| Approve / reject an overtime request | Available | With optional remarks |
| Approve / reject a comp-off request | Available | With optional remarks |
| Configure shifts, holidays, weekly-offs, roster | Not available to Managers | HR-only |
| Import / export attendance data | Not available to Managers | No manager capability |
| Generate attendance reports (daily/monthly) | Not available to Managers | HR-only attendance reports |

## 5. Team Attendance Views — What Each Shows

- **Team Status Today:** the current day's team roll-up — total team size, present today, and absent / on-leave counts — plus each member's live status.
- **Team Attendance History:** recent attendance records across the team.
- **Team Attendance Summary:** a summary for a specific date (defaults to the current date when no date is given).
- **Team Graph Data:** month-and-year aggregated data used to render the team attendance trend chart.
- **Member Attendance History:** one team member's attendance records over a date range, paginated. Columns seen in the reference dashboard include Date, In Time, Out Time, Effective Hours, Late (minutes), Overtime (minutes), and Status.
- **Member Monthly Summary:** one team member's attendance summary for a chosen month and year.

## 6. Attendance Approval Workflows — Step by Step

A Manager has four attendance approval workflows. Each has a pending queue and an approve and a reject action (the anomaly workflow has a single "resolve" action).

### 6.1 Regularization (attendance correction)
1. An employee submits a regularization request (for example, a missed punch).
2. The Manager opens **Pending Regularizations** to see requests from their direct reports.
3. The Manager reviews the request detail and chooses **Approve** or **Reject**.
4. The Manager may add optional **remarks** (up to 1000 characters).
5. On approve, the system reports "Regularization approved"; on reject, "Regularization rejected".

### 6.2 Overtime
1. An employee's overtime is submitted for approval.
2. The Manager opens **Pending Overtime**.
3. The Manager chooses **Approve** or **Reject**, with optional remarks.
4. On success the system reports "Overtime approved" or "Overtime rejected".

### 6.3 Comp-off (compensatory off)
1. A comp-off is earned by an employee and awaits approval (state **earned**).
2. The Manager opens **Pending Comp Offs**.
3. The Manager chooses **Approve** or **Reject**, with optional remarks.
4. On success the system reports "Comp off approved" or "Comp off rejected".

### 6.4 Anomaly resolution
1. The system flags an attendance anomaly for a team member.
2. The Manager opens **Active Anomalies**.
3. The Manager chooses **Resolve**, with optional remarks.
4. On success the system reports "Anomaly resolved successfully".

## 7. Attendance Approval — Fields and Input Rules

| Field | Purpose | Required | Type | Rules |
| --- | --- | --- | --- | --- |
| Request ID | Identifies the request being acted on | **Yes** | Identifier (UUID) | Comes from the pending queue, not typed |
| Remarks | Optional note on the decision | No | Text | Up to 1000 characters; may be blank |

There is no separate required "reason" field for an attendance approval or rejection — remarks are optional on all four attendance workflows.

## 8. Attendance Read Filters

| View | Filters available | Notes |
| --- | --- | --- |
| Team summary | `date` (optional) | Defaults to today when omitted |
| Member history | `from`, `to` dates; `page`; `limit` | `limit` 1–100, default 20; page default 1 |
| Member summary | `month` (1–12), `year` (2000–2100) | Both optional |
| Team graph data | `month` (1–12), `year` (2000–2100) | Both optional |

---

# PART B — Team Leave Management

## 9. Leave Capabilities Available to a Manager

| Capability | Status | Notes |
| --- | --- | --- |
| View team's pending leave requests | Available | Includes cancellation-pending requests |
| View team's full leave history | Available | Any status; filterable and paginated |
| View a team member's leave requests | Available | Hierarchy-scoped by member ID |
| View a team member's leave balances | Available | The wallet needed to decide |
| Approve a team member's leave request | Available | Cannot approve own request |
| Reject a team member's leave request | Available | Rejection reason required |
| Configure leave types / policies | Not available to Managers | HR-only |
| Apply for own leave | Covered by the employee self-service flow | Not this document |

## 10. Leave Approval Workflows — Step by Step

### 10.1 Reviewing pending leave
1. The Manager opens **Pending Leave Requests** (team-scoped). This queue lists requests in **pending** and **cancellation-pending** states, oldest first.
2. To decide, the Manager may open the member's leave history and leave balances first.

### 10.2 Approving a leave request
1. The Manager selects a pending request from a direct report.
2. The Manager chooses **Approve**.
3. The system approves the request and reports "Leave request approved successfully".
4. A Manager **cannot approve their own** leave request — the system rejects it with an authorization error.

### 10.3 Rejecting a leave request
1. The Manager selects a pending request from a direct report.
2. The Manager chooses **Reject** and enters a **rejection reason** (required, up to 1000 characters).
3. The system rejects the request and reports "Leave request rejected successfully".
4. A Manager **cannot reject their own** leave request.

## 11. Leave Approval — Fields and Input Rules

| Field | Purpose | Required | Type | Rules |
| --- | --- | --- | --- | --- |
| Request ID | Identifies the leave request | **Yes** | Identifier (UUID) | From the pending queue |
| Rejection reason | Why the request is rejected | **Yes (reject only)** | Text | Up to 1000 characters; required on reject |

Approving a leave request needs no extra input; rejecting one **requires** a rejection reason. This is the key difference from attendance approvals, where remarks are always optional.

## 12. Leave Read Filters

| View | Filters available | Notes |
| --- | --- | --- |
| Team leave history | `status`, `user_id`, `page`, `limit` | `user_id` must be a member already in the Manager's scope; `limit` 1–100, default 20 |
| Member leave requests | `status`, `page`, `limit` | Member comes from the path, not the query |
| Member leave balances | `year` | Optional |

## 13. Leave Statuses and What They Mean

| Status | Meaning | Manager relevance |
| --- | --- | --- |
| Pending | Submitted, awaiting a decision | Appears in the pending queue; Manager can approve or reject |
| Approved | Leave granted | No further Manager action needed |
| Rejected | Leave not granted | Terminal |
| Cancelled | Request withdrawn | Terminal |
| Cancellation pending | Employee asked to cancel an already-started approved leave | Appears in the pending queue; awaits a Manager decision |
| Terminated cancelled | Ended/cancelled through a termination path | Terminal |

---

# COMMON TO BOTH PARTS

## 14. Permission Behavior

- **Role:** a `manager` reaches every capability in this document, scoped to direct reports. HR, admin, and super-admin reach the same endpoints as global approvers (no hierarchy filter).
- **Subscription entitlement:** attendance capabilities require `attendance.access`; leave capabilities require `leave.access`. If the organization's plan does not include the relevant feature, the system reports the feature is not available on the current plan and no action works.
- **Hierarchy scope:** actions are limited to active direct reports; reports who are themselves HR/admin are excluded.
- **Self-action block (leave):** a Manager cannot approve or reject their own leave request.
- **Cross-team block:** acting on an employee outside the Manager's reporting line is rejected with an authorization error.

## 15. Error Behavior

| Situation | What the Manager sees |
| --- | --- |
| Acting on an employee outside the reporting line | "You are not authorized to access this employee" / "Unauthorized to approve this request" (403) |
| Approving or rejecting one's own leave | "You cannot approve your own leave request" / "You cannot reject your own leave request" (403) |
| Leave request ID not found | "Leave request not found" (404) |
| Rejecting leave with no reason | Validation error — rejection reason is required |
| Feature not in the subscription plan | Feature-not-available error; no action proceeds |

## 16. Success Behavior

- Attendance: "Regularization approved / rejected", "Overtime approved / rejected", "Comp off approved / rejected", "Anomaly resolved successfully".
- Leave: "Leave request approved successfully", "Leave request rejected successfully".

## 17. Empty States

- A Manager with no direct reports sees empty team views and empty approval queues; team-leave endpoints report "No subordinates found" with an empty list.
- Empty pending queues mean there is nothing awaiting the Manager's decision.
- The reference dashboard shows "No team records" and "No recent records" where a table has no rows.

## 18. Limitations

- A Manager sees and acts on **direct reports only**, never the whole organization.
- A Manager **cannot** configure shifts, holidays, weekly-offs, roster, attendance policies, or leave types — these are HR-only.
- A Manager **cannot** import or export attendance data.
- A Manager **cannot** generate attendance reports (daily/monthly/employee reports exist but are HR-only).
- A Manager **cannot** approve or reject their own leave.
- There are **no push notifications**; pending work is discovered by opening the dashboard queues, not by an alert.

## 19. Not Available to Managers in This Area

- Shift, holiday, weekly-off, and roster configuration (HR-only).
- Attendance policy configuration (HR-only).
- Attendance import/export (not implemented for Managers).
- Attendance reporting endpoints (HR-only).
- Leave type and leave policy configuration (HR-only).

## 20. Related Manager Features

- **Manager Dashboard** — surfaces the pending queues and team status that drive these workflows; see the Dashboard Overview document.
- **Payroll & Compensation** — separate maker-checker workflows over the same direct reports; see the Payroll & Compensation document.
- **Employee Management Panel** — the reporting hierarchy that defines a Manager's team; see the Employee Management Panel document.

## 21. Terminology

| Term | Definition | Also called |
| --- | --- | --- |
| Direct report | An employee who reports to the Manager in the org hierarchy | Team member, subordinate |
| Regularization | A correction to an attendance record (e.g., a missed punch) | Attendance correction |
| Overtime | Extra hours worked beyond scheduled time | OT |
| Comp-off | Time off earned against extra work | Compensatory off, compensatory leave |
| Anomaly | A flagged irregularity in an attendance record | Attendance exception |
| Global approver | HR/admin/super-admin who can act org-wide | — |
| Cancellation pending | A request to cancel an already-started approved leave, awaiting a decision | — |

## 22. Common Manager Questions

### How do I approve a team member's leave?
Open the pending leave queue, select the request from a direct report, and choose Approve. The system confirms "Leave request approved successfully". You cannot approve your own leave.

### Why do I have to enter a reason to reject leave but not to approve it?
Rejecting a leave request requires a rejection reason (up to 1000 characters); approving it does not. This is enforced by the system.

### What is the difference between approving overtime and approving a comp-off?
Both are attendance approvals with optional remarks. Overtime approves extra hours worked; comp-off approves time off earned against extra work. They are separate queues (Pending Overtime and Pending Comp Offs).

### Can I configure shifts or holidays for my team?
No. Shift, holiday, weekly-off, roster, and policy configuration are HR-only. A Manager approves employee requests but does not configure attendance rules.

### Why can't I see another department's attendance?
A Manager sees only their active direct reports. Attempting to open a member outside your reporting line returns an authorization error.

### Why is my approval queue empty?
Either there is nothing awaiting your decision, or you currently have no active direct reports. A Manager with no reports sees empty queues ("No subordinates found").

### Can I export my team's attendance?
No. There is no attendance import/export for Managers, and the daily/monthly attendance reports are HR-only.

### How will I know a new leave request is waiting?
There are no push notifications. Open the Manager Dashboard's Pending Leave Requests queue to see what is waiting.

## 23. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| Configure Shift Timings & Holidays | HR-only; not a Manager capability |
| Import/Export Attendance Data | Not available to Managers |
| Track Remote/WFH Logs (as a Manager tool) | No dedicated Manager WFH-tracking capability; not implemented for Managers |
| Full attendance administration | Manager is a scoped approver over direct reports, not an administrator |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code (attendance manager routes/controllers/validators, leave approver route/controller/validator, the shared hierarchy-access utility) and the reference Manager Dashboard prototype.

**Confirmed available:** Team attendance views (today, history, summary, graph, member history, member summary); anomaly view and resolve; regularization/overtime/comp-off pending queues with approve/reject; team leave pending and history views; member leave requests and balances; leave approve and reject.
**Confirmed unavailable to Managers:** Shift/holiday/weekly-off/roster/policy configuration, attendance import/export, attendance reports (HR-only), leave type/policy configuration, self-approval of leave, acting outside the reporting line.
**Role sets verified from source:** attendance manager routes admit `manager, hr, admin, super-admin` under `attendance.access`; leave approver routes admit `manager, hr, admin, super-admin` under `leave.access`.
**Could not be verified (excluded from this document):** The exact org-configurable multi-stage approval chain length beyond the Manager's single decision step.

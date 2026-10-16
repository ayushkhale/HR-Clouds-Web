---
title: "HRMS Manager Panel — Capability Index and Access Model"
role: "manager"
module: "cross-module"
status: "mixed"
ui_available: "partial"
source_document: "HRMS MANAGER PANEL.md"
last_verified: "2026-09-10"
tags: ["manager panel", "manager capabilities", "manager access", "what managers can do", "manager permissions", "scoped approver", "direct reports", "manager role", "manager overview", "reporting hierarchy"]
---

# HRMS Manager Panel — Capability Index and Access Model

**Document Information**
Role: Manager · Scope: Cross-module capability index · Availability: Mixed (see matrix) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. This document is the top-level index of what the Manager role can
> and cannot do; each area links to its own detailed document.
> **Last verified against source:** 2026-09-10

## 1. What the Manager Role Actually Is

The Manager is a **scoped approver and proposer over their direct reports** — not an organization-wide administrator. A Manager reviews and decides their team's attendance and leave requests, proposes compensation changes for HR to approve, and views and lightly edits their reports' personal profiles. A Manager does **not** run payroll, configure organization policies, manage the employee lifecycle, or access other teams' data.

This is a direct correction of the phrase "Full Access / full administrative access" used in older material: the Manager role is deliberately **not** an administrator. The top of the tenant (organization) is the **HR** role; `admin` and `super-admin` are platform roles that carry no tenant data access at all.

## 2. Manager Capability Matrix

| Capability area | Manager status | Where it lives | Detailed document |
| --- | --- | --- | --- |
| Dashboard / team oversight | Available | Manager Workspace dashboard | Dashboard Overview |
| Team attendance views | Available | Attendance module (manager routes) | Attendance & Leave Management |
| Attendance approvals (regularization, overtime, comp-off, anomaly) | Available | Attendance module | Attendance & Leave Management |
| Team leave approval (approve/reject) | Available | Leave module (approver routes) | Attendance & Leave Management |
| Employee directory & profile view | Available | Organization module | Employee Management Panel |
| Edit a direct report's personal profile fields | Available (scoped) | Organization module | Employee Management Panel |
| Payroll: view team compensation | Available (org-toggle) | Payroll module (manager routes) | Payroll & Compensation |
| Payroll: propose salary/adjustment/bonus, recommend loan | Available (propose-only) | Payroll module | Payroll & Compensation |
| Add / remove employees, status change, transfer | **HR-only** | Organization module | Employee Management Panel |
| Run/generate payroll, approve proposals | **HR-only** | Payroll module | Payroll & Compensation |
| Configure shifts/holidays/leave types/policies | **HR-only** | Attendance & Leave modules | Attendance & Leave Management |
| Performance & appraisal | **Not implemented** | — | Performance Management |
| Recruitment | **Not implemented** | — | Recruitment Management Module |
| Reports & analytics (for Managers) | **Not implemented** | — | Reports |
| Notifications & alerts | **Not implemented** | — | Notifications |
| Audit logs (for Managers) | **Inaccessible to Managers** | Payroll audit endpoint is HR-only | Audit Logs |

## 3. The Manager Access Model

- **Tenant plane roles:** `hr` (top of the organization), `manager`, and `employee`. Every tenant-data endpoint is guarded to one of these.
- **Platform plane roles:** `admin` and `super-admin` are organization-independent and are **excluded** from all tenant data. They are not a Manager's superiors in HR workflows.
- **Manager scope:** a Manager acts on their **active direct reports**, resolved from the reporting hierarchy (`user_reporting_mappings`) — the single source of truth for "whose requests can this Manager act on".
- **Global approvers:** `hr` (and platform roles where admitted) act organization-wide; a Manager never does.
- **Subscription gating:** each area requires its feature to be in the organization's plan — `attendance.access`, `leave.access`, `payroll.access`. If a feature is not in the plan, that area is unavailable regardless of role.
- **Cross-team protection:** a Manager cannot read or act on an employee outside their reporting line; such attempts return an authorization error.

## 4. What a Manager Can Do (Summary)

- See their team's attendance today, historically, and as a trend; open a member's attendance detail.
- Approve or reject team regularizations, overtime, comp-offs, and resolve anomalies.
- Approve or reject team leave requests (rejection requires a reason; no self-approval).
- View the employee directory and profiles; edit direct reports' whitelisted personal fields.
- View team compensation (subject to an org toggle) and propose salary changes, adjustments, and bonus rules; recommend loans — all for HR to approve.
- View team payroll summaries and reports' payslips for approved/paid runs.

## 5. What a Manager Cannot Do (Summary)

- Cannot add, remove, deactivate, or transfer employees (HR-only).
- Cannot run or generate payroll, or approve any compensation proposal — including their own (HR-only).
- Cannot configure shifts, holidays, weekly-offs, roster, attendance policies, or leave types (HR-only).
- Cannot access performance/appraisal, recruitment, reporting/analytics, or notification features — these are not implemented.
- Cannot view, search, or export audit logs (HR-only), though the Manager's own actions are recorded.
- Cannot access any team other than their direct reports.

## 6. Areas That Do Not Exist for Managers

The following were listed in older planning material but are **not** available to a Manager because the underlying feature is not implemented in the product:

- **Performance Management** (OKRs/KPIs, appraisals, reviews) — not implemented.
- **Recruitment Management** (job postings, interviews, offers) — not implemented.
- **Reports & Analytics** (report builder, exports, automated reports) — not implemented for Managers.
- **Notifications & Alerts** (in-system alert feed) — not implemented.
- **System & HR Settings** (roles/permissions, leave policies, payroll rules, departments/locations, backup) — these are HR responsibilities, not Manager capabilities.

## 7. Related Manager Documents

- **Dashboard Overview** — the Manager Workspace landing screen.
- **Attendance & Leave Management** — team attendance and leave approvals.
- **Payroll & Compensation** — maker-checker payroll for reports.
- **Employee Management Panel** — directory, profiles, and scoped edits.
- **Performance Management**, **Recruitment Management Module**, **Reports**, **Notifications** — availability statements (not implemented).
- **Audit Logs** — availability statement (inaccessible to Managers).

## 8. Terminology

| Term | Definition | Also called |
| --- | --- | --- |
| Scoped approver | A Manager who acts only on direct reports | — |
| Tenant plane | Org-scoped roles: hr, manager, employee | — |
| Platform plane | Org-independent roles: admin, super-admin | — |
| Direct report | An employee reporting to the Manager | Team member, subordinate |
| Maker-checker | Manager proposes; HR approves | — |
| Subscription gating | Feature availability determined by the org's plan | Entitlement |

## 9. Common Manager Questions

### Does the Manager role have full admin access?
No. Despite older material calling it "Full Access", the Manager is a scoped approver and proposer over direct reports. Full organizational authority sits with HR; `admin` and `super-admin` are platform roles with no tenant data access.

### What can a Manager actually do in HRMS?
Approve team attendance and leave requests, view and lightly edit reports' profiles, and propose compensation changes for HR approval. See the capability matrix in Section 2.

### Which HR-sounding features are off-limits to a Manager?
Adding/removing employees, status changes, transfers, running payroll, approving proposals, and all policy/shift/holiday/leave-type configuration — all HR-only.

### Which listed features don't exist at all?
Performance/appraisal, recruitment, manager reports/analytics, and notifications are not implemented. Audit logs exist but are HR-only.

### Whose data can a Manager see?
Only their active direct reports. A Manager cannot access other teams; attempts to do so are rejected.

## 10. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| "Manager (Full Access)" / "full administrative access" | Manager is a scoped approver/proposer over direct reports; HR holds org authority |
| Add/Remove Employees; Manage Employee Status | HR-only |
| Generate Monthly Payroll; Modify Salary Structures | HR-only / propose-only |
| Configure Shifts, Holidays, Leave Policies, Payroll Rules, Departments | HR-only (System & HR Settings) |
| Performance Management, Recruitment Management | Not implemented |
| Reports & Analytics (custom builder, exports, automated reports) | Not implemented for Managers |
| Notifications & Alerts (in-system alert feed) | Not implemented |
| Audit Logs & History (view all Manager actions, compliance reports) | Inaccessible to Managers; HR-only |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code (`src/app.js` module mounts, organization role-plane constants, the four manager-facing route files across attendance, leave, and payroll) and the reference Manager Workspace prototype.

**Confirmed available to Managers:** Team attendance views and approvals, team leave approval, employee directory/view and scoped personal-profile edit, payroll view (toggle-gated) and propose/recommend workflows, payslips for finalized runs.
**Confirmed HR-only:** Employee lifecycle (add/remove/status/transfer), payroll execution and proposal approval, all shift/holiday/leave-type/policy configuration.
**Confirmed not implemented:** Performance/appraisal, recruitment, manager reports/analytics, notifications.
**Confirmed inaccessible to Managers:** Audit logs (HR-only endpoint).
**Could not be verified (excluded from this document):** Any production-UI navigation structure beyond the reference dashboard.

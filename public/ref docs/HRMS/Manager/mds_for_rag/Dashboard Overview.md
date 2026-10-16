---
title: "Dashboard Overview — Manager Guide"
role: "manager"
module: "attendance, leave, payroll"
status: "implemented"
ui_available: "reference-dashboard"
source_document: "Dashboard Overview.md"
last_verified: "2026-09-10"
tags: ["manager dashboard", "manager workspace", "team status today", "pending approvals", "team attendance trend", "active anomalies", "pending regularizations", "pending overtime", "pending comp offs", "pending leave requests", "team payroll management", "landing screen"]
---

# Dashboard Overview — Manager Guide

**Document Information**
Role: Manager · Modules: Attendance, Leave, Payroll · Availability: Implemented (reference dashboard) · User interface: Reference Manager Workspace prototype · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. The screen described here is the reference Manager Workspace
> prototype (`manager_dashboard.html`); it reflects what the Manager dashboard actually
> shows today, not an aspirational design.
> **Last verified against source:** 2026-09-10

## 1. What the Manager Dashboard Is

The Manager Dashboard (titled **"Manager Workspace"**) is the operational landing screen a Manager sees after logging in. It is an **approvals-and-team-oversight console**: it surfaces the team's attendance status, an attendance trend, active anomalies, and four pending-approval queues, plus a link into the team payroll workspace. It is not an analytics dashboard — there are no headcount/attrition KPIs, charts of turnover, or announcement feeds.

## 2. Manager Access

The dashboard is available to the Manager role and draws its data from the attendance, leave, and payroll manager endpoints. Each underlying area is subscription-gated by its own feature (`attendance.access`, `leave.access`, `payroll.access`), and all data is scoped to the Manager's **direct reports**. The workflows the dashboard drives are documented in the Attendance & Leave Management and Payroll & Compensation documents.

## 3. Dashboard Sections — What Actually Appears

The reference Manager Workspace contains these sections:

| Section | What it shows | Actions |
| --- | --- | --- |
| Team Attendance Trend | A chart of the team's attendance over time (from team graph data by month/year) | View |
| Team Status Today | Today's roll-up: Total Team Size, Present Today, Absent / On Leave, and each member's live status | View; open a member's details |
| Active Anomalies | Attendance anomalies flagged for the team | Resolve |
| Pending Regularizations | Regularization (attendance correction) requests awaiting decision | Review, Approve, Reject |
| Pending Overtime | Overtime requests awaiting decision | Review, Approve, Reject |
| Pending Comp Offs | Comp-off (compensatory off) requests awaiting decision | Review, Approve, Reject |
| Pending Leave Requests | Team leave requests awaiting decision | Review, Approve, Reject |
| Team Payroll Management | Entry point to the team payroll workspace | Open Payroll Workspace |

The top navigation shows the Manager Workspace brand and offers **My Attendance** and **Log Out** actions.

## 4. Key On-Screen Figures (Team Status Today)

| Figure | Meaning |
| --- | --- |
| Total Team Size | Number of direct reports |
| Present Today | Reports marked present today |
| Absent / On Leave | Reports absent or on leave today |
| Late Days | Late-arrival indicator on member records |

## 5. Actions Available From the Dashboard

- **Review** — open a request's detail in a modal ("Review Request") before deciding.
- **Approve** / **Reject** — decide a pending regularization, overtime, comp-off, or leave request.
- **Resolve** — clear an active attendance anomaly.
- **Open Payroll Workspace** — go to the Team Payroll page (salary summary and increment proposals).
- **My Attendance** — the Manager's own attendance view.
- Open a team member's details from Team Status Today (a "Member Details" view).

## 6. Member Details Drill-Down

From Team Status Today, a Manager can open a member's details, which surface that member's recent attendance history (columns include Date, In Time, Out Time, Effective Hours, Late minutes, Overtime minutes, and Status). This maps to the member attendance history and summary endpoints described in the Attendance & Leave Management document.

## 7. Permission Behavior

- All dashboard data is limited to the Manager's **direct reports**.
- Each panel depends on its area's subscription feature; if an area is not in the plan, that panel's data is unavailable.
- Approve/reject/resolve actions carry the same rules as the underlying workflows (no self-approval of leave; no acting outside the reporting line).

## 8. Empty States

- With no direct reports, team panels are empty; the dashboard shows "No team records" and "No recent records" where a table has no rows.
- Empty pending queues mean nothing awaits the Manager's decision.

## 9. Limitations

- The dashboard is an **operations console**, not an analytics dashboard.
- It shows **direct reports only**, never the whole organization.
- There are **no push notifications**; the Manager discovers pending work by opening the queues.

## 10. Not Present on the Manager Dashboard

The following, described in older planning material, are **not** part of the actual Manager dashboard:

- Headcount KPI tile and headcount trend chart.
- Attrition rate KPI and attrition breakdown chart.
- Attendance heatmap.
- Company announcements feed.
- Low-attendance and high-attrition alerts with configurable thresholds.
- Birthday / work-anniversary reminders.
- "Interviews Today" quick link (no recruitment feature exists).
- Dismissible/acknowledgeable alerts.
- Chart filters by department or location.

## 11. Related Manager Features

- **Attendance & Leave Management** — the workflows behind the pending queues and team status; see that document.
- **Payroll & Compensation** — the Team Payroll workspace reached from here; see that document.
- **HRMS Manager Panel** — the overall capability index; see the HRMS Manager Panel document.

## 12. Terminology

| Term | Definition | Also called |
| --- | --- | --- |
| Manager Workspace | The Manager dashboard landing screen | Manager dashboard |
| Pending queue | A list of requests awaiting the Manager's decision | Approval queue |
| Team Status Today | The current-day team attendance roll-up | Today's team status |
| Anomaly | A flagged attendance irregularity | Attendance exception |

## 13. Common Manager Questions

### What do I see when I log in as a Manager?
The Manager Workspace dashboard: a team attendance trend, Team Status Today, Active Anomalies, and four pending-approval queues (regularizations, overtime, comp-offs, leave), plus a link to the Team Payroll workspace.

### Where do I see attrition rate or headcount trends?
Nowhere — those KPIs are not part of the Manager dashboard. The dashboard is an operations console focused on team attendance and approvals, not workforce analytics.

### Where are company announcements?
There is no announcements feed on the Manager dashboard; announcement functionality is not implemented.

### How do I know which requests need my approval?
The dashboard's pending queues (Pending Regularizations, Pending Overtime, Pending Comp Offs, Pending Leave Requests) list what awaits your decision. There are no notifications.

### How do I get to team payroll?
Use "Open Payroll Workspace" in the Team Payroll Management section to reach the Team Payroll page.

### Why is my dashboard empty?
If you have no active direct reports, the team panels are empty ("No team records"). Otherwise, empty queues simply mean nothing is awaiting your decision.

## 14. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| Headcount / Attrition Rate KPI tiles with trend arrows | Not present; no such KPI tiles on the Manager dashboard |
| Headcount trend, attrition breakdown, attendance heatmap charts | Not present; the dashboard shows a team attendance trend only |
| Company announcements and configurable alerts | Not present; no announcements or alert-threshold feature |
| Birthday / work-anniversary reminders | Not present |
| "Interviews Today" quick link | Not present; no recruitment feature exists |
| Dismissible alerts, chart filters by department/location | Not present |
| Branding/colors/fonts and starter-template recommendations | Removed — pre-development template content, not product behavior |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** The reference Manager Workspace prototype (`manager_dashboard.html`) and the attendance/leave/payroll manager endpoints it calls.

**Confirmed present:** Team attendance trend, Team Status Today (team size / present / absent-on-leave / late), Active Anomalies with Resolve, four pending queues (regularizations, overtime, comp-offs, leave) with Review/Approve/Reject, Team Payroll Management entry point, My Attendance and Log Out.
**Confirmed absent:** Headcount/attrition KPIs and charts, attendance heatmap, announcements, alert thresholds, birthday reminders, Interviews Today, dismissible alerts, chart filters.
**Could not be verified (excluded from this document):** Exact chart rendering details of the attendance trend beyond that it is driven by month/year team graph data.

---
title: "Notifications & Alerts — Availability Status for the Manager Role"
role: "manager"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Notifications.md"
last_verified: "2026-09-10"
tags: ["manager notifications", "alerts", "in-app notification", "email alert", "reminders", "notification centre", "pending approvals", "birthday reminder", "not available", "not implemented"]
---

# Notifications & Alerts — Availability Status for the Manager Role

**Document Information**
Role: Manager · Availability: Not currently available (no notification feature) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. This document states the verified availability of notifications
> and alerts for the Manager role.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Notifications & Alerts for a Manager

**Status: Not currently available.** There is no notification or alert feature for the Manager role. A Manager does not receive in-system alerts or a notification feed, and there are no configurable alert thresholds, low-attendance/high-attrition alerts, payroll-discrepancy alerts, or birthday/anniversary reminders, because **no notification feature is implemented**.

## 2. How a Manager Actually Discovers Pending Work

Because there are no notifications, a Manager finds work awaiting action by **opening the Manager Dashboard** and checking its pending queues — Pending Regularizations, Pending Overtime, Pending Comp Offs, and Pending Leave Requests — and their own payroll proposals list. Work is **pulled** (the Manager looks) rather than **pushed** (the system alerts). This is the correct answer to "how does a Manager know a request is waiting?": check the dashboard, not an inbox.

## 3. What This Means for a Manager Today

- No in-app notification centre or alert feed.
- No email/SMS/push alerts to the Manager for leave requests, attendance exceptions, or payroll items.
- No configurable alert thresholds.
- No birthday or work-anniversary reminders.
- No notification of a proposal's approval/rejection outcome — the Manager checks their proposals list.

## 4. Capabilities Described in Planning Documents but Not Implemented

The following were described in older material and are **not** available to a Manager:

- Email and in-system alerts for leave requests.
- Attendance-exception alerts.
- Payroll-discrepancy alerts.
- Birthday and work-anniversary reminders.

## 5. A Note on Transactional Email

The platform includes an email capability used for **transactional** purposes tied to specific flows (such as invitations and one-time passcodes during authentication/onboarding). This is not a Manager notification feature: it is not an alert feed, it is not configurable by a Manager, and it does not push manager-facing alerts about team approvals. Any manager-facing alerting about pending approvals or outcomes does not exist.

## 6. Where Related Needs Are Handled Today

There is no notification feature. A Manager relies on the dashboard's pending queues (see Dashboard Overview) to discover team requests, and on their own proposals list (see Payroll & Compensation) to track compensation outcomes.

## 7. Related Manager Documents

- **Dashboard Overview** — the pending queues that stand in for notifications.
- **Attendance & Leave Management** — the approval queues a Manager monitors.
- **Payroll & Compensation** — where a Manager checks proposal outcomes.
- **HRMS Manager Panel** — the overall capability index.

## 8. Common Manager Questions

### Do I get notified when a team member requests leave?
No. There are no notifications. Open the Manager Dashboard's Pending Leave Requests queue to see what is waiting.

### Is there an in-app notification centre for Managers?
No. There is no notification feed or alert centre in the platform.

### Will I be alerted about low attendance or high attrition?
No. There are no configurable alerts or thresholds; those were planned but are not implemented.

### Do I get an email when HR approves my salary proposal?
There is no manager-facing notification of proposal outcomes. Check your proposals list in the Team Payroll workspace to see the outcome.

### Are there birthday or anniversary reminders?
No. Those reminders are not implemented.

### The system sends some emails — isn't that notifications?
Those are transactional emails tied to specific flows like invitations and one-time passcodes. They are not a Manager notification or alert feature.

## 9. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| Email & in-system alerts for leave requests | Not implemented; discover via the dashboard queues |
| Attendance-exception alerts | Not implemented |
| Payroll-discrepancy alerts | Not implemented |
| Birthday & work-anniversary reminders | Not implemented |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code, including the email utilities and background jobs, and route definitions across the mounted modules.

**Confirmed unavailable:** In-app notification centre, alert feed, configurable thresholds, attendance/payroll alerts, birthday/anniversary reminders, proposal-outcome notifications.
**Confirmed to exist but different:** Transactional email tied to specific flows (e.g., invitations, one-time passcodes); not a Manager notification feature.
**Discovery mechanism that does exist:** The Manager Dashboard's pending queues, checked by the Manager.
**Could not be verified (excluded from this document):** None.

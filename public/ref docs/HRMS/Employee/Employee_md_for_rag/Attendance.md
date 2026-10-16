---
title: "Attendance & Time Tracking — Employee Guide"
role: "employee"
module: "attendance"
status: "implemented"
ui_available: "partial"
source_document: "Attendance.md"
last_verified: "2026-09-10"
tags: ["clock-in", "clock-out", "punch", "mark attendance", "break", "regularization", "attendance correction", "comp-off", "overtime", "anomaly", "shift", "holidays", "geofencing", "attendance summary"]
---

# Attendance & Time Tracking — Employee Guide

**Document Information**
Role: Employee · Module: Attendance · Availability: Implemented · User interface: Partial (reference dashboard) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Attendance & Time Tracking Does for an Employee

Attendance & Time Tracking lets an employee record their working time and review their own attendance. An employee can clock in and clock out for the day (also called punch in and punch out, or marking attendance), record breaks, view today's status and past history, request a correction when a punch was missed or wrong, and view their shift, holidays, overtime, compensatory-off balance, and any attendance anomalies logged for review.

## 2. Availability and Access for the Employee Role

Attendance is **implemented and available** to the Employee role. It is one of the most complete employee features in the platform.

Access depends on two things:

- **Role:** the employee role can reach every attendance capability described here.
- **Subscription entitlement:** attendance is a subscription-gated module. If an organization's plan does not include attendance, the system reports that the feature is not available on the current subscription plan (the underlying code is `FEATURE_NOT_AVAILABLE`), and no attendance action will work. This is an organization-level limitation, not an error the employee can fix.

**User interface:** partial. A reference Employee Dashboard prototype provides screens for today's attendance, recent punch history, regularization requests, the monthly snapshot and trend, the current week, and a daily-log view. Capabilities beyond those screens are available through the platform but do not yet have a dedicated screen.

## 3. Where to Find Attendance & Time Tracking

In the reference Employee Dashboard prototype, attendance appears as Today's Attendance, Recent Punch History, a Regularization Requests area with a request form, a Monthly Snapshot, a Monthly Trend, a This Week view, and a Daily Log view. For capabilities without a prototype screen — overtime, anomalies, compensatory-off, holidays, and the assigned shift — the capability is available through the platform's Employee self-service interface, and a dedicated screen has not yet been released.

## 4. Capabilities Available to an Employee in Attendance

| Capability | Status | Notes |
| --- | --- | --- |
| Clock in / clock out | Available | Reference dashboard screen exists |
| Start / end a break | Available (API only — no screen yet) | No dedicated prototype screen |
| View today's attendance | Available | On the dashboard |
| View attendance history | Available | On the dashboard |
| View the daily log for a date | Available | Daily Log view |
| View the weekly calendar | Available | This Week view |
| View monthly summary and trends | Available | Monthly Snapshot and Trend |
| Submit a regularization (correction) | Available | Request form on the dashboard |
| Track and cancel a regularization | Available | Cancel allowed while pending only |
| View overtime records | Available (read-only) | Granted by HR/Manager; view only |
| View attendance anomalies | Available (read-only) | Filter by open / resolved / all |
| View compensatory-off balance and records | Available (read-only) | Granted by HR/Manager; view only |
| View applicable holidays | Available (API only — no screen yet) | View only |
| View the assigned shift | Available (API only — no screen yet) | View only |

## 5. Clocking In for the Day

An employee clocks in once to start the working day (punch in / mark attendance / check in for the day).

1. The employee starts a clock-in. Location coordinates may optionally be included.
2. The system records the punch and opens the day's attendance record.
3. If the employee is already clocked in, the system refuses a second clock-in for the same day.
4. If a shift from an earlier day was never closed, the system refuses the new clock-in until the earlier shift is clocked out.

Sharing location is optional. A punch is **never rejected because of location** — see Section 8 for how out-of-area punches are handled.

## 6. Clocking Out

An employee clocks out to end the working day (punch out / sign out for the day). The system records the clock-out and calculates the day's worked hours, which feed into other parts of the platform such as payroll. An employee cannot clock out without having clocked in, and the clock-out time cannot be earlier than the clock-in time.

## 7. Starting and Ending a Break

An employee can record a break during the working day.

1. Starting a break requires being clocked in.
2. Only one break can be active at a time; a second start is refused while a break is running.
3. Ending a break requires an active break to be running.
4. An organization may set a maximum number of breaks per day; beyond that limit the system refuses a new break.

## 8. How Location and Geofencing Affect a Punch

If an organization has configured work locations, the platform checks a punch's location, but **the punch always succeeds** — location is never a reason to reject attendance. The outcomes are:

| Situation | What happens | What the employee should know |
| --- | --- | --- |
| Location not shared while location checks are active | Punch is recorded | An anomaly is logged for the organization to review |
| Location outside all valid work areas | Punch is recorded | An anomaly is logged for the organization to review |
| Location inside a valid work area | Punch is recorded | No anomaly |
| No work locations configured | Punch is recorded | Location checks are skipped |

The correct understanding is: an out-of-area or location-less punch **is recorded**, and an attendance anomaly is logged for the organization to review. The attendance itself is not blocked.

## 9. Viewing Today's Attendance, History, Daily Log, Week, and Summary

An employee can review their own attendance in several ways:

- **Today's attendance** shows the current day's punch status.
- **Attendance history** lists past records and can be filtered by a date range, with paging.
- **The daily log** shows the detail for one specific date.
- **The weekly calendar** shows the current week around a chosen date.
- **The monthly summary and trends** show totals such as worked hours, late arrivals, early departures, working days, absences, and holidays, and a multi-month trend (by default the last three months).

These are all read-only views of the employee's own data.

## 10. Submitting a Regularization Request

A regularization is an attendance correction (a missed-punch request, or a fix for a wrong timing).

1. The employee selects the date to correct and supplies a corrected clock-in time, a corrected clock-out time, or both. At least one of the two is required.
2. The employee provides a reason (required, between 5 and 1000 characters).
3. The request is submitted for review and starts in the **pending** state.
4. A reviewer (a manager or HR) approves or rejects it. On approval, the attendance record is recalculated.

Regularization must be enabled by the organization's attendance policy, and a date can only be corrected within the organization's regularization window (older dates are refused). Only one pending regularization can exist per date.

## 11. Tracking and Cancelling a Regularization Request

An employee can list their own regularization requests and filter them by status (pending, approved, rejected, cancelled, or all). An employee may **withdraw (cancel) a regularization request only while it is still pending**. Once a request has been approved or rejected, it can no longer be cancelled, and the system reports that the request is already processed. An employee can only withdraw their own requests.

## 12. Viewing Overtime, Anomalies, Compensatory-Off, Holidays, and Shift

- **Overtime:** an employee can view their own overtime records. Overtime is read-only for an employee — it is calculated and granted by the organization, not requested by the employee.
- **Anomalies:** an employee can view attendance anomalies logged against their records and filter them by open, resolved, or all. See Section 14 for what each anomaly type means.
- **Compensatory-off (comp-off / compensatory leave):** an employee can view their compensatory-off balance and records. Comp-off is read-only for an employee; comp-off credits are granted by HR or a manager, and there is no employee-facing comp-off request in attendance.
- **Holidays:** an employee can view the holidays that apply to them.
- **Assigned shift:** an employee can view their assigned shift.

## 13. Fields and Input Rules for Clocking In, Clocking Out, and Breaks

**Clock-in**

| Field | Purpose | Required | Type | Allowed values | Default | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| Source | Where the punch came from | No | Text | web, mobile, api | web | — |
| Latitude | Location latitude | No | Number | −90 to 90 | none | May be left blank |
| Longitude | Location longitude | No | Number | −180 to 180 | none | May be left blank |
| Client timestamp | Device time of the punch | No | Date-time | ISO date-time | none | — |
| Notes | Free note on the punch | No | Text | up to 500 characters | none | May be blank |
| Work mode | How the employee is working | No | Text | office, remote, field, hybrid | none | May be left blank |

**Clock-out** takes the same fields as clock-in except that it does not take a work mode.

**Break start / break end**

| Field | Purpose | Required | Type | Allowed values | Rules |
| --- | --- | --- | --- | --- | --- |
| Source | Where the action came from | No | Text | web, mobile, api | Default web |
| Notes | Free note on the break | No | Text | up to 500 characters | May be blank |

## 14. Fields and Input Rules for a Regularization Request

| Field | Purpose | Required | Type | Allowed values | Rules |
| --- | --- | --- | --- | --- | --- |
| Date | The date being corrected | **Yes** | Date | ISO date | — |
| Requested clock-in | Corrected clock-in time | Conditional | Time or date-time | e.g. 09:30 | At least one of clock-in / clock-out required |
| Requested clock-out | Corrected clock-out time | Conditional | Time or date-time | e.g. 18:30 | At least one of clock-in / clock-out required |
| Reason | Why the correction is needed | **Yes** | Text | 5 to 1000 characters | — |
| Work mode | How the employee was working | No | Text | office, remote, field, hybrid | May be left blank |

## 15. Statuses in Attendance and What They Mean

**Regularization request statuses**

| Status | Meaning for the employee | What happens next | Can the employee act |
| --- | --- | --- | --- |
| Pending | Submitted, awaiting review | A manager or HR reviews it | Can cancel |
| Approved | Accepted; attendance recalculated | Correction applied | No further action |
| Rejected | Not accepted | Correction not applied | No further action |
| Cancelled | Withdrawn by the employee | None | No further action |

**Compensatory-off statuses**

| Status | Meaning for the employee |
| --- | --- |
| Earned | Comp-off credited but not yet approved |
| Approved | Comp-off confirmed and usable |
| Used | Comp-off has been consumed |
| Expired | Comp-off lapsed before use |
| Cancelled | Comp-off credit was cancelled |

## 16. Anomaly Types in Attendance and What They Mean

An employee can see all of the following anomaly types on their own records. An anomaly is a flag for the organization to review; it does not, by itself, block attendance.

| Anomaly | Plain meaning |
| --- | --- |
| Missing clock-out | Clocked in but did not clock out |
| Late arrival | Arrived later than the allowed grace period |
| Early exit | Left before the shift end |
| Excessive break | Total break time exceeded the organization's limit |
| Insufficient hours | Worked less than the half-day minimum |
| Missing coordinates | Location was not shared while location checks were active |
| Out of bounds | Location was outside all valid work areas |
| Auto clock-out | The system closed a shift that was left open |
| Unauthorized absence | No attendance recorded when it was expected |

## 17. Rules and Restrictions That Apply to Attendance

- An employee can clock in **once per day**; a second clock-in for the same day is refused.
- A new day's clock-in is refused while a shift from an earlier day is still open — the earlier shift must be clocked out first.
- Clock-out cannot be earlier than clock-in; a break cannot start before clock-in or end before it started.
- Breaks may be capped in number by the organization.
- Regularization must be enabled by the organization, is limited to a configured number of recent days, and allows only one pending request per date.
- A regularization can be cancelled only while pending.
- Overtime and compensatory-off are granted by the organization; an employee can view them but cannot request them in attendance.
- Location sharing is optional and never blocks a punch.

## 18. Error Messages in Attendance and How to Resolve Them

The messages below are shown as the system returns them. Each significant one is explained beneath.

| Message | Underlying code |
| --- | --- |
| Already clocked in for today | ALREADY_CLOCKED_IN |
| Attendance record already completed for today | ALREADY_COMPLETED |
| Shift from <date> is still open. Clock out before starting a new shift | PREVIOUS_SHIFT_OPEN |
| Not clocked in. <action> | NOT_CLOCKED_IN |
| Clock-out time cannot be before clock-in time | INVALID_CLOCK_OUT_TIME |
| A break is already active | BREAK_ALREADY_ACTIVE |
| No active break to end | NO_ACTIVE_BREAK |
| Maximum breaks for today exceeded | MAX_BREAKS_EXCEEDED |
| Regularization is disabled by policy | REGULARIZATION_DISABLED |
| Cannot regularize dates older than <N> days | INVALID_REGULARIZATION_DATE |
| A pending regularization request already exists for this date | ALREADY_PENDING |
| Request is already processed | ALREADY_PROCESSED |

### You are already clocked in for today
This appears when an employee tries to clock in a second time on the same day. The system reports it as ALREADY_CLOCKED_IN. Only one clock-in per day is allowed; if the day is already open, the employee should clock out instead.

### A shift from an earlier day is still open
This appears when a previous day's shift was never clocked out and the employee tries to start a new day. The system reports it as PREVIOUS_SHIFT_OPEN and names the earlier date. The employee must clock out of the earlier shift before clocking in again.

### You are not clocked in
This appears when an employee tries to clock out, start a break, or end a break without an open attendance record. The system reports it as NOT_CLOCKED_IN. The employee must clock in first.

### Maximum breaks for today exceeded
This appears when the number of breaks reaches the organization's per-day limit. The system reports it as MAX_BREAKS_EXCEEDED. No further breaks can be recorded that day.

### Regularization is disabled for your organization
This appears when the organization's attendance policy does not allow regularization. The system reports it as REGULARIZATION_DISABLED. The employee cannot submit corrections; contact HR about the policy.

### The date is too old to regularize
This appears when the correction date is older than the organization's allowed window. The system reports it as INVALID_REGULARIZATION_DATE and states the number of days. Corrections are only possible within that recent window.

### A pending regularization already exists for this date
This appears when the employee already has a pending correction for the same date. The system reports it as ALREADY_PENDING. Wait for the existing request to be reviewed, or cancel it first.

### This request is already processed
This appears when the employee tries to cancel a regularization that has already been approved or rejected. The system reports it as ALREADY_PROCESSED. Only a pending request can be cancelled.

## 19. Successful Outcomes in Attendance

- A successful clock-in opens the day's record; a successful clock-out records worked hours that feed downstream calculations such as payroll.
- A successful break start/end is reflected in the day's break time.
- A submitted regularization appears in the employee's list as pending; on approval the attendance record is recalculated.
- A cancelled regularization moves to cancelled and is no longer under review.

## 20. When No Data Is Shown in Attendance

- No history, overtime, comp-off, or anomalies appear if none have been recorded yet.
- A new employee, or a newly started period, will legitimately show empty lists.
- If the whole attendance area is unavailable, the organization's subscription plan may not include attendance (see Section 21).

## 21. Limitations of Attendance

- **Subscription gating:** all attendance capabilities require the organization's plan to include attendance. Without it, the system reports the feature is not available on the current plan (`FEATURE_NOT_AVAILABLE`).
- **Overtime and comp-off are view-only** for an employee; they are granted by the organization.
- **Comp-off cannot be requested** by an employee within attendance.
- **No in-platform alerts or notifications:** the platform does not push attendance reminders or approval alerts to the employee. Anomalies and request statuses are viewable when the employee looks, not pushed.

## 22. Not Currently Available in Attendance

- Biometric or facial-recognition clock-in as an employee capability is not available.
- A dedicated mobile app is not available.
- Real-time synchronization across multiple devices is not available.
- In-platform push notifications and alerts for attendance are not available.

## 23. Related Employee Features

- **Leave Management** — holidays and compensatory-off relate to leave; see the Leave Management document.
- **Payroll, Salary & Tax** — clock-out records worked hours that feed pay calculation; see the Payroll, Salary & Tax document.
- **Personal Dashboard** — surfaces several attendance views; see the Personal Dashboard document.

## 24. Terminology Used in Attendance

| Term | Definition | Also called |
| --- | --- | --- |
| Clock-in | Recording the start of the working day | Punch in, mark attendance, check in, sign in for the day |
| Clock-out | Recording the end of the working day | Punch out, sign out for the day |
| Regularization | A request to correct a missed or wrong punch | Attendance correction, missed-punch request |
| Anomaly | A flag raised on an attendance record for review | Attendance flag |
| Comp-off | Time off credited for extra work | Compensatory off, compensatory leave |
| Overtime | Extra worked time recognized by the organization | OT |
| Shift | The working schedule assigned to the employee | Roster |

## 25. Common Employee Questions About Attendance

### How do I mark my attendance for the day?
An employee marks attendance by clocking in at the start of the day and clocking out at the end. Clocking in is also called punching in or checking in. Only one clock-in is allowed per day.

### Can I clock in without sharing my location?
Yes. Sharing location is optional for attendance. The punch is recorded whether or not location is shared. If location checks are active and no location is shared, the attendance is still recorded and an anomaly is logged for the organization to review.

### I clocked in from outside the office — was my attendance rejected?
No. The punch was recorded. An out-of-area punch is never rejected; instead an attendance anomaly is logged for the organization to review. The attendance itself stands.

### Why was an anomaly logged against my attendance?
An anomaly flags something the organization may want to review — for example a missing clock-out, a late arrival, an early exit, an excessive break, insufficient hours, a location that was missing or outside the work area, an auto-closed shift, or an unexplained absence. An anomaly does not by itself cancel the attendance.

### How do I fix a missed or wrong punch?
Submit a regularization (an attendance correction) for the affected date, giving the corrected clock-in time, clock-out time, or both, and a reason. It goes to a manager or HR for approval. Regularization must be enabled by the organization and is limited to recent dates.

### I submitted a correction by mistake — can I take it back?
Yes, but only while it is still pending. An employee can withdraw (cancel) a regularization request that is pending. Once it has been approved or rejected, it can no longer be cancelled.

### How many leaves or breaks can I take — why was my break refused?
An organization can set a maximum number of breaks per day. Once that limit is reached, a new break is refused for that day. A break also cannot start unless the employee is clocked in, and only one break can be active at a time.

### How do I request a comp-off for working extra?
Compensatory-off cannot be requested by an employee in attendance. Comp-off credits are granted by HR or a manager; an employee can view their comp-off balance and records but not request them here.

### Where can I see my working hours, late arrivals, and monthly summary?
An employee can view today's attendance, attendance history, a daily log for a specific date, the weekly calendar, and a monthly summary and trend showing worked hours, late arrivals, early departures, working days, absences, and holidays.

### Why can't I use attendance at all?
If the whole attendance area is unavailable, the organization's subscription plan may not include attendance. The system reports the feature is not available on the current plan. Contact your HR administrator.

## 26. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| Clock-in via biometric devices and facial recognition | Not an employee capability in the platform |
| Mobile app access with GPS and geofencing | No mobile app exists; location is optional and never blocks a punch |
| Real-time capture and synchronization across all devices | Not verified; not documented as available |
| Real-time alerts and notifications for attendance | No in-platform push notifications; statuses and anomalies are viewable, not pushed |
| Regularization for half-day or full-day adjustments | Regularization corrects clock-in/clock-out times; it does not carry a half-day/full-day adjustment field |
| Out-of-area punches are blocked | Punches are always recorded; an anomaly is logged instead |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code, API documentation, and the reference Employee Dashboard prototype.

**Confirmed available:** Clock-in, clock-out, break start/end, today's attendance, history, daily log, weekly calendar, monthly summary and trends, regularization submit/track/cancel, overtime (read-only), anomalies (read-only), compensatory-off (read-only), holidays (read-only), assigned shift (read-only).
**Confirmed unavailable:** Employee biometric/facial-recognition clock-in, a dedicated mobile app, cross-device real-time sync, in-platform push notifications, employee-initiated comp-off requests.
**Available without a user interface:** Break start/end, overtime, anomalies, compensatory-off, holidays, and assigned-shift views (no dedicated prototype screen).
**Could not be verified (excluded from this document):** None.

---
title: "Personal Dashboard — Employee Guide"
role: "employee"
module: "composed"
status: "partial"
ui_available: "partial"
source_document: "Personal Dashboard Features.md"
last_verified: "2026-09-10"
tags: ["dashboard", "personal dashboard", "home screen", "today's attendance", "leave balance", "punch history", "monthly snapshot", "overview", "widgets"]
---

# Personal Dashboard — Employee Guide

**Document Information**
Role: Employee · Module: Dashboard (composed) · Availability: Partial · User interface: Partial (reference dashboard) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What the Personal Dashboard Does for an Employee

The Personal Dashboard is the reference Employee Dashboard prototype: a single screen that brings together an employee's attendance and leave information. It is a **composed** view — it does not have its own data or rules; each section belongs to another feature (mostly Attendance and Leave) and is described in full in that feature's document.

## 2. Availability and Access for the Employee Role

The Personal Dashboard exists as a **reference prototype**. What it shows is real and comes from the Attendance and Leave features, so it is available to the extent those features are — including their subscription gating (attendance and leave each require the organization's plan to include them).

**User interface:** partial. The dashboard prototype provides the sections listed in Section 4. Several capabilities described in older documentation — customizable widgets, notifications, announcements, calendar sync, greetings and productivity stats — do not exist.

## 3. Where to Find the Personal Dashboard

The Personal Dashboard is the reference Employee Dashboard prototype screen. It composes attendance and leave views into one place. For the rules behind any section, see that section's owning feature document.

## 4. What the Personal Dashboard Displays

Each section is a view of another feature. For detail, follow the pointer.

| Dashboard section | What it shows | Owning feature |
| --- | --- | --- |
| Today's Attendance | The current day's punch status | Attendance |
| Recent Punch History | Recent clock-in/out records | Attendance |
| Regularization Requests (with a New Request form) | Correction requests and a form to raise one | Attendance |
| Monthly Snapshot | The month's attendance totals | Attendance |
| Monthly Trend | Attendance trend over recent months | Attendance |
| This Week | The current week's attendance | Attendance |
| Daily Log | The detail for a specific date | Attendance |
| My Leave History | Leave requests and their status | Leave |
| My Leave Wallet (with an Apply for Leave form) | Leave balances and a form to apply | Leave |
| Leave request cancel action | Cancel a leave request | Leave |
| Log Out | Sign out of the session | Account |

## 5. Using the Dashboard Sections

The dashboard does not add any behavior of its own — using a section is the same as using that capability in its owning feature:

- Attendance sections (today, punch history, regularization, monthly snapshot and trend, this week, daily log) behave exactly as described in the Attendance document.
- Leave sections (leave history, leave wallet, apply form, cancel action) behave exactly as described in the Leave Management document.
- Log Out ends the current session.

## 6. Statuses on the Personal Dashboard

The dashboard shows statuses that belong to its source features — for example a regularization request's status (pending, approved, rejected, cancelled) and a leave request's status (pending, approved, rejected, cancelled, cancellation pending, terminated cancelled). Each status is defined in its owning feature's document: see the Attendance document for regularization statuses and the Leave Management document for leave statuses.

## 7. Limitations of the Personal Dashboard

- The dashboard is a **reference prototype**, not a finished production interface.
- It shows **only** attendance and leave; it does not surface payroll, profile, or any other feature.
- It has **no settings of its own** — it cannot be customized or rearranged.
- It depends on the Attendance and Leave features, including their subscription gating.

## 8. When No Data Is Shown on the Personal Dashboard

- A section is empty when its source feature has no data yet — for example no punches today, or no leave requests.
- If attendance or leave is not included in the organization's plan, the related sections will not function.

## 9. Not Currently Available on the Personal Dashboard

- Customizable or drag-and-drop widgets are not available.
- A dark/light theme switch or display preferences are not available.
- Real-time notifications and announcements are not available.
- Birthday and work-anniversary greetings are not available.
- A calendar view or calendar sync (for example with Outlook or Google Calendar) is not available.
- Pending tasks and deadlines are not available (there is no task feature).
- Personalized greetings, motivational tips, and productivity or goal statistics are not available.

## 10. Related Employee Features

- **Attendance & Time Tracking** — the source of most dashboard sections; see the Attendance document.
- **Leave Management** — the source of the leave sections; see the Leave Management document.
- **Employee Panel** — a directory of all employee features; see the Employee Panel document.

## 11. Terminology Used in the Personal Dashboard

| Term | Definition | Also called |
| --- | --- | --- |
| Personal Dashboard | The composed employee home screen | Dashboard, home screen |
| Leave wallet | The leave-balance section | Leave balance, remaining leaves |
| Punch history | The list of recent clock-in/out records | Attendance history |
| Snapshot | The month's attendance summary | Monthly summary |

## 12. Common Employee Questions About the Personal Dashboard

### What can I see on my dashboard?
The Personal Dashboard shows today's attendance, recent punch history, regularization requests (with a form to raise one), the monthly snapshot and trend, the current week, a daily log, leave history, and the leave wallet (with a form to apply for leave), plus a log-out option.

### Can I customize my dashboard or rearrange the widgets?
No. Customizable and drag-and-drop widgets are not available, and there is no theme or display preference. The dashboard shows a fixed set of attendance and leave sections.

### Why don't I see notifications or announcements on my dashboard?
Real-time notifications and announcements are not available in the platform. The dashboard does not show them.

### Can I see my payslip or profile on the dashboard?
No. The dashboard shows only attendance and leave. Payroll and profile are separate features — see the Payroll, Salary & Tax and Profile Management documents.

### Where are my pending tasks and calendar on the dashboard?
Tasks and a calendar view are not available; there is no task feature and no calendar sync. The dashboard does not show them.

### Why is a section on my dashboard empty?
A section is empty when its source feature has no data yet — for example if there are no punches today or no leave requests. If attendance or leave is not part of your organization's plan, those sections will not work.

## 13. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| Customizable drag-and-drop widgets and theme switch | Not available; the dashboard is a fixed set of sections |
| Real-time notifications and announcements | Not available |
| Birthday and work-anniversary greetings | Not available |
| Calendar view with Outlook/Google sync | Not available |
| Pending tasks and deadlines | Not available; no task feature |
| Personalized greetings, quotes, and productivity stats | Not available |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** The reference Employee Dashboard prototype and the Attendance and Leave source code it draws on.

**Confirmed available:** Attendance sections (today, punch history, regularization + form, monthly snapshot and trend, this week, daily log), leave sections (leave history, leave wallet + apply form, cancel), and log out.
**Confirmed unavailable:** Customizable widgets, themes, notifications, announcements, birthday/anniversary greetings, calendar view/sync, tasks, productivity stats.
**Available without a user interface:** Not applicable — the dashboard is itself the interface for the sections it composes.
**Could not be verified (excluded from this document):** None.

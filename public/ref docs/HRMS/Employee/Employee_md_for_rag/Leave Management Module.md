---
title: "Leave Management — Employee Guide"
role: "employee"
module: "leave"
status: "implemented"
ui_available: "partial"
source_document: "Leave Management Module.md"
last_verified: "2026-09-10"
tags: ["leave", "apply for leave", "leave balance", "leave wallet", "half-day", "leave types", "cancel leave", "leave status", "comp-off", "casual leave", "sick leave", "supporting document"]
---

# Leave Management — Employee Guide

**Document Information**
Role: Employee · Module: Leave · Availability: Implemented (self-service subset) · User interface: Partial (reference dashboard) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Leave Management Does for an Employee

Leave Management lets an employee apply for leave, check how many leaves they have left (the leave balance or leave wallet), see which leave types they are allowed to use, track the status of each request, and cancel a request. Which leave types exist, how many days are granted, and the rules that apply are all configured by the employee's organization.

## 2. Availability and Access for the Employee Role

Leave Management is **implemented and available** to the Employee role as a self-service subset (apply, view, track, cancel). Approving leave is done by managers or HR, not by the employee.

Access depends on:

- **Role:** the employee role can reach every leave capability described here.
- **Subscription entitlement:** leave is subscription-gated. If an organization's plan does not include leave, the system reports that the feature is not available on the current subscription plan (`FEATURE_NOT_AVAILABLE`), and no leave action will work.

**User interface:** partial. The reference Employee Dashboard prototype provides My Leave History, a My Leave Wallet (balance) view, an Apply for Leave form, and a cancel action.

## 3. Where to Find Leave Management

In the reference Employee Dashboard prototype, leave appears as My Leave Wallet (balances), My Leave History (requests and their status), an Apply for Leave form, and a cancel action on a request. The applicable leave types are drawn from the organization's configuration.

## 4. Capabilities Available to an Employee in Leave Management

| Capability | Status | Notes |
| --- | --- | --- |
| View leave balances | Available | Per leave type |
| View applicable leave types | Available | Configured per organization |
| Apply for leave | Available | Full-day and half-day |
| Track request status | Available | My Leave History |
| View a single request's detail | Available | — |
| Cancel a request | Available | Immediate or needs approval — see Section 7 |
| Approve leave | Not available to employees | Done by a manager or HR |
| Encash leave | Not available to employees | Not an employee capability |
| Export leave history | Not available | No export capability |

## 5. Applying for Leave — Step-by-Step

1. The employee checks their leave balance for the relevant leave type (optional but recommended).
2. The employee opens the apply form and selects a leave type from those their organization makes available to them.
3. The employee sets a start date and an end date. The end date cannot be earlier than the start date, and the whole request must fall within a single calendar year.
4. For a single day, the employee may mark it a half-day and choose the first half or the second half.
5. The employee may add a reason, and — where the leave type requires supporting evidence — a link to a supporting document.
6. The employee submits. On success the system reports "Leave request submitted successfully" and the request starts in the **pending** state.
7. A manager or HR reviews the request. The approval steps are configured by the organization.

## 6. Checking Leave Balance and Applicable Leave Types

- **Leave balance (leave wallet / remaining leaves / leave quota):** an employee can view their current balance for each leave type. Balances update as requests are approved or cancelled. Carry-forward and lapse behavior is configured by the organization.
- **Applicable leave types:** an employee can view the leave types available to them. This list is **configured per organization** and is not a fixed universal set. The platform commonly supports types such as casual, sick, paid or earned, maternity or paternity, compensatory-off, and work-from-home, but only the types an organization enables — and for which the employee is eligible — will appear.

## 7. Cancelling a Leave Request — Two Outcomes

Cancelling a leave request does **not** always take effect immediately. The outcome depends on the request's current state:

| Starting state | What happens | Resulting status | Message shown |
| --- | --- | --- | --- |
| Pending | Cancelled immediately | Cancelled | "Leave request cancelled successfully" |
| Approved, start date is in the future | Cancelled immediately; balance refunded | Cancelled | "Leave request cancelled successfully" |
| Approved, leave has already started (or started today/past) | Requires manager approval | Cancellation pending | "Cancellation pending manager approval" |

An employee who cancels an already-started approved leave enters **cancellation pending** and must wait for a manager to approve the cancellation. A request in any other state cannot be cancelled, and the system reports that a request with that status cannot be cancelled.

## 8. Fields and Input Rules for the Leave Application Form

| Field | Purpose | Required | Type | Allowed values | Default | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| Leave type | Which leave to apply for | **Yes** | Selection | A type available to the employee | none | Must be one the organization allows the employee |
| Start date | First day of leave | **Yes** | Date | YYYY-MM-DD | none | — |
| End date | Last day of leave | **Yes** | Date | YYYY-MM-DD | none | Not earlier than start date; same calendar year |
| Half-day | Whether it is a half day | No | Yes/No | true / false | false | Half-day allowed for a single day only |
| Half-day part | Which half of the day | Conditional | Selection | first half, second half | none | Required when half-day is set; not allowed otherwise |
| Reason | Why leave is needed | No | Text | up to 1000 characters | none | May be blank |
| Supporting document | Link to evidence | No | Web link | a valid URL, up to 255 characters | none | A link only — not a file upload |

Two points that are often misunderstood:

- **Only full-day and half-day leave exist.** There is no hourly leave.
- **A supporting document is a web link, not an upload.** The employee supplies a link to a document that is already hosted somewhere; the platform does not accept an uploaded file here.

## 9. Statuses in Leave Management and What They Mean

| Status | Meaning for the employee | What happens next | Can the employee act |
| --- | --- | --- | --- |
| Pending | Submitted, awaiting review | A manager or HR reviews it | Can cancel |
| Approved | Leave is granted | Balance is committed | Can request cancellation |
| Rejected | Leave was not granted | None | No further action |
| Cancelled | Request was cancelled | Balance refunded if it was approved-and-future | No further action |
| Cancellation pending | Cancellation of an already-started approved leave awaits manager approval | A manager decides | Wait for the decision |
| Terminated cancelled | The leave was ended/cancelled through a termination path | None | No further action |

## 10. Rules and Restrictions That Apply to Leave

These rules are enforced when an employee applies, depending on how the organization has configured the leave type:

- **Eligibility by profile:** some leave types are restricted by gender or marital status (see Section 11).
- **Notice period:** a leave type may be blocked during an employee's notice period, or capped to a maximum number of days during it.
- **Probation:** a leave type may require a minimum number of days of employment before it can be used.
- **Supporting document threshold:** if a continuous absence of the same type exceeds the type's threshold, a supporting-document link is required. Splitting one long absence into smaller requests does not avoid this.
- **Single calendar year:** a request's start and end date must be in the same calendar year; a span across a year-end must be submitted as two requests.
- **Half-day:** only for a single day.
- **Comp-off:** compensatory-off leave can be applied for only a single full day at a time.
- **Overlap:** a request that conflicts with an existing full-day or matching half-day leave on the same dates is refused.
- **Sandwich rule:** an adjacent leave separated only by non-working days may be blocked so it must be submitted as a single unified request.
- **Deductible days:** the selected range must contain at least one deductible working day.

## 11. Leave Blocked Because of Profile Eligibility

Some leave types are restricted to certain employees based on gender or marital status. When this applies:

### A leave type is restricted and the required profile detail is missing
This appears when the leave type has eligibility restrictions based on gender or marital status and that detail is not recorded on the employee's profile. The system reports this as DEMOGRAPHIC_PROFILE_INCOMPLETE. The employee **cannot add gender or marital status themselves** — those fields are not employee-editable (see the Profile Management document). The employee must contact HR to have the detail recorded, then apply again.

### The employee is not eligible for this leave type
This appears when the employee's recorded gender or marital status is not in the leave type's allowed set. The system reports this as DEMOGRAPHIC_INELIGIBLE. The employee is not eligible to apply for that leave type.

## 12. Error Messages in Leave Management and How to Resolve Them

The messages below are shown as the system returns them.

| Message | Meaning |
| --- | --- |
| This leave type has eligibility restrictions, but your profile is incomplete. Please contact HR. | Profile detail missing — contact HR |
| This leave type is restricted by gender, but your gender is not on file. Please contact HR. | Gender not recorded — contact HR |
| This leave type is restricted by marital status, but your marital status is not on file. Please contact HR. | Marital status not recorded — contact HR |
| You are not eligible to apply for this leave type. | Not in the eligible group |
| This leave type cannot be applied for during your notice period. | Blocked during notice period |
| Half-day leaves can only be applied for a single day. | Half-day is single-day only |
| Comp-off leave can only be applied for a single full day at a time. | Comp-off is one full day |
| A conflicting full-day leave request already exists for these dates. | Overlapping request |
| The selected date range does not contain any deductible working days. | No working days to deduct |

### A supporting document is required
This appears when a continuous same-type absence exceeds the leave type's document threshold and no document link was provided. The system reports it as DOCUMENT_REQUIRED and names the day count. Add a link to a supporting document and apply again.

### The request crosses a calendar year
This appears when the start date and end date fall in different calendar years. The system reports a Cross-Year Constraint and asks for two separate requests — one ending on 31 December and one starting on 1 January.

### A probation restriction blocks this leave type
This appears when the leave type requires a minimum period of employment that the employee has not yet completed. The system reports a Probation Restriction and states the number of days required.

### A notice-period cap has been reached
This appears when the employee has reached the maximum days of this leave type allowed during their notice period. The system reports it as NOTICE_PERIOD_RESTRICTED and states how many days remain.

### The adjacent-leave (sandwich) rule blocks this request
This appears when the employee has an adjacent leave separated only by non-working days. The system asks the employee to cancel the adjacent request and submit one unified request covering the whole range.

### No compensatory-off is available to redeem
This appears when applying for comp-off leave with no comp-off left to use. The system reports that there is no available comp-off to redeem — it may have expired or already been used.

## 13. Successful Outcomes in Leave Management

- A submitted request appears in My Leave History as pending, with the message "Leave request submitted successfully".
- On approval, the leave is granted and the balance is committed.
- A cancelled pending request, or a cancelled approved-and-future request, moves to cancelled; for the approved-and-future case, the balance is refunded.
- A cancellation of an already-started approved leave moves to cancellation pending until a manager decides.

## 14. When No Data Is Shown in Leave Management

- No requests appear if the employee has not applied for any leave.
- No leave types appear if the organization has not made any available to the employee, or the employee is not eligible for any.
- A zero balance is legitimate for a leave type the employee has fully used or has not been granted.
- If the whole leave area is unavailable, the organization's plan may not include leave (see Section 15).

## 15. Limitations of Leave Management

- **Subscription gating:** all leave capabilities require the organization's plan to include leave; otherwise the system reports the feature is not available on the current plan (`FEATURE_NOT_AVAILABLE`).
- **No hourly leave** — only full-day and half-day.
- **Supporting documents are links, not uploads.**
- **Leave encashment is not an employee capability** — there is no employee action for it.
- **Leave history cannot be exported** by the employee.
- **No in-platform notifications or alerts** — the platform does not push email, SMS, or in-app leave alerts to the employee; statuses are viewable when the employee looks.
- **Leave types are not a fixed list** — they are configured per organization.

## 16. Not Currently Available in Leave Management

- Hourly leave is not available.
- Uploading a supporting file (as opposed to providing a link) is not available.
- Leave encashment by the employee is not available.
- Exporting leave history is not available.
- Email, SMS, or in-app leave notifications and reminders are not available.

## 17. Related Employee Features

- **Attendance & Time Tracking** — holidays and compensatory-off originate in attendance; see the Attendance document.
- **Profile Management** — gender and marital status affect leave eligibility and are not employee-editable; see the Profile Management document.
- **Personal Dashboard** — surfaces the leave wallet and leave history; see the Personal Dashboard document.

## 18. Terminology Used in Leave Management

| Term | Definition | Also called |
| --- | --- | --- |
| Leave balance | Days of a leave type an employee has left | Leave wallet, remaining leaves, leave quota |
| Leave type | A category of leave the organization configures | — |
| Leave request | A single application for leave | Leave application |
| Half-day | A leave for the first or second half of one day | — |
| Comp-off | Leave taken against extra work credited | Compensatory off, compensatory leave |
| Cancellation pending | A cancellation of a started approved leave awaiting a manager | — |

## 19. Common Employee Questions About Leave Management

### How do I apply for leave?
An employee applies by opening the apply form, choosing a leave type the organization allows them, setting a start and end date (in the same calendar year), optionally marking a single day as a half-day, adding a reason, and submitting. The request starts as pending and is reviewed by a manager or HR.

### How many leaves do I have left?
An employee can view their leave balance (leave wallet) for each leave type. The balance shows the remaining leaves and updates as requests are approved or cancelled.

### Which types of leave can I take?
The available leave types are configured by the organization and only the ones enabled for the employee — and for which the employee is eligible — will appear. There is no fixed universal list.

### Can I apply for two hours of leave?
No. Only full-day and half-day leave exist; there is no hourly leave. A half-day can be applied for a single day, as either the first half or the second half.

### How do I attach my medical certificate to a leave request?
An employee can attach a supporting document as a web link (a URL to a document already hosted somewhere), where the leave type requires it. It is a link, not a file upload — the platform does not accept an uploaded file on the leave form.

### I cancelled my approved leave but it still shows pending — why?
Cancelling an already-started approved leave does not take effect immediately. It moves to cancellation pending and requires a manager to approve the cancellation. Cancelling a pending request, or an approved leave that has not yet started, takes effect immediately.

### Why does it say my profile is incomplete when I apply for this leave?
The leave type has eligibility restrictions based on gender or marital status, and that detail is not on the employee's profile (reported as DEMOGRAPHIC_PROFILE_INCOMPLETE). These fields are not employee-editable — contact HR to have them recorded, then apply again.

### Why can't I apply for leave across the new year?
A single request must stay within one calendar year. A leave that spans a year-end must be submitted as two requests: one ending 31 December and one starting 1 January.

### Why was my leave blocked by a "sandwich rule"?
The employee has an adjacent leave separated only by non-working days. The system asks the employee to cancel the adjacent request and submit a single unified request that covers the entire range.

### Who approves my leave?
A manager or HR reviews leave requests; the exact approval steps are configured by the organization. An employee cannot approve their own leave.

### Why can't I use leave at all?
If the whole leave area is unavailable, the organization's subscription plan may not include leave. The system reports the feature is not available on the current plan. Contact your HR administrator.

## 20. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| Full day, half day, or hourly leave | Only full-day and half-day; no hourly leave |
| Upload supporting documents (e.g. medical certificate) | A document is attached as a web link, not an uploaded file |
| Fixed leave types: CL, SL, PL/EL, Maternity/Paternity, Comp-off, WFH | Leave types are configured per organization; not a fixed universal list |
| Export leave history for any date range | No export capability exists for the employee |
| Email/SMS/system alerts and reminders | No in-platform notifications; statuses are viewable, not pushed |
| Leave encashment (employee-managed) | No employee capability; not available to the employee |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code, API documentation, and the reference Employee Dashboard prototype.

**Confirmed available:** View leave balances, view applicable leave types, apply for leave (full-day and half-day), track request status, view a single request, cancel a request (immediate or cancellation-pending).
**Confirmed unavailable:** Hourly leave, file upload of supporting documents, leave encashment by the employee, export of leave history, in-platform leave notifications.
**Available without a user interface:** All leave capabilities are available; the reference dashboard covers balances, history, the apply form, and cancellation.
**Could not be verified (excluded from this document):** The exact number of approval stages an organization configures (documented only as "reviewed by a manager or HR").

---
title: "Employee Panel — Overview and Directory"
role: "employee"
module: "overview"
status: "partial"
ui_available: "partial"
source_document: "Employee panel.md"
last_verified: "2026-09-10"
tags: ["employee panel", "overview", "directory", "index", "self-service", "employee hub", "getting started", "invitation", "accept invitation", "join organization", "onboarding", "features list"]
---

# Employee Panel — Overview and Directory

**Document Information**
Role: Employee · Module: Overview / Index · Availability: Partial · User interface: Partial (reference dashboard) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What the Employee Panel Is

The Employee Panel is the collection of self-service capabilities available to an employee in the Dakshi HRMS platform: attendance, leave, payroll, profile, and account settings. This document is an **overview and directory** — it explains which capabilities exist, which do not, and where to read the full detail for each. It does **not** repeat the rules of any single feature; each feature has its own document.

This document also covers one thing that belongs to no other feature: **how an employee joins their organization through an invitation** (Section 5).

## 2. How to Use This Directory

Each capability below links to its own document. Use this page to find the right document; use that document for the actual rules, fields, and answers. Where a capability is **not currently available**, this page says so and points to the document that explains the correction in full, so you are not left looking for a feature that does not exist.

## 3. Available Employee Capabilities

These capabilities are implemented and available to the employee role (some are gated by the organization's subscription plan, as noted).

| Capability | What it covers | Subscription-gated | Full document |
| --- | --- | --- | --- |
| Personal Dashboard | A composed home view of attendance and leave | Follows attendance/leave | Personal Dashboard document |
| Profile Management | View your profile, edit a set of personal fields, search the directory | No | Profile Management document |
| Attendance & Time Tracking | Clock in/out, breaks, regularization, attendance views | Yes (attendance) | Attendance document |
| Leave Management | Apply for leave, track balances and status, cancel requests | Yes (leave) | Leave Management document |
| Payroll, Salary & Tax | View payslips, bank account, tax declarations and regime | Yes (payroll) | Payroll, Salary & Tax document |
| Settings & Preferences | Sign-in, password reset, organization switching | No | Settings & Preferences document |

## 4. Capabilities Described in Older Material That Are Not Available

The following were listed on an older Employee Panel page but are **not** part of the platform today. Each has its own document explaining the correction.

| Capability listed before | Status | Full document |
| --- | --- | --- |
| Document Management (upload/store documents, e-signatures) | Not available | Document Management document |
| Expense & Reimbursement (expense claims) | Not available | Expense & Reimbursement document |
| Performance & Appraisal (reviews, KPIs, self-assessment) | Not available | Performance & Appraisal document |
| Training & Development (courses, certifications) | Not available | Training & Development document |
| Communication & Collaboration (chat, announcements, surveys) | Not available | Communication & Collaboration document |
| Helpdesk & Support Tickets (raise/track tickets) | Not available | Helpdesk & Support Tickets document |

Some cross-cutting claims from older material are also **not accurate**: there are no real-time notifications or announcements, no customizable dashboard widgets, no mobile iOS/Android apps, and no in-app multi-factor-authentication toggle. See the Personal Dashboard and Settings & Preferences documents.

## 5. Joining Your Organization Through an Invitation

An employee does not sign themselves up into an organization; they are **invited** by their organization (by HR or a manager). Joining is the one onboarding step unique to the Employee Panel, so it is documented here.

### 5.1 How the invitation reaches you

Your organization sends an invitation to your email. The email contains a secure link to accept it. The link is what lets you join — keep it private, as it is tied to your invitation.

### 5.2 Accepting the invitation as a new user

If you do not yet have an account on the platform, accepting the invitation is how your account is created:

1. Open the invitation link from your email.
2. Set a password when prompted. A password is required to finish joining — if you do not provide one, the system reports "Password is required to complete registration".
3. Once accepted, your account becomes active and you are a member of the organization.

Your password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character (the same rule described in the Settings & Preferences document).

### 5.3 Accepting when you already have an account

If you already have a platform account (for example, you already belong to another organization), accepting the invitation adds the new organization to your account — you do not create a second account and you keep your existing password. If you open an invitation that was sent to a different account than the one you are signed in as, the system reports "This invitation was not sent to your account". If the invitation was already accepted, opening it again simply reports "Invitation has already been accepted" — nothing is duplicated.

### 5.4 Your reporting manager may be set automatically

If you are invited into a department that has a department head, the system may set that head as your reporting manager automatically. Your reporting manager is who reviews items such as your leave requests. You can see your reporting manager on your profile — see the Profile Management document.

### 5.5 When an invitation will not work

- **The link is invalid or expired.** An invitation link that is wrong or has expired is refused with "Invalid or expired invitation". Ask your organization to resend the invitation.
- **The organization is not active.** If the organization has been suspended or is no longer active, acceptance is refused with "This organization is suspended or no longer active".
- **The plan is full.** If the organization's subscription plan has no room for another employee, acceptance is refused with "Employee limit reached for this subscription plan". This is resolved by your organization, not by you.
- **The invitation was withdrawn.** Your organization can revoke an invitation before you accept it; a revoked link no longer works.

## 6. Which Capabilities Your Organization's Plan Must Include

Three capabilities depend on your organization's subscription plan:

- **Attendance** requires the plan to include attendance.
- **Leave** requires the plan to include leave.
- **Payroll** requires the plan to include payroll.

If a capability is not part of the plan, its features do not function for you, and the related actions are unavailable. Profile Management, Settings, and the Personal Dashboard's own shell are not separately gated (though the dashboard's attendance and leave sections follow those features' gating). Full detail is in each feature's document.

## 7. Limitations of the Employee Panel

- The panel is delivered as a backend API with a **reference dashboard prototype**; a full production interface is not yet released.
- Six capabilities listed in older material (documents, expenses, performance, training, communication, helpdesk) are **not available**.
- Attendance, leave, and payroll each depend on the organization's subscription plan.
- There are no real-time notifications, no mobile apps, and no customizable widgets.

## 8. Related Employee Features

- **Personal Dashboard** — the composed home view; see the Personal Dashboard document.
- **Profile Management** — your profile and the directory; see the Profile Management document.
- **Attendance & Time Tracking** — see the Attendance document.
- **Leave Management** — see the Leave Management document.
- **Payroll, Salary & Tax** — see the Payroll, Salary & Tax document.
- **Settings & Preferences** — sign-in, password, organization switching; see the Settings & Preferences document.
- **Core Functionalities of HRMS Services** — the capability availability summary; see that document.

## 9. Terminology Used in the Employee Panel

| Term | Definition | Also called |
| --- | --- | --- |
| Employee Panel | The set of self-service capabilities available to an employee | Employee self-service, employee hub |
| Invitation | The email link by which an organization adds you as a member | Invite |
| Accept invitation | Completing membership by opening the link and (if new) setting a password | Join organization |
| Reporting manager | The person who reviews items such as your leave | Manager |
| Subscription gating | A capability being available only if the organization's plan includes it | Plan gating |

## 10. Common Employee Questions About the Employee Panel

### What can I actually do in the Employee Panel?
You can use the Personal Dashboard, manage your profile and search the directory, track attendance, apply for and track leave, view your payslips and tax details, and handle sign-in and password through settings. Documents, expenses, performance, training, communication, and helpdesk are not available.

### How do I join my organization?
Your organization (HR or a manager) sends an invitation to your email. Open the link; if you are new, set a password to finish joining. If you already have an account, accepting adds the new organization to it.

### My invitation link says it is invalid or expired. What do I do?
Ask your organization to resend the invitation. An expired or incorrect link is refused with "Invalid or expired invitation", and a fresh invitation will provide a working link.

### Why do I need to set a password when joining?
If you are a brand-new user, setting a password creates your sign-in credential. Without it the system cannot complete registration and reports "Password is required to complete registration". If you already had an account, you keep your existing password.

### Why can't I find documents, expenses, performance, training, chat, or helpdesk?
These capabilities are not part of the platform today, even though older material listed them. See each feature's document for the specific correction.

### Do I need anything from my organization to use attendance, leave, or payroll?
Yes. Each of these depends on your organization's subscription plan including that capability. If it is not included, that feature will not function for you.

## 11. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| Full self-service including documents, expenses, performance, training, chat, helpdesk | Only attendance, leave, payroll, profile, dashboard, and settings are available |
| Real-time notifications and announcements | Not available |
| Customizable dashboard widgets | Not available |
| Available on web, iOS, and Android | Reference dashboard prototype only; no mobile apps |
| Multi-factor authentication toggle | No employee-facing MFA setting |
| Payslip and Form 16 downloads | Payroll data is returned as structured information, not downloadable files — see the Payroll document |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** The invitation acceptance flow in the organization module, the authentication routes, and the six feature documents this directory links to.

**Confirmed available:** Personal Dashboard, Profile Management, Attendance, Leave, Payroll, and Settings; joining via emailed invitation (new-user password set, existing-user organization add, automatic reporting-manager assignment).
**Confirmed unavailable:** Document Management, Expense & Reimbursement, Performance & Appraisal, Training & Development, Communication & Collaboration, Helpdesk & Support Tickets; real-time notifications, mobile apps, customizable widgets.
**Available without a user interface:** Profile, settings, and the invitation-acceptance flow operate through the platform interface rather than a dedicated panel screen.
**Could not be verified (excluded from this document):** None.

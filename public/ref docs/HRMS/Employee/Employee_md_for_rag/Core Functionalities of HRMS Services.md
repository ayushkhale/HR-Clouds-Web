---
title: "Core Functionalities of HRMS Services — Employee Capability Summary"
role: "employee"
module: "overview"
status: "partial"
ui_available: "partial"
source_document: "Core Functionalities of HRMS Services.md"
last_verified: "2026-09-10"
tags: ["core functionalities", "capabilities", "availability", "what is available", "what is not available", "feature matrix", "hrms services", "employee services", "summary", "at a glance"]
---

# Core Functionalities of HRMS Services — Employee Capability Summary

**Document Information**
Role: Employee · Module: Overview / Capability Summary · Availability: Partial · User interface: Partial (reference dashboard) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What This Summary Is

This document is an **at-a-glance availability summary** of the HRMS services an employee can use. Where the Employee Panel document is a *directory* that helps you find the right feature document, this document answers a single question quickly: **is a given capability available to me, yes or no?** For the rules behind any available capability, read that capability's own document.

## 2. How to Read the Availability Table

Each row is a capability an employee might expect from an HR system. "Available" means the platform implements it for the employee role today. "Not available" means it is not part of the platform, even if older material described it. "Depends on plan" means the capability is available only if the organization's subscription includes it.

## 3. Employee Capability Availability

| Capability | Available to employees? | Notes | Full document |
| --- | --- | --- | --- |
| View own profile and edit personal fields | Yes | Whitelisted fields only; job/identity fields are HR-set | Profile Management |
| Search the employee directory | Yes | Public-safe fields only | Profile Management |
| Personal Dashboard (home view) | Yes | A composed view of attendance and leave | Personal Dashboard |
| Clock in/out, breaks, regularization | Depends on plan | Requires attendance in the plan | Attendance |
| Attendance views (daily, weekly, trends) | Depends on plan | Requires attendance in the plan | Attendance |
| Comp-off and overtime (view own) | Depends on plan | View-only for the employee | Attendance |
| Apply for leave, track balance and status, cancel | Depends on plan | Requires leave in the plan | Leave Management |
| View payslips and salary breakup | Depends on plan | Returned as structured data, not a file download | Payroll, Salary & Tax |
| Manage bank account for salary | Depends on plan | Editing resets verification | Payroll, Salary & Tax |
| Investment declarations and tax regime | Depends on plan | Within the org's declaration window; regime switch may be disabled | Payroll, Salary & Tax |
| Sign in, reset password, switch organization | Yes | Password reset via the forgotten-password flow | Settings & Preferences |
| Join organization via invitation | Yes | Invited by HR/manager; accept by link | Employee Panel |
| Upload/store documents, e-signatures | No | Not available | Document Management |
| Expense claims and reimbursements | No | Not available | Expense & Reimbursement |
| Performance reviews, KPIs, self-appraisal, OKRs | No | Not available | Performance & Appraisal |
| Training courses, e-learning, certifications | No | Not available | Training & Development |
| Internal chat, announcements, surveys | No | Not available | Communication & Collaboration |
| Helpdesk / support tickets | No | Not available | Helpdesk & Support Tickets |
| Notification preferences, language, accessibility | No | Not available | Settings & Preferences |

## 4. Cross-Cutting Claims Corrected

Older material made several platform-wide claims that are **not accurate** for the employee experience today:

- **Geotagging and facial recognition for attendance** — attendance does not use facial recognition. Location handling exists as an organization-configured geofence, which may flag a punch but does not perform biometric identification. See the Attendance document.
- **Payslip and Form 16 downloads** — payroll information is returned as structured data, not as downloadable PDF files. See the Payroll, Salary & Tax document.
- **Emergency contacts, education, and experience on the profile** — the profile does not store emergency contacts, educational qualifications, or experience history; only current values of a defined field set are shown. See the Profile Management document.
- **Real-time notifications, mobile apps, and multi-factor authentication toggle** — none of these are available to the employee today. See the Personal Dashboard and Settings & Preferences documents.
- **Team/reporting hierarchy browsing** — an employee can search the directory and see their own reporting manager, but there is no org-chart browsing feature. See the Profile Management document.

## 5. What "Depends on Plan" Means for You

Attendance, leave, and payroll each require the organization's subscription plan to include that capability. If the plan does not include it, the capability does not function for you and its actions are unavailable. Your profile, the directory, sign-in and settings, and the dashboard shell are not separately gated (the dashboard's attendance and leave sections follow those features' gating).

## 6. Limitations of the HRMS Services for Employees

- The employee experience is delivered through a backend API and a **reference dashboard prototype**; a full production interface is not yet released.
- Six commonly expected capabilities (documents, expenses, performance, training, communication, helpdesk) are **not available**.
- Attendance, leave, and payroll depend on the organization's subscription.
- There are no mobile apps, real-time notifications, or employee-facing security toggles.

## 7. Related Employee Features

- **Employee Panel** — the directory of feature documents and the joining/invitation flow; see the Employee Panel document.
- **Personal Dashboard** — see the Personal Dashboard document.
- **Profile Management** — see the Profile Management document.
- **Attendance & Time Tracking** — see the Attendance document.
- **Leave Management** — see the Leave Management document.
- **Payroll, Salary & Tax** — see the Payroll, Salary & Tax document.
- **Settings & Preferences** — see the Settings & Preferences document.

## 8. Terminology Used in This Summary

| Term | Definition | Also called |
| --- | --- | --- |
| Capability | A distinct thing an employee can do in the platform | Feature, service |
| Available | Implemented for the employee role today | Supported |
| Not available | Not part of the platform, even if described in older material | Unsupported |
| Depends on plan | Available only if the organization's subscription includes it | Subscription-gated |

## 9. Common Employee Questions About HRMS Services

### Which HRMS services can I actually use?
You can manage your profile and search the directory, use the Personal Dashboard, and — where your organization's plan includes them — track attendance, manage leave, and view payroll. Sign-in, password reset, and organization switching are always available.

### Which services are not available?
Document management, expense and reimbursement, performance and appraisal, training and development, internal communication, and helpdesk tickets are not available. Notification, language, and accessibility settings are also not available.

### Why does a feature work for a colleague but not for me?
Attendance, leave, and payroll depend on the organization's subscription plan. If your organization's plan differs, or a capability was added or removed from the plan, availability can differ. These are organization-level decisions.

### Can I download my payslip or Form 16 as a PDF?
No. Payroll information is provided as structured data rather than a downloadable file. See the Payroll, Salary & Tax document.

### Does attendance use face recognition?
No. Attendance does not use facial recognition. Your organization may configure a location geofence that can flag a punch, but it does not identify you biometrically. See the Attendance document.

## 10. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| Full suite including documents, expenses, performance, training, chat, helpdesk | Only profile, dashboard, attendance, leave, payroll, and settings are available |
| Attendance with geotagging and facial recognition | No facial recognition; geofencing is an org setting that may flag, not identify |
| Download salary slips and Form 16 | Provided as structured data, not downloadable files |
| Maintain education, experience, emergency contacts on the profile | Not stored; only a defined field set of current values is shown |
| Multi-factor authentication, mobile apps, instant notifications | Not available to the employee today |
| Browse team structure and reporting hierarchy | Directory search and own-manager view only; no org-chart browsing |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** The employee-facing routes and services across the attendance, leave, payroll, organization, and auth modules, and the individual feature documents this summary links to.

**Confirmed available:** Profile view/edit and directory search, the Personal Dashboard, attendance/leave/payroll (subject to subscription), and sign-in/password/organization settings.
**Confirmed unavailable:** Document management, expenses, performance/appraisal, training, communication, helpdesk; facial recognition, payslip/Form 16 file downloads, mobile apps, MFA toggle, and org-chart browsing.
**Available without a user interface:** Profile, directory, settings, and payroll data are available through the platform interface rather than dedicated screens.
**Could not be verified (excluded from this document):** None.

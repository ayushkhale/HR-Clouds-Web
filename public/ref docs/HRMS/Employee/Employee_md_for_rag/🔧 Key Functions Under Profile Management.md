---
title: "Profile Management — Employee Guide"
role: "employee"
module: "organization"
status: "partial"
ui_available: "none"
source_document: "🔧 Key Functions Under Profile Management.md"
last_verified: "2026-09-10"
tags: ["profile", "my profile", "update profile", "personal details", "edit profile", "reporting manager", "employee directory", "colleague search", "locked fields", "designation"]
---

# Profile Management — Employee Guide

**Document Information**
Role: Employee · Module: Profile · Availability: Partial · User interface: None (no dedicated profile screen) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Profile Management Does for an Employee

Profile Management lets an employee view their own profile, update a defined set of personal fields, see who their reporting manager is, and look up colleagues in the employee directory. It is narrower than a full HR record: an employee can change personal details they own, but job and identity fields are set by HR and are not employee-editable.

## 2. Availability and Access for the Employee Role

Profile Management is **partially available**. Viewing one's own profile, updating a specific set of personal fields, and searching the directory are available. Many capabilities described in older documentation — document upload, emergency contacts, employment-history tracking, approval workflows — are not available.

Access:

- **Role:** available to the employee role.
- **Subscription entitlement:** none. Profile view/update and the directory are not behind a subscription gate.
- **Active organization:** the employee must be operating within an active organization.

**User interface:** none dedicated. There is no dedicated profile screen in the reference dashboard; profile view/update and the directory are available through the platform's Employee self-service interface.

## 3. Where to Find Profile Management

There is no dedicated profile screen in the reference Employee Dashboard prototype. Viewing and updating a profile, and searching the directory, are available through the platform's Employee self-service interface; a dedicated screen has not been released.

## 4. Capabilities Available to an Employee in Profile Management

| Capability | Status | Notes |
| --- | --- | --- |
| View own profile | Available (no screen yet) | Includes reporting manager |
| Update own personal fields | Available (no screen yet) | Defined whitelist only |
| See reporting manager | Available (no screen yet) | Name and email, if assigned |
| Search the employee directory | Available (no screen yet) | Public-safe fields only |
| Look up departments and locations | Available (no screen yet) | Read-only reference data |
| Upload documents to the profile | Not available | No document feature |
| Manage emergency contacts | Not available | No such field or feature |
| Track employment history | Not available | Only current values are returned |
| Edit job/identity fields | Not available to employees | Set by HR |

## 5. Viewing Your Own Profile

An employee can view their own profile. The profile includes identity and job details as well as the reporting manager. The employee can see these fields (view-only unless listed as editable in Section 7):

| Field group | Fields shown |
| --- | --- |
| Identity | Name, first name, last name, official email, personal email, contact phone, profile picture |
| Job | Employee code, role, department, designation, work location, work mode, employment type, joining date |
| Statutory | PAN number, UAN number |
| Personal | Marital status, blood group, current address, permanent address, state, pincode |
| Reporting | Reporting manager name and email (or none if no manager is assigned) |
| Status | Whether the employee is active |

## 6. Updating Your Personal Details

An employee can update a defined set of personal fields on their own profile. Editable fields save immediately; there is no approval step for them.

1. The employee supplies one or more editable fields (at least one is required).
2. The system validates and saves the changes.
3. Fields that are not editable are **silently ignored** — see Section 8.

## 7. Fields an Employee Can Edit

An employee can edit exactly these fields:

| Field | Purpose | Type | Rules |
| --- | --- | --- | --- |
| First name | Given name | Text | up to 150 characters |
| Last name | Family name | Text | up to 150 characters |
| Display name | Preferred display name | Text | up to 150 characters |
| Phone | Contact phone | Text | up to 20 characters; may be blank |
| Profile picture | Link to a picture | Web link | up to 1000 characters; a link, not a file upload |
| Personal email | Personal email address | Email | valid email, up to 150 characters |
| Current address | Current address | Text | may be blank |
| Permanent address | Permanent address | Text | may be blank |
| City | City | Text | up to 150 characters |
| State | State | Text | up to 100 characters |
| Pincode | Postal code | Text | up to 20 characters |
| Date of birth | Date of birth | Date | valid date |
| Blood group | Blood group | Text | up to 20 characters |

At least one field must be provided, otherwise the system reports "At least one field must be provided to update".

## 8. Fields an Employee Cannot Edit, and the Silent-Save Behavior

Fields such as **department, designation, gender, marital status, employee code, and PAN number** are not employee-editable. They are set by HR.

The important behavior to understand: if an employee includes one of these locked fields in an update, the system **silently ignores it**. The save returns success, no error or warning is shown, and the locked field is simply unchanged. This is not an error message — it is a successful save in which the locked field was dropped. To change a locked field, the employee must contact HR.

Gender and marital status matter beyond the profile: some leave types are restricted by them (see the Leave Management document). Because an employee cannot set these fields themselves, a leave blocked for a missing gender or marital status can only be resolved by HR.

## 9. Searching the Employee Directory

An employee can search the organization's employee directory (colleague search / employee list / team contacts). The directory shows only public-safe fields:

| Field shown | 
| --- |
| Name |
| Official email |
| Profile picture |
| Role |
| Department |
| Designation |
| Work location |

The directory deliberately **does not** show salary, contact phone numbers, addresses, or any personal data. An employee can filter the directory by a search term and by department, and results are paged.

## 10. Looking Up Departments and Locations

An employee can view the organization's list of departments and its list of work locations as read-only reference data — for example to understand where a colleague sits. These are lookups only; an employee cannot change them.

## 11. Rules and Restrictions That Apply to Profile Management

- Only the fields in Section 7 are editable; everything else is set by HR.
- Locked fields included in an update are silently dropped; the save still succeeds.
- The profile picture is a link, not an uploaded file.
- The directory exposes only public-safe fields — no personal data or salary.
- The bank account is **not** part of the profile; it belongs to Payroll (see Section 15).

## 12. Error and Non-Error Outcomes in Profile Management

### Nothing was submitted to update
This appears when an employee sends an update with no editable fields. The system reports "At least one field must be provided to update". Provide at least one editable field.

### A change appeared to save but did not take effect
This is not an error. When an employee tries to change a locked field (for example designation), the save returns success but the field is unchanged, because the field is not employee-editable and was silently ignored. Contact HR to change a locked field.

## 13. When No Data Is Shown in Profile Management

- The reporting manager is shown as none when no manager is assigned.
- The directory returns no results when a search matches no colleagues.
- Fields the organization has not filled in appear empty.

## 14. Limitations of Profile Management

- **Editable fields are limited** to the Section 7 whitelist.
- **Locked fields are silently ignored** on update, with no warning.
- **The profile picture is a link, not an upload.**
- **No document upload, no emergency contacts, no employment history** on the profile.
- **No approval workflow** for the editable fields — they save immediately.
- **No profile notifications or completion reminders.**

## 15. Not Currently Available in Profile Management

- Uploading documents (Aadhaar, PAN, passport, certificates, resume) to the profile is not available.
- Emergency contact management is not available.
- Employment-history and role-change tracking, and a downloadable employment-history report, are not available — only current values are shown.
- An alternate phone number field is not available (there is a single phone field).
- An HR approval workflow for employee profile edits is not available.
- Profile alerts, reminders, and completion-status notifications are not available.

## 16. Related Employee Features

- **Payroll, Salary & Tax** — the bank account and salary structure live in Payroll, not the profile; see the Payroll, Salary & Tax document.
- **Leave Management** — gender and marital status affect leave eligibility and are not employee-editable; see the Leave Management document.
- **Settings & Preferences** — password, sign-in, and organization switching are account/security matters, not profile fields; see the Settings & Preferences document.

## 17. Terminology Used in Profile Management

| Term | Definition | Also called |
| --- | --- | --- |
| Profile | The employee's own record of identity and personal details | My profile |
| Editable field | A personal field the employee may change | — |
| Locked field | A field set by HR that the employee cannot change | — |
| Directory | The searchable list of colleagues | Employee list, colleague search, team contacts |
| Reporting manager | The person to whom the employee reports | Manager |

## 18. Common Employee Questions About Profile Management

### How do I update my personal details?
An employee can update a defined set of personal fields — name, display name, phone, profile picture link, personal email, addresses, city, state, pincode, date of birth, and blood group. These save immediately. At least one field must be provided.

### How do I change my designation?
Designation is not an employee-editable field. If an employee submits a new designation, the save appears to succeed but the designation does not change, because the field is locked and is silently ignored. Contact HR to change a designation.

### Why did my profile update say it saved but nothing changed?
The field being changed is a locked field (such as department, designation, gender, marital status, employee code, or PAN number). Locked fields are silently ignored on save, so the update succeeds while the field stays the same. Only HR can change those fields.

### How do I upload my Aadhaar card, PAN, or resume to my profile?
Uploading documents to the profile is not available; there is no document feature. Provide these documents to HR through your organization's process. See the Document Management document.

### How do I change my profile picture?
An employee can set a profile picture by providing a link (a URL) to an image. It is a link, not a file upload — the platform does not accept an uploaded image file here.

### Who is my reporting manager?
An employee can see their reporting manager's name and email on their own profile. If no manager is assigned, it is shown as none. The reporting manager is who reviews items such as leave — see the Leave Management document.

### How do I find a colleague's details?
An employee can search the employee directory by name or department. The directory shows name, official email, profile picture, role, department, designation, and work location only — it does not show phone numbers, addresses, salary, or personal data.

### How do I add an emergency contact?
Emergency contact management is not available in the platform; there is no such field or feature. Provide emergency contact details to HR directly.

## 19. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| View and edit gender, marital status, nationality | Gender and marital status are not employee-editable; nationality is not a field |
| Edit mobile and alternate phone numbers | There is a single phone field; no alternate-phone field |
| Upload and store documents (Aadhaar, PAN, resume, certificates) | No document upload on the profile |
| Emergency contact management | Not available |
| Employment history and role tracking, downloadable report | Only current values are shown; no history or report |
| Profile picture upload | The picture is set by a link (URL), not a file upload |
| HR approval workflow for profile changes | Editable fields save immediately; locked fields are silently ignored |
| Alerts for missing details and profile completion | No profile notifications |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed available:** View own profile (including reporting manager), update the whitelisted personal fields, search the employee directory, look up departments and locations.
**Confirmed unavailable:** Document upload, emergency contacts, employment-history tracking and reports, alternate phone field, HR approval workflow for edits, profile notifications, employee editing of locked fields.
**Available without a user interface:** All profile capabilities — there is no dedicated profile screen.
**Could not be verified (excluded from this document):** None.

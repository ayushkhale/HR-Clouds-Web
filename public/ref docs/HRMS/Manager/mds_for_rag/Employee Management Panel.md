---
title: "Employee Management Panel — Manager Guide"
role: "manager"
module: "organization"
status: "partially-implemented"
ui_available: "partial"
source_document: "Employee Management Panel.md"
last_verified: "2026-09-10"
tags: ["manager employee management", "view employees", "employee profile", "edit team member", "team directory", "employee list", "direct reports", "employee status", "add employee", "remove employee", "department transfer", "profile fields"]
---

# Employee Management Panel — Manager Guide

**Document Information**
Role: Manager · Module: Organization · Availability: Partially implemented (read + limited profile edit) · User interface: Partial · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. Where a screen or navigation path is described, it reflects the
> reference dashboard prototype. Where no screen exists, this document describes what the
> system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Employee Management Does for a Manager

A Manager can **view the employee directory**, **open an individual employee's profile**, and **edit a limited set of personal profile fields for their direct reports**. That is the extent of a Manager's employee-management capability.

A Manager **cannot** add or remove employees, change an employee's active/inactive status, or transfer an employee's department or role. Those lifecycle and org-structure actions are **HR-only**. The Manager role is a scoped editor of personal profile details, not an administrator of the employee record.

## 2. Manager Access and Roles

Employee read and profile-edit endpoints are reachable by the roles `hr` and `manager` (the tenant plane). Lifecycle and structure endpoints are `hr`-only. Platform roles (`admin`, `super-admin`) are excluded from all tenant employee data.

| Action | Roles allowed | Manager can do it? |
| --- | --- | --- |
| List employees | hr, manager | Yes |
| View an employee by ID | hr, manager | Yes |
| Edit an employee's personal profile fields | hr, manager (scoped to reports) | Yes, for direct reports |
| Change an employee's status (active/inactive) | hr only | **No** |
| Remove (soft-delete) an employee | hr only | **No** |
| Transfer an employee's department/role | hr only | **No** |

### 2.1 Team scope for editing

A Manager can edit the personal profile of a **direct report only**, resolved from the reporting hierarchy. Editing an employee outside the reporting line is rejected with an authorization error ("You are not authorized to edit this employee"). A Manager **cannot edit their own** profile through this panel — self-edits must go through the self-service profile endpoint.

## 3. Where to Find the Employee Panel

The employee directory and profiles are served by the organization module's employee endpoints. There is no dedicated standalone Manager employee-management screen in the reference dashboard beyond the team views already surfaced for attendance, leave, and payroll; this document describes the verified API behavior a Manager has over employee records.

## 4. Capabilities Available to a Manager

| Capability | Status | Notes |
| --- | --- | --- |
| List employees (with a stated purpose) | Available | Purpose is required; supports search, department filter, pagination |
| View a single employee's profile | Available | By employee ID |
| Edit a direct report's personal profile fields | Available | Whitelisted fields only (Section 6) |
| Add / onboard a new employee | Not available to Managers | HR-only |
| Remove / offboard an employee | Not available to Managers | HR-only |
| Change employee active/inactive status | Not available to Managers | HR-only |
| Transfer department / change role | Not available to Managers | HR-only |
| Upload / manage employee documents | Not available | No manager document-management capability |
| Edit job/role/department/employee-code | Not available to Managers | Silently ignored even if sent; HR-only |

## 5. Listing and Viewing Employees

- **Listing** requires a **purpose**, one of: `shift_assignment`, `emp_report`, `all_employee_list`, `all_manager_list`, `all_hr_list`. The list supports an optional **search** term, an optional **department filter**, an **include-inactive** flag, and **pagination** (default page 1, 20 rows).
- **Viewing** an employee returns their profile by ID.

## 6. Editable Profile Fields (Direct Reports Only)

A Manager may update only the following whitelisted personal fields for a direct report. Any other field sent in the request (role, department, designation, employee code, gender, marital status, PAN, etc.) is **silently dropped** and never reaches the record.

| Field | Type | Rules |
| --- | --- | --- |
| First name | Text | Up to 150 characters |
| Last name | Text | Up to 150 characters |
| Display name | Text | Up to 150 characters |
| Phone | Text | Up to 20 characters; may be blank |
| Avatar URL | Text | Up to 1000 characters; may be blank |
| Personal email | Email | Valid email, up to 150 characters; may be blank |
| Current address | Text | May be blank |
| Permanent address | Text | May be blank |
| City | Text | Up to 150 characters; may be blank |
| State | Text | Up to 100 characters; may be blank |
| Pincode | Text | Up to 20 characters; may be blank |
| Date of birth | Date | ISO date; may be null |
| Blood group | Text | Up to 20 characters; may be blank |

At least one field must be provided. The update is written atomically across the profile tables; if the target record is missing, the edit fails loudly rather than silently succeeding.

## 7. Editing a Direct Report's Profile — Step by Step

1. The Manager identifies the direct report by employee ID.
2. The Manager submits one or more of the whitelisted personal fields (Section 6).
3. The system verifies the target is a direct report; if not, it returns an authorization error.
4. The system rejects an attempt by the Manager to edit their own profile here (use self-service instead).
5. On success the system reports "Employee profile updated successfully" and returns the updated profile.

## 8. Permission Behavior

- **Role:** `manager` and `hr` can list, view, and edit personal profile fields; only `hr` can change status, remove, or transfer.
- **Scope:** a Manager can edit only direct reports; out-of-scope edits are rejected.
- **Self-edit block:** a Manager cannot edit their own profile through this panel.
- **Field whitelist:** non-personal fields are stripped; a Manager cannot change role, department, designation, or employee code even by including them.

## 9. Error Behavior

| Situation | What the Manager sees |
| --- | --- |
| Editing an employee outside the reporting line | "You are not authorized to edit this employee" (403, hierarchy violation) |
| Editing one's own profile via this panel | "Use the self-service profile endpoint to edit your own profile" (400) |
| Invalid employee ID format | "Invalid Employee ID format" (400) |
| Employee not found | "Employee not found" (404) |
| No fields provided on update | Validation error: at least one field must be provided |
| Attempting a status change / remove / transfer as a Manager | Authorization error — these are HR-only |

## 10. Success Behavior

- Listing returns the employee rows with pagination.
- Viewing returns the employee's profile.
- A profile edit reports "Employee profile updated successfully" and returns the updated record.

## 11. Empty States

- A directory query with no matches returns an empty list with pagination totals of zero.
- A Manager with no direct reports has no one to edit through the scoped edit path.

## 12. Limitations

- **Read plus limited personal-field edit only** — no lifecycle or structure authority.
- **Direct reports only** for edits.
- **No self-edit** through this panel.
- **No document management** — a Manager cannot upload, view, replace, or delete employee documents here.
- **No status, removal, or transfer** — all HR-only.
- **Cannot change role, department, designation, or employee code** — those fields are stripped from a Manager's update.

## 13. Not Available to Managers in This Area

- Adding or onboarding a new employee (HR-only).
- Removing or offboarding an employee (HR-only).
- Changing an employee's active/inactive status (HR-only).
- Department transfer or role change (HR-only).
- Employee document upload/management (not implemented for Managers).
- The "Add Employee Wizard", offboarding checklist, exit-settlement capture, and bulk employee editing described in older planning material.

## 14. Related Manager Features

- **Attendance & Leave Management** — team scoping comes from the same reporting hierarchy; see the Attendance & Leave Management document.
- **Payroll & Compensation** — compensation changes for the same reports are handled there under maker-checker; see the Payroll & Compensation document.
- **Manager Dashboard** — surfaces the team; see the Dashboard Overview document.

## 15. Terminology

| Term | Definition | Also called |
| --- | --- | --- |
| Direct report | An employee reporting to the Manager | Team member, subordinate |
| Personal profile fields | Name, contact, address, and similar whitelisted fields | Personal details |
| Lifecycle action | Status change, removal, transfer | Employee lifecycle |
| Tenant plane | The org-scoped roles: hr, manager, employee | — |

## 16. Common Manager Questions

### Can I add a new employee to my team?
No. Adding or onboarding employees is HR-only. A Manager can view and edit personal details of existing direct reports but cannot create employee records.

### Can I terminate or remove an employee?
No. Removing (soft-deleting) an employee and changing active/inactive status are both HR-only.

### What can I edit on a team member's profile?
Only whitelisted personal fields: name (first, last, display), phone, avatar, personal email, current and permanent address, city, state, pincode, date of birth, and blood group. Role, department, designation, and employee code cannot be changed by a Manager.

### Why can't I change my report's department?
Department transfer and role change are HR-only. Even if a Manager includes those fields in an update, they are stripped and ignored.

### Can I edit my own profile here?
No. Use the self-service profile endpoint for your own profile. This panel is for managing others (your direct reports).

### Why do I get "not authorized to edit this employee"?
The employee is not one of your active direct reports. A Manager can edit only their direct reports' personal profiles.

### Can I upload my team member's offer letter or ID proof?
No. There is no Manager document-management capability in this panel.

## 17. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| Add / Remove Employees (Add Employee Wizard, offboarding) | HR-only; not available to Managers |
| Upload Documents (offer letters, ID proofs, contracts) | No Manager document-management capability |
| Assign/Change Departments, Roles & Reporting Managers | HR-only (department transfer / role change) |
| Manage Employee Status (Active, On Leave, Resigned, Terminated) | Status change is HR-only; not a Manager capability |
| "Managers can edit profiles of their team" (full profile) | Managers can edit only a whitelisted set of **personal** fields for direct reports |
| Bulk editing of department/role/manager | Not available to Managers |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code (organization employee routes, role-plane constants, employee controller and validator, and the profile-update service).

**Confirmed available:** List employees (with required purpose, search, department filter, pagination), view an employee by ID, edit a direct report's whitelisted personal profile fields.
**Confirmed unavailable to Managers:** Add/onboard, remove/soft-delete, status change, department transfer/role change, document management, and editing non-personal fields (stripped by the whitelist).
**Role sets verified from source:** list/view/edit admit `hr, manager` (`HR_OR_MANAGER`); status/delete/transfer admit `hr` only (`HR_ONLY`).
**Could not be verified (excluded from this document):** Whether a production UI exposes a dedicated employee-directory screen for Managers beyond the API.

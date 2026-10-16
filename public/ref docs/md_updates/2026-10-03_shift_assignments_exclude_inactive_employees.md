# API Change Record: Exclude Deactivated Employees from Shift Assignments

**Date:** 2026-10-03  
**Endpoint:** `GET /api/v1/attendance/hr/shifts/assignments`  
**Module:** Attendance (`hr_attendance`)  
**Status:** Implemented & Verified in Database  

---

## 1. Problem Description
Previously, `GET /api/v1/attendance/hr/shifts/assignments` returned all shift assignment records without checking if the associated employee/user was still active in the organization (`user_roles.is_active = true`). As a result, employees who had resigned or been deactivated (e.g., Nainika Agrawal in Compunic Private Limited) continued to appear in the active shift assignment roster.

---

## 2. Changes Applied
In [`src/modules/attendance/services/shift.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/attendance/services/shift.service.js#L213-L245):
- Joined the `UserRole` model on the `user` relationship scoped to the organization (`org_id`).
- By default, enforced `is_active: true` on `user_roles`.
- Added support for the optional query parameter `include_inactive=true` if HR explicitly needs to audit assignments of former/inactive employees.

### Request Query Parameters
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | Optional | Filter assignments by specific user |
| `shift_id` | UUID | Optional | Filter assignments by shift template |
| `rotation_pattern_id` | UUID | Optional | Filter assignments by rotation pattern |
| `include_inactive` | Boolean (`true`/`false`) | `false` | When omitted or `false`, only active employees' shift assignments are returned. When `true`, deactivated employees are also included. |

---

## 3. Database Verification (Compunic Private Limited)
Using the Neon Postgres database for **Compunic Private Limited** (`org_id: b782fd72-493e-415d-8b5b-9194b81d294e`):
- **Inactive Employee:** Nainika Agrawal (`user_id: 936dfc38-4c48-469c-8e88-f3f2604b2a9e`, `is_active: false`) held an active shift assignment (`Morning Shift`).
- **Before Fix:** 9 total assignments returned, including Nainika.
- **After Fix (Default):** 8 total assignments returned (Nainika is excluded).
- **After Fix (`?include_inactive=true`):** 9 total assignments returned (Nainika is included).

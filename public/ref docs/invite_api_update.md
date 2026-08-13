# Invite API Documentation & Update Analysis
**Last Updated: August 11, 2026**

This document outlines the recent updates made to the `POST /api/v1/organization/users/invite` API, identifying newly added fields, the alignment between Database schemas and Validator rules, and how the payload is seamlessly mapped to user profiles.

---

## 1. Newly Added Fields
The invite API was recently upgraded to accept and process the following fields natively during the invitation process:
- **`dob` (Date of Birth):** Passed as an ISO date string (e.g. `1995-12-31`). Stored as `DATEONLY` in the profile tables.
- **`joining_date`:** Passed as an ISO date string (e.g. `2026-08-15`). Stored as `DATEONLY` in the profile tables.
- **`city`:** Passed as a string (max 150 chars). This strictly represents the user's personal residence/home city. It does *not* mix with `work_location`.

---

## 2. API Request Structure (Frontend Guide)

**Endpoint:** `POST /api/v1/organization/users/invite`  
**Headers:** `Authorization: Bearer <token>`  

**JSON Payload Validation Rules:**
```json
{
  "email": "Required. Standard email format.",
  "role": "Required. Enum representing target role (e.g., 'employee', 'manager', 'hr').",
  "name": "Optional. Will automatically split into first_name and last_name.",
  "emp_id": "Optional. Employee ID / Code.",
  "contact": "Optional. Phone number string.",
  "city": "Optional. Personal address city.",
  "location_id": "Optional. UUID of branch. Auto-resolves to 'work_location' string internally.",
  "department_id": "Optional. UUID of department. Auto-resolves to 'department' string internally.",
  "designation": "Optional. String representing job title.",
  "pan_number": "Optional. Standard string.",
  "uan_number": "Optional. Standard string.",
  "blood_group": "Optional. Standard string.",
  "marital_status": "Optional. Standard string.",
  "current_address": "Optional. Text block.",
  "permanent_address": "Optional. Text block.",
  "state": "Optional. Standard string.",
  "pincode": "Optional. Standard string.",
  "personal_email": "Optional. Standard email format.",
  "reporting_person": "Optional. UUID of the manager they report to.",
  "work_mode": "Optional. Enum: 'on-site', 'remote', 'hybrid', 'field'.",
  "job_status": "Optional. Enum: 'probation', 'confirmed', 'notice_period', 'terminated', etc.",
  "employment_type": "Optional. Enum: 'full_time', 'part_time', 'contract', 'intern'.",
  "dob": "Optional. ISO Date string.",
  "joining_date": "Optional. ISO Date string."
}
```

### Auto-Resolution Logic
- **`department_id`:** If provided, the backend queries the `OrganizationDepartment` table. It saves the UUID but also extracts the department's name and saves it as a string to the `department` field on the profile.
- **`location_id`:** If provided, the backend queries the `OrganizationLocation` table. It saves the UUID but also extracts the branch's name and saves it as a string to the `work_location` field on the profile.

---

## 3. Discrepancy Report: Database vs Frontend API

As a senior engineer, I've conducted a deep audit comparing the DB Profile Models (`EmployeeProfile`, `ManagerProfile`, `HrProfile`) against the API validator logic. Here are the findings:

### A. Fields Accepted from Frontend but NOT used in DB?
- **None.** The backend is 100% efficient. Every single key passed through the validator is successfully mapped to either the core `User` model, `UserProfile` (metadata), or the Role Profile (`EmployeeProfile`, etc.). Nothing is wasted.

### B. Fields in DB but NOT accepted from Frontend Invite API?
The database holds several operational and administrative fields that are deliberately excluded from the initial invite payload. **This is expected behavior.** These fields are typically updated post-onboarding by HR or System Admins:
1. **Across all Profiles (`Employee`, `Manager`, `HR`):**
   - `manager_id`: The invite API accepts `reporting_person` to define hierarchy. `manager_id` is an alternative/secondary field in the DB that is left null initially. 
2. **`ManagerProfile` Exclusives:**
   - `department_head` (Boolean): Defines if they head the entire department.
   - `budget_limit` (Decimal): Financial tracking constraint.
   - `max_team_size` (Integer): Capacity limit for the manager.
3. **`HrProfile` Exclusives:**
   - `access_level` (Enum): Defaults to 'branch'. Defines if they are global/regional HR.
   - `specialization` (String): e.g., 'Recruitment', 'Payroll'.

**Recommendation to Frontend:** No action required. If the frontend intends to allow HR to set `budget_limit` or `department_head` at the time of invitation in the future, the backend validator (`organization.validator.js`) and service (`invitation.service.js`) will need to be updated to accept them. Currently, they must be set via a profile update API after the user is invited.

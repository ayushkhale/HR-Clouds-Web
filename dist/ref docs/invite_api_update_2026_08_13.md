# Invite Users API - Update Documentation
**Date**: August 13, 2026
**Endpoint**: `POST /users/invite`

This document serves as a comprehensive guide for frontend developers integrating the updated `Invite Users API`. Several strict backend validations and automation rules have been introduced to maintain organizational hierarchy and data integrity.

---

## 1. Request Payload (JSON)

| Field | Type | Required? | Description & Validation Rules |
| :--- | :--- | :--- | :--- |
| `email` | String | **Yes** | Valid email address of the invitee. |
| `role` | String | **Yes** | `employee`, `manager`, `hr`, `admin`, etc. Inviter cannot invite a role with a higher priority than their own. |
| `make_hod` | Boolean | No | **NEW:** If `true`, the invited user will immediately be assigned as the Head of the selected Department. |
| `reporting_person` | UUID | No | ID of the user the invitee will report to. |
| `location_id` | UUID | No | ID of the work location. |
| `department_id` | UUID | No | ID of the department. |
| `name` | String | No | Max 150 characters. |
| `emp_id` | String | No | Max 100 characters. |
| `contact` | String | No | Max 50 characters. |
| `city` | String | No | Max 150 characters. |
| `designation` | String | No | Max 150 characters. |
| `pan_number` | String | No | Max 50 characters. |
| `uan_number` | String | No | Max 50 characters. |
| `blood_group` | String | No | Max 20 characters. |
| `marital_status` | String | No | Max 50 characters. |
| `current_address` | String | No | |
| `permanent_address`| String | No | |
| `state` | String | No | Max 100 characters. |
| `pincode` | String | No | Max 20 characters. |
| `personal_email` | String | No | Valid email, max 150 characters. |
| `job_status` | String | No | Enum: 'probation', 'confirmed', etc. |
| `employment_type` | String | No | Enum: 'full_time', 'part_time', etc. |
| `work_mode` | String | No | Enum: 'on-site', 'remote', etc. |
| `dob` | Date | No | ISO Date format. |
| `joining_date` | Date | No | ISO Date format. |

---

## 2. API Core Logic & Validation Rules (Backend)

The backend now enforces strict organizational rules. If any of these are violated, the API returns a `400 Bad Request`.

### A. Location & Department Hierarchy (`LOCATION_MISMATCH`)
- **Rule**: If both `location_id` and `department_id` are provided, the backend verifies that the selected department actually belongs to the selected location.
- **Exception**: If the department is global (no location tied to it in the DB), it passes validation.

### B. Auto-Reporting Person for Employees
- **Rule**: If the invited user's `role` is `employee` AND a `department_id` is provided, the backend will completely ignore any `reporting_person` passed from the frontend.
- **Action**: It automatically assigns the department's existing Head of Department (HOD) as the employee's `reporting_person`.

### C. Strict Hierarchy for Managers & HR (`INVALID_REPORTING_PERSON_ROLE`)
- **Rule**: If the invited user's `role` is `manager` or `hr`, they **cannot** report to another manager or an employee.
- **Validation**: If a `reporting_person` ID is sent, the backend fetches that user's role. If the reporting person does not hold the `hr` role, the API throws an error.

### D. Department Head Assignment (`INVALID_HOD_ROLE`)
- **Rule**: If `make_hod` is passed as `true`, the backend attempts to assign the invited user as the HOD for `department_id`.
- **Validation**: If the invited user's `role` is `employee`, the API blocks this and throws an error (employees cannot be HODs).

---

## 3. Frontend Implementation Suggestions

To provide the best user experience and prevent the backend from throwing `400` errors, the frontend UI should dynamically adapt based on the user's selections in the invite form.

### Suggestion 1: Dynamic "Make HOD" Checkbox
- **When to show**: Only display the "Make Head of Department" checkbox if the user has selected a `department_id` **AND** the selected `role` is `manager` or `hr`.
- **Why**: The backend will reject `make_hod: true` for employees. Hiding it prevents user error.

### Suggestion 2: Smart "Reporting Person" Dropdown
- **Scenario A (Inviting an Employee)**: 
  - If `role === 'employee'` and the user selects a department, you can show a small tooltip or text: *"Reporting person will automatically be set to the Department Head."* 
  - *Optional:* You can disable the reporting person dropdown entirely in this state to avoid confusion, since the backend will override it anyway.
- **Scenario B (Inviting a Manager or HR)**:
  - If `role === 'manager'` or `role === 'hr'`, filter the "Reporting Person" dropdown options in the UI to **only** show users who hold the `hr` role. 
  - *Why*: The backend will strictly reject any submission where a manager reports to anyone other than an HR.

### Suggestion 3: Cascading Location/Department Dropdowns
- **Behavior**: When a user selects a `location_id`, immediately filter the `department_id` dropdown to only show departments that belong to that location (or global departments).
- **Why**: This prevents the user from submitting a conflicting location/department pair, which triggers the `LOCATION_MISMATCH` backend error.

---

## 4. Required Data Fetching APIs for the Invite Form

To properly build the dropdowns and enforce the validations described above, the frontend must use the following updated APIs to fetch live organizational data:

### A. Fetching Locations (For the Location Dropdown)
- **API**: `GET /api/v1/organizations/locations`
- **Usage**: Call this on page load to populate the `location_id` dropdown.

### B. Fetching Cascading Departments (For the Department Dropdown)
- **API**: `GET /api/v1/organizations/departments?location_id=<selected_uuid>`
- **Usage**: When a user selects a location in the UI, immediately call this API passing the chosen location's ID. This ensures the dropdown only shows departments that belong to that location, completely preventing the `LOCATION_MISMATCH` error.

### C. Fetching HR & Managers (For the Reporting Person Dropdown)
- **API**: `GET /api/v1/organizations/employees?purpose=all_hr_list` (or `all_manager_list`)
- **Usage**: To build the "Reporting Person" dropdown safely, call this API with the appropriate `purpose`.
  - As per **Suggestion 2 (Scenario B)**, if you are inviting a new Manager or HR, they are required to report to an HR. You should call `GET /api/v1/organizations/employees?purpose=all_hr_list` to fetch an optimized list of eligible HR users, populating the dropdown with their `name` and `user_id`.

# Update: Organization Invite Hierarchy & Frontend Approach
**Date:** August 24, 2026

## 1. The Situation

Previously, there was an assumption in the frontend design that when an employee is invited and assigned to a department (e.g., "Sales"), they would strictly and automatically report to the Head of Department (HOD). 

However, as organizations scale, this "flat" hierarchical model breaks down. An HOD cannot directly manage 50+ employees in a large department. The backend architecture (`user_reporting_mappings` table) was specifically designed to support **multi-level hierarchies** (e.g., Employee → Team Lead → HOD) by separating the concepts of "Department Head" and "Direct Reporting Manager".

While the backend gracefully defaults to assigning the HOD as the reporting manager if no specific manager is provided during an invite, relying exclusively on this default prevents the creation of mid-level management tiers.

## 2. The Discussed Solution

To properly leverage the backend's capability and support complex organizational structures, the frontend "Send Invite" flow must explicitly handle reporting assignments rather than relying entirely on the backend HOD fallback.

When an HR administrator invites a new employee to a department, they must have the ability to explicitly select *who* that new employee reports to, bypassing the HOD if necessary.

### Backend Support
The existing `POST /api/v1/organizations/users/invite` API already supports this. It accepts an optional `reporting_person` field (UUID). 
- If `reporting_person` is **provided**, the backend assigns the new employee to report to that specific manager.
- If `reporting_person` is **omitted**, the backend falls back to assigning them to the department's HOD.

## 3. Frontend Implementation Strategy

To implement this on the frontend, the UI for the "Invite Employee" modal/page should be updated with the following UX flow:

### Step 1: Department Selection
The HR selects the department the new employee will join (e.g., "Sales Department").

### Step 2: Fetch Available Managers
Once the department is selected, the frontend should independently fetch a list of all active personnel who are eligible to be managers. 
- This typically includes users with the `manager` or `hr` role.
- *API Reference:* `GET /api/v1/organizations/employees` (filtered by role).

### Step 3: The "Reports To" Dropdown
Display a searchable dropdown labeled **"Reporting Manager"** or **"Reports To"**, populated with the list of eligible managers fetched in Step 2.

**UX Best Practices for this Dropdown:**
1. **Pre-fill with the HOD (Recommended):** To save HR time for smaller teams, the frontend can automatically pre-select the department's HOD in this dropdown.
2. **Allow Overrides:** If the new employee is joining a sub-team (e.g., "Enterprise Sales Team"), the HR can click the dropdown and change the selection from the "VP of Sales" (HOD) to the "Enterprise Sales Team Lead".
3. **Handle Edge Cases:** If the department currently has no HOD assigned in the system, leave the dropdown blank and force the HR to manually select a manager from the list to prevent orphaned employees.

### Step 4: Submission
When the form is submitted, the frontend attaches the selected manager's UUID to the `reporting_person` field in the JSON payload:

```json
{
  "email": "new.employee@example.com",
  "role": "employee",
  "department_id": "8f3bde36-1560-4355-8ab9-c15c8568e619",
  "reporting_person": "uuid-of-the-selected-manager", 
  "make_hod": false
}
```

## 4. Conclusion
By decoupling the "Department" from the "Direct Manager" in the frontend UI, the HRMS gains the flexibility to support deeply nested organizational charts (Employee → Team Lead → Regional Manager → HOD) while maintaining a fast, frictionless experience for HR administrators.

# Employee, Manager & HR Guide: Employee Lifecycle, Hierarchy, Transfers & Directory (Q&A)

This document provides a comprehensive, stateless guide to employee records, organizational hierarchies, self-service profile updates, department transfers, employee suspensions, offboarding, and the company directory in the HRMS.

---

### Employee Rosters & Roster Views

**Q: What is the Employee Roster in the HRMS?**
**A:** The Employee Roster is the central organizational directory used by HR and Managers to view, search, and manage workforce members.

To deliver fast and focused information, the system provides tailored views based on operational purpose:
- **Employee List (`all_employee_list`):** A concise roster of all team members holding the Employee role, showing names, designations, departments, work locations, and contact info.
- **Manager List (`all_manager_list`):** A focused list of all personnel holding managerial leadership roles.
- **HR Administrator List (`all_hr_list`):** A view showing all human resources administrators.
- **Shift Scheduling View (`shift_assignment`):** A streamlined view showing only scheduling essentials (name, department, work mode, and office location) for planning shifts.
- **Full Employee Report (`emp_report`):** A comprehensive administrative view containing complete profile, statutory, tax, and address information.

---

**Q: Who can view the full organizational employee roster?**
**A:** Access to the roster is strictly governed by reporting hierarchy:
- **HR Administrators & Super Admins:** Have global scope and can search and view all members across the entire organization.
- **Managers:** Are automatically scoped to their own team hierarchy. A manager can only view direct and indirect subordinates who report to them. A manager cannot browse employees in unrelated departments.

---

### Colleague Directory (Public-Safe)

**Q: What is the Colleague Directory in the HRMS?**
**A:** The Colleague Directory is an organization-wide contact and team lookup tool accessible to **all active members** (Employees, Managers, and HR alike).

Unlike managerial rosters, the directory allows any employee to find colleagues across the company to facilitate collaboration, communication, and team awareness.

---

**Q: What information is visible in the Colleague Directory?**
**A:** To protect employee privacy while supporting workplace communication, the directory displays only **public-safe workplace details**:
- Full name and profile display name
- Official company email address
- Profile avatar / photo
- Role title and official designation
- Assigned Department
- Primary Work Location / Office Branch

---

**Q: What information is hidden from the Colleague Directory?**
**A:** The directory strictly omits sensitive personal and statutory data:
- Personal mobile phone numbers
- Home street addresses, city, state, and postal codes
- Government tax IDs (PAN numbers and UAN numbers)
- Personal email addresses
- Date of birth and age
- Marital status and gender

Only HR Administrators have access to sensitive personal data through administrative profile portals. Suspended or offboarded employees are never shown in the directory.

---

### Self-Service Profile Management (`/me`)

**Q: What personal information can an employee edit on their own profile?**
**A:** Employees can update their personal information self-service by visiting their "My Profile" page.

Employees can edit the following whitelisted personal fields:
- Preferred display name, first name, and last name
- Primary phone number
- Profile avatar photo
- Personal email address
- Current residential address and permanent home address
- City, state, and postal code
- Date of birth
- Blood group

---

**Q: What profile fields are locked and can only be modified by HR?**
**A:** Employees cannot edit job-related, statutory, or organizational fields:
- Assigned Department and physical Work Location
- Official Job Designation / Title
- Role assignment (Employee vs. Manager vs. HR)
- Employee Identification Code (emp_id)
- PAN Number and UAN Number
- Gender and Marital Status (demographic gates that govern specific statutory leave entitlements)
- Official Date of Joining

To update any of these restricted fields, an employee must submit an official request to their HR Administrator.

---

**Q: Can a Manager edit a subordinate's profile?**
**A:** Yes, but strictly within their team and only for personal fields:
- A manager can edit allowed personal fields (such as updating an updated phone number or address) for direct subordinates who report to them.
- A manager cannot edit an employee from another department or team (blocked with an unauthorized access notice).
- A manager cannot modify official job titles, departments, roles, or statutory tax details for subordinates; those changes must be handled by HR.

---

### Employee Status Management: Suspension vs. Reactivation

**Q: What does suspending an employee's status do?**
**A:** An HR Administrator can temporarily deactivate an employee's organization status (setting `is_active` to false) during extended leaves of absence, sabbaticals, or disciplinary reviews:
- The employee is immediately blocked from logging into this specific company workspace.
- The employee's record is hidden from the public Colleague Directory.
- Their profile and historical attendance data remain safely preserved in the database.
- If the user belongs to other organizations on the platform, their access to other workspaces is not affected.

---

**Q: How does HR reactivate a suspended employee?**
**A:** An HR Administrator navigates to the employee profile, selects "Reactivate", and toggles their status back to active. The employee's access to the workspace and team tools is restored immediately.

---

### Department Transfers (Moving Between Teams)

**Q: How does an HR Administrator transfer an employee to a new department?**
**A:** Department Transfers are atomic organizational changes executed through the Department Transfer portal:
1. HR selects the employee and chooses their new department.
2. **Assigning a New Manager:** HR either selects a new reporting manager or allows the system to automatically assign the new department's Head of Department (HOD) as their manager.
3. **Atomic Hierarchy Handover:** The system updates the employee's department, deactivates their previous reporting line, and activates the new reporting line.

---

**Q: What happens if a Manager who is currently a Head of Department is transferred?**
**A:** If the transferring manager is currently leading a department, the system enforces leadership succession safeguards:
- **Replacement HOD Required:** HR must select a replacement Head of Department to take over the old department.
- **Automatic Subordinate Transition:** All team members who reported to the outgoing HOD are automatically re-routed to report to the replacement HOD, ensuring the department is never left without an active manager.
- If the transferring manager is being appointed as the HOD of their *new* department, the system simultaneously updates their leadership title and assigns that department's members to report to them.

---

### Offboarding & Removing an Employee (Soft Delete)

**Q: What happens when an employee resigns or is terminated?**
**A:** An HR Administrator initiates an official removal (soft delete) from the employee profile.

The system executes a comprehensive offboarding workflow across all HRMS modules:
1. **Access Revocation:** The employee's active role is revoked, and their login access to the organization is permanently disabled.
2. **Reporting Hierarchy Cleanup:** 
   - If the departing user had direct reports, the system automatically reassigns those subordinates to the department head or the next manager up the chain.
   - If the departing user was an HOD, their department headship is cleanly vacated so a successor can be appointed.
   - The departing user's own upward reporting line is deactivated.
3. **Leave & Attendance Unwinding:**
   - Any pending leave requests awaiting approval are terminated.
   - Any approved future leaves scheduled for dates after the departure date are automatically cancelled, their deducted balances are refunded, and any pre-scheduled "On Leave" attendance marks are removed.
   - Past, already-completed attendance records and historical leaves taken in the past remain completely preserved for legal and payroll compliance.

---

**Q: Can an HR Administrator delete their own account?**
**A:** No. The system strictly forbids self-deletion (`SELF_DELETE_NOT_ALLOWED`). An administrator cannot delete their own profile to prevent accidental administrative lockouts.

---

**Q: Can an HR Administrator delete the last remaining HR in the organization?**
**A:** No. The system prevents removing the last active HR Administrator (`LAST_ACTIVE_HR`). An organization must always have at least one active HR Administrator to maintain administrative governance.

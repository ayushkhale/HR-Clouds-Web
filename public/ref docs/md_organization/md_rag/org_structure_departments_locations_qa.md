# HR & Manager Guide: Organizational Structure, Locations, Departments & HOD Transfers (Q&A)

This document provides a comprehensive, stateless guide to configuring work locations, creating departments, appointing Heads of Departments (HOD), executing leadership transfers, and maintaining organizational hierarchies in the HRMS.

---

### Work Locations

**Q: What is a Work Location in the HRMS?**
**A:** A Work Location represents a physical office, branch, warehouse, or regional operational facility belonging to your organization.

Locations provide the organizational framework for assigning employees, defining regional public holidays, configuring localized weekly off schedules, and establishing geographic radiuses for mobile Attendance Geofencing.

---

**Q: What information is needed to create a new Work Location?**
**A:** An HR Administrator provides the following details:
- **Location Name:** A unique descriptive name (for example, "Headquarters", "Bengaluru Tech Hub", or "London Regional Office").
- **Physical Address:** Street address, city, state, postal / ZIP code, and country.
- **Timezone:** The local timezone for the facility (for example, `Asia/Kolkata` or `Europe/London`).
- **Active Status:** Determines whether the location is currently available for employee assignments.

---

**Q: Can two locations have the same name in the same organization?**
**A:** No. The system enforces strict case-insensitive uniqueness for location names within your organization.

For example, if you already have a location named "Headquarters", the system will reject any attempt to create or rename another location as "headquarters" or "HEADQUARTERS". This prevents confusion during department and attendance assignment.

---

**Q: What happens if an office relocates or changes address?**
**A:** An HR Administrator can update the location's address, city, or postal code at any time:
- Existing employees assigned to that location automatically remain linked to the updated record.
- Historical attendance records completed at the location remain preserved without disruption.

---

### Departments

**Q: What is a Department in the HRMS?**
**A:** A Department is a functional business unit or operational division within your company (such as Engineering, Sales, Human Resources, Finance, or Customer Support).

Departments organize team reporting structures, establish supervisory hierarchies, and enable department-level analytics for payroll, leave, and attendance.

---

**Q: What information is required to create a Department?**
**A:** When creating a department, an HR Administrator specifies:
- **Department Name:** A unique name for the business unit (required, max 100 characters).
- **Description:** A short description of the department's role (optional).
- **Location Linkage:** The primary physical location or facility where the department operates (optional).
- **Head of Department (HOD):** The designated leader responsible for the department (optional).
- **Active Status:** Controls whether the department is active and available for member assignments.

---

**Q: Can two departments have the same name?**
**A:** No. The system enforces case-insensitive name uniqueness for departments within the organization. You cannot have two departments named "Marketing" and "marketing".

---

**Q: Can a department be linked to a specific office location?**
**A:** Yes. Linking a department to a location establishes that the team operates out of that specific facility.

If a department is tied to a specific location, the system validates employee assignments to ensure consistency—for example, alerting HR if an employee assigned to the Mumbai office is placed into a department that operates exclusively in London.

---

### Heads of Departments (HOD) & Leadership Roles

**Q: What is a Head of Department (HOD)?**
**A:** A Head of Department (HOD) is the designated leader who oversees a specific functional business unit.

In the HRMS, the HOD serves as the default escalation manager for leave approvals, attendance regularizations, and performance workflows for team members in that department who do not have an individually assigned direct manager.

---

**Q: Who can be appointed as a Head of Department?**
**A:** Only active users who hold the **Manager** or **HR Administrator** role can be appointed as an HOD.

The system strictly blocks any attempt to assign an Employee as an HOD. If a senior team member needs to lead a department, an HR Administrator must first promote them to the Manager role before assigning them as the department head.

---

**Q: Can one person be the Head of Department for more than one department?**
**A:** Yes. In growing companies or matrix organizations, an executive or senior manager can lead multiple departments (for example, one individual serving as the HOD for both "Operations" and "Logistics").

The system tracks leadership flags accurately across all assigned departments.

---

### Atomic HOD Transfers & Reassigning Department Heads

**Q: What happens when the Head of Department is changed to a new leader?**
**A:** When an HR Administrator updates a department's HOD, the system executes an automated, atomic **HOD Transfer**:
1. **Leadership Title Handover:** The previous leader's HOD title for that department is removed, and the new leader is officially marked as the Department Head.
2. **Automatic Reporting Line Transfer:** All employees within that department who were reporting directly to the old HOD are automatically re-routed to report to the new HOD.
3. **Adopting Department Orphans:** Any team members in that department who previously lacked an active reporting manager are automatically "adopted" by the new HOD, ensuring no employee is left without an active manager.
4. **Approval Continuity:** All upcoming leave and attendance requests automatically redirect to the new HOD's approval queue without manual intervention.

---

**Q: Can an HOD transfer fail halfway through and leave a department in an inconsistent state?**
**A:** No. The entire HOD transfer—including updating the department record, changing leadership flags, re-wiring all subordinate reporting lines, and adopting unassigned members—runs inside a single, indivisible database transaction.

If any error occurs during the process (such as a network disconnection or data validation failure), the entire operation rolls back completely to the prior state, ensuring your organizational chart is never corrupted.

---

### Department Deactivation Protections

**Q: Can an HR Administrator deactivate or delete a department that still has employees in it?**
**A:** No. The system enforces strict **Department Deactivation Protections**:
- If any employees, managers, or HR personnel are currently assigned to a department, the system will reject any attempt to deactivate or delete it with a "Department in Use" notification.
- The notification informs HR of the exact number of active members attached to the department.
- HR must first execute a Department Transfer to reassign all attached members to another active department before the old department can be safely deactivated.

---

### Viewing Company Structure

**Q: Can standard employees view company locations and departments?**
**A:** Yes. All authenticated members of the organization (Employees, Managers, and HR) have read-only access to view active company locations and departments.

This visibility allows team members to view company directories, identify department heads, and select appropriate organizational categories when viewing team structures.

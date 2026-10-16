# HRMS Core Workflow Guide: Employee Hierarchy, Approvals & Department Transfers (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to reporting hierarchy structures, manager-subordinate mappings, approval routing dependencies, Head of Department (HOD) responsibilities, department transfers, and atomic hierarchy rewiring within the HRMS.

---

### The Reporting Hierarchy & Approval Backbone

**Q: What is the Reporting Hierarchy in the HRMS?**
**A:** The Reporting Hierarchy defines the official managerial reporting lines within an organization, establishing who reports to whom across departments and teams.

Rather than being just an organizational chart, the reporting hierarchy serves as the operational backbone for all automated approval workflows across the entire HRMS platform. When an employee takes an action—such as requesting leave, regularizing attendance, or filing an expense reimbursement—the system consults the reporting hierarchy to determine which manager has the authority to review and approve the request.

---

**Q: Which modules depend on the Reporting Hierarchy?**
**A:** Multiple core modules rely directly on reporting relationships:

- **Leave Management:** Leave requests submitted by an employee are automatically routed to their designated reporting manager's approval queue.
- **Attendance & Regularization:** Attendance anomalies (missed punches, late arrivals, out-of-geofence alerts) and regularization requests appear on the direct manager's attendance dashboard.
- **Variable Pay & Promotions:** Only direct managers can propose spot bonuses, performance awards, or salary increment recommendations for their subordinates.
- **Expense Reimbursements:** Business expense claims require the direct manager's review before being forwarded to HR and Finance for payment.

---

**Q: What types of reporting relationships are allowed in the system?**
**A:** The HRMS enforces strict hierarchical mapping rules based on roles:

- **Employee to Manager:** Standard employees report to a designated Team Manager or Department Lead.
- **Employee to HR:** In flatter organizations or small teams, employees can report directly to an HR Administrator.
- **Manager to HR:** Team Managers report to Senior Department Heads or HR Administrators.
- **Prohibited Relations:** A standard Employee cannot be assigned to report to another standard Employee. The system strictly rejects any attempt to create an employee-to-employee reporting line with an **Invalid Reporting Hierarchy** validation error.

---

### Core Hierarchy Invariants & Business Rules

**Q: Can an employee be their own reporting manager?**
**A:** No. The system enforces a strict "No Self-Management" rule.

Allowing a user to act as their own manager would create a severe conflict of interest, enabling users to self-approve their own leaves, overtime hours, and attendance regularizations. The system explicitly blocks any assignment where the manager identifier matches the subordinate identifier with a **Self-Reporting Not Allowed** error.

---

**Q: What is a Head of Department (HOD)?**
**A:** A Head of Department (HOD) is an authorized Manager or HR Administrator designated as the primary administrative leader of a specific department (for example, Head of Engineering or Head of Sales).

The HOD holds overall managerial responsibility for all team members in that department. If an employee is transferred into a department without a specifically chosen team lead, they automatically default to reporting to the department's HOD.

---

**Q: Who is eligible to be appointed as an HOD?**
**A:** Only users holding the **Manager** or **HR** role are eligible to be assigned as Head of Department.

Standard employees cannot be designated as an HOD. If an organization wishes to appoint an employee as a department head, an HR administrator must first promote the individual's role to Manager before assigning them as the HOD.

---

**Q: Can a department with active employees exist without an HOD?**
**A:** No. The system enforces an invariant that any department containing active employees must have an assigned Head of Department.

This rule prevents "orphan" employees from being stranded in a department without a supervisory manager to review their leaves, approve timesheets, or conduct evaluations.

---

### Regular Employee Department Transfers

**Q: How does HR transfer an employee from one department to another?**
**A:** HR administrators initiate transfers from the Employee Profile section by selecting **Department Transfer**:

1. Select the employee and click "Transfer Department."
2. Choose the **New Department** from the list of active organization departments.
3. Choose the **New Reporting Manager** in the new department (or choose to adopt the new department's HOD).
4. If the new department is situated in a different office facility, update the employee's **Office Location**.
5. Submit the transfer.

---

**Q: What happens behind the scenes during a department transfer?**
**A:** The transfer is executed as an **atomic, all-or-nothing operation**:

- The employee's department and reporting manager fields are updated simultaneously.
- The previous reporting mapping is safely closed, and a new active reporting mapping to the new manager is created.
- If the employee moved to a different office branch, their assigned geofencing coordinates for attendance are automatically switched to the new office location.
- If any part of the transfer fails, the entire transaction rolls back cleanly, ensuring the employee is never left in a partially transferred state.

---

### The "HOD Transfer / Swap" Workflow

**Q: What makes transferring a Head of Department (HOD) more complex than transferring a regular employee?**
**A:** When an employee being transferred is currently the Head of Department, transferring them without reassigning their leadership role would leave the entire department without an HOD and strand all of their subordinates without an approver.

To prevent this organizational breakdown, the HRMS enforces the **HOD Swap Workflow**: an HOD cannot be transferred unless a **Replacement HOD** is provided in the exact same transfer action.

---

**Q: How does the HOD Swap process work step-by-step?**
**A:** When HR transfers a user who is currently an HOD:

1. HR selects the departing HOD and initiates the transfer.
2. The system detects that the user is an active HOD and requires HR to designate a **Replacement HOD** (an existing Manager or HR member).
3. Upon submission, the system executes an automated, atomic rewiring:
   - **Adopts Subordinates:** All current employees who reported to the departing HOD are automatically reassigned to report to the replacement HOD.
   - **Updates Department Leadership:** The old department's leadership record is updated to the replacement HOD.
   - **Moves the Departing HOD:** The departing HOD is moved to their new department and assigned their new reporting manager.
   - **Optional New Leadership:** If designated, the transferred user can simultaneously assume leadership as the HOD of their new department.

---

**Q: Why does the system say "HOD State Mismatch" during a transfer?**
**A:** This error occurs if there is a discrepancy between the user's recorded department head status and the transfer request parameters.

The system verifies current department leadership in real time. If an administrator attempts to perform a standard employee transfer on an individual who is actually an active HOD without specifying a replacement HOD, the system halts the transfer with an **HOD State Mismatch** alert to prevent stranding department subordinates.

---

### Cross-Module Impacts & Offboarding Rewiring

**Q: What happens to pending approval requests when an employee transfers to a new manager?**
**A:** Approval queues update immediately to reflect the new reporting line:

- The previous manager immediately loses access to approve any future leave, attendance regularization, or reimbursement requests for the transferred employee.
- The new manager instantly gains supervisory access and receives all new requests submitted by the employee from that moment forward.

---

**Q: What happens to the reporting hierarchy when a Manager leaves the company or is offboarded?**
**A:** When an HR administrator deactivates or offboards a manager, the system prevents the action until their direct reports are safely reassigned.

HR must either:
- Reassign the departing manager's subordinates to another active team manager, or
- Automatically elevate the subordinates to report directly to the Head of Department or HR.

This safeguards the organization against broken approval chains, ensuring that employee leave and attendance workflows continue operating without interruption.

---

### Troubleshooting Common Hierarchy Errors

**Q: Why does the system display "New Department Has No HOD. You Must Provide a New Manager ID"?**
**A:** This occurs when you transfer an employee to a department that does not currently have an assigned Head of Department.

Because the system cannot automatically inherit an HOD for the employee, you must explicitly select an active Manager or HR administrator in the transfer form to serve as the employee's new reporting manager.

---

**Q: Why does the system reject an assignment with "Employee Role is 'Employee', Not 'Manager'"?**
**A:** This error occurs if you attempt to assign an employee to an action or leadership role reserved exclusively for managers (such as acting as an HOD or assigning another employee to report to them).

To resolve this, navigate to the organization's member management section and update the user's role to Manager before appointing them to supervisory positions.

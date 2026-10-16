# HR & Manager Guide: Member Invitations, Role Priorities & Onboarding (Q&A)

This document provides a comprehensive, stateless guide to inviting new team members, managing role permissions, understanding invitation security, and onboarding employees into the HRMS.

---

### Sending Member Invitations

**Q: What is a Member Invitation in the HRMS?**
**A:** A Member Invitation is an administrative process that allows an organization to securely onboard a new or existing person into their company workspace.

Instead of creating unverified accounts manually, an authorized manager or HR administrator issues an email invitation containing a secure, single-use link that guides the recipient through setting up their credentials and joining the organization.

---

**Q: Who has permission to invite new members to the organization?**
**A:** Both **HR Administrators** and **Managers** have authority to invite members, but with important scope differences:
- **HR Administrators:** Have full organization-wide authority. They can invite any role (Employee, Manager, or HR), assign members to any department or location, set official job codes and statutory tax details, and appoint Department Heads.
- **Managers:** Have team-level authority. They can only invite individuals to join their own direct team. The system automatically designates the inviting manager as the recipient's reporting manager.

---

**Q: What fields can a Manager fill out when inviting someone?**
**A:** To protect company structure and statutory compliance, the HRMS enforces a strict separation between HR-level organizational data and manager-level team invitations:
- **Allowed for Managers:** Personal and contact details, such as full name, contact phone number, personal email, current and permanent address, date of birth, and blood group.
- **Restricted to HR Administrators Only:** Official job and organizational fields, such as employee ID code, department assignment, physical office location, designation title, PAN number, UAN number, job status, employment type, work mode, joining date, and Head of Department status.

If a manager attempts to configure any of these restricted organizational fields, the system will block the request.

---

**Q: Can a Manager invite another Manager or an HR Administrator?**
**A:** No. The system strictly prevents privilege escalation through **Role Priority Policies**:
- A user can never invite an individual to a role that carries higher authority or priority than their own.
- An HR Administrator can invite Employees, Managers, and fellow HR Administrators.
- A Manager can only invite Employees to their team and cannot invite Managers or HR Administrators.

---

### Head of Department (HOD) Rules During Invitation

**Q: Can an employee be designated as a Head of Department (HOD) when being invited?**
**A:** No. The system strictly enforces that only users invited as a **Manager** or **HR Administrator** can be appointed as a Head of Department. Any invitation attempting to designate an Employee as an HOD is rejected.

Furthermore, an HOD cannot be assigned in a vacuum—a specific Department must be selected when enabling the HOD designation.

---

**Q: What happens if a person invited as an HOD never accepts their invitation?**
**A:** The HRMS uses a two-phase staging mechanism for Department Heads:
- When the invitation is sent, the HOD handover is **staged** rather than immediately applied.
- The existing department head and current team reporting lines remain completely uninterrupted while the invitation is pending.
- The official HOD title and reporting line transfers are executed **only after** the invitee clicks the link, enters their credentials, and formally accepts the invitation. This prevents departments from being left without leadership if an invitee declines or ignores the email.

---

### Reporting Lines & Hierarchy Assignment

**Q: How is an invited employee's reporting manager determined?**
**A:** The reporting manager is assigned according to the following rules:
1. **Invited by a Manager:** The invitee is automatically assigned to report directly to that manager.
2. **Explicit Assignment by HR:** An HR Administrator can explicitly select any active Manager or HR Administrator in the organization as the reporting person.
3. **Department Head Default:** If an HR Administrator assigns an employee to a department but does not specify an individual manager, the system automatically defaults the employee's reporting manager to the designated Head of that Department.

---

**Q: When does an invited member appear on their manager's team dashboard?**
**A:** The reporting relationship remains in an inactive, pending state while the invitation is awaiting acceptance.

Once the recipient formally accepts the invitation and activates their account, the reporting line is activated, and the employee instantly appears in their manager's team roster, live attendance dashboard, and approval queues.

---

### Invitation Links, Validation & Acceptance

**Q: How long is an invitation link valid?**
**A:** Every invitation link is valid for **48 hours** from the time it is issued. If the link is not used within 48 hours, it expires automatically for security purposes, requiring an administrator or manager to resend it.

---

**Q: What happens when an invitee clicks the invitation link?**
**A:** When the recipient opens the link in their web browser:
1. The system validates that the invitation token is authentic and has not expired.
2. The page displays the organization's official name, logo, industry, and branding so the user can verify the company's identity.
3. If the recipient is a brand-new user, the page prompts them to create a secure account password. If the recipient already has an existing account on the platform, they are prompted to log in and confirm joining the new organization.

---

**Q: What happens if an organization reaches its subscription limit before an invitee accepts?**
**A:** The system validates subscription capacity at both the time of invitation and the exact moment of acceptance.

If an organization reaches its maximum allowed employee or manager quota while an invitation is pending (for example, if other employees accepted earlier), the system will prevent the final acceptance until an HR Administrator upgrades the subscription plan to accommodate the additional member.

---

### Resending & Revoking Invitations

**Q: How do I resend an invitation if an employee did not receive the email or the link expired?**
**A:** An HR Administrator or the original inviting manager can navigate to the pending invitations list and click "Resend Invitation":
- The system generates a fresh invitation link with a renewed 48-hour expiration window and dispatches a new email.
- **Data Protection:** Resending does not wipe out or overwrite any previously entered details. The employee's assigned department, designation, personal details, and reporting lines are completely preserved.
- The previous email link is immediately invalidated so that only the latest link can be used.

---

**Q: How do I cancel or revoke an invitation that was sent by mistake?**
**A:** An HR Administrator or the inviting manager can click "Revoke Invitation" for any pending invite:
- The invitation link is permanently cancelled and can no longer be used.
- The pending reporting hierarchy line is safely deactivated.
- Any pre-allocated employee ID codes or profile reservations are cleared, freeing up the employee ID code so it can be assigned to someone else.
- Once revoked, the user will see an "Invitation is invalid or expired" notice if they attempt to open the original link.

---

### Viewing the Invitation List

**Q: Where can I see everyone we have invited and what happened to each invitation?**
**A:** The pending-invitations list shows every invitation with a live status, who sent it, when, how many times it has been sent, and whether the email actually reached the recipient. It is the working surface for resending and revoking, and it doubles as the record of invitations that were withdrawn.

---

**Q: What do the four invitation statuses mean?**
**A:**
- **Pending** — the invitation was sent and the 48-hour link is still valid. The person has not acted on it yet.
- **Accepted** — the person completed onboarding and is now a member. This is final; an accepted invitation can never revert to any other status.
- **Revoked** — an HR Administrator or the inviting manager cancelled the invitation. The link no longer works.
- **Expired** — nobody cancelled it, but the 48-hour window elapsed without the person accepting. Resending it starts a fresh window.

Statuses are worked out at the moment you look at the list, so they are never stale — an invitation whose window lapses a second ago shows as expired on the very next refresh, with no overnight job involved.

---

**Q: Does a revoked invitation disappear from the list?**
**A:** No. Revoking marks the invitation as revoked and records who cancelled it and when; the entry stays visible. This is deliberate — "we invited this person and then withdrew it" is exactly the kind of thing an audit needs to be able to see, and a list that silently deleted entries could not answer it.

The same applies to accepted invitations: they remain in the list, marked accepted.

---

**Q: If I invite the same person again, do I get two entries?**
**A:** It depends on what happened to the first one:
- If the earlier invitation is still open or has simply **expired**, re-inviting refreshes that same entry — the send count goes up and the window restarts. You get one entry, not two.
- If the earlier invitation was **revoked**, re-inviting creates a new entry, and the revoked one remains beside it so the withdrawal is not erased from the record.

---

**Q: Can a Manager see every invitation in the organization?**
**A:** No. A Manager sees the invitations they sent themselves. HR Administrators see every invitation in the organization. This mirrors the invitation rules: a manager can only invite people into their own team, so the list they can see matches the authority they actually have.

---

**Q: How do I tell whether the invitation email actually reached the person?**
**A:** Each entry carries a delivery outcome:
- **Sent** — the email provider accepted the message.
- **Failed** — the provider rejected it, and the reason is shown alongside (a mistyped address, a full mailbox, and so on). The invitation itself is still perfectly valid; correct the address by re-inviting, or simply resend.
- **Queued** — the invitation was created but the delivery result was never recorded, which usually means something interrupted the system mid-send. Resending is the fix.

A failed email has never prevented an invitation from being created or accepted — the link is valid whether or not the mail got through.

---

**Q: Can anyone see the invitation link or token from the list?**
**A:** No. The invitation link is a credential and exists only inside the email that was sent to the invitee. It is not stored alongside the invitation record and it is never shown in the list, to anyone, at any permission level. If someone loses their link, resend the invitation — that issues a fresh one and invalidates the old.

---

**Q: Our organization has not invited anyone yet. Is an empty list an error?**
**A:** No. An organization with no invitations, or a filter combination that matches nothing, simply shows an empty list. It is a normal, successful result, not a failure.

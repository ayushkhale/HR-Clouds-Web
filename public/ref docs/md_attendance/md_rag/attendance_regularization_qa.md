# Employee & Manager Guide: Attendance Regularization & Adjustments (Q&A)

This document provides a comprehensive, stateless guide to Attendance Regularization in the HRMS, explaining how employees submit retroactive corrections, how managers review and approve them, and how the system recalculates working hours and interacts with leave balances.

---

### Understanding Attendance Regularization

**Q: What is Attendance Regularization in the HRMS?**
**A:** Attendance Regularization is a self-service feature that allows an employee to request a retroactive correction to their attendance record for a specific past date when punches were missing, inaccurate, or incomplete.

Employees typically use regularization when they forgot to clock in or clock out, experienced hardware or mobile GPS issues, attended off-site client meetings, or were erroneously marked absent.

---

**Q: In what situations should an employee submit an Attendance Regularization request?**
**A:** Regularization is used in situations such as:
- Forgetting to clock in upon arrival in the morning.
- Forgetting to clock out at the end of the day, resulting in an auto-closed or incomplete shift.
- System or device issues (such as an unmapped biometric badge, biometric reader power outage, or phone battery dying).
- Working off-site on official business where mobile clock-in was unavailable.
- Working on a day that was previously approved as leave, requiring the attendance record to be converted to a working day and the leave refunded.

---

### Submitting a Regularization Request

**Q: How do I submit an Attendance Regularization request?**
**A:** You can submit a regularization request by navigating to the Attendance section on your dashboard, selecting "Regularization Requests", and clicking "New Request".

You must select the target date, provide your requested clock-in and clock-out times, optionally choose your work mode (such as Office or Remote), and provide a mandatory explanation or reason for the correction.

---

**Q: What fields are required when submitting a Regularization request?**
**A:** The required fields are:
- **Date:** The specific past date you need to correct.
- **Requested Times:** The corrected clock-in time and clock-out time. If you only forgot to clock out, you can provide just the clock-out time, and the system will safely retain your existing morning clock-in punch.
- **Reason:** A mandatory text explanation stating why your attendance was incomplete or needs correction.
- **Work Mode (Optional):** Specifies whether the work occurred in the Office, Remotely, or in the Field.

---

**Q: Can I submit a regularization request if I was completely absent and have no punches at all for that day?**
**A:** Yes. If you were marked absent because you recorded no punches at all, you can submit a regularization request. In this scenario, you must provide **both** a valid clock-in time and a valid clock-out time, as there are no existing punches in the system for that day to fall back on.

---

**Q: How far back in time can I regularize my attendance?**
**A:** Your company attendance policy defines a specific regularization window (for example, within 7 or 14 days of the date in question).

If you attempt to regularize a date that is older than the allowed policy window, the system blocks the request with a notification that you cannot regularize dates older than the specified limit. You should submit corrections promptly following any missed punch.

---

**Q: Can I submit multiple regularization requests for the same date?**
**A:** No. You can only have one pending regularization request per date at any given time.

If you already submitted a request that is awaiting managerial review, attempting to submit a second request for that same date will result in an alert stating that a pending request already exists.

---

**Q: What does the error "Requested clock-out must be after clock-in" mean?**
**A:** The system validates that your work period is chronologically valid. Your requested clock-out time must occur after your clock-in time. If the clock-out timestamp is earlier than or identical to your clock-in timestamp, the submission is rejected.

---

**Q: Can I withdraw or cancel a regularization request that I previously submitted?**
**A:** Yes, provided the request is still in the "Pending" status. You can navigate to your regularization requests list and click "Cancel" or "Withdraw".

Once withdrawn, the request is marked as "Cancelled", and your manager will no longer see it in their pending approval queue. If your manager has already approved or rejected the request, you cannot cancel it self-service.

---

### Manager Review & Approval Workflows

**Q: Who approves my Attendance Regularization request?**
**A:** The request is automatically routed to your designated reporting manager. If you report to HR or do not have an assigned manager, the request is escalated to authorized HR Administrators who have permissions to review organization-wide requests.

---

**Q: What options does a manager have when reviewing a regularization request?**
**A:** When reviewing a pending regularization request, the manager can:
- **Approve:** Accepts the employee's submitted timings, adds review remarks, and updates the official attendance record.
- **Reject:** Declines the request with mandatory review remarks explaining why the correction was not accepted. The employee's original attendance record remains unchanged.

---

**Q: What happens to my attendance record when my manager approves my regularization?**
**A:** Upon approval, the system executes an automated recalculation:
1. The attendance record is updated with the approved clock-in and clock-out times and marked as "Regularized".
2. The system recalculates your Total Hours, Effective Hours, Late Minutes, Early Exit Minutes, and Overtime based on your assigned shift and policy.
3. Your daily status is updated to "Present" or "Half Day" based on the recalculated effective hours.
4. Any previous system-detected anomalies (such as "Missing Clock Out" or "Unauthorized Absence") that were resolved by the new timings are cleared.

---

### Cross-Module Interaction: Regularizing an "On Leave" Day

**Q: What happens if I had an approved leave, but I actually worked and my regularization request is approved?**
**A:** The HRMS has built-in cross-module synchronization between Attendance and Leave.

If your attendance status for that date was originally set to "On Leave" due to an approved leave request, and your manager approves a regularization request confirming you actually worked, the system automatically voids the leave deduction for that day and **refunds 1.0 day (or 0.5 days for a half-day) directly back into your leave balance wallet**.

---

**Q: If my refunded leave was funded by a Compensatory Off (Comp Off), do I get the Comp Off back?**
**A:** Yes, with a safety check on expiry:
- If the original Comp Off credit has **not yet expired**, the system restores the Comp Off status to "Approved", making it available for you to use on a future leave request.
- If the original Comp Off has **already expired** past its validity period, the system updates its status to "Expired" and will not refund the day, preventing expired benefits from being improperly recycled.

---

### Payroll Locks & Restrictions

**Q: Why does the system block my regularization with the message "Date is locked for payroll"?**
**A:** When the HR or Finance team finalizes attendance data to disburse monthly salaries, they create an official Payroll Lock Period (for example, freezing the 1st through the 30th of the previous month).

While a date is covered by an active payroll lock, the system strictly forbids any retroactive modifications—including submitting new regularizations, approving pending regularizations, or canceling existing regularizations. This ensures that historical payroll calculations remain 100% stable and audit-compliant.

---

**Q: What should an employee do if they need to regularize a date that is locked for payroll?**
**A:** If a legitimate correction is required for a locked payroll period, the employee must contact their HR Administrator. Only an HR Administrator can temporarily lift or adjust the payroll lock period, after which the regularization can be processed and any salary adjustments handled through subsequent payroll cycles.

# Employee & Manager Guide: Attendance Overtime & Compensatory Offs (Q&A)

This document provides a comprehensive, stateless guide to Overtime and Compensatory Offs (Comp Offs) in the HRMS, explaining how additional working hours are evaluated, how comp-off leave credits are earned, how validity and expiration are handled, and how the approval process operates.

---

### Understanding Overtime (OT)

**Q: What is Overtime in the HRMS?**
**A:** Overtime refers to additional working hours performed by an employee beyond their scheduled full-day shift requirements on a regular working day.

When you work longer than your standard shift, the system tracks the extra productive time and evaluates whether it qualifies for formal overtime recognition and compensation.

---

**Q: How does the system calculate whether I have earned Overtime?**
**A:** Overtime calculation is governed by your company attendance policy:
1. **Threshold Requirement:** Your Effective Hours (total hours minus break durations) must first exceed the full-day minimum requirement (typically 8 hours).
2. **Minimum Extra Duration:** The excess time worked must meet or exceed the policy's minimum overtime threshold (for example, at least 30 extra minutes). Working an extra 10 or 15 minutes is typically treated as a standard buffer and does not register as overtime.
3. **Calculation:** Once the threshold is met, the system converts the full excess time beyond standard shift hours into overtime minutes.

---

**Q: Does Overtime require managerial approval?**
**A:** This depends on your organization's attendance policy:
- **Approval Required:** If the policy requires approval, your overtime record is placed into a "Pending" queue. Your reporting manager or HR must review and approve the overtime before it is credited to your payroll.
- **Auto-Approved:** If your organization does not require pre-approval, verified overtime hours are automatically marked as "Approved" as soon as your daily clock-out calculation completes.

---

**Q: What happens if my manager rejects my Overtime?**
**A:** If your reporting manager reviews your overtime and rejects it, the overtime record status is set to "Rejected" with the manager's review remarks. The extra hours will still be visible on your daily attendance log for record-keeping, but they will not count toward overtime payroll payouts.

---

**Q: Can I view my own overtime history?**
**A:** Yes. In your Attendance dashboard, navigate to "My Overtime" to view a complete history of all your recorded overtime sessions, including the date, number of overtime minutes, current status (Pending, Approved, or Rejected), and any managerial remarks.

---

### Understanding Compensatory Offs (Comp Offs)

**Q: What is a Compensatory Off (Comp Off)?**
**A:** A Compensatory Off (Comp Off) is a special leave credit awarded to an employee who performs official work on a scheduled non-working day, such as a company public holiday or a scheduled weekly rest day (weekend).

Instead of receiving extra overtime pay, the employee is granted compensatory time off that they can redeem as leave on a future working day.

---

**Q: How do I earn a Comp Off?**
**A:** You earn a Comp Off automatically by following these steps:
1. Your company attendance policy must have holiday/weekend work compensatory off enabled.
2. You must clock in and complete productive working hours on an official holiday or your scheduled weekly off day.
3. When you clock out, the system automatically marks your daily attendance status as "Present" and creates an "Earned" Comp Off record linked to that date.

---

**Q: What are the different statuses of a Comp Off record?**
**A:** A Comp Off record moves through the following lifecycle statuses:
- **Earned:** The system detected that you worked on a holiday or rest day, and the record is waiting for manager approval.
- **Approved:** Your manager has approved the earned comp off. The credit is now active, and 1 full day has been added to your Comp Off leave balance.
- **Used:** You have applied for and taken a leave using this Comp Off credit.
- **Expired:** The validity period (such as 90 days) passed before you used the credit, and it was automatically lapsed by the system.
- **Cancelled:** The comp off was rejected by your manager or cancelled by HR.

---

### The Comp-Off Approval & Leave Ledger Bridge

**Q: How does an earned Comp Off get added to my leave balance?**
**A:** Once you earn a Comp Off by working on a holiday or rest day, the request appears in your reporting manager's approval queue.

When your manager approves the request:
1. The Comp Off record status changes from "Earned" to "Approved".
2. The system sets an official expiry date (typically 90 days from the date it was earned).
3. **The system automatically credits +1.0 day directly into your "Comp Off" leave balance wallet** in the Leave module for that calendar year.

You do not need to manually request a balance adjustment from HR; the bridge between Attendance and Leave happens instantly upon approval.

---

**Q: How do I use my approved Comp Off?**
**A:** You redeem an approved Comp Off just like applying for any regular leave. Go to the Leave section, choose the "Comp Off" leave type, select the date you wish to take off, and submit your application.

When your leave is approved, the system automatically links the leave to your oldest approved Comp Off credit and updates the comp-off record to "Used".

---

**Q: Do Comp Offs expire if I do not use them?**
**A:** Yes. Comp Off credits are intended to provide timely rest after working on holidays and are not meant to accumulate indefinitely.

Every approved Comp Off has a strict validity window (typically 90 days from the earned date). The system runs an automated nightly audit:
- If an approved Comp Off crosses its expiry date without being redeemed, its status is changed to "Expired".
- **The system automatically debits 1 day from your "Comp Off" leave balance wallet**, ensuring your available balance always reflects only valid, redeemable credits.

---

**Q: What happens if I cancel a leave that was taken using a Comp Off?**
**A:** If you cancel a leave that was funded by a Comp Off (and your manager approves the cancellation), the system checks the validity of the underlying Comp Off credit:
- **Still Valid:** If the Comp Off's original 90-day expiry date has not yet arrived, the credit is returned to the "Approved" state, and your leave balance is refunded so you can use it again.
- **Already Expired:** If the original expiry date has already passed by the time the leave is cancelled, the system marks the comp off as "Expired" and **does not refund the leave balance**. This prevents expired comp-off credits from being artificially renewed.

---

### Employee Self-Service & Balances

**Q: How can I check how many Comp Offs I have available?**
**A:** In the Attendance section under "Comp Offs", you have access to two self-service views:
1. **My Comp Offs List:** Displays each earned record, the date you worked, the hours completed, the current status, and the exact expiry date.
2. **Comp Off Summary:** Provides an instant snapshot of your credits:
   - Total Earned to date
   - Available / Redeemable Balance (approved and currently valid)
   - Used Days
   - Expired Days

---

### Manager & HR Supervision

**Q: How does a manager review pending Overtime and Comp Offs?**
**A:** Managers have dedicated approval queues under their Manager Attendance dashboard:
- **Pending Overtime:** Lists all subordinate overtime claims showing the employee name, date, excess minutes worked, and shift details.
- **Pending Comp Offs:** Lists all subordinate holiday/rest day work records showing the date worked and effective hours completed.

Managers can approve or reject each item with review remarks.

---

**Q: Can Overtime or Comp Offs be approved if the date is locked for payroll?**
**A:** No. If HR has finalized and locked the payroll period for that month, the system prevents any approvals, rejections, or status changes for dates falling within the lock window. All approvals must be completed before HR applies the monthly payroll lock.

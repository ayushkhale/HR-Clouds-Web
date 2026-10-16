# HR & Employee Guide: Attendance Integration & Comp Offs (Q&A)

This document explains how the Leave system interacts with your daily Attendance, specifically focusing on Compensatory Offs (Comp Offs), regularization, and other automated hooks.

### Earning and Using Comp Offs

**Q: What is a "Comp Off"?**
A Comp Off (Compensatory Off) is a special leave type granted when an employee works on a holiday or a weekend. 

**Q: How do I earn a Comp Off?**
If you work on a non-working day (such as a weekend or public holiday), you can apply for a Comp Off in the Attendance system. Once your manager approves the Comp Off request, the system automatically adds to your "Comp Off" leave balance (typically 1 day for a full day worked, depending on your organization's attendance rules).

**Q: Do Comp Offs expire?**
Yes. The validity timeframe of a Comp Off depends on your organization's policy. Organizations configure their own expiration window (for example, 30, 60, or 90 days from the date you earned it). The system runs a daily check, and if you haven't used your Comp Off before the configured expiry window ends, it will automatically lapse and be deducted from your balance.

**Q: How do I use a Comp Off?**
You apply for it just like any other leave. When you submit a leave request under the "Comp Off" leave type, the system will use your oldest, non-expired Comp Off to fulfill the request.

**Q: What happens if I cancel a Comp Off leave request?**
If you cancel a Comp Off request (and your manager approves the cancellation), the system will try to refund the Comp Off to you. However, if the Comp Off's original expiry date has already passed by the time you cancel, the system will not refund it.

### Regularization and Leave Adjustments

**Q: What happens if I was marked "On Leave", but I actually worked and I regularize my attendance?**
If you had an approved leave for Tuesday, but you ended up working and you regularize your Tuesday attendance (changing it from "On Leave" to "Present"), the system automatically detects this conflict. When your manager approves your regularization, the system will immediately refund that 1 day back into your leave balance.

### Employee Exits

**Q: What happens to my approved future leaves if I resign or my account is deactivated?**
When HR deactivates an employee's account (e.g., on their last working day), the system automatically finds any approved leaves that were scheduled for the future. It cancels those future leaves, removes them from the attendance calendar, and cleans up the records to ensure payroll and attendance remain accurate. It will not touch any leaves you have already taken in the past.

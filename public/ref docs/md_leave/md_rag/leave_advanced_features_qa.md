# HR & Employee Guide: Advanced Leave Rules & Shift Handling (Q&A)

This document explains the advanced features of the Leave Management System, including how it handles shift workers, demographic rules, mandatory documents, and notice periods.

### Shift Work and Overnight Leaves

**Q: How does the system handle leave for employees working overnight shifts?**
If you are assigned to a shift that spans across midnight (e.g., 10 PM to 6 AM), applying for a single day of leave will automatically mark both calendar dates as "On Leave" in the attendance system, but it will accurately only deduct 1.0 day from your leave balance.

**Q: What if I only want to take a Half-Day leave during an overnight shift?**
If you apply for the "First Half" of your overnight shift, the system will mark your absence on the calendar date the shift started. If you apply for the "Second Half", it will mark the absence on the calendar date the shift spills into (after midnight).

### Medical Certificates & Required Documents

**Q: Why is the system asking me to upload a document for my leave?**
HR can configure a "Document Threshold" for certain leave types. 
*Additional Explanation:* This requirement depends on your organization's policy. For example, an organization might set the threshold for Sick Leave to 2 days, meaning any Sick Leave request for 3 or more consecutive days mandates you to upload a supporting document (such as a medical certificate or doctor's note) before submitting. Other organizations might configure a different threshold (e.g., 3 days) or not require documents at all for certain leave types.

**Q: Can I avoid the document requirement by splitting a 3-day leave into a 2-day leave and a separate 1-day leave?**
No. The system's "anti-smurfing" feature detects if you have back-to-back leave requests of the same type. It automatically combines their durations to check against the document threshold. If the combined total exceeds the limit, the system will block the second request until a document is provided.

### Demographic Rules

**Q: Why can't I see a specific leave type in my dropdown when I apply?**
HR can restrict certain leave types based on demographic factors, such as Gender or Marital Status. 
*Additional Explanation:* For example, "Maternity Leave" will only be visible and available to female employees. If your employee profile is missing this demographic data, the system will ask you to contact HR to complete your profile before you can apply.

### Resignation & Notice Period Limits

**Q: Are there limits on what leaves I can take if I have resigned and am serving my notice period?**
Yes. HR can configure "Notice Period Caps" for different leave types.
*Additional Explanation:* These caps can depend on organization to organization. For instance, an organization's HR might allow taking up to 2 days of Casual Leave during your notice period, but 0 days of Privilege/Earned Leave. Another company might completely disallow all leaves during notice period. The system calculates how many leaves you have taken specifically *during* your notice window, and will reject any request that pushes you over your company's configured cap. 

### Location and Department Specific Holidays

**Q: Does the system know if my specific office location has a public holiday?**
Yes. The system supports targeted calendar exceptions. HR can create a holiday that only applies to a specific Location or Department. If a holiday only applies to the Mumbai office, an employee in the Delhi office applying for leave on that day will have 1 day deducted from their balance, while a Mumbai employee will have 0 days deducted.

# HR Admin Guide: Setting Up Leave Policies (Q&A)

This document explains how HR Administrators can set up and configure the Leave Management System for their organization.

### Understanding Leave Types

**Q: What is a "Leave Type" in the system?**
A Leave Type defines a specific category of time off that employees can take, such as Sick Leave, Casual Leave, or Maternity Leave. Every organization can create their own custom list of leave types.
*Additional Explanation:* When creating a leave type, you are establishing the basic rules for that category before deciding how many days of it an employee gets. 

**Q: Can I specify if a leave type is paid or unpaid?**
Yes. When creating a leave type, you can toggle whether it is a paid leave or an unpaid leave (like Leave Without Pay).

**Q: What is the "Document Threshold" setting?**
The Document Threshold defines how many consecutive days an employee can take off before they are required to upload a supporting document (like a medical certificate). 
*Additional Explanation:* This threshold can depend on the organization's HR policy. For example, if an organization sets the threshold to 2 for Sick Leave, an employee requesting 3 or more consecutive days of Sick Leave will be forced to attach a document to their request. Another organization may configure this threshold differently (e.g., 3 days) or disable it altogether for other leave types.

**Q: What is the "Sandwich Rule"?**
The Sandwich Rule is an HR policy where weekends or public holidays that fall between your leave days are also counted as leave days.
*Additional Explanation:* Whether this rule applies depends on each organization's policy for that leave type. For example, if an organization turns the Sandwich Rule ON for Casual Leave, and an employee takes Friday and Monday off, the weekend (Saturday and Sunday) will also be deducted from their leave balance, making it a 4-day deduction instead of 2.

**Q: Can I restrict certain leave types to specific employees based on gender or marital status?**
Yes. You can configure leave types to only be available to specific demographic groups. 
*Additional Explanation:* This is particularly useful for leaves like Maternity Leave (restricted to females) or Paternity Leave (restricted to males). If left blank, the leave type is available to everyone.

**Q: How do I remove a leave type that we no longer use?**
You can delete a leave type from the system. However, for audit and historical purposes, the system performs a "soft delete" so past records aren't broken.
*Additional Explanation:* If there are pending leave requests for that specific leave type, the system will prevent you from deleting it until you approve or reject those pending requests.

### Understanding Policy Templates & Entitlements

**Q: What is a Leave Policy Template?**
A Leave Policy Template is a bundled package of leave rules. Instead of assigning individual leave quotas to every single employee one by one, you create a Template (e.g., "Standard Full-Time Employee Policy") and assign that template to the employees.

**Q: What are "Entitlements" inside a template?**
Entitlements are the specific quotas and rules attached to a template. For a given template, you add entitlements to dictate exactly how many days of each Leave Type the employee receives.
*Additional Explanation:* The exact number of days depends on the organization's internal policy. For example, inside a "Standard Policy" template, one organization might configure 18 days of Earned/Privilege Leave, 12 days of Sick Leave, and 10 days of Casual Leave. Another organization might set 15 days of Casual Leave and 12 days of Sick Leave.

**Q: What is the difference between "Upfront" and "Monthly" accrual?**
This determines how leave balances are credited to the employee:
- **Upfront:** The entire annual quota is given to the employee immediately at the start of the year (or when the policy is assigned).
- **Monthly:** The annual quota is divided by 12, and the employee slowly earns a portion of their leave at the end of every month.

**Q: Can employees carry forward unused leaves to the next year?**
Yes, if the organization's policy allows it. Inside the entitlement settings, you can define a "Max Carry Forward" limit.
*Additional Explanation:* Carry-forward rules can depend on organization to organization. Some companies operate on a strict "use-it-or-lose-it" policy (0 carry forward), whereas others allow a rollover cap. For example, if an employee has 10 days of unused leave at year-end and the organization sets the Max Carry Forward to 5 days (or 18 days in other organizations), only up to the configured limit will roll over into the new year, and the remainder will lapse.

**Q: Can I prevent new hires from taking leave during their probation period?**
Yes. You can use the "Probation Restriction Days" setting. 
*Additional Explanation:* This duration depends on the organization's probation policies. For example, if an organization requires a 90-day probation (or 180 days), setting this to 90 days prevents an employee assigned to this policy from applying for this specific leave type until 90 days have passed since their joining date. If an organization grants leaves from day one, this can be set to 0.

**Q: What is the "Max Negative Balance" setting?**
This setting allows employees to borrow against their future leave accruals. 
*Additional Explanation:* Whether employees can borrow leaves depends on the organization's policy. If set to 0 (default in many companies), an employee cannot take more leave than they currently have in their balance. If an organization permits negative balances, HR can configure a negative limit (for example, allowing up to 2 or 5 days negative), enabling the employee to borrow days even if their current balance is 0, which they pay back as they accrue leaves in future months.

**Q: How does the system handle leaves during an employee's resignation notice period?**
You can configure a "Notice Period Max Days" cap on specific leave types.
*Additional Explanation:* Leave allowances during notice periods can depend on organization to organization. For example, an organization might set the cap to 0 days (barring that leave type completely during the notice period), whereas another company might allow a limited cap (for example, up to 2 or 3 days for emergencies). Any request that exceeds the configured cap will be blocked by the system.

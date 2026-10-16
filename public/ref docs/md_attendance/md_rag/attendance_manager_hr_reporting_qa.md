# Manager & HR Guide: Attendance Dashboards, Supervision & Reports (Q&A)

This document provides a comprehensive, stateless guide to Manager and HR Attendance Supervision, real-time dashboards, organization-wide analytics, payroll lock periods, and attendance report exports in the HRMS.

---

### Manager Team Supervision & Live Dashboards

**Q: What can a reporting manager see on the Team Today Live Dashboard?**
**A:** The Team Today Live Dashboard provides managers with real-time operational visibility into their direct and indirect subordinates:
- **Live Status:** Instantly see who is currently Clocked In (working), On Break, Absent, or On Approved Leave for today.
- **Punch Timestamps:** View exact clock-in times and active break durations.
- **Assigned Shifts:** View each team member's scheduled shift timings and work mode (Office, Remote, Field, or Hybrid).

---

**Q: Can a manager view historical attendance records for their team members?**
**A:** Yes. Under "Team History", managers can search and view paginated historical attendance records for all employees within their reporting hierarchy.

Managers can filter records across custom date ranges, inspect daily clock-in/out timestamps, review effective hours, check whether records were regularized, and view any late arrival or early exit minutes.

---

**Q: Can a manager inspect the detailed daily punch log for an individual employee?**
**A:** Yes. When reviewing a specific team member, managers can open their "Daily Log" for any selected date.

This view provides a minute-by-minute timeline of the employee's workday:
- Exact clock-in and clock-out timestamps
- All break intervals with start times, end times, and individual durations
- System-generated anomalies (such as excessive break or out-of-bounds punch)
- Work mode and regularized status

---

**Q: What are Team Attendance Trends and Graphs?**
**A:** The Team Graph Data view aggregates daily attendance metrics across the manager's entire team for a selected month and year.

It visualizes key operational metrics:
- Daily attendance percentages (Present vs Absent vs On Leave)
- Cumulative hours worked across the team
- Punctuality and late arrival trends over time

---

**Q: Can a Manager open a single day for one team member and see exactly what happened?**
**A:** Yes. The Member Daily Log renders one calendar day for one direct report in full detail:
- the shift the person was scheduled on that day
- every clock-in and clock-out session, not just the first and last
- every break taken, with its own start, end and duration
- the derived counters — late minutes, early exit minutes, overtime minutes, effective hours
- work mode and whether the day was regularized

It is the view to open before approving a regularization or answering "why is this day marked half-day", and it shows the manager exactly the same picture of that day that HR sees.

---

**Q: Which team members can a Manager open a daily log for?**
**A:** Only their own direct reports. Asking for a day belonging to someone outside the manager's reporting line is refused outright, and the refusal happens before any attendance data is read — so the view cannot be used to learn whether a record exists for someone the manager does not supervise. HR Administrators are not restricted in this way and can open any employee in the organization.

---

**Q: What does the daily log show for a day the employee never marked?**
**A:** It still opens, with a status worked out from the calendar rather than from a record: **Holiday**, **Weekly Off**, **Absent** for a past working day that should have been marked, or **Not Marked** for today (the day is not over) or for a date before the person joined. Counters read zero and there are no sessions or breaks to show. The absence of a record is itself the answer, so it is never treated as a missing page.

---

### HR Organization-Wide Dashboards & Analytics

**Q: What does the HR Organization Live Dashboard provide?**
**A:** The HR Live Dashboard offers executive, company-wide visibility across all departments and locations:
- Total organization workforce headcount scheduled for today
- Live count of employees currently Present (clocked in)
- Live count of employees currently On Break
- Count of employees currently On Approved Leave
- Count of employees who arrived late beyond their grace period
- Count of employees currently marked Absent or Not Yet Marked

---

**Q: What is the "Top Defaulters" report in HR Attendance?**
**A:** The Top Defaulters report is an administrative analytics tool that identifies employees with recurring attendance non-compliance over a specified timeframe.

It highlights:
- Employees with the highest cumulative late arrival minutes
- Employees with repeated missing clock-out punches
- Employees with frequent unauthorized absences

HR and department heads use this report to address punctuality concerns, provide operational coaching, or adjust unfeasible shift assignments.

---

**Q: What is the Work Mode Distribution dashboard?**
**A:** The Work Mode Distribution dashboard analyzes where employees are performing their duties:
- Displays percentage breakdowns of punches recorded under Office, Remote, Field, and Hybrid work modes.
- Helps HR evaluate facility utilization, hybrid work compliance, and remote working trends across different business units.

---

**Q: What is the Department Attendance Summary?**
**A:** The Department Summary provides comparative attendance benchmarks across different organizational departments:
- Total working days completed per department
- Average effective hours worked per team member
- Overall punctuality and on-time arrival percentages by department

---

### Payroll Lock Periods

**Q: What is a Payroll Lock Period in the HRMS?**
**A:** A Payroll Lock Period is an administrative control used by HR and Finance to freeze attendance records for a specific date range (for example, the 1st through the 30th of the preceding month).

Once locked, the system prevents any attendance modifications—including new punches, regularizations, overtime approvals, or comp-off edits—for all dates falling within the locked period.

---

**Q: Why are Payroll Lock Periods necessary?**
**A:** Freezing attendance data is critical for financial and payroll integrity:
- It ensures that salary calculations, overtime pay, and unpaid leave deductions remain 100% accurate and stable during payroll processing.
- It prevents employees or managers from making retroactive changes to past attendance that would invalidate already-disbursed paychecks.

---

**Q: Can a Payroll Lock Period be removed if a correction is needed?**
**A:** Yes. Only authorized HR Administrators and Super Admins have permission to manage lock periods.

If an exceptional retroactive correction is approved:
1. An HR Administrator deletes or adjusts the relevant payroll lock period.
2. The necessary attendance regularization or overtime approval is completed.
3. The HR Administrator re-applies the lock to protect the data, and any payroll adjustments are handled in the subsequent salary cycle.

---

### Attendance Reports & Data Exports

**Q: What types of Attendance Reports can HR generate?**
**A:** HR Administrators can generate three standard exportable reports:
1. **Daily Attendance Report:** A comprehensive, single-day register showing every employee's scheduled shift, punch timestamps, work mode, total hours, effective hours, and final daily status.
2. **Monthly Attendance Report:** A consolidated monthly register aggregating each employee's total present days, half-days, absences, approved leaves, total late days, cumulative overtime minutes, and total productive hours for payroll ingestion.
3. **Employee-Specific Attendance Report:** A detailed chronological audit of an individual employee's attendance records over a custom date range.

---

**Q: What formats are used for Attendance Reports?**
**A:** Attendance reports provide structured, tabular data suitable for direct export to Excel and CSV formats, allowing payroll software integration, compliance archiving, and internal audits.

# Employee, Manager & HR Guide: Shifts, Rotation Patterns & Shift Assignments (Q&A)

This document provides a comprehensive, stateless guide to Shifts, Shift Rotations, and Employee Shift Assignments in the HRMS, explaining how working hours are defined, how overnight schedules operate, how rotation cycles function, and how employees view their schedules.

---

### Understanding Shifts & Shift Templates

**Q: What is a Shift Template in the HRMS?**
**A:** A Shift Template is an administrative configuration that defines standard working hours, expected arrival and departure times, minimum required daily hours, and associated attendance policies for employees.

Shifts allow organizations to establish consistent schedules for different teams, departments, or operational facilities.

---

**Q: What types of Shifts are supported in the system?**
**A:** The HRMS supports four primary shift types:
1. **Fixed Shift:** Standard working hours with fixed start and end times (for example, 09:00 AM to 06:00 PM).
2. **Night / Overnight Shift:** A continuous shift that begins in the evening or night and crosses midnight into the following morning (for example, 09:00 PM to 06:00 AM).
3. **Flexible Shift:** A shift where employees are not held to strict arrival or departure times, but are required to complete a minimum number of effective hours (for example, at least 8 hours anytime during the day).
4. **Split Shift:** A schedule divided into two separate working periods on the same day with an extended gap in between (for example, 10:00 AM to 02:00 PM and 06:00 PM to 10:00 PM).

---

**Q: What are Shift Buffers and Grace Periods?**
**A:** Shift templates include timing tolerances to accommodate real-world employee schedules:
- **Grace Period:** An allowed window after the official shift start time (such as 15 minutes) during which arriving late is not penalized.
- **Buffer Minutes Before:** How early an employee can clock in before their shift officially begins.
- **Buffer Minutes After:** How late an employee can clock out after their shift ends without prematurely triggering early exit warnings or erroneous calculations.

---

### Overnight Shifts & Midnight Crossover

**Q: How does the system handle an Overnight Shift that crosses midnight?**
**A:** In an overnight shift (such as 10:00 PM to 06:00 AM), your work spans across two calendar dates. The HRMS handles this seamlessly:
1. **Single Business Date:** The entire shift is attributed to the calendar date on which you initially clocked in (the shift start date).
2. **Next-Morning Clock-Out:** When you clock out the following morning (for example, at 06:05 AM), the system recognizes that your open shift began the previous evening and attaches the clock-out to that same shift.
3. **No Duplicate Absence:** The system will not mark you absent for coming in the next morning, nor will it consider your morning clock-out as an unapproved early morning clock-in for the new day.

---

**Q: What happens if I work an overnight shift and try to clock in the next day?**
**A:** You must clock out of your overnight shift before you can begin a new shift.

If you attempt to clock in for a new shift while your previous overnight shift is still open, the system will prompt you with an alert indicating that your previous shift is still open and must be closed first.

---

### Shift Rotation Patterns

**Q: What is a Shift Rotation Pattern?**
**A:** A Shift Rotation Pattern is a recurring, automated schedule that cycles an employee or team through different shifts over a fixed cycle of days.

For example, a manufacturing plant or hospital may operate a 21-day rotation cycle:
- Days 1–7: Morning Shift
- Days 8–14: Afternoon Shift
- Days 15–19: Night Shift
- Days 20–21: Scheduled Rest Days

The system automatically advances each employee through the sequence as days progress, without requiring HR to manually reassign shifts every week.

---

**Q: What information is required to create a Shift Rotation Pattern?**
**A:** An HR Administrator configures:
- **Pattern Name:** A descriptive name for the rotation schedule.
- **Total Cycle Days:** The total number of days in one complete cycle (for example, 14 or 28 days).
- **Sequence Entries:** A list of sequential entries where each entry specifies the shift to be worked and the duration in days (for example, Shift A for 5 days, followed by Shift B for 5 days). The sum of all entry durations must exactly equal the total cycle days.

---

### Shift Assignments & Employee Scheduling

**Q: How are shifts assigned to employees?**
**A:** HR Administrators assign shifts by selecting the employee, choosing either a single Shift Template or a Shift Rotation Pattern, and specifying an **Effective From** date. Optionally, an **Effective To** date can be provided if the assignment is temporary.

---

**Q: What happens if an employee already has an active shift and HR assigns a new one?**
**A:** The system automatically prevents overlapping shift conflicts:
- When a new shift assignment is created with an effective date starting on Monday, the system automatically sets the previous assignment's end date to the preceding Sunday.
- This automatic date adjustment ensures that an employee always has exactly one unambiguous shift active for any given calendar date.

---

**Q: Can HR deactivate or delete a Shift Template or Rotation Pattern that is currently in use?**
**A:** No. The system strictly enforces referential guardrails:
- An HR Administrator cannot delete or deactivate a Shift Template if active employees are currently assigned to it.
- Similarly, a Rotation Pattern cannot be deactivated while employees are assigned to it.
- HR must first reassign the affected employees to a different active shift or rotation pattern before the old schedule can be deactivated or removed.

---

### Employee Self-Service & Viewing Your Shift

**Q: How do I find out what shift I am currently assigned to?**
**A:** In the Attendance section on your dashboard, navigate to "My Shift":
- **Active Shift Details:** Displays your shift name, shift type, official start time, official end time, and timezone.
- **Policy Rules:** Shows your applicable grace minutes and threshold hours.
- **Rotation Details (if applicable):** Shows the name of your rotation pattern, the current shift active for today, and the upcoming shift sequence.
- **Weekly Offs:** Displays which days of the week are designated as your regular non-working rest days.

---

**Q: What should I do if my assigned shift hours do not match my actual work schedule?**
**A:** If your assigned shift displayed in the system does not match your team's real-world hours (which can lead to false late-arrival or early-exit warnings), contact your reporting manager or HR Administrator. They can adjust your shift assignment effective from the appropriate date.

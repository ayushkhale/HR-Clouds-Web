# Employee & Manager Guide: Attendance Clock-In, Clock-Out, Breaks & Geofencing (Q&A)

This document provides a comprehensive, stateless guide to daily attendance tracking in the HRMS, explaining how clocking in, clocking out, taking breaks, work modes, and location validations function.

---

### Daily Clock-In & Starting the Workday

**Q: What is Attendance Clock-In in the HRMS?**
**A:** Attendance Clock-In is the action an employee takes at the start of their working shift to record their arrival time, work mode, and current location in the system.

When you clock in, the system starts an active working session for the day, checks your arrival against your assigned shift start time, evaluates whether you arrived within the allowed grace period, and sets your daily attendance record to an active working state.

---

**Q: How do I clock in for my shift?**
**A:** You can clock in from your web or mobile dashboard by opening the Attendance section, selecting your work mode, allowing browser location access if prompted, and clicking the "Clock In" button.

Once submitted, the system captures your timestamp, validates your geographic coordinates against your assigned office location if geofencing is enabled, and displays a live timer indicating that your working day has begun.

---

**Q: What are the available Work Modes during Attendance Clock-In?**
**A:** The HRMS supports four work modes: Office, Remote, Field, and Hybrid.

- **Office:** Selected when you are working physically on-site at a designated company office or facility.
- **Remote:** Selected when you are working from home or an approved off-site location.
- **Field:** Selected when your role involves on-ground client visits, traveling, or off-site operational duties.
- **Hybrid:** Selected when your organization operates on a split schedule between in-office and remote days.

Your organization may use these work modes to analyze workforce distribution and apply specific location-verification rules.

---

**Q: What happens if I arrive after my assigned shift start time?**
**A:** If you clock in after your shift start time, the system compares your arrival time against your attendance policy's grace period. If your arrival is within the grace period (for example, within 15 minutes), your arrival is considered acceptable. If you arrive after the grace period has elapsed, the system flags your record with late arrival minutes.

If your late minutes exceed the maximum late threshold defined in your company attendance policy, your attendance status for the day may automatically be converted to a half-day.

---

**Q: Can I clock in more than once on the same day?**
**A:** No, the system does not allow duplicate clock-ins for the same working date.

If you attempt to clock in while you already have an active working session, the system will prevent the action with an alert that you are already clocked in. Similarly, if you have already completed your shift and clocked out for the day, you cannot start a new clock-in on that same calendar date unless HR or your manager approves an attendance adjustment.

---

**Q: Why does the system say "Shift from yesterday is still open. Clock out before starting a new shift"?**
**A:** This message occurs when you forgot to clock out at the end of your previous working day, or if you are working an overnight shift that spans past midnight.

Because the system allows overnight shifts (where a shift legitimately starts in the evening and ends the following morning), an open session remains active until it is closed. You must first clock out of the open shift before the system will allow you to clock in for a new shift. If you forgot to clock out on a previous day and the shift was abandoned, you can submit an Attendance Regularization request to correct the missing time.

---

### Location Verification & Geofencing

**Q: How does Geofencing work during Attendance Clock-In?**
**A:** If your organization requires on-site attendance, the system compares your mobile or browser GPS coordinates against the geographical coordinates and allowed radius (for example, 100 meters) of your assigned office location.

If your coordinates fall inside the designated office radius, your clock-in is registered as fully verified and compliant.

---

**Q: What happens if I clock in outside the assigned office location radius?**
**A:** If your coordinates fall outside the allowed office boundary, your clock-in is not rejected, but the system automatically attaches an "Out of Bounds" anomaly flag to your attendance record.

Your punch is recorded so that your working hours are not lost, but the anomaly flag notifies your reporting manager that the clock-in occurred off-premises, allowing them to verify or review the situation.

---

**Q: What happens if I decline GPS location permissions or if my device cannot find my coordinates?**
**A:** If geofencing is active for your company and you clock in without providing coordinates (such as when browser location permissions are denied), the system records your clock-in but attaches a "Missing Coordinates" anomaly flag.

This flag informs your manager that location data was unavailable at the time of your punch. To prevent this, always ensure your device location services and browser site permissions are turned on before clocking in.

---

### Breaks & Midday Pauses

**Q: How do I record a break during my workday?**
**A:** When you have an active clock-in, you can pause your working time by clicking the "Start Break" button on your Attendance dashboard. When you return, click "End Break" to resume your active shift.

The system measures the elapsed break time in minutes and tracks your break history for the day.

---

**Q: Is break time counted as working hours?**
**A:** No. The system differentiates between "Total Hours" and "Effective Hours":
- **Total Hours:** The total elapsed time between your initial clock-in and your final clock-out.
- **Effective Hours:** The actual productive working time, calculated by subtracting your total break duration from your total hours.

Your attendance status (such as full-day present versus half-day) and overtime calculations are strictly based on your Effective Hours.

---

**Q: What happens if I exceed the allowed break duration or number of breaks?**
**A:** Your company attendance policy may specify both a maximum number of breaks per day (for example, up to 3 breaks) and a maximum allowable break duration (for example, up to 60 minutes total).

If you attempt to start another break after reaching the daily break limit, the system will block the action with a notification that your maximum breaks for today have been exceeded. If your total break duration exceeds the allowed duration limit, the system generates an "Excessive Break" anomaly flag on your record for your manager to review.

---

**Q: What happens if I forget to end my break and simply clock out at the end of the day?**
**A:** If you have an active break running when you click "Clock Out", the system automatically ends your open break at the exact timestamp of your clock-out.

The system computes the break duration up to your clock-out time, updates your records cleanly, closes your daily session, and ensures your data is not left stranded in an open break state.

---

### Clock-Out & Shift Completion

**Q: How do I clock out at the end of my workday?**
**A:** You complete your workday by opening your Attendance dashboard and clicking the "Clock Out" button.

The system closes your active session, stamps your departure time, closes any active break, calculates your total and effective hours, evaluates any early exit or overtime, and updates your final attendance status for the day.

---

**Q: Can I clock out earlier than my clock-in time?**
**A:** No. The system strictly validates that your clock-out time must be after your clock-in time. Any attempt to record a clock-out timestamp prior to your clock-in time is blocked as invalid.

---

**Q: What is considered an "Early Exit"?**
**A:** An Early Exit occurs when you clock out before your assigned shift's official ending time.

Your attendance policy specifies an early exit threshold (for example, 15 minutes). If you leave earlier than your scheduled shift end time by more than the allowed threshold, the system records the early exit minutes and flags the record for managerial review.

---

### Daily Attendance Statuses & Thresholds

**Q: What do the different daily attendance statuses mean?**
**A:** Every daily attendance record carries one of the following official statuses:
- **In Progress:** You have clocked in and your working session is currently ongoing.
- **Present:** You have clocked out and completed at least the minimum effective hours required for a full working day (typically 8 hours).
- **Half Day:** Your effective working hours met or exceeded the half-day threshold (typically 4 hours) but were below the full-day requirement, or you arrived late past the late threshold.
- **Absent:** You did not clock in on a scheduled working day, or your effective working hours fell below the minimum half-day threshold.
- **On Leave:** You have an approved leave request covering this date in the Leave module.
- **Holiday:** The date is recognized as an official public or company holiday applicable to your location or department.
- **Weekly Off:** The date is a scheduled non-working rest day according to your weekly schedule (such as Saturday or Sunday).

---

**Q: How does the system determine whether a Half Day is "First Half" or "Second Half"?**
**A:** When you are marked for a Half Day, the system checks the time you clocked in against the exact midpoint of your scheduled shift:
- **First Half:** If you clocked in before the shift midpoint and departed early, the system classifies the attendance as First Half.
- **Second Half:** If you arrived late and clocked in after the shift midpoint, the system classifies the attendance as Second Half.

This classification ensures that if you apply for a corresponding half-day leave in the Leave module, the halves match accurately.

---

**Q: What happens if I work on an official Holiday or Weekly Off?**
**A:** If you clock in and work on a scheduled weekly rest day or an official company holiday, the system does not penalize you or mark you absent. Instead, it marks your record as "Present" and records your effective hours.

Furthermore, if your company attendance policy enables Compensatory Offs (Comp Offs), the system automatically creates an earned Comp Off record for you, allowing you to claim a compensatory rest day later.

---

**Q: What should I do if the Clock In button is disabled or gives an error?**
**A:** If you are unable to clock in, check the following common scenarios:
1. **Already Clocked In:** Check your dashboard to verify if an active session is already running.
2. **Previous Shift Open:** If you worked yesterday or overnight and forgot to clock out, clock out of that session first.
3. **Locked Payroll Period:** If HR has finalized and locked attendance records for this period to process payroll, the system blocks new punches. You must speak with HR.
4. **Browser Permissions:** Ensure your browser has permitted location access if your organization uses geofencing.
5. **Scheduled Leave:** If you have an approved full-day leave for today, your status is already set to "On Leave". If you actually worked, you can submit an Attendance Regularization request after the day concludes.

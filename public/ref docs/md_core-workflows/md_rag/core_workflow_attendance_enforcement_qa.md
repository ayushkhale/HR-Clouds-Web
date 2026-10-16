# HRMS Core Workflow Guide: Attendance Enforcement, Geofencing & Payroll Locks (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to attendance calculation workflows, immutable physical punches versus daily attendance records, geofencing enforcement, biometric hardware synchronization, payroll period locks, regularization workflows, and nightly automated shift sweeps within the HRMS.

---

### Dual-Layer Attendance Architecture: Punches vs. Records

**Q: How does the HRMS track attendance behind the scenes?**
**A:** The HRMS operates on a robust dual-layer attendance architecture that separates physical reality from business interpretation:

1. **Immutable Attendance Punches (Physical Layer):** Every clock-in and clock-out event from a web browser, mobile device, or biometric fingerprint/facial scanner is recorded as a permanent, unchangeable punch. These physical punches are never modified or deleted under any circumstances, preserving a legally binding evidentiary record of when an employee interacted with a device.
2. **Daily Attendance Records (Business Interpretation Layer):** The attendance calculation engine evaluates the employee's raw physical punches against their assigned work shift, grace period, and attendance policy to generate a daily summary record (such as "Present," "Absent," "Half-Day," or "Late").

---

**Q: Why does the system maintain both raw punches and daily records?**
**A:** This separation ensures both audit compliance and operational flexibility.

If an employee forgets to clock out or experiences a biometric scanner error, the system must allow a manager to correct their daily status (e.g., changing "Absent" to "Present") without falsifying or erasing historical physical device data. When a manager approves a correction, the daily record is updated, and a separate "manager override" entry is logged alongside the original punches.

---

### Real-Time Clock-In & Geofencing Validation

**Q: What steps happen in real time when an employee clocks in?**
**A:** When an employee clicks "Clock In" on the web portal or scans their finger on a biometric machine, the system executes a sequence of automated checks:

1. **Payroll Lock Verification:** The system checks whether the current date belongs to an already finalized and locked payroll period. If locked, the punch is immediately blocked.
2. **Shift & Location Resolution:** The system retrieves the employee's assigned work shift, expected start time, and assigned office branch coordinates.
3. **Geofencing Evaluation:** If the punch originated from a web browser or mobile app, the system calculates the distance between the employee's GPS coordinates and the office location.
4. **Punch Recording:** The physical punch is recorded with its timestamp, source, and coordinates.
5. **Daily Calculation:** The calculation engine evaluates lateness and assigns the active shift status.

---

**Q: What happens if an employee clocks in from outside the office geofence?**
**A:** If an employee attempts to clock in while physically outside their assigned office geofence boundary:

The system **accepts the clock-in** so that the employee's actual working hours are not lost, but it automatically flags the punch with an **"Out of Geofence" Anomaly**. The daily attendance record displays an alert, and a notification is sent to the employee's team manager to review whether the remote or off-site punch was authorized.

---

**Q: What should an employee do if the browser displays "Location Permission Denied" during clock-in?**
**A:** For organizations with location-based attendance enabled, browser GPS access is mandatory to verify office presence.

If location access was blocked:
1. Open your browser settings (click the lock or settings icon near the address bar).
2. Set "Location" permissions to "Allow."
3. Refresh the page and click "Clock In" again.

If location services remain disabled on your device, the system will prevent the clock-in from proceeding to uphold company attendance policies.

---

### Biometric Hardware Integration & Duplicate Prevention

**Q: How do physical biometric machines communicate with the HRMS?**
**A:** Biometric fingerprint and facial recognition scanners push clock-in and clock-out events to the HRMS over secure automated network connections.

When an employee scans their finger or face at an office turnstile or wall scanner, the device transmits the employee's identifier and punch timestamp directly into the attendance processing engine. The engine instantly matches the employee and evaluates their daily record.

---

**Q: How does the system prevent accidental duplicate punches if an employee scans twice?**
**A:** The HRMS features an automated 60-second debounce and deduplication rule for hardware punches.

If an employee scans their fingerprint and then immediately scans again 10 seconds later because they were unsure if the first scan registered, or if a biometric machine retries sending data over a slow network connection, the system detects that an identical punch already exists within a 60-second window. The system acknowledges the scan but safely ignores the duplicate entry, ensuring that double-punches do not corrupt daily hour calculations.

---

### Payroll Period Freezes & Date Locking

**Q: What is a Payroll Lock Period in the Attendance module?**
**A:** A Payroll Lock Period is an administrative freeze placed on a specific calendar date range (for example, July 1st through July 31st) after monthly payroll has been calculated, approved, and disbursed.

Once a payroll period is locked, no user—including employees, team managers, and HR administrators—can add new punches, alter clock-in times, or approve attendance regularizations for dates within that locked window.

---

**Q: Why does the system say "Cannot modify records. Date is locked for payroll"?**
**A:** This message appears when you attempt to clock in, regularize attendance, or modify a shift for a date that falls within an approved payroll lock period.

Because salaries for that month have already been calculated and paid based on historical attendance data, allowing changes to past dates would create severe accounting and compliance discrepancies between attendance records and disbursed payroll. Any legitimate retroactive adjustments for locked periods must be handled via one-time salary arrears in the current open payroll cycle.

---

**Q: Can a biometric device push cached offline punches for a locked payroll month?**
**A:** If a biometric machine was offline for weeks and later reconnects to the network, it may attempt to upload cached punches from a past month.

When the device transmits these delayed punches, the system checks each punch's date against active payroll locks. Any punches belonging to an already locked payroll period are automatically rejected with a period locked error, preventing offline devices from corrupting finalized payroll records.

---

### Regularization Workflow & Manager Overrides

**Q: What is Attendance Regularization, and when is it used?**
**A:** Attendance Regularization is a formal correction request submitted by an employee to rectify an attendance anomaly, such as a missed clock-out, an unrecorded punch due to hardware malfunction, or an out-of-geofence flag.

For example, if an employee worked a full day but forgot to clock out when leaving the office, their daily status may default to "Half-Day" or "Absent." The employee files a regularization request specifying their actual exit time and the reason for the missing punch.

---

**Q: What is the lifecycle of an Attendance Regularization request?**
**A:** A regularization request transitions through three key states:

1. **Pending:** The employee submits the correction request with a detailed justification. The request lands in the team manager's approval queue.
2. **Approved:** The manager verifies the explanation and approves the request. The system automatically creates a synthetic "manager override" punch, recalculates the day's total working hours, and updates the daily record from "Absent" or "Half-Day" to "Present."
3. **Rejected:** The manager declines the explanation. The daily attendance record remains unchanged, preserving the original anomaly or absence status.

---

**Q: What ensures that a regularization approval does not partially fail?**
**A:** Regularization approvals are executed as all-or-nothing atomic operations.

When a manager clicks "Approve," the system simultaneously updates the request status, creates the synthetic punch record, and updates the daily attendance summary within a single transaction. If any part of the operation fails (for instance, if the date was locked for payroll moments earlier), the entire approval rolls back cleanly. This prevents inconsistent states where a request appears "Approved" while the attendance record remains marked as "Absent."

---

### Nightly Automated Shift Sweeps (Midnight Processing)

**Q: What happens if an employee forgets to clock out at the end of their shift?**
**A:** If an employee remains clocked in without clocking out, their attendance session is processed by the **Nightly Shift Sweep**:

Every night at midnight, the system runs an automated sweep of all open, in-progress attendance sessions across the organization. For any shift that was abandoned (no clock-out registered hours after the scheduled shift end time), the engine automatically closes the session using the shift's scheduled end time, recalculates total effective hours, and flags the record with a **"Missing Clock-Out" Anomaly**.

---

**Q: Why does an attendance status show "Half-Day" after an unclosed shift is swept?**
**A:** When the nightly sweep closes an unclocked shift, the calculated working hours may fall below the company's minimum threshold for a full working day.

Depending on organization attendance rules, if total verified hours fall between the half-day threshold (e.g., 4 hours) and full-day threshold (e.g., 8 hours), the record defaults to "Half-Day." If hours are below the half-day threshold, the status may convert to "Absent." The employee can resolve this by submitting an Attendance Regularization request with their manager.

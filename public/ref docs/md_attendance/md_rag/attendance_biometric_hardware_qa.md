# HR, Manager & Employee Guide: Biometric Hardware & Webhook Integrations (Q&A)

This document provides a comprehensive, stateless guide to physical Biometric Hardware integrations and device webhooks in the HRMS, explaining how fingerprint scanners, RFID readers, and facial recognition terminals interact with employee attendance.

---

### Understanding Biometric Hardware Integration

**Q: What is Biometric Hardware Integration in the HRMS?**
**A:** Biometric Hardware Integration connects physical time-tracking terminals (such as fingerprint scanners, facial recognition terminals, or RFID badge readers located at office entrance gates) directly to the cloud HRMS.

When an employee scans their fingerprint, face, or access card at an office terminal, the hardware automatically transmits the punch in real-time to the HRMS, updating the employee's attendance record without manual data entry.

---

**Q: What types of biometric devices are supported?**
**A:** The system supports any network-connected hardware device capable of sending HTTPS webhook requests, including:
- Fingerprint scanners
- Facial recognition time clocks
- RFID / NFC proximity card readers
- Turnstile and access-control entrance gates

---

### Device Registration & Configuration (HR Workflow)

**Q: How does HR register a new biometric device in the system?**
**A:** An HR Administrator registers a device by navigating to "Devices" under the HR Attendance section and clicking "Register Device":
1. HR enters the device name, hardware type, manufacturer serial number, and assigned office location.
2. The system generates a secure, one-time API Key for the device.
3. This API Key is entered into the hardware terminal's network configuration so it can securely authenticate with the HRMS cloud.

---

**Q: Why is the device API Key only shown once upon creation?**
**A:** For maximum security, the HRMS stores only a cryptographic hash of the device API key. The plain key is displayed to the HR Administrator only at the exact moment of registration.

If the key is lost or misplaced before being configured on the terminal, HR can easily deactivate the device registration and generate a new one.

---

### Employee-to-Device Mappings

**Q: What is an Employee-to-Device Mapping and why is it necessary?**
**A:** Physical biometric hardware typically stores employee identities using hardware-specific enrollment numbers (such as Badge Number "104" or Device User ID "EMP02").

An Employee-to-Device Mapping creates the logical link between the hardware's device employee ID and the employee's official profile in the HRMS. Without this mapping, the system would receive a punch from "Badge 104" without knowing which employee that badge belongs to.

---

**Q: What happens if an unmapped employee scans their badge or fingerprint on the terminal?**
**A:** If an employee attempts to punch on a terminal before HR has mapped their hardware ID to their HRMS profile:
1. The hardware transmits the punch to the HRMS.
2. The system checks the mapping directory and detects that the hardware employee ID is unmapped.
3. The system rejects the punch with a "Mapping Not Found" error and will not create an attendance record.
4. HR must link the employee in the device mappings table, after which all future punches will process successfully.

---

### Real-Time Punch Processing & Deduplication

**Q: Does a biometric punch create a real attendance record immediately?**
**A:** Yes. Unlike legacy systems that merely store raw text logs for later manual batch processing, the HRMS processes biometric punches in real-time.

When a verified punch arrives from a biometric terminal:
- A `clock_in` punch immediately opens an active working session, calculates lateness against the employee's shift, and marks the record "In Progress".
- A `break_start` or `break_end` punch immediately updates the employee's break tracking.
- A `clock_out` punch immediately closes the working session, calculates total hours and effective hours, evaluates early exits or overtime, and finalizes the daily status.

---

**Q: What happens if an employee accidentally scans their finger twice within a few seconds?**
**A:** The HRMS has automated hardware deduplication built into its punch engine:
- If a device delivers multiple identical punches for the same employee and punch type within a 60-second window (common when employees double-tap a card or when poor network connections cause the terminal to retransmit), the system safely recognizes the second punch as a duplicate.
- The duplicate punch is silently ignored without creating multiple sessions or penalizing the employee.

---

**Q: What happens if an employee scans a clock-out on the terminal without having clocked in first?**
**A:** If a punch cannot be applied because the required open session does not exist:
1. The system preserves the raw punch in the permanent audit log so that proof of the employee's presence is never lost.
2. The system gracefully declines to calculate a clock-out since there is no start time to measure against.
3. The employee can subsequently submit an Attendance Regularization request providing their arrival time, and their manager can review the audit log to verify the punch.

---

### Offline Operation & Network Outages

**Q: What happens if the office internet goes down while employees are punching on the device?**
**A:** Modern biometric hardware terminals feature local onboard memory:
1. During a network outage, the terminal continues accepting employee fingerprint, facial, and card scans, saving the punches with their exact local timestamps to internal storage.
2. Once internet connectivity is restored, the terminal automatically transmits all cached punches to the HRMS.
3. The HRMS processes each punch according to the original timestamp when the physical scan occurred, attributing the attendance to the correct working shift without any late arrival penalties caused by the network delay.

---

**Q: How can HR check if physical biometric devices are connected and working?**
**A:** HR Administrators can view the status of all registered hardware in the "Devices" dashboard:
- The system tracks the "Last Sync Time" for each terminal.
- Devices that have communicated recently are displayed as active and healthy.
- If a terminal stops syncing for an extended period, HR can promptly investigate potential power or local network issues at that facility.

# Attendance Device Webhook API (Hardware Biometric Integration)

**Base URL:** `/api/v1/attendance/devices/webhook` (Mounted via `device_webhook.routes.js`)  
**Module:** Attendance & Time Tracking (Hardware Subsystem)  
**Source of Truth:** 
- Route: `src/modules/attendance/routes/device_webhook.routes.js`
- Controller: `src/modules/attendance/controllers/device_webhook.controller.js`
- Validator: `src/modules/attendance/validators/device_webhook.validator.js`
- Service: `src/modules/attendance/services/device.service.js`
- Core Engine: `src/modules/attendance/services/clock.service.js`
- Repositories: `attendance_devices.repository.js`, `attendance_device_employee_mappings.repository.js`, `attendance_logs.repository.js`, `attendance_records.repository.js`

---

## 1. Webhook Punch (Biometric Integration)

1. **API Number and Name:** API 1 — Biometric Device Webhook Punch
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/devices/webhook`
4. **Purpose:** Secure endpoint for physical biometric hardware (fingerprint terminals, facial recognition scanners, RFID gates) to push real-time attendance punches (`clock_in`, `clock_out`, `break_start`, `break_end`) directly to the backend.
5. **Business Problem Solved:** Unifies hardware biometric punches with mobile/web punches into identical attendance records, sessions, and breaks, preventing hardware users from being erroneously marked absent.
6. **Why the API Exists:** Serves as the high-throughput, machine-to-machine ingestion gateway for physical attendance hardware.
7. **Allowed Roles and Permissions:** Custom Device Authentication via API Key. Does not require user JWT tokens or human user sessions. Requires valid, active device credentials with SHA-256 API key comparison.
8. **Real-World Usage:** Automated firmware on a ZKTeco, Suprema, or eSSL biometric device posts an HTTP payload each time an employee scans their fingerprint or face at the office turnstile.
9. **Request Parameters and Payload:**
   - **Headers:** 
     - `Authorization: Bearer <api_key_plain>` (Plaintext API key generated when device was registered in HRMS).
     - `Content-Type: application/json`
   - **Body (JSON):**
     ```json
     {
       "device_id": "4bf7e078-531e-4168-b495-6f1f9c496f02",
       "device_employee_id": "10042",
       "timestamp": "2026-09-13T09:02:15.000Z",
       "type": "clock_in"
     }
     ```
10. **Field Meanings:**
    - `device_id` (UUIDv4, Required): The systemic UUID of the registered hardware device in the `attendance_devices` table.
    - `device_employee_id` (String, Required, max 255): The hardware-specific internal user ID or card number enrolled on the physical terminal.
    - `timestamp` (ISO 8601 String, Required): Exact date and time when the physical biometric scan occurred on the device.
    - `type` (Enum String, Required): Punch category. Must be one of `'clock_in'`, `'clock_out'`, `'break_start'`, `'break_end'`.
11. **Backend Processing Flow:**
    - **Header Verification:** Extracts Bearer token `apiKeyPlain`. Computes SHA-256 hex digest: `crypto.createHash('sha256').update(apiKeyPlain).digest('hex')`.
    - **Device Authentication:** Queries `attendance_devices` by `device_id`. Asserts `device.api_key_hash === apiKeyHash` and `device.is_active === true`. Throws `401 UNAUTHORIZED_DEVICE` if invalid or inactive.
    - **Payroll Lock Check:** Asserts `timestamp` does not fall into a frozen payroll lock period (`lockService.checkLock()`).
    - **Identity Resolution:** Queries `attendance_device_employee_mappings` where `device_id = device.id` and `device_employee_id = payload.device_employee_id` and `is_active = true`. Throws `404 MAPPING_NOT_FOUND` if unmapped.
    - **60-Second Idempotency Window:** Checks `attendance_logs` for an identical punch (`device_id`, `user_id`, `type`) within a $\pm 60$-second window of `timestamp`. If found, returns `200 OK` with `{ applied: false, reason: 'DUPLICATE_PUNCH' }` to prevent double-punching from network re-transmissions.
    - **Phase 1 (Audit Log Ingestion):** Inserts immutable row into `attendance_logs` with `source = 'biometric'`, `device_id`, and `location_id = device.location_id`.
    - **Phase 2 (State Mutation):** Dispatches punch to `clockService` internal transactional appliers (`applyClockIn`, `applyClockOut`, `applyBreakStart`, `applyBreakEnd`) inside a dedicated Sequelize transaction.
    - **Conflict Handling:** If Phase 2 encounters a domain conflict (`400` or `409` such as `ALREADY_CLOCKED_IN` or `NOT_CLOCKED_IN`), Phase 2 rolls back, but Phase 1 log remains preserved, and the API returns `200 OK` with `{ applied: false, reason: error.errorCode }` so the device firmware does not hang or trigger retry storms.
    - **Sync Timestamp:** Updates `attendance_devices.last_sync_at = new Date()`.
12. **Database Impact:**
    - `attendance_logs`: Inserts 1 row (always persisted for audit).
    - `attendance_records`: Inserts or updates row if punch is applied.
    - `attendance_sessions` / `attendance_breaks`: Created or closed.
    - `attendance_devices`: Updates `last_sync_at`.
13. **Validation Rules (Joi):**
    - `device_id`: `Joi.string().uuid().required()`.
    - `device_employee_id`: `Joi.string().max(255).required()`.
    - `timestamp`: `Joi.date().iso().required()`.
    - `type`: `Joi.string().valid('clock_in', 'clock_out', 'break_start', 'break_end').required()`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Scenario A — Punch Applied Successfully:**
      ```json
      {
        "success": true,
        "message": "Punch recorded and applied",
        "data": {
          "log": {
            "id": "9b1284c1-...",
            "org_id": "b782fd72-...",
            "user_id": "5a61d281-...",
            "device_id": "4bf7e078-...",
            "type": "clock_in",
            "timestamp": "2026-09-13T09:02:15.000Z",
            "source": "biometric"
          },
          "applied": true,
          "reason": null,
          "result": {
            "record_id": "3d56cf8c-...",
            "session_id": "8fa9d96c-...",
            "late_minutes": 0,
            "within_grace": true
          }
        }
      }
      ```
    - **Scenario B — Duplicate Punch (Within 60s Window):**
      ```json
      {
        "success": true,
        "message": "Punch recorded but not applied",
        "data": {
          "log": { "id": "9b1284c1-..." },
          "applied": false,
          "reason": "DUPLICATE_PUNCH",
          "result": null
        }
      }
      ```
    - **Scenario C — Business Conflict (e.g. Clock-Out with no open shift):**
      ```json
      {
        "success": true,
        "message": "Punch recorded but not applied",
        "data": {
          "log": { "id": "9b1284c1-..." },
          "applied": false,
          "reason": "NOT_CLOCKED_IN",
          "result": null
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Malformed JSON payload or invalid punch type enum.
    - `401 UNAUTHORIZED_DEVICE`: Missing Authorization header, incorrect API key, unknown device ID, or deactivated device.
    - `403 LOCKED_PERIOD`: The punch timestamp falls into a locked payroll period.
    - `404 MAPPING_NOT_FOUND`: The `device_employee_id` has not been mapped to an active HRMS employee.
16. **Security / Authorization Behavior:**
    - Authenticated via SHA-256 hash comparison (`device.api_key_hash`). Plaintext keys are never stored in the database.
    - Scoped strictly to the tenant organization that registered the device (`device.org_id`).
17. **Idempotency and Retry Behavior:**
    - Idempotent within a $\pm 60$-second sliding window per user, device, and punch type.
    - Duplicate punches return `200 OK` with `reason: 'DUPLICATE_PUNCH'` so devices acknowledge delivery and clear their local flash memory buffer.
18. **Transactions / Concurrency Behavior:**
    - Two-phase architecture: Phase 1 persists raw log. Phase 2 executes in an isolated transaction so business rule failures roll back state mutations without losing the raw audit trail.
19. **Side Effects:**
    - Updates `last_sync_at` timestamp on device row, providing heartbeat health monitoring for hardware administrators.
    - Triggers hours calculations and breaks updates identical to web/mobile punches.
20. **Important Edge Cases:**
    - Delayed / Queued Offline Punches: If a physical reader loses internet connectivity for hours and uploads queued punches in a burst, the server calculates attendance using the punch's physical `timestamp` (anchored to that day's business date) rather than the HTTP ingestion arrival time.
    - Unmapped Employee: If a person scans a badge that is not mapped to an employee record in HRMS, the API returns `404 MAPPING_NOT_FOUND` and does not apply attendance.
21. **Related APIs / Dependencies:**
    - `POST /api/v1/attendance/hr/devices` (Device registration & API key generation).
    - `POST /api/v1/attendance/hr/devices/:id/mappings` (Linking hardware IDs to HRMS employees).
22. **What the API Gives / Does:** Authenticates hardware terminal, logs raw biometric punch, maps hardware employee ID to HRMS user ID, applies attendance calculations, and updates device heartbeat.

# Attendance Device Webhook API

**Base URL:** `/api/v1/attendance/devices/webhook`  
**Source of Truth:** `device_webhook.routes.js`, `device_webhook.controller.js`, `device.service.js`  
**Last Verified:** August 21, 2026

> **Note:** The specific function and ORM method names (e.g., `Organization.create()`) used in the internal execution flows are conceptual/dummy names intended to clearly illustrate the business logic. The internal execution logic, database interactions, transactions, side-effects, and validations described are strictly accurate and verified against the actual codebase.

---

## 1. Webhook Punch (Biometric Integration)

### Business Purpose
Provides a secure endpoint for physical biometric hardware (fingerprint scanners, facial recognition devices, RFID readers) to push attendance punches directly to the HRMS backend in real-time.

### Endpoint Contract
- **Method:** `POST`
- **Full Endpoint:** `/api/v1/attendance/devices/webhook`
- **Authentication:** Custom Bearer Token. The firmware MUST send the `api_key_plain` generated during Device Registration.
- **Header Format:** `Authorization: Bearer <api_key_plain>`

**Request Body:**
```json
{
  "device_id": "uuid-v4",
  "device_employee_id": "EMP001",
  "type": "clock_in",
  "timestamp": "2026-08-21T09:00:00.000Z"
}
```

### Validation Rules
- `device_id`: UUIDv4. Required. The primary key of the device in the HRMS database.
- `device_employee_id`: String. Required. The hardware-specific ID assigned to the employee on that physical device. (Mapped to a real `user_id` via `attendance_device_employee_mappings`).
- `type`: String. Required. Enum: `clock_in`, `clock_out`, `break_start`, `break_end`.
- `timestamp`: ISO Date. Required. The exact time the physical punch occurred on the hardware.

### Complete Internal Execution Flow
```text
POST /api/v1/attendance/devices/webhook
        ↓
AuthMiddleware.verifyDeviceToken() (Custom Hash Verification)
        ↓
WebhookController.handlePunch()
        ↓
DeviceService.processWebhookPunch()
        ↓
LockService.checkLock(timestamp) (Throws 403 if locked)
        ↓
BiometricDeviceMapping.findOne(device_employee_id) (Throws 404 if mapping missing)
        ↓
Idempotency Check (Find matching punch within +/- 60 seconds)
        ↓
Duplicate detected?
 ├── YES:
 │    ↓
 │    Return 200 OK (Early exit, silent ignore)
 │
 └── NO:
      ↓
      BEGIN TRANSACTION
      ↓
      AttendanceLog.create(source: 'biometric')
      ↓
      BiometricDevice.update(last_sync_at: NOW)
      ↓
      COMMIT TRANSACTION
      ↓
      HTTP 200 OK
```

### Internal Working
1. **API Key Verification:** Hash the provided Bearer token (`api_key_plain`) using SHA-256 and compare it against the `api_key_hash` stored in the `attendance_devices` table for the given `device_id`. If they mismatch or the device is inactive, throw `401 Unauthorized`.
2. **Lock Check:** Verify that the `timestamp` date is not locked by HR payroll policies.
3. **Resolve Identity:** Query `attendance_device_employee_mappings` to translate the `device_employee_id` to a systemic `user_id`. Throws `404 MAPPING_NOT_FOUND` if the employee hasn't been logically linked to this device in HRMS yet.
4. **Idempotency Check:** Search `attendance_logs` for an identical punch (same `device_id`, `user_id`, `type`) occurring within a +/- 60-second window of the `timestamp`. If found, silently ignore the duplicate and return `200 OK` with the existing log data (prevents double-punches if the network stutters).
5. **Log Creation:** Insert a new row into `attendance_logs` with `source='biometric'`.
6. **Update Sync Time:** Update the device's `last_sync_at` timestamp to indicate it is online and healthy.

### Asynchronous Processing Note
*Currently, this webhook only creates an `attendance_log`. It relies on a separate background worker/cron job to sweep the logs and build/calculate the actual `attendance_records` and `attendance_sessions`. This decoupled architecture prevents hardware devices from hanging if complex attendance calculations take too long.*

### Services Used by the API
- **DeviceService**: Processes the incoming raw webhook data into the system database.
- **LockService**: Ensures no punches are logged in locked payroll periods.

### Database Operations
- **Read:** `attendance_devices`, `attendance_device_employee_mappings`, `attendance_logs` (for idempotency).
- **Create:** `attendance_logs`.
- **Update:** `attendance_devices` (`last_sync_at`).
- **Transaction:** Wraps the log creation and sync update.

### What Can Break If This API Changes?
- **Idempotency Logic**: If the 60-second duplicate check is removed or altered, hardware devices with poor internet connections that retry payloads will cause massive duplicate entries in payroll.

### Response Structure
**200 OK**
```json
{
  "success": true,
  "message": "Punch recorded successfully",
  "data": {
    "id": "uuid",
    "org_id": "uuid",
    "user_id": "uuid",
    "device_id": "uuid",
    "type": "clock_in",
    "timestamp": "2026-08-21T09:00:00.000Z",
    "source": "biometric"
  }
}
```

### Error Handling
- `401 UNAUTHORIZED_DEVICE` - Missing/invalid API key, or device is deactivated.
- `404 MAPPING_NOT_FOUND` - The `device_employee_id` sent by the hardware is not mapped to any user in the HRMS.
- `403 DATE_LOCKED` - The hardware is trying to push punches for a date that HR has already locked for payroll.

### Hardware Vendor Guidelines
- Ensure the device has accurate NTP time synchronization before pushing payloads.
- Always use HTTPS.
- Implement exponential backoff if the server returns 500, 429, or 503 errors.
- If the network fails, cache punches locally and re-transmit them later. The backend is idempotent and will safely deduplicate re-transmitted punches.

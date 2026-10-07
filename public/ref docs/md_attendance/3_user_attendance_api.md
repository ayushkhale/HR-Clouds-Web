# User Attendance APIs (Employee Self-Service)

**Base URL:** `/api/v1/attendance` (Mounted via `user_attendance.routes.js` and `user_attendance_read.routes.js`)  
**Module:** Attendance & Time Tracking  
**Source of Truth:** 
- Routes: `src/modules/attendance/routes/user_attendance.routes.js`, `src/modules/attendance/routes/user_attendance_read.routes.js`
- Controllers: `src/modules/attendance/controllers/user_attendance.controller.js`, `src/modules/attendance/controllers/user_attendance_read.controller.js`
- Validators: `src/modules/attendance/validators/user_attendance.validator.js`, `src/modules/attendance/validators/user_attendance_read.validator.js`
- Services: `src/modules/attendance/services/clock.service.js`, `regularization.service.js`, `overtime.service.js`, `anomaly.service.js`, `comp_off.service.js`, `user_attendance_read.service.js`, `holiday.service.js`, `attendance_calculation.service.js`
- Repositories: `attendance_logs.repository.js`, `attendance_records.repository.js`, `attendance_sessions.repository.js`, `attendance_breaks.repository.js`, `attendance_regularizations.repository.js`, `attendance_anomalies.repository.js`, `attendance_comp_offs.repository.js`, `attendance_overtime.repository.js`

---

## Architecture & Global Invariants

1. **Global Response Envelope**:
   - Success: `{ "success": true, "message": "...", "data": { ... } }`
   - Failure: `{ "success": false, "message": "...", "errorCode": "..." }` (or `"code": "..."`)
   - HTTP Status: `201 Created` for creations (punches, regularization requests), `200 OK` for reads and updates.
2. **Security & Access Gates**:
   - Every route executes `authenticate` (validates JWT Bearer token and populates `req.user`), `authorize(['employee', 'manager', 'hr', 'admin', 'super-admin'])`, and `requireFeature('attendance.access')`.
   - If `attendance.access` is missing on the organization plan, the server returns `403 FEATURE_NOT_AVAILABLE`.
3. **Business Timezone & Business Date**:
   - The authoritative business timezone for daily attendance calculations across the system is **`Asia/Kolkata`** (`_businessDate(at)`).
   - Date formats: Date filters and calendar dates are formatted as ISO 8601 strings or strict `YYYY-MM-DD` strings.
4. **Pagination Uniformity**:
   - Paged self-service lists accept `page` (integer $\ge 1$, default 1) and `limit` (integer $1..100$, default 20).
   - Self-service pagination responses output `{ "total": N, "page": P, "limit": L, "totalPages": TP }`.

---

## 1. Clock In

1. **API Number and Name:** API 1 — Clock In
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/clock-in`
4. **Purpose:** Records the start of an employee's workday, creates an immutable audit log, opens an attendance session, resolves shift and policy rules, calculates initial lateness against grace thresholds, and verifies geofence coordinates.
5. **Business Problem Solved:** Eliminates time-theft, ghost attendance, and unverified remote punches by programmatically enforcing shift schedules, geofences, and lock periods at the exact moment of clock-in.
6. **Why the API Exists:** Provides a centralized entry point for web, mobile, and API clients to trigger daily work shift tracking and initiate the attendance lifecycle.
7. **Allowed Roles and Permissions:** `employee`, `manager`, `hr`, `admin`, `super-admin` (all tenant roles). Requires Bearer JWT with `orgId` and `id`, and active `attendance.access` subscription feature.
8. **Real-World Usage:** Called when an employee clicks "Clock In" on the employee dashboard or mobile app upon arriving at work or starting a remote shift.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Body (JSON):**
     ```json
     {
       "source": "web",
       "latitude": 19.0760,
       "longitude": 72.8777,
       "client_timestamp": "2026-09-13T09:00:00.000Z",
       "notes": "Arrived at office",
       "work_mode": "office",
       "metadata": {}
     }
     ```
10. **Field Meanings:**
    - `source` (String, Optional, default `'web'`): Punch ingestion origin (`web`, `mobile`, `api`).
    - `latitude` (Number, Optional, -90 to 90): GPS latitude coordinate.
    - `longitude` (Number, Optional, -180 to 180): GPS longitude coordinate.
    - `client_timestamp` (ISO String, Optional): Client device time for audit/diagnostic correlation.
    - `notes` (String, Optional, max 500 chars): Remarks provided by the user.
    - `work_mode` (String, Optional): One of `'office'`, `'remote'`, `'field'`, `'hybrid'`.
      **ADVISORY ONLY as of 2026-10-05.** The server resolves the mode from the employee's
      contractual profile and overrides this value; a geofenced contract (`office`, `field`) cannot
      be relaxed by the payload, and a conflicting claim additionally raises a
      `work_mode_claim_mismatch` anomaly. Only a `hybrid` employee's declaration is honoured, and
      only `'office'` or `'remote'`. **Send it only for hybrid employees.** Note the vocabulary
      split: punches use `'office'`, profiles use `'on-site'` — they are the same mode.
    - `metadata` (Object, Optional): Arbitrary client metadata.
11. **Backend Processing Flow:**
    - Controller enriches body with `ip_address: req.ip` and `user_agent: req.get('user-agent')`.
    - `clockService.clockIn()` begins a Sequelize transaction.
    - Resolves punch timestamp `at = new Date()` and business date `YYYY-MM-DD` in `Asia/Kolkata`.
    - Enforces lock periods: checks if `businessDate` falls within an active `attendance_lock_periods` range.
    - Checks for duplicate records on `businessDate`. If record exists with `status === 'in_progress'`, throws `409 ALREADY_CLOCKED_IN`. If completed, throws `409 ALREADY_COMPLETED`.
    - Checks for an unclosed shift from the previous day (`OPEN_SHIFT_LOOKBACK_DAYS = 1`). If found, throws `409 PREVIOUS_SHIFT_OPEN`.
    - Resolves active shift assignment via `shiftResolver.resolveShiftForUser()`.
    - Resolves attendance policy via `policyRepository`.
    - Evaluates holiday and weekly-off calendars for `businessDate`.
    - Calculates `lateMinutes` and `withinGrace` by comparing punch time against `shift.start_time` plus `policy.grace_minutes`.
    - Creates immutable `attendance_logs` entry with `type: 'clock_in'`.
    - Creates `attendance_records` row with `status: 'in_progress'`, shift/policy snapshots, and `calculation_version: 1`.
    - Creates `attendance_sessions` row with `status: 'open'`.
    - Resolves the contractual work mode (fail-secure: a `NULL` profile mode resolves to `office`,
      never `remote`) and persists the **resolved** mode to `attendance_records.work_mode` — this
      replaced `data.work_mode || null`, which stored `NULL` whenever the client omitted the field.
    - Validates geofencing against the mode: `remote` and a declared-WFH `hybrid` punch are
      bypassed; `office` is checked against the assigned office; `field` against the union of the
      employee's active assigned field sites **plus** their office. A biometric-source punch is
      device-attested and skips the GPS check. Outcomes `out_of_bounds` / `missing_coordinates` /
      `geofence_unresolved` raise an anomaly via `anomalyService.createAnomaly()`. **The punch is
      accepted in every case.** See `7_work_mode_and_field_geofencing_api.md`.
    - Writes punch provenance to `attendance_logs.metadata.geofence` and caches the clock-in match
      on `attendance_records.matched_location_id` / `matched_location_type` /
      `distance_to_location_meters`.
    - Commits transaction and returns punch confirmation.
12. **Database Impact:**
    - `attendance_logs`: Inserts 1 row (`type: 'clock_in'`).
    - `attendance_records`: Inserts 1 row (`status: 'in_progress'`).
    - `attendance_sessions`: Inserts 1 row (`status: 'open'`).
    - `attendance_anomalies`: Inserts 1 row per geofence finding (`out_of_bounds`,
      `missing_coordinates`, `geofence_unresolved`, `work_mode_claim_mismatch`).
    - `attendance_logs`: Updated in-transaction with `metadata.geofence` provenance.
13. **Validation Rules (Joi):**
    - `source`: Valid values `['web', 'mobile', 'api']`, default `'web'`.
    - `latitude`: Number min -90, max 90, nullable, optional.
    - `longitude`: Number min -180, max 180, nullable, optional.
    - `client_timestamp`: ISO date string, nullable, optional.
    - `notes`: String max 500, nullable, optional.
    - `work_mode`: Valid values `['office', 'remote', 'field', 'hybrid']`, nullable, optional.
    - `metadata`: Object, nullable, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Clocked in successfully",
        "data": {
          "log_id": "8fa9d96c-b9b2-4d2a-a92c-80b1df36d7d1",
          "record_id": "3d56cf8c-7a02-405f-994f-160cde8e6415",
          "session_id": "4bf7e078-531e-4168-b495-6f1f9c496f02",
          "date": "2026-09-13",
          "clock_in_time": "2026-09-13T09:02:15.123Z",
          "work_mode": "office",
          "geofence": {
            "outcome": "in_bounds",
            "evaluated": true,
            "matched_location_id": "6b84a9f5-aaa7-4800-bf73-0f4238cec4c2",
            "matched_location_type": "office",
            "distance_meters": 37
          },
          "shift": {
            "name": "General Shift",
            "start_time": "09:00",
            "end_time": "18:00",
            "type": "fixed"
          },
          "late_minutes": 0,
          "within_grace": true,
          "is_holiday": false,
          "is_weekly_off": false
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Validation failure (invalid coordinates, notes too long).
    - `401 UNAUTHORIZED`: Missing, invalid, or expired JWT token.
    - `403 FEATURE_NOT_AVAILABLE`: Plan does not permit attendance tracking.
    - `403 LOCKED_PERIOD`: Date falls inside a locked payroll period.
    - `409 ALREADY_CLOCKED_IN`: Active in-progress attendance record already exists for today.
    - `409 ALREADY_COMPLETED`: Shift for today was already clocked out and finished.
    - `409 PREVIOUS_SHIFT_OPEN`: Previous shift (e.g. overnight) was not clocked out.
16. **Security / Authorization Behavior:** Token authenticated. Scoped strictly to `req.user.id` and `req.user.orgId`. Employees cannot clock in for other users.
17. **Idempotency and Retry Behavior:** Not idempotent. Submitting twice rapidly triggers the `ALREADY_CLOCKED_IN` conflict check.
18. **Transactions / Concurrency Behavior:** Fully wrapped in a Sequelize transaction. Simultaneous duplicate requests are blocked by the database query within the transaction.
19. **Side Effects:** May spawn a transactional record in `attendance_anomalies` (`out_of_bounds`,
    `missing_coordinates`, `geofence_unresolved` or `work_mode_claim_mismatch`). `work_mode` and
    `geofence` were added to the response on 2026-10-05 — `geofence.outcome` is
    `in_bounds` | `out_of_bounds` | `missing_coordinates` | `unresolved`, and
    `geofence.matched_location_id` is **polymorphic**: an `organization_locations.id` when
    `matched_location_type` is `'office'`, an `organization_field_locations.id` when `'field'`.
20. **Important Edge Cases:**
    - Overnight shifts: If the employee worked past midnight, the system checks `_findOpenRecord()` for yesterday's shift before allowing a new clock-in.
    - Holiday/Weekly-off punch: If an employee clocks in on a rest day, `is_holiday` or `is_weekly_off` is flagged `true`, allowing downstream comp-off generation.
21. **Related APIs / Dependencies:** `GET /today`, `POST /clock-out`, `POST /break/start`.
22. **What the API Gives / Does:** Creates the daily attendance record and session, calculates lateness, logs geolocation, and returns initialized shift metadata.

---

## 2. Clock Out

1. **API Number and Name:** API 2 — Clock Out
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/clock-out`
4. **Purpose:** Terminates the active workday session, auto-closes open breaks, executes the hours calculation engine, evaluates policy thresholds (half-day/full-day/absent), and calculates early exit and overtime.
5. **Business Problem Solved:** Accurately seals daily work durations, enforces automatic break deductions, and generates final payroll-ready status codes without manual HR reconciliation.
6. **Why the API Exists:** Provides the closing punch event for an active shift.
7. **Allowed Roles and Permissions:** `employee`, `manager`, `hr`, `admin`, `super-admin`. Active `attendance.access` required.
8. **Real-World Usage:** Triggered when an employee clicks "Clock Out" at the conclusion of their shift.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Body (JSON):**
     ```json
     {
       "source": "web",
       "latitude": 19.0760,
       "longitude": 72.8777,
       "client_timestamp": "2026-09-13T18:05:00.000Z",
       "notes": "Completed daily deliverables",
       "metadata": {}
     }
     ```
10. **Field Meanings:**
    - `source` (String, Optional): Punch source (`web`, `mobile`, `api`).
    - `latitude`, `longitude` (Number, Optional): Punch coordinates.
    - `client_timestamp` (ISO String, Optional): Device timestamp.
    - `notes` (String, Optional, max 500 chars): Sign-off notes.
    - `metadata` (Object, Optional): Custom context.
11. **Backend Processing Flow:**
    - Enriches body with `ip_address` and `user_agent`.
    - Begins Sequelize transaction.
    - Locates open record via `_requireOpenRecord(lookback = 1 day)`. Throws `400 NOT_CLOCKED_IN` if no open shift exists.
    - Asserts `clock_out_time >= clock_in_time`; otherwise throws `400 INVALID_CLOCK_OUT_TIME`.
    - Auto-closes active break: if a break has `end_time == null`, creates `break_end` log and updates `attendance_breaks` with calculated duration.
    - Creates immutable `attendance_logs` record (`type: 'clock_out'`).
    - Closes `attendance_sessions` record (`status: 'closed'`, `closed_at = at`).
    - Updates `attendance_records` with `clock_out_time`.
    - Calls `calculationService.calculateRecord(record.id, transaction)`:
      - Computes `total_hours = clock_out - clock_in`.
      - Sums closed breaks to get `break_duration_minutes`.
      - Computes `effective_hours = total_hours - break_hours`.
      - Compares against snapshot policy thresholds: `half_day_threshold_minutes`, `full_day_threshold_minutes`.
      - Assigns final status (`present`, `half_day`, `absent`) and `half_day_type` (`first_half` / `second_half`).
      - Evaluates early exit minutes and overtime minutes.
      - Triggers `anomalyService.detectAnomalies()`.
    - Commits transaction and returns finalized daily metrics.
12. **Database Impact:**
    - `attendance_logs`: Inserts 1 row (`type: 'clock_out'`).
    - `attendance_sessions`: Updates 1 row (`status: 'closed'`).
    - `attendance_breaks`: Updates 1 row if break was active.
    - `attendance_records`: Updates `status`, `effective_hours`, `total_hours`, `overtime_minutes`, `early_exit_minutes`.
    - `attendance_anomalies`: Inserts rows for detected early exit, missing hours, etc.
13. **Validation Rules (Joi):**
    - `source`: Valid `['web', 'mobile', 'api']`, default `'web'`.
    - `latitude`, `longitude`: Valid coordinate ranges, nullable, optional.
    - `client_timestamp`: ISO format, nullable, optional.
    - `notes`: Max 500 characters, optional.
    - `metadata`: Object, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Clocked out successfully",
        "data": {
          "record_id": "3d56cf8c-7a02-405f-994f-160cde8e6415",
          "date": "2026-09-13",
          "clock_in_time": "2026-09-13T09:02:15.000Z",
          "clock_out_time": "2026-09-13T18:05:00.000Z",
          "total_hours": "9.05",
          "effective_hours": "8.05",
          "worked_duration_formatted": "8h 3m",
          "break_duration_minutes": 60,
          "late_minutes": 0,
          "early_exit_minutes": 0,
          "overtime_minutes": 5,
          "status": "present",
          "half_day_type": null,
          "shift": {
            "name": "General Shift",
            "start_time": "09:00",
            "end_time": "18:00"
          }
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 NOT_CLOCKED_IN`: User is not currently clocked in.
    - `400 INVALID_CLOCK_OUT_TIME`: Clock-out timestamp is earlier than clock-in.
    - `403 LOCKED_PERIOD`: Date belongs to a frozen payroll cycle.
16. **Security / Authorization Behavior:** Token authenticated. Bound to caller's own session.
17. **Idempotency and Retry Behavior:** Not idempotent. A retry returns `400 NOT_CLOCKED_IN` because the shift is already closed.
18. **Transactions / Concurrency Behavior:** Atomic transaction wrapping break closure, session closure, log insertion, and hours recalculation.
19. **Side Effects:** Auto-resolves open breaks; may generate `early_exit` or `insufficient_hours` anomaly records.
20. **Important Edge Cases:**
    - Overnight shift clock-out: If clocking out the next calendar morning, `_requireOpenRecord` safely looks back 1 day to find yesterday's open shift.
    - Hanging break: Automatically ends any open break without failing the punch.
21. **Related APIs / Dependencies:** `POST /clock-in`, `GET /today`, `GET /history`.
22. **What the API Gives / Does:** Finalizes work session, deducts breaks, computes net effective hours, assigns attendance status, and records clock-out.

---

## 3. Start Break

1. **API Number and Name:** API 3 — Start Break
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/break/start`
4. **Purpose:** Marks the beginning of an unworked interval (e.g. lunch, personal pause) during an active shift.
5. **Business Problem Solved:** Prevents paid calculation of idle time and enforces maximum daily break occurrences set by company policy.
6. **Why the API Exists:** Tracks granular intra-shift activities for accurate effective hours auditing.
7. **Allowed Roles and Permissions:** All org roles. Requires active `attendance.access`.
8. **Real-World Usage:** Employee clicks "Take a Break" on the dashboard.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Body (JSON):**
     ```json
     {
       "source": "web",
       "notes": "Lunch break"
     }
     ```
10. **Field Meanings:**
    - `source` (String, Optional): Punch source (`web`, `mobile`, `api`).
    - `notes` (String, Optional, max 500 chars): Reason for break.
11. **Backend Processing Flow:**
    - Locates active open record via `_requireOpenRecord()`. Throws `400 NOT_CLOCKED_IN` if none exists.
    - Checks for an already active break via `breakRepository.findActiveBreak()`. If found, throws `400 BREAK_ALREADY_ACTIVE`.
    - Asserts break start time is not earlier than clock-in time (`INVALID_BREAK_START_TIME`).
    - Checks policy `max_breaks_per_day`. If current count $\ge$ threshold, throws `400 MAX_BREAKS_EXCEEDED`.
    - Inserts `attendance_logs` record with `type: 'break_start'`.
    - Inserts `attendance_breaks` row with `start_time: at` and `start_log_id`.
12. **Database Impact:**
    - `attendance_logs`: Inserts 1 row (`break_start`).
    - `attendance_breaks`: Inserts 1 row (`end_time: null`).
13. **Validation Rules (Joi):**
    - `source`: Enum `['web', 'mobile', 'api']`, default `'web'`.
    - `notes`: Max 500 chars, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Break started",
        "data": {
          "log_id": "f8a92b3c-...",
          "break_id": "7ca19283-...",
          "record_id": "3d56cf8c-...",
          "date": "2026-09-13",
          "start_time": "2026-09-13T13:00:00.000Z"
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 NOT_CLOCKED_IN`: User has no active shift.
    - `400 BREAK_ALREADY_ACTIVE`: A break is already open and must be ended first.
    - `400 MAX_BREAKS_EXCEEDED`: Daily break count threshold exceeded.
16. **Security / Authorization Behavior:** Token authenticated. Bound to caller's active record.
17. **Idempotency and Retry Behavior:** Fails with `400 BREAK_ALREADY_ACTIVE` on immediate retry.
18. **Transactions / Concurrency Behavior:** Enclosed in Sequelize transaction.
19. **Side Effects:** Puts user into "on break" state on live dashboards.
20. **Important Edge Cases:** Rejects break starts before shift clock-in time.
21. **Related APIs / Dependencies:** `POST /break/end`, `GET /today`.
22. **What the API Gives / Does:** Opens an active break interval and logs the event.

---

## 4. End Break

1. **API Number and Name:** API 4 — End Break
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/break/end`
4. **Purpose:** Closes an open break, records elapsed duration, and checks policy thresholds for excessive breaks.
5. **Business Problem Solved:** Resumes shift tracking and flags excessive idle time.
6. **Why the API Exists:** Pairs with `/break/start` to close break intervals.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Employee clicks "Resume Work" or "End Break".
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Body (JSON):**
     ```json
     {
       "source": "web",
       "notes": "Back from lunch"
     }
     ```
10. **Field Meanings:**
    - `source` (String, Optional): Origin (`web`, `mobile`, `api`).
    - `notes` (String, Optional): Closing notes.
11. **Backend Processing Flow:**
    - Locates open record; throws `400 NOT_CLOCKED_IN` if not working.
    - Finds active break where `end_time IS NULL`. Throws `400 NO_ACTIVE_BREAK` if none.
    - Asserts break end time is after break start time.
    - Calculates `durationMinutes = Math.ceil((at - start_time) / 60000)`.
    - Inserts `attendance_logs` record (`break_end`).
    - Updates `attendance_breaks` with `end_time`, `duration_minutes`, and `end_log_id`.
    - Checks policy `max_break_duration_minutes`. If exceeded, triggers `anomalyService.createAnomaly('excessive_break')`.
12. **Database Impact:**
    - `attendance_logs`: Inserts 1 row (`break_end`).
    - `attendance_breaks`: Updates 1 row with `end_time` and `duration_minutes`.
    - `attendance_anomalies`: Inserts 1 row if break duration exceeded policy allowance.
13. **Validation Rules (Joi):**
    - `source`: Enum `['web', 'mobile', 'api']`, default `'web'`.
    - `notes`: Max 500 chars, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Break ended",
        "data": {
          "log_id": "e912384a-...",
          "break_id": "7ca19283-...",
          "record_id": "3d56cf8c-...",
          "date": "2026-09-13",
          "start_time": "2026-09-13T13:00:00.000Z",
          "end_time": "2026-09-13T13:45:00.000Z",
          "duration_minutes": 45
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 NOT_CLOCKED_IN`: No active workday record.
    - `400 NO_ACTIVE_BREAK`: No active break is open.
    - `400 INVALID_BREAK_END_TIME`: End timestamp is before start timestamp.
16. **Security / Authorization Behavior:** Token authenticated. Bound to caller's open break.
17. **Idempotency and Retry Behavior:** Fails with `400 NO_ACTIVE_BREAK` on repeat calls.
18. **Transactions / Concurrency Behavior:** Wrapped in a database transaction.
19. **Side Effects:** Resumes effective time accumulation; can trigger `excessive_break` anomaly.
20. **Important Edge Cases:** If duration exceeds policy `max_break_duration_minutes`, creates a medium-severity anomaly automatically.
21. **Related APIs / Dependencies:** `POST /break/start`, `POST /clock-out`, `GET /today`.
22. **What the API Gives / Does:** Seals break segment, computes duration, updates DB records, and returns elapsed break minutes.

---

## 5. Get Today's Attendance Status

1. **API Number and Name:** API 5 — Get Today's Status
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/today`
4. **Purpose:** Provides complete live status for the authenticated user's current day to power dashboard widgets (punch buttons, active timers, break controls).
5. **Business Problem Solved:** Eliminates state ambiguity in UI clients, providing server-authoritative insight on whether the user is working, on break, off-shift, or on holiday.
6. **Why the API Exists:** Single source of truth for rendering the primary attendance card.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Polled or queried on page load by dashboard attendance cards.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `date` (ISO Date, Optional, defaults to today in `Asia/Kolkata`).
10. **Field Meanings:**
    - `date`: Optional date to inspect. Defaults to current IST calendar day.
11. **Backend Processing Flow:**
    - Resolves today's date in `Asia/Kolkata`.
    - Queries `recordRepository.findTodayRecordWithIncludes(today)`.
    - If no record exists today, checks `_findOpenRecord()` for an unclosed shift from yesterday. If found, anchors response to yesterday's open record date.
    - If still no record: determines default status (`holiday`, `weekly_off`, or `not_marked`), resolves assigned shift, and returns empty record layout.
    - If record exists: extracts `active_break` (where `end_time IS NULL`), maps all breaks, and includes live shift and calendar flags.
12. **Database Impact:** Read-only queries against `attendance_records`, `attendance_breaks`, `attendance_sessions`, `shift_templates`, `attendance_holidays`.
13. **Validation Rules (Joi):**
    - `date`: `Joi.date().iso().optional()`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Today's attendance fetched",
        "data": {
          "date": "2026-09-13",
          "status": "in_progress",
          "clock_in_time": "2026-09-13T09:02:15.000Z",
          "clock_out_time": null,
          "total_hours": null,
          "effective_hours": null,
          "worked_duration_formatted": "0h 0m",
          "break_duration_minutes": 45,
          "late_minutes": 0,
          "early_exit_minutes": 0,
          "overtime_minutes": 0,
          "half_day_type": null,
          "work_mode": "office",
          "active_break": null,
          "breaks": [
            {
              "id": "7ca19283-...",
              "start_time": "2026-09-13T13:00:00.000Z",
              "end_time": "2026-09-13T13:45:00.000Z",
              "duration_minutes": 45
            }
          ],
          "shift": {
            "name": "General Shift",
            "start_time": "09:00",
            "end_time": "18:00",
            "type": "fixed"
          },
          "is_holiday": false,
          "is_weekly_off": false
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `401 UNAUTHORIZED`: Invalid token.
    - `403 FEATURE_NOT_AVAILABLE`: Plan restriction.
16. **Security / Authorization Behavior:** Self-service scoped to caller's `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read operation.
18. **Transactions / Concurrency Behavior:** Read-only operation.
19. **Side Effects:** None.
20. **Important Edge Cases:**
    - Overnight shifts: If an overnight shift from yesterday is still open, returns yesterday's date and record, preventing the UI from offering a broken "Clock In" button.
21. **Related APIs / Dependencies:** `POST /clock-in`, `POST /clock-out`, `GET /shift`.
22. **What the API Gives / Does:** Returns live status, active break state, completed break logs, and shift boundaries for the current day.

---

## 6. Submit Regularization Request

1. **API Number and Name:** API 6 — Submit Regularization Request
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/regularization`
4. **Purpose:** Submits an attendance correction request for past missed punches or technical errors for manager review.
5. **Business Problem Solved:** Enables audit-tracked retroactive corrections to attendance records without allowing employees to bypass payroll freezes.
6. **Why the API Exists:** Provides a formal maker-checker workflow for fixing missing or incorrect punches.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** An employee forgot to clock out yesterday and submits a regularization with the correct departure time and justification.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Body (JSON):**
     ```json
     {
       "date": "2026-09-12",
       "requested_clock_in": "2026-09-12T09:00:00.000Z",
       "requested_clock_out": "2026-09-12T18:00:00.000Z",
       "reason": "Biometric device offline during departure",
       "work_mode": "office"
     }
     ```
10. **Field Meanings:**
    - `date` (ISO Date, Required): Date of the shift being regularized.
    - `requested_clock_in` (ISO Date or `HH:mm[:ss]`, Optional): Corrected clock-in time.
    - `requested_clock_out` (ISO Date or `HH:mm[:ss]`, Optional): Corrected clock-out time.
    - `reason` (String, Required, 5–1000 chars): Business justification.
    - `work_mode` (String, Optional): Work mode claimed for the corrected day.
      **Validated against the employee's contract at submission as of 2026-10-05** — see the
      validation rules below. Omit it unless the employee is `hybrid`; omitting leaves the record's
      existing mode untouched, which is almost always what you want.
11. **Backend Processing Flow:**
    - Normalizes `date` to `YYYY-MM-DD` in UTC/business calendar.
    - Enforces lock periods: checks `lockService.checkLock()`. Rejects if locked.
    - Finds existing record on that date.
    - Resolves policy: verifies `regularization_allowed == true` and that `date` is within `regularization_window_days`. Throws `400 INVALID_REGULARIZATION_DATE` if expired.
    - Checks for an already pending regularization request on this date (`409 ALREADY_PENDING`).
    - Validates window: merges requested punches with existing punches on the record. Ensures both sides are resolved and `clockOut > clockIn`.
    - Inserts `attendance_regularization_requests` row with `status: 'pending'`.
12. **Database Impact:** Inserts 1 row into `attendance_regularization_requests`.
13. **Validation Rules (Joi):**
    - `date`: ISO Date required.
    - `requested_clock_in` / `requested_clock_out`: ISO Date or time string regex `^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$`. At least one required (`.or('requested_clock_in', 'requested_clock_out')`).
    - `reason`: String min 5, max 1000 required.
    - `work_mode`: Enum `['office', 'remote', 'field', 'hybrid']`, optional, **and additionally
      reconciled against the employee's contractual profile** (added 2026-10-05). Permitted values:
      an `office`/`on-site` contract (including a `NULL` profile mode, which resolves to `office`)
      accepts only `'office'`; `remote` only `'remote'`; `field` only `'field'`; `hybrid` accepts
      `'office'` or `'remote'`. Anything else is `400 WORK_MODE_NOT_PERMITTED`; an unrecognized
      token is `400 INVALID_WORK_MODE`. Without this, an on-site employee flagged `out_of_bounds`
      could file a regularization declaring `'remote'` and have approval relabel the day,
      retroactively legitimizing the punch.
14. **Success Response and Field Meanings:**
    - **Status:** `201 Created`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Regularization request submitted",
        "data": {
          "id": "7b8e192c-...",
          "org_id": "b782fd72-...",
          "user_id": "5a61d281-...",
          "record_id": "3d56cf8c-...",
          "date": "2026-09-12",
          "requested_clock_in": "2026-09-12T09:00:00.000Z",
          "requested_clock_out": "2026-09-12T18:00:00.000Z",
          "reason": "Biometric device offline during departure",
          "work_mode": "office",
          "status": "pending",
          "created_at": "2026-09-13T03:30:00.000Z"
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 INVALID_REGULARIZATION_DATE`: Request date exceeds policy window.
    - `400 INVALID_REGULARIZATION_WINDOW`: Requested clock-out is before clock-in.
    - `400 INCOMPLETE_REGULARIZATION`: Missing punch on one side with no existing punch to fall back on.
    - `403 REGULARIZATION_DISABLED`: Policy forbids regularization.
    - `403 LOCKED_PERIOD`: Date falls inside locked payroll cycle.
    - `409 ALREADY_PENDING`: A pending request already exists for this date.
16. **Security / Authorization Behavior:** Token authenticated. Bound to caller's own attendance record.
17. **Idempotency and Retry Behavior:** Guarded against duplication by `ALREADY_PENDING` check.
18. **Transactions / Concurrency Behavior:** Enclosed in a transaction.
19. **Side Effects:** Creates a pending approval item in manager's approval queue.
20. **Important Edge Cases:**
    - Time-only inputs (`09:00`) are automatically anchored to the request date in `Asia/Kolkata`.
    - Partial corrections: If only `requested_clock_out` is passed, `clockIn` automatically adopts the existing record's `clock_in_time`.
21. **Related APIs / Dependencies:** `GET /regularizations`, `POST /regularizations/:id/cancel`, manager approvals.
22. **What the API Gives / Does:** Creates a formal regularization record awaiting managerial review.

---

## 7. Cancel / Withdraw Regularization Request

1. **API Number and Name:** API 7 — Cancel Regularization Request
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/regularizations/:id/cancel`
4. **Purpose:** Allows an employee to withdraw their own pending regularization request before it is acted upon by a manager.
5. **Business Problem Solved:** Closes the race window between employee retraction and managerial approval, preventing accidental approvals of unwanted corrections.
6. **Why the API Exists:** Provides employee-side cancellation control.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Employee submitted a correction with a typo and withdraws it to resubmit.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required) — Regularization request ID.
   - **Body:** None.
10. **Field Meanings:** `id` is the unique UUID of the regularization request.
11. **Backend Processing Flow:**
    - Starts transaction.
    - Fetches request with pessimistic row lock (`LOCK.UPDATE`).
    - Validates ownership: `request.user_id === req.user.id` and `request.org_id === req.user.orgId`.
    - Asserts `request.status === 'pending'`. If already approved, rejected, or cancelled, throws `400 ALREADY_PROCESSED`.
    - Updates status to `'cancelled'` and sets `reviewed_at = new Date()`.
    - Commits transaction.
12. **Database Impact:** Updates 1 row in `attendance_regularization_requests` (`status: 'cancelled'`).
13. **Validation Rules (Joi):** `id`: UUIDv4 format required.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Regularization request withdrawn",
        "data": {
          "success": true,
          "status": "cancelled"
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Request was already approved, rejected, or cancelled.
    - `403 FORBIDDEN`: Attempting to withdraw another user's request.
    - `404 NOT_FOUND`: Request ID does not exist.
16. **Security / Authorization Behavior:** Strictly validates caller owns the request.
17. **Idempotency and Retry Behavior:** Fails with `400 ALREADY_PROCESSED` on repeat call.
18. **Transactions / Concurrency Behavior:** Uses `transaction.LOCK.UPDATE` row lock to prevent race conditions with manager approvals.
19. **Side Effects:** Removes item from manager's pending queue.
20. **Important Edge Cases:** If a manager approves at the exact same millisecond, row locking serializes execution and the second action receives `400 ALREADY_PROCESSED`.
21. **Related APIs / Dependencies:** `POST /regularization`, `GET /regularizations`.
22. **What the API Gives / Does:** Retracts pending regularization and flags it as cancelled.

---

## 8. Get My Overtime Requests

1. **API Number and Name:** API 8 — Get My Overtime
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/overtime/mine`
4. **Purpose:** Returns a paginated list of the employee's system-generated overtime records and their approval statuses.
5. **Business Problem Solved:** Gives employees transparency into whether extra hours worked have been approved for overtime compensation.
6. **Why the API Exists:** Exposes overtime tracking to self-service users.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Employee checks their dashboard to verify if last week's weekend shift was approved for overtime pay.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `page` (Integer, default 1), `limit` (Integer, max 100, default 20).
10. **Field Meanings:** Standard pagination controls.
11. **Backend Processing Flow:**
    - Validates query schema.
    - Queries `attendance_overtime` repository filtered by `org_id` and `user_id`.
    - Orders by date descending.
    - Calculates `totalPages` and returns items.
12. **Database Impact:** Read-only query against `attendance_overtime`.
13. **Validation Rules (Joi):**
    - `page`: Integer min 1, default 1.
    - `limit`: Integer min 1, max 100, default 20.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Your overtime requests fetched",
        "data": {
          "total": 2,
          "page": 1,
          "limit": 20,
          "totalPages": 1,
          "records": [
            {
              "id": "3b29c18d-...",
              "date": "2026-09-10",
              "duration_minutes": 120,
              "status": "approved",
              "approved_by": "5a61d281-...",
              "approved_at": "2026-09-11T10:00:00.000Z",
              "remarks": "Approved project release overtime"
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FEATURE_NOT_AVAILABLE`.
16. **Security / Authorization Behavior:** Scoped strictly to `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Overtime is auto-generated by the calculation engine when `overtime_minutes > 0` and policy permits overtime.
21. **Related APIs / Dependencies:** Manager Overtime Approval APIs.
22. **What the API Gives / Does:** Returns list of personal overtime records with approval audit trails.

---

## 9. Get My Anomalies

1. **API Number and Name:** API 9 — Get My Anomalies
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/anomalies/mine`
4. **Purpose:** Returns a paginated list of attendance anomalies flagged against the user (e.g. late arrival, early exit, out-of-bounds punch, missing clock-out).
5. **Business Problem Solved:** Provides employees immediate visibility into policy infractions and system flags so they can submit regularizations before payroll locking.
6. **Why the API Exists:** Self-service discrepancy visibility.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Employee reviews why their record was flagged and submits a regularization.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `status`: Enum (`'open'`, `'resolved'`, `'all'`), default `'all'`.
     - `page`: Integer min 1, default 1.
     - `limit`: Integer min 1, max 100, default 20.
10. **Field Meanings:**
    - `status`: Filter by resolution state (`open` maps to `is_resolved = false`, `resolved` maps to `is_resolved = true`).
11. **Backend Processing Flow:**
    - Maps `status` to boolean `isResolved`.
    - Queries `attendance_anomalies` by `org_id`, `user_id`, and `is_resolved`.
    - Returns paginated records.
12. **Database Impact:** Read-only query against `attendance_anomalies`.
13. **Validation Rules (Joi):**
    - `status`: Valid `['open', 'resolved', 'all']`, default `'all'`.
    - `page`: Integer min 1, default 1.
    - `limit`: Integer 1–100, default 20.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Your attendance anomalies fetched",
        "data": {
          "total": 1,
          "page": 1,
          "limit": 20,
          "totalPages": 1,
          "records": [
            {
              "id": "a9182374-...",
              "record_id": "3d56cf8c-...",
              "date": "2026-09-11",
              "type": "late_arrival",
              "severity": "low",
              "description": "Late by 22 minute(s) beyond grace period",
              "is_resolved": false,
              "resolved_by": null,
              "resolved_at": null,
              "resolution_notes": null
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid status enum.
16. **Security / Authorization Behavior:** Bound to `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Severity is categorized as `'low'`, `'medium'`, or `'high'` depending on policy thresholds (e.g. late > 30 min is medium).
21. **Related APIs / Dependencies:** `POST /regularization`, Manager Anomaly Resolution API.
22. **What the API Gives / Does:** Returns personal attendance flags with severity and resolution notes.

---

## 10. Get Attendance History

1. **API Number and Name:** API 10 — Get Attendance History
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/history`
4. **Purpose:** Returns paginated historical attendance records for the employee across an optional date range (`from` and `to`).
5. **Business Problem Solved:** Provides employees and calendar views historical attendance records with clock times, net hours, and statuses.
6. **Why the API Exists:** Core ledger query for personal attendance history.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Powers the "Attendance History" table and monthly attendance calendar in the employee portal.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `from`: ISO Date string (Optional).
     - `to`: ISO Date string (Optional).
     - `page`: Integer min 1, default 1 (Optional).
     - `limit`: Integer 1–100, default 20 (Optional).
10. **Field Meanings:** Range filters and pagination controls.
11. **Backend Processing Flow:**
    - Formats pagination offset and limit.
    - Queries `attendance_records` eager-loading `shift` template details.
    - Maps records into standardized wire shapes with `late_minutes`, `effective_hours`, `status`, etc.
    - Computes `totalPages` and returns envelope.
12. **Database Impact:** Read-only query on `attendance_records` and `shift_templates`.
13. **Validation Rules (Joi):**
    - `from`: ISO Date format, optional.
    - `to`: ISO Date format, optional.
    - `page`: Integer min 1, default 1.
    - `limit`: Integer min 1, max 100, default 20.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Attendance history fetched",
        "data": {
          "records": [
            {
              "id": "3d56cf8c-...",
              "date": "2026-09-12",
              "status": "present",
              "clock_in_time": "2026-09-12T09:01:00.000Z",
              "clock_out_time": "2026-09-12T18:04:00.000Z",
              "total_hours": "9.05",
              "effective_hours": "8.05",
              "worked_duration_formatted": "8h 3m",
              "break_duration_minutes": 60,
              "late_minutes": 0,
              "early_exit_minutes": 0,
              "overtime_minutes": 4,
              "work_mode": "office",
              "half_day_type": null,
              "is_regularized": false,
              "shift": {
                "name": "General Shift",
                "start_time": "09:00",
                "end_time": "18:00"
              }
            }
          ],
          "pagination": {
            "page": 1,
            "limit": 20,
            "total": 1,
            "totalPages": 1
          }
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on malformed date query.
16. **Security / Authorization Behavior:** Scoped to `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If `from` and `to` are omitted, returns all historical records ordered by date descending.
21. **Related APIs / Dependencies:** `GET /daily-log`, `GET /summary`.
22. **What the API Gives / Does:** Delivers paginated daily attendance history with shift and hour metrics.

---

## 11. Get Monthly Attendance Summary

1. **API Number and Name:** API 11 — Get Monthly Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/summary`
4. **Purpose:** Calculates aggregated monthly attendance KPIs (days present, half-days, absences, leaves, total hours, average daily hours, overtime minutes).
5. **Business Problem Solved:** Gives employees and payroll processors instant monthly statistics without recalculating day-by-day tallies client-side.
6. **Why the API Exists:** Powers monthly overview widgets on user dashboards.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** User opens monthly dashboard to see how many days they worked and total overtime accumulated.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `month`: Integer (1–12, Optional, defaults to current month in `Asia/Kolkata`).
     - `year`: Integer (2000–2100, Optional, defaults to current year in `Asia/Kolkata`).
10. **Field Meanings:** Month and year selector.
11. **Backend Processing Flow:**
    - Resolves target month and year defaults.
    - Determines `startDate` (`YYYY-MM-01`) and `endDate` (`endOf('month')`).
    - Queries all `attendance_records` for user in date range.
    - Aggregates status counters (`present`, `half_day`, `absent`, `holiday`, `weekly_off`, `on_leave`).
    - Accumulates `totalHoursWorked`, `totalOvertimeMinutes`, `totalBreakMinutes`, and computes `average_hours_per_day`.
12. **Database Impact:** Read-only query against `attendance_records`.
13. **Validation Rules (Joi):**
    - `month`: Integer min 1, max 12, optional.
    - `year`: Integer min 2000, max 2100, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Monthly summary fetched",
        "data": {
          "month": 9,
          "year": 2026,
          "total_records": 12,
          "present_days": 9,
          "half_days": 1,
          "absent_days": 0,
          "late_days": 1,
          "holiday_days": 0,
          "weekly_off_days": 2,
          "on_leave_days": 0,
          "total_hours_worked": 76.5,
          "total_worked_duration_formatted": "76h 30m",
          "average_hours_per_day": 7.65,
          "total_overtime_minutes": 45,
          "total_break_minutes": 450
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid month/year.
16. **Security / Authorization Behavior:** Scoped to caller's identity.
17. **Idempotency and Retry Behavior:** Strictly idempotent.
18. **Transactions / Concurrency Behavior:** Read-only.
19. **Side Effects:** None.
20. **Important Edge Cases:** `workedDays` includes `present_days + half_days`. If `workedDays === 0`, `average_hours_per_day` safely returns `0` rather than `NaN`.
21. **Related APIs / Dependencies:** `GET /history`, `GET /graph-data`.
22. **What the API Gives / Does:** Summarizes high-level monthly metrics and worked hours.

---

## 12. Get Active Shift Details

1. **API Number and Name:** API 12 — Get Active Shift Details
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/shift`
4. **Purpose:** Fetches the employee's currently effective shift template, rotation pattern, and weekly off rules for today.
5. **Business Problem Solved:** Informs employee of their work schedule, expected arrival times, core hours, and off days.
6. **Why the API Exists:** Provides real-time shift metadata to UI dashboards.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Loaded by the frontend to display shift timings on the user dashboard.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Resolves today's date in `Asia/Kolkata`.
    - Queries active `employee_shift_assignments` covering today.
    - Queries applicable `attendance_weekly_off_rules`.
    - If assignment uses a `rotation_pattern_id`, computes the specific shift active today in the rotation cycle.
    - Returns assignment, resolved shift, rotation sequence, and weekly offs.
12. **Database Impact:** Read-only query on `employee_shift_assignments`, `shift_templates`, `attendance_rotation_patterns`, `attendance_weekly_off_rules`.
13. **Validation Rules:** None (no input).
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Current shift fetched",
        "data": {
          "assignment": {
            "id": "18a92b3c-...",
            "effective_from": "2026-01-01",
            "effective_to": null
          },
          "shift": {
            "id": "7ca19283-...",
            "name": "Morning Shift",
            "start_time": "08:00",
            "end_time": "17:00",
            "type": "fixed",
            "is_overnight": false
          },
          "rotation": null,
          "weekly_offs": [
            {
              "id": "2b3c4d5e-...",
              "days_of_week": [0, 6],
              "effective_from": "2026-01-01",
              "effective_to": null
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Scoped to caller's `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If no shift is assigned, returns `shift: null` along with any global weekly off rules applicable to the employee.
21. **Related APIs / Dependencies:** `GET /today`, `POST /clock-in`.
22. **What the API Gives / Does:** Returns active shift parameters, rotation state, and applicable weekly rest days.

---

## 13. List My Regularization Requests

1. **API Number and Name:** API 13 — List My Regularizations
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/regularizations`
4. **Purpose:** Returns a paginated list of all regularization requests submitted by the caller, filterable by approval status.
5. **Business Problem Solved:** Enables employees to track the review status, manager remarks, and outcomes of their attendance correction requests.
6. **Why the API Exists:** Provides an audit history of personal regularization requests.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Displays the "My Regularizations" tab on the employee attendance page.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `status`: Enum (`'pending'`, `'approved'`, `'rejected'`, `'cancelled'`, `'all'`, Optional).
     - `page`: Integer min 1, default 1 (Optional).
     - `limit`: Integer 1–100, default 20 (Optional).
10. **Field Meanings:** Filter by lifecycle state and paginate.
11. **Backend Processing Flow:**
    - Queries `attendance_regularization_requests` filtered by `org_id` and `user_id`.
    - Applies status filter if provided (and not `'all'`).
    - Orders by creation date descending.
    - Returns paginated list.
12. **Database Impact:** Read-only query on `attendance_regularization_requests`.
13. **Validation Rules (Joi):**
    - `status`: Valid values `['pending', 'approved', 'rejected', 'cancelled', 'all']`, optional.
    - `page`: Integer min 1, default 1.
    - `limit`: Integer min 1, max 100, default 20.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Regularizations fetched",
        "data": {
          "total": 1,
          "page": 1,
          "limit": 20,
          "totalPages": 1,
          "requests": [
            {
              "id": "7b8e192c-...",
              "date": "2026-09-10",
              "requested_clock_in": "2026-09-10T09:00:00.000Z",
              "requested_clock_out": "2026-09-10T18:00:00.000Z",
              "reason": "Forgot to punch out due to client visit",
              "work_mode": "office",
              "status": "approved",
              "reviewed_by": "5a61d281-...",
              "reviewed_at": "2026-09-11T09:30:00.000Z",
              "review_remarks": "Approved verified with client",
              "created_at": "2026-09-10T19:00:00.000Z"
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid status enum.
16. **Security / Authorization Behavior:** Scoped strictly to caller's `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Cancellation status `'cancelled'` is visible here once withdrawn.
21. **Related APIs / Dependencies:** `POST /regularization`, `POST /regularizations/:id/cancel`.
22. **What the API Gives / Does:** Returns historical regularization requests with reviewer notes and status codes.

---

## 14. List My Comp-Off Requests

1. **API Number and Name:** API 14 — List My Comp-Off Requests
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/comp-offs/mine`
4. **Purpose:** Returns paginated compensatory-off credit records earned by the employee for working on holidays or weekly off days.
5. **Business Problem Solved:** Gives employees visibility into their earned compensatory days, validity windows, and expiry dates before applying for leave.
6. **Why the API Exists:** Provides self-service ledger of compensatory credits.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Employee checks how many compensatory days they have available to redeem.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:**
     - `status`: Enum (`'earned'`, `'approved'`, `'used'`, `'expired'`, `'cancelled'`, Optional).
     - `page`: Integer min 1, default 1.
     - `limit`: Integer min 1, max 100, default 20.
10. **Field Meanings:** Filter by comp-off status and pagination options.
11. **Backend Processing Flow:**
    - Queries `attendance_comp_offs` by `org_id` and `user_id`.
    - Applies status filter if provided.
    - Maps fields into DTO containing `earned_date`, `worked_type`, `expiry_date`, etc.
12. **Database Impact:** Read-only query on `attendance_comp_offs`.
13. **Validation Rules (Joi):**
    - `status`: Enum `['earned', 'approved', 'used', 'expired', 'cancelled']`.
    - `page`: Integer min 1.
    - `limit`: Integer 1–100.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Your comp-offs fetched",
        "data": {
          "total": 1,
          "page": 1,
          "limit": 20,
          "totalPages": 1,
          "comp_offs": [
            {
              "id": "9b1284c1-...",
              "earned_date": "2026-08-15",
              "worked_type": "holiday",
              "worked_hours": "8.00",
              "status": "approved",
              "expiry_date": "2026-11-15",
              "used_on_date": null,
              "used_leave_id": null
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid status filter.
16. **Security / Authorization Behavior:** Scoped to caller's identity.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Comp-off records in `approved` status are eligible for redemption in the Leave Module.
21. **Related APIs / Dependencies:** `GET /comp-offs/mine/summary`, Leave Module.
22. **What the API Gives / Does:** Delivers list of personal comp-off records with work dates and expiry horizons.

---

## 15. Get My Comp-Off Balance Summary

1. **API Number and Name:** API 15 — Get My Comp-Off Balance Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/comp-offs/mine/summary`
4. **Purpose:** Returns a quick tally of total earned, approved, used, expired, and currently redeemable comp-off days for the employee.
5. **Business Problem Solved:** Summarizes comp-off balance counts for dashboard widgets.
6. **Why the API Exists:** Provides rapid balance summary without requiring client-side array aggregation.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Rendered on employee profile and leave application screens.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Queries all comp-off records for the user via `compOffRepository.findByUserForSummary()`.
    - Iterates records and computes counts for `earned`, `approved`, `used`, `expired`, and `cancelled`.
    - Computes `redeemable`: records where `status === 'approved'` and `expiry_date >= today`.
12. **Database Impact:** Read-only query on `attendance_comp_offs`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Your comp-off summary fetched",
        "data": {
          "earned": 0,
          "approved": 2,
          "used": 1,
          "expired": 0,
          "cancelled": 0,
          "redeemable": 2,
          "total": 3
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Scoped to caller's `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** `redeemable` specifically filters out approved comp-offs whose `expiry_date` has already passed today's date in `Asia/Kolkata`.
21. **Related APIs / Dependencies:** `GET /comp-offs/mine`.
22. **What the API Gives / Does:** Returns status tally and net redeemable comp-off count.

---

## 16. Get Daily Attendance Log

1. **API Number and Name:** API 16 — Get Daily Attendance Log
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/daily-log`
4. **Purpose:** Returns comprehensive, minute-by-minute diagnostic detail for a single day, including punch timestamps, active sessions, breaks, and anomalies.
5. **Business Problem Solved:** Provides deep transparency into complex punch days (e.g. multiple break segments, anomaly reasons) for dispute resolution.
6. **Why the API Exists:** Powers the modal drill-down view when an employee inspects a specific date in their attendance history.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Employee clicks on a past day in the history table to view all break durations and exact clock-in/out timestamps.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `date` (ISO Date, Optional, defaults to today in `Asia/Kolkata`).
10. **Field Meanings:** Target date to inspect.
11. **Backend Processing Flow:**
    - Resolves `targetDate`.
    - Queries record with eager-loaded `sessions`, `breaks`, `shift`, and `anomalies`.
    - If record is missing: resolves virtual status (`holiday`, `weekly_off`, `absent`, or `not_marked` before joining date).
    - If record exists: maps sessions (`opened_at`, `closed_at`, `status`), breaks (`start_time`, `end_time`, `duration_minutes`), and anomalies (`type`, `description`, `severity`, `is_resolved`).
12. **Database Impact:** Read-only query on `attendance_records`, `attendance_sessions`, `attendance_breaks`, `attendance_anomalies`.
13. **Validation Rules (Joi):** `date`: `Joi.date().iso().optional()`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Daily attendance log fetched",
        "data": {
          "date": "2026-09-12",
          "status": "present",
          "clock_in_time": "2026-09-12T09:02:00.000Z",
          "clock_out_time": "2026-09-12T18:05:00.000Z",
          "total_hours": 9.05,
          "effective_hours": 8.05,
          "worked_duration_formatted": "8h 3m",
          "break_duration_minutes": 60,
          "late_minutes": 0,
          "early_exit_minutes": 0,
          "overtime_minutes": 5,
          "work_mode": "office",
          "half_day_type": null,
          "is_regularized": false,
          "is_holiday": false,
          "is_weekly_off": false,
          "shift": {
            "name": "General Shift",
            "start_time": "09:00",
            "end_time": "18:00",
            "type": "fixed"
          },
          "sessions": [
            {
              "id": "4bf7e078-...",
              "opened_at": "2026-09-12T09:02:00.000Z",
              "closed_at": "2026-09-12T18:05:00.000Z",
              "status": "closed"
            }
          ],
          "breaks": [
            {
              "id": "7ca19283-...",
              "start_time": "2026-09-12T13:00:00.000Z",
              "end_time": "2026-09-12T14:00:00.000Z",
              "duration_minutes": 60
            }
          ],
          "anomalies": []
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid date format.
16. **Security / Authorization Behavior:** Scoped strictly to `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** For dates before the employee's `joining_date`, `status` evaluates to `not_marked` rather than `absent`.
21. **Related APIs / Dependencies:** `GET /history`, `GET /today`.
22. **What the API Gives / Does:** Returns granular logs, breaks, sessions, and anomalies for a single calendar date.

---

## 17. Get Monthly Graph Data

1. **API Number and Name:** API 17 — Get Monthly Graph Data
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/graph-data`
4. **Purpose:** Generates day-by-day time-series data points across an entire calendar month for chart rendering, along with monthly aggregated KPIs and punctuality percentage.
5. **Business Problem Solved:** Provides frontend charting engines with a pre-filled array of all calendar days (including holidays and weekends) without client-side date synthesis.
6. **Why the API Exists:** Powers the interactive attendance line and bar charts.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** User opens analytics dashboard to see their daily hours curve for the month.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `month` (1–12, Optional), `year` (2000–2100, Optional).
10. **Field Meanings:** Target month and year. Defaults to current month/year in `Asia/Kolkata`.
11. **Backend Processing Flow:**
    - Determines month boundaries and total days in month (`daysInMonth`).
    - Fetches all records for user in date range.
    - Generates virtual statuses concurrently for days missing records (evaluating holidays, weekly-offs, and joining date).
    - Assembles complete `daily` array for day 1 through `daysInMonth`.
    - Computes `punctuality_percentage = ((workedDays - lateDays) / workedDays) * 100`.
    - Returns summary object and daily array.
12. **Database Impact:** Read-only query on `attendance_records`, `shift_templates`, `attendance_holidays`.
13. **Validation Rules (Joi):**
    - `month`: Integer min 1, max 12, optional.
    - `year`: Integer min 2000, max 2100, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Graph data fetched",
        "data": {
          "month": 9,
          "year": 2026,
          "summary": {
            "present_days": 9,
            "half_days": 1,
            "absent_days": 0,
            "late_days": 1,
            "holiday_days": 0,
            "weekly_off_days": 2,
            "on_leave_days": 0,
            "total_hours_worked": 76.5,
            "total_worked_duration_formatted": "76h 30m",
            "average_hours_per_day": 7.65,
            "total_overtime_minutes": 45,
            "total_break_minutes": 450,
            "punctuality_percentage": 90.0
          },
          "daily": [
            {
              "date": "2026-09-01",
              "day_of_week": "Tuesday",
              "status": "present",
              "effective_hours": 8.5,
              "worked_duration_formatted": "8h 30m",
              "late_minutes": 0,
              "overtime_minutes": 0
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid month/year.
16. **Security / Authorization Behavior:** Scoped to `req.user.id`.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Every day in the month is present in `daily`. Unworked future days return `status: 'not_marked'` with `effective_hours: null`.
21. **Related APIs / Dependencies:** `GET /summary`, `GET /trends`.
22. **What the API Gives / Does:** Provides contiguous daily time-series array and summary KPIs for chart rendering.

---

## 18. Get Attendance Trends

1. **API Number and Name:** API 18 — Get Attendance Trends
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/trends`
4. **Purpose:** Analyzes attendance patterns across the past $N$ months, calculating multi-month punctuality averages, average hours, and the user's active streak.
5. **Business Problem Solved:** Identifies longitudinal attendance trends and employee punctuality streaks.
6. **Why the API Exists:** Powers long-term performance widgets and gamified streak indicators.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Displays "Current Streak: 15 Days Present" and 3-month performance charts on the user profile.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `months` (Integer, 1–12, default 3, Optional).
10. **Field Meanings:** Number of past months to analyze.
11. **Backend Processing Flow:**
    - Loops backwards through $N$ months calling `getGraphData()` for each month.
    - Computes global totals for worked days, late days, and total hours.
    - Walks backwards day-by-day over the past 100 days to compute `current_streak` (skipping holidays and weekly offs so rest days do not break a streak).
    - Halts streak evaluation if reaching the employee's `joining_date`.
    - Returns streak information, overall punctuality, and per-month trend breakdown.
12. **Database Impact:** Read-only queries across past records.
13. **Validation Rules (Joi):** `months`: Integer min 1, max 12, default 3.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Attendance trends fetched",
        "data": {
          "current_streak": {
            "type": "present",
            "days": 12,
            "since": "2026-08-28"
          },
          "punctuality_percentage": 94.5,
          "average_hours_per_day": 8.1,
          "months": [
            {
              "month": 9,
              "year": 2026,
              "present_days": 9,
              "absent_days": 0,
              "late_days": 1,
              "total_hours": 76.5,
              "avg_hours": 7.65,
              "punctuality_percentage": 90.0
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` if `months` is outside 1–12.
16. **Security / Authorization Behavior:** Scoped to caller's identity.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Weekends and holidays do not reset the streak; only unexcused absences or breaks in status interrupt the streak counter.
21. **Related APIs / Dependencies:** `GET /graph-data`, `GET /summary`.
22. **What the API Gives / Does:** Computes multi-month punctuality stats and consecutive present streaks.

---

## 19. Get Weekly Calendar View

1. **API Number and Name:** API 19 — Get Weekly Calendar View
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/weekly-calendar`
4. **Purpose:** Returns a fixed 7-day ISO week view (Monday to Sunday) centered on the requested date, showing shift schedules, daily statuses, and punch times.
5. **Business Problem Solved:** Provides employees a weekly schedule view matching standard calendar displays.
6. **Why the API Exists:** Powers weekly attendance strip widgets on dashboard headers.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** User views their current week's schedule to see upcoming weekly-offs and past days' work status.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `date` (ISO Date, Optional, defaults to today in `Asia/Kolkata`).
10. **Field Meanings:** Anchor date within the desired target week.
11. **Backend Processing Flow:**
    - Normalizes anchor date in `Asia/Kolkata`.
    - Computes `weekStart` (`startOf('isoWeek')` = Monday) and `weekEnd` (`endOf('isoWeek')` = Sunday).
    - Queries records in date range `[weekStart, weekEnd]`.
    - Loops days 0 to 6; resolves virtual status for days without records.
    - Aggregates `week_summary` (`total_hours`, `days_present`, `days_late`, `days_absent`, `days_off`).
    - Returns `daily` 7-day array and weekly summary.
12. **Database Impact:** Read-only query on `attendance_records`, `shift_templates`, `attendance_holidays`.
13. **Validation Rules (Joi):** `date`: `Joi.date().iso().optional()`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Weekly calendar fetched",
        "data": {
          "week_start": "2026-09-07",
          "week_end": "2026-09-13",
          "week_summary": {
            "total_hours": 39.5,
            "days_present": 5,
            "days_late": 0,
            "days_absent": 0,
            "days_off": 2
          },
          "daily": [
            {
              "date": "2026-09-07",
              "day_of_week": "Monday",
              "status": "present",
              "clock_in_time": "2026-09-07T09:00:00.000Z",
              "clock_out_time": "2026-09-07T18:00:00.000Z",
              "effective_hours": 8.0,
              "worked_duration_formatted": "8h 0m",
              "late_minutes": 0
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid date format.
16. **Security / Authorization Behavior:** Scoped to caller's identity.
17. **Idempotency and Retry Behavior:** Strictly idempotent.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Strictly enforces ISO week format starting Monday, eliminating timezone-dependent starting day drift.
21. **Related APIs / Dependencies:** `GET /today`, `GET /shift`.
22. **What the API Gives / Does:** Delivers a structured 7-day Monday-to-Sunday weekly view with work metrics.

---

## 20. Get Applicable Holidays

1. **API Number and Name:** API 20 — Get Applicable Holidays
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/holidays`
4. **Purpose:** Returns the calendar of organizational and targeted holidays applicable to the authenticated user for a given year.
5. **Business Problem Solved:** Resolves multi-location and department-specific holiday lists so employees only see the holidays relevant to their employment terms.
6. **Why the API Exists:** Provides holiday calendar integration for employee self-service.
7. **Allowed Roles and Permissions:** All org roles. Requires `attendance.access`.
8. **Real-World Usage:** Powers the "Upcoming Holidays" card on the employee dashboard and leave planner.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `year` (Integer, 2000–2100, Optional, defaults to current year in `Asia/Kolkata`).
10. **Field Meanings:** Calendar year to inspect.
11. **Backend Processing Flow:**
    - Resolves caller's profile attributes: `location_id`, `department_id`, `employment_type`, `job_status`.
    - Queries `attendance_holidays` via `getResolvedHolidays()` applying location/department targeting filters.
    - Deduplicates holidays on the same date and sorts by date ascending.
    - Returns array of applicable holidays.
12. **Database Impact:** Read-only query on `attendance_holidays` and `user_roles`.
13. **Validation Rules (Joi):** None (Express query handles year).
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Holidays fetched",
        "data": [
          {
            "id": "e4b19283-...",
            "name": "Gandhi Jayanti",
            "date": "2026-10-02",
            "type": "public",
            "is_optional": false
          },
          {
            "id": "f5c29384-...",
            "name": "Diwali",
            "date": "2026-11-08",
            "type": "public",
            "is_optional": false
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `404 USER_NOT_FOUND`.
16. **Security / Authorization Behavior:** Scoped to caller's org membership and profile targeting.
17. **Idempotency and Retry Behavior:** Strictly idempotent.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Filters out holidays that specifically exclude the employee's location or employment type.
21. **Related APIs / Dependencies:** Leave Module, `GET /today`, HR Holiday APIs.
22. **What the API Gives / Does:** Returns targeted list of applicable holidays for the specified calendar year.

---

## 21. Get My Field Assignments

1. **API Number and Name:** API 21 — Get My Field Assignments
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/my-field-assignments`
4. **Purpose:** Returns the caller's own active field sites (client sites / project facilities) plus their assigned office — the complete set of locations they may legitimately punch from.
5. **Business Problem Solved:** A field worker flagged `out_of_bounds` otherwise has no way to see where they were *supposed* to be. This makes the valid punch area visible on the punch screen before the flag happens.
6. **Why the API Exists:** Field geofencing resolves against assigned sites **plus** the office ("composite resolution"). The employee needs both halves to understand their own geofence.
7. **Allowed Roles and Permissions:** All org roles (`employee`, `manager`, `hr`, `admin`, `super-admin`). Requires `attendance.access`. Always scoped to the caller — there is no `user_id` parameter to pass.
8. **Real-World Usage:** The mobile punch screen renders the nearest assigned site and its distance before the employee taps Clock In.
9. **Request Parameters and Payload:** None. Headers only: `Authorization: Bearer <jwt>`.
10. **Field Meanings (response):**
    - `work_mode` (String): the caller's **normalized** contractual mode — `office` | `remote` | `hybrid` | `field`. A `NULL` profile mode reads as `office` (fail-secure). Show the field-sites panel only when this is `field`.
    - `assigned_office` (Object | null): the caller's base office. **Part of the valid punch area for a field employee** — render it alongside the client sites, not as a separate concept.
    - `total` (Number): count of active assignments.
    - `records[]` (Array): each with `effective_from` / `effective_to` (`YYYY-MM-DD` strings, both ends inclusive; `effective_to: null` means open-ended), the `field_location` (coordinates and radius), and the `assigner`.
11. **Backend Processing Flow:** The route injects `req.params.user_id = req.user.id`, then `fieldLocationService.getUserAssignments()` skips its hierarchy check because target === requester, reads the active assignments joined to their active sites, and resolves the contractual mode and office.
12. **Database Impact:** Read-only.
13. **Validation Rules (Joi):** None — no input.
14. **Success Response:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Field assignments fetched successfully",
        "data": {
          "user_id": "aa11a1f0-1111-4111-8111-111111111111",
          "work_mode": "field",
          "assigned_office": { "id": "6b84a9f5-aaa7-4800-bf73-0f4238cec4c2", "name": "Indore HQ" },
          "total": 1,
          "records": [
            {
              "id": "c4de1a22-2222-4222-8222-222222222222",
              "effective_from": "2026-11-01",
              "effective_to": null,
              "is_active": true,
              "field_location": {
                "id": "9f1c0b33-3333-4333-8333-333333333333",
                "name": "Tata Steel Pune Plant",
                "client_name": "Tata Steel Ltd",
                "latitude": "18.52043000",
                "longitude": "73.85674300",
                "geofence_radius_meters": 300
              },
              "assigner": {
                "id": "7b02c044-4444-4444-8444-444444444444",
                "identifier": "manager@acme.com",
                "profile": { "display_name": "Asha Rao" }
              }
            }
          ]
        }
      }
      ```
    - **Note:** `latitude` / `longitude` are returned as **strings** (`numeric` columns via `pg`). Run them through `parseFloat` before passing them to a map component.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `401 UNAUTHORIZED`: Missing, invalid, or expired JWT.
    - `403 FEATURE_NOT_AVAILABLE`: Plan does not permit attendance tracking.
16. **Security / Authorization Behavior:** Hard-scoped to `req.user.id` by the route itself; a caller cannot read another employee's assignments here. The HR and Manager equivalents (`/attendance/hr/field-assignments/user/:user_id`, `/attendance/manager/...`) apply hierarchy scoping instead.
17. **Idempotency and Retry Behavior:** Idempotent read.
18. **Transactions / Concurrency Behavior:** Read-only, no transaction.
19. **Side Effects:** None.
20. **Important Edge Cases:**
    - An employee whose mode is not `field` gets `work_mode` set accordingly and usually `total: 0`. Any assignments present are inert until HR changes the mode — do not render them as active geofence area.
    - A field employee with **no** assigned sites still punches at the office without error (zero-field fallback), so `total: 0` with a non-null `assigned_office` is a valid, working configuration.
    - A site retired after assignment drops out of `records` automatically (the join filters on the site being active).
21. **Related APIs / Dependencies:** `POST /clock-in`, `POST /clock-out`; HR/Manager field management in `7_work_mode_and_field_geofencing_api.md`.
22. **What the API Gives / Does:** The caller's complete valid punch area — assigned client sites plus their base office — with each site's coordinates and radius.

---

## Related: Work Mode & Field Geofencing

The work-mode enforcement rules that govern every punch above — the decision matrix, the four
geofence outcomes, the new anomaly types, the two work-mode vocabularies, and the HR/Manager field
management endpoints — are documented in full in
**`public/md_attendance/7_work_mode_and_field_geofencing_api.md`**.

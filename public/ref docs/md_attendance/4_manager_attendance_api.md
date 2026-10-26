# Manager Attendance APIs (Team Oversight & Approvals)

**Base URL:** `/api/v1/attendance/manager` (Mounted via `manager_attendance.routes.js` and `manager_attendance_read.routes.js`)  
**Module:** Attendance & Time Tracking  
**Source of Truth:** 
- Routes: `src/modules/attendance/routes/manager_attendance.routes.js`, `src/modules/attendance/routes/manager_attendance_read.routes.js`
- Controllers: `src/modules/attendance/controllers/manager_attendance.controller.js`, `src/modules/attendance/controllers/manager_attendance_read.controller.js`
- Validators: `src/modules/attendance/validators/manager_attendance.validator.js`, `src/modules/attendance/validators/manager_attendance_read.validator.js`
- Services: `src/modules/attendance/services/team.service.js`, `manager_attendance_read.service.js`, `regularization.service.js`, `overtime.service.js`, `anomaly.service.js`, `comp_off.service.js`
- Repositories: `attendance_records.repository.js`, `attendance_regularizations.repository.js`, `attendance_overtime.repository.js`, `attendance_anomalies.repository.js`, `attendance_comp_offs.repository.js`

---

## Architecture & Manager Hierarchy Invariants

1. **Manager Hierarchy & Access Boundaries (`attendance_access.utils.js`)**:
   - Every manager route checks `accessControl.getAccessibleUserIds(orgId, requesterUser)`.
   - If the caller has role `hr`, `admin`, or `super-admin`, `getAccessibleUserIds()` returns `null` (representing unrestricted organization-wide visibility).
   - If the caller is a `manager`, it resolves the direct and indirect reporting tree via `user_reporting_mappings`. Managers can **only** view or decide on requests belonging to subordinates in their hierarchy.
   - Any attempt to access or approve a record for an employee outside the manager's reporting line throws `403 HIERARCHY_VIOLATION` or `403 EMPLOYEE_NOT_IN_TEAM`.
2. **Global Auth Stack**:
   - `authenticate` -> `authorize(['manager', 'hr', 'admin', 'super-admin'])` -> `requireFeature('attendance.access')`.
3. **Pessimistic Locking on Decisions**:
   - All approval/rejection endpoints (`regularizations`, `overtime`, `comp-offs`) acquire database row locks (`LOCK.UPDATE`) inside a transaction to prevent double approvals or lost updates.
4. **Payroll Lock Period Enforcement**:
   - Before approving any retroactive punch or comp-off, `lockService.checkLock(orgId, date)` asserts the date is not in a frozen payroll period (`403 LOCKED_PERIOD`).

---

## 1. Get Team Today / Live Status

1. **API Number and Name:** API 1 — Get Team Today
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/today`
4. **Purpose:** Fetches the real-time attendance punch status, active breaks, and shift details for all subordinates reporting to the manager for the current calendar day.
5. **Business Problem Solved:** Eliminates blind spots for managers by providing instant visibility into team presence, late arrivals, active breaks, and absentees.
6. **Why the API Exists:** Primary backend query powering the manager's live team status dashboard.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Loaded automatically when a team lead opens their Manager Attendance dashboard at the start of the workday.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Identifies today's date in `YYYY-MM-DD` (`new Date().toISOString().split('T')[0]`).
    - Calls `accessControl.getAccessibleUserIds()` to resolve direct/indirect reports.
    - Queries `attendance_records` eager-loading user profiles and shift templates for `allowedUserIds` on today's date.
    - Returns array of team member attendance states.
12. **Database Impact:** Read-only query against `attendance_records`, `user_reporting_mappings`, and `user_profiles`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Team today fetched",
        "data": [
          {
            "id": "3d56cf8c-...",
            "user_id": "5a61d281-...",
            "date": "2026-09-13",
            "status": "in_progress",
            "clock_in_time": "2026-09-13T09:05:00.000Z",
            "clock_out_time": null,
            "late_minutes": 5,
            "work_mode": "office",
            "user": {
              "id": "5a61d281-...",
              "identifier": "alex@company.com",
              "profile": {
                "first_name": "Alex",
                "last_name": "Miller",
                "display_name": "Alex Miller",
                "avatar_url": null
              }
            },
            "shift": {
              "id": "7ca19283-...",
              "name": "General Shift",
              "start_time": "09:00",
              "end_time": "18:00"
            }
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`, `403 FORBIDDEN` (if non-manager role).
16. **Security / Authorization Behavior:** Restricts returned records strictly to the manager's reporting subordinates.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If manager has 0 direct reports, returns `data: []`.
21. **Related APIs / Dependencies:** `GET /team/summary`, `GET /team/history`.
22. **What the API Gives / Does:** Returns real-time punch state and shift bounds for all direct and indirect team reports.

---

## 2. Get Team History

1. **API Number and Name:** API 2 — Get Team History
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/history`
4. **Purpose:** Returns comprehensive historical attendance records across all subordinates reporting to the manager.
5. **Business Problem Solved:** Enables managers to conduct team-wide historical audits across shifts, past absences, and working hours.
6. **Why the API Exists:** Provides team-wide historical attendance ledger.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager reviews past team attendance records when evaluating timesheets.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Resolves accessible subordinate user IDs via `accessControl.getAccessibleUserIds()`.
    - Queries `recordRepo.findTeamHistory(orgId, allowedUserIds)`.
    - Returns array of historical records with associated user profiles.
12. **Database Impact:** Read-only query on `attendance_records` and `user_profiles`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Team history fetched",
        "data": [
          {
            "id": "3d56cf8c-...",
            "user_id": "5a61d281-...",
            "date": "2026-09-12",
            "status": "present",
            "effective_hours": "8.50",
            "worked_duration_formatted": "8h 30m",
            "late_minutes": 0,
            "early_exit_minutes": 0,
            "overtime_minutes": 30,
            "user": {
              "id": "5a61d281-...",
              "profile": { "display_name": "Alex Miller" }
            }
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Filtered by hierarchy access control.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** For specific member pagination and date ranges, clients should use `GET /team/member/:userId/history`.
21. **Related APIs / Dependencies:** `GET /team/member/:userId/history`.
22. **What the API Gives / Does:** Delivers team-wide historical attendance records.

---

## 3. Get Team Anomalies

1. **API Number and Name:** API 3 — Get Team Anomalies
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/anomalies`
4. **Purpose:** Returns all unresolved attendance anomalies (out of bounds, late arrival, early exit, excessive break, missing clock-out) flagged against subordinates.
5. **Business Problem Solved:** Surfaced exceptions requiring managerial intervention or manual resolution.
6. **Why the API Exists:** Powers the exception management and anomaly resolution queue.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager checks for team members who clocked in from invalid GPS coordinates or left shifts early.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Resolves accessible subordinate user IDs.
    - Queries `attendance_anomalies` where `is_resolved = false` and `user_id IN (allowedUserIds)`.
    - Eager-loads user details and returns active exception list.
12. **Database Impact:** Read-only query on `attendance_anomalies`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Team anomalies fetched",
        "data": [
          {
            "id": "a9182374-...",
            "user_id": "5a61d281-...",
            "record_id": "3d56cf8c-...",
            "date": "2026-09-12",
            "type": "out_of_bounds",
            "severity": "high",
            "description": "Clock-in punch occurred 450m outside office geofence",
            "is_resolved": false,
            "user": {
              "id": "5a61d281-...",
              "profile": { "display_name": "Alex Miller" }
            }
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Scoped to subordinates only.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Resolved anomalies are omitted from this queue.
21. **Related APIs / Dependencies:** `POST /anomalies/:id/resolve`.
22. **What the API Gives / Does:** Delivers pending attendance flags requiring manager resolution.

---

## 4. Resolve Team Anomaly

1. **API Number and Name:** API 4 — Resolve Team Anomaly
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/anomalies/:id/resolve`
4. **Purpose:** Allows a manager to formally dismiss and resolve a system-generated anomaly for a subordinate with audit remarks.
5. **Business Problem Solved:** Allows managerial discretion (e.g. client meetings, GPS inaccuracy) to clear flags without corrupting raw audit logs.
6. **Why the API Exists:** Provides an audit-trailed resolution flow for attendance exceptions.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager discusses an out-of-bounds flag with an employee who was at a client site and resolves the anomaly.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required) — Anomaly ID.
   - **Body (JSON):**
     ```json
     {
       "remarks": "Verified client site visit with customer account manager"
     }
     ```
10. **Field Meanings:**
    - `remarks`: Optional audit comment (max 1000 characters).
11. **Backend Processing Flow:**
    - Validates `id` as UUID and validates `remarks`.
    - Fetches anomaly by `id`. If missing or org mismatch, throws `404 NOT_FOUND` or `403 UNAUTHORIZED`.
    - Verifies hierarchy: asserts `anomaly.user_id` is within `getAccessibleUserIds()`. Throws `403 HIERARCHY_VIOLATION` if outside reporting line.
    - Checks payroll lock period: asserts `anomaly.date` is not in a frozen payroll cycle.
    - Updates anomaly record: sets `is_resolved = true`, `resolved_by = req.user.id`, `resolved_at = new Date()`, `resolution_notes = remarks`.
12. **Database Impact:** Updates 1 row in `attendance_anomalies`.
13. **Validation Rules (Joi):**
    - `id`: UUIDv4 format required.
    - `remarks`: String max 1000, nullable, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Anomaly resolved successfully"
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Malformed UUID.
    - `403 HIERARCHY_VIOLATION`: Employee does not report to manager.
    - `403 LOCKED_PERIOD`: Date is locked for payroll.
    - `404 NOT_FOUND`: Anomaly ID not found.
16. **Security / Authorization Behavior:** Strict hierarchy boundary enforcement.
17. **Idempotency and Retry Behavior:** Updating an already-resolved anomaly re-writes the resolution notes.
18. **Transactions / Concurrency Behavior:** Standard update.
19. **Side Effects:** Clears flag from manager dashboard and employee anomaly list.
20. **Important Edge Cases:** Anomaly resolution does not alter the physical punch coordinates in `attendance_logs`; it only clears the managerial flag.
21. **Related APIs / Dependencies:** `GET /team/anomalies`.
22. **What the API Gives / Does:** Dismisses the anomaly flag and stamps manager audit trail.

---

## 5. Get Pending Regularizations

1. **API Number and Name:** API 5 — Get Pending Regularizations
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/regularizations/pending`
4. **Purpose:** Returns all pending regularization requests submitted by subordinates awaiting manager review.
5. **Business Problem Solved:** Aggregates pending attendance corrections across the team into a single action queue.
6. **Why the API Exists:** Powers the manager's regularization approval inbox.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager reviews requests submitted by team members who forgot to clock out.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Calls `accessControl.getAccessibleUserIds()` to resolve team members.
    - Queries `attendance_regularization_requests` where `status = 'pending'` and `user_id IN (allowedUserIds)`.
    - Returns list of pending requests with employee profile context.
12. **Database Impact:** Read-only query on `attendance_regularization_requests`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Pending regularizations fetched",
        "data": [
          {
            "id": "7b8e192c-...",
            "user_id": "5a61d281-...",
            "record_id": "3d56cf8c-...",
            "date": "2026-09-12",
            "requested_clock_in": "2026-09-12T09:00:00.000Z",
            "requested_clock_out": "2026-09-12T18:00:00.000Z",
            "reason": "Forgot to clock out due to offsite deployment",
            "status": "pending",
            "user": {
              "id": "5a61d281-...",
              "profile": { "display_name": "Alex Miller" }
            }
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Scoped to manager's subordinates.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If employee cancelled their request, it automatically disappears from this list.
21. **Related APIs / Dependencies:** `POST /regularizations/:id/approve`, `POST /regularizations/:id/reject`.
22. **What the API Gives / Does:** Returns list of pending regularization requests awaiting manager decision.

---

## 6. Approve Regularization

1. **API Number and Name:** API 6 — Approve Regularization
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/regularizations/:id/approve`
4. **Purpose:** Formally approves an employee's regularization request, mutates the underlying attendance record with the corrected punches, and triggers automatic recalculation of effective hours and overtime.
5. **Business Problem Solved:** Automatically repairs attendance records, shifts absentees to present, and recalculates payroll hours upon manager approval.
6. **Why the API Exists:** Executes the approval side of the regularization workflow.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Team lead approves missed clock-out time after verifying with the employee.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required) — Request ID.
   - **Body (JSON):**
     ```json
     {
       "remarks": "Approved verified timesheet"
     }
     ```
10. **Field Meanings:** `remarks`: Optional review notes (max 1000 chars).
11. **Backend Processing Flow:**
    - Begins transaction.
    - Fetches request by `id` with row lock (`LOCK.UPDATE`). Throws `404 NOT_FOUND` if missing.
    - Asserts request belongs to org and user is within manager's hierarchy (`403 HIERARCHY_VIOLATION`).
    - Asserts `status === 'pending'` (`400 ALREADY_PROCESSED`).
    - Enforces lock periods: checks `lockService.checkLock(request.date)`. Throws `403 LOCKED_PERIOD` if locked.
    - Updates request: sets `status = 'approved'`, `reviewed_by = req.user.id`, `reviewed_at = new Date()`, `review_remarks = remarks`.
    - Updates or creates `attendance_records` row: sets `clock_in_time = requested_clock_in`, `clock_out_time = requested_clock_out`, `is_regularized = true`.
    - Executes `calcService.calculateRecord(record.id, transaction)`: recalculates effective hours, break deductions, and overtime.
    - Reconciles anomalies: clears any `missing_clock_out` anomalies for that date.
    - Commits transaction.
12. **Database Impact:**
    - `attendance_regularization_requests`: Updates status to `'approved'`.
    - `attendance_records`: Updates clock times, `effective_hours`, `status`, `is_regularized: true`.
    - `attendance_anomalies`: Updates matching anomalies to resolved.
13. **Validation Rules (Joi):**
    - `id`: UUIDv4 format required.
    - `remarks`: String max 1000, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Regularization approved",
        "data": {
          "id": "7b8e192c-...",
          "status": "approved"
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Request was already acted upon or cancelled.
    - `403 HIERARCHY_VIOLATION`: Target employee is outside manager's team.
    - `403 LOCKED_PERIOD`: Date belongs to a closed payroll cycle.
    - `404 NOT_FOUND`: Request ID does not exist.
16. **Security / Authorization Behavior:** Strict hierarchy boundary validation before any DB mutation.
17. **Idempotency and Retry Behavior:** Row-locked. Repeating the call throws `400 ALREADY_PROCESSED`.
18. **Transactions / Concurrency Behavior:** Enclosed in Sequelize transaction with pessimistic row lock.
19. **Side Effects:** Automatically recomputes daily effective hours and resolves open missing-punch anomalies.
20. **Important Edge Cases:** If approval occurs for a date previously flagged as `absent`, recalculation switches the record to `present` or `half_day`.
21. **Related APIs / Dependencies:** `GET /regularizations/pending`, `POST /regularizations/:id/reject`.
22. **What the API Gives / Does:** Approves request, mutates attendance record, and recomputes payroll hours.

---

## 7. Reject Regularization

1. **API Number and Name:** API 7 — Reject Regularization
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/regularizations/:id/reject`
4. **Purpose:** Rejects an employee's attendance regularization request without modifying the original attendance record.
5. **Business Problem Solved:** Provides formal rejection of unverified or disputed punch claims with audit notes.
6. **Why the API Exists:** Closes out rejected regularization requests.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager rejects a regularization claim where an employee claims to have worked but physical badge access logs contradict it.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required).
   - **Body (JSON):**
     ```json
     {
       "remarks": "Security badge records show departure at 15:00, not 18:00"
     }
     ```
10. **Field Meanings:** `remarks`: Mandatory or optional review notes.
11. **Backend Processing Flow:**
    - Begins transaction.
    - Fetches request by `id` with pessimistic row lock (`LOCK.UPDATE`).
    - Asserts hierarchy access: `allowedUserIds.includes(request.user_id)`.
    - Asserts `request.status === 'pending'`.
    - Checks payroll lock: `lockService.checkLock()`.
    - Updates request: sets `status = 'rejected'`, `reviewed_by = req.user.id`, `reviewed_at = new Date()`, `review_remarks = remarks`.
    - Commits transaction. (Attendance record is left unchanged).
12. **Database Impact:** Updates 1 row in `attendance_regularization_requests` (`status: 'rejected'`).
13. **Validation Rules (Joi):** `id`: UUIDv4 required. `remarks`: String max 1000, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Regularization rejected"
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Request is no longer pending.
    - `403 HIERARCHY_VIOLATION`: Employee not in manager's line.
    - `403 LOCKED_PERIOD`: Date is locked.
    - `404 NOT_FOUND`: Request not found.
16. **Security / Authorization Behavior:** Hierarchy scoped.
17. **Idempotency and Retry Behavior:** Second invocation fails with `400 ALREADY_PROCESSED`.
18. **Transactions / Concurrency Behavior:** Enclosed in a transaction with row lock.
19. **Side Effects:** Removes item from pending queue. Original record remains as originally punched.
20. **Important Edge Cases:** Rejected regularization leaves any existing anomalies intact.
21. **Related APIs / Dependencies:** `POST /regularizations/:id/approve`.
22. **What the API Gives / Does:** Rejects the correction request and records reviewer feedback.

---

## 8. Get Pending Overtime Requests

1. **API Number and Name:** API 8 — Get Pending Overtime
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/overtime/pending`
4. **Purpose:** Returns all pending overtime approval requests submitted by subordinates reporting to the manager.
5. **Business Problem Solved:** Enables managers to review extra hours before they flow into payroll wage calculations.
6. **Why the API Exists:** Provides the overtime approval inbox.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager audits weekend work and approves overtime pay.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Resolves accessible subordinates via `accessControl.getAccessibleUserIds()`.
    - Queries `attendance_overtime` where `status = 'pending'` and `user_id IN (allowedUserIds)`.
    - Returns array of pending overtime rows.
12. **Database Impact:** Read-only query on `attendance_overtime`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Pending overtime fetched",
        "data": [
          {
            "id": "3b29c18d-...",
            "user_id": "5a61d281-...",
            "record_id": "3d56cf8c-...",
            "date": "2026-09-11",
            "duration_minutes": 120,
            "status": "pending",
            "user": {
              "id": "5a61d281-...",
              "profile": { "display_name": "Alex Miller" }
            }
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Scoped to manager's subordinates.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Returns empty list if no pending overtime records exist.
21. **Related APIs / Dependencies:** `POST /overtime/:id/approve`, `POST /overtime/:id/reject`.
22. **What the API Gives / Does:** Lists pending overtime items for team subordinates.

---

## 9. Approve Overtime

1. **API Number and Name:** API 9 — Approve Overtime
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/overtime/:id/approve`
4. **Purpose:** Approves a subordinate's overtime record, qualifying the extra hours for payroll processing.
5. **Business Problem Solved:** Authorizes overtime pay or compensation credits.
6. **Why the API Exists:** Managerial authorization gate for overtime.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager confirms employee was requested to stay late for urgent release.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required) — Overtime record ID.
   - **Body (JSON):**
     ```json
     {
       "remarks": "Approved urgent client escalation support"
     }
     ```
10. **Field Meanings:** `remarks`: Optional review notes.
11. **Backend Processing Flow:**
    - Begins transaction.
    - Fetches overtime record with row lock (`LOCK.UPDATE`).
    - Verifies hierarchy: `allowedUserIds.includes(overtime.user_id)`.
    - Asserts `overtime.status === 'pending'`.
    - Checks payroll lock: `lockService.checkLock(orgId, overtime.date)`.
    - Updates overtime record: sets `status = 'approved'`, `approved_by = req.user.id`, `approved_at = new Date()`, `remarks = remarks`.
    - Commits transaction.
12. **Database Impact:** Updates 1 row in `attendance_overtime` (`status: 'approved'`).
13. **Validation Rules (Joi):** `id`: UUIDv4. `remarks`: String max 1000, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Overtime approved"
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Overtime already approved or rejected.
    - `403 HIERARCHY_VIOLATION`: Employee not in manager's line.
    - `403 LOCKED_PERIOD`: Date locked for payroll.
    - `404 NOT_FOUND`: Overtime record not found.
16. **Security / Authorization Behavior:** Enforces hierarchy boundary checks.
17. **Idempotency and Retry Behavior:** Fails with `400 ALREADY_PROCESSED` on duplicate invocation.
18. **Transactions / Concurrency Behavior:** Row-locked inside Sequelize transaction.
19. **Side Effects:** Qualifies overtime hours for inclusion in payroll run items.
20. **Important Edge Cases:** Rejection does not subtract hours from `effective_hours`; it only denies overtime pay multiplier.
21. **Related APIs / Dependencies:** Payroll Module, `POST /overtime/:id/reject`.
22. **What the API Gives / Does:** Approves overtime record and stamps managerial sign-off.

---

## 10. Reject Overtime

1. **API Number and Name:** API 10 — Reject Overtime
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/overtime/:id/reject`
4. **Purpose:** Rejects a subordinate's overtime request, disqualifying the extra hours from overtime payout.
5. **Business Problem Solved:** Prevents unapproved overtime from inflating payroll costs.
6. **Why the API Exists:** Closes out unapproved overtime claims.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Employee stayed late for personal reasons without manager approval; manager rejects overtime.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required).
   - **Body (JSON):**
     ```json
     {
       "remarks": "Overtime was not pre-authorized by department lead"
     }
     ```
10. **Field Meanings:** `remarks`: Optional review notes.
11. **Backend Processing Flow:**
    - Starts transaction.
    - Fetches overtime record with row lock.
    - Checks hierarchy access and asserts `status === 'pending'`.
    - Checks payroll lock period.
    - Updates overtime record: sets `status = 'rejected'`, `approved_by = req.user.id`, `approved_at = new Date()`, `remarks = remarks`.
    - Commits transaction.
12. **Database Impact:** Updates 1 row in `attendance_overtime` (`status: 'rejected'`).
13. **Validation Rules (Joi):** `id`: UUIDv4. `remarks`: String max 1000, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Overtime rejected"
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Overtime not in pending status.
    - `403 HIERARCHY_VIOLATION`: Employee not in manager's line.
    - `404 NOT_FOUND`: Overtime record not found.
16. **Security / Authorization Behavior:** Hierarchy scoped.
17. **Idempotency and Retry Behavior:** Repeat calls return `400 ALREADY_PROCESSED`.
18. **Transactions / Concurrency Behavior:** Pessimistic row locking inside transaction.
19. **Side Effects:** Removes item from pending queue.
20. **Important Edge Cases:** Regular attendance record hours are unaffected.
21. **Related APIs / Dependencies:** `POST /overtime/:id/approve`.
22. **What the API Gives / Does:** Rejects overtime record and logs manager explanation.

---

## 11. Get Pending Comp-Offs

1. **API Number and Name:** API 11 — Get Pending Comp-Offs
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/comp-offs/pending`
4. **Purpose:** Returns all compensatory-off credit requests in `earned` status submitted by subordinates awaiting manager approval.
5. **Business Problem Solved:** Enables managers to review holiday and weekly-off work credits before they convert into redeemable leave balances.
6. **Why the API Exists:** Provides the manager's comp-off approval queue.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager reviews employees who worked during a national holiday and approves their compensatory leave credit.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters / Body:** None.
10. **Field Meanings:** None.
11. **Backend Processing Flow:**
    - Resolves accessible subordinates via `accessControl.getAccessibleUserIds()`.
    - Queries `attendance_comp_offs` where `status = 'earned'` and `user_id IN (allowedUserIds)`.
    - Eager-loads employee profiles and returns pending list.
12. **Database Impact:** Read-only query on `attendance_comp_offs`.
13. **Validation Rules:** None.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Pending comp offs fetched",
        "data": [
          {
            "id": "9b1284c1-...",
            "user_id": "5a61d281-...",
            "earned_date": "2026-08-15",
            "worked_type": "holiday",
            "worked_hours": "8.00",
            "status": "earned",
            "expiry_date": "2026-11-15",
            "user": {
              "id": "5a61d281-...",
              "profile": { "display_name": "Alex Miller" }
            }
          }
        ]
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `401 UNAUTHORIZED`.
16. **Security / Authorization Behavior:** Scoped to manager's subordinates.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Only records in `earned` status are surfaced for manager action.
21. **Related APIs / Dependencies:** `POST /comp-offs/:id/approve`, `POST /comp-offs/:id/reject`.
22. **What the API Gives / Does:** Lists pending compensatory-off claims for team members.

---

## 12. Approve Comp-Off

1. **API Number and Name:** API 12 — Approve Comp-Off
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/comp-offs/:id/approve`
4. **Purpose:** Approves a subordinate's compensatory-off request, transitions status from `earned` to `approved`, and atomically credits a compensatory day into the Leave Module's leave balance ledger.
5. **Business Problem Solved:** Bridges attendance and leave management, ensuring compensatory time off earned by working on rest days is automatically deposited into the employee's leave wallet.
6. **Why the API Exists:** Executes the managerial bridge from earned attendance credit to usable leave balance.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager approves weekend work comp-off; employee immediately sees +1 day in their Compensatory Leave balance.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required) — Comp-off ID.
   - **Body (JSON):**
     ```json
     {
       "remarks": "Approved verified weekend support"
     }
     ```
10. **Field Meanings:** `remarks`: Optional review notes.
11. **Backend Processing Flow:**
    - Pre-checks comp-off record by `id`. Verifies org match.
    - Verifies hierarchy: asserts `compOff.user_id` is within `allowedUserIds`. Throws `403 HIERARCHY_VIOLATION` if outside.
    - Verifies lock period: asserts `compOff.earned_date` is not in a locked period.
    - Starts Sequelize transaction.
    - Fetches comp-off with pessimistic row lock (`LOCK.UPDATE`). Asserts `status === 'earned'`.
    - Updates comp-off: sets `status = 'approved'`, `approved_by = req.user.id`, `approved_at = new Date()`, `remarks = remarks`.
    - Comp-Off Earn Bridge to Leave Module:
      - Locates Compensatory Off leave type (`code: 'CO'` or `'COMP_OFF'`) for the organization.
      - If found: finds or initializes employee's `leave_balances` row for the current year.
      - Increments `total_accrued` and `current_balance` by 1 day inside the same transaction.
    - Commits transaction.
12. **Database Impact:**
    - `attendance_comp_offs`: Updates status to `'approved'`.
    - `leave_balances`: Increments `total_accrued` and `current_balance` by +1.00.
13. **Validation Rules (Joi):** `id`: UUIDv4. `remarks`: String max 1000, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Comp off approved"
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Comp-off already approved or rejected.
    - `403 HIERARCHY_VIOLATION`: Subordinate is outside manager's line.
    - `403 LOCKED_PERIOD`: Earned date is locked.
    - `404 COMP_OFF_NOT_FOUND`: Comp-off ID not found.
16. **Security / Authorization Behavior:** Hierarchy strictly enforced.
17. **Idempotency and Retry Behavior:** Row-locked. Repeating the call fails with `400 ALREADY_PROCESSED`.
18. **Transactions / Concurrency Behavior:** Atomic transaction wrapping the comp-off update and the leave balance ledger increment.
19. **Side Effects:** Credits employee leave wallet in the Leave Module.
20. **Important Edge Cases:** If the organization has not configured a Compensatory Off leave type in the Leave Module, the approval succeeds without throwing an error, but logs a warning.
21. **Related APIs / Dependencies:** Leave Module `leave_balances`, `POST /comp-offs/:id/reject`.
22. **What the API Gives / Does:** Approves comp-off and credits employee leave wallet.

---

## 13. Reject Comp-Off

1. **API Number and Name:** API 13 — Reject Comp-Off
2. **HTTP Method:** `POST`
3. **Endpoint:** `/api/v1/attendance/manager/comp-offs/:id/reject`
4. **Purpose:** Rejects a subordinate's compensatory-off claim, marking status as `rejected` without crediting leave balances.
5. **Business Problem Solved:** Closes unverified or unauthorized compensatory time-off requests.
6. **Why the API Exists:** Completes maker-checker flow for comp-off claims.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Employee claimed comp-off for working 2 hours on a holiday, but policy requires 4 hours minimum; manager rejects.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `id` (UUIDv4, Required).
   - **Body (JSON):**
     ```json
     {
       "remarks": "Did not meet policy minimum 4 hours threshold"
     }
     ```
10. **Field Meanings:** `remarks`: Optional review notes.
11. **Backend Processing Flow:**
    - Starts transaction.
    - Fetches comp-off record with row lock.
    - Asserts hierarchy permission and asserts `status === 'earned'`.
    - Checks payroll lock period.
    - Updates comp-off: sets `status = 'rejected'`, `approved_by = req.user.id`, `approved_at = new Date()`, `remarks = remarks`.
    - Commits transaction. (Leave balances are not modified).
12. **Database Impact:** Updates 1 row in `attendance_comp_offs` (`status: 'rejected'`).
13. **Validation Rules (Joi):** `id`: UUIDv4. `remarks`: String max 1000, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Comp off rejected"
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 ALREADY_PROCESSED`: Comp-off is not in `earned` status.
    - `403 HIERARCHY_VIOLATION`: Employee not in manager's line.
    - `404 COMP_OFF_NOT_FOUND`: Record not found.
16. **Security / Authorization Behavior:** Hierarchy scoped.
17. **Idempotency and Retry Behavior:** Subsequent attempts return `400 ALREADY_PROCESSED`.
18. **Transactions / Concurrency Behavior:** Enclosed in Sequelize transaction with row lock.
19. **Side Effects:** Removes item from pending queue.
20. **Important Edge Cases:** Rejected comp-off cannot be used for leave redemption.
21. **Related APIs / Dependencies:** `POST /comp-offs/:id/approve`.
22. **What the API Gives / Does:** Rejects comp-off claim and records manager explanation.

---

## 14. Get Team Summary

1. **API Number and Name:** API 14 — Get Team Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/summary`
4. **Purpose:** Generates comprehensive aggregated attendance statistics and per-member breakdown for the entire team on a specific date.
5. **Business Problem Solved:** Provides team attendance percentages, aggregate counts (present, absent, late, on-leave), and individual status rows in a single payload.
6. **Why the API Exists:** Primary backend query for the team attendance summary table.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager reviews daily team presence numbers and checks who is absent or late today.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `date` (ISO Date, Optional, defaults to today in `Asia/Kolkata`).
10. **Field Meanings:** Target date to summarize.
11. **Backend Processing Flow:**
    - Normalizes `targetDate` in `Asia/Kolkata`.
    - Resolves accessible team members via `accessControl.getAccessibleUserIds()`.
    - Fetches all team member profiles and attendance records for `targetDate`.
    - For members without records, resolves virtual status (`holiday`, `weekly_off`, `absent`, or `not_marked` before joining date).
    - Aggregates counters: `present`, `absent`, `half_day`, `late`, `on_leave`, `holiday`, `weekly_off`, `in_progress`.
    - Computes `attendance_percentage = (finalPresentCount / totalWorkingExpected) * 100`.
    - Returns summary totals and detailed member roster.
12. **Database Impact:** Read-only queries on `attendance_records`, `user_reporting_mappings`, `user_profiles`.
13. **Validation Rules (Joi):** `date`: `Joi.date().iso().optional()`.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Team summary fetched",
        "data": {
          "date": "2026-09-13",
          "team_size": 10,
          "counts": {
            "present": 8,
            "absent": 1,
            "half_day": 0,
            "late": 1,
            "on_leave": 1,
            "not_marked": 0,
            "holiday": 0,
            "weekly_off": 0,
            "in_progress": 0
          },
          "attendance_percentage": 88.89,
          "final_present_count": 8,
          "final_absent_count": 1,
          "members": [
            {
              "user_id": "5a61d281-...",
              "name": "Alex Miller",
              "employee_code": "EMP-001",
              "department": "Engineering",
              "designation": "Backend Engineer",
              "avatar_url": null,
              "status": "present",
              "clock_in_time": "2026-09-13T09:00:00.000Z",
              "clock_out_time": "2026-09-13T18:00:00.000Z",
              "effective_hours": 8.0,
              "worked_duration_formatted": "8h 0m",
              "late_minutes": 0,
              "work_mode": "office"
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid date format.
16. **Security / Authorization Behavior:** Restricted to caller's team.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** If everyone is on scheduled leave/holiday/weekly-off (`totalWorkingExpected === 0`), `attendance_percentage` returns `100` rather than `NaN`.
21. **Related APIs / Dependencies:** `GET /team/today`, `GET /team/graph-data`.
22. **What the API Gives / Does:** Delivers team attendance KPI counters and employee breakdown for a date.

---

## 15. Get Team Member Attendance History

1. **API Number and Name:** API 15 — Get Team Member History
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/member/:userId/history`
4. **Purpose:** Returns paginated historical attendance records for a specific subordinate, filterable by date range (`from` and `to`).
5. **Business Problem Solved:** Enables managers to deep-dive into an individual subordinate's historical attendance without viewing other team members.
6. **Why the API Exists:** Powers the individual employee attendance history view on the manager portal.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager reviews a direct report's past 30 days of attendance during a 1-on-1 performance review.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `userId` (UUIDv4, Required) — Subordinate's user ID.
   - **Query Parameters:**
     - `from`: ISO Date (Optional).
     - `to`: ISO Date (Optional).
     - `page`: Integer min 1, default 1 (Optional).
     - `limit`: Integer 1–100, default 20 (Optional).
10. **Field Meanings:** Target member ID, date range, and pagination parameters.
11. **Backend Processing Flow:**
    - Asserts `userId` belongs to manager's accessible team (`403 EMPLOYEE_NOT_IN_TEAM`).
    - Verifies user exists in org (`404 EMPLOYEE_NOT_FOUND`).
    - Queries `recordRepository.findHistoryPaginated()` for `memberId` across `[from, to]`.
    - Formats member profile and maps records.
    - Returns member header, pagination object (`total_pages`), and record array.
12. **Database Impact:** Read-only query on `attendance_records` and `user_profiles`.
13. **Validation Rules (Joi):**
    - `userId`: UUIDv4 format required.
    - `from`, `to`: ISO Date, optional.
    - `page`: Integer min 1.
    - `limit`: Integer min 1, max 100.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Member history fetched",
        "data": {
          "member": {
            "user_id": "5a61d281-...",
            "name": "Alex Miller",
            "employee_code": "EMP-001",
            "department": "Engineering",
            "designation": "Backend Engineer",
            "avatar_url": null
          },
          "pagination": {
            "total": 15,
            "page": 1,
            "limit": 20,
            "total_pages": 1
          },
          "records": [
            {
              "id": "3d56cf8c-...",
              "date": "2026-09-12",
              "status": "present",
              "clock_in_time": "2026-09-12T09:00:00.000Z",
              "clock_out_time": "2026-09-12T18:00:00.000Z",
              "effective_hours": 8.0,
              "worked_duration_formatted": "8h 0m",
              "late_minutes": 0,
              "overtime_minutes": 0,
              "work_mode": "office",
              "is_regularized": false,
              "shift": { "name": "General Shift" }
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 BAD_REQUEST`: Invalid UUID or query parameters.
    - `403 EMPLOYEE_NOT_IN_TEAM`: Targeted user is not in manager's reporting line.
    - `404 EMPLOYEE_NOT_FOUND`: Target user ID does not exist.
16. **Security / Authorization Behavior:** Prevents IDOR/BOLA attacks by validating reporting line before executing the database query.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Notice the pagination key: this endpoint returns `total_pages` (snake_case) matching the manager read convention.
21. **Related APIs / Dependencies:** `GET /team/member/:userId/summary`.
22. **What the API Gives / Does:** Returns paginated historical attendance for a specific direct report.

---

## 16. Get Team Member Attendance Summary

1. **API Number and Name:** API 16 — Get Team Member Summary
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/member/:userId/summary`
4. **Purpose:** Calculates aggregated monthly attendance summary metrics (present, absent, half days, total hours, punctuality percentage) for a designated subordinate.
5. **Business Problem Solved:** Provides monthly KPI overview for a specific employee during manager appraisals.
6. **Why the API Exists:** Provides individual member summary metrics.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager checks monthly attendance statistics for an individual team member.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `userId` (UUIDv4, Required).
   - **Query Parameters:** `month` (1–12, Optional), `year` (2000–2100, Optional).
10. **Field Meanings:** Target member ID, month, and year. Defaults to current month/year.
11. **Backend Processing Flow:**
    - Validates hierarchy: asserts `userId` is in manager's reporting line (`403 EMPLOYEE_NOT_IN_TEAM`).
    - Verifies user exists.
    - Reuses `userAttendanceReadService.getGraphData()` for the target member.
    - Extracts and returns `summary` KPIs.
12. **Database Impact:** Read-only query on `attendance_records` and `shift_templates`.
13. **Validation Rules (Joi):**
    - `userId`: UUIDv4 format.
    - `month`: Integer 1–12, optional.
    - `year`: Integer 2000–2100, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Member summary fetched",
        "data": {
          "user_id": "5a61d281-...",
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
          }
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `403 EMPLOYEE_NOT_IN_TEAM`: Target user not subordinate to manager.
    - `404 EMPLOYEE_NOT_FOUND`: Target user not found.
16. **Security / Authorization Behavior:** Hierarchy enforced.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Accurately reflects leaves and weekly-offs for the specific member.
21. **Related APIs / Dependencies:** `GET /team/member/:userId/history`.
22. **What the API Gives / Does:** Summarizes monthly attendance performance for a designated team member.

---

## 17. Get Team Member Daily Log

1. **API Number and Name:** API 17 — Get Team Member Daily Log
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/member/:userId/daily-log`
4. **Purpose:** Returns the enriched single-day attendance log for one subordinate — shift, break-by-break detail, every clock session, and the derived minute counters (late, early exit, overtime).
5. **Business Problem Solved:** A manager investigating one bad day ("why is Asha marked half-day on the 23rd?") previously had to ask HR, because only the HR plane could open a single day in full detail. The team history endpoint returns per-day rows but not the session/break breakdown that explains them.
6. **Why the API Exists:** Manager-plane counterpart of `GET /api/v1/attendance/hr/employees/:userId/daily-log`. Added 24 September 2026.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Manager clicks a day in the team history table and drills into it before approving a regularization.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Path Parameters:** `userId` (UUIDv4, Required).
   - **Query Parameters:** `date` (ISO `YYYY-MM-DD`, Optional — defaults to today in IST).
10. **Field Meanings:** Target member ID and the single day to render.
11. **Backend Processing Flow:**
    - Validates hierarchy first: `accessControl.getAccessibleUserIds(orgId, requester)` — a `manager` gets the explicit list of their reports and anything outside it is `403 EMPLOYEE_NOT_IN_TEAM`; an org-wide approver (HR) gets `null`, meaning no restriction.
    - Delegates to `hrAttendanceReadService.getHrMemberDailyLog()`, which resolves the profile (org-scoped, so a cross-tenant id is `404`), loads the record with its shift, breaks and sessions, and derives a status when no record exists.
    - The day is rendered by the **same** service method as the HR endpoint, so the two planes can never disagree about the same date.
12. **Database Impact:** Read-only. `user_reporting_mappings` (scope), `users`/`user_profiles`, `attendance_records` with `shift_templates`, `attendance_breaks`, `attendance_sessions`; on a no-record day also holiday/weekly-off resolution.
13. **Validation Rules (Joi):**
    - `userId`: UUIDv4 format (malformed → `400`, never a `500`).
    - `date`: ISO date, optional; coerced to a Date and formatted `YYYY-MM-DD`, identically to the HR endpoint. Unknown query keys are silently dropped (`stripUnknown: true`), not rejected.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Member daily log fetched",
        "data": {
          "member": {
            "user_id": "489f9cd6-...",
            "name": "Asha Rao",
            "employee_code": "EMP-0142",
            "department": "Engineering",
            "designation": "Analyst",
            "avatar_url": null
          },
          "id": "1b7e5f30-...",
          "date": "2026-09-23",
          "status": "present",
          "clock_in_time": "2026-09-23T03:32:10.000Z",
          "clock_out_time": "2026-09-23T12:41:55.000Z",
          "effective_hours": 8.42,
          "late_minutes": 2,
          "early_exit_minutes": 0,
          "overtime_minutes": 0,
          "break_duration_minutes": 35,
          "work_mode": "on-site",
          "is_regularized": false,
          "shift": { "name": "General", "start_time": "09:30:00", "end_time": "18:30:00", "type": "fixed" },
          "breaks": [
            { "start_time": "2026-09-23T07:30:00.000Z", "end_time": "2026-09-23T08:05:00.000Z", "duration_minutes": 35 }
          ],
          "sessions": [
            { "opened_at": "2026-09-23T03:32:10.000Z", "closed_at": "2026-09-23T12:41:55.000Z", "status": "closed" }
          ]
        }
      }
      ```
    - **No record for that day:** the same envelope with `id` **absent**, a derived `status` (`holiday`, `weekly_off`, `absent` for a past date that should have been marked, or `not_marked` for today / a date before the joining date), all counters `0`, and `shift: null`, `breaks: []`, `sessions: []`.
15. **Error Scenarios, Status Codes, and Error Codes:**
    - `400 VALIDATION_ERROR`: malformed `userId` or `date`.
    - `403 EMPLOYEE_NOT_IN_TEAM`: target user is not subordinate to the manager.
    - `404 EMPLOYEE_NOT_FOUND`: target user not in this organization (including cross-tenant ids).
16. **Security / Authorization Behavior:** Hierarchy enforced **before** the record is read, so the endpoint cannot be used to probe whether a day exists for someone outside the team. `getAccessibleUserIds` returning `null` means org-wide and is never treated as an empty list.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** A day the employee never marked still returns `200` with a derived status rather than a `404` — the absence of a record is itself the answer. Dates before the employee's joining date are `not_marked`, not `absent`.
21. **Related APIs / Dependencies:** `GET /team/member/:userId/history`, `GET /team/member/:userId/summary`, and the HR-plane `GET /api/v1/attendance/hr/employees/:userId/daily-log` (identical payload).
22. **What the API Gives / Does:** Renders one subordinate's single day in full detail, scoped to the manager's own team.

---

## 18. Get Team Graph Data

1. **API Number and Name:** API 18 — Get Team Graph Data
2. **HTTP Method:** `GET`
3. **Endpoint:** `/api/v1/attendance/manager/team/graph-data`
4. **Purpose:** Generates day-by-day time-series data points across a calendar month aggregated across the entire team for attendance trend chart rendering.
5. **Business Problem Solved:** Powers team-wide attendance curve charts, showing daily presence counts, absentees, and worked hours.
6. **Why the API Exists:** Provides team-level time-series charting data.
7. **Allowed Roles and Permissions:** `manager`, `hr`, `admin`, `super-admin`. Requires `attendance.access`.
8. **Real-World Usage:** Displayed on the Manager Dashboard to visualize team attendance trends across the month.
9. **Request Parameters and Payload:**
   - **Headers:** `Authorization: Bearer <jwt>`
   - **Query Parameters:** `month` (1–12, Optional), `year` (2000–2100, Optional).
10. **Field Meanings:** Month and year selector.
11. **Backend Processing Flow:**
    - Resolves accessible subordinates via `accessControl.getAccessibleUserIds()`.
    - Queries all attendance records for `allowedUserIds` in the month date range.
    - Groups records by date.
    - Loops days 1 through `daysInMonth`, aggregating team-wide counts for each day (present, half-day, absent, late, average effective hours).
    - Assembles `daily` array and `team_summary` totals.
12. **Database Impact:** Read-only query on `attendance_records` and `user_reporting_mappings`.
13. **Validation Rules (Joi):**
    - `month`: Integer min 1, max 12, optional.
    - `year`: Integer min 2000, max 2100, optional.
14. **Success Response and Field Meanings:**
    - **Status:** `200 OK`
    - **Payload:**
      ```json
      {
        "success": true,
        "message": "Team graph data fetched",
        "data": {
          "month": 9,
          "year": 2026,
          "team_summary": {
            "team_size": 10,
            "total_working_days": 22,
            "average_daily_present": 9.2,
            "overall_punctuality": 94.0
          },
          "daily": [
            {
              "date": "2026-09-01",
              "day_of_week": "Tuesday",
              "present_count": 9,
              "absent_count": 0,
              "half_day_count": 1,
              "late_count": 1,
              "average_hours": 8.1
            }
          ]
        }
      }
      ```
15. **Error Scenarios, Status Codes, and Error Codes:** `400 BAD_REQUEST` on invalid month/year.
16. **Security / Authorization Behavior:** Scoped to manager's team.
17. **Idempotency and Retry Behavior:** Strictly idempotent read.
18. **Transactions / Concurrency Behavior:** None.
19. **Side Effects:** None.
20. **Important Edge Cases:** Handles future calendar days gracefully with zero counts.
21. **Related APIs / Dependencies:** `GET /team/summary`.
22. **What the API Gives / Does:** Provides contiguous daily team time-series data for chart rendering.

---

## Field Locations & Field Assignments (added 2026-10-05)

Eight endpoints for Work Mode enforcement and multi-site field geofencing were added to this
router under `/api/v1/attendance/manager`:

| Method | Endpoint | Purpose |
| :-- | :-- | :-- |
| `POST` | `/field-locations` | Register a client site / project facility |
| `GET` | `/field-locations` | List and search sites (paginated) |
| `GET` | `/field-locations/:id` | One site plus who is assigned to it |
| `PUT` | `/field-locations/:id` | Edit a site |
| `DELETE` | `/field-locations/:id` | Retire a site (soft delete, cascades to assignments) |
| `POST` | `/field-assignments` | Assign an employee to a site |
| `DELETE` | `/field-assignments/:assignment_id` | Unassign |
| `GET` | `/field-assignments/user/:user_id` | A user's active assignments |

They are mounted identically on the HR and Manager routers with identical payloads; only the
authorization scope differs. **Creation is org-wide** (a registered site is visible to every manager
and HR, so client sites are reused rather than duplicated), while **editing or retiring** a site is
limited to an HR admin or the manager who created it, and **assignment** is hierarchy-scoped:
org-wide for HR, **direct reports only** for a manager (one level, not a recursive tree), and never
to themselves.

Full request/response contracts, validation rules, error codes, the work-mode decision matrix and
the frontend implementation checklist:
**`public/md_attendance/7_work_mode_and_field_geofencing_api.md`**.

Related behaviour changes on this router: approving a regularization now also resolves that day's
geofence anomalies and returns `geofence_anomalies_resolved`; `missing_coordinates` anomalies were
upgraded from `medium` to `high`; and two anomaly types were added
(`geofence_unresolved`, `work_mode_claim_mismatch`).

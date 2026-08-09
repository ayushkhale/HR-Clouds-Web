# Phase 3 Analysis: Core Clock In/Out

## What's Already Built (Phases 1 & 2) ✅

| Layer | Status | Details |
|-------|--------|---------|
| **21 Sequelize Models** | ✅ Done | All tables from the schema (policies, shifts, logs, records, sessions, breaks, anomalies, etc.) |
| **21 Repositories** | ✅ Done | Basic CRUD (`findById`, `findAll`, `create`, `updateById`, `deleteById`) for every table |
| **Phase 2 Services** | ✅ Done | `policy.service.js`, `shift.service.js`, `rotation.service.js`, `holiday.service.js`, `weekly_off.service.js` |
| **HR Controller** | ✅ Done | [hr_attendance.controller.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/attendance/controllers/hr_attendance.controller.js) — Policies, Shifts, Holidays, Weekly Offs, Rotations CRUD |
| **HR Routes** | ✅ Done | [hr_attendance.routes.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/attendance/routes/hr_attendance.routes.js) — All Phase 2 endpoints mounted |
| **HR Validator** | ✅ Done | [hr_attendance.validator.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/attendance/validators/hr_attendance.validator.js) — Joi schemas for all HR operations |
| **Module Entry** | ✅ Partial | [attendance.index.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/attendance/attendance.index.js) — Only HR routes mounted |

---

## What Phase 3 Builds 🎯

Phase 3 is the **operational heart** of the attendance module. It's what employees interact with daily:

### New Files to Create

| File | Purpose |
|------|---------|
| `services/clock.service.js` | Clock In, Clock Out, Break Start, Break End — the core 4 operations |
| `services/attendance_calculation.service.js` | Post-punch computation engine — the brains |
| `services/anomaly.service.js` | Anomaly detection during/after calculation |
| `controllers/employee_attendance.controller.js` | Employee-facing controller (6 handlers) |
| `routes/employee_attendance.routes.js` | Employee endpoint routing |
| `validators/employee_attendance.validator.js` | Joi validation schemas for employee inputs |

### Files to Modify

| File | Change |
|------|--------|
| `attendance.index.js` | Mount `employee_attendance.routes.js` on `/api/v1/attendance` |

---

## Deep Dive: The 4 Core Operations

### 1. Clock In (`POST /api/v1/attendance/clock-in`)

This is the most complex operation. Here's what happens inside a single **database transaction**:

```
Employee hits "Clock In"
    │
    ├─ 1. Validate: Is the user already clocked in today?
    │     → Query attendance_records WHERE user_id + org_id + date = today + status = 'in_progress'
    │     → If yes → 409 ALREADY_CLOCKED_IN
    │
    ├─ 2. Check: Is today's date in a locked payroll period?
    │     → Query attendance_lock_periods WHERE org_id + start_date ≤ today ≤ end_date
    │     → If yes → 423 ATTENDANCE_LOCKED
    │
    ├─ 3. Resolve the employee's active shift
    │     → Query employee_shift_assignments WHERE user_id + effective_from ≤ today ≤ effective_to
    │     → If direct shift_id → use that shift_template
    │     → If rotation_pattern_id → calculate rotation position from start_reference_date
    │     → Fallback: org default shift (if any)
    │
    ├─ 4. Resolve the attendance policy
    │     → Shift has policy_id? Use that.
    │     → Otherwise: org's default policy (is_default=true, is_active=true)
    │
    ├─ 5. Check: Is today a holiday? A weekly off?
    │     → Query attendance_holidays WHERE org_id + date = today + is_active = true
    │     → Query attendance_weekly_offs WHERE org_id + day_of_week matches + effective range
    │     → If holiday/weekly off, still allow clock-in (for comp-off), but note it
    │
    ├─ 6. Generate server-authoritative timestamp (NOW)
    │
    ├─ 7. Calculate late_minutes
    │     → late_minutes = max(0, clock_in_time - (shift.start_time + policy.grace_minutes))
    │     → within_grace = (clock_in_time - shift.start_time) ≤ policy.grace_minutes
    │
    ├─ 8. INSERT into attendance_logs (immutable, append-only)
    │     → type: 'clock_in', timestamp: server NOW, source, lat/lng, ip, client_timestamp, notes
    │
    ├─ 9. UPSERT into attendance_records
    │     → date: today, status: 'in_progress', clock_in_time: server NOW
    │     → shift_id, policy_id
    │     → shift_snapshot: JSON snapshot of shift rules (for payroll immutability)
    │     → policy_snapshot: JSON snapshot of policy rules
    │     → first_clock_in_log_id: the log from step 8
    │
    ├─ 10. INSERT into attendance_sessions
    │      → record_id, clock_in_log_id, opened_at: server NOW, status: 'open'
    │
    └─ 11. RETURN response with log_id, record_id, clock_in_time, shift info, late_minutes, within_grace
```

> **Key Concurrency Guard**: Step 1 uses `SELECT ... FOR UPDATE` on the attendance_records row to prevent race conditions from double-tap clock-in.

### 2. Clock Out (`POST /api/v1/attendance/clock-out`)

```
Employee hits "Clock Out"
    │
    ├─ 1. Validate: Is the user currently clocked in?
    │     → Query attendance_records WHERE user_id + org_id + date = today + status = 'in_progress'
    │     → SELECT ... FOR UPDATE (lock the row)
    │     → If no record → 400 NOT_CLOCKED_IN
    │
    ├─ 2. Check: Active break? Auto-end it.
    │     → Query attendance_breaks WHERE record_id + end_time IS NULL
    │     → If found → auto-close: set end_time = NOW, compute duration_minutes
    │     → INSERT attendance_logs type: 'break_end' (system-generated)
    │
    ├─ 3. Generate server-authoritative timestamp
    │
    ├─ 4. INSERT into attendance_logs
    │     → type: 'clock_out', timestamp: server NOW
    │
    ├─ 5. Close the open attendance_session
    │     → UPDATE: clock_out_log_id, closed_at: server NOW, status: 'closed'
    │
    ├─ 6. UPDATE attendance_records
    │     → clock_out_time: server NOW
    │     → last_clock_out_log_id: the log from step 4
    │
    ├─ 7. 🧮 TRIGGER CALCULATION ENGINE
    │     → attendance_calculation.service.js runs (see below)
    │     → Updates: total_hours, effective_hours, break_duration_minutes,
    │       late_minutes, early_exit_minutes, overtime_minutes, status
    │
    └─ 8. RETURN computed attendance summary
```

### 3. Break Start (`POST /api/v1/attendance/break/start`)

```
Employee hits "Start Break"
    │
    ├─ 1. Validate: Is user clocked in? (status = 'in_progress')
    │     → If not → 400 NOT_CLOCKED_IN
    │
    ├─ 2. Validate: Is there already an open break?
    │     → Query attendance_breaks WHERE record_id + end_time IS NULL
    │     → If yes → 400 BREAK_ALREADY_ACTIVE
    │
    ├─ 3. Validate policy limits:
    │     → max_breaks_per_day (if set): count breaks for today's record
    │     → If limit reached → 400 MAX_BREAKS_EXCEEDED
    │
    ├─ 4. INSERT attendance_logs (type: 'break_start')
    │
    ├─ 5. INSERT attendance_breaks
    │     → record_id, user_id, org_id, start_time: NOW, start_log_id
    │
    └─ 6. RETURN break info
```

### 4. Break End (`POST /api/v1/attendance/break/end`)

```
Employee hits "End Break"
    │
    ├─ 1. Validate: Is there an active open break?
    │     → Query attendance_breaks WHERE record_id + end_time IS NULL
    │     → If not → 400 NO_ACTIVE_BREAK
    │
    ├─ 2. INSERT attendance_logs (type: 'break_end')
    │
    ├─ 3. UPDATE attendance_breaks
    │     → end_time: NOW, duration_minutes: diff(NOW - start_time), end_log_id
    │
    ├─ 4. Check policy: max_break_duration_minutes
    │     → If exceeded → flag anomaly 'excessive_break'
    │
    └─ 5. RETURN updated break with duration
```

---

## The Calculation Engine (attendance_calculation.service.js)

This runs **synchronously after every clock-out**. It's the single most important piece of business logic:

```
Input: attendance_record (with clock_in_time, clock_out_time, org_id, user_id, date)

Step 1: Resolve shift_template
  → From the record's shift_id, or fallback to employee's assignment, or org default

Step 2: Resolve attendance_policy
  → Shift-level policy_id → org default policy

Step 3: Is today a holiday?  → If yes and no clock-in: status = 'holiday'
Step 4: Is today a weekly_off? → If yes and no clock-in: status = 'weekly_off'

Step 5: total_hours = (clock_out_time - clock_in_time) in decimal hours

Step 6: break_duration_minutes = SUM(duration_minutes) from attendance_breaks for this record

Step 7: effective_hours = total_hours - (break_duration_minutes / 60)

Step 8: late_minutes = max(0, clock_in_time - (shift.start_time + policy.grace_minutes))
  → Calculated relative to the shift's timezone

Step 9: early_exit_minutes = max(0, shift.end_time - clock_out_time)
  → Only counted if > policy.early_exit_threshold_minutes

Step 10: Determine STATUS:
  ┌──────────────────────────────────────────────────────────────┐
  │ IF effective_hours >= policy.full_day_min_hours → 'present'  │
  │ IF effective_hours >= policy.half_day_min_hours → 'half_day' │
  │ IF effective_hours > 0                         → 'half_day'  │
  │    (with anomaly flagged)                                    │
  │ IF no clock_in at all                          → 'absent'    │
  │ IF late_minutes > policy.late_threshold_minutes → 'half_day' │
  └──────────────────────────────────────────────────────────────┘

Step 11: Overtime (if policy.overtime_enabled):
  → overtime_minutes = max(0, (effective_hours - policy.full_day_min_hours) * 60)
  → Only counted if >= policy.overtime_min_minutes
  → Creates an attendance_overtime record (pending approval if required)

Step 12: Detect anomalies:
  → Missing clock_out                     → 'missing_clock_out'
  → GPS outside geofence                  → 'gps_mismatch'
  → Total break > max_break_duration      → 'excessive_break'

Step 13: UPDATE attendance_records with all computed fields
```

---

## Employee API Endpoints (Phase 3)

| Method | Endpoint | Handler | Description |
|--------|----------|---------|-------------|
| `POST` | `/clock-in` | `handlePostClockIn` | Punch in |
| `POST` | `/clock-out` | `handlePostClockOut` | Punch out + triggers calculation |
| `POST` | `/break/start` | `handlePostBreakStart` | Start a break |
| `POST` | `/break/end` | `handlePostBreakEnd` | End current break |
| `GET` | `/today` | `handleGetToday` | Today's real-time status |
| `GET` | `/history` | `handleGetHistory` | Paginated past attendance |
| `GET` | `/summary` | `handleGetSummary` | Monthly summary stats |
| `GET` | `/shift` | `handleGetMyShift` | My assigned shift + weekly offs |

**Auth stack**: `authenticate` → `authorize(['employee', 'manager', 'hr', 'admin', 'super-admin'])` → `requireSubscription()` → `requireFeature('attendance.access')`

---

## Critical Edge Cases to Handle

| Edge Case | Error Code | Resolution |
|-----------|------------|------------|
| Double clock-in | `409 ALREADY_CLOCKED_IN` | `SELECT ... FOR UPDATE` on `attendance_records` |
| Clock-out without clock-in | `400 NOT_CLOCKED_IN` | Check for `in_progress` record |
| Break without clock-in | `400 NOT_CLOCKED_IN` | Same check |
| Multiple active breaks | `400 BREAK_ALREADY_ACTIVE` | Check `attendance_breaks` where `end_time IS NULL` |
| Locked period | `423 ATTENDANCE_LOCKED` | Check `attendance_lock_periods` |
| Overnight shift | Business date = shift start date | `is_overnight` flag on shift template |

---

## Data Flow Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Employee   │────►│  clock.service   │────►│ attendance_logs │  (append-only)
│  (API call)  │     │   .js            │     │  (raw punch)    │
└──────────────┘     │                  │     └─────────────────┘
                     │  Clock In:       │     
                     │  1. Validate     │     ┌───────────────────┐
                     │  2. Create Log   │────►│ attendance_records│  (daily summary)
                     │  3. Create Record│     │  status='in_prog' │
                     │  4. Create Sess  │     └───────────────────┘
                     │                  │     
                     │  Clock Out:      │     ┌───────────────────┐
                     │  1. Validate     │────►│ attendance_sessions│  (work blocks)
                     │  2. Close Break  │     └───────────────────┘
                     │  3. Create Log   │     
                     │  4. Close Session│     ┌───────────────────┐
                     │  5. CALCULATE    │────►│ attendance_breaks │  (break tracking)
                     │     ▼            │     └───────────────────┘
                     │  calculation     │     
                     │  _service.js     │     ┌───────────────────┐
                     │  (compute all    │────►│ attendance_overtime│  (if OT detected)
                     │   derived fields)│     └───────────────────┘
                     │                  │     
                     │                  │     ┌───────────────────┐
                     │                  │────►│ attendance_anomalies│  (if issues found)
                     └──────────────────┘     └───────────────────┘
```

---

## Tables Touched by Phase 3

| Table | Read | Write | Purpose |
|-------|------|-------|---------|
| `attendance_records` | ✅ | ✅ | Core daily record (UPSERT on clock-in, UPDATE on clock-out) |
| `attendance_logs` | ✅ | ✅ | Every punch event (append-only INSERT) |
| `attendance_sessions` | ✅ | ✅ | Track open/closed work blocks |
| `attendance_breaks` | ✅ | ✅ | Track break periods |
| `attendance_policies` | ✅ | ❌ | Read policy rules for calculation |
| `shift_templates` | ✅ | ❌ | Read shift times for calculation |
| `employee_shift_assignments` | ✅ | ❌ | Resolve which shift an employee is on |
| `shift_rotation_patterns` | ✅ | ❌ | Resolve rotational shifts |
| `shift_rotation_entries` | ✅ | ❌ | Resolve rotational shift position |
| `attendance_holidays` | ✅ | ❌ | Check if today is a holiday |
| `attendance_weekly_offs` | ✅ | ❌ | Check if today is a weekly off |
| `attendance_lock_periods` | ✅ | ❌ | Enforce payroll locks |
| `attendance_overtime` | ❌ | ✅ | Created during calculation if OT detected |
| `attendance_anomalies` | ❌ | ✅ | Created during calculation if issues found |
| `attendance_calendar_exceptions` | ✅ | ❌ | Check for working-day overrides |

---

## Key Architectural Decisions

1. **Server-authoritative timestamps**: `clock_in_time` and `clock_out_time` are ALWAYS server `new Date()`. The client-sent `client_timestamp` is stored only for audit/comparison.

2. **Transaction isolation**: All 4 core operations run within a `sequelize.transaction()`. The attendance_record row is locked with `FOR UPDATE` to prevent concurrent double-punches.

3. **Immutable event log**: `attendance_logs` is append-only. Even if a record is corrected via regularization, the original log entries remain. New corrective entries are appended.

4. **Snapshot-based integrity**: On clock-in, the current shift rules and policy rules are snapshot as JSON into `shift_snapshot` and `policy_snapshot` on the attendance_record. This means if HR changes the policy tomorrow, today's record still calculates correctly against the rules that were in effect when the employee clocked in.

5. **Session model**: `attendance_sessions` explicitly tracks each clock-in → clock-out block. This supports split shifts (morning + evening) where an employee has multiple sessions in a single day, all linked to one `attendance_record`.

6. **Calculation is synchronous**: The calculation engine runs inline after clock-out (not deferred to a queue). This is simpler for MVP but the plan notes it can be moved to async later.

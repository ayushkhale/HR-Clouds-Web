# Attendance Module — Production Implementation Plan

**Version:** 1.2  
**Date:** 2026-07-30  
**Status:** Draft — Pending Approval (Reviewed & Updated with Architecture Recommendations)  

---

## 1. Overview

This document is the complete implementation blueprint for the Attendance module of the HRMS platform. It covers business rules, database schema, Sequelize models, repositories, services, controllers, routes, validators, background jobs, and integration points — all designed to follow the exact conventions established in the existing codebase (`auth`, `organization`, `billing` modules).

**Attendance is the foundational operational module.** Leave, Payroll, Overtime, Compliance, Reports, and Analytics will all depend on the data structures and services defined here.

### Build Dependency Chain

```
Attendance → Leave → Payroll
     ↓          ↓
  Reports   Compliance
     ↓
  Analytics
```

---

## 2. Core Principles

| Principle | Description |
|-----------|-------------|
| **Multi-tenant by design** | Every table has `org_id`. Every query is scoped to `req.user.orgId`. |
| **Policy-driven** | Grace time, late rules, half-day thresholds, overtime — all configurable per org via `attendance_policies`. Never hardcoded. |
| **RBAC + Entitlements** | Role-based access via `authorize()` middleware. Feature gating via `requireFeature('attendance.access')`. |
| **Backend authoritative** | Clock-in/out timestamps are server-generated. Client timestamps are metadata only. |
| **Audit first** | Every mutation (manual correction, regularization approval, policy change) produces an audit trail row. |
| **Default deny** | No attendance action is allowed unless the user has an active org, active subscription, correct role, and the feature is entitled. |
| **Immutable event history** | `attendance_logs` (raw punch events) are append-only. `attendance_records` (computed daily summaries) are derived and recalculable. |

---

## 3. Business Capabilities by Role

### 3.1 Employee
| Capability | Description |
|-----------|-------------|
| Clock In | Punch in with optional GPS coordinates, notes |
| Clock Out | Punch out, triggers attendance calculation |
| Start/End Break | Track break time within a shift |
| My Attendance Dashboard | View today's status, weekly/monthly summary |
| Attendance History | Paginated view of past attendance records |
| Regularization Request | Request correction for missed/wrong punches |
| View Assigned Shift | See their current shift template + weekly offs |

### 3.2 Manager
| Capability | Description |
|-----------|-------------|
| Team Attendance (Today) | Real-time view of who's clocked in, absent, late |
| Approve/Reject Regularizations | For direct reports |
| Team Attendance History | Historical view with filters |
| Anomaly Dashboard | View late arrivals, early exits, missing punches |

### 3.3 HR
| Capability | Description |
|-----------|-------------|
| Manage Attendance Policies | Create, update, deactivate policies |
| Manage Shift Templates | Create fixed, flexible, split, night, rotational shifts |
| Assign Shifts to Employees | Individual or bulk shift assignment |
| Manage Holidays | Create org-level holiday calendar |
| Manage Weekly Offs | Define weekly off patterns per shift/employee |
| Manual Attendance Correction | Override any record with audit trail |
| Lock Attendance Period | Freeze a date range for payroll processing |
| Bulk Import Attendance | CSV/Excel upload for historical data |
| Reports | Daily, weekly, monthly, custom range reports |
| Approve/Reject Regularizations | For all employees in the org |

### 3.4 Admin (Super Admin)
| Capability | Description |
|-----------|-------------|
| All HR capabilities | Plus: |
| Manage Attendance Locations | Define GPS coordinates + geofence radius |
| Manage Biometric Devices | Register devices, configure webhooks |
| View Audit Logs | Full audit trail for all attendance mutations |

---

## 4. Attendance Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ATTENDANCE LIFECYCLE                            │
│                                                                     │
│  [No Record]                                                        │
│       │                                                             │
│       ▼                                                             │
│  [Clock In] ──────► attendance_logs (type: 'clock_in')              │
│       │              attendance_records (status: 'in_progress')     │
│       ▼                                                             │
│  [Working] ◄─────── Break cycle is optional                        │
│       │                                                             │
│       ├──► [Start Break] ──► attendance_breaks (end_time: null)     │
│       │         │                                                   │
│       │         ▼                                                   │
│       │    [End Break] ──► attendance_breaks.end_time updated       │
│       │         │                                                   │
│       │         ▼                                                   │
│       ◄────[Working]                                                │
│       │                                                             │
│       ▼                                                             │
│  [Clock Out] ─────► attendance_logs (type: 'clock_out')             │
│       │              attendance_records.clock_out_time updated      │
│       ▼                                                             │
│  [Calculation] ───► Compute: total_hours, effective_hours,          │
│       │             break_duration, late_minutes, early_exit_mins,  │
│       │             overtime_minutes, status (present/half_day/     │
│       │             absent/late/on_leave/holiday/weekly_off)        │
│       ▼                                                             │
│  [Pending Approval] (if anomaly detected or regularization filed)  │
│       │                                                             │
│       ▼                                                             │
│  [Approved/Adjusted] ──► Final record ready                        │
│       │                                                             │
│       ▼                                                             │
│  [Locked] ──────────► Period locked for payroll. Immutable.         │
│       │                                                             │
│       ▼                                                             │
│  [Payroll] ─────────► Consumed by payroll module                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema

### 5.1 Table: `attendance_policies`

The central configuration table. One active policy per org (initially). All time-based business rules live here.

```sql
CREATE TABLE attendance_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(150) NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Grace & Late
  grace_minutes           INTEGER NOT NULL DEFAULT 0,        -- Minutes after shift start before marked late
  late_threshold_minutes  INTEGER NOT NULL DEFAULT 0,        -- Late beyond this = half day
  
  -- Half Day
  half_day_min_hours      DECIMAL(4,2) NOT NULL DEFAULT 4.00,  -- Min hours for half-day credit
  full_day_min_hours      DECIMAL(4,2) NOT NULL DEFAULT 8.00,  -- Min hours for full-day credit
  
  -- Early Exit
  early_exit_threshold_minutes INTEGER NOT NULL DEFAULT 0,   -- Minutes before shift end = early exit
  
  -- Overtime
  overtime_enabled        BOOLEAN NOT NULL DEFAULT false,
  overtime_min_minutes    INTEGER NOT NULL DEFAULT 30,         -- Min OT minutes to count
  overtime_requires_approval BOOLEAN NOT NULL DEFAULT true,
  
  -- Auto Rules
  auto_clock_out_enabled  BOOLEAN NOT NULL DEFAULT false,
  auto_clock_out_after_hours DECIMAL(4,2) DEFAULT 12.00,     -- Force clock-out after N hours
  auto_detect_shift       BOOLEAN NOT NULL DEFAULT false,     -- Auto-detect shift from clock-in time
  
  -- Missing Punch
  missing_punch_action    VARCHAR(50) NOT NULL DEFAULT 'flag',  -- 'flag', 'half_day', 'absent'
  
  -- Break Rules
  max_break_duration_minutes INTEGER DEFAULT NULL,            -- null = unlimited
  max_breaks_per_day      INTEGER DEFAULT NULL,               -- null = unlimited

  -- Regularization
  regularization_allowed  BOOLEAN NOT NULL DEFAULT true,
  regularization_window_days INTEGER NOT NULL DEFAULT 7,      -- Days back allowed to regularize

  -- Comp Off
  comp_off_on_holiday_work BOOLEAN NOT NULL DEFAULT false,    -- Grant comp-off when working on holiday/weekly-off

  -- Late Penalty Escalation
  late_count_half_day_threshold INTEGER DEFAULT NULL,         -- N late marks in a month = 1 half-day deduction (null = disabled)
  consecutive_late_penalty_days INTEGER DEFAULT NULL,         -- N consecutive late days = penalty (null = disabled)

  -- Metadata
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX attendance_policies_org_default_idx ON attendance_policies(org_id) WHERE is_default = true AND is_active = true;
CREATE INDEX attendance_policies_org_id_idx ON attendance_policies(org_id);
```

### 5.2 Table: `shift_templates`

```sql
CREATE TABLE shift_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(50) NOT NULL DEFAULT 'fixed',  -- 'fixed', 'flexible', 'split', 'night', 'rotational'
  
  start_time      TIME,                    -- null for flexible
  end_time        TIME,                    -- null for flexible
  
  -- For flexible shifts
  min_hours       DECIMAL(4,2),            -- Min expected hours (flexible only)
  core_start_time TIME,                    -- Core window start (flexible only)
  core_end_time   TIME,                    -- Core window end (flexible only)
  
  -- For split shifts
  split_start_time_2   TIME,
  split_end_time_2     TIME,
  
  -- General
  timezone        VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  is_overnight    BOOLEAN NOT NULL DEFAULT false,
  buffer_minutes_before INTEGER NOT NULL DEFAULT 0,   -- Allow clock-in N minutes before shift start
  buffer_minutes_after  INTEGER NOT NULL DEFAULT 0,   -- Allow clock-in N minutes after shift start (distinct from grace)
  is_active       BOOLEAN NOT NULL DEFAULT true,

  policy_id       UUID REFERENCES attendance_policies(id),  -- Overrides org default

  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX shift_templates_org_id_idx ON shift_templates(org_id);
CREATE INDEX shift_templates_type_idx ON shift_templates(type);
```

### 5.3 Table: `employee_shift_assignments`

```sql
CREATE TABLE employee_shift_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  shift_id        UUID REFERENCES shift_templates(id),              -- Direct shift (null if using rotation)
  rotation_pattern_id UUID REFERENCES shift_rotation_patterns(id),  -- Rotation pattern (null if using direct shift)
  
  -- CONSTRAINT: exactly one of shift_id or rotation_pattern_id must be set
  
  effective_from  DATE NOT NULL,
  effective_to    DATE,                    -- null = ongoing
  
  assigned_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT esa_shift_or_rotation_check CHECK (
    (shift_id IS NOT NULL AND rotation_pattern_id IS NULL) OR
    (shift_id IS NULL AND rotation_pattern_id IS NOT NULL)
  )
);

CREATE INDEX esa_org_user_idx ON employee_shift_assignments(org_id, user_id);
CREATE INDEX esa_effective_range_idx ON employee_shift_assignments(user_id, effective_from, effective_to);
CREATE INDEX esa_rotation_pattern_idx ON employee_shift_assignments(rotation_pattern_id);
```

### 5.4 Table: `attendance_weekly_offs`

```sql
CREATE TABLE attendance_weekly_offs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  -- Can be global (shift_id=null, user_id=null), shift-level, or employee-level
  shift_id        UUID REFERENCES shift_templates(id),
  user_id         UUID REFERENCES users(id),
  
  day_of_week     INTEGER NOT NULL,         -- 0=Sunday, 1=Monday ... 6=Saturday
  
  effective_from  DATE NOT NULL,
  effective_to    DATE,                     -- null = ongoing
  
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX awo_org_idx ON attendance_weekly_offs(org_id);
CREATE INDEX awo_user_idx ON attendance_weekly_offs(user_id);
CREATE INDEX awo_shift_idx ON attendance_weekly_offs(shift_id);
```

### 5.5 Table: `attendance_holidays`

```sql
CREATE TABLE attendance_holidays (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(255) NOT NULL,
  date            DATE NOT NULL,
  type            VARCHAR(50) NOT NULL DEFAULT 'public',  -- 'public', 'optional', 'restricted'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ah_org_date_unique_idx ON attendance_holidays(org_id, date) WHERE is_active = true;
CREATE INDEX ah_org_id_idx ON attendance_holidays(org_id);
```

### 5.6 Table: `attendance_logs` (Immutable Punch Events)

```sql
CREATE TABLE attendance_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  
  type            VARCHAR(20) NOT NULL,      -- 'clock_in', 'clock_out', 'break_start', 'break_end'
  timestamp       TIMESTAMPTZ NOT NULL,      -- Server-authoritative timestamp
  
  source          VARCHAR(20) NOT NULL DEFAULT 'web',  -- 'web', 'mobile', 'biometric', 'api', 'bulk_import', 'system'
  
  -- Location data (optional)
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  location_id     UUID REFERENCES attendance_locations(id),
  ip_address      VARCHAR(45),
  
  -- Device / Biometric
  device_id       UUID REFERENCES attendance_devices(id),
  user_agent      TEXT,
  
  -- Client-provided timestamp (for audit/comparison)
  client_timestamp TIMESTAMPTZ,
  
  -- Rich Source Metadata
  metadata        JSONB,                      -- App version, battery, network, wifi ssid, etc.
  
  notes           TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This table is append-only. No updated_at column.
CREATE INDEX al_org_user_ts_idx ON attendance_logs(org_id, user_id, timestamp);
CREATE INDEX al_org_user_type_idx ON attendance_logs(org_id, user_id, type);
CREATE INDEX al_created_at_idx ON attendance_logs(created_at);
```

### 5.7 Table: `attendance_records` (Computed Daily Summary)

```sql
CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  date            DATE NOT NULL,             -- The business date
  
  shift_id        UUID REFERENCES shift_templates(id),
  policy_id       UUID REFERENCES attendance_policies(id),
  
  clock_in_time   TIMESTAMPTZ,
  clock_out_time  TIMESTAMPTZ,
  
  -- Computed fields
  total_hours         DECIMAL(5,2),          -- Gross hours (clock_out - clock_in)
  break_duration_minutes INTEGER DEFAULT 0,
  effective_hours     DECIMAL(5,2),          -- Net hours (total - breaks)
  
  late_minutes        INTEGER DEFAULT 0,
  early_exit_minutes  INTEGER DEFAULT 0,
  overtime_minutes    INTEGER DEFAULT 0,
  
  -- Work Mode
  work_mode       VARCHAR(20) DEFAULT NULL,   -- 'office', 'remote', 'field', 'hybrid' (null = not specified)
  half_day_type   VARCHAR(15) DEFAULT NULL,   -- 'first_half', 'second_half' (null = not a half-day or full day)
  
  -- Status
  status          VARCHAR(30) NOT NULL DEFAULT 'absent',
  -- Values: 'present', 'absent', 'half_day', 'late', 'on_leave', 
  --         'holiday', 'weekly_off', 'in_progress', 'not_marked', 'comp_off'
  
  -- Historical Configuration Snapshots (Immutable for Payroll Integrity)
  shift_snapshot  JSONB,                     -- Snapshot of shift rules on this date
  policy_snapshot JSONB,                     -- Snapshot of policy rules on this date
  calculation_version INTEGER DEFAULT 1,     -- Version of the calculation engine used
  
  -- Flags
  is_regularized  BOOLEAN NOT NULL DEFAULT false,
  is_manually_corrected BOOLEAN NOT NULL DEFAULT false,
  is_locked       BOOLEAN NOT NULL DEFAULT false,
  
  -- Source tracking (First and Last, detailed sessions are in attendance_sessions)
  first_clock_in_log_id   UUID REFERENCES attendance_logs(id),
  last_clock_out_log_id   UUID REFERENCES attendance_logs(id),
  
  remarks         TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ar_org_user_date_unique_idx ON attendance_records(org_id, user_id, date);
CREATE INDEX ar_org_date_idx ON attendance_records(org_id, date);
CREATE INDEX ar_status_idx ON attendance_records(status);
CREATE INDEX ar_user_id_idx ON attendance_records(user_id);
```

### 5.8 Table: `attendance_sessions` *(NEW — v1.2)*

Explicitly models a continuous block of working time (between a clock-in and clock-out). Essential for employees who work multiple shifts in a day (e.g., morning session and evening session) or overnight shifts.

```sql
CREATE TABLE attendance_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  record_id       UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  
  clock_in_log_id UUID NOT NULL REFERENCES attendance_logs(id),
  clock_out_log_id UUID REFERENCES attendance_logs(id),
  
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ,
  
  status          VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed', 'auto_closed'
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX asess_record_id_idx ON attendance_sessions(record_id);
CREATE INDEX asess_user_id_idx ON attendance_sessions(user_id);
CREATE INDEX asess_status_idx ON attendance_sessions(status);
```

### 5.9 Table: `attendance_breaks`

```sql
CREATE TABLE attendance_breaks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  record_id       UUID NOT NULL REFERENCES attendance_records(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,              -- null = currently on break
  duration_minutes INTEGER,                 -- Computed on end_time update
  
  start_log_id    UUID REFERENCES attendance_logs(id),
  end_log_id      UUID REFERENCES attendance_logs(id),
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ab_record_id_idx ON attendance_breaks(record_id);
CREATE INDEX ab_user_id_idx ON attendance_breaks(user_id);
```

### 5.9 Table: `attendance_regularizations`

```sql
CREATE TABLE attendance_regularizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  record_id       UUID REFERENCES attendance_records(id),
  date            DATE NOT NULL,
  
  -- What the employee claims
  requested_clock_in   TIMESTAMPTZ,
  requested_clock_out  TIMESTAMPTZ,
  reason               TEXT NOT NULL,
  
  -- Approval
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_remarks  TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX areg_org_user_idx ON attendance_regularizations(org_id, user_id);
CREATE INDEX areg_status_idx ON attendance_regularizations(status);
CREATE INDEX areg_date_idx ON attendance_regularizations(date);
```

### 5.10 Table: `attendance_locations`

```sql
CREATE TABLE attendance_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(255) NOT NULL,
  address         TEXT,
  
  latitude        DECIMAL(10,8) NOT NULL,
  longitude       DECIMAL(11,8) NOT NULL,
  radius_meters   INTEGER NOT NULL DEFAULT 100,  -- Geofence radius
  
  is_active       BOOLEAN NOT NULL DEFAULT true,
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX aloc_org_id_idx ON attendance_locations(org_id);
```

### 5.11 Table: `attendance_devices`

```sql
CREATE TABLE attendance_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,       -- 'biometric_fingerprint', 'biometric_face', 'card_reader', 'kiosk'
  serial_number   VARCHAR(255),
  location_id     UUID REFERENCES attendance_locations(id),
  
  api_key_hash    VARCHAR(255),               -- Hashed API key for device authentication
  webhook_url     TEXT,
  
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_sync_at    TIMESTAMPTZ,
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX adev_org_id_idx ON attendance_devices(org_id);
```

### 5.12 Table: `attendance_overtime`

```sql
CREATE TABLE attendance_overtime (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  record_id       UUID NOT NULL REFERENCES attendance_records(id),
  date            DATE NOT NULL,
  
  overtime_minutes INTEGER NOT NULL,
  
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  remarks         TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX aot_org_user_idx ON attendance_overtime(org_id, user_id);
CREATE INDEX aot_status_idx ON attendance_overtime(status);
```

### 5.13 Table: `attendance_anomalies`

```sql
CREATE TABLE attendance_anomalies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  record_id       UUID REFERENCES attendance_records(id),
  date            DATE NOT NULL,
  
  type            VARCHAR(50) NOT NULL,
  -- 'missing_clock_out', 'missing_clock_in', 'duplicate_punch',
  -- 'gps_mismatch', 'overtime_unapproved', 'excessive_break',
  -- 'early_exit', 'late_arrival', 'shift_violation'
  
  description     TEXT,
  severity        VARCHAR(20) NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
  
  is_resolved     BOOLEAN NOT NULL DEFAULT false,
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX aanom_org_date_idx ON attendance_anomalies(org_id, date);
CREATE INDEX aanom_user_idx ON attendance_anomalies(user_id);
CREATE INDEX aanom_resolved_idx ON attendance_anomalies(is_resolved);
```

### 5.14 Table: `attendance_lock_periods`

```sql
CREATE TABLE attendance_lock_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  
  locked_by       UUID NOT NULL REFERENCES users(id),
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX alp_org_range_idx ON attendance_lock_periods(org_id, start_date, end_date);
```

### 5.15 Table: `attendance_audit_logs`

```sql
CREATE TABLE attendance_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  actor_id        UUID NOT NULL REFERENCES users(id),
  target_user_id  UUID REFERENCES users(id),
  
  entity_type     VARCHAR(50) NOT NULL,       -- 'record', 'policy', 'shift', 'regularization', 'holiday', etc.
  entity_id       UUID NOT NULL,
  action          VARCHAR(50) NOT NULL,       -- 'create', 'update', 'delete', 'approve', 'reject', 'lock'
  
  old_values      JSONB,
  new_values      JSONB,
  
  reason          TEXT,
  ip_address      VARCHAR(45),
  request_id      VARCHAR(100),               -- For tracing
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only. No updated_at.
CREATE INDEX aaudit_org_idx ON attendance_audit_logs(org_id);
CREATE INDEX aaudit_actor_idx ON attendance_audit_logs(actor_id);
CREATE INDEX aaudit_entity_idx ON attendance_audit_logs(entity_type, entity_id);
CREATE INDEX aaudit_created_at_idx ON attendance_audit_logs(created_at);
```

### 5.16 Table: `shift_rotation_patterns` *(NEW — v1.1)*

Required for the "Rotational" shift type from the requirements. Without this, employees cycling through morning → evening → night shifts cannot be modeled.

```sql
CREATE TABLE shift_rotation_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(150) NOT NULL,         -- e.g., "3-Week Night Rotation"
  rotation_cycle_days INTEGER NOT NULL,           -- Total cycle length in days (e.g., 21 for 3x7-day shifts)
  start_reference_date DATE NOT NULL,             -- Anchor date to calculate current position in rotation
  
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX srp_org_id_idx ON shift_rotation_patterns(org_id);
```

### 5.17 Table: `shift_rotation_entries` *(NEW — v1.1)*

Child rows of `shift_rotation_patterns`. Defines which shift applies for which days within the cycle.

```sql
CREATE TABLE shift_rotation_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_pattern_id UUID NOT NULL REFERENCES shift_rotation_patterns(id) ON DELETE CASCADE,
  shift_id        UUID NOT NULL REFERENCES shift_templates(id),
  
  sequence_order  INTEGER NOT NULL,               -- 1, 2, 3... order within the cycle
  duration_days   INTEGER NOT NULL,               -- How many days this shift lasts in the cycle
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Example: Morning(7d) → Evening(7d) → Night(7d) = 3 entries, cycle = 21 days
CREATE INDEX sre_pattern_idx ON shift_rotation_entries(rotation_pattern_id);
CREATE UNIQUE INDEX sre_pattern_sequence_idx ON shift_rotation_entries(rotation_pattern_id, sequence_order);
```

### 5.18 Table: `attendance_device_employee_mappings` *(NEW — v1.1)*

Biometric devices use internal employee IDs (fingerprint enrollment number, card number, face ID). This table maps those device-specific IDs to our platform `user_id`. Without this, the biometric webhook cannot resolve punches to the correct user.

```sql
CREATE TABLE attendance_device_employee_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  device_id       UUID NOT NULL REFERENCES attendance_devices(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  
  device_employee_id VARCHAR(255) NOT NULL,       -- The ID the device knows this employee as
  
  is_active       BOOLEAN NOT NULL DEFAULT true,
  enrolled_at     TIMESTAMPTZ,
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX adem_device_employee_unique_idx ON attendance_device_employee_mappings(device_id, device_employee_id) WHERE is_active = true;
CREATE INDEX adem_user_idx ON attendance_device_employee_mappings(user_id);
CREATE INDEX adem_org_idx ON attendance_device_employee_mappings(org_id);
```

### 5.19 Table: `attendance_comp_offs` *(NEW — v1.1)*

When an employee works on a holiday or weekly off, they earn a compensatory off. This is a core business feature in Indian labour compliance. Without tracking it, the Leave module has no data to grant comp-off leaves.

```sql
CREATE TABLE attendance_comp_offs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  record_id       UUID NOT NULL REFERENCES attendance_records(id),  -- The record of the day they worked
  
  earned_date     DATE NOT NULL,              -- The holiday/weekly-off date they worked
  worked_type     VARCHAR(20) NOT NULL,       -- 'holiday', 'weekly_off'
  worked_hours    DECIMAL(5,2) NOT NULL,      -- How many hours they worked
  
  status          VARCHAR(20) NOT NULL DEFAULT 'earned',  -- 'earned', 'used', 'expired', 'cancelled'
  expiry_date     DATE,                       -- Comp-offs typically expire after N days
  
  used_on_date    DATE,                       -- Date when this comp-off was consumed as leave
  used_leave_id   UUID,                       -- FK to future leaves table (set when consumed)
  
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX aco_org_user_idx ON attendance_comp_offs(org_id, user_id);
CREATE INDEX aco_status_idx ON attendance_comp_offs(status);
CREATE INDEX aco_earned_date_idx ON attendance_comp_offs(earned_date);
```

### 5.20 Table: `attendance_calendar_exceptions` *(NEW — v1.2)*

Handles overrides to the standard work calendar, such as marking a standard weekly off (e.g., Saturday) as a working day, or declaring an emergency holiday due to unforeseen circumstances.

```sql
CREATE TABLE attendance_calendar_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  date            DATE NOT NULL,
  exception_type  VARCHAR(30) NOT NULL,       -- 'working_day', 'holiday', 'cancelled_holiday'
  reason          TEXT NOT NULL,
  
  -- Can be scoped globally or to a specific shift/user
  shift_id        UUID REFERENCES shift_templates(id),
  user_id         UUID REFERENCES users(id),
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ace_org_date_idx ON attendance_calendar_exceptions(org_id, date);
```

---

### 5.21 Schema Gap Analysis Summary (v1.1 & v1.2)

| Gap Found | Resolution | Impact |
|-----------|-----------|--------|
| **Rotational shifts not modeled** | Added `shift_rotation_patterns` + `shift_rotation_entries` tables. Modified `employee_shift_assignments` to support either direct `shift_id` OR `rotation_pattern_id`. | Without this, the "Rotational" shift type from the requirements (Section 3.3) was a dead feature — HR could create a shift with `type: 'rotational'` but had no way to define the actual rotation cycle or assign it. |
| **Biometric employee mapping missing** | Added `attendance_device_employee_mappings` table. | Biometric devices send a `device_employee_id` (enrollment number) in webhooks. Without this mapping table, the system had no way to resolve which `user_id` a punch belongs to. The webhook endpoint would fail on every request. |
| **Comp-off not tracked** | Added `attendance_comp_offs` table. Added `comp_off_on_holiday_work` to `attendance_policies`. Added `'comp_off'` to `attendance_records.status` enum. | Employee works on a holiday → earns a compensatory off → redeems it as leave later. Without this table, the Leave module has no source of truth for comp-off balances. This is required for Indian labour compliance. |
| **Work mode (office/remote) missing** | Added `work_mode` column to `attendance_records`. | Post-COVID, distinguishing office vs remote attendance is a basic reporting requirement. Payroll, compliance reports, and tax calculations (HRA exemption) depend on this. |
| **Half-day type missing** | Added `half_day_type` column to `attendance_records`. | When status is `'half_day'`, the Leave module needs to know if it was first-half or second-half to correctly apply half-day leaves. Without this, half-day leave integration is ambiguous. |
| **Auto-shift detection not configurable** | Added `auto_detect_shift` to `attendance_policies`. | For orgs with multiple shifts, the system can auto-detect which shift an employee worked based on clock-in time proximity. Without this flag, it was either always-on or never-on with no org control. |
| **Late penalty escalation missing** | Added `late_count_half_day_threshold` and `consecutive_late_penalty_days` to `attendance_policies`. | Production HRMS typically converts N late marks to a half-day deduction. Without these fields, the calculation engine cannot implement escalation rules. |
| **Shift buffer time missing** | Added `buffer_minutes_before` and `buffer_minutes_after` to `shift_templates`. | Many orgs allow employees to clock in 15 minutes before shift start. Without buffer, the system would either reject early punches or assign them to wrong shifts in auto-detect mode. |
| **No formal Work Sessions** *(v1.2)* | Added `attendance_sessions` table. | For split shifts (morning + evening), `attendance_records` couldn't accurately model multiple distinct work blocks. Sessions solve this and make reconciliation easier. |
| **Payroll recalculation risk** *(v1.2)* | Added `shift_snapshot`, `policy_snapshot`, and `calculation_version` to `attendance_records`. | If HR changes a policy, past records would be corrupted on recalculation. Snapshots guarantee historical integrity for payroll. |
| **Lack of Exception Handling** *(v1.2)* | Added `attendance_calendar_exceptions`. | No way to handle a "Working Saturday" or an "Emergency Holiday" without permanently altering weekly off/holiday tables. |
| **Metadata loss** *(v1.2)* | Added `metadata` JSONB to `attendance_logs`. | Needed a place to store battery, wifi SSID, app version for GPS spoofing detection and debugging. |

---

## 6. Module File Structure

Following the exact conventions from `auth` and `organization` modules:

```
src/modules/attendance/
├── attendance.index.js                 # Module entry, mounts all route groups
├── controllers/
│   ├── employee_attendance.controller.js   # Clock in/out, breaks, my dashboard
│   ├── manager_attendance.controller.js    # Team view, approvals
│   ├── hr_attendance.controller.js         # Policies, shifts, holidays, reports, locks
│   └── admin_attendance.controller.js      # Devices, locations, audit logs
├── models/
│   ├── attendance_policies.model.js
│   ├── shift_templates.model.js
│   ├── employee_shift_assignments.model.js
│   ├── attendance_weekly_offs.model.js
│   ├── attendance_holidays.model.js
│   ├── attendance_logs.model.js
│   ├── attendance_records.model.js
│   ├── attendance_breaks.model.js
│   ├── attendance_regularizations.model.js
│   ├── attendance_locations.model.js
│   ├── attendance_devices.model.js
│   ├── attendance_device_employee_mappings.model.js
│   ├── attendance_overtime.model.js
│   ├── attendance_anomalies.model.js
│   ├── attendance_lock_periods.model.js
│   ├── attendance_audit_logs.model.js
│   ├── shift_rotation_patterns.model.js
│   ├── shift_rotation_entries.model.js
│   └── attendance_comp_offs.model.js
├── repositories/
│   ├── attendance_policy.repository.js
│   ├── shift_template.repository.js
│   ├── shift_assignment.repository.js
│   ├── weekly_off.repository.js
│   ├── holiday.repository.js
│   ├── attendance_log.repository.js
│   ├── attendance_record.repository.js
│   ├── attendance_break.repository.js
│   ├── regularization.repository.js
│   ├── location.repository.js
│   ├── device.repository.js
│   ├── device_employee_mapping.repository.js
│   ├── overtime.repository.js
│   ├── anomaly.repository.js
│   ├── lock_period.repository.js
│   ├── audit_log.repository.js
│   ├── rotation_pattern.repository.js
│   └── comp_off.repository.js
├── services/
│   ├── clock.service.js                # Clock in/out + break logic
│   ├── attendance_calculation.service.js  # Post-punch computation engine
│   ├── policy.service.js               # CRUD + validation for policies
│   ├── shift.service.js                # Shift CRUD + assignment
│   ├── holiday.service.js              # Holiday CRUD
│   ├── weekly_off.service.js           # Weekly off CRUD
│   ├── regularization.service.js       # Submit + approve/reject
│   ├── overtime.service.js             # OT computation + approval
│   ├── anomaly.service.js              # Detection + resolution
│   ├── lock.service.js                 # Period locking for payroll
│   ├── location.service.js             # Geofence management
│   ├── device.service.js               # Device management + employee mapping
│   ├── rotation.service.js             # Shift rotation pattern management
│   ├── comp_off.service.js             # Compensatory off tracking
│   ├── report.service.js               # Report generation
│   └── audit.service.js                # Audit log creation + querying
├── routes/
│   ├── employee_attendance.routes.js
│   ├── manager_attendance.routes.js
│   ├── hr_attendance.routes.js
│   └── admin_attendance.routes.js
├── validators/
│   ├── employee_attendance.validator.js
│   ├── manager_attendance.validator.js
│   ├── hr_attendance.validator.js
│   └── admin_attendance.validator.js
└── jobs/                               # Background job handlers
    ├── auto_checkout.job.js
    ├── missing_punch_detector.job.js
    └── attendance_calculator.job.js
```

---

## 7. API Specification

### 7.1 Employee APIs

**Base Path:** `POST /api/v1/attendance/...`  
**Auth:** `authenticate`, `authorize(['employee', 'manager', 'hr', 'admin', 'super-admin'])`  
**Entitlement:** `requireFeature('attendance.access')`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/clock-in` | Clock in for current shift |
| `POST` | `/clock-out` | Clock out |
| `POST` | `/break/start` | Start a break |
| `POST` | `/break/end` | End current break |
| `GET` | `/today` | Get today's attendance status |
| `GET` | `/history` | Paginated attendance history (query: `from`, `to`, `page`, `limit`) |
| `GET` | `/summary` | Monthly summary (query: `month`, `year`) |
| `POST` | `/regularization` | Submit a regularization request |
| `GET` | `/regularizations` | View my regularization requests |
| `GET` | `/shift` | View my assigned shift + weekly offs |

#### Clock In — Request
```json
{
  "source": "web",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "client_timestamp": "2026-07-30T09:02:00+05:30",
  "notes": "Working from office"
}
```

#### Clock In — Response
```json
{
  "success": true,
  "message": "Clocked in successfully",
  "data": {
    "log_id": "uuid",
    "record_id": "uuid",
    "clock_in_time": "2026-07-30T09:02:15.000Z",
    "shift": {
      "name": "General Shift",
      "start_time": "09:00",
      "end_time": "18:00"
    },
    "late_minutes": 2,
    "within_grace": true
  }
}
```

#### Today — Response
```json
{
  "success": true,
  "message": "Today's attendance fetched",
  "data": {
    "date": "2026-07-30",
    "status": "in_progress",
    "clock_in_time": "2026-07-30T09:02:15.000Z",
    "clock_out_time": null,
    "effective_hours": 4.5,
    "break_duration_minutes": 30,
    "active_break": null,
    "breaks": [
      {
        "start_time": "2026-07-30T12:00:00.000Z",
        "end_time": "2026-07-30T12:30:00.000Z",
        "duration_minutes": 30
      }
    ],
    "shift": {
      "name": "General Shift",
      "start_time": "09:00",
      "end_time": "18:00"
    }
  }
}
```

#### Regularization — Request
```json
{
  "date": "2026-07-28",
  "requested_clock_in": "2026-07-28T09:00:00+05:30",
  "requested_clock_out": "2026-07-28T18:00:00+05:30",
  "reason": "Forgot to clock in - was working from office"
}
```

---

### 7.2 Manager APIs

**Base Path:** `GET/POST /api/v1/attendance/manager/...`  
**Auth:** `authenticate`, `authorize(['manager', 'hr', 'admin', 'super-admin'])`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/team/today` | Team's attendance for today |
| `GET` | `/team/history` | Team's historical attendance (query: `from`, `to`, `user_id`) |
| `GET` | `/team/anomalies` | Anomalies for team members |
| `GET` | `/regularizations/pending` | Pending regularizations for direct reports |
| `POST` | `/regularizations/:id/approve` | Approve a regularization |
| `POST` | `/regularizations/:id/reject` | Reject a regularization |

---

### 7.3 HR APIs

**Base Path:** `GET/POST/PUT/DELETE /api/v1/attendance/hr/...`  
**Auth:** `authenticate`, `authorize(['hr', 'admin', 'super-admin'])`

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Policies** | | |
| `POST` | `/policies` | Create attendance policy |
| `GET` | `/policies` | List policies for org |
| `GET` | `/policies/:id` | Get policy details |
| `PUT` | `/policies/:id` | Update policy |
| `PATCH` | `/policies/:id/deactivate` | Deactivate policy |
| **Shifts** | | |
| `POST` | `/shifts` | Create shift template |
| `GET` | `/shifts` | List shift templates |
| `GET` | `/shifts/:id` | Get shift details |
| `PUT` | `/shifts/:id` | Update shift |
| `DELETE` | `/shifts/:id` | Deactivate shift |
| **Shift Assignments** | | |
| `POST` | `/shifts/assign` | Assign shift to employee(s) |
| `GET` | `/shifts/assignments` | List assignments (query: `user_id`, `shift_id`) |
| `PUT` | `/shifts/assignments/:id` | Update assignment |
| **Holidays** | | |
| `POST` | `/holidays` | Create holiday |
| `GET` | `/holidays` | List holidays (query: `year`) |
| `PUT` | `/holidays/:id` | Update holiday |
| `DELETE` | `/holidays/:id` | Delete holiday |
| **Weekly Offs** | | |
| `POST` | `/weekly-offs` | Create weekly off rule |
| `GET` | `/weekly-offs` | List weekly off rules |
| `PUT` | `/weekly-offs/:id` | Update weekly off |
| `DELETE` | `/weekly-offs/:id` | Delete weekly off |
| **Manual Correction** | | |
| `POST` | `/records/:id/correct` | Manual attendance correction (with audit) |
| **Lock** | | |
| `POST` | `/lock` | Lock an attendance period |
| `GET` | `/lock-periods` | List locked periods |
| **Regularizations** | | |
| `GET` | `/regularizations` | All org regularizations (filterable) |
| `POST` | `/regularizations/:id/approve` | Approve regularization |
| `POST` | `/regularizations/:id/reject` | Reject regularization |
| **Overtime** | | |
| `GET` | `/overtime/pending` | Pending OT approvals |
| `POST` | `/overtime/:id/approve` | Approve overtime |
| `POST` | `/overtime/:id/reject` | Reject overtime |
| **Reports** | | |
| `GET` | `/reports/daily` | Daily attendance report |
| `GET` | `/reports/monthly` | Monthly summary report |
| `GET` | `/reports/employee/:userId` | Individual employee report |

---

### 7.4 Admin APIs

**Base Path:** `GET/POST/PUT/DELETE /api/v1/attendance/admin/...`  
**Auth:** `authenticate`, `authorize(['admin', 'super-admin'])`

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Locations** | | |
| `POST` | `/locations` | Create attendance location (geofence) |
| `GET` | `/locations` | List locations |
| `PUT` | `/locations/:id` | Update location |
| `DELETE` | `/locations/:id` | Deactivate location |
| **Devices** | | |
| `POST` | `/devices` | Register biometric device |
| `GET` | `/devices` | List devices |
| `PUT` | `/devices/:id` | Update device |
| `DELETE` | `/devices/:id` | Deactivate device |
| **Audit** | | |
| `GET` | `/audit-logs` | Query audit logs (filterable by entity, actor, date range) |
| **Biometric Webhook** | | |
| `POST` | `/devices/webhook` | Receive biometric punch data |

---

## 8. Attendance Calculation Engine

The `attendance_calculation.service.js` is the core computation engine. It runs:
1. **Immediately** after every clock-out event.
2. **As a background job** for batch recalculation and auto-checkout.

### Calculation Flow

```
Input: attendance_record (with clock_in_time, clock_out_time)
  │
  ├─ 1. Resolve shift_template for the user on this date
  │     (from employee_shift_assignments, fallback to org default)
  │
  ├─ 2. Resolve attendance_policy
  │     (shift-level policy_id → org default policy)
  │
  ├─ 3. Check if date is a holiday → status = 'holiday'
  │
  ├─ 4. Check if date is a weekly_off → status = 'weekly_off'
  │
  ├─ 5. Calculate total_hours = clock_out - clock_in (in decimal hours)
  │
  ├─ 6. Sum break_duration_minutes from attendance_breaks
  │
  ├─ 7. effective_hours = total_hours - (break_duration / 60)
  │
  ├─ 8. late_minutes = max(0, clock_in - (shift_start + grace_minutes))
  │
  ├─ 9. early_exit_minutes = max(0, shift_end - clock_out)
  │     (only if early_exit_threshold exceeded)
  │
  ├─ 10. Determine status:
  │      - effective_hours >= full_day_min_hours → 'present'
  │      - effective_hours >= half_day_min_hours → 'half_day'
  │      - effective_hours > 0 → 'half_day' (with anomaly flagged)
  │      - no clock_in at all → 'absent'
  │      - late_minutes > late_threshold_minutes → 'half_day'
  │
  ├─ 11. Overtime:
  │      - If overtime_enabled && effective_hours > full_day_min_hours:
  │        overtime_minutes = (effective_hours - full_day_min_hours) * 60
  │        If overtime_minutes >= overtime_min_minutes:
  │          Create attendance_overtime record
  │
  ├─ 12. Detect anomalies:
  │      - Missing clock_out → anomaly 'missing_clock_out'
  │      - GPS outside geofence → anomaly 'gps_mismatch'
  │      - Excessive break → anomaly 'excessive_break'
  │
  └─ 13. Update attendance_record with all computed fields
```

---

## 9. Edge Cases & Handling

| Edge Case | Resolution |
|-----------|-----------|
| **Double clock-in** | Reject with `409 ALREADY_CLOCKED_IN`. Check `attendance_records` for an `in_progress` record for today. |
| **Clock-out without clock-in** | Reject with `400 NOT_CLOCKED_IN`. |
| **Overnight shift** | `is_overnight = true` on shift template. Business date = shift start date. Clock-out can be next calendar day. |
| **Shift change mid-day** | `effective_from` on new assignment must be future date. Cannot change current-day shift. |
| **GPS spoofing** | Log client GPS + server IP. Geofence validation is server-side against `attendance_locations`. Flag anomaly but don't block (configurable). |
| **Duplicate biometric webhooks** | Idempotent processing: check `attendance_logs` for same `device_id + user_id + timestamp` within a 60-second window. |
| **Locked payroll period** | Any mutation on a locked date returns `423 ATTENDANCE_LOCKED`. Check `attendance_lock_periods`. |
| **Manual correction on locked period** | Only `super-admin` can unlock. Then correct. Then re-lock. Audit log captures everything. |
| **Break without clock-in** | Reject with `400 NOT_CLOCKED_IN`. |
| **Multiple active breaks** | Reject `break/start` if an open break exists (where `end_time IS NULL`). |
| **Auto-checkout** | Background job runs every N minutes. If `in_progress` record exceeds `auto_clock_out_after_hours`, system inserts a `clock_out` log with `source: 'system'` and recalculates. Anomaly `missing_clock_out` is flagged. |
| **Regularization beyond window** | Reject if `date < (today - regularization_window_days)`. |
| **Regularization on locked period** | Reject with `423 ATTENDANCE_LOCKED`. |

---

## 10. Security

| Concern | Implementation |
|---------|---------------|
| **Org scoping** | Every repository query includes `WHERE org_id = ?`. Always use `req.user.orgId` — never trust client-sent `org_id`. |
| **Duplicate punch prevention** | Transaction-level check: `SELECT ... FOR UPDATE` on `attendance_records` for the user's current date before inserting a log. |
| **Idempotent biometric** | SHA-256 hash of `device_id + employee_id + timestamp` checked against a Redis key with 60s TTL. |
| **Audit trail** | Every write operation on `attendance_records`, `attendance_policies`, `shift_templates`, regularization approvals → `attendance_audit_logs`. |
| **Rate limiting** | Clock-in/out endpoints: max 10 requests per minute per user (via Redis). |
| **Locked period enforcement** | Middleware-level check before any write to `attendance_records` or `attendance_regularizations`. |
| **Feature entitlement** | `requireFeature('attendance.access')` on all attendance routes. `requireFeature('attendance.geofencing')` on location-based endpoints. |

---

## 11. Subscription Feature Keys

These must be seeded into the `features` table:

| Feature Key | Module | Description |
|-------------|--------|-------------|
| `attendance.access` | attendance | Base attendance access (already seeded) |
| `attendance.geofencing` | attendance | GPS + geofence features (already seeded) |
| `attendance.regularization` | attendance | Employee regularization feature |
| `attendance.biometric` | attendance | Biometric device integration |
| `attendance.reports` | attendance | Advanced reporting & exports |
| `attendance.overtime` | attendance | Overtime tracking & approvals |

---

## 12. Background Jobs

| Job | Trigger | Description |
|-----|---------|-------------|
| **Auto Checkout** | Cron: Every 30 min | Finds `in_progress` records where hours exceed `auto_clock_out_after_hours`. Inserts system clock-out log. Recalculates record. Flags anomaly. |
| **Missing Punch Detector** | Cron: Daily at 11:59 PM org timezone | Finds employees with no attendance record for the day who are not on leave/holiday/weekly-off. Creates `absent` records. Flags `missing_clock_in` anomaly. |
| **Attendance Calculator** | Event-driven + Cron daily | Re-runs calculation for any records that need recalculation (after regularization approval, manual correction, etc.). |
| **Attendance Lock Reminder** | Cron: Configurable | Notifies HR when a period is approaching payroll cutoff and isn't locked. |

---

## 13. Integration Points

### 13.1 Leave Module (Future)
- When a leave is approved for a date, `attendance_records.status` for that date = `'on_leave'`.
- Clock-in on an approved leave date: Reject or flag anomaly (policy-driven).

### 13.2 Payroll Module (Future)
- Payroll reads from `attendance_records` where `is_locked = true` for the pay period.
- Fields consumed: `effective_hours`, `overtime_minutes`, `status`, `late_minutes`.

### 13.3 Notifications (Future)
- Clock-in confirmation → Employee
- Late arrival alert → Manager
- Missing punch end-of-day → Employee
- Regularization submitted → Manager
- Regularization approved/rejected → Employee
- Period lock reminder → HR

### 13.4 Holiday Calendar
- `attendance_holidays` is queried during attendance calculation.
- Holiday on a workday → `status = 'holiday'`, no clock-in required.

---

## 13.5 Critical External Dependency: Employee-Manager Hierarchy

The Manager APIs (Section 7.2) rely on knowing **who reports to whom**. Currently, the HRMS codebase has no employee-manager mapping table. Before the attendance module's Manager features can work, the `organization` or `employee` module must provide one of:

| Option | Table | Description |
|--------|-------|-------------|
| **A (Recommended)** | `employee_managers` | `user_id` + `manager_user_id` + `org_id` + `effective_from/to`. Simple direct-report mapping. |
| **B** | `org_hierarchy` | Full tree structure with `parent_id` for complex multi-level reporting chains. |

Until this dependency is resolved, Manager APIs should scope to **all employees in the org** (same as HR) as a temporary fallback, with a `TODO` to restrict to direct reports once the hierarchy table exists.

---

## 13.6 Event-Driven Architecture (Recommended Strategy)

To decouple the Attendance module from Leave, Payroll, and Notifications, we will adopt an Event-Driven Architecture (EDA) publishing domain events to a message broker or event bus (e.g., Redis Pub/Sub, Kafka, or Node's internal `EventEmitter` for the MVP).

**Key Events Published:**
- `attendance.clock_in`
- `attendance.clock_out`
- `attendance.record_calculated`
- `attendance.anomaly_detected`
- `attendance.regularization_approved`
- `attendance.period_locked`

**Consumers:**
- **Leave Module:** Listens to `attendance.record_calculated` to apply comp-offs or deduct half-day leaves.
- **Payroll Module:** Listens to `attendance.period_locked` to trigger salary generation.
- **Notification Service:** Listens to anomalies and approvals to send emails/push notifications.

## 13.7 Generic Approval Engine (Future Architecture)

While tables like `attendance_regularizations` and `attendance_overtime` currently track `approved_by` and `status`, a future requirement will likely demand multi-level approvals (Manager → HR → Admin). 

**Recommendation:** Offload the approval state machine to a generic `approval_workflows` and `approval_steps` tables (likely in a separate `workflows` module). The attendance entities will simply link to a `workflow_id` and listen for `workflow.approved` / `workflow.rejected` events.

---

## 14. Module Entry Point

```javascript
// src/modules/attendance/attendance.index.js
const employeeRoutes = require('./routes/employee_attendance.routes')
const managerRoutes = require('./routes/manager_attendance.routes')
const hrRoutes = require('./routes/hr_attendance.routes')
const adminRoutes = require('./routes/admin_attendance.routes')

module.exports = (app) => {
  app.use('/api/v1/attendance', employeeRoutes)
  app.use('/api/v1/attendance/manager', managerRoutes)
  app.use('/api/v1/attendance/hr', hrRoutes)
  app.use('/api/v1/attendance/admin', adminRoutes)
}
```

Registration in `app.js`:
```javascript
require('./modules/attendance/attendance.index')(app)
```

---

## 15. Route Middleware Stack Example

```javascript
// routes/employee_attendance.routes.js
const { authenticate, authorize } = require('../../../common/middlewares/auth.middleware')
const requireFeature = require('../../../common/middlewares/require_feature.middleware')
const requireSubscription = require('../../../common/middlewares/subscription.middleware')

const allOrgRoles = ['employee', 'manager', 'hr', 'admin', 'super-admin']

router.post('/clock-in',
  authenticate,
  authorize(allOrgRoles),
  requireSubscription(),
  requireFeature('attendance.access'),
  controller.handlePostClockIn
)
```

---

## 16. Phase-wise Implementation Order

### Phase 1: Foundation (Week 1)
- [ ] Sequelize models for all 19 tables (15 original + 4 new from v1.1 review)
- [ ] Database migration file
- [ ] Feature seeder for new attendance feature keys
- [ ] Repositories for all tables (basic CRUD)

### Phase 2: Policy & Shift Engine (Week 2)
- [ ] `policy.service.js` — CRUD for attendance policies (including new escalation fields)
- [ ] `shift.service.js` — CRUD for shift templates + assignments (including buffer times)
- [ ] `rotation.service.js` — CRUD for rotation patterns + entries
- [ ] `holiday.service.js` — CRUD for holidays
- [ ] `weekly_off.service.js` — CRUD for weekly offs
- [ ] HR controllers, routes, validators for above

### Phase 3: Core Clock In/Out (Week 3)
- [ ] `clock.service.js` — Clock in, clock out, break start, break end
- [ ] `attendance_calculation.service.js` — Full calculation engine
- [ ] `anomaly.service.js` — Detection during calculation
- [ ] Employee controllers, routes, validators
- [ ] Duplicate punch prevention
- [ ] Locked period enforcement

### Phase 4: Regularization & Overtime (Week 4)
- [ ] `regularization.service.js` — Submit, approve, reject
- [ ] `overtime.service.js` — Compute, approve, reject
- [ ] Manager controllers, routes, validators
- [ ] Audit logging for all approvals

### Phase 5: Locations, Devices & Admin (Week 5)
- [ ] `location.service.js` — Geofence CRUD
- [ ] `device.service.js` — Device management + employee mapping + webhook handler
- [ ] `comp_off.service.js` — Compensatory off tracking + approval
- [ ] Admin controllers, routes, validators
- [ ] Biometric webhook endpoint with idempotency
- [ ] Device-employee mapping CRUD for biometric enrollment

### Phase 6: Locking & Reports (Week 6)
- [ ] `lock.service.js` — Period locking
- [ ] `report.service.js` — Daily, monthly, employee reports
- [ ] Lock enforcement across all write endpoints

### Phase 7: Background Jobs (Week 7)
- [ ] Auto-checkout job
- [ ] Missing punch detector job
- [ ] Job scheduler setup (node-cron or Bull queue)

### Phase 8: Testing & Hardening (Week 8)
- [ ] Unit tests for calculation engine
- [ ] Integration tests for clock in/out flow
- [ ] Edge case tests (overnight, double punch, locked period)
- [ ] Concurrency tests (simultaneous clock-in)
- [ ] Load tests

---

## 17. Performance Considerations (Future)

| Strategy | Purpose |
|----------|---------|
| **Redis caching** | Cache active policy + shift for a user (TTL 5 min). Cache holiday list per org per month. |
| **Read replicas** | Route all `GET` report queries to a read replica. |
| **Async calculation** | Post clock-out: emit event → message queue → worker calculates. Keep API response fast. |
| **Queue-based ingestion** | Biometric webhook data → Redis queue → worker processes. Prevents webhook timeouts. |
| **Batch operations** | Bulk shift assignment, bulk import attendance via CSV → background job with progress tracking. |
| **Partitioning** | `attendance_logs` and `attendance_records` can be range-partitioned by month for large orgs. |

---

## 18. Conventions Alignment

This module strictly follows existing HRMS codebase patterns:

| Convention | How This Module Follows It |
|-----------|---------------------------|
| **Model pattern** | `module.exports = (sequelize, DataTypes) => { ... }` with `tableName`, `timestamps`, `underscored`, `indexes`, `associate` |
| **Repository pattern** | Singleton class per table, exported as `new ClassName()` |
| **Service pattern** | Singleton class, business logic lives here, throws `AppError` |
| **Controller pattern** | `exports.handlePostXxx = async (req, res, next) => { try { ... } catch (err) { next(err) } }` |
| **Response format** | `{ success: true, message: '...', data: { ... } }` |
| **Validation** | Joi schemas, invoked via `validateOrThrow(schema, req.body)` |
| **Auth middleware** | `authenticate` → `authorize([roles])` → `requireSubscription()` → `requireFeature(key)` |
| **Error handling** | `throw new AppError(status, message, errorCode)` — caught by `errorHandlerMiddleware` |
| **ID type** | UUID v4 for all primary keys |
| **Timestamps** | `created_at`, `updated_at` via Sequelize `timestamps: true, underscored: true` |

---

## 19. Final Table Count

| # | Table | Purpose | Category |
|---|-------|---------|----------|
| 1 | `attendance_policies` | All configurable business rules | Configuration |
| 2 | `shift_templates` | Shift definitions (fixed, flexible, split, night) | Configuration |
| 3 | `shift_rotation_patterns` | Rotational shift cycle definitions | Configuration |
| 4 | `shift_rotation_entries` | Individual entries within a rotation cycle | Configuration |
| 5 | `employee_shift_assignments` | Maps employees to shifts or rotation patterns | Configuration |
| 6 | `attendance_weekly_offs` | Weekly off rules (org/shift/employee level) | Configuration |
| 7 | `attendance_holidays` | Org-level holiday calendar | Configuration |
| 8 | `attendance_locations` | Geofence locations for GPS validation | Configuration |
| 9 | `attendance_devices` | Biometric device registry | Configuration |
| 10 | `attendance_device_employee_mappings` | Biometric device → user mapping | Configuration |
| 11 | `attendance_calendar_exceptions` | Overrides for working holidays/weekends | Configuration |
| 12 | `attendance_logs` | Immutable raw punch events (append-only) | Operational |
| 13 | `attendance_sessions` | Blocks of working time (Clock In → Clock Out) | Operational |
| 14 | `attendance_records` | Computed daily attendance summary | Operational |
| 15 | `attendance_breaks` | Break periods within a work session | Operational |
| 16 | `attendance_regularizations` | Employee correction requests + approval | Workflow |
| 17 | `attendance_overtime` | Overtime records + approval | Workflow |
| 18 | `attendance_anomalies` | Detected issues + resolution tracking | Workflow |
| 19 | `attendance_comp_offs` | Compensatory off earned on holidays/weekly-offs | Workflow |
| 20 | `attendance_lock_periods` | Payroll lock date ranges | Operational |
| 21 | `attendance_audit_logs` | Full mutation audit trail (append-only) | Audit |

**Total: 21 tables** (11 Configuration, 5 Operational, 4 Workflow, 1 Audit)

---

> **This document is the complete reference for implementing the Attendance module. No code should be written until this plan is reviewed and approved.**

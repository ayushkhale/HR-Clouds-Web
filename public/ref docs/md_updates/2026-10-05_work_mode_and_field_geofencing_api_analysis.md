# Work Mode Enforcement & Multi-Site Field Geofencing — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint technical, architectural and production-grade analysis of the **Work Mode Enforcement & Field Geofencing** change shipped on 2026-10-05. It covers the **9 new APIs** (8 field-management endpoints mounted on both the HR and Manager routers, plus 1 employee self-read), the **5 existing endpoints whose request or response contract changed**, the **4 database migrations** (`00069`–`00072`), the **2 new anomaly types** and **1 severity escalation** surfaced through existing anomaly endpoints, and the **1 breaking removal** on the Organization module's self-service job profile.

This document is the implementation-accurate reference for frontend engineering, QA test-suite generation and security auditing. It is grounded in the actual codebase (`src/modules/attendance/`, `src/modules/organization/`, `src/common/utilities/geofence.utils.js`) and verified against a live PostgreSQL 16 instance — 33 real `clockIn`/`clockOut` punches, 47 HTTP probes through the full validator → controller → service chain, and 31 repository probes, in addition to the 2923-test unit suite.

> [!IMPORTANT]
> **Architectural Premise & Enterprise Mechanics**
> 1. **Punch Acceptance Is Unconditional (the central invariant).** No geofence state ever blocks a clock-in or clock-out. Every outcome — missing GPS, outside every boundary, nothing configured to check against, a forged work-mode claim — **accepts the punch** and raises an anomaly for HR instead. Lost attendance records cause payroll disputes and wage claims; a flag costs an HR review. Build the punch UI on this assumption: there is no "punch rejected because you are out of bounds" branch to design.
> 2. **The Contract Decides, Not the Payload (B-1).** `work_mode` sent at clock-in is **advisory**. The server resolves the employee's contractual mode from their role profile and overrides the payload. A geofenced contract (`office`, `field`) cannot be relaxed by a claim; only a `hybrid` employee's declaration is honoured. `attendance_records.work_mode` stores the *resolved* mode.
> 3. **Fail-Secure Resolution.** `work_mode` is nullable on all three role-profile models, so the legacy population carries `NULL`. `NULL`, an unrecognized value, and a missing membership row all resolve to **`office`** — never `remote`, which would turn every unconfigured profile into a permanent geofence bypass.
> 4. **Composite Location Resolution, Never Duplication (B-3).** A `field` employee's valid pool is `[active, date-effective assigned client sites] + [assigned office]`, each read from its own table. Office rows are **never** copied into the field table. Migration `00022` already dropped a duplicated location table (`attendance_locations`) and had to NULL out orphaned foreign keys to do it; editing an office pin now propagates to field validation with zero sync drift.
> 5. **Three Geofence States, Not Two (B-2).** The engine distinguishes `in_bounds`, `out_of_bounds` and **`unresolved`**. `unresolved` means nothing could be checked (no assigned office, no active branch, no assigned site, or the location carries no GPS pin). Reporting `in_bounds` there would be fail-open; reporting `out_of_bounds` would punish an employee for an administrator's missing configuration.
> 6. **The Record Governs the Day (B-4).** Clock-out reads `record.work_mode` — the mode established at clock-in — never the payload (`clockOutSchema` carries no `work_mode`) and never a freshly re-derived profile value. An HR editing a profile at lunchtime cannot retroactively change the rules for a shift already in progress.
> 7. **Soft Delete With an Application-Owned Cascade (B-5).** PostgreSQL `ON DELETE CASCADE` fires only on a physical `DELETE`. Retiring a field location sets `is_active = false`, so the child `employee_field_assignments` rows must be deactivated by an explicit statement **in the same transaction**. This is why `is_active` is not an accepted field on the update endpoint — only `DELETE` performs the cascade.
> 8. **Device Attestation Outranks Client GPS (B-6).** A biometric punch carries no coordinates; the device's own fixed `location_id` is stronger evidence than browser geolocation, which is trivially mocked. Such punches skip GPS evaluation entirely and raise no anomaly.
> 9. **`work_mode` and `location_id` Are Now Authorization Boundaries (B-7).** Once the geofence keys off them, every write path becomes a privilege surface. Both were removed from employee self-service and are HR-owned.

---

## Table of Contents

- [1. Domain Overview & Architectural Mechanics](#1-domain-overview--architectural-mechanics)
  - [1.1 The Two Work-Mode Vocabularies](#11-the-two-work-mode-vocabularies)
  - [1.2 Work Mode Resolution & The Effective Mode](#12-work-mode-resolution--the-effective-mode)
  - [1.3 Composite Candidate Pool Resolution](#13-composite-candidate-pool-resolution)
  - [1.4 The Three-State Geofence Evaluator](#14-the-three-state-geofence-evaluator)
  - [1.5 Punch Provenance Storage Model](#15-punch-provenance-storage-model)
  - [1.6 Field Location Lifecycle & The Cascade](#16-field-location-lifecycle--the-cascade)
  - [1.7 Hierarchy Scoping & Mutation Authority](#17-hierarchy-scoping--mutation-authority)
  - [1.8 Date-Bounded Assignments & Timezone Integrity](#18-date-bounded-assignments--timezone-integrity)
  - [1.9 Database Schemas & Migrations 00069–00072](#19-database-schemas--migrations-0006900072)
- [2. Field Location Management APIs (#1–#5)](#2-field-location-management-apis-15)
  - [1. POST /field-locations](#1-post-apiv1attendancehrmanagerfield-locations)
  - [2. GET /field-locations](#2-get-apiv1attendancehrmanagerfield-locations)
  - [3. GET /field-locations/:id](#3-get-apiv1attendancehrmanagerfield-locationsid)
  - [4. PUT /field-locations/:id](#4-put-apiv1attendancehrmanagerfield-locationsid)
  - [5. DELETE /field-locations/:id](#5-delete-apiv1attendancehrmanagerfield-locationsid)
- [3. Field Assignment APIs (#6–#8)](#3-field-assignment-apis-68)
  - [6. POST /field-assignments](#6-post-apiv1attendancehrmanagerfield-assignments)
  - [7. DELETE /field-assignments/:assignment_id](#7-delete-apiv1attendancehrmanagerfield-assignmentsassignment_id)
  - [8. GET /field-assignments/user/:user_id](#8-get-apiv1attendancehrmanagerfield-assignmentsuseruser_id)
- [4. Employee Self-Service API (#9)](#4-employee-self-service-api-9)
  - [9. GET /my-field-assignments](#9-get-apiv1attendancemy-field-assignments)
- [5. Existing Endpoints Modified / Extended](#5-existing-endpoints-modified--extended)
- [6. New Anomaly Types & Severity Changes](#6-new-anomaly-types--severity-changes)
- [7. Complete Work Mode & Geofence Decision Matrix](#7-complete-work-mode--geofence-decision-matrix)
- [8. Security, Tenancy & Production Verification](#8-security-tenancy--production-verification)
- [9. Complete Error Code Catalog](#9-complete-error-code-catalog)
- [10. Frontend Implementation Sequence](#10-frontend-implementation-sequence)

---

## 1. Domain Overview & Architectural Mechanics

### 1.1 The Two Work-Mode Vocabularies

**This is the single most common integration mistake available in this feature.** The platform stores one concept under two spellings, in different modules:

| Plane | Vocabulary | Where it appears |
| :--- | :--- | :--- |
| **Profile** (the contract) | `on-site`, `remote`, `hybrid`, `field` | `employee_profiles` / `manager_profiles` / `hr_profiles` ENUMs, the invite form, HR fields endpoint |
| **Attendance** (the punches) | `office`, `remote`, `hybrid`, `field` | clock-in payload, `attendance_records.work_mode`, `attendance_regularizations.work_mode`, every attendance read, dashboards |

`on-site` and `office` are **the same mode**. Direct equality (`profile.work_mode === data.work_mode`) can never match for an on-site employee — which is exactly why the geofence engine normalizes before comparing anything.

Rules for the client:
- Sending to a **punch** or **regularization** endpoint → use `office`.
- Sending to the **invite** or **HR fields** endpoint → use `on-site` (unchanged).
- **Reading** anything from the attendance module → expect only `office` | `remote` | `hybrid` | `field` | `null`.

`src/modules/attendance/utilities/work_mode.utils.js` is the sole sanctioned translation path. Migration `00072` added `CHECK` constraints on both attendance tables and normalized historical rows, so one logical mode can no longer split a dashboard grouping in two.

### 1.2 Work Mode Resolution & The Effective Mode

```text
                      ┌──────────────────────────────┐
  profile.work_mode → │ resolveAssignedMode()        │ → assignedMode
  ('on-site'|null|…)  │  normalize, else 'office'    │   (fail-secure)
                      └──────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         │ CLOCK-IN                                CLOCK-OUT     │
         │ effectiveMode = assignedMode   effectiveMode =        │
         │ (payload cannot relax it)      normalize(record       │
         │                                 .work_mode)           │
         │                                 || assignedMode       │
         └───────────────────────────┬───────────────────────────┘
                                     ▼
                     requiresGeofence(effectiveMode, declaredMode)
```

**Why clock-out reads the record.** `clockOutSchema` deliberately carries no `work_mode` — an employee cannot change their contractual mode halfway through a day. If the engine read `data.work_mode` at clock-out, a hybrid employee who legitimately worked remotely would have `undefined` at 18:00, be interpreted as an office punch, and be flagged `out_of_bounds` **every single evening**. Reading the *record* also means an HR who edits the profile mid-shift cannot retroactively re-rule a shift already in progress. The profile is consulted at clock-out only as a fallback for a legacy record whose `work_mode` is `NULL`.

### 1.3 Composite Candidate Pool Resolution

```text
            effectiveMode
                 │
   ┌─────────────┼─────────────────────────────┐
   │             │                             │
'remote'    'hybrid' + declared 'remote'   'office' / 'field'
   │             │                             │
   └── bypass ───┘                             ▼
       no pool                        ┌──────────────────┐
                                      │ OFFICE HALF      │
                                      │ profile.location │
                                      │ active? → [it]   │
                                      │ else → ALL active│
                                      │   branches       │
                                      │   (fallback)     │
                                      └────────┬─────────┘
                                               │
                             effectiveMode === 'field'?
                                        │          │
                                       yes         no
                                        │          │
                             ┌──────────▼──────┐   │
                             │ FIELD HALF      │   │
                             │ active + date-  │   │
                             │ effective       │   │
                             │ assigned sites  │   │
                             └──────────┬──────┘   │
                                        └────┬─────┘
                                             ▼
                                   drop candidates with
                                   unusable coordinates
                                             ▼
                                      evaluateGeofence()
```

**Zero-field fallback.** A `field` employee with no sites assigned yet resolves to the office alone, so onboarding order never locks anyone out — they punch at the office without error, and the feature can be rolled out before every client site is registered.

**The null-`location_id` fallback** is preserved to avoid employee lockout, but it is a real hole in a multi-city organization (an unassigned employee can punch in at any branch). It is therefore surfaced as `office_fallback_used: true` in punch provenance, and when it yields nothing usable it raises `geofence_unresolved`.

### 1.4 The Three-State Geofence Evaluator

`evaluateGeofence(lat, lon, candidates)` in `src/common/utilities/geofence.utils.js` replaced a boolean check on the punch path:

| Outcome | Condition | Reported `matched` |
| :--- | :--- | :--- |
| `in_bounds` | within the radius of ≥1 candidate | the **nearest containing** candidate |
| `out_of_bounds` | outside every candidate | the **nearest** candidate anyway, with its distance |
| `unresolved` | pool empty, or every candidate lacks usable coordinates | `null` |

Each candidate is judged against **its own radius** — offices default to `100 m`, field sites to `250 m` — so "nearest" and "containing" are not always the same row. A punch 180 m from a 250 m client site and 190 m from a 100 m office is in bounds at the *field site*, and that is what provenance records.

> [!NOTE]
> The legacy helper `isWithinGeofence` returns `true` for an empty location array, which was tolerable while geofencing was advisory and becomes fail-open the moment `field` mode exists. It was deliberately **not** modified (it has its own committed test suite) and now has no production callers; `evaluateGeofence` is additive.

### 1.5 Punch Provenance Storage Model

Provenance is written in two places with different jobs:

| Location | Scope | Purpose |
| :--- | :--- | :--- |
| `attendance_logs.metadata.geofence` (JSONB) | **per punch** | Source of truth. Clock-in and clock-out each carry their own, so an employee who starts at Client A and finishes at Client B has both preserved. |
| `attendance_records.matched_location_id` / `matched_location_type` / `distance_to_location_meters` | **per day** | Denormalized cache of the **clock-in** match, for fast roster and dashboard reads. Not overwritten at clock-out. |

```json
{
  "geofence": {
    "evaluated": true,
    "outcome": "in_bounds",
    "action": "Clock-in",
    "assigned_mode": "field",
    "effective_mode": "field",
    "declared_mode": null,
    "matched_location_id": "9f1c0b33-3333-4333-8333-333333333333",
    "matched_location_type": "field",
    "matched_location_name": "Tata Steel Pune Plant",
    "distance_meters": 42,
    "radius_meters": 300,
    "candidate_count": 3,
    "field_site_count": 2,
    "office_fallback_used": false
  }
}
```

A client-supplied `metadata.geofence` is **always overwritten** by the server (verified live); other client metadata keys survive the merge.

> [!WARNING]
> **`matched_location_id` is polymorphic and carries no foreign key.** It points at `organization_locations.id` when `matched_location_type` is `'office'` and at `organization_field_locations.id` when `'field'`. Always branch on the type before resolving the id. PostgreSQL cannot express a two-target FK, and migration `00022` is the standing proof that faking it is worse — a single-target FK on `attendance_logs.location_id` forced a destructive `UPDATE … SET location_id = NULL` to repair orphans. That same FK is why field provenance **cannot** be written to `attendance_logs.location_id`: a field-site id there raises a foreign-key violation and aborts the punch transaction.

### 1.6 Field Location Lifecycle & The Cascade

```text
   ┌──────────────┐    PUT /field-locations/:id    ┌──────────────┐
   │   active     │ ◄──── (coords, radius, ──────► │   active     │
   │ is_active=t  │        address, name)          │  (edited)    │
   └──────┬───────┘                                └──────────────┘
          │
          │ DELETE /field-locations/:id   ── ONE TRANSACTION ──
          │   1. is_active=false, deleted_at=NOW()
          │   2. deactivate ALL active employee_field_assignments
          ▼
   ┌──────────────┐
   │   retired    │  historical punches keep referencing it;
   │ is_active=f  │  the name is FREED for re-registration
   └──────────────┘
```

**`is_active` is not an accepted field on the update endpoint.** Retiring a site is not a field edit: because `ON DELETE CASCADE` does not fire on an `UPDATE`, flipping the flag must be paired with deactivating the child assignments. Accepting it on the update path produced a genuine defect (found and fixed during review): the site dropped out of the geofence pool while every assignment row stayed `is_active: true`, so the UI still showed those employees as assigned while their punches silently began failing with no visible cause.

`is_active` is the **single query predicate**; `deleted_at` is an audit timestamp only, and Sequelize `paranoid` is explicitly **off** so nothing silently auto-filters on it. This matches the sibling `organization_locations`, which carries neither flag.

### 1.7 Hierarchy Scoping & Mutation Authority

Two orthogonal authority models apply:

**Creation and discovery are org-wide — deliberately.**
A field location created by any manager or HR is visible to every manager and HR in the organization. The entire point is reuse: nobody should register "Tata Steel Pune" four times. A partial unique index on `(org_id, lower(name)) WHERE is_active = true` enforces that in the database rather than relying on managers to coordinate.

**Mutation is narrow.** Editing or retiring a site requires an **HR admin, or the manager who created it** (`created_by`). Without this, any manager could move another team's client-site pin and silently push that team's punches out of bounds. The HR role is resolved from the authoritative `user_roles` rows, not the JWT claim, so a revoked HR role loses these rights immediately rather than at token expiry.

**Assignment is hierarchy-scoped**, delegating to the shared resolver `accessControl.getAccessibleUserIds(orgId, requesterUser)`:

| Return | Meaning | Who |
| :--- | :--- | :--- |
| `null` | no filter — anyone in the org | `hr`, `admin`, `super-admin` |
| `[]` | nobody | a plain employee, or a manager with no active direct reports |
| `[ids]` | these users only | a manager's **active direct reports**, minus any holding a global-approver role |

> [!IMPORTANT]
> **The hierarchy is one level deep — not a recursive tree.** The resolver issues a single non-recursive query against `user_reporting_mappings` where `reporting_to_id = requester.id`. A manager **cannot** assign to a report's report. Do not build a multi-level org-tree picker on the manager screen; fetch direct reports and offer those. This matches the scope already used by anomaly resolution, regularization approval and the Leave module, so the existing team-picker component is the correct one.
>
> **Manager self-assignment is blocked structurally**, not by a special case: the resolver never returns the requester's own id, so a manager's own `user_id` can never pass the filter. A manager who needs a field site is assigned one by HR, consistent with managers reporting only to HR.

### 1.8 Date-Bounded Assignments & Timezone Integrity

Field staff are routinely deployed temporarily ("at Client X from Nov 1 to Nov 15"), so `employee_field_assignments` carries `effective_from` / `effective_to` as SQL `DATE` columns, **inclusive on both ends**.

The lookup reuses the verified pattern from `employee_shift_assignments.repository.js`:

```javascript
effective_from: { [Op.lte]: dateStr },
[Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: dateStr } }]
```

where `dateStr` is the IST business-date **string** from `clock.service#_businessDate`.

> [!WARNING]
> **Two timezone traps, both guarded.**
> 1. **Never send an ISO timestamp.** `effective_from: "2026-11-01T00:00:00Z"` is rejected with `400`. A timestamp carries a timezone, and at IST (UTC+05:30) a midnight-UTC instant resolves to the previous calendar day — silently shifting the window. Use a local calendar format (`format(date, 'yyyy-MM-dd')`), **not** `date.toISOString()`.
> 2. **`effective_from` is `NOT NULL`.** SQL `NULL <= '2026-11-01'` evaluates to `NULL`, not `TRUE`, so a nullable column would make the row **invisible to the geofence engine with no error anywhere** — the worker would be flagged `out_of_bounds` at a site they are genuinely assigned to. The column defaults to `CURRENT_DATE`.

Verified live against PostgreSQL: a `2026-11-01` → `2026-11-15` window matches on the 1st and the 15th, and does not match on `2026-10-31` or `2026-11-16`. A future-dated assignment is correctly absent from today's pool.

### 1.9 Database Schemas & Migrations 00069–00072

All four migrations apply from scratch on a pristine database and round-trip `down`/`up` cleanly (verified).

> [!IMPORTANT]
> **Deploy order: run the migrations BEFORE the application code.** The `AttendanceRecords` model gains three attributes that every record `SELECT` includes.

#### `00069-create-organization-field-locations`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `UUID` PK | |
| `org_id` | `UUID` NOT NULL | FK → `organizations`, `ON DELETE CASCADE` |
| `name` | `VARCHAR(150)` NOT NULL | unique per org among active rows, case-insensitively |
| `client_name` | `VARCHAR(150)` | |
| `latitude` | `DECIMAL(10,8)` **NOT NULL** | `CHECK` −90…90 |
| `longitude` | `DECIMAL(11,8)` **NOT NULL** | `CHECK` −180…180 |
| `geofence_radius_meters` | `INT` NOT NULL DEFAULT **250** | `CHECK` 50…2000 |
| `timezone` | `VARCHAR(100)` NOT NULL DEFAULT `'Asia/Kolkata'` | mirrors the sibling table |
| `address`, `city`, `state`, `country`, `pincode` | text | `country` defaults `'India'` |
| `is_active` | `BOOLEAN` NOT NULL DEFAULT `true` | **the** soft-delete predicate |
| `created_by` | `UUID` NOT NULL | FK → `users`, `ON DELETE RESTRICT` — attribution drives edit rights |
| `updated_by` | `UUID` | FK → `users`, `ON DELETE SET NULL` |
| `deleted_at` | `TIMESTAMPTZ` | audit only, never a query predicate |

Indexes: `idx_ofl_org`, `idx_ofl_org_active`, and `idx_ofl_org_name_unique UNIQUE (org_id, lower(name)) WHERE is_active = true`.

Coordinates are `NOT NULL` here but nullable on `organization_locations` — and that nullability is an active defect in the existing table: a coordinate-less candidate is skipped by the distance loop, so an office with no GPS pin made every punch fall through to `out_of_bounds` (HIGH). A field site exists only to be geofenced, so `NULL` is refused at the schema.

#### `00070-create-employee-field-assignments`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `UUID` PK | |
| `org_id` | `UUID` NOT NULL | FK → `organizations` CASCADE |
| `user_id` | `UUID` NOT NULL | FK → `users` CASCADE |
| `field_location_id` | `UUID` NOT NULL | FK → `organization_field_locations` CASCADE |
| `assigned_by` | `UUID` NOT NULL | FK → `users` RESTRICT |
| `is_active` | `BOOLEAN` NOT NULL DEFAULT `true` | |
| `effective_from` | `DATE` **NOT NULL** DEFAULT `CURRENT_DATE` | see §1.8 |
| `effective_to` | `DATE` | `NULL` = open-ended |

Constraints and indexes: `efa_date_order CHECK (effective_to IS NULL OR effective_to >= effective_from)`; `idx_efa_unique_active UNIQUE (org_id, user_id, field_location_id) WHERE is_active = true`; `idx_efa_lookup` covering the hot punch read; `idx_efa_by_location` for the cascade.

#### `00071-add-geofence-provenance-to-attendance-records`

Adds `matched_location_id UUID` (**no FK** — polymorphic, see §1.5), `matched_location_type VARCHAR(20)` with `CHECK IN ('office','field')`, and `distance_to_location_meters INT`.

#### `00072-normalize-and-constrain-work-mode`

Normalizes `'on-site'` / `'onsite'` / `'on_site'` → `'office'` on `attendance_records` and `attendance_regularizations`, sets any other uninterpretable value to `NULL` (honest "unknown" rather than a guess), then adds `CHECK (work_mode IS NULL OR work_mode IN ('office','remote','hybrid','field'))` to both tables.

**Verified effect on live data:** six drifted buckets (`on-site`, `ONSITE`, `on_site`, `field`, `WFH-ish`, `NULL`) collapsed to three (`office` ×3, `field`, `NULL` ×2). `NULL` remains legal for historical rows that predate the engine populating the column; new punches always write a value. `down()` drops the constraints but does **not** reintroduce the drift — the `UPDATE` is a repair.

---

## 2. Field Location Management APIs (#1–#5)

All five endpoints are mounted at **identical paths on both routers**. Request and response contracts are identical; only the authorization scope differs.

| Router | Base URL | `authorize()` roles |
| :--- | :--- | :--- |
| HR | `/api/v1/attendance/hr` | `hr`, `admin`, `super-admin` |
| Manager | `/api/v1/attendance/manager` | `manager`, `hr`, `admin`, `super-admin` |

Middleware chain on both: `authenticate` → `authorize([...])` → `requireFeature('attendance.access')` → per-route `validate(schema, source)`.

---

### 1. POST /api/v1/attendance/{hr|manager}/field-locations

#### Identity & Purpose
- **API Number:** 1
- **Name:** Create Field Location
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/attendance/hr/field-locations` · `/api/v1/attendance/manager/field-locations`
- **Module:** Attendance & Time Tracking
- **Purpose:** Registers an external client site, project facility or vendor location that `field` work-mode staff may legitimately punch from.
- **Business Problem Solved:** Field workers (sales executives, site engineers, delivery agents, service technicians) work at customer premises. Before this, geofencing was hardcoded to the organization's own branches, so every client-site punch was flagged `out_of_bounds`. There was no entity in which to record a client site at all.
- **Why the API Exists:** It supplies the "field half" of composite resolution (§1.3). Without it, a `field` employee resolves to office-only geofencing.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** HR route — `hr`/`admin`/`super-admin`. Manager route — additionally `manager`.
- **Feature Entitlement:** `attendance.access`
- **Tenant Isolation:** `org_id` is stamped from `req.user.orgId`; a payload-supplied `org_id` is stripped.
- **Visibility Scope:** The created row is visible **organization-wide** by design (§1.7).

#### Request Contract
- **Headers:** `Authorization: Bearer <jwt>` (Required), `Content-Type: application/json` (Required)
- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body (JSON):**
  ```json
  {
    "name": "Tata Steel Pune Plant",
    "client_name": "Tata Steel Ltd",
    "latitude": 18.52043,
    "longitude": 73.856743,
    "geofence_radius_meters": 300,
    "timezone": "Asia/Kolkata",
    "address": "Plot 14, MIDC Industrial Area",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "411019"
  }
  ```

#### Field-Level Request Specification
| Field Name | Type | Required / Optional | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `name` | `String` | **Required** | No | None | Min 2, Max 150 chars, trimmed. Must be unique among **active** sites in the org, case-insensitively. |
| `latitude` | `Number` | **Required** | No | None | −90 … 90. Required here unlike office locations — a field site exists only to be geofenced. |
| `longitude` | `Number` | **Required** | No | None | −180 … 180. |
| `client_name` | `String` | Optional | Yes | `null` | Max 150 chars, trimmed. The customer organization's name. |
| `geofence_radius_meters` | `Integer` | Optional | No | **`250`** | 50 … 2000. Mirrors the `ofl_radius_sane` DB `CHECK`, so a value accepted here can never fail at the write. |
| `timezone` | `String` | Optional | No | `'Asia/Kolkata'` | Max 100 chars. Stored for schema symmetry; not yet consulted by the engine. |
| `address` | `String` | Optional | Yes | `null` | Max 1000 chars. |
| `city` | `String` | Optional | Yes | `null` | Max 100 chars. Searchable (API #2). |
| `state` | `String` | Optional | Yes | `null` | Max 100 chars. |
| `country` | `String` | Optional | Yes | `'India'` | Max 100 chars. |
| `pincode` | `String` | Optional | Yes | `null` | Max 20 chars. |

Any other key (`org_id`, `created_by`, `is_active`, `id`, …) is **stripped** by `validateOrThrow` (`stripUnknown: true`) and cannot be injected.

> [!NOTE]
> **Why 250 m and not the office default of 100 m.** Client sites — industrial plants, basement installations, dense urban offices — routinely see 50–150 m of GPS multipath drift. The tight office radius would flag legitimate site visits. The `50–2000 m` band is enforced in the database so no caller can set a radius that swallows a city.

#### Processing & Business Logic
1. **Validation:** `createFieldLocationSchema` via `validateOrThrow`; unknown keys stripped.
2. **Transaction opened** (`sequelize.transaction()`).
3. **Duplicate pre-check:** `findActiveByName(orgId, name)` — case-insensitive — so the caller receives a usable `409` instead of a raw unique-constraint error. The partial unique index remains the authority; two concurrent creates of the same name race past this check and the loser is translated to the same `409` from the `SequelizeUniqueConstraintError`.
4. **Insert** with `org_id` and `created_by` stamped from the token and `is_active: true`.
5. **Commit.**

#### Success Response Contract (`201 Created`)
```json
{
  "success": true,
  "message": "Field location created successfully",
  "data": {
    "id": "9f1c0b33-3333-4333-8333-333333333333",
    "org_id": "2a44f7de-1111-4111-8111-111111111111",
    "name": "Tata Steel Pune Plant",
    "client_name": "Tata Steel Ltd",
    "latitude": "18.52043000",
    "longitude": "73.85674300",
    "geofence_radius_meters": 300,
    "timezone": "Asia/Kolkata",
    "address": "Plot 14, MIDC Industrial Area",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "411019",
    "is_active": true,
    "created_by": "7b02c044-4444-4444-8444-444444444444",
    "updated_by": null,
    "created_at": "2026-10-05T11:20:31.004Z",
    "updated_at": "2026-10-05T11:20:31.004Z",
    "deleted_at": null
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `success` | `Boolean` | No | Always `true` on success. |
| `message` | `String` | No | `"Field location created successfully"`. |
| `data.id` | `UUID` | No | Primary key of the new site. |
| `data.org_id` | `UUID` | No | Tenant, stamped server-side. |
| `data.name` | `String` | No | Site name as stored (trimmed). |
| `data.client_name` | `String` | Yes | Customer organization. |
| `data.latitude` | **`String`** | No | **Returned as a string**, not a number — `DECIMAL(10,8)` via `pg`. |
| `data.longitude` | **`String`** | No | **Returned as a string.** |
| `data.geofence_radius_meters` | `Integer` | No | Effective radius in metres. |
| `data.timezone` | `String` | No | IANA zone. |
| `data.is_active` | `Boolean` | No | Always `true` on create. |
| `data.created_by` | `UUID` | No | The creator — drives edit rights (§1.7). |
| `data.updated_by` | `UUID` | Yes | `null` on create. |
| `data.deleted_at` | `ISO Timestamp` | Yes | `null` while active. |

> [!WARNING]
> `latitude` and `longitude` are **strings** in every response in this feature (`"18.52043000"`), because `numeric` columns are serialized as strings by `pg` to preserve precision. Run them through `parseFloat` before handing them to a map component, or markers will land at `(0,0)` or fail silently.

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — missing `name` / `latitude` / `longitude`, coordinates off the globe, radius outside 50–2000, non-integer radius, any field over its length cap.
- `401 UNAUTHORIZED` — missing, invalid or expired JWT.
- `403 FEATURE_NOT_AVAILABLE` — plan does not include `attendance.access`.
- `409 FIELD_LOCATION_DUPLICATE` — an active site with that name already exists in the organization (case-insensitive).

**UX guidance:** on `FIELD_LOCATION_DUPLICATE`, show the existing site and offer "use this one". Reuse is the entire purpose of org-wide visibility; letting the user rename to force a duplicate through defeats it.

---

### 2. GET /api/v1/attendance/{hr|manager}/field-locations

#### Identity & Purpose
- **API Number:** 2
- **Name:** List / Search Field Locations
- **HTTP Method:** `GET`
- **Purpose:** Paginated, searchable catalog of the organization's client sites.
- **Business Problem Solved:** Managers must be able to find an existing client site before registering a new one; without discovery, org-wide visibility is useless and duplicates proliferate.
- **Real-World Usage:** The Field Management list screen, and the site picker inside the assignment dialog.

#### Authentication & Authorization
Identical to API #1. **No hierarchy filter** — every manager and HR in the tenant sees the same catalog. This is an intentional design decision, not a missing `getAccessibleUserIds` call.

#### Request Contract
- **Path Parameters:** None
- **Query Parameters:**

| Param | Type | Required | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `search` | `String` | Optional | — | Max 150 chars, trimmed, `''` allowed. Case-insensitive partial match across **`name`**, **`client_name`** and **`city`**. |
| `include_inactive` | `Boolean` | Optional | `false` | `true` also returns retired sites. Accepts `true`/`false`/`1`/`0`/`yes`/`no` as strings; the service coerces explicitly (see the note below), so `?include_inactive=false` genuinely excludes retired sites. |
| `page` | `Integer` | Optional | `1` | Min 1. |
| `limit` | `Integer` | Optional | `20` | 1 … **100**. |

> [!NOTE]
> **Why this endpoint coerces its own query params.** Express 5 made `req.query` a getter-only
> property, so the routers' shared `validate(schema, 'query')` helper — which does
> `req.query = validateOrThrow(...)` — has its write-back silently discarded. Validation still
> rejects bad input (the throw happens before the assignment, so `limit=500` is still a `400`), but
> Joi's `convert: true` coercion and `.default()` values never reach the handler. Left unhandled,
> `?include_inactive=false` arrived as the **string** `'false'` — which is truthy — so a caller
> explicitly excluding retired sites was served them, and `limit` was echoed back as `"20"`.
> `getFieldLocations` therefore coerces `page`, `limit` and `include_inactive` itself.
>
> **This is a pre-existing, platform-wide condition** affecting 12 query-validated routes across
> three attendance routers. Only this endpoint has been hardened; treat an explicit `=false` on a
> boolean query param elsewhere in the Attendance module as unreliable until the shared helper is
> fixed, and prefer omitting the param to express "false".

#### Processing & Business Logic
1. Validates the query (`fieldLocationQuerySchema`, source `query`) — rejection works; coercion does not reach the service, so the service coerces (see above).
2. Coerces `page` (min 1), `limit` (1–100, clamped) and `include_inactive`, then `offset = (page - 1) * limit`.
3. `findAndCountAll` scoped to `org_id`, filtered on `is_active` unless `include_inactive`, with the three `lower()` search predicates pushed into SQL, joining the `creator` (id, identifier, display name).
4. Ordered by `name` ascending.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Field locations fetched successfully",
  "data": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "records": [
      {
        "id": "9f1c0b33-3333-4333-8333-333333333333",
        "name": "Tata Steel Pune Plant",
        "client_name": "Tata Steel Ltd",
        "latitude": "18.52043000",
        "longitude": "73.85674300",
        "geofence_radius_meters": 300,
        "city": "Pune",
        "state": "Maharashtra",
        "is_active": true,
        "created_by": "7b02c044-4444-4444-8444-444444444444",
        "creator": {
          "id": "7b02c044-4444-4444-8444-444444444444",
          "identifier": "manager@acme.com",
          "profile": {
            "first_name": "Asha",
            "last_name": "Rao",
            "display_name": "Asha Rao"
          }
        }
      }
    ]
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `data.total` | `Integer` | No | Total matching rows across all pages. |
| `data.page` / `data.limit` | `Integer` | No | Echoed pagination inputs. |
| `data.totalPages` | `Integer` | No | `ceil(total / limit)`. |
| `data.records[]` | `Array` | No | Field location rows, full model shape. |
| `data.records[].creator` | `Object` | Yes | The registering user. Use with the current user id to decide whether to render edit/delete affordances. |

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — `limit` above 100, `page` below 1, `search` over 150 chars.
- `401 UNAUTHORIZED` / `403 FEATURE_NOT_AVAILABLE`.

---

### 3. GET /api/v1/attendance/{hr|manager}/field-locations/:id

#### Identity & Purpose
- **API Number:** 3
- **Name:** Get Field Location Detail
- **HTTP Method:** `GET`
- **Purpose:** One site, its active assignee count, whether the caller may modify it, and — only for those who may — the assignee list.
- **Business Problem Solved:** Retiring or re-pinning a site changes where real people must stand. The caller needs the blast radius before acting.

#### Authentication & Authorization
Identical to API #1, plus a **response-level** authority split described below.

#### Request Contract
- **Path Parameters:** `id` — `UUID`, required (`fieldLocationIdParamSchema`).

#### Processing & Business Logic
1. `findByIdInOrg(id, orgId)` — org-scoped, so another tenant's UUID yields `404`, never a leak.
2. `findActiveByLocation(id)` loads active assignments with assignee profiles.
3. `canSeeAssignees = (location.created_by === requester.id) || isGlobalAdmin(org, requester)`, where the admin check resolves from `user_roles` rather than the JWT.
4. `assignments` is returned only when `canSeeAssignees`; `assigned_user_count` always is.

> [!IMPORTANT]
> **Why the assignee list is withheld.** The site row is org-wide readable so client sites get reused, but the assignee list carries employee names. Returning it to every manager would let any manager enumerate the names of everyone assigned to any client site across the whole organization, including other departments' staff — a roster leak that reuse does not require. The count is what the confirmation dialog needs and it names nobody. A manager who needs one specific person's sites uses API #8, which is hierarchy-scoped.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Field location fetched successfully",
  "data": {
    "location": {
      "id": "9f1c0b33-3333-4333-8333-333333333333",
      "name": "Tata Steel Pune Plant",
      "client_name": "Tata Steel Ltd",
      "latitude": "18.52043000",
      "longitude": "73.85674300",
      "geofence_radius_meters": 300,
      "is_active": true,
      "created_by": "7b02c044-4444-4444-8444-444444444444"
    },
    "assigned_user_count": 7,
    "can_modify": true,
    "assignments": [
      {
        "id": "c4de1a22-2222-4222-8222-222222222222",
        "user_id": "aa11a1f0-1111-4111-8111-111111111111",
        "effective_from": "2026-11-01",
        "effective_to": "2026-11-15",
        "is_active": true,
        "user": {
          "id": "aa11a1f0-1111-4111-8111-111111111111",
          "identifier": "ravi@acme.com",
          "profile": {
            "first_name": "Ravi",
            "last_name": "Kumar",
            "display_name": "Ravi Kumar"
          }
        }
      }
    ]
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Always Present | Description |
| :--- | :--- | :--- | :--- |
| `data.location` | `Object` | **Yes** | The site row. |
| `data.assigned_user_count` | `Integer` | **Yes** | Active assignees. Use for the delete confirmation — it is present even when `assignments` is not. |
| `data.can_modify` | `Boolean` | **Yes** | `true` for HR or the creator. **Gate edit/delete controls on this** rather than recomputing from `created_by`. |
| `data.assignments` | `Array` \| `null` | **No** | The array when `can_modify` is `true`, otherwise **`null`**. Guard every `.map()` against the null case. |
| `data.assignments[].effective_from` / `effective_to` | `String` (`YYYY-MM-DD`) | — | `effective_to: null` means open-ended. |

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — `id` is not a UUID.
- `404 FIELD_LOCATION_NOT_FOUND` — unknown id, or a site belonging to another organization.

---

### 4. PUT /api/v1/attendance/{hr|manager}/field-locations/:id

#### Identity & Purpose
- **API Number:** 4
- **Name:** Update Field Location
- **HTTP Method:** `PUT`
- **Purpose:** Amends a client site's name, coordinates, radius or address.
- **Business Problem Solved:** A client's GPS pin is rarely right the first time, and a radius that is too tight generates false `out_of_bounds` flags for staff who are genuinely on site.

#### Authentication & Authorization
- **Authorization:** **HR admin, or the manager who created the site.** Enforced in the service, not middleware, because the HR-role resolution requires a database read.
- Anyone else receives `403 FIELD_LOCATION_FORBIDDEN`.

#### Request Contract
- **Path Parameters:** `id` — `UUID`, required.
- **Request Body (JSON):** any subset of the create fields. **At least one is required.**
  ```json
  { "geofence_radius_meters": 400, "city": "Pune" }
  ```

#### Field-Level Request Specification
| Field Name | Type | Required | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `String` | Optional | — | Min 2, Max 150. Re-checked for case-insensitive collision, excluding this row. |
| `latitude` | `Number` | Optional | — | −90 … 90. |
| `longitude` | `Number` | Optional | — | −180 … 180. |
| `geofence_radius_meters` | `Integer` | Optional | **none** | 50 … 2000. **No default on update** — omitting it leaves the radius unchanged instead of resetting it to 250. |
| `client_name`, `timezone`, `address`, `city`, `state`, `country`, `pincode` | — | Optional | — | Same caps as create. |

> [!WARNING]
> **`is_active` is NOT an accepted field.** Sending it is a `400 VALIDATION_ERROR`, and sending it alone additionally fails the "at least one field" rule. Retiring a site must deactivate its assignments in the same transaction (§1.6) — only `DELETE` does that. Re-activating a retired site is not supported either; the service refuses to edit an inactive site, and the name is freed on retirement so a replacement can simply be created.

#### Processing & Business Logic
1. Validates the param and body.
2. Opens a transaction and loads the row with `findByIdInOrg(..., forUpdate = true)` — a pessimistic `FOR UPDATE` lock, so a concurrent edit and retirement of the same row serialize rather than the edit landing on an already-retired row.
3. Rejects an inactive site (`400 FIELD_LOCATION_INACTIVE`).
4. Asserts mutation authority (creator short-circuits before the HR lookup).
5. If `name` changed, re-runs the case-insensitive duplicate check excluding this id.
6. Updates, stamping `updated_by`.
7. Commits and returns the updated row.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Field location updated successfully",
  "data": { "id": "9f1c…", "geofence_radius_meters": 400, "city": "Pune", "updated_by": "7b02…", "…": "full row" }
}
```

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — empty body, `is_active` sent, any failing field rule.
- `400 FIELD_LOCATION_INACTIVE` — the site is retired and cannot be edited.
- `403 FIELD_LOCATION_FORBIDDEN` — a manager editing a site they did not create.
- `404 FIELD_LOCATION_NOT_FOUND`.
- `409 FIELD_LOCATION_DUPLICATE` — the new name collides with another active site.

**UX guidance:** warn before saving a coordinate or radius change. The site is shared org-wide; moving the pin changes where every assigned employee must stand. Show `assigned_user_count` from API #3 in the confirmation.

---

### 5. DELETE /api/v1/attendance/{hr|manager}/field-locations/:id

#### Identity & Purpose
- **API Number:** 5
- **Name:** Retire Field Location (Soft Delete + Cascade)
- **HTTP Method:** `DELETE`
- **Purpose:** Retires a client site and unassigns everyone from it, atomically.
- **Business Problem Solved:** Engagements end. A closed site must stop being a valid punch location **and** stop appearing as an active assignment — otherwise HR believes a site is closed while employees still show as assigned to it.

#### Authentication & Authorization
Same as API #4 — HR admin or the creating manager.

#### Request Contract
- **Path Parameters:** `id` — `UUID`, required. No body.

#### Processing & Business Logic
1. Opens a transaction; loads the row `FOR UPDATE`.
2. Asserts mutation authority.
3. **Idempotent short-circuit:** if already inactive, commits and returns `already_deleted: true` with no cascade.
4. `softDeleteById` — `is_active = false`, `deleted_at = NOW()`, `updated_by`, guarded on `is_active = true`. If it affects 0 rows the caller lost a race with a concurrent delete; the winner owns the cascade, so this call returns `already_deleted: true`.
5. **`deactivateByLocationId`** — one bulk `UPDATE` deactivating every active child assignment, returning the count.
6. Commits. Both writes share one transaction: a half-applied retirement is worse than none (verified — a forced cascade failure rolls the parent soft-delete back, leaving both intact).
7. Emits `[ATTENDANCE_AUDIT] {"action":"field_location.deleted", …, "assignments_deactivated": n}`.

> [!NOTE]
> Historical `attendance_logs` and `attendance_records` keep referencing the retired id. A past punch must not retroactively fail a geofence audit on recompute because HR closed the site afterwards. The site name **is** freed for re-registration, because the unique index is partial on `is_active = true`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Field location deleted successfully",
  "data": {
    "id": "9f1c0b33-3333-4333-8333-333333333333",
    "already_deleted": false,
    "assignments_deactivated": 7
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `data.id` | `UUID` | No | The retired site. |
| `data.already_deleted` | `Boolean` | No | `true` when the site was already retired (or a concurrent delete won). Treat as success, not an error. |
| `data.assignments_deactivated` | `Integer` | No | Child assignments deactivated by this call. `0` when `already_deleted` is `true`. |

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — `id` not a UUID.
- `403 FIELD_LOCATION_FORBIDDEN`.
- `404 FIELD_LOCATION_NOT_FOUND`.

**UX guidance:** surface `assignments_deactivated` in the success toast — *"Site retired, 7 employees unassigned."* Those employees fall back to office-only geofencing on their next punch.

---

## 3. Field Assignment APIs (#6–#8)

---

### 6. POST /api/v1/attendance/{hr|manager}/field-assignments

#### Identity & Purpose
- **API Number:** 6
- **Name:** Assign Field Location to Employee
- **HTTP Method:** `POST`
- **Purpose:** Grants one employee the right to punch from one client site, optionally within a date window.
- **Business Problem Solved:** An Area Sales Manager covers four client facilities; a site engineer is deployed to one plant for a fortnight. Both need their punches accepted at those coordinates and nowhere else.
- **Why the API Exists:** It is the only writer of the "field half" of the candidate pool (§1.3). A `field` employee with no assignments resolves to office-only.

#### Authentication & Authorization
- **Authorization:** `getAccessibleUserIds` scoping (§1.7) — **HR for anyone in the org; a manager for active direct reports only; never for themselves.** A plain employee cannot assign at all.
- The check runs **before** the transaction opens, so hierarchy reads never hold a write lock.

#### Request Contract
- **Request Body (JSON):**
  ```json
  {
    "user_id": "aa11a1f0-1111-4111-8111-111111111111",
    "field_location_id": "9f1c0b33-3333-4333-8333-333333333333",
    "effective_from": "2026-11-01",
    "effective_to": "2026-11-15"
  }
  ```

#### Field-Level Request Specification
| Field Name | Type | Required | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `user_id` | `UUID` | **Required** | No | None | Must be a member of the caller's org, and within the caller's hierarchy scope. |
| `field_location_id` | `UUID` | **Required** | No | None | Must be an **active** site in the org. |
| `effective_from` | `String` | Optional | No | today (IST) | **`YYYY-MM-DD` only.** Real calendar date. Inclusive. |
| `effective_to` | `String` | Optional | **Yes** | `null` | **`YYYY-MM-DD` only** or `null` (open-ended). Inclusive. Must be ≥ `effective_from`. |

> [!WARNING]
> **Send dates as plain `YYYY-MM-DD` strings.** `"2026-11-01T00:00:00Z"` → `400`. `"2026-02-31"` → `400`. `"01-11-2026"` → `400`. See §1.8 for the timezone reasoning. Use `format(date, 'yyyy-MM-dd')`, never `date.toISOString()`.

#### Processing & Business Logic
1. **Hierarchy assertion** (pre-transaction).
2. Transaction opens.
3. Site must exist in the org (`404`) and be active (`400`).
4. **Membership check** via `findGeofenceContextForUser` — a UUID from another tenant would otherwise create an assignment row no punch ever reads and nobody can see (`404 EMPLOYEE_NOT_FOUND`).
5. **Duplicate pre-check** `findActiveByUserAndLocation(..., forUpdate = true)` — the `FOR UPDATE` lock serializes two concurrent assignments of the same pair rather than racing to the unique index.
6. Insert with `assigned_by` from the token, `is_active: true`, `effective_from` defaulted to the IST business date.
7. Commit.
8. **Post-commit advisory check:** resolve the assignee's contractual mode; if it is not `field`, compute a non-blocking `work_mode_warning`.

#### Success Response Contract (`201 Created`)
```json
{
  "success": true,
  "message": "Field location assigned successfully",
  "data": {
    "assignment": {
      "id": "c4de1a22-2222-4222-8222-222222222222",
      "org_id": "2a44f7de-1111-4111-8111-111111111111",
      "user_id": "aa11a1f0-1111-4111-8111-111111111111",
      "field_location_id": "9f1c0b33-3333-4333-8333-333333333333",
      "assigned_by": "7b02c044-4444-4444-8444-444444444444",
      "is_active": true,
      "effective_from": "2026-11-01",
      "effective_to": "2026-11-15",
      "created_at": "2026-10-05T11:40:02.113Z",
      "updated_at": "2026-10-05T11:40:02.113Z"
    },
    "work_mode_warning": "Note: this employee's work mode is 'office', not 'field', so field geofencing will not apply until HR changes it."
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `data.assignment` | `Object` | No | The created row. |
| `data.assignment.effective_from` | `String` (`YYYY-MM-DD`) | No | Never a timestamp. Defaults to today (IST) when omitted. |
| `data.assignment.effective_to` | `String` (`YYYY-MM-DD`) | Yes | `null` = open-ended. |
| `data.work_mode_warning` | `String` | **Yes** | **Non-null is NOT an error.** `null` when the assignee is already `field`. |

> [!IMPORTANT]
> **Render `work_mode_warning` when non-null, as an amber inline notice — not an error.** The assignment was created and takes effect the moment HR sets the mode. But a field site on an `office` employee is **inert**: the engine only unions field sites for a field-mode punch. Link to the employee's HR fields so the gap can be closed.

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — missing/non-UUID ids, ISO timestamp or impossible date, inverted window.
- `400 FIELD_LOCATION_INACTIVE` — the site is retired.
- `403 HIERARCHY_VIOLATION` — outside the caller's scope, **or a manager targeting themselves** (the message differs: *"You cannot assign a field location to yourself. Ask an HR admin to assign it."*).
- `404 FIELD_LOCATION_NOT_FOUND` / `404 EMPLOYEE_NOT_FOUND`.
- `409 FIELD_ASSIGNMENT_DUPLICATE` — see below.

> [!NOTE]
> **`FIELD_ASSIGNMENT_DUPLICATE` is date-blind.** `idx_efa_unique_active` covers one active `(org, user, site)` pair **regardless of the effective window**, so a second non-overlapping window for the same pair — Client A in November and again in January — also returns `409`. The message names the existing window and the error body carries `details`:
> ```json
> {
>   "success": false,
>   "message": "This employee already has an active assignment to this field location (2026-11-01 to 2026-11-15). Edit that assignment's dates or remove it before creating another.",
>   "errorCode": "FIELD_ASSIGNMENT_DUPLICATE",
>   "details": { "assignment_id": "c4de…", "effective_from": "2026-11-01", "effective_to": "2026-11-15" }
> }
> ```
> Offer "edit the existing assignment" rather than retrying.

---

### 7. DELETE /api/v1/attendance/{hr|manager}/field-assignments/:assignment_id

#### Identity & Purpose
- **API Number:** 7
- **Name:** Unassign Field Location
- **HTTP Method:** `DELETE`
- **Purpose:** Revokes one employee's right to punch from one client site.
- **Business Problem Solved:** A deployment ends, or a worker moves teams. Their punches must stop being accepted at that client's coordinates.

#### Authentication & Authorization
- **Authorization:** checked against the **assignee**, not against whoever created the assignment — the question is whether this caller may manage that employee *today*. HR for anyone; a manager for direct reports only.

#### Request Contract
- **Path Parameters:** `assignment_id` — `UUID`, required (`fieldAssignmentIdParamSchema`). No body.

#### Processing & Business Logic
1. Transaction opens; loads the assignment `FOR UPDATE`, org-scoped (`404` otherwise).
2. Hierarchy assertion against `assignment.user_id`.
3. Idempotent short-circuit if already inactive.
4. `is_active = false` (soft — the history is preserved, and the same pair can be reassigned later because the unique index is partial).
5. Commit.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Field assignment removed successfully",
  "data": { "id": "c4de1a22-2222-4222-8222-222222222222", "already_inactive": false }
}
```

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — `assignment_id` not a UUID.
- `403 HIERARCHY_VIOLATION`.
- `404 FIELD_ASSIGNMENT_NOT_FOUND` — unknown id, or another tenant's.

---

### 8. GET /api/v1/attendance/{hr|manager}/field-assignments/user/:user_id

#### Identity & Purpose
- **API Number:** 8
- **Name:** Get a User's Field Assignments
- **HTTP Method:** `GET`
- **Purpose:** One employee's complete valid punch area — active client sites **plus** their base office — with their resolved work mode.
- **Business Problem Solved:** Answers "why was this punch flagged?" and "where is this person allowed to clock in?" in one call.

#### Authentication & Authorization
- HR for anyone; a manager for direct reports; **any user for themselves** (the hierarchy check is skipped when `target === requester`).

#### Request Contract
- **Path Parameters:** `user_id` — `UUID`, required (`fieldAssignmentUserParamSchema`).

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Field assignments fetched successfully",
  "data": {
    "user_id": "aa11a1f0-1111-4111-8111-111111111111",
    "work_mode": "field",
    "assigned_office": {
      "id": "6b84a9f5-aaa7-4800-bf73-0f4238cec4c2",
      "name": "Indore HQ"
    },
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

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `data.work_mode` | `String` | Yes | The **normalized, fail-secure** contractual mode: `office` \| `remote` \| `hybrid` \| `field`. A `NULL` profile reads as `office`. Show the field-sites panel only when `field`. |
| `data.assigned_office` | `Object` | **Yes** | The base office. **Part of the valid punch area for a field employee** — render it alongside the client sites, labelled as their base location, not as a separate concept. `null` when the profile has no office. |
| `data.total` | `Integer` | No | Count of active assignments. |
| `data.records[].field_location` | `Object` | No | Coordinates (as strings) and radius, for the map. |
| `data.records[].assigner` | `Object` | Yes | Who granted it. |

#### Error Conditions & Responses
- `400 VALIDATION_ERROR` — `user_id` not a UUID.
- `403 HIERARCHY_VIOLATION` — reading a user outside the caller's scope.

---

## 4. Employee Self-Service API (#9)

---

### 9. GET /api/v1/attendance/my-field-assignments

#### Identity & Purpose
- **API Number:** 9
- **Name:** Get My Field Assignments
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/attendance/my-field-assignments`
- **Purpose:** The caller's own valid punch area.
- **Business Problem Solved:** A field worker flagged `out_of_bounds` otherwise has no way to see where they were *supposed* to be. This makes the geofence visible on the punch screen **before** the flag happens, turning a mysterious HR flag into a self-correctable situation.
- **Real-World Usage:** The mobile punch screen renders the nearest assigned site and its distance before the employee taps Clock In.

#### Authentication & Authorization
- **Authorization:** all org roles (`employee`, `manager`, `hr`, `admin`, `super-admin`), `attendance.access`.
- **Hard-scoped to the caller.** The route injects `req.params.user_id = req.user.id` before the handler, so there is **no** `user_id` input and no way to read another employee's assignments here.

#### Request Contract
None. Headers only.

#### Success Response Contract (`200 OK`)
Identical shape to API #8.

#### Error Conditions & Responses
- `401 UNAUTHORIZED` / `403 FEATURE_NOT_AVAILABLE`.

#### Important Edge Cases
- An employee whose mode is not `field` gets `work_mode` set accordingly and usually `total: 0`. Any assignments present are **inert** until HR changes the mode — do not render them as active geofence area.
- A field employee with **no** sites still punches at the office (zero-field fallback), so `total: 0` with a non-null `assigned_office` is a valid, working configuration — not an error state.
- A site retired after assignment disappears from `records` automatically (the join filters on the site being active).

---

## 5. Existing Endpoints Modified / Extended

### 1. `POST /api/v1/attendance/clock-in` — Work Mode Enforcement & Geofence Provenance

**Request shape:** unchanged. `work_mode` is still accepted (`office` | `remote` | `field` | `hybrid`) but its **semantics changed from authoritative to advisory**:

- A geofenced contract (`office`, `field`) **overrides** the payload and additionally raises `work_mode_claim_mismatch` (medium).
- Only a `hybrid` employee's declaration is honoured. A hybrid employee declaring `'hybrid'` (the value the schema advertises) is treated as *undeclared* — geofenced as office, **no** anomaly.
- `attendance_records.work_mode` stores the **resolved** mode.

> [!IMPORTANT]
> **Recommendation: send `work_mode` only for `hybrid` employees.** Fetch the mode from API #9 and render an office/home toggle only for hybrid. Sending it indiscriminately raises a `work_mode_claim_mismatch` flag against the employee for something the client chose.

**Response:** two additive fields. Nothing was removed or renamed.

```json
{
  "success": true,
  "message": "Clocked in successfully",
  "data": {
    "log_id": "…", "record_id": "…", "session_id": "…",
    "date": "2026-10-05",
    "clock_in_time": "2026-10-05T03:31:12.000Z",
    "work_mode": "field",
    "geofence": {
      "outcome": "in_bounds",
      "evaluated": true,
      "matched_location_id": "9f1c0b33-3333-4333-8333-333333333333",
      "matched_location_type": "field",
      "distance_meters": 42
    },
    "shift": { "name": "General", "start_time": "09:30", "end_time": "18:30", "type": "fixed" },
    "late_minutes": 0, "within_grace": true,
    "is_holiday": false, "is_weekly_off": false
  }
}
```

**Previously:** `record.work_mode` was `data.work_mode || null`, so an employee who omitted the field saved `NULL`, which surfaced as `not_specified` on the HR dashboard. It now always holds a resolved value.

### 2. `POST /api/v1/attendance/clock-out` — Record-Governed Mode & Provenance

**Request shape:** unchanged, and it still **does not accept `work_mode`**. Do not start sending it. The engine reads the mode established at clock-in from the record (§1.2).

**Response:** gains the same `work_mode` and `geofence` fields alongside the existing calculation fields (`total_hours`, `effective_hours`, `late_minutes`, `early_exit_minutes`, `overtime_minutes`, `status`, `half_day_type`, …).

#### The `geofence` Object (both endpoints)
| Field | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `outcome` | `String` | No | `in_bounds` \| `out_of_bounds` \| `missing_coordinates` \| `unresolved` |
| `evaluated` | `Boolean` | No | `false` when no distance check ran (remote, declared WFH, biometric, or unresolved). |
| `matched_location_id` | `UUID` | Yes | The matched location, or the **nearest** one when out of bounds. **Polymorphic** — see §1.5. |
| `matched_location_type` | `String` | Yes | `office` \| `field`. |
| `distance_meters` | `Number` | Yes | Metres to the matched/nearest location. |

#### Suggested Punch-Screen Copy
| `outcome` | Tone | Copy |
| :--- | :--- | :--- |
| `in_bounds` | success | "Clocked in at Tata Steel Pune Plant" |
| `out_of_bounds` | **warning, not error** | "Clocked in — your location is 1.2 km from Tata Steel Pune Plant. This has been flagged for your manager. Submit a regularization if you were at a client site." |
| `missing_coordinates` | warning | "Clocked in without location. Enable location permission so your attendance is not flagged." |
| `unresolved` | neutral | "Clocked in. Your work location is not fully configured — ask HR to complete it." |
| `evaluated: false` | success, no geofence chrome | "Clocked in" |

**The punch always succeeded.** Never render these as a failed action or roll back optimistic UI.

### 3. `POST /api/v1/attendance/regularization` — Work Mode Reconciliation

**Request shape:** unchanged; `work_mode` remains optional. It is now **validated against the employee's contract at submission** rather than silently applied at approval.

| Contract | Accepted `work_mode` |
| :--- | :--- |
| `office` / `on-site` (including a `NULL` profile) | `office`, `on-site` |
| `remote` | `remote` |
| `field` | `field` |
| `hybrid` | `office` **or** `remote` |

New errors: `400 WORK_MODE_NOT_PERMITTED`, `400 INVALID_WORK_MODE`. Messages are employee-facing and name the next step (*"Ask HR to correct your work mode if it is wrong"*) — surface them verbatim.

**Why:** approval copies `request.work_mode` straight into `attendance_records.work_mode`. Unreconciled, an on-site employee flagged `out_of_bounds` could file a regularization declaring `remote`, and approval would relabel the day — retroactively legitimizing the punch and defeating clock-in enforcement entirely.

> [!NOTE]
> This path is deliberately **stricter** than clock-in, which tolerates a declared `'hybrid'`. A punch must never be blocked; a form submission can be rejected, and `'hybrid'` is genuinely ambiguous for one specific day.

**Simplest integration:** omit `work_mode` from the regularization form unless the employee is `hybrid`. Omitting it leaves the record's existing mode untouched, which is almost always correct.

### 4. `POST /api/v1/attendance/{manager|hr}/regularizations/:id/approve` — Geofence Flag Resolution

**Response:** one additive field.

```json
{ "success": true, "regularization_refunded_leave": false, "geofence_anomalies_resolved": 2 }
```

Approving a regularization now resolves that day's geofence flags (`out_of_bounds`, `missing_coordinates`, `geofence_unresolved`, `work_mode_claim_mismatch`) — marking them `is_resolved`, with `resolved_by`, `resolved_at` and notes referencing the request — **inside the approval transaction**.

Previously an approved regularization left the flag standing on the record forever; nothing in the regularization service touched anomalies at all.

Already-resolved rows are skipped, so an earlier resolver's notes are never overwritten. This is safe because geofence types sit outside the detector's reconciliation set, so the recompute that follows approval neither deletes nor re-raises them.

**UX guidance:** show it in the approval confirmation — *"Approved, 2 location flags cleared"* — and refresh the anomalies list, which will have shrunk.

### 5. `PATCH /api/v1/organizations/me/job-profile` & `GET /api/v1/organizations/me/setup-status` — **BREAKING**

> [!CAUTION]
> **This is the only breaking change in the release and requires a coordinated frontend deploy.**

`work_mode` and `location_id` are **no longer accepted** by `PATCH /me/job-profile`. Sending either is `400 VALIDATION_ERROR`; sending *only* those is `400` because no recognized field remains. `400 LOCATION_INACTIVE` is no longer reachable on this endpoint.

`GET /me/setup-status` changed to match:

| Field | Change |
| :--- | :--- |
| `missing_fields[]` | never contains `work_mode` or `location_id` |
| `locked_fields[]` | never contains `work_mode` or `location_id` |
| `current_values` | the `work_mode` and `location_id` **keys are removed** |
| `org_structure.can_set_location` | **removed entirely** |
| `org_structure.locations_count` | kept (still reports org-structure readiness) |
| `is_complete` | can now be `true` while both are blank |

**Why.** Both fields became inputs to geofence *enforcement*, which turns this endpoint into an authorization boundary for them. The fill-once guard is genuinely sound — SQL-enforced on "still `NULL`", so concurrent calls cannot both land — but **once is enough** to escalate:

- `work_mode`: an employee whose mode is `NULL` (precisely the legacy population, since the column is nullable on all three role-profile models) could set it to `remote` and **permanently exempt themselves from geofencing**.
- `location_id`: an employee whose location is `NULL` could **choose their own geofence anchor**, picking whichever office branch sits nearest their home.

Both are now HR-owned, corrected through the existing `PATCH /api/v1/organizations/employees/:id/hr-fields` and the department-transfer endpoint — neither of which an HR can aim at themselves. **No new endpoint was added**; the HR-facing paths already supported both fields.

**Deploy order:** backend-first is safe. The removed inputs fail with a clear `400` rather than silently writing. A frontend still sending them sees a validation error on that wizard step, so ship the frontend change promptly after.

**Frontend action required:**
1. Remove the **Work Mode** and **Office Location** inputs from the self-setup wizard step driven by this endpoint.
2. Delete every reference to `org_structure.can_set_location` — it is `undefined`.
3. Stop blocking wizard completion on either field; add copy pointing the employee at HR.

---

## 6. New Anomaly Types & Severity Changes

These arrive through the **existing** anomaly endpoints — `GET /api/v1/attendance/hr/anomalies`, `GET /api/v1/attendance/manager/team/anomalies`, `GET /api/v1/attendance/my-anomalies`. No new endpoint. Add rendering or they fall through to a default label.

| `type` | `severity` | Status | Meaning | Who should act |
| :--- | :--- | :--- | :--- | :--- |
| `out_of_bounds` | `high` | unchanged | Punched outside every valid location. The description now names the punch side **and** the nearest location with its distance. | Manager / HR — genuine review |
| `missing_coordinates` | `medium` → **`high`** | **CHANGED** | A geofenced employee punched with no GPS | Manager / HR — chase the device |
| `geofence_unresolved` | `medium` | **NEW** | Nothing to check against: no assigned office, no active branch, no assigned site, or the location has no GPS pin | **HR — a configuration gap, not misconduct** |
| `work_mode_claim_mismatch` | `medium` | **NEW** | The punch claimed a mode the contract disallows; the contract was enforced | HR — the profile is wrong, or the client sends a bad value |

> [!IMPORTANT]
> **`geofence_unresolved` must not be styled as misconduct.** It means an administrator has not finished setting up a location. Route it to a "Setup issues" group with a link to the employee's location settings, **not** the disciplinary queue.
>
> **`missing_coordinates` is now `high`** — re-check any severity-based filter, sort or badge threshold.
>
> **Duplicate `out_of_bounds` rows per day are expected and correct.** Clock-in and clock-out each raise their own, so HR can distinguish a shift-start breach (potential false reporting) from a shift-end one (transit home). Each description begins with `Clock-in` or `Clock-out`. **Group geofence anomalies by record for display — do not de-duplicate by type**, or the clock-out breach disappears.

Severity vocabulary is unchanged in shape: `low` | `medium` | `high`.

### Biometric Device Punches

A punch with `source: 'biometric'` carries no GPS — `device.service#_applyPunch` passes none, because the device's fixed `location_id` is the attestation. These punches **skip GPS geofencing entirely**, are treated as `in_bounds`, and raise **no anomaly**. Their provenance records `"reason": "device_attested"`.

Without this carve-out the `missing_coordinates` severity escalation would have converted the entire biometric estate into org-wide HIGH-severity HR inbox noise on release day.

If an HR dashboard shows a geofence column, render device punches as "Device verified" rather than blank or "No location".

---

## 7. Complete Work Mode & Geofence Decision Matrix

The contractual mode is read from the profile and normalized; `on-site` and `NULL` both resolve to `office`.

| Contract | Declared at punch | GPS | Checked against | Result |
| :--- | :--- | :--- | :--- | :--- |
| `office` | anything / omitted | missing | assigned office | accepted, `missing_coordinates` (high) |
| `office` | anything / omitted | inside | assigned office | accepted, `in_bounds` |
| `office` | anything / omitted | outside | assigned office | accepted, `out_of_bounds` (high) |
| `office` | `remote` (forged) | anywhere | assigned office | accepted, geofenced anyway + `work_mode_claim_mismatch` (medium) |
| `remote` | anything | any | nothing | accepted, bypassed |
| `hybrid` | `remote` | any | nothing | accepted, bypassed |
| `hybrid` | `office` / omitted / `hybrid` | inside | assigned office | accepted, `in_bounds` |
| `hybrid` | `office` / omitted / `hybrid` | outside | assigned office | accepted, `out_of_bounds` (high) |
| `hybrid` | `field` | any | assigned office | accepted, geofenced + `work_mode_claim_mismatch` |
| `field` | anything | missing | sites + office | accepted, `missing_coordinates` (high) |
| `field` | anything | inside any | sites + office | accepted, `in_bounds`, nearest match recorded |
| `field` | anything | outside all | sites + office | accepted, `out_of_bounds` (high), nearest recorded |
| any geofenced | — | any | **nothing resolvable** | accepted, `geofence_unresolved` (medium) |
| any | — | n/a (`biometric`) | device attestation | accepted, `in_bounds`, no anomaly |

**Clock-out** follows the same table, but the "Declared" column is `record.work_mode` — the mode established at clock-in — and the payload is never consulted.

A `hybrid` employee who omits `work_mode` is treated as claiming office presence and **is** geofenced — fail-secure, so a punch cannot skip verification by sending less data.

---

## 8. Security, Tenancy & Production Verification

| Security Domain | Implemented Guarantee | Implementation Mechanism |
| :--- | :--- | :--- |
| **Tenant Isolation** | Zero cross-tenant access | Every read and write is bounded by `req.user.orgId`; `findByIdInOrg` is used in place of `findById` on every HTTP-reachable path, so another tenant's UUID yields `404`, never a leak. |
| **Payload Privilege Escalation** | A claimed work mode cannot relax a geofence | The contract is resolved server-side and overrides the payload; the claim is recorded as an anomaly, never honoured. |
| **Self-Service Escalation** | An employee cannot exempt themselves | `work_mode` and `location_id` removed from `SELF_SETUP_FILL_ONCE_FIELDS` and from the Joi schema; both HR-owned. |
| **Retroactive Escalation** | A flagged day cannot be relabelled | Regularization `work_mode` is reconciled against the contract at submission. |
| **Fail-Secure Defaults** | No unconfigured profile is a bypass | `NULL`, unrecognized values and a missing membership row all resolve to `office`; `normalizeWorkMode` returns `null` for unknown input rather than passing it through to a mode switch that would match no geofenced branch. |
| **Fail-Open Elimination** | An unresolvable pool cannot approve a punch | `evaluateGeofence` returns `unresolved`, never `in_bounds`, for an empty or coordinate-less pool. |
| **Field Data Mutation** | One team cannot move another's pin | Edit/retire restricted to HR or `created_by`, with the HR role resolved from `user_roles`, not the JWT. |
| **Roster Privacy** | Assignee names are not org-wide readable | API #3 returns `assignments` only to HR or the creator; the count is always returned and names nobody. |
| **Hierarchy Containment** | A manager cannot reach outside their reports | `getAccessibleUserIds` — one level, excluding global approvers and the requester themselves. |
| **Provenance Integrity** | A client cannot forge a geofence result | A client-supplied `metadata.geofence` is overwritten server-side (verified); other client metadata keys survive. |
| **Cascade Atomicity** | No orphaned assignments | Parent soft-delete and child deactivation share one transaction; a forced cascade failure rolls both back. `is_active` is not an accepted update field, closing the bypass. |
| **Concurrency** | No duplicate records or assignments | `ar_org_user_date_unique_idx` → `409 ALREADY_CLOCKED_IN`; `idx_efa_unique_active` and `idx_ofl_org_name_unique` with `FOR UPDATE` pre-checks and `SequelizeUniqueConstraintError` translation. |
| **Timezone Integrity** | No off-by-one assignment windows | Date bounds compared as `YYYY-MM-DD` IST business-date strings; ISO timestamps rejected at validation; `effective_from NOT NULL`. |
| **Audit Trail** | Retirement is attributable | `[ATTENDANCE_AUDIT] field_location.deleted` with actor, site and child count; `deleted_at` / `updated_by` on the row. |

### Verification Performed

| Layer | Coverage |
| :--- | :--- |
| **Unit suite** | 2923 tests. Failing set byte-identical to the pre-change baseline (14 pre-existing S3 upload tests, unrelated). |
| **Live punches** | 33 real `clockIn`/`clockOut` calls through PostgreSQL 16 across every work mode — including the hybrid clock-out trap end-to-end, the polymorphic `matched_location_id` holding a field-site id, client `metadata.geofence` forgery being overwritten, and concurrent double clock-in yielding exactly one record and one conflict. |
| **Live HTTP** | 47 probes through the real validator → controller → service → repository chain, covering every endpoint, every error code, hierarchy boundaries and the cascade. |
| **Live repository** | 31 probes — how the functional `lower()` search predicates and the date-bounded assignment lookup were confirmed to be valid SQL. |
| **Migrations** | All 72 apply from scratch on a pristine database; the four new ones round-trip `down`/`up`; every `CHECK`, partial index and date bound exercised; the `work_mode` backfill verified to collapse six drifted buckets to three. |

---

## 9. Complete Error Code Catalog

| HTTP Status | Error Code | Description / Trigger Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Any Joi failure: missing `name`/`latitude`/`longitude`; coordinates off the globe; radius outside 50–2000 or non-integer; `is_active` sent to the update endpoint; empty update body; `limit` above 100; `page` below 1; non-UUID path param or id; `effective_from`/`effective_to` not `YYYY-MM-DD`; an impossible calendar date; an inverted effective window. |
| `400` | `FIELD_LOCATION_INACTIVE` | The target site is retired — cannot be edited (API #4) or assigned (API #6). |
| `400` | `WORK_MODE_NOT_PERMITTED` | Regularization stated a work mode the employee's contract disallows. |
| `400` | `INVALID_WORK_MODE` | Regularization stated an unrecognized work-mode token. |
| `401` | `UNAUTHORIZED` | Missing, invalid or expired JWT. |
| `403` | `FEATURE_NOT_AVAILABLE` | Plan does not include `attendance.access`. |
| `403` | `FORBIDDEN` | Caller's role is outside the router's `authorize()` list. |
| `403` | `FIELD_LOCATION_FORBIDDEN` | A manager attempted to edit or retire a site they did not create. |
| `403` | `HIERARCHY_VIOLATION` | Assignment / unassignment / read targeting a user outside the caller's scope, **or a manager targeting themselves** (distinct message). |
| `404` | `FIELD_LOCATION_NOT_FOUND` | Unknown site id, or one belonging to another organization. |
| `404` | `FIELD_ASSIGNMENT_NOT_FOUND` | Unknown assignment id, or another tenant's. |
| `404` | `EMPLOYEE_NOT_FOUND` | The assignment target is not a member of this organization. |
| `409` | `FIELD_LOCATION_DUPLICATE` | An active site with that name already exists in the org (case-insensitive) — on create or rename. |
| `409` | `FIELD_ASSIGNMENT_DUPLICATE` | The employee already holds an **active** assignment to this site, **regardless of effective window**. Carries `details: { assignment_id, effective_from, effective_to }`. |
| `409` | `ALREADY_CLOCKED_IN` | Pre-existing, punch endpoints only. A concurrent duplicate clock-in lost the unique-index race. |
| `403` | `PERIOD_LOCKED` | Pre-existing, punch and regularization endpoints only (`lockService.checkLock`). The business date falls inside a locked payroll period. Not reachable on the field-location or field-assignment endpoints, which do not consult lock periods. |

All errors use the platform envelope:

```json
{ "success": false, "message": "human-readable text", "errorCode": "FIELD_LOCATION_DUPLICATE" }
```

- `details` is present only where documented above (currently only `FIELD_ASSIGNMENT_DUPLICATE`).
- An additional **`stack`** field appears in non-production environments only
  (`NODE_ENV !== 'production'`). Do not build on it, and do not surface it in any UI — it is absent
  in production.

---

## 10. Frontend Implementation Sequence

Ordered by dependency and risk. Step 1 is the only one that breaks an existing screen.

### Step 1 — Onboarding wizard (BREAKING; do first)
- [ ] Remove the **Work Mode** input from the self-service job-profile step.
- [ ] Remove the **Office Location** input from the same step.
- [ ] Remove every use of `org_structure.can_set_location`.
- [ ] Stop treating a blank `work_mode` / `location_id` as blocking self-setup completion.
- [ ] Add copy pointing the employee at HR for both fields.

### Step 2 — Attendance Flags inbox (low effort, prevents silent misrendering)
- [ ] Add labels and icons for `geofence_unresolved` and `work_mode_claim_mismatch`.
- [ ] Route `geofence_unresolved` to a "Setup issues" group, not the disciplinary queue.
- [ ] Re-check any severity filter or sort — `missing_coordinates` is now `high`.
- [ ] Group geofence anomalies **by record**, keeping both the clock-in and clock-out rows.
- [ ] Show `geofence_anomalies_resolved` after a regularization approval and refresh the list.

### Step 3 — Punch screen
- [ ] Call `GET /api/v1/attendance/my-field-assignments` on load; show the field-sites panel only when `work_mode === 'field'`.
- [ ] `parseFloat` all latitude/longitude before use — they are **strings**.
- [ ] Show the office/home toggle (`work_mode: 'office' | 'remote'`) **only** when `work_mode === 'hybrid'`; stop sending `work_mode` for every other mode.
- [ ] Render the `geofence` object using the copy table in §5.
- [ ] **Never** treat a geofence outcome as a failed punch or roll back optimistic UI.
- [ ] Render the resolved `work_mode` from the response, not local state.
- [ ] Render biometric punches as "Device verified".

### Step 4 — Field Management screen (new)
- [ ] List with search (`name` / `client_name` / `city`) and pagination (`limit` ≤ 100).
- [ ] Create form with a **required** map picker and a radius slider (50–2000 m, default 250).
- [ ] Gate edit/delete on `can_modify` from API #3 (or `created_by` / HR role on the list).
- [ ] Handle `assignments: null` on the detail response — withheld unless `can_modify`.
- [ ] Do **not** send `is_active` on update; use `DELETE` to retire.
- [ ] Delete confirmation showing `assigned_user_count`; success toast showing `assignments_deactivated`.
- [ ] Handle `FIELD_LOCATION_DUPLICATE` by offering the existing site.
- [ ] Warn before saving a coordinate or radius change.

### Step 5 — Assignment screen (new)
- [ ] Employee picker: all org members for HR; **direct reports only** for a manager; exclude self in both.
- [ ] Date pickers emitting **`YYYY-MM-DD` strings**, never `toISOString()`.
- [ ] Both window ends inclusive; `effective_to` optional (open-ended).
- [ ] Render `work_mode_warning` as an amber notice, not an error.
- [ ] On `FIELD_ASSIGNMENT_DUPLICATE`, show the existing window from `details` and link to editing that assignment.

### Step 6 — Regularization form
- [ ] Offer `work_mode` only for `hybrid` employees; omit it otherwise.
- [ ] Surface `WORK_MODE_NOT_PERMITTED` / `INVALID_WORK_MODE` messages verbatim.

### Step 7 — Dashboards
- [ ] Expect only `office` | `remote` | `hybrid` | `field` | `null` from attendance work-mode groupings.
- [ ] Remove any special-case that merged the `office` and `on-site` buckets — migration `00072` normalized them.

---

## 11. Related Documents

| Document | Contents |
| :--- | :--- |
| `public/md_attendance/7_work_mode_and_field_geofencing_api.md` | The integration guide: same endpoints, organized for day-to-day reference. |
| `public/md_updates/2026-10-05_work_mode_enforcement_api_changes.md` | Condensed change record — what broke, what was added, deploy order. |
| `public/md_updates/2026-10-05_work_mode_and_field_geofencing_architecture_decisions.md` | The architectural decisions, the audit findings behind each rule, and the full rationale. |
| `public/md_attendance/3_user_attendance_api.md` | The base clock-in / clock-out contract, updated in place. |
| `public/md_attendance/4_manager_attendance_api.md`, `5_hr_attendance_api.md` | The routers these endpoints were added to. |
| `public/md_organization/4_org_employee_api.md` | §11 — the self-service job-profile and setup-status contracts, updated in place. |

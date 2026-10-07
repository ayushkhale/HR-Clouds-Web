# Work Mode & Field Geofencing Architecture Decisions

**Document Date:** October 5, 2026
**Document Version:** 2.0 (Code-Verified Senior Principal Backend & Security Audit)
**Document Type:** Architectural Review, Gap Analysis, Verified Findings & Implementation Plan
**Target Path:** `public/md_updates/2026-10-05_work_mode_and_field_geofencing_architecture_decisions.md`
**Status:** Specification complete. **No production code has been changed by this revision** — this document is the authoritative plan of record for the implementation.

**Purpose:** Formalizes the problem statements, security edge cases, database design, vocabulary unification, and finalized business logic for Work Mode enforcement (`on-site`, `hybrid`, `remote`, `field`) and Multi-Site Field Geofencing across the HRMS platform.

---

## 0. Revision Note — What Changed in v2.0

Version 1.2 was written from design discussion. Version 2.0 was re-derived by reading the live
codebase line by line. Every claim below is now either **VERIFIED** against a cited file and line,
or **CORRECTED** where the document asserted behavior the code does not have.

Eight v1.2 statements were factually wrong and are corrected in place (see Section 4A).
Thirteen previously undocumented defects and risks were found and are added (see Section 4B).
Two of the new findings are **release-blocking** and are marked as such.

---

## 1. Executive Summary & Intent

The attendance engine (`src/modules/attendance/services/clock.service.js`) validates clock-in and
clock-out punches against the employee's assigned office location, falling back to all active
company offices. **`_validateGeofence` (line 1199) does not reference `work_mode` at a single
point** — verified. Work mode is today a pure reporting string, written once at clock-in and never
consulted by the geofence engine.

This document records the comprehensive vulnerability audit, the finalized architectural decisions,
and the layer-by-layer implementation plan for Work Mode enforcement and Multi-Site Field
Geofencing.

### Release-Blocking Findings (must be fixed in the same change)

1. **Fail-open geofence.** `isWithinGeofence` returns `true` when handed an empty location array
   (`src/common/utilities/geofence.utils.js`). Combined with `_validateGeofence`'s
   `if (validLocations.length > 0)` wrapper, an employee with no resolvable location is
   **silently approved with no anomaly at all**. Introducing `field` mode multiplies this hole,
   because an unassigned field worker resolves to an empty pool.
2. **Biometric punch anomaly flood.** `device.service.js` `_applyPunch` passes
   `{ at, log, source: 'biometric' }` with **no latitude or longitude**. Every biometric punch
   therefore already raises `missing_coordinates`. Decision 2 upgrades that severity to `high`,
   which would convert the entire biometric estate into org-wide HIGH-severity HR inbox noise on
   the day of release.

---

## 2. Problem Statements & Bug Audit

### Bug 1: Payload / Claimed Mode API Manipulation — VERIFIED
* **Problem:** `POST /api/v1/attendance/clock-in` accepts `work_mode` from the client
  (`user_attendance.validator.js:9`). An employee whose contractual profile is `on-site` can forge
  `work_mode: "remote"` and bypass office geofencing from home.
* **Root Cause:** No server-side reconciliation between `employee_profiles.work_mode` and the punch
  payload.
* **Verified:** `clock.service.js:194` writes `work_mode: data.work_mode || null` with zero
  validation against the profile.

### Bug 2: The "Turn-Off GPS" Loophole — VERIFIED
* **Problem:** With location permission denied the client sends `latitude: null, longitude: null`.
  The engine accepts the punch and raises an anomaly with `severity: 'medium'`.
* **Verified:** `clock.service.js:1220-1230`, `severity: 'medium'` hardcoded.
* **Root Cause:** Disabling GPS is cheaper than being caught: `medium` noise beats a `high`
  `out_of_bounds` flag.

### Bug 3: Absence of Field Location Management — VERIFIED
* **Problem:** No entity exists for client sites, project facilities, or vendor locations, and no
  way to assign staff to them.
* **Verified:** Geofencing resolves exclusively through
  `organizationRepository.getLocationById` / `getLocationsByOrgId`, both of which query
  `organization_locations` only.

### Bug 4: The "Hybrid Ambiguity" Dilemma — VERIFIED (as a design gap)
* **Problem:** Blanket office geofencing on a `hybrid` employee produces false `out_of_bounds`
  flags on legitimate WFH days; ignoring geofencing lets them falsely claim office attendance.
* **Root Cause:** No mechanism distinguishes a declared WFH punch from a declared in-office punch.

### Bug 5: Multi-Branch Fallback Hopping — VERIFIED
* **Problem:** `clock.service.js:1214` — when `profile.location_id` is null the engine falls back to
  **all active office branches in the organization**.
* **Impact:** In a multi-city org (Indore, Mumbai, Delhi) an unassigned employee punches in at any
  branch unflagged.
* **Aggravating factor (new, see Finding N4):** the employee can *choose* that `location_id`
  themselves through self-service while it is blank.

### Bug 6: Redundant Data & Sync Drift — VERIFIED, with precedent
* **Problem:** Managing offices and field sites in duplicate tables creates sync bugs on coordinate,
  radius, address, and deactivation changes.
* **Historical precedent:** This organization has already paid this cost once. Migration
  `00022-deprecate-attendance-locations.js` **dropped** a duplicate `attendance_locations` table,
  repointed `attendance_logs.location_id` and `attendance_devices.location_id` at
  `organization_locations`, and had to NULL out orphaned rows to do it. Decision 4's
  no-duplication stance is therefore not a preference — it is a repeat-offense guard.

### Bug 7: Client-Side GPS Spoofing & DevTools Mocking — Deferred
* **Problem:** Mobile GPS mocking apps and the Chrome DevTools Sensors panel can forge valid
  coordinates. Browsers cannot cryptographically attest device GPS.
* **Disposition:** Phase 2 (Decision 11).

---

## 3. Finalized Architectural Decisions & Technical Specifications

### Decision 1: Server-Side Profile Mode Enforcement (Solving Bug 1)
* The backend **never relies on user-provided payload claims** for enforcement.
* On every punch the system resolves the contractual profile:
  `profile = user.employee_profile || user.manager_profile || user.hr_profile`
  `assignedMode = normalizeWorkMode(profile.work_mode)` → `'office' | 'hybrid' | 'remote' | 'field'`.
* **Enforcement matrix:**
  * `assignedMode === 'office'` — office geofence is enforced. A payload claiming `'remote'` is
    **ignored for enforcement purposes** (it does not relax the geofence) and the record stores the
    resolved mode, not the claim.
  * `assignedMode === 'remote'` — geofence bypassed.
  * `assignedMode === 'hybrid'` — governed by the declared punch mode (Decision 3).
  * `assignedMode === 'field'` — validated against the composite field pool (Decisions 4 and 5).
* **Correction vs v1.2:** v1.2 specified rejecting a mismatched claim with **HTTP 403**. That is
  rejected. Blocking a punch over a payload field the employee's own UI may send by default causes
  attendance loss and wage disputes — the same reasoning that governs Decision 2. The claim is
  **downgraded to advisory**: it is overridden, recorded in `attendance_logs.metadata` for audit,
  and when it conflicts with the contractual mode a `work_mode_claim_mismatch` anomaly
  (`severity: 'medium'`) is raised. Enforcement comes from the geofence outcome, not from a 403.

### Decision 2: Missing GPS Handling (Solving Bug 2)
* **No blocking of punches.** Blocking creates employee lockout, missing attendance, and payroll
  disputes.
* If `assignedMode` is `'office'` or `'field'` and GPS is absent, accept the punch and raise:
  * `type: 'missing_coordinates'`
  * `severity: 'high'` (upgraded from `'medium'`)
  * `description: '<actionType> missing GPS coordinates while <assignedMode> geofencing is required'`
* **Mandatory carve-out (Finding N2):** this upgrade applies **only** to GPS-bearing sources
  (`web`, `mobile`, `api`). A punch with `source === 'biometric'` is physically attested by the
  device's own `location_id` and must bypass GPS geofence evaluation entirely. Without this
  carve-out the severity upgrade floods the HR inbox with a HIGH anomaly for every device punch in
  the organization.

### Decision 3: Hybrid Punch Logic (Solving Bug 4)
* No automated flags for legitimate remote punches by hybrid workers.
* **Clock-in** inspects the declared `data.work_mode`:
  1. Declared `'remote'` — employee is at home. No flag.
  2. Declared `'office'` (or omitted — see Nuance D) — office geofence strictly enforced;
     outside the radius raises `out_of_bounds` (`severity: 'high'`).
* **Clock-out** must read `record.work_mode`, never `data.work_mode` (Nuance B).
* The resolved punch mode is persisted to `attendance_records.work_mode` **as a normalized token**
  (Finding N5) and surfaced on the HR and Manager dashboards.

### Decision 4: Field Architecture — "Composite Resolution" (Solving Bugs 3 and 6)
* **Every office location is inherently a valid field location; not every field location is an
  office.** Office rows are never duplicated into the field table.
* For an employee whose resolved mode is `field`, the valid coordinate pool is resolved dynamically
  as the union of:
  1. active, date-effective assigned field sites from `organization_field_locations`, and
  2. the assigned office location from `organization_locations` (or the Bug 5 fallback pool when
     `location_id` is null).
* **Benefit:** editing an office pin or radius in `organization_locations` propagates to field
  validation with zero sync drift.
* **Zero-Field Fallback — CORRECTED.** v1.2 claimed that a field employee with no assigned sites
  "can punch at the office without error, but punching outside the office will raise
  `out_of_bounds`." That is **false under the current utility**: when the resolved pool is empty,
  `isWithinGeofence` returns `true` and `_validateGeofence`'s `length > 0` guard skips anomaly
  creation altogether — the punch is silently approved. The refactor must therefore introduce an
  explicit third outcome, `unresolved`, distinct from `in_bounds` and `out_of_bounds`:
  * pool empty — raise `geofence_unresolved` (`severity: 'medium'`), accept the punch, and log the
    reason. This is an HR data-completeness defect, not employee misconduct, and must never be
    silently swallowed nor punish the employee as `out_of_bounds`.

### Decision 5: Multiple Field Assignments per Employee & Manager
* Applies to both employees **and managers** (e.g. Area Sales Managers covering several client
  facilities).
* A user may hold multiple simultaneous active assignments (Client Site A, Client Site B, Project
  Facility C, plus Head Office).
* On both clock-in and clock-out the engine computes the distance to **every** candidate in the
  pool, and:
  * within the radius of any candidate — `in_bounds`, and the **nearest matching** candidate is
    recorded as the matched location;
  * outside all candidates — `out_of_bounds` (`severity: 'high'`), recording the **nearest**
    candidate and its distance so HR can see how far off the punch was.

### Decision 6: Clock-Out Geofence Enforcement for Field Workers
* Geofence validation runs on both clock-in and clock-out.
* A field worker clocking out away from all assigned sites and the office records an
  `out_of_bounds` anomaly for manager/HR review.
* **Operational nuance:** the description states the punch side explicitly
  (`'Clock-out occurred outside assigned field sites and office'`), so HR can distinguish a
  shift-start breach (potential false reporting) from a shift-end breach (transit or commute).

### Decision 7: Manager & HR Hierarchy Scoping for Field Sites
* **Creation scope (org-wide visibility):** a field location created by a Manager or HR is stored
  against `org_id` and is visible organization-wide, so other managers reuse existing client sites
  instead of creating duplicates.
* **Assignment scope (hierarchy-constrained):** assignment is gated by
  `accessControl.getAccessibleUserIds(orgId, requesterUser)`.
* **CORRECTED — the hierarchy is one level deep, not a tree.** v1.2 stated managers may assign to
  subordinates "directly or indirectly in the reporting hierarchy tree." Verified false.
  `src/common/utilities/hierarchy_access.utils.js` performs a **single, non-recursive** query:
  `UserReportingMapping.findAll({ where: { reporting_to_id: requester.id, is_active: true } })`.
  It returns direct reports only. Contract:
  * `null` — global approver (`hr`, `admin`, `super-admin`): no filter, any user in the org.
  * `[]` — plain employee, or a manager with no active direct reports.
  * `[ids]` — active **direct** reports, minus any who themselves hold a global-approver role.
  **Decision:** keep the one-level semantics. It is the single source of truth already used by
  anomaly resolution, regularization approval, and the Leave module; silently giving field
  assignment a deeper reach than approval would create an inconsistent authorization surface.
  Multi-level delegation, if ever wanted, is a separate recursive-CTE change to the shared resolver
  and must be applied to every consumer at once.
* **Manager self-assignment — CORRECTED mechanism.** v1.2 framed this as a rule to be written.
  It is in fact **structurally impossible already**: `getAccessibleUserIds` never includes the
  requester's own id, so a manager's own `user_id` can never pass the assignment filter. The
  implementation must simply *not* special-case it back in. A manager needing a field assignment is
  assigned by HR. This is consistent with Rule 10 (managers and HRs report only to HR).

### Decision 8: Invite Form Simplicity (Default Assignment)
* The onboarding/invite wizard does **not** require field-site selection at invite time.
* The office location chosen in Step 3 acts as the default base location.
* Field sites are assigned post-onboarding through a dedicated Field Management & Assignment screen.

### Decision 9: GPS Drift & Field Buffer Radii
* Client sites (industrial plants, basements, dense urban offices) routinely see 50m–150m GPS
  multipath drift.
* **Policy:** offices keep the tight `100m` default (`organization_locations.geofence_radius_meters`
  default is 100, verified); field locations take a configurable radius with a recommended default
  of **250m**, bounded `50m–2000m` by validation. The exact value stays an HR/Manager decision.

### Decision 10: Multi-Branch Fallback & Null `location_id` Policy (Addressing Bug 5)
* Accurate office assignment is an HR administrative responsibility.
* **Engine decision:** when `profile.location_id` is null the engine preserves the fallback to all
  active branches, to avoid employee lockouts, **and** now raises
  `geofence_unresolved` (`severity: 'medium'`) once per punch so the data gap is visible in the HR
  inbox rather than only in a log line nobody reads. v1.2's "operational warning log" is
  insufficient — a `console.log` is not an operational control.

### Decision 11: Deferred Scope — GPS Spoofing & DevTools Protection (Addressing Bug 7)
* Device-level mock-location detection (fake GPS apps, Android mock provider flags, DevTools
  overrides) is **explicitly deferred to Phase 2**.
* Phase 1 relies on W3C Geolocation coordinates, Haversine geofencing, and
  `missing_coordinates` / `out_of_bounds` / `geofence_unresolved` anomalies for HR review.

### Decision 12 (NEW): `work_mode` Becomes a Security Control, Not a Profile Preference
Once geofence enforcement keys off `work_mode`, every write path to that column becomes an
authorization boundary. Three writers exist today and two are unguarded (Findings N3, N4).
**Decision:** `work_mode` is reclassified as an HR-owned field.
* Employee self-service may no longer set it (remove from `SELF_SETUP_FILL_ONCE_FIELDS`).
* Regularization may no longer promote an employee-stated mode into the record without profile
  reconciliation.
* `location_id` is reclassified identically, because it selects the geofence anchor.

---

## 4. Senior Backend Engineering Nuances & Critical Edge Cases

### 4A. Corrections to Version 1.2

| Ref | v1.2 Claim | Verified Reality |
| :-- | :-- | :-- |
| C1 | `geofence.utils.js` lives in `src/modules/attendance/utilities/` and exports `haversineDistance` | Path is `src/common/utilities/geofence.utils.js`; exports are `calculateDistance` and `isWithinGeofence`. No `haversineDistance` symbol exists |
| C2 | Zero-field fallback raises `out_of_bounds` outside the office | Empty pool returns `true` (fail-open) and the `length > 0` guard skips anomaly creation entirely |
| C3 | `getAccessibleUserIds` walks the hierarchy "directly or indirectly" | Single non-recursive query; direct reports only |
| C4 | Manager self-assignment must be forbidden by a new rule | Already structurally impossible; the resolver never returns the requester's own id |
| C5 | Approving a regularization resolves the `out_of_bounds` anomaly (Nuance H, stated as fact) | **Not implemented.** `regularization.service.js` contains no anomaly logic whatsoever. Restated below as planned work |
| C6 | `attendance_logs.location_id` can carry field-site provenance | Hard FK `attendance_logs_org_loc_id_fkey` → `organization_locations(id)` (migration 00022). Writing a field id raises a FK violation |
| C7 | Payload/profile mismatch should return HTTP 403 | Rejected as a lockout risk; downgraded to advisory override plus anomaly (Decision 1) |
| C8 | `employee_field_assignments.effective_from` may be nullable | Nullable + `Op.lte` silently drops the row (SQL NULL comparison is never true). Must be `NOT NULL`, matching the `employee_shift_assignments` precedent |

### Nuance A: Vocabulary Normalization (`'on-site'` vs `'office'`) — VERIFIED, wider than documented
The drift spans two vocabularies across six files:

| Vocabulary | Location |
| :-- | :-- |
| `'on-site'` | `employee_profiles.model.js:149`, `manager_profiles.model.js:150`, `hr_profiles.model.js:156`, `invitation.validator.js:33`, `self_service.validator.js:69`, migration `00017` |
| `'office'` | `user_attendance.validator.js:9` (clock-in), `user_attendance.validator.js:37` (regularization), `hr_attendance_read.service.js` |

Migration `00039-add-work-mode-to-attendance-regularizations.js` documents the split in its own
header comment and deliberately declined to pin either side — confirming this is known drift, not
an accident. `attendance_records.work_mode` is `STRING(20)` with **no ENUM and no CHECK
constraint**, so nothing at the database layer prevents both tokens coexisting in one column.

Direct equality (`profile.work_mode === data.work_mode`) cannot work. A centralized helper is
required, and it must be the **only** comparison path:

```javascript
// src/modules/attendance/utilities/work_mode.utils.js
'use strict'

const WORK_MODES = Object.freeze({ OFFICE: 'office', REMOTE: 'remote', HYBRID: 'hybrid', FIELD: 'field' })
const GEOFENCED_MODES = Object.freeze([WORK_MODES.OFFICE, WORK_MODES.FIELD])

/**
 * Collapses both platform vocabularies onto the attendance token set.
 * Profile enums say 'on-site'; the punch validator says 'office'. Returns null for an
 * unrecognized value so the caller applies the fail-secure default explicitly rather than
 * inheriting a silent passthrough.
 * @param {string|null|undefined} mode
 * @returns {'office'|'remote'|'hybrid'|'field'|null}
 */
const normalizeWorkMode = (mode) => {
  if (!mode) return null
  const m = String(mode).toLowerCase().trim()
  if (m === 'on-site' || m === 'onsite' || m === 'on_site' || m === 'office') return WORK_MODES.OFFICE
  if (m === 'remote' || m === 'hybrid' || m === 'field') return m
  return null
}

/** Fail-secure resolution: anything unknown or absent is treated as on-site. */
const resolveAssignedMode = (profileWorkMode) => normalizeWorkMode(profileWorkMode) || WORK_MODES.OFFICE

module.exports = { WORK_MODES, GEOFENCED_MODES, normalizeWorkMode, resolveAssignedMode }
```

Note the deliberate change from v1.2's helper: v1.2 ended with `return m`, passing **any**
unrecognized string straight through. A typo'd or hostile value such as `'Remote '` or
`'anything'` would then flow into the mode switch and match no geofenced branch — bypassing
validation. The verified helper returns `null` for unknown input and forces the caller through
`resolveAssignedMode`'s fail-secure default.

### Nuance B: The Clock-Out "Missing Payload Work Mode" Trap — VERIFIED
* `clockInSchema` accepts `work_mode` (`user_attendance.validator.js:9`); `clockOutSchema`
  **does not** (lines 13–20). Verified. This is correct and must stay — an employee cannot change
  their contractual mode halfway through a day.
* **The bug this prevents:** if `_validateGeofence` keyed off `data.work_mode` at clock-out, a
  hybrid worker who legitimately worked remotely would have `data.work_mode === undefined` at
  18:00. The engine would read that as an office punch and raise `out_of_bounds` **every single
  evening**.
* **Required behavior:** on clock-out the engine reads **`record.work_mode`**, the mode established
  at clock-in. `applyClockOut` already loads the record before validation
  (`clock.service.js:239`, `_requireOpenRecord`) and passes it into `_validateGeofence`
  (line 300), so the value is in hand with no extra query.
* **Ordering caveat:** `recordRepository.updateById` at line 295 writes only `clock_out_time` and
  `last_clock_out_log_id`; it does not touch `work_mode`. The in-memory `record` instance passed to
  `_validateGeofence` therefore still carries the clock-in mode. Safe today — but the refactor must
  not start writing `work_mode` in that update, or it would overwrite the value it is about to read.

### Nuance C: Fail-Secure Profile Defaults — VERIFIED
`work_mode` is `allowNull: true` on all three profile models (employee:148, manager:149, hr:155),
so legacy and auto-provisioned rows carry `NULL`. On `NULL`:
* default `assignedMode` to `'office'`;
* **never** default to `'remote'`, which would make every unconfigured profile a permanent
  geofence bypass.
This is implemented by `resolveAssignedMode` above, not by scattered `|| 'office'` expressions.

### Nuance D: Clock-In Record Defaulting — VERIFIED at the exact line
`clock.service.js:194` reads `work_mode: data.work_mode || null`. An on-site employee who omits
`work_mode` saves `NULL` into `attendance_records.work_mode`. Downstream,
`hr_attendance_read.service.js:1043` buckets that as `'not_specified'` on the HR dashboard.

**The fix:** when `data.work_mode` is absent, persist the **resolved profile mode**. Precisely:

| `assignedMode` | `data.work_mode` | Persisted `record.work_mode` |
| :-- | :-- | :-- |
| `office` | anything or omitted | `'office'` (claim cannot relax it) |
| `remote` | anything or omitted | `'remote'` |
| `field` | anything or omitted | `'field'` |
| `hybrid` | `'remote'` | `'remote'` |
| `hybrid` | `'office'` | `'office'` |
| `hybrid` | omitted | `'office'` (fail-secure: an undeclared hybrid punch is treated as an office claim and is geofenced) |

### Nuance E: Time-Bounded Field Assignments & Timezone Integrity — VERIFIED, with a precedent
Temporary deployments ("at Client X from Nov 1 to Nov 15") need date bounds. Comparing a SQL `DATE`
against a JavaScript `new Date()` produces off-by-one errors at UTC+05:30 — 00:30 IST is 19:00 UTC
on the previous day.

**The fix** is already an established pattern in this codebase and must be reused verbatim.
`employee_shift_assignments.repository.js#findActiveAssignmentWithIncludes` filters:

```javascript
effective_from: { [Op.lte]: date },
[Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: date } }]
```

where `date` is the `YYYY-MM-DD` business-date string. Field assignment lookup must take
`record.date` / `dateStr` — already normalized by `clock.service.js#_businessDate` — and never a
`Date` object.

**Schema consequence (Correction C8):** that query shape requires `effective_from NOT NULL`.
`employee_shift_assignments.effective_from` is `allowNull: false`. If
`employee_field_assignments.effective_from` were left nullable as v1.2 proposed, every row with a
`NULL` start date would fail `Op.lte` — SQL `NULL <= '2026-10-05'` is `NULL`, not `TRUE` — and the
assignment would be **silently invisible to the geofence engine**, with no error anywhere. Specify
`NOT NULL DEFAULT CURRENT_DATE`.

### Nuance F: Historical Integrity & Multi-Punch Provenance — VERIFIED with one correction
A deactivated client site must not retroactively fail past geofence audits on recompute, and an
employee may clock in at Client A and out at Client B.

1. **Punch-level provenance** goes in `attendance_logs.metadata`, confirmed a `JSONB` column
   (`attendance_logs.model.js:70`) — zero migration overhead, as v1.2 stated.

   ```json
   {
     "geofence": {
       "evaluated": true,
       "outcome": "in_bounds",
       "assigned_mode": "field",
       "declared_mode": "field",
       "matched_location_id": "uuid...",
       "matched_location_type": "field",
       "matched_location_name": "Tata Steel Pune",
       "distance_meters": 42,
       "candidate_count": 4
     }
   }
   ```

2. **Record-level summary** for fast dashboard queries, added to `attendance_records`:
   * `matched_location_id UUID NULL`
   * `matched_location_type VARCHAR(20) NULL` — `'office'` | `'field'`
   * `distance_to_location_meters INT NULL`

3. **CORRECTION C6 — `attendance_logs.location_id` cannot be reused.** Migration `00022` added the
   hard constraint `attendance_logs_org_loc_id_fkey` referencing `organization_locations(id)`
   with `ON DELETE SET NULL`. Writing a `organization_field_locations.id` into that column raises a
   foreign-key violation and aborts the punch transaction. Consequences:
   * `attendance_logs.location_id` stays office-only. Field provenance lives in `metadata`.
   * `attendance_records.matched_location_id` is **polymorphic across two tables** and must be
     declared as a **plain `UUID` with no `REFERENCES` clause**, disambiguated by
     `matched_location_type`. A declarative FK is impossible here; this is a deliberate, documented
     exception to the project's FK convention, and the reason is recorded in the migration comment.

4. **Join caveat (Finding N13):** `attendance_logs` has **no `record_id` column**. Punch-level
   metadata is reachable only via `attendance_records.first_clock_in_log_id` /
   `last_clock_out_log_id`, via `attendance_sessions.clock_in_log_id` / `clock_out_log_id`, or by
   `(user_id, timestamp)`. Any HR provenance screen must join through one of those, not through a
   non-existent `attendance_logs.record_id`.

### Nuance G: Shared Field Location Mutation & Soft-Delete Safety — VERIFIED, with a schema correction
Field locations are shared org-wide (Decision 7), so mutation must be contained:
1. **Edit permission:** HR Admin, or the original creator (`created_by === userId`).
2. **Soft delete with explicit cascade:** verified correct — PostgreSQL `ON DELETE CASCADE` fires
   only on a physical `DELETE`. Setting `is_active = false` triggers nothing, so child
   `employee_field_assignments` rows must be deactivated by an **explicit statement inside the same
   transaction**, or every assigned field worker silently keeps punching against a retired site.
3. **CORRECTED — one soft-delete predicate, not two.** v1.2 proposed both `is_active` **and**
   `deleted_at`. The sibling table `organization_locations` has **neither `deleted_at` nor
   `paranoid: true`** — it uses `is_active` alone. Carrying two flags invites divergence (a row
   `is_active = true` with `deleted_at` set, and every query author guessing which to filter).
   **Decision:** `is_active` is the **single authoritative query predicate**, matching the sibling.
   `deleted_at` is retained as an audit timestamp only, written alongside `is_active = false`, and
   Sequelize `paranoid` is explicitly **OFF** so no query silently auto-filters on it. Historical
   logs referencing a retired location remain fully intact.

### Nuance H: Regularization Interaction with Field Geofences — CORRECTED: NOT IMPLEMENTED
v1.2 described this flow as existing behavior. Verified false: `regularization.service.js` contains
**no anomaly handling at all** — `grep` for `anomal` in that file returns only `work_mode` lines.
An approved regularization today leaves the `out_of_bounds` flag standing forever.

Restated as **planned work**:
1. Employee submits an Attendance Regularization naming the client and justification in `reason`.
2. On approval, geofence anomalies for that `(record_id, date)` are marked `is_resolved = true`,
   `resolved_by`, `resolved_at`, and `resolution_notes` referencing the regularization id —
   **inside the approval transaction**.
3. The punch history is preserved; only payroll hours are regularized.

This is safe to implement because `anomaly.service.js#_reconcileDetectedAnomalies` scopes itself to
`DETECTED_TYPES`, which deliberately **excludes** `missing_coordinates` and `out_of_bounds` (see
the module's own header comment). A recompute will therefore not resurrect a geofence anomaly HR
has resolved.

### 4B. New Findings (Not Present in Version 1.2)

#### N1 — Offices with NULL coordinates flag every punch `out_of_bounds` HIGH. **Severity: HIGH**
`organization_locations.latitude` and `longitude` are both `allowNull: true`. In `isWithinGeofence`,
a location with NULL coordinates yields `NaN` from `parseFloat` and hits `continue`. If **all**
candidates lack coordinates the loop completes and returns `false` — producing a
`severity: 'high'` `out_of_bounds` anomaly for a correctly located employee whose HR simply never
dropped a GPS pin. This is the exact inverse of the fail-open hole in N7 and must be fixed in the
same pass: a candidate with unusable coordinates is **not a candidate**, and a pool that contains
no usable candidate resolves to `unresolved`, never `out_of_bounds`.

#### N2 — Biometric punches have no GPS; the severity upgrade floods the HR inbox. **Severity: HIGH (release-blocking)**
`device.service.js#_applyPunch` calls `clockService[applier](orgId, userId, { at: ts, log, source: 'biometric' }, transaction)`.
No `latitude`, no `longitude`. `_validateGeofence` reads `data.latitude == null` and raises
`missing_coordinates` for **every biometric punch already today**, at `medium`. Decision 2's upgrade
to `high` makes that an org-wide HIGH-severity flood on release day.
**Fix:** the biometric log already carries `location_id: device.location_id` — authoritative
physical attestation stronger than client GPS. Skip GPS geofence evaluation when
`source === 'biometric'`, record
`metadata.geofence = { evaluated: false, reason: 'device_attested', matched_location_id: <device.location_id>, matched_location_type: 'office' }`,
and treat the punch as `in_bounds`.

#### N3 — Regularization is an unguarded third writer of `record.work_mode`. **Severity: HIGH**
`regularization.service.js:285` executes `if (request.work_mode) recordFields.work_mode = request.work_mode`,
where the value originates from `regularizationRequestSchema` (`user_attendance.validator.js:37`),
which accepts `'office' | 'remote' | 'field' | 'hybrid'` **with no profile reconciliation**. An
on-site employee flagged `out_of_bounds` can file a regularization declaring `work_mode: 'remote'`;
on approval the record is relabelled remote, retroactively legitimizing the punch. This defeats
Decision 1 after the fact.
**Fix:** run the stated mode through `normalizeWorkMode` and reconcile it against the profile at
approval time, exactly as clock-in will. A mode the profile does not permit is rejected with a
clear validation error at submission, before a manager wastes time approving it.

#### N4 — Employee self-service can set its own `work_mode` and `location_id`. **Severity: HIGH**
`PATCH /api/v1/organizations/me/job-profile` (`self_service.routes.js:35` →
`organization.service.js#completeMyJobProfile`) accepts `work_mode` and `location_id` via
`SELF_SETUP_FILL_ONCE_FIELDS` (`organization.service.js:47-50`). The guard is genuinely fill-once
and SQL-enforced on "still `NULL`" — concurrency-safe, verified. **But once is enough:**
* any employee whose `work_mode` is `NULL` (precisely the legacy population of Nuance C) can set
  it to `'remote'` and permanently exempt themselves from geofencing;
* any employee whose `location_id` is `NULL` can **choose their own geofence anchor**, selecting
  whichever branch sits nearest their home — which weaponizes Bug 5 rather than merely tolerating it.

The source comment at `organization.service.js:43` even names `location_id` as feeding the
"attendance geofence", so the coupling is known but its security consequence was not.
**Fix (Decision 12):** remove `work_mode` and `location_id` from `SELF_SETUP_FILL_ONCE_FIELDS` and
from `fieldValidation_CompleteMyJobProfile`. Both become HR-owned, corrected through
`PATCH /employees/:id/hr-fields` and the department-transfer endpoint. This is a **breaking API
change requiring its own frontend change record.**

#### N5 — Dashboards group on the raw `work_mode` string. **Severity: MEDIUM**
`attendance_records.repository.js#getWorkModeDistribution` does
`group: ['date', 'work_mode']` on the raw column. Because `attendance_records.work_mode` is an
unconstrained `STRING(20)`, persisting the profile's `'on-site'` token would split one logical mode
into two dashboard buckets (`'office'` and `'on-site'`), silently corrupting every work-mode report.
**Fix:** the write path persists **only** normalized tokens. Back this with a `CHECK` constraint on
`attendance_records.work_mode` (`IN ('office','remote','hybrid','field')`, NULL allowed for
history) so drift cannot reappear. A data backfill normalizing existing rows is required and is
listed as Migration 4.

#### N6 — `_validateGeofence` runs a heavy join inside the write transaction. **Severity: MEDIUM (performance)**
On every punch, inside the open clock transaction, `_validateGeofence` calls
`organizationRepository.getEmployeeById`, which joins `UserRole` + `Role` + `User` + `UserProfile`
+ `EmployeeProfile` + `ManagerProfile` + `HrProfile`, each role profile further including
`OrganizationLocation` and `OrganizationDepartment` — roughly a nine-table join to read two scalar
columns (`work_mode`, `location_id`). A second query then fetches the location. Adding field
resolution would make it four to five round trips while the transaction holds the
`attendance_records` row.
**Fix:** add a narrow repository read returning only `{ work_mode, location_id, role_key }` for the
resolved role profile, and resolve the candidate pool in a single query with a join. Target: at most
two queries inside the transaction, down from today's two and the naive design's five.

#### N7 — `isWithinGeofence` is fail-open on an empty pool. **Severity: HIGH (release-blocking)**
`src/common/utilities/geofence.utils.js`:

```javascript
const isWithinGeofence = (userLat, userLon, locations) => {
  if (!locations || locations.length === 0) {
    return true          // <-- fail-OPEN
  }
```

Defensible when geofencing was advisory and an org might have configured no locations at all.
Indefensible once `field` mode exists, because an unassigned field worker resolves to an empty pool
and is approved from anywhere with **no anomaly** (the caller's `if (validLocations.length > 0)`
guard also skips anomaly creation). `_validateGeofence` must stop depending on the sentinel.
**Fix:** leave `isWithinGeofence` untouched for its existing callers and the existing test suite,
and add an explicit three-state evaluator that the clock service uses instead:

```javascript
/**
 * Resolves a punch against a candidate pool, returning the nearest match and an explicit outcome.
 * Unlike isWithinGeofence, an empty or coordinate-less pool returns 'unresolved' rather than
 * silently approving the punch (fail-open) or condemning it as out_of_bounds (false positive).
 * @returns {{ outcome: 'in_bounds'|'out_of_bounds'|'unresolved', matched: object|null,
 *             distanceMeters: number|null, candidateCount: number }}
 */
const evaluateGeofence = (userLat, userLon, locations) => { /* ... */ }
```

#### N8 — Geofence anomalies are never deduplicated. **Severity: MEDIUM**
`anomaly.service.js#createAnomaly` is a blind `INSERT`, and geofence types are deliberately excluded
from `DETECTED_TYPES`, so `_reconcileDetectedAnomalies` never touches them. A day with both punches
out of bounds yields **two** `out_of_bounds` rows for the same `(record_id, date)`, distinguishable
only by description prose. There is no unique index on `attendance_anomalies`.
**Decision:** this is acceptable and in fact desirable — Decision 6 depends on HR distinguishing a
clock-in breach from a clock-out breach. But it must be made explicit rather than incidental: add a
`punch_side` discriminator to the anomaly `description` (already the case) and, in the HR inbox
read model, group geofence anomalies by `(record_id, type)` for display. Do **not** add a partial
unique index on `(record_id, type)`, which would suppress the clock-out breach entirely.

#### N9 — `_businessDate` hardcodes `Asia/Kolkata` while locations carry a timezone. **Severity: LOW (known limitation)**
`clock.service.js#_businessDate` is `dayjs(at).tz('Asia/Kolkata')`, yet
`organization_locations.timezone` exists as a per-location column defaulting to `Asia/Kolkata`.
A multi-timezone organization would mis-date punches near midnight. Out of scope for this change —
recorded because Nuance E's date-bound correctness inherits whatever `_businessDate` returns, and
any future per-location timezone work must revisit field assignment bounds at the same time.

#### N10 — Concurrent double-punch is already safe; keep it that way. **Severity: INFORMATIONAL**
`applyClockIn` performs a `findByDate` pre-check and then relies on the unique index
`ar_org_user_date_unique_idx (org_id, user_id, date)`, catching `SequelizeUniqueConstraintError` and
mapping it to `409 ALREADY_CLOCKED_IN` (`clock.service.js:201-204`). A regression test exists at
`tests/unit/attendance/concurrent_clock_in_409.test.js`. The stale-open-shift guard
(`PREVIOUS_SHIFT_OPEN`) covers overnight shifts.
**Constraint on the refactor:** all new field-assignment and field-location reads must take the
caller's `transaction` and must be issued **after** the record insert, preserving today's ordering.
Doing geofence resolution before the insert would widen the window in which two concurrent punches
both pass validation.

#### N11 — Migration numbering. **Severity: INFORMATIONAL**
Highest applied migration is `00068-add-department-head-to-hr-profiles.js`. `00065` is absent from
the sequence (unused). New migrations therefore start at **`00069`**.

#### N12 — `organization_field_locations` should mirror the sibling's `timezone` column. **Severity: LOW**
`organization_locations` carries `timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata'`.
The field-location table should carry the same column for schema symmetry and to avoid a second
migration when N9 is addressed.

#### N13 — `attendance_logs` has no `record_id`. **Severity: INFORMATIONAL**
Covered in Nuance F item 4; repeated here so it is not missed when building the HR provenance view.

---

## 5. Master Work Mode & Geofencing Matrix

Normalized `assignedMode` is derived by `resolveAssignedMode(profile.work_mode)`;
`'on-site'` and `NULL` both resolve to `office`.

| Assigned Mode | Declared Punch Mode | GPS | Target Pool | Outcome |
| :-- | :-- | :-- | :-- | :-- |
| `office` | any / omitted | missing | assigned office | accepted; `missing_coordinates` (HIGH) |
| `office` | any / omitted | inside radius | assigned office | accepted; `in_bounds` |
| `office` | any / omitted | outside radius | assigned office | accepted; `out_of_bounds` (HIGH) |
| `remote` | any | present or missing | none (bypassed) | accepted; `in_bounds` |
| `hybrid` | `remote` | present or missing | none (bypassed) | accepted; `in_bounds` (legitimate WFH) |
| `hybrid` | `office` or omitted | inside radius | assigned office | accepted; `in_bounds` |
| `hybrid` | `office` or omitted | outside radius | assigned office | accepted; `out_of_bounds` (HIGH) |
| `field` | any | missing | field sites + office | accepted; `missing_coordinates` (HIGH) |
| `field` | any | inside any site | field sites + office | accepted; `in_bounds`, nearest match recorded |
| `field` | any | outside all sites | field sites + office | accepted; `out_of_bounds` (HIGH), nearest candidate recorded |

### Additional states introduced by this audit

| Condition | Outcome |
| :-- | :-- |
| Geofenced mode, pool empty (no assigned site, no assigned office, no active branch) | accepted; `geofence_unresolved` (MEDIUM) — HR data gap, never `out_of_bounds` (N7) |
| Geofenced mode, every candidate has NULL coordinates | accepted; `geofence_unresolved` (MEDIUM) — never `out_of_bounds` (N1) |
| `source === 'biometric'` | accepted; `in_bounds`, device-attested via `device.location_id`; GPS geofence skipped, no anomaly (N2) |
| Declared mode conflicts with contractual mode | claim overridden by profile; accepted; `work_mode_claim_mismatch` (MEDIUM); geofence applied per contractual mode (Decision 1) |

**Punch acceptance is unconditional across every row.** No geofence state blocks a punch. This is
the deliberate central invariant: attendance loss and wage disputes cost more than a flag an HR
reviews.

---

## 6. Database Schema Architecture

### A. New Table: `organization_field_locations`

```sql
CREATE TABLE organization_field_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    client_name VARCHAR(150),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geofence_radius_meters INT NOT NULL DEFAULT 250,
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    pincode VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ofl_radius_sane CHECK (geofence_radius_meters BETWEEN 50 AND 2000),
    CONSTRAINT ofl_lat_range CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ofl_lon_range CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_ofl_org ON organization_field_locations(org_id);
CREATE INDEX idx_ofl_org_active ON organization_field_locations(org_id, is_active);

-- Decision 7 reuse guard: two managers must not register the same client site twice.
CREATE UNIQUE INDEX idx_ofl_org_name_unique
    ON organization_field_locations(org_id, lower(name))
    WHERE is_active = true;
```

Design notes, all deliberate:
* `latitude` / `longitude` are **`NOT NULL`** here, unlike `organization_locations` where they are
  nullable. A field site exists *only* to be geofenced; permitting NULL would reproduce Finding N1
  in the new table on day one.
* `geofence_radius_meters` defaults to `250` per Decision 9, with a `CHECK` enforcing the
  `50m–2000m` band so no caller can set a radius that swallows a city.
* `timezone` included per Finding N12.
* `is_active` is the sole query predicate; `deleted_at` is audit-only and Sequelize `paranoid`
  stays off (Nuance G).
* The partial unique index on `lower(name)` enforces Decision 7's reuse intent in the database
  rather than hoping two managers coordinate.

### B. New Table: `employee_field_assignments`

```sql
CREATE TABLE employee_field_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field_location_id UUID NOT NULL REFERENCES organization_field_locations(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT efa_date_order CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX idx_efa_unique_active
    ON employee_field_assignments(org_id, user_id, field_location_id)
    WHERE is_active = true;

CREATE INDEX idx_efa_lookup
    ON employee_field_assignments(org_id, user_id, is_active, effective_from, effective_to);

CREATE INDEX idx_efa_by_location
    ON employee_field_assignments(field_location_id, is_active);
```

Design notes:
* **`effective_from NOT NULL DEFAULT CURRENT_DATE`** — Correction C8. Nullable would make
  `Op.lte` silently drop the row.
* `effective_to` stays nullable, meaning "open-ended", matched by the
  `[Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: date } }]` precedent.
* `efa_date_order` rejects an inverted window at the database level.
* `idx_efa_unique_active` is partial on `is_active = true`, so a site can be unassigned and later
  reassigned without colliding with the historical row.
* `idx_efa_by_location` supports the Nuance G cascade: deactivating a site must find its children
  without a sequential scan.
* The unique index is ordered `(org_id, user_id, field_location_id)` so it also serves the
  org-scoped per-user lookup; `idx_efa_lookup` covers the date-bounded read on the hot punch path.

### C. `attendance_records` Additions (Provenance)

```sql
ALTER TABLE attendance_records
    ADD COLUMN matched_location_id UUID,                  -- deliberately NO foreign key: polymorphic
    ADD COLUMN matched_location_type VARCHAR(20),
    ADD COLUMN distance_to_location_meters INT;

ALTER TABLE attendance_records
    ADD CONSTRAINT ar_matched_location_type_chk
    CHECK (matched_location_type IS NULL OR matched_location_type IN ('office', 'field'));
```

`matched_location_id` carries **no `REFERENCES` clause** — it points at either
`organization_locations.id` or `organization_field_locations.id`, disambiguated by
`matched_location_type` (Correction C6). PostgreSQL cannot express a two-target FK, and migration
`00022` proves the alternative is worse: a single-target FK forced a destructive
`UPDATE ... SET location_id = NULL` to repair orphans. The migration must carry this rationale as a
comment so no later developer "fixes" the missing constraint.

### D. `attendance_records.work_mode` Hardening

```sql
-- Normalize legacy drift before constraining (Finding N5).
UPDATE attendance_records SET work_mode = 'office' WHERE lower(work_mode) IN ('on-site', 'onsite', 'on_site');

ALTER TABLE attendance_records
    ADD CONSTRAINT ar_work_mode_chk
    CHECK (work_mode IS NULL OR work_mode IN ('office', 'remote', 'hybrid', 'field'));
```

`NULL` remains legal for historical rows that predate this change; new writes always set a value
(Nuance D). The same normalization and `CHECK` is applied to
`attendance_regularizations.work_mode`, whose migration `00039` comment explicitly left the column
unconstrained pending exactly this decision.

---

## 7. Logic Flow: Geofence Resolution

```
                        [Punch arrives: clock-in or clock-out]
                                         |
                        source === 'biometric' ?  --- yes --> in_bounds (device-attested
                                         |                    via device.location_id); no anomaly
                                         no
                                         |
                 assignedMode = resolveAssignedMode(profile.work_mode)
                        ('on-site' and NULL both resolve to 'office')
                                         |
          +------------------------------+------------------------------+
          |                              |                             |
     ['remote']                     ['hybrid']               ['office' or 'field']
          |                              |                             |
   bypass; in_bounds        clock-in or clock-out ?                     |
                                         |                             |
                           +-------------+-------------+               |
                           |                           |               |
                      [clock-in]                 [clock-out]           |
                           |                           |               |
                 declared data.work_mode        read record.work_mode   |
                  === 'remote' ?                  === 'remote' ?        |
                      /      \                      /      \           |
                    yes       no                  yes       no         |
                     |         |                   |         |         |
            bypass; in_bounds  +-------------------+---------+---------+
                                                   |
                                      Build candidate pool
                                                   |
                        assignedMode === 'field' ? --- yes --> active, date-effective
                                   |                           field sites + assigned office
                                   no
                                   |
                         assigned office, else all active branches
                                   |
                        Drop candidates with NULL/NaN coordinates  (N1)
                                   |
                        Pool empty ? --- yes --> geofence_unresolved (MEDIUM)  (N7)
                                   |
                                   no
                                   |
                        Coordinates missing ? --- yes --> missing_coordinates (HIGH)
                                   |
                                   no
                                   |
                   distance <= radius for ANY candidate ?
                                /              \
                              yes               no
                               |                 |
                   in_bounds; record       out_of_bounds (HIGH);
                   nearest match           record nearest candidate
                               |                 |
                               +--------+--------+
                                        |
                  Persist provenance: attendance_logs.metadata.geofence
                  and attendance_records.matched_location_* (summary)
```

---

## 8. Implementation Plan

Sequenced per the mandated order: **Migration → Model → Repository → Validator → Service →
Controller → Route → module index**. Each step names its verification gate.

### Phase 1 — Database Migrations

Starting number **`00069`** (Finding N11).

**`00069-create-organization-field-locations.js`**
* `createTable('organization_field_locations', ...)` per Section 6A, inside a single explicit
  `queryInterface.sequelize.transaction()`, matching the style of `00022`.
* Add both regular indexes and the partial unique index on `(org_id, lower(name)) WHERE is_active`
  via raw `sequelize.query` (Sequelize's `addIndex` cannot express a functional partial index).
* `down`: `dropTable`.
* **Verify:** `npm run db:migrate` then `npm run db:migrate:status`; `\d organization_field_locations`
  shows three `CHECK` constraints and three indexes.

**`00070-create-employee-field-assignments.js`**
* `createTable` per Section 6B, one transaction.
* Partial unique index and the two lookup indexes via raw query.
* `down`: `dropTable`.
* **Verify:** inserting a duplicate active `(org_id, user_id, field_location_id)` raises a unique
  violation; inserting `effective_to < effective_from` raises `efa_date_order`.

**`00071-add-geofence-provenance-to-attendance-records.js`**
* `addColumn` the three provenance columns, add `ar_matched_location_type_chk`.
* Comment block recording why `matched_location_id` has no FK, citing migration `00022`.
* `down`: `removeColumn` all three, drop the constraint.
* **Verify:** `down` then `up` round-trips clean.

**`00072-normalize-and-constrain-work-mode.js`**
* `UPDATE attendance_records` and `UPDATE attendance_regularizations` normalizing
  `on-site`/`onsite`/`on_site` → `office`.
* Add `ar_work_mode_chk` and the matching constraint on `attendance_regularizations`.
* `down`: drop both constraints; the data normalization is **not** reverted (it is a repair, and
  reintroducing drift would be the regression).
* **Verify:** `SELECT DISTINCT work_mode FROM attendance_records` returns only the four tokens and
  `NULL`; inserting `'on-site'` is now rejected.

### Phase 2 — Models

Models are **auto-discovered**: `models.index.js` walks `MODEL_ROOTS` recursively for `*.model.js`,
requires each, registers it under `model.name`, and then calls every `model.associate(db)`.

> **Correction to the brief:** there is **no central association block** in `models.index.js` to
> edit. Associations belong in each model's own `associate(models)` static, exactly as
> `employee_shift_assignments.model.js` does. Placing the two new files under
> `src/modules/attendance/models/` registers them automatically. Also note `models.index.js` throws
> `Duplicate model detected` on a name collision — the names below must be unique across all modules.

**`src/modules/attendance/models/organization_field_locations.model.js`**
* `sequelize.define('OrganizationFieldLocations', ...)`, `tableName: 'organization_field_locations'`,
  `underscored: true`, `createdAt: 'created_at'`, `updatedAt: 'updated_at'`.
* **`paranoid` explicitly omitted** (Nuance G) with a comment stating `is_active` is the predicate
  and `deleted_at` is audit-only.
* `associate`: `belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' })`,
  `belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' })`,
  `hasMany(models.EmployeeFieldAssignments, { foreignKey: 'field_location_id', as: 'assignments' })`.

**`src/modules/attendance/models/employee_field_assignments.model.js`**
* `effective_from`: `DataTypes.DATEONLY, allowNull: false` — mirrors
  `employee_shift_assignments.model.js` exactly (Correction C8).
* `associate`: `belongsTo` Organization, User (`user_id` as `user`), User (`assigned_by` as
  `assigner`), and `OrganizationFieldLocations` (`field_location_id` as `field_location`).
* **Verify:** `node -e "const db=require('./src/infrastructure/postgres-sql/models.index'); console.log(!!db.OrganizationFieldLocations, !!db.EmployeeFieldAssignments)"`
  prints `true true` with no duplicate-model throw.

### Phase 3 — Repositories (DB access only, ES6 classes, `forUpdate` support)

**`src/modules/attendance/repositories/organization_field_locations.repository.js`**
* `findById(id, transaction, forUpdate)` — `lock: transaction.LOCK.UPDATE` when both set, per the
  `employee_shift_assignments.repository.js` pattern.
* `findActiveByOrg(orgId, { search, page, limit }, transaction)`
* `findActiveByIds(ids, orgId, transaction)`
* `findByNameInOrg(orgId, name, transaction)` — pre-check for the reuse guard, so the user gets an
  `AppError` instead of a raw unique violation.
* `create / updateById / softDeleteById(id, userId, transaction)` — the last setting
  `is_active: false, deleted_at: new Date(), updated_by: userId`.

**`src/modules/attendance/repositories/employee_field_assignments.repository.js`**
* **`findActiveForUserOnDate(orgId, userId, dateStr, transaction)`** — the hot punch-path read.
  Reuses the verified date-bound shape:
  ```javascript
  where: {
    org_id: orgId,
    user_id: userId,
    is_active: true,
    effective_from: { [Op.lte]: dateStr },
    [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: dateStr } }]
  },
  include: [{
    model: OrganizationFieldLocations,
    as: 'field_location',
    required: true,
    where: { is_active: true },
    attributes: ['id', 'name', 'client_name', 'latitude', 'longitude', 'geofence_radius_meters']
  }]
  ```
  `dateStr` is always the `YYYY-MM-DD` business date (Nuance E) — never a `Date`.
  `required: true` with the nested `where` makes one join do the work of two queries (Finding N6).
* `findActiveByUser(orgId, userId, transaction)` — management screen listing.
* `findActiveByLocation(fieldLocationId, transaction)`
* `create / updateById`
* **`deactivateByLocationId(fieldLocationId, userId, transaction)`** — the Nuance G cascade, a
  single bulk `UPDATE ... SET is_active = false WHERE field_location_id = ? AND is_active = true`,
  returning the affected count for the audit log.
* **`deactivateByUserAndLocation(orgId, userId, fieldLocationId, transaction)`** — unassign.

**Also add, to serve Finding N6:**
`organizationRepository.findGeofenceContextForUser(orgId, userId, transaction)` returning only
`{ role_key, work_mode, location_id }` plus the location's coordinates, replacing the nine-table
`getEmployeeById` join on the punch path.

> `getProfileIncludes()` already joins `location` but with `attributes: ['id','name','is_active']` —
> no coordinates — which is why `_validateGeofence` needs its second query today. Widening those
> attributes would change every `getEmployeeById` consumer's payload, so a dedicated narrow read is
> the correct move (Finding N7 note).

### Phase 4 — Utilities

**`src/modules/attendance/utilities/work_mode.utils.js`** — new. `WORK_MODES`, `GEOFENCED_MODES`,
`normalizeWorkMode`, `resolveAssignedMode`, exactly as listed in Nuance A, returning `null` on
unknown input.

**`src/common/utilities/geofence.utils.js`** — **additive only.** Add `evaluateGeofence` returning
`{ outcome, matched, distanceMeters, candidateCount }`, skipping candidates whose coordinates do
not parse (Finding N1) and returning `'unresolved'` on an empty effective pool (Finding N7).
**Do not modify `isWithinGeofence`** — it has existing callers and a committed test suite
(`tests/unit/attendance/geofence_calculation.test.js`), and changing its empty-array sentinel would
alter behavior well outside this change.

### Phase 5 — Service Layer

**`src/modules/attendance/services/clock.service.js`**
1. `_resolveGeofenceContext(orgId, userId, dateStr, transaction)` — new private. One narrow profile
   read, `resolveAssignedMode`, and for `field` mode one joined assignment read. Returns
   `{ assignedMode, candidates, officeFallbackUsed }`.
2. `_validateGeofence(...)` — rewritten around `assignedMode`:
   * `source === 'biometric'` — record device-attested provenance, return (Finding N2).
   * `remote`, or `hybrid` resolving to a remote punch — record `evaluated: false`, return.
   * otherwise build the pool, call `evaluateGeofence`, and branch on the three outcomes, raising
     `missing_coordinates` (HIGH) / `out_of_bounds` (HIGH) / `geofence_unresolved` (MEDIUM).
   * write `metadata.geofence` onto the punch log and the three summary columns onto the record,
     both via the caller's `transaction`.
3. `applyClockIn` — line 194 becomes the resolved, **normalized** mode per the Nuance D table.
   Raise `work_mode_claim_mismatch` (MEDIUM) when the claim conflicts (Decision 1). Keep
   `_validateGeofence` **after** the record insert (Finding N10).
4. `applyClockOut` — pass `record.work_mode` as the declared mode; never read `data.work_mode`
   (Nuance B). Do not add `work_mode` to the line-295 update (Nuance B caveat).

**`src/modules/attendance/services/anomaly.service.js`**
* Register `geofence_unresolved` and `work_mode_claim_mismatch` as known types.
* Leave `DETECTED_TYPES` untouched — geofence types must stay outside reconciliation so a recompute
  never resurrects an HR-resolved flag (Nuance H).
* Add `resolveGeofenceAnomaliesForRecord(recordId, resolverUserId, notes, transaction)` for the
  regularization hook.

**`src/modules/attendance/services/regularization.service.js`**
* Reconcile `request.work_mode` against the profile before the line-285 write; normalize it
  (Finding N3).
* On approval, call `resolveGeofenceAnomaliesForRecord` inside the existing approval transaction
  (Nuance H, now real work rather than documentation).

**`src/modules/attendance/services/field_location.service.js`** — new.
* `createFieldLocation(orgId, actorUser, payload)` — duplicate-name pre-check, then create.
* `updateFieldLocation(...)` — permission gate: HR/admin/super-admin, or `created_by === actor.id`
  (Nuance G), else `AppError(403, ..., 'FIELD_LOCATION_FORBIDDEN')`.
* `deleteFieldLocation(...)` — **one explicit transaction**: soft-delete the location, then
  `deactivateByLocationId` for the children, then commit. PostgreSQL `ON DELETE CASCADE` does not
  fire on an `UPDATE`, so this cascade is application-owned or it does not happen.
* `assignFieldLocation(orgId, actorUser, { user_id, field_location_id, effective_from, effective_to })` —
  gate on `getAccessibleUserIds`: `null` passes anything in-org; otherwise `user_id` must be in the
  returned array, which structurally excludes self-assignment (Decision 7).
* `unassignFieldLocation(...)`, `listFieldLocations(...)`, `listUserAssignments(...)`.

**`src/modules/organization/services/organization.service.js`**
* Remove `'work_mode'` and `'location_id'` from `SELF_SETUP_FILL_ONCE_FIELDS` (Finding N4,
  Decision 12). Update the surrounding comment to record that both are now HR-owned because they
  are geofence inputs.

### Phase 6 — Validators

**`src/modules/attendance/validators/hr_attendance.validator.js`** and
**`manager_attendance.validator.js`** — extend, do not create parallel files, since routing is
already split by actor:
* `createFieldLocationSchema` — `name` (2–150, required), `client_name` optional,
  `latitude` (−90…90, required), `longitude` (−180…180, required),
  `geofence_radius_meters` (integer 50–2000, default 250), address/city/state/country/pincode
  optional, `timezone` optional.
* `updateFieldLocationSchema` — same fields, all optional, `.min(1)`.
* `assignFieldLocationSchema` — `user_id` uuid required, `field_location_id` uuid required,
  `effective_from` / `effective_to` as `YYYY-MM-DD` strings (**string pattern, not `Joi.date()`** —
  `Joi.date()` coerces to a `Date` and reintroduces the Nuance E timezone bug), with
  `effective_to >= effective_from` via `Joi.ref`.
* `fieldLocationIdParamSchema`, `fieldLocationQuerySchema` (search, page, limit).

**`src/modules/organization/validators/self_service.validator.js`** — remove `work_mode` and
`location_id` from `fieldValidation_CompleteMyJobProfile` and from its `.or()` list and message
(Finding N4).

### Phase 7 — Controllers

Thin handlers in `hr_attendance.controller.js` and `manager_attendance.controller.js`, matching the
verified house style exactly — `try { ... } catch (error) { next(error) }`, and
`res.status(...).json({ success: true, message: '...', data })`:
`handlePostFieldLocation` (201), `handleGetFieldLocations`, `handleGetFieldLocationById`,
`handlePutFieldLocation`, `handleDeleteFieldLocation`, `handlePostFieldAssignment` (201),
`handleDeleteFieldAssignment`, `handleGetUserFieldAssignments`.

### Phase 8 — Routes

Both route files already apply `authenticate`, `authorize([...])`,
`requireFeature('attendance.access')`, and a local `validate(schema, source)` helper. Append:

```
HR      (src/modules/attendance/routes/hr_attendance.routes.js)
        POST   /field-locations
        GET    /field-locations
        GET    /field-locations/:id
        PUT    /field-locations/:id
        DELETE /field-locations/:id
        POST   /field-assignments
        DELETE /field-assignments/:id
        GET    /field-assignments/user/:user_id

Manager (src/modules/attendance/routes/manager_attendance.routes.js)
        POST   /field-locations          (org-wide create, Decision 7)
        GET    /field-locations
        PUT    /field-locations/:id      (creator-or-HR gate in the service)
        POST   /field-assignments        (direct reports only, Decision 7)
        DELETE /field-assignments/:id
        GET    /field-assignments/user/:user_id
```

Mounted automatically — `attendance.index.js` already mounts both routers under
`/api/v1/attendance/hr` and `/api/v1/attendance/manager`. **No change to `attendance.index.js` is
required.** Hierarchy enforcement stays in the service, where `getAccessibleUserIds` lives; it is
not duplicated as route middleware.

### Phase 9 — Documentation

* Update `public/md_attendance/` with the new endpoints (mandated by Rule 8: docs must match code).
* Create a **separate dated change record** for the breaking self-service change (Finding N4):
  `work_mode` and `location_id` disappearing from `PATCH /organizations/me/job-profile` will break
  any frontend that renders those inputs in the setup wizard. This is the one genuinely breaking
  API change in the plan and needs its own frontend notice.

---

## 9. Verification & Testing Checklist

Conventions, verified from the existing suite: `node:test` + `node:assert/strict`, pure-function
tests with no live database, run via `npm test`.

### 9.1 `normalizeWorkMode` / `resolveAssignedMode` (new: `tests/unit/attendance/work_mode_normalization.test.js`)

| Input | Expected `normalizeWorkMode` | Expected `resolveAssignedMode` |
| :-- | :-- | :-- |
| `'on-site'` | `'office'` | `'office'` |
| `'onsite'` / `'on_site'` | `'office'` | `'office'` |
| `'office'` | `'office'` | `'office'` |
| `'  OFFICE  '` | `'office'` | `'office'` |
| `'remote'` / `'hybrid'` / `'field'` | unchanged | unchanged |
| `null` / `undefined` / `''` | `null` | `'office'` (fail-secure) |
| `'anything-else'` | `null` | `'office'` (never passthrough) |

### 9.2 `evaluateGeofence` (new: `tests/unit/attendance/geofence_evaluation.test.js`)
* Empty pool → `outcome: 'unresolved'` (**never** `in_bounds`) — guards Finding N7.
* Pool where every candidate has `latitude: null` → `'unresolved'` (**never** `out_of_bounds`) —
  guards Finding N1.
* Mixed pool, one candidate coordinate-less → evaluated against the valid remainder.
* Inside two overlapping radii → `in_bounds` with the **nearest** candidate matched.
* Outside all → `out_of_bounds` with the nearest candidate and its distance recorded.
* Non-numeric radius → falls back to `100` without throwing (the existing guard).
* `isWithinGeofence` behavior unchanged — re-run `geofence_calculation.test.js` untouched.

### 9.3 The Ten-State Work Mode Matrix (new: `tests/unit/attendance/work_mode_geofence_matrix.test.js`)
One case per Section 5 row, asserting `{ outcome, anomalyType, anomalySeverity, persistedWorkMode }`:

| # | Assigned | Declared | GPS | Expected outcome | Expected anomaly |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | `on-site` | omitted | null | accepted | `missing_coordinates` / HIGH |
| 2 | `on-site` | omitted | inside | accepted | none |
| 3 | `on-site` | omitted | outside | accepted | `out_of_bounds` / HIGH |
| 4 | `on-site` | `'remote'` (forged) | at home | accepted, geofenced anyway | `out_of_bounds` HIGH + `work_mode_claim_mismatch` MEDIUM |
| 5 | `remote` | any | any | accepted, bypassed | none |
| 6 | `hybrid` | `'remote'` | any | accepted, bypassed | none |
| 7 | `hybrid` | `'office'` | inside | accepted | none |
| 8 | `hybrid` | `'office'` | outside | accepted | `out_of_bounds` / HIGH |
| 9 | `field` | any | inside a site | accepted, nearest matched | none |
| 10 | `field` | any | outside all | accepted | `out_of_bounds` / HIGH |

### 9.4 Regression Guards for the New Findings
* **Clock-out payload trap (Nuance B):** hybrid worker clocks in declaring `'remote'`, clocks out
  from home with no `work_mode` in the payload → **no anomaly**. The single highest-value test in
  this suite; without the `record.work_mode` read this fails every evening in production.
* **Fail-open (N7):** field employee with zero assignments and `location_id: null` in an org with
  zero active branches → `geofence_unresolved`, **not** silent approval.
* **NULL office coordinates (N1):** assigned office with `latitude: null` → `geofence_unresolved`,
  **not** `out_of_bounds`.
* **Biometric carve-out (N2):** `source: 'biometric'` with no GPS → **no** `missing_coordinates`;
  provenance records `device_attested`.
* **Clock-in defaulting (Nuance D):** on-site employee omits `work_mode` → record stores `'office'`,
  never `NULL`, never `'on-site'` (also guards N5's dashboard bucket split).
* **Regularization enforcement (N3):** on-site employee requesting `work_mode: 'remote'` is rejected
  at submission.
* **Date bounds (Nuance E):** assignment `effective_from: '2026-11-01'`,
  `effective_to: '2026-11-15'`. In-bounds on `'2026-11-01'` and `'2026-11-15'`; out on
  `'2026-10-31'` and `'2026-11-16'`. Asserted with `YYYY-MM-DD` **strings** — a `Date` object here
  is the bug, not the fixture.
* **`effective_from` NOT NULL (C8):** a row with a null start date must be rejected by the schema,
  not silently skipped by the query.
* **Soft-delete cascade (Nuance G):** deactivating a field location deactivates every active child
  assignment in the same transaction; a forced mid-transaction failure leaves **both** intact.
* **Hierarchy (Decision 7):** manager assigning to a direct report succeeds; to a non-report fails
  `HIERARCHY_VIOLATION`; **to themselves fails**; HR assigning to anyone succeeds.
* **Concurrency (N10):** two simultaneous clock-ins still yield exactly one record and one `409`
  (extend the existing `concurrent_clock_in_409.test.js`).

### 9.5 Full-Suite Gate
`npm test` must pass with **zero regressions** across the existing 26 attendance test files before
this change ships. `review_findings_regression.test.js` and `anomaly_reconciliation.test.js` are the
two most likely to catch an unintended blast radius from the anomaly-service edits.

---

## 10. Readiness Summary

Verified against the live codebase and ready for implementation:

* `_validateGeofence` (`clock.service.js:1199`) confirmed to ignore `work_mode` entirely — the core
  gap this specification closes.
* Vocabulary drift confirmed across six files and two vocabularies; normalization helper specified,
  with v1.2's unsafe passthrough removed.
* Clock-out payload trap confirmed: `clockOutSchema` has no `work_mode`; `record.work_mode` is the
  only correct source.
* Fail-secure defaults confirmed necessary: `work_mode` is nullable on all three profile models.
* `clock.service.js:194` confirmed to persist `NULL`; the defaulting matrix is specified.
* Date-bound filtering pattern confirmed to exist already in
  `employee_shift_assignments.repository.js` and is reused verbatim — including the `NOT NULL`
  requirement on `effective_from` that v1.2 got wrong.
* Soft-delete-versus-cascade confirmed: `ON DELETE CASCADE` does not fire on an `UPDATE`;
  the application-owned transactional cascade is mandatory.
* Multi-punch provenance confirmed viable in `attendance_logs.metadata` (already `JSONB`) — but
  **not** in `attendance_logs.location_id`, which is FK-bound to `organization_locations`.
* Hierarchy scoping confirmed, with the correction that `getAccessibleUserIds` is one level deep,
  and that manager self-assignment is already structurally impossible.

**Eight v1.2 claims corrected** (Section 4A). **Thirteen new findings added** (Section 4B), of
which two are release-blocking: the fail-open empty pool (N7) and the biometric anomaly flood (N2).
**Three previously undocumented privilege-escalation paths** into `work_mode` were found and are
closed by Decision 12 (N3, N4) and Decision 1 (Bug 1).

No production code has been modified by this revision. This document is the plan of record.

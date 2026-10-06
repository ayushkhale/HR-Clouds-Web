# API Change Record — Work Mode Enforcement & Field Geofencing

**Document Date:** October 5, 2026
**Type:** API change record (frontend-affecting)
**Scope:** Attendance module (new endpoints + changed punch responses), Organization module (one breaking change)
**Full integration guide:** `public/md_attendance/7_work_mode_and_field_geofencing_api.md`
**Architecture rationale:** `public/md_updates/2026-10-05_work_mode_and_field_geofencing_architecture_decisions.md`

---

## 1. BREAKING CHANGE — Requires a coordinated frontend release

### `PATCH /api/v1/organizations/me/job-profile`

`work_mode` and `location_id` are **no longer accepted**.

| Before | After |
| :-- | :-- |
| Accepted `work_mode: 'on-site'\|'remote'\|'hybrid'\|'field'` | Key rejected — `400 VALIDATION_ERROR` |
| Accepted `location_id: <uuid>` | Key rejected — `400 VALIDATION_ERROR` |
| Either field alone satisfied the "at least one field" rule | Neither does; a payload containing only these is `400` |
| `LOCATION_INACTIVE` (400) was reachable | No longer reachable — the input is gone |

**Why:** both fields became inputs to geofence *enforcement* in this release, which turns this
endpoint into an authorization boundary for them. The fill-once guard is sound (SQL-enforced on
"still NULL", concurrency-safe) but once is enough to escalate:

- an employee whose `work_mode` is `NULL` — the entire legacy population, since the column is
  nullable on all three role-profile models — could set it to `remote` and permanently exempt
  themselves from geofencing;
- an employee whose `location_id` is `NULL` could choose their own geofence anchor, picking whichever
  office branch sits nearest their home.

Both are now HR-owned. Corrections go through the existing
`PATCH /api/v1/organizations/employees/:id/hr-fields` and the department-transfer endpoint. **No new
endpoint was added** — the HR-facing paths already supported both fields.

### `GET /api/v1/organizations/me/setup-status`

| Field | Change |
| :-- | :-- |
| `missing_fields[]` | never contains `work_mode` or `location_id` |
| `locked_fields[]` | never contains `work_mode` or `location_id` |
| `current_values` | the `work_mode` and `location_id` keys are **removed** |
| `org_structure.can_set_location` | **removed** |
| `org_structure.locations_count` | unchanged (still reports org-structure readiness) |
| `is_complete` | can now be `true` while `work_mode` / `location_id` are blank |

**Frontend action:** drop both inputs from the self-setup wizard step, remove any reference to
`can_set_location`, and stop blocking wizard completion on either field.

**Deploy order:** backend first is safe — the removed inputs fail with a clear 400 rather than
silently writing. A frontend still sending them will see a validation error on that step, so ship
the frontend change promptly after.

---

## 2. Changed Responses — Additive, Non-Breaking

### `POST /api/v1/attendance/clock-in` (201) and `POST /api/v1/attendance/clock-out` (200)

Two fields added to `data`:

```json
{
  "work_mode": "field",
  "geofence": {
    "outcome": "in_bounds",
    "evaluated": true,
    "matched_location_id": "9f1c...",
    "matched_location_type": "field",
    "distance_meters": 42
  }
}
```

- `work_mode` is the **server-resolved** mode now persisted on the record, not the value sent.
- `geofence.outcome` is one of `in_bounds` | `out_of_bounds` | `missing_coordinates` | `unresolved`.
- `matched_location_id` is **polymorphic** — an `organization_locations.id` when
  `matched_location_type` is `office`, an `organization_field_locations.id` when `field`.

**The punch always succeeds.** No geofence outcome blocks a punch or changes the HTTP status.

### Request-side behaviour change (same shape)

`clock-in` still accepts `work_mode`, but it is now **advisory**. A geofenced contractual mode
(`office`, `field`) overrides the payload and raises a `work_mode_claim_mismatch` anomaly. Only a
`hybrid` employee's declaration is honoured, and only `office` or `remote`.

**Recommendation:** send `work_mode` only for `hybrid` employees.

`clock-out` still does **not** accept `work_mode` — unchanged, and it must stay that way. The engine
reads the mode established at clock-in from the record.

### `POST /api/v1/attendance/regularizations` (submit)

`work_mode` is now validated against the employee's contract at submission:

| New error | Status | When |
| :-- | :-- | :-- |
| `WORK_MODE_NOT_PERMITTED` | 400 | the stated mode is not allowed by the contract |
| `INVALID_WORK_MODE` | 400 | unrecognized value |

Permitted values: `office` contract → `office`/`on-site`; `remote` → `remote`; `field` → `field`;
`hybrid` → `office` or `remote`. A `NULL` profile mode is treated as `office`.

Previously any of the four values was accepted and copied into the record on approval, which let an
employee relabel a flagged day as `remote` after the fact.

### Regularization approval response

```json
{ "success": true, "regularization_refunded_leave": false, "geofence_anomalies_resolved": 2 }
```

`geofence_anomalies_resolved` is new. Approving a regularization now resolves that day's geofence
flags (previously they stayed open forever).

---

## 3. New Endpoints

Mounted identically on the HR (`/api/v1/attendance/hr`) and Manager
(`/api/v1/attendance/manager`) routers. Same payloads; authorization scope differs.

| Method | Path | Purpose |
| :-- | :-- | :-- |
| `POST` | `/field-locations` | Register a client site |
| `GET` | `/field-locations` | List / search (paginated) |
| `GET` | `/field-locations/:id` | One site + its assignees |
| `PUT` | `/field-locations/:id` | Edit |
| `DELETE` | `/field-locations/:id` | Retire (soft delete + assignment cascade) |
| `POST` | `/field-assignments` | Assign an employee to a site |
| `DELETE` | `/field-assignments/:assignment_id` | Unassign |
| `GET` | `/field-assignments/user/:user_id` | A user's active assignments |

Plus one employee self-read:

| Method | Path | Purpose |
| :-- | :-- | :-- |
| `GET` | `/api/v1/attendance/my-field-assignments` | The caller's own sites, for the punch screen |

Authorization:
- **Create / list / view** — any manager or HR; a created site is visible org-wide so client sites
  get reused rather than duplicated.
- **Edit / retire** — HR admin, or the manager who created it (`created_by`).
- **Assign / unassign** — HR for anyone; a manager for **direct reports only** (one level, not a
  recursive tree) and **never for themselves**.

Full payloads, field rules, response bodies and error codes are in
`public/md_attendance/7_work_mode_and_field_geofencing_api.md`.

---

## 4. New Anomaly Types

Delivered through the existing anomaly endpoints. Add rendering or they fall through to a default
label.

| `type` | `severity` | Meaning |
| :-- | :-- | :-- |
| `geofence_unresolved` | `medium` | **NEW.** Nothing to geofence against — no assigned office, no active branch, no assigned site, or the location has no GPS pin. A configuration gap, **not** misconduct |
| `work_mode_claim_mismatch` | `medium` | **NEW.** The punch claimed a mode the contract disallows; the contract was enforced |
| `missing_coordinates` | `medium` → **`high`** | **SEVERITY CHANGED.** Check any severity-based filter, sort or badge |
| `out_of_bounds` | `high` | Unchanged severity; the description now names the punch side and the nearest location with its distance |

Clock-in and clock-out each raise their own geofence anomaly, so two `out_of_bounds` rows per day are
expected and correct. Do **not** de-duplicate by type — that hides the clock-out breach, which is
what distinguishes a shift-start false report from a commute home.

---

## 5. Validation Rules Worth Noting

### `is_active` is not an accepted field on `PUT /field-locations/:id`

Retiring a site must deactivate its assignments in the same transaction (PostgreSQL `ON DELETE
CASCADE` does not fire on an `UPDATE`), which only the `DELETE` handler does. Accepting `is_active`
on the update path let a caller retire a site while every assignment row stayed `is_active: true` —
the site dropped out of the geofence pool, so the UI still showed those employees as assigned while
their punches silently began failing. Sending it is now a `400 VALIDATION_ERROR`.

### `FIELD_ASSIGNMENT_DUPLICATE` is date-blind

One active (employee, site) pair may exist at a time **regardless of the effective window**, so a
second non-overlapping window for the same pair also returns 409. The message names the existing
window and the error body carries `details: { assignment_id, effective_from, effective_to }` so the
caller can edit that assignment instead of retrying.

### Dates must be `YYYY-MM-DD` strings

`effective_from` and `effective_to` on `POST /field-assignments` reject ISO timestamps
(`"2026-11-01T00:00:00Z"` → `400`). A timestamp carries a timezone, and at IST (UTC+05:30) a
midnight-UTC instant resolves to the previous calendar day, silently shifting the assignment window.
Use a local calendar format (`format(date, 'yyyy-MM-dd')`), not `date.toISOString()`.

Both window ends are **inclusive**. Non-existent calendar dates (`2026-02-31`) are rejected.

### Field-location coordinates are mandatory

Unlike `organization_locations`, where latitude/longitude are optional, a field site requires both.
A field site exists only to be geofenced. The map picker is a required step.

### Radius bounds

`geofence_radius_meters` must be an integer **50–2000**, defaulting to **250** on create (offices
keep their tighter 100 m default). Bounds mirror a database `CHECK`, so a value accepted by the API
can never fail at the write. **No default on update** — omitting it leaves the radius unchanged.

---

## 6. Two Vocabularies for Work Mode — Unchanged but Now Enforced

| Context | Vocabulary |
| :-- | :-- |
| Profile / invite / HR fields | `on-site`, `remote`, `hybrid`, `field` |
| Attendance punches, records, dashboards | `office`, `remote`, `hybrid`, `field` |

`on-site` and `office` are the same mode. Never compare the two directly.

A database `CHECK` now constrains `attendance_records.work_mode` and
`attendance_regularizations.work_mode` to the four attendance tokens (or `NULL`), and migration
`00072` normalized historical rows. **Consequence for dashboards:** work-mode groupings previously
split one logical mode across `office` and `on-site` buckets; they no longer do. Any frontend
special-case merging those two buckets can be removed.

`NULL` remains possible on historical records (it predates the engine populating the column) and
renders as `not_specified`. New punches always write a value.

---

## 7. Database Migrations

| Migration | Effect |
| :-- | :-- |
| `00069-create-organization-field-locations` | New table |
| `00070-create-employee-field-assignments` | New table |
| `00071-add-geofence-provenance-to-attendance-records` | Adds `matched_location_id`, `matched_location_type`, `distance_to_location_meters` |
| `00072-normalize-and-constrain-work-mode` | Normalizes `on-site`/`onsite`/`on_site` → `office` on `attendance_records` and `attendance_regularizations`; sets uninterpretable values to `NULL`; adds `CHECK` constraints |

Run before deploying the application code — the `AttendanceRecords` model gains three attributes that
every record `SELECT` includes.

`00072` is a data repair; its `down()` drops the constraints but does **not** reintroduce the drift.

---

## 8. Frontend Work Summary

**Must do (breaking):**
1. Remove the Work Mode and Office Location inputs from the self-service onboarding wizard.
2. Remove all use of `org_structure.can_set_location`.
3. Re-check any severity filter that assumed `missing_coordinates` was `medium`.

**Should do (feature completion):**
4. Build the Field Management and Assignment screens (Section 3).
5. Render the `geofence` object on the punch screen; never present an outcome as a failed punch.
6. Show the office/home toggle only for `hybrid` employees; stop sending `work_mode` otherwise.
7. Add labels for `geofence_unresolved` and `work_mode_claim_mismatch`; route the former to a
   "Setup issues" group rather than a disciplinary queue.
8. Call `GET /api/v1/attendance/my-field-assignments` on the punch screen for field staff.

Step-by-step checklist: Section 10 of
`public/md_attendance/7_work_mode_and_field_geofencing_api.md`.

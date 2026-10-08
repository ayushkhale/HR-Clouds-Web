# API Change Record: HR Profile Field Expansion & Work-Mode Updates (Tiered Permissions)

**Document Date:** October 7, 2026
**Status:** Implemented & Verified in Backend (2940 unit tests green)
**Modules:** Organization (`src/modules/organization`), Attendance & Geofencing (`src/modules/attendance`)
**Audience:** Frontend Engineers building the HR Employee/Job-Details screen and the Manager Field-Site Assignment modal.

> This document is the **source of truth** for these API changes. It supersedes the proposal in
> `2026-10-07_user_profile_fields_and_work_mode_update_report.md` wherever the two differ.

---

## 0. TL;DR — What Changed

| # | Endpoint | Change | Who |
| :- | :-- | :-- | :-- |
| 1 | `PATCH /api/v1/organizations/employees/:id/hr-fields` | **7 new writable fields** added: `work_mode`, `location_id`, `designation`, `employee_code`, `employment_type`, `job_status`, `notice_period_started_on`. | **HR only** |
| 2 | `POST /api/v1/attendance/{manager\|hr}/field-assignments` | New optional request field `set_work_mode_to_field`; two new response fields `work_mode_changed` + revised `work_mode_warning`. | Manager (direct reports) & HR |

No database migration is required — all columns already existed. No new dependencies.

---

## 1. The Design That Was Implemented (Option 3, adjusted)

We followed **Option 3 (Tiered Permissions)** from the proposal, with two engineering corrections you must know about:

1. **`'office'` is NOT a stored value.** The proposal suggested storing `work_mode: 'office'`. The
   database ENUM is `('on-site', 'remote', 'hybrid', 'field')` — it has **no `'office'` member**.
   - You **may send** `"office"` to the HR endpoint as a convenience alias; the backend **normalizes
     it to `"on-site"`** before persisting.
   - When you read a profile back, an office worker's `work_mode` is always **`"on-site"`**, never
     `"office"`. Build your dropdown so that both the "On-Site / Office" option maps to/from
     `"on-site"`.

2. **The proposal's "Path B" was NOT built.** `work_mode` is **not** exposed on the generic
   `PATCH /employees/:id` (team-member personal profile) endpoint for managers. Managers change work
   mode **only** through the integrated `set_work_mode_to_field` flag on the assignment endpoint
   (§3). This is deliberate: it keeps a single, auditable transition path and prevents a manager from
   ever setting `remote`.

### Permission matrix (work_mode)

| Actor | Can set `on-site` / `field` | Can set `remote` / `hybrid` | How |
| :-- | :-: | :-: | :-- |
| **HR** | ✅ | ✅ | `PATCH /employees/:id/hr-fields` |
| **Manager** | ✅ **`field` only**, and only from an office/unset mode | ❌ | `set_work_mode_to_field: true` on `POST .../field-assignments` |
| **Employee (self)** | ❌ | ❌ | — (stripped on self-service, unchanged) |

---

## 2. Endpoint 1 — `PATCH /api/v1/organizations/employees/:id/hr-fields`

**Authorization:** HR / Admin only (unchanged route guard).
**Self-edit:** Still forbidden — HR cannot run this on their own `:id` (`400 SELF_EDIT_NOT_ALLOWED`).

### 2.1 Request body

`reason` is **required**, plus **at least one** updatable field. All updatable fields are optional
individually.

```json
{
  "work_mode": "field",
  "location_id": "4d9a1111-2222-3333-4444-555566667777",
  "designation": "Senior Field Engineer",
  "employee_code": "EMP-0421",
  "employment_type": "full_time",
  "job_status": "confirmed",
  "notice_period_started_on": null,
  "gender": "male",
  "marital_status": "married",
  "joining_date": "2026-01-15",
  "reason": "Transitioned to field role for the Tata Steel project"
}
```

### 2.2 Field specification

| Field | Type | Rules |
| :-- | :-- | :-- |
| `work_mode` | enum string | One of `on-site`, `office`, `remote`, `hybrid`, `field`. **`office` is stored as `on-site`.** Cannot be empty string. |
| `location_id` | UUID \| `null` | Base **office** anchor. Must be an `organization_locations` row in the **same org** (else `404 LOCATION_NOT_FOUND`). `null` **clears** the anchor (and the denormalized `work_location` name); geofencing then falls back to all active branches. |
| `designation` | string(≤150) \| `null` \| `""` | `""` clears to null. |
| `employee_code` | string(≤100) \| `null` \| `""` | Must be **unique within the org** (`409 EMPLOYEE_CODE_DUPLICATE` on collision). `""` clears to null. |
| `employment_type` | enum string | One of `full_time`, `part_time`, `contract`, `intern`. |
| `job_status` | enum string | One of `probation`, `confirmed`, `notice_period`, `terminated`, `trainee`, `contract`, `temporary`. |
| `notice_period_started_on` | `YYYY-MM-DD` \| `null` | Plain date string (no timestamps). `null` clears it. |
| `gender` | enum string \| `null` | `male`, `female`, `other`, `prefer_not_to_say`. *(existing)* |
| `marital_status` | string(≤50) \| `null` | *(existing)* |
| `joining_date` | `YYYY-MM-DD` | **Fill-once.** Fills a blank; an existing value **cannot be changed here** (`409 JOINING_DATE_ALREADY_SET`). *(existing)* |
| `reason` | string(3–500) | **Required.** Logged with the change. |

> **Date format:** `joining_date` and `notice_period_started_on` must be bare `YYYY-MM-DD` strings.
> Sending an ISO timestamp (`2026-01-15T00:00:00Z`) → `400 VALIDATION_ERROR`.

### 2.3 Success response — `200 OK`

Returns the **full updated employee object** (identical shape to `GET /employees/:id`) **plus** a
`changes` diff of exactly what was modified. An unchanged value is **not** written and does **not**
appear in `changes` (so `changes` can be `{}` on a pure no-op).

```json
{
  "success": true,
  "message": "Employee HR fields updated successfully",
  "data": {
    "user_id": "aa11bb22-cccc-dddd-eeee-ffff00001111",
    "...": "… all the usual employee/profile fields …",
    "work_mode": "field",
    "changes": {
      "work_mode": { "from": "on-site", "to": "field" },
      "location_id": { "from": null, "to": "4d9a1111-2222-3333-4444-555566667777" },
      "designation": { "from": "Field Engineer", "to": "Senior Field Engineer" }
    }
  }
}
```

**Frontend tip:** Use `data.changes` to render a confirmation toast ("Updated: Work Mode, Designation")
rather than re-diffing on the client.

### 2.4 Error scenarios

| Status | `errorCode` | Cause | UI guidance |
| :-- | :-- | :-- | :-- |
| 400 | `SELF_EDIT_NOT_ALLOWED` | HR targeting their own `:id` | "You cannot edit your own HR-owned fields. Ask another HR admin." |
| 400 | `VALIDATION_ERROR` | Bad enum / bad date / no field + reason | Show field-level validation. |
| 404 | `EMPLOYEE_NOT_FOUND` | `:id` is not a member of the org | — |
| 404 | `PROFILE_NOT_FOUND` | Member has no role-profile row | — |
| 404 | `LOCATION_NOT_FOUND` | `location_id` not in this org | Re-fetch `GET /organizations/locations`. |
| 409 | `EMPLOYEE_CODE_DUPLICATE` | `employee_code` already used in org | "That employee code is already in use." |
| 409 | `JOINING_DATE_ALREADY_SET` | Tried to change an existing joining date | Joining date is locked; use a correction workflow if truly wrong. |

### 2.5 Populate the Base-Office dropdown

`location_id` options come from the existing **`GET /api/v1/organizations/locations`** (unchanged).

---

## 3. Endpoint 2 — `POST /api/v1/attendance/{manager|hr}/field-assignments`

The assignment contract from `2026-10-07_manager_field_site_assignment_and_visibility_guide.md` is
**unchanged** except for the additions below.

### 3.1 New request field

```json
{
  "user_id": "aa11bb22-cccc-dddd-eeee-ffff00001111",
  "field_location_id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
  "effective_from": "2026-11-01",
  "effective_to": "2026-11-30",
  "set_work_mode_to_field": true
}
```

| Field | Type | Default | Behavior |
| :-- | :-- | :-- | :-- |
| `set_work_mode_to_field` | boolean | `false` | When `true`, the backend **atomically** flips the assignee's `work_mode` to `field` **in the same transaction as the assignment** — but **only** if their current mode is office/on-site/unset. See the rules below. |

### 3.2 Promotion rules (important — not a blind flip)

| Assignee's current mode | `set_work_mode_to_field: true` does… | `work_mode_changed` | `work_mode_warning` |
| :-- | :-- | :-: | :-- |
| `on-site` / `office` / unset (`null`) | Promotes to `field` | `true` | `null` |
| `field` (already) | Nothing (no-op) | `false` | `null` |
| `remote` or `hybrid` | **Nothing** — a contractual mode is HR-only to change | `false` | *"…a contractual mode only HR can change, so it was not switched to 'field'…"* |

> **Why `remote`/`hybrid` is refused:** those are deliberate contractual modes tied to allowances and
> payroll. A manager silently pulling a remote worker into geofenced `field` mode is a contractual
> change reserved for HR. The assignment still succeeds; the frontend should surface the warning and
> advise raising it with HR.

### 3.3 Success response — `201 Created`

```json
{
  "success": true,
  "message": "Field location assigned successfully",
  "data": {
    "assignment": {
      "id": "c4de5f6a-1122-3344-5566-778899aabbcc",
      "org_id": "2a44bb55-6677-8899-0011-223344556677",
      "user_id": "aa11bb22-cccc-dddd-eeee-ffff00001111",
      "field_location_id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
      "assigned_by": "manager-user-id",
      "is_active": true,
      "effective_from": "2026-11-01",
      "effective_to": "2026-11-30"
    },
    "work_mode_changed": true,
    "work_mode_warning": null
  }
}
```

**Response field changes vs. the earlier assignment doc:**
- **NEW** `work_mode_changed` (boolean): `true` only when the backend flipped the mode to `field` on
  this call. Use it to show *"Employee assigned and switched to Field mode."*
- `work_mode_warning` (string | null): **unchanged key**, but its message now also covers the
  "refused to flip remote/hybrid" case (§3.2). Render as an amber banner whenever non-null.

### 3.4 Recommended modal flow

1. Manager picks a direct report + an active field location (`GET .../manager/field-locations`).
2. If the selected employee's mode is `on-site`/office/unset, show a **checked-by-default** checkbox:
   `☑ Set this employee's work mode to 'Field' to enable client-site GPS attendance`.
   Submit `set_work_mode_to_field: true`.
3. If the employee is already `field`: hide the checkbox (nothing to do).
4. If the employee is `remote`/`hybrid`: show the checkbox **disabled** with helper text *"Only HR can
   change a Remote/Hybrid employee's work mode"* — or submit `true` anyway and rely on the returned
   `work_mode_warning` (both are safe; the backend will not flip it).

### 3.5 Error scenarios

All existing assignment errors (`HIERARCHY_VIOLATION`, `FIELD_ASSIGNMENT_DUPLICATE`,
`FIELD_LOCATION_INACTIVE`, `FIELD_LOCATION_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`) are **unchanged**.
`set_work_mode_to_field` adds **no new error codes**: the mode flip is best-effort and never fails
the assignment. If the flip cannot be applied for any reason, you get a `201` with
`work_mode_changed: false` and a non-null `work_mode_warning` — always honor the warning banner.

---

## 4. Work-Mode Vocabulary Cheat-Sheet (read this once)

Two vocabularies exist in the platform. Get this right or geofencing breaks:

| What you send / display | What is stored on the profile | What attendance reports call it |
| :-- | :-- | :-- |
| `on-site` **or** `office` | `on-site` | `office` |
| `remote` | `remote` | `remote` |
| `hybrid` | `hybrid` | `hybrid` |
| `field` | `field` | `field` |

- **Profile reads** (`GET /employees/:id`, assignment responses) return the **profile** vocabulary:
  expect `on-site`, never `office`.
- Your work-mode dropdown should treat `on-site` and `office` as the **same option** ("On-Site /
  Office").

---

## 5. Audit & Guarantees (backend behavior you can rely on)

- Every `hr-fields` change is logged as `[ORG_AUDIT] employee.hr_fields.updated` with the `reason` and
  a before/after diff.
- Every integrated promotion is logged as `[ATTENDANCE_AUDIT] field_assignment.work_mode_promoted`.
- The assignment + work-mode flip are **one transaction**: either both land or neither does. There is
  no window where the site is assigned but the mode half-changed.
- Unchanged values are never written (idempotent), so retries/duplicate submits are safe.

---

## 6. What Did NOT Change

- Route guards: `hr-fields` is still HR-only; `field-assignments` still allows manager/HR with the
  same hierarchy scoping (manager → active direct reports; HR → org-wide).
- Self-service (`PATCH /organizations/me`, `/me/job-profile`) and the manager team-profile edit
  (`PATCH /employees/:id`) still **strip** `work_mode` and `location_id`. Do not send them there.
- Field-location CRUD, visibility rules (`assigned_user_count` vs `assignments`), and unassign
  behavior are all unchanged.

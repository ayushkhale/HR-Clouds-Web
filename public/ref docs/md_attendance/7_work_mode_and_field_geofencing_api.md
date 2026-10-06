# Work Mode Enforcement & Field Geofencing APIs

**Document Date:** October 5, 2026
**Status:** Implemented — backend merged, migrations `00069`–`00072`
**Module:** Attendance & Time Tracking
**Audience:** Frontend engineers implementing the Field Management screens, the punch (clock-in/out) screens, the HR Attendance Flags inbox, and the employee onboarding wizard.

**Base URLs:**
- HR: `/api/v1/attendance/hr`
- Manager: `/api/v1/attendance/manager`
- Employee (self): `/api/v1/attendance`

**Source of Truth:**
- Routes: `src/modules/attendance/routes/hr_attendance.routes.js`, `manager_attendance.routes.js`, `user_attendance_read.routes.js`
- Controller: `src/modules/attendance/controllers/field_location.controller.js`
- Validator: `src/modules/attendance/validators/field_location.validator.js`
- Services: `field_location.service.js`, `clock.service.js`, `anomaly.service.js`, `regularization.service.js`
- Repositories: `organization_field_locations.repository.js`, `employee_field_assignments.repository.js`
- Models: `OrganizationFieldLocations`, `EmployeeFieldAssignments`
- Utilities: `src/modules/attendance/utilities/work_mode.utils.js`, `src/common/utilities/geofence.utils.js`

---

## 0. READ THIS FIRST — Three Things That Will Break Your Screens

### 0.1 BREAKING: `work_mode` and `location_id` were removed from the self-service job profile

`PATCH /api/v1/organizations/me/job-profile` **no longer accepts `work_mode` or `location_id`.**
Sending either is now a **400 `VALIDATION_ERROR`** (unknown key), and sending *only* one of them is a
400 because the payload has no recognized field left.

`GET /api/v1/organizations/me/setup-status` changed to match:

| Field | Change |
| :-- | :-- |
| `missing_fields` | no longer ever contains `work_mode` or `location_id` |
| `locked_fields` | no longer ever contains `work_mode` or `location_id` |
| `current_values` | the `work_mode` and `location_id` keys are **gone** |
| `org_structure.can_set_location` | **removed entirely** |
| `org_structure.locations_count` | kept (still reports org-structure readiness) |

**Why:** both fields are now inputs to geofence *enforcement*, which makes them an authorization
boundary rather than a profile preference. An employee able to fill their own blank `work_mode`
could set it to `remote` and permanently exempt themselves from geofencing; one able to fill
`location_id` could choose whichever office branch sits nearest their home as their geofence anchor.
Both are now HR-owned.

**Frontend action required:**
1. Remove the **Work Mode** and **Office Location** inputs from the employee self-setup / onboarding
   wizard steps driven by this endpoint.
2. Delete any reference to `org_structure.can_set_location` — it will be `undefined`.
3. Do not treat a profile with a blank `work_mode` as an incomplete self-setup. The wizard can now
   complete without it. Surface "ask your HR to set your work mode and office location" copy instead.
4. HR corrects both through the existing `PATCH /api/v1/organizations/employees/:id/hr-fields` and
   the department-transfer endpoint. No new endpoint was added for this.

### 0.2 Two vocabularies exist for one concept — do not compare them directly

The platform stores work mode under two spellings, and this will bite you if you write
`profile.work_mode === record.work_mode`:

| Context | Vocabulary | Where you see it |
| :-- | :-- | :-- |
| **Profile** (contract) | `on-site`, `remote`, `hybrid`, `field` | employee/manager/HR profile reads, the invite form |
| **Attendance** (punches) | `office`, `remote`, `hybrid`, `field` | clock-in payload, `attendance_records.work_mode`, every attendance read, dashboards |

`on-site` and `office` are **the same mode**. Anything the attendance module returns is already
normalized to the attendance vocabulary, so:
- when you **send** `work_mode` to a punch endpoint, use `office` (not `on-site`);
- when you **send** `work_mode` to the invite or HR-fields endpoints, use `on-site` (unchanged);
- when you **display** an attendance record's `work_mode`, expect only
  `office` | `remote` | `hybrid` | `field` or `null`.

A database `CHECK` constraint now enforces this on `attendance_records.work_mode` and
`attendance_regularizations.work_mode`, and historical rows were normalized by migration `00072`.
Any existing dashboard grouping that special-cased `on-site` can be simplified — that bucket no
longer appears for new data.

### 0.3 `work_mode` sent at clock-in is now advisory, not authoritative

The server resolves the mode from the employee's contractual profile and **overrides the payload**.
The punch is still accepted, but:
- an `office` or `field` employee claiming `remote` is geofenced anyway, and an extra
  `work_mode_claim_mismatch` anomaly is raised;
- `attendance_records.work_mode` stores the **resolved** mode, not what you sent.

Only a `hybrid` employee's claim is honoured (and only `office` or `remote`). The clock-in response
now echoes the resolved mode back — **render that, not your local state.**

---

## 1. What This Feature Does

Before this change the attendance engine validated every punch against the employee's office
location and ignored `work_mode` entirely. Three consequences:

- remote and hybrid employees were flagged `out_of_bounds` for working from home as contracted;
- field staff (sales, site engineers, delivery, service technicians) had nowhere to register the
  client sites they legitimately work from;
- an employee could forge `work_mode: "remote"` in the punch payload and bypass geofencing.

Now:

- **Office / on-site** — geofenced against the assigned office, as before.
- **Remote** — geofencing bypassed entirely.
- **Hybrid** — the employee declares each day; a declared WFH day is not geofenced, a declared
  office day is strictly verified.
- **Field** — geofenced against the union of their assigned client sites **plus** their office
  ("composite resolution": every office is inherently a valid field destination, and office rows are
  never duplicated into the field table, so editing an office pin propagates automatically).

**No geofence state ever blocks a punch.** Every outcome accepts the punch and raises a flag for HR
instead. Blocking costs attendance records and wages; a flag costs an HR review. Build your punch
UI on that assumption — there is no "punch rejected because you are out of bounds" path.

---

## 2. New Endpoints — Summary

Field-location endpoints are mounted on **both** the HR and Manager routers at identical paths. The
request and response shapes are identical; only the authorization scope differs (Section 6).

| # | Method | Endpoint (prefix with `/hr` or `/manager`) | Purpose |
| :-- | :-- | :-- | :-- |
| 1 | `POST` | `/field-locations` | Register a client site |
| 2 | `GET` | `/field-locations` | List / search client sites (paginated) |
| 3 | `GET` | `/field-locations/:id` | One site + who is assigned to it |
| 4 | `PUT` | `/field-locations/:id` | Edit a site |
| 5 | `DELETE` | `/field-locations/:id` | Retire a site (soft delete + cascade) |
| 6 | `POST` | `/field-assignments` | Assign an employee to a site |
| 7 | `DELETE` | `/field-assignments/:assignment_id` | Unassign |
| 8 | `GET` | `/field-assignments/user/:user_id` | A user's active assignments |

Plus one employee self-read:

| # | Method | Endpoint | Purpose |
| :-- | :-- | :-- | :-- |
| 9 | `GET` | `/api/v1/attendance/my-field-assignments` | The caller's own sites, for the punch screen |

All require `Authorization: Bearer <jwt>` and the `attendance.access` feature flag. All responses
follow the platform envelope: `{ "success": true, "message": "...", "data": { ... } }`.

---

## 3. Field Location Endpoints

### API 1 — Create Field Location

1. **Method / Endpoint:** `POST /api/v1/attendance/{hr|manager}/field-locations`
2. **Purpose:** Registers an external client site, project facility or vendor location that field
   staff may punch from.
3. **Roles:** `hr`, `admin`, `super-admin` (HR route); `manager`, `hr`, `admin`, `super-admin`
   (manager route).
4. **Scope:** A created site is visible **organization-wide** — deliberately, so managers reuse
   existing client sites instead of each registering "Tata Steel Pune" separately.
5. **Request body:**

   ```json
   {
     "name": "Tata Steel Pune Plant",
     "client_name": "Tata Steel Ltd",
     "latitude": 18.52043,
     "longitude": 73.856743,
     "geofence_radius_meters": 300,
     "address": "Plot 14, MIDC Industrial Area",
     "city": "Pune",
     "state": "Maharashtra",
     "country": "India",
     "pincode": "411019",
     "timezone": "Asia/Kolkata"
   }
   ```

6. **Field rules:**

   | Field | Required | Rules |
   | :-- | :-- | :-- |
   | `name` | yes | 2–150 chars, trimmed. Must be unique among **active** sites in the org, case-insensitively |
   | `latitude` | **yes** | −90…90 |
   | `longitude` | **yes** | −180…180 |
   | `client_name` | no | ≤150 chars |
   | `geofence_radius_meters` | no | integer **50–2000**, defaults to **250** |
   | `timezone` | no | ≤100 chars, defaults to `Asia/Kolkata` |
   | `address` | no | ≤1000 chars |
   | `city` / `state` / `country` | no | ≤100 chars; `country` defaults to `India` |
   | `pincode` | no | ≤20 chars |

   Coordinates are **required here**, unlike office locations where they are optional. A field site
   exists only to be geofenced. Show the map picker as a required step.

   `org_id`, `created_by`, `is_active` and `id` are stripped if sent — the server stamps them.

7. **Success — `201`:**

   ```json
   {
     "success": true,
     "message": "Field location created successfully",
     "data": {
       "id": "9f1c...",
       "org_id": "2a44...",
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
       "created_by": "7b02...",
       "updated_by": null,
       "created_at": "2026-10-05T11:20:31.004Z",
       "updated_at": "2026-10-05T11:20:31.004Z",
       "deleted_at": null
     }
   }
   ```

   **Note:** `latitude` / `longitude` come back as **strings** (`numeric` columns via `pg`). Run
   them through `parseFloat` before handing them to a map component.

8. **Errors:**

   | Status | `errorCode` | When |
   | :-- | :-- | :-- |
   | 400 | `VALIDATION_ERROR` | any field rule above |
   | 409 | `FIELD_LOCATION_DUPLICATE` | an active site with that name already exists |

   On `FIELD_LOCATION_DUPLICATE`, show the existing site and offer "use this one" rather than letting
   the user rename to force a duplicate through — reuse is the point of org-wide visibility.

### API 2 — List Field Locations

1. **Method / Endpoint:** `GET /api/v1/attendance/{hr|manager}/field-locations`
2. **Query parameters:**

   | Param | Default | Rules |
   | :-- | :-- | :-- |
   | `search` | — | ≤150 chars; case-insensitive partial match on **name**, **client_name** and **city** |
   | `include_inactive` | `false` | `true` also returns retired sites |
   | `page` | `1` | ≥1 |
   | `limit` | `20` | 1–100 |

3. **Success — `200`:**

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
           "id": "9f1c...",
           "name": "Tata Steel Pune Plant",
           "client_name": "Tata Steel Ltd",
           "latitude": "18.52043000",
           "longitude": "73.85674300",
           "geofence_radius_meters": 300,
           "city": "Pune",
           "is_active": true,
           "created_by": "7b02...",
           "creator": {
             "id": "7b02...",
             "identifier": "manager@acme.com",
             "profile": { "first_name": "Asha", "last_name": "Rao", "display_name": "Asha Rao" }
           }
         }
       ]
     }
   }
   ```

   Sorted by `name` ascending. `creator` tells you who may edit the row (Section 6.2) — use it to
   decide whether to render the edit affordance.

### API 3 — Get Field Location by ID

1. **Method / Endpoint:** `GET /api/v1/attendance/{hr|manager}/field-locations/:id`
2. **Success — `200`:**

   ```json
   {
     "success": true,
     "message": "Field location fetched successfully",
     "data": {
       "location": { "id": "9f1c...", "name": "Tata Steel Pune Plant", "...": "..." },
       "assigned_user_count": 7,
       "can_modify": true,
       "assignments": [
         {
           "id": "c4de...",
           "user_id": "aa11...",
           "effective_from": "2026-11-01",
           "effective_to": "2026-11-15",
           "is_active": true,
           "user": {
             "id": "aa11...",
             "identifier": "ravi@acme.com",
             "profile": { "first_name": "Ravi", "last_name": "Kumar", "display_name": "Ravi Kumar" }
           }
         }
       ]
     }
   }
   ```

3. **`assignments` is `null` unless you may modify the site.** The site row is readable org-wide so
   client sites get reused, but the assignee list — which carries employee names — is returned only
   to an HR admin or the manager who created it. `assigned_user_count` is **always** returned and
   names nobody.

   | Field | Always present | Notes |
   | :-- | :-- | :-- |
   | `location` | yes | the site row |
   | `assigned_user_count` | yes | use this for the delete confirmation |
   | `can_modify` | yes | `true` when the caller is HR or the creator — use it to gate the edit/delete controls instead of computing it yourself |
   | `assignments` | **no** | the array when `can_modify` is `true`, otherwise `null` |

4. **Use `assigned_user_count` in the delete confirmation dialog** — "this will unassign 7
   employees" — because retiring a site cascades (API 5). Render it even when `assignments` is
   `null`, and guard any `.map()` over `assignments` against the null case.
5. **Errors:** `404 FIELD_LOCATION_NOT_FOUND`.

### API 4 — Update Field Location

1. **Method / Endpoint:** `PUT /api/v1/attendance/{hr|manager}/field-locations/:id`
2. **Request body:** any subset of the create fields. **At least one field is required**
   (`400 VALIDATION_ERROR`, message `"Provide at least one field to update"`).
   There is **no radius default on update** — omitting `geofence_radius_meters` leaves it unchanged
   rather than resetting it to 250.

   **`is_active` is NOT accepted.** Retiring a site is not a field edit: it has to deactivate the
   site's assignments in the same transaction (PostgreSQL's `ON DELETE CASCADE` does not fire on an
   `UPDATE`), which only `DELETE /field-locations/:id` does. Sending `is_active` is a
   `400 VALIDATION_ERROR`, and sending it alone fails the "at least one field" rule. Re-activating a
   retired site is not supported — create a new one, since the name is freed on retirement.
3. **Permission:** an **HR admin**, or the **manager who created the site**. See Section 6.2.
4. **Success — `200`:** the updated row (same shape as API 1).
5. **Errors:**

   | Status | `errorCode` | When |
   | :-- | :-- | :-- |
   | 400 | `VALIDATION_ERROR` | empty body or a failing field rule |
   | 400 | `FIELD_LOCATION_INACTIVE` | the site is retired; it cannot be edited |
   | 403 | `FIELD_LOCATION_FORBIDDEN` | a manager editing someone else's site |
   | 404 | `FIELD_LOCATION_NOT_FOUND` | wrong id, or another organization's |
   | 409 | `FIELD_LOCATION_DUPLICATE` | the new name collides with another active site |

6. **Warn before saving a coordinate or radius change.** The site is shared org-wide; moving the pin
   changes where every assigned employee must stand. Show `assigned_user_count` from API 3 in the
   confirmation.

### API 5 — Delete (Retire) Field Location

1. **Method / Endpoint:** `DELETE /api/v1/attendance/{hr|manager}/field-locations/:id`
2. **Behaviour:** a **soft delete**. The site is marked inactive and, in the **same database
   transaction**, every active assignment to it is deactivated. Historical attendance records and
   punch logs keep referencing it, so past punches never retroactively fail a geofence audit.
3. **Permission:** same as API 4 — HR admin or the creating manager.
4. **Success — `200`:**

   ```json
   {
     "success": true,
     "message": "Field location deleted successfully",
     "data": { "id": "9f1c...", "already_deleted": false, "assignments_deactivated": 7 }
   }
   ```

   Idempotent: deleting an already-retired site returns `already_deleted: true` and
   `assignments_deactivated: 0` rather than an error. Treat both as success.

5. **Show `assignments_deactivated` in the success toast** — "Site retired, 7 employees unassigned".
   The affected employees will fall back to office-only geofencing on their next punch.
6. **The site name is freed on retirement**, so the same name can be registered again later.
7. **Errors:** `403 FIELD_LOCATION_FORBIDDEN`, `404 FIELD_LOCATION_NOT_FOUND`.

---

## 4. Field Assignment Endpoints

### API 6 — Assign Field Location to an Employee

1. **Method / Endpoint:** `POST /api/v1/attendance/{hr|manager}/field-assignments`
2. **Request body:**

   ```json
   {
     "user_id": "aa11...",
     "field_location_id": "9f1c...",
     "effective_from": "2026-11-01",
     "effective_to": "2026-11-15"
   }
   ```

3. **Field rules:**

   | Field | Required | Rules |
   | :-- | :-- | :-- |
   | `user_id` | yes | UUID; must be a member of the caller's org |
   | `field_location_id` | yes | UUID; must be an **active** site in the org |
   | `effective_from` | no | **`YYYY-MM-DD` string.** Defaults to today (IST) |
   | `effective_to` | no | **`YYYY-MM-DD` string** or `null` (open-ended). Must be ≥ `effective_from` |

   **Send dates as plain `YYYY-MM-DD` strings, never ISO timestamps.**
   `"2026-11-01T00:00:00Z"` is rejected with `400 VALIDATION_ERROR`. This is intentional: a
   timestamp carries a timezone, and at IST (UTC+05:30) a midnight-UTC instant resolves to the
   previous calendar day, which would silently shift the assignment window by one day. Use your
   date-picker's local calendar value, formatted with something like
   `format(date, 'yyyy-MM-dd')` — **not** `date.toISOString()`.

   Non-existent calendar dates (`2026-02-31`) are rejected too.

4. **Both window ends are inclusive.** An assignment `2026-11-01` → `2026-11-15` is active on both
   the 1st and the 15th, and inactive on `2026-10-31` and `2026-11-16`.

5. **Success — `201`:**

   ```json
   {
     "success": true,
     "message": "Field location assigned successfully",
     "data": {
       "assignment": {
         "id": "c4de...",
         "org_id": "2a44...",
         "user_id": "aa11...",
         "field_location_id": "9f1c...",
         "assigned_by": "7b02...",
         "is_active": true,
         "effective_from": "2026-11-01",
         "effective_to": "2026-11-15"
       },
       "work_mode_warning": "Note: this employee's work mode is 'office', not 'field', so field geofencing will not apply until HR changes it."
     }
   }
   ```

6. **Render `work_mode_warning` when it is non-null.** It is **not** an error — the assignment was
   created and takes effect the moment HR sets the mode — but a field site on an `office` employee
   does nothing, because the engine only unions field sites for a field-mode punch. Show it as an
   amber inline notice with a link to the employee's HR fields. It is `null` when the employee is
   already `field`.

7. **Errors:**

   | Status | `errorCode` | When |
   | :-- | :-- | :-- |
   | 400 | `VALIDATION_ERROR` | field rules, inverted window, timestamp instead of date |
   | 400 | `FIELD_LOCATION_INACTIVE` | the site is retired |
   | 403 | `HIERARCHY_VIOLATION` | outside the caller's scope, or a manager assigning to themselves |
   | 404 | `FIELD_LOCATION_NOT_FOUND` | wrong site id |
   | 404 | `EMPLOYEE_NOT_FOUND` | the user is not a member of this org |
   | 409 | `FIELD_ASSIGNMENT_DUPLICATE` | this employee already has an active assignment to this site |

   The `FIELD_ASSIGNMENT_DUPLICATE` message names the existing window (e.g. *"...(2026-11-01 to
   2026-11-15). Edit that assignment's dates or remove it before creating another."*) and the error
   body carries `details: { assignment_id, effective_from, effective_to }`. This matters because the
   uniqueness rule is **date-blind**: it covers one active (employee, site) pair regardless of
   window, so a second non-overlapping window for the same pair — Client A in November and again in
   January — also returns 409. Surface the message and offer "edit the existing assignment" rather
   than retrying.

### API 7 — Unassign

1. **Method / Endpoint:** `DELETE /api/v1/attendance/{hr|manager}/field-assignments/:assignment_id`
2. **Behaviour:** soft — sets `is_active: false`, keeping the history. The same (employee, site) pair
   can be re-assigned afterwards.
3. **Permission:** checked against the **assignee**, not against whoever created the assignment: the
   question is whether the caller may manage that employee today.
4. **Success — `200`:**

   ```json
   {
     "success": true,
     "message": "Field assignment removed successfully",
     "data": { "id": "c4de...", "already_inactive": false }
   }
   ```

   Idempotent — a repeat call returns `already_inactive: true`, not an error.

5. **Errors:** `403 HIERARCHY_VIOLATION`, `404 FIELD_ASSIGNMENT_NOT_FOUND`.

### API 8 — Get a User's Field Assignments

1. **Method / Endpoint:** `GET /api/v1/attendance/{hr|manager}/field-assignments/user/:user_id`
2. **Permission:** HR for anyone; a manager for a direct report; anyone for themselves.
3. **Success — `200`:**

   ```json
   {
     "success": true,
     "message": "Field assignments fetched successfully",
     "data": {
       "user_id": "aa11...",
       "work_mode": "field",
       "assigned_office": { "id": "4d9a...", "name": "Indore HQ" },
       "total": 2,
       "records": [
         {
           "id": "c4de...",
           "effective_from": "2026-11-01",
           "effective_to": null,
           "is_active": true,
           "field_location": {
             "id": "9f1c...",
             "name": "Tata Steel Pune Plant",
             "client_name": "Tata Steel Ltd",
             "latitude": "18.52043000",
             "longitude": "73.85674300",
             "geofence_radius_meters": 300
           },
           "assigner": {
             "id": "7b02...",
             "identifier": "manager@acme.com",
             "profile": { "display_name": "Asha Rao" }
           }
         }
       ]
     }
   }
   ```

4. **`work_mode` here is the NORMALIZED contractual mode** (`office` | `remote` | `hybrid` | `field`),
   already fail-secure: a profile whose `work_mode` is `null` reads as `office`. Use it to decide
   whether to show the field-sites panel at all.
5. **`assigned_office` is part of the valid punch area** for a field employee — composite resolution.
   Render it alongside the client sites, labelled as their base location, not as a separate concept.

### API 9 — My Field Assignments (Employee Self)

1. **Method / Endpoint:** `GET /api/v1/attendance/my-field-assignments`
2. **Roles:** every org role. Always scoped to the caller — there is no `user_id` parameter.
3. **Response:** identical to API 8.
4. **Use this on the punch screen** for any employee whose `work_mode` is `field`. Without it, an
   `out_of_bounds` flag arrives with no explanation the employee can act on. Render the sites on a
   map with their radii, and show the nearest one with its distance.

---

## 5. Changed Behaviour on Existing Punch Endpoints

### 5.1 `POST /api/v1/attendance/clock-in`

**Request:** unchanged shape. `work_mode` is still accepted (`office` | `remote` | `field` |
`hybrid`) but is now **advisory** — see Section 0.3.

**Recommendation:** send `work_mode` **only** for a `hybrid` employee, where it is the day's genuine
declaration. For every other mode the server overrides it, and sending a conflicting value raises a
`work_mode_claim_mismatch` flag against the employee for something your UI chose. Fetch the
employee's mode first (API 9) and render a "Working from office / Working from home" toggle only for
`hybrid`.

**Response — two new fields** (`201`):

```json
{
  "success": true,
  "message": "Clocked in successfully",
  "data": {
    "log_id": "...",
    "record_id": "...",
    "session_id": "...",
    "date": "2026-10-05",
    "clock_in_time": "2026-10-05T03:31:12.000Z",
    "work_mode": "field",
    "geofence": {
      "outcome": "in_bounds",
      "evaluated": true,
      "matched_location_id": "9f1c...",
      "matched_location_type": "field",
      "distance_meters": 42
    },
    "shift": { "name": "General", "start_time": "09:30", "end_time": "18:30", "type": "fixed" },
    "late_minutes": 0,
    "within_grace": true,
    "is_holiday": false,
    "is_weekly_off": false
  }
}
```

### 5.2 `POST /api/v1/attendance/clock-out`

**Request:** unchanged, and it still **does not accept `work_mode`** — do not start sending it. The
server reads the mode established at clock-in from the record. (This is deliberate: if the engine
read a clock-out payload, a hybrid employee who legitimately worked remotely would have no
`work_mode` at 18:00, be read as an office punch, and be flagged `out_of_bounds` every single
evening.)

**Response:** gains the same `work_mode` and `geofence` fields, alongside the existing calculation
fields.

### 5.3 The `geofence` object

| Field | Type | Meaning |
| :-- | :-- | :-- |
| `outcome` | string | `in_bounds` \| `out_of_bounds` \| `missing_coordinates` \| `unresolved` |
| `evaluated` | boolean | `false` when no distance check ran (remote, declared WFH, biometric, or unresolved) |
| `matched_location_id` | uuid \| null | the matched location, or the **nearest** one when out of bounds |
| `matched_location_type` | string \| null | `office` \| `field` |
| `distance_meters` | number \| null | metres to the matched/nearest location |

**`matched_location_id` is polymorphic** — it is an `organization_locations.id` when
`matched_location_type` is `office`, and an `organization_field_locations.id` when it is `field`.
Always branch on the type before you look the id up.

**Suggested punch-screen copy per outcome:**

| `outcome` | Tone | Copy |
| :-- | :-- | :-- |
| `in_bounds` | success | "Clocked in at Tata Steel Pune Plant" |
| `out_of_bounds` | warning, not error | "Clocked in — your location is 1.2 km from Tata Steel Pune Plant. This has been flagged for your manager. Submit a regularization if you were at a client site." |
| `missing_coordinates` | warning | "Clocked in without location. Enable location permission so your attendance is not flagged." |
| `unresolved` | neutral | "Clocked in. Your work location is not fully configured — ask HR to complete it." |
| `evaluated: false` | success, no geofence chrome | "Clocked in" |

The punch **always succeeded**. Never render these as a failed action or roll back optimistic UI.

### 5.4 Regularization — `work_mode` is now validated at submission

`POST /api/v1/attendance/regularizations` still accepts an optional `work_mode`, but it is now
reconciled against the employee's contract **at submission** rather than silently applied at
approval:

| Contract | Accepted `work_mode` values |
| :-- | :-- |
| `office` / `on-site` (incl. `null` profiles) | `office`, `on-site` |
| `remote` | `remote` |
| `field` | `field` |
| `hybrid` | `office` **or** `remote` |

| Status | `errorCode` | When |
| :-- | :-- | :-- |
| 400 | `WORK_MODE_NOT_PERMITTED` | the stated mode is not allowed by the contract |
| 400 | `INVALID_WORK_MODE` | unrecognized value |

Error messages are employee-facing and name the next step ("Ask HR to correct your work mode if it
is wrong") — surface them verbatim.

**Simplest integration:** omit `work_mode` from the regularization form entirely unless the employee
is `hybrid`. Omitting it leaves the record's existing mode untouched, which is almost always correct.

**New on approval:** approving a regularization now **resolves that day's geofence flags**
(`out_of_bounds`, `missing_coordinates`, `geofence_unresolved`, `work_mode_claim_mismatch`), marking
them resolved with the approver and a note referencing the request. The approval response gains:

```json
{ "success": true, "regularization_refunded_leave": false, "geofence_anomalies_resolved": 2 }
```

Show it in the approval confirmation — "Approved, 2 location flags cleared" — and refresh the
anomalies list, which will have shrunk.

---

## 6. Authorization Model

### 6.1 Assignment scope — one level deep

Assignment is gated by the shared hierarchy resolver:

| Caller | May assign to |
| :-- | :-- |
| `hr`, `admin`, `super-admin` | **anyone** in the organization |
| `manager` | their **active direct reports only** |
| `employee` | nobody (`403 HIERARCHY_VIOLATION`) |

**It is direct reports only — not a recursive tree.** A manager cannot assign to a report's report.
Do not build a multi-level org-tree picker on the manager screen; fetch the manager's direct reports
and offer those. This matches the scope already used for anomaly resolution and regularization
approval, so your existing team-picker component is the right one.

A manager also **cannot assign a field location to themselves** — the resolver never returns the
caller's own id. Exclude the current user from the manager picker, and if the API is hit anyway the
error message is specific: *"You cannot assign a field location to yourself. Ask an HR admin to
assign it."*

### 6.2 Mutation scope — creator or HR

| Operation | Who |
| :-- | :-- |
| Create a site | any manager or HR; the result is visible org-wide |
| List / view a site | any manager or HR in the org |
| Edit / retire a site | **HR admin, or the manager who created it** (`created_by`) |

`GET /field-locations/:id` returns **`can_modify`** — use that to gate the edit and delete controls
rather than computing it from `created_by` yourself. On the list endpoint, where `can_modify` is not
returned, compare `location.created_by` against the current user id and treat any HR-role user as
permitted. The server is authoritative (`403 FIELD_LOCATION_FORBIDDEN`), and it resolves the HR role
from the database rather than the JWT claim, so a revoked HR role loses these rights immediately
rather than at token expiry.

---

## 7. New Anomaly Types for the HR Attendance Flags Inbox

These arrive through the existing anomaly endpoints
(`GET /api/v1/attendance/hr/anomalies`, `/manager/team/anomalies`, `/api/v1/attendance/my-anomalies`).
Add rendering for them or they will fall through to a default label.

| `type` | `severity` | Meaning | Who should act |
| :-- | :-- | :-- | :-- |
| `out_of_bounds` | `high` | Punched outside every valid location. Description names the punch side and the nearest location with its distance | Manager / HR — genuine review |
| `missing_coordinates` | **`high`** (was `medium`) | A geofenced employee punched with no GPS | Manager / HR — chase the employee's device |
| `geofence_unresolved` | `medium` | **NEW.** Nothing to check against: no assigned office, no active branch, no assigned site, or the location has no GPS pin | **HR — this is a configuration gap, not employee misconduct** |
| `work_mode_claim_mismatch` | `medium` | **NEW.** The punch claimed a work mode the contract does not allow; the contract was enforced | HR — either the profile is wrong or the client is sending a bad value |

**`geofence_unresolved` must not be styled as misconduct.** It means an administrator has not
finished setting up a location. Route it to a "Setup issues" group with a link to the employee's
location settings, not to the disciplinary queue.

**Duplicate `out_of_bounds` rows per day are expected and correct.** Clock-in and clock-out each
raise their own, so HR can distinguish a shift-start breach (potential false reporting) from a
shift-end one (transit home). Each description begins with `Clock-in` or `Clock-out`. Group them by
record for display — **do not de-duplicate by type**, or you will hide the clock-out breach.

Severity values are unchanged in shape: `low` | `medium` | `high`.

---

## 8. Provenance — Where a Punch's Location Is Recorded

Two places, by design:

1. **`attendance_logs.metadata.geofence`** — the source of truth, per punch. Clock-in and clock-out
   each carry their own, so an employee who starts at Client A and finishes at Client B has both
   preserved:

   ```json
   {
     "geofence": {
       "evaluated": true,
       "outcome": "in_bounds",
       "action": "Clock-in",
       "assigned_mode": "field",
       "effective_mode": "field",
       "declared_mode": null,
       "matched_location_id": "9f1c...",
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

2. **`attendance_records.matched_location_id` / `matched_location_type` /
   `distance_to_location_meters`** — a denormalized cache of the **clock-in** match, for fast roster
   and dashboard reads. **Not overwritten at clock-out** — the day's location is where the employee
   worked, and the clock-out site lives in its own log's metadata.

If you build a "where was this punch?" detail view, read the log metadata. If you build a roster
column, read the record columns.

`office_fallback_used: true` means the employee has no assigned office and was checked against every
active branch — worth surfacing to HR as an onboarding gap.

---

## 9. Biometric Device Punches

A punch from a biometric device (`source: 'biometric'`) carries no GPS — the device's own fixed
location is the attestation, which is stronger evidence than client-reported coordinates. These
punches **skip GPS geofencing entirely**, are treated as `in_bounds`, and raise **no anomaly**.
Their provenance records `"reason": "device_attested"`.

If your HR dashboard shows a geofence column, render device punches as "Device verified" rather than
blank or "No location".

---

## 10. Frontend Implementation Checklist

**Onboarding wizard (breaking — do this first)**
- [ ] Remove the **Work Mode** input from the self-service job-profile step.
- [ ] Remove the **Office Location** input from the same step.
- [ ] Remove all use of `org_structure.can_set_location`.
- [ ] Stop treating a blank `work_mode` / `location_id` as blocking self-setup completion.
- [ ] Add copy pointing the employee at HR for both fields.

**Punch screen**
- [ ] Call `GET /api/v1/attendance/my-field-assignments` on load; show the field-sites panel only
      when `work_mode === 'field'`.
- [ ] Show the office/home toggle (`work_mode: 'office' | 'remote'`) **only** when
      `work_mode === 'hybrid'`; stop sending `work_mode` for every other mode.
- [ ] Render the `geofence` object from the clock-in/clock-out response using the copy table in 5.3.
- [ ] Never treat a geofence outcome as a failed punch.
- [ ] Render the resolved `work_mode` from the response, not local state.

**Field Management screen (new)**
- [ ] List with search (`name` / `client_name` / `city`) and pagination.
- [ ] Create form with a **required** map picker and a radius slider (50–2000 m, default 250).
- [ ] `parseFloat` latitude/longitude before use — they are strings.
- [ ] Show edit/delete from `can_modify` on the detail response (or `created_by` / HR role on the list).
- [ ] Handle `assignments: null` on the detail response — it is withheld unless `can_modify` is true.
- [ ] Delete confirmation showing `assigned_user_count`; success toast showing
      `assignments_deactivated`.
- [ ] Handle `FIELD_LOCATION_DUPLICATE` by offering the existing site.
- [ ] Do not send `is_active` on update — use `DELETE` to retire a site.

**Assignment screen (new)**
- [ ] Employee picker: all org members for HR, **direct reports only** for a manager, excluding self.
- [ ] Date pickers emitting **`YYYY-MM-DD` strings**, never `toISOString()`.
- [ ] Both window ends inclusive; `effective_to` optional (open-ended).
- [ ] Render `work_mode_warning` as an amber notice, not an error.
- [ ] On `FIELD_ASSIGNMENT_DUPLICATE`, show the existing window from `details` and link to editing
      that assignment — the pair can hold only one active assignment at a time, whatever the dates.

**Attendance Flags inbox**
- [ ] Add labels and icons for `geofence_unresolved` and `work_mode_claim_mismatch`.
- [ ] Group `geofence_unresolved` under "Setup issues", not disciplinary.
- [ ] `missing_coordinates` is now `high` — check any severity-based filter or sort.
- [ ] Group geofence anomalies by record, keeping both the clock-in and clock-out rows.
- [ ] Show `geofence_anomalies_resolved` after a regularization approval and refresh the list.

**Regularization form**
- [ ] Offer `work_mode` only for `hybrid` employees; omit it otherwise.
- [ ] Surface `WORK_MODE_NOT_PERMITTED` / `INVALID_WORK_MODE` messages verbatim.

**Dashboards**
- [ ] Expect only `office` | `remote` | `hybrid` | `field` | `null` from attendance work-mode
      groupings; the `on-site` bucket is gone for new data and normalized for old.

---

## 11. Error Code Reference

| `errorCode` | Status | Endpoints |
| :-- | :-- | :-- |
| `VALIDATION_ERROR` | 400 | all |
| `FIELD_LOCATION_INACTIVE` | 400 | update, assign |
| `WORK_MODE_NOT_PERMITTED` | 400 | regularization submit |
| `INVALID_WORK_MODE` | 400 | regularization submit |
| `FIELD_LOCATION_FORBIDDEN` | 403 | update, delete |
| `HIERARCHY_VIOLATION` | 403 | assign, unassign, user assignments |
| `FIELD_LOCATION_NOT_FOUND` | 404 | get, update, delete, assign |
| `FIELD_ASSIGNMENT_NOT_FOUND` | 404 | unassign |
| `EMPLOYEE_NOT_FOUND` | 404 | assign |
| `FIELD_LOCATION_DUPLICATE` | 409 | create, update |
| `FIELD_ASSIGNMENT_DUPLICATE` | 409 | assign |

Errors follow the platform envelope:

```json
{ "success": false, "message": "human-readable text", "errorCode": "FIELD_LOCATION_DUPLICATE" }
```

---

## 12. Work Mode & Geofence Decision Matrix (Reference)

The contractual mode is read from the profile and normalized; `on-site` and `null` both resolve to
`office`.

| Contract | Declared at punch | GPS | Checked against | Result |
| :-- | :-- | :-- | :-- | :-- |
| `office` | anything / omitted | missing | assigned office | accepted, `missing_coordinates` (high) |
| `office` | anything / omitted | inside | assigned office | accepted, `in_bounds` |
| `office` | anything / omitted | outside | assigned office | accepted, `out_of_bounds` (high) |
| `office` | `remote` (forged) | anywhere | assigned office | accepted, geofenced anyway + `work_mode_claim_mismatch` |
| `remote` | anything | any | nothing | accepted, bypassed |
| `hybrid` | `remote` | any | nothing | accepted, bypassed |
| `hybrid` | `office` / omitted | inside | assigned office | accepted, `in_bounds` |
| `hybrid` | `office` / omitted | outside | assigned office | accepted, `out_of_bounds` (high) |
| `field` | anything | missing | sites + office | accepted, `missing_coordinates` (high) |
| `field` | anything | inside any | sites + office | accepted, `in_bounds`, nearest match recorded |
| `field` | anything | outside all | sites + office | accepted, `out_of_bounds` (high), nearest recorded |
| any geofenced | — | any | **nothing resolvable** | accepted, `geofence_unresolved` (medium) |
| any | — | n/a (`biometric`) | device attestation | accepted, `in_bounds`, no anomaly |

A `hybrid` employee who omits `work_mode` is treated as claiming office presence and is geofenced —
fail-secure, so a punch cannot skip verification by sending less data.

---

## 13. Related Documents

- `public/md_updates/2026-10-05_work_mode_and_field_geofencing_architecture_decisions.md` — the
  architectural decisions, the audit findings behind each rule, and the full rationale.
- `public/md_attendance/3_user_attendance_api.md` — the base clock-in / clock-out contract.
- `public/md_attendance/4_manager_attendance_api.md`, `5_hr_attendance_api.md` — the routers these
  endpoints were added to.

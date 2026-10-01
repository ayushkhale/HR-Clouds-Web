# Attendance Module — Backend API Contract

**Audience:** Frontend developers integrating the attendance module
**Status:** Authoritative. Supersedes `3_user_attendance_api.md`, `4_manager_attendance_api.md`, `5_hr_attendance_api.md`, `6_webhook_attendance_api.md` wherever they disagree.
**Derived from:** route, validator, controller, service and model source in `src/modules/attendance/` — not from the older docs.
**Answers:** every open question C1–C22 raised in `ATTENDANCE_MODULE_FIX_REPORT.md` (§2).

> **How this document was produced.** Every request contract below (field names, types, enums, required/optional, formats) was read directly out of the Joi validators, which are the code that actually accepts or rejects your payload. Response shapes were read out of the service return statements. Where a response is assembled dynamically and I did not trace every branch, it is marked **(not exhaustively verified)** — treat those as indicative, not guaranteed.

---

## 1. Conventions

### 1.1 Base paths

| Actor | Base path | Mounted from |
|---|---|---|
| Employee self-service | `/api/v1/attendance` | `user_attendance.routes.js`, `user_attendance_read.routes.js` |
| Manager | `/api/v1/attendance/manager` | `manager_attendance.routes.js`, `manager_attendance_read.routes.js` |
| HR | `/api/v1/attendance/hr` | `hr_attendance.routes.js`, `hr_attendance_read.routes.js` |
| Device webhook | `/api/v1/attendance/devices/webhook` | `device_webhook.routes.js` |

### 1.2 Authentication

All endpoints except the webhook require `Authorization: Bearer <JWT>`.

The webhook authenticates with a **device API key**, also sent as `Authorization: Bearer <api_key>`. The key is compared as a SHA-256 hash against `attendance_devices.api_key_hash`. The plaintext key is returned **only once**, at device creation — see §7.1.

### 1.3 Feature flag

Every non-webhook endpoint sits behind `requireFeature('attendance.access')`.

If the org's plan does not include it:

```
HTTP 403
{ "success": false, "message": "This feature is not available on your current subscription plan.", "code": "FEATURE_NOT_AVAILABLE" }
```

Render your "Attendance isn't enabled" state on this code. It is a 403, not a 404.

### 1.4 Role authorization

| Route group | Roles accepted |
|---|---|
| `/attendance/*` (self-service) | all org roles (`employee`, `manager`, `hr`, `admin`, `super-admin`) |
| `/attendance/manager/*` | `manager`, `hr`, `admin`, `super-admin` |
| `/attendance/hr/*` (write + dashboards) | `hr`, `admin`, `super-admin` |
| `/attendance/hr/hrs/*` (HR-staff reads only) | `hr`, `manager`, `admin`, `super-admin` |

Note the exception in the last row: the four `/hr/hrs/...` read endpoints are deliberately open to managers too. Everything else under `/hr` is HR-only.

### 1.5 Response envelope

Success — always this shape:

```json
{ "success": true, "message": "Human readable string", "data": { } }
```

`201` for created resources (regularization submit, and HR creates). `200` for everything else. Some decision endpoints return no `data` key at all (approve/reject on regularization, overtime, comp-off, anomaly) — do not read `data` on those.

Error:

```json
{ "success": false, "message": "Human readable string", "code": "MACHINE_CODE" }
```

Always branch on `code`, never on `message`. Messages are not stable.

### 1.6 Pagination — two different key styles

This is a real inconsistency in the backend. Until it is unified, handle both:

```json
"pagination": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 }
```

| Key style | Used by |
|---|---|
| **`totalPages`** (camelCase) | `/attendance/history`, `/regularizations`, `/overtime/mine`, `/anomalies/mine`, `/comp-offs/mine` — i.e. all self-service lists, plus manager pending queues |
| **`total_pages`** (snake_case) | all `/attendance/hr/*` read endpoints, and `/attendance/manager/team/member/:userId/history` |

`page`, `limit` and `total` are consistent across both. Only the page-count key differs.

> Keeping a normaliser that accepts both is the correct call. It is on the backlog to unify on `total_pages`; this document will be updated when that lands, and it will be a breaking change announced in advance.

### 1.7 Dates and times

| Context | Format | Notes |
|---|---|---|
| Holiday `date` | **strict `YYYY-MM-DD` string** | Regex-enforced *and* re-validated with dayjs strict parsing. An ISO datetime is rejected with `VALIDATION_ERROR`. |
| `recompute-stale` `date` | **strict `YYYY-MM-DD` string** | Same regex. |
| All other date fields | ISO 8601, `Joi.date().iso()` | `YYYY-MM-DD` is accepted and is what you should send. A full timestamp is also accepted but will be interpreted in UTC — sending `YYYY-MM-DD` avoids off-by-one. |
| Shift times (`start_time`, `end_time`, `core_*`, `split_*`) | `HH:mm` or `HHmm`, 24-hour | Regex `^([01]\d|2[0-3]):?([0-5]\d)$`. Seconds are **not** accepted. |
| Regularization `requested_clock_in` / `_out` | ISO datetime **or** `HH:mm` / `HH:mm:ss` | Both accepted. Send a full ISO datetime for overnight corrections so the date is unambiguous. |
| Timestamps in responses | ISO 8601 UTC | Convert to local for display. |
| `DATEONLY` fields in responses (`date`, `expiry_date`, `effective_from`…) | `YYYY-MM-DD` string | Do **not** pass to `new Date()` directly — that parses as UTC midnight and renders the previous day west of UTC. |

**Server-side "today" is currently computed in `Asia/Kolkata`**, not the org's timezone, and one endpoint computes it in UTC (see §8.2). If you need a specific day, pass it explicitly rather than relying on the server's default.

### 1.8 Unknown fields are silently dropped

Validation runs with `allowUnknown: false, stripUnknown: true`. In Joi, `stripUnknown` wins: **extra keys are silently removed, not rejected.**

Consequence: if you send a field the backend does not know, you get `200 OK` and your field is discarded without warning. A successful response is *not* evidence that a field was understood. This is how the `is_off` field in §2 C5 fails silently.

---

## 2. Answers to open questions C1–C22

Ordered as in your report. Every answer here is verified against source.

---

### C1 — HR regularization endpoints ✅ **Your decision is correct, with one correction**

**Decisions via manager routes: correct, and not hierarchy-limited for HR.**

`getAccessibleUserIds()` in `src/common/utilities/hierarchy_access.utils.js` returns `null` for roles in `GLOBAL_APPROVER_ROLES = ['hr', 'admin', 'super-admin']`. `null` means "no filter — may act on anyone in the org". `/attendance/manager/*` authorizes `['manager','hr','admin','super-admin']`. So an HR user calling `POST /attendance/manager/regularizations/:id/approve` can act on **any** record in the org and will never see `HIERARCHY_VIOLATION`.

**Correction — there is no org-wide HR regularization list endpoint.** `hr_attendance.routes.js` defines no `/regularizations` route at all. Your fallback path is the only path. Remove the primary call and the 404/405 fallback logic, and read the list from:

```
GET /api/v1/attendance/manager/regularizations/pending
```

For an HR caller this already returns the whole org, because of the `null` filter above. Note it returns **pending only** — there is currently no endpoint that returns approved/rejected regularizations org-wide. If HR needs historical regularizations, that is a new endpoint; raise it and we will add it.

---

### C2 — Assignment PUT ✅ **Correct to remove**

There is no `PUT /hr/shifts/assignments/:id` route. Only `POST /hr/shifts/assign`, `POST .../:assignment_id/end`, and `DELETE .../:assignment_id`. To change an assignment: end it and create a new one. That preserves history; an in-place edit would not.

---

### C3 — Shift request keys ✅ **Confirmed**

Full verified contract in §5.2. `type` is `fixed | flexible | split | night | rotational`. `policy_id` exists and accepts a UUID or `null`. All the per-type fields you were sending are real.

---

### C4 — Policy extras ⚠️ **Stop making these conditional**

`late_threshold_minutes`, `is_default` and `max_breaks_per_day` are **all first-class fields** in `createPolicySchema`. They were never undocumented — the old doc was incomplete.

Send them unconditionally. The conditional "only if existing policies already carry the key" logic is unnecessary and should be removed. Full field list in §5.1.

---

### C5 — Rotation off-days 🔴 **BREAKING — your current payload will fail**

This is the highest-priority item in this document.

`createRotationSchema.entries[]` is:

```js
entries: Joi.array().items(
  Joi.object({
    shift_id:       Joi.string().uuid().required(),   // NOT nullable
    sequence_order: Joi.number().integer().min(1).required(),
    duration_days:  Joi.number().integer().min(1).required()
  })
).min(1).required()
```

Your payload sends `{ shift_id: null, is_off: true }`. Both parts fail:

1. `shift_id: null` → `shift_id` is a **required** UUID, null is not allowed → **HTTP 400 `VALIDATION_ERROR`**.
2. `is_off` → unknown key → **silently stripped** (§1.8), so even a valid-looking request would lose it.

**There is currently no way to express an off-day phase in a rotation.** The backend does not support it. Any rotation containing an off-day phase will be rejected outright.

Two options, your call:

- **Short term:** remove the off-day phase UI, or build rotations from working phases only and let the weekly-off rules supply the rest days. Weekly-off rules already support `target_shifts`, so you can target a rest rule at the rotation's shifts.
- **Proper fix (backend work, needs your go-ahead):** make `shift_id` nullable and add `is_off: Joi.boolean().default(false)` to the entry schema, plus handling in `rotation.service.js` and `_resolveRotationShift`. Non-trivial — it changes shift resolution. Raise a ticket and we will scope it.

Also note `rotation_cycle_days` is **required** by the schema. Deriving it from Σ `duration_days` client-side is right, but you must still send it. The backend does not currently validate that it equals the sum — sending an inconsistent value will produce a broken rotation, so keep your derivation.

---

### C6 — Assignment dates, `rotation_pattern_id`, overlap ✅ **Confirmed, plus one rule you are missing**

```js
assignShiftSchema = Joi.object({
  user_id:            Joi.string().uuid().required(),
  shift_id:           Joi.string().uuid().allow(null),
  rotation_pattern_id:Joi.string().uuid().allow(null),
  effective_from:     Joi.date().iso().required(),
  effective_to:       Joi.date().iso().allow(null).optional()
}).xor('shift_id', 'rotation_pattern_id')
```

**`.xor()` means exactly one of `shift_id` / `rotation_pattern_id` must be present.** Sending both, or neither, is a 400. Enforce that as a client-side rule so the user gets a field error instead of a server error.

`YYYY-MM-DD` for both dates is correct. Overlap behaviour is not validated at the schema level; keep your neutral copy.

---

### C7 — Holiday fields ✅ **Confirmed**

`type` is `public | optional | restricted`, default `public`.

`date` must be a **strict `YYYY-MM-DD` string** — this endpoint is stricter than the others (regex + dayjs strict re-parse). Sending an ISO datetime is a 400.

Targeting arrays, all defaulting to `[]`: `target_departments` (UUIDs), `target_locations` (UUIDs), `target_employment_types` (free strings), `target_job_statuses` (free strings), `included_users` (UUIDs), `excluded_users` (UUIDs).

`target_employment_types` and `target_job_statuses` are **unconstrained strings** — the backend does not validate them against an enum. Sourcing the values from the roster, as you do, is the right approach.

---

### C8 — Weekly-off day numbering ✅ **Confirmed: 0 = Sunday … 6 = Saturday**

`days_of_week: Joi.array().items(Joi.number().integer().min(0).max(6)).required()`. This matches JavaScript's `Date.getDay()`, so your mapping is correct.

`effective_from` is **required** (your fix for the empty-string bug was necessary). `effective_to` is nullable/optional. `priority` is an integer, default `0`.

Weekly-off rules support a wider targeting set than holidays — they additionally have `target_shifts` (UUIDs) and `target_users` (UUIDs). Full list in §5.5.

---

### C9 — Devices — out of scope, contract documented anyway

See §7. Phase 8 is not implemented on your side, but the contract is included so it is not rediscovered later. **Please read §7.1 — the current device-registration flow has a real defect on your side that loses the API key permanently.**

---

### C10 — Comp-off decision bodies ✅ **Confirmed**

Both HR and manager decision endpoints take the same body:

```js
{ remarks: Joi.string().max(1000).allow('', null).optional() }
```

Optional everywhere, on both approve and reject. Requiring remarks on reject is a **UI-only policy** — the backend will accept a reject with no remarks. Keep enforcing it client-side if that is the product decision, but do not expect a server error to back you up.

---

### C11 — Comp-off record shape / `rejected` status ⚠️ **Important correction**

`attendance_comp_offs.status` is a `STRING(20)`, not a DB enum. The values the service actually writes:

| Value | Set when |
|---|---|
| `earned` | default on creation |
| `approved` | approve endpoint |
| `cancelled` | **reject endpoint** |
| `expired` | expiry job |
| `used` | consumed as leave |

**Rejecting a comp-off writes `cancelled`, not `rejected`.** There is no `rejected` state for comp-offs. Removing the `rejected` tab was correct — but make sure a rejected item is surfaced under `cancelled`, otherwise HR will reject something and watch it vanish from the UI.

The query filter enum on `/comp-offs/mine` is `earned | approved | used | expired | cancelled` — matching. `GET /hr/comp-offs` does not validate `status` against an enum, so pass only the five values above.

---

### C12 / C13 — Comp-off / overtime creation ✅ **Correct absence**

Neither has a creation endpoint. Both are generated by the backend:

- **Overtime** is created during clock-out when the policy has `overtime_enabled` and worked time exceeds `overtime_min_minutes`. If `overtime_requires_approval` is true it lands as `pending`, otherwise it is auto-approved.
- **Comp-off** is created when `comp_off_on_holiday_work` is true on the policy and the employee works a holiday or weekly-off. `min_hours_for_half_day` / `min_hours_for_full_day` on the comp-off policy decide half vs full.

Not having request forms is correct.

---

### C14 — Undocumented response shapes ✅ **Now documented**

§4–§7 document the response shapes. Where I did not trace every conditional branch I have marked the block **(not exhaustively verified)**. Keep your tolerant normalisers for those; you can tighten the ones that are documented as verified.

---

### C15 — Team-history query params 🔴 **Neither option is right — the endpoint ignores all filters**

You asked whether it is `from`/`to` or `start_date`/`end_date`. It is **neither**.

```js
// manager_attendance.routes.js — note: no validate() middleware
router.get('/team/history', controller.handleGetTeamHistory)

// manager_attendance.controller.js
exports.handleGetTeamHistory = async (req, res, next) => {
  const result = await teamService.getTeamHistory(req.user.orgId, req.user)  // req.query never passed
  ...
}

// team.service.js
async getTeamHistory (orgId, requesterUser) {
  const allowedUserIds = await accessControl.getAccessibleUserIds(orgId, requesterUser)
  return await recordRepo.findTeamHistory(orgId, allowedUserIds)   // no date bound, no limit
}
```

`GET /attendance/manager/team/history` accepts **no query parameters at all** and returns **every attendance record ever recorded** for the manager's whole team, each with four joined profile tables. No date filter, no pagination.

Your date pickers and pagination on this page are inert — they change nothing. Whatever you send is discarded.

This is a backend defect, not a documentation gap (§8.1). It is an unbounded query and will degrade badly as data grows. **Recommendation: do not ship the Team History page against this endpoint.** Either hide it until the backend adds `from`/`to` + pagination, or drive the page off `GET /attendance/manager/team/member/:userId/history`, which *is* properly filtered and paginated (§4.2) — at the cost of requiring a member to be selected first.

The same "query ignored" pattern applies to `/team/today` and `/team/anomalies`, though those are naturally bounded to one day / unresolved rows.

**For HR list endpoints and reports, the keys you kept are correct** — those validators do declare `from`/`to`/`search`/`department`/`status`/`page`/`limit`. See §6.1. HR list filtering works; only the manager team-history one is broken.

---

### C16 — Anomaly `open` vs `unresolved` ✅ **Both, at different layers**

The **query parameter** is `status`, enum `open | resolved | all`, default `all`. Your filter is correct.

The **response field is `is_resolved`, a boolean** — there is no `status` string on an anomaly record. The model has no status column at all.

```js
const isResolved = status === 'open' ? false : status === 'resolved' ? true : null
```

Read `is_resolved` when rendering. Other real fields: `type` (STRING(50), free-form), `severity` (STRING(20), default `medium`), `description`, `resolution_notes`, `resolved_by`, `resolved_at`, `date`, `record_id`.

`severity` and `type` are **not** constrained to an enum in the database. Render unknown values gracefully rather than assuming a fixed set.

---

### C17 — Lock side effects / payroll lock identification ✅ **Your neutral copy is correct**

`createLockSchema` is exactly `{ start_date, end_date, reason? }`, with `end_date >= start_date` enforced by `Joi.ref`. That is the whole contract — there are no `payroll_run_id` or `source` fields on the create path.

Removing the "auto-rejects pending requests" claim was right: `lock.service.js` does not touch pending requests. A lock only blocks new writes.

Enforcement raises **`PERIOD_LOCKED`** — see C-note below, this matters.

Creating an overlapping lock raises `OVERLAPPING_LOCK` (409).

---

### 🔴 Correction not in your list: `DATE_LOCKED` does not exist

Your error map keys on `DATE_LOCKED`. **That code is never emitted anywhere in the backend.** The actual code is:

```js
throw new AppError(403, `Cannot modify records. Date ${dateOnly} is locked for payroll.`, 'PERIOD_LOCKED')
```

**`PERIOD_LOCKED`, HTTP 403** — not `DATE_LOCKED`, and not a 409.

Every lock-related error path you built is currently dead code and will fall through to your generic handler. Fix the key and the status. Full verified code list in §3.

---

### C18 / C19 — Clock-out fields and `work_mode` ⚠️ **Partly wrong**

**`work_mode` is accepted on clock-IN only. It is not a field on clock-out.**

```js
clockInSchema  = { source, latitude, longitude, client_timestamp, notes, work_mode, metadata }
clockOutSchema = { source, latitude, longitude, client_timestamp, notes, metadata }   // no work_mode
```

If you send `work_mode` on clock-out it is silently stripped (§1.8) and the punch succeeds, so this will not surface as an error — the value simply never lands.

Clock-out accepts **six** optional fields, not four. `metadata` is a free-form object, unused by the frontend today but available.

`work_mode` enum on clock-in: `office | remote | field | hybrid`. Nullable. `regularizationRequestSchema` also accepts `work_mode` with the same enum — an approved regularization copies it onto the record.

`source` is `web | mobile | api`, defaulting to `web`.

⚠️ **`client_timestamp` is accepted but you should not rely on it.** See §8.3 — it is not currently used as the authoritative punch time, and it must not become one.

---

### C20 — Manager access to `/hr/hrs/*` ✅ **Already granted — your UI is more restrictive than the backend**

```js
const hrAndManagerRoles = ['hr', 'manager', 'admin', 'super-admin']
router.get('/hrs/attendance',           authorize(hrAndManagerRoles), ...)
router.get('/hrs/:userId/attendance',   authorize(hrAndManagerRoles), ...)
router.get('/hrs/:userId/summary',      authorize(hrAndManagerRoles), ...)
router.get('/hrs/:userId/daily-log',    ...)
```

Managers **can** already call all four `/hr/hrs/*` read endpoints — each carries an explicit `authorize(hrAndManagerRoles)`. This is deliberate: a manager may have an HR employee as a direct report and needs to see their attendance.

Not exposing it in the manager UI is a valid product choice, but it is your choice, not a backend limitation.

---

### C21 — Recompute response ✅ **Confirmed**

Request: `{ date?: "YYYY-MM-DD" }` — strict format, optional, nullable. Omit it to recompute all stale records.

Response `data` contains a count of recomputed records. Showing it when present is correct. **(exact key not exhaustively verified — keep the "when present" guard)**

---

### C22 — `/today` break total ✅ **The backend gives you both; prefer the server value**

`GET /attendance/today` returns all three:

```json
{
  "break_duration_minutes": 45,
  "active_break": { "id": "…", "start_time": "…", "end_time": null },
  "breaks": [ { "id": "…", "start_time": "…", "end_time": "…" } ]
}
```

`break_duration_minutes` is a real persisted column on `attendance_records` and is authoritative for **closed** breaks. It was never undocumented — the old doc omitted it.

Recommended: use `break_duration_minutes` as the base, and add live elapsed time from `active_break.start_time` only while a break is open. Summing `breaks[]` yourself also works and will agree. `active_break` is derived as the entry in `breaks[]` with `end_time === null`, so you do not need to scan for it.

---

## 3. Error codes — verified list

Every code below was found in attendance module source. **If a code is not on this list, the backend does not emit it.**

### 3.1 Punch / clock

| Code | HTTP | Meaning |
|---|---|---|
| `ALREADY_CLOCKED_IN` | 409 | Already clocked in for today |
| `NOT_CLOCKED_IN` | 400 | Clock-out/break with no open record |
| `NO_ACTIVE_BREAK` | 400 | Break-end with no open break |
| `MAX_BREAKS_EXCEEDED` | 400 | Policy `max_breaks_per_day` exceeded |
| `PREVIOUS_SHIFT_OPEN` | 409 | An overnight record from a previous day is still open |
| `PERIOD_LOCKED` | **403** | Date falls inside a payroll lock — **use this, not `DATE_LOCKED`** |

### 3.2 Regularization

| Code | HTTP | Meaning |
|---|---|---|
| `REGULARIZATION_DISABLED` | 403 | Policy has `regularization_allowed: false` |
| `INVALID_REGULARIZATION_DATE` | 400 | Older than `regularization_window_days` |
| `INVALID_REGULARIZATION_WINDOW` | 400 | Requested clock-out not after clock-in |
| `INVALID_REGULARIZATION_TIME` | 400 | Unparseable time |
| `ALREADY_PENDING` | 409 | A pending request already exists for that date |
| `ALREADY_PROCESSED` | 400 | Request is no longer `pending` |
| `FORBIDDEN` | 403 | Withdrawing someone else's request |

### 3.3 Authorization

| Code | HTTP | Meaning |
|---|---|---|
| `FEATURE_NOT_AVAILABLE` | 403 | `attendance.access` not on the plan |
| `HIERARCHY_VIOLATION` | 403 | Target user is not in the actor's reporting line |
| `EMPLOYEE_NOT_IN_TEAM` | 403 | Same, on team-scoped reads |
| `UNAUTHORIZED` | 403 | Cross-org access attempt |
| `NOT_HR` | 403 | HR-only operation |

### 3.4 Configuration

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Joi rejection. `message` is the first Joi detail — safe to surface. |
| `POLICY_NOT_FOUND` / `POLICY_DELETED` / `POLICY_DEACTIVATED` | 404 / 400 | |
| `SHIFT_NOT_FOUND` / `SHIFT_IN_USE` / `SHIFT_DEACTIVATED` / `INVALID_SHIFT` / `INVALID_SHIFT_DATA` | 404 / 409 / 400 | `SHIFT_IN_USE` on deleting an assigned shift |
| `PATTERN_NOT_FOUND` / `PATTERN_IN_USE` / `INVALID_ROTATION_DURATIONS` | 404 / 409 / 400 | |
| `ASSIGNMENT_NOT_FOUND` | 404 | |
| `HOLIDAY_NOT_FOUND` / `WEEKLY_OFF_NOT_FOUND` / `WEEKLY_OFF_DELETED` | 404 | |
| `LOCK_NOT_FOUND` / `OVERLAPPING_LOCK` | 404 / 409 | |
| `COMP_OFF_NOT_FOUND` / `COMP_OFF_NOT_EARNED` | 404 / 400 | |
| `EMPLOYEE_NOT_FOUND` / `USER_NOT_FOUND` / `MANAGER_NOT_FOUND` / `NOT_FOUND` | 404 | |

### 3.5 Device / webhook

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED_DEVICE` | 401 | Bad/missing API key, or device inactive |
| `MAPPING_NOT_FOUND` / `MAPPING_ALREADY_EXISTS` | 404 / 409 | |
| `UNSUPPORTED_PUNCH_TYPE` | 400 | |
| `PUNCH_NOT_APPLIED` | 200 | Logged but not applied — see §7.2 |

---

## 4. Employee self-service — `/api/v1/attendance`

### 4.1 Punch

#### `GET /today`

Query: `date` (ISO, optional).

Response `data` — **verified**. Two shapes depending on whether a record exists.

No record yet:

```json
{
  "date": "2026-09-13",
  "status": "not_marked",          // or "holiday" | "weekly_off"
  "clock_in_time": null,
  "clock_out_time": null,
  "effective_hours": null,
  "break_duration_minutes": 0,
  "active_break": null,
  "breaks": [],
  "shift": { "name": "General", "start_time": "09:00", "end_time": "18:00", "type": "fixed" },
  "late_minutes": 0,
  "is_holiday": false,
  "is_weekly_off": false
}
```

With a record: same keys, plus `total_hours`, and `status` becomes the record's status. `shift` is `null` when no shift is assigned — guard for it.

**Overnight behaviour:** if no record exists for today but an overnight record from yesterday is still open, `/today` returns **yesterday's** record and `date` is yesterday. This is deliberate — it stops you rendering a Clock In button that could only fail with `PREVIOUS_SHIFT_OPEN`. Always render from the returned `date`, never from your own "today".

`status` values: `not_marked`, `present`, `absent`, `half_day`, `holiday`, `weekly_off`, `on_leave`.

#### `POST /clock-in`

```js
{
  source:           'web' | 'mobile' | 'api',           // default 'web'
  latitude:         number -90..90,      // nullable, optional
  longitude:        number -180..180,    // nullable, optional
  client_timestamp: ISO datetime,        // nullable, optional — see §8.3
  notes:            string ≤500,         // nullable, optional
  work_mode:        'office'|'remote'|'field'|'hybrid', // nullable, optional
  metadata:         object               // nullable, optional
}
```

Errors: `ALREADY_CLOCKED_IN` (409), `PREVIOUS_SHIFT_OPEN` (409), `PERIOD_LOCKED` (403).

#### `POST /clock-out`

Same as clock-in **minus `work_mode`** (§2 C18). Errors: `NOT_CLOCKED_IN` (400), `PERIOD_LOCKED` (403).

#### `POST /break/start`, `POST /break/end`

```js
{ source: 'web'|'mobile'|'api', notes: string ≤500 }
```

Errors: `NOT_CLOCKED_IN`, `NO_ACTIVE_BREAK` (on end), `MAX_BREAKS_EXCEEDED` (on start).

#### `GET /shift`

No parameters. Returns the active assignment resolved for today, including rotation resolution. **(not exhaustively verified)**

### 4.2 History and summary

#### `GET /history`

Query: `from` (ISO), `to` (ISO), `page` (≥1, default 1), `limit` (1–100, default 20). **`month`/`year` are not accepted** — your fix was necessary.

Response `data` — **verified**:

```json
{
  "records": [{
    "id": "uuid", "date": "2026-09-13", "status": "present",
    "clock_in_time": "…", "clock_out_time": "…",
    "total_hours": "8.50", "effective_hours": "8.00",
    "break_duration_minutes": 30, "late_minutes": 0,
    "early_exit_minutes": 0, "overtime_minutes": 45,
    "work_mode": "office", "half_day_type": null,
    "is_regularized": false,
    "shift": { "name": "General", "start_time": "09:00", "end_time": "18:00" }
  }],
  "pagination": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 }
}
```

Decimals arrive as **strings** (Sequelize `DECIMAL`). Parse before arithmetic.

#### `GET /summary`

Query: `month` (1–12), `year` (2000–2100). Both optional; defaults to the current IST month.

Response `data` — **verified**, all 14 keys:

```json
{
  "month": 9, "year": 2026, "total_records": 22,
  "present_days": 18, "half_days": 2, "absent_days": 1, "late_days": 3,
  "holiday_days": 1, "weekly_off_days": 8, "on_leave_days": 0,
  "total_hours_worked": 152.5, "average_hours_per_day": 7.63,
  "total_overtime_minutes": 210, "total_break_minutes": 660
}
```

Note `late_days` counts records with `late_minutes > 0`, so it overlaps `present_days` — it is not a mutually exclusive bucket. Do not include it in a total-days donut.

### 4.3 Read-only views

| Endpoint | Query | Notes |
|---|---|---|
| `GET /daily-log` | `date` (ISO, optional) | Returns an **object** with `record`, `logs`, `breaks`, `sessions`, `anomalies` — not an array. **(not exhaustively verified)** |
| `GET /graph-data` | `month` (1–12), `year` (2000–2100) | |
| `GET /trends` | `months` (1–12, default 3) | |
| `GET /weekly-calendar` | `date` (ISO, optional) | Week containing the date |
| `GET /holidays` | none | ⚠️ **no `year` parameter** — the validator declares none and the route has no `validate()`. Sending `year` is silently ignored. Filter client-side. |

> The old doc implied `/holidays` takes `year`. It does not. This is a documentation error being corrected here.

### 4.4 Regularizations

#### `POST /regularization` → `201`

```js
{
  date:                ISO date,              // REQUIRED
  requested_clock_in:  ISO datetime | 'HH:mm' | 'HH:mm:ss',   // nullable
  requested_clock_out: ISO datetime | 'HH:mm' | 'HH:mm:ss',   // nullable
  reason:              string 5..1000,        // REQUIRED
  work_mode:           'office'|'remote'|'field'|'hybrid'     // nullable, optional
}
```

**`.or('requested_clock_in', 'requested_clock_out')`** — at least one must be present. Sending neither is a 400.

For overnight corrections send **full ISO datetimes**, not `HH:mm` — with bare times the backend cannot tell that the clock-out belongs to the next day.

Errors: `REGULARIZATION_DISABLED`, `INVALID_REGULARIZATION_DATE`, `INVALID_REGULARIZATION_WINDOW`, `ALREADY_PENDING` (409), `PERIOD_LOCKED`.

#### `GET /regularizations`

Query: `page`, `limit`, `status` (`pending|approved|rejected|cancelled|all`).

🔴 **`status` is accepted by the validator but ignored by the controller:**

```js
const page = parseInt(req.query.page) || 1
const limit = parseInt(req.query.limit) || 20
const result = await regularizationService.getEmployeeRequests(orgId, userId, page, limit)  // status dropped
```

Your status tabs on My Regularizations **do not filter**. Every tab shows the same full list. Either filter client-side on the returned page (and label it as filtering the loaded page), or wait for the backend fix (§8.5). This one is small and we can fix it quickly if you want it server-side — tell us.

#### `POST /regularizations/:id/cancel`

No body. Self-scoped and row-locked. Errors: `FORBIDDEN`, `ALREADY_PROCESSED`, `NOT_FOUND`.

### 4.5 Self-service lists

| Endpoint | Query | Notes |
|---|---|---|
| `GET /overtime/mine` | `page`, `limit` | **No status filter exists.** Validator declares only page/limit. |
| `GET /anomalies/mine` | `status` (`open|resolved|all`, default `all`), `page`, `limit` | Response has `is_resolved` boolean, not `status` — §2 C16 |
| `GET /comp-offs/mine` | `status` (`earned|approved|used|expired|cancelled`), `page`, `limit` | |
| `GET /comp-offs/mine/summary` | none | Balance aggregate **(not exhaustively verified)** |

All use `totalPages` (camelCase).

---

## 5. HR configuration — `/api/v1/attendance/hr`

### 5.1 Policies

`POST /policies` · `GET /policies` · `GET /policies/:id` · `PUT /policies/:id` · `PATCH /policies/:id/deactivate`

Complete verified field list. `PUT` is the same schema with every field optional.

| Field | Type | Default |
|---|---|---|
| `name` | string ≤150 | **required** |
| `is_default` | boolean | `false` |
| `is_active` | boolean | `true` |
| `grace_minutes` | int 0–120 | `0` |
| `late_threshold_minutes` | int 0–480 | `0` |
| `half_day_min_hours` | decimal 1–24 | `4.00` |
| `full_day_min_hours` | decimal 1–24 | `8.00` |
| `early_exit_threshold_minutes` | int 0–480 | `0` |
| `overtime_enabled` | boolean | `false` |
| `overtime_min_minutes` | int 0–480 | `30` |
| `overtime_requires_approval` | boolean | `true` |
| `auto_clock_out_enabled` | boolean | `false` |
| `auto_clock_out_after_hours` | decimal 1–24 | `12.00` |
| `auto_detect_shift` | boolean | `false` |
| `missing_punch_action` | `flag｜half_day｜absent` | `flag` |
| `max_break_duration_minutes` | int ≥0, nullable | — |
| `max_breaks_per_day` | int ≥0, nullable | — |
| `regularization_allowed` | boolean | `true` |
| `regularization_window_days` | int 1–365 | `7` |
| `comp_off_on_holiday_work` | boolean | `false` |
| `late_count_half_day_threshold` | int ≥1, nullable | — |
| `consecutive_late_penalty_days` | int ≥1, nullable | — |

The backend does **not** validate `half_day_min_hours <= full_day_min_hours`. Keep your client-side check — it is the only thing enforcing it.

### 5.2 Shifts

`POST /shifts` · `GET /shifts` · `GET /shifts/:id` · `PUT /shifts/:id` · `DELETE /shifts/:id`

| Field | Type | Default |
|---|---|---|
| `name` | string ≤150 | **required** |
| `type` | `fixed｜flexible｜split｜night｜rotational` | `fixed` |
| `start_time`, `end_time` | `HH:mm` / `HHmm`, nullable | — |
| `min_hours` | decimal 0–24, nullable | — |
| `core_start_time`, `core_end_time` | `HH:mm`, nullable | flexible shifts |
| `split_start_time_2`, `split_end_time_2` | `HH:mm`, nullable | split shifts |
| `timezone` | string | `Asia/Kolkata` |
| `is_overnight` | boolean | `false` |
| `buffer_minutes_before`, `buffer_minutes_after` | int 0–480 | `0` |
| `is_active` | boolean | `true` |
| `policy_id` | UUID, nullable | — |

Per-type field requirements are **not** enforced by the schema — every time field is independently optional. Your client-side per-type validation is the only guard. `DELETE` returns `SHIFT_IN_USE` (409) if assignments reference it.

### 5.3 Rotations

`POST /rotations` · `GET /rotations` · `DELETE /rotations/:id`

```js
{
  name:                 string ≤150,         // required
  rotation_cycle_days:  int 1..365,          // required
  start_reference_date: ISO date,            // required
  entries: [{                                 // required, min 1
    shift_id:       UUID,   // REQUIRED — not nullable. See §2 C5.
    sequence_order: int ≥1, // required
    duration_days:  int ≥1  // required
  }]
}
```

🔴 Off-day phases are **not supported**. Re-read §2 C5 before building against this.

`DELETE` returns `PATTERN_IN_USE` (409) if assignments reference it.

### 5.4 Shift assignments

`POST /shifts/assign` · `GET /shifts/assignments` · `DELETE /shifts/assignments/:assignment_id` · `POST /shifts/assignments/:assignment_id/end`

Assign body in §2 C6 — remember the `.xor()` rule. End body: `{ effective_to }`, ISO date, **required**.

There is no update endpoint by design (§2 C2). `DELETE` is a **hard delete** — keep your destructive-action confirmation.

### 5.5 Holidays and weekly-offs

`POST|GET /holidays` · `PUT|DELETE /holidays/:id` — contract in §2 C7.

`POST|GET /weekly-offs` · `PUT|DELETE /weekly-offs/:id`:

| Field | Type | Default |
|---|---|---|
| `name` | string ≤150 | **required** |
| `days_of_week` | array of int 0–6 (0 = Sunday) | **required** |
| `effective_from` | ISO date | **required** |
| `effective_to` | ISO date, nullable | — |
| `priority` | int | `0` |
| `target_departments`, `target_locations`, `target_shifts`, `target_users` | UUID arrays | `[]` |
| `target_employment_types`, `target_job_statuses` | string arrays | `[]` |
| `excluded_users` | ⚠️ **not in the schema** | — |

⚠️ **`excluded_users` does not exist on weekly-off rules.** It exists on *holidays* only. Your report says you added an `excluded_users` control to the weekly-off form — that field is being **silently stripped** (§1.8) and the exclusions are not saved. Remove the control, or request the backend field. Holidays genuinely support both `included_users` and `excluded_users`.

### 5.6 Comp-off policies

`POST|GET /comp-off-policies` · `PUT|DELETE /comp-off-policies/:id`

| Field | Type | Default |
|---|---|---|
| `name` | string ≤150 | **required** |
| `min_hours_for_half_day` | decimal ≥0, nullable | — |
| `min_hours_for_full_day` | decimal ≥0, nullable | — |
| `multiplier` | decimal ≥0 | `1.00` |
| `validity_days` | int 1–365, nullable | — |
| `requires_approval` | boolean | `true` |
| `max_accumulation` | int ≥1, nullable | — |
| `priority` | int | `0` |
| `target_departments`, `target_locations` | UUID arrays | `[]` |
| `target_employment_types`, `target_job_statuses` | string arrays | `[]` |

Your rebuild used 5 fields. There are **10 settable fields plus 4 targeting arrays** — `max_accumulation`, `priority` and the targeting arrays are missing from your form. Without targeting, every comp-off policy is org-wide, and `priority` is what resolves overlaps between multiple policies. Worth adding.

### 5.7 Comp-offs, locks, recompute

| Endpoint | Body / query |
|---|---|
| `GET /comp-offs` | Not validated — `status` accepted; use only the five §2 C11 values |
| `POST /comp-offs/:id/approve` | `{ remarks? }` |
| `POST /comp-offs/:id/reject` | `{ remarks? }` → writes status **`cancelled`** |
| `GET /locks` | — |
| `POST /locks` | `{ start_date, end_date, reason? }`, `end_date >= start_date` |
| `DELETE /locks/:id` | — |
| `POST /records/recompute-stale` | `{ date? }` strict `YYYY-MM-DD`, nullable |

### 5.8 Reports

| Endpoint | Query |
|---|---|
| `GET /reports/daily` | `date` **required** (ISO); `department`, `status`, `search` optional |
| `GET /reports/monthly` | `month` **required** — `"YYYY-MM"` **or** int 1–12 **or** `"9"`/`"09"`; `year` optional int 2000–2100 |
| `GET /reports/employee/:userId` | `start_date`, `end_date`, `from`, `to` — **all four accepted**, all optional |

`/reports/employee/:userId` deliberately accepts both naming styles, so whichever pair you send works. `/reports/monthly` accepts three different `month` formats; prefer `"YYYY-MM"` and omit `year`.

---

## 6. HR and manager reads

### 6.1 HR directory reads

Three parallel families, identical contracts, differing only in which role they cover:

```
GET /hr/employees/attendance          GET /hr/managers/attendance          GET /hr/hrs/attendance
GET /hr/employees/:userId/attendance  GET /hr/managers/:userId/attendance  GET /hr/hrs/:userId/attendance
GET /hr/employees/:userId/summary     GET /hr/managers/:userId/summary     GET /hr/hrs/:userId/summary
GET /hr/employees/:userId/daily-log   GET /hr/managers/:userId/daily-log   GET /hr/hrs/:userId/daily-log
```

✅ **The `/hrs/*` family exists — your H48/H49/H50 assumption is correct.** Routing HR-staff profiles there rather than to `/employees/*` is right.

**List** (`.../attendance`): `date`, `from`, `to` (ISO); `status`, `department`, `search` (strings); `page` (default 1), `limit` (1–100, **default 50**).

**Member history** (`.../:userId/attendance`): `from`, `to` (ISO), `month` (1–12), `year` (2000–2100), `page`, `limit` (default 50). Both `from`/`to` **and** `month`/`year` are accepted here.

**Member summary** (`.../:userId/summary`): `month`, `year`.

**Daily log** (`.../:userId/daily-log`): `date` (ISO).

All return `total_pages` (snake_case).

### 6.2 Manager reads

| Endpoint | Query | Notes |
|---|---|---|
| `GET /manager/team/summary` | `date` (ISO) | Send local `YYYY-MM-DD` |
| `GET /manager/team/member/:userId/history` | `from`, `to`, `page`, `limit` (default 20) | ✅ Properly filtered and paginated. `total_pages`. |
| `GET /manager/team/member/:userId/summary` | `month`, `year` | |
| `GET /manager/team/graph-data` | `month`, `year` | |
| `GET /manager/team/today` | **none accepted** | Today only. `req.query` never read. |
| `GET /manager/team/history` | **none accepted** | 🔴 Unbounded — see §2 C15 and §8.1 |
| `GET /manager/team/anomalies` | **none accepted** | Unresolved only |

### 6.3 Manager decisions

All take `{ remarks?: string ≤1000 }` and return **no `data`**:

```
POST /manager/regularizations/:id/approve   POST /manager/regularizations/:id/reject
POST /manager/overtime/:id/approve          POST /manager/overtime/:id/reject
POST /manager/comp-offs/:id/approve         POST /manager/comp-offs/:id/reject
POST /manager/anomalies/:id/resolve
```

Pending queues — no query parameters, not paginated:

```
GET /manager/regularizations/pending    GET /manager/overtime/pending    GET /manager/comp-offs/pending
```

`/comp-offs/pending` returns comp-offs with status `earned`.

Errors: `HIERARCHY_VIOLATION` (403), `ALREADY_PROCESSED` (400), `NOT_FOUND` (404). For HR callers `HIERARCHY_VIOLATION` is unreachable (§2 C1).

### 6.4 HR dashboard

| Endpoint | Query |
|---|---|
| `GET /hr/dashboard/live` | `date` (ISO) |
| `GET /hr/dashboard/graph-data` | `month` (`"9"`/`"09"` string), `year` (`"YYYY"` string), `from`, `to` (ISO) |
| `GET /hr/dashboard/department-summary` | `date` (ISO), `month`, `year` (strings) |
| `GET /hr/dashboard/top-defaulters` | `month`, `year` (strings), `limit` (1–50, default 10) |
| `GET /hr/dashboard/work-mode-distribution` | `date` (ISO), `month`, `year` (strings) |

⚠️ On these five, `month` and `year` are **strings matched by regex**, not integers — `month` is `^(0?[1-9]|1[012])$` and `year` is `^\d{4}$`. Elsewhere they are integers. Send strings here.

**`top-defaulters` response — verified, and it is grouped:**

```json
{
  "most_absent": [{ "user_id": "…", "name": "…", "avatar_url": "…",
                    "department": "…", "designation": "…", "absent_days": 4 }],
  "most_late":   [{ "user_id": "…", "name": "…", "avatar_url": "…",
                    "department": "…", "designation": "…",
                    "late_days": 7, "total_late_minutes": 214 }]
}
```

Your grouped-tabs handling is correct — it is **always** grouped, so you can drop the ungrouped branch. Note the two arrays carry **different** metric keys. `name` is pre-resolved server-side, so no UUID fallback is needed.

`top-defaulters` clamps `to` to today, so a current-month query never includes future dates.

---

## 7. Devices and webhook (Phase 8 — not implemented frontend-side)

### 7.1 Device management

`POST|GET /hr/devices` · `PUT|DELETE /hr/devices/:id`

```js
{
  name:          string ≤255,   // required
  type:          'biometric_fingerprint' | 'biometric_face' | 'card_reader' | 'kiosk',  // required
  serial_number: string ≤255,   // nullable, optional
  location_id:   UUID,          // nullable, optional
  is_active:     boolean        // default true
}
```

🔴 **The plaintext API key is returned exactly once, in the `POST /hr/devices` response.** Only its SHA-256 hash is stored, so it is unrecoverable afterwards. Your audit found the frontend discards it — that permanently bricks the device, with no recovery path short of deleting and re-registering. Whenever Phase 8 is picked up, displaying and letting HR copy that key is the first requirement.

Mappings — `POST|GET /hr/devices/:id/mappings` · `DELETE /hr/devices/:id/mappings/:mappingId`:

```js
{ user_id: UUID, device_employee_id: string ≤255 }   // both required
```

Note the key is **`user_id`**, not `employee_id`, and `device_employee_id`, not `biometric_id`. Your audit flagged both as wrong in the current UI. `user_id` is a platform UUID — it needs an employee picker, not raw UUID entry. Errors: `MAPPING_ALREADY_EXISTS` (409), `EMPLOYEE_NOT_FOUND` (404).

### 7.2 Webhook — `POST /api/v1/attendance/devices/webhook`

Not browser-callable. Device-to-server only.

Header: `Authorization: Bearer <plaintext_api_key>`

```js
{
  device_id:          UUID,          // required
  device_employee_id: string ≤255,   // required
  timestamp:          ISO datetime,  // required
  type:               'clock_in' | 'clock_out' | 'break_start' | 'break_end'   // required
}
```

Response is **200 even when the punch was not applied** — check the `applied` flag:

```json
{ "success": true, "message": "Punch recorded but not applied",
  "data": { "log": {…}, "applied": false, "reason": "…", "result": null } }
```

Errors: `UNAUTHORIZED_DEVICE` (401) for a bad key, unknown device, or inactive device.

---

## 8. Known backend defects

Open issues on our side. Listed so you do not build around them or waste time debugging them.

### 8.1 🔴 `GET /manager/team/history` is unbounded and unfiltered — HIGH

`findTeamHistory` is a `findAll` with no date bound and no limit, joining four profile tables, returning every record ever for the entire team. Query params are never read.

*Impact:* the page slows linearly with data and will eventually time out; date and pagination controls do nothing.
*Status:* fix planned — add `from`/`to` + pagination, matching `/team/member/:userId/history`.
*Your action:* do not ship the page against this endpoint. See §2 C15.

### 8.2 🟠 `GET /manager/team/today` computes "today" in UTC — HIGH

```js
const date = new Date().toISOString().split('T')[0]
```

*Impact:* for an IST org between 00:00 and 05:30 local, this returns **yesterday's** date, so the team dashboard shows yesterday's attendance for the first 5.5 hours of every working day.
*Status:* fix planned.
*Your action:* none available — the endpoint takes no `date`. It will just be wrong in that window until fixed. This is the same bug class you fixed frontend-side; it also exists on the server.

### 8.3 🟠 `client_timestamp` is accepted from the client — MEDIUM

Accepted on both punch endpoints. It is not currently used as the authoritative punch time, but it is stored.

*Risk:* if it ever becomes authoritative, a user could backdate punches by changing their device clock.
*Your action:* keep sending it as diagnostic metadata; do not build features that assume the server honours it.

### 8.4 🟡 `GET /regularizations` ignores `status` — MEDIUM

Controller drops the validated `status`. See §4.4. Small fix; tell us if you want it server-side and we will prioritise it.

### 8.5 🟡 Pagination key inconsistency — LOW

`totalPages` vs `total_pages` (§1.6). Will be unified on `total_pages` with advance notice.

### 8.6 🟡 "Today" is hardcoded to `Asia/Kolkata` — MEDIUM

`clock.service.js` uses `dayjs().tz('Asia/Kolkata')` for `/today`, `/summary` and `/shift` defaults, ignoring the org's configured timezone.

*Impact:* correct for Indian orgs, wrong for any other timezone.
*Your action:* pass explicit dates where the endpoint accepts one.

---

## 9. Corrections to the four older documents

Please treat this file as the source of truth. Specific corrections:

| Doc | Issue |
|---|---|
| `3_user_attendance_api.md` | Only 4 of 20 self-service endpoints have request/response detail. `/holidays` is shown taking a `year` parameter — it takes none. |
| `4_manager_attendance_api.md` | Shows `/team/history` with query parameters. It accepts none (§2 C15). |
| `5_hr_attendance_api.md` | Path list only — 63 endpoints in 193 lines, essentially no request bodies, response shapes or enums. This was the main source of your guesswork. |
| `6_webhook_attendance_api.md` | Broadly accurate. Does not state that a non-applied punch still returns 200. |
| `api_registry.md` | Paths, methods, roles and file mappings are accurate and complete — it is a good index, but carries no field-level contract. |

---

## 10. Frontend action list

Ordered by severity.

**Blocking**

1. **Rotation off-days (§2 C5)** — current payload is rejected with 400. Remove the off-day phase or wait for backend support.
2. **`DATE_LOCKED` → `PERIOD_LOCKED`, 409 → 403 (§2 C17)** — all lock error handling is currently dead code.
3. **Team History (§2 C15, §8.1)** — filters are inert and the endpoint is unbounded. Do not ship as built.

**Silent data loss — looks fine, is not**

4. **`excluded_users` on weekly-off rules (§5.5)** — field does not exist, silently stripped, exclusions never save.
5. **`work_mode` on clock-out (§2 C18)** — not a clock-out field, silently stripped.

**Correctness**

6. **Comp-off reject writes `cancelled`, not `rejected` (§2 C11)** — make sure rejected items remain visible.
7. **My Regularizations status tabs (§4.4)** — do not filter server-side; label as client-side or request the fix.
8. **Anomalies: read `is_resolved`, not `status` (§2 C16).**
9. **Assignment `.xor()` rule (§2 C6)** — validate client-side.

**Simplification — remove work you no longer need**

10. **HR regularization list (§2 C1)** — drop the primary call and the 404 fallback; call the manager pending route directly.
11. **Policy extras (§2 C4)** — send `late_threshold_minutes`, `is_default`, `max_breaks_per_day` unconditionally.
12. **Top defaulters (§6.4)** — always grouped; drop the ungrouped branch.
13. **`/today` breaks (§2 C22)** — `break_duration_minutes` is authoritative; simplify the live-hours logic.

**Additions**

14. **Comp-off policy form (§5.6)** — add `max_accumulation`, `priority` and the four targeting arrays.

---

*Questions on anything here: reply with the section number. If a contract in this document does not match observed behaviour, that is a backend bug — report it rather than working around it.*

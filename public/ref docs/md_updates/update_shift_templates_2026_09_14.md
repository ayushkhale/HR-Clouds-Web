# Shift Template API Changes — 2026-09-14

**Audience:** HRMS frontend team
**Module:** Attendance → Shifts
**Base path:** `/api/v1/attendance/hr`
**Backing migration:** `00046-drop-dead-shift-template-columns`

---

## 1. TL;DR — what you actually have to do

| # | Change | Do you need a release? |
|---|---|---|
| 1 | Seven fields removed from the shift object | **Yes, if you *display* any of them.** Sending them is still safe. |
| 2 | `GET /shifts` and `GET /shifts/assignments` now ignore unrecognised query parameters | **Yes, if you filter by anything outside the supported list** — your filter will silently stop narrowing results. |
| 3 | Malformed `is_active` / UUID filters now return `400 INVALID_FILTER` | Only if you send unvalidated values into those params. |
| 4 | `shift_snapshot` on attendance records lost 3 keys | Only if you read `shift_snapshot.min_hours` or the buffers. |
| 5 | `flexible` and `split` create rules relaxed | No — strictly fewer 400s than before. |
| 6 | `SHIFT_IN_USE` / `PATTERN_IN_USE` are `400`, not `409` | **Yes, if you branch on `409`.** The docs were wrong; the code never returned 409. |

**Nothing you currently send will start failing.** Every change is either a response-shape change or a relaxation. The one behaviour that can bite you silently is #2 — read §4 carefully if you pass query parameters to the shift endpoints.

---

## 2. Why these fields were removed

`shift_templates` carried seven columns that the backend accepted, validated and stored, but **never read to make a decision**:

```
min_hours   core_start_time   core_end_time
split_start_time_2   split_end_time_2
buffer_minutes_before   buffer_minutes_after
```

The attendance calculation engine reads exactly four fields off a shift — `start_time`, `end_time`, `timezone`, `is_overnight` — and takes **every threshold** from the attendance policy attached to that shift. The anomaly detector does not read the shift object at all.

So the split of responsibility is:

> **The shift says *when* the workday is. The policy says *how that is judged*.**

`min_hours` was the clearest casualty: HR typed a minimum-hours figure on the shift, and the engine judged the day against `full_day_min_hours` / `half_day_min_hours` on the policy instead. Two fields, one of them decorative, and no indication in the UI which one counted. In the live data, all 7 flexible shifts had a `min_hours` value that had never once been consulted.

`core_*` and `split_*_2` described features (core-hours enforcement, two-window split shifts) that were **never implemented**. The columns stored intent that nothing acted on.

### Replacement map

| Removed field | What to use instead |
|---|---|
| `min_hours` | Policy `full_day_min_hours` and `half_day_min_hours` |
| `buffer_minutes_before` / `buffer_minutes_after` | Policy `grace_minutes` (lateness) — note these were **never** a lateness control; they were an unimplemented punch-window idea |
| `core_start_time` / `core_end_time` | **No replacement.** Core hours are not a feature. |
| `split_start_time_2` / `split_end_time_2` | **No replacement.** See the warning in §3.3. |

---

## 3. The shift object

### 3.1 Full response shape (after the change)

Every shift endpoint that returns a shift returns this object:

```jsonc
{
  "id":           "3f2a9c10-5b7e-4a21-9f44-0c8d1e6b7a90",  // UUID
  "org_id":       "9c1e7b55-2d4a-4c88-a1f3-77b0e2d94c61",  // UUID, your tenant
  "name":         "General Shift",                          // string, ≤150
  "type":         "fixed",                                  // see §3.3
  "start_time":   "09:00:00",                               // "HH:mm:ss" or null
  "end_time":     "18:00:00",                               // "HH:mm:ss" or null
  "timezone":     "Asia/Kolkata",                           // IANA string
  "is_overnight": false,                                    // boolean
  "is_active":    true,                                     // boolean
  "policy_id":    "5d8f3a21-9e04-4b17-8c33-2a6f9d0e1b42",  // UUID or null
  "created_by":   "1a2b3c4d-...",                           // UUID or null
  "updated_by":   "1a2b3c4d-...",                           // UUID or null
  "created_at":   "2026-03-14T06:21:44.812Z",               // ISO 8601
  "updated_at":   "2026-09-14T09:02:10.377Z"                // ISO 8601
}
```

> **Note on time format.** You **send** `"09:00"` (or `"0900"`), and you **receive** `"09:00:00"`. The extra `:00` comes from the Postgres `TIME` type. Do not assume send-format and receive-format match — trim or parse on read.

The seven removed fields are simply **absent** from this object. Not `null` — absent. Guard any direct property access.

### 3.2 Writable fields

| Field | Type | Required | Default |
|---|---|---|---|
| `name` | string, max 150 | **yes** | — |
| `type` | `fixed｜flexible｜split｜night｜rotational` | no | `fixed` |
| `start_time` | `"HH:mm"` or `"HHmm"`, nullable | conditional (§3.4) | `null` |
| `end_time` | `"HH:mm"` or `"HHmm"`, nullable | conditional (§3.4) | `null` |
| `timezone` | string | no | `"Asia/Kolkata"` |
| `is_overnight` | boolean | no | `false` |
| `is_active` | boolean | no | `true` |
| `policy_id` | UUID, nullable | no | `null` |

Exact `start_time` / `end_time` pattern: `^([01]\d|2[0-3]):?([0-5]\d)$`. Both `"09:00"` and `"0900"` pass; `"9:00"` and `"24:00"` do not.

**Unknown keys are stripped, not rejected.** If you keep posting `min_hours`, you get `201 Created` and the key is silently discarded. That is why no frontend release is needed just to keep creating shifts. It is also why a typo in a field name fails silently — check your payloads against the table above.

### 3.3 ⚠️ `type` is mostly a label

`type` does **not** change how attendance is calculated. The engine runs the same arithmetic regardless: first clock-in to last clock-out, minus breaks, compared against `start_time` / `end_time` and the policy thresholds.

- **`split`** — with the second window gone, there is no way to express one, and the engine never evaluated one anyway. A split shift is calculated **exactly like `fixed`**. Do not present it as a working feature.
- **`flexible`** — now carries no type-specific field at all. It means "no fixed start/end", nothing more.
- **`rotational`** — the actual day-to-day shift comes from the rotation pattern, not from this template.

The values remain in the enum so existing records keep validating. Treat them as descriptive tags.

### 3.4 Per-type requirements

Only **one** rule is enforced by the backend, and it lives in the service layer, not the schema:

> `fixed`, `night` and `split` require **both** `start_time` and `end_time`.
> Otherwise: `400 INVALID_SHIFT_DATA`.

`flexible` and `rotational` require neither.

**What changed:** `flexible` used to require `min_hours`, and `split` used to require all four time fields. Both of those 400s are gone. Everything that was accepted before is still accepted.

Any other per-type rule you want (e.g. "night shifts must set `is_overnight`") is **yours to enforce client-side** — the backend will not.

---

## 4. ⚠️ Query filters are now allow-listed

This is the change most likely to cause a silent bug, so read it even if you skip the rest.

Previously, every key in the query string was passed straight through into the database `WHERE` clause. That had two consequences, both now fixed:

- `?min_hours=8` became `WHERE "min_hours" = '8'` — which **500s** now that the column is gone.
- `?org_id=<some-other-org>` **replaced** your tenant scope and returned another organisation's data.

Both endpoints now accept a fixed list and ignore everything else.

### `GET /shifts`

| Parameter | Type | Behaviour |
|---|---|---|
| `type` | string | Exact match. An unknown value returns `[]`, not an error. |
| `is_active` | `true｜false｜1｜0` (case-insensitive) | Empty string = no filter. Anything else → `400 INVALID_FILTER`. |
| `policy_id` | UUID | Must be a valid UUID → otherwise `400 INVALID_FILTER`. |

### `GET /shifts/assignments`

| Parameter | Type | Behaviour |
|---|---|---|
| `user_id` | UUID | Must be a valid UUID → otherwise `400 INVALID_FILTER`. |
| `shift_id` | UUID | Same. |
| `rotation_pattern_id` | UUID | Same. |

### Rules that apply to both

- **`org_id` is never accepted.** It always comes from your token.
- **Unsupported keys are ignored, not rejected.** If you send `?page=2&sort=name`, you get the **full unfiltered list** with a `200`. There is no pagination on these endpoints. If your UI was relying on a filter outside the supported list, it will now quietly return more rows than you expect — check your call sites.
- Empty-string values (`?is_active=`) are treated as "filter not supplied".

---

## 5. Endpoint reference

All endpoints require:

```
Authorization: Bearer <access_token>
Content-Type: application/json      // on POST/PUT only
```

Role: `hr`. The org is taken from the token — never send `org_id`.

Success envelope: `{ "success": true, "message": "...", "data": ... }`
Error envelope: `{ "success": false, "message": "...", "errorCode": "..." }`

**Auth failures apply to every endpoint below** and are omitted from the per-endpoint error tables:

| Status | `errorCode` | Cause |
|---|---|---|
| 401 | `AUTH_TOKEN_MISSING` | No `Authorization` header |
| 401 | `TOKEN_EXPIRED` | Session timed out — refresh |
| 401 | `TOKEN_REVOKED` | Logged out elsewhere |
| 401 | `TOKEN_INVALID` | Malformed token payload |
| 401 | `ORG_SELECTION_REQUIRED` | Token carries no active org |
| 403 | `FORBIDDEN` | Caller's role is not `hr` |
| 403 | `ORG_ACCESS_DEACTIVATED` | This user's membership in the org is disabled |
| 403 | `ORG_NOT_ACTIVE` | Org is unpaid or mid-registration |
| 403 | `FEATURE_NOT_AVAILABLE` | The plan does not include `attendance.access` |

Branch on `errorCode`, not on the status code — several distinct conditions share `401` and `403`.

---

### 5.1 `POST /api/v1/attendance/hr/shifts`

Create a shift template.

**Request body**

```jsonc
{
  "name":         "General Shift",   // required, ≤150 chars
  "type":         "fixed",           // optional, default "fixed"
  "start_time":   "09:00",           // required for fixed/night/split
  "end_time":     "18:00",           // required for fixed/night/split
  "timezone":     "Asia/Kolkata",    // optional, default "Asia/Kolkata"
  "is_overnight": false,             // optional, default false
  "is_active":    true,              // optional, default true
  "policy_id":    "5d8f3a21-9e04-4b17-8c33-2a6f9d0e1b42"  // optional, nullable
}
```

Minimal flexible shift — this is now valid, and was a `400` before:

```jsonc
{ "name": "Flexi Hours", "type": "flexible" }
```

Night shift — set `is_overnight` yourself; the backend does not infer it from the times:

```jsonc
{
  "name": "Night Shift",
  "type": "night",
  "start_time": "22:00",
  "end_time": "06:00",
  "is_overnight": true
}
```

**`201 Created`**

```jsonc
{
  "success": true,
  "message": "Shift created successfully",
  "data": { /* full shift object — see §3.1 */ }
}
```

**Errors**

| Status | `errorCode` | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `name` missing/too long, bad time pattern, `type` not in the enum, `policy_id` not a UUID |
| 400 | `INVALID_SHIFT_DATA` | `fixed`/`night`/`split` without both `start_time` and `end_time` |

> `policy_id` is **not** checked for existence or tenant ownership on create. Pick it from `GET /policies`; do not let users type one.

---

### 5.2 `GET /api/v1/attendance/hr/shifts`

List shift templates, newest first. **Not paginated** — the full list comes back.

**Query parameters:** `type`, `is_active`, `policy_id` — see §4.

```
GET /api/v1/attendance/hr/shifts?is_active=true&type=fixed
```

**`200 OK`**

```jsonc
{
  "success": true,
  "message": "Shifts fetched successfully",
  "data": [ { /* shift object */ }, { /* shift object */ } ]
}
```

Empty result is `"data": []` with a `200`, not a 404.

**Errors:** `400 INVALID_FILTER` — see §4.

---

### 5.3 `GET /api/v1/attendance/hr/shifts/:id`

**`200 OK`** → `{ "success": true, "message": "Shift fetched successfully", "data": { /* shift object */ } }`

**Errors**

| Status | `errorCode` | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` is not a UUID |
| 404 | `SHIFT_NOT_FOUND` | No such shift, **or** it belongs to another org (deliberately indistinguishable) |

---

### 5.4 `PUT /api/v1/attendance/hr/shifts/:id`

Partial update — send only the fields you are changing. Same field table as §3.2, all optional.

```jsonc
{ "name": "General Shift (Revised)", "end_time": "18:30" }
```

**`200 OK`** → `{ "success": true, "message": "Shift updated successfully", "data": { /* shift object */ } }`

**Errors**

| Status | `errorCode` | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad `:id`, bad field value |
| 400 | `SHIFT_DEACTIVATED` | The shift's `is_active` is already `false` |
| 404 | `SHIFT_NOT_FOUND` | Not found, or another org's |

> 🔴 **Two gaps to enforce client-side.**
> 1. **`PUT` does not run the per-type guard that `POST` does.** You can `PUT {"start_time": null}` onto a `fixed` shift and get a `200`. The engine then silently stops calculating lateness for everyone on that shift — no error, no anomaly, just zeroes. Block this in your form.
> 2. **A deactivated shift cannot be reactivated through this endpoint** — `PUT {"is_active": true}` is rejected with `SHIFT_DEACTIVATED` before it is applied. Deactivation is effectively one-way today. Do not offer a reactivate toggle.

---

### 5.5 `DELETE /api/v1/attendance/hr/shifts/:id`

**Deactivates** the shift (`is_active → false`). It is not removed; it stays in `GET /shifts` unless you filter with `?is_active=true`. Label the button accordingly.

**`200 OK`** → `{ "success": true, "message": "Shift deactivated successfully", "data": { /* shift object, is_active false */ } }`

**Errors**

| Status | `errorCode` | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` is not a UUID |
| **400** | `SHIFT_IN_USE` | Employees are still assigned to this shift |
| 404 | `SHIFT_NOT_FOUND` | Not found, or another org's |

> ⚠️ **`SHIFT_IN_USE` is `400`, not `409`.** Earlier revisions of the contract document said 409. That was a documentation error — the code has always thrown 400. If you branch on the status code, fix it; branching on `errorCode` is safer and is what we recommend. The same correction applies to `PATTERN_IN_USE` on `DELETE /rotations/:id`.

"Currently assigned" means an assignment with `effective_to` null or in the future. End the assignments first via `POST /shifts/assignments/:assignment_id/end`.

---

### 5.6 `GET /api/v1/attendance/hr/shifts/assignments`

Unchanged except for the filter allow-list (§4). Returns assignments with the nested employee profile and the full shift and rotation-pattern objects.

```
GET /api/v1/attendance/hr/shifts/assignments?user_id=7b3e...&shift_id=3f2a...
```

The embedded `shift` object in each row follows §3.1 — **it lost the seven fields too.** If you render assignment rows using shift data, check them.

---

## 6. `shift_snapshot` on attendance records

When an employee clocks in, the backend freezes a copy of their shift onto the attendance record so later recalculation and payroll see the same rules the day was judged under. That snapshot is now:

```jsonc
"shift_snapshot": {
  "id":           "3f2a9c10-5b7e-4a21-9f44-0c8d1e6b7a90",
  "name":         "General Shift",
  "type":         "fixed",
  "start_time":   "09:00:00",
  "end_time":     "18:00:00",
  "timezone":     "Asia/Kolkata",
  "is_overnight": false
}
```

`min_hours`, `buffer_minutes_before` and `buffer_minutes_after` are no longer written. `core_*` and `split_*_2` were never in the snapshot.

**Historical records keep their old keys.** Snapshots written before this change still contain `min_hours` and the buffers, and were deliberately not rewritten. So if you read `shift_snapshot`, you will see a mixed shape across dates — treat all three as optional and never assume they exist. Nothing in the backend reads them.

`shift_snapshot` can also be `null` (employee had no shift assigned at clock-in). It is written on clock-in and re-written on regularization approval.

---

## 7. Migration checklist

- [ ] Remove `min_hours` from the shift create/edit form, including the "Minimum Hours (Flexible)" input and its validation.
- [ ] Remove any display of `min_hours`, `core_*`, `split_*_2`, `buffer_minutes_*` from shift lists, detail views and assignment rows.
- [ ] Point anything that showed "minimum hours" at the policy's `full_day_min_hours` / `half_day_min_hours`.
- [ ] Audit query strings sent to `GET /shifts` and `GET /shifts/assignments` — drop unsupported keys, and make sure you are not relying on a filter that is now ignored (§4).
- [ ] Validate `is_active` and UUID filter params before sending, or handle `400 INVALID_FILTER`.
- [ ] Change any `409` check on `SHIFT_IN_USE` / `PATTERN_IN_USE` to `400`, or switch to matching on `errorCode`.
- [ ] Guard `shift_snapshot.min_hours` and buffer reads — historical records still have them.
- [ ] Stop offering `split` as a functioning shift type (§3.3).
- [ ] Add client-side guards for the two `PUT` gaps in §5.4.

---

## 8. Questions this will probably raise

**Do we need to coordinate a release with the backend?**
No. Old payloads keep working — unknown keys are stripped, not rejected. Deploy whenever you like.

**Will existing shifts break?**
No. Assignments resolve by `shift_id`, and no calculation ever used the removed fields. Historical attendance records are untouched.

**Can we get the removed values back?**
They were archived to `shift_templates_dead_columns_archive` before the drop. Ask the backend team if you need them — but note they were never used to calculate anything, so there is nothing to reconcile.

**We need real split shifts / core hours. Now what?**
Those were never implemented — the columns only stored intent. They are a feature request against the calculation engine, not a field to re-add. Raise it and we will scope it.

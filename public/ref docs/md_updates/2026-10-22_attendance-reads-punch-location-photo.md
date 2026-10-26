# Attendance reads — punch coordinates, location and photo on every panel

**Date:** 2026-10-22
**Module:** Attendance
**Type:** Additive response change. No request, validation or parameter changed anywhere.
**Related:** `public/md_updates/2026-10-22_punch-photo-backend.md` (how the photo gets stored)
**Authoritative contract:** `public/md_system/ATTENDANCE_API_CONTRACT.md` §13

---

## 1. What this is

Until now, the punch photo and the punch's own coordinates were readable from **one** endpoint
family: the three `daily-log` reads. Everything else — the employee's today card, every history
list, the manager's team roster, every HR register — showed `clock_in_time` and `clock_out_time`
with no idea of *where* the punch happened or *who* was in front of the camera.

This change puts that information on **all 10 attendance read endpoints across all three panels**,
in both the list reads and the single-member reads.

**Nothing was removed and nothing was renamed.** Every field you read today is still there, in the
same place, with the same type. Three new keys appear:

| New key | Where | What |
|---|---|---|
| `punches` | every **list / day row** and the self today card | the day's first entry and last exit, each with coordinates, location and photo |
| `location` | inside each entry of the existing `logs[]` on the daily-log reads | the same location block, per punch |
| `punches_truncated` | top level of every list response | `true` if some rows' punch data was omitted for size — see §6 |

---

## 2. Endpoints changed

### Employee panel (self)

| Method | Path | What changed |
|---|---|---|
| GET | `/api/v1/attendance/today` | **+ `punches`** |
| GET | `/api/v1/attendance/history` | **+ `punches`** per record, **+ `punches_truncated`** |
| GET | `/api/v1/attendance/daily-log` | **+ `location`** inside each `logs[]` entry |

### Manager panel

| Method | Path | What changed |
|---|---|---|
| GET | `/api/v1/attendance/manager/team/today` | **+ `punches`** per row, **+ `punches_truncated`** |
| GET | `/api/v1/attendance/manager/team/history` | **+ `punches`** per row, **+ `punches_truncated`** |
| GET | `/api/v1/attendance/manager/team/member/:userId/history` | **+ `punches`** per record, **+ `punches_truncated`** |
| GET | `/api/v1/attendance/manager/team/member/:userId/daily-log` | **+ `location`** inside each `logs[]` entry |

### HR panel

| Method | Path | What changed |
|---|---|---|
| GET | `/api/v1/attendance/hr/employees/attendance` | **+ `punches`** per row, **+ `punches_truncated`** |
| GET | `/api/v1/attendance/hr/managers/attendance` | ″ |
| GET | `/api/v1/attendance/hr/hrs/attendance` | ″ |
| GET | `/api/v1/attendance/hr/employees/:userId/attendance` | **+ `punches`** per record, **+ `punches_truncated`** |
| GET | `/api/v1/attendance/hr/managers/:userId/attendance` | ″ |
| GET | `/api/v1/attendance/hr/hrs/:userId/attendance` | ″ |
| GET | `/api/v1/attendance/hr/employees/:userId/daily-log` | **+ `location`** inside each `logs[]` entry |
| GET | `/api/v1/attendance/hr/managers/:userId/daily-log` | ″ |
| GET | `/api/v1/attendance/hr/hrs/:userId/daily-log` | ″ |

### Deliberately NOT changed

| Path | Why |
|---|---|
| `/hr/dashboard/live` | Returns **aggregate counts only** (`counts`, percentages, headcounts). There are no per-employee rows to attach a punch to. |
| `/hr/dashboard/graph-data`, `/dashboard/department-summary`, `/dashboard/top-defaulters`, `/dashboard/work-mode-distribution` | Aggregates. |
| `/attendance/summary`, `/graph-data`, `/trends`, `/weekly-calendar`, `/manager/team/summary`, `/manager/team/graph-data`, `/hr/:plane/:userId/summary` | Monthly roll-ups — no per-day punch rows. |
| `/hr/reports/*` | Report/export family. These feed downloads, and `photo_url` is a short-lived credential (§5) that must not be baked into a file. |

---

## 3. The `punches` object

```js
punches: {
  clock_in:  Punch | null,
  clock_out: Punch | null
}
```

`clock_in` is the day's **first** entry and `clock_out` the day's **last** exit, even on a day with
several sessions — exactly the pair the row's existing `clock_in_time` / `clock_out_time` already
describe. For every punch of a multi-session day, use the day's `daily-log` endpoint and its
`logs[]` array.

### `punches` has three states. They mean different things.

| Value | Meaning | What to render |
|---|---|---|
| `{ clock_in: {...}, clock_out: {...} }` | resolved | the punches |
| `{ clock_in: null, clock_out: null }` | **this day genuinely has no punches** — a holiday, a weekly off, a leave day, an auto-absent day, or a team member who has not clocked in yet | nothing / your existing empty state |
| `null` | **not loaded in this response.** The data exists; this response was too large to resolve it | a "view day" affordance that calls the day's own endpoint |

`punches` is **always present** on every row, so you never need an existence check — only a state
check. `null` only ever occurs together with `punches_truncated: true` (§6).

### A `Punch`

```js
{
  id:          "uuid",                      // attendance_logs.id
  type:        "clock_in" | "clock_out",
  timestamp:   "2026-10-22T03:44:12.000Z",  // server time of the punch, the authoritative one
  source:      "web" | "mobile" | "biometric" | "manual",

  latitude:    18.520431 | null,            // NUMBER, not a string
  longitude:   73.856743 | null,

  location:    Location | null,             // see §4
  photo_url:   "https://..." | null,        // see §5
  punch_photo: PunchPhoto | null            // unchanged shape, see §5
}
```

`latitude` / `longitude` are **numbers**, and they are `null` — never `0` — when the punch carried
no GPS fix. Do not treat `0,0` as "no location"; it is a real coordinate in the Gulf of Guinea.

---

## 4. The `location` object

Appears as `punch.location` and as `logs[i].location`.

```js
{
  outcome:               "in_bounds" | "out_of_bounds" | "unresolved" | "missing_coordinates" | null,
  evaluated:             true | false | null,
  reason:                "remote_work_mode" | "declared_remote_punch" | "device_attested"
                         | "no_usable_candidates" | null,
  matched_location_id:   "uuid" | null,
  matched_location_type: "office" | "field" | null,
  matched_location_name: "Pune HQ" | null,
  distance_meters:       42.5 | null,
  radius_meters:         150 | null,
  address:               "Baner, Pune" | null
}
```

`location` itself is `null` when the punch carries neither geofence provenance nor an address —
for example a punch recorded before this feature existed.

### Reading `outcome` and `evaluated` together

These two answer different questions and the combination matters:

| `evaluated` | `outcome` | Means | Suggested rendering |
|---|---|---|---|
| `true` | `in_bounds` | checked, and inside a known location | ✅ with `matched_location_name` |
| `true` | `out_of_bounds` | checked, and outside every known location | ⚠️ with `distance_meters` |
| `false` | `in_bounds` | **no check was run** — `reason` says why (remote work mode, a remote-declared punch, or a biometric terminal that attests its own location) | neutral, not a tick |
| `false` | `unresolved` | the check could not run: the org has no location with GPS coordinates configured | neutral — this is an **org setup gap**, not employee behaviour |
| `false` | `missing_coordinates` | a geofenced punch arrived with no GPS fix | ⚠️ "location unavailable" |

`evaluated: false` with `outcome: "in_bounds"` must **not** be shown as a passed geofence check.
Nothing was checked.

### `matched_location_id` has no single foreign key — do not join on it

It points at **either** `organization_locations` **or** a field site, and which one is in
`matched_location_type`. This is why `matched_location_name` is returned alongside it: it is the
name resolved at punch time and it is the value you should render. Do not look the id up to get a
name — on a renamed or deleted location, the stored name is the historically correct one.

### `address` is the only client-supplied field in this object

Every other field is derived by the server from the punch's own coordinates. `address` is whatever
the phone's reverse geocoder returned (the same string as `punch_photo.address`). It is display
text for a human — treat `outcome` and `matched_location_*` as the evidence.

---

## 5. `photo_url` — treat it as a credential, not a URL

`photo_url` is a **presigned GET with a 300-second TTL** on a private bucket. Anyone holding the
string can fetch that person's photo until it expires, regardless of their role.

* **Render it. Do not cache it, store it, log it, or put it in a link you share.**
* It expires in 5 minutes — a list left open longer needs a re-fetch, not a retry on the image.
* It is `null` when: there is no photo; the photo has passed its 90-day retention; presigning
  failed; or the presign budget for this response was exhausted (§6).
* The raw storage key is never returned.

**`photo_url: null` does not mean "no photo was taken."** `punch_photo.stored === true` with
`photo_url === null` means *a photo exists or existed* — check `punches_truncated` first (re-fetch
that day), and otherwise treat it as expired. `punch_photo === null` means no photo leg at all.

`punch_photo` keeps the shape it already has on the daily-log reads — `attached`, `stored`,
`rejected_reason`, `captured_at`, `skew_seconds`, `location_stamped`, `address`, `width`,
`height`, `bytes`, `sha256`.

---

## 6. `punches_truncated`

A boolean at the **top level** of every list response. `false` in almost every case.

When `true`, some rows in this response carry `punches: null`, and/or some punches carry
`photo_url: null` purely because the response was too large to resolve everything. The remedy is
the same either way: **open that specific day through its own endpoint**
(`/daily-log`, or the single-member history).

Only **two** endpoints can ever set it: `/manager/team/today` and `/manager/team/history`, which
return an unbounded number of rows (one per team member, and one per member per day of history,
with no pagination at all). Every other list is Joi-capped at `limit=100`, which is 200 punches —
comfortably inside both internal ceilings — so **none of them can set it**. The key is still
always present, so you can write one code path.

### Where to find it in the envelope

Most of these endpoints return an object as `data`, so the flag is inside it:

```js
{ success: true, message: "...", data: { pagination: {...}, records: [...], punches_truncated: false } }
```

The two team endpoints return a **bare array** as `data` — that has not changed — so the flag sits
beside `data`:

```js
{ success: true, message: "Team today fetched", data: [ ...rows ], punches_truncated: false }
```

---

## 7. Worked examples

### `GET /api/v1/attendance/today`

```js
{
  "success": true,
  "data": {
    "date": "2026-10-22",
    "status": "in_progress",
    "clock_in_time": "2026-10-22T03:44:12.000Z",
    "clock_out_time": null,
    /* ...every field you already read, unchanged... */
    "punches": {
      "clock_in": {
        "id": "7c2f...", "type": "clock_in",
        "timestamp": "2026-10-22T03:44:12.000Z", "source": "mobile",
        "latitude": 18.520431, "longitude": 73.856743,
        "location": {
          "outcome": "in_bounds", "evaluated": true, "reason": null,
          "matched_location_id": "b31e...", "matched_location_type": "office",
          "matched_location_name": "Pune HQ",
          "distance_meters": 42.5, "radius_meters": 150,
          "address": "Baner, Pune"
        },
        "photo_url": "https://bucket.s3.ap-south-1.amazonaws.com/...&X-Amz-Signature=...",
        "punch_photo": { "attached": true, "stored": true, "rejected_reason": null,
                         "captured_at": "2026-10-22T03:44:05.118Z", "skew_seconds": 7,
                         "location_stamped": true, "address": "Baner, Pune",
                         "width": 1200, "height": 1600, "bytes": 8192, "sha256": "a1b2..." }
      },
      "clock_out": null
    }
  }
}
```

### `GET /api/v1/attendance/hr/employees/attendance?date=2026-10-22`

```js
{
  "success": true,
  "data": {
    "pagination": { "total": 48, "page": 1, "limit": 50, "total_pages": 1 },
    "punches_truncated": false,
    "records": [
      { "user_id": "489f...", "name": "Gopal Sharma", "status": "present",
        /* ...unchanged... */
        "punches": { "clock_in": { /* Punch */ }, "clock_out": { /* Punch */ } } },

      { "user_id": "f5ec...", "name": "Rishi Ganeshe", "status": "weekly_off",
        /* ...unchanged... */
        "punches": { "clock_in": null, "clock_out": null } }
    ]
  }
}
```

### `GET /api/v1/attendance/hr/employees/:userId/daily-log?date=2026-10-22`

`logs[]` is unchanged except that each entry gained `location`:

```js
"logs": [
  { "id": "7c2f...", "type": "clock_in", "timestamp": "...", "source": "mobile",
    "latitude": 18.520431, "longitude": 73.856743,
    "location": { /* §4 */ },            // ← NEW
    "photo_url": "https://...", "punch_photo": { /* ... */ } }
]
```

---

## 8. Integration checklist

1. `punches` is always present — switch on its **three** states (§3), do not test for the key.
2. Read `latitude` / `longitude` as numbers; `null` means no fix, `0` does not.
3. Render `matched_location_name`; never join on `matched_location_id` (§4).
4. Do not show `evaluated: false` as a passed geofence check (§4).
5. Treat `photo_url` as a 5-minute credential: render, never persist (§5).
6. Distinguish "no photo" (`punch_photo === null`) from "photo expired or deferred"
   (`punch_photo.stored === true`, `photo_url === null`) (§5).
7. Handle `punches_truncated: true` by linking to the day rather than showing data as missing (§6).
8. The two `/manager/team/*` endpoints keep a bare array in `data`; the flag is its sibling (§6).

---

## 9. Behaviour, performance and privacy notes

**No authorization changed.** The manager plane's `getAccessibleUserIds` check and the HR plane's
org scoping remain the only scope gates; the new projection does no authorization of its own and
is handed only records the caller has already been cleared for. Every underlying query is
additionally org-scoped as defence in depth.

**One extra query per response, never per row.** `attendance_logs` has no `record_id` column, so a
row reaches its punches through `attendance_records.first_clock_in_log_id` /
`last_clock_out_log_id`. All of a page's pointers are resolved in a single batched, org-scoped
`WHERE id IN (...)`. Punches are resolved **after** pagination and after in-memory status
filtering, so a filtered-out row costs nothing.

**One projection serves all three panels**, so the employee, manager and HR views of the same
punch cannot disagree. A consequence worth knowing: an employee sees the geofence outcome and
distance for **their own** punches, including `out_of_bounds`.

**Audit columns are never projected.** `attendance_logs.ip_address` and `user_agent` are selected
by no read path on any panel. The geofence block is likewise reduced to the fields in §4 —
internal diagnostics (candidate counts, resolved work modes, the action label) stay server-side,
and because the projection is an allowlist, a field added to the provenance writer later is
dropped by construction rather than by anyone remembering to exclude it.

**Photo volume.** A 100-row HR page can now issue up to 200 presigned URLs, each a 5-minute
capability to fetch a photograph of an identifiable person. That is the point of the feature, but
it is a meaningful widening of where those links appear — which is why §5 asks that they not be
cached or forwarded.

---

## 10. Operator note

**No new migration.** This change adds no column and no index.

It does, however, read `attendance_logs.photo_storage_key`, so it inherits the hand-back already
recorded in `2026-10-22_punch-photo-backend.md` §9: **migration
`00080-add-punch-photo-to-attendance-logs.js` has not been run and is a hard prerequisite.**
Deployed against an unmigrated database, every endpoint in §2 fails with
`column "photo_storage_key" does not exist` — previously only the three daily-log reads did. Run
the migration first, then deploy.

## 11. Tests

38 new tests; attendance suite **646/646**, full repo **3844/3844**.

| File | Covers |
|---|---|
| `tests/unit/attendance/punch_read_projection.test.js` | the `location` allowlist, outcome validation, DECIMAL→number, the batch loader's single query, org scoping, de-dup, both ceilings, degradation |
| `tests/unit/attendance/punch_read_endpoint_shape.test.js` | one test per wired response shape across the three panels, including the three states of `punches` |

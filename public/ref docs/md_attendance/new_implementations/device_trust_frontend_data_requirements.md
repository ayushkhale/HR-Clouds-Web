# Device Trust — Data the Frontend Needs From the Backend

**From:** Web frontend (HR Clouds)
**Re:** `Setup › Organisation › Registered Devices` (HR panel) and `Employee Devices`
**Contract under discussion:** `md_attendance/8_device_trust_api_analysis.md` (APIs #8, #16, #17)
**Status:** request for backend changes — nothing here is implemented yet

---

## 0. TL;DR for the backend team

The "Registered Devices" page answers one question for HR: **"who can and can't
clock in on Monday?"** To answer it the page joins the **people directory** to the
**device inventory**. That join is keyed on `user_id` — and the inventory endpoint
(**API #8**) does not currently return `user_id` on its rows.

Result today: the page loads, but every device column blanks out and shows a banner
("The device list isn't saying who each device belongs to"). It is running in a
degraded fallback mode on purpose, because the data to do better isn't there.

Three asks, in priority order:

| # | Ask | Priority | Effort |
|---|-----|----------|--------|
| 1 | Add `user_id` to every row of **API #8** (`GET /hr/trusted-devices`) | **MUST** | tiny |
| 2 | Enrich **API #17** (`/coverage`) with pending/blocked counts and per-group breakdown | SHOULD | small |
| 3 | New endpoint: a **per-person device roster** so the join isn't done by paging the whole inventory client-side | SHOULD (needed at scale) | medium |

Everything below explains why, and gives exact response shapes.

> **Please do NOT denormalise names, emails, avatars or departments onto device
> rows.** The frontend resolves all of those from the single employee-directory
> source using `user_id`. We only need the **`user_id`** key — not the person's
> display data. Sending names on device rows would duplicate a source we
> deliberately keep single, and the photos are short-lived presigned URLs the
> directory already refreshes.

---

## 1. Background — how the page is built

`Registered Devices` is a **people list**, not a device list (decision 16 Oct 2026).
A list of *devices* can never show a person who owns *no* device — but "who hasn't
registered one yet" is exactly what HR needs before switching enforcement to
*Required*. So the page:

1. Loads the full people directory (one shared roster source, already in place).
2. Loads the device inventory via **API #8**, paging `limit: 100` up to 30 pages.
3. **Groups devices by `user_id`** and hangs each person's device summary off their
   directory row.

Step 3 is where it breaks. The grouping code is literally:

```js
const owner = device.user_id || device.employee_id || device.user?.id;
if (!owner) return;   // ← with no user_id, EVERY device is dropped here
```

When not one device row carries an owner, the page flips to `ownerless = true` and
renders the honest-but-useless state: device counts, "Last used", and the
"Can clock in" verdict all show **N/A**, and the "No device / Waiting / Blocked"
filter is disabled.

The per-person detail dialog still works, because it re-reads **API #8** filtered
`?user_id=<id>` — the one filter the contract documents. But the *list* — the whole
point of the screen — cannot be populated without owner keys on the rows.

---

## 2. Requirement 1 (MUST) — `user_id` on API #8 rows

### What's wrong

`md_attendance/8_device_trust_api_analysis.md §6, API #8` documents the inventory
row **without** `user_id`:

```json
{
  "items": [
    {
      "id": "c1f72a4d-...",
      "device_name": "Employee MacBook Pro",
      "platform": "web",
      "credential_type": "webauthn",
      "status": "pending",
      "device_bound": true,
      "registered_at": null,
      "approved_at": null,
      "last_used_at": null,
      "last_ip": null,
      "revoke_reason": null,
      "replaced_device_id": null,
      "created_at": "2026-10-15T08:00:00.000Z"
    }
  ],
  "total": 1, "page": 1, "limit": 20
}
```

`attendance_trusted_devices.user_id` is `NOT NULL` in the schema (§3.1), and
`sanitizeDevice()` is documented to strip only the **cryptographic** material
(`public_key`, `credential_id`, `sign_count`, `transports`). So `user_id` *should*
be safe to return — it just isn't listed, and we can't confirm live rows carry it.

### What we need

Add **`user_id`** (the `users.id` UUID) to every row returned by **API #8**:

```jsonc
{
  "items": [
    {
      "id": "c1f72a4d-...",
      "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",  // ← ADD THIS
      "device_name": "Employee MacBook Pro",
      "platform": "web",
      "credential_type": "webauthn",
      "status": "pending",
      "device_bound": true,
      "registered_at": null,
      "approved_at": null,
      "last_used_at": null,
      "last_ip": null,
      "last_user_agent": null,   // ← nice-to-have, see §4
      "revoke_reason": null,
      "replaced_device_id": null,
      "created_at": "2026-10-15T08:00:00.000Z"
    }
  ],
  "total": 1, "page": 1, "limit": 20
}
```

- `user_id` **must** be the same UUID the directory and the `?user_id=` filter use
  (`users.id`), so the three things line up: list grouping, the person filter, and
  the profile link.
- Keep stripping all cryptographic fields exactly as today.
- This single field un-breaks the entire People tab. It is the one blocking ask.

### Done when

- Every `items[]` row from `GET /attendance/hr/trusted-devices` carries a non-null
  `user_id`.
- `GET /attendance/hr/trusted-devices?user_id=<id>` keeps returning only that user's
  devices (already works; just confirming it stays).

---

## 3. Requirement 3 (SHOULD) — a per-person device roster endpoint

> Numbered 3 in the TL;DR by priority; documented here because it directly replaces
> the client-side join. Requirement 2 (coverage) follows in §5.

### What's wrong

Even with `user_id` added, the frontend builds the "who has what" list by **pulling
the entire device inventory into the browser** (100/page, capped at 30 pages = 3000
devices) and grouping it against the directory. That is fine for a pilot, but:

- It is a hard ceiling. An org with >3000 devices silently stops joining past the cap.
- It is N network pages on every page load and every refresh.
- Filtering ("No device", "Waiting", "Blocked") and sorting happen client-side over
  the whole set.

### What we'd like

A dedicated roster endpoint that returns **one row per person** with their device
summary already aggregated server-side, paginated and filterable. Keyed by
`user_id` only — **no** names/emails/avatars (frontend joins those from the
directory).

```
GET /api/v1/attendance/hr/device-trust/people
```

**Query parameters**

| Param | Type | Notes |
|-------|------|-------|
| `coverage` | enum | `none` \| `pending` \| `covered` \| `blocked` — filter by device state |
| `role` | enum | `employee` \| `manager` \| `hr` — maps to the role groups HR filters by |
| `search` | string | optional server-side name/code search (we can also keep doing this client-side) |
| `page` | int | ≥ 1, default 1 |
| `limit` | int | 1..100, default 20 |

**Success response (`200 OK`)**

```jsonc
{
  "success": true,
  "message": "Device coverage roster fetched",
  "data": {
    "items": [
      {
        "user_id": "9b1deb4d-...",       // the ONLY person key we need
        "device_count": 2,               // total devices, any status
        "active_count": 1,               // status = active
        "pending_count": 1,              // status = pending (waiting for HR)
        "suspended_count": 0,
        "revoked_count": 0,
        "covered": true,                 // active_count > 0  (can clock in)
        "last_used_at": "2026-10-20T04:11:00.000Z"  // max across the person's devices, or null
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 20
  }
}
```

**Why these exact fields:** they are precisely what the frontend already computes in
`summariseDevices()` ([deviceTrustMeta.js:160](../../../src/shared/attendance/deviceTrustMeta.js)).
The row renders to: a "2 devices · 1 ready · 1 waiting" cell, a "Last used" cell, and
the one-word "Can clock in / Waiting for you / Blocked / No device" verdict.

**Important:** the roster must include people with **zero** devices (that's the whole
point — `coverage=none`). So it is driven by the **active members** list, left-joined
to devices, not by the device table. `active_members` is defined the same way as in
API #17 (`user_roles.is_active = true`).

If this endpoint exists, the frontend stops paging the full inventory and just reads
one page at a time — and the 3000-device ceiling disappears.

> This is a "SHOULD" because Requirement 1 alone makes the current page correct for
> normal org sizes. This endpoint is what makes it correct **and** scalable. If you
> can only do one thing, do Requirement 1.

---

## 4. Nice-to-have — `last_user_agent` for a friendlier "Last seen from"

The device inspector currently shows **"Last seen from"** = `last_ip`. The schema
(§3.1) already stores `last_user_agent`, but it's stripped from the sanitized
response. If it were included on **API #8** rows (and API #5 "my devices"), the
inspector could show a human line like *"Chrome on Windows · 103.21.124.5"* instead of
a bare IP, which reads better for a non-technical HR user.

- Not required. Purely cosmetic.
- If included, send it raw; the frontend will parse it to a friendly
  browser/OS label and never display the raw UA string.

---

## 5. Requirement 2 (SHOULD) — enrich the coverage metric (API #17)

### What's there now

`GET /attendance/hr/device-trust/coverage` returns only three numbers:

```json
{ "enrolled_users": 142, "active_members": 150, "coverage_percentage": 94.67 }
```

The three tiles at the top of the page use these, and the frontend derives
`uncovered = active_members - enrolled_users` itself. That works, but it can't tell
HR **who** is uncovered, how many devices are **waiting on HR right now**, or break
coverage down by team — all of which HR asks the moment coverage is below the safe
threshold (95%).

### What we'd like added

```jsonc
{
  "success": true,
  "message": "Device trust coverage fetched",
  "data": {
    "enrolled_users": 142,
    "active_members": 150,
    "coverage_percentage": 94.67,
    "uncovered_users": 8,          // active members with zero active devices
    "pending_users": 3,            // people with ≥1 device waiting for HR approval
    "pending_devices": 4,          // total devices in 'pending' (drives the queue badge)
    "suspended_users": 1,
    "by_group": [                  // optional but valuable: breakdown for the role tabs
      { "group": "employee", "active_members": 120, "enrolled_users": 118 },
      { "group": "manager",  "active_members": 20,  "enrolled_users": 19 },
      { "group": "hr",       "active_members": 10,  "enrolled_users": 5 }
    ]
  }
}
```

- `pending_devices` would also let the sidebar "Employee Devices" approval badge show
  a correct count without paging the inventory.
- `by_group` lets each role tab (Employees / Managers / HR) show its own coverage,
  which is where enforcement actually bites unevenly.
- All additive — existing three fields stay, so nothing breaks if this ships later.

---

## 6. What the frontend will do with each field (quick reference)

| Field | Source endpoint | Rendered as |
|-------|-----------------|-------------|
| `user_id` | API #8 (+ roster) | the join key → resolves name/photo/dept/code from the directory |
| `active_count` / `pending_count` / `suspended_count` / `revoked_count` | roster (or derived from #8) | "2 devices · 1 ready · 1 waiting" cell |
| `covered` | roster (or derived) | "Can clock in" vs "Waiting for you" vs "Blocked" vs "No device" |
| `last_used_at` | API #8 / roster | "Last used" column (`fmtDateTime`, else "Not yet used") |
| `last_ip`, `last_user_agent` | API #8 | inspector "Last seen from" |
| `enrolled_users` / `active_members` / `coverage_percentage` | API #17 | the three hero tiles |
| `uncovered_users` / `pending_devices` / `by_group` | API #17 (requested) | the low-coverage warning banner, approval badge, per-tab coverage |

---

## 7. Acceptance checklist

- [ ] **R1 (blocking):** `GET /attendance/hr/trusted-devices` returns `user_id`
      (= `users.id`) on every row; crypto fields still stripped.
- [ ] R2: `GET /attendance/hr/device-trust/coverage` additionally returns
      `uncovered_users`, `pending_users`, `pending_devices`, `suspended_users`, and
      (ideally) `by_group`.
- [ ] R3: `GET /attendance/hr/device-trust/people` returns the per-person roster in
      §3, includes zero-device people, and supports `coverage` / `role` / `page` /
      `limit`.
- [ ] Nice-to-have: `last_user_agent` included on API #8 (and #5) rows.
- [ ] No person display data (name/email/avatar/department) added to device rows.

Ping the frontend once R1 is on `dev` — it un-breaks the People tab on its own and we
can verify the join end-to-end before R2/R3 land.

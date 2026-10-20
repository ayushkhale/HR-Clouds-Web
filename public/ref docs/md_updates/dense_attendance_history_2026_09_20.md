# Attendance history endpoints are now DENSE (one entry per calendar day)

**Date:** 2026-09-20
**Author:** Backend
**Type:** API response change — additive rows on existing endpoints + one pagination-semantics change. No field was renamed or removed; all previously-present fields keep the same name and type.

---

## 1. Summary

The per-employee attendance **history** endpoints previously returned **only the days that have a
row in `attendance_records`** — i.e. days the employee actually clocked in (or that a cron had
written, e.g. `absent`/`on_leave`). Any other day was simply **missing** from `records[]`.

Because those days were absent from the payload, a calendar grid could not tell the difference
between:

- an **absent** day,
- a **weekly off**,
- a **holiday**,
- an **upcoming** (future) day,
- or a day with genuinely **no data**.

They all looked identical: "no entry".

**Now the response is dense.** `records[]` contains **one entry for every calendar day** in the
requested range. Days that have a real record are returned **exactly as before**. Days with **no
record** are now included too, carrying the **reason in `status`** and `null` in every metric field.

---

## 2. Affected endpoints

| # | Method & path | Who can call | Response `message` |
|---|---|---|---|
| 1 | `GET /api/v1/attendance/hr/employees/:userId/attendance` | `hr`, `admin`, `super-admin` | `Employee attendance history fetched successfully` |
| 2 | `GET /api/v1/attendance/hr/managers/:userId/attendance` | `hr`, `admin`, `super-admin` | `Manager attendance history fetched successfully` |
| 3 | `GET /api/v1/attendance/hr/hrs/:userId/attendance` | `hr`, `manager`, `admin`, `super-admin` | `HR staff attendance history fetched successfully` |
| 4 | `GET /api/v1/attendance/manager/team/member/:userId/history` | `manager` (or `hr` as global approver) | `Member history fetched` |

Endpoints 1–3 share one implementation and one response shape (the **full** shape, §5.1).
Endpoint 4 has a **leaner** response shape (§5.2) — this was already the case before this change.

All four require the `attendance.access` feature flag and a valid bearer token.

---

## 3. Request

### 3.1 Path parameters

| Param | Type | Notes |
|---|---|---|
| `userId` | UUID | The employee/manager/HR whose history you want. Must belong to the caller's org (and, for a manager, be one of their reports). |

### 3.2 Query parameters

| Param | Type | Endpoints 1–3 | Endpoint 4 | Default | Notes |
|---|---|:--:|:--:|---|---|
| `month` | integer 1–12 | ✅ | ❌ | — | Use **with** `year` to select a whole month. |
| `year` | integer 2000–2100 | ✅ | ❌ | — | Use **with** `month`. |
| `from` | ISO date (`YYYY-MM-DD`) | ✅ | ✅ | — | Explicit range start. Takes precedence over `month`/`year` when both `from` and `to` are given. |
| `to` | ISO date (`YYYY-MM-DD`) | ✅ | ✅ | — | Explicit range end. |
| `page` | integer ≥ 1 | ✅ | ✅ | `1` | Paginates over **calendar days** (see §6). |
| `limit` | integer 1–100 | ✅ | ✅ | `50` (1–3), `20` (4) | Days per page. For a full-month grid send `limit=31`. |

**Range resolution:**
1. If both `from` and `to` are supplied → that exact range.
2. Else if `month` + `year` are supplied (endpoints 1–3) → the first to the last day of that month.
3. Else → **the current month** (new fallback; previously endpoints returned *all* history ever).

### 3.3 Example requests

```bash
# Full September 2026 grid for one employee (HR view)
curl -H "Authorization: Bearer <token>" \
  "https://development.hrclouds.in/api/v1/attendance/hr/employees/489f9cd6-990d-4911-a84f-060984cc1831/attendance?month=9&year=2026&page=1&limit=31"

# Explicit range (manager view of a report)
curl -H "Authorization: Bearer <token>" \
  "https://development.hrclouds.in/api/v1/attendance/manager/team/member/489f9cd6-990d-4911-a84f-060984cc1831/history?from=2026-09-01&to=2026-09-30&page=1&limit=31"
```

---

## 4. Response envelope

```jsonc
{
  "success": true,
  "message": "Employee attendance history fetched successfully",
  "data": {
    "member": { /* §5.3 */ },
    "pagination": { /* §5.4 */ },
    "records": [ /* one entry per calendar day, newest first — §5.1 / §5.2 */ ]
  }
}
```

---

## 5. Response body

### 5.1 `records[]` — full shape (endpoints 1, 2, 3)

Every field below is present on **both** real-record days and record-less days. On a record-less
day, `id` is `null`, `status` carries the reason, and every metric field is `null`.

| Field | Type (real record) | Type (record-less day) | Description |
|---|---|---|---|
| `id` | UUID string | `null` | Attendance record id; `null` means the day is synthesized (no punch). |
| `date` | `YYYY-MM-DD` | `YYYY-MM-DD` | The calendar day. Always present. |
| `status` | enum | enum | See §7. On a record-less day this is the resolved **reason**. |
| `clock_in_time` | ISO datetime / `null` | `null` | First clock-in. |
| `clock_out_time` | ISO datetime / `null` | `null` | Last clock-out. |
| `effective_hours` | number | `null` | Net worked hours. |
| `late_minutes` | number | `null` | Minutes late vs shift start. **> 0 ⇒ render as "Late".** |
| `early_exit_minutes` | number | `null` | Minutes left early vs shift end. |
| `overtime_minutes` | number | `null` | Overtime minutes. |
| `break_duration_minutes` | number | `null` | Total break minutes. |
| `work_mode` | `office`\|`remote`\|`hybrid`\|`field`\|`null` | `null` | Work location mode. |
| `is_regularized` | boolean | `false` | Whether the day was regularized. |
| `shift` | object / `null` | `null` | `{ name, start_time, end_time, type }` when a shift is attached. |
| `breaks` | array | `[]` | Each: `{ start_time, end_time, duration_minutes }`. |
| `sessions` | array | `[]` | Each: `{ opened_at, closed_at, status }`. |

### 5.2 `records[]` — lean shape (endpoint 4, manager team member)

This endpoint returns a **subset** of the fields (unchanged from before this release, apart from now
including record-less days):

| Field | Type (real record) | Type (record-less day) |
|---|---|---|
| `id` | UUID string | `null` |
| `date` | `YYYY-MM-DD` | `YYYY-MM-DD` |
| `status` | enum | enum (reason) |
| `clock_in_time` | ISO datetime / `null` | `null` |
| `clock_out_time` | ISO datetime / `null` | `null` |
| `effective_hours` | number | `null` |
| `late_minutes` | number | `null` |
| `overtime_minutes` | number | `null` |
| `work_mode` | string / `null` | `null` |
| `is_regularized` | boolean | `false` |
| `shift` | `{ name }` / `null` | `null` |

> Note: `early_exit_minutes`, `break_duration_minutes`, `breaks`, and `sessions` are **not** part of
> this endpoint's shape (they never were).

### 5.3 `member` object (all four endpoints)

```jsonc
{
  "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
  "name": "Pranay Kumar",
  "employee_code": "E-1024",
  "department": "Engineering",
  "designation": "Software Engineer",
  "avatar_url": "https://.../avatar.png"   // or null
}
```

`department` / `designation` fall back to the string `"Unassigned"` when the profile has none;
`employee_code` / `avatar_url` fall back to `null`; `name` falls back to `"Unknown"`.

### 5.4 `pagination` object (all four endpoints)

```jsonc
{
  "total": 30,        // ⚠️ number of DAYS in the range (see §6), not number of records
  "page": 1,
  "limit": 31,
  "total_pages": 1    // ceil(total / limit)
}
```

---

## 6. ⚠️ Behavioural change: `pagination.total` is now a DAY count

Because the list is dense, pagination is over **calendar days**, not records.

- **Before:** `total` = number of attendance records in the range (e.g. `12` for a month where the
  person clocked in on 12 days).
- **After:** `total` = number of **days** in the range (e.g. `30` for September).
- `total_pages = ceil(total / limit)`.
- Ordering is **newest day first** (`date` descending) — unchanged from before.

For the calendar grid, request the whole month in one page (`limit=31`) and you receive every day,
day 30 → day 1.

Pagination example — September 2026 (30 days) with `limit=10`:

| `page` | Days returned (newest → oldest) | `total` | `total_pages` |
|---|---|---|---|
| 1 | 30, 29, … 21 | 30 | 3 |
| 2 | 20, 19, … 11 | 30 | 3 |
| 3 | 10, 9, … 1 | 30 | 3 |

---

## 7. `status` values

The `status` enum is **unchanged**. Values you can receive:

| Value | Source | Meaning |
|---|---|---|
| `present` | real record | Full present day. |
| `in_progress` | real record | Clocked in, not yet clocked out (live shift). |
| `half_day` | real record | Half day. |
| `on_leave` | real record | Approved leave. |
| `absent` | real record **or** resolved reason | Working day with no attendance. |
| `holiday` | real record **or** resolved reason | Public/company holiday for this employee. |
| `weekly_off` | real record **or** resolved reason | Weekly off per the employee's shift/rule. |
| `not_marked` | resolved reason | Pre-joining day, **today not yet marked**, or a **future working day**. |

**Reason precedence for a record-less day** (first match wins):
`date < joining_date` → `not_marked` · holiday → `holiday` · weekly off → `weekly_off` ·
`date < today` (working day) → `absent` · `date == today` or `date > today` (working day) → `not_marked`.

This is the same precedence the existing `/summary` and `/graph-data` readouts already use.

---

## 8. Rendering the 9 legend chips

`status` alone gives 7 of the 9 chips. The remaining two — **LATE** and **UPCOMING** — are derived on
the frontend from fields already in the row (there is no `late` or `upcoming` `status` value; there
never was for LATE, and UPCOMING is intentionally left to a date comparison so it stays consistent
across every attendance readout):

| Legend chip | Condition |
|---|---|
| PRESENT | `status` is `present` or `in_progress`, and `late_minutes` is `0`/`null` |
| LATE | `late_minutes > 0` (status stays `present`/`half_day` — **derive**, don't expect a `late` status) |
| HALF DAY | `status === 'half_day'` |
| ON LEAVE | `status === 'on_leave'` |
| ABSENT | `status === 'absent'` |
| HOLIDAY | `status === 'holiday'` |
| WEEKLY OFF | `status === 'weekly_off'` |
| NO DATA | `status === 'not_marked'` **and** `date <= today` |
| UPCOMING | `status === 'not_marked'` **and** `date > today` |

---

## 9. Full example — `GET /hr/employees/:userId/attendance?month=9&year=2026&limit=31`

Assume "today" is **2026-09-20**. Response (abridged in the middle — the real payload has all 30
days, day 30 → day 1):

```jsonc
{
  "success": true,
  "message": "Employee attendance history fetched successfully",
  "data": {
    "member": {
      "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
      "name": "Pranay Kumar",
      "employee_code": "E-1024",
      "department": "Engineering",
      "designation": "Software Engineer",
      "avatar_url": null
    },
    "pagination": { "total": 30, "page": 1, "limit": 31, "total_pages": 1 },
    "records": [
      // ---- future working days: UPCOMING (not_marked, date > today) ----
      {
        "id": null, "date": "2026-09-30", "status": "not_marked",
        "clock_in_time": null, "clock_out_time": null, "effective_hours": null,
        "late_minutes": null, "early_exit_minutes": null, "overtime_minutes": null,
        "break_duration_minutes": null, "work_mode": null, "is_regularized": false,
        "shift": null, "breaks": [], "sessions": []
      },
      // ... days 29 → 22, most not_marked (upcoming), a Sunday as weekly_off ...
      {
        "id": null, "date": "2026-09-27", "status": "weekly_off",
        "clock_in_time": null, "clock_out_time": null, "effective_hours": null,
        "late_minutes": null, "early_exit_minutes": null, "overtime_minutes": null,
        "break_duration_minutes": null, "work_mode": null, "is_regularized": false,
        "shift": null, "breaks": [], "sessions": []
      },
      // ---- today, not yet clocked in: NO DATA (not_marked, date == today) ----
      {
        "id": null, "date": "2026-09-20", "status": "not_marked",
        "clock_in_time": null, "clock_out_time": null, "effective_hours": null,
        "late_minutes": null, "early_exit_minutes": null, "overtime_minutes": null,
        "break_duration_minutes": null, "work_mode": null, "is_regularized": false,
        "shift": null, "breaks": [], "sessions": []
      },
      // ---- a real, present-but-late day ----
      {
        "id": "a1b2c3d4-....", "date": "2026-09-19", "status": "present",
        "clock_in_time": "2026-09-19T09:42:00.000Z", "clock_out_time": "2026-09-19T18:10:00.000Z",
        "effective_hours": 8.1, "late_minutes": 12, "early_exit_minutes": 0,
        "overtime_minutes": 0, "break_duration_minutes": 45, "work_mode": "office",
        "is_regularized": false,
        "shift": { "name": "General", "start_time": "09:30", "end_time": "18:00", "type": "fixed" },
        "breaks": [ { "start_time": "2026-09-19T13:00:00.000Z", "end_time": "2026-09-19T13:45:00.000Z", "duration_minutes": 45 } ],
        "sessions": [ { "opened_at": "2026-09-19T09:42:00.000Z", "closed_at": "2026-09-19T18:10:00.000Z", "status": "closed" } ]
      },
      // ---- a real half day ----
      {
        "id": "b2c3d4e5-....", "date": "2026-09-18", "status": "half_day",
        "clock_in_time": "2026-09-18T09:30:00.000Z", "clock_out_time": "2026-09-18T13:30:00.000Z",
        "effective_hours": 4.0, "late_minutes": 0, "early_exit_minutes": 0,
        "overtime_minutes": 0, "break_duration_minutes": 0, "work_mode": "remote",
        "is_regularized": false,
        "shift": { "name": "General", "start_time": "09:30", "end_time": "18:00", "type": "fixed" },
        "breaks": [], "sessions": []
      },
      // ---- an approved leave day (real record) ----
      {
        "id": "c3d4e5f6-....", "date": "2026-09-17", "status": "on_leave",
        "clock_in_time": null, "clock_out_time": null, "effective_hours": 0,
        "late_minutes": 0, "early_exit_minutes": 0, "overtime_minutes": 0,
        "break_duration_minutes": 0, "work_mode": null, "is_regularized": false,
        "shift": null, "breaks": [], "sessions": []
      },
      // ---- a past working day with no punch: ABSENT (resolved reason) ----
      {
        "id": null, "date": "2026-09-16", "status": "absent",
        "clock_in_time": null, "clock_out_time": null, "effective_hours": null,
        "late_minutes": null, "early_exit_minutes": null, "overtime_minutes": null,
        "break_duration_minutes": null, "work_mode": null, "is_regularized": false,
        "shift": null, "breaks": [], "sessions": []
      }
      // ... remaining days 15 → 1 ...
    ]
  }
}
```

### 9.1 Same idea, lean shape — `GET /manager/team/member/:userId/history`

```jsonc
{
  "success": true,
  "message": "Member history fetched",
  "data": {
    "member": { "user_id": "489f...", "name": "Pranay Kumar", "employee_code": "E-1024", "department": "Engineering", "designation": "Software Engineer", "avatar_url": null },
    "pagination": { "total": 30, "page": 1, "limit": 31, "total_pages": 1 },
    "records": [
      { "id": null, "date": "2026-09-30", "status": "not_marked", "clock_in_time": null, "clock_out_time": null, "effective_hours": null, "late_minutes": null, "overtime_minutes": null, "work_mode": null, "is_regularized": false, "shift": null },
      { "id": "a1b2...", "date": "2026-09-19", "status": "present", "clock_in_time": "2026-09-19T09:42:00.000Z", "clock_out_time": "2026-09-19T18:10:00.000Z", "effective_hours": 8.1, "late_minutes": 12, "overtime_minutes": 0, "work_mode": "office", "is_regularized": false, "shift": { "name": "General" } },
      { "id": null, "date": "2026-09-16", "status": "absent", "clock_in_time": null, "clock_out_time": null, "effective_hours": null, "late_minutes": null, "overtime_minutes": null, "work_mode": null, "is_regularized": false, "shift": null }
      // ... every other day of the month ...
    ]
  }
}
```

---

## 10. Notes & rationale

- **Why `null`, not `0`, on record-less days?** So the UI can show "no data" distinctly from a real
  measured `0` (e.g. `0` overtime on a day that was actually worked). Do not treat `null` metrics as
  zero when aggregating.
- **`id: null`** is the reliable "this is a synthesized day" signal, if you prefer that over checking
  `status`.
- **Cost is bounded.** The endpoint only loads records for the requested page's date window and only
  resolves the reason for that page's record-less days, so a large `from`/`to` range does not blow up
  the query.

---

## 11. Not changed in this release

- `GET /attendance/history` and `GET /attendance/summary` (employee **self-service**) still return
  only real records. The employee's own calendar should keep using `GET /attendance/graph-data`,
  which is **already dense** (one entry per day of the month).
- `GET /attendance/manager/team/history` (the unbounded team-wide feed) is untouched — see the
  standing note in `public/md_attendance/ATTENDANCE_API_CONTRACT.md` §8.1.
- No `status` value was added or removed. No existing field was renamed or retyped for real-record
  days.

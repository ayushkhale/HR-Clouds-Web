# Attendance: `status_source` / `status_reason` / `is_provisional` added to every day-status payload

**Date:** 2026-10-04
**Module:** Attendance — HR, manager and employee read planes
**Change type:** Additive response fields (non-breaking) + **3 behaviour corrections** (see §6)

---

## 1. Why

A day's `status` could not tell you two things you need in order to render an honest panel:

1. **Where the value came from.** `status: "holiday"` looks identical whether a row exists in
   `attendance_records` or the backend computed "holiday" on the fly a millisecond ago. On a
   holiday roster every member read `holiday` with no way to ask *"did this person actually mark
   anything, and is this a genuine holiday?"*
2. **Why a record-less day got the status it did.** `not_marked` meant **three different things**:
   the member had not joined yet, or it is today and they have not punched yet, or it is a future
   day. Those need different treatment in the UI and were indistinguishable.

The underlying cause was that the derivation logic was **duplicated in 9 places**, and the copies
had drifted — see §6.1 for the resulting bug.

### The key fact that defines "final"

`auto_mark_absent.cron.js` (07:00 IST, for *yesterday*) only ever persists **`absent`** rows. It
deliberately `continue`s past holidays and weekly offs. So:

- a derived **holiday / weekly off is already the permanent answer** — no cron will ever replace it;
- a derived **absent / not_marked is a projection** that a punch or the cron may still replace.

`is_provisional` encodes exactly that distinction.

## 2. New fields

Added next to `status` on every endpoint in §4. **`status` itself is unchanged** — no new status
values, no enum change, no migration. Everything existing keeps working untouched.

| Field | Type | Meaning |
|---|---|---|
| `status_source` | `"record"` \| `"derived"` | `record` = a real `attendance_records` row. `derived` = computed now from the calendar/policy config. |
| `status_reason` | string enum (below) | Which rule produced the status. |
| `is_provisional` | boolean | `true` = this value can still change by itself. `false` = settled. |
| `status_context` | object | **Detail endpoints only** (§4.2) — names the holiday / weekly-off rule / shift that decided the day. |

### `status_reason` values

| Reason | `status` | `is_provisional` | What it means |
|---|---|---|---|
| `record` | any | `false` | Backed by a persisted row. The system of record. |
| `in_progress` | `in_progress` | **`true`** | Row exists but the member is still clocked in; the status will change on clock-out. |
| `before_joining` | `not_marked` | `false` | The member had not joined on this date. Not absent, not a holiday they could take. |
| `holiday` | `holiday` | `false` | An org holiday applies. **Permanent** — the cron never writes holiday rows. |
| `weekly_off` | `weekly_off` | `false` | A weekly-off rule applies. **Permanent**, same reason. |
| `awaiting_absent_cron` | `absent` | **`true`** | Past working day, no row. *Our computed absence* — the 07:00 IST cron has not persisted it yet. |
| `pending_clock_in` | `not_marked` | **`true`** | **Today**, a working day, nothing punched yet. Still expected in. |
| `upcoming` | `not_marked` | **`true`** | A future working day. Nothing owed yet. |

### Suggested rendering

```js
// "is this a genuine day off, or has nothing happened yet?"
const isRealDayOff   = ['holiday', 'weekly_off'].includes(row.status_reason)
const neverEmployed  = row.status_reason === 'before_joining'
const stillExpected  = row.status_reason === 'pending_clock_in'   // today, no punch yet
const notYetFinalised = row.is_provisional                        // show a "pending" affordance
const employeeActed  = row.status_source === 'record'             // a row exists for this member
```

A `status: "absent"` with `status_reason: "awaiting_absent_cron"` is a projection — safe to show,
but label it as not-yet-finalised rather than as a confirmed absence. Once the cron runs, the same
day returns `status_source: "record"`, `status_reason: "record"`, `is_provisional: false`.

## 3. Sample — the roster that prompted this

`GET /api/v1/attendance/hr/employees/attendance?date=2026-10-02` (a holiday):

```json
{
  "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
  "name": "Gopal Sharma",
  "date": "2026-10-02",
  "status": "holiday",
  "status_source": "derived",
  "status_reason": "holiday",
  "is_provisional": false,
  "clock_in_time": null,
  "clock_out_time": null,
  "effective_hours": null,
  "worked_duration_formatted": "0h 0m",
  "late_minutes": 0,
  "overtime_minutes": 0,
  "work_mode": null,
  "is_regularized": false
}
```

Read as: *a genuine org holiday* (`status_reason: holiday`), *the member marked nothing*
(`status_source: derived`, null clock times), and *this will not change* (`is_provisional: false`).

## 4. Affected endpoints

### 4.1 Three provenance fields (`status_source`, `status_reason`, `is_provisional`)

**HR plane**
- `GET /hr/employees/attendance` — per `records[]` item
- `GET /hr/managers/attendance` — per `records[]` item
- `GET /hr/staff/attendance` — per `records[]` item
- `GET /hr/employees/:userId/attendance` (+ `managers`/`staff` variants) — per `records[]` item

**Manager plane**
- `GET /manager/team/summary` — per `members[]` item
- `GET /manager/team/member/:userId/history` — per `records[]` item
- `GET /manager/team/today` — per row (both persisted and synthesised; see §6.3)

**Employee plane**
- `GET /attendance/graph-data` — per `daily[]` item
- `GET /attendance/weekly-calendar` — per `daily[]` item
- `GET /attendance/history` — per `records[]` item

### 4.2 …plus `status_context` (detail endpoints only)

- `GET /attendance/daily-log` (employee's own day)
- `GET /hr/employees/:userId/daily-log`
- `GET /manager/team/member/:userId/daily-log` (renders the HR payload, so it inherits it)

```json
{
  "date": "2026-10-02",
  "status": "holiday",
  "status_source": "derived",
  "status_reason": "holiday",
  "is_provisional": false,
  "status_context": {
    "holiday": { "id": "…", "name": "Gandhi Jayanti", "type": "public" },
    "weekly_off": null,
    "shift": { "id": "…", "name": "General", "start_time": "10:00:00", "end_time": "19:00:00", "type": "fixed" }
  }
}
```

On a weekly off, `weekly_off` carries `{ id, name, days_of_week }` — the **highest-priority**
applicable rule, the same one that decided the day. On a record-backed day `status_context` is
`{ holiday: null, weekly_off: null, shift: null }` (the row itself is the explanation).

**Why detail-only:** naming the holiday/rule costs extra queries *per member per day*. On a
500-person roster that is ~1000 extra queries just to print a label. List endpoints therefore get
the three cheap flags, and the drill-in endpoints get the full evidence.

## 5. Not changed

- `GET /hr/dashboard/live`, `GET /hr/dashboard/graph-data`, `GET /manager/team/graph-data`,
  `GET /hr/dashboard/department-summary` — these return **aggregate counts**, not per-day statuses.
  No per-row provenance applies. Their counts are unaffected except as noted in §6.1.
- All `status` values, query parameters, request bodies and existing fields.
- The `status` filter on the HR list endpoints still filters on `status` only (not `status_reason`).

## 6. Behaviour corrections ⚠️

These are **intentional fixes**, not new features. Each one makes a panel agree with the others.

### 6.1 HR plane: a pre-joining member on a holiday no longer reads `holiday`

The HR plane checked *"is it a holiday"* **before** *"had this person even joined"*, while the
employee plane, the manager roster **and the auto-absent cron** all check joining first. A member
whose `joining_date` was after the queried date therefore showed:

| Plane | Before | After |
|---|---|---|
| HR list / HR daily-log / dashboard-live counts | `holiday` | `not_marked` + `before_joining` |
| Employee plane, manager roster, cron | `not_marked` | `not_marked` + `before_joining` (unchanged) |

**Frontend impact:** on `GET /hr/dashboard/live`, such a member now lands in `counts.not_marked`
instead of `counts.holiday` (and therefore in `final_absent_count` rather than
`final_leave_count`). Only affects members with a future-dated `joining_date` on a holiday or
weekly off — normally only during onboarding.

### 6.2 Employee `daily-log`: `is_holiday` / `is_weekly_off` now match `status`

They previously reported the **raw calendar probe**, so a pre-joining day on a holiday returned the
self-contradicting `status: "not_marked"` **with** `is_holiday: true`. They now mean exactly
`status === 'holiday'` / `status === 'weekly_off'`.

Also on a record-less **pre-joining** day, `shift` is now `null` (previously a resolved shift) —
no shift applies before joining. On all other record-less days `shift` is populated as before,
including on holidays.

### 6.3 Employee `weekly-calendar` now honours the joining date

It never loaded the joining date, so a day before the member joined was reported as `absent`. It
now reports `not_marked` + `before_joining`, consistent with every other endpoint. The
`week_summary.days_absent` / `days_off` counters shift accordingly for newly-joined members.

### 6.4 Explicitly unchanged

- **`GET /attendance/trends` streak semantics.** The streak walk treats an unclocked *working*
  day — including today — as breaking the streak, exactly as before. The more precise
  `pending_clock_in` is collapsed back to `absent` inside that loop on purpose.
- **`GET /manager/team/today` row shape.** Persisted rows are now serialised via `toJSON()` before
  the new keys are merged in. That is the same nested structure the response already contained —
  keys are only added.

## 7. Implementation note

All nine duplicated copies of the derivation now call one resolver,
`clockService.resolveDerivedDayStatus()`, which owns the precedence:

```
before_joining → holiday → weekly_off → past working day → today → future
```

identical to `autoMarkAbsentForMissingRecords`, so **a readout can never contradict what the cron
will later persist**. `resolveVirtualStatus()` remains as the status-only view. Shared response
shapes live in `src/modules/attendance/utilities/day_status.utils.js`.

Net effect on the codebase: −205 / +250 lines, i.e. the consolidation removed more duplicated
branching than the new contract added.

**Cost:** unchanged for every list endpoint (same primitive calls as before).
`GET /manager/team/today` performs one extra shift resolution per unclocked member, because the
resolver no longer hands its internally-resolved shift back to that endpoint's snapshot builder.

## 8. Tests

`tests/unit/attendance/day_status_contract.test.js` (17 tests) pins the full truth table, the
pre-joining short-circuit (asserting **zero** calendar probes), `status_context` resolution, the
§6.1 fix, and — most importantly — that the HR, manager and employee planes emit an **identical
key set and identical values** for the same derived day. That last test is the guard against the
panels drifting apart again.

Full unit suite: **2751 / 2751 passing**.

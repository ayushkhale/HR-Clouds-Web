# Frontend requests: field assignments (person-first) and per-person task counts

**Date:** 2026-10-18
**From:** Frontend (HR Clouds Web)
**Modules:** Attendance & Time Tracking (work mode / field geofencing), Task Assignment
**Contracts read:** `md_attendance/7_work_mode_and_field_geofencing_api.md`,
`md_task-assignment/phases/phase2_api_analysis.md`

---

## 0. What changed on the frontend, so the asks make sense

All nine endpoints in `7_work_mode_and_field_geofencing_api.md` are now wired. Two of
them previously had no screen at all, and that is what this round of work added:

| Endpoint | Where it is now reachable |
|---|---|
| `GET /field-assignments/user/:user_id` (API 8) | **New** `FieldAssignmentsPanel` — one person's work mode, base office and client sites |
| `DELETE /field-assignments/:id` (API 7) | A **Remove** action on each row of that panel (it was only reachable site-first, inside a folded section of a site's detail dialog) |

The panel is mounted in two places, in both the HR and the manager workspace:

1. **Setup › Organization › Client Sites**, which is now two views —
   **Sites** (register and retire a site) and **People** (pick a person, see and
   change where they may clock in).
2. The **Reporting & Location** tab on an employee's record
   (`People › Team › <person>`), beside their reporting line and department.

Everything below is a gap we worked around rather than a blocker. Nothing here is
needed for the screens to function; each item says what we do today instead.

---

## 1. `assigned_user_count` on the field-locations **list** rows

**Endpoints:** `GET /api/v1/attendance/{hr|manager}/field-locations`

API 3 (`GET /field-locations/:id`) always returns `assigned_user_count`, which is
exactly the number the Sites table wants in a **People** column: "this site has 6
people on it" is the first thing an HR admin asks before retiring one — and a
`DELETE` cascades the assignments in the same transaction (§4.3), so it is also
the number that makes the confirmation honest.

The list rows don't carry it, and our rules forbid a request per row, so the column
is absent today.

**Ask:** add `assigned_user_count` (active assignments only, same definition as
API 3) to each row of the list response. A second aggregate would do if a count
per row is expensive:

```jsonc
// Either, per row:
{ "id": "…", "name": "Acme — Pune", "assigned_user_count": 6, … }

// Or once, beside `total`:
{ "records": [ … ], "total": 12, "assigned_user_counts": { "<location_id>": 6, … } }
```

**Today instead:** the Sites table shows no people count, and the retire
confirmation says the assignments will be removed without saying how many.

---

## 2. A way to **change** an assignment window

**Endpoint wanted:** `PUT /api/v1/attendance/{hr|manager}/field-assignments/:id`

The contract has create (API 6) and soft-delete (API 7) only, and the uniqueness
rule is date-blind — one active `(user, location)` pair whatever the dates — so
`FIELD_ASSIGNMENT_DUPLICATE` also fires on a second, non-overlapping window.

The consequence for the user is that **extending or shortening a window means
removing the assignment and adding it again**. That is what our copy now tells
them (we corrected an older message that promised an edit screen we had no
endpoint for), but it has two real costs:

* The new row's `assigned_by` becomes whoever edited it, so the record of who
  originally put that person on that site is lost.
* Between the delete and the create, the person's punches at that site are
  unverified — small, but it is a gap in an audit trail that exists to defend a
  punch.

**Ask:** either a `PUT` accepting `effective_from` / `effective_to` only (never
`user_id` or `field_location_id` — those identify the assignment), or, if that is
easier, make API 6 an upsert on the active `(user, location)` pair and say so in
the contract. A `PUT` is the one we'd prefer, with the same validation as the
create: `effective_to >= effective_from`, plain `YYYY-MM-DD`.

---

## 3. An organisation-wide "who is assigned where" read

**Endpoint wanted:** `GET /api/v1/attendance/{hr|manager}/field-assignments`
with `?field_location_id=&user_id=&is_active=&page=&limit=`

Today the only two ways in are **by site** (API 3's nested `assignments`, withheld
unless `can_modify`) and **by person** (API 8). There is no way to answer "show me
every field assignment in the organisation", which is the question behind:

* a Client Sites **People** view that opens with a list instead of an empty
  person picker — right now somebody must be chosen before anything appears;
* an audit of windows that are about to lapse ("whose assignment ends this
  month?");
* the "assigned to N sites" figure on a roster row.

**Ask:** a flat paginated list of assignments scoped the way the rest of the
module is (HR: the tenant; manager: their direct reports), with the same nested
`field_location` and `assigner` objects API 8 already returns, so no extra
resolution is needed client-side.

**Today instead:** the People view requires a person to be picked first, and the
scope note explains why a manager only sees their own reports there.

---

## 4. `api_registry.md` has no rows for any of these nine endpoints

`public/ref docs/api_registry.md` is the contract source of truth we tick as we
implement, and the work-mode / field-geofencing endpoints are missing from it
entirely — the only record of them is
`md_attendance/7_work_mode_and_field_geofencing_api.md`.

**Ask:** add the nine rows (APIs 1–9 of that document, both the `/hr` and
`/manager` mounts plus the employee's `GET /my-field-assignments`) to the
registry. We'll keep the implemented marks up to date once the rows exist.

---

## 5. Already fixed — recorded here only so it isn't "re-fixed"

The duplicate-row / pagination fault on `GET /field-locations` (one joined row per
creator **profile**, `total: 1` with `records.length: 2`) is covered by
`2026-10-07_field_locations_creator_join_fix.md`. Our client-side `dedupeById`
collapse stays in place as a guard until we have verified the fix on
development.hrclouds.in; it keeps the table honest but **cannot** recover a real
site pushed off a page by a duplicate, so the server fix is the one that counts.

---

## 6. Task module: a per-person status summary (nice to have)

**Endpoints:** `GET /api/v1/tasks/manager/team-tasks` (#257),
`GET /api/v1/tasks/hr` (#266)

The new **Tasks** tab on an employee's record shows the work one person is
carrying — #266 filtered by `assignee_id` for HR, #257 by `subordinate_id` for a
manager — plus the two numbers a reviewer acts on: how much is **waiting for
review** and how much is **past its deadline**.

A filtered list knows only its own `total`, so those two numbers cost two extra
`limit: 1` requests per tab open (not per row). It works, but a summary would
replace both:

```jsonc
// e.g. GET /tasks/hr/summary?assignee_id=…
//      GET /tasks/manager/team-tasks/summary?subordinate_id=…
{
  "data": {
    "by_status": { "pending": 3, "in_progress": 1, "in_review": 2, "reopened": 0, "completed": 9, "cancelled": 1 },
    "overdue": 2
  }
}
```

**Ask (low priority):** either the summary above, or a documented guarantee that
`pagination.total` on #257/#266 is cheap enough for us to keep asking twice. We
have assumed the latter for now.

---

## 7. Nothing else is missing

For the record, these were checked against the contract and need no change: the
coordinate/radius validation bounds (50–2000 m), `is_active` being rejected on
API 4's `PUT`, API 5's idempotent soft-delete and its `assignments_deactivated`
count, API 6's `set_work_mode_to_field` and `work_mode_warning` (both surfaced on
screen), API 7's idempotency, API 8's composite `assigned_office` + `records`, and
API 9 for the employee's own read. The manager scope rules in §6.1–§6.2 (direct
reports only, never themselves; edit/retire by HR or the creator) are enforced in
the UI as *absent controls* rather than refused requests.

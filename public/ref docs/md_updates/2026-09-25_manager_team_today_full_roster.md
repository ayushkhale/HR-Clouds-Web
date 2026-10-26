# Manager `team/today` Now Returns the Full Team Roster (Including Un-clocked Members)

**Date:** 2026-09-25
**Modules:** Attendance
**Type:** Behavioural change to an existing endpoint's response (additive rows, new synthetic row shape)
**Audience:** Frontend / API clients

---

## ⚠️ Frontend action required

`GET /api/v1/attendance/manager/team/today` **now returns one row for every accessible team member**, not only those who have an attendance record for today.

Previously the endpoint returned only real `attendance_records` rows, so a subordinate who had not clocked in simply **did not appear** in the list. It now mirrors the HR list endpoint: every member of the manager's team (or, for HR/Admin/Super-Admin, every employee in the org) is present, with un-clocked members represented by a **synthetic row**.

A synthetic (un-clocked) row is identifiable and shaped as:

| Field | Value on a synthetic row |
|---|---|
| `id` | `null` (a real record always has a UUID) |
| `clock_in_time`, `clock_out_time` | `null` |
| `total_hours`, `effective_hours` | `null` |
| `break_duration_minutes`, `late_minutes`, `early_exit_minutes`, `overtime_minutes` | `0` |
| `created_at`, `updated_at`, `first_clock_in_log_id`, `last_clock_out_log_id` | `null` |
| `status` | one of `not_marked`, `holiday`, `weekly_off`, `absent` (see below) |
| `shift_snapshot`, `policy_snapshot` | populated when a shift/policy can be resolved, else `null` |
| `user` | fully populated (same nested `profile` / `employee_profile` / … shape as a real row) |

**What to do:**

- Treat a row with **`id === null`** as an un-clocked member and render it from `status` rather than from the clock/metric fields.
- Do **not** assume `clock_in_time` / `effective_hours` are non-null — they are `null` for every synthetic row.
- Real records (`id` is a UUID) are **unchanged** in shape and content.

---

## Status semantics on synthetic rows

The `status` on an un-clocked member is derived with the same precedence the dense-calendar readouts use:

1. **Joining date is after today** → `not_marked` (no calendar probe is run).
2. **Holiday** for that member → `holiday`.
3. **Weekly off** for that member → `weekly_off`.
4. A past working day with no record → `absent`. *(Not reachable via this endpoint, whose date is always "today"; listed for completeness.)*
5. Otherwise (today, working day, simply not clocked in yet) → `not_marked`.

---

## Summary

- **Endpoint:** `GET /api/v1/attendance/manager/team/today` — roles `manager`, `hr`, `admin`, `super-admin`; feature `attendance.access`. **No request-side change** (no new params, no body).
- **Manager callers** see all their direct reports; **HR / Admin / Super-Admin** (global approvers) see every employee in the org.
- A UTC date-boundary defect in the previous implementation was fixed at the same time — "today" is now resolved in `Asia/Kolkata`, so the endpoint no longer flips date near midnight UTC.
- No new fields were added to real records; the change is the presence of additional synthetic rows and the guarantee that the list is the complete roster.

# Attendance Dashboard: `final_leave_count` added to response

**Date:** 2026-10-03
**Module:** Attendance (`/api/v1/attendance/hr/dashboard/*`)
**Change type:** Additive response field (non-breaking)
**Affected endpoints:**
- `GET /api/v1/attendance/hr/dashboard/graph-data` — each item in `data.daily[]`
- `GET /api/v1/attendance/hr/dashboard/live` — top-level `data`
- `GET /api/v1/attendance/manager/team/summary` — top-level `data` (manager team live snapshot)
- `GET /api/v1/attendance/manager/team/graph-data` — each item in `data.daily[]` (manager team graph)

---

## 1. Why

The dashboard renders three bars — **final present**, **final absent**, and **leave** — but the
response only exposed `final_present_count` and `final_absent_count`. The "leave" bucket
(employees not expected to work that day) had to be reconstructed on the frontend from three
separate fields, and was being left out. The backend now computes it directly.

## 2. New field

`final_leave_count` (integer) — employees **not expected to work** that day:

```
final_leave_count = on_leave_count + weekly_off_count + holiday_count
```

(For `graph-data` these are the per-day `on_leave_count` / `weekly_off_count` / `holiday_count`
already present in each `daily[]` item; for `live` they are `counts.on_leave + counts.weekly_off +
counts.holiday`.)

So the three bars now come straight from the payload:

| Bar | Field |
|---|---|
| Present | `final_present_count` |
| Absent  | `final_absent_count` |
| Leave   | `final_leave_count` |

The underlying `on_leave_count`, `weekly_off_count`, `holiday_count` fields are unchanged and still
returned, so a breakdown within the leave bar remains possible.

## 3. Sample — `graph-data`

```json
{
  "date": "2026-10-02",
  "is_working_day": false,
  "present_count": 0,
  "absent_count": 0,
  "on_leave_count": 0,
  "weekly_off_count": 0,
  "holiday_count": 8,
  "final_present_count": 0,
  "final_absent_count": 0,
  "final_leave_count": 8
}
```

## 4. Sample — `live`

```json
{
  "date": "2026-10-03",
  "total_employees": 8,
  "final_present_count": 2,
  "final_absent_count": 1,
  "final_leave_count": 5,
  "counts": { "present": 2, "absent": 1, "on_leave": 1, "weekly_off": 4, "holiday": 0, "not_marked": 0, "half_day": 0, "late": 0, "in_progress": 0 }
}
```

`final_leave_count` is also present (as `0`) in the empty-organization branch of `live`
(`total_employees: 0`), so the field is always present on both endpoints.

## 5. Manager team endpoints

The manager team dashboard renders the same three bars, so the two team endpoints get the same
field with the same formula:

- **`GET /manager/team/summary`** (live team snapshot) — `final_leave_count` added to the top-level
  `data`, computed from the per-member resolved `counts` (`holiday + weekly_off + on_leave`),
  exactly like `hr/dashboard/live`. Note: the empty-team branch (`team_size: 0`) already omits
  `final_present_count`/`final_absent_count`, so `final_leave_count` is likewise absent there —
  treat a `team_size: 0` response as all-zero.
- **`GET /manager/team/graph-data`** (monthly team graph) — each `daily[]` item now carries
  `weekly_off_count`, `holiday_count` **and** `final_leave_count`. Previously the per-day `counts`
  only had `on_leave_count` (no weekend/holiday buckets at all), so the "leave" bar was structurally
  incomplete. These are synthesised the same cheap way as the HR graph: a day is a holiday via the
  org calendar (`_isGlobalHoliday`) or a weekly-off if it is a Sat/Sun, and the whole team is then
  counted off (`teamSize - on_leave`). This is an org-wide approximation (it does not resolve
  per-member custom shifts); the live `summary` endpoint remains per-member accurate.

## 6. Not changed

- `GET /hr/dashboard/department-summary` — intentionally **not** given `final_leave_count`. It
  tracks `on_leave` per department, but `weekly_off`/`holiday` are org-wide (day-level), not
  attributed per department, so a per-department leave count would only equal `on_leave` and would
  not match the definition above. Left out to avoid a misleading partial number.
- `GET /attendance/graph-data` (employee personal graph) — different shape (a single person's
  monthly calendar, one `status` per day, no aggregate bars). Its `summary` already exposes
  `holiday_days`, `weekly_off_days` and `on_leave_days` separately, so no combined field was added.
- No query-parameter, request-body, or existing-field changes. Purely additive.

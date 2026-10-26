# My Schedule — Forward View: API Delivery

**Date:** 22 October 2026
**Responds to:** `2026-10-21_my_schedule_forward_view_data_requirements.md`
**Status:** Implemented. Code-complete, 69 new unit tests green. No migration required.
**Affects:** 2 new endpoints + 5 existing endpoints gained **additive, optional** query parameters.

---

## 1. What you asked for, and what you got

You offered two paths: §4 (one composed agenda endpoint) or §5 (filters on the endpoints you already call). You said §4 was preferred and §5 was the fallback.

**You get both.** §4 is the one you should build the page on. §5 shipped too, because a widget that needs only "my next 3 deadlines" shouldn't have to pull a 92-day agenda, and because two of the §5 gaps turned out to be bugs worth fixing on their own merits (details in §7).

Nothing is behind a flag. Nothing needs a migration — every lane reads tables that already exist.

| What | Path | Status |
|---|---|---|
| `GET /api/v1/attendance/schedule/agenda` | §4.2 | **New** |
| `GET /api/v1/attendance/manager/schedule/team-agenda` | §4.3 | **New** |
| `GET /api/v1/tasks/me` — `due_from`, `due_to`, `sort=due_date` | §5.1 | **Added** |
| `GET /api/v1/tasks/manager/team-tasks` — same three | §5.1 | **Added** |
| `GET /api/v1/attendance/holidays` — `from`, `to` | §5.2 | **Added** (+ a 500 fixed) |
| `GET /api/v1/leaves/my-requests` — `status`, `from`, `to` | §5.3 | **Added** |
| `GET /api/v1/documents/me/documents` — `expiring_before` | §5.4 | **Unblocked** |
| `probation_end` item kind | §4.4 | **Not built** — see §8 |

---

## 2. `GET /api/v1/attendance/schedule/agenda`

Self only. All org roles. **There is no `user_id` parameter** — the subject is the token, so there is no object reference to tamper with.

### Request

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | today | In the shift timezone echoed back to you |
| `to` | `YYYY-MM-DD` | `from` + 29 days | Inclusive |
| `include` | CSV of lane names | all | `tasks`, `documents`, `comp_offs`, `shift_changes`. Unknown names are a 400, not ignored. |

`shift`, `holidays` and `leave` are always resolved and cannot be switched off — `day_kind` is computed from them, and a cheaper payload isn't worth a wrong calendar. You may name them in `include`; they report `ok` either way.

### Response

```json
{
  "success": true,
  "message": "Schedule fetched",
  "data": {
    "range": { "from": "2026-10-22", "to": "2026-11-20", "timezone": "Asia/Kolkata" },
    "summary": {
      "working_days": 20,
      "weekly_offs": 8,
      "holidays": 1,
      "leave_days": 1,
      "unassigned_days": 0,
      "items_due": 4,
      "next_day_off": "2026-10-25",
      "next_holiday": { "date": "2026-11-01", "name": "Diwali" }
    },
    "lanes": {
      "shift": "ok", "holidays": "ok", "leave": "ok",
      "tasks": "ok", "documents": "ok", "comp_offs": "ok", "shift_changes": "ok"
    },
    "days": [
      {
        "date": "2026-10-22",
        "day_kind": "working",
        "shift": {
          "id": "…", "name": "General Day Shift",
          "start_time": "09:30:00", "end_time": "18:30:00",
          "is_overnight": false, "timezone": "Asia/Kolkata",
          "source": "assignment"
        },
        "holiday": null,
        "leave": null,
        "items": [
          {
            "kind": "task_due",
            "id": "…", "title": "Submit Q3 expense report",
            "status": "in_progress", "priority": "high",
            "is_overdue": false,
            "due_at": "2026-10-22T18:00:00+05:30"
          }
        ],
        "status_source": "derived",
        "status_reason": "upcoming"
      }
    ]
  }
}
```

**`days` is dense and ascending** — one entry per calendar date, weekly offs and holidays included. Every key is present on every day; an empty lane is `[]` or `null`, never a missing key.

### `day_kind`

One of `working` · `weekly_off` · `holiday` · `leave` · `half_day_leave` · `unassigned`. Resolved by the same code the roster, the HR planes and the auto-absent cron use — not a reimplementation — so this page cannot contradict the payslip. Precedence, highest first:

1. **An attendance record** for that date (action beats schedule; a backdated correction shows here)
2. **Before the joining date** → `unassigned`, `status_reason: "before_joining"`
3. **A non-working calendar exception**
4. **Holiday** (audience-targeted: department / location / employment type / job status / explicit include-exclude lists)
5. **Weekly off** (top-priority-tier union of the applicable rules)
6. **Approved leave** → `leave` or `half_day_leave`
7. **Working**, or `unassigned` when no shift resolves

**Leave sits below holiday and weekly off, deliberately.** A weekend inside an approved leave span comes back as `weekly_off`, not `leave`, because the leave calculator only charges working days — that day was never deducted from the balance. If you render it as leave, your page claims a day off that payroll never charged.

`half_day_leave` **keeps `shift` populated** — the person works half the day — and contributes 0.5 to both `working_days` and `leave_days`.

### `status_source` / `status_reason`

Same vocabulary as every other attendance read. `status_source` is `record` or `derived`; `status_reason` carries `record`, `upcoming`, `before_joining`, `exception_non_working`, and so on. Use it when you need to explain a day rather than just colour it.

### Item kinds

| `kind` | Timestamp field | Extra fields |
|---|---|---|
| `task_due` | `due_at` (ISO + offset) | `title`, `status`, `priority`, `is_overdue` |
| `document_request_due` | `due_date` | `document_type_name`, `status` |
| `document_expiry` | `due_date` | `document_type_name`, `document_name` |
| `comp_off_expiry` | `due_date` | `days`, `earned_on` |
| `shift_change` | `due_date` | `shift_name`, `is_rotation`, `effective_from` |

You asked us not to invent a midnight timestamp for a date-only concept. We didn't: **only `task_due` carries `due_at`**, because `tasks.due_date` is a real timestamp. The other four are calendar dates in the database and carry `due_date` only — `due_at` is absent, not null.

Two notes on derived values:

- `comp_off_expiry.days` is always `1`. One `attendance_comp_offs` row *is* one whole credit — there is no fractional column, and the balance summary counts one per row. It's in the payload so you don't hardcode the 1, not because it varies.
- `shift_change.shift_name` for a rotational assignment is the **pattern** name with `is_rotation: true`, not a shift name. Naming one arbitrary leg of a cycle would read as a permanent reassignment.

Items falling outside the window are dropped, never clamped onto an edge day. Within a day, timed items sort before date-only ones, and the order is stable across identical requests.

### `lanes`

You asked for a way to tell "nothing on file" from "couldn't load". Each lane reports one of:

| State | Meaning | Render |
|---|---|---|
| `ok` | Loaded. An empty result means genuinely nothing. | The real empty state |
| `unavailable` | That lane's query failed. The rest of the page is valid. | A retry affordance on that panel only |
| `truncated` | The lane hit its 500-row cap. What you have is incomplete. | A "showing first N" notice |
| `excluded` | You left it out of `include`. | Nothing |

The item lanes run under `Promise.allSettled`, so one failing dependency degrades one panel instead of blanking the page. The calendar lanes are mandatory — if those fail you get a 500, because a `day_kind` computed without them would be wrong rather than merely incomplete.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `SCHEDULE_RANGE_INVALID` | `to` earlier than `from`, or a malformed date |
| 400 | `SCHEDULE_RANGE_TOO_LARGE` | More than 92 days. **Rejected, not truncated** — a silently shortened agenda renders as "you have no deadlines". |
| 400 | `SCHEDULE_INCLUDE_INVALID` | Unknown lane name; the message names it |
| 404 | `USER_NOT_FOUND` | Membership removed mid-session |

---

## 3. `GET /api/v1/attendance/manager/schedule/team-agenda`

Roles: `manager`, `hr`, `admin`, `super-admin`.

| Param | Type | Notes |
|---|---|---|
| `from` / `to` | `YYYY-MM-DD` | Same defaults and same 92-day cap |
| `subordinate_id` | UUID | Optional. Narrows to one direct report. |

```json
{
  "range": { "from": "2026-10-22", "to": "2026-11-20", "timezone": "Asia/Kolkata" },
  "team_size": 6,
  "max_team_size": 200,
  "lanes": { "tasks": "ok" },
  "days": [
    {
      "date": "2026-10-23",
      "working_count": 4,
      "away_count": 2,
      "unassigned_count": 0,
      "items_due_count": 3,
      "away": [
        { "user_id": "…", "user_name": "Priya S", "kind": "leave", "leave_type_name": "Casual Leave", "portion": "full" },
        { "user_id": "…", "user_name": "Rahul M", "kind": "weekly_off" }
      ]
    }
  ]
}
```

All four counts are computed server-side over the whole team, not derived from `away[]` — you asked for that explicitly, and a count derived from a capped list under-reports in the quiet direction. `away[]` carries `user_id` **and** `user_name` so a row never renders as "Unknown user" when your directory has dropped someone.

A **half-day leave counts in both** `working_count` and `away_count`. Half the day is covered and half is an absence; forcing it into one bucket would misstate coverage either way.

The coverage view returns `items_due_count` but **not** the item detail — you didn't ask for the team's task list, and loading it would multiply the query cost across the team for a number nobody reads.

### Scoping — read this

**Scope is the caller's direct reports from `user_reporting_mappings`, for every role including HR.**

This deliberately bypasses the shared hierarchy resolver, which returns "org-wide" for `hr`/`admin`/`super-admin`. Wiring that in would have made this coverage panel an org-wide roster dump — the thing you asked against in §4.3 and Q7. An HR user opening this page sees the people who report to them, nothing more. If HR needs org-wide coverage, that's a different endpoint on the HR plane and we should design it as one.

Deactivated reports drop out: `user_roles.is_active` is the only tenant-level signal of membership, and someone deactivated has no future for a manager to cover.

| Status | Code | When |
|---|---|---|
| 403 | `CANNOT_ACCESS_OUTSIDE_HIERARCHY` | `subordinate_id` is not a direct report. Uniform — a non-existent id and someone else's report are indistinguishable, so the endpoint can't be used to enumerate. |
| 400 | `TEAM_TOO_LARGE` | More than 200 direct reports; the message names the cap |

A manager with no reports gets `team_size: 0` and a dense `days` array of zeroes — **200, not an error.** Having no team isn't a fault condition.

---

## 4. Changed existing endpoints

All five changes are **additive and optional**. A caller sending none of the new parameters gets byte-identical behaviour, including the existing default ordering and the existing response shape. That's covered by tests, not just intent.

### 4.1 `GET /tasks/me` and `GET /tasks/manager/team-tasks`

New: `due_from`, `due_to` (`YYYY-MM-DD`), `sort` (`created_at` | `due_date`, default `created_at`), `order` (`ASC` | `DESC`).

`sort=due_date` defaults to `ASC` — the only reason to sort by deadline is nearest-first — with `id` as a stable tiebreaker so pagination over equal timestamps can't repeat or skip a row.

**The bounds are interpreted as whole calendar days in `Asia/Kolkata`.** `tasks.due_date` is a UTC timestamp, so `due_to=2026-10-28` becomes `2026-10-28T18:29:59.999Z`. A naive date comparison would have silently dropped every task due later in the day on the upper bound — the commonest deadline there is.

The window AND-combines with `is_overdue` rather than overwriting it, so `is_overdue=false&due_from=…&due_to=…` means what it reads like.

### 4.2 `GET /attendance/holidays`

New: `from` + `to` (both required together) for a rolling window that crosses a calendar-year boundary — something `year` could not express.

**Two corrections to your §3.2.** Your code comment said `year` is ignored. It isn't; it was always honoured. But it was also **never validated**, and it was string-interpolated into `${year}-01-01`, so `?year=abc` reached Postgres as an invalid date literal and returned a **500 to any authenticated employee**. That's now a 400. `year` is bounded to 2000–2100, as the old docs always claimed it was.

A lone `from` or `to` is a 400: it would read as an open-ended scan across every year on file.

### 4.3 `GET /leaves/my-requests`

New: `status`, `from`, `to` (together), and optional `limit` / `offset`.

`from`/`to` are **overlap** bounds, not containment: any request whose `[start_date, end_date]` intersects the window matches. Containment would have hidden a leave that started last week and is still running — exactly the row a forward view needs.

`limit`/`offset` are *not* defaulted. Defaulting them would silently truncate existing callers that today receive their whole history. The response stays a bare array, unchanged.

### 4.4 `GET /documents/me/documents`

New: `expiring_before` (`YYYY-MM-DD`).

**Correction to your §3.4.** The service, the repository and the row projection already honoured this and already returned `expires_on` — only the controller's strict allow-list rejected the parameter. So the capability existed for the HR plane but an employee had no way to ask the same question about themselves. One line.

Unknown parameters on this endpoint are still rejected, on purpose: a silently ignored filter reads to you as "nothing expires soon".

---

## 5. Your eight open questions

**Q1 — One composed endpoint, or filters?**
Both, and build on the composed one. Filters exist for single-lane widgets.

**Q2 — Is `day_kind` safe to compute server-side given policy complexity?**
Yes, and it's the reason to use this endpoint. It runs the same resolver as the roster, the HR planes and the auto-absent cron. Rotation arithmetic, holiday audience targeting and day precedence all stay server-side, as you asked.

**Q3 — How far forward can you query?**
92 days, hard. Beyond that is `SCHEDULE_RANGE_TOO_LARGE`. A 92-day window costs one query per lane — the same as a 7-day window.

**Q4 — Will approved-leave days overlap weekly offs and holidays?**
Yes, and the agenda resolves it for you: the holiday or weekly off wins. See §2. You will see fewer `leave` days in `days[]` than `total_days` on the leave request, and that difference is correct.

**Q5 — Does future shift resolution exist?**
Yes — your §3.6 was wrong about this. It already resolved any date, rotations included. What it couldn't do was a *range* without one query per day, so a 92-day agenda would have been 92 queries (×N for a team). There is now a batch path that loads the overlapping assignments once and resolves in memory, sharing the same rotation function, so the two cannot drift. A test asserts they agree on every day of a rotation.

**Q6 — `due_at` or `due_date`?**
Both, per kind. Only `task_due` has a real time of day. See the table in §2.

**Q7 — Should the team view accept `subordinate_id`?**
Yes, and it's hierarchy-checked for every role. See §3 — note the HR scoping decision.

**Q8 — Caching / invalidation?**
No server-side cache, so no invalidation problem — everything is read live from the owning tables on every request. We do not send cache headers on these endpoints (they inherit whatever the app default is), so **don't cache the response client-side**: an approval landing while the page is open should show on refresh. If latency ever makes caching worthwhile we'll add it server-side with explicit invalidation on the write paths, and we'll tell you before we do.

---

## 6. Caps and limits

| Thing | Cap | On breach |
|---|---|---|
| Date range | 92 days | 400 `SCHEDULE_RANGE_TOO_LARGE` |
| Direct reports on the team view | 200 | 400 `TEAM_TOO_LARGE` |
| Rows per item lane | 500 | Lane marked `truncated` |
| Document requests lane | 100 | Lane marked `truncated` |
| `limit` on `/leaves/my-requests` | 200 | 400 |

Nothing silently truncates without saying so. Where truncation is possible at all, the lane tells you.

### Expected latency

Self agenda: 6 calendar queries (always) + up to 4 item queries, all bounded and indexed, independent of window size. Team agenda: the same shape over `IN (…)` with one extra mapping lookup. Expect low tens of milliseconds of database time; the dominant cost is the round trip, not the window. There is no per-day and no per-member query anywhere — a test asserts exactly one query per lane for a 92-day window.

---

## 7. What we did not build

**`probation_end`** — you listed it first among the kinds you could live without, and it isn't buildable: there is no probation-end or confirmation date column anywhere. `job_status` has a `probation` value but no date to attach to it, and `joining_date` + a hardcoded assumption would be a fabrication. If you want this, it needs a column and a decision about who sets it — tell us and we'll scope it.

**Org-wide coverage for HR** — out of scope here, deliberately, for the reason in §3.

---

## 8. One pre-existing bug, reported not fixed

`GET /attendance/daily-log` reads the employee profile from the wrong nesting level, so `joining_date` is always `null` on that path. Harmless on that endpoint today, but it's the same bug class as the holiday-targeting one fixed on 4 Oct. It's outside this change's blast radius and fixing it would alter an endpoint you didn't ask us to touch, so it's filed rather than patched. Say the word.

---

## 9. Verification

- **69 new unit tests**, all green: 50 on the agenda endpoints (precedence truth table, rotation parity, dense enumeration, lane degradation, BOLA, HR scoping, coverage folding, query-count) and 19 on the filter changes.
- Full suite: **3676 / 3678 pass**. Both remaining failures are in the task notification cron suite (`T-P5-17` and the intermittent `T-P5-12`); `T-P5-17` reproduces on a clean checkout with these changes reverted, so both are pre-existing and unrelated.
- No migration. No new dependency. No settings-catalog change (these are query parameters, not org-configurable keys).

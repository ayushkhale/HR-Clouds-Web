# Frontend Integration Guide: My Schedule — Forward View

**Date:** 2026-10-22
**Target Audience:** Frontend Web & Mobile Engineers, UI/UX Designers
**Backend Module:** `src/modules/attendance`
**Primary Endpoints:** `GET /api/v1/attendance/schedule/agenda` · `GET /api/v1/attendance/manager/schedule/team-agenda`
**Responds to:** `2026-10-21_my_schedule_forward_view_data_requirements.md`
**Companion documents:** `2026-10-22_my_schedule_forward_view_api_delivery.md` (change record) · `public/md_system/ATTENDANCE_API_CONTRACT.md` §12 (authoritative contract)

---

## 1. Problem Statement & Background

### The operational gap

"My Schedule" today answers *"what are the rules?"* — here is your shift, here are the weekly-off rules, here is the holiday list. What an employee actually asks is *"what do my next few weeks look like, and what do I owe, and when?"*

Answering that in the browser means merging six independent sources per day:

| Source | What it contributes |
|---|---|
| Shift assignment (fixed **or rotating**) | Which shift applies on a given future date |
| Weekly-off rules | Which weekdays are off — and rules are **tiered by priority**, not a flat list |
| Holiday calendar | Holidays, each **targeted at an audience** (department / location / employment type / job status / explicit include & exclude lists) |
| Calendar exceptions | One-off working days and one-off non-working days, themselves targeted |
| Approved leave | Full-day and half-day leave spans |
| Tasks, document requests, document expiries, comp-off expiries, shift changes | Everything falling due |

### Why this is a backend problem

You asked not to own three of these in the browser — rotation arithmetic, holiday audience targeting, and day precedence — because **all three affect pay**. A second implementation in JavaScript would drift from the server's until this page contradicted the payslip.

We agree, and that is the whole design of this endpoint. `day_kind` is resolved by the *same code unit* the roster, the HR planes and the auto-absent cron use (`resolveDayForMember`) — not a copy of its rules, the function itself. If payroll's view of a day ever changes, this page changes with it in the same commit.

### What you get

One request returns a **dense, one-entry-per-calendar-day** agenda with a single resolved `day_kind` per day, a server-computed summary, and per-day items falling due. A manager equivalent returns per-day coverage counts over direct reports.

You render. You do not resolve.

---

## 2. How It Was Implemented (Backend Architecture)

Useful to know because it explains the caps and the `lanes` field.

```
GET /attendance/schedule/agenda
  │
  ├─ schedule_agenda.validator.js   Joi on from / to / include
  ├─ schedule_agenda.controller.js  validates query, calls service
  │
  └─ schedule_agenda.service.js
       │
       ├─ _loadCalendarLanes()   ONE Promise.all of 6 bounded queries — MANDATORY
       │     attendance records · holidays · weekly-off rules · calendar
       │     exceptions · shift assignments overlapping the range · approved leave
       │
       ├─ _loadItemLanes()       Promise.allSettled of up to 4 queries — OPTIONAL
       │     tasks · document expiries · document requests · comp-off expiries
       │
       └─ schedule_agenda.utils.js  (pure, synchronous, no I/O)
             buildMemberDays()  folds the loaded lanes into one answer per day,
                                delegating day_kind to resolveDayForMember
```

Three consequences that matter to you:

1. **Cost is independent of window size.** A 92-day window issues exactly the same number of queries as a 7-day window — one per lane. There is no per-day and no per-member query anywhere. A unit test asserts this.
2. **Mandatory vs optional lanes.** If a calendar lane fails you get a `500`, because a `day_kind` computed without holidays would be *wrong*, not merely incomplete. If an item lane fails, that lane is marked `unavailable` and the rest of the page is still valid.
3. **Rotation resolution is shared.** The batch resolver used here and the per-date resolver used elsewhere call the same rotation function, so they cannot disagree. A test asserts they agree on every day of a rotation cycle.

---

## 3. API Specification — `GET /api/v1/attendance/schedule/agenda`

### 3.1 Access

| | |
|---|---|
| **Auth** | `Authorization: Bearer <JWT>` — required |
| **Roles** | All org roles: `employee`, `manager`, `hr`, `admin`, `super-admin` |
| **Feature flag** | `attendance.access`. If the plan excludes it: `403 FEATURE_NOT_AVAILABLE` — render "Attendance isn't enabled", not a session-expiry flow. |
| **Subject** | **Always the authenticated user.** There is no `user_id` parameter. Don't look for one; it was omitted on purpose so there is no object reference to tamper with. |

### 3.2 Query parameters

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `from` | `YYYY-MM-DD` | No | Today, in `Asia/Kolkata` | Any other format → `400 VALIDATION_ERROR` |
| `to` | `YYYY-MM-DD` | No | `from` + 29 days | **Inclusive** |
| `include` | CSV string, ≤ 200 chars | No | All lanes | `tasks`, `documents`, `comp_offs`, `shift_changes`. Inner whitespace is tolerated (`tasks , documents` is fine). An unknown name is a `400`, never ignored. |

Unknown query parameters are **silently stripped**, not rejected. Don't rely on the server to catch a typo'd parameter name — it won't.

`include` exists to trim payload and query cost when you only need part of the page. The three calendar lanes (`shift`, `holidays`, `leave`) **cannot** be switched off: they cost nothing extra (same batched load) and dropping `shift` would turn every working day into `unassigned`. You may name them; they report `ok` either way.

### 3.3 Response — `200 OK`

```json
{
  "success": true,
  "message": "Schedule fetched",
  "data": {
    "range": {
      "from": "2026-10-22",
      "to": "2026-11-20",
      "timezone": "Asia/Kolkata"
    },
    "summary": {
      "working_days": 20.5,
      "weekly_offs": 8,
      "holidays": 1,
      "leave_days": 1.5,
      "unassigned_days": 0,
      "items_due": 4,
      "next_day_off": "2026-10-25",
      "next_holiday": { "date": "2026-11-01", "name": "Diwali" }
    },
    "lanes": {
      "shift": "ok",
      "holidays": "ok",
      "leave": "ok",
      "tasks": "ok",
      "documents": "unavailable",
      "comp_offs": "ok",
      "shift_changes": "ok"
    },
    "days": [
      {
        "date": "2026-10-22",
        "day_kind": "working",
        "shift": {
          "id": "9f1c…",
          "name": "General Day Shift",
          "start_time": "09:30:00",
          "end_time": "18:30:00",
          "is_overnight": false,
          "timezone": "Asia/Kolkata",
          "source": "assignment"
        },
        "holiday": null,
        "leave": null,
        "items": [
          {
            "kind": "task_due",
            "id": "7a2e…",
            "title": "Submit Q3 expense report",
            "status": "in_progress",
            "priority": "high",
            "is_overdue": false,
            "due_at": "2026-10-22T18:00:00+05:30"
          }
        ],
        "status_source": "derived",
        "status_reason": "pending_clock_in"
      },
      {
        "date": "2026-10-25",
        "day_kind": "weekly_off",
        "shift": null,
        "holiday": null,
        "leave": null,
        "items": [],
        "status_source": "derived",
        "status_reason": "weekly_off"
      },
      {
        "date": "2026-11-01",
        "day_kind": "holiday",
        "shift": null,
        "holiday": { "id": "b3d1…", "name": "Diwali", "type": "public", "is_optional": false },
        "leave": null,
        "items": [],
        "status_source": "derived",
        "status_reason": "holiday"
      },
      {
        "date": "2026-11-03",
        "day_kind": "half_day_leave",
        "shift": {
          "id": "9f1c…", "name": "General Day Shift",
          "start_time": "09:30:00", "end_time": "18:30:00",
          "is_overnight": false, "timezone": "Asia/Kolkata", "source": "assignment"
        },
        "holiday": null,
        "leave": {
          "id": "ab12…",
          "leave_type_name": "Sick Leave",
          "portion": "first_half",
          "status": "approved",
          "request_start_date": "2026-11-03",
          "request_end_date": "2026-11-03",
          "request_total_days": 0.5
        },
        "items": [],
        "status_source": "derived",
        "status_reason": "upcoming"
      }
    ]
  }
}
```

### 3.4 `range`

| Field | Notes |
|---|---|
| `from` / `to` | The window actually served, after defaults. **Read these back** rather than echoing what you sent — if you omitted a bound, this is the only place the resolved value appears. |
| `timezone` | **The IANA zone every date in this response is expressed in.** Taken from the shift template in force at `from`, falling back to `Asia/Kolkata`. Format every date you display against *this*, never against the browser's zone. An employee on a Dubai shift gets `Asia/Dubai`. |

### 3.5 `days[]` — the core contract

**Dense and ascending.** One entry per calendar date from `from` to `to`, inclusive, with no gaps — weekly offs and holidays included. `days.length` always equals the span in days. You never fill gaps.

**Every key is present on every day.** An empty lane is `[]` or `null`, never a missing key. `if (!day.shift)` is safe; `if (day.shift === undefined)` will never be true.

| Field | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | In `range.timezone` |
| `day_kind` | enum | `working` · `weekly_off` · `holiday` · `leave` · `half_day_leave` · `unassigned`. Exactly one. See §4. |
| `shift` | object \| `null` | Non-null on `working` **and on `half_day_leave`**. `null` on every other kind. |
| `holiday` | object \| `null` | Non-null only on `holiday` — and **not always even then**, see §4.3 |
| `leave` | object \| `null` | Non-null on `leave` and `half_day_leave` |
| `items[]` | array | Things falling due on this date. See §5. |
| `status_source` | `record` \| `derived` | `record` = an attendance row exists for this date (a past day, or a backdated correction). `derived` = computed from the schedule. |
| `status_reason` | string | Machine-readable provenance — see the table below. Use it when you need to *explain* a day rather than colour it. |

#### `status_reason` values you will actually see

Because the default window **starts today**, a forward agenda normally contains all three time-relative reasons at once. Don't assume a single value for working days.

| Value | Appears on | Meaning |
|---|---|---|
| `upcoming` | A **future** working day | Nothing has happened yet, and nothing is expected to have |
| `pending_clock_in` | **Today's** working day, no punch yet | The employee is expected in but hasn't clocked in. Good hook for a "Clock in" CTA on the first row. |
| `awaiting_absent_cron` | A **past** working day with no record | No attendance row yet; the auto-absent job hasn't finalised it. **Provisional — don't render it as "Absent".** |
| `weekly_off` | `weekly_off` days | |
| `holiday` | `holiday` days backed by a holiday row | |
| `exception_non_working` | `holiday` days from a calendar exception | No holiday row exists — see §4.3 |
| `before_joining` | `unassigned` days before the joining date | |
| `record` | Any day where `status_source === 'record'` | An attendance row exists; it decided the day |

#### `shift` object

| Field | Notes |
|---|---|
| `start_time` / `end_time` | `HH:mm:ss` wall-clock in `timezone` |
| `is_overnight` | `true` when the shift crosses midnight |
| `timezone` | The shift's own zone |
| `source` | `assignment` (fixed shift) · `rotation` (resolved from a rotating pattern) · `default` |

**Overnight convention:** a shift that crosses midnight belongs to the calendar date it **starts** on, and appears on exactly that one day with `is_overnight: true`. It is *not* split across two days. This matches the nominal date the attendance record uses, so the agenda and the attendance history agree. Render it as `21:00 → 06:00 (+1)`.

**Use `source` in the UI.** `rotation` means "this is what the rotation lands on for that date", not a permanent assignment. Saying "Rotating shift" instead of implying a fixed one prevents a predictable support ticket.

#### `leave` object

| Field | Notes |
|---|---|
| `leave_type_name` | e.g. `"Casual Leave"`. **Nullable** — see the note below. |
| `portion` | `full` · `first_half` · `second_half`. Machine-readable; you prettify. |
| `status` | Always `approved` — pending leave is not in this view. |
| `request_start_date` / `request_end_date` | The whole span, so you can render "day 2 of 5" without a second call |
| `request_total_days` | Number, may be fractional (`0.5`) |

`leave_type_name` is `null` in one real case: an `on_leave` attendance row whose leave request isn't readable (a span starting outside the loaded window, or a since-deleted request). Render "On leave" rather than "On leave —" or crashing on `.toUpperCase()`.

#### `holiday` object

| Field | Notes |
|---|---|
| `type` | `public` · `optional` · `restricted` |
| `is_optional` | **Derived** from `type === 'optional'`. Convenience only; `type` is the source of truth. |

---

## 4. The precedence rules — read this before you write a reducer

This is the section that will save you a bug. `day_kind` is resolved by this precedence, **highest wins**:

```
1. An attendance record exists for the date   → that record's status
2. The date is before the joining date        → unassigned  (status_reason: "before_joining")
3. A non-working calendar exception applies    → holiday     (status_reason: "exception_non_working")
4. An applicable holiday falls on the date     → holiday
5. An applicable weekly-off rule covers it     → weekly_off
6. An approved leave request covers it         → leave / half_day_leave
7. A shift resolves                            → working
8. Otherwise                                    → unassigned
```

### 4.1 ⚠️ Leave ranks **below** holiday and weekly off — this is correct

A Sunday inside an approved 5-day leave span comes back as **`weekly_off`**, not `leave`.

**Why:** the leave calculator only charges working days. That Sunday was never deducted from the employee's balance. If you render it as leave, your page claims a day off that payroll never charged — and the employee counts 5 leave days on screen against 3 deducted from their balance.

**Consequence you must handle:** `days[]` will show **fewer** `leave` days than the leave request's `request_total_days`. That is not a bug and you must not "correct" it. If you want to show the span, use `request_start_date` / `request_end_date` to draw a bracket *over* the days, and let each day keep its own `day_kind`.

```
Approved leave: Fri 6 Nov → Tue 10 Nov, total_days = 3

 Fri 6   leave        ← charged
 Sat 7   weekly_off   ← NOT charged, NOT "leave"
 Sun 8   weekly_off   ← NOT charged
 Mon 9   leave        ← charged
 Tue 10  leave        ← charged
```

### 4.2 `half_day_leave` keeps its shift

`half_day_leave` is the only kind where both `shift` **and** `leave` are non-null — the person works half the day. It contributes **0.5** to both `summary.working_days` and `summary.leave_days`, so both of those can be fractional. Type them as `number`, not `int`.

Render both facts: the shift, and a "½ day — first half" badge driven by `leave.portion`.

### 4.3 A `holiday` day can have `holiday: null`

When the day is non-working because of a **calendar exception** rather than a holiday row, there is no holiday to name. `day_kind` is `holiday`, `holiday` is `null`, and `status_reason` is `exception_non_working`.

We deliberately did not invent a name. Render "Non-working day" from the `status_reason`, and **never** do `day.holiday.name` without a guard.

### 4.4 `unassigned` is a normal state, not an error

It means no shift resolves for that date — commonly a new joiner before their assignment starts, or a gap between assignments. It is valid data. Render it as "No shift assigned" in a neutral tone. Do **not** show an error state, and do **not** count it as a working day.

`status_reason: "before_joining"` distinguishes "not an employee yet" from "no shift configured", and those deserve different copy.

---

## 5. `items[]` — what I owe and when

Five kinds. **Switch on `kind`; never infer from which fields are present.**

| `kind` | Date field | Additional fields |
|---|---|---|
| `task_due` | `due_at` | `id`, `title`, `status`, `priority`, `is_overdue` |
| `document_request_due` | `due_date` | `id`, `document_type_name`, `status` |
| `document_expiry` | `due_date` | `id`, `document_type_name`, `document_name` |
| `comp_off_expiry` | `due_date` | `id`, `days`, `earned_on` |
| `shift_change` | `due_date` | `id`, `shift_name`, `is_rotation`, `effective_from` |

### 5.1 `due_at` vs `due_date` — you asked for this distinction and you got it

You wrote: *"Please don't invent a midnight timestamp for a date-only concept."*

**Only `task_due` carries `due_at`**, because only `tasks.due_date` is a real timestamp in the database. It is a full ISO-8601 string **with offset** (`2026-10-22T18:00:00+05:30`), already converted to the response timezone — parse it, don't re-offset it.

The other four kinds carry **`due_date`** (`YYYY-MM-DD`) and **no `due_at` key at all** — the key is *absent*, not `null`. Render them as dates with no time component.

```ts
// Correct
const label = item.kind === 'task_due'
  ? formatDateTime(item.due_at, tz)
  : formatDate(item.due_date, tz)

// Wrong — prints "12:00 AM" on four of five kinds
const label = formatDateTime(item.due_at ?? `${item.due_date}T00:00:00`, tz)
```

### 5.2 Per-kind notes

- **`task_due`** — `is_overdue` is computed server-side against request time. Completed and cancelled tasks are excluded; everything in this lane is live.
- **`comp_off_expiry.days`** — always `1`. One comp-off row *is* one whole credit; there is no fractional-credit column. It's in the payload so you don't hardcode the `1`, not because it varies.
- **`shift_change.shift_name`** — for a **rotational** assignment this is the **pattern** name with `is_rotation: true`, not a shift name. Naming one arbitrary leg of a cycle would read as a permanent reassignment. Render "Moves to rotation: Day/Night 4-day" when `is_rotation`, else "Moves to shift: Night Shift".
- **`shift_change`** only appears when the assignment's `effective_from` falls **inside** the window. The assignment already in force at `from` is the baseline, not a change.

### 5.3 Ordering

Within a day, timed items sort before date-only ones, and the order is stable across identical requests. You can render `items` in array order. Items falling outside the window are dropped, never clamped onto an edge day.

---

## 6. `lanes` — "nothing on file" vs "couldn't load"

You asked for a way to tell these apart without a second request. Each lane reports exactly one state:

| State | Meaning | Render |
|---|---|---|
| `ok` | Loaded successfully. An empty result means **genuinely nothing**. | The real empty state: "No deadlines in this period" |
| `unavailable` | That lane's query **failed**. The rest of the page is valid. | An inline "Couldn't load deadlines — Retry" on that panel **only** |
| `truncated` | The lane hit its row cap. What you have is **incomplete**. | "Showing the first 500 — narrow the date range" |
| `excluded` | You left it out of `include`. | Nothing. This is your own doing. |

**This is the single most important field for not lying to the user.** A `documents: "unavailable"` lane with an empty `items` array must *never* render as "nothing expires soon" — that's a user who misses a document renewal because of a transient database blip.

The item lanes run under `Promise.allSettled`, so one failing dependency degrades one panel instead of blanking the page. Degrade per-panel, not per-page.

```tsx
function DeadlinePanel({ lane, items }: { lane: LaneState; items: AgendaItem[] }) {
  if (lane === 'excluded')    return null
  if (lane === 'unavailable') return <InlineError onRetry={refetch}>Couldn't load deadlines.</InlineError>
  return (
    <>
      {lane === 'truncated' && <Notice>Showing the first 500. Narrow the date range to see everything.</Notice>}
      {items.length === 0 ? <Empty>No deadlines in this period.</Empty> : items.map(renderItem)}
    </>
  )
}
```

---

## 7. API Specification — `GET /api/v1/attendance/manager/schedule/team-agenda`

### 7.1 Access

| | |
|---|---|
| **Roles** | `manager`, `hr`, `admin`, `super-admin` |
| **Feature flag** | `attendance.access` |
| **Scope** | The caller's **direct reports**, from the reporting mappings — **for every role, HR included** |

> ### ⚠️ HR does **not** get org-wide coverage here
>
> An HR user opening this page sees the people who report to *them*, nothing more — not the whole tenant. This is deliberate: the shared hierarchy resolver treats HR as org-wide, and using it here would have turned a coverage panel into an org-wide roster dump.
>
> **Do not build an HR-wide coverage screen on this endpoint.** It will look empty or near-empty for an HR user with no direct reports, and that is correct behaviour. If you need org-wide coverage for HR, ask for it — it's a separate HR-plane endpoint and we should design it as one.

Deactivated reports drop out of this view: someone deactivated has no future for a manager to cover.

### 7.2 Query parameters

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `from` | `YYYY-MM-DD` | No | Today | |
| `to` | `YYYY-MM-DD` | No | `from` + 29 days | Same 92-day cap |
| `subordinate_id` | UUID | No | — | Narrows to one direct report. Outside the reporting line → `403`. |

There is no `include` on this endpoint.

### 7.3 Response — `200 OK`

```json
{
  "success": true,
  "message": "Team schedule fetched",
  "data": {
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
          {
            "user_id": "4c8a…",
            "user_name": "Priya S",
            "kind": "leave",
            "leave_type_name": "Casual Leave",
            "portion": "full"
          },
          { "user_id": "7b11…", "user_name": "Rahul M", "kind": "weekly_off" }
        ]
      }
    ]
  }
}
```

| Field | Notes |
|---|---|
| `team_size` | Direct reports actually resolved — your denominator |
| `max_team_size` | The cap (200). Shown so you can word a limit message without hardcoding it. |
| `working_count` / `away_count` / `unassigned_count` / `items_due_count` | **Computed server-side over the whole team**, never derived from `away[]` |
| `away[]` | Who is away. `kind` ∈ `leave` · `holiday` · `weekly_off`. `leave_type_name` + `portion` present on `leave`; `holiday_name` present on `holiday`. |

### 7.4 Three behaviours to design for

1. **A half-day leave counts in BOTH `working_count` and `away_count`.** Half the day is covered and half is an absence. So `working_count + away_count` can exceed `team_size` — do not assert that it sums. Use `team_size` as the denominator and expect overlap.
2. **`items_due_count` has no detail.** You get the number, not the team's task list — you didn't ask for it and loading it would multiply query cost across the team. Render it as a badge; link to `/tasks/manager/team-tasks?due_from=…&due_to=…` for the detail.
3. **A manager with no reports gets `200`, `team_size: 0`, and a dense array of zeroes.** Not a `403`, not a `404`, not an empty `days`. Render "You have no direct reports" — having no team is not a fault condition.

---

## 8. Error handling

All errors use the standard envelope. **Note the field is `errorCode`, not `code`.**

```json
{ "success": false, "message": "Range must not exceed 92 days (requested 150)", "errorCode": "SCHEDULE_RANGE_TOO_LARGE" }
```

| Status | `errorCode` | When | How to handle |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed `from`/`to`, `include` over 200 chars, non-UUID `subordinate_id` | Programming error. `message` is human-readable. |
| 400 | `SCHEDULE_RANGE_INVALID` | `to` earlier than `from` | Clamp your date picker so this is unreachable |
| 400 | `SCHEDULE_RANGE_TOO_LARGE` | Window exceeds **92 days** | See below |
| 400 | `SCHEDULE_INCLUDE_INVALID` | Unknown lane name; the message names it | Programming error |
| 400 | `TEAM_TOO_LARGE` | More than **200** direct reports | Prompt for `subordinate_id`, or page the team yourself |
| 403 | `CANNOT_ACCESS_OUTSIDE_HIERARCHY` | `subordinate_id` is not a direct report | Generic "You don't have access". **Uniform by design** — a non-existent id and someone else's report are indistinguishable, so this cannot be used to enumerate users. Don't try to tell them apart. |
| 403 | `FEATURE_NOT_AVAILABLE` | Plan excludes `attendance.access` | "Attendance isn't enabled on your plan" — **not** a session-expiry flow |
| 404 | `USER_NOT_FOUND` | Membership removed mid-session | Force a re-auth / org switch |

### 8.1 The 92-day cap is a refusal, not a truncation

You wrote that silent truncation is "a dangerous lie". We agreed: an oversized range is **rejected with a named code** rather than quietly shortened, because a shortened agenda renders as "you have no deadlines".

**Clamp your date picker to 92 days** so a user cannot reach this error. Treat `SCHEDULE_RANGE_TOO_LARGE` as a bug in your own code, not a user-facing message to display.

---

## 9. Supporting endpoints — when *not* to use the agenda

The agenda composes the page. These single-lane filters shipped in the same change for widgets that need one thing. All are **additive and optional** — existing calls are unaffected.

| Endpoint | New params | Use it when |
|---|---|---|
| `GET /tasks/me` | `due_from`, `due_to` (`YYYY-MM-DD`), `sort=due_date`, `order` | A standalone "my next deadlines" widget, or the full task list with filters |
| `GET /tasks/manager/team-tasks` | same three | Drilling into the team's `items_due_count` |
| `GET /attendance/holidays` | `from` + `to` (both required together) | A holiday-calendar screen that isn't day-by-day |
| `GET /leaves/my-requests` | `status`, `from` + `to`, `limit`, `offset` | A leave-history screen |
| `GET /documents/me/documents` | `expiring_before` | A "documents expiring soon" card |

Two gotchas worth knowing:

- **Task due bounds are interpreted as whole calendar days in `Asia/Kolkata`.** `tasks.due_date` is a UTC timestamp, so `due_to=2026-10-28` covers up to `2026-10-28T23:59:59.999` IST. A task due at 6pm on the upper-bound day **is** included. `sort=due_date` defaults to `ASC` (nearest first) with a stable tiebreaker, so pagination can't repeat or skip a row.
- **`/leaves/my-requests` `from`/`to` are OVERLAP bounds, not containment.** Any request whose span intersects the window matches — so a leave that started last week and is still running appears. Both bounds are required together; a lone bound is a `400`. `limit`/`offset` are not defaulted, so omitting them still returns the whole history as a bare array (unchanged).

**Rule of thumb:** one agenda request beats five parallel requests. Use the agenda for the schedule page; use these for cards elsewhere in the app.

---

## 10. Recommended Frontend Implementation Patterns

### Pattern A — The schedule page: one request per visible window

Fetch the agenda keyed on the visible window. Don't fetch per-day and don't fetch per-lane.

```
┌────────────────────────────────────────────────────────┐
│  My Schedule          [ Month ▾ ]  ‹ Nov 2026 ›        │
├────────────────────────────────────────────────────────┤
│  20 working · 8 offs · 1 holiday · 1.5 leave           │  ← summary, server-computed
│  Next day off: Sat 25 Oct    Next holiday: Diwali      │
├────────────────────────────────────────────────────────┤
│  Thu 22  │ 09:30–18:30  General Day Shift   │ ● 1 due  │
│  Fri 23  │ 09:30–18:30  General Day Shift   │          │
│  Sat 25  │ Weekly off                       │          │
│  Sun 26  │ Weekly off                       │          │
│  Sun 01  │ Diwali · Holiday                 │          │
│  Tue 03  │ 09:30–18:30 · ½ day Sick Leave   │          │
└────────────────────────────────────────────────────────┘
```

For a month grid, request the **whole visible grid** including the leading/trailing days of adjacent months — it's one request either way, and the dense `days[]` maps straight onto grid cells by `date`.

Pre-fetch the next window on hover of the "›" control. It's cheap and makes month paging feel instant.

### Pattern B — Render from `day_kind`, with one lookup table

Resist a chain of `if`s over `shift`/`holiday`/`leave`. Keep one table from `day_kind` to presentation, so a new kind is a one-line change and precedence stays entirely server-side.

```ts
const DAY_PRESENTATION: Record<DayKind, { tone: Tone; label: (d: AgendaDay) => string }> = {
  working:        { tone: 'neutral',  label: d => `${hhmm(d.shift!.start_time)}–${hhmm(d.shift!.end_time)}` },
  weekly_off:     { tone: 'muted',    label: () => 'Weekly off' },
  holiday:        { tone: 'accent',   label: d => d.holiday?.name ?? 'Non-working day' },
  leave:          { tone: 'info',     label: d => d.leave?.leave_type_name ?? 'On leave' },
  half_day_leave: { tone: 'info',     label: d => `½ day · ${d.leave?.leave_type_name ?? 'leave'}` },
  unassigned:     { tone: 'muted',    label: d =>
                      d.status_reason === 'before_joining' ? 'Before joining' : 'No shift assigned' },
}
```

Note the `??` fallbacks on `holiday` and `leave` — both are the real nullable cases from §4.3 and §3.5.

### Pattern C — Manager coverage: a strip, not a table

`team-agenda` is built for a horizontal coverage strip above the team list.

```
Coverage · next 14 days                        6 reports
Mon ████████ 6/6   Tue ████████ 6/6   Wed ██████░░ 4/6 ⚠
Thu ████░░░░ 3/6 ⚠  Fri ████████ 6/6   Sat ░░░░░░░░ off
```

Drive the bar from `working_count / team_size`, flag days under your coverage threshold, and expand to `away[]` on click. Remember `working_count + away_count` can exceed `team_size` on half-day leave — use `team_size` as the denominator, never the sum.

### Pattern D — Caching and invalidation

There is **no server-side cache**; every request reads live from the owning tables. We send no cache headers, so:

- **Don't cache the response client-side beyond your query library's in-memory cache.** An approval landing while the page is open should appear on refresh.
- Key the cache on `(from, to, include)` for self, and `(from, to, subordinate_id)` for team.
- `staleTime` of 60–120s is a reasonable balance. Don't go long: approvals and task assignments land continuously.
- **Invalidate the agenda after any mutation that can change a future day:** applying or cancelling leave, a leave approval you can observe, completing a task, uploading a requested document, a shift-assignment change. One invalidation key for the whole agenda is fine — refetching is one query per lane.

```ts
const AGENDA_KEY = ['attendance', 'schedule', 'agenda'] as const

// after any of: applyLeave, cancelLeave, completeTask, uploadDocument
queryClient.invalidateQueries({ queryKey: AGENDA_KEY })
```

### Pattern E — Degrade per panel, never per page

Three failure classes, three different treatments. Don't collapse them into one error state:

| Situation | Treatment |
|---|---|
| Request failed (network, `500`) | Full-page error with retry — the calendar genuinely isn't available |
| A `lanes` entry is `unavailable` | Inline error **on that panel only**; the calendar still renders |
| A `lanes` entry is `truncated` | Render the data **plus** a "showing the first N" notice |

### Pattern F — Timezone discipline

Format every date and time against `range.timezone`, not the browser's zone. A field employee on a different shift timezone will see wrong day boundaries otherwise — and "wrong day" on a schedule page is the one bug nobody forgives.

```ts
import { formatInTimeZone } from 'date-fns-tz'

// `date` is already a calendar date in range.timezone — do NOT construct a Date from it
const dayLabel = (isoDate: string) => isoDate.split('-').reverse().join('/')

// `due_at` carries its own offset — parse and format in the response zone
const timeLabel = (dueAt: string, tz: string) => formatInTimeZone(new Date(dueAt), tz, 'h:mm a')
```

A `YYYY-MM-DD` string run through `new Date()` is parsed as **UTC midnight** and then rendered in local time, which shifts the date backwards for anyone west of UTC. Treat `date` / `due_date` as opaque strings; only `due_at` becomes a `Date`.

---

## 11. Ready-to-Use Frontend Code

### 11.1 TypeScript data contracts

```ts
// ─── Shared ────────────────────────────────────────────────────────────────────
export type LaneState = 'ok' | 'unavailable' | 'truncated' | 'excluded'

export interface Range {
  from: string      // YYYY-MM-DD
  to: string        // YYYY-MM-DD
  timezone: string  // IANA, e.g. "Asia/Kolkata"
}

export interface ApiEnvelope<T> {
  success: true
  message: string
  data: T
}

export interface ApiError {
  success: false
  message: string
  errorCode: string   // NOTE: `errorCode`, not `code`
}

// ─── Self agenda ───────────────────────────────────────────────────────────────
export type DayKind =
  | 'working' | 'weekly_off' | 'holiday' | 'leave' | 'half_day_leave' | 'unassigned'

export type ShiftSource = 'assignment' | 'rotation' | 'default'

export interface AgendaShift {
  id: string
  name: string
  start_time: string      // HH:mm:ss, wall clock in `timezone`
  end_time: string
  is_overnight: boolean   // belongs to its START date; never split across two days
  timezone: string | null
  source: ShiftSource
}

export interface AgendaHoliday {
  id: string
  name: string
  type: 'public' | 'optional' | 'restricted' | null
  is_optional: boolean    // derived from `type`
}

export type LeavePortion = 'full' | 'first_half' | 'second_half'

export interface AgendaLeave {
  id: string | null
  leave_type_name: string | null   // nullable — render "On leave"
  portion: LeavePortion
  status: 'approved'
  request_start_date: string | null
  request_end_date: string | null
  request_total_days: number | null
}

// Discriminated union on `kind`. Only `task_due` has `due_at`.
export type AgendaItem =
  | { kind: 'task_due'; id: string; title: string; status: string; priority: string
      is_overdue: boolean; due_at: string }
  | { kind: 'document_request_due'; id: string; document_type_name: string | null
      status: string; due_date: string }
  | { kind: 'document_expiry'; id: string; document_type_name: string | null
      document_name: string | null; due_date: string }
  | { kind: 'comp_off_expiry'; id: string; days: number; earned_on: string | null
      due_date: string }
  | { kind: 'shift_change'; id: string; shift_name: string | null; is_rotation: boolean
      effective_from: string; due_date: string }

export interface AgendaDay {
  date: string
  day_kind: DayKind
  shift: AgendaShift | null        // non-null on `working` AND `half_day_leave`
  holiday: AgendaHoliday | null    // can be null even when day_kind === 'holiday'
  leave: AgendaLeave | null
  items: AgendaItem[]
  status_source: 'record' | 'derived'
  status_reason: string
}

export interface AgendaSummary {
  working_days: number      // fractional on half-day leave
  weekly_offs: number
  holidays: number
  leave_days: number        // fractional on half-day leave
  unassigned_days: number
  items_due: number
  next_day_off: string | null
  next_holiday: { date: string; name: string } | null
}

export type SelfLane = 'shift' | 'holidays' | 'leave' | 'tasks' | 'documents'
                     | 'comp_offs' | 'shift_changes'

export interface SelfAgenda {
  range: Range
  summary: AgendaSummary
  lanes: Record<SelfLane, LaneState>
  days: AgendaDay[]
}

// ─── Team agenda ───────────────────────────────────────────────────────────────
export interface AwayEntry {
  user_id: string
  user_name: string | null          // fallback already applied server-side
  kind: 'leave' | 'holiday' | 'weekly_off'
  portion?: LeavePortion            // on `leave`
  leave_type_name?: string | null   // on `leave`
  holiday_name?: string             // on `holiday`
}

export interface CoverageDay {
  date: string
  working_count: number
  away_count: number        // working + away may EXCEED team_size (half-day leave)
  unassigned_count: number
  items_due_count: number
  away: AwayEntry[]
}

export interface TeamAgenda {
  range: Range
  team_size: number
  max_team_size: number
  lanes: { tasks: LaneState }
  days: CoverageDay[]
}

// ─── Error codes worth branching on ────────────────────────────────────────────
export const SCHEDULE_ERROR_CODES = {
  RANGE_INVALID:    'SCHEDULE_RANGE_INVALID',
  RANGE_TOO_LARGE:  'SCHEDULE_RANGE_TOO_LARGE',
  INCLUDE_INVALID:  'SCHEDULE_INCLUDE_INVALID',
  TEAM_TOO_LARGE:   'TEAM_TOO_LARGE',
  OUTSIDE_HIERARCHY:'CANNOT_ACCESS_OUTSIDE_HIERARCHY',
  FEATURE_OFF:      'FEATURE_NOT_AVAILABLE',
  USER_NOT_FOUND:   'USER_NOT_FOUND',
} as const

export const MAX_AGENDA_RANGE_DAYS = 92
```

### 11.2 API client

```ts
// api/schedule.ts
import { apiClient } from './client'
import type { SelfAgenda, TeamAgenda, SelfLane, ApiEnvelope } from './types'

export type AgendaLaneRequest = Extract<
  SelfLane, 'tasks' | 'documents' | 'comp_offs' | 'shift_changes'
>

export async function fetchMyAgenda(params: {
  from?: string
  to?: string
  include?: AgendaLaneRequest[]   // omit for all lanes
}): Promise<SelfAgenda> {
  const { data } = await apiClient.get<ApiEnvelope<SelfAgenda>>(
    '/api/v1/attendance/schedule/agenda',
    {
      params: {
        from: params.from,
        to: params.to,
        include: params.include?.length ? params.include.join(',') : undefined,
      },
    }
  )
  return data.data
}

export async function fetchTeamAgenda(params: {
  from?: string
  to?: string
  subordinateId?: string
}): Promise<TeamAgenda> {
  const { data } = await apiClient.get<ApiEnvelope<TeamAgenda>>(
    '/api/v1/attendance/manager/schedule/team-agenda',
    { params: { from: params.from, to: params.to, subordinate_id: params.subordinateId } }
  )
  return data.data
}
```

### 11.3 React hook

```ts
// hooks/useMyAgenda.ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyAgenda, type AgendaLaneRequest } from '../api/schedule'
import { MAX_AGENDA_RANGE_DAYS } from '../api/types'
import { differenceInCalendarDays, parseISO } from 'date-fns'

export const AGENDA_KEY = ['attendance', 'schedule', 'agenda'] as const

export function useMyAgenda(from: string, to: string, include?: AgendaLaneRequest[]) {
  // Guard locally: the server rejects an oversized range with a named code, and that error is a
  // bug in our date picker, not something to show a user.
  const span = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  if (span > MAX_AGENDA_RANGE_DAYS) {
    throw new Error(`Agenda range is capped at ${MAX_AGENDA_RANGE_DAYS} days; requested ${span}`)
  }

  return useQuery({
    queryKey: [...AGENDA_KEY, from, to, include?.join(',') ?? 'all'],
    queryFn: () => fetchMyAgenda({ from, to, include }),
    staleTime: 60_000,
    // The agenda is cheap and highly cacheable within a session; keep the previous window
    // on screen while the next one loads so month paging doesn't flash.
    placeholderData: prev => prev,
  })
}

/** Call after anything that can change a future day. */
export function useInvalidateAgenda() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: AGENDA_KEY })
}
```

### 11.4 Day row component

```tsx
// components/AgendaDayRow.tsx
import type { AgendaDay, AgendaItem } from '../api/types'
import { formatInTimeZone } from 'date-fns-tz'

const hhmm = (t: string) => t.slice(0, 5)

function dayLabel(day: AgendaDay): string {
  switch (day.day_kind) {
    case 'working':
      // `shift` is guaranteed non-null on `working`
      return `${hhmm(day.shift!.start_time)}–${hhmm(day.shift!.end_time)}${
        day.shift!.is_overnight ? ' (+1)' : ''
      }`
    case 'weekly_off':
      return 'Weekly off'
    case 'holiday':
      // A calendar-exception non-working day has NO holiday row to name.
      return day.holiday?.name ?? 'Non-working day'
    case 'leave':
      return day.leave?.leave_type_name ?? 'On leave'
    case 'half_day_leave':
      return `½ day · ${day.leave?.leave_type_name ?? 'leave'}`
    case 'unassigned':
      return day.status_reason === 'before_joining' ? 'Before joining' : 'No shift assigned'
  }
}

function itemLabel(item: AgendaItem, tz: string): string {
  switch (item.kind) {
    case 'task_due':
      // The ONLY kind with a real time of day.
      return `${item.title} · due ${formatInTimeZone(new Date(item.due_at), tz, 'h:mm a')}`
    case 'document_request_due':
      return `Upload ${item.document_type_name ?? 'document'}`
    case 'document_expiry':
      return `${item.document_name ?? item.document_type_name ?? 'Document'} expires`
    case 'comp_off_expiry':
      return `Comp-off credit expires${item.earned_on ? ` (earned ${item.earned_on})` : ''}`
    case 'shift_change':
      return item.is_rotation
        ? `Moves to rotation: ${item.shift_name ?? 'new pattern'}`
        : `Moves to shift: ${item.shift_name ?? 'new shift'}`
  }
}

export function AgendaDayRow({ day, timezone }: { day: AgendaDay; timezone: string }) {
  const isOff = day.day_kind === 'weekly_off' || day.day_kind === 'holiday'
  return (
    <div data-kind={day.day_kind} aria-current={undefined}>
      <time dateTime={day.date}>{day.date}</time>
      <span data-muted={isOff}>{dayLabel(day)}</span>

      {/* `half_day_leave` is the one kind carrying BOTH a shift and leave */}
      {day.day_kind === 'half_day_leave' && day.shift && (
        <span>{hhmm(day.shift.start_time)}–{hhmm(day.shift.end_time)}</span>
      )}

      {day.items.length > 0 && (
        <ul>
          {day.items.map(item => (
            <li key={`${item.kind}:${item.id}`}>{itemLabel(item, timezone)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

### 11.5 Manager coverage strip

```tsx
// components/CoverageStrip.tsx
import type { TeamAgenda } from '../api/types'

export function CoverageStrip({ agenda, threshold = 0.6 }: { agenda: TeamAgenda; threshold?: number }) {
  if (agenda.team_size === 0) {
    return <Empty>You have no direct reports.</Empty>
  }

  return (
    <div>
      <header>Coverage · {agenda.range.from} → {agenda.range.to} · {agenda.team_size} reports</header>
      {agenda.days.map(day => {
        // Denominator is team_size, NOT working_count + away_count — those overlap on half-day
        // leave, where one person is counted as both present and away.
        const ratio = day.working_count / agenda.team_size
        const isThin = day.working_count > 0 && ratio < threshold
        const isEmpty = day.working_count === 0
        return (
          <button key={day.date} data-thin={isThin} data-empty={isEmpty}>
            <time dateTime={day.date}>{day.date}</time>
            <Bar value={ratio} />
            <span>{day.working_count}/{agenda.team_size}</span>
            {day.items_due_count > 0 && <Badge>{day.items_due_count} due</Badge>}
            {(isThin || isEmpty) && <WarnIcon />}
          </button>
        )
      })}
    </div>
  )
}
```

---

## 12. Answers to your eight open questions

| # | Your question | Answer |
|---|---|---|
| 1 | One composed endpoint, or filters? | **Both shipped.** Build the schedule page on the agenda; use the filters for cards elsewhere. |
| 2 | Is server-side `day_kind` safe given policy complexity? | **Yes — it's the reason to use this endpoint.** It runs the same resolver as the roster, the HR planes and the auto-absent cron. Rotation arithmetic, holiday targeting and precedence all stay server-side. |
| 3 | How far forward can we query? | **92 days**, hard. Beyond that is `SCHEDULE_RANGE_TOO_LARGE`. A 92-day window costs the same number of queries as a 7-day one. |
| 4 | Will approved-leave days overlap weekly offs and holidays? | **Yes, and the agenda resolves it for you** — the holiday or weekly off wins. You will see fewer `leave` days than the request's `total_days`, and that is correct. See §4.1. |
| 5 | Does future shift resolution exist? | **Yes** — your §3.6 was wrong about this; it already resolved any date, rotations included. What it couldn't do was a *range* without one query per day. There's now a batch path sharing the same rotation function, with a test asserting the two agree on every day of a cycle. |
| 6 | `due_at` or `due_date`? | **Both, per kind.** Only `task_due` has a real time of day. See §5.1. |
| 7 | Should the team view accept `subordinate_id`? | **Yes, hierarchy-checked for every role** — including HR, which is scoped to its own direct reports here. See §7.1. |
| 8 | Caching / invalidation? | **No server-side cache**, so no invalidation problem. Don't cache client-side beyond your query library. See Pattern D. |

### Not built: `probation_end`

You listed it first among the kinds you could live without, and it isn't buildable — there is no probation-end or confirmation date column anywhere in the schema. `job_status` has a `probation` value but no date attached, and deriving one from `joining_date` plus a hardcoded assumption would be a fabrication we'd both regret. If you want it, it needs a column and a decision about who sets it. Ask and we'll scope it.

### Also not built: org-wide coverage for HR

Deliberately out of scope, for the reason in §7.1. Ask for it as its own endpoint.

---

## 13. Integration Checklist

Work down this list; each item maps to a real failure mode we've already thought about.

**Correctness**

- [ ] Format every date against `range.timezone`, never the browser's zone (Pattern F)
- [ ] Treat `date` and `due_date` as opaque strings — never `new Date('2026-10-22')`
- [ ] Switch on `day_kind`; do not re-derive precedence from `shift`/`holiday`/`leave` presence
- [ ] Accept that a weekly off inside a leave span is `weekly_off` — do not "correct" it (§4.1)
- [ ] Guard `day.holiday?.name` — a calendar-exception day is `holiday` with `holiday: null` (§4.3)
- [ ] Guard `day.leave?.leave_type_name` — nullable in a real case (§3.5)
- [ ] Render `half_day_leave` with **both** the shift and the ½-day badge (§4.2)
- [ ] Type `working_days` / `leave_days` as `number` — they're fractional on half-day leave
- [ ] Switch on `item.kind` for `due_at` vs `due_date` — never fabricate a midnight (§5.1)
- [ ] Use `team_size` as the coverage denominator, not `working_count + away_count` (§7.4)

**Resilience**

- [ ] Read `lanes` before rendering any empty state — `unavailable` must not read as "nothing due" (§6)
- [ ] Degrade per panel, not per page (Pattern E)
- [ ] Surface `truncated` as "showing the first N", with a hint to narrow the range
- [ ] Render `unassigned` neutrally — it's valid data, not an error (§4.4)
- [ ] Never render `awaiting_absent_cron` as "Absent" — it's a past day the cron hasn't finalised (§3.5)
- [ ] Handle `team_size: 0` as "no direct reports", not an error (§7.4)
- [ ] Branch `FEATURE_NOT_AVAILABLE` to a plan message, not a session-expiry flow

**Hygiene**

- [ ] Clamp the date picker to 92 days so `SCHEDULE_RANGE_TOO_LARGE` is unreachable (§8.1)
- [ ] Read `errorCode` (not `code`) from the error envelope (§8)
- [ ] Key the cache on `(from, to, include)`; invalidate after leave / task / document mutations (Pattern D)
- [ ] Use `include` to drop lanes you don't render — but never expect to exclude `shift`/`holidays`/`leave`
- [ ] Read `range.from` / `range.to` back rather than assuming your own inputs
- [ ] Treat `CANNOT_ACCESS_OUTSIDE_HIERARCHY` as a generic denial — it's uniform by design (§8)

---

## 14. Summary for Frontend Engineers

**One request builds the page.** `GET /attendance/schedule/agenda?from=&to=` returns a dense one-entry-per-day agenda with a single resolved `day_kind`, a server-computed summary, and per-day items. No fan-out, no client-side merging, no rotation maths.

**The three rules that affect pay are server-owned, as you asked.** Rotation arithmetic, holiday audience targeting and day precedence all live in one place — the same code unit payroll uses. If you re-derive any of them in the browser, you've reintroduced the drift this endpoint exists to prevent.

**The one thing that will surprise you** is §4.1: a weekend inside an approved leave span comes back as `weekly_off`, not `leave`, because that day was never charged against the balance. Draw the leave span as a bracket over the days; let each day keep its own kind.

**Check `lanes` before you render "nothing".** It's the difference between an honest empty state and telling someone they have no deadlines when the query simply failed.

**Caps are refusals, not truncations.** 92 days, 200 reports, 500 rows per lane. Clamp your picker; nothing silently shortens behind your back.

Questions, or anything in here that doesn't match what you see on the wire — tell us and we'll correct the backend or this document, whichever is wrong.

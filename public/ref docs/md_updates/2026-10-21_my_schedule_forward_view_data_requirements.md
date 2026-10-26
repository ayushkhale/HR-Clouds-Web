# My Schedule — Forward View: Frontend Data Requirements

**From:** Frontend (web)
**To:** Backend
**Date:** 21 Oct 2026
**Scope:** Employee and Manager workspaces only. HR is explicitly out of scope for this round.
**Status:** Requirements / request for APIs. Nothing here is built yet.

---

## 0. TL;DR — what we are asking for

We want to turn `My Schedule & Rules` from a **static page about rules** into a
**forward-looking agenda**: "here is what my next weeks look like, and what I owe
and when".

We need one thing above all else:

> **A day-keyed agenda endpoint for a date range** — `GET /attendance/schedule/agenda?from=&to=`
> for the caller, and a team equivalent for a manager — that already merges
> shift, weekly off, holiday, approved leave and upcoming deadlines into one
> answer per calendar day.

If an aggregate endpoint is not acceptable, §5 lists the **minimum per-module
filter changes** that would let us assemble it ourselves. Either path works for
us; the aggregate is better for the reasons in §4.1, and one of the two is
required because **three of the five data lanes we need cannot be queried by date
at all today** (§3).

The single hardest blocker: **`GET /tasks/me` has no due-date filter and rejects
unknown query keys with a 400**, so there is currently *no way to ask* "which of
my tasks are due in the next 30 days".

---

## 1. What we are building and why

### 1.1 The page today

`My Schedule & Rules` (shipped 21 Oct 2026, mounted in all three workspaces)
answers one question: *what am I measured against?* It reads a single endpoint,
`GET /api/v1/attendance/shift`, and renders the assigned shift, the rotation
pattern, the weekly offs and the attendance policy rules in plain language.

It is entirely **present-tense and static**. It cannot answer any of the
questions people actually bring to a schedule page.

### 1.2 The page we want

The questions we want it to answer, in priority order:

1. **"What are my next two weeks?"** — per day: am I working, is it a weekly off,
   is it a holiday, am I on approved leave, and which shift applies.
2. **"What do I owe, and when?"** — task deadlines, document requests with due
   dates, documents of mine about to expire, comp-off credits about to expire.
3. **"When am I off next?"** — the next holiday and my approved upcoming leave,
   in one place rather than three screens.
4. **(Manager) "Who is away next week, and is anyone left?"** — a coverage view
   over direct reports, plus what the team owes and when.

### 1.3 Shape we intend to render

Employee / self view:

```
┌─ My Schedule & Rules ──────────────────────────────── [ Next 30 days ▾ ] ─┐
│  Next day off      Approved leave     Due this week     Expiring soon     │
│  Sat 24 Oct        2 d, 3–4 Nov       3 items           1 document        │
├───────────────────────────────────────────────────────────────────────────┤
│  AGENDA                                                                   │
│  Tue 21 Oct   Today     General Day Shift · 9:30 am – 6:30 pm             │
│                         • Task due 6:00 pm — Submit Q3 expense report     │
│  Wed 22 Oct             General Day Shift · 9:30 am – 6:30 pm             │
│  Sat 24 Oct   Weekly off                                                  │
│  Sun 01 Nov   Holiday   Diwali                                            │
│  Tue 03 Nov   On leave  Casual Leave · 2 d                                │
│  Fri 14 Nov             • PAN card expires                                │
├───────────────────────────────────────────────────────────────────────────┤
│  YOUR SHIFT · YOUR DAYS OFF · HOW YOUR ATTENDANCE IS COUNTED  (as today)  │
└───────────────────────────────────────────────────────────────────────────┘
```

Manager view — same page, same layout, one extra panel (our §2 role-parity rule
means we will not fork the screen; the manager gets an additional section, not a
different page):

```
├─ TEAM AWAY & COVERAGE ────────────────────────────────────────────────────┤
│  Mon 27 Oct   4 of 6 working   Away: 2 (leave)                            │
│  Fri 31 Oct   6 of 6 working                                              │
│  Mon 03 Nov   3 of 6 working   Away: 3 (2 leave, 1 holiday — regional)    │
```

---

## 2. Scope and non-goals

**In scope**

* Read-only. Nothing on this page writes.
* A rolling forward window, default 30 days, user-switchable to 7 / 30 / 90.
* The caller's own schedule (employee, manager, and HR reading their own).
* A manager's direct-report coverage view.

**Explicit non-goals for this round** — please don't build these for us yet:

* HR org-wide calendars or a company-wide roster view.
* Any write path: requesting leave, reassigning a shift, editing a deadline.
* Backward history. `GET /attendance/weekly-calendar` and the attendance history
  screens already cover the past; this page looks forward only, and we do not
  want to duplicate them.
* Push notifications or reminders. Separate concern, separate work.
* iCal / Outlook export. We may ask later; don't block on it.

---

## 3. Verified current state — what we can and cannot ask for today

We audited every endpoint behind the five lanes we need. "Can filter by date
range" is the column that matters, because the page is a date range.

| Lane | Endpoint we would use | Date-range filter? | Verdict |
|---|---|---|---|
| Shift / weekly offs | `GET /attendance/shift` | n/a — returns *today's* resolution only | **Partial.** No way to resolve a future date. |
| Holidays | `GET /attendance/holidays` | `year` only, and see note below | **Gap.** |
| My leave | `GET /leaves/my-requests` | **No parameters at all** | **Gap.** |
| My tasks | `GET /tasks/me` | **No**, and unknown keys → `400` | **Hard blocker.** |
| My documents | `GET /documents/me/documents` | No (`type_id`, `status`, `group_id`, `limit`, `offset`) | **Gap.** |
| My comp-offs | `GET /attendance/comp-offs/mine` | No (`status`, `page`, `limit`) | **Partial.** Carries `expiry_date`. |
| Team leave | `GET /leaves/team/requests` | Unclear — accepts params, undocumented | **Needs confirming.** |
| Team tasks | `GET /tasks/manager/team-tasks` | No (`+ subordinate_id`) | **Gap.** |
| Team coverage | — | — | **Does not exist.** |

Detail on each, so nobody has to re-derive it:

**3.1 Tasks — the blocker.** `GET /tasks/me` (#249) allow-lists exactly
`status`, `priority`, `category`, `is_overdue`, `search`, `page`, `limit`,
`is_viewed`. Per the registry, **unknown query keys are rejected with `400`,
never ignored**, so we cannot smuggle a `due_before`. Results are sorted
`created_at DESC`, so we cannot even page our way to the nearest deadline — the
soonest-due task may be on page 4. `is_overdue` tells us what is *already* late,
which is the opposite of what a forward agenda needs. There is no way to answer
"due in the next 30 days" with the current contract. Same for
`/tasks/manager/team-tasks`.

**3.2 Holidays.** The spec (`3_user_attendance_api.md` §20) documents an optional
`year` query parameter (2000–2100, defaults to current year in `Asia/Kolkata`).
Our API wrapper carries the comment *"Takes no parameters — a `year` would be
ignored (§4.3). Filter by date client-side."* — i.e. a previous engineer observed
live behaviour diverging from the spec. **Please confirm which is true.** Either
way, a *year* is the wrong unit for this page: a rolling 90-day window starting in
November spans two calendar years, so a year-scoped list means two requests and a
client-side merge for a single panel.

**3.3 Leave.** `GET /leaves/my-requests` (#2) is documented as "the logged-in
employee's historical leave applications" and our wrapper passes no parameters at
all. We need *upcoming approved* leave, which is the opposite end of the same
table. Today we would have to pull the entire history and filter in the browser —
unbounded payload growth for a four-line panel.

**3.4 Documents.** The `expiring_before` filter exists on the **HR/manager**
endpoint (#13, one employee's documents) but **not** on the self endpoint (#34,
`/documents/me/documents`), whose filters are `type_id`, `status`, `group_id`,
`limit`, `offset`. The HR expiring report (`/documents/hr/reports/expiring`) is
HR-only and org-wide, so neither employee nor manager can use it for themselves.

**3.5 Comp-offs.** `GET /attendance/comp-offs/mine` accepts `status` and
pagination, and records carry `expiry_date`. Filtering `status=approved` and
sorting client-side is workable, so this is the one lane we could ship without
you. Noted here only so the aggregate endpoint includes it.

**3.6 Shift resolution for a future date.** `GET /attendance/shift` returns the
active assignment, the shift template, the `rotation` pattern and `weekly_offs`
(`days_of_week`, `0` = Sunday). For a **fixed** shift we can project future days
ourselves from `weekly_offs`. For a **rotational** shift we cannot: we would have
to re-implement the rotation arithmetic in JavaScript, and it would drift from
yours the first time either side changes. **We are not willing to own that logic
in the browser** — see §6.1.

---

## 4. The ask (preferred): one agenda endpoint per plane

### 4.1 Why an aggregate rather than five filtered lists

1. **Request budget.** Assembling this client-side is 6 requests for the employee
   view and 8 for the manager's. Our house rule is no request-per-row and a
   bulk endpoint wherever one is possible; this page would be the worst offender
   in the app.
2. **Day precedence is business logic, and it is yours.** If an approved leave
   falls on a declared holiday, or a holiday falls on a weekly off, what is that
   day? Payroll and attendance already answer this (the leave module references
   `attendance_calendar_exceptions`, and overnight shifts write `on_leave` rows
   for *two* calendar dates). If the frontend invents its own precedence, this
   page will eventually contradict the payslip. **That is the single strongest
   argument in this document.** We want to render your answer, not compute our
   own.
3. **Rotation resolution** (§3.6) can only be done server-side.
4. **It degrades well.** One endpoint, one loading skeleton, one error state. Six
   endpoints means six partial-failure combinations to design for.

### 4.2 `GET /api/v1/attendance/schedule/agenda` — self

Available to **all org roles**, always scoped to the caller, no `user_id`
parameter (same shape as `/attendance/my-field-assignments`).

**Query**

| Param | Type | Required | Notes |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | No | Defaults to today in the caller's shift timezone. |
| `to` | `YYYY-MM-DD` | No | Defaults to `from + 29 days`. |
| `include` | CSV | No | Lanes to include, e.g. `shift,holidays,leave,tasks,documents,comp_offs`. Defaults to all. Lets us load the agenda and the deadline panel independently if we need to. |

Please **cap the range server-side** (we suggest 92 days) and return `400` with a
named error code beyond it rather than silently truncating — a silent truncation
would render as "you have no deadlines", which is a dangerous lie on this page.

**Response**

```json
{
  "success": true,
  "message": "Schedule fetched",
  "data": {
    "range": { "from": "2026-10-21", "to": "2026-11-19", "timezone": "Asia/Kolkata" },
    "summary": {
      "working_days": 21,
      "weekly_offs": 8,
      "holidays": 1,
      "leave_days": 2,
      "items_due": 4,
      "next_day_off": "2026-10-24",
      "next_holiday": { "date": "2026-11-08", "name": "Diwali" }
    },
    "days": [
      {
        "date": "2026-10-21",
        "day_kind": "working",
        "shift": {
          "id": "7c1e…",
          "name": "General Day Shift",
          "start_time": "09:30:00",
          "end_time": "18:30:00",
          "is_overnight": false,
          "source": "assignment"
        },
        "holiday": null,
        "leave": null,
        "items": [
          {
            "kind": "task_due",
            "id": "b2f9…",
            "title": "Submit Q3 expense report",
            "due_at": "2026-10-21T18:00:00+05:30",
            "status": "in_progress",
            "priority": "high",
            "is_overdue": false
          }
        ]
      },
      {
        "date": "2026-10-24",
        "day_kind": "weekly_off",
        "shift": null, "holiday": null, "leave": null, "items": []
      },
      {
        "date": "2026-11-08",
        "day_kind": "holiday",
        "shift": null,
        "holiday": { "id": "f5c2…", "name": "Diwali", "type": "public", "is_optional": false },
        "leave": null, "items": []
      },
      {
        "date": "2026-11-03",
        "day_kind": "leave",
        "shift": null,
        "holiday": null,
        "leave": {
          "id": "9a4d…",
          "leave_type_name": "Casual Leave",
          "portion": "full",
          "status": "approved",
          "request_start_date": "2026-11-03",
          "request_end_date": "2026-11-04",
          "request_total_days": 2
        },
        "items": []
      }
    ]
  }
}
```

**Field notes / requirements**

* **`days` must be dense** — one entry per calendar date in the range, including
  weekly offs and holidays, in ascending date order. We render a continuous
  agenda; filling gaps client-side means re-deriving which days exist.
* **`day_kind`** is the day's single attendance character, resolved by you:
  `working` · `weekly_off` · `holiday` · `leave` · `half_day_leave` ·
  `unassigned`. Exactly one value. This is the precedence decision from §4.1.2.
  `unassigned` covers "no shift assigned", which is a valid, common state and must
  not read as an error.
* **`day_kind: "half_day_leave"`** keeps `shift` populated — the person works half
  the day and needs to know which half, via `leave.portion`
  (`first_half` / `second_half`).
* **`shift.source`**: `assignment` | `rotation` | `default`. We want to label a
  rotational day honestly rather than implying a fixed assignment.
* **Overnight shifts:** if a shift crosses midnight, please tell us which date you
  consider the shift to belong to and keep it on exactly one day with
  `is_overnight: true`. We will render "9:00 pm – 6:00 am (next day)". Do not
  split one shift across two `days` entries — the leave module already does
  something different for `on_leave` rows, and we need to know which convention
  applies here.
* **`items[]`** is everything *falling due* on that date. See §4.4 for kinds.
* **Empty is not missing:** a lane with nothing in it must return an empty array,
  never be omitted. We gate UI on what the server returned, so an absent key
  reads to us as "feature not available" and hides the panel entirely.

### 4.3 `GET /api/v1/attendance/manager/schedule/team-agenda` — manager

Roles: `manager`, `hr`, `admin`, `super-admin`. Hierarchy-scoped to direct
reports, consistent with `/tasks/manager/team-tasks` and `/leaves/team/requests`.
A manager with no reports gets an empty envelope, **not** an error.

**Query:** `from`, `to` as above, plus optional `subordinate_id` to narrow to one
person (`403 CANNOT_ACCESS_OUTSIDE_HIERARCHY` outside the line, matching #257).

**Response**

```json
{
  "success": true,
  "data": {
    "range": { "from": "2026-10-27", "to": "2026-11-25", "timezone": "Asia/Kolkata" },
    "team_size": 6,
    "days": [
      {
        "date": "2026-11-03",
        "working_count": 3,
        "away_count": 3,
        "away": [
          { "user_id": "aa11…", "kind": "leave", "portion": "full", "leave_type_name": "Casual Leave" },
          { "user_id": "bb22…", "kind": "leave", "portion": "first_half", "leave_type_name": "Sick Leave" },
          { "user_id": "cc33…", "kind": "holiday", "holiday_name": "Regional Holiday" }
        ],
        "items_due_count": 2
      }
    ]
  }
}
```

**Field notes**

* `away[].kind`: `leave` | `holiday` | `weekly_off`. We will probably not render
  `weekly_off` per-person (it is usually the whole team), but we would rather
  filter a value out than discover later that a Saturday worker is invisible.
* **`working_count` / `away_count` must be computed by you.** They drive the
  coverage line, and a count the client derives from a truncated list is wrong in
  exactly the situation that matters.
* **`items_due_count` only** — we do not want the team's whole task list on this
  page. The count is the hook; the existing Team Tasks screen is the detail. If
  it is expensive, drop it and say so; it is the least important field here.
* **Scale:** please cap or paginate for large teams and tell us the cap. An HR
  user hitting this as a global approver could otherwise pull the whole
  organisation (#257 notes HR is *not* hierarchy-filtered there, which would make
  this endpoint org-wide for HR — we want it limited to direct reports in this
  round, see §2).

### 4.4 `items[]` kinds

One array, discriminated by `kind`, so we can render a single list per day:

| `kind` | Source | `due_at` means | Fields we need |
|---|---|---|---|
| `task_due` | `tasks` | Task deadline | `id`, `title`, `status`, `priority`, `is_overdue` |
| `document_request_due` | `documents` | Requested-by date | `id`, `document_type_name`, `status` |
| `document_expiry` | `documents` | Document expires | `id`, `document_type_name`, `document_name` |
| `comp_off_expiry` | `attendance` | Credit lapses | `id`, `days`, `earned_on` |
| `probation_end` | `organization` | Confirmation date | — (date only) |
| `shift_change` | `attendance` | New assignment starts | `shift_name`, `effective_from` |

`due_at` is a full timestamp with offset where a time-of-day genuinely exists
(tasks), and a `YYYY-MM-DD` `due_date` where it does not (document expiry,
comp-off expiry). **Please don't invent a midnight timestamp for a date-only
concept** — we would render "due 12:00 am", which has burned us before.

Kinds we can live without in v1, roughly in the order we would want them:
`probation_end`, `shift_change`, `comp_off_expiry`. **`task_due` and
`document_expiry` are the two that make the panel worth building.**

---

## 5. Fallback: minimum per-module changes

If the aggregate is rejected, we will assemble the page ourselves. In that case
we need, at minimum:

1. **`GET /tasks/me`** — add `due_from` / `due_to` (`YYYY-MM-DD`) to the
   allow-list, plus `sort=due_date` (`ASC`). Without a due-date sort the filter is
   only half useful, because we would still be paging blind. Same two additions on
   `/tasks/manager/team-tasks`. **This is the one non-negotiable item in this
   document** — every other lane has a workaround and this one does not.
2. **`GET /attendance/holidays`** — accept `from` / `to` instead of (or alongside)
   `year`, so a window crossing a year boundary is one request. Also please settle
   the spec-vs-live `year` question in §3.2.
3. **`GET /leaves/my-requests`** — accept `status`, `from`, `to`
   (overlap semantics: any request whose range intersects `[from, to]`), and
   confirm whether it paginates.
4. **`GET /documents/me/documents`** — add `expiring_before` to the self endpoint,
   matching #13 which already has it, and include `expires_on` in the row payload.
5. **`GET /leaves/team/requests`** — document the accepted parameters and confirm
   `from` / `to` overlap filtering, plus `status`.
6. **Future shift resolution** — either a small
   `GET /attendance/shift/resolve?from=&to=` returning `[{ date, shift, day_kind }]`,
   or accept that rotational employees see "shift varies" on this page. We would
   rather ship the honest degradation than compute rotations client-side (§6.1).

Even in this path, item 6 means the server still resolves day precedence for
rotational staff, so our preference for §4 stands.

---

## 6. Cross-cutting requirements

These apply to both options and are the things most likely to cause a rebuild if
we get them wrong, so please read them before implementing.

### 6.1 Logic we will not re-implement in the browser

Rotation arithmetic, holiday targeting by location/department/employment type,
and day precedence between leave / holiday / weekly off. All three already exist
server-side and all three affect pay. A second implementation in JavaScript would
drift, and the drift would show up as this page disagreeing with the payslip.
Where you cannot give us a resolved answer, we will render an honest "varies"
rather than guess.

### 6.2 Timezone

Every date in the response must be resolved in **the caller's shift timezone**,
not UTC and not the server's. Echo the timezone used in `range.timezone` so we can
warn when it differs from the browser's — the existing page already does this for
the shift panel, and an employee on an `Asia/Kolkata` shift opening the page from
another timezone must not see the agenda shift by a day. Dates are
`YYYY-MM-DD` strings; timestamps carry an explicit offset.

### 6.3 Identifiers and names

We never display a UUID or a raw enum. Two consequences:

* **Send `user_id`, and we will resolve the name** from our own employee
  directory, which already holds every active person with their avatar. Do not
  duplicate names into this payload for active staff.
* **But do include a name fallback** (`user_name`) for anyone who may be absent
  from the directory — a deactivated employee, or someone who left mid-window.
  Our directory would render "Unknown user" for them, which on a coverage view
  looks like a bug.
* **Enum values stay machine-readable** (`approved`, `first_half`, `public`) — we
  prettify them with our own humanizers. Don't send display strings for enums;
  do send `leave_type_name` and `holiday_name`, which are tenant data, not enums.

### 6.4 Counts must be server-side

`summary.*`, `working_count`, `away_count`, `items_due_count`. These drive
headline tiles. A count derived from a paginated or capped list is wrong, and
wrong in the quiet direction — it under-reports.

### 6.5 "Nothing on file" vs "couldn't load"

This matters more on this page than most. "You have no shift assigned" and "we
could not reach the shift service" must be distinguishable in the response, and
neither may be expressed as an empty success. If one lane of the aggregate fails
while others succeed, we would rather have a per-lane error marker than a
blanket `500`:

```json
"lanes": { "tasks": "ok", "documents": "unavailable", "holidays": "ok" }
```

That lets us render four good panels and one honest "couldn't load this part",
instead of blanking the page. If that is awkward, a blanket `500` is acceptable —
but tell us which you chose, because it changes how we design the error state.

### 6.6 Cache invalidation

The page is long-lived — someone leaves it open. We already have an app-wide
event bus that refetches on attendance config changes. Tell us which of these
should invalidate the agenda, and whether any existing event already covers it:
a new leave approval, a task reassignment or due-date extension, an HR holiday
edit, a shift reassignment. If nothing exists, a short `max-age` plus our
on-focus refetch is fine; we just need to know rather than assume.

### 6.7 Performance

Six lanes over 92 days has obvious N+1 potential. We will request a 30-day window
by default and we are happy to make the 90-day view a deliberate second request
if that helps. Please tell us the expected latency so we can decide whether the
agenda loads with the page or behind its own skeleton.

---

## 7. What we will build before any of this lands

So the sequencing is clear, and so you can see the degraded version is real:

* The static rules panels stay exactly as they are.
* **Comp-off expiry** (§3.5) works today — `status` filter plus client-side sort.
* **Holidays** work today for the current year, which covers most windows.
* **Fixed-shift** weekly-off projection works today from `weekly_offs.days_of_week`.

That gets us roughly a third of the page. **Tasks, leave and document expiry —
the three lanes that answer "what do I owe and when" — are blocked on §5.1,
§5.3 and §5.4 respectively.** They are also the three that make the page worth
visiting twice, so we would rather wait for them than ship a schedule page whose
deadline panel is permanently empty.

---

## 8. Open questions for backend

1. **Aggregate or filters?** §4 or §5 — your call, we will build either. We need
   to know before we start, because the two produce different page architectures.
2. Does `GET /attendance/holidays` honour `year` in production, or is our code
   comment right that it is ignored? (§3.2)
3. What parameters does `GET /leaves/team/requests` actually accept? Undocumented
   in the registry.
4. Which calendar date does an overnight shift belong to, for this page? (§4.2)
5. Is there an existing resolver for "which shift applies to user U on date D"
   that the agenda could call, or would that be new work?
6. Do document *requests* carry a due date we can surface, and is it on the self
   endpoint? We found the HR expiring report but not a self-service equivalent.
7. For an HR user acting as global approver, do you want `team-agenda`
   hierarchy-filtered (our preference, §4.3) or org-wide?
8. Any rate limit we should design the window switcher around?

---

## 9. Appendix — endpoints referenced

| Endpoint | Ref (registry row / module API #) | Used for | Status for our purposes |
|---|---|---|---|
| `GET /api/v1/attendance/shift` | U13 / §12 | Shift, rotation, weekly offs, policy | Works; present-tense only |
| `GET /api/v1/attendance/holidays` | 15 / §20 | Holiday calendar | Year-scoped; `year` behaviour unconfirmed |
| `GET /api/v1/attendance/comp-offs/mine` | U14 | Comp-off credits + `expiry_date` | Usable as-is |
| `GET /api/v1/attendance/weekly-calendar` | §19 | Past 7-day metrics | Not used here — backward-looking |
| `GET /api/v1/leaves/my-requests` | 2 | Own leave requests | No filters |
| `GET /api/v1/leaves/team/requests` | — | Team leave history | Parameters undocumented |
| `GET /api/v1/tasks/me` | 249 | Own task queue | No due-date filter; rejects unknown keys |
| `GET /api/v1/tasks/manager/team-tasks` | 257 | Direct reports' tasks | Same gap |
| `GET /api/v1/documents/me/documents` | 34 | Own documents | No `expiring_before` |
| `GET /api/v1/documents/hr/reports/expiring` | 117 | Expiring documents | HR-only, org-wide |

Frontend reference for the page as it stands today:
`src/shared/screens/MySchedulePage.jsx`, `src/shared/attendance/policyRules.js`,
and the shipped guide
`md_updates/2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md`.

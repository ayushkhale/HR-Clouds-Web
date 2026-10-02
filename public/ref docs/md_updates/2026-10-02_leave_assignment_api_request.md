# Frontend → Backend: the Leave Assignment APIs we need

**From:** Frontend (HR workspace)
**To:** Backend (Leave module)
**Date:** 2026-10-02
**Priority:** P1 items block a screen that is already live; P2/P3 are the difference between a working screen and a good one.
**Supersedes:** L-1 in `2026-10-02_frontend_requests_to_backend.md`, which is the short version of §3.1 here.

---

## 1. What this is about

Setup › Leave now has a **Leave Assignment** page, so giving a leave policy out
sits beside the policies themselves instead of being buried three navigations
deep inside one employee's profile (People → Employees → a person → Leave tab).

We built the first version against the endpoints that exist today, and it works,
but it is **shaped by the gaps rather than by the job**. Attendance already has
the contract we want, for the same job one module over: Shift Management lists
every assignment, with the schedule, the dates and the state in each row, because
`GET /attendance/hr/shifts/assignments` exists. Leave has no equivalent, so the
screen cannot answer the one question HR actually opens it to ask — **who has no
leave policy at all?** Those people silently accrue nothing.

This document is not a request to work around that. It is the UI we want to
build, and the data each part of it needs. Everything asked for here is already
in your database: `leave_policy_configs` holds per-user rules as historical,
soft-deleted records (combined_api_analysis §11, §12), and
`leaveBalanceService.getMyLeaveTypes` already projects "leave types applicable to
this user, including their per-user configuration" — just only for the caller
themselves (§14b). We are mostly asking you to **project what you store** and to
mirror a contract you have already written once.

Where a shape already exists in your code, we quote it rather than invent a new
one. Reusing the attendance assignment contract and the holiday targeting
vocabulary should make most of this close to mechanical.

---

## 2. The UI we want to build

### 2.1 The page, in one picture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Leave Assignment                                    [ Assign a policy ▾ ]   │
│  Who has which leave policy, and what it gives them.                         │
│                                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ On a policy  │ │ NO POLICY    │ │ Policies in  │ │ Custom rules │        │
│  │     142      │ │     8  ←     │ │ use:  4 of 6 │ │      11      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                                              │
│  [ All ] [ On a policy ] [ No policy (8) ] [ Custom rules ]   [search…]      │
│                                                                              │
│  Employee        Code     Policy            From         State      Custom   │
│  ─────────────────────────────────────────────────────────────────────────── │
│  Asha Menon      E-104    Standard 2026     1 Jan 2026   Ongoing    —        │
│  Rohit Shah      E-118    Standard 2026     1 Jan 2026   Ongoing    2 types  │
│  Priya N         E-131    —                 —            No policy  —        │
│  Imran Q         E-140    Interns 2026      1 Apr 2026   Upcoming   —        │
└──────────────────────────────────────────────────────────────────────────────┘
```

Row click opens a record inspector: the policy and its entitlements, this
person's balances, who assigned it and when, and any per-type rules that differ
from the policy. Row actions: **End**, **Delete**, **Customise**. This is the
same list → row → inspector shape as Shift Management, deliberately, because a
manager promoted to HR should not have to learn two screens that do one thing.

### 2.2 Assigning to many people at once

The common real-world action is not "give Asha a policy", it is **"everyone in
Engineering on Standard 2026, interns on Interns 2026"**. Today that is one
dialog, one person, repeated forty times, with no way to check the result.

We want the assign dialog to take the same targeting vocabulary your holidays
and weekly-offs already accept — `target_departments`, `target_locations`,
`target_employment_types`, `target_job_statuses`, `included_users`,
`excluded_users` — and to show HR **what is about to happen before it happens**:

```
  34 people match this selection.
  ·  8 are already on Standard 2026                    no change
  · 24 move from "Standard 2025" to "Standard 2026"     balances recalculated
  ·  2 have custom rules that will be REPLACED          Rohit Shah, Imran Q
  ·  0 cannot be assigned
                                           [ Cancel ]  [ Assign 26 people ]
```

That preview is the single most valuable thing in this document. Assignment is
**destructive and silent**: it soft-deletes every existing config for the person,
copies the template's rules over them, and recomputes the year's balances
pro-rata (§11). There is no undo and the reply says nothing about what changed.
Our dialog currently reads one person's balances first so HR at least sees what
is being replaced — that trick does not scale to a department, and it is a
read-then-write race in any case.

### 2.3 Fixing one person's rules without flying blind

`PUT /leaves/users/:userId/configs/:leaveTypeId` is partial, and unsent fields
keep their current values — good. But **there is no way to read the current
values**, so our Customise dialog opens with every field blank and a note
explaining that blank means unchanged (see the comment in
`src/roles/hr/screens/employee-profile/LeaveTab.jsx`). HR is editing numbers it
cannot see. With the per-user config readable, the same form shows:

```
  Days per year        18  (policy default: 18)        [ 24 ]  ← changed
  How leave is given   All at once (policy default)    [ … ]
  Kept for next year   5   (policy default: 5)         [ … ]
                                        · Revert to the policy default
```

### 2.4 Next year, set in December

Shifts have `effective_from`, so HR can schedule a change. Leave assignment
applies the instant it is called, which means next year's policy can only be set
on 1 January, by hand, for everyone. We want the same `effective_from` on a leave
assignment, and the same "Upcoming / Ongoing / Ended" states the roster shows.

---

## 3. The data we need

Ordered by what unblocks the most UI. Each item says the precedent in your own
code, so none of this should need a new pattern.

### 3.1 · P1 · List leave policy assignments

**The gap.** No bulk read exists. The only reads are
`GET /leaves/users/:userId/balances` (#3) and
`GET /leaves/team/member/:userId/balances` (#6) — one employee per request.
The frontend does not fire one request per row, so the page currently lists
people from the employee roster and reads one person's setup when HR opens them.
Nobody can see who has no policy.

**Precedent.** `GET /api/v1/attendance/hr/shifts/assignments` (registry
attendance #7) — "a ledger of historical and active shift assignments".

**Proposed.**

```
GET /api/v1/leaves/assignments
Auth: hr, admin, super-admin   ·   Feature: leave.access
```

| Query | Type | Notes |
|---|---|---|
| `template_id` | UUID | assignments on one policy |
| `user_id` | UUID | one person's history (replaces a per-row read) |
| `state` | `ongoing` \| `upcoming` \| `ended` | optional; derivable client-side if you'd rather not |
| `unassigned` | `true` | **the important one** — people with no active policy |
| `has_overrides` | `true` | people whose rules differ from their policy |
| `department_id` | UUID | matches #8's filter vocabulary |
| `q` | string | name / email / employee code, like #8's `search` |
| `page`, `limit` | int | bounded like #8 (limit ≤ 100) |

```json
{
  "success": true,
  "data": {
    "total": 150,
    "page": 1,
    "limit": 100,
    "rows": [
      {
        "id": "assignment-uuid",
        "user_id": "uuid",
        "user": {
          "id": "uuid",
          "profile": { "first_name": "Asha", "last_name": "Menon", "display_name": "Asha Menon", "avatar_url": null, "gender": "female" },
          "employee_profile": { "employee_code": "E-104" },
          "role": "employee",
          "department": "Engineering",
          "designation": "Backend Dev"
        },
        "template": { "id": "uuid", "name": "Standard 2026", "entitlement_count": 4 },
        "effective_from": "2026-01-01",
        "effective_to": null,
        "override_count": 0,
        "assigned_by": { "id": "uuid", "name": "Rahul Gupta" },
        "assigned_at": "2026-01-01T06:12:44.000Z"
      }
    ]
  }
}
```

Notes on the row:

- `user` in the shape #8 and the attendance assignments already use, **including
  `gender`** (R-5) and `employee_code`, so avatars and codes resolve without a
  second roster read.
- `template.entitlement_count` saves us reading every template to say "4 leave
  types".
- `override_count` is what powers the "Custom rules" column and filter.
- `assigned_by` / `assigned_at`: a destructive, unauditable action is the thing
  HR asks about afterwards ("who put her on this?"). You already write a new
  config record per assignment, so the timestamp exists.
- **An unassigned person**: either include them with `template: null` (our
  preference — one list, one count, no merging on the client) or expose them via
  `?unassigned=true`. Either is fine; please say which.

**Meanwhile:** the list comes from the employee directory and shows no policy
column. **Frontend ready:** the column and the three filters are designed and
waiting; shipping this needs no new screen from us.

---

### 3.2 · P1 · Read one person's effective leave configuration

**The gap.** `PUT …/configs/:leaveTypeId` writes per-user rules; nothing reads
them. So the Customise form cannot prefill, cannot show the policy default
beside the override, and cannot tell HR which types are already customised.
`GET …/balances` returns ledger numbers only (`total_accrued`, `total_used`,
`current_balance` + `leave_type` name/code) and no config object.

**Precedent.** `GET /api/v1/leaves/my-leave-types` (#5) already returns "active
leave types applicable to the caller, **including their per-user
configuration**" via `leaveBalanceService.getMyLeaveTypes` (§14b). We need that
same projection for a user HR names.

**Proposed.**

```
GET /api/v1/leaves/users/:userId/leave-config
Auth: hr, admin, super-admin
```

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "template": { "id": "uuid", "name": "Standard 2026" },
    "effective_from": "2026-01-01",
    "types": [
      {
        "leave_type_id": "uuid",
        "leave_type": { "name": "Earned Leave", "code": "EL" },
        "effective": {
          "assigned_annual_quota": 24,
          "accrual_type": "upfront",
          "max_carry_forward": 5,
          "probation_restriction_days": 90,
          "max_negative_balance": 0,
          "notice_period_max_days": null
        },
        "policy_default": {
          "annual_quota": 18,
          "accrual_type": "upfront",
          "max_carry_forward": 5,
          "probation_restriction_days": 90,
          "max_negative_balance": 0,
          "notice_period_max_days": null
        },
        "is_overridden": true,
        "overridden_fields": ["assigned_annual_quota"]
      }
    ]
  }
}
```

`effective` is what applies to this person now; `policy_default` is what the
template says. Both together are what lets the UI say "18 by policy, 24 for
her" instead of showing an empty box. If `overridden_fields` is expensive,
`is_overridden` alone is enough — we can diff the two objects.

**Meanwhile:** every field in the Customise dialog starts blank, with a line
explaining that blank means unchanged. It works, and it is the weakest part of
the leave UI.

---

### 3.3 · P2 · Assign one policy to many people, with a dry run

**The gap.** One POST per person, no preview, and assignment replaces rules
without saying what it replaced.

**Precedent.** The targeting arrays on `POST /attendance/hr/holidays` and
`/weekly-offs` (`target_departments`, `target_locations`,
`target_employment_types`, `target_job_statuses`, `included_users`,
`excluded_users` — ATTENDANCE_API_CONTRACT §2 C7, §5.5).

**Proposed — two endpoints, one body.**

```
POST /api/v1/leaves/assignments/preview     → what would change, writes nothing
POST /api/v1/leaves/assignments/bulk        → does it
Auth: hr, admin, super-admin
```

```json
{
  "template_id": "uuid",
  "effective_from": "2027-01-01",
  "target_departments": ["uuid"],
  "target_locations": [],
  "target_employment_types": ["Full-time"],
  "target_job_statuses": [],
  "included_users": ["uuid"],
  "excluded_users": ["uuid"]
}
```

Preview response — the four buckets the dialog draws:

```json
{
  "success": true,
  "data": {
    "matched": 34,
    "unchanged": [{ "user_id": "uuid", "name": "Asha Menon", "reason": "ALREADY_ON_TEMPLATE" }],
    "changing": [{ "user_id": "uuid", "name": "Rohit Shah", "from_template": "Standard 2025", "to_template": "Standard 2026", "override_count": 2 }],
    "blocked": [{ "user_id": "uuid", "name": "Priya N", "reason": "NO_JOINING_DATE" }]
  }
}
```

Bulk response: the same buckets as outcomes (`assigned`, `skipped`, `failed`
with a `reason` each), so a partial success is reportable per person rather than
as one opaque error. Please make it **all-or-nothing within a transaction, or
per-person with explicit outcomes** — either is implementable on our side, but
we need to know which, because "17 of 24 worked" has to be shown honestly.

A hard cap is fine (say 500 per call); tell us the number and we will page.

**Meanwhile:** HR assigns one person at a time, forty times, and the only
preview is the single person's balances we read before the write.

---

### 3.4 · P2 · Effective dating, and ending an assignment

**The gap.** Leave assignment applies immediately and can never be removed.
There is no `effective_from`, no `effective_to`, and no delete. A policy given
to the wrong person stays on their record; a leaver keeps accruing rules.

**Precedent.** Shift assignments: `effective_from` required, `effective_to`
nullable, `POST …/:id/end`, `DELETE …/:id`, and **no PUT by design** — "to
change an assignment: end it and create a new one. That preserves history"
(ATTENDANCE_API_CONTRACT §2 C2). We would like leave to work exactly this way.

**Proposed.**

| | |
|---|---|
| `POST /leaves/users/:userId/assign-policy` | accept optional `effective_from` (default: today). A future date creates an **upcoming** assignment that does not touch today's balances until it starts. |
| `POST /leaves/assignments/:id/end` | body `{ "effective_to": "YYYY-MM-DD" }`, required — mirrors the shift end route exactly. |
| `DELETE /leaves/assignments/:id` | removes a wrong assignment. Please say whether balances are reversed or left as they are; the confirmation copy depends on the answer, and we will not guess at it on screen. |

If pro-rata for a future-dated assignment is hard, we will take `effective_from`
with same-day-only semantics first and the scheduling later — but please do not
let that block the `end` route, which is a correctness problem today.

---

### 3.5 · P3 · Revert one leave type to the policy default

**The gap.** An override is permanent. `PUT …/configs/:leaveTypeId` can only set
values; there is no way to say "forget the custom number, use the policy".
Re-assigning the whole policy is the only route, and that recomputes everything.

**Proposed.**

```
DELETE /api/v1/leaves/users/:userId/configs/:leaveTypeId
→ drops the override, restores the template's rule for that type,
  adjusts the ledger the same way the PUT already does
```

The UI is one link in the Customise dialog: *Revert to the policy default*.

---

### 3.6 · P3 · Headcount on a policy, and refuse to delete one in use

**The gap.** `GET /leaves/templates` (#6) returns templates and entitlements but
not how many people are on each. So Setup › Leave Policies cannot say "23 people
are on this", and `DELETE /leaves/templates/:id` (#8) deletes a policy with
people on it without a word.

**Precedent.** Rotation patterns return `409 PATTERN_IN_USE` when assignments
reference them (ATTENDANCE_API_CONTRACT §5.3).

**Proposed.**

1. Add `assigned_user_count` (integer) to each row of `GET /leaves/templates`.
2. `DELETE /leaves/templates/:id` → `409 TEMPLATE_IN_USE` with
   `details: { assigned_user_count: 23 }` when anyone is on it. We will show
   "23 people are on this policy — move them first", with a link to the filtered
   assignment list.

Both are cheap and both prevent a quiet data-loss path.

---

### 3.7 · P3 · One summary call for the coverage tiles

Derivable from §3.1 if it returns totals per filter, so treat this as a
convenience, not a requirement:

```
GET /api/v1/leaves/assignments/summary
→ { "on_policy": 142, "unassigned": 8, "with_overrides": 11,
    "templates": [{ "id": "uuid", "name": "Standard 2026", "assigned_user_count": 118 }] }
```

If §3.1 gives us `total` per filtered query, we will make three cheap calls
instead and this can be dropped.

---

## 4. Error codes we will map

We render mapped sentences, never raw codes (`leaveErrors.js`). Please keep to
these names, or tell us yours and we will map them:

| Code | HTTP | When |
|---|---|---|
| `TEMPLATE_NOT_FOUND` | 404 | unknown `template_id` (exists today) |
| `EMPLOYEE_NOT_FOUND` | 404 | unknown `user_id` (exists today) |
| `TEMPLATE_EMPTY` | 400 | the policy has no entitlements, so assigning gives nothing |
| `TEMPLATE_IN_USE` | 409 | delete blocked, with `details.assigned_user_count` |
| `ASSIGNMENT_NOT_FOUND` | 404 | end / delete on an unknown assignment |
| `ASSIGNMENT_ALREADY_ENDED` | 409 | ending one twice |
| `EFFECTIVE_DATE_BEFORE_JOINING` | 400 | `effective_from` precedes the joining date |
| `NO_JOINING_DATE` | 400 | pro-rata cannot be computed — today this is a 500 |
| `BULK_LIMIT_EXCEEDED` | 400 | over the per-call cap, with the cap in `details` |

Two behaviours we would also like pinned down, because the copy on screen
depends on them and we will not assert what we cannot verify:

1. **Assigning the same template twice** — no-op, or does it recompute balances?
2. **Re-assigning mid-year** — are `total_used` days carried into the new
   pro-rata, or does the employee's taken leave reset? This one matters a lot:
   if taken days are lost, HR is handing people free leave by changing a policy
   in July, and we need to warn them in the preview.

---

## 5. What we will ship for each item

| Item | Priority | Frontend work once it lands |
|---|---|---|
| 3.1 list | **P1** | Policy / From / State / Custom columns, the three filters, the "No policy" tile and the record inspector. The page is built; this fills it. |
| 3.2 per-user config | **P1** | Customise dialog prefills, shows policy default vs override, flags customised types. |
| 3.3 bulk + preview | P2 | Department/location/type targeting in the assign dialog, with the four-bucket preview and per-person outcomes. |
| 3.4 dates + end | P2 | `effective_from` field, Upcoming/Ongoing/Ended states, End and Delete row actions — same components as Shift Management. |
| 3.5 revert | P3 | One link in the Customise dialog. |
| 3.6 counts + 409 | P3 | Headcount column on Leave Policies; a real warning before deleting a policy. |
| 3.7 summary | P3 | Four coverage tiles (or three queries if you skip it). |

Nothing here changes an existing response shape or removes a field, so shipping
any item on its own breaks nothing. We would rather have 3.1 and 3.2 alone, soon,
than the whole list later — those two turn a workaround into the screen we
actually designed.

---

## 6. For reference: what we are mirroring

| Leave (asked for) | Attendance (exists) |
|---|---|
| `GET /leaves/assignments` | `GET /attendance/hr/shifts/assignments` |
| `POST /leaves/assignments/:id/end` | `POST /attendance/hr/shifts/assignments/:id/end` |
| `DELETE /leaves/assignments/:id` | `DELETE /attendance/hr/shifts/assignments/:id` |
| `effective_from` / `effective_to` on an assignment | same, on a shift assignment |
| targeting arrays on bulk assign | `POST /attendance/hr/holidays`, `/weekly-offs` |
| `409 TEMPLATE_IN_USE` | `409 PATTERN_IN_USE` on rotation delete |
| `GET /leaves/users/:id/leave-config` | `GET /leaves/my-leave-types`, for the caller |

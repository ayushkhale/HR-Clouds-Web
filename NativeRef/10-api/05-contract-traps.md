# 05 · Contract traps

Every item here has already cost someone a day on the web app. They are not
hypothetical, and the API will not warn you about a single one.

Read before Phase 2. Re-read before Phase 5.

---

## T0 · The master trap: unknown fields are silently dropped

Joi runs with `stripUnknown: true`, which **wins** over `allowUnknown: false`.
Send a field the backend doesn't know and you get **`200 OK` with your field
discarded**.

> **A success response is not evidence that a field was understood.**

Known casualties:

- `work_mode` on **clock-out** — not a clock-out field. Stripped. The punch
  succeeds; the mode you sent never existed.
- `excluded_users` on weekly-off rules — field doesn't exist. Exclusions never
  saved. No error, ever.

**Rule:** when you add a field to any payload, verify it by **reading the
record back**, not by checking the status code.

---

## T1 · `/organizations/employees` is 403 for an employee

The web `employeeDirectoryStore` is the app's single source of people, and for
an employee it reports `status: "unavailable"` and **requests nothing**.

In this app:

- **Do not port the employee-directory store.**
- People come from `/organizations/directory` (public-safe, open to every role)
  and from names already embedded in each payload.
- `personName()` from `lib/normalize.js` reads a name off any row shape without
  a second request. Use it first; fall back to the directory only for a bare
  `user_id`.
- An unresolved name reads **"Loading…"**, then **"Unknown user"** — never the
  id, never "not found".

---

## T2 · `/attendance/today` may return *yesterday*

While an overnight record from yesterday is still open, `/today` returns **that
record**, and `date` is yesterday. This is deliberate: it stops you rendering a
Clock In button that could only fail with `PREVIOUS_SHIFT_OPEN`.

```js
const recordDate = ymdOnly(today?.date);
const carriedOver = phase === 'working' && !!recordDate && recordDate < todayYMD();
// Render the date from the payload. Never from your own "today".
```

Show the carried-over state explicitly: "Still clocked in from Thu, 9 Oct".

---

## T3 · `/attendance/history` does not accept `month` / `year`

Only `from`, `to`, `page`, `limit`. A month view must build the range:

```js
const { from, to } = monthRange(year, month);   // lib/dates.js
attendanceAPI.getHistory({ from, to, page, limit });
```

Sending `month`/`year` gets you page 1 of **everything**, silently (see T0).

---

## T4 · `/attendance/holidays` takes no `year`

The validator declares none and the route has no `validate()`. Sending `year`
is ignored. Fetch all, filter client-side. (An older doc shows a `year`
parameter; that doc is wrong.)

---

## T5 · `GET /attendance/regularizations` ignores `status`

The validator accepts it; the controller drops it:

```js
const result = await regularizationService.getEmployeeRequests(orgId, userId, page, limit);
// ...status never passed
```

So status tabs **do not filter server-side**. Fetch unfiltered and filter the
loaded page client-side — and be honest about it: with pagination on, a
"Pending" tab shows the pending items *on this page*, not all pending items.
The web screen does exactly this; match it.

---

## T6 · Anomalies carry `is_resolved`, not `status`

The query filter is `status=open|resolved|all`, but records have **no `status`
column**. Always derive:

```js
const anomalyStatusKey = (a) => (a?.is_resolved === true || !!a?.resolved_at ? 'resolved' : 'open');
```

`type` and `severity` are free-form strings — run them through
`anomalyTypeLabel()` / `SEVERITY`, never render them raw.

**And:** clock-in and clock-out each raise their **own** geofence anomaly. Two
rows in one day is correct and must **not** be de-duplicated. The backend puts
the side at the start of `description`, so `anomalyLabel()` renders
"Clock-out · Punched away from the work location". Without that, a clock-out
breach (someone driving home) reads as a duplicate complaint about a clock-in
that was fine.

---

## T7 · Comp-off reject writes `cancelled`, not `rejected`

There is **no `rejected` state** for an earned-leave record. The reject endpoint
writes `cancelled`. So:

- `cancelled` must read **"Rejected or cancelled"** — the employee cannot tell
  which, and neither can you.
- Rejected items must stay **visible**, not filtered out as "cancelled by me".
- `earned` alone reads as already-in-the-balance, so the label is
  **"Earned · waiting for approval"**.

---

## T8 · Leave cancellation branches on the **date**, not the status

- Leave entirely in the **future** → cancelled immediately, balance refunded.
- Leave that has **started** (today or earlier) → `cancellation_pending`, needs
  manager approval.

Nothing in the request says which will happen. Read `response.message` for
"pending manager approval" and show the right toast. The web helper:

```js
function hasLeaveStarted(startDateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(`${String(startDateStr).slice(0, 10)}T00:00:00`); // force local midnight
  return !Number.isNaN(start) && start <= today;
}
```

Note the `T00:00:00` — without it, `new Date("2026-10-13")` is UTC midnight and
is the previous day in a negative-offset zone.

---

## T9 · Leave attachments: `document_url` is not a URL

With `document_id`, the server stores the **relative path**
`/api/v1/documents/attachments/:id/view-url` into `document_url`. That is not
something a client can open.

Every leave attachment must go through
`GET /documents/attachments/:id/view-url` (the attachment bridge), which works
out whether you are the applicant, the manager chain or HR, and gives everyone
else a uniform 404.

Also: `document_url` and `document_id` are **mutually exclusive**. Send one or
neither.

---

## T10 · `/attendance/shift` returns a wrapper, not a shift

```json
{ "assignment": {…}, "shift": {…}, "rotation": {…}, "weekly_offs": [...] }
```

Reading `name` off the top level left the shift line blank on every dashboard on
web. Unwrap it:

```js
const wrapped = !!shiftData && typeof shiftData === 'object' && 'shift' in shiftData;
const assigned = wrapped ? shiftData.shift : shiftData;
const shift = assigned || today?.shift || null;   // no assignment → /today's own copy
```

A `shift: null` is a **valid state** — "No shift assigned", not an error.

---

## T11 · Work mode: two vocabularies for one idea

| Where | Values |
|---|---|
| Organisation / profile (contractual) | `on-site` · `remote` · `hybrid` · `field` |
| Attendance records and punches | `office` · `remote` · `hybrid` · `field` |

`on-site` and `office` are the **same mode** and must never be compared
directly. A `null` contractual mode is **fail-secure: it reads as `office`**.
Always normalise through `normalizeWorkMode()`.

And only a **hybrid** contract gets a choice:

```js
permittedWorkModes('hybrid') // → ['office', 'remote']   → show the toggle
permittedWorkModes('field')  // → ['field']              → show nothing
```

For everyone else the contract decides, the server overrides whatever you send,
and sending it anyway raises a `work_mode_claim_mismatch` **flag against the
employee**. Showing a toggle to a non-hybrid employee actively harms them.

---

## T12 · `matched_location_id` is polymorphic

On a punch's `geofence` object:

- `matched_location_type: "office"` → the id is an `organization_locations.id`
- `matched_location_type: "field"` → it's an `organization_field_locations.id`

Branch on the **type** before looking it up, and **never print the id**
(house rule §4). Resolve it to a name from `/attendance/my-field-assignments`;
an unmatched id yields `""` and the copy drops the name clause rather than
printing "Unknown".

---

## T13 · The punch always succeeded

Every geofence outcome describes something about a punch that **was recorded**.
The server returns **201/200 in all four cases**.

A geofence result must never:

- roll back optimistic UI,
- render in **rose**,
- read as "couldn't clock you in".

An out-of-bounds punch is a flag for a manager to review, not an error the
employee just made. And `geofence_unresolved` means **nobody finished
configuring a work location** — no assigned office, no active branch, no
assigned site, or a location with no GPS pin. It reads "No work location set up
to check against", routes to a setup queue, and is the one anomaly type whose
fix belongs to HR rather than the employee. Never word it as misconduct.

---

## T14 · Decimals arrive as strings

`total_hours: "8.50"`, `effective_hours: "8.00"`, rates as `"50.0000"`. Sequelize
`DECIMAL`. **Parse before arithmetic**, or `"8.50" + 1` is `"8.501"`.

And `effective_hours` can be **negative** when breaks outlast the punches
(e.g. `-0.02`). Hours worked cannot go below zero, so every duration renders
`Math.max(0, …)` → "0m". `fmtHours()` already does this.

---

## T15 · Worked time comes from the server, in one specific field

`worked_duration_formatted` (`"8h 32m"`, breaks already deducted, the same
figure the policy and overtime use) is the **source of truth**.
`effective_hours` is only a fallback for reads that don't carry it.

**Never derive worked time from clock-in/clock-out.** You will disagree with
payroll.

The server writes `"8h 0m"` and `"0h 0m"`; the client writes `"8h"` and `"0m"`.
The same day showed both ways on two web screens until `workedLabel()` tidied
it. Use `workedLabel(record)` and `totalWorkedLabel(summary)`.

---

## T16 · Server "today" is `Asia/Kolkata` (and one endpoint is UTC)

`clock.service.js` uses `dayjs().tz('Asia/Kolkata')` for `/today`, `/summary`
and `/shift` defaults, **ignoring the org's configured timezone**. Correct for
Indian orgs, wrong for anyone else.

**Pass explicit dates wherever an endpoint accepts one.**

Client-side, "today" must be the **device's local** date.
`toISOString().split('T')[0]` returns **yesterday** in IST between 00:00 and
05:29. Use `todayYMD()`.

---

## T17 · `client_timestamp` is accepted but not authoritative

Accepted on both punch endpoints and stored, but **not** used as the punch time
today. Keep sending it as diagnostic metadata; **don't build anything that
assumes the server honours it**. (If it ever became authoritative, a user could
backdate punches by changing the device clock — which is why it isn't.)

---

## T18 · `account_type` is exactly `savings` or `current`, lowercase

Verified against the live API 2026-09-26. Anything else — including `"SAVINGS"`
or `"salary"` — is refused with `"account_type" must be one of [savings,
current]`. Default to `savings`; that is what salary is almost always paid into.

---

## T19 · `/documents/me/documents/all` — sections fail independently

Each section can come back `{ available: false, reason }` while the others are
fine. **No section's failure may blank the screen** — render the sections you
got and a quiet note on the one you didn't.

And **no item carries a signed URL.** Each has `access.path`: the endpoint to
call when the person actually taps it. That is why a 60-item home screen costs
nothing and logs nothing until something is opened. **Don't pre-fetch those
URLs** — you'd be generating audit-logged access events for documents nobody
opened.

---

## T20 · A held payslip is indistinguishable from one that doesn't exist

By design. Do not invent a "held" badge or a "coming soon" row. If a payslip
isn't in the list, it isn't there. A 403 on the PDF route gets
`payslipDownloadMessage()`, which says "not released yet" rather than
"not found" — that is the only place the distinction is surfaced, and only
because the person explicitly asked for that file.

---

## T21 · Presigned URLs die in minutes

| Thing | Lifetime |
|---|---|
| `avatar_url` on a roster/directory row | **~5 minutes** |
| Attachment `view-url` | short-lived, signed |
| Document `view-url` | short-lived, signed |
| Letterhead asset URLs | 5 minutes |

**Never cache one.** Never store one in AsyncStorage, never put one in a
navigation param, never hold one across a background/foreground cycle. Re-read
the URL at the moment of use. On web, `GenderAvatar` reports a failed photo load
so the store can refresh links; do the same on native with an `onError` →
refetch path.

---

## T22 · Pagination keys and position both vary

| Variation | Who |
|---|---|
| `totalPages` (camel) | every self-service list |
| `total_pages` (snake) | HR reads (not your problem here) |
| `pagination` **inside** `data` | attendance |
| `pagination` **beside** `data` | payroll, organisation |
| **no** pagination metadata at all | several endpoints |

`normalizePaginated()` handles all five. Critically, with **no** metadata it
never fabricates page counts from the requested limit — otherwise every "page"
re-renders the same full list.

Also: the dense attendance history endpoints **paginate over calendar days, not
records**. "30 records" for September is a lie — pass `noun="day"`.

---

## T23 · `/leaves/my-requests` is unpaginated

It returns the caller's whole history, `created_at DESC`. On a phone with a
long-serving employee that can be hundreds of rows. Use a `FlatList` with
`initialNumToRender` and windowing, and filter/limit in the UI — **don't** add a
`page` param hoping it works (T0: it would be silently stripped).

---

## T24 · Some decision endpoints return no `data` key

Approve/reject on regularization, overtime, comp-off and anomaly answer with no
`data` at all. An employee never calls those, but `unwrap()` must not assume a
`data` key exists — and when the manager app arrives, this is the first thing
that breaks.

---

## T25 · `ALREADY_CLOCKED_IN` is not an error

Nor are `NOT_CLOCKED_IN` and `NO_ACTIVE_BREAK`. They mean the server and the
screen disagree about reality — usually because another device punched first, or
a biometric punch was processed asynchronously. The server is right.

Refresh quietly, show the note in **slate**, and don't make the person feel they
did something wrong. `isStateReconciliation(err)` identifies them.

---

## Trap checklist before you ship a module

- [ ] Every payload field verified by reading the record back (T0)
- [ ] No `/organizations/employees` call anywhere (T1)
- [ ] Dates rendered from the payload, not from the device (T2, T16)
- [ ] `from`/`to`, not `month`/`year`, on history (T3)
- [ ] Client-side filtering labelled honestly where the server ignores a filter (T5)
- [ ] `is_resolved` not `status` on flags; both punch sides shown (T6)
- [ ] `cancelled` reads "Rejected or cancelled" (T7)
- [ ] Both leave-cancel outcomes produce correct copy (T8)
- [ ] Attachments go through the bridge (T9)
- [ ] Shift unwrapped; `null` is a valid state (T10)
- [ ] Work-mode toggle shown **only** to hybrid contracts (T11)
- [ ] No id on screen; location resolved to a name (T12)
- [ ] Nothing about a geofence result is rose or reads as a failure (T13)
- [ ] Decimals parsed; durations clamped at zero (T14)
- [ ] Worked time read from `worked_duration_formatted` (T15)
- [ ] No presigned URL cached anywhere (T21)
- [ ] Lists use `normalizePaginated`; day-paginated lists say "day" (T22)

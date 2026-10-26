# 03 · Payload shapes

Shapes marked **verified** were read out of the backend's own validators and
service return statements (via `public/ref docs/md_attendance/ATTENDANCE_API_CONTRACT.md`,
which was produced from source). Shapes marked **observed** are the field names
the web screens actually read — accurate for what's used, not necessarily
exhaustive. Anything marked **unverified** should be confirmed with your
`DebugScreen` in Phase 0 before you build on it.

Never assume a key exists because it's listed here. Gate on what came back.

---

## Envelope

```jsonc
// success
{ "success": true, "message": "Attendance fetched", "data": { /* … */ } }

// error
{ "success": false, "message": "…", "code": "MACHINE_CODE" }        // attendance, leave
{ "success": false, "message": "…", "errorCode": "MACHINE_CODE",     // payroll, documents
  "details": [{ "path": "account_type", "message": "…" }] }
```

---

## Attendance

### `GET /attendance/today` — **verified**

No record yet:

```jsonc
{
  "date": "2026-10-13",
  "status": "not_marked",            // or "holiday" | "weekly_off"
  "clock_in_time": null,
  "clock_out_time": null,
  "effective_hours": null,
  "break_duration_minutes": 0,
  "active_break": null,
  "breaks": [],
  "shift": { "name": "General", "start_time": "09:00", "end_time": "18:00", "type": "fixed" },
  "late_minutes": 0,
  "is_holiday": false,
  "is_weekly_off": false
}
```

With a record: the same keys, plus `total_hours`, and `status` becomes the
record's status. **`shift` is `null` when no shift is assigned — guard for it.**

`status` values: `not_marked` · `present` · `absent` · `half_day` · `holiday` ·
`weekly_off` · `on_leave` (and `in_progress` while clocked in).

Breaks, authoritatively:

```jsonc
{
  "break_duration_minutes": 45,                                   // closed breaks, persisted column
  "active_break": { "id": "…", "start_time": "…", "end_time": null },
  "breaks": [ { "id": "…", "start_time": "…", "end_time": "…" } ]
}
```

`break_duration_minutes` is authoritative for **closed** breaks. Add live
elapsed time from `active_break.start_time` only while a break is open.
`active_break` is derived as the entry in `breaks[]` with `end_time === null` —
you don't need to scan for it. (`lib/liveHours.js` does exactly this.)

**Derive the phase from `status`, never from the clock times:**

```js
const phase =
  !today ? (loading || error ? 'unknown' : 'idle')
  : status === 'in_progress' || (clockIn && !clockOut) ? 'working'
  : clockOut ? 'done'
  : 'idle';
const onBreak = phase === 'working' && !!today?.active_break;
```

A `data: null` response must still offer Clock In, not a card with no actions.

### `POST /attendance/clock-in` — **verified**

```js
{
  source:           'mobile',                 // 'web' | 'mobile' | 'api', default 'web'
  latitude:         12.9716,                  // -90..90, nullable, optional
  longitude:        77.5946,                  // -180..180, nullable, optional
  client_timestamp: '2026-10-13T09:02:11.000Z', // nullable, optional — diagnostic only (T17)
  notes:            'Client site visit',      // ≤ 500 chars, nullable
  work_mode:        'office',                 // hybrid contracts ONLY (T11)
  metadata:         { device: 'Pixel 8', app_version: '1.0.0' },
}
```

`POST /attendance/clock-out` — identical **minus `work_mode`** (silently
stripped, T0).

`POST /attendance/break/start` · `/break/end` — `{ source, notes? }`.

### Punch response — the `geofence` object — **observed, contract-backed**

```jsonc
{
  "record": { /* the attendance record */ },
  "geofence": {
    "evaluated": true,                    // false = no check ran (remote, WFH, biometric)
    "outcome": "out_of_bounds",           // in_bounds | out_of_bounds | missing_coordinates | unresolved
    "distance_meters": 1420,
    "matched_location_id": "…",           // POLYMORPHIC — see T12
    "matched_location_type": "field"      // "office" | "field"
  }
}
```

Read it **only** through `lib/geofence.js`:

```js
const notice = geofenceNotice(geofence, locationNameFor(geofence));
// → { tone: 'amber', text: 'Recorded 1.4 km from Tata Steel Pune. Your manager
//     has been notified — send a correction request if you were at a client site.' }
// → or null, when there is nothing worth saying
```

`evaluated: false` is the normal, silent case. The punch screen shows **no
geofence chrome at all** for it — a remote employee should never see geofence
wording.

### `GET /attendance/history` — **verified**

Query: `from`, `to` (ISO dates), `page` ≥ 1, `limit` 1–100. **No `month`/`year`.**

```jsonc
{
  "records": [{
    "id": "uuid",
    "date": "2026-10-13",
    "status": "present",
    "clock_in_time": "2026-10-13T03:32:00.000Z",
    "clock_out_time": "2026-10-13T12:34:00.000Z",
    "total_hours": "8.50",              // STRING (T14)
    "effective_hours": "8.00",          // STRING, can be negative (T14)
    "break_duration_minutes": 30,
    "late_minutes": 0,
    "early_exit_minutes": 0,
    "overtime_minutes": 45,
    "work_mode": "office",
    "half_day_type": null,
    "is_regularized": false,
    "shift": { "name": "General", "start_time": "09:00", "end_time": "18:00" }
  }],
  "pagination": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 }
}
```

Rows may also carry `worked_duration_formatted` (`"8h 32m"`) — **that is the
source of truth for worked time** (T15). And `status_context` /
`status_reason` on newer reads, which drive the day-status note (see
[30-domain/04-attendance.md](../30-domain/04-attendance.md)).

### `GET /attendance/summary` — **verified, all 14 keys**

```jsonc
{
  "month": 10, "year": 2026, "total_records": 22,
  "present_days": 18, "half_days": 2, "absent_days": 1, "late_days": 3,
  "holiday_days": 1, "weekly_off_days": 8, "on_leave_days": 0,
  "total_hours_worked": 152.5, "average_hours_per_day": 7.63,
  "total_overtime_minutes": 210, "total_break_minutes": 660
}
```

> **`late_days` is not a mutually exclusive bucket** — it counts records with
> `late_minutes > 0`, which overlaps `present_days`. **Never put it in a
> total-days donut.** The web attendance-mix pie uses exactly four slices:
> present · half day · on leave · absent.

May also carry `total_worked_duration_formatted` — prefer it via
`totalWorkedLabel(summary)`.

### `GET /attendance/daily-log` — **object, not an array** (not exhaustively verified)

```jsonc
{
  "record":   { /* the day's attendance record */ },
  "logs":     [ { "type": "clock_in", "timestamp": "…", "work_mode": "office", "notes": null } ],
  "sessions": [ { "start": "…", "end": "…", "minutes": 240 } ],
  "breaks":   [ { "start_time": "…", "end_time": "…", "minutes": 30 } ],
  "anomalies":[ { "type": "late_arrival", "severity": "low", "is_resolved": false, "description": "…" } ]
}
```

Older payloads returned the punch list **directly as an array**. Handle both:

```js
const logs = Array.isArray(payload) ? payload
  : payload?.logs || payload?.punches || payload?.attendance_logs || [];
```

`type` values: `clock_in` · `clock_out` · `break_start` · `break_end`
(→ `PUNCH_TYPE_LABELS`).

### `GET /attendance/shift` — **wrapper** (T10)

```jsonc
{
  "assignment": { "id": "…", "effective_from": "2026-04-01", "effective_to": null },
  "shift": { "name": "General", "start_time": "09:00", "end_time": "18:00",
             "type": "fixed", "policy_id": "…" },
  "policy": { "name": "Corporate Standard", "grace_minutes": 15,
              "half_day_min_hours": 4.00, "full_day_min_hours": 8.00,
              "max_breaks_per_day": 3, "max_break_duration_minutes": 60,
              "regularization_allowed": true, "regularization_window_days": 7, … },
  "rotation": null,
  "weekly_offs": [0, 6]
}
```

`shift: null` is valid → "No shift assigned" — and the org's DEFAULT policy
still applies, so `policy` can be present without a shift.

`policy` is a SIBLING of `shift`, not nested inside it, and arrived with the
2026-10-21 enrichment — treat it as optional and hide anything that needs it
when it is absent. Thresholds are **decimal hours**
(`full_day_min_hours: 8.00`), often as strings off numeric columns.

CORRECTION (2026-10-21): this block previously documented
`shift.policy.full_day_threshold_minutes`, in minutes and nested. No such key
exists in the backend schema (`md_attendance/5_hr_attendance_api.md` §1) and the
web punch card believed it, so its progress ring read `undefined` and never drew
an arc. Read thresholds through `fullDayMinutes()` /`halfDayMinutes()` in
`shared/attendance/policyRules.js`, which does the × 60 once and accepts both
spellings.

### `GET /attendance/my-field-assignments` — **observed**

```jsonc
{
  "user_id": "…",
  "work_mode": "field",                  // normalised, fail-secure (null → "office")
  "assigned_office": { "id": "…", "name": "Bengaluru HQ", "latitude": …, "longitude": … },
  "total": 2,
  "records": [{
    "id": "…",
    "effective_from": "2026-09-01", "effective_to": null,
    "is_active": true,
    "field_location": { "id": "…", "name": "Tata Steel Pune",
                        "client_name": "Tata Steel", "geofence_radius_meters": 200 }
  }]
}
```

**This is the only source for the work-mode toggle decision.** A failed read
leaves `contract = null`, which hides the toggle and the sites panel — a missing
backend feature degrades to a hidden control, never a crash.

### `GET /attendance/comp-offs/mine` — **undocumented shape, accept all variants**

The record shape is not documented (audit C11). The web screen accepts every
field name used across the user / manager / HR views of the same entity:

```js
const workedDate = (r) => ymdOnly(r.earned_date || r.worked_date || r.date || r.work_date);
const creditDays = (r) => r.days_earned ?? r.credit_days ?? r.days ?? r.comp_off_days ?? null;
const expiryDate = (r) => ymdOnly(r.expiry_date || r.expires_on || r.expires_at || r.valid_until);
```

Port these accessors verbatim. `status`: `earned` · `approved` · `used` ·
`expired` · `cancelled` (**no `rejected`** — T7).

### `GET /attendance/overtime/mine` — **undocumented shape**

Minutes are the canonical unit; hours are a fallback:

```js
function overtimeMinutes(r) {
  if (r.overtime_minutes != null) return Number(r.overtime_minutes);
  if (r.minutes != null) return Number(r.minutes);
  if (r.requested_minutes != null) return Number(r.requested_minutes);
  if (r.hours != null) return Math.round(Number(r.hours) * 60);
  return null;
}
```

### `GET /attendance/anomalies/mine` — **verified behaviour**

```jsonc
{
  "anomalies": [{
    "id": "…",
    "date": "2026-10-13",
    "type": "out_of_bounds",          // free-form string
    "severity": "medium",             // low | medium | high | critical
    "is_resolved": false,             // ← the status. There is NO `status` key (T6)
    "resolved_at": null,
    "description": "Clock-out 1420m from assigned location"
  }],
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
}
```

`description` begins with the punch side — that's how `anomalyPunchSide()`
distinguishes a clock-in flag from a clock-out flag (T6).

### `POST /attendance/regularization` → **201** — **verified**

```js
{
  date:                '2026-10-10',        // REQUIRED, ISO date
  requested_clock_in:  '2026-10-10T03:30:00.000Z',  // ISO datetime | 'HH:mm' | 'HH:mm:ss'
  requested_clock_out: '2026-10-10T12:30:00.000Z',
  reason:              'Forgot to clock out',       // REQUIRED, 5–1000 chars
  work_mode:           'office',                    // optional, nullable
}
```

**At least one of `requested_clock_in` / `requested_clock_out` is required** —
sending neither is a 400. For **overnight** corrections send **full ISO
datetimes**; with bare `HH:mm` the backend cannot tell the clock-out belongs to
the next day.

---

## Leave

### `GET /leaves/my-balances` — **observed** (the fields the web screen reads)

```jsonc
{
  "balances": [{
    "leave_type_id": "…",
    "leave_type": { "id": "…", "name": "Casual Leave", "code": "CL", "color": "…" },
    "current_balance": "12.50",     // STRING. → formatDayCount → "12 Days and 1 Half Day"
    "total_accrued": "15.00",       // "given so far"
    "total_used": "2.50",           // "used"
    "year": 2026
  }]
}
```

The web screen also computes a **pending hold** (days sitting in pending
requests) and shows `available − pendingHold` as the effective balance. That is
a client-side derivation, not a server field — and it needs an ⓘ because it is a
derived figure.

### `GET /leaves/my-leave-types` — **observed**

Active types tailored to the caller's per-user config: the dropdown source for
Apply. Carries the per-type rules the form needs (half-day allowed, document
required above N days, demographic restrictions).

### `POST /leaves/request` — **verified**

```jsonc
{
  "leave_type_id": "a1b2…",          // required, must exist
  "start_date": "2026-10-20",        // required, literal YYYY-MM-DD, no timezone
  "end_date":   "2026-10-22",        // required
  "is_half_day": false,
  "half_day_type": null,             // 'first_half' | 'second_half' when is_half_day
  "reason": "Personal time",
  "document_url": null,              // XOR with document_id (T9)
  "document_id": null
}
```

The backend auto-handles holidays, weekends, the sandwich rule and unpaid days.
**Take the day count from the response**, never compute it.

### `POST /leaves/requests/:id/cancel`

No body. Outcome depends on the **date** (T8). Read `response.message` for
"pending manager approval".

---

## Pay

### `GET /payroll/me/salary-structure` — **observed**

```jsonc
{
  "structure": {
    "id": "…", "ctc": "1200000.00",
    "effective_from": "2026-04-01",
    "revision_type": "increment",         // initial|increment|promotion|correction|restructure
    "revision_reason": "Annual review",
    "components": [{
      "component_code": "BASIC", "component_name": "Basic",
      "type": "earning",                  // earning | deduction
      "calculation_type": "flat",         // flat | percent_of_basic | percent_of_ctc | balancing
      "value": "50000.00",
      "monthly_amount": "50000.00", "annual_amount": "600000.00"
    }]
  },
  "statutory_breakdown": { /* PF, ESI, PT, TDS — employee and employer shares */ }
}
```

Render a component's value with `formatComponentValue()`: `flat` → money,
`balancing` → "Auto (remainder)", anything else → a rate.

**`statutory_breakdown` may be absent.** That is a hidden panel with a quiet
notice, not a crash and not an empty card.

### `PUT /payroll/me/bank-account`

```jsonc
{
  "account_holder_name": "…",
  "bank_name": "…",
  "account_number": "…",
  "ifsc_code": "SBIN0001234",
  "branch_name": "…",
  "account_type": "savings"          // EXACTLY "savings" | "current", lowercase (T18)
}
```

### `GET /payroll/me/payslips` / `…/:runId` — **observed**

```jsonc
{
  "payslips": [{
    "run_id": "…",                     // may arrive as payroll_run.id or runId
    "period_month": "2026-09",         // always YYYY-MM → formatPeriod() → "September 2026"
    "net_pay": "87432.00",
    "gross_earnings": "105000.00",
    "total_deductions": "17568.00",
    "paid_days": "30.00",              // → formatDayCount
    "unpaid_days": "0.00"
  }]
}
```

Accessors the web screen uses, because the key moves:

```js
const slipRunId = (s) => s.run_id || s.payroll_run?.id || s.runId;
const slipPeriod = (s) => s.period_month || s.payroll_run?.period_month;
```

Detail adds `earnings[]` and `deductions[]` line items — render them in two
sections, **Earnings first**, stacked on a phone.

### Presigned attachment upload — the three-step dance

```jsonc
// 1. POST /payroll/me/reimbursements/claims/:claimId/items/:itemId/attachments
//    body:
{ "file_name": "receipt.jpg", "content_type": "image/jpeg", "file_size": 284311 }
//    → response:
{ "attachment_id": "…", "upload_url": "https://s3…?X-Amz-Signature=…", "expires_in": 300 }

// 2. PUT the bytes to upload_url — NO Bearer token, NOT through api/client.js.
//    Content-Type MUST equal what you declared, or the signature fails.

// 3. POST /payroll/me/attachments/:attachment_id/confirm
```

Miss step 3 and the file is in storage but not on the record. The same shape
serves tax-declaration proofs, personal documents and the avatar.

---

## Documents

### `GET /documents/me/documents/all` — **contract-backed** (T19)

```jsonc
{
  "sections": {
    "my_documents":      { "available": true,  "items": [ /* … */ ], "total": 7 },
    "company_documents": { "available": true,  "items": [ /* … */ ], "total": 3 },
    "forms":             { "available": true,  "items": [ /* … */ ], "total": 12 },
    "payslips":          { "available": false, "reason": "Payroll is not enabled" }
  }
}
```

Each item carries `access.path` — **the endpoint to call when tapped** — and
**no signed URL**. Render the sections you got; a failed section gets a quiet
note, never a blank screen.

### `POST /documents/me/hr-documents/:id/acknowledge`

Body is exactly `{ "confirm": true }`. Signing is a separate call:
`POST …/sign` with `{ "signer_name": "Asha Rao" }`.

### `GET /documents/attachments/:id/view-url`

`?disposition=inline|attachment` → a short-lived signed URL. **Never cache it**
(T21). One stored path serves the applicant, the manager chain and HR; anyone
else gets a uniform 404.

---

## Organisation

### `GET /organizations/me` — **observed**

The signed-in person's profile: name, `employee_code`, `email`, `gender`,
`avatar_url` (**presigned, ~5 min — T21**), department, designation,
`date_of_joining`, `work_mode`, reporting manager, and the HR-maintained fields
shown read-only on My Profile.

A login response and a JWT carry only an id, a role and an identifier, so
**this call is what supplies the person's name.** Without it the app greets
people by their email address. Fetch it on every session start (sign-in, org
selection, org switch, and token restore) — and treat a failure as **non-fatal**:
every screen that shows a name already falls back, and a profile read that times
out must not cost somebody their session.

### `GET /organizations/directory` — **observed**

```jsonc
{
  "employees": [{
    "user_id": "…", "name": "Asha Rao", "employee_code": "HRC-0142",
    "designation": "Design Lead", "department": { "name": "Design" },
    "email": "…", "gender": "female", "avatar_url": "https://…"   // presigned
  }],
  "pagination": { "page": 1, "limit": 20, "total": 143 }
}
```

Public-safe. Paginated. `?search=` and `?department=`. This is **the** people
source for this app (T1).

### `GET /organizations/hierarchy`

The reporting tree for the Org Chart. On a phone, render it as a drill-down, not
a canvas — see [40-screens/07-org-and-profile.md](../40-screens/07-org-and-profile.md).

---

## Normalising anything

```js
import { unwrap, listFrom, normalizePaginated, num } from '@/lib/normalize';

const data  = unwrap(res);                                    // strips { success, data }
const rows  = listFrom(res, ['comp_offs', 'compOffs', 'records']);  // finds the array
const paged = normalizePaginated(res, ['records'], { page, limit });
const hours = num(record.effective_hours, 0);                 // string decimal → number
```

`listFrom` tries your keys first, then
`records · requests · items · rows · results · list · data`, and looks **one
nested level** deep (`{ data: { records: [] } }`). That is why screens never
chain `data.data || data.x || data` — and must not start.

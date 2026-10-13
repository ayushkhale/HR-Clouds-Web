# 04 · Attendance domain

The most important module in the app, and the one with the most ways to be
subtly wrong. Everything here is derived from
`public/ref docs/md_attendance/ATTENDANCE_API_CONTRACT.md` and the web
implementation.

---

## 1. The punch state machine

State comes from the backend's `/today` payload. **Never re-derive it.**

```
         ┌──────────────────────────────────────────────┐
         │                                              │
    ┌────▼────┐   clock-in    ┌─────────┐  clock-out  ┌─┴──────┐
    │  idle   │──────────────►│ working │────────────►│  done  │
    └─────────┘               └──┬───┬──┘             └────────┘
                                 │   │
                     break-start │   │ break-end
                                 ▼   │
                            ┌─────────┴──┐
                            │  onBreak   │   (a sub-state of working)
                            └────────────┘
```

```js
const status   = today?.status;
const clockIn  = today?.clock_in_time;
const clockOut = today?.clock_out_time;

const phase =
  !today                                        ? (loading || error ? 'unknown' : 'idle')
  : status === 'in_progress' || (clockIn && !clockOut) ? 'working'
  : clockOut                                    ? 'done'
  : 'idle';

const onBreak = phase === 'working' && !!today?.active_break;
```

| Phase | Shows | Actions |
|---|---|---|
| `idle` | Today's date, shift, holiday / weekly-off / leave context | **Clock in** |
| `working` | Live timer, progress ring, clock-in time, breaks so far | **Clock out** · Start break |
| `working` + `onBreak` | Break timer | **End break** only |
| `done` | The server's calculation: worked, effective, late, overtime, breaks | — |
| `unknown` | Skeleton or error | Try again |

**A `data: null` response must still offer Clock in** — not a card with no
actions.

### Rules

- `idle` on a holiday or weekly off still offers Clock in (people do work those
  days — that's how earned leave is created), but says what the day is.
- `done` figures are the **server's**, not yours. Clock-out returns the
  authoritative calculation; show that.
- The live timer only runs in `working`. Clear the interval on leaving it.
- The ring's target is `policy.full_day_threshold_minutes` from
  `/attendance/shift`. **No threshold → no ring**, just the figure. Don't invent
  an 8-hour default.

### The overnight carry-over (T2)

```js
const recordDate  = ymdOnly(today?.date);
const carriedOver = phase === 'working' && !!recordDate && recordDate < todayYMD();
```

While yesterday's record is still open, `/today` returns **yesterday's** record
with `date` = yesterday. Render from the payload's date and say so:
"Still clocked in from Mon, 12 Oct".

---

## 2. Location, and why it never blocks

```js
// lib/location.js — the native port of shared/attendance/geolocation.js
export const GEO_STATUS = {
  GRANTED: 'granted', DENIED: 'denied', UNSUPPORTED: 'unsupported',
  TIMEOUT: 'timeout', UNAVAILABLE: 'unavailable', INSECURE: 'insecure',
};

// NEVER rejects. Always resolves to { status, coords? , message? }
export async function getDeviceLocation({ timeout = 10000 } = {}) { … }
```

The contract: **punches must not be hard-blocked on location** — the backend
accepts a punch without coordinates and flags it itself — **but the user must be
told explicitly when location could not be captured.**

Flow:

```
tap Clock in
  └─ busy = 'locating'
       └─ getDeviceLocation()
            ├─ granted   → punch with lat/lng
            └─ anything else
                 └─ explain it, offer [Try again] and [Continue without location]
                      └─ "Continue without location" punches with no coordinates
```

- `INSECURE` doesn't occur on native (no http origin) — keep the key for parity.
- `UNSUPPORTED` means location services are off at the OS level, which is
  different from permission denied. Deep-link to settings for the former,
  re-prompt for the latter.
- A permanently denied permission (`blocked`) can only be fixed in Settings —
  say so and offer `openSettings()`, don't loop the prompt.

Native specifics are in
[60-ops/02-permissions-and-native.md](../60-ops/02-permissions-and-native.md).

---

## 3. Work mode — show the toggle to almost nobody

```js
const contract = await attendanceAPI.getMyFieldAssignments();  // the ONLY source
const canDeclare = choosesWorkMode(contract?.work_mode);       // hybrid only
const options = canDeclare
  ? WORK_MODES.filter(m => permittedWorkModes(contract.work_mode).includes(m.value))
  : [];
```

| Contract | Toggle? | Options |
|---|---|---|
| `hybrid` | **Yes** | Office · Remote |
| `on-site` / `office` | No | — |
| `remote` | No | — |
| `field` | No | — |
| `null` | No | fail-secure → treated as office |

For everyone but a hybrid employee the contract decides, the server overrides
whatever you send, and **sending it anyway raises a
`work_mode_claim_mismatch` flag against them.**

A failed `/my-field-assignments` read leaves `contract = null`, which hides the
toggle and the sites panel. A missing backend feature degrades to a hidden
control, never a crash.

The last chosen mode is remembered in AsyncStorage under
`hrclouds_attendance_work_mode`, validated against `WORK_MODE_VALUES` on read.

---

## 4. Geofence — four outcomes, none an error

Covered in [02-enums-statuses.md](02-enums-statuses.md) § 9. The three rules
again, because they're the ones most likely to be broken:

1. **The punch always succeeded** — 201/200 in all four cases.
2. **Never rose**, never "couldn't clock you in", never roll back optimistic UI.
3. **`evaluated: false` is silent.** Show nothing.

Resolving the location name without printing an id (T12):

```js
const locationNameFor = (gf) => {
  if (!gf?.matched_location_id) return '';
  const id = String(gf.matched_location_id);
  if (gf.matched_location_type === 'field') {
    const hit = (contract?.records || []).find(r => String(r.field_location?.id) === id);
    return hit?.field_location?.name || '';
  }
  return String(contract?.assigned_office?.id) === id ? contract.assigned_office.name || '' : '';
};
```

An unmatched id yields `""`, and the copy drops the name clause rather than
printing "Unknown".

---

## 5. Live hours

```js
// lib/liveHours.js
computeWorkedMs({ clockIn, breaks, activeBreak, breakMinutes, now })
totalBreakMinutes({ breaks, activeBreak, breakMinutes, now })
```

The contract's recommendation (§2 C22): use `break_duration_minutes` as the
base — it's a persisted column, authoritative for **closed** breaks — and add
live elapsed time from `active_break.start_time` only while a break is open.
Summing `breaks[]` yourself also works and will agree.

Ticks once a second, **only** while `phase === 'working'`:

```js
useEffect(() => {
  if (phase !== 'working') return undefined;
  setNow(Date.now());
  const id = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(id);
}, [phase]);
```

On native, also pause on `AppState` → background: a 1 Hz interval in the
background is a battery complaint, and the value is recomputed from
`clock_in_time` on return anyway.

---

## 6. The day status note

```jsx
<DayStatusNote record={record} />
```

The one-line "why this status" banner for a day inspector. It explains a derived
or not-yet-settled status in plain words, and names the holiday or weekly-off
rule that decided the day from `status_context`.

The headline case: a projected absence (`awaiting_absent_cron`) reads as
**fuchsia "not finalised"** rather than a confirmed red absence — the day's
cut-off simply hasn't run yet.

Renders **nothing** for a plain record that explains itself, or when the payload
predates the contract (no provenance keys). Shared between the employee and the
manager/HR inspectors on web, so one day says exactly the same thing everywhere.

---

## 7. Dense history and the nine chips

Since 2026-09-20 the history endpoints carry **one entry per calendar day**, not
one per attendance row. A day with no punch arrives with `id: null`, the resolved
reason in `status`, and `null` in every metric.

```js
dayChipKey(record, today)   // → present | late | half_day | on_leave | absent |
                            //   holiday | weekly_off | no_data | upcoming
isSynthesizedDay(record)    // record.id === null
metric(record.overtime_minutes)  // number | null — null is NOT zero
sumMetric(records, 'overtime_minutes')
chipTally(records, today)   // counts per chip, for a legend
isWorkingDay(record, today)
attendedDay(record, today)
```

`late` and `upcoming` are **client-derived** (contract §8): there is no `late`
status — lateness is `late_minutes > 0` on an otherwise present day — and
`upcoming` is a date comparison, kept client-side so it stays consistent across
every attendance readout.

**`null` is not zero.** `overtime_minutes: 0` on a worked day and `null` on a
weekly off are different facts, and averaging them together is how a month of
Sundays silently drags an average down. Use `sumMetric`/`chipTally`, not
`reduce`.

---

## 8. Attendance corrections

```js
// POST /attendance/regularization → 201
{
  date: '2026-10-10',                     // required
  requested_clock_in:  '2026-10-10T03:30:00.000Z',   // at least ONE of these two
  requested_clock_out: '2026-10-10T12:30:00.000Z',
  reason: 'Forgot to clock out',          // required, 5–1000 chars
  work_mode: 'office',                    // optional
}
```

Validate client-side with `validateRegularization()` — the backend does **not**
enforce every rule, and unknown keys are silently stripped.

| Rule | Enforced by |
|---|---|
| At least one time present | **client** (`.or()` on the server, but catch it first) |
| `reason` 5–1000 chars | both |
| Clock-out after clock-in | server (`INVALID_REGULARIZATION_WINDOW`) |
| Within the policy's window | server (`INVALID_REGULARIZATION_DATE`) |
| One pending request per date | server (`ALREADY_PENDING`, 409) |
| Date not inside a payroll lock | server (`PERIOD_LOCKED`, **403**) |
| Work mode allowed by the contract | server (`WORK_MODE_NOT_PERMITTED`) |

**Overnight corrections need full ISO datetimes** — with bare `HH:mm` the
backend can't tell the clock-out belongs to the next day. Use
`combineLocalDateTime(ymd, hhmm, { nextDay: true })`.

Entry points: from a day in the attendance list ("Request a correction"), and
from the Corrections screen itself. The web screen accepts a `?date=` prefill
and **clears it once consumed** so a refresh doesn't reopen the form — the native
equivalent is clearing the route param after the sheet opens.

---

## 9. Overtime

Read-only for an employee. It is **recorded from attendance**, not requested:
"Overtime appears here when you work beyond your shift and your attendance
policy tracks it."

`page`/`limit` only — **no status filter exists**. Minutes are canonical; hours
are a fallback (see the `overtimeMinutes()` accessor in
[10-api/03-payload-shapes.md](../10-api/03-payload-shapes.md)).

Policy fields that govern it (read-only, from `/attendance/shift` → `policy`):
`overtime_enabled`, `overtime_min_minutes`, `overtime_requires_approval`.
If `overtime_enabled` is false, the screen says so rather than showing an empty
list forever.

---

## 10. Flags

An employee **reads** flags; they cannot resolve them. The screen's job is to
explain what was flagged and what, if anything, to do:

| Flag | What the employee does |
|---|---|
| `out_of_bounds` | Send a correction request if they were legitimately elsewhere |
| `missing_coordinates` | Turn on location access |
| `geofence_unresolved` | **Nothing** — ask HR to finish the setup |
| `excessive_break` | Nothing; their manager reviews it |
| `late_arrival` / `early_exit` | Send a correction if the punch was wrong |
| `missing_clock_out` | Send a correction |

Every flag detail sheet should end in either an action (**Request a
correction**) or a `SheetFooterNote` saying why there isn't one.

---

## 11. Earned Leave (comp-off)

A day credited for working a weekly off or a holiday. Flows:

```
work an off day → attendance creates a credit (status: earned)
   └─ manager approves  → approved → available in the leave balance
   └─ manager rejects   → CANCELLED (there is no `rejected`)
   └─ nobody acts       → expires on expiry_date
approved + taken as leave → used
approved + paid out       → a Leave Payout on a payslip
```

Credits land against the **platform-owned Compensatory Off leave type**, whose
code is `CO` **or** `COMP_OFF` depending on the tenant's age (§12 of
[02-enums-statuses.md](02-enums-statuses.md)). Accept both.

The screen shows the summary (`/comp-offs/mine/summary`) above the list, and
links to **My Leaves** for using the balance — the web screen uses
`useMyPayPaths().leaves` for exactly that.

Expiry deserves prominence: a credit that expires unused is a day of work the
person didn't get paid for. Show the date, and highlight it when it's within 30
days.

---

## 12. Holidays

```js
attendanceAPI.getUpcomingHolidays()   // NO parameters (T4)
```

Filter client-side by year or by date. Render as a list with the date, the name,
and whether it's optional / targeted. They also feed the Leave screen's calendar
context — a leave request that spans a holiday doesn't consume a leave day, and
the backend handles that, so showing holidays while applying prevents a confused
support call.

---

## 13. The refresh contract

```js
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from '@/lib/events';

// after a successful punch
emitAttendanceChanged(ATTENDANCE_EVENTS.PUNCH);

// a screen that must react
useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH], refresh);
```

| Emit | Subscribers |
|---|---|
| `PUNCH` | Home (today, chart), My Attendance |
| `REGULARIZATION` | Corrections list, any badge |
| `OVERTIME` | Overtime list |
| `COMPOFF` | Earned Leave list and summary |
| `ANOMALY` | Flags list |
| `CONFIG` | Shift/policy readers that are already mounted |
| `LEAVE` | Leave screen, balances |
| `CLAIM` · `LOAN` · `TAX_DECLARATION` | the matching pay screens |

There is **no query cache**, so this bus *is* the invalidation. A write that
doesn't emit leaves another screen stale until the app is restarted.

Plus two automatic refreshes, both in `useTodayAttendance`:

- **`AppState` → `active`** — punches from another device, or biometric punches
  processed asynchronously.
- **Just after local midnight** — a card left open rolls to the new day.

---

## 14. Attendance checklist

- [ ] Phase derived from `status`, never from clock times
- [ ] Date rendered from the payload (`today.date`), never from the device
- [ ] Carried-over overnight state shown explicitly
- [ ] Clock-in button **never** disabled because of location
- [ ] Location failure explained, retryable, and overridable
- [ ] Work-mode toggle only for a hybrid contract
- [ ] `work_mode` **not** sent on clock-out
- [ ] Geofence notice never rose, never a failure, silent when `evaluated: false`
- [ ] Location resolved to a name; no id on screen
- [ ] Worked time from `worked_duration_formatted`
- [ ] Live timer cleared on leaving `working` and paused in the background
- [ ] `null` metrics not treated as zero
- [ ] `late_days` excluded from any total-days chart
- [ ] History queried with `from`/`to`
- [ ] Corrections: at least one time, reason 5–1000, full ISO for overnight
- [ ] Correction status tabs filter client-side and say so
- [ ] Flags read `is_resolved`; both punch sides visible
- [ ] Earned leave `cancelled` reads "Rejected or cancelled"
- [ ] Every write emits its event

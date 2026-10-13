# 02 · Enums and statuses

Every status set the employee app renders, its label, its tone, and the traps.
All of this is in `lib/enums.js` — **resolve through `statusMeta()`, never by
hand.**

```js
import { statusMeta, humanize, normalizeStatusKey } from '@/lib/enums';

const meta = statusMeta('compoff', row.status);
// → { key: 'earned', label: 'Waiting for approval',
//     longLabel: 'Earned · waiting for approval', tone: 'amber' }
```

An unknown status falls back to `humanize(key)` and the `slate` tone — never a
crash, never a raw enum on screen.

---

## Tone keys — historic names, purple rendering

```js
TONE = {
  emerald → violet    (success)
  amber   → fuchsia   (pending / warning)
  blue    → indigo    (info)
  purple  → purple    (brand)
  rose    → rose      (error / absence — the only red)
  slate   → slate     (neutral)
  indigo  → indigo, deeper
  orange  → fuchsia, deeper
  sky     → white with an indigo border
}
```

The keys keep their old colour names **on purpose**, so a tone map ported from a
web file keeps working without edits. Don't rename them.

---

## 1. Attendance record status — `kind: "record"`

`attendance_records.status`, plus two chips the client derives.

| Key | Label | Tone | Renders |
|---|---|---|---|
| `present` | Present | emerald | violet |
| `absent` | Absent | rose | **red** |
| `half_day` | Half Day | blue | indigo |
| `on_leave` | On Leave | purple | purple |
| `in_progress` | In Progress | sky | white / indigo border |
| `weekly_off` | Weekly Off | slate | slate |
| `holiday` | Holiday | indigo | indigo, deeper |
| `not_marked` | Not Marked | slate | slate |
| `no_data` | No data | slate | slate |
| `upcoming` | Upcoming | slate | slate |
| `late` | Late | amber | fuchsia |
| `overtime` | Overtime | orange | fuchsia, deeper |

`no_data` and `upcoming` are **client-derived**: the dense history endpoints
leave `not_marked` to be split by date (contract §8). `late` and `overtime` are
display-only legacy values seen in some list payloads.

> **There is no `late` status.** Lateness is `late_minutes > 0` on an otherwise
> present day. The chip exists for payloads that carry it; never compute a
> "late" status yourself and never count late days as a separate bucket.

---

## 2. The nine day chips — the calendar legend

From `lib/dayStatus.js`. Used by the attendance calendar and the day list, in
**this legend order**:

```
present · late · half_day · on_leave · absent · holiday · weekly_off · no_data · upcoming
```

Worked days first, then non-working, then the two unknowns.

```js
dayChipKey(record, today)  // → one of the nine
dayChip(record, today)     // → { label, tone, heat }
```

`heat` is the calendar-cell fill (a purple ramp, with slate for the non-working
states and `purple-950` for absence). Both live in one place so a chip can never
look like one thing in the grid and another in the list.

### `null` is not zero

```js
metric(record.overtime_minutes)   // → number | null
```

`overtime_minutes: 0` on a worked day and `null` on a weekly off are **different
facts**. Averaging them together is how a month of Sundays silently drags an
average down (contract §10). `sumMetric()` and `chipTally()` honour the
distinction — use them rather than `reduce`.

### Synthesized days

```js
isSynthesizedDay(record)   // record.id === null
```

The backend sends one entry for **every calendar day** in the range, not just
days with a punch. A day with no punch arrives with `id: null`, the resolved
reason in `status`, and `null` in every metric. That removed the guessing the
calendar used to do — a missing day could have been a weekly off, a holiday, an
absence, a future day or a data gap, and all five rendered identically.

### Provisional days

```js
isProvisionalDay(record)   // record.is_provisional === true
statusReasonNote(record)   // the one-line explanation
dayContextLabel(ctx)       // "Diwali — an org holiday" / "— a weekly off"
```

The headline case: a projected absence (`awaiting_absent_cron`) reads as
**fuchsia "not finalised"**, not a confirmed red absence. The day's cut-off
simply hasn't run yet. Render this through `DayStatusNote`, which shows nothing
for a plain record that explains itself.

---

## 3. Attendance corrections — `kind: "regularization"`

| Key | Label | Tone |
|---|---|---|
| `pending` | Pending | amber |
| `approved` | Approved | emerald |
| `rejected` | Rejected | rose |
| `cancelled` | Cancelled | slate |

Filters: `all` · `pending` · `approved` · `rejected` · `cancelled`.

> **The server ignores the `status` query** (T5). The tabs filter the **loaded
> page**, client-side. Label it honestly.

---

## 4. Earned Leave (comp-off) — `kind: "compoff"`

| Key | Label | Short (badge) | Tone |
|---|---|---|---|
| `earned` | Earned · waiting for approval | **Waiting for approval** | amber |
| `approved` | Approved | Approved | emerald |
| `used` | Used | Used | blue |
| `expired` | Expired | Expired | slate |
| `cancelled` | **Rejected or cancelled** | Rejected / cancelled | rose |

Two traps, both load-bearing:

1. **There is no `rejected` state.** The reject endpoint writes `cancelled`, so
   "Cancelled" must read as *rejected or cancelled* — the employee can't tell
   which, and neither can you. Rejected items stay **visible**.
2. **"Earned" alone read as already-in-the-balance.** The summary above the list
   calls the same state "Waiting for approval", so the badge does too.

Filter labels use the short forms: *All · Waiting for approval · Approved · Used
· Expired · Rejected / cancelled.*

---

## 5. Overtime — `kind: "overtime"`

| Key | Label | Tone |
|---|---|---|
| `pending` | Pending | amber |
| `approved` | Approved | emerald |
| `rejected` | Rejected | rose |
| `cancelled` | Cancelled | slate |

**No status filter exists** on `/overtime/mine` — page and limit only.

---

## 6. Flags (anomalies) — `kind: "anomaly"`

| Key | Label | Tone |
|---|---|---|
| `open` | Open | amber |
| `resolved` | Resolved | emerald |

**Derived, not read** — records carry `is_resolved`, not `status`:

```js
const anomalyStatusKey = (a) => (a?.is_resolved === true || !!a?.resolved_at ? 'resolved' : 'open');
```

Filters: `open` (default) · `resolved` · `all`.

### Flag types — plain-English labels

`type` is a **free-form string**. Never render it raw.

| Type | Label |
|---|---|
| `out_of_bounds` | Punched away from the work location |
| `missing_coordinates` | Punched without location |
| `geofence_unresolved` | **No work location set up to check against** |
| `work_mode_claim_mismatch` | Punch claimed a work mode the contract doesn't allow |
| `excessive_break` | Break exceeded policy limit |
| `late_arrival` / `late` | Late arrival |
| `early_exit` | Early exit |
| `missing_clock_out` / `missed_clock_out` | Missing clock-out |
| `auto_clock_out` | Auto clocked out |
| `multiple_sessions` | Multiple sessions |
| anything else | `humanize(type)`, else "Anomaly" |

```js
anomalyLabel(a)       // "Clock-out · Punched away from the work location"
anomalyPunchSide(a)   // "Clock-in" | "Clock-out" | ""
isSetupAnomaly(a)     // true only for geofence_unresolved
```

Two things this encodes:

- **Clock-in and clock-out each raise their own flag.** Two rows a day is
  correct and must **not** be de-duplicated. Rendering only the type label made
  them identical twins, so a clock-out breach read as a second complaint about a
  clock-in that was fine.
- **`geofence_unresolved` is a setup gap, not misconduct.** No assigned office,
  no active branch, no assigned site, or a location with no GPS pin. It is the
  only flag type whose fix belongs to HR rather than the employee, and the
  wording must not read like an accusation.

### Severity — `kind: "severity"`

| Key | Label | Tone |
|---|---|---|
| `low` | Low | slate |
| `medium` | Medium | amber |
| `high` | High | rose |
| `critical` | Critical | rose |

---

## 7. Punch types

| Value | Label |
|---|---|
| `clock_in` | Clock in |
| `clock_out` | Clock out |
| `break_start` | Break started |
| `break_end` | Break ended |

Punch source for this app: **`'mobile'`** (web sends `'web'`; the webhook sends
`'api'`).

---

## 8. Work mode — two vocabularies

| Contractual (org / profile) | Attendance (records / punches) |
|---|---|
| `on-site` | `office` |
| `remote` | `remote` |
| `hybrid` | `hybrid` |
| `field` | `field` |

**`on-site` and `office` are the same mode** and must never be compared
directly. A `null` contractual mode is **fail-secure: it reads as `office`**.

```js
normalizeWorkMode('on-site')   // 'office'
normalizeWorkMode(null)        // 'office'
permittedWorkModes('hybrid')   // ['office', 'remote']   → show the toggle
permittedWorkModes('field')    // ['field']              → show nothing
choosesWorkMode('hybrid')      // true  — the ONLY case with a toggle
isFieldWorker('field')         // true
```

Labels: Office · Remote · Field · Hybrid.

Sending a work mode for a non-hybrid employee raises a
`work_mode_claim_mismatch` **flag against them**. Showing them a toggle actively
harms them.

---

## 9. Geofence outcomes — four, none of them an error

| Outcome | Tone | Short label |
|---|---|---|
| `in_bounds` | emerald | At your work location |
| `out_of_bounds` | **amber** | Away from your work location |
| `missing_coordinates` | **amber** | No location recorded |
| `unresolved` | slate | Work location not set up |

**Note what is not here: no rose.** An out-of-bounds punch is a flag for a
manager to review, not an error the employee just made.

```js
wasGeofenceEvaluated(gf)   // gf.evaluated === true
geofenceNotice(gf, name)   // → { tone, text } | null
```

`evaluated: false` is the normal, **silent** case — a remote employee, a declared
work-from-home day, a biometric punch. The punch screen shows no geofence chrome
at all for it.

The copy, verbatim from the web module:

- in bounds → "Recorded at Bengaluru HQ."
- out of bounds → "Recorded 1.4 km from Tata Steel Pune. Your manager has been
  notified — send a correction request if you were at a client site."
- missing coordinates → "Recorded without your location. Turn on location access
  so your attendance isn't flagged."
- unresolved → "Recorded. Your work location hasn't been set up yet — ask HR to
  finish it."

Pass `""` for the name and the copy drops the name clause rather than printing
"Unknown".

---

## 10. Shift types

Descriptive tags only — every type is **calculated** from start/end time and the
policy.

| Key | Label | Description |
|---|---|---|
| `fixed` | Fixed | Same start and end time every day |
| `flexible` | Flexible | No set start or end time |
| `split` | Split | Worked out like Fixed; no second work block |
| `night` | Night | Starts one day, ends the next |
| `rotational` | Rotational | Cycles through shifts via a rotation pattern |

---

## 11. Weekdays

**JavaScript `Date#getDay()` convention: 0 = Sunday … 6 = Saturday.** Not
ISO-8601's Monday-first. Getting this wrong shifts every weekly off by a day.

---

## 12. Leave

### Request status

| Key | Label | Tone |
|---|---|---|
| `pending` | Pending | amber |
| `approved` | Approved | emerald |
| `rejected` | Rejected | rose |
| `cancelled` | Cancelled | slate |
| `cancellation_pending` | **Cancellation waiting for approval** | amber |

`cancellation_pending` is the one people miss: leave that has already started
can't be cancelled unilaterally (T8), so it sits here until a manager acts.

### Half-day type

`first_half` → **First half** · `second_half` → **Second half**.
Only meaningful when `is_half_day` is true.

### The system leave type

Every organisation is provisioned with a platform-owned Compensatory Off type:
attendance credits earned leave against it, the nightly expiry and the year-end
rollover read it, and payroll pays it out. The backend refuses to delete it,
deactivate it, or change its code.

**Two codes, not one.** New organisations get `CO`; organisations predating the
change may carry `COMP_OFF`, and the backend's own resolvers check `CO` first
and fall back. Anything keying off this must accept **both**:

```js
isSystemLeaveType('CO')         // true
isSystemLeaveType('COMP_OFF')   // true
```

Everything else about it is HR's: display name, document threshold, sandwich
rule, demographic rules.

---

## 13. Pay

### Salary revision types

| Key | Label |
|---|---|
| `initial` | Initial |
| `increment` | Increment |
| `promotion` | Promotion |
| `correction` | Correction |
| `restructure` | Restructure |

Fallback: `humanize(type)`, else "Revision".

### Component calculation types

| Key | Rendered as |
|---|---|
| `flat` | a money amount |
| `balancing` | **"Auto (remainder)"** |
| `percent_of_basic`, `percent_of_ctc`, … | a rate (`"50%"`, `"3.75%"`) |

Via `formatComponentValue(component)`.

### Component type

`earning` → an Earnings section · `deduction` → a Deductions section.
**Earnings first, always.**

### Claim status

| Key | Label | Tone |
|---|---|---|
| `draft` | Draft | slate |
| `pending` | Waiting for approval | amber |
| `approved` | Approved | emerald |
| `rejected` | Rejected | rose |
| `paid` | Paid | emerald |
| `cancelled` | Cancelled | slate |

### Loan status

| Key | Label | Tone |
|---|---|---|
| `pending` | Pending | amber (fuchsia) |
| `active` | Active | emerald (violet) |
| `closed` | Closed | slate |

### Tax regime

`old` → **Old regime** · `new` → **New regime**. Never "regime 1 / 2".

---

## 14. Documents

### Document status

| Key | Label | Tone |
|---|---|---|
| `pending_verification` | Waiting for HR to check | amber |
| `available` | Available | emerald |
| `verified` | Verified | emerald |
| `rejected` | Rejected | rose |
| `expired` | Expired | slate |
| `superseded` | Replaced by a newer version | slate |

### Request status

| Key | Label | Tone |
|---|---|---|
| `pending` | Waiting for you | amber |
| `fulfilled` | Done | emerald |
| `cancelled` | Cancelled | slate |
| `overdue` | Overdue | rose |

"Waiting for you" rather than "Pending" — on this screen the person *is* the
blocker, and saying so is the whole point of the screen.

### Document type codes

Never raw. `humanizeCode(code)` from the documents meta:
`experience_letter_issued` → "Experience letter".

---

## 15. The four prettifiers — and why there are exactly four

| Function | Module | For |
|---|---|---|
| `humanize()` | `lib/enums.js` | `excessive_break` → "Excessive break" |
| `humanizeCode()` | documents meta | Document type codes |
| `prettifyCode()` | payroll meta | Salary component codes |
| `normalizeStatusKey()` | `lib/enums.js` | `"Half-Day"` / `"HALF_DAY"` → `half_day` |

**Don't write a fifth.** If a code needs different treatment, it belongs in one
of these.

---

## 16. Checklist for rendering any status

- [ ] Resolved through `statusMeta(kind, status)`, not a local map
- [ ] Rendered by `<StatusBadge>` — dot **plus a word**
- [ ] The tone comes from the map, not from a judgement about the value
- [ ] An unknown value degrades to `humanize()` + slate, not a crash
- [ ] Derived statuses (`anomalyStatusKey`, `dayChipKey`) use their helper
- [ ] Nothing renders the raw enum anywhere, including accessibility labels
- [ ] `cancelled` on earned leave reads "Rejected or cancelled"
- [ ] `null` metrics are not treated as zero

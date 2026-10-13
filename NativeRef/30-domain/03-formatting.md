# 03 · Formatting function reference

The complete API of `lib/format.js` and `lib/dates.js`. The *rules* are in
[01-wording.md](01-wording.md); this is the signature list you'll keep coming
back to.

**There is exactly one function per job.** If you're about to write
`${hours}h ${mins}m` inline, one of these already does it.

---

## `lib/format.js`

### Day counts

```js
formatDayCount(value, { fallback = 'N/A', lower = false })
```
`0.5` → `"1 Half Day"` · `1` → `"1 Day"` · `2.5` → `"2 Days and 1 Half Day"`.
Snaps non-half values to the nearest half rather than leaking a decimal.
Negatives keep their sign (`"-1 Day"`). **The only way to print a day count.**

### Money

```js
formatMoney(value, { withSymbol = true })
```
`57559.4` → `"₹57,559.40"` · `57559` → `"₹57,559"` · `null` → `"₹0"`.
Indian grouping. Whole rupees drop the decimals; paise always print two.

```js
formatPercent(value)      // "50%" · "0.25%" · "3.75%" — trailing zeros dropped
formatComponentValue(c, { balancingLabel = 'Auto (remainder)' })
```

### Values

```js
displayValue(value, fallback = 'N/A')
```
`null` / `undefined` / `''` / `NaN` → `"N/A"`. **Numbers including `0` are
kept** — a zero balance is a fact, not an absence. Used by every sheet
primitive, so you rarely call it yourself.

### Periods

```js
formatPeriod('2026-09')   // "September 2026"
formatDate(d)             // "13 Oct 2026" — payroll's YYYY-MM-DD dates
```

### Durations

```js
formatDecimalHours(8.5)   // "8h 30m" · 0 or null → "0h"
```

### Accessibility variants

```js
spokenDuration(512)       // "8 hours 32 minutes"
spokenMoney(87432)        // "87,432 rupees"
spokenDayCount(2.5)       // "2 days and 1 half day"
```
For `accessibilityLabel` only — a screen reader reads "8h 32m" as letters. The
visible text stays abbreviated.

---

## `lib/dates.js`

### The local-date contract

Every function here honours two rules, and both have cost real bugs:

1. **A `YYYY-MM-DD` from the API is a calendar date, not an instant.**
   `new Date("2026-10-13")` is **UTC midnight** and renders as the *previous
   day* west of UTC. Always `parseYMDLocal()`.
2. **"Today" is the device's local date.**
   `toISOString().split('T')[0]` returns **yesterday** in IST between 00:00 and
   05:29. Always `todayYMD()`.

### Calendar dates

```js
todayYMD()                        // "2026-10-13" — local
toLocalYMD(dateOrValue)           // → "YYYY-MM-DD", "" if invalid
ymdOnly(anything)                 // API value → "YYYY-MM-DD" (no TZ shift)
parseYMDLocal('2026-10-13')       // → local Date at 00:00, or null
addDaysYMD('2026-10-13', 7)       // DST-safe
compareYMD(a, b)                  // -1 | 0 | 1  (lexicographic = chronological)
isPastYMD(ymd)                    // strictly before today
```

`ymdOnly()` is what you send to any endpoint demanding a strict date. **Never
`toISOString()`** — that's a 400 on the field-assignment routes and an
off-by-one everywhere else.

### Months

```js
monthRange(2026, 10)              // { from: '2026-10-01', to: '2026-10-31' }
shiftMonth(2026, 10, -1)          // { year: 2026, month: 9 }
isFutureMonth(2026, 11)           // true → disable the stepper's forward arrow
monthLabel(2026, 10)              // "October 2026"
monthLabelShort(2026, 10)         // "Oct 2026"
```

`monthRange()` is how you query `/attendance/history`, which does **not** accept
`month`/`year` (T3).

### Display

```js
fmtDate(value, options?, fallback = 'N/A')   // "13 Oct 2026"
fmtDateShort(value)                          // "Mon, 13 Oct"
fmtTime(iso)                                 // "09:05 am"
fmtDateTime(iso)                             // "13 Oct 2026, 09:05 am"
```

### Wall-clock times (schedules — never timezone-converted)

```js
fmtClock('09:00:00')              // "09:00"
fmtClockTime('09:00')             // "09:00 am"
clockMinutes('09:30')             // 570
fmtClockMinutes(1080)             // "06:00 pm";  { short: true } → "6 pm"
```

A shift's `start_time` is a **schedule**, not an instant. Converting it to a
timezone is how a 9 am shift becomes 3:30 am.

### Durations

```js
fmtMinutes(95)                    // "1h 35m" · 45 → "45m" · 120 → "2h" · 0 → "0m"
fmtHours('8.50')                  // "8h 30m" — clamps negatives to "0m"
fmtDuration(ms)                   // "02:14:07" — the live timer only
```

### Worked time — read it, don't compute it

```js
workedLabel(record, fallback = '0m')        // the DAY's worked time
totalWorkedLabel(summary, fallback = '0m')  // the MONTH's total
```

`workedLabel` prefers `worked_duration_formatted` (`"8h 32m"`, breaks already
deducted, the same figure the policy and overtime use) and falls back to
`effective_hours`. It also tidies the server's `"8h 0m"` to `"8h"`, because the
same day showed both ways on two web screens until it did.

**Never derive worked time from clock-in minus clock-out.** You will disagree
with payroll.

### Timezones

```js
combineLocalDateTime('2026-10-13', '18:30', { nextDay: false })  // → ISO instant
toLocalHHMM(iso)                  // ISO → "18:30" for a TimeField
browserTimeZone()                 // "Asia/Kolkata"  (device zone on native)
formatInZone(iso, tz, options)
zoneMinutesFrom(ymd, iso, tz)     // wall-clock minutes from that date's midnight
```

`combineLocalDateTime(..., { nextDay: true })` is what makes an **overnight**
correction unambiguous — a bare `HH:mm` can't tell the server the clock-out
belongs to the next day.

`zoneMinutesFrom` can exceed 1440 (`1500` = 01:00 the next day), which is how a
night-shift punch is compared against its schedule.

---

## `lib/normalize.js`

```js
isUuid(v)                         // never show one (house rule §4)
num(v, fallback = 0)              // "8.50" → 8.5
unwrap(res)                       // { success, data } → data
listFrom(res, keys)               // finds the array, one nested level deep
normalizePaginated(res, keys, { page, limit })
personName(entity, fallback = 'Unknown employee')
employeeCode(entity)              // never a UUID
personEmail(entity)
initials(name)
entityId(entity)                  // id ?? _id ?? request_id ?? uuid
departmentName(entity)
toEmployeeOption(row)             // → { id, name, code, email, sub, raw }
```

`personName()` resolution order: flat name → nested `user`/`employee`/
`requester` → the person's **own** role profile → email. It will **never**
return a UUID.

> It matches only the person's *own* profile keys
> (`profile` · `user_profile` · `employee_profile` · `manager_profile` ·
> `hr_profile`). A generic `/profile$/` match would also pick up
> `approver_profile` and `reporting_manager_profile` and show **someone else's
> name** when the record's own is missing.

---

## Hard rules

| Never | Always |
|---|---|
| `${h}h ${m}m` inline | `fmtMinutes()` / `fmtHours()` |
| `value.toFixed(2)` for money | `formatMoney()` |
| `2.5 + " days"` | `formatDayCount()` |
| `value \|\| '-'` | `displayValue()` |
| `new Date(ymd)` | `parseYMDLocal(ymd)` |
| `toISOString().split('T')[0]` | `todayYMD()` / `ymdOnly()` |
| `toISOString()` for a date field | `ymdOnly()` |
| `toLocaleString()` on a shift time | `fmtClockTime()` |
| clock-out minus clock-in | `workedLabel(record)` |
| `Number(x)` on an API decimal without a guard | `num(x, 0)` |
| `data.data \|\| data.records \|\| data` | `unwrap()` / `listFrom()` |

---

## Why these avoid `Intl`

The web versions lean on `toLocaleString('en-IN', …)`. On Android, Hermes's ICU
support varies by RN version and build flags, so the **same code can produce
different strings on two devices** — and a payslip that reads `₹1,234,567` on
one phone and `₹12,34,567` on another is a support ticket.

The ported `lib/format.js` therefore does Indian digit grouping, month names and
12-hour formatting **manually**, with byte-identical output to the web app's.

**Don't "simplify" them back to `toLocaleString`.** The verbosity is the point.
`lib/dates.js` keeps `Intl` only in `zoneMinutesFrom` and `formatInZone`, which
genuinely need timezone arithmetic and are never on a hot display path — and
both already fall back to the device zone in a `try/catch`.

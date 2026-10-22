# 03 · Time — Time (5 strip tabs) · CorrectionForm · OvertimeForm · EarnedLeaveForm

Phase 4. **One screen with a `TabStrip`**, plus three modal forms.

Web ancestors: `EmployeeAttendancePage.jsx`, `AttendanceRegularizationsPage.jsx`,
`EmployeeOvertimePage.jsx`, `AttendanceAnomaliesPage.jsx`,
`EmployeeCompOffsPage.jsx` — five web pages, one native screen.

---

## Why five web pages become one screen

The web sidebar's MY TIME section has five entries and each is a route. On a
phone that would mean five stack screens, five native headers and five back
presses — for five views of **the same month of the same person's attendance**,
which people compare against each other ("I was marked absent on the 3rd, did
my correction go through?").

A `TabStrip` inside one screen keeps the month, the scroll position and the
header, and switching costs a tap. The strip **scrolls horizontally** with edge
fades and auto-scrolls the selected tab into view — it does not wrap
(CLAUDE.md §5: a wrapped strip grew to three rows on the web and was fixed).

```
My Time                                      ← one native header
┌──────────────────────────────────────────┐
│ Attendance · Corrections · Overtime ·    │  ← TabStrip, scrolls
│   Flags · Earned Leave                   │
└──────────────────────────────────────────┘
MonthStepper  ‹  October 2026  ›               ← shared by all five tabs
[ the active tab's list ]
```

**The MonthStepper is above the strip and shared.** Switching tabs must not
reset the month — somebody looking at September's attendance who taps
Corrections wants September's corrections.

Forward is disabled past the current month (`isFutureMonth`); there is nothing
there and an empty October 2027 looks like a bug.

---

# Tab 1 · Attendance

## 1 · What it's for

The month, day by day: what each day was counted as and what was worked. The
default tab, because it is the question people actually have.

## 3 · Data

| Call | Params | Notes |
|---|---|---|
| `attendanceAPI.getHistory()` | `{ page, limit: 20, start_date, end_date }` | the rows |
| `attendanceAPI.getSummary()` | `{ month }` | the four tiles above the list |

`start_date`/`end_date` from `monthRange(month)`. Paginate with the native
equivalent of `usePagedList` — infinite scroll, not numbered pages (T-T1).

## 4 · Layout

```
4 tiles (2×2)   Present · Unpaid days · Late · Worked
FlatList of Row
  ┌────────────────────────────────────────┐
  │ Mon 14 Oct      ● Present              │
  │ 9:14 AM → 6:42 PM     8h 12m · 14m late│
  └────────────────────────────────────────┘
  tap → DayLog sheet
ListFooter   "20 of 31 days" · a spinner while the next page loads
```

**"Unpaid days", not "LOP" or "LWP"** (CLAUDE.md §6). The tile beside a day
count must not add a "days" caption — `formatDayCount()` carries its own unit.

## 5 · States

Loading (`Skeleton type="rows"`) · loaded · **empty month** ("No attendance
recorded for October." — and if it is a future month, you shouldn't be able to
get there) · couldn't load · offline (last page stays, with an indigo alert) ·
loading the next page (footer spinner only, never a blanked list).

## 6 · Actions

None in a row. Rows open the DayLog sheet
([02-home-and-punch.md](02-home-and-punch.md)). The sheet's footer note points
at Corrections — that is the only route from "this day is wrong" to a form, and
it is deliberate: a correction needs a reason, so it is a form, not a row
button.

## 7 · Field help

**No field qualifies.** Status, hours, late, effective and overtime columns and
the day inspector are all on §10's never list, by user decision (2026-10-01).

## 8 · Traps

**T-T1 · Infinite scroll, not pagination.** The web uses numbered pages
because a desktop list shows 20 rows at once. Numbered pages on a phone mean
tapping a 32pt "3" — and the web's own rule says a stale page 5 of a
one-page filter is a bug not to inherit (20-design/03-navigation.md).

**T-T2 · These endpoints paginate over CALENDAR DAYS, not events.** A month is
28–31 rows whatever happened in it. `ListFooter`'s `noun` prop exists for
exactly this: "20 of 31 **days**", not "20 of 31 records".

---

# Tab 2 · Corrections

## 1 · What it's for

"That day is recorded wrongly — here's what actually happened." Requests the
person has raised, their state, and the way to raise a new one.

The word is **correction**, never "regularization". The API says
`regularization` and the person never sees that word.

## 3 · Data

```js
attendanceAPI.getMyRegularizations({ page, limit: 20 })   // keys: ["requests"]
attendanceAPI.cancelRegularization(id, { reason })
```

## 4 · Layout

```
FilterTabs   All (12) · Waiting (2) · Approved (9) · Declined (1)
Button primary "Request a correction"     ← above the list, not a floating +
FlatList of Row
  │ Tue 3 Oct          ● Waiting          │
  │ Marked absent — I was working remote  │
  └ Cancel ──────────────────────────────┘   ← a real action, stays in the row
  tap → RecordSheet
```

Counts go **in the filter labels** (`FilterTabs`), which is the house pattern.

## 5 · States

Loading · loaded · empty ("You haven't asked for any corrections. If a day is
recorded wrongly, request a correction and your manager reviews it.") ·
couldn't load · empty **filter** (a different message: "Nothing waiting." —
with the filter still visible so the person can see why) · offline.

## 6 · Actions

**Request a correction** → `CorrectionForm` modal (below).

**Cancel** — a real action, so it stays in the row (§3: keep real actions,
drop View). It opens a `ReasonPrompt`:

> **Cancel this correction request?** · Your manager won't see it any more.
> Reason *

On success: `emitAttendanceChanged(ATTENDANCE_EVENTS.REGULARIZATION)`, a toast,
and **refresh that one row** — not the list (CLAUDE.md §7).

Cancel is offered only while the state is pending. An approved or declined
request has no action, and if **no** row in the list has one, there is no
Actions column at all (§5).

## 7 · Field help

The entry already exists for the **form**, not the list —
`attendance.regularization` → `work_mode`, in
`fieldHelp.employee.json`. The list itself gets **nothing**: routine queue
status columns are on §10's never list.

## 8 · Traps

**T-T3 · The backend validates `status` and then ignores it.** Contract §4.4 /
§8.4. Fetch the list **unfiltered** and let the `FilterTabs` filter the loaded
page in memory — passing `status` gives you a full list back and a filter that
appears broken. The web file carries this comment; keep it in the native one.

**T-T4 · Never show the request id,** not in the row, not in the sheet, not in
the cancel toast. The date and the reason identify it to a human.

---

# Tab 3 · Overtime

## 1 · What it's for

Extra hours worked beyond the shift: what's been claimed, what's approved, what
it came to.

## 3 · Data

`attendanceAPI.getMyOvertime({ page, limit, start_date, end_date })`

## 4 · Layout

```
2 tiles   Approved this month · Waiting
FilterTabs   All · Waiting · Approved · Declined
FlatList of Row    date · hours · ● state
  tap → RecordSheet
```

## 5 · States

The five standard ones, plus: **overtime not enabled for this organisation** —
if the endpoint 404s or answers an empty feature, the tab is **hidden from the
strip entirely**. A capability a role or an org lacks is absent, not broken
(§2), and never a tab that explains it isn't available.

## 6 · Actions

**Claim overtime** → `OvertimeForm` modal, if the org allows self-claims. Gate
that on what the server returned, not on the spec: no claim endpoint in the
response's capabilities → no button.

## 7 · Field help

**No field qualifies** — overtime columns are named on §10's never list.

## 8 · Traps

**T-T5 · The response shape is undocumented** (audit C14) and **minutes are
the canonical unit.** Read minutes, print with `fmtMinutes`. A response that
hands you hours as a decimal (`1.5`) must not be printed as `1.5` — and never
as a day count either; `formatDayCount` is for days, not hours.

**T-T6 · Accept several field spellings.** Like comp-off (T-T8), the same
entity is read by employee, manager and HR views with different names. Write
one accessor per field and use it everywhere.

---

# Tab 4 · Flags

## 1 · What it's for

Things the system noticed about the person's attendance — a missing punch, a
punch from outside a work location, a work-mode claim that didn't match the
contract. Not accusations: **things to explain or fix.**

Internally the API calls these **anomalies**. The person sees "Flags", and each
one is described by what happened, never by its enum.

## 3 · Data

`attendanceAPI.getMyAnomalies({ page, limit, start_date, end_date })`

`anomalyLabel()` and `anomalyStatusKey()` (`attendance/enums.js`, ported into
`lib/enums.js`) turn the codes into words. If a code arrives that isn't in the
map, `humanize()` it — never print the raw code (§4).

## 4 · Layout

```
FilterTabs   All · Open · Explained · Closed
FlatList of Row
  │ Tue 3 Oct     ● Open                  │
  │ No clock-out recorded                 │
  tap → RecordSheet  (what was noticed, when, what to do)
```

## 5 · States

The five standard ones. The empty state is the good news and should say so:
**"Nothing flagged. Your attendance looks clean."**

## 6 · Actions

Usually none — a flag is resolved by requesting a correction, which the
`RecordSheet`'s footer note says:

> A missing punch is fixed by a correction request, which your manager reviews.

If the server offers an acknowledge/explain action, it goes in the sheet's
footer, never in the row.

## 7 · Field help

**Surface `attendance.anomalies` already exists** in
`fieldHelp.employee.json`. Wire its entries on the **column headers** of this
list, not the cells. These qualify because a flag type is ours — we invented
the set — and §10's never list covers *routine queue status*, not a concept the
person has never seen.

## 8 · Traps

**T-T7 · The word is "Flags", and each flag is a sentence.** Not
`missing_punch_out`, not "Anomaly #4". The tab label, the sheet title and the
row all read as English.

---

# Tab 5 · Earned Leave

## 1 · What it's for

Days earned by working when the person didn't have to — a holiday, a weekly
off — and how long they have to use them before they lapse.

**The term is "Earned Leave"**, from `DICTIONARY.TERMS.COMP_OFF`. Never
"comp-off", "compensatory off" or "comp off" on screen. Read the term from the
dictionary rather than typing it, so one change moves every screen.

## 3 · Data

```js
attendanceAPI.getMyCompOffSummary()                     // the tiles
attendanceAPI.getMyCompOffs({ page, limit, status })    // the rows
```

## 4 · Layout

```
3 tiles   Available · Used · Expiring soon
          values via formatDayCount() — "2d and 1/2 d", never 2.5
FilterTabs   from COMP_OFF_FILTERS
FlatList of Row
  │ Worked Sun 5 Oct   ● Available        │
  │ Use by 4 Jan                          │
  tap → RecordSheet (the web's CompOffDetailDialog)
Button primary "Use an earned day"  → EarnedLeaveForm
```

An **"Expiring soon"** tile is the whole reason this screen is worth opening.
Surface it with the date, in words: "Use by 4 Jan", not a countdown.

## 5 · States

The five standard ones, plus **expiring-soon highlighting** — fuchsia (pending/
warning), never amber, and never rose. An expiring day is not an error.

## 6 · Actions

**Use an earned day** → `EarnedLeaveForm`. On success, emit
`ATTENDANCE_EVENTS.COMP_OFF` **and** `ATTENDANCE_EVENTS.LEAVE` — using an
earned day creates a leave request, and the Leave tab's list is stale until it
hears about it.

## 7 · Field help

**2 entries, surface `attendance.comp_off`.** Both qualify as "ours" and
"derived":

```json
"attendance.comp_off": {
  "kind": "list",
  "description": "Earned leave (comp-off) balance and ledger — My Time › Earned Leave",
  "workspaces": ["employee"],
  "fields": {
    "expires_on": {
      "hint": "The last day you can use this earned day. After that it lapses and can't be claimed back.",
      "askMaya": {
        "enabled": true,
        "question": "What is earned leave in HR Clouds, how do I earn a day, and what happens if I don't use it before it expires?"
      }
    },
    "available_days": {
      "hint": "Earned days you can still use, after anything already booked or lapsed.",
      "askMaya": {
        "enabled": true,
        "question": "How is my available earned-leave balance worked out, and how is it different from my normal leave balance?"
      }
    }
  }
}
```

## 8 · Traps

**T-T8 · The record shape is not documented** (audit C11). The worked date
arrives as `earned_date`, `worked_date`, `date` **or** `work_date` depending on
which view the backend is reusing. Port the web file's accessors verbatim:

```js
const workedDate = (r) => ymdOnly(r.earned_date || r.worked_date || r.date || r.work_date);
```

**T-T9 · A day is whole or half.** `formatDayCount()` only — in the tiles, the
rows, the sheet and the form. Eight hand-rolled copies of this logic once
disagreed with each other on the web (§6).

---

# The three forms

All three are **full-screen modals** (`FormSheet`), never bottom sheets, and all
three follow §11: the button stays live, the press does the checking, the form
never opens in red, and the press travels to the first problem.

Use `useFormFocus()` for the travel and `lib/formGuard.js` for the pure checks.

## CorrectionForm

### 3 · Data

```js
attendanceAPI.submitRegularization({
  date, requested_clock_in, requested_clock_out,
  work_mode, reason,
})
```

### 4 · Layout — gridded, not scrolled

Five fields, so `max-w` equivalent: a two-column `FormGrid` at 390pt means the
two time fields side by side and everything else full width. §3's rule — four
or more fields means wide and gridded — translates on a phone to: **nothing
below the fold before the footer**.

```
FormSheet "Request a correction"
  FormGrid
    DateField  "Which day"                         full width
    TimeField  "Clock in"      TimeField "Clock out"    side by side
    Select     "Worked from"   ⓘ                   full width, hybrid only
    TextField  "What actually happened"  multiline  full width
  footer (pinned)   [Cancel]  [Send request]
```

`TimeField`, never `<input type="time">`'s native cousin — on Android the bare
`DateTimePicker` renders inline and pushes the footer off screen, which is why
`PickerHost` wraps it (`ui/TimeField.jsx`).

### 6 · Validation (before the call, every time)

```js
const problems = {};
if (!date)                 problems.date = 'Pick the day you want corrected.';
if (isFuture(date))        problems.date = 'You can only correct a day that has passed.';
if (!inTime && !outTime)   problems._times = 'Give at least one time to correct.';
if (inTime && outTime && outTime <= inTime)
  problems.requested_clock_out = 'Clock out has to be after clock in.';
if (!reason.trim())        problems.reason = 'Say what actually happened — your manager reads this.';
if (focusFirstProblem(problems)) return;
```

`_times` is the §11 pattern for a step that isn't one box: underscore-prefixed
so it can never collide with a payload key, present in the id map, and the
message shown under the pair it belongs to. The footer note and the blocking
message are **one string, declared once**.

On success: toast, `emitAttendanceChanged(ATTENDANCE_EVENTS.REGULARIZATION)`,
close, and the list refreshes from the event — not from a second fetch wired
into the close handler.

### 7 · Field help

One entry, and it **already exists**: `attendance.regularization` →
`work_mode`. Wire it beside the label in a `flex items-center` row — never
inside the `<label>`.

Date, times and reason are ordinary (§10 row 1): no ⓘ.

## OvertimeForm

Three fields — date, hours, reason. Same shape, same validation discipline.
Hours in **minutes** on the wire (T-T5). No ⓘ: date, a duration and a reason
are ordinary, and the screen's own heading explains what it is.

## EarnedLeaveForm

```
FormSheet "Use earned leave"
  ReadOnlyField  "Available"   2d and 1/2 d
  DateField      "Which day do you want off"
  Select         "Full day or half day"   ⓘ
  TextField      "Reason"  multiline
```

**Validate the balance before calling** — asking for 1 day with 1/2 d available
is a 400 that names a payload key, and the person reads our words instead:
"You have 1/2 d of earned leave. Ask for a half day, or a full day of normal
leave."

One ⓘ, on the full/half choice, because half a day of earned leave interacts
with the shift in a way nobody guesses:

```json
"half_day": {
  "hint": "A half day uses half an earned day. Which half you take follows your shift, not the clock.",
  "askMaya": { "enabled": true, "question": "How does a half day of earned leave work, and how much of my balance does it use?" }
}
```

On success emit **both** `COMP_OFF` and `LEAVE`.

---

## Field-help outcome for this spec

| Surface | Entries |
|---|---|
| `attendance.history` (tab 1) | **0** — §10 never list (status, hours, late, effective) |
| `attendance.regularization` | **1**, already shipped (`work_mode`) |
| overtime list and form | **0** — ordinary fields; columns on the never list |
| `attendance.anomalies` | **already shipped** — wire on the column headers |
| `attendance.comp_off` | **2 new** — `expires_on`, `available_days` |
| earned-leave form | **1 new** — `half_day` |

Three new entries across a five-tab screen, under the 4-per-screen-state cap
(each strip tab is its own screen state, so the cap is per tab). Every one has
an Ask Maya question; none names an amount, a date or a person.

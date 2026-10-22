# 02 · Home and the punch card — Home · DayLog

**Build this first.** It is the screen 95% of people open the app for, it is
the only screen with a write that has to be right, and it exercises the whole
stack — token, location, permissions, the event bus, live hours, the hero
header and the record sheet. Everything after it is a list.

Phase 3. Web ancestors: `roles/employee/screens/EmployeeDashboard.jsx` and
`roles/employee/components/AttendanceCard.jsx`.

---

# Home

## 1 · What it's for

Punching in and out, and seeing at a glance where today stands. Secondarily:
this month so far, and the last few days. Nothing on it is a report — a person
opening this screen in a lift has about four seconds, and the one thing they
came for is a button.

That is why the punch card is **above the fold, always**, before any chart.

## 2 · Web ancestor

`EmployeeDashboard.jsx` — a purple `PageHeader`, then `AttendanceCard`, then
a monthly snapshot, an attendance-mix pie, a daily-hours bar chart, and a
five-row punch-history preview.

**Port:** the hero, the punch card, the monthly snapshot, the history preview.

**Do NOT port:**

- The **pie chart.** A four-slice pie at 390pt is unreadable and the same four
  numbers are already in the snapshot tiles. Drop it. (The bar chart stays —
  see §4.)
- The Recharts tooltip. There is no hover on a phone; the bar chart gets a
  tap-to-reveal label instead.
- `DashboardTopBar`'s search. Search belongs on Directory.
- The web's `chartPageCount`/`chartPageRows` paging of the bar chart. A month
  of bars fits in a horizontal scroll; paging a chart with arrows is a
  desktop affordance.

## 3 · Data

| # | Call | Params | Blocks paint | Notes |
|---|---|---|---|---|
| 1 | `attendanceAPI.getToday()` | — | **yes** | the punch state machine's only source |
| 2 | `attendanceAPI.getMyShift()` | — | no | start/end for the ring and "you're early" |
| 3 | `attendanceAPI.getMyFieldAssignments()` | — | no | the ONLY source for work mode and office names |
| 4 | `attendanceAPI.getSummary()` | `{ month }` | no | the snapshot tiles |
| 5 | `attendanceAPI.getHistory()` | `{ limit: 5 }` | no | the preview rows |
| 6 | `attendanceAPI.getGraphData()` | `{ month }` | no | the daily-hours bars |
| 7 | `attendanceAPI.getUpcomingHolidays()` | `{ limit: 1 }` | no | the hero chip, if any |

1–3 come from **`useTodayAttendance()`**, already written
(`hooks/useTodayAttendance.js`). Do not call `getToday` yourself anywhere: the
hook owns the request tokens, the midnight re-arm and the foreground refresh,
and a second caller is a second state machine that will disagree with it.

4–7 are the screen's own, each with a `cancelled` flag, each failing
independently — a dead `getGraphData` hides the chart and nothing else.

**Keys actually read** are listed in
[10-api/03-payload-shapes.md](../10-api/03-payload-shapes.md). The ones that
decide the layout:

```js
today.status            // the state machine (U5) — never re-derived locally
today.clock_in_time / clock_out_time
today.breaks[]          // absent key ≠ no breaks. See trap T-H4
today.work_mode
today.geofence          // { evaluated, within_geofence, matched_location_id, … }
today.day_status        // holiday / weekly-off / on-leave context for idle
shift.start_time / end_time / shift_type
```

## 4 · Layout (390pt, top to bottom)

```
PageHeader (purple hero, minHeight 132)
  eyebrow   greetingFor(hour)        "Good morning"
  title     user's first name        from hydrateProfile, "Loading…" until then
  subtitle  fmtDate(today, long)     "Monday, 14 October"
  HeroChip  next holiday, if within 30 days   → tap: LeaveTab/Holidays

PunchCard  ← the whole point of the screen
  ┌───────────────────────────────────────────┐
  │        ◯ progress ring, 96pt              │   ring = worked / shift length
  │          08:42  ← live, tabular-nums      │   ticks 1s, foreground only
  │          "Working since 9:14 AM"          │
  │                                           │
  │  StatusBadge  ● Working      (or Idle…)   │
  │  work-mode Select  ← hybrid contracts only│
  │  InlineAlert geofence notice  ← see §5    │
  │                                           │
  │  [    Clock out    ]  [  Start break  ]   │
  └───────────────────────────────────────────┘

MonthlySnapshot  Card + 4 tiles (2×2)
  Present · Unpaid days · Late · Worked
  MonthStepper in the card header, forward disabled past this month

Daily hours  Card
  horizontal-scroll bars, one per day, Sundays marked, tap a bar → DayLog
  (react-native-gifted-charts; colours from theme/tokens chart palette)

Recent days  Card
  5 × Row  →  tap opens DayLog
  ListFooter: LinkButton "See all my time" → TimeTab/Time
```

The ring, the clock and the two buttons are `AttendanceCard`'s, lifted
wholesale — including its seven button variants, which are already in
`ui/Button.jsx` (`breakStart`, `breakEnd` and `danger` among them).

**The live clock** comes from `useLiveWorked(today)` in
`hooks/useTodayAttendance.js`. It ticks only while clocked in **and** the app
is foregrounded, and it reads `Date.now()` on every tick rather than
incrementing a counter — an incremented counter drifts by minutes across a
screen lock, and the number it drifts away from is somebody's pay.

## 5 · States

The punch card has **three** states from the server plus five overlays.

| `today.status` | Card shows | Buttons |
|---|---|---|
| idle (no clock-in) | an empty ring, "Not clocked in yet", the shift window | **Clock in** |
| working | the live ring and clock, "Working since …" | **Clock out** · **Start break** / **End break** |
| done (clocked out) | the finished-day strip — in, out, worked, break, late, overtime | none, plus a `DetailFooterNote`-style line saying why |

**Never re-derive the state** from the presence of `clock_out_time`. The
backend's `status` is authoritative (U5), it accounts for the overnight
carry-over (T2), and a locally derived state disagrees with it at exactly the
moment it matters — midnight on a night shift.

Overlays on the idle state, each from `today.day_status`:

| Context | Copy |
|---|---|
| Holiday | "Today is a holiday — {name}. You can still clock in if you're working." |
| Weekly off | "Today is your weekly off." |
| On approved leave | "You're on leave today." |
| Before the shift starts | "Your shift starts at 9:00 AM." — not a block |
| No shift assigned | nothing at all. The ring becomes a plain elapsed clock |

Screen-level states:

- **Loading** — `Skeleton type="dashboard"`, gated on `loading && !today`, so
  a pull-to-refresh never blanks a screen somebody is reading.
- **Error on `getToday`** — `ErrorState` with Try again **in place of the card
  only**. The rest of the screen still renders; the month didn't fail.
- **Offline** — the card shows the last known state with an indigo
  `InlineAlert` "You're offline — this is what we last knew." Both punch
  buttons stay visible and **fail with a clear message on press**. They are
  not disabled and the punch is **not queued** — see T-H1.
- **Partial** — any of calls 4–7 failing hides its own card. No global error.
- **Refreshing** — `RefreshControl` on the scroll view, tinted `color.brand`.

### Geofence — four outcomes, none of them an error

From `today.geofence`, after a punch:

| `evaluated` | `within_geofence` | Show |
|---|---|---|
| `false` | — | **nothing.** Silent. Your org doesn't use geofencing |
| `true` | `true` | a violet line: "Clocked in at {office name}." Name omitted if unresolvable |
| `true` | `false` | a **fuchsia** line: "Clocked in away from {office name}. Your manager will see where." |
| `true` | `null` | a fuchsia line: "We couldn't check your location against your office." |

**Never rose. Never "couldn't clock you in". Never roll back the punch.** All
four are a 200/201 — the punch succeeded in every case, and the flag is
information for a manager, not a failure for the person. This is the single
most commonly broken rule in the whole attendance domain.

Resolve the office name through `contract` (call 3) as
[30-domain/04-attendance.md](../30-domain/04-attendance.md) §4 shows; an
unmatched id yields `""` and **the copy drops the name clause** rather than
printing an id or "Unknown" (§4).

### Work mode — the toggle almost nobody sees

Shown **only** when `choosesWorkMode(contract?.work_mode)` — i.e. a `hybrid`
contract. Everyone else: the contract decides, the server overrides whatever
you send, **and sending it anyway raises a `work_mode_claim_mismatch` flag
against the person.** A failed call 3 means `contract === null`, which hides
the toggle. Remember the last choice in AsyncStorage
(`hrclouds_attendance_work_mode`), validated against `WORK_MODE_VALUES` on
read.

## 6 · Actions

### Clock in

```
1. getPunchLocation({ prompt: true })        lib/location.js — never throws
2. attendanceAPI.clockIn({
     source: 'mobile',
     client_timestamp: new Date().toISOString(),
     work_mode,                               ← ONLY for a hybrid contract
     notes,                                   ← only if the person typed one
     ...locationPayload(fix),                 ← latitude, longitude, metadata
   })
3. refresh() from useTodayAttendance
4. emitAttendanceChanged(ATTENDANCE_EVENTS.ATTENDANCE)
5. toast: "Clocked in at 9:14 AM."
```

**Location never blocks the punch.** Every `GEO_STATUS` other than `GRANTED`
still sends the punch, without coordinates, and the card says what happened in
one sentence with a Retry. The backend accepts a punch with no location and
flags it — which is the correct outcome, because somebody standing in a
basement car park at 9 a.m. needs to be clocked in, not educated about GPS.

The payload keys are **exactly** `clockInSchema`: `source`, `latitude`,
`longitude`, `client_timestamp`, `notes`, `work_mode`, `metadata`. There is no
accuracy field and no mock-location field — accuracy and Android's `mocked`
flag ride inside `metadata` (`geo_accuracy`, `mock_location`), because
`stripUnknown` **silently drops** anything else and you would never know.

### Clock out

Same, minus `work_mode` (not in `clockOutSchema`), and **with a confirm**:

> **Clock out at 6:42 PM?** · You've worked 8h 12m today.
> [Not yet] [Clock out]

`await useConfirm()` — the provider's confirm returns a Promise, and an
unawaited one fires the API before the person answers (CLAUDE.md §7: ~20 of
those on the web once).

### Start break / End break

`breakStart()` / `breakEnd()`, no location, no confirm, optimistic ring pause.
**End Break shows only while a break is open** — derive that from
`today.breaks`, and read T-H4 before you do.

### Every punch emits

`emitAttendanceChanged(ATTENDANCE_EVENTS.ATTENDANCE)`. The Time tab's lists,
the month summary and anything else holding today's state subscribe to it.
Without the emit they go stale until the app restarts.

### State reconciliation (the one error that isn't an error)

If the server answers "you're already clocked in" (or out), that is **not** a
failure — the app's view was stale. `isStateReconciliation(err)` detects it;
on true, **refresh and show nothing**. No red, no toast. The person pressed a
button that described the world as they last saw it, and the world had moved.

## 7 · Field help

**Surface `attendance.punch` — 2 entries.** Everything else on this screen is
the ordinary data people read every day, and CLAUDE.md §10 is explicit that
dashboard counts, Live Attendance, hours, late and effective columns get
**no ⓘ ever** (user decision, 2026-10-01 — they were removed as annoying).

So: no ⓘ on the clock, the ring, Present/Unpaid/Late/Worked, the bars, or the
recent-days rows. Two fields qualify, both "ours":

```json
"attendance.punch": {
  "kind": "screen",
  "description": "The daily punch card — Home (PunchCard; ported from AttendanceCard)",
  "workspaces": ["employee"],
  "fields": {
    "work_mode": {
      "hint": "Where you're working from today. Your contract usually decides it; you can only choose when it allows both.",
      "askMaya": {
        "enabled": true,
        "question": "What does ‘Worked from’ mean on my punch card, and what is the difference between office, remote, field and hybrid work?"
      }
    },
    "geofence": {
      "hint": "Whether you punched inside one of your work locations. Being outside never stops the punch — it's noted for your manager.",
      "askMaya": {
        "enabled": true,
        "question": "How does HR Clouds check my location when I clock in, and what happens if I punch from outside my work location?"
      }
    }
  }
}
```

The `geofence` ⓘ is a `HelpLabel` on the notice itself, and it renders **only
when the notice does** — `evaluated: false` means no notice and no ⓘ.

## 8 · Traps

**T-H1 · A punch is never queued offline.** Not now, not later. An attendance
record is a legal and payroll artefact with a server timestamp; a punch
replayed from a queue forty minutes later is a false record, and the person
believes they are clocked in when they are not. Offline → one clear sentence
and a live Retry. This is a product decision, not a technical limit
([60-ops/03-offline-and-lifecycle.md](../60-ops/03-offline-and-lifecycle.md)).

**T-H2 · The state comes from the server.** `today.status`, always. Deriving
it from `clock_out_time` breaks the overnight carry-over, where a night shift's
clock-out belongs to yesterday's record.

**T-H3 · `client_timestamp` is for drift detection, not for the record.** The
server times the punch. Send it anyway (the schema has it) but never display
it back as the punch time — show the server's `clock_in_time`, or a phone with
a wrong clock shows a wrong day.

**T-H4 · An absent `breaks` key is not "no breaks".** `getToday` omits it in
some states, and `(today.breaks || []).length === 0` reads an omission as
fact — which hides End Break from somebody who is on a break and cannot get
off it. Distinguish absent from empty: `breaksKnown` in `useLiveWorked` does
exactly this, and when breaks are unknown you show **both** break buttons
rather than guessing.

**T-H5 · The live clock must not tick in the background.** A 1s timer in a
backgrounded app is a battery complaint and, on iOS, a suspension. `useAppActive`
gates it. There is also **no poller on this screen** — a 30-second poll is
~2,900 requests per person per day for a number that changes when the person
presses a button. The four refresh triggers (the event bus, returning to the
foreground, local midnight, pull-to-refresh) cover every real case.

**T-H6 · Local midnight, not UTC midnight.** The timer re-arms off
`today.date`. A UTC rollover fires at 5:30 a.m. in IST and shows yesterday's
card to the early shift.

**T-H7 · `0,0` is not a location.** Some Android devices report it when the
fix fails. `lib/location.js` rejects it already — don't add a second path that
doesn't.

**T-H8 · Don't print a geofence id.** `matched_location_id` is a UUID. Resolve
it to a name through the contract, or drop the name from the sentence (§4).

---

# DayLog

## 1 · What it's for

One day, in full: every punch, every break, what was counted, and why the day
is marked the way it is. Opened by tapping a row or a bar — never a button in
a row (CLAUDE.md §3).

## 2 · Web ancestor

`DailyLogModal`, exported from `EmployeeAttendancePage.jsx`. It is already a
`DetailDialog`, so this is a near-mechanical port to `RecordSheet`.

## 3 · Data

`attendanceAPI.getDailyLog({ date })` — one call, on open. Keep the date as the
sheet's identity so reopening a different day refetches.

## 4 · Layout

```
RecordSheet
  eyebrow   "Monday, 14 October"
  title     the day's status, in words      "Present"
  badge     StatusBadge for the status
  SheetStats   Worked · Break · Late        3 up
  SheetSection "Punches"      SheetTable: In · Out · Where
  SheetSection "Breaks"       SheetTable, folded when more than 2, total in the title
  SheetSection "How this day was counted"   SheetGrid, 2 columns
     Effective hours · Overtime · Status · Work mode
  SheetText     the day-status note, if the server sent one
  SheetFooterNote  why there are no actions — see §6
```

Two columns maximum on a phone. The web `DetailGrid` allows four; at 390pt a
four-column grid gives each value about 80pt and every number wraps.

## 5 · States

Loading (`Skeleton type="sheet"`) · loaded · **no record for that day**
("Nothing was recorded on this day." — an empty state, not an error) ·
couldn't load (`ErrorState` inside the sheet, with Try again) · a future date
(shouldn't be reachable; if it is, say "This day hasn't happened yet.").

"Nothing on file" and "couldn't load" must read differently (CLAUDE.md §7).

## 6 · Actions

**None, and the sheet says so.** `SheetFooterNote`:

> Something wrong with this day? Request a correction from My Time.

Not a button — a correction needs a reason and a date range, which is a form,
and a form is not a record inspector. The note names where to go.

## 7 · Field help

**No field qualifies.** Every field on this sheet — in, out, worked, break,
late, status, work mode — is on §10's never list: routine attendance data,
seen daily, understood after the first time. The one borderline field,
"Effective hours", is explicitly named in that list too ("attendance status /
hours / effective / late / overtime columns and day inspectors").

Say so in the hand-off rather than inventing one.

## 8 · Traps

- **Punch times are wall-clock.** Render `clock_in_time` with `fmtClockTime`,
  never through a Date that shifts by timezone. A punch at 9:14 in Chennai
  reads 9:14 everywhere, including to a payroll admin in another zone.
- **Never render a dash.** An unmeasured break is **0m**, not "–". An unknown
  work mode is **N/A**.
- The sheet is local state in the screen that owns the list, **not a route**.
  Routing it unmounts the list behind it and the master–detail illusion — the
  thing that makes a sheet feel like a sheet — is gone.
- Opening the same sheet from Home and from Time must give the identical
  component. It is one file in `features/attendance/`, imported by both.

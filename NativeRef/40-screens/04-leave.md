# 04 · Leave — Leave · ApplyLeave · Holidays

Phase 5. Web ancestor: `roles/employee/screens/LeaveDashboard.jsx`.
Its own tab because it is the second most-used action after punching.

---

# Leave

**For:** how many days are left, what's been asked for, and asking for more.

### Data

```js
leaveAPI.getMyBalances()                      // the tiles
leaveAPI.getMyLeaveTypes()                    // the form's options
leaveAPI.getMyRequests({ page, limit: 20 })   // the rows
leaveAPI.cancelRequest(id, { reason })
```

### Layout

```
Balance tiles — one per leave type, 2 across, horizontal scroll if > 4
  │ Casual Leave          │   label from the type, not an enum
  │ 6d left               │   formatDayCount(), caption says "left" not "days"
Button primary "Apply for leave"
FilterTabs  All (9) · Waiting (1) · Approved (7) · Declined (1)
FlatList of Row
  │ 12–14 Oct · Casual      ● Waiting │
  │ 3d · Family wedding               │
  └ Cancel ───────────────────────────┘
  tap → RecordSheet
```

### States

Loading (`Skeleton type="tiles"` then rows) · loaded · **no leave types
configured** (tiles hidden, Apply hidden, one line: "Your organisation hasn't
set up leave types yet.") · empty list · empty filter · balances loaded but
list failed (tiles stay, list shows `ErrorState` — two independent reads) ·
offline.

**Distinguish "no balance" from "couldn't load balance":** a failed read reads
**"Couldn't load"**, never "0d" — a zero invites somebody to conclude they have
nothing left (CLAUDE.md §7).

### Actions

**Apply for leave** → `ApplyLeave` modal.

**Cancel** — in the row, `ReasonPrompt`:
> **Cancel this leave request?** · Approving it would have used 3d of your
> balance; cancelling gives those back.

Cancel is offered for pending **and** for approved-but-future requests if the
server allows it — gate on what the response says, not on the status string.

On success: `emitAttendanceChanged(ATTENDANCE_EVENTS.LEAVE)`, toast, refresh
the one row **and** the balances (a cancel changes a number on screen).

### Field help — 2 entries

```json
"leave.balance": {
  "kind": "list",
  "description": "Leave balance tiles and request list — My Leave (LeaveDashboard)",
  "workspaces": ["employee"],
  "fields": {
    "available_days": {
      "hint": "Days you can still take, after what's approved and what's already waiting for a decision.",
      "askMaya": { "enabled": true, "question": "How is my leave balance worked out, and does a request that is still waiting for approval come out of it?" }
    },
    "accrued_days": {
      "hint": "Days given to you so far this year. Some leave arrives all at once, some a little each month.",
      "askMaya": { "enabled": true, "question": "What does ‘given so far’ mean on my leave balance, and how do leave days build up over the year?" }
    }
  }
}
```

**accrued → "given so far"**, never "accrued" (§6). The row statuses get no ⓘ
(routine queue status, §10 never list).

### Traps

- **A day is whole or half.** `formatDayCount()`, always. `0.5` → "1/2 d".
- **A pending request may already be deducted.** Whether it is depends on the
  org's policy and the balance payload says so — don't compute "available"
  yourself from total − used.
- **Leave type names are data, not an enum.** "Casual Leave" comes from the
  API. Don't map codes; if a name is missing, `humanize()` the code.
- **Never show the request id** in the row, the sheet or the cancel toast.

---

# ApplyLeave

Full-screen `FormSheet`, never a bottom sheet.

### Layout — gridded

```
FormGrid
  Select     "Type of leave"  ⓘ            full width
  DateField  "From"    DateField "To"       side by side
  Select     "Full day or half day"  ⓘ      full width (only if the type allows)
  ReadOnlyField "This will use"  2d         full width — derived, live
  TextField  "Reason"  multiline            full width
  attachment picker                         only if the type requires one
footer  [Cancel] [Send request]
```

**"This will use 2d"** is the field that prevents most rejected requests —
it recalculates as the dates change, excludes weekly offs and holidays if the
type does, and is `N/A` until both dates are set (never a dash, never `0`).

### Validation (before the call)

```js
if (!typeId)          problems.leave_type_id = 'Choose the kind of leave.';
if (!from)            problems.start_date = 'Pick the first day.';
if (!to)              problems.end_date   = 'Pick the last day.';
if (to < from)        problems.end_date   = 'The last day can’t be before the first.';
if (days > available) problems._balance =
  `You have ${formatDayCount(available)} of ${typeName} left, and this asks for ${formatDayCount(days)}.`;
if (requiresReason && !reason.trim()) problems.reason = 'Say why — your manager reads this.';
if (requiresProof && !file) problems._proof = 'This leave needs a document attached.';
if (focusFirstProblem(problems)) return;
```

`_balance` and `_proof` are §11 non-box keys. The over-balance message is the
one that matters: the server's refusal is `leave_balance_exceeded` against a
payload key, and nobody reads that.

**Attachments** go through the three-step presigned upload
([10-api/03-payload-shapes.md](../10-api/03-payload-shapes.md)) — request a
URL, PUT the bytes, confirm. A failure at step 2 must not leave a request
submitted with no proof: upload **first**, submit **after**.

On success: toast "Leave requested — your manager has been told.",
`emit(LEAVE)`, close.

### Field help — 2 entries

```json
"leave.apply": {
  "kind": "form",
  "description": "Apply for leave (ApplyLeaveScreen)",
  "workspaces": ["employee"],
  "fields": {
    "leave_type_id": {
      "hint": "Each kind of leave has its own balance and its own rules about notice, proof and half days.",
      "askMaya": { "enabled": true, "question": "What are the different kinds of leave in HR Clouds, and how do I choose the right one?" }
    },
    "is_half_day": {
      "hint": "A half day uses half a day of your balance. Which half you take follows your shift.",
      "askMaya": { "enabled": true, "question": "How does a half day of leave work, and how much of my balance does it use?" }
    }
  }
}
```

From and To are ordinary dates: no ⓘ. "This will use" is derived and would
qualify — but it is *already* an explanation of itself, so §10's
"nothing where the screen already explains itself" applies. That keeps the
screen at two, under the cap.

---

# Holidays

**For:** which days the office is closed this year.

### Data

`attendanceAPI.getUpcomingHolidays({ year })` — one call, no pagination.

### Layout

```
Year stepper (PeriodStepper)
SectionList grouped by month
  │ 2 Oct   Gandhi Jayanti        Public  │
  │ 24 Oct  Diwali                Public  │
Past holidays dimmed; the next one carries a violet "Next" pill
Optional holidays, if the org has them, in their own section with a note
```

### States

Loading · loaded · **empty year** ("No holidays published for 2027 yet.") ·
couldn't load · offline (the last fetched year is fine to show — a holiday list
does not change).

### Actions

None. No row opens anything — so the rows get a **plain hover/press class, not
`rowPreviewProps`** (§3: a row that can't open anything doesn't get the preview
props, and must not look tappable).

### Field help

**No field qualifies**, unless the org uses **optional holidays** — a concept
we expose and nobody guesses:

```json
"attendance.holidays": {
  "kind": "list",
  "description": "Holiday calendar — My Leave › Holidays",
  "workspaces": ["employee"],
  "fields": {
    "is_optional": {
      "hint": "A holiday you can choose to take instead of working. Your organisation sets how many you get each year.",
      "askMaya": { "enabled": true, "question": "What is an optional holiday, how many can I take, and how do I claim one?" }
    }
  }
}
```

Wire it on the **section header** for optional holidays, and only when that
section renders.

### Traps

- The year stepper must not go past the last published year — a stepper that
  walks into three empty years looks broken.
- A holiday list is the safest thing in the app to cache; it is also the one
  people check offline on a long weekend. Cache the fetched year.

# 05 · Leave domain

The web screen is `roles/employee/screens/LeaveDashboard.jsx` — 1003 lines, the
largest single employee screen. On mobile it splits into a screen plus two
sheets, but the logic is the same.

---

## 1. What the employee can do

| Can | Cannot |
|---|---|
| See balances per leave type | Change a balance |
| Apply for leave | Approve anything |
| See their request history | See anyone else's leave |
| Cancel / withdraw their own request | Change an approved request |
| Attach evidence | Verify evidence |
| See upcoming holidays | Add a holiday |

---

## 2. Balances

```js
leaveAPI.getMyBalances(year?)   // → balances[]
leaveAPI.getMyLeaveTypes()      // → the types they may apply for
```

Each balance card shows three figures, and the wording is fixed:

| Field | Label | Rendered with |
|---|---|---|
| `current_balance` | *(no caption — it's the headline)* | `formatDayCount(v, { fallback: '0 Days' })` |
| `total_accrued` | **given so far** | `formatDayCount(v, { lower: true, fallback: '0 days' })` |
| `total_used` | **used** | same |

**No "days" caption anywhere** — `formatDayCount` already carries the unit.

### The pending hold — a derived figure

The web screen computes it client-side:

```js
const available   = parseFloat(selectedBalance.current_balance);
const pendingHold = /* days sitting in this type's pending requests */;
const effective   = available - pendingHold;
```

This is **not a server field**. It exists because applying for leave you've
already requested is the single most common leave mistake. It gets an ⓘ
(`leaves.apply` → `pending_hold`) precisely because it's derived.

Show it in the apply form, where the decision is being made — not on the balance
card, where it would read as the balance itself.

---

## 3. Applying

```js
// POST /leaves/request
{
  leave_type_id,                  // required — from getMyLeaveTypes()
  start_date: 'YYYY-MM-DD',       // required, literal, no timezone
  end_date:   'YYYY-MM-DD',       // required
  is_half_day?: boolean,
  half_day_type?: 'first_half' | 'second_half',
  reason?: string,
  document_url?: string,          // XOR
  document_id?: string,           // XOR
}
```

### The form

A **full-screen modal** (`FormSheet`), gridded:

```
┌─ Apply for leave ────────────────────────── ✕ ─┐
│                                                 │
│  LEAVE TYPE ⓘ                                   │  ← full width (Select)
│  [ Casual Leave                            ▾ ]  │
│                                                 │
│  ┌─ 12 Days left · 2 Days held by pending ⓘ ─┐  │  ← the balance strip
│  └─────────────────────────────────────────┘    │
│                                                 │
│  FROM                    TO                     │  ← two across
│  [ 20 Oct 2026 ]         [ 22 Oct 2026 ]        │
│                                                 │
│  ◻ Half day                                     │
│  ( ) First half  ( ) Second half                │  ← only when checked
│                                                 │
│  REASON                                         │  ← full width
│  [                                           ]  │
│                                                 │
│  ATTACH EVIDENCE (optional)                     │  ← full width
│  [ Pick one of my documents ] or [ paste a link]│
│                                                 │
├─────────────────────────────────────────────────┤
│                        [ Cancel ] [ Send request ]│  ← PINNED
└─────────────────────────────────────────────────┘
```

Rules:

- **Half day forces start = end.** A half day across a range is meaningless;
  collapse the two date fields into one when the toggle is on.
- `half_day_type` is only sent when `is_half_day` is true.
- **Take the day count from the response**, never compute it. The backend
  auto-handles holidays, weekends, the sandwich rule and unpaid days — and will
  disagree with your arithmetic.
- The balance strip updates as the type changes, and shows the **effective**
  figure.
- Future dates only, unless the leave type allows backdating. If you don't know,
  let the server say so — don't guess a `min`.

### Attachments — one or the other, never both

| Mode | Field | Behaviour |
|---|---|---|
| A link the applicant pastes | `document_url` | Stored as given |
| One of their own portal documents | `document_id` | The server checks it belongs to them and is evidence-grade (`available` or `pending_verification`), then stores the relative path `/api/v1/documents/attachments/:id/view-url` into `document_url` |

**That stored path is not a URL a client can follow** (T9). Every leave
attachment is opened through
`GET /documents/attachments/:id/view-url` — the bridge, which works out whether
you're the applicant, the manager chain or HR, and gives anyone else a uniform
404.

Some leave types **require** evidence above a day threshold
(`DOCUMENT_REQUIRED`). The type's config says so; surface it in the form rather
than letting the submit fail.

---

## 4. Cancelling — two outcomes, one call (T8)

```js
leaveAPI.cancelRequest(id);   // no body
```

The backend decides by **date**, not status:

| The leave is | Result | Toast |
|---|---|---|
| Entirely in the **future** | Cancelled immediately, balance refunded | "Leave cancelled. Your balance has been given back." |
| Already **started** (today or earlier) | `cancellation_pending` — needs manager approval | "Cancellation sent to your manager for approval." |

Nothing in the request tells you which. Read `response.message` for "pending
manager approval".

```js
function hasLeaveStarted(startDateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Force local midnight — new Date("2026-10-13") is UTC midnight and is the
  // previous day west of UTC.
  const start = new Date(`${String(startDateStr).slice(0, 10)}T00:00:00`);
  return !Number.isNaN(start.getTime()) && start <= today;
}
```

Use it to word the **confirm** correctly *before* the call:

> **Cancel this leave?** · Your balance will be given back.
> — vs —
> **Ask to cancel this leave?** · It has already started, so your manager needs
> to approve the cancellation.

And every cancel is behind `await confirm(...)`.

---

## 5. Request states

| Status | Label | What the employee can do |
|---|---|---|
| `pending` | Pending | **Withdraw** |
| `approved` | Approved | **Cancel leave** (→ one of the two outcomes above) |
| `rejected` | Rejected | Nothing. The sheet shows the rejection reason |
| `cancelled` | Cancelled | Nothing |
| `cancellation_pending` | **Cancellation waiting for approval** | Nothing — it's with the manager |

A sheet with no actions gets a `SheetFooterNote` saying **why**:

> "Rejected leave can't be changed. Apply again if you still need the days."

---

## 6. The leave detail sheet

```
eyebrow:  Casual Leave
title:    20 – 22 Oct 2026
subtitle: 3 Days
badge:    ● Approved

SheetStats:  Days | Unpaid ⓘ | Applied on
SheetSection "Why"            → SheetText(reason)
SheetSection "Evidence"       → AttachmentLink (through the bridge)
SheetSection "Decision"       → approver name (personName!), decided on, remarks
SheetSection "How it was counted" (folded) → working days, holidays skipped,
                                             weekly offs skipped, unpaid days
footer:      Cancel leave  |  or a SheetFooterNote
```

`unpaid_days` has an ⓘ (`leaves.request_detail` → `unpaid_days`) — it is a
payroll consequence an employee will not expect, and it reads **"unpaid days"**,
never "LOP" or "LWP".

The approver is rendered with `personName()`, never an id. If their name hasn't
resolved, it reads **"Loading…"**, then "A colleague".

---

## 7. Holidays

From `/attendance/holidays` — **no `year` parameter** (T4). Filter client-side.

Shown in two places:

1. A **Holidays** screen off the Leave tab: date, name, and whether it's
   optional or targeted at specific locations/departments.
2. **Context in the apply form** — a leave request spanning a holiday doesn't
   consume a leave day, and the backend handles it. Showing holidays while
   applying prevents a confused "why did it only take 2 days?" support call.

---

## 8. Earned Leave crosses over

Earned leave credits (`/attendance/comp-offs/mine`) land against the
**platform-owned Compensatory Off leave type**, whose code is `CO` **or**
`COMP_OFF` depending on the tenant's age:

```js
isSystemLeaveType('CO')        // true
isSystemLeaveType('COMP_OFF')  // true
```

New organisations get `CO`; older ones may carry `COMP_OFF`, and the backend's
own resolvers check `CO` first and fall back. **Anything keying off this must
accept both**, or older tenants lose the protection on screen while keeping it
on the server — the worst of the two.

So: the Earned Leave screen (Time tab) shows credits and their expiry; the
Leave screen shows the resulting **balance** and is where it's used. Link
between them in both directions.

Everything else about that type is HR's: display name, document threshold,
sandwich rule, demographic rules.

---

## 9. Leave rules an employee runs into

These come from their assigned policy and are read-only. Surface them where the
person hits them, not as a wall of policy text.

| Rule | Where it bites | Wording |
|---|---|---|
| Notice period cap | Applying during notice | "Leave of this type is restricted during your notice period." (`NOTICE_PERIOD_RESTRICTED`) |
| Demographic restriction | A type they can't use | "You are not eligible to apply for this leave type." (`DEMOGRAPHIC_INELIGIBLE`) |
| Missing profile detail | A gender-restricted type with no gender on file | "…that detail is not on file. Contact HR to update your profile." |
| Document threshold | Over N days of this type | "A supporting document is required for this many days of this leave type." |
| Policy ended | A date after their config's end | "This person's leave policy ended before that date." |
| Sandwich rule | A range spanning a weekend | The server's own message — it explains the specific case better than we can |
| Overlap | Two requests on the same day | The server's own message |

The last two are deliberately left to the **server's message** — those 400s
carry clear, specific copy that any generic sentence would blur.

Wording translations that apply here: **accrued → given so far**, **carry
forward → kept for next year**, **probation → wait after joining**, **overdraft
→ extra days below zero**, **Override Config → Customise Leave Rules**.

---

## 10. Refresh

```js
emitAttendanceChanged(ATTENDANCE_EVENTS.LEAVE);
```

After apply, withdraw and cancel. Subscribers: the Leave screen (balances and
list), Home (if it shows a leave tile), and the Earned Leave screen (a payout or
a used credit changes its list).

---

## 11. Leave checklist

- [ ] Every day count via `formatDayCount()`; no "days" caption beside it
- [ ] The day count comes from the server's response, not computed
- [ ] Half day forces start = end, and only then sends `half_day_type`
- [ ] `document_url` and `document_id` are mutually exclusive
- [ ] Attachments open through `/documents/attachments/:id/view-url`
- [ ] Cancel is confirmed, and the confirm wording matches which outcome will
      happen
- [ ] Both cancel outcomes produce the right toast, read from `response.message`
- [ ] `cancellation_pending` rendered as "Cancellation waiting for approval"
- [ ] Approver shown by name, never an id; "Loading…" while unresolved
- [ ] Holidays fetched without a `year` and filtered client-side
- [ ] `isSystemLeaveType` accepts both `CO` and `COMP_OFF`
- [ ] Policy refusals use mapped copy, except overlap/sandwich which use the
      server's message
- [ ] "unpaid days", never LOP or LWP
- [ ] The three leave ⓘ surfaces wired (`leaves.apply`, `leaves.balances`,
      `leaves.request_detail`)
- [ ] `LEAVE` event emitted on every write

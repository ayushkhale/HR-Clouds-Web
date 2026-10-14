# 01 · Wording

> **Write for someone who doesn't work in HR or payroll.**

Say the **consequence**, not the mechanism. "Approving refunds their balance",
not "triggers a balance reversal". Labels are sentences, not enum names: "How
it's worked out", "Still to repay".

These words were chosen one support ticket at a time. Use them exactly.

---

## 1. The dictionary — terms with one source

`DICTIONARY.TERMS` in `lib/dictionary.js`. A term with a single source lives
there; never type it on a screen.

```js
DICTIONARY.TERMS = {
  // A day credited for working an off day. A MASS NOUN — "Earned Leave" both
  // for one day and for many, never "Earned Leaves". Count phrases say
  // "3 earned leave days".
  COMP_OFF: 'Earned Leave',

  // A request to fix a missed or wrong punch. Pluralises normally.
  REGULARIZATION: 'Attendance Correction',

  // Turning unused leave, or a day earned for working an off day, into money on
  // a payslip. "Encashment" is the API's word and a payroll word — nobody
  // outside payroll says it, so it never reaches the screen. Pluralises
  // normally ("Leave Payouts"). The ACTION is "pay out", never "encash" or
  // "cash out".
  ENCASHMENT: 'Leave Payout',
};
```

---

## 2. Established translations

Left is what the API, the spec or an HR person says. Right is what the screen
says. There is no third option.

| Don't say | Say |
|---|---|
| Override Config | **Customise Leave Rules** |
| accrued | **given so far** |
| upfront / monthly (accrual) | **All at once / Every month** |
| carry forward | **kept for next year** |
| probation | **wait after joining** |
| overdraft | **extra days below zero** |
| TDS YTD | **Income tax so far** |
| Net Pay | **what reaches the bank** |
| Gross | **before deductions — not take-home** |
| encashment · encash · cash out | **Leave Payout** · **pay out** |
| comp-off · compensatory off | **Earned Leave** |
| regularization | **Attendance Correction** |
| Exits & Settlements | **Exits & Final Pay** |
| Statutory & Tax | **Tax & Legal Deductions** |
| statutory deductions | **PF, ESI and tax** (or "deductions required by law") |
| LOP · LWP · loss of pay | **unpaid days** |
| EMI · instalment amount | **monthly repayment** |
| disbursement · disbursed on | **money paid out on** |
| arrear · arrears | **backdated pay** |
| outstanding principal | **Still to repay** |
| anomaly | **flag** ("My Flags") |
| geofence | **work location** |
| CTC | **CTC** (keep it — it's the one acronym Indian employees do know) |
| IFSC | **IFSC code** (keep, but the ⓘ explains it) |

### Screen titles, exactly

| Screen | Title (= tab label = header) |
|---|---|
| Dashboard | **Home** (tab) / the greeting (hero) |
| My Attendance | **My Attendance** |
| My Leaves | **My Leaves** |
| My Attendance Corrections | **My Attendance Corrections** |
| My Overtime | **My Overtime** |
| My Flags | **My Flags** |
| My Earned Leave | **My Earned Leave** |
| My Salary & Bank | **My Salary & Bank** |
| My Payslips | **My Payslips** |
| My Claims & Benefits | **My Claims & Benefits** |
| My Loans & Variable Pay | **My Loans & Variable Pay** |
| My Tax & Investments | **My Tax & Investments** |
| My Document Home | **My Document Home** |
| My Personal Documents | **My Personal Documents** |
| My Company Documents | **My Company Documents** |
| My Document Requests | **My Document Requests** |
| Blank Forms | **Blank Forms** |
| Org Chart | **Org Chart** |
| Company Profile | **Company Profile** |
| My Profile | **My Profile** |
| Directory | **Directory** |

Every "My" is load-bearing: it is what tells someone they are looking at their
own data rather than the organisation's.

---

## 3. A day is whole or half, never a decimal

The single most-violated rule, and the one with eight historic offenders.

```js
formatDayCount(0.5)                      // "1 Half Day"
formatDayCount(1)                        // "1 Day"
formatDayCount(2)                        // "2 Days"
formatDayCount(2.5)                      // "2 Days and 1 Half Day"
formatDayCount(2.5, { lower: true })     // "2 days and 1 half day"
formatDayCount(null)                     // "N/A"
formatDayCount(null, { fallback: '0 Days' })
```

- **Never** `2.5`, `2½`, "2 and a half", or "2.5 days".
- A value that isn't a multiple of a half is a **backend bug**; it is snapped to
  the nearest half rather than leaking a decimal.
- `{ lower: true }` mid-sentence, where Title Case would read as a proper noun.
- **The phrase carries its own unit**, so a tile or column beside it must not
  add a "days" caption. Say "left", "paid", "unpaid", "given so far".

```jsx
// Right
<Text style={text.label}>Left</Text>
<Text style={text.metric}>{formatDayCount(b.current_balance)}</Text>

// Wrong — "2 Days and 1 Half Day days"
<Text style={text.label}>Days left</Text>
```

`formatDayCount()` is the **only** way to print a day count — in leave, earned
leave, payouts, payroll and attendance alike. Eight hand-rolled copies of this
disagreed with each other once; don't write a ninth.

---

## 4. Never render a dash

| Situation | Renders |
|---|---|
| Unknown / absent value | **N/A** (`displayValue()`) |
| Unmeasured duration | **0m** (`fmtMinutes` / `fmtHours` fallback) |
| No action available on a row | **nothing** — an empty slot |
| No row in the list has an action | the action affordance is **absent from every row** |
| A name that hasn't loaded | **Loading…** |
| A name that can't be resolved | **Unknown user** / **A colleague** / **System** |
| A failed read | **Couldn't load** — never "Not set" |

That last one matters: "Not set" invites someone to set it again, which is how
you get a duplicate bank account. Use a **sentinel**, not `null`, for a failed
lookup so the two are distinguishable.

`—`, `-`, `--`, `N/a`, `n/a`, `null`, `undefined`, `NaN` and `[object Object]`
must never appear.

---

## 5. Money

```js
formatMoney(57559.4)                  // "₹57,559.40"
formatMoney(57559)                    // "₹57,559"
formatMoney(-1200)                    // "-₹1,200"
formatMoney(87432, { withSymbol: false }) // "87,432"
formatMoney(null)                     // "₹0"
```

- **Indian grouping** (`en-IN`): `₹12,34,567`, not `₹1,234,567`.
- Whole rupees print **without** decimals; anything with paise prints exactly
  **two** — `₹57,559.40`, never `₹57,559.4` — so a column lines up.
- The symbol is `₹` (U+20B9). Never "Rs.", never "INR" in a figure.
- A deduction is shown as a positive number in a Deductions section, not as a
  negative. The section header carries the sign.

---

## 6. Durations

```js
fmtMinutes(95)      // "1h 35m"
fmtMinutes(45)      // "45m"
fmtMinutes(120)     // "2h"
fmtMinutes(0)       // "0m"
fmtHours('8.50')    // "8h 30m"
fmtDuration(ms)     // "02:14:07"  — the live timer only
workedLabel(record) // the server's own figure, tidied
```

- Never "8.5 hours" or "510 minutes".
- Never a negative duration — clamped at `0m`.
- **Worked time comes from `worked_duration_formatted`**, never from subtracting
  clock-in from clock-out. The server writes `"8h 0m"`; we write `"8h"` —
  `workedLabel()` reconciles them so one day doesn't read two ways on two
  screens.

---

## 7. Dates

```js
fmtDate('2026-10-13')        // "13 Oct 2026"
fmtDateShort('2026-10-13')   // "Mon, 13 Oct"
fmtTime(iso)                 // "09:05 am"
fmtDateTime(iso)             // "13 Oct 2026, 09:05 am"
fmtClockTime('09:00')        // "09:00 am"  — a SCHEDULE, never timezone-converted
formatPeriod('2026-09')      // "September 2026"
monthLabel(2026, 10)         // "October 2026"
monthLabelShort(2026, 10)    // "Oct 2026"
```

- Day before month, always: "13 Oct 2026". Never "Oct 13" or "10/13/2026".
- A **shift time is a schedule**, not an instant — `fmtClockTime`, never a
  timezone conversion.
- "Today" / "Yesterday" are allowed on the punch card and the day log, where
  recency is the point. Nowhere else — in a list, a real date is scannable.

---

## 8. Empty states say what to do next

| Screen | Empty copy |
|---|---|
| My Flags (open) | **No open flags** · "You're all clear." |
| My Flags (filtered) | **Nothing to show** · "No flags match this filter." |
| My Overtime | **No overtime yet** · "Overtime appears here when you work beyond your shift and your attendance policy tracks it." |
| My Earned Leave | **No earned leave yet** · "Days you work on a weekly off or a holiday appear here once your manager approves them." |
| My Corrections | **No correction requests** · "If you miss a punch, ask for a correction from the day on My Attendance." |
| My Leaves | **No leave requests yet** · "Tap Apply to request leave." |
| My Payslips | **No payslips yet** · "A payslip appears here once HR has released that month's pay." |
| My Documents | **Nothing uploaded yet** · "Add a document HR has asked you for, or keep your own copies here." |
| Attendance (month) | **No attendance this month** · "Clock in from Home to start recording your day." |

Two states, worded differently: **"none yet"** (nothing has ever happened) vs
**"none match this filter"** (there is data, your filter hides it). Conflating
them makes people think the app is broken.

---

## 9. Error copy

Every error goes through its domain's module
([10-api/04-error-handling.md](../10-api/04-error-handling.md)). Never a raw
code, never a Joi message that names a database column.

The shape of good error copy:

> **What happened** + **why** + **what to do**

| Bad | Good |
|---|---|
| "PERIOD_LOCKED" | "This date is locked for payroll processing, so its attendance can't be changed. Contact HR if a correction is needed." |
| "Error 409" | "You're already clocked in for today. Your status has been refreshed." |
| "Validation failed" | "The corrected clock-out must be after the corrected clock-in." |
| "Request failed" | "You appear to be offline. Reconnect and try again." |

And the tone rule: **never blame the person for a configuration gap.**
`geofence_unresolved` reads "Your work location hasn't been set up yet — ask HR
to finish it", not "Invalid location".

---

## 10. Buttons and actions

| Action | Label |
|---|---|
| Punch in | **Clock in** |
| Punch out | **Clock out** |
| Break | **Start break** / **End break** |
| Submit a correction | **Send request** |
| Apply for leave | **Apply** (tab action) / **Send request** (form footer) |
| Withdraw a pending request | **Withdraw** |
| Cancel approved leave | **Cancel leave** |
| Acknowledge a document | **I've read this** |
| Sign a document | **Sign** |
| Download a payslip | **Download** |
| Upload | **Add a document** / **Add a receipt** |
| Submit a claim | **Send for approval** |
| Submit a declaration | **Submit declaration** |
| Retry | **Try again** |
| Dismiss | **Close** |

Verbs, in the person's voice. Never "Submit" alone — submit *what*, to *whom*.
Never "OK" on a destructive confirm; name the action ("Cancel leave").

---

## 11. Punctuation and characters

- Apostrophes are **`’`** (U+2019), not `'`. The web lint rule
  (`react/no-unescaped-entities`) enforces this; keep the habit.
- `·` (U+00B7) separates facts on one line: `"HRC-0142 · Design"`.
- `—` (em dash) is allowed **in prose**. It is never a value (that's N/A).
- `–` (en dash) for a time range: `"09:02 – 18:34"`.
- `₹` (U+20B9) for rupees.
- No exclamation marks, except "You're all clear." style reassurance — and even
  then, sparingly.
- Sentence case for everything except the 11px uppercase field labels. Never
  Title Case A Sentence Like This.
- No trailing colons on labels. The layout already says the value follows.

---

## 12. Voice

| Context | Voice |
|---|---|
| About the employee's own data | **"your"** — "your balance", "your payslip" |
| An ⓘ hint in this app | **"you"** — written to the person reading it |
| A document issued to them | **"you"** — "A document you need to read" |
| About a colleague | **"the employee"**, never "your report" |
| Describing a system action | Active, present: "Approving refunds their balance" |
| A pending state | What's blocking it: "Waiting for your manager" |

An ⓘ hint written for the employee about their own data must **never** be reused
on a screen about someone else — and vice versa. In the shared config, that is
exactly what the `workspaces` gate is for.

---

## 13. Before you write new copy

1. Is the word already in §1 or §2? Use it.
2. Is it a day count, a money figure, a duration or a date? Use the formatter.
3. Does it name a mechanism? Rewrite it as a consequence.
4. Would someone who has never worked in HR understand it on first read?
5. If it's a term with a single source, put it in `DICTIONARY.TERMS` rather than
   typing it on the screen.
6. If it needs explaining, it needs an ⓘ — and probably a simpler label too.

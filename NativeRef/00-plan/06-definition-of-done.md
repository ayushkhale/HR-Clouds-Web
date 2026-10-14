# 06 · Definition of done

Keep this open while you work. A screen is not finished until every box is
ticked or explicitly waived with a reason in the file's header comment.

---

## Per-screen checklist

### Data

- [ ] Every call goes through `api/<domain>.api.js`. No `fetch` in the screen.
- [ ] Every response passed through `unwrap()` or `normalizePaginated()`.
      No `data.data || data.records || data` chains in the screen.
- [ ] Out-of-order responses discarded (hook handles it, or a `cancelled` flag).
- [ ] No request per row. One list call, then refresh a single row after a write.
- [ ] UI gated on what the server **returned**, not on the spec. An absent key
      hides its feature instead of crashing or showing an empty box.
- [ ] "Nothing on file" and "couldn't load" are visibly different.
- [ ] Every write that changes a count calls
      `emitAttendanceChanged(ATTENDANCE_EVENTS.<kind>)`.
- [ ] Any poller checks `AppState.currentState === 'active'`.

### The four states

- [ ] **Loading** — `Skeleton` in the shape of the real content, not a spinner
      in the middle of the screen. Refreshing an already-loaded list keeps the
      rows visible.
- [ ] **Empty** — says what to do next, not just "No data". Distinguishes "none
      yet" from "none match this filter".
- [ ] **Error** — `ErrorState` with mapped copy and a working Try again.
      Never `error.message` raw.
- [ ] **Offline** — a readable message, no spinner forever, and **no queued
      writes**.

### Visual

- [ ] Purple only. No green / amber / orange / blue value anywhere. Rose used
      only for errors, destructive actions, lateness and deductions.
- [ ] Every colour, size, radius, spacing and duration comes from `theme/`.
      Zero hard-coded hex values or magic numbers in the screen.
- [ ] 16px side gutter; content fills the width. Nothing artificially narrowed.
- [ ] No horizontal page scroll at 360dp width. Wide tables scroll
      *themselves*, inside a bordered container.
- [ ] Checked at **360×640** (small Android) and **430×932** (large iPhone).
- [ ] Safe areas respected top and bottom; nothing under the notch or the home
      indicator.
- [ ] Tap targets ≥ 44×44dp.

### Copy

- [ ] Reads to someone who has never worked in HR or payroll. Consequence, not
      mechanism.
- [ ] Every established term from [30-domain/01-wording.md](../30-domain/01-wording.md)
      used — "Earned Leave", "Attendance Correction", "Leave Payout",
      "what reaches the bank", "unpaid days", "monthly repayment", "Income tax
      so far".
- [ ] No raw enum, code or Joi message on screen. `humanize()` /
      `humanizeCode()` / `prettifyCode()` applied.
- [ ] Every day count printed with `formatDayCount()`. No `2.5`, no `2½`, and
      no "days" caption beside a phrase that already carries its unit.
- [ ] Money through `formatMoney()`. Dates through `lib/dates.js`.
- [ ] Unknown values read **N/A**. Unmeasured durations read **0m**. No dashes.
- [ ] An unloaded name reads **Loading…**, never an id, never "not found".
- [ ] Apostrophes are `’` (U+2019).
- [ ] Screen title = tab label = header title, identical.

### Identity

- [ ] No UUID on screen — not in a label, a sheet row, a toast or an
      accessibility string. Grep the screen for `.id` used as display.
- [ ] Any person rendered through `personName()` / `Avatar` / `PersonRow`.
- [ ] `employee_code` shown only where an identifier is genuinely useful.

### Interaction

- [ ] List rows open a `RecordSheet`. **No View / eye / Review button in a row.**
- [ ] A row that opens nothing has no press feedback.
- [ ] Real actions (Cancel, Download, Acknowledge) live in the sheet footer,
      not on the row.
- [ ] Sheet layering correct: `RecordSheet` < `AttachmentViewer` <
      `ReasonPrompt` < `Toast`. Viewer and prompt are **siblings** of the sheet.
- [ ] Every destructive action is awaited behind `confirm()`.
- [ ] A form with four or more fields is a **full-screen** `FormSheet`, gridded
      where it fits, with a pinned footer — not a scrolling half-sheet.
- [ ] Android hardware back does the right thing on every sheet and screen.
- [ ] Pull-to-refresh on every list and dashboard.

### ⓘ Field help (house rule §10 — part of the build, not a follow-up)

- [ ] Walked every field on the screen and rated it: ordinary / ours / domain /
      derived.
- [ ] Every qualifying field wired with `<FieldHelp surface=… field=… />`.
- [ ] Surface id and field keys match
      `fieldHelp/fieldHelp.employee.json` exactly (API key, never the label).
- [ ] **No ⓘ** on everyday data: dashboard counts, attendance status / hours /
      late / overtime columns, day inspectors, routine status columns.
- [ ] At most **4 per screen state**; once per concept.
- [ ] No layout shift from the ⓘ — verified at 360dp. `overlay` variant where a
      label would wrap.
- [ ] ⓘ never inside another pressable, a tab strip, or a section fold toggle.
- [ ] Every wired hint has its Ask Maya question, and Maya **never auto-sends**.
- [ ] One line in the hand-off: surface id, hint count, Ask Maya count — or
      "no field qualifies" and why.

### Accessibility

- [ ] Every pressable has an `accessibilityLabel` and `accessibilityRole`.
- [ ] Status conveyed by **text as well as colour** (the badge has a word, not
      just a dot).
- [ ] Text scales with the OS font setting without clipping to at least 130%.
- [ ] Reduce-motion honoured (`useReducedMotion()`).
- [ ] Screen reader can reach and operate every action, including inside sheets.
- [ ] Contrast ≥ 4.5:1 for text, ≥ 3:1 for control affordances.

### Code

- [ ] File opens with a `─────` header comment: what the screen is for, why it
      is built this way, and any contract trap it works around.
- [ ] Comments explain **why**, not what.
- [ ] Labels, enum maps, state machines and error copy are in a `*Meta.js`,
      not inline in JSX.
- [ ] `export default` the component; named exports for helpers.
- [ ] `viewer` prop present and defaulted on anything a manager will also see.
- [ ] `npm run lint` clean against the baseline for the files touched.

### Parity

- [ ] Opened side by side with the web app on the same account: **every number
      and every word agrees.**

---

## Per-phase gate

Before calling a phase done:

- [ ] Every screen in the phase passes the checklist above.
- [ ] The phase's acceptance list in
      [03-build-sequence.md](03-build-sequence.md) is all true.
- [ ] Tested on: a low-end Android (Go/4GB), a modern Android, an iPhone with a
      notch, and a small iPhone (SE).
- [ ] Release build runs, not just debug.
- [ ] Cold start still under 2.5 s on the low-end Android.
- [ ] No new crash in 30 minutes of hands-on use.

---

## Before release

- [ ] All 24 ⓘ surfaces accounted for — wired, or recorded as not applicable.
- [ ] No `console.log` of a payload containing salary, PAN, address or token.
- [ ] Crash reporting on, with PII scrubbing verified by triggering a test crash
      on a screen holding salary data.
- [ ] `60-ops/04-testing-and-qa.md` run end to end and signed off.
- [ ] Store privacy declarations match what the app actually collects —
      location, in particular, declared with the punch justification.
- [ ] Session expiry, org switch, and the non-employee role refusal all
      re-tested on the release build.
- [ ] A fresh install, signing in for the first time on a real account, walked
      end to end by someone who did not build it.

---

## The hand-off line

Every hand-off of new UI states the field-help outcome in one line. A hand-off
that doesn't mention ⓘ help is unfinished. For example:

> `leaves.apply` — 3 hints (`leave_type_id`, `is_half_day`, `document_id`), 3
> Ask Maya questions. `leaves.balances` — 1 hint (`available_balance`).
> Start / end dates, reason and the attachment link are ordinary fields and got
> none.

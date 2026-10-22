# 40 · Screen specs — index

One spec per screen group. Each one is a **build sheet**: what the screen is
for, where its data comes from, what it looks like, every state it can be in,
every action on it, and its ⓘ field-help entries.

Read the spec, build the screen, tick it off. The spec is written so you should
not need to open the web file — but when you do, it names which one.

---

## The 24 screens

| # | Spec | Screens | Phase |
|---|---|---|---|
| 01 | [01-auth.md](01-auth.md) | Login · Otp · ForgotPassword · SelectOrg · WrongWorkspace | 2 |
| 02 | [02-home-and-punch.md](02-home-and-punch.md) | Home · DayLog | 3 |
| 03 | [03-time.md](03-time.md) | Time (5 strip tabs) · CorrectionForm · OvertimeForm · EarnedLeaveForm | 4 |
| 04 | [04-leave.md](04-leave.md) | Leave · ApplyLeave · Holidays | 5 |
| 05 | [05-pay.md](05-pay.md) | PayHome · Salary · BankAccount · Payslips · Claims · ClaimForm · Loans · Tax · DeclarationForm | 6 |
| 06 | [06-documents.md](06-documents.md) | DocumentsHome · MyDocuments · UploadDocument · CompanyDocuments · DocumentRequests · Forms | 7 |
| 07 | [07-org-and-profile.md](07-org-and-profile.md) | More · Company · OrgChart · Directory · Profile · Settings | 8 |

Build order is [00-plan/03-build-sequence.md](../00-plan/03-build-sequence.md).
Don't build them in the order above — build Home and the punch card first,
because everything else is a list and you only have to get a list right once.

---

## How to read a spec

Every screen has the same eight headings. If one is missing from a spec, it is
because the screen genuinely doesn't have it, and the spec says so.

**1 · What it's for** — one paragraph, in the words a person would use. If you
can't say what a screen is for without naming an endpoint, the screen is wrong.

**2 · Web ancestor** — the file this is ported from, and anything in it that
must NOT be ported (web-only affordances, hover states, four-column grids).

**3 · Data** — every call, with its `api/*.api.js` function, its params, the
keys actually read from the response, and whether it blocks the first paint.
A call not listed here is a call the screen shouldn't make.

**4 · Layout** — top to bottom, at 390pt. Component names from
[20-design/02-component-catalog.md](../20-design/02-component-catalog.md), never
raw Views. If the spec says `Row`, use `Row`.

**5 · States** — loading, empty, error, offline, partial, and any domain state
(no shift assigned, no structure yet, payroll not run). Every screen has at
least five. **The empty state says what to do next**, and the error state
distinguishes "nothing on file" from "couldn't load" (CLAUDE.md §7).

**6 · Actions** — each one with: what it calls, what it validates **before**
calling (§11), its confirm copy if any, its toast, and which
`ATTENDANCE_EVENTS` kind it emits.

**7 · Field help** — the exact ⓘ entries, by `surface` id and payload key, or
**"no field qualifies"** with the reason. This is not optional and not a
follow-up: a screen without its field-help pass is unfinished (CLAUDE.md §10).

**8 · Traps** — what went wrong on the web, or what the API does that the spec
doesn't say. Read this before you start, not after.

---

## Rules every spec assumes

These are not repeated in each file.

- **Never show an ID.** No UUID, no raw enum, no "(#a3f2…)". An unloaded name
  reads "Loading…". (CLAUDE.md §4, [30-domain/03-formatting.md](../30-domain/03-formatting.md))
- **Never render a dash.** Unknown → **N/A**. Unmeasured duration → **0m**. No
  action → an empty cell, or no Actions column at all. (§5)
- **Purple only.** violet = success, fuchsia = pending/warning, indigo = info,
  rose = errors, destructive, lateness and deductions — nothing else. (§5)
- **A day is whole or half.** `formatDayCount()` is the only way to print one:
  `0.5` → "1/2 d", `2.5` → "2d and 1/2 d". Never `2.5`. (§6)
- **The list is a table of scannable rows; the row opens a `RecordSheet`.** No
  View/eye button in a row — only real actions. (§3)
- **A form is never a bottom sheet**, and a form with four or more fields is
  gridded, not scrolled. (§3)
- **The button stays live; the press does the checking.** Every button that
  calls an API, not just the primary one. (§11)
- **Gate the UI on what the server returned**, not on the spec. An absent key
  is a hidden feature, never a crash. (§7)
- **Sidebar label = header title = page `<h1>`**, identical. Those strings live
  in `navigation/tabs.employee.js`. (§2)
- **Write for someone who doesn't work in HR.** Say the consequence, not the
  mechanism. ([30-domain/01-wording.md](../30-domain/01-wording.md))

---

## The definition of done, per screen

From [00-plan/06-definition-of-done.md](../00-plan/06-definition-of-done.md),
the short form — a screen is not done until all of it is true:

- [ ] Every state in §5 of its spec renders, including the ones you can't
      trigger on purpose (force them with a thrown error and an empty array).
- [ ] Loading is a `Skeleton` shaped like the content, gated on
      `loading && !data` so a refresh doesn't blank the screen.
- [ ] Every ⓘ in §7 is wired and reads correctly at 390pt with no layout shift.
- [ ] Every API-calling button validates first and travels to its first problem.
- [ ] No id, no dash, no decimal day, no green, no amber on screen.
- [ ] Pull-to-refresh works, and a write refreshes one row rather than the list.
- [ ] Tested at 390pt AND 1366-equivalent tablet width, light mode, and at
      the largest font-scale step ([20-design/06-accessibility.md](../20-design/06-accessibility.md)).
- [ ] The screen's own header comment says what it's for and why it's built
      that way, including any trap from §8.

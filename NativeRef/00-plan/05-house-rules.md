# 05 · House rules — the non-negotiables

The native translation of the web repo's `CLAUDE.md`. Every rule here exists
because something was built wrong once. **Don't relitigate them.**

Read this before writing a component. Re-read §4 and §6 before writing copy.

---

## 1. One role, one workspace — and this app is the employee one

**This app signs in employees only.**

The self-service endpoints behind every screen accept *every* tenant role —
`super-admin`, `admin`, `hr`, `manager`, `employee`. So the backend will
happily serve an HR admin a full employee experience. It will not stop you.
That is exactly how HR once walked the employee tabs on web (2026-10-01), and
it is the bug this rule prevents.

```js
// state/session.js — the gate. Exact match, fails closed.
const WORKSPACE_OF_ROLE = {
  'super-admin': 'hr', admin: 'hr', hr: 'hr',
  manager: 'manager', employee: 'employee', guest: 'guest',
};
export const workspaceForRole = (role) =>
  WORKSPACE_OF_ROLE[String(role || '').trim().toLowerCase()] || null;

export const isEmployeeApp = (role) => workspaceForRole(role) === 'employee';
```

On a successful sign-in whose role is not `employee`:

- Do **not** enter the app.
- Do **not** silently hide controls and carry on.
- Clear the token, and show a named screen explaining it:
  > **This app is for employees**
  > Your account is an HR Admin account. Sign in at hrclouds.in to use the HR
  > workspace.
  > [Open the web app] [Use a different account]

An unknown role takes the same path. The gate fails closed.

When the manager app arrives it gets its **own** tab set behind the same gate —
never a widening of this one.

---

## 2. Role parity, in advance

A manager may be promoted to HR; an employee may be promoted to manager. The
workspaces must feel like one product.

The mechanism on web is a `viewer` prop on one shared component, never a fork.
Keep the same discipline here even while only `employee` exists:

```jsx
// Good — one screen, scope supplied, layout identical.
export default function SalaryScreen({ viewer = 'employee' }) { … }

// Never — a fork that will drift.
export default function EmployeeSalaryScreen() { … }
export default function ManagerSalaryScreen() { … }
```

`viewer` picks the endpoints. **It must never change the layout.**

Corollaries:

- Never fork a screen to give a role a different look. Hide a field with a flag.
- A capability a role lacks is `null` in the plane adapter, and the UI hides the
  control. **Never show a button that 403s.**
- Screen title = tab label = header title, identical across roles.

---

## 3. List → row → record sheet

The three-step data flow is the house pattern and it survives the port intact,
with one substitution.

**1. The list** is scannable rows — who, when, how much, what state. Everything
else belongs in the detail. Tall cards for tabular data were rejected on web;
on mobile a row *is* a card, but a **compact** one: two lines of text, one
number, one badge. Nothing more.

**2. The row opens it.** The whole row is the target.

```jsx
// ui/Row.jsx — the native rowPreviewProps
<Row onPress={() => setSelected(item)} accessibilityLabel="Loan details">
```

- **No View / Review / eye button in a row** — keep only real actions (Cancel,
  Download). `RowOpenButton` was deleted on web; don't reinvent it.
- A row that can't open anything gets no press feedback, not a dead press.
- Never put a chevron on a row *and* a tappable action inside it. Pick one.

**3. The detail is a `RecordSheet`** — the native `DetailDialog`. This is the
house standard for **every popup showing data**. Compose it; never hand-roll a
modal for data.

| Web | Native | Use |
|---|---|---|
| `DetailDialog` | `RecordSheet` | Bottom sheet, 92% max height, drag handle, eyebrow / icon / title / subtitle / badge, pinned footer |
| `DetailStats` | `SheetStats` | Headline numbers, 2 across on phone |
| `DetailSection` | `SheetSection` | Titled, collapsible card |
| `DetailGrid` | `SheetGrid` | Label-above-value. **Max 2 columns on phone** (web's max is 4) |
| `DetailTable` | `SheetTable` | Line items; horizontally scrollable, never squeezed |
| `DetailText` | `SheetText` | Reasons / notes |
| `DetailPill` | `Pill` | |
| `DetailFooterNote` | `SheetFooterNote` | Says *why* there are no actions |
| `displayValue()` | `displayValue()` | Identical. → `lib/format.js` |

Rules that carry over unchanged:

- Long or secondary sections start folded (`defaultOpen={false}`) with totals in
  the title. `collapsible={false}` pins one open.
- Actions go in the sheet **footer**, not the row.
- Money splits Earnings / Deductions — stacked on phone, in that order.
- Reference implementation to match: the salary history dialog in
  `roles/hr/payroll/screens/EmployeeSalaryStructuresPage.jsx`.

**Excluded from the record-sheet rule:** forms, confirms, reason prompts and
pickers. A form is not a record inspector. On mobile a multi-field form is a
**full-screen modal screen**, not a sheet — see
[20-design/05-mobile-adaptations.md](../20-design/05-mobile-adaptations.md) § Forms.

**Stacking order** (keep the relative order; the numbers are native z-index /
sheet layers):

```
RecordSheet 140  <  AttachmentViewer 165  <  ReasonPrompt 170  <  Toast 200
```

The ⓘ popover and an "Ask Maya" raised from a sheet sit just above the sheet
that hosts the ⓘ. Render the viewer and the reason prompt as **siblings** of
the sheet, not children.

---

## 4. Never show an ID

**No UUID, database id or raw enum reaches the screen** — not in a list, a
sheet, an audit line or a toast.

| Need | Use (all in `lib/`) |
|---|---|
| Is this an id? | `isUuid()` — `lib/normalize.js` |
| Name from a row | `personName()` — `lib/normalize.js` |
| Name from a bare `user_id` | `useDirectoryName()` — `hooks/useDirectory.js` (backed by `/organizations/directory`) |
| Pick a person | `PersonSelect` — never a raw list of ids |

- An unloaded name reads **"Loading…"** — never "not found", never the id.
  An unresolvable id reads **"Unknown user"** / **"A colleague"** / **"System"**.
- No id "just in case": no `(#a3f2…)` suffixes, no id row in a sheet, no id in
  an accessibility label. Show `employee_code` when an identifier is genuinely
  useful.
- Prettify enums with the existing `humanize()` (`lib/enums.js`),
  `humanizeCode()` (documents) or `prettifyCode()` (payroll). **Don't write a
  fourth.**

---

## 5. Visual language

**Purple only.**

| Semantic | Colour family | Used for |
|---|---|---|
| success | **violet** | approved, present, paid, earned |
| pending / warning | **fuchsia** | pending, late, waiting for approval |
| info | **indigo** | half day, in progress, holiday, breaks |
| brand | **purple** | primary actions, headers, on leave |
| error / destructive | **rose** | failures, cancel, reject, absence, deductions |
| neutral | **slate** | weekly off, expired, not marked, chrome |

Map green / emerald / teal / lime → violet. Map amber / yellow / orange / pink →
fuchsia. Map sky / blue / cyan → indigo. **rose stays** for errors, destructive
actions, lateness and deductions — nothing else. Tone keys in `lib/enums.js`
keep the old semantic names (`emerald`, `amber`, `blue`) but render purple;
that is deliberate, so a tone map ported from web keeps working.

**Never add a new green / amber / orange / blue value.**

- Every screen is full width with a 16px gutter. **Grid, don't narrow.**
- The home screen keeps the **purple hero header** (`PageHeader`). New header
  information goes *inside* it.
- **Never render a dash.** Unknown → **N/A**. Unmeasured duration → **0m**.
  No action → nothing at all. If no row in a list has an action, there is no
  action affordance on any row.

Don't rebuild these — they are in `50-starter/src/ui/`:

`Avatar` (never hand-roll initials or a bare `<Image>`) · `TimeField` (never a
raw text input for a time) · `PersonSelect` · `FilterTabs` (tabs left, search
right, counts in labels) · `ReasonPrompt` · `Skeleton` · `TabStrip` (horizontally
scrollable with edge fades and scroll-selected-into-view — never wrapping).

---

## 6. Wording

**Write for someone who doesn't work in HR or payroll.** Say the consequence,
not the mechanism: "Approving refunds their balance", not "triggers a balance
reversal". Labels are sentences, not enum names: "How it's worked out", "Still
to repay". Empty states say what to do next. Errors map through the domain's
error module — **never a raw code or Joi message**.

Established terms (full list in
[30-domain/01-wording.md](../30-domain/01-wording.md)):

| Don't say | Say |
|---|---|
| Override Config | **Customise Leave Rules** |
| accrued | **given so far** |
| upfront / monthly | **All at once / Every month** |
| carry forward | **kept for next year** |
| probation | **wait after joining** |
| overdraft | **extra days below zero** |
| TDS YTD | **Income tax so far** |
| Net Pay | **what reaches the bank** |
| Gross | **before deductions — not take-home** |
| encashment / encash / cash out | **Leave Payout** / **pay out** |
| Comp-off | **Earned Leave** (mass noun) |
| Regularization | **Attendance Correction** |
| Statutory & Tax | **Tax & Legal Deductions** |
| statutory deductions | **PF, ESI and tax** |
| LOP / LWP | **unpaid days** |
| EMI | **monthly repayment** |
| disbursement | **money paid out on** |
| arrear | **backdated pay** |

**A day is whole or half, never a decimal.** `formatDayCount()` is the only way
to print a day count — in leave, earned leave, payout, payroll and attendance
alike:

```
0.5 → "1 Half Day"      2   → "2 Days"
1   → "1 Day"           2.5 → "2 Days and 1 Half Day"
```

Pass `{ lower: true }` mid-sentence. Never `2.5`, `2½` or "2 and a half". The
phrase carries its own unit, so a tile beside it must not add a "days"
caption — say "left", "paid", "unpaid". **Eight hand-rolled copies of this
disagreed with each other once; don't write a ninth.**

Use `’` (U+2019) for apostrophes in UI text.

---

## 7. Data and API

- All calls go through `api/*.api.js`. **No `fetch` in a component.**
- **Binary downloads (PDF / CSV / ZIP) never use `request()`** (JSON-only) — use
  `downloadFile()` / `fetchFileBlob()` from `api/files.js`.
- **Gate UI on what the server returned**, not on the spec. Absent key → hidden
  feature. A missing backend feature degrades to a hidden control, never a crash.
- Every destructive confirm is **awaited**. On web, ~20 unawaited
  `window.confirm` calls fired their API before the user pressed OK.
  ```js
  if (!(await confirm({ title: 'Cancel this leave?', … }))) return;
  ```
- Guard stale responses with a `cancelled` flag or a request-token ref. Every
  hook in `50-starter/src/hooks/` already does.
- **No request per row** — use the bulk endpoint, refresh one row after a write.
- **People come from one place.** For this app that is
  `/organizations/directory` via `hooks/useDirectory.js`. Never add a second
  roster fetch. Photos are presigned links that die in ~5 minutes — never cache
  an `avatar_url` anywhere.
- Distinguish **"nothing on file"** from **"couldn't load"**. A failed read says
  "Couldn't load", never "Not set" (which invites a duplicate submission). Use a
  sentinel, not `null`, for a failed lookup.
- **A decision that empties a queue must clear its count without a reload.**
  There is no query cache: emit
  `emitAttendanceChanged(ATTENDANCE_EVENTS.<kind>)` (`lib/events.js`) the moment
  a write succeeds. Tab badges and home cards subscribe to it.
- Pollers check app state (`AppState.currentState === 'active'`), the native
  equivalent of `document.visibilityState`.
- Bulk writes use `settleWithLimit`, never a sequential await loop.

---

## 8. Code style

Match the file you're editing. Non-trivial files open with a `─────` header
comment saying **what the screen is for and why it's built this way**, including
contract traps. Keep this up — it is the main defence against a later change
undoing a deliberate choice. Comments explain **why**, not what.

Functional components and hooks only. `export default` the component, named
exports for helpers. Domain knowledge (labels, state machines, enum maps, error
copy) goes in a `*Meta.js`, **not inline in JSX**.

Run the linter before finishing and compare against the baseline for the files
you touched.

---

## 9. Reference docs

`public/ref docs/` in the **web** repo is the contract source of truth and beats
any assumption: `api_registry.md` (every endpoint, with implemented marks),
plus `md_payrolls/`, `md_docs/`, `md_attendance/`, `md_leave/`,
`md_organization/`, `md_auth/`, `md_updates/`.

The spec is occasionally wrong. When live behaviour contradicts it, trust the
live API, fix the code, and record the deviation in the file's header comment.

---

## 10. ⓘ help and "Ask Maya" — part of every screen, not a follow-up

**Ship every new screen with its ⓘ help already in it.** A screen, form, sheet,
column or tile is not done until it has had a field-help pass. Same task, same
commit.

36 employee entries across 24 surfaces are **already extracted** into
`50-starter/src/fieldHelp/fieldHelp.employee.json`, every one with its Ask Maya
question. Your job is to wire them, not to write them.

How much help a thing gets follows how far it sits from everyday knowledge:

| The field is… | Do |
|---|---|
| Ordinary (name, date, title, amount, reason, search, notes) | **No ⓘ — never** |
| Ours: a system-specific field, toggle or state set we invented | ⓘ + Ask Maya question |
| Domain: a payroll, tax, leave, attendance or compliance term | ⓘ in plain words (§6) + Ask Maya |
| Derived: a figure we computed (balances, pro-rata, net, accruals) | ⓘ saying what it's worked out from + Ask Maya |

**Never on everyday data people read daily** (user decision, 2026-10-01 — they
were removed as annoying): dashboard counts (present / absent / late), live
attendance, attendance status / hours / effective / late / overtime columns and
day inspectors, routine queue status columns. Seen every day, understood after
the first; an ⓘ there is noise. Help belongs on setup, payroll and rarer screens.

Keep the cap: **at most 4 per screen state**, once per concept, and nothing
where the screen already explains itself. If a whole screen is ordinary fields,
it gets none — say so when you report the work rather than forcing one in.

The HR onboarding tier does **not** apply to this app (it is gated to the `hr`
workspace), which is why the extracted config has 36 entries and not 300.

**Reporting:** every hand-off of new UI states the field-help outcome in one
line — the surface id, how many hints, any Ask Maya questions added, or "no
field qualifies" with the reason. A hand-off that doesn't mention ⓘ help is
unfinished.

Full mechanics, placement rules and the entry list:
[30-domain/08-field-help.md](../30-domain/08-field-help.md).

---

## 11. Native-only rules (these have no web ancestor)

1. **A punch is never blocked on location.** The backend accepts a punch with no
   coordinates and raises its own flag. Location failure is explained, retryable,
   and overridable by an explicit "Continue without location" — **never a silent
   drop and never a blocked button**.
2. **The punch always succeeded.** Every geofence outcome describes something
   about a punch that *was recorded*. A geofence result must never roll back
   optimistic UI, never render rose, and never read as "couldn't clock you in" —
   the server returns 201/200 in all four cases.
3. **Never queue a write offline.** A clock-in that syncs twenty minutes later
   is a payroll dispute. Reads may be cached; writes fail loudly and are
   retried by the person.
4. **No webview for app content.** A PDF opens in the OS viewer. A screen is a
   screen.
5. **Token lives in the Keychain / Keystore**, never in AsyncStorage. PII
   (salary, PAN, addresses) is memory-only and never written to disk or a log.
6. **The tab bar never ejects anyone.** Every screen an employee can reach is
   inside one of the five tabs. There is no dead end and no back-button trap.
7. **Respect the OS.** `prefers-reduced-motion` → `AccessibilityInfo
   .isReduceMotionEnabled()`. Dynamic type scales. Dark mode is **not supported
   in v1** — lock `userInterfaceStyle: light` rather than shipping a half-themed
   app (see [20-design/01-design-tokens.md](../20-design/01-design-tokens.md) § Dark mode).

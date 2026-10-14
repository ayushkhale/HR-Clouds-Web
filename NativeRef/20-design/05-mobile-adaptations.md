# 05 · Mobile adaptations

What changes from web, what doesn't, and why. Every change here is a deliberate
decision with a reason — anything not on this list should stay the same as the
web app.

---

## The rule

> **Change the container, keep the content.**

A table becomes a list of rows; the columns it showed become the row's two lines
plus the sheet's grid. The *words*, *numbers*, *statuses* and *order* do not
change. If a mobile adaptation changes what the screen says, it's not an
adaptation — it's a different screen, and parity is broken.

---

## 1. Tables → rows

The web employee screens are tables: Date · Status · In · Out · Hours · Flags.

A phone shows **two lines and one number**:

```
┌────────────────────────────────────────────────┐
│ Mon, 13 Oct                        8h 32m      │   ← title · value
│ 09:02 – 18:34 · 30m break      ● Present       │   ← subtitle · badge
└────────────────────────────────────────────────┘
```

Deciding what goes where:

| Row slot | Take the web column that is… |
|---|---|
| `title` | the row's identity — date, period, document name, leave type |
| `subtitle` | the one or two facts that distinguish similar rows |
| `value` | the single number people scan for — hours, amount, days |
| `badge` | the status |
| *(sheet)* | **everything else**, every time |

**Never** squeeze a third text line in, and never shrink the font to fit another
column. If it doesn't fit in the four slots, it belongs in the sheet — which is
the same rule the web app already follows ("everything else belongs in the
detail").

### Line items stay tabular

A payslip's components, a loan's instalments, a declaration's rows — these are
*genuinely* tabular and lose meaning as cards. They stay a table inside
`SheetTable`, which **scrolls horizontally** inside a bordered container rather
than squeezing columns.

---

## 2. Dialogs → sheets and modals

| Web | Native | Why |
|---|---|---|
| `DetailDialog` (centred, `max-w-6xl`) | `RecordSheet`, bottom, 55% → 92% | A bottom sheet keeps the list visible behind it, so context isn't lost. 92% max for the same reason |
| `DetailGrid cols={4}` | `SheetGrid cols={2}` | Four label-above-value columns on a 360dp screen gives each one ~80dp. Two is the honest maximum |
| Big form dialog (`max-w-5xl`, `max-h-[92vh]`) | **Full-screen modal** | A sheet plus a keyboard leaves ~40% of the screen, and the submit button ends up under the keyboard |
| `window.confirm` (promise-wrapped) | `useConfirm()` | Same contract — awaitable, destructive-styled |
| `ReasonDialog` | `ReasonPrompt`, compact sheet | Still a sibling of the record sheet, at a higher layer |
| `AttachmentViewerDialog` | `AttachmentViewer`, full-screen | PDFs go to the OS viewer; images pinch-zoom |

The layering order is unchanged:
`RecordSheet` < `AttachmentViewer` < `ReasonPrompt` < `Toast`.

---

## 3. Sidebar → tabs

Covered in [03-navigation.md](03-navigation.md). The one substantive change is
**Leave promoted to its own tab**; everything else is a regrouping, not a
re-scoping.

The web sidebar's third-level dropdowns (My Time → six links) become either a
`TabStrip` inside one screen (Time) or a menu screen (Pay, More). Never a
three-level drill-down — on a phone that's three taps to reach a daily task.

---

## 4. Charts

The web dashboard has a 31-bar hours chart with a paged X axis and a 4-slice pie.

| Web | Native |
|---|---|
| 31 bars, paged 10 at a time with chevrons | **Horizontally scrollable** bars, 7 visible, snapping to weeks |
| Recharts tooltip on hover | **Tap** a bar → a small label above it |
| Pie with a legend to the side | Donut with the legend **below**, two columns |
| Sunday markers via a custom tick | A slate dot under the day number |

Colours come from `theme.chart` and **do not change** — `#6D28D9`, `#A78BFA`,
`#C026D3`, `#E11D48` in that order, and the bar `#7C3AED`.

If a chart can't be made legible at 360dp, **drop it** and show the numbers as
tiles instead. A cramped chart is worse than a clear table. (The attendance mix
survives as a donut; the 31-day hours chart is the one worth making scrollable.)

---

## 5. The punch card — the one screen that gets *better*

Web constraints that disappear:

| Web | Native |
|---|---|
| Browser geolocation, blocked on http, often denied silently | Real GPS with a proper permission flow and a settings deep-link |
| `localStorage` work-mode memory | AsyncStorage, same behaviour |
| `document.visibilityState` refresh | `AppState` — more reliable, fires on real backgrounding |
| A ring drawn with SVG `stroke-dashoffset` | Reanimated on the UI thread — smooth while the JS thread is busy |
| No haptics | A single light impact on a successful punch |
| Three taps and a scroll from the dashboard | **Above the fold on Home, one tap** |

What must **not** change: the state machine (`idle → working → done`, `onBreak`
inside `working`), where the figures come from (the server, never derived), and
the four geofence outcomes (none of them rose).

---

## 6. Forms

Web rule: *"A form dialog must not make the user scroll. Four or more fields
means wide and gridded."*

The native translation:

- Full-screen modal, body scrolls, **footer pinned** — the submit button is
  always visible without scrolling.
- Short fields pair up two-across: date + date, time + time, amount + type.
- Long fields go full width: reason, person pickers, attachments, anything that
  wraps.
- Labels stay **11px uppercase bold with letter spacing** — the app's signature.
- `react-native-keyboard-controller` so focusing the last field doesn't hide the
  footer or jump the scroll position.
- A dirty form confirms before discarding on back.

Single-field confirms, reason prompts and pickers stay **compact** — the web
rule ("`max-w-sm`/`md`") maps to a short sheet, not a full screen.

---

## 7. Search

The web app puts search to the right of the filter tabs. On a phone that's two
competing controls in a 360dp row.

- **A screen with ≤ 20 rows gets no search.** Scrolling is faster.
- A screen that needs it (Directory, Documents, Payslips history) gets a search
  **row above** the filter tabs, full width, with a clear button.
- Search is **client-side** unless the endpoint supports it
  (`/organizations/directory?search=`). A client-side search that only covers
  the loaded page must say so: "Searching the 20 loaded people".

---

## 8. Pagination → infinite scroll

Numbered pages are a desktop affordance. On mobile:

```jsx
<FlatList
  data={list.items}
  onEndReached={() => list.page < list.totalPages && list.setPage(p => p + 1)}
  onEndReachedThreshold={0.4}
  ListFooterComponent={list.loading ? <Skeleton type="rows" rows={2} /> : <ListFooter … />}
/>
```

`usePagedList` needs **one change** for this: accumulate items across pages
instead of replacing them, and reset the accumulator when `filterKey` changes.
The starter hook has an `accumulate` flag for exactly this.

Keep the trailing count line ("143 days") — people use it to know how much
history exists.

---

## 9. Hover and focus

| Web | Native |
|---|---|
| `hover:bg-purple-50/40` on a row | `android_ripple` / `pressed` state at the same colour |
| `hover:-translate-y-0.5` on a button | `scale: 0.98` while pressed |
| `hover:shadow-xl` on a card | Nothing. Cards aren't pressed; their rows are |
| Focus rings | `accessibilityState` + the OS focus indicator. Don't draw your own |
| ⓘ opens on hover after 150 ms | **Tap only.** Touch has no hover — tap is the only way in, and it pins open |

---

## 10. Density

The web app is dense: 12px body text, 10px captions, tight rows. On a phone
that's a strain, and the shift is small but deliberate:

| | Web | Native |
|---|---|---|
| Body | 12px (`text-xs`) | **14px** |
| Secondary | 10–11px | **13px** |
| Labels | 11–12px uppercase | **11px uppercase** (unchanged — it's a signature) |
| Row height | ~48px | **56–64px** (two lines + 12px padding) |
| Card padding | 24px | **16px** (less chrome, more content, on a narrow screen) |
| Gap between cards | 24px | **16px** |

Net effect: text is more readable, chrome is tighter, and the information density
per screenful stays close to the web's.

---

## 11. What does NOT change

Be suspicious of any urge to touch these.

- **Every word.** Labels, empty states, error copy, status names, the dictionary
  terms. A phone is not a reason to shorten "Attendance Correction" to
  "Correction".
- **Every number and how it's formatted.** `formatDayCount`, `formatMoney`,
  `fmtHours`, `displayValue` — byte-identical output.
- **The purple-only palette**, and rose reserved for five things.
- **The three-step data flow** — list → row → record sheet.
- **No IDs, no dashes, no decimal days.**
- **The ⓘ cap** — 4 per screen state, once per concept, never on everyday data.
- **The role gate.** Employees only.
- **Which fields are editable.** A phone doesn't earn you write access to a
  read-only field.
- **The order of things.** Earnings before deductions. Present · half day · on
  leave · absent. Newest first on request lists.

---

## 12. Mobile-only additions that are allowed

These add capability without changing meaning:

| Addition | Where | Guard |
|---|---|---|
| Pull-to-refresh | every list and dashboard | — |
| Haptic on a successful punch | punch card | Light impact only; respects system settings |
| Camera as a receipt / document source | claims, documents | Same presigned flow |
| Share a payslip PDF | payslips | OS share sheet, no re-upload |
| Biometric app lock | settings | Opt-in; never the only way in |
| Push notifications | phase 6 | Only for things needing action |
| Swipe between `TabStrip` tabs | Time, Payslips, Profile | Must not conflict with the back gesture — disable swipe on the first tab |
| Offline **read** of today + this month | home, attendance | Writes are never queued |
| A "Clock in" quick action / widget | later | Opens the app; never punches directly |

Each of these is additive. None of them is allowed to change a number, a word or
a permission.

---

## 13. The adaptations that were considered and rejected

Recording these so they don't come back as "good ideas":

| Idea | Why not |
|---|---|
| A separate "quick punch" screen with no history | Two punch surfaces means two state machines and two bugs. The card lives on Home |
| Cards instead of rows for attendance history | The web app explicitly rejected tall cards for tabular data. A month of them is 31 screens of scrolling |
| Collapsing Pay into Payslips only | An employee who can't see their salary structure on a phone will ask HR, which is the cost this app exists to remove |
| Dark mode in v1 | Half-themed is worse than light-only. See [01-design-tokens.md](01-design-tokens.md) § Dark mode |
| Offline write queue for punches | A clock-in that syncs twenty minutes later is a payroll dispute |
| A webview wrapper for the complex screens (Tax, Claims) | It would read as a website in a frame, and the keyboard/scroll behaviour gives it away immediately |
| An icon-only tab bar | People guess wrong, then stop exploring |
| Six or seven tabs | If five isn't enough, the grouping is wrong |

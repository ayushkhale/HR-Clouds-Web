# Company Settings — UI change log, in order

What was done to the Settings hub, pass by pass, and why each decision was taken.
Read this before changing the layout: four different walls were built here in four
days, three of them in response to a bug report about the one before it, and the
reasoning for each is below so nobody re-applies a pass that was already reversed.

**The reference the product is held to:** `roles/hr/payroll/screens/PayrollSettingsPage.jsx`
(HR → Setup → Pay → Payroll Settings). Settings must read as the same product —
same card, same fold, same two-column wall, same sticky save bar. Consistency with
that page is an explicit instruction, not a preference.

Files this log covers:

```
src/shared/screens/OrgSettingsPage.jsx       the hub: tabs, search, the wall
src/shared/settings/SettingsGroupForm.jsx    one group = one shutter card (Pattern A)
src/shared/settings/settingsUi.jsx           the policy-screen cards (Pattern B)
src/shared/settings/settingsMeta.js          what the catalogue MEANS on screen
src/shared/settings/settingsBlurbs.js        our words: one-liners, short names, cautions
src/shared/settings/settingsText.js          every text shade, in one switch
src/shared/settings/SettingsSaveDock.jsx     the page's one Save
src/shared/settings/settingsDock.js          the register of unsaved cards
src/shared/settings/SettingsHistoryPanel.jsx the change history (#248)
src/shared/settings/SettingsHistoryDialog.jsx one change, as a record inspector
```

---

## 1. Before the UI work — the three API phases

| Commit | What it was |
|---|---|
| `3d662a6` | **Phase 1, the hub.** `GET /settings/catalog` + `GET /settings`, read-only. One card per group, values shown, nothing editable. |
| `c7847f2` | **Phase 2, the write plane.** `PUT /settings/groups/:key` under a per-group weak ETag, plus both safety gates — 422 `SETTINGS_REASON_REQUIRED` and 409 `SETTINGS_CONFIRMATION_REQUIRED`. |
| `f1706f0` | Plan & Billing and Company Settings redesigned together. |
| `c3fedc4` | **Phase 3, the change history.** `GET /settings/history`, HR only, keyset cursor. |

Two contract facts that every pass since has had to respect:

- **D-S4: one request, one group, one transaction.** There is no endpoint that
  writes two groups, so "save everything" is several requests, each under its own
  `If-Match`. Any UI that implies one atomic save is lying.
- **A group that is missing is not an error.** `unavailable_groups[]` carries
  `NOT_READABLE` (role), `NOT_ENTITLED` (plan) or `READ_FAILED` (fault); only the
  last is worth a retry. This is how one component serves HR and the manager with
  no fork (§2) — the manager's catalogue comes back with 24 of 26 groups unreadable.

---

## 2. 10 Oct 2026 — the rebuild, in four review rounds

All four rounds shipped as `4ae800d [ Updated Settings UI ]`. Each round was a list
of fixes from a live read of the screen, so the later ones correct the earlier ones.

### Round 1 — the brief's shape

Built from `md_settings/frontend_settings_ui_ux_architecture.md`: a left section
rail replaced by **domain tabs** (the house `FilterTabs`), **Pattern A** cards for
groups the hub edits itself, **Pattern B** cards for the five policy screens it only
links to (Payroll Settings, Document Settings, Letterhead, Attendance Policies,
Leave Policies — those stay where they are, by instruction), a sticky save dock, a
page-wide search, four KPI tiles and a command bar.

The rail's own header comment had argued a full-width row makes the eye cross the
screen from a label to its control. True — but the rail narrowed the page and kept
the rows full width, so the crossing stayed and the hub gained a second navigation.
Fields are **stacked label-above-control inside the card** now; the card's grid, not
the page, is what spends a wide screen.

### Round 2 — ten fixes

1. **The four KPI tiles are gone.** First thing on the page, answering a question
   nobody opens Settings to ask. The two facts worth keeping moved onto the cards
   they are true of.
2. **The search sits on the title line**, not beside the tabs: it searches all 137
   settings across every tab, so pinning it to the tab strip implied it filtered the
   open tab — and five tabs plus a box left it ~260px at 1366.
3. **The tabs own their line**, alphabetical (`tabsFor`).
4. **Cards became shutters, closed by default** — the Payroll tab is eleven groups,
   and a page that opens as an index of eleven rows is one an admin can aim at.
5. **Brick by brick:** the wall must have no holes in it.
6. One-line entity names on the Pattern B cards, with "and N more".
7. Equal-height "Open N settings" footers across cards.
8. Two fields to a line inside a card.
9. **Switches, not On/Off pills.**
10. **Save must not hide behind the "Ask Maya" launcher.** Her pill is `fixed
    bottom-6 right-6 z-[70]` — the dock's own corner, ten stacking levels above it.
    The dock reserves her footprint (`sm:pr-44`, or `pb-20` below `sm`) instead of
    fighting her, and skips the gutter when the launcher is switched off.

### Round 3 — seven fixes

1. **The white space must self-adjust** when a card opens or closes.
2. **More room between rows** — `gap-y-3.5` put a control nearer the caption of the
   field below it than its own label. Now `gap-y-5 gap-x-6`.
3. **Explanations in plain black text**, the way Payroll Settings writes them — not
   coloured, not badged.
4. **"Change carefully" went away.** A risk sentence on every risky field was the
   loudest thing in the card and said nothing actionable.
5. Billing Notification and Change History reworked.
6. The Pattern B cards got a one-line blurb each ("manage on their own screen" cards
   said only their own title back).
7. **Every text shade darkened — behind one switch.** All of it reads from
   `settingsText.js` so the contrast pass can be taken back in one edit.

### Round 4 — six fixes, and the layout question

1. **A caption says what the setting DOES.** The risk clause was in the caption, so a
   documents toggle was explained by a sentence about pay, and the catalogue's own
   `description` is registry vocabulary. `settingsBlurbs.js` was written for this:
   138 one-liners, keyed by setting key, in layman's words — *"Allow managers to view
   their team's documents"*, the user's own example — with the catalogue's
   description as fallback so a setting added next week still explains itself.
2. **The label-to-caption gap tightened** (`mt-0.5` under a switch row, `mt-1` under
   a control). At `mt-1.5` it read as a gap, not a caption. Other gaps untouched.
3. **Risk became a mark, not words:** a 14px rose icon whose accessible name carries
   the sentence, which freed the caption for #1.
4. **The jumping bug, and the wall going to one column** — see §4.
5. **The change history: one fold per day**, open by default, any day closable;
   banded headings, a count pill, an areas line while shut.
6. **Company & Billing** given the module band, a Departments pointer (HR only, so
   the manager gets no dead link) and full-row chip editors.

### Rounds 5–8 — the same session, after the layout change

5. **Sub-grouping the rows into shelves** (`fieldShelves`). A card of eleven fields
   is read off its keys: strip the prefix every key shares, shelve by the first
   remaining token, keep a shelf only if two or more fields land on it, and leave the
   card flat unless two real shelves form. Headings are ours (`SHELF_LABEL`:
   Provident Fund, Pension (EPS), Life cover (EDLI), Who gets told…), a `STOP_TOKENS`
   list keeps grammar words (`max`, `auto`, `enabled`) from becoming headings, and
   each shelf leads with its own on/off switch.
6. **Short names and shorter sentences.** The catalogue's label is the registry's
   title — "Manager direct compensation authority" — which is two lines of heading
   over a one-line control. `SETTING_LABEL` holds 128 names, longest 28 characters,
   one line at 1366 and at 390 ("Managers set pay without HR"). Seven one-liners that
   ran to a third line were cut; nothing is over 84 characters. Search matches and
   shows both names, and the history uses the same name as the card.
7. **Cautions a person can act on.** The confirm dialog printed the 409's own
   `warnings[]`, one of which told an HR admin that the publish endpoint's response
   class changes from 200 to 202 and clients must poll the materialisation-progress
   endpoint. `SETTING_WARNING` replaced it with 60 plain cautions, with a true
   fallback for an unlisted key; `riskWarnings()` is deleted (tombstone in
   `utils/settingsErrors.js`), and the one-liner fallback now sniff-tests the
   catalogue's description so integrator prose can't leak in that way either.
8. **One Save on the page.** Each card had its own Save and the dock had one, so with
   one card dirty two identical purple buttons sat a few pixels apart doing the same
   write. The dock stays (it is sticky, it names which card is unsaved, it clears
   Maya); the card footer keeps the way out of the card and a plain line pointing at
   the dock. The writes did not change — still one request per group.

---

## 3. 10–13 Oct — three passes that were later reversed

| Commit | What it did | Why it is gone |
|---|---|---|
| `3284f4a` | **Stripped the closed state.** A folded card lost its blurb, its count and its last-changed date; the "Default" pill went entirely; the module band became a bare heading. The argument was scanning cost — the Payroll tab was 2562px of collapsed list. | The user wants the text. A folded card keeps its icon, its sentence and its status, the way Payroll Settings does. |
| `de23e50` | **"A list you click into."** Tabs and shutters replaced by one vertical list of every area, each group a row opening `/settings/:groupKey` as its own screen, history as its own page, the dock gone from the list, and the card's own Save back on the standalone page. | A page inside a page, and a round trip to glance at one setting. Reverted 14 Oct. |
| `541c17b` | Let a lone policy-screen card span both columns of that list's grid. | Only tuned the list. |

**14 Oct (`22f2f56`): the revert.** `OrgSettingsPage.jsx`, `SettingsGroupForm.jsx`
and `settingsUi.jsx` are the `[ Updated Settings UI ]` build again — tabs, a module
band, folded cards that keep their text, and the save dock. The standalone group and
history routes still exist and still work if something deep-links them; nothing in
the hub sends anybody there.

---

## 4. The layout question — four walls, and what Payroll already answers

Two requirements were given together: **no gap or hole in the wall**, and **a card
must not move when another one opens**. Four layouts were tried on 10 Oct:

1. **Grid with `items-start`.** Each card only as tall as its content → a folded card
   beside an open one left a card-sized hole. Failed "no hole in the wall".
2. **Two columns split half and half by count.** A long open card in the left column
   left most of the right column empty. Failed "this blank space should self-adjust".
3. **Two columns packed by height** (`packColumns`, since deleted). It filled the
   space and broke something worse: open one card and a card the reader had not
   touched jumped from the foot of one column to the head of the other —
   *"notification tab jumping from position"*. Any layout that re-levels itself has
   to move a card to do it.
4. **One full-width column** (what is live now). No holes, nothing moves sideways,
   and the width goes inside the card instead — three fields to a line from `xl`
   (`fieldSpan`). This is the "linear" look the user has now rejected.

**Payroll Settings already resolves this, and its header comment says how**
(`PayrollSettingsPage.jsx`, the comment above the wall):

> `grid grid-cols-1 xl:grid-cols-2 gap-6` with **grid's default stretch** — no
> `items-start`. The two cards in a row are paired to the taller one, which puts the
> space **inside the shorter card, where it reads as a card with room in it rather
> than as a gap in the layout.** Balanced columns (CSS `columns`) repack on every
> fold, so a card the reader had not touched jumps to the other side. One full-width
> column has no holes either, but these cards hold two-column field grids and would
> then be running at half density on a laptop. *Don't put `items-start` back without
> solving the hole it reopens.*

So the brick wall that satisfies both requirements is a plain two-column CSS grid in
document order with stretch left on: a card's position depends on its index, never on
anyone's height, so nothing jumps; and there is no hole, because the spare height is
inside a card rather than between them.

**What moving Settings onto that wall also means:** the card is half the page again,
so `fieldSpan`'s three-fields-per-line at `xl` goes back to two (`sm:grid-cols-2`,
the same as Payroll's inner grids), and the shelf headings of §2 round 5 become more
useful, not less — they are what keeps an eleven-field card readable at half width.

---

## 5. Standing decisions — do not re-litigate

- **Tabs, not a rail.** A rail buys back the label-to-control distance it was meant
  to fix.
- **Cards are shutters, folded by default, and keep their text while folded** — icon,
  name, one-line purpose, status, count.
- **One Save per page, in the sticky dock.** Never a second Save in a card footer on
  a page that has the dock. Saves are still one request per group.
- **Our words, not the catalogue's:** `SETTING_BLURB` (what it does),
  `SETTING_LABEL` (≤32 characters), `SETTING_WARNING` (the caution). The catalogue's
  `label`/`description`/`warnings[]` are fallbacks or ignored; its **keys** are
  trusted absolutely.
- **No ID, no raw enum, no dash** (§4, §5). Unknown reads N/A.
- **Purple only** (§5). Rose is for errors and destructive actions, nothing else.
- **Every text shade comes from `settingsText.js`** so the contrast pass stays one
  edit away from being taken back.
- **The ⓘ pass ships with the work** (§10), gated per workspace, with an Ask Maya
  question on every hint.

---

## 6. Layout 5, shipped — the wall is two lanes (14 Oct 2026)

> **Superseded the same day by §7.** The lanes, `items-start`, the card's
> `sm:grid-cols-2` field grid and `fieldSpan`'s `sm:col-span-2` are all gone —
> read this section as the reasoning that led to the courses, not as the
> current layout.

Settings is on the wall. Two courses of bricks from `xl`, one column below it, and
everything in §5 untouched.

**What was built** (`OrgSettingsPage.jsx`):

```jsx
const lanes = useMemo(() => {
  const indexed = visibleGroups.map((group, index) => ({ group, index }));
  if (indexed.length < 2) return [indexed];          // one card fills the row
  return [indexed.filter(({ index }) => index % 2 === 0),
          indexed.filter(({ index }) => index % 2 === 1)];
}, [visibleGroups]);
```

```jsx
<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
  {lanes.map((lane, laneIndex) => (
    <div key={laneIndex} className={`contents xl:block xl:space-y-4 ${lanes.length === 1 ? "xl:col-span-2" : ""}`}>
      {lane.map(({ group, index }) => (
        <div key={group.key} className="min-w-0" style={{ order: index }}>…</div>
      ))}
    </div>
  ))}
</div>
```

**Why lanes and not Payroll's literal grid.** Payroll's cards are open by default and
roughly equal in height, so grid's default stretch puts the spare height *inside* the
shorter card. Settings' cards are shutters, **closed by default**, so the pathological
case is the normal one: a 64px folded card sharing a grid row with a 700px open one
either balloons into 700px of empty white (stretch) or leaves a 700px hole beside it
(`items-start` — layout 2, the reported bug). **Row pairing is the thing that cannot
survive folding.** Two independent stacks have no rows to pair, so there is nothing to
balloon and nothing to hole; opening a card lengthens its own column only.

**Why by index and not by height.** A card's lane is decided from its catalogue
position before anything is open, so opening or folding a card can never move another
one. That is the `packColumns` bug (layout 3, "notification tab jumping from
position") permanently out of reach — no heights are measured anywhere.

**Three details that are easy to undo by accident:**

- Below `xl` each lane is `display: contents`, so the cards become the grid's own
  children and a single column holds all of them; the inline `order` is what restores
  catalogue order there, because the DOM order is lane-major. Both halves or neither.
- A tab with **one** card (Company & Billing) gets `xl:col-span-2` — at half width a
  lone card read as an unfinished row.
- Tab order at `xl` runs down one column then the other, which is correct for
  independent `<section>`s with their own headings. It stops being correct the moment
  somebody makes one card depend on the card beside it.

**Also in this pass:** the card's inner grid is `sm:grid-cols-2` (never
`xl:grid-cols-3`) now that a card is half the page, and `fieldSpan` returns
`sm:col-span-2` for chip lists — "the whole row" is two cells, not three. The shelf
headings of §2 round 5 are what keep an eleven-field card readable at that width.

**Verified by static render** (5 / 2 / 1 / 0 cards): two lanes with order `0,2,4,1,3`;
no `xl:col-span-2` with two cards and one with a single card; no wall at all on an
empty tab (the "Nothing to show for …" line instead); every card folded on arrival;
one Save, in the dock. Lint on the touched files is clean and `npm run build` passes.

---

## 7. Layout 6, shipped — courses of bricks, and the prose left the cards (14 Oct 2026)

Two reports, same day, same cause.

> "in specific categories like documents and branding and payroll etc, there we still
> have so much white space when we open the tab (the side tabs and below the side tabs
> we can see so much white). i want you to fix this."

> "the entire setting page + the categories it have looking so much crowded so we are
> taking the revolutionary decision here. remove all the single liner text that explain
> what the field is. instead of this, give 'i button' on nearly each field. like 90 to
> 95% field should have the 'i button ( ask maya option as well)'. and update the
> remaining texts in such manner that the page does not look this much crowded. also
> increase the size of headings a bit more and a bit bold. we dont need to show on and
> off on the switches as well."

### 7.1 The white space — an open card takes its whole course

Layout 5 (§6) removed the holes by removing the rows: two lanes, each its own stack.
What it could not remove is the **shortfall at the foot of the other lane** — open one
card in the left lane and the right lane simply ends higher up the page. That is the
same white space as §6's hole, measured down the page instead of across it, and it is
what "below the side tabs we can see so much white" describes.

So the wall is rows again, but no row ever mixes a folded card with an open one:

| what | how wide |
|---|---|
| an open card | the whole course (`xl:col-span-2`) |
| folded cards | one column each, two to a course |
| a folded card that would be left alone in a course | widens to close it |

`layoutWall(groups, openKeys)` in `settingsMeta.js` decides it, and the page renders a
plain `grid grid-cols-1 xl:grid-cols-2 gap-4` in catalogue order:

```js
export function layoutWall(groups, openKeys) {
  const open = openKeys instanceof Set ? openKeys : new Set(openKeys || []);
  const wall = (groups || []).map((group) => ({ group, span: open.has(group.key) ? 2 : 1 }));
  let half = false;
  for (let i = 0; i < wall.length; i += 1) {
    if (wall[i].span === 2) { if (half) wall[i - 1].span = 2; half = false; }
    else half = !half;
  }
  if (half) wall[wall.length - 1].span = 2;
  return wall;
}
```

Why this is allowed to exist after `packColumns` was banned: **it measures nothing.** It
reads the open/closed flags and a card's position in the catalogue, which is all it is
ever allowed to read. A card's *width* can change (the brick before one you open widens
to close its course); a card's *order* never does. The 10 Oct bug was a card jumping
position, and that remains impossible.

`items-start` is gone with the lanes — the grid stretches again, as Payroll Settings
does. Stretch is safe now for the reason it was ruinous before: the only cards that ever
share a course are folded ones, within a few pixels of each other, so stretch fills the
course with the card's own white rather than ballooning a 64px card to 700px. Each card
carries `h-full` so it actually fills what it is given.

Checked exhaustively rather than by eye: **all 255 open/closed arrangements of up to
seven cards** — every course comes to exactly two columns, no course is left half laid,
an open card is never in a course with anything else, and the order is never touched.

### 7.2 The crowding — 136 sentences became ⓘ help

Every setting printed a one-liner under its control. On the Payroll tab that is a page of
prose with the controls buried in it. The sentence is now the hint behind the ⓘ that was
already beside each field's name:

* `SETTING_BLURB` (138 lines) is **deleted** from `settingsBlurbs.js`. Its text moved
  verbatim into `settings.hub` in `fieldHelp.json` — 136 new entries, 2 already there —
  each with an **Ask Maya question of its own**. Nothing was reworded on the way; the
  lines are still the ones read off `md_settings/org_settings_registry.md`.
* They sit on a **new `settings` tier** (`hr`, `manager`), so the 4-per-screen cap still
  means something on every other screen, and the whole set can be thinned by dropping a
  workspace in one place (CLAUDE.md §10's own instruction).
* `settingBlurb()` now **reads that JSON**, so the change history — which prints the
  sentence as text, because a record is prose, not a form — still has it, and there is
  exactly one copy of each line in the repo.
* The allowed range (`between 1 and 31`) was the other half of the old caption. It is
  read off the live catalogue, so no config file can hold it: `FieldHelp` takes a new
  `extra` prop and draws it under the hint. That is its only use — it is not a second
  hint.
* Coverage: every setting the registry documents. A key the backend adds tomorrow has no
  entry and shows no ⓘ, which is the existing "missing is better than invented" rule.

### 7.3 What the freed room paid for

* **Three fields to a line at `xl` again.** An open card is the full width of the page,
  so a column is ~320px rather than the ~190px that forced two in §6. `fieldSpan` returns
  `sm:col-span-2 xl:col-span-3` for a chip list.
* **Bigger, bolder headings**, behind their own switch in `settingsText.js`
  (`BIGGER_HEADINGS`, separate from `DARKENED` — shade and size were asked for four days
  apart and must be revertible separately): the open tab `text-lg → text-xl`, a card
  `text-[15px] semibold → text-[17px] bold`, shelf headings and field names `11px → 12px`.
* **No "On"/"Off" beside a switch.** A filled purple track with the knob to the right is
  the convention everybody owns; `role="switch"` + `aria-checked` is what a screen reader
  was reading anyway, and it is untouched.
* **The remaining sentences were capped.** The one line a folded card still prints is
  clamped to one line and a half-width card's line is ~72 characters, so twelve
  `GROUP_BLURB` entries that were being cut off mid-clause were shortened to fit.

### 7.4 Verified

* `layoutWall`: 255 arrangements, plus the named cases (1 card → full width; 2 → side by
  side; 3 → the third widens; open in the middle of four → `1,1,2,2`; open all → a course
  each; empty and null arguments).
* Static render of the real page over the real catalogue keys: no sentence printed in a
  card (ours, the registry's or the fallback), an ⓘ on every field named by its short
  name, no `On`/`Off`, no `items-start`, no lane or inline `order` left, every card
  `h-full` and folded on arrival, three-column field grid, and the empty tab still says
  "Nothing to show for …". 40 checks.
* The 10 Oct harness, brought to this contract: 106 checks.
* The dev field-help validator: **no warnings** across all 151 `settings.hub` entries
  (hint present, under 160 characters, Ask Maya enabled, known tier and workspaces).
* `npx eslint` clean on every touched file; `npm run build` passes.

---

## 8. The readability pass — nothing counts settings, and every number says what it counts (15 Oct 2026)

Nine notes from one reading of the page. None of them is a new idea; every one
removes something that was in the reader's way, or finishes something §7 started.

### 8.1 One heading scale, two steps louder at the top

`settingsText.js` had one `HEADING` table behind one switch; it now holds the
whole ladder, and the page uses nothing else:

| | | was |
|---|---|---|
| page | `text-2xl` bold — "Settings" | unchanged |
| band | `text-[22px]` **extrabold** — the open tab | `text-xl` bold |
| section | `text-lg` bold — "Managed on their own screens" | an 11px uppercase label |
| card | `text-[17px]` bold — a settings group | unchanged |
| shelf | `text-[15px]` bold — a run of fields | `text-xs` uppercase, tracked |
| field | `text-xs` bold uppercase — one field's name | unchanged |

The two that moved most were both doing the wrong job. **"Managed on their own
screens"** introduces something that is not a setting at all — a list of
screens to open — and at 11px uppercase it read as a caption belonging to the
cards above it ("this starts a new UI/UX so the heading should be big"). The
**shelf heading** was the same shape as a field name two lines below it, so a
run of fields looked like it began in the wrong place; at 15px sentence case it
is plainly a heading ("we can keep the text 'Earned days off' but this should
look like heading").

The field name stays a LABEL on purpose: uppercase 12px is how every form in
this product names a box, and a settings card is a form.

### 8.2 Every shade one step darker — the same switch, second notch

> "the text color is also need to get a bit bolder here in the settings page as
> due to high white background it is hard to read easily."

Exactly right about the cause: this page is white nearly edge to edge, so there
is no mid-grey anywhere for a grey word to sit against.

| | now | 10 Oct | before |
|---|---|---|---|
| body — a sentence | slate-800 | slate-700 | slate-600 |
| value — a figure | slate-900 | slate-900 | slate-800 |
| label / caption | slate-700 | slate-600 | slate-500 |
| meta — a date | slate-600 | slate-500 | slate-400 |

Still one `DARKENED` switch, still one edit to undo. Two shades outside the
table went with it, because both are content rather than furniture: the **unit
drawn on a number box** (slate-400 → slate-600 — it is the half of the field
that says what is being counted) and an **unselected pill** in a segmented
control (slate-500 → slate-600).

### 8.3 Nothing counts settings any more

> "in the categories we do not need to mentions numbers like (10), (15) etc etc
> (settings number). remove this" … "remove this type of texts: 'Unused leave
> and notice 11' or 'Earned days off 5', '4 moved off the default' etc etc."

Four separate counts, all removed, because each one stood next to the things it
was counting:

* `(10)` after a tab's name — `tabOptions` in OrgSettingsPage;
* `5` beside a shelf heading — and it was the reason that heading had to stay
  small enough to carry a tail;
* `11 settings` under a card's title. Not named in the report, but it is the
  same number in a third place; what is left of that line is the one thing
  nothing else says, **"Last changed 12 Oct 2026, 14:30"**;
* `4 moved off the default` inside a card. The *fact* a reader wants from it is
  that the card has been customised, and the header's **"Customised"** pill
  says that without arithmetic — and says it while the card is still folded.

That last one carried the ⓘ for `non_default_keys`, which is an HR-onboarding
entry, and §10 forbids thinning the tier one entry at a time. So the ⓘ moved to
the header beside the pill it explains (a sibling of the toggle button, like
"Put back to default" — an ⓘ may never be inside another interactive element),
and the hint was reworded from "Changed" to "Customised" to match the word it
now sits next to.

### 8.4 One ⓘ per field, never two

> "Second approver for pay field have 2 'i buttons'. remove one"

It was the only field with two, and for a bad reason: a high-risk field got the
`risk` concept's ⓘ beside its own, so exactly the fields a reader is most
careful about were the ones with a pair of identical circles in the label.

`FieldHelp` takes a new `also` prop — **another key in the same surface** whose
hint belongs in this popover too. The risk sentence is now a second line inside
the field's own popover, under a hairline, which is where someone asking about
that field is already looking. One Ask Maya question is offered (the field's
own); a popover with two asks the reader to choose before they have read either.

Nothing was deleted from `fieldHelp.json` and nothing moved into JSX: `also`
resolves through `getFieldHelp()` like every other hint, workspace gating
included. The rose mark beside the label and its screen-reader sentence are
untouched.

### 8.5 Like-shaped controls side by side

> "exchange the positions of 'Pay in the next month' with 'Financial year
> starts' as Financial year starts have same input field as others and this
> will maintain the UI. do same for 'When deductions exceed pay' and 'Pay for
> overtime' … same for 'Draft started on' with 'Remind about declarations' …
> and in other tabs also if needed"

Three instances of one rule, so the rule is what shipped rather than three
swaps. A yes/no is a 22px switch on its label's own line; everything else is a
full-width box or select *under* its label. One switch in the middle of a run of
boxes therefore leaves a half-height cell and knocks the whole three-column grid
out of step.

`orderFields` (settingsMeta) stable-partitions each shelf: **boxes first,
switches last**, catalogue order preserved inside each. A shelf with a HEADING
keeps its master switch (`*_enabled`, `*_required`, `*_payable`) at the top —
reading "Employee share" before "Provident Fund: off" is reading the answer
before the question — but a card that didn't split has no heading for a switch
to govern, which is what moves "Pay for overtime" off the top of the payroll
engine card. All three named pairs come out in the asked-for order, and so does
every other pair of that shape.

### 8.6 Every number says what it counts

> "as we are giving fields for entering seconds like (60) so there give a
> written type also … in 'Publishing', 'Publish on the spot up to' have field
> where it should have writen something like pdfs so it becomes 200 pdfs when HR
> reads. this gives better understanding of the fields and data."

Most numeric settings arrive from the catalogue with a `unit` and already read
"30 days" or "₹ 50,000" on the box. About forty arrive with `unit: null` and sat
there as a bare `20000`. `SETTING_NOUN` fills those in, and is consulted **only**
when the catalogue gives nothing — the catalogue always wins, and a key missing
from the table still renders as a bare number, which is the right failure:
a wrong noun is worse than none.

**One correction to the report.** "Publish on the spot up to" is not counting
PDFs. The registry is explicit — *"Integer, recipient count"* (setting #79): it
is the size of the audience a publish would create rows for, above which the
publish goes to the background. So it reads **"20000 people"**. Captioning it
"pdfs" would have made the field say something untrue, and this is one of the
numbers an HR admin is most likely to lower deliberately. The payslip threshold
beside it genuinely does count payslips, and says so.

A long noun needs the room the digits were keeping, so the box's right padding
and the affix's width now follow the noun's length.

**And a month is a month.** `financial_year_start_month` and the three tax-window
months are stored 1–12 and were drawn as number boxes reading `4`. That is the
worst case of the same problem: not wrong, unreadable, and it asks the reader to
know that months are numbered. `isMonthOfYear` (the same evidence `isDayOfMonth`
uses — the range *and* the key's last word) makes them a select of month names,
so the field reads **April**. SINGULAR `_month` only: `loan_max_tenure_months`
is a count and keeps its box. `displaySettingValue` was taught both, or the
change history would print `4` for a control showing April.

### 8.7 The search answers any name on the page

> "in the search baar, even user/HR type the heading name of the tab, the
> setting must appear there"

Three of the names printed above a setting were unsearchable: the **tab**
("Documents & Branding"), the **shelf heading** ("Provident Fund"), and — until
§7 — the policy screens. Somebody who can see a word on the page and types it
into the box on that page has asked a reasonable question.

Both are matched now, scored in order of confidence — exact label 6, label 5,
group 4, shelf 3, tab 2, key 1 — so a precise word still wins. The shelf name is
read off the key, the same source the card reads it from, so the search can name
a shelf without knowing which card is open. The cap rose from 12 to 25, because
a tab name legitimately matches a tab-full and a dozen would be a sample rather
than a list. Policy screens match a tab name too.

### 8.8 Verified

* `orderFields` and `fieldShelves`: the three named pairs by name, plus the
  partition's own rules (stability both sides, master switch with and without a
  heading, null input).
* `searchSettings`: a tab name finds the settings under it, the other tab's name
  finds the other ones, a shelf heading finds its own fields, a precise label
  still outranks a tab, two letters of nothing finds nothing.
* `displaySettingValue`: April for a month, "4 months" for a count of months,
  "20000 people" for a unitless recipient count, "12%" with no space.
* The page rendered statically over real catalogue keys: no count on a tab, a
  shelf heading, a card header or a card body; "Last changed" kept; one ⓘ on the
  high-risk field and none for the risk concept; the "Customised" ⓘ on the one
  customised card, beside its pill; "people" and "payslips" on the boxes;
  "April" and "December" as options; the three heading sizes; the darker shades;
  and "Financial year starts" laid before "Pay in the next month".
* **88 checks** in the layout/15-Oct harness, **108** in the 10 Oct one, both
  green; the field-help validator silent across all 151 `settings.hub` entries;
  `npx eslint` clean on every touched file; `npm run build` ✓.

---

## 9. Payroll Settings is the same screen as Settings (15 Oct 2026)

> "i think that folder page does not provide all the setup required fields like
> the full day hours like fields are missing from there … we expect user to
> complete setup from there directly" … "we have to make the UI/UX of the
> payroll to the setttings UI/UX"

### 9.1 The report, checked — and it was larger than reported

Correct, and the full-day-hours field was the small end of it. The same
singleton row that `GET /api/v1/payroll/hr/settings` returns, and the same
partial `PUT` that accepts it, carries **63** settings. The Setup tab's own page
offered **27**. The other **36** could only be reached from the Settings hub,
which is a different screen in a different module:

| Card | Fields | Had nowhere to be set |
|---|---|---|
| Pay calendar | 7 | **7** — cycle, period start, cut-off, pay day, pay in next month, FY start, currency |
| Payroll engine | 9 | **7** — full-day hours, rounding, part-done days, negative pay, all three overtime keys |
| Loans | 6 | **6** |
| Tax & declarations | 8 | **8** |
| Payslip PDFs | 3 | 2 |
| Automation & reminders | 6 | **6** |
| Approvals · Claims · Leavers · Comp-off · Publishing | 24 | 0 |

An HR admin could not finish payroll setup from the setup screen. They can now.

### 9.2 The singleton declared as data, not typed into JSX

`payrollSettingsCatalogue.js` is the whole row as one table: 11 cards, each with
a label, an icon, a blurb, a folded-state summary, and its fields as
`{ key, data_type, range, unit, nullable }` — the same shape the settings
gateway's catalogue hands the hub, so the hub's own `SettingInput`,
`fieldShelves`, `orderFields`, `fieldSpan` and `layoutWall` drive it unchanged.
Adding a field is a line of data.

**Nothing is drawn that the server did not send.** `resolveGroups(saved)` keeps a
field only when its key is present in the raw GET response, and drops a card
that ends up empty — so a server without the #56 automation keys simply has no
Automation card, and `settingsPatch` (which only sends keys the server returned)
could not send one anyway. That is §7's "gate UI on what the server returned",
and it is why **no backend change was needed for any of the 36**.

No defaults are declared. This endpoint returns no `non_default_keys`, so a
"Default" pill here would be a guess; the stored value is the only truth the page
has.

### 9.3 What was copied from the hub, and what deliberately was not

Copied: the band header, Ctrl-K search, the course-packed wall, the shutter card,
the three-column field grid, shelves and their 15px headings, the field label
scale, `DARKENED` text, switches last, pills under 16 characters, units on every
number box, month and day-of-month selects, the save dock with its unsaved count,
Discard all, and the ⓘ layer.

**`SettingsGroupForm` itself is not reused**, and `PayrollSettingCard`'s header
says why: that component is a form over the *gateway* — it owns its edits, its
ETag, its 412 conflict and its reason gate. Driving it from here would mean
inventing an `etag` and a `writable` flag for a row that has neither, which is a
lie about the contract inside a component eleven other cards depend on. The card
is a stateless copy of its *shapes*; the page owns the form, as it already did.

Not copied, because they do not exist on this endpoint: the Customised/Default
pill, "Put back to default", "Last changed", the risk mark, per-card Save and the
reason dialog. The `SETTING_WARNING` lines the hub shows in that dialog are not
lost — they are the body of the one `window.confirm` this page already awaited
before saving.

### 9.4 Two defects found while doing it

* **A control that saved nothing.** The old Rounding select wrote
  `rounding_policy`; the live row stores `net_pay_rounding`. `settingsPatch`
  drops any key the server didn't return, so on a current server that control
  silently saved nothing at all. Both keys are declared now, and `supersededBy`
  draws the legacy one **only** where the modern one is absent — never two
  rounding controls, never a dead one.
* **A UUID in a text box.** The salary-line pickers (notice recovery, leave
  payout, comp-off payout) are typed `string` in the registry, and `SettingInput`
  only honoured handed-in `options` under `case "enum"` — so they fell through to
  a plain text input containing `9f1c2b3a-0000-…`, which §4 forbids outright.
  Handed-in choices now decide the control whatever the stored type is. The blank
  option says what it costs ("Not set — settlements will be refused") rather than
  inviting the blank.

Also: "Not set — cash-outs can’t be paid" became "…nothing can be paid out". §6
settled that word — the action is "pay out".

### 9.5 Nothing goes out from an unfinished form (§11)

The Save all button stays live; the press does the checking. `settingProblems`
builds `{ payloadKey: "what is wrong with it" }` from the catalogue's own ranges,
the press flips `attempted`, reddens the boxes, **clears the search and opens the
cards holding a blocker** (a hidden box cannot take focus), then
`focusFirstProblem` travels to the first one in screen order. The card body is
hidden, never unmounted, for the same reason.

Two lists, not one: `settingsPatch` is what will be **sent**, `touchedSettings`
is what has been **changed**. They differ for exactly one case — an emptied NOT
NULL box, which is a change that can never be sent as `""`. Counting that as
unsaved is what stops the page saying "nothing has changed" while a required box
sits empty. Blockers are narrowed to touched keys, so a bad value that arrived
*from* the server cannot strand the page.

Nullable settings are meant to be clearable: emptying "no amount limit" sends
`null`, and is not an error.

### 9.6 Words for stored values

`ENUM_LABEL` (keyed `setting_key::stored_value`) gives every enum on this row our
own words, and `displaySettingValue` reads it before falling back to
`humanize()`. `clamp_and_carry` reads **"Pay nothing now, recover next month"**;
`INR` reads **"Indian rupee (INR)"**, not "Inr".

One visible consequence in the hub: a value whose label is now a sentence is past
the 16-character cap a pill row needs, so `lop_basis` is a select rather than
three pills. The cap exists for that; three 17-character pills at 390px wrapped.

### 9.7 Where the spec and the server disagree

Recorded in the catalogue header per §9, and handled in code rather than guessed:
`resolveEntry` swaps our spelling for the server's own through `aliases`
(`clamp_and_carry` vs the documented `clamp_and_carry_forward`), and **appends**
any stored value we never declared (`nearest_ten`, a currency this org uses that
isn't in our list) instead of dropping it from the select — which would have
silently changed the setting on the next save.

### 9.8 Verified

* **123 checks** in the new payroll harness: every named missing field is
  settable; an undrawn key cannot reach the patch; the legacy rounding key
  appears only alone; alias and undeclared-value resolution; the problem map, the
  two change lists, and `null` for a cleared cap; month names, day-of-month text,
  units, pills vs selects, shelf headings, one ⓘ per field, the red state only
  after a press, the paused switch with its reason, and the folded summaries over
  both a full row and `{}`.
* **No ID or raw enum in the rendered text** of any card, checked with the tags
  stripped — an option's `value` attribute is not the screen, a text box is.
* **109 checks** in the 10 Oct harness and **88** in the course-packing one, both
  green. `wall.test.jsx` (the 14 Oct two-lane wall) is marked superseded in its
  own header rather than left to rot — courses replaced lanes on 15 Oct.
* Field-help validator silent; all 63 fields resolve to a hint **and** an Ask
  Maya question in the surface their card reads.
* `npx eslint` clean on every touched file; `npm run build` ✓. No endpoint,
  payload shape or request path changed.

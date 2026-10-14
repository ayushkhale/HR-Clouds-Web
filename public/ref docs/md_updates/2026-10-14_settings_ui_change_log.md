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

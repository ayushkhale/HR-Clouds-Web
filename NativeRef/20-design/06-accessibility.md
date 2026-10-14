# 06 · Accessibility

This is a payroll app. Someone will read their salary on it with a screen reader
at 200% text size. Target **WCAG 2.1 AA**.

---

## Non-negotiables

1. **Status is never colour alone.** Every `StatusBadge` is a dot **plus a
   word**. This is already true on web and is the single most important rule
   here — 8% of men cannot distinguish the violet/fuchsia pair reliably.
2. **Every pressable has a label and a role.**
3. **Text scales to at least 200%** without clipping or overlap.
4. **Contrast ≥ 4.5:1** for text, **≥ 3:1** for control affordances and icons.
5. **Nothing is reachable only by gesture.** Swipe-between-tabs has a tap
   equivalent; a drag-dismissed sheet has an X.

---

## Labels and roles

```jsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Clock in"
  accessibilityHint="Records your arrival with your current location"
  accessibilityState={{ disabled: busy }}
>
```

| Element | Role | Label |
|---|---|---|
| Button | `button` | The visible text; for icon-only, say the action |
| List row | `button` | `"<title>, <subtitle>, <value>, <status>"` — the whole row as one phrase |
| Row chevron | — | `accessibilityElementsHidden` — the row already says it |
| Tab | `tab` | The label; container is `tablist` |
| Toggle | `switch` | The label; `accessibilityState={{ checked }}` |
| Text input | — | `accessibilityLabel` = the field label |
| The ⓘ | `button` | `"What is <label>?"` |
| Status badge | `text` | The status word (it's already text) |
| Decorative icon | — | `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` |
| Avatar | `image` | `"<name>"`, or hidden when the name is adjacent |
| Sheet | — | `accessibilityViewIsModal` on the container |
| Toast | — | `accessibilityLiveRegion="polite"`, role `status` / `alert` |
| Error state | `alert` | — |

### Rows: one element, one phrase

A row with four separate text nodes makes a screen reader user swipe four times
per row. Group it:

```jsx
<Pressable
  accessible
  accessibilityRole="button"
  accessibilityLabel={`${fmtDate(row.date)}, present, 8 hours 32 minutes worked`}
  accessibilityHint="Opens the day’s details"
>
  {/* visual children, all of them accessibilityElementsHidden via `accessible` on the parent */}
</Pressable>
```

Note the label spells out **"8 hours 32 minutes"**, not "8h 32m" — a screen
reader reads "h" as a letter. Provide a spoken variant for every abbreviated
duration and money figure:

```js
// lib/format.js
export const spokenDuration = (mins) => { /* "8 hours 32 minutes" */ };
export const spokenMoney = (v) => { /* "87,432 rupees" */ };
```

Use them in `accessibilityLabel` only — the visible text stays `8h 32m`.

---

## Dynamic type

RN scales text by default on both platforms once `allowFontScaling` is left
alone. **Never set `allowFontScaling={false}`** to "fix" a layout — fix the
layout.

What breaks, and the fix:

| Breaks | Fix |
|---|---|
| A fixed-height row clipping two lines | `minHeight`, never `height` |
| A badge's text wrapping | `flexShrink: 0` on the badge, `numberOfLines={1}` |
| Side-by-side tiles colliding | `flexWrap: 'wrap'` so they stack at large sizes |
| A pinned footer eating the body | `maxHeight` on the footer, scroll the body |
| Tab labels truncating | Accept truncation on the tab bar; the icon carries it |

Test at **130%** (common) and **200%** (the AA requirement). On iOS:
Settings → Accessibility → Display & Text Size → Larger Text. On Android:
Settings → Display → Font size, plus **Display size**, which scales layout too
and breaks different things.

---

## Contrast — the values we rely on

Checked against white or the relevant tinted background:

| Pair | Ratio | Verdict |
|---|---|---|
| `slate-900` on white | 16.8:1 | ✅ |
| `slate-800` on white | 13.6:1 | ✅ |
| `slate-600` on white | 7.0:1 | ✅ labels |
| `slate-500` on white | 4.8:1 | ✅ body secondary |
| `slate-400` on white | 2.9:1 | ⚠️ **muted text only** — "N/A", placeholders, captions. Never for anything load-bearing |
| `purple-600` on white | 5.1:1 | ✅ links, active tab |
| `purple-700` on `purple-50` | 7.4:1 | ✅ soft button |
| white on `purple-600` | 5.1:1 | ✅ primary button |
| `violet-700` on `violet-50` | 7.1:1 | ✅ success badge |
| `fuchsia-700` on `fuchsia-50` | 6.4:1 | ✅ pending badge |
| `indigo-800` on `indigo-50` | 9.3:1 | ✅ info badge |
| `rose-700` on `rose-50` | 6.6:1 | ✅ error badge |
| white on the hero gradient | 8.9:1 – 11.4:1 | ✅ |
| `purple-100` on the hero gradient | 6.2:1 | ✅ hero subtitle |

The ⓘ icon at rest is **`slate-500` on white (4.8:1)** — the web app moved it up
from `slate-400` (2.6:1) for exactly this reason. On purple surfaces it is
`purple-200` (~4:1 against purple-600). Don't darken or lighten either.

`slate-400` is the one value in the system that fails AA for body text. It is
allowed **only** for genuinely secondary content that is duplicated elsewhere —
which is why "N/A" uses it: the absence is also conveyed by there being no
value.

---

## Touch targets

**44 × 44 minimum**, every time. Where the visual element is smaller, extend the
target:

```jsx
<Pressable hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
  <Icon size={16} />   {/* 16px glyph, 40px target */}
</Pressable>
```

The ⓘ is the one that always needs this — it's a 16px icon.

Adjacent targets need **8px** between them, or people hit the wrong one. The
row + inline action combination is the usual offender: give the action its own
padded container and `data-row-action`-equivalent press isolation (`Row` already
stops propagation from its `actions` slot).

---

## Screen reader navigation

- **Focus order follows the visual order.** It does automatically unless you
  use `position: absolute` — check any screen that does.
- **Opening a sheet moves focus into it.** `accessibilityViewIsModal` on the
  sheet container, so everything behind becomes unreachable.
- **Closing a sheet returns focus to the row** that opened it.
- **Announce the result of an action**, not just the state change:
  ```js
  AccessibilityInfo.announceForAccessibility('Clocked in at 9:02 am');
  ```
  Do this for punches, submissions and acknowledgements — the toast's
  `liveRegion` covers most of it, but a punch changes the whole card and deserves
  its own announcement.
- **A loading state announces once**, not on every skeleton row:
  `accessibilityLabel="Loading your attendance"` on the container,
  `accessibilityElementsHidden` on the shimmer blocks.

---

## Forms

- Label ↔ input association is `accessibilityLabel` on the input (RN has no
  `htmlFor`).
- `accessibilityHint` for format expectations: "Eleven characters, like
  SBIN0001234".
- An error must be **announced**, not only shown:
  ```jsx
  <TextInput accessibilityInvalid={!!error} />
  <Text accessibilityLiveRegion="polite" role="alert">{error}</Text>
  ```
- Required fields say so in the label, not only with an asterisk.
- **Never** rely on placeholder text as the label — it disappears on focus and
  many screen readers skip it.

---

## The ⓘ specifically

It is a **toggletip**, not a tooltip — the panel contains a button, so
`role="tooltip"` would be wrong.

- `accessibilityRole="button"`, label `"What is <label>?"`.
- Tap opens and **pins** it; tap outside, the X, or back closes it.
- The panel is a sibling in the accessibility tree, reachable immediately after
  the ⓘ, so a screen reader reads: ⓘ → the hint → "Ask Maya about this" → on
  through the form.
- It is **never inside another pressable** — a tap would fire both, and the
  accessible name of the outer control would swallow the ⓘ's.
- It is **never inside a `<label>`**: on web that made the input's accessible
  name "IFSC code What is an IFSC code?". The native equivalent is putting it
  inside a `Pressable` row that also contains the input.

---

## Reduce motion

See [04-motion.md](04-motion.md). Summary: entrances become instant, tweens
jump, the skeleton stops pulsing, **sheets keep their slide**.

Also honour **reduce transparency** (iOS) by dropping any blur and using the
solid backdrop colour.

---

## Testing

| Tool | What it catches |
|---|---|
| **VoiceOver** (iOS, triple-click side button) | Order, labels, trapped focus |
| **TalkBack** (Android) | The same, plus different grouping behaviour — test both |
| **Accessibility Inspector** (Xcode) | Missing labels, small targets |
| **Accessibility Scanner** (Android, Play Store) | Contrast, target size, missing labels. Run it on every screen |
| Font size 200% | Clipping |
| Android **Display size** at max | Layout breakage `Font size` doesn't show |
| Greyscale mode | Anything relying on colour alone |

A 10-minute pass per screen with TalkBack on, in Phase 8, before release.

---

## Per-screen a11y checklist

- [ ] Every pressable has a role and a label
- [ ] Rows read as one phrase, with durations and money spoken in words
- [ ] No status conveyed by colour alone
- [ ] Icon-only buttons labelled; decorative icons hidden
- [ ] 44×44 targets, 8px apart
- [ ] Readable at 200% text, no clipping
- [ ] Focus order matches visual order
- [ ] Sheets trap focus and restore it on close
- [ ] Errors announced, not only displayed
- [ ] Walked once with TalkBack **and** once with VoiceOver
- [ ] Legible in greyscale

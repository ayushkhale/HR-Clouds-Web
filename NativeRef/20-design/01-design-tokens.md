# 01 · Design tokens

Every colour, size, radius, shadow and type style in the app comes from
`src/theme/tokens.js`. Nothing else in the codebase contains a hex value or a
magic number.

These are the **exact** Tailwind 3.4 values the web app renders, read out of
`node_modules/tailwindcss/colors` — not approximated. Side by side on a desk,
the two apps are the same product.

---

## 1. Colour — purple only

### The semantic contract

| Semantic | Family | Means |
|---|---|---|
`success` | **violet** | approved · present · paid · earned · in bounds
`pending` | **fuchsia** | pending · waiting for approval · late · warning
`info` | **indigo** | half day · in progress · holiday · breaks · neutral notice
`brand` | **purple** | primary actions · hero · on leave · section icons
`danger` | **rose** | failures · destructive actions · absence · lateness · deductions
`neutral` | **slate** | weekly off · expired · not marked · all chrome and text

Map on sight: green / emerald / teal / lime → **violet**. amber / yellow /
orange / pink → **fuchsia**. sky / blue / cyan → **indigo**.

**rose stays rose**, and only for the five things listed. A rose badge on
anything else is a bug.

> **Never add a green, amber, orange or blue value to this file.** Not for a
> chart, not for a one-off, not "just this once for the success tick".

### Full ramps

```js
// src/theme/tokens.js
export const palette = {
  purple:  { 50:'#faf5ff',100:'#f3e8ff',200:'#e9d5ff',300:'#d8b4fe',400:'#c084fc',
             500:'#a855f7',600:'#9333ea',700:'#7e22ce',800:'#6b21a8',900:'#581c87' },
  violet:  { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',
             500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95' },
  fuchsia: { 50:'#fdf4ff',100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',
             500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75' },
  indigo:  { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',
             500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81' },
  rose:    { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',
             500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337' },
  slate:   { 50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',
             500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a' },
  white:   '#ffffff',
};
```

### Role assignments — use these, not the ramps

```js
export const color = {
  // surfaces
  bg:            palette.slate[50],      // the app background. NEVER pure white
  surface:       palette.white,          // cards, sheets, rows
  surfaceSubtle: '#f8fafccc',            // slate-50/80 — section headers, read-only fields
  border:        palette.slate[200],
  borderSubtle:  palette.slate[100],

  // text
  textPrimary:   palette.slate[900],     // headings, values
  textBody:      palette.slate[800],
  textSecondary: palette.slate[500],     // subtitles, hints
  textMuted:     palette.slate[400],     // N/A, placeholders, captions
  textOnBrand:   palette.white,

  // brand
  brand:         palette.purple[600],    // primary button, active tab, icons
  brandPressed:  palette.purple[700],
  brandSoftBg:   palette.purple[50],
  brandSoftFg:   palette.purple[700],
  brandSoftBorder: palette.purple[200],

  // the hero gradient — exact web values
  heroFrom:      '#5B21B6',              // violet-800
  heroVia:       '#6328D7',              // custom, between violet-700 and purple-600
  heroTo:        '#4C1D95',              // violet-900
  heroSubtitle:  palette.purple[100],
  heroBadgeIcon: palette.purple[200],

  // semantic — each has bg / fg / border for a badge, and a dot
  success: { bg: palette.violet[50],  fg: palette.violet[700],  border: palette.violet[200],  dot: palette.violet[500]  },
  pending: { bg: palette.fuchsia[50], fg: palette.fuchsia[700], border: palette.fuchsia[200], dot: palette.fuchsia[500] },
  info:    { bg: palette.indigo[50],  fg: palette.indigo[800],  border: palette.indigo[200],  dot: palette.indigo[500]  },
  brandTone:{bg: palette.purple[50],  fg: palette.purple[700],  border: palette.purple[200],  dot: palette.purple[500]  },
  danger:  { bg: palette.rose[50],    fg: palette.rose[700],    border: palette.rose[200],    dot: palette.rose[500]    },
  neutral: { bg: palette.slate[50],   fg: palette.slate[600],   border: palette.slate[200],   dot: palette.slate[300]   },
};
```

### Tone keys — keep the old names

`lib/enums.js` uses the web's semantic tone keys, which are **historic colour
names that now render purple**. This is deliberate: a tone map ported from a web
file keeps working without edits.

```js
export const tone = {
  emerald: color.success,     // success — renders VIOLET
  amber:   color.pending,     // pending — renders FUCHSIA
  blue:    color.info,        // info    — renders INDIGO
  purple:  color.brandTone,
  rose:    color.danger,      // the only one that is still red
  slate:   color.neutral,
  indigo:  { bg: palette.indigo[100],  fg: palette.indigo[800],  border: palette.indigo[300],  dot: palette.indigo[700]  },
  orange:  { bg: palette.fuchsia[100], fg: palette.fuchsia[800], border: palette.fuchsia[300], dot: palette.fuchsia[700] },
  sky:     { bg: palette.white,        fg: palette.indigo[600],  border: palette.indigo[300],  dot: palette.indigo[300]  },
};
```

### Chart colours — validated as a set

The attendance-mix chart, in this order, for lightness separation and
colour-blind distinguishability:

```js
export const chart = {
  mix: [
    { key:'present', label:'Present',   field:'present_days',  color:'#6D28D9' }, // violet-700
    { key:'half',    label:'Half day',  field:'half_days',     color:'#A78BFA' }, // violet-400
    { key:'leave',   label:'On leave',  field:'on_leave_days', color:'#C026D3' }, // fuchsia-600
    { key:'absent',  label:'Absent',    field:'absent_days',   color:'#E11D48' }, // rose-600
  ],
  hoursBar: '#7C3AED',                  // violet-600
  axisTick: { color: palette.slate[400], fontSize: 10, fontWeight: '600' },
  grid:     palette.slate[100],
};
```

**Do not add a fifth slice.** `late_days` overlaps `present_days` and must never
appear in a total-days chart (see [10-api/03-payload-shapes.md](../10-api/03-payload-shapes.md)).

---

## 2. Type

**Manrope**, the web app's font, bundled as an asset. The family names are
PostScript names — verify them on device before building on this (see
[00-plan/04-environment-setup.md](../00-plan/04-environment-setup.md) § Fonts).

```js
export const font = {
  regular:  'Manrope-Regular',    // 400
  medium:   'Manrope-Medium',     // 500
  semibold: 'Manrope-SemiBold',   // 600
  bold:     'Manrope-Bold',       // 700
  extrabold:'Manrope-ExtraBold',  // 800
};
```

RN has no `font-weight` + family synthesis you can rely on — **always set
`fontFamily` explicitly** and never `fontWeight` alone, or Android silently
falls back to Roboto.

### The scale

Mapped from the web's Tailwind sizes. Web `text-xs` carries most of the UI, and
12px is too small for a phone body — the mobile scale shifts the *body* up one
step while keeping labels and captions tight, so density reads the same without
straining.

| Token | Size / line | Family | Web ancestor | Used for |
|---|---|---|---|---|
| `h1` | 24 / 30 | bold | `text-2xl font-bold` | Screen titles, hero title |
| `h2` | 18 / 24 | bold | `text-lg font-bold` | Card titles, sheet title |
| `h3` | 15 / 20 | bold | `text-sm font-bold` | Section headings |
| `body` | 14 / 20 | regular | `text-sm` | Paragraphs, sheet values |
| `bodyStrong` | 14 / 20 | bold | `text-sm font-bold` | Row primary line, values |
| `small` | 13 / 18 | regular | `text-xs` | Secondary row line, hints |
| `smallStrong` | 13 / 18 | bold | `text-xs font-bold` | Buttons, tab labels |
| `label` | 11 / 14 | bold, `letterSpacing: 0.6`, UPPERCASE | `text-xs font-bold uppercase tracking-wider` | **Field labels. The app's signature.** |
| `caption` | 11 / 14 | medium | `text-[10px] font-medium` | Codes, metadata, footnotes |
| `badge` | 10 / 12 | bold, `letterSpacing: 0.3` | `text-[10px] font-bold` | Status badges, pills |
| `metric` | 22 / 26 | extrabold, `fontVariant: ['tabular-nums']` | `text-2xl font-black tabular-nums` | Tile numbers, the live timer |
| `metricLg` | 32 / 36 | extrabold, tabular | — | The punch card's main figure |

**`tabular-nums` on every number that changes** — the running timer, counters,
money in a column. Without it the digits jitter as they tick.

```js
export const text = {
  h1:          { fontFamily: font.bold,      fontSize: 24, lineHeight: 30, color: color.textPrimary },
  label:       { fontFamily: font.bold,      fontSize: 11, lineHeight: 14, letterSpacing: 0.6,
                 textTransform: 'uppercase', color: color.textSecondary },
  metric:      { fontFamily: font.extrabold, fontSize: 22, lineHeight: 26,
                 fontVariant: ['tabular-nums'], color: color.textPrimary },
  // … the rest in 50-starter/src/theme/tokens.js
};
```

---

## 3. Spacing

A 4px base, same rhythm as Tailwind.

```js
export const space = { 0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48, 16:64 };
```

| Context | Value |
|---|---|
| Screen side gutter | `space[4]` = **16** (web: `p-4`) |
| Gap between cards | `space[4]` = 16 (web: `space-y-6` → 24 on desktop; 16 on a phone) |
| Card padding | `space[4]` = 16, or `space[5]` = 20 for a hero card |
| Sheet body padding | `space[5]` = 20 |
| Row vertical padding | `space[3]` = 12 (gives a 56–64 row with two lines) |
| Gap label → value | `space[1]` = 4 |
| Gap inside a badge | `space[1]` = 4 (icon to text: 6) |
| Form field gap (vertical) | `space[4]` = 16 |
| Form grid gap (horizontal) | `space[5]` = 20 (web: `gap-x-6`) |
| Minimum tap target | **44 × 44** |

---

## 4. Radius

The web app is heavily rounded, and that is a signature — don't flatten it.

```js
export const radius = {
  sm: 8,    // pills, small chips           (web rounded-lg)
  md: 12,   // inputs, read-only fields      (web rounded-xl)
  lg: 16,   // cards, sections, sheets       (web rounded-2xl)
  xl: 24,   // the hero header, big cards    (web rounded-3xl)
  full: 999,// badges, avatars, dots
};
```

| Element | Radius |
|---|---|
| Hero header | `xl` (24) |
| Card, section, record sheet | `lg` (16) |
| Input, read-only field, button | `md` (12) |
| Segmented tab container | `md`; the active pill inside it `sm` |
| Status badge, pill, avatar, dot | `full` |

---

## 5. Elevation

iOS and Android shadow differently, so every elevation is a pair. The web app's
shadows are extremely soft (`shadow-xs`, `shadow-2xs`) — resist the urge to make
them heavier on native.

```js
export const shadow = {
  // web shadow-2xs — a hairline lift on a section card
  xs: {
    ios: { shadowColor:'#0f172a', shadowOpacity:0.04, shadowRadius:2, shadowOffset:{width:0,height:1} },
    android: { elevation: 1 },
  },
  // web shadow-xs / shadow-sm — the default card
  sm: {
    ios: { shadowColor:'#0f172a', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2} },
    android: { elevation: 2 },
  },
  // the hero header and the punch card
  md: {
    ios: { shadowColor:'#4c1d95', shadowOpacity:0.12, shadowRadius:16, shadowOffset:{width:0,height:6} },
    android: { elevation: 5 },
  },
  // sheets and toasts
  lg: {
    ios: { shadowColor:'#0f172a', shadowOpacity:0.18, shadowRadius:28, shadowOffset:{width:0,height:-4} },
    android: { elevation: 16 },
  },
};

export const elevate = (key) => Platform.select(shadow[key]);
```

On Android, `elevation` needs a **`backgroundColor`** on the same view or the
shadow doesn't render. Always set both.

---

## 6. Layering

Relative order matters more than the numbers. These mirror the web's z-scale so
a rule written in `CLAUDE.md` still reads true.

```js
export const layer = {
  base: 0,
  sticky: 10,         // a sticky month stepper or filter bar
  header: 20,
  sheet: 140,         // RecordSheet / FormSheet
  fieldHelp: 155,     // the ⓘ popover above a sheet
  maya: 160,
  attachmentViewer: 165,
  reasonPrompt: 170,
  toast: 200,         // always on top
};
```

The ⓘ popover and a Maya raised from a sheet sit **just above the sheet that
hosts the ⓘ** — `host + 15` / `host + 20` for a host above 150. Keep new layers
below the toast.

---

## 7. Dark mode — not in v1, and locked out

The web app has no dark theme. Shipping a half-themed native app is worse than
shipping a light one: the OS will invert some surfaces and not others, and
purple-on-dark needs a different ramp to stay legible.

So **lock it**:

- iOS: `UIUserInterfaceStyle: Light` in `Info.plist`
- Android: `android:forceDarkAllowed="false"` on the app theme; no
  `values-night/`
- Never read `useColorScheme()` in a component

When dark mode is wanted later, it is a token-file change plus one pass over the
`color` roles — which is exactly why no component may hold a hex value.

---

## 8. Using the tokens

```jsx
import { color, space, radius, text, elevate } from '@/theme/tokens';

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    padding: space[4],
    ...elevate('sm'),
  },
  label: text.label,
  value: text.bodyStrong,
});
```

### Banned in a component file

- A hex or `rgb()` value
- A raw number for padding, margin, radius or font size
- `fontWeight` without `fontFamily`
- `useColorScheme()`
- Any colour name that isn't purple / violet / fuchsia / indigo / rose / slate

A lint rule catches the first two:

```js
'no-restricted-syntax': ['error',
  { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: 'Colours come from theme/tokens.js, never a literal.' }],
```

---

## 9. Parity check

Before closing a screen, put the phone next to the browser on the same account
and compare:

- [ ] Background is slate-50, not white
- [ ] Field labels are 11px uppercase bold with letter spacing
- [ ] Cards are 16-radius with a hairline slate-100 border and a barely-there
      shadow
- [ ] Every badge is a pill with a coloured dot and a **word**
- [ ] The only red on screen is an error, a destructive action, lateness or a
      deduction
- [ ] Numbers are tabular and don't jitter
- [ ] Nothing is pure black (`#000`) — text bottoms out at slate-900

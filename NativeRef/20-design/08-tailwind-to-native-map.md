# 08 · Tailwind → native lookup

A mechanical translation table for porting a web screen. Find the class, use the
value. Where a class has **no native meaning**, that's stated — silently dropping
those is the main risk when porting Tailwind by eye.

All values assume `import { color, space, radius, text, elevate } from '@/theme/tokens'`.

---

## Colour

| Tailwind | Native |
|---|---|
| `bg-white` | `backgroundColor: color.surface` |
| `bg-slate-50` | `backgroundColor: color.bg` |
| `bg-slate-50/70`, `bg-slate-50/80` | `backgroundColor: color.surfaceSubtle` |
| `bg-slate-100/70` | `backgroundColor: palette.slate[100]` (skeletons) |
| `bg-purple-50` | `backgroundColor: color.brandSoftBg` |
| `bg-purple-600` | `backgroundColor: color.brand` |
| `bg-violet-50` | `backgroundColor: color.success.bg` |
| `bg-fuchsia-50` | `backgroundColor: color.pending.bg` |
| `bg-indigo-50` | `backgroundColor: color.info.bg` |
| `bg-rose-50` | `backgroundColor: color.danger.bg` |
| `text-slate-900` | `color: color.textPrimary` |
| `text-slate-800` | `color: color.textBody` |
| `text-slate-600` | `color: color.textSecondary` (labels) |
| `text-slate-500` | `color: color.textSecondary` |
| `text-slate-400` | `color: color.textMuted` (N/A, placeholders) |
| `text-purple-600` / `-700` | `color: color.brand` / `color.brandSoftFg` |
| `text-violet-700` | `color: color.success.fg` |
| `text-fuchsia-700` | `color: color.pending.fg` |
| `text-indigo-700` / `-800` | `color: color.info.fg` |
| `text-rose-600` / `-700` | `color: color.danger.fg` |
| `border-slate-200` | `borderColor: color.border` |
| `border-slate-100`, `border-slate-200/60`, `/80` | `borderColor: color.borderSubtle` |
| `divide-y divide-slate-100` | **No equivalent.** Put `borderBottomWidth: 1, borderBottomColor: color.borderSubtle` on each row, or use `ItemSeparatorComponent` |
| `bg-gradient-to-r from-… via-… to-…` | `react-native-linear-gradient` with `colors={[heroFrom, heroVia, heroTo]}`, `start={{x:0,y:0}} end={{x:1,y:0}}` |
| `bg-[radial-gradient(…)]` | **No equivalent.** Use a `react-native-svg` `RadialGradient`, or drop the flourish |
| `bg-slate-900/40` | `backgroundColor: 'rgba(15,23,42,0.4)'` (sheet backdrop) |
| `backdrop-blur-sm` | **No equivalent in core RN.** `@react-native-community/blur`, or drop it. The sheet backdrop reads fine without it |

---

## Spacing

Tailwind's scale is `n × 4px`, so the arithmetic is mechanical.

| Tailwind | Native |
|---|---|
| `p-1` `p-2` `p-3` `p-4` `p-5` `p-6` `p-8` | `padding: 4 / 8 / 12 / 16 / 20 / 24 / 32` |
| `px-3.5` | `paddingHorizontal: 14` |
| `py-2.5` | `paddingVertical: 10` |
| `gap-2` / `gap-3` / `gap-4` | `gap: 8 / 12 / 16` (RN 0.71+ supports `gap`) |
| `gap-x-6 gap-y-4` | `columnGap: 24, rowGap: 16` |
| `space-y-6` | `gap: 24` on the parent (**not** a margin on each child) |
| `-mb-6` | `marginBottom: -24` |
| `mt-0.5` | `marginTop: 2` |
| `mb-1.5` | `marginBottom: 6` |

> **Web `p-6` on a card becomes `space[4]` (16) on a phone**, per
> [05-mobile-adaptations.md](05-mobile-adaptations.md) § Density. Translate the
> *intent*, not the number, for card and screen padding.

---

## Layout — the big differences

| Tailwind | Native |
|---|---|
| `flex` | `flexDirection: 'column'` — **RN's default is column, web's is row** |
| `flex-row` | `flexDirection: 'row'` |
| `flex-col` | `flexDirection: 'column'` (the default — usually omit) |
| `items-center` | `alignItems: 'center'` |
| `justify-between` | `justifyContent: 'space-between'` |
| `flex-1` | `flex: 1` |
| `shrink-0` | `flexShrink: 0` |
| `min-w-0` | `minWidth: 0` — **still needed** so text truncates instead of pushing siblings |
| `grid grid-cols-2 gap-4` | `flexDirection:'row', flexWrap:'wrap', gap:16` + `width:'48%'` on children. **There is no grid in RN** |
| `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` | Two columns, full stop. See `SheetGrid` |
| `sm:col-span-2` | `width: '100%'` on that child |
| `relative` / `absolute` | `position: 'relative' / 'absolute'` (relative is the default) |
| `inset-0` | `position:'absolute', top:0, right:0, bottom:0, left:0` |
| `overflow-hidden` | `overflow: 'hidden'` — **required** for a rounded container to clip children on Android |
| `overflow-x-auto` | `<ScrollView horizontal>` |
| `truncate` | `numberOfLines={1}` on the `<Text>` |
| `break-words` | `flexShrink: 1` + `minWidth: 0` on the parent |
| `whitespace-pre-wrap` | Default `<Text>` behaviour — just don't set `numberOfLines` |
| `whitespace-nowrap` | `numberOfLines={1}` |
| `max-w-7xl mx-auto` | **Nothing.** Full width with a 16px gutter |
| `w-full` | `width: '100%'` or `alignSelf: 'stretch'` |
| `h-10` / `h-12` | `height: 40 / 48` |
| `w-8 h-8` | `width: 32, height: 32` |
| `aspect-square` | Set both dimensions, or `aspectRatio: 1` |
| `z-[140]` | See `theme.layer`. On RN, `zIndex` works within a parent only — **ordering in the tree matters more** |

---

## Typography

| Tailwind | Native |
|---|---|
| `text-2xl font-bold` | `text.h1` |
| `text-lg font-bold` | `text.h2` |
| `text-sm font-bold` | `text.h3` / `text.bodyStrong` |
| `text-sm` | `text.body` |
| `text-xs` | `text.small` |
| `text-xs font-bold uppercase tracking-wider` | **`text.label`** — the signature |
| `text-[10px] font-bold` | `text.badge` |
| `text-[11px] font-medium` | `text.caption` |
| `font-black` | `fontFamily: font.extrabold` (there is no 900 weight shipped) |
| `font-semibold` | `fontFamily: font.semibold` |
| `tabular-nums` | `fontVariant: ['tabular-nums']` |
| `leading-relaxed` | `lineHeight:` ~1.55 × fontSize, explicitly |
| `leading-tight` | `lineHeight:` ~1.2 × fontSize |
| `tracking-wide` / `tracking-wider` | `letterSpacing: 0.3 / 0.6` |
| `text-center` / `text-right` | `textAlign: 'center' / 'right'` |
| `underline` | `textDecorationLine: 'underline'` |

**Always set `fontFamily`.** `fontWeight` alone silently falls back to Roboto on
Android.

---

## Borders and radius

| Tailwind | Native |
|---|---|
| `border` | `borderWidth: 1` |
| `border-2` | `borderWidth: 2` |
| `border-b` | `borderBottomWidth: 1` |
| `border-l` | `borderLeftWidth: 1` |
| `rounded-lg` | `borderRadius: radius.sm` (8) |
| `rounded-xl` | `borderRadius: radius.md` (12) |
| `rounded-2xl` | `borderRadius: radius.lg` (16) |
| `rounded-3xl` | `borderRadius: radius.xl` (24) |
| `rounded-full` | `borderRadius: radius.full` (999) |
| `rounded-t-2xl` | `borderTopLeftRadius: 16, borderTopRightRadius: 16` |
| `ring-2 ring-purple-500` | **No equivalent.** Use `borderWidth` + `borderColor`, or the OS focus indicator |
| `outline-none` | **Nothing** — RN has no outline |

A rounded container needs **`overflow: 'hidden'`** to clip its children on
Android. Without it, a square-cornered header pokes a hairline past the radius —
the same bug the web `DetailDialog` guards against.

---

## Shadows

| Tailwind | Native |
|---|---|
| `shadow-2xs` | `...elevate('xs')` |
| `shadow-xs`, `shadow-sm` | `...elevate('sm')` |
| `shadow-md`, `shadow-lg` | `...elevate('md')` |
| `shadow-xl`, `shadow-2xl` | `...elevate('lg')` |
| `drop-shadow-2xl` (on an image) | `...elevate('md')` on the wrapper |

Android needs a **`backgroundColor` on the same view** as `elevation`, or nothing
renders.

---

## Interaction — these all vanish

| Tailwind | Native |
|---|---|
| `hover:*` | **Nothing.** Touch has no hover. Move it to the pressed state |
| `focus:*` | `accessibilityState` + the OS indicator. Don't draw your own ring |
| `active:scale-[0.98]` | `pressed` style on `Pressable`, or a Reanimated `scale` |
| `cursor-pointer` | **Nothing** |
| `transition`, `duration-200`, `ease-out` | Reanimated / `Animated`. See [04-motion.md](04-motion.md) |
| `group-hover:*` | **Nothing** |
| `disabled:opacity-60` | `style={[s.btn, disabled && { opacity: 0.6 }]}` |
| `motion-reduce:*` | `useReducedMotion()` in JS |
| `peer-*`, `[&:nth-child(odd)]` | **Nothing.** Compute from the `index` in `renderItem` |
| `select-none` | **Nothing** — RN `<Text>` isn't selectable unless you ask |

---

## Responsive prefixes — all of them go

| Tailwind | Native |
|---|---|
| `sm:` `md:` `lg:` `xl:` | **Nothing.** One layout, phone-first |
| `hidden sm:block` | Render it, or don't |
| `sm:flex-row` | Pick one direction |

If you genuinely need a tablet layout later, branch on
`useWindowDimensions().width`, in one place, and name the breakpoint in
`theme/tokens.js`. Don't scatter width checks.

---

## Classes with no native meaning — check each one when porting

Seeing any of these in a web file means **a decision is needed**, not a
translation:

`hover:*` · `focus:*` · `focus-visible:*` · `group*` · `peer*` · `sm:`/`md:`/`lg:` ·
`grid*` · `col-span-*` · `divide-*` · `space-y-*` (becomes parent `gap`) ·
`max-w-*` · `mx-auto` · `backdrop-*` · `ring-*` · `outline-*` · `cursor-*` ·
`select-*` · `sr-only` (becomes `accessibilityLabel`) · `animate-*` ·
`transition-*` · `aspect-*` · `truncate` (becomes a prop) · `tabular-nums`
(becomes `fontVariant`) · `line-clamp-*` (becomes `numberOfLines`) ·
`sticky`/`fixed` (becomes a pinned footer or a stack header) ·
`overflow-x-auto` (becomes a horizontal `ScrollView`) · `pointer-events-none`
(becomes `pointerEvents="none"`).

---

## Worked example

The web attendance row:

```jsx
<tr {...rowPreviewProps(() => setSelected(row), "Day details")}>
  <td className="px-6 py-4">
    <p className="text-xs font-bold text-slate-800">{fmtDate(row.date)}</p>
    <p className="text-[10px] text-slate-400 font-medium">{fmtTime(row.clock_in_time)}</p>
  </td>
  <td className="px-6 py-4 text-right">
    <span className="text-xs font-bold text-slate-800 tabular-nums">{workedLabel(row)}</span>
  </td>
  <td className="px-6 py-4"><StatusBadge kind="record" status={row.status} /></td>
</tr>
```

becomes:

```jsx
<Row
  onPress={() => setSelected(row)}
  accessibilityLabel="Day details"
  title={fmtDate(row.date)}
  subtitle={`${fmtTime(row.clock_in_time)} – ${fmtTime(row.clock_out_time)}`}
  value={workedLabel(row)}
  badge={<StatusBadge kind="record" status={row.status} />}
/>
```

`Row` already carries the padding, the press feedback, the tabular value, the
truncation and the accessibility wiring — which is the point of having it. The
**logic** (`fmtDate`, `workedLabel`, `StatusBadge`, `rowPreviewProps`' intent)
is identical, because all of it came from `lib/`.

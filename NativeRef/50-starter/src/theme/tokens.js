// ─────────────────────────────────────────────────────────────────────────────
// theme/tokens.js — the ONLY file in the app that holds a colour, a size, a
// radius, a shadow or a type style.
//
// Values are the exact Tailwind 3.4 colours the web app renders (read out of
// node_modules/tailwindcss/colors), so the two products look identical side by
// side. PURPLE ONLY: violet = success, fuchsia = pending, indigo = info,
// purple = brand, rose = errors/destructive/lateness/deductions, slate =
// chrome. Never add a green, amber, orange or blue value here — the web app
// mapped every one of those away on purpose (CLAUDE.md §5).
//
// Dark mode is deliberately NOT supported in v1: the web app has no dark
// theme, and a half-themed native app is worse than a light-only one. iOS locks
// it with UIUserInterfaceStyle=Light, Android with forceDarkAllowed=false.
// When it is wanted, it is a change to the `color` roles in this file and
// nothing else — which is why no component may hold a hex value.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';

/* ─── Palette ─────────────────────────────────────────────────────────────── */

export const palette = {
  purple: {
    50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc',
    500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87',
    950: '#3b0764',
  },
  violet: {
    50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa',
    500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95',
  },
  fuchsia: {
    50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9',
    500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75',
  },
  indigo: {
    50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
    500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
  },
  rose: {
    50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185',
    500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337',
  },
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
    500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
  },
  white: '#ffffff',
};

/* ─── Semantic roles — use THESE, not the ramps ───────────────────────────── */

export const color = {
  // surfaces
  bg: palette.slate[50], // the app background. Never pure white
  surface: palette.white,
  surfaceSubtle: '#f8fafc', // slate-50 — section headers, read-only fields
  border: palette.slate[200],
  borderSubtle: palette.slate[100],
  backdrop: 'rgba(15,23,42,0.4)', // sheet / modal scrim

  // text
  textPrimary: palette.slate[900],
  textBody: palette.slate[800],
  textSecondary: palette.slate[500],
  // 2.9:1 on white — MUTED TEXT ONLY ("N/A", placeholders, captions), never
  // for anything load-bearing. See 20-design/06-accessibility.md.
  textMuted: palette.slate[400],
  textLabel: palette.slate[600], // 7:1 — the 11px uppercase field labels
  textOnBrand: palette.white,

  // brand
  brand: palette.purple[600],
  brandPressed: palette.purple[700],
  brandSoftBg: palette.purple[50],
  brandSoftFg: palette.purple[700],
  brandSoftBorder: palette.purple[200],
  // the press feedback that replaces web's hover:bg-purple-50/40
  pressTint: 'rgba(250,245,255,0.6)',

  // the hero gradient — exact web values from PageHeader.jsx
  heroFrom: '#5B21B6', // violet-800
  heroVia: '#6328D7', // custom
  heroTo: '#4C1D95', // violet-900
  heroSubtitle: palette.purple[100],
  heroBadgeIcon: palette.purple[200],
  heroBadgeBg: 'rgba(255,255,255,0.10)',
  heroBadgeBorder: 'rgba(255,255,255,0.20)',

  // semantic tones — bg / fg / border for a badge, plus the dot
  success: { bg: palette.violet[50], fg: palette.violet[700], border: palette.violet[200], dot: palette.violet[500] },
  pending: { bg: palette.fuchsia[50], fg: palette.fuchsia[700], border: palette.fuchsia[200], dot: palette.fuchsia[500] },
  info: { bg: palette.indigo[50], fg: palette.indigo[800], border: palette.indigo[200], dot: palette.indigo[500] },
  brandTone: { bg: palette.purple[50], fg: palette.purple[700], border: palette.purple[200], dot: palette.purple[500] },
  danger: { bg: palette.rose[50], fg: palette.rose[700], border: palette.rose[200], dot: palette.rose[500] },
  neutral: { bg: palette.slate[50], fg: palette.slate[600], border: palette.slate[200], dot: palette.slate[300] },
};

/* ─── Tone keys ───────────────────────────────────────────────────────────────
   The web app's semantic tone names, kept EXACTLY as they are so a tone map
   ported from a web file keeps working. They are historic colour names that
   now render purple — `emerald` is violet, `amber` is fuchsia, `blue` is
   indigo. Only `rose` is still red. Don't rename them. (CLAUDE.md §5) */

export const tone = {
  emerald: color.success,
  amber: color.pending,
  blue: color.info,
  purple: color.brandTone,
  rose: color.danger,
  slate: color.neutral,
  indigo: { bg: palette.indigo[100], fg: palette.indigo[800], border: palette.indigo[300], dot: palette.indigo[700] },
  orange: { bg: palette.fuchsia[100], fg: palette.fuchsia[800], border: palette.fuchsia[300], dot: palette.fuchsia[700] },
  sky: { bg: palette.white, fg: palette.indigo[600], border: palette.indigo[300], dot: palette.indigo[300] },
};

export const toneOf = (key) => tone[key] || tone.slate;

/* ─── Charts ──────────────────────────────────────────────────────────────────
   Validated as a SET: lightness band, chroma floor, and colour-blind
   separation between neighbouring pairs. Do not add a fifth slice —
   `late_days` overlaps `present_days` and must never appear in a total-days
   chart. */

export const chart = {
  mix: [
    { key: 'present', label: 'Present', field: 'present_days', color: '#6D28D9' }, // violet-700
    { key: 'half', label: 'Half day', field: 'half_days', color: '#A78BFA' }, // violet-400
    { key: 'leave', label: 'On leave', field: 'on_leave_days', color: '#C026D3' }, // fuchsia-600
    { key: 'absent', label: 'Absent', field: 'absent_days', color: '#E11D48' }, // rose-600
  ],
  hoursBar: '#7C3AED', // violet-600
  trend: { present: '#7C3AED', on_leave: '#A78BFA', absent: '#C026D3' },
  grid: palette.slate[100],
  axisTick: { color: palette.slate[400], fontSize: 10, fontWeight: '600' },
};

/* ─── Calendar heat ───────────────────────────────────────────────────────────
   The attendance calendar's cell fill, one per day chip (lib/dayStatus.js's
   DAY_CHIPS keys). A nine-step purple ramp with slate for the non-working
   states — the one place in the app that needs this many steps, which is why
   it lives here and not in `tone`. Ported from the web `heat` classes. */

export const calendarHeat = {
  present: { bg: palette.purple[700], border: palette.purple[700], fg: palette.white },
  late: { bg: palette.purple[400], border: palette.purple[400], fg: palette.white },
  half_day: { bg: palette.purple[300], border: palette.purple[300], fg: palette.purple[950] },
  on_leave: { bg: palette.violet[200], border: palette.violet[300], fg: palette.violet[900] },
  absent: { bg: palette.purple[950], border: palette.purple[950], fg: palette.white },
  holiday: { bg: palette.purple[100], border: palette.purple[300], fg: palette.purple[700] },
  weekly_off: { bg: palette.slate[200], border: palette.slate[200], fg: palette.slate[600] },
  no_data: { bg: palette.slate[700], border: palette.slate[700], fg: palette.slate[100] },
  upcoming: { bg: palette.slate[50], border: palette.slate[200], fg: palette.slate[400] },
};

export const heatOf = (chipKey) => calendarHeat[chipKey] || calendarHeat.upcoming;

/* ─── Type ────────────────────────────────────────────────────────────────────
   PostScript names, not file names. Verify these on a device before building
   on them — a wrong family name renders in the system font with no error.
   ALWAYS set fontFamily; fontWeight alone falls back to Roboto on Android. */

export const font = {
  regular: 'Manrope-Regular',
  medium: 'Manrope-Medium',
  semibold: 'Manrope-SemiBold',
  bold: 'Manrope-Bold',
  extrabold: 'Manrope-ExtraBold',
};

const TABULAR = ['tabular-nums'];

export const text = {
  h1: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, color: color.textPrimary },
  h2: { fontFamily: font.bold, fontSize: 18, lineHeight: 24, color: color.textPrimary },
  h3: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.textBody },

  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.textBody },
  bodyStrong: { fontFamily: font.bold, fontSize: 14, lineHeight: 20, color: color.textPrimary },

  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.textSecondary },
  smallStrong: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.textBody },

  // The app's signature. 11px uppercase bold with letter spacing, on every
  // field label, every tile caption, every table header.
  label: {
    fontFamily: font.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.textLabel,
  },

  caption: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: color.textMuted },
  badge: { fontFamily: font.bold, fontSize: 10, lineHeight: 12, letterSpacing: 0.3 },

  // tabular-nums on every number that CHANGES, or the digits jitter as it ticks
  metric: { fontFamily: font.extrabold, fontSize: 22, lineHeight: 26, fontVariant: TABULAR, color: color.textPrimary },
  metricLg: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 36, fontVariant: TABULAR, color: color.textPrimary },
  mono: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, fontVariant: TABULAR, color: color.textBody },
};

/* ─── Space · radius · hit area ───────────────────────────────────────────── */

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

export const gutter = space[4]; // 16 — the screen side gutter, everywhere

export const radius = {
  sm: 8, // pills, small chips           (web rounded-lg)
  md: 12, // inputs, read-only fields     (web rounded-xl)
  lg: 16, // cards, sections, sheets      (web rounded-2xl)
  xl: 24, // hero header, big cards       (web rounded-3xl)
  full: 999,
};

export const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };
export const MIN_TAP = 44;

/**
 * Icon sizes. The web app draws every `react-icons/hi` glyph at one of three
 * sizes; these are those three plus the two a phone needs. Pass `iconSize.md`
 * to a glyph from theme/icons.js — never a literal in a screen, or the set
 * drifts a pixel at a time.
 *
 * `info` is the ⓘ and is deliberately the SMALLEST: field help sits beside a
 * label and must not out-weigh it (see ui/FieldHelp.jsx).
 */
export const iconSize = {
  info: 14, // the ⓘ, inline notes
  sm: 16, // inside a chip, a pill, a dense row
  md: 20, // the default — rows, buttons, section headers (web's 20×20)
  lg: 24, // tab bar, empty states
  xl: 32, // the punch button, a hero tile
};

/* ─── Elevation ───────────────────────────────────────────────────────────────
   The web app's shadows are extremely soft (shadow-xs / shadow-2xs). Resist
   making them heavier on native. Android needs a backgroundColor on the SAME
   view as `elevation`, or nothing renders — always set both. */

const shadow = {
  xs: {
    ios: { shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    android: { elevation: 1 },
  },
  sm: {
    ios: { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
  },
  md: {
    ios: { shadowColor: '#4c1d95', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 5 },
  },
  lg: {
    ios: { shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: -4 } },
    android: { elevation: 16 },
  },
};

export const elevate = (key = 'sm') => Platform.select(shadow[key] || shadow.sm);

/* ─── Layering ────────────────────────────────────────────────────────────────
   Mirrors the web z-scale so the rules in CLAUDE.md §3 still read true.
   Relative order matters more than the numbers. */

export const layer = {
  base: 0,
  sticky: 10,
  header: 20,
  sheet: 140,
  fieldHelp: 155,
  maya: 160,
  attachmentViewer: 165,
  reasonPrompt: 170,
  toast: 200,
};

/** The layer an ⓘ popover (or Maya) should use above a given host. */
export const popoverLayerFor = (hostLayer = 0) =>
  hostLayer > 150 ? hostLayer + 15 : layer.fieldHelp;

/* ─── Common composites ───────────────────────────────────────────────────── */

export const card = {
  backgroundColor: color.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: color.borderSubtle,
  ...elevate('sm'),
};

export const readOnlyField = {
  minHeight: 40,
  justifyContent: 'center',
  backgroundColor: color.surfaceSubtle,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: 14,
  paddingVertical: 8,
};

export default { palette, color, tone, toneOf, chart, font, text, space, gutter, radius, elevate, layer, card };

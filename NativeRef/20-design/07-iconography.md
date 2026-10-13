# 07 · Iconography

The web app uses **`react-icons/hi` only** — Heroicons v1, solid, 20×20. That
constraint exists so the icon set can't drift, and it carries over.

---

## The native equivalent

Heroicons v1 is available natively as **`react-native-heroicons`** (v1 solid /
outline), which is the closest possible match — same glyphs, same metrics.

```bash
npm i react-native-heroicons react-native-svg
```

```jsx
import { ClockIcon } from 'react-native-heroicons/solid';
```

If `react-native-heroicons` proves unmaintained at build time, the fallback is
**`react-native-vector-icons`** with the `Ionicons` set — but then every glyph
must be re-checked against the web app by eye, because the shapes differ. Prefer
Heroicons.

**Either way, you import icons in exactly one file.**

---

## One map, one import site

```js
// src/theme/icons.js — the ONLY file that imports from an icon package.
import {
  ClockIcon, CalendarIcon, CheckCircleIcon, ExclamationCircleIcon,
  InformationCircleIcon, LocationMarkerIcon, DocumentTextIcon, /* … */
} from 'react-native-heroicons/solid';

export const icons = {
  // status
  ok: CheckCircleIcon,
  warn: ExclamationCircleIcon,
  info: InformationCircleIcon,
  // time
  clock: ClockIcon,
  calendar: CalendarIcon,
  // …
};
```

Everything else does `import { icons } from '@/theme/icons'` and uses
`icons.clock`. That way:

- swapping the icon package is a one-file change;
- a screen can't reach for a glyph that isn't in the vocabulary;
- the semantic name documents intent — `icons.earnedLeave`, not `HiGift`.

---

## The map — web icon → semantic name

Ordered by how often the web employee surfaces use it, so the top of this table
is most of the app.

| Web (`react-icons/hi`) | Semantic name | Used for |
|---|---|---|
| `HiExclamationCircle` | `warn` | Errors, flags, absent, warnings |
| `HiCheckCircle` | `ok` | Success toasts, approved, present |
| `HiClock` | `clock` | Attendance, time, in progress, overtime |
| `HiCalendar` | `calendar` | Leave, dates, holidays |
| `HiLocationMarker` | `location` | Punch location, work site, geofence |
| `HiDocumentText` | `document` | A document, a payslip, a letter |
| `HiChevronRight` | `chevronRight` | Row affordance, drill-down |
| `HiChevronLeft` | `chevronLeft` | Month stepper back |
| `HiChevronDown` | `chevronDown` | Section fold, select |
| `HiRefresh` | `refresh` | Try again, reload |
| `HiInformationCircle` | `info` | **The ⓘ**, notices, footer notes |
| `HiOfficeBuilding` | `office` | Company documents, office location |
| `HiFolderOpen` | `folder` | My Documents |
| `HiPencil` / `HiPencilAlt` | `edit` | Edit, add a note |
| `HiCurrencyRupee` | `rupee` | Pay, salary, the Pay tab |
| `HiCash` | `cash` | Loans, amounts paid out |
| `HiSearch` | `search` | Search fields |
| `HiClipboardList` | `clipboard` | Corrections, document requests |
| `HiClipboardCheck` | `clipboardCheck` | Acknowledged, verified |
| `HiChartBar` | `chart` | Trends, graphs |
| `HiGift` | `earnedLeave` | **Earned Leave** (comp-off) |
| `HiDocumentReport` | `report` | Payslips, annual statement |
| `HiScale` | `tax` | Tax & Investments |
| `HiReceiptRefund` | `claims` | Claims & Benefits |
| `HiLightningBolt` | `overtime` | Overtime |
| `HiLibrary` | `company` | Company Profile, bank |
| `HiViewGrid` | `dashboard` | Home |
| `HiUserCircle` | `profile` | My Profile, the More tab's profile row |
| `HiUserGroup` / `HiUsers` | `people` | Directory, org chart |
| `HiShare` | `orgChart` | Org Chart (the web sidebar's choice) |
| `HiPlus` | `add` | Apply for leave, new claim |
| `HiTrash` | `delete` | Delete a document, remove a row |
| `HiUpload` / `HiCloudDownload` | `upload` / `download` | File transfer |
| `HiDocumentDownload` | `downloadDoc` | Download a payslip |
| `HiPaperClip` | `attachment` | Attachments |
| `HiEye` | `view` | **Only inside a sheet.** Never on a row (house rule §3) |
| `HiX` | `close` | Close a sheet or modal |
| `HiCheck` | `check` | Checkbox, confirm |
| `HiXCircle` | `reject` | Rejected, cancelled |
| `HiBadgeCheck` | `verified` | Verified document, signed |
| `HiShieldCheck` | `secure` | Security, biometric lock |
| `HiLockClosed` | `locked` | Period locked, confidential |
| `HiSwitchHorizontal` | `switch` | Switch organisation, regime |
| `HiTrendingUp` / `HiTrendingDown` | `up` / `down` | Increment, deduction |
| `HiArrowRight` / `HiArrowLeft` | `arrowRight` / `arrowLeft` | Navigation in copy |
| `HiExternalLink` | `external` | Opens the web app or a browser |
| `HiMail` | `mail` | Email, letters |
| `HiPhone` | `phone` | Phone number |
| `HiGlobeAlt` | `globe` | Website, timezone |
| `HiBriefcase` | `work` | Job profile, designation |
| `HiCog` | `settings` | Settings |
| `HiInboxIn` | `inbox` | Things needing action |
| `HiSparkles` | `maya` | **Ask Maya** |
| `HiFingerPrint` | `punch` | Clock in / out |
| `HiTemplate` | `forms` | Blank forms |
| `HiPause` | `break` | Break (web also uses `BiCoffeeTogo`) |
| `HiFlag` | `flag` | A flagged punch |
| `HiCalculator` | `calculator` | How a figure is worked out |
| `HiDocumentSearch` | `inspect` | Day log |
| `HiAdjustments` | `adjustments` | Loans & Variable Pay |
| `HiCollection` | `collection` | My Document Home |
| `HiCreditCard` | `card` | *(HR only — not in this app)* |

The two non-`hi` icons the web punch card uses (`BiCoffeeTogo`, `BiStopwatch`)
map to `icons.break` and `icons.clock`. Don't add a second icon package for two
glyphs.

---

## Sizes

```js
export const iconSize = {
  xs: 14,   // inline in a 13px line, inside a badge
  sm: 16,   // inside a button, beside a label — the default
  md: 20,   // row leading icon, section heading, tab bar
  lg: 24,   // sheet header, empty state
  xl: 32,   // the punch card's main glyph
};
```

Web `w-4 h-4` (16px) is the most common, and `w-5 h-5` (20px) for headers —
`sm` and `md` here.

---

## Colour

Icons inherit their context; they never carry colour of their own.

| Context | Colour |
|---|---|
| Beside body text | `color.textSecondary` |
| Section heading, row leading | `color.brand` (purple-600) |
| Inside a purple-50 square (sheet header, stat tile) | `color.brandSoftFg` (purple-700) |
| On the purple hero | `color.heroBadgeIcon` (purple-200) |
| In a status badge | the tone's `fg` |
| Error / destructive | `palette.rose[500]` |
| Muted / disabled | `color.textMuted` |

The container, not the glyph, carries the identity: a 36×36 `purple-50` rounded
square with a `purple-600` glyph is the app's signature icon treatment, used in
`RecordSheet` headers, `SheetStats` and the punch card's day strip.

---

## Rules

1. **One package, one import file.** `theme/icons.js` and nowhere else.
2. **Semantic names, not glyph names.** `icons.earnedLeave`, never `icons.gift`
   — when the term changes, the map changes, not forty screens.
3. **Solid, not outline.** The web app uses `react-icons/hi` solid throughout.
   Mixing weights is the fastest way to look unfinished. (`HiOutlineClock` and
   `HiOutlineOfficeBuilding` appear a handful of times on web; normalise those
   to solid rather than importing a second weight.)
4. **An icon never replaces a word on a status.** A badge is a dot plus a label.
   Colour-and-shape-only status fails accessibility and fails colour-blind users.
5. **Decorative icons are hidden from the screen reader**
   (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`).
   An icon beside a label it already describes is decorative.
6. **An icon-only button needs an `accessibilityLabel`.** Always. Close buttons,
   chevrons, the ⓘ.
7. **No emoji as UI.** The web app has `@twemoji/api` for the marketing site;
   the workspace uses icons.
8. **No new glyph without adding it to the map above.** If it isn't in the
   vocabulary, either it maps to something that is, or the vocabulary grows
   deliberately.

---

## Tab bar icons

The one place where active state changes the glyph weight:

| Tab | Inactive | Active |
|---|---|---|
| Home | `dashboard` outline | `dashboard` solid |
| Time | `clock` outline | `clock` solid |
| Leave | `calendar` outline | `calendar` solid |
| Pay | `rupee` outline | `rupee` solid |
| More | `dots` outline | `dots` solid |

This is the platform convention on both iOS and Android, and it's the exception
to rule 3 — import both weights **only** for these five.

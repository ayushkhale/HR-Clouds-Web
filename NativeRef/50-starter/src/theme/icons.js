// ─────────────────────────────────────────────────────────────────────────────
// theme/icons.js — THE ONLY FILE IN THE APP THAT IMPORTS AN ICON PACKAGE.
//
// The web app is locked to `react-icons/hi` — Heroicons v1, solid — so the icon
// set can't drift. That constraint carries over, and this file is how it is
// enforced: everything else does `import { icons } from '../theme/icons'` and
// uses `icons.clock`. Swapping the icon package then becomes a one-file change,
// a screen can't reach for a glyph that isn't in the vocabulary, and the
// semantic name documents intent — `icons.earnedLeave`, not `HiGift`.
//
// ── THE ONE THING TO KNOW BEFORE YOU DEBUG A MISSING ICON ────────────────────
//
// `react-native-heroicons` changed glyph sets between major versions:
//   • v2.x of the package ships Heroicons **v1** — LocationMarkerIcon,
//     ViewGridIcon, CurrencyRupeeIcon, LightningBoltIcon, …
//   • v3.x+ ships Heroicons **v2**, which RENAMED about a dozen of them —
//     MapPinIcon, Squares2X2Icon, BoltIcon, … and DELETED a few outright
//     (there is no CurrencyRupeeIcon in v2; `rupee` falls back to a glyph that
//     exists, and the Pay tab uses the ₹ character in text anyway).
//
// So each entry below is resolved by trying the v1 name first and the v2 name
// second. That keeps the app rendering on whichever version npm installed, and
// the dev-only report at the bottom names anything that resolved to nothing
// instead of letting a blank square ship. Do NOT "simplify" this into direct
// named imports until the package version is pinned in package.json and you
// have checked every glyph by eye — a named import of a missing export is
// `undefined`, and `<undefined />` is a red screen, not a blank square.
//
// Heroicons v1 is 20×20 solid. Sizes come from theme/tokens.js (`iconSize`),
// never from a literal in a screen.
// ─────────────────────────────────────────────────────────────────────────────

import * as Solid from 'react-native-heroicons/solid';
import * as Outline from 'react-native-heroicons/outline';

/** First export that actually exists, or null. */
function pick(set, ...names) {
  for (const n of names) {
    if (set[n]) return set[n];
  }
  return null;
}

const s = (...names) => pick(Solid, ...names);
const o = (...names) => pick(Outline, ...names);

/* ─── The vocabulary ──────────────────────────────────────────────────────────
   Grouped the way the app is, not alphabetically — status first, because that
   is most of what an HR app draws. Each line is: semantic name, v1 export,
   v2 export (where they differ). */

export const icons = {
  // ── Status ────────────────────────────────────────────────────────────────
  ok: s('CheckCircleIcon'),
  warn: s('ExclamationCircleIcon'),
  /** THE ⓘ. Also notices and footer notes. */
  info: s('InformationCircleIcon'),
  reject: s('XCircleIcon'),
  check: s('CheckIcon'),
  verified: s('BadgeCheckIcon', 'CheckBadgeIcon'),
  locked: s('LockClosedIcon'),
  secure: s('ShieldCheckIcon'),

  // ── Time and attendance ───────────────────────────────────────────────────
  clock: s('ClockIcon'),
  calendar: s('CalendarIcon', 'CalendarDaysIcon'),
  /** Clock in / clock out. */
  punch: s('FingerPrintIcon'),
  location: s('LocationMarkerIcon', 'MapPinIcon'),
  overtime: s('LightningBoltIcon', 'BoltIcon'),
  /** Earned Leave (comp-off). Never say "comp-off" in the UI — §6. */
  earnedLeave: s('GiftIcon'),

  // ── Pay ───────────────────────────────────────────────────────────────────
  rupee: s('CurrencyRupeeIcon', 'CurrencyDollarIcon', 'BanknotesIcon'),
  cash: s('CashIcon', 'BanknotesIcon'),
  tax: s('ScaleIcon'),
  claims: s('ReceiptRefundIcon'),
  report: s('DocumentReportIcon', 'DocumentChartBarIcon'),
  chart: s('ChartBarIcon'),
  up: s('TrendingUpIcon', 'ArrowTrendingUpIcon'),
  down: s('TrendingDownIcon', 'ArrowTrendingDownIcon'),

  // ── Documents ─────────────────────────────────────────────────────────────
  document: s('DocumentTextIcon'),
  folder: s('FolderOpenIcon'),
  clipboard: s('ClipboardListIcon', 'ClipboardDocumentListIcon'),
  clipboardCheck: s('ClipboardCheckIcon', 'ClipboardDocumentCheckIcon'),
  attachment: s('PaperClipIcon'),
  upload: s('UploadIcon', 'ArrowUpTrayIcon'),
  download: s('CloudDownloadIcon', 'ArrowDownTrayIcon'),
  downloadDoc: s('DocumentDownloadIcon', 'ArrowDownTrayIcon'),
  /** ONLY inside a sheet. Never on a row — house rule §3. */
  view: s('EyeIcon'),

  // ── People and org ────────────────────────────────────────────────────────
  profile: s('UserCircleIcon'),
  people: s('UserGroupIcon', 'UsersIcon'),
  orgChart: s('ShareIcon'),
  office: s('OfficeBuildingIcon', 'BuildingOfficeIcon'),
  company: s('LibraryIcon', 'BuildingLibraryIcon'),
  work: s('BriefcaseIcon'),

  // ── Navigation and chrome ─────────────────────────────────────────────────
  dashboard: s('ViewGridIcon', 'Squares2X2Icon'),
  inbox: s('InboxInIcon', 'InboxArrowDownIcon'),
  chevronRight: s('ChevronRightIcon'),
  chevronLeft: s('ChevronLeftIcon'),
  chevronDown: s('ChevronDownIcon'),
  chevronUp: s('ChevronUpIcon'),
  arrowRight: s('ArrowRightIcon'),
  arrowLeft: s('ArrowLeftIcon'),
  close: s('XIcon', 'XMarkIcon'),
  search: s('SearchIcon', 'MagnifyingGlassIcon'),
  refresh: s('RefreshIcon', 'ArrowPathIcon'),
  add: s('PlusIcon'),
  edit: s('PencilAltIcon', 'PencilSquareIcon'),
  delete: s('TrashIcon'),
  settings: s('CogIcon', 'Cog6ToothIcon'),
  switch: s('SwitchHorizontalIcon', 'ArrowsRightLeftIcon'),
  external: s('ExternalLinkIcon', 'ArrowTopRightOnSquareIcon'),
  menu: s('DotsVerticalIcon', 'EllipsisVerticalIcon'),

  // ── Contact ───────────────────────────────────────────────────────────────
  mail: s('MailIcon', 'EnvelopeIcon'),
  phone: s('PhoneIcon'),
  globe: s('GlobeAltIcon'),

  // ── Ask Maya ──────────────────────────────────────────────────────────────
  maya: s('SparklesIcon'),
};

/**
 * Outline variants — the FIVE places the app wants them, and no more.
 *
 * The web app is solid-only. Outline exists here for the one native pattern
 * the web has no equivalent of: a bottom tab bar, where the inactive tab is
 * outline and the active one solid. That is the platform convention on both
 * iOS and Android, and copying the web's all-solid bar makes the active tab
 * read as merely "a different colour" rather than selected.
 */
export const tabIcons = {
  dashboard: { active: icons.dashboard, inactive: o('ViewGridIcon', 'Squares2X2Icon') },
  clock: { active: icons.clock, inactive: o('ClockIcon') },
  calendar: { active: icons.calendar, inactive: o('CalendarIcon', 'CalendarDaysIcon') },
  rupee: {
    active: icons.rupee,
    inactive: o('CurrencyRupeeIcon', 'CurrencyDollarIcon', 'BanknotesIcon'),
  },
  menu: { active: icons.menu, inactive: o('DotsVerticalIcon', 'EllipsisVerticalIcon') },
};

/* ─── Dev-only report ─────────────────────────────────────────────────────────
   Same habit as the field-help validator: a mistake here is silent at runtime
   (a missing glyph is an empty gap, and nobody files a bug about a gap), so it
   is named in the console the first time the module loads in development. */

if (__DEV__) {
  const missing = Object.keys(icons).filter((k) => !icons[k]);
  if (missing.length) {
    console.warn(
      `[icons] ${missing.length} semantic icon(s) resolved to nothing: ${missing.join(', ')}.\n`
      + 'Your react-native-heroicons version ships a glyph set these names are not in. '
      + 'Add the correct export name to the pick() list in theme/icons.js — do not '
      + 'render an undefined component, and do not leave the gap.',
    );
  }
}

/**
 * Resolve a semantic name to a component, with the fallback the app can always
 * draw. Use this in a data-driven renderer (a nav list, a tile grid) where the
 * name comes from a config and a typo must not crash a screen.
 */
export const iconFor = (name, fallback = icons.info) => icons[name] || fallback;

export default icons;

// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsMeta.js — What the settings catalogue MEANS on screen, and
// where each thing is actually changed.
//
// Contract: public/ref docs/md_settings/ (combined_api_analysis.md, and the
// frontend brief frontend_settings_ui_ux_architecture.md).
//
// Phase 1 is READ-ONLY, and that decides the shape of this whole screen. The
// hub can show every setting and what it is set to; it cannot save one,
// because the write plane is Phase 2 and isn't deployed. A read-only settings
// page that just says "ask someone else" would be a dead end, so the one piece
// of knowledge this file adds to the server's catalogue is **where each group
// is editable today** — the module screens that already own these values and
// are staying put (the brief's §1.4: the hub must not replace them).
//
// So EDIT_ROUTES is the bridge between the catalogue's `store` / `group.key`
// and the screens we already ship. It is keyed most-specific-first: an exact
// group key wins over its store, which wins over its module. A group with no
// entry gets no link rather than a wrong one — §2's rule about never showing a
// control that leads nowhere applies to links as much as to buttons.
//
// Everything else here is labels. The catalogue sends `label` for each group
// and setting, so this file does NOT restate them — restating them is how the
// two drift. It supplies only what the catalogue has no opinion about: which
// master tab a module belongs to, how to print a value that arrives as a bare
// JSON scalar (§4: no raw enum, §5: never a dash, §6: plain words), the
// one-line "what does this control?" blurbs the catalogue has no field for
// (MODULE_BLURB / GROUP_BLURB / SURFACE_BLURB; the per-SETTING lines are a
// file of their own, settingsBlurbs.js, because there are 138 of them), and
// which shape of control a setting's type and range earn it
// (`segmentedOptions`, `isDayOfMonth`, `unitAffix`, `isSwitchControl`,
// `fieldSpan`) — all decided from the
// catalogue, never from a list of keys, so a setting the backend adds still
// renders properly, in the right size, with no edit here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiAdjustments, HiArchive, HiBadgeCheck, HiBell, HiCalculator, HiCalendar, HiCash,
  HiClipboardCheck, HiClock, HiCreditCard, HiDatabase, HiDocumentDownload, HiDocumentText,
  HiGift, HiHeart, HiInboxIn, HiLightningBolt, HiLocationMarker, HiLogout, HiMail,
  HiOfficeBuilding, HiPaperAirplane, HiReceiptRefund, HiReceiptTax, HiRefresh, HiScale,
  HiShieldCheck, HiUserGroup,
} from "react-icons/hi";
import { humanize } from "../attendance/enums";
import { enumLabel, settingLabel } from "./settingsBlurbs";
import { formatMoney } from "../utils/formatUtils";
import { addDaysYMD, fmtDate, toLocalYMD } from "../attendance/dates";

/* ─── The five master tabs ─────────────────────────────────────────────────
   The brief's information architecture. `module_key` comes from the catalogue;
   these are the human names and the order they read in. Anything the server
   sends under a module we don't know about still renders — in its own tab,
   named from the key — because a catalogue that grows must not lose settings
   behind a hardcoded list. */
export const MODULE_TABS = [
  { key: "organization", label: "Company & Billing" },
  { key: "payroll", label: "Payroll" },
  { key: "document", label: "Documents & Branding" },
  { key: "attendance", label: "Attendance & Shifts" },
  { key: "leave", label: "Leave & Holidays" },
];

const MODULE_LABEL = Object.fromEntries(MODULE_TABS.map((m) => [m.key, m.label]));

export const moduleLabel = (key) => MODULE_LABEL[key] || humanize(key) || "Other";

/* One icon per module, for the section rail. They are the same icons these
   areas already carry in the sidebar, so the rail reads as the product's own
   map rather than a second vocabulary. A module we don't know about gets the
   generic one rather than nothing, so an unknown tab still looks deliberate. */
const MODULE_ICONS = {
  organization: HiOfficeBuilding,
  payroll: HiCash,
  document: HiDocumentText,
  attendance: HiClock,
  leave: HiCalendar,
};

export const moduleIcon = (key) => MODULE_ICONS[key] || HiAdjustments;

/* One icon per GROUP, for the card headers. Eleven payroll cards all wearing
   the module's coin made the tab read as one undifferentiated wall — the icon
   stopped being a way to find a card and became decoration. These are the
   same icons each subject already carries elsewhere in the product (exits is
   the sidebar's exit icon, letters the mail one), and a group we don't know
   falls back to its module's, so an added group still looks deliberate. */
const GROUP_ICONS = {
  "payroll.calendar": HiCalendar,
  "payroll.engine": HiCalculator,
  "payroll.authority": HiUserGroup,
  "payroll.loans": HiAdjustments,
  "payroll.tax_admin": HiScale,
  "payroll.reimbursements": HiReceiptRefund,
  "payroll.benefits": HiGift,
  "payroll.payslips": HiDocumentDownload,
  "payroll.exits": HiLogout,
  "payroll.automation": HiLightningBolt,
  "payroll.deprecated": HiArchive,

  "statutory.pf": HiShieldCheck,
  "statutory.esi": HiHeart,
  "statutory.pt": HiLocationMarker,
  "statutory.income_tax": HiReceiptTax,

  "documents.authority": HiShieldCheck,
  "documents.storage": HiDatabase,
  "documents.retention": HiClock,
  "documents.lifecycle": HiRefresh,
  "documents.acknowledgement": HiClipboardCheck,
  "documents.notifications": HiBell,
  "documents.requests": HiInboxIn,
  "documents.publishing": HiPaperAirplane,
  "documents.letters": HiMail,
  "documents.branding": HiBadgeCheck,

  "billing.notifications": HiCreditCard,
};

export const groupIcon = (group) =>
  (group && GROUP_ICONS[group.key]) || moduleIcon(group?.module_key);

/**
 * The tabs to show. Only modules that actually have something to show get a
 * tab — an empty tab is a dead end — and an unknown module is appended rather
 * than dropped.
 *
 * ALPHABETICAL BY LABEL (user decision, 2026-10-10), not the brief's
 * "importance" order. With five tabs on one line, importance is a ranking only
 * its author can see: everyone else is scanning for a word. Alphabetical means
 * the strip can be searched by eye, and it keeps its order when the catalogue
 * adds a module — the brief's order silently re-ranked everything each time.
 * `localeCompare` so an accented label still sorts where a reader expects.
 */
export function tabsFor(moduleKeys) {
  const present = new Set(moduleKeys.filter(Boolean));
  const known = MODULE_TABS.filter((tab) => present.has(tab.key));
  const extra = [...present]
    .filter((key) => !MODULE_LABEL[key])
    .map((key) => ({ key, label: moduleLabel(key) }));
  return [...known, ...extra].sort((a, b) => a.label.localeCompare(b.label));
}

/** The tab to open on arrival: the company's own record if it is there. */
export const LANDING_MODULE = "organization";

/* ─── Where a setting is actually changed ──────────────────────────────────
   Phase 1 cannot write, and these screens can. Keys are tried in this order:
   exact group key, then `store`, then `module_key`. Add the group key when a
   module's settings are split across more than one screen — which is why
   documents and attendance carry several entries and payroll carries two. */
const EDIT_ROUTES = {
  // ── By exact group ──
  "documents.branding": { path: "/documents/letterhead", label: "Letterhead & Branding" },
  "billing.notifications": { path: "/billing", label: "Plan & Billing" },

  // ── By store ──
  payroll_settings: { path: "/payroll/settings", label: "Payroll Settings" },
  statutory_configs: { path: "/payroll/statutory", label: "Tax & Legal Deductions" },
  document_settings: { path: "/documents/settings", label: "Document Settings" },
  document_letter_branding: { path: "/documents/letterhead", label: "Letterhead & Branding" },
  organization_profiles: { path: "/company", label: "Company Profile" },

  // ── By module, as the last resort ──
  payroll: { path: "/payroll/settings", label: "Payroll Settings" },
  document: { path: "/documents/settings", label: "Document Settings" },
  organization: { path: "/company", label: "Company Profile" },
  attendance: { path: "/attendance/policies", label: "Attendance Policies" },
  leave: { path: "/leaves/policies", label: "Leave Policies" },
};

/**
 * The screen that can change this group, as `{ path, label }`, or null.
 * `path` is workspace-relative; the caller prefixes it, so a manager never
 * receives a link into the HR workspace (§2).
 */
export function editRouteFor(group) {
  if (!group) return null;
  return EDIT_ROUTES[group.key] || EDIT_ROUTES[group.store] || EDIT_ROUTES[group.module_key] || null;
}

/* ─── Where a policy surface is managed ────────────────────────────────────
   The catalogue's 49 `surfaces[]` are multi-record policy tables — leave
   types, shift templates, holiday calendars — not singleton settings. They
   have always had their own screens; the hub's job is only to point at them
   so nobody has to hunt (the brief calls this the scavenger hunt). Matched on
   `owner_table` first, then the surface key, because one table can back
   several registry entries. */
const SURFACE_ROUTES = {
  // Attendance
  attendance_policies: { path: "/attendance/policies", label: "Attendance Policies" },
  shift_templates: { path: "/attendance/shifts", label: "Work Shifts" },
  employee_shifts: { path: "/attendance/roster", label: "Shift Management" },
  weekly_offs: { path: "/attendance/weekly-offs", label: "Weekly Offs" },
  holidays: { path: "/attendance/holidays", label: "Holidays" },
  holiday_calendars: { path: "/attendance/holidays", label: "Holidays" },
  comp_off_policies: { path: "/attendance/comp-off-policies", label: "Earned Leave Policies" },
  locations: { path: "/attendance/locations", label: "Office Locations" },
  field_locations: { path: "/attendance/field-locations", label: "Client Sites" },
  attendance_lock_periods: { path: "/attendance/lock-periods", label: "Lock Attendance" },

  // Leave
  leave_types: { path: "/leaves/types", label: "Leave Types" },
  leave_policies: { path: "/leaves/policies", label: "Leave Policies" },
  leave_policy_assignments: { path: "/leaves/assignments", label: "Leave Assignment" },

  // Payroll
  salary_components: { path: "/payroll/components", label: "Salary Components" },
  salary_structure_templates: { path: "/payroll/templates", label: "Structure Templates" },
  benefit_plans: { path: "/payroll/benefits", label: "Benefit Plans" },
  bonus_rules: { path: "/payroll/bonus-rules", label: "Bonus Rules" },
  pt_slabs: { path: "/payroll/statutory", label: "Tax & Legal Deductions" },
  tax_regimes: { path: "/payroll/statutory", label: "Tax & Legal Deductions" },

  // Documents
  document_types: { path: "/documents/types", label: "Document Types" },
  document_templates: { path: "/documents/templates", label: "Form Templates" },
  letter_templates: { path: "/documents/letter-templates", label: "Letter Templates" },

  /* Company. `hrOnly` because /departments is mounted in the HR workspace
     alone — a manager following it would meet the route gate, and §2 says a
     capability a role lacks is ABSENT, not broken. Keyed both ways because
     this surface's `owner_table` and `key` differ in the two places the
     contract names it (implementation_plan §5.1 calls it
     `organization.departments`), and a lookup that misses is inert. */
  organization_departments: { path: "/departments", label: "Departments", hrOnly: true },
  "organization.departments": { path: "/departments", label: "Departments", hrOnly: true },
};

/** The screen that manages a policy surface, or null. Workspace-relative. */
export function surfaceRouteFor(surface) {
  if (!surface) return null;
  return SURFACE_ROUTES[surface.owner_table] || SURFACE_ROUTES[surface.key] || null;
}

/* ─── Printing a value ─────────────────────────────────────────────────────
   Values arrive as bare JSON typed by the catalogue's `data_type`. Rendering
   them raw would put `true`, `null` and `monthly` on screen, which §4 and §6
   both forbid. */

/** Catalogue `unit` → how it reads after the number. */
const UNIT_SUFFIX = {
  days: (n) => `${n} day${Number(n) === 1 ? "" : "s"}`,
  months: (n) => `${n} month${Number(n) === 1 ? "" : "s"}`,
  hours: (n) => `${n} hour${Number(n) === 1 ? "" : "s"}`,
  minutes: (n) => `${n} minute${Number(n) === 1 ? "" : "s"}`,
  percent: (n) => `${n}%`,
  "%": (n) => `${n}%`,
  INR: (n) => formatMoney(n),
  people: (n) => `${n} ${Number(n) === 1 ? "person" : "people"}`,
  approvals: (n) => `${n} approval${Number(n) === 1 ? "" : "s"}`,
  payslips: (n) => `${n} payslip${Number(n) === 1 ? "" : "s"}`,
  loans: (n) => `${n} loan${Number(n) === 1 ? "" : "s"}`,
  seconds: (n) => `${n} second${Number(n) === 1 ? "" : "s"}`,
  bytes: (n) => `${n} bytes`,
};

/**
 * One setting's value, as a person reads it.
 * `entry` is the catalogue definition (for `data_type` and `unit`).
 * Unset reads "Not set" — never a dash, never `null` (§5).
 */
export function displaySettingValue(value, entry) {
  if (value === null || value === undefined || value === "") return "Not set";

  const type = entry?.data_type;

  if (type === "boolean" || typeof value === "boolean") return value ? "On" : "Off";

  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.join(", ");
  }

  if (type === "date") return fmtDate(value);

  /* OUR NAME FOR THE CHOICE FIRST (ENUM_LABEL in settingsBlurbs), then the
     value prettified. `humanize` alone gave "Clamp and carry forward" and
     "Inr" — the column’s own word with the underscores taken out, which names
     the mechanism where §6 asks for the consequence. This one line is why the
     pills, the select, a read-only card and the change history all say the
     same thing: each of them ends up here. */
  if (type === "enum") return enumLabel(entry?.key, value) || humanize(value);

  if (type === "integer" || type === "decimal" || typeof value === "number") {
    // The control shows a month name and an ordinal day (see `isMonthOfYear`
    // and `isDayOfMonth`), so everything that PRINTS a value — the change
    // history, a read-only card, a search hit — has to agree with it. Two
    // renderings of one stored number is how a reader comes to believe the
    // financial year starts in the 4th week.
    if (isMonthOfYear(entry)) return MONTH_NAMES[value] || String(value);
    if (isDayOfMonth(entry)) return `${ordinal(value)} of the month`;
    const unit = UNIT_SUFFIX[entry?.unit] || UNIT_SUFFIX[SETTING_NOUN[entry?.key]];
    if (unit) return unit(value);
    const noun = SETTING_NOUN[entry?.key];
    return noun ? `${value} ${noun}`.replace(" %", "%").replace(" ×", "×") : String(value);
  }

  if (type === "jsonb" || (typeof value === "object" && value !== null)) {
    // A structured value has no sensible one-line form, and dumping JSON on
    // screen is the opposite of §6. Say it is configured and let the owning
    // screen show it properly.
    return "Configured";
  }

  const text = String(value);
  // A bare snake_case string is an enum the catalogue didn't declare as one —
  // so it gets the same name our own enums get, if we have written one.
  return enumLabel(entry?.key, text)
    || (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) ? humanize(text) : text);
}

/* ─── Risk, and when a change bites ────────────────────────────────────────
   RISK IS A MARK, NOT A SENTENCE (user decision, 2026-10-10, third and fourth
   pass). It has now been three things. A coloured "Change carefully" pill —
   rejected for taking more width than the field it warned about. Then a clause
   in the field's caption ("Asks you to confirm and say why before it saves") —
   rejected too, and for a better reason: the caption's one job is to say what
   the setting DOES (see settingsBlurbs.js), and a reader who meets a sentence
   about saving instead of a sentence about the setting has been told the wrong
   thing. So all that is left on the field is a small rose mark with this as
   its accessible name, and the ⓘ beside the first marked field in the card
   explains the concept once (§10).

   `medium` gets NOTHING. It carries no gate — nothing different happens when
   you save one — and "affects pay or leave" is not news on a payroll screen.
   `high` is the one with a gate behind it: the gateway answers 422
   SETTINGS_REASON_REQUIRED, then 409 SETTINGS_CONFIRMATION_REQUIRED. */
export const RISK_META = {
  high: { label: "Asks you to confirm and say why before it saves" },
};

export const riskMeta = (risk) => RISK_META[String(risk || "").toLowerCase()] || null;

/** `effect_timing` → when a change would actually bite. */
export const EFFECT_TIMING = {
  immediate: "Takes effect straight away",
  next_record: "Applies to new records from now on",
  next_run: "Takes effect on the next payroll run",
  next_cron_pass: "Takes effect within a day",
  inert: "Kept on file; nothing acts on it yet",
};

export const effectTimingLabel = (timing) => EFFECT_TIMING[timing] || null;

/* ─── Search ───────────────────────────────────────────────────────────────
   The brief asks for one search over the catalogue, because nobody knows which
   tab a setting lives in.

   IT MATCHES EVERY NAME THE READER CAN SEE, not only the field's own (user,
   15 Oct 2026: "even user/HR type the heading name of the tab, the setting
   must appear there"). Three of the names printed above a setting were
   unsearchable: the TAB ("Documents & Branding"), the SHELF heading
   ("Provident Fund"), and — until 14 Oct — the policy screens. Somebody who
   can see a word on the page and types it into the box on the same page has
   asked a reasonable question, and "No setting matches that" was a wrong
   answer to it.

   The order of the scores is the order of confidence, and it matters more now
   that one tab name can match sixty settings: an exact label beats a group, a
   group beats a shelf, a shelf beats a whole tab, and the KEY stays last
   because it is what a reader is least likely to type and most likely to
   match by accident. */
export function searchSettings(entries, groupsByKey, query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = [];
  for (const entry of entries) {
    // Both names: ours is what the reader can see on the card, the
    // catalogue's is what they may remember from the registry or a ticket.
    const label = `${settingLabel(entry)} ${entry.label || ""}`.toLowerCase();
    const group = String(groupsByKey[entry.group_key]?.label || "").toLowerCase();
    const key = String(entry.key || "").toLowerCase();
    // The headings this setting sits under: its tab, and the shelf inside its
    // card. The shelf is read off the key, the same source the card reads it
    // from (see `fieldShelves`), so the search can name a shelf without
    // knowing which card is open or how that card happened to split.
    const tab = String(moduleLabel(entry.module_key) || "").toLowerCase();
    const shelf = shelvesNamedIn(entry.key).toLowerCase();
    let score = 0;
    if (label.startsWith(q)) score = 6;
    else if (label.includes(q)) score = 5;
    else if (group.includes(q)) score = 4;
    else if (shelf.includes(q)) score = 3;
    else if (tab.includes(q)) score = 2;
    else if (key.includes(q)) score = 1;
    if (score) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || settingLabel(a.entry).localeCompare(settingLabel(b.entry)))
    // A tab name legitimately matches a tab-full, so the cap is high enough to
    // be a list rather than a sample. Best matches first, so a reader who
    // typed a precise word still finds it at the top of the longer list.
    .slice(0, 25)
    .map((s) => s.entry);
}

/** The shelf headings a key would sit under (`pf_employee_rate` → "Provident
 *  Fund"), for the search to match. Nothing to do with layout: a key may name
 *  more than one shelf token and all of them are worth matching. */
function shelvesNamedIn(key) {
  return String(key || "")
    .split("_")
    .map((token) => SHELF_LABEL[token])
    .filter(Boolean)
    .join(" ");
}

/* ─── Which settings can be edited inline ──────────────────────────────────
   Chosen from the catalogue's `data_type`, not from a list of keys, so a
   setting the backend adds gets a working control with no frontend release.

   Two kinds are deliberately NOT editable here and stay read-only with the
   card's link out:
     · `jsonb` — a structured blob has no honest generic editor, and guessing
       one risks writing a shape the owning module can't read back.
     · anything `deprecated` or `sensitive` — the gateway's allowlist refuses
       those anyway (422 SETTING_NOT_WRITABLE), so a control would be a button
       that 403s. */
export const EDITABLE_TYPES = ["boolean", "enum", "integer", "decimal", "string", "date", "array"];

export const isEditable = (entry) =>
  Boolean(entry)
  && !entry.deprecated
  && !entry.sensitive
  && EDITABLE_TYPES.includes(entry.data_type);

/**
 * Array items follow the catalogue's own `default`: `[7, 1]` means numbers,
 * anything else means strings. Inferring from what the person typed would make
 * `"7"` versus `7` depend on the order items were entered, and the owning
 * module's schema does care which it gets.
 */
export const arrayItemIsNumber = (entry) =>
  Array.isArray(entry?.default) && entry.default.some((v) => typeof v === "number");

/**
 * What the items of an `array` setting look like, so the chip editor can use
 * the right keyboard, the right placeholder and catch an obvious typo.
 *
 * THE CATALOGUE HAS NO `format`. Its fields are listed in
 * combined_api_analysis §1.1: key, data_type, unit, range, default — and
 * nothing that says "these are email addresses". `default` settles numbers
 * (see `arrayItemIsNumber`) but an empty default settles nothing, and
 * `billing_notification_emails` ships as `[]`. So the key and label are the
 * only signal there is, and this reads them for ONE purpose: the input's type
 * and a typo check. It never decides whether the setting is editable or what
 * is sent — the gateway's own Joi is still the authority on a deliverable
 * address, and this check is deliberately permissive so it can't refuse
 * something the server would have accepted.
 */
export function arrayItemHint(entry) {
  if (!entry || entry.data_type !== "array") return null;
  if (arrayItemIsNumber(entry)) {
    const { min, max } = entry.range || {};
    return {
      kind: "number",
      placeholder: min !== undefined && max !== undefined ? `${min}–${max}` : "A number",
      invalid: min !== undefined && max !== undefined
        ? `Pick a whole number between ${min} and ${max}.`
        : "That needs to be a number.",
    };
  }
  if (/mail/i.test(`${entry.key || ""} ${entry.label || ""}`)) {
    return {
      kind: "email",
      placeholder: "accounts@yourcompany.com",
      invalid: "That doesn’t look like an email address.",
    };
  }
  return { kind: "text", placeholder: "Type a value, then press Add", invalid: "" };
}

/** Permissive on purpose: the server decides what is deliverable. */
export const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

/** "between 1 and 90", "up to 5 items" — the rule, in the catalogue's words. */
export function rangeHint(entry) {
  const r = entry?.range;
  if (!r) return null;
  if (Array.isArray(r.enum)) return null; // the select already lists the choices
  const bits = [];
  if (r.min !== undefined && r.max !== undefined) bits.push(`between ${r.min} and ${r.max}`);
  else if (r.min !== undefined) bits.push(`${r.min} or more`);
  else if (r.max !== undefined) bits.push(`up to ${r.max}`);
  if (r.max_items !== undefined) bits.push(`up to ${r.max_items} item${r.max_items === 1 ? "" : "s"}`);
  return bits.length ? bits.join(", ") : null;
}
/* ─── The change history (#248) ────────────────────────────────────────────
   What a change record MEANS on screen.

   `audit_source` — which physical table the row came out of
   (`settings_change_logs` / `payroll_audit_logs` / `document_audit_logs`) — is
   deliberately never rendered. Which of our tables holds the record is our
   plumbing, exactly like `settled_via` in billing: the reader asked who
   changed what, not where we filed it. */

/** `source` → where the change was made, in words. */
export const CHANGE_SOURCE = {
  settings_api: "Settings",
  module_api: "The area's own screen",
  system: "Automatically",
};

/**
 * Where the change came from, or null when we genuinely don't know.
 *
 * Null is the COMMON case, not an edge one: only the billing-notification
 * store records a channel (phase3_api_analysis §3.5). So this returns null and
 * the row prints nothing, rather than guessing "Company Settings" for four
 * stores out of five and being wrong most of the time.
 */
export const changeSourceLabel = (source) =>
  CHANGE_SOURCE[String(source || "").toLowerCase()] || null;

/** The filter options for the channel, with the "any" position first. */
export const CHANGE_SOURCE_OPTIONS = [
  { value: "", label: "Anywhere" },
  { value: "settings_api", label: CHANGE_SOURCE.settings_api },
  { value: "module_api", label: CHANGE_SOURCE.module_api },
  { value: "system", label: CHANGE_SOURCE.system },
];

/**
 * Who made a change, as a name (§4 — never an id).
 *
 * The server resolves `actor.name` itself, so that wins. When it can't (the
 * actor left, or the legacy table only stored an id) we ask the directory,
 * and only then fall back to words. A change with no actor at all is the
 * system acting, which is a fact worth saying rather than hiding.
 */
export function changeActorName(actor, nameOf) {
  if (actor?.name) return actor.name;
  if (!actor?.id) return "System";
  const resolved = typeof nameOf === "function" ? nameOf(actor.id) : null;
  // `nameOf` answers "Loading…" while the directory is still arriving; passing
  // that straight through is what §4 asks for.
  return resolved || "Unknown user";
}

/**
 * Whether a value IS the value we ship, for the one place that benefit shows:
 * a change record, where "they put it back to the default" and "they moved it
 * off the default" are the two things an auditor is reading for.
 *
 * Compared loosely on purpose. The catalogue's `default` and the stored value
 * come from different columns and arrive as `30` and `"30"` often enough that
 * a strict check would call a restored default a change. Arrays compare by
 * content and order, which is what the owning modules store.
 */
export function isDefaultValue(value, entry) {
  if (!entry || !("default" in entry)) return false;
  const shipped = entry.default;
  if (Array.isArray(shipped) || Array.isArray(value)) {
    return Array.isArray(shipped) && Array.isArray(value)
      && shipped.length === value.length
      && shipped.every((v, i) => String(v) === String(value[i]));
  }
  if (shipped === null || shipped === undefined) {
    return value === null || value === undefined || value === "";
  }
  return String(shipped) === String(value);
}

/**
 * One change, as a sentence for the row: "Pay day — 28 to 30".
 * Values go through `displaySettingValue` so an enum reads as words and an
 * unset value reads "Not set" rather than null (§4, §5).
 */
export const changeSummary = (item, entry) =>
  `${displaySettingValue(item?.old_value, entry)} → ${displaySettingValue(item?.new_value, entry)}`;

/* ─── Saying what an area is FOR, in one line ──────────────────────────────
   The catalogue sends a `label` for every module and group and nothing else:
   there is no `description` on a group, and `label` alone ("Payroll
   Authority", "Documents Lifecycle") is the backend's vocabulary, not a
   person's. A settings hub that only lists nouns makes the reader open every
   card to find out what it does, which is the scavenger hunt again one level
   down.

   So these are the one-sentence answers to "what does this control?", written
   for someone who does not work in payroll (§6), grounded in the group map in
   md_settings/implementation_plan.md §5.1. A group we have no sentence for
   simply gets none — an invented blurb would be worse than the label alone,
   and the hub must keep working when the backend adds a group (the brief's
   "zero maintenance burden"). */
export const MODULE_BLURB = {
  organization: "Your company’s own record, and where its bills and renewal notices go.",
  payroll: "The rules every payroll run follows, and the deductions required by law.",
  document: "How letters and documents are made, stored, approved and kept.",
  attendance: "Working days, hours, shifts and the rules applied to a day’s attendance.",
  leave: "The kinds of leave people can take, how much they get, and the rules around it.",
};

export const moduleBlurb = (key) => MODULE_BLURB[key] || null;

/* ONE LINE, AT MOST ~72 CHARACTERS. A folded card clamps this to a single
   line so that every folded card is the same height (see SettingsGroupForm's
   Header), and a card is half the page's width — so a longer sentence doesn't
   read as a longer sentence, it reads as one cut off mid-clause. Say what the
   card is FOR, not what each setting in it does: that is the ⓘ's job now
   (14 Oct 2026, see settingsBlurbs.js). */
export const GROUP_BLURB = {
  // ── Payroll ──
  "payroll.calendar": "How often people are paid, and when attendance stops counting.",
  "payroll.engine": "What an unpaid day costs, and how pay figures are rounded.",
  "payroll.authority": "What a manager may see of their team’s pay, and what needs HR.",
  "payroll.loans": "Advances to staff: the most that can be lent, and how it is repaid.",
  "payroll.tax_admin": "Which tax regime people start on, and when they declare investments.",
  "payroll.reimbursements": "Who signs off an expense claim before it is paid.",
  "payroll.benefits": "Whether benefit plans are charged to the employee through payroll.",
  "payroll.payslips": "When payslips reach people, and whether they also arrive by email.",
  "payroll.exits": "How a leaver’s last payment is worked out.",
  "payroll.automation": "What payroll does on its own each month, without anyone starting it.",
  "payroll.deprecated": "Kept on file from an older release. Nothing acts on these.",

  // ── Tax & legal deductions ──
  "statutory.pf": "Provident Fund: who it applies to, and how much is paid in.",
  "statutory.esi": "ESI: who it covers, and how the contribution is worked out.",
  "statutory.pt": "Professional tax: which state’s rates a person is charged under.",
  "statutory.income_tax": "Income tax: how much is held back each month, and how it is rounded.",

  // ── Documents ──
  "documents.authority": "Who may issue, approve and publish a document.",
  "documents.storage": "File size and type limits, and how much space the organisation may use.",
  "documents.retention": "How long documents and letters are kept before deletion.",
  "documents.lifecycle": "What happens to a document from draft to expiry.",
  "documents.acknowledgement": "Whether people must confirm they have read a document.",
  "documents.notifications": "Who is told about a document, and when the reminders go out.",
  "documents.requests": "How a request for a document is handled.",
  "documents.publishing": "What happens the moment a document is published.",
  "documents.letters": "How letters are numbered, signed and dated, and what goes on each one.",
  "documents.branding": "The company name, address and logo printed at the top of every letter.",

  // ── Company & billing ──
  "billing.notifications": "Where invoices and renewal reminders are sent, and how far ahead.",
};

export const groupBlurb = (group) => (group ? GROUP_BLURB[group.key] || null : null);

/* What a whole policy SCREEN manages, in one line. Keyed by the route the
   surfaces fold into (see `surfaceRouteFor`), because the reader is choosing a
   screen to open, not a registry entry. */
export const SURFACE_BLURB = {
  "/attendance/policies": "Grace time before a late mark, what lateness costs, the half-day cut-off, and how long a correction stays open.",
  "/attendance/shifts": "The hours each shift covers, and the break inside it.",
  "/attendance/roster": "Who works which shift, and from when.",
  "/attendance/weekly-offs": "Which days of the week are not working days, for the company or one department.",
  "/attendance/holidays": "The company holiday calendar, and who each holiday applies to.",
  "/attendance/comp-off-policies": "What working on an off day earns, and how long that day can be kept before it lapses.",
  "/attendance/locations": "The offices a check-in can be matched against.",
  "/attendance/field-locations": "Client sites people are allowed to check in from.",
  "/attendance/lock-periods": "Months closed to further attendance changes, so a finished payroll can’t shift.",
  "/leaves/types": "The kinds of leave people can ask for, and whether each one is paid.",
  "/leaves/policies": "How much leave a group of people gets, when it is given, and what is kept for next year.",
  "/leaves/assignments": "Which leave policy applies to whom.",
  "/payroll/components": "The earnings and deductions a salary can be built from.",
  "/payroll/templates": "Ready-made salary structures, so a new hire’s pay doesn’t start from nothing.",
  "/payroll/benefits": "The benefit plans people can be enrolled in, and what each one costs.",
  "/payroll/bonus-rules": "When a bonus is paid, and how it is worked out.",
  "/payroll/statutory": "PF, ESI, professional tax and income tax: the rates and slabs each is charged at.",
  "/documents/types": "The kinds of document the organisation files, and what each one needs.",
  "/documents/templates": "Blank forms people fill in and send back.",
  "/documents/letter-templates": "The wording of each letter the company issues.",
  "/departments": "The departments people belong to, and who heads each one.",
};

/**
 * What the screen behind a surface card manages, in one line.
 *
 * THE PATH ARRIVES PREFIXED. The hub hands every link through its own
 * workspace (`/dashboard/hr/attendance/policies`), and this table is keyed by
 * the workspace-RELATIVE path, because the sentence is the same sentence
 * whoever is reading it (§2). A straight lookup therefore missed on every
 * single card and every card lost its explanation — which is exactly what
 * 2026-10-10's "put at least a one-liner inside them" was reporting. So the
 * prefix is stripped before the lookup, and the function works on either form.
 */
export function surfaceBlurb(route) {
  const path = route?.path;
  if (!path) return null;
  const relative = path.replace(/^\/dashboard\/[^/]+/, "");
  return SURFACE_BLURB[relative] || SURFACE_BLURB[path] || null;
}

/**
 * The fallback when a surface has no sentence of its own: say where its rules
 * are set, naming the screen. Thin, but true — and a card with no explanation
 * at all is the thing being fixed. A new entry in SURFACE_BLURB always beats
 * this, so an added screen reads properly the day somebody writes its line.
 */
export const surfaceFallbackBlurb = (title) =>
  (title ? `The rules the ${title} screen owns. Open it to see and change them.` : null);

/* ─── Controls that read like a sentence ───────────────────────────────────
   The brief's §3 asks for "friendly conversational pickers" rather than raw
   integers, and for the unit to sit ON the box instead of in a sentence
   underneath it. Both are decided from the catalogue's own `data_type`,
   `unit` and `range`, never from a list of keys — a setting the backend adds
   gets the same treatment with no frontend release. */

/* WHAT THE NUMBER IS COUNTING, where the catalogue doesn't say (user, 15 Oct
   2026: "as we are giving fields for entering seconds like (60) so there give
   a written type also … this gives better understanding of the fields and
   data"). Most numeric settings arrive with a `unit` and already read "30
   days" or "₹ 50,000" on the box. A dozen arrive with `unit: null` and sit
   there as a bare `20000`, which is the one state where the reader has to
   guess what they are typing — 20,000 what?

   SO THIS IS A LAST RESORT, NOT A SECOND SOURCE. The catalogue's own `unit`
   always wins; this table is only consulted when there is none, and only for
   keys whose unit is settled by public/ref docs/md_settings/
   org_settings_registry.md ("Data Type: Integer, recipient count"). A key
   missing from here still renders exactly as it did — a bare number — which
   is the right failure: inventing a noun would caption the field with a
   guess, and a wrong noun is worse than none (§4's rule about ids applies to
   units too: don't put something on screen you can't stand behind).

   The nouns are SHORT because they are drawn inside the box, right of the
   digits: "people", not "recipients in the audience". */
const SETTING_NOUN = {
  // Documents — the registry's own words, settings #79, #71–#78.
  document_view_url_ttl_seconds: "seconds",
  document_upload_url_ttl_seconds: "seconds",
  document_max_file_size_bytes: "bytes",
  document_retention_days: "days",
  letter_record_retention_days: "days",
  document_acknowledgement_due_days: "days",
  document_request_default_due_days: "days",
  document_onboarding_completeness_threshold: "%",
  // "Integer, recipient count" — the audience a publish would write rows for,
  // NOT a number of documents. The number is people.
  document_publish_sync_threshold: "people",
  // "Integer, subject count" — a subject is the person a letter is about.
  letter_bulk_max_subjects: "people",
  letter_bulk_rate_per_hour: "an hour",
  letter_preview_rate_per_hour: "an hour",
  // Payroll.
  pdf_cache_retention_days: "days",
  pdf_bulk_inline_miss_threshold: "payslips",
  payroll_attachment_retention_days: "days",
  reimbursement_approval_levels: "approvals",
  reimbursement_payout_lookahead_months: "months",
  loan_max_tenure_months: "months",
  loan_max_concurrent_per_employee: "loans",
  loan_max_interest_rate: "%",
  loan_default_interest_rate: "%",
  standard_working_hours_per_day: "hours",
  // A multiplier on the normal hourly rate (1.5, 2) — "×" reads as "times"
  // at a glance and takes one character of the box.
  overtime_rate_multiplier: "×",
  // Statutory rates and ceilings. The rates are percentages of wages; the
  // ceilings and the floor are money, and money is a PREFIX.
  pf_employee_rate: "%",
  pf_employer_rate: "%",
  pf_admin_charge_rate: "%",
  eps_rate: "%",
  edli_rate: "%",
  esi_employee_rate: "%",
  esi_employer_rate: "%",
  tds_no_pan_rate: "%",
  cess_rate: "%",
  // Leave and exits, in days.
  fnf_encashment_max_days: "days",
  fnf_default_notice_period_days: "days",
  compoff_encashment_max_days_per_fy: "days",
  // A divisor: monthly pay ÷ this many days = one day's pay.
  fnf_encashment_divisor: "days",
  compoff_encashment_divisor: "days",
};

/** The unit, drawn on the field itself. `null` when there is nothing to draw. */
export function unitAffix(entry) {
  const unit = entry?.unit || SETTING_NOUN[entry?.key];
  if (!unit) return null;
  if (unit === "INR") return { prefix: "₹" };
  if (unit === "percent" || unit === "%") return { suffix: "%" };
  return { suffix: unit };
}

/**
 * A whole-number setting that means "a day of the month" — a payday, a cutoff,
 * a reminder date. Shown as "25th of the month" rather than `25`.
 *
 * Decided from the range (1 to 28–31) AND the key's last word, because a
 * 1–31 integer that is a COUNT of days ("keep for 30 days") must keep its
 * number box: "30th of the month" would be a lie about what it stores. A
 * `unit` of days is exactly that signal, so anything carrying one is out.
 */
export function isDayOfMonth(entry) {
  if (!entry || entry.data_type !== "integer" || entry.unit) return false;
  const { min, max } = entry.range || {};
  if (min !== 1 || !(max >= 28 && max <= 31)) return false;
  return /(^|_)(day|date)$/.test(String(entry.key || ""));
}

const ORDINAL_SUFFIX = { 1: "st", 2: "nd", 3: "rd" };

const ordinal = (n) => {
  const teen = n % 100;
  const suffix = teen >= 11 && teen <= 13 ? "th" : ORDINAL_SUFFIX[n % 10] || "th";
  return `${n}${suffix}`;
};

/* The months, in the order the calendar has them. Index 0 is unused so that
   `MONTH_NAMES[4]` is April — the stored value IS the month number, and an
   off-by-one here would name the wrong month on a tax deadline. */
const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A whole number that means A MONTH OF THE YEAR — the financial year's first
 * month, a declaration window, a proof deadline. Stored as 1–12, and shown
 * as "April" rather than `4`.
 *
 * Decided the same way `isDayOfMonth` is, and for the same reason: from the
 * range AND the key's last word, never a list of keys. SINGULAR `_month` is a
 * month of the year; PLURAL `_months` is a COUNT of months
 * (`loan_max_tenure_months`, `reimbursement_payout_lookahead_months`) and
 * keeps its number box, because "April" would be a lie about what it stores.
 * Anything carrying a `unit` is out for the same reason.
 */
export function isMonthOfYear(entry) {
  if (!entry || entry.data_type !== "integer" || entry.unit) return false;
  const { min, max } = entry.range || {};
  if (min !== 1 || max !== 12) return false;
  return /(^|_)month$/.test(String(entry.key || ""));
}

/** "January" … "December", over the catalogue's own range. */
export function monthOfYearOptions(entry) {
  const min = entry?.range?.min ?? 1;
  const max = entry?.range?.max ?? 12;
  const out = [];
  for (let n = min; n <= max; n += 1) out.push({ value: n, label: MONTH_NAMES[n] });
  return out;
}

/** "1st of the month" … "31st of the month", over the catalogue's own range. */
export function dayOfMonthOptions(entry) {
  const min = entry?.range?.min ?? 1;
  const max = entry?.range?.max ?? 31;
  const out = [];
  for (let n = min; n <= max; n += 1) out.push({ value: n, label: `${ordinal(n)} of the month` });
  return out;
}

/**
 * Few enough choices, each short enough to read at a glance, that they are
 * better as one row of pills than a dropdown the reader must open to see what
 * the alternatives even are. Beyond that a select wins — a fourth pill wraps,
 * and a wrapped segmented control stops looking like one.
 *
 * A nullable enum is excluded: "not set" is a fourth state that has to be
 * reachable, and a pill row with an empty pill in it reads as a bug.
 */
export function segmentedOptions(entry) {
  if (!entry || entry.data_type !== "enum" || entry.nullable) return null;
  const options = entry.range?.enum || [];
  if (options.length < 2 || options.length > 3) return null;
  const labelled = options.map((value) => ({ value, label: displaySettingValue(value, entry) }));
  if (labelled.some((o) => o.label.length > 16)) return null;
  return labelled;
}

/* ─── Search, part two: the policy screens ─────────────────────────────────
   Searching "grace" has to find the Attendance Policies screen, not only the
   settings whose labels contain the word — the brief's §6 names that exact
   case, and until now the search covered singleton settings alone, so the
   half of the catalogue that lives behind a surface was unfindable.

   Hits are folded by ROUTE, because what the reader gets is a screen to open:
   four registry entries backed by one table are one answer, not four. */
export function searchSurfaces(surfaces, query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const byRoute = new Map();
  for (const surface of surfaces || []) {
    const route = surfaceRouteFor(surface);
    // No screen to open means no result: a dead hit is worse than no hit (§2).
    if (!route) continue;
    const label = String(surface.label || "").toLowerCase();
    const screen = String(route.label || "").toLowerCase();
    const blurb = String(SURFACE_BLURB[route.path] || "").toLowerCase();
    // The tab it lives under, for the same reason the settings match it.
    const tab = String(moduleLabel(surface.module_key) || "").toLowerCase();
    if (!label.includes(q) && !screen.includes(q) && !blurb.includes(q) && !tab.includes(q)) continue;
    if (!byRoute.has(route.path)) {
      byRoute.set(route.path, { route, module_key: surface.module_key, matches: [] });
    }
    const bucket = byRoute.get(route.path);
    if (label.includes(q) && !bucket.matches.includes(surface.label)) bucket.matches.push(surface.label);
  }
  return [...byRoute.values()].slice(0, 6);
}

/* ─── How a setting is laid out inside its card ────────────────────────────
   An OPEN card is the full width of the page (see `layoutWall` below: the
   wall gives an open card its whole course), so its fields sit in a grid that
   grows with the screen — one per line on a phone, two from `sm`, three from
   `xl`. Which fields can take a single cell and which need more is decided
   from the catalogue rather than from a list of keys. */

/**
 * A yes/no, drawn as a switch on the SAME line as its label instead of a
 * control under it (user decision, 2026-10-10). A switch states what it is
 * set to in 44px, where the On/Off pill pair it replaced took a whole row to
 * say less — and the word beside it went too (14 Oct 2026), so a column of
 * yes/nos is now a column of labels with a switch at the end of each.
 */
export const isSwitchControl = (entry) => entry?.data_type === "boolean" && isEditable(entry);

/**
 * How many cells of the card's field grid a control takes.
 *
 * A SWITCH NO LONGER TAKES THE WHOLE ROW. It did while a card was half the
 * page (~500px) and the switch sat beside its label with the explanation
 * under both. At full width that put the switch a third of a metre from the
 * word it answers, which is the label-to-control distance this whole layout
 * exists to close — so a switch is one cell like everything else.
 *
 * Two still need room: a chip list grows as items are added, and a pill row
 * truncates its options to nothing in a narrow cell (which defeats the point
 * of showing the alternatives at all).
 */
export function fieldSpan(entry) {
  if (!entry) return "";
  // A chip list takes the whole row: two of them side by side left a ragged
  // column (the Company & Billing card is exactly two of them), and the
  // control caps its own input width instead. "The whole row" is two cells
  // from `sm` and three from `xl`, which is what the card's grid is.
  if (entry.data_type === "array") return "sm:col-span-2 xl:col-span-3";
  if (entry.data_type === "enum" && segmentedOptions(entry)) return "sm:col-span-2 xl:col-span-1";
  return "";
}

/* ─── Shelves inside a card ────────────────────────────────────────────────
   A full-width card can hold a lot: Provident Fund is 15 fields, a leaver's
   final pay 16. As one unbroken grid that is a wall of labels to read in
   order, and somebody who came to change the pension rate has to read the
   employer's PF rate, the ceiling and the overtime rule on the way. So the
   fields are shelved under their own small headings.

   THE SHELVES ARE READ OFF THE KEYS, not from a list of groupings somebody
   maintains: `pf_employee_rate`, `eps_rate` and `edli_rate` already say which
   shelf they are on. The algorithm is the boring one:
     1. strip the prefix EVERY key in the card shares (all seven notification
        keys start `document_`, which groups nothing),
     2. shelve by the first token of what is left,
     3. and only keep the result if it is actually a tidier way to read the
        card — two or more shelves of two or more fields.
   Anything that didn't land on a shelf goes last, under "Other". A card that
   doesn't split renders exactly as it did before, one grid, no heading.

   WHY A MINIMUM OF SIX. Below that the card is already one glance, and a
   heading above two fields is furniture. */
const SHELF_LABEL = {
  pf: "Provident Fund",
  eps: "Pension (EPS)",
  edli: "Life cover (EDLI)",
  esi: "ESI",
  fnf: "Unused leave and notice",
  compoff: "Earned days off",
  overtime: "Overtime",
  loan: "Loans",
  notify: "Who gets told",
  expiry: "Before something runs out",
  acknowledgement: "Reading and signing",
  offboarding: "When somebody leaves",
  request: "Requests",
  tax: "Tax declarations",
  tds: "Income tax",
  payslip: "Payslips",
  pdf: "Files we build",
  letter: "Letters",
  bulk: "Bulk runs",
  billing: "Billing notices",
  payroll: "Payroll",
  reimbursement: "Expense claims",
  signature: "Signing",
  upload: "Uploads",
  retention: "How long things are kept",
  scan: "Uploads",
};

/* Tokens that are a grammar word, not a subject. "Max", "Auto" and "Allow" head
   nothing a person would look for, so a field whose first token is one of these
   falls through to the card's "Other" shelf instead of inventing a heading. */
const STOP_TOKENS = new Set([
  "max", "min", "auto", "is", "allow", "allowed", "require", "requires", "required",
  "enable", "enabled", "default", "num", "no", "can", "has", "use", "do", "days",
  "hours", "minutes", "months", "rate", "rates", "amount", "threshold", "thresholds",
  "other",
]);

const shelfLabel = (token) => SHELF_LABEL[token] || humanize(token) || "Other";

/** The token every key in the card starts with, if there is one. */
function sharedPrefix(keys) {
  const parts = keys.map((k) => String(k).split("_"));
  let shared = 0;
  while (parts[0] && shared < parts[0].length - 1) {
    const token = parts[0][shared];
    if (!parts.every((p) => p.length > shared + 1 && p[shared] === token)) break;
    shared += 1;
  }
  return shared;
}

/**
 * A card's fields, shelved. Always returns at least one shelf; a single shelf
 * carries no label, which is the "render it exactly as before" case.
 *
 * @returns {{ key: string, label: string|null, rows: object[] }[]}
 */
/**
 * A shelf's fields in the order they should be READ, which is not quite the
 * order the registry lists them in.
 *
 * SWITCHES GO LAST (user, 15 Oct 2026, naming three pairs: "exchange the
 * positions of 'Pay in the next month' with 'Financial year starts' as
 * Financial year starts have same input field as others and this will
 * maintain the UI"). A yes/no is drawn as a 40px switch on its label's own
 * line; everything else is a full-width box or select UNDER its label. So one
 * switch in the middle of a run of boxes leaves a half-height cell and knocks
 * the three-column grid out of step. Gathered at the end of the shelf, boxes
 * line up with boxes and switches with switches, and the card reads as rows.
 *
 * It is a STABLE partition, not a sort: inside the boxes and inside the
 * switches the catalogue's own order survives, so no field moves anywhere a
 * reader can't predict.
 *
 * `lead` keeps a shelf's MASTER switch first — `pf_enabled` over the whole
 * Provident Fund shelf — because reading "Employee share" before "Provident
 * Fund: off" is reading the answer before the question. It is passed only for
 * a shelf that HAS a heading: in a card that didn't split there is no heading
 * for a switch to govern, so it is just another switch. That is what moves
 * "Pay for overtime" off the top of the payroll engine card.
 */
export function orderFields(rows, { lead = false } = {}) {
  const isMaster = (row) => lead && /_(enabled|required|payable)$/.test(row.key || "");
  const rank = (row) => {
    if (isMaster(row)) return 0;
    return isSwitchControl(row) ? 2 : 1;
  };
  return (rows || [])
    .map((row, i) => [row, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([row]) => row);
}

export function fieldShelves(entries, min = 6) {
  const rows = entries || [];
  const flat = [{ key: "all", label: null, rows: orderFields(rows) }];
  if (rows.length < min) return flat;

  const skip = sharedPrefix(rows.map((e) => e.key));
  const order = [];
  const byToken = new Map();
  for (const row of rows) {
    const token = String(row.key || "").split("_")[skip] || "other";
    if (!byToken.has(token)) { byToken.set(token, []); order.push(token); }
    byToken.get(token).push(row);
  }

  const shelves = [];
  const leftovers = [];
  for (const token of order) {
    const group = byToken.get(token);
    const named = !STOP_TOKENS.has(token) || SHELF_LABEL[token];
    if (group.length >= 2 && named) {
      // A real shelf, so its master switch keeps the top — see `orderFields`.
      shelves.push({ key: token, label: shelfLabel(token), rows: orderFields(group, { lead: true }) });
    }
    else leftovers.push(...group);
  }
  // Not a tidier read: leave the card alone rather than hanging one heading
  // over most of it.
  if (shelves.length < 2) return flat;
  // "Other" is a remainder, not a subject, so nothing in it governs anything
  // else: no master switch, just the boxes and then the switches.
  if (leftovers.length > 0) shelves.push({ key: "other", label: "Other", rows: orderFields(leftovers) });
  return shelves;
}

/* ─── THE WALL: COURSES OF BRICKS, AND `packColumns` IS STILL DELETED ──────
   Three layouts have been tried for the hub's cards and each failed in a way
   worth keeping written down, because the next person will reach for one of
   them:

     1. ONE GRID, `items-stretch`. A 64px folded card sharing a row with a
        700px open one balloons into 640px of empty white INSIDE the folded
        card. (Payroll Settings was the one grid that got away with it, while
        its sections were open by default and much of a height. It is laid out
        by `layoutWall` too since 15 Oct, so there is no such page left.)
     2. ONE GRID, `items-start`. Same pairing, opposite symptom: a card-sized
        HOLE beside the open card. This is what shipped, and what was reported
        on 14 Oct — "so much white space when we open the tab".
     3. TWO LANES BY INDEX (`lanes`, 14 Oct, deleted by this). No rows at all,
        so nothing could be paired wrongly — but opening a card in one lane
        left the other lane short, and that shortfall is the same white space
        measured down the page instead of across it.

   What all three have in common is that a folded card and an open one were
   asked to share a course. So they aren't: AN OPEN CARD TAKES THE WHOLE
   COURSE, folded cards go two to a course, and a folded card that would
   otherwise be left alone in a course widens to fill it. Every course is
   exactly full, which is what "no gap between them even after opening and
   closing them" means, and `items-stretch` is safe again because the only
   cards that share a course are folded ones of near-identical height.

   `packColumns` and `cardWeight` used to live here and are NOT coming back.
   They chose the column boundary from how tall each card was about to be, so
   the page re-levelled itself as cards opened and a card nobody had touched
   jumped from the foot of one column to the head of the other ("notification
   tab jumping from position", 2026-10-10). `layoutWall` measures NOTHING: it
   reads the open/closed flags and the card's position in the catalogue, and
   that is all it is ever allowed to read. A width can change (the brick
   before an open card widens to close its course) but an ORDER never does. */

/**
 * The wall, course by course: which cards go on which row of the two-column
 * grid, and how many columns each one takes.
 *
 * Returns the cards in catalogue order with a `span` of 1 or 2, so the page
 * renders a plain grid in DOM order — reading order, tab order and catalogue
 * order are the same thing again, with no `order` or `display: contents`
 * trickery to keep in step.
 *
 * @param {Array} groups      the open tab's groups, in catalogue order
 * @param {Set}   openKeys    the keys of the cards that are unfolded
 */
export function layoutWall(groups, openKeys) {
  const open = openKeys instanceof Set ? openKeys : new Set(openKeys || []);
  const wall = (groups || []).map((group) => ({
    group,
    span: open.has(group.key) ? 2 : 1,
  }));

  // Walk the courses, carrying only "is there half a course open behind me".
  let half = false;
  for (let i = 0; i < wall.length; i += 1) {
    if (wall[i].span === 2) {
      // An open card starts its own course, so the brick behind it has to
      // close the one it is in — otherwise that half-course is the hole.
      if (half) wall[i - 1].span = 2;
      half = false;
    } else {
      half = !half;
    }
  }
  // The last brick, if it is laid alone, closes the wall rather than leaving
  // half a course at the bottom (the complaint behind "below the side tabs we
  // can see so much white").
  if (half) wall[wall.length - 1].span = 2;
  return wall;
}

/* ─── A day in the change history ──────────────────────────────────────────
   The history is a log, and a log's rows share a date: printing "9 Oct 2026,
   4:12 pm" on twenty consecutive rows spends the widest column in the table
   restating the same day. The rows are grouped under one heading per day
   instead, and this is that heading — "Today" and "Yesterday" by name, because
   that is how somebody checking what changed this morning thinks of it. */
export function changeDayHeading(iso, today = new Date()) {
  // `toLocalYMD`, not a slice of the ISO string: `occurred_at` is a UTC
  // instant, and a change made at 2am IST would otherwise be filed under
  // yesterday's heading while its own row printed today's time.
  const ymd = iso ? toLocalYMD(iso) : "";
  if (!ymd) return "Earlier";
  const todayYmd = toLocalYMD(today);
  if (ymd === todayYmd) return "Today";
  if (ymd === addDaysYMD(todayYmd, -1)) return "Yesterday";
  return fmtDate(ymd, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

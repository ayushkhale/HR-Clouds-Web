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
import { settingLabel } from "./settingsBlurbs";
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
  INR: (n) => formatMoney(n),
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

  if (type === "enum") return humanize(value);

  if (type === "integer" || type === "decimal" || typeof value === "number") {
    const unit = UNIT_SUFFIX[entry?.unit];
    return unit ? unit(value) : String(value);
  }

  if (type === "jsonb" || (typeof value === "object" && value !== null)) {
    // A structured value has no sensible one-line form, and dumping JSON on
    // screen is the opposite of §6. Say it is configured and let the owning
    // screen show it properly.
    return "Configured";
  }

  const text = String(value);
  // A bare snake_case string is an enum the catalogue didn't declare as one.
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) ? humanize(text) : text;
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
   tab a setting lives in. Matches the label first, then the group, then the
   key — the key last because it is the thing a reader is least likely to type
   and most likely to match by accident. */
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
    let score = 0;
    if (label.startsWith(q)) score = 4;
    else if (label.includes(q)) score = 3;
    else if (group.includes(q)) score = 2;
    else if (key.includes(q)) score = 1;
    if (score) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || settingLabel(a.entry).localeCompare(settingLabel(b.entry)))
    .slice(0, 12)
    .map((s) => s.entry);
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
  settings_api: "Company Settings",
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

export const GROUP_BLURB = {
  // ── Payroll ──
  "payroll.calendar": "How often people are paid, and the day each month that attendance stops counting.",
  "payroll.engine": "The two rules behind every amount on a payslip: what an unpaid day costs, and how figures are rounded.",
  "payroll.authority": "What a manager may see of their team’s pay, and whether their changes need HR.",
  "payroll.loans": "Advances to staff: the most that can be lent, and how the monthly repayment is taken.",
  "payroll.tax_admin": "Which tax regime people start on, and the window they have to declare and prove investments.",
  "payroll.reimbursements": "Who signs off an expense claim before it is paid.",
  "payroll.benefits": "Whether benefit plans are charged to the employee through payroll.",
  "payroll.payslips": "When payslips reach people, and whether they also arrive by email.",
  "payroll.exits": "How a leaver’s last payment is worked out — unused leave, and short notice.",
  "payroll.automation": "What payroll does on its own each month, without anyone starting it.",
  "payroll.deprecated": "Kept on file from an older release. Nothing acts on these.",

  // ── Tax & legal deductions ──
  "statutory.pf": "Provident Fund: who it applies to, and how the contribution is worked out.",
  "statutory.esi": "ESI: who it covers, and how the contribution is worked out.",
  "statutory.pt": "Professional tax: which state’s rates a person is charged under.",
  "statutory.income_tax": "Income tax: how much is held back each month, and how it is rounded.",

  // ── Documents ──
  "documents.authority": "Who may issue, approve and publish a document, and what a manager may do alone.",
  "documents.storage": "File size and type limits, and how much space the organisation may use.",
  "documents.retention": "How long documents and letters are kept before they are deleted for good.",
  "documents.lifecycle": "What happens to a document as it is drafted, checked, published and expires.",
  "documents.acknowledgement": "Whether people must confirm they have read a document, and how long they get.",
  "documents.notifications": "Who is told about a document, and when the reminders go out.",
  "documents.requests": "How a request for a document is handled, and how quickly it is promised.",
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

/** The unit, drawn on the field itself. `null` when there is nothing to draw. */
export function unitAffix(entry) {
  const unit = entry?.unit;
  if (!unit) return null;
  if (unit === "INR") return { prefix: "₹" };
  if (unit === "percent") return { suffix: "%" };
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
    if (!label.includes(q) && !screen.includes(q) && !blurb.includes(q)) continue;
    if (!byRoute.has(route.path)) {
      byRoute.set(route.path, { route, module_key: surface.module_key, matches: [] });
    }
    const bucket = byRoute.get(route.path);
    if (label.includes(q) && !bucket.matches.includes(surface.label)) bucket.matches.push(surface.label);
  }
  return [...byRoute.values()].slice(0, 6);
}

/* ─── How a setting is laid out inside its card ────────────────────────────
   A card is the full width of the page now (see OrgSettingsPage: the wall is
   one column), so its fields sit in a grid that grows with the screen — one
   per line on a phone, two from `sm`, three from `xl`. Which fields can take
   a single cell and which need more is decided from the catalogue rather than
   from a list of keys. */

/**
 * A yes/no, drawn as a switch on the SAME line as its label instead of a
 * control under it (user decision, 2026-10-10). A switch states what it is
 * set to in 44px, which leaves the rest of the line for the one sentence
 * saying what turning it on actually does — the On/Off pill pair it replaced
 * took a whole row to say less.
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
  // A chip list takes the whole row: two of them side by side in a 3-column
  // grid left a ragged third column (the Company & Billing card is exactly
  // two of them), and the control caps its own input width instead.
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
export function fieldShelves(entries, min = 6) {
  const rows = entries || [];
  const flat = [{ key: "all", label: null, rows }];
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
  // A shelf leads with its own on/off switch: it decides whether anything
  // under it applies at all, and reading "Employee share" before "Provident
  // Fund: off" is reading the answer before the question. Everything else
  // keeps the catalogue's order, which is the order the registry lists it in.
  const lead = (row) => (/_(enabled|required|payable)$/.test(row.key || "") ? 0 : 1);
  for (const token of order) {
    const group = byToken.get(token);
    const named = !STOP_TOKENS.has(token) || SHELF_LABEL[token];
    if (group.length >= 2 && named) {
      const sorted = group.map((r, i) => [r, i]).sort((a, b) => lead(a[0]) - lead(b[0]) || a[1] - b[1]);
      shelves.push({ key: token, label: shelfLabel(token), rows: sorted.map(([r]) => r) });
    }
    else leftovers.push(...group);
  }
  // Not a tidier read: leave the card alone rather than hanging one heading
  // over most of it.
  if (shelves.length < 2) return flat;
  if (leftovers.length > 0) shelves.push({ key: "other", label: "Other", rows: leftovers });
  return shelves;
}

/* ─── THE WALL IS ONE COLUMN ───────────────────────────────────────────────
   `packColumns` and `cardWeight` used to live here: they cut the cards into
   two columns and chose the boundary from how tall each card was about to be,
   so the page re-levelled itself as cards opened. Both are deleted, because
   re-levelling is exactly what the user then reported as a bug — opening one
   card moved the boundary, and a card nobody had touched jumped from the foot
   of one column to the head of the other ("notification tab jumping from
   position", 2026-10-10).

   There is no two-column layout that both fills itself and holds still: a
   fixed split leaves a card-sized hole beside an open card, and any split that
   closes the hole has to move a card to do it. One full-width column has
   neither failure — closed cards are a single height, so the stack is flush,
   and opening one pushes the rest down without moving anything sideways. The
   width it gives back is spent inside the card (`fieldSpan`: three fields to a
   line from `xl`), which is where it was wanted.

   If a later change wants two columns again, it is buying one of those two
   bugs back with it. See OrgSettingsPage. */

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

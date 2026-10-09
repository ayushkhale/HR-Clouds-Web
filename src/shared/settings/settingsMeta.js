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
// master tab a module belongs to, and how to print a value that arrives as a
// bare JSON scalar (§4: no raw enum, §5: never a dash, §6: plain words).
// ─────────────────────────────────────────────────────────────────────────────

import { humanize } from "../attendance/enums";
import { formatMoney } from "../utils/formatUtils";
import { fmtDate } from "../attendance/dates";

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

/**
 * The tabs to show, in the brief's order, with any unknown module appended
 * rather than dropped. Only modules that actually have something to show get a
 * tab — an empty tab is a dead end.
 */
export function tabsFor(moduleKeys) {
  const present = new Set(moduleKeys.filter(Boolean));
  const known = MODULE_TABS.filter((tab) => present.has(tab.key));
  const extra = [...present]
    .filter((key) => !MODULE_LABEL[key])
    .map((key) => ({ key, label: moduleLabel(key) }));
  return [...known, ...extra];
}

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

/* ─── Risk and timing, in words ────────────────────────────────────────────
   Shown on the settings a reader should think twice about. `low` gets nothing:
   a badge on everything is a badge on nothing. */
export const RISK_META = {
  high: { label: "Changes carefully", tone: "rose" },
  medium: { label: "Affects how pay or leave is worked out", tone: "amber" },
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
    const label = String(entry.label || "").toLowerCase();
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
    .sort((a, b) => b.score - a.score || String(a.entry.label).localeCompare(String(b.entry.label)))
    .slice(0, 12)
    .map((s) => s.entry);
}

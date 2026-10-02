// ─────────────────────────────────────────────────────────────────────────────
// profileSetupMeta.js — the eight job fields an HR fills in about themselves,
// the vocabularies the server accepts for them, and the one function that turns
// form state into a legal request body.
//
// Why this screen exists at all: the person who registers an organisation is
// provisioned BEFORE the organisation has any structure — no offices, no
// departments — so their own staff record is created blank. Every other writer
// of these fields refuses a self-edit, and a new org usually has exactly one
// HR, so until now nobody in the building could fill them. The blank that
// hurts is `joining_date`: without it that person cannot be given a leave
// policy (`NO_JOINING_DATE`) and cannot be included in a payroll run.
//
// Four traps are encoded here rather than left to the form (CLAUDE.md §1):
//
//  · OMIT, NEVER NULL. The endpoint rejects `null` and `""` for every field —
//    it fills blanks and never clears them. A form that sends `{ gender: "" }`
//    for an untouched select gets a 400 for the whole call, taking the fields
//    that WERE filled down with it. `jobProfileBody()` is the only way to build
//    a body, and it drops empties.
//
//  · EVERY FIELD IS FILL-ONCE. The write is guarded in SQL on "the column is
//    still NULL", so the server is the only authority on what is still
//    editable. The form is driven by `missing_fields` / `locked_fields` from
//    the server and NEVER by this file's field list — which is why
//    `setupFields()` takes the status and returns a subset, and why
//    `jobProfileBody()` takes `missing` and refuses to send anything outside
//    it. A locked field sent back is a 409 that fails the whole call.
//
//  · THE VOCABULARIES ARE THE DB's, NOT THE UI's. `work_mode` is `on-site`,
//    with the hyphen, not `office` — which is what `shared/attendance/enums.js`
//    calls the same idea on attendance screens, where the value comes from a
//    different column. Don't "tidy" these to match; this is the enum the
//    organisation module validates against.
//
//  · NEVER GUESS A JOINING DATE. No "today" default, no date from the account's
//    creation. It is fill-once and feeds payroll proration, leave accrual and
//    tenure, so a wrong value can only be corrected by ANOTHER HR through
//    `PATCH /organizations/employees/:id/hr-fields` — which a one-HR org does
//    not have.
//
// Contract: `md_organization/4_org_employee_api.md` §11.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtDate, parseYMDLocal, ymdOnly } from "../attendance/dates.js";

/* ─── The vocabularies the server validates against ───────────────────────── */

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];

// `on-site` carries a hyphen and is NOT `office`. See the header.
export const WORK_MODE_OPTIONS = [
  { value: "on-site", label: "At the office" },
  { value: "remote", label: "From home" },
  { value: "hybrid", label: "Some of both" },
  { value: "field", label: "Out in the field" },
];

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// The server takes any string up to 50 characters here. A fixed list is used
// anyway: leave types can be gated on marital status, and a gate can only match
// values it recognises — free text would let one person type "Married" and the
// next "married" and quietly leave the second outside the rule. Decision
// recorded 2026-10-02; widen the list rather than reopening it to free text.
export const MARITAL_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/** The earliest joining date the server accepts. */
export const MIN_JOINING_DATE = "1950-01-01";

/* ─── The fields, in the order the server lists them ──────────────────────── */

// `kind` drives the control; `span` puts the long ones across both columns of
// the form's grid so nobody has to scroll (CLAUDE.md §3).
// `label` is the form's own question; `short` is the same field named as a noun,
// for the checklist that lists several of them in one sentence.
export const SETUP_FIELDS = [
  {
    key: "joining_date",
    kind: "date",
    label: "The day you joined",
    short: "joining date",
    // Said plainly, because this is the field that unblocks two other modules.
    note: "Needed before leave and payroll can include you.",
  },
  {
    key: "location_id",
    kind: "location",
    label: "Which office you work from",
    short: "office",
    span: true,
  },
  {
    key: "department_id",
    kind: "department",
    label: "Which department you’re in",
    short: "department",
    span: true,
  },
  {
    key: "designation",
    kind: "text",
    label: "Your job title",
    short: "job title",
    placeholder: "e.g. Head of People",
    maxLength: 150,
    minLength: 2,
  },
  { key: "employment_type", kind: "select", label: "How you’re employed", short: "employment type", options: EMPLOYMENT_TYPE_OPTIONS },
  { key: "work_mode", kind: "select", label: "Where you usually work", short: "work mode", options: WORK_MODE_OPTIONS },
  { key: "gender", kind: "select", label: "Gender", short: "gender", options: GENDER_OPTIONS },
  { key: "marital_status", kind: "select", label: "Marital status", short: "marital status", options: MARITAL_STATUS_OPTIONS },
];

const FIELD_BY_KEY = Object.fromEntries(SETUP_FIELDS.map((f) => [f.key, f]));

/** Every key this endpoint will accept — anything else is stripped server-side. */
export const SETUP_FIELD_KEYS = SETUP_FIELDS.map((f) => f.key);

/* ─── Reading the status ──────────────────────────────────────────────────── */

const strList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string") : []);

/**
 * The setup readout, tolerant of a server that hasn't shipped it yet.
 *
 * `missing` is intersected with the keys this build knows how to render: a
 * field the server starts asking for that has no control here would otherwise
 * sit in the checklist for ever, uncompletable. It is reported separately as
 * `unknownMissing` so the card can say the profile isn't finished without
 * pretending it can finish it.
 */
export function normalizeSetupStatus(res) {
  const data = res?.data ?? res ?? {};
  const rawMissing = strList(data.missing_fields);
  const org = data.org_structure || {};
  const missing = rawMissing.filter((k) => FIELD_BY_KEY[k]);
  return {
    // Trusted as sent: `is_complete` is the server's own summary, and a field
    // we can't render must not read as "all done".
    isComplete: data.is_complete === true,
    missing,
    unknownMissing: rawMissing.filter((k) => !FIELD_BY_KEY[k]),
    locked: strList(data.locked_fields),
    values: data.current_values && typeof data.current_values === "object" ? data.current_values : {},
    canSetLocation: org.can_set_location === true,
    canSetDepartment: org.can_set_department === true,
    locationsCount: Number(org.locations_count) || 0,
    departmentsCount: Number(org.departments_count) || 0,
  };
}

/** The fields to render as editable, in the server's order, with their config. */
export function setupFields(status) {
  const order = new Map(SETUP_FIELDS.map((f, i) => [f.key, i]));
  return [...(status?.missing || [])]
    .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
    .map((key) => FIELD_BY_KEY[key])
    .filter(Boolean);
}

/** The fields already on file, as `{ field, value }` for a read-only list. */
export function lockedFields(status) {
  return (status?.locked || [])
    .map((key) => FIELD_BY_KEY[key])
    .filter(Boolean)
    .map((field) => ({ field, value: status?.values?.[field.key] ?? null }));
}

/**
 * What the wizard still has to walk, in order. An office and a department have
 * to exist in the organisation before they can be picked, and a brand-new org
 * has neither — so those are steps of their own, not disabled selects.
 */
export function setupSteps(status) {
  if (!status) return [];
  const needs = (key) => status.missing.includes(key);
  const steps = [];
  if (needs("location_id") && !status.canSetLocation) {
    steps.push({
      key: "location",
      title: "Add your first office",
      body: "Offices are what attendance checks people in against, and your own record points at one.",
      // Offices live under Attendance, not Organisation — they exist for
      // geofenced clock-in, which is why the route reads the way it does.
      to: "/dashboard/hr/attendance/locations",
      cta: "Add an office",
    });
  }
  if (needs("department_id") && !status.canSetDepartment) {
    steps.push({
      key: "department",
      title: "Add your first department",
      body: "Departments are how rosters, reports and approvals are grouped.",
      to: "/dashboard/hr/departments",
      cta: "Add a department",
    });
  }
  return steps;
}

/**
 * True when every remaining field can be filled from the form right now. A
 * `location_id` or `department_id` with nothing to pick from cannot, and the
 * form must not offer an empty select — `setupSteps()` sends the user to create
 * one instead.
 */
export const fieldIsReady = (key, status) => {
  if (key === "location_id") return !!status?.canSetLocation;
  if (key === "department_id") return !!status?.canSetDepartment;
  return true;
};

/* ─── Validation, mirroring the server's ──────────────────────────────────── */

/**
 * Why this value can't be sent, or null. Checked here so a bad field is caught
 * beside its own label rather than as a VALIDATION_ERROR that says nothing
 * about which of eight fields was wrong.
 * @param {string} key
 * @param {string} value  raw form value; "" means untouched
 * @param {string} today  today as YYYY-MM-DD, in the user's own timezone
 */
export function fieldError(key, value, today) {
  const raw = typeof value === "string" ? value.trim() : value;
  if (!raw) return null; // untouched is allowed — it just isn't sent
  const field = FIELD_BY_KEY[key];
  if (!field) return null;

  if (key === "joining_date") {
    const ymd = ymdOnly(raw);
    // parseYMDLocal rather than the regex alone: `ymdOnly` is shape-only and
    // happily passes 2026-02-31 through, which the server then rejects as a
    // VALIDATION_ERROR with no clue which field it meant.
    if (!ymd || !parseYMDLocal(ymd)) return "Use a real date.";
    if (today && ymd > today) return "This can’t be in the future.";
    if (ymd < MIN_JOINING_DATE) return "That’s too far back to be right.";
    return null;
  }
  if (key === "designation") {
    if (raw.length < field.minLength) return "Write at least two characters.";
    if (raw.length > field.maxLength) return `Keep this under ${field.maxLength} characters.`;
    return null;
  }
  if (key === "marital_status" && raw.length > 50) return "Keep this under 50 characters.";
  if (field.options && !field.options.some((o) => o.value === raw)) return "Choose one of the options.";
  return null;
}

/**
 * Form state → a legal request body, or null when there is nothing to send.
 *
 * This is the only place allowed to build this body. It enforces all three of
 * the endpoint's hard rules at once: empties are omitted rather than nulled,
 * nothing outside `missing` is included (so a field the server has since locked
 * can't 409 the whole call), and `reason` is dropped unless a real field rides
 * with it.
 *
 * @param {Record<string,string>} form
 * @param {string[]} missing  `missing_fields` from the latest status
 * @param {string} [reason]   optional audit note
 */
export function jobProfileBody(form, missing, reason = "") {
  const allowed = new Set((missing || []).filter((k) => FIELD_BY_KEY[k]));
  const body = {};
  for (const key of SETUP_FIELD_KEYS) {
    if (!allowed.has(key)) continue;
    const value = typeof form?.[key] === "string" ? form[key].trim() : form?.[key];
    if (value === "" || value == null) continue;
    if (key === "joining_date") {
      const ymd = ymdOnly(value);
      if (!ymd) continue;
      body[key] = ymd;
      continue;
    }
    body[key] = value;
  }
  if (Object.keys(body).length === 0) return null;
  const note = typeof reason === "string" ? reason.trim() : "";
  if (note.length >= 3) body.reason = note.slice(0, 500);
  return body;
}

/* ─── Printing a value back ───────────────────────────────────────────────── */

/**
 * A value from `current_values` as a reader should see it. Ids are never shown
 * (CLAUDE.md §4), so `department_id` / `location_id` resolve through the names
 * the profile carries alongside them — and when they can't, the field says it
 * is on file rather than printing a UUID.
 */
export function setupValueLabel(key, value, { departmentName = "", locationName = "" } = {}) {
  if (value == null || value === "") return "";
  if (key === "department_id") return departmentName || "On file";
  if (key === "location_id") return locationName || "On file";
  if (key === "joining_date") return fmtDate(ymdOnly(value), { day: "numeric", month: "short", year: "numeric" }, value);
  const field = FIELD_BY_KEY[key];
  const option = field?.options?.find((o) => o.value === value);
  return option ? option.label : String(value);
}

/** The label for one field, for a caller that only has the key. */
export const setupFieldLabel = (key) => FIELD_BY_KEY[key]?.label || key;

/** The field as a plain noun, for listing several in one sentence. */
export const setupFieldShort = (key) => FIELD_BY_KEY[key]?.short || setupFieldLabel(key);

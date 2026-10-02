// ─────────────────────────────────────────────────────────────────────────────
// settingsMeta.js — What the Payroll Settings page is allowed to send back.
//
// `PUT /payroll/hr/settings` (registry #23) is a PARTIAL update, and the page
// used to PUT the whole settings object it was holding. Two things went wrong
// with that:
//
// · The page defaults every Phase 7 key into its form state, including the
//   nullable ones (a leave-payout cap, the components). Those defaulted to the
//   empty string, so a page nobody had touched still sent
//   `fnf_encashment_max_days: ""` and the whole save failed with
//   `"fnf_encashment_max_days" must be a number` — on a field that isn't even
//   rendered. (Reported 2026-10-02.)
// · Sending keys the server has never heard of fails the save as a whole, so a
//   default for a feature this backend lacks must stay on the client.
//
// So: send the CHANGED keys only, with an emptied nullable box going out as
// `null` (the column is nullable — that is how a cap is cleared) and a key the
// user never touched never going out at all.
// ─────────────────────────────────────────────────────────────────────────────

import { withoutInertPdfSettings } from "./pdfRenderMeta";

/**
 * Keys where an empty box means "no limit / not chosen", not zero and not "".
 * The server stores these as a nullable integer or a nullable uuid, and Joi
 * rejects `""` for both.
 */
export const BLANKABLE_SETTINGS = [
  "fnf_encashment_max_days",
  "fnf_encashment_component_id",
  "fnf_notice_recovery_component_id",
  "compoff_encashment_max_days_per_fy",
  "compoff_encashment_component_id",
];

/**
 * Number boxes the server stores as NOT NULL. An empty one is not a choice —
 * it is a half-finished edit, and sending "" fails the whole request the same
 * way the blank payout cap did. The page shows the problem in the box instead
 * (the same treatment the PDF cache numbers get).
 */
export const REQUIRED_NUMBER_SETTINGS = {
  fnf_default_notice_period_days: "Standard notice period",
};

/** The label of the first required number left blank, or "". */
export function blankRequiredNumber(form) {
  for (const [key, label] of Object.entries(REQUIRED_NUMBER_SETTINGS)) {
    if (!(key in (form || {}))) continue;
    const v = form[key];
    if (v === "" || v === null || v === undefined) return label;
  }
  return "";
}

/** `""` / `undefined` → `null` for the nullable keys; everything else as typed. */
function outgoing(key, value) {
  if (!BLANKABLE_SETTINGS.includes(key)) return value;
  if (value === "" || value === undefined) return null;
  return value;
}

const same = (a, b) => {
  if (a === b) return true;
  // Arrays (the leave-type codes) and the odd nested object compare by value.
  if (typeof a === "object" || typeof b === "object") {
    try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
  }
  // "2" from a number box and 2 from the server are the same setting.
  if (a == null || b == null || a === "" || b === "") return (a ?? "") === (b ?? "");
  if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) return Number(a) === Number(b);
  return false;
};

/**
 * The keys to PUT: what is in the form and differs from what the server last
 * gave us. `saved` is the RAW response, never the defaulted copy — a default
 * the user left alone is not a change.
 *
 * @param {object} form    current form state
 * @param {object} saved   the settings object as the server returned it
 * @returns {object} the patch, which may be empty
 */
export function settingsPatch(form, saved) {
  const current = withoutInertPdfSettings(form || {});
  const before = saved || {};
  const patch = {};
  for (const [key, raw] of Object.entries(current)) {
    // A key the server didn't return is a setting this backend doesn't store —
    // the page keeps a client-side default for it so the controls have
    // something to show, but writing it would fail the whole request. The
    // controls for those keys are hidden anyway (serverKnows).
    if (!(key in before)) continue;
    const value = outgoing(key, raw);
    // Belt and braces: a blank box on a key that is NOT nullable can never go
    // out. `Number("")` is 0 and Joi wants a number, so "" would fail the whole
    // save — which is the bug this file exists to prevent. The stored value
    // stands and the page blocks the save with a message naming the field.
    if (value === "") continue;
    if (same(value, outgoing(key, before[key]))) continue;
    patch[key] = value;
  }
  return patch;
}


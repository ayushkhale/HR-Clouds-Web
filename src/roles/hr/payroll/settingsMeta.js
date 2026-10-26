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
//
// ─── AND NOTHING GOES OUT FROM AN UNFINISHED FORM (§11, 15 Oct 2026) ─────
// `settingProblems` is the other half of the same job. The rules above keep a
// half-finished box from reaching the server; this keeps the person from
// wondering why their change didn’t save. Both read the CATALOGUE
// (payrollSettingsCatalogue.js) rather than a list of keys kept here, which is
// what makes "the page offers every setting the server stores" safe: a field
// added there is validated and blankable on the same day, with nothing to
// remember.
// ─────────────────────────────────────────────────────────────────────────────

import { withoutInertPdfSettings } from "./pdfRenderMeta";
import { PAYROLL_SETTING_GROUPS, allFields } from "./payrollSettingsCatalogue";
import { settingLabel } from "../../../shared/settings/settingsBlurbs";

/**
 * Keys where an empty box means "no limit / not chosen", not zero and not "".
 * The server stores these as a nullable integer or a nullable uuid, and Joi
 * rejects `""` for both.
 *
 * READ OFF THE CATALOGUE, not typed out again. It was a hand-kept list of
 * five until 15 Oct 2026, and the sixth (`loan_max_amount`, "no amount limit")
 * arrived with the fields that had been missing from the page — had the list
 * stayed hand-kept, clearing that box would have gone out as `""`, been
 * dropped by `settingsPatch` below, and saved nothing at all while the page
 * said it had.
 */
export const BLANKABLE_SETTINGS = allFields(PAYROLL_SETTING_GROUPS)
  .filter((entry) => entry.nullable)
  .map((entry) => entry.key);

/* ─── WHY A BOX CAN’T BE SAVED, IN OUR WORDS ────────────────────────
   §11: the press does the checking, and the person reads OUR sentence rather
   than the server’s. The server’s refusal names the column
   (`"fnf_encashment_max_days" must be a number`), which is both an API key on
   screen and a field the reader may not even be able to see — one bad box
   fails the whole PUT, including the eleven settings they did finish.

   One message per rule, each saying what to type rather than what went wrong:
   a range says the range, because the range is the answer. */

const blank = (value) => value === "" || value === null || value === undefined;

/** Why this one value can’t be sent, or "". */
export function settingProblem(entry, value) {
  if (!entry) return "";
  if (entry.readOnly || entry.data_type === "boolean") return "";

  if (blank(value)) {
    // A nullable setting is MEANT to be clearable — an empty cap is "no cap",
    // an empty component is "not chosen" — so an empty box is an answer.
    if (entry.nullable) return "";
    if (entry.control) return "Choose one.";
    return "This needs a value.";
  }

  if (entry.data_type === "integer" || entry.data_type === "decimal") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "Enter a number.";
    if (entry.data_type === "integer" && !Number.isInteger(n)) return "Whole numbers only.";
    const { min, max } = entry.range || {};
    if (min !== undefined && max !== undefined && (n < min || n > max)) {
      return `Enter a number between ${min} and ${max}.`;
    }
    if (min !== undefined && n < min) return `Enter ${min} or more.`;
    if (max !== undefined && n > max) return `Enter ${max} or less.`;
  }

  return "";
}

/**
 * Every box that can’t be saved — `{ [payloadKey]: "what is wrong" }`, empty
 * when the form may be sent (§11’s own shape, so `focusFirstProblem` and
 * `hasProblems` work on it unchanged).
 *
 * Only the fields the page actually DREW are checked: `groups` comes from
 * `resolveGroups(saved)`, so a key this server doesn’t store can’t block a
 * save the way a hidden blank payout cap once did (2026-10-02).
 */
export function settingProblems(form, groups) {
  const problems = {};
  for (const entry of allFields(groups)) {
    const why = settingProblem(entry, (form || {})[entry.key]);
    if (why) problems[entry.key] = why;
  }
  return problems;
}

/** What to call the field a problem is on, for the message under the button. */
export const problemFieldLabel = (key) =>
  settingLabel(allFields(PAYROLL_SETTING_GROUPS).find((entry) => entry.key === key) || { key });

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

/**
 * The keys the PERSON has changed — which is `settingsPatch` plus the ones it
 * refuses to send.
 *
 * The two lists differ in exactly one case, and it is the one this file exists
 * for: an emptied box on a NOT NULL setting. That is a change (so the card
 * highlights it, the dock counts it and the save stops on it) but it can never
 * go out as `""`. Counting from the patch alone is why a blank required box
 * once read as "everything on this page is saved" while the old value sat in
 * the database.
 *
 * @returns {string[]} keys, in the form's own order
 */
export function touchedSettings(form, saved) {
  const current = withoutInertPdfSettings(form || {});
  const before = saved || {};
  const keys = [];
  for (const [key, raw] of Object.entries(current)) {
    if (!(key in before)) continue;
    if (same(outgoing(key, raw), outgoing(key, before[key]))) continue;
    keys.push(key);
  }
  return keys;
}


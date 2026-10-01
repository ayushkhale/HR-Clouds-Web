// ─────────────────────────────────────────────────────────────────────────────
// letterFieldMatrix.js — Which details HR types into each letter, which come
// from the person's record, and which may be issued automatically.
//
// Source of truth: public/ref docs/new updates/
// 2026-09-30_letter_template_redesign_and_catalog_expansion.md §2 and §9
// ("Generated from the registry on 2026-09-30"). The backend asks the frontend
// to keep this table, keyed by template code, because no endpoint returns it:
//
//  · #136's `template.fields` describes the SAVED-DEFAULT keys (#137 / #138 —
//    `place_of_issue`, `hr_contact_line`, …), NOT what #139 accepts. The issue
//    form used to be built from it, so Experience Letter offered `place_of_issue`
//    (refused by #139) and never offered `closing_note`. That was the bug.
//  · `required_fields` / `optional_fields` mix record facts with typed wording,
//    and #139 refuses a fact with `422 LETTER_FIELD_NOT_OVERRIDABLE`. Guessing
//    facts from key names (letterIssueMeta's DERIVED_FACT_PATTERNS) got the six
//    new templates badly wrong — `effective_date_text`, `previous_designation`,
//    `offer_validity_date_text` all read as "facts" and vanished from the form.
//
// So a template listed here is built from this table, and only a code this
// table has never heard of (one the platform adds later) falls back to the old
// guessing, with the server's refusal memory still behind it. When #135 reports
// a `current_version` other than the one below, the table may be stale — the
// forms keep working (the refusal memory still protects them) and this is the
// file to re-check.
//
// Every typed value is printed EXACTLY as sent — the server formats none of
// them. So the hints show the shape to type ("INR 1,42,350", "15 October
// 2026"), and the one number (`response_deadline_days`) is sent as a number.
// ─────────────────────────────────────────────────────────────────────────────

export const LETTER_MATRIX_VERSION = 1;

/**
 * The typed wording, by key, shared across templates so the same detail reads
 * the same everywhere (CLAUDE.md §6: the consequence, not the mechanism).
 *
 * `kind: "number"` is the only non-text field; `min`/`max` are its value range.
 * `long` makes the box a paragraph.
 */
const HR_FIELDS = {
  closing_note: { label: "Closing sentence", help: "The last line before the signature.", long: true },
  probation_text: { label: "Wait after joining", help: "How long before the job is confirmed, as it should read — for example “6 months”." },
  purpose_text: { label: "What the letter is for", help: "Printed in the letter. Say where it is going — a bank, an embassy, a landlord.", long: true },
  incident_summary: { label: "What happened", help: "Printed as written. Say what happened and when.", long: true },
  expected_correction: { label: "What has to change", help: "What you expect from them from now on.", long: true },
  response_due_text: { label: "Reply needed by", help: "Printed as written — for example “within 7 days” or “by 15 October 2026”." },
  allegation_summary: { label: "What the notice is about", help: "Printed as written. Describe what happened and when, plainly and specifically.", long: true },
  response_deadline_days: { label: "Days to reply", help: "Printed as “Within N days”. From 1 to 90.", kind: "number", min: 1, max: 90 },
  pip_duration_text: { label: "How long the plan runs", help: "Printed as written — for example “60 days”." },
  plan_summary: { label: "What has to improve", help: "The goals of the plan, in plain words.", long: true },
  milestones_text: { label: "Checkpoints along the way", help: "Optional. The dates or stages at which progress is reviewed.", long: true },
  review_date_text: { label: "Final review date", help: "Printed as written — for example “15 December 2026”." },
  net_payable_amount_text: { label: "Net amount payable", help: "Printed exactly as typed — for example “INR 1,42,350”. Check it against their final pay statement." },
  settlement_notes: { label: "Notes on the settlement", help: "Optional. Anything the person should know about how the amount was reached.", long: true },
  payment_mode_text: { label: "How it is paid", help: "Printed as written — for example “Bank transfer (NEFT)”." },
  offer_validity_date_text: { label: "Offer open until", help: "Printed as written — for example “15 October 2026”." },
  previous_designation: { label: "Job title before the promotion", help: "Their old title. The new one is taken from their profile." },
  effective_date_text: { label: "Takes effect from", help: "Printed as written — for example “01 October 2026”." },
  previous_annual_ctc_text: { label: "Yearly pay before the revision", help: "Optional. Printed exactly as typed — for example “INR 12,00,000”." },
};

const hr = (required = [], optional = []) => [
  ...required.map((key) => ({ key, required: true })),
  ...optional.map((key) => ({ key, required: false })),
];

// Why a template can't be issued automatically on exit (§4). Auto-issue runs
// with nobody at the keyboard, so a letter that states pay or needs typed
// wording would either quote an unreviewed salary or fail on every exit.
const COMPENSATION = "states pay";
const NEEDS_TYPING = "needs details typed in";

/**
 * The fifteen letters as of registry version 1.
 *
 * `derived` / `derivedOptional` are the record facts it prints (optional ones
 * are simply left out when missing). `saved` are the #137 default keys.
 * `reminder` is said BEFORE issuing, because the letter prints the record as it
 * stands — e.g. a promotion letter prints the CURRENT title as the new one.
 */
export const LETTER_FIELD_MATRIX = {
  experience_letter: {
    docType: "experience_letter_issued",
    hr: hr([], ["closing_note"]),
    derived: ["employee_name", "designation", "joining_date_text", "relieving_date_text"],
    derivedOptional: ["department_name", "employee_code"],
    saved: ["place_of_issue", "hr_contact_line"],
    autoIssue: true,
  },
  appointment_letter: {
    docType: "appointment_letter_issued",
    hr: hr([], ["probation_text", "closing_note"]),
    derived: ["employee_name", "designation", "joining_date_text", "annual_ctc_text"],
    derivedOptional: ["department_name", "employee_code", "reporting_manager", "compensation_lines"],
    saved: ["place_of_issue", "offer_reference_note"],
    autoIssue: false,
    autoIssueBlocker: COMPENSATION,
  },
  bonafide_letter: {
    docType: "bonafide_letter_issued",
    hr: hr([], ["purpose_text"]),
    derived: ["employee_name", "designation", "employee_code"],
    derivedOptional: [],
    saved: ["place_of_issue"],
    autoIssue: true,
  },
  relieving_letter: {
    docType: "relieving_letter_issued",
    hr: hr([], ["closing_note"]),
    derived: ["employee_name", "designation", "joining_date_text", "relieving_date_text"],
    derivedOptional: ["department_name", "employee_code"],
    saved: ["place_of_issue", "hr_contact_line"],
    autoIssue: true,
  },
  confirmation_letter: {
    docType: "confirmation_letter_issued",
    hr: hr([], ["closing_note"]),
    derived: ["employee_name", "designation", "joining_date_text"],
    derivedOptional: ["department_name", "employee_code"],
    saved: ["place_of_issue", "hr_contact_line"],
    autoIssue: true,
  },
  warning_letter: {
    docType: "warning_letter",
    hr: hr([], ["incident_summary", "expected_correction", "response_due_text"]),
    derived: ["employee_name", "employee_code", "designation"],
    derivedOptional: ["department_name"],
    saved: ["place_of_issue", "hr_contact_line"],
    autoIssue: true,
  },
  internship_certificate: {
    docType: "internship_certificate_issued",
    hr: hr([], ["closing_note"]),
    derived: ["employee_name", "designation", "joining_date_text", "relieving_date_text"],
    derivedOptional: ["department_name"],
    saved: ["place_of_issue", "hr_contact_line"],
    autoIssue: true,
  },
  noc: {
    docType: "noc_issued",
    hr: hr([], ["purpose_text"]),
    derived: ["employee_name", "employee_code", "designation"],
    derivedOptional: [],
    saved: ["place_of_issue"],
    autoIssue: true,
  },
  salary_certificate: {
    docType: "salary_certificate_issued",
    hr: hr([], ["purpose_text"]),
    derived: ["employee_name", "employee_code", "designation", "joining_date_text", "annual_ctc_text"],
    derivedOptional: ["compensation_lines"],
    saved: ["place_of_issue", "hr_contact_line"],
    autoIssue: false,
    autoIssueBlocker: COMPENSATION,
  },
  show_cause_notice: {
    docType: "show_cause_notice",
    hr: hr(["allegation_summary", "response_deadline_days"]),
    derived: ["employee_name", "employee_code", "designation", "department_name"],
    derivedOptional: [],
    saved: ["response_deadline_days"],
    autoIssue: false,
    autoIssueBlocker: NEEDS_TYPING,
    reminder: "The person needs a department on their profile — one chosen from the list, not typed in — or the notice can’t be issued.",
  },
  performance_improvement_plan: {
    docType: "performance_improvement_plan",
    hr: hr(["pip_duration_text", "plan_summary"], ["milestones_text", "review_date_text"]),
    derived: ["employee_name", "employee_code", "designation", "department_name"],
    derivedOptional: [],
    saved: ["pip_duration_text"],
    autoIssue: false,
    autoIssueBlocker: NEEDS_TYPING,
    reminder: "The person needs a department on their profile — one chosen from the list, not typed in — or the plan can’t be issued.",
  },
  full_and_final_statement: {
    docType: "full_and_final_statement",
    hr: hr(["net_payable_amount_text"], ["settlement_notes", "payment_mode_text"]),
    derived: ["employee_name", "employee_code", "designation", "relieving_date_text"],
    derivedOptional: [],
    saved: ["payment_mode_text"],
    autoIssue: false,
    autoIssueBlocker: NEEDS_TYPING,
    reminder: "The person needs an exit recorded in Payroll → Exits; the relieving date printed is that exit’s last working day. This letter states the amount you type — the calculated settlement statement is downloaded from their exit instead.",
  },
  offer_letter: {
    docType: "offer_letter_issued",
    hr: hr(["offer_validity_date_text"], ["closing_note"]),
    derived: ["employee_name", "designation", "joining_date_text", "annual_ctc_text"],
    derivedOptional: ["department_name", "reporting_manager", "compensation_lines"],
    saved: ["closing_note"],
    autoIssue: false,
    autoIssueBlocker: COMPENSATION,
    reminder: "The person must already be in your organisation, with a joining date and an approved salary. An offer to somebody who hasn’t joined the app yet can’t be issued.",
  },
  promotion_letter: {
    docType: "promotion_letter_issued",
    hr: hr(["previous_designation", "effective_date_text"], ["closing_note"]),
    derived: ["employee_name", "employee_code", "designation"],
    derivedOptional: ["department_name", "revised_annual_ctc_text"],
    saved: ["closing_note"],
    autoIssue: false,
    autoIssueBlocker: COMPENSATION,
    reminder: "The letter prints their CURRENT job title as the new one. Change their title on their profile first, and type the old one below.",
  },
  salary_revision_letter: {
    docType: "salary_revision_letter_issued",
    hr: hr(["effective_date_text"], ["previous_annual_ctc_text", "closing_note"]),
    derived: ["employee_name", "employee_code", "designation", "revised_annual_ctc_text"],
    derivedOptional: ["compensation_lines"],
    saved: ["closing_note"],
    autoIssue: false,
    autoIssueBlocker: COMPENSATION,
    reminder: "The letter prints their CURRENT salary as the revised one. Apply the new salary first, then issue the letter.",
  },
};

/** The matrix entry for a template, or null for a code this table doesn't know. */
export const letterMatrix = (code) => LETTER_FIELD_MATRIX[String(code || "")] || null;

/** The typed-field descriptor for a key (label, help, kind…), with a readable fallback. */
export const hrFieldMeta = (key) => HR_FIELDS[key] || null;

/** What to check before issuing this letter, or "". */
export const letterIssueReminder = (code) => letterMatrix(code)?.reminder || "";

/**
 * May this letter be issued automatically on exit (setting
 * `letter_auto_issue_on_exit`)? Unknown codes are allowed — the server is the
 * authority and answers 422 SETTING_OUT_OF_RANGE for a refused one.
 */
export const canAutoIssue = (code) => letterMatrix(code)?.autoIssue !== false;

/** Why a letter can't be issued automatically, in a few words, or "". */
export const autoIssueBlocker = (code) => (canAutoIssue(code) ? "" : letterMatrix(code)?.autoIssueBlocker || "");

/**
 * Whether a number-typed descriptor's `max_length` is a MAXIMUM VALUE.
 *
 * #136's descriptor quirk (§8.2): for `type: "number"`, `max_length` is the
 * largest allowed value, not a character count — `response_deadline_days`
 * with `max_length: 90` means 1–90. The minimum (1) isn't in the descriptor.
 */
export const NUMBER_FIELD_MIN = 1;

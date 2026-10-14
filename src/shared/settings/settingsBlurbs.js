// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsBlurbs.js — WHAT EACH SETTING IS CALLED, and what the risky
// ones cost. What each setting DOES is no longer in this file: it is ⓘ help
// now, beside the field's own name.
//
// ─── WHY THE SENTENCES LEFT (user decision, 14 Oct 2026) ───────────────
// Every setting printed its one-liner under its control, and 138 of them on
// one page is 138 lines of prose standing between the reader and the switch
// they came to flip ("the entire setting page + the categories it have
// looking so much crowded"). So the explanation became help rather than
// content: the whole `SETTING_BLURB` table is now entries under
// `settings.hub` in `src/shared/fieldHelp/fieldHelp.json`, each with its own
// Ask Maya question, on the `settings` tier — which is what keeps the
// 4-per-screen cap meaningful on every screen that isn't this one.
//
// THE WORDS DID NOT CHANGE on the way, and nor did the rules they are written
// to. They just apply in the JSON now:
//   · one line, about 110 characters, no second sentence (the validator's
//     own hard limit is 160);
//   · say the consequence for a person, never the mechanism (§6): "unpaid
//     days", not "LOP"; "what reaches the bank", not "net pay";
//   · no figures that move with the law, the state or the year — those live
//     in the value itself, and a hint quoting one goes stale silently;
//   · no ids, no enum names, no column names (§4);
//   · the reader may be HR or a manager (§2), so write about "the employee"
//     or "people", never "your report" and never "you".
// Every line is still read off
// `public/ref docs/md_settings/org_settings_registry.md` — entries #35–#98
// and #104, the singleton stores the hub can write. Where the registry and a
// hint disagree, the registry wins and the hint is wrong: fix it there.
//
// WHY A LOOKUP IS STILL HERE. The card shows an ⓘ, but the change HISTORY
// prints the sentence as text — a record is prose, not a form — and nothing
// should have to be written twice to get that. So this reads the same JSON
// the ⓘ does, which is why the two can never drift apart. Read it RAW, not
// through `getFieldHelp`: that gates by workspace and tier, and a tier decides
// whether an ICON shows, not whether a fact is true.
// ─────────────────────────────────────────────────────────────────────────────

import fieldHelp from "../fieldHelp/fieldHelp.json";
import { humanize } from "../attendance/enums";

/* Keyed by the catalogue's own `key`, which for every one of these stores is
   the database column name — see the registry headings. */
const SETTING_HINT = fieldHelp?.surfaces?.["settings.hub"]?.fields || {};

/**
 * What a setting does, in one plain line — the text behind its ⓘ.
 *
 * Ours first, the catalogue's `description` second. The fallback matters: the
 * catalogue is the thing that grows, and a setting added next week has to
 * explain itself with no frontend release even if its words are the registry's
 * rather than ours.
 */
export function settingBlurb(entry) {
  if (!entry) return null;
  const hint = SETTING_HINT[entry.key]?.hint;
  if (hint) return hint;
  return looksTechnical(entry.description) ? null : entry.description || null;
}

/* The catalogue's prose is written for whoever integrates with it, and some of
   it is addressed to a client library rather than a person ("changes the
   response class … poll the materialisation-progress endpoint"). Nothing is
   better than that: a reader who sees one sentence like it stops reading the
   rest. So the fallback is sniff-tested, and a description that talks about
   the wire rather than the workplace is dropped and waits for a line of ours. */
const TECHNICAL = /\b(endpoint|payload|response|request|HTTP|20[0-9]|40[0-9]|50[0-9]|API|client|schema|column|table|jsonb|idempoten|cache|queue|poll|materiali[sz]|serial|boolean|nullable|enum|flag is|UUID|param)/i;

const looksTechnical = (text) => Boolean(text) && TECHNICAL.test(String(text));

/* ─── SHORT NAMES ─────────────────────────────────────────────────────────────
   The catalogue's own label is the registry's title, and a registry title is
   written to be unambiguous in a list of 140 — "Manager direct compensation
   authority", "Document default verification required". In a card column that
   is two lines of heading over a one-line control, and a card of those reads
   like a contents page rather than a form (user report, 2026-10-10).

   So the name on screen is ours, keyed by setting key, with the catalogue's
   behind it — the same arrangement as the one-liners above, and for the same
   reason: a setting added next week still names itself.

   Rules for adding one:
   · Aim for 28 characters, hard stop at 32 — one line at 1366 in a
     three-column card with the ⓘ beside it, and one line at 390 too.
   · It still has to be findable by its own words: keep the noun the registry
     used ("notice", "PF", "letter"), drop the scaffolding around it.
   · The sentence under it says what it does, so the name needn't.
   · Never shorten into jargon §6 has banned (no LOP, no EMI).
   · Where the shelf heading already names the subject (`fieldShelves`), the
     name may lean on it — "Employee share" under Provident Fund. */
export const SETTING_LABEL = {
  // Payroll calendar
  period_start_day: "Period starts on",
  attendance_cutoff_day: "Attendance cut-off",
  pay_day_in_next_month: "Pay in the next month",
  financial_year_start_month: "Financial year starts",

  // Who may do what
  manager_can_view_team_compensation: "Managers see team pay",
  payroll_require_separate_checker: "Second approver for pay",
  manager_direct_compensation_authority: "Managers set pay without HR",
  manager_can_view_team_documents: "Managers see team documents",
  manager_direct_document_authority: "Managers issue documents",
  manager_can_propose_letters: "Managers can ask for letters",
  document_require_separate_checker: "Second checker for documents",

  // How pay is worked out
  lop_basis: "Unpaid day priced on",
  net_pay_rounding: "Round what reaches the bank",
  // The same question under the key the payroll screen has always written
  // (see payrollSettingsCatalogue.js) — whichever one a server stores, the
  // field is called the same thing.
  rounding_policy: "Round what reaches the bank",
  in_progress_treatment: "Day with no clock-out",
  negative_net_handling: "When deductions exceed pay",
  overtime_payable: "Pay for overtime",
  overtime_rate_multiplier: "Overtime rate",
  overtime_hourly_basis: "Overtime rate based on",
  standard_working_hours_per_day: "Hours in a working day",

  // Loans
  loan_max_amount: "Most we lend",
  loan_max_tenure_months: "Longest repayment",
  loan_max_interest_rate: "Highest interest rate",
  loan_default_interest_rate: "Interest rate if unsaid",
  loan_interest_method: "Interest charged on",
  loan_max_concurrent_per_employee: "Loans at once per person",

  // Tax
  pt_state_source: "State for professional tax",
  default_tax_regime: "Default tax regime",
  allow_employee_regime_switch: "People pick their regime",
  tax_declaration_window_start_month: "Declarations open",
  tax_declaration_window_end_month: "Declarations close",
  tax_proof_deadline_month: "Proof deadline month",
  tax_proof_deadline_day: "Proof deadline day",
  tds_monthly_rounding: "Monthly tax rounding",
  income_tax_enabled: "Income tax",
  tds_no_pan_rate: "Rate with no PAN",
  tds_no_pan_enforced: "Charge the no-PAN rate",
  cess_rate: "Cess on income tax",
  tax_declaration_reminder_enabled: "Remind about declarations",

  // PF, pension, life cover, ESI
  pf_enabled: "Provident Fund",
  pf_employee_rate: "Employee share",
  pf_employer_rate: "Company share",
  pf_wage_ceiling: "Pay it is worked out on",
  pf_restrict_to_ceiling: "Stop at that ceiling",
  pf_lop_reduces_ceiling: "Unpaid days lower it",
  pf_include_overtime: "Count overtime",
  pf_admin_charge_rate: "Charge to run the account",
  pf_admin_charge_min: "Smallest such charge",
  eps_enabled: "Pension scheme",
  eps_rate: "Share that goes to it",
  eps_wage_ceiling: "Pay it is worked out on",
  edli_enabled: "Life cover",
  edli_rate: "Share charged for it",
  edli_wage_ceiling: "Pay it is worked out on",
  esi_enabled: "ESI",
  esi_employee_rate: "Employee share",
  esi_employer_rate: "Company share",
  esi_wage_threshold: "Cover stops above",
  esi_include_overtime: "Count overtime",
  pt_enabled: "Professional tax",

  // Claims, benefits, payslips, files
  reimbursement_approval_levels: "Approvals per claim",
  reimbursement_payout_lookahead_months: "Schedule claims ahead by",
  benefit_deductions_enabled: "Benefit deductions",
  payslip_auto_publish: "Show payslips at once",
  payslip_auto_email: "Email payslips out",
  payslip_prerender_on_publish: "Build them on publishing",
  pdf_bulk_inline_miss_threshold: "Build on the spot up to",
  pdf_cache_retention_days: "Keep built files for",
  pdf_render_engine: "Unused",
  payroll_attachment_retention_days: "Keep payroll files for",

  // Leavers and earned days
  fnf_leave_encashment_enabled: "Pay out unused leave",
  fnf_encashment_leave_type_codes: "Leave we pay out",
  fnf_encashment_rate_basis: "A leave day priced on",
  fnf_encashment_divisor: "Days a month is split into",
  fnf_encashment_max_days: "Most days paid out",
  fnf_encashment_component_id: "Pay line it shows on",
  fnf_notice_recovery_enabled: "Charge for short notice",
  fnf_notice_recovery_rate_basis: "Short notice priced on",
  fnf_default_notice_period_days: "Default notice period",
  fnf_notice_recovery_component_id: "Pay line it shows on",
  fnf_loan_recovery_mode: "Unpaid loan on exit",
  compoff_encashment_enabled: "Pay for earned days off",
  compoff_encashment_rate_basis: "An earned day priced on",
  compoff_encashment_divisor: "Days a month is split into",
  compoff_encashment_max_days_per_fy: "Most paid for in a year",
  compoff_encashment_component_id: "Pay line it shows on",

  // Payroll reminders and the draft
  payroll_auto_draft_enabled: "Start the draft on its own",
  payroll_auto_draft_day: "Draft started on",
  payroll_cutoff_reminder_enabled: "Cut-off reminder",
  payroll_payday_reminder_enabled: "Pay-day reminder",

  // Documents
  document_view_url_ttl_seconds: "View link lasts",
  document_upload_url_ttl_seconds: "Upload link lasts",
  document_max_file_size_bytes: "Largest file",
  document_scan_required: "Virus-check uploads",
  document_retention_days: "Keep documents for",
  letter_record_retention_days: "Keep letters for",
  employee_can_delete_verified_documents: "People delete checked files",
  document_default_verification_required: "HR checks new uploads",
  document_offboarding_archive_mode: "Documents after leaving",
  document_offboarding_exit_pack_scope: "What goes in the exit pack",
  document_acknowledgement_due_days: "Confirm reading within",
  document_acknowledgement_blocking: "Hold steps until confirmed",
  document_signature_provider: "Signing handled by",
  document_expiry_reminder_days: "Expiry reminder sent",
  document_request_default_due_days: "A document is due in",
  document_onboarding_completeness_threshold: "Onboarding is done at",
  document_publish_sync_threshold: "Publish on the spot up to",

  // Who gets told
  document_notify_hr_on_upload: "Tell HR about uploads",
  document_notify_expiry: "Before a document expires",
  document_notify_pending_acknowledgement: "Chase unread documents",
  document_notify_request_raised: "When a document is asked",
  document_notify_request_overdue: "Chase overdue documents",
  document_notify_letter_issued: "When a letter is issued",

  // Letters and branding
  letter_branding_enabled: "Use the letterhead",
  letter_reference_pattern: "Reference number shape",
  letter_default_confidential: "New letters confidential",
  letter_requires_acknowledgement_default: "Ask for read confirmation",
  letter_auto_issue_on_exit: "Issue leaving letters",
  letter_bulk_max_subjects: "People per bulk run",
  letter_bulk_rate_per_hour: "Bulk runs an hour",
  letter_preview_rate_per_hour: "Previews an hour",
  letterhead_enabled: "Draw the letterhead",
  signatory_name: "Signatory",
  signatory_designation: "Signatory job title",
  registered_address_lines: "Registered address",
  accent_color_hex: "Letterhead colour",
  footer_note: "Line at the foot",

  // Billing notices
  billing_notification_emails: "Also send invoices to",
  billing_reminder_lead_days: "Remind before the plan ends",
};

/* ─── WHAT A CHOICE IS CALLED ───────────────────────────────────────
   An enum’s options were drawn by running `humanize()` over the stored value,
   which turns `calendar_days` into "Calendar days" and `clamp_and_carry` into
   "Clamp and carry". Those are column values with the underscores taken out:
   they name the MECHANISM, and §6 asks for the consequence — and "Inr" for
   `INR` is barely even that.

   So an option has a name, keyed `setting_key::stored_value`. Keyed by BOTH
   because the same word means different things in different settings: `none`
   under a rounding setting means the paise are kept, and a global table of
   bare values would eventually caption one of them wrongly and nobody would
   notice which.

   Rules for adding one:
   · Say what HAPPENS, from the reader’s side: "Pay nothing now, recover next
     month", not "Clamp and carry forward".
   · ≤ 16 characters makes the options a row of pills instead of a dropdown
     (`segmentedOptions`), so a short name is worth reaching for — but never
     at the cost of being wrong or jargon. Longer is a select, which is fine.
   · No jargon §6 has banned, and no figure that moves with the law.
   · The value is never printed raw anywhere — the change history prints these
     same names, because it reads `displaySettingValue` like the control does. */

/** One shared map of option names, spread over every key that offers them. */
const spread = (keys, options) => Object.fromEntries(
  keys.flatMap((key) => Object.entries(options).map(([value, label]) => [`${key}::${value}`, label])),
);

/* Monthly pay ÷ how many days = what one day is worth. The same question in a
   settlement, a leave payout and a cash-out, so the same three answers. */
const DAY_DIVISOR = {
  fixed_30: "Always 30 days",
  calendar_days: "Days in the month",
  standard_working_days: "Working days only",
};

/* Which part of the salary an hourly or daily rate is worked out from. */
const PAY_BASIS = { basic: "Basic pay", gross: "Gross pay" };

/* Keeping the paise or dropping them. `none` is the same answer either way. */
const ROUNDING = {
  none: "Keep the paise",
  nearest_rupee: "Nearest rupee",
  nearest_ten: "Nearest ₹10",
  two_decimals: "Keep the paise",
};

export const ENUM_LABEL = {
  // The pay calendar.
  "payroll_cycle::monthly": "Every month",
  "currency::INR": "Indian rupee (INR)",
  "currency::USD": "US dollar (USD)",
  "currency::GBP": "Pound sterling (GBP)",
  "currency::EUR": "Euro (EUR)",
  "currency::AED": "UAE dirham (AED)",
  "currency::SAR": "Saudi riyal (SAR)",
  "currency::SGD": "Singapore dollar (SGD)",
  "currency::MYR": "Malaysian ringgit (MYR)",
  "currency::AUD": "Australian dollar (AUD)",
  "currency::CAD": "Canadian dollar (CAD)",
  "currency::LKR": "Sri Lankan rupee (LKR)",
  "currency::NPR": "Nepalese rupee (NPR)",

  // How pay is worked out.
  "lop_basis::calendar_days": "The days in that month",
  "lop_basis::standard_working_days": "Working days only",
  "lop_basis::fixed_30": "Always 30 days",
  "in_progress_treatment::present": "Count as present",
  "in_progress_treatment::absent": "Count as absent",
  "in_progress_treatment::flag_error": "Stop and ask",
  // Deductions have overtaken the pay and the run has to do something.
  "negative_net_handling::clamp_and_carry_forward": "Pay nothing now, recover next month",
  "negative_net_handling::clamp_and_carry": "Pay nothing now, recover next month",
  "negative_net_handling::block": "Refuse the run",
  ...spread(["net_pay_rounding", "rounding_policy", "tds_monthly_rounding"], ROUNDING),
  ...spread(["overtime_hourly_basis", "fnf_notice_recovery_rate_basis",
    "fnf_encashment_rate_basis", "compoff_encashment_rate_basis"], PAY_BASIS),
  ...spread(["fnf_encashment_divisor", "compoff_encashment_divisor"], DAY_DIVISOR),

  // Claims — stored as a number of approvals, read as the chain it means.
  "reimbursement_approval_levels::2": "Manager, then HR",
  "reimbursement_approval_levels::1": "HR only",

  // Salary advances.
  "loan_interest_method::reducing_balance": "What’s left to repay",
  "loan_interest_method::flat": "The original amount",

  // Tax.
  "default_tax_regime::new": "New regime",
  "default_tax_regime::old": "Old regime",
  "pt_state_source::work_location": "Where they work",
  "pt_state_source::profile_state": "Their home state",

  // Leavers.
  "fnf_loan_recovery_mode::payroll": "From their last pay",
  "fnf_loan_recovery_mode::manual": "Collected separately",
};

/**
 * What one stored choice is called on screen, or `null` when we have no name
 * for it — in which case the caller prettifies the value, as it always did.
 */
export function enumLabel(key, value) {
  if (!key || value === null || value === undefined || value === "") return null;
  return ENUM_LABEL[`${key}::${value}`] || null;
}

/**
 * What a setting is called on screen: ours, then the catalogue's. A key with
 * neither is prettified rather than printed raw — §4: no raw enum or column
 * name reaches the screen.
 */
export function settingLabel(entry) {
  if (!entry) return "";
  return SETTING_LABEL[entry.key] || entry.label || humanize(entry.key) || "";
}

/* ─── WHAT TO WATCH OUT FOR ────────────────────────────────────────────────
   The confirm dialog for a high-risk change used to print the catalogue's own
   `warnings[]` verbatim, on the grounds that they were written for exactly
   that moment. They were — for an integrator. What reached an HR admin was
   "changes the response class of the org-document publish endpoint from 200 to
   202 … clients must treat 202 as success and poll the materialisation-
   progress endpoint" (user report, 2026-10-10). Nobody can act on that, and a
   caution nobody can act on is worse than none: it teaches people to click
   through the dialog that exists to slow them down.

   So the caution is ours, keyed by setting key, and the server's prose is
   never printed. Where we have no line, `settingWarning` says the one true
   thing we always know — an organisation setting lands on everyone, at once.

   Rules for adding one:
   · Say who feels it and when, in the present tense. Not the mechanism (§6),
     not the endpoint, not the response code, not the table.
   · One sentence, ≤ 130 characters. It is read standing up, mid-save.
   · No figures that move with the law, the state or the year.
   · It is a caution, not a description — the ⓘ beside the field's name
     already says what the setting does. This says what it costs to get wrong.
   · Only for settings the gateway actually gates (high risk, or a written
     reason required). A line here on an ordinary setting is never seen. */
export const SETTING_WARNING = {
  // The payroll calendar: everybody's pay date moves.
  payroll_cycle: "Every pay period is rebuilt from this. Change it mid-year and a period can be cut short or counted twice.",
  period_start_day: "Pay periods shift for everybody, so a day near the edge can land in a different month’s pay.",
  attendance_cutoff_day: "Attendance already worked after the new cut-off waits for the following month’s pay.",
  pay_day: "Everybody’s pay date moves, including anybody expecting the money on the old date.",
  pay_day_in_next_month: "A month’s salary moves into a different month, so one month can look unpaid and another paid twice.",
  currency: "Every salary and payslip figure is read as this currency. Nothing is converted — the numbers stay as they are.",
  financial_year_start_month: "Every year-so-far and tax total restarts from the new month, so figures people have already seen will change.",

  // How pay is worked out.
  lop_basis: "What an unpaid day costs changes for everybody, so the same absence is worth a different amount next run.",
  net_pay_rounding: "What reaches the bank changes by a rupee or two for everybody.",
  in_progress_treatment: "Days somebody never clocked out of start counting differently, which can turn a paid day unpaid.",
  negative_net_handling: "Decides whether a run can finish at all when deductions overtake the pay.",
  overtime_payable: "Switching this off stops paying for approved overtime from the next run, including overtime already worked.",
  overtime_rate_multiplier: "Every overtime hour is paid at the new rate from the next run.",
  standard_working_hours_per_day: "Every hourly figure — overtime, part days, hourly pay — is worked out from this.",

  // Deductions required by law.
  pf_enabled: "Turning this off stops PF for everybody. Stopping a deduction the law requires is on the company, not us.",
  pf_employee_rate: "Take-home pay changes for everybody in PF, from the next run.",
  pf_employer_rate: "The company’s monthly PF cost changes for everybody in PF.",
  pf_wage_ceiling: "The amount PF is worked out on changes for everybody, so both shares move.",
  pf_restrict_to_ceiling: "Decides whether PF is worked out on the whole salary or only up to the ceiling — a visible change in take-home.",
  pf_lop_reduces_ceiling: "Changes what PF comes to for anybody with unpaid days in the month.",
  eps_enabled: "Turning this off stops the pension share for everybody in PF.",
  edli_enabled: "Turning this off stops the life-cover charge that goes with PF.",
  esi_enabled: "Turning this off stops ESI for everybody, cover included.",
  esi_employee_rate: "Take-home pay changes for everybody covered by ESI.",
  esi_employer_rate: "The company’s monthly ESI cost changes for everybody covered.",
  esi_wage_threshold: "Decides who is still covered by ESI. People can drop out of cover the moment you save.",
  pt_enabled: "Turning this off stops professional tax for everybody, in every state.",
  income_tax_enabled: "Turning this off stops holding income tax back. The tax is still owed — it just comes out of nobody’s payslip.",
  default_tax_regime: "Anybody who has not picked a regime themselves moves to this one, which changes their monthly tax.",
  allow_employee_regime_switch: "Decides whether people can move their own regime. HR can always do it for them.",
  tds_no_pan_enforced: "Switches the higher no-PAN rate on or off for everybody who has no PAN on file.",
  tds_no_pan_rate: "Changes the monthly tax of everybody with no PAN on file.",
  cess_rate: "Changes the income tax held back from every payslip.",

  // Who may do what.
  manager_can_view_team_compensation: "Every manager can see what their reports are paid, from the moment you save.",
  payroll_require_separate_checker: "Switching this off lets one person prepare and approve the same pay change.",
  manager_direct_compensation_authority: "A manager’s pay change for their own report takes effect with nobody else looking at it.",
  manager_can_view_team_documents: "Every manager can open their team’s documents, including ones the person uploaded about themselves.",
  manager_direct_document_authority: "A manager can issue a document in the company’s name with nobody else checking it.",
  document_require_separate_checker: "Switching this off lets one person prepare a document and send it out themselves.",
  employee_can_delete_verified_documents: "People can delete documents HR has already checked, and the file is gone for good.",
  document_default_verification_required: "Switching this off means new uploads count as on file with nobody having looked at them.",

  // How long things are kept — deletion is the one thing nobody can undo.
  document_retention_days: "Shortening this deletes documents sooner, for good. Anything already past the new limit goes at the next sweep.",
  letter_record_retention_days: "Shortening this deletes issued letters sooner, for good.",
  payroll_attachment_retention_days: "Shortening this deletes files attached to payroll sooner, for good.",
  pdf_cache_retention_days: "Files are rebuilt more often, which only costs time — nothing on file is lost.",
  document_scan_required: "Switching this off lets a file be used before it has been checked for viruses.",
  document_offboarding_archive_mode: "Decides what happens to a leaver’s documents, deleting them included.",

  // Leavers and payouts — money a person is owed on the way out.
  fnf_leave_encashment_enabled: "Switching this off stops paying leavers for unused leave from their next settlement on.",
  fnf_encashment_rate_basis: "Changes what a paid-out leave day is worth to every future leaver.",
  fnf_encashment_divisor: "Changes what a paid-out leave day is worth to every future leaver.",
  fnf_notice_recovery_enabled: "Switching this on charges future leavers for notice they didn’t serve.",
  fnf_notice_recovery_rate_basis: "Changes what short notice costs every future leaver.",
  fnf_loan_recovery_mode: "Decides how a loan somebody still owes is settled when they leave.",
  compoff_encashment_enabled: "Switching this off means earned days off have to be taken as days, not paid for.",
  compoff_encashment_rate_basis: "Changes what a paid-out earned day is worth to everybody.",
  compoff_encashment_divisor: "Changes what a paid-out earned day is worth to everybody.",

  // Approvals and automation.
  reimbursement_approval_levels: "Claims already waiting keep the approvals they started with. Only new claims follow the new number.",
  benefit_deductions_enabled: "Switching this off stops taking people’s benefit share through payroll, so the cost sits with the company.",
  payroll_auto_draft_enabled: "Payroll starts drafting itself each month with nobody asking it to.",
  payslip_auto_publish: "Payslips become visible the moment a run is approved, with no last look before people see them.",
  payslip_auto_email: "Every payslip is emailed out as soon as it is published.",
  document_acknowledgement_blocking: "Other steps stop and wait for people to confirm they have read a document.",
  letter_auto_issue_on_exit: "Leaving letters go out on their own as soon as an exit is finalised.",
};

/**
 * The caution shown when a change has to be confirmed. Ours, or the one thing
 * that is true of every organisation setting. NEVER the catalogue's own
 * `warnings[]` — see the note above.
 */
export function settingWarning(entry) {
  if (!entry) return null;
  const own = SETTING_WARNING[entry.key];
  if (own) return own;
  return `This changes “${settingLabel(entry)}” for everybody in the organisation, from the moment you save.`;
}

/** The cautions for everything one save is about to change, without repeats. */
export function settingWarnings(entries) {
  const out = [];
  for (const entry of entries || []) {
    const line = settingWarning(entry);
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsBlurbs.js — WHAT EACH SETTING DOES, in one plain line.
//
// Every setting on the hub prints one of these under its control. The rule the
// lines are written to (user instruction, 2026-10-10) is the plainest possible
// one: say what this switch DOES for the people in the company. If the field
// is called "Manager can view team documents", the line reads "Allow managers
// to view their team’s documents" — not what it is called, not how it is
// enforced, and not how dangerous it is.
//
// WHY WE WRITE THEM INSTEAD OF PRINTING `description`. The catalogue does send
// a `description` per setting, and the first build printed it. It is written
// for whoever maintains the registry: it names columns, enums, services and
// error codes ("yields a 400 DOCUMENT_REQUIRED", "the denominator used for
// prorations"), which is exactly the vocabulary §6 says to keep off the
// screen. A hint that has to be decoded is worse than none, so these are the
// same facts in the words a first-month HR admin uses. A setting we have no
// line for still falls back to the catalogue's `description` (see
// `settingBlurb`) — missing is better than invented, and a setting the backend
// adds tomorrow still explains itself.
//
// GROUNDED, NOT GUESSED. Every line is read off
// `public/ref docs/md_settings/org_settings_registry.md` — entries #35–#98 and
// #104, the singleton stores the hub can write. Where the registry and a line
// here disagree, the registry wins and the line is wrong: fix it here.
//
// RULES FOR ADDING ONE:
//   · One line, about 110 characters, no second sentence. It sits under a
//     control in a card, not in a manual.
//   · Say the consequence for a person, never the mechanism (§6): "unpaid
//     days", not "LOP"; "what reaches the bank", not "net pay"; "monthly
//     repayment", not "EMI"; "PF, ESI and tax", not "statutory deductions".
//   · No figures that change with the law, the state or the year — those live
//     in the value itself, and a hint that quotes one goes stale silently.
//   · No ids, no enum names, no column names (§4).
//   · The reader may be HR or a manager (§2), so write about "the employee" or
//     "people", never "your report" and never "you".
// ─────────────────────────────────────────────────────────────────────────────

/* Keyed by the catalogue's own `key`, which for every one of these stores is
   the database column name — see the registry headings. */
import { humanize } from "../attendance/enums";

export const SETTING_BLURB = {
  // ── Payroll: the pay period ──
  payroll_cycle: "How often a pay period runs.",
  period_start_day: "The day of the month a pay period starts.",
  attendance_cutoff_day: "The last day of attendance that counts towards that month’s pay.",
  pay_day: "The day of the month people are paid.",
  pay_day_in_next_month: "Pay a month’s salary in the month after it was worked, rather than inside it.",
  currency: "The currency every salary and payslip figure is shown in.",
  financial_year_start_month: "The month the financial year starts. Every year-so-far total counts from here.",

  // ── Payroll: who may see and approve pay ──
  manager_can_view_team_compensation: "Allow managers to see the pay of the people who report to them.",
  payroll_require_separate_checker: "Make a second HR person approve every pay change, so nobody approves their own.",
  manager_direct_compensation_authority: "Let a manager’s pay change for their own report take effect without HR approving it.",

  // ── Payroll: how the figures are worked out ──
  lop_basis: "What one day of pay is worked out from, which sets what an unpaid day costs.",
  net_pay_rounding: "Round what reaches the bank to whole rupees.",
  in_progress_treatment: "How a day somebody never clocked out of is counted when pay is worked out.",
  overtime_payable: "Pay people for overtime hours that have been approved.",
  overtime_rate_multiplier: "How many times the normal hourly rate an overtime hour is paid at.",
  overtime_hourly_basis: "Which part of the salary the overtime hourly rate is worked out from.",
  standard_working_hours_per_day: "The hours in a full working day, used to turn a salary into an hourly rate.",
  negative_net_handling: "What to do when deductions come to more than the pay.",

  // ── Payroll: staff loans ──
  loan_max_amount: "The most that can be lent to one person. Leave it empty for no limit.",
  loan_max_tenure_months: "The longest a loan may be repaid over.",
  loan_max_interest_rate: "The highest interest rate a loan may carry.",
  loan_default_interest_rate: "The interest rate used when a loan request doesn’t name one.",
  loan_interest_method: "Whether interest is charged on the whole loan or only on what is still to repay.",
  loan_max_concurrent_per_employee: "How many loans one person may be repaying at the same time.",

  // ── Payroll: tax admin ──
  pt_state_source: "Which state’s professional tax a person pays.",
  default_tax_regime: "The tax regime people are on until they pick one themselves.",
  allow_employee_regime_switch: "Let people change their own tax regime. HR can always change it for them.",
  tax_declaration_window_start_month: "The month people can start declaring the investments they plan to make.",
  tax_declaration_window_end_month: "The last month people can declare the investments they plan to make.",
  tax_proof_deadline_month: "The month proof of those investments has to be in by.",
  tax_proof_deadline_day: "The day of that month proof of those investments has to be in by.",
  tds_monthly_rounding: "How the income tax taken each month is rounded.",

  // ── Tax & legal deductions ──
  income_tax_enabled: "Work out income tax and hold it back from every payslip.",
  tds_no_pan_rate: "The higher tax rate used for somebody with no PAN on file.",
  tds_no_pan_enforced: "Charge that higher rate to people who have no PAN on file.",
  cess_rate: "The extra percentage added on top of the income tax worked out.",

  pf_enabled: "Take Provident Fund out of pay, and add the company’s share.",
  pf_employee_rate: "The share of the PF pay taken from the employee.",
  pf_employer_rate: "The share of the PF pay the company puts in.",
  pf_wage_ceiling: "The most of a month’s pay that PF is worked out on.",
  pf_restrict_to_ceiling: "Work PF out up to that ceiling only, instead of on the whole salary.",
  pf_lop_reduces_ceiling: "Lower that ceiling for anybody with unpaid days in the month.",
  pf_include_overtime: "Count overtime pay when working PF out.",
  eps_enabled: "Put part of the company’s PF share into the pension scheme.",
  eps_rate: "The share of the pension pay that goes to the pension scheme.",
  eps_wage_ceiling: "The most of a month’s pay the pension share is worked out on.",
  edli_enabled: "Add the company’s life-cover charge that goes with PF.",
  edli_rate: "The share of pay charged for that life cover.",
  edli_wage_ceiling: "The most of a month’s pay the life-cover charge is worked out on.",
  pf_admin_charge_rate: "The share of pay the company pays to have the PF account run.",
  pf_admin_charge_min: "The smallest amount charged to run the PF account, whatever the rate comes to.",

  esi_enabled: "Take ESI out of pay, and add the company’s share.",
  esi_employee_rate: "The share of pay taken from the employee for ESI.",
  esi_employer_rate: "The share of pay the company puts in for ESI.",
  esi_wage_threshold: "The monthly pay above which somebody stops being covered by ESI.",
  esi_include_overtime: "Count overtime pay when working ESI out.",

  pt_enabled: "Take professional tax out of pay, at the rate for the person’s state.",

  // ── Payroll: claims and benefits ──
  reimbursement_approval_levels: "How many people have to approve an expense claim before it can be paid.",
  reimbursement_payout_lookahead_months: "How far ahead an approved claim may be scheduled for payment.",
  benefit_deductions_enabled: "Take the employee’s share of their benefit plans through payroll.",

  // ── Payroll: payslips ──
  payslip_auto_publish: "Show people their payslip as soon as the run is approved.",
  payslip_auto_email: "Email each payslip out as well as showing it in the app.",
  payslip_prerender_on_publish: "Build the payslip files when they are published, so downloads are instant.",
  pdf_bulk_inline_miss_threshold: "How many missing files a bulk download builds on the spot before it queues the job.",
  pdf_cache_retention_days: "How long a built file is kept before it has to be built again.",
  pdf_render_engine: "Kept from an older release. Nothing uses it any more.",

  // ── Payroll: exits and payouts ──
  fnf_leave_encashment_enabled: "Pay out unused leave in a leaver’s final pay.",
  fnf_encashment_leave_type_codes: "Which kinds of leave can be paid out when somebody leaves.",
  fnf_encashment_rate_basis: "Which part of the salary a paid-out leave day is worked out from.",
  fnf_encashment_divisor: "The number of days a month’s salary is split into to price one leave day.",
  fnf_encashment_max_days: "The most leave days one leaver can be paid for.",
  fnf_encashment_component_id: "The pay line a leave payout shows up on.",
  fnf_notice_recovery_enabled: "Charge a leaver for notice they didn’t serve.",
  fnf_notice_recovery_rate_basis: "Which part of the salary short notice is charged at.",
  fnf_default_notice_period_days: "The notice period put on a new exit unless somebody changes it.",
  fnf_notice_recovery_component_id: "The pay line short notice shows up on.",
  fnf_loan_recovery_mode: "How a loan somebody still owes is settled when they leave.",
  compoff_encashment_enabled: "Pay people for earned days off instead of making them take the day.",
  compoff_encashment_rate_basis: "Which part of the salary a paid-out earned day is worked out from.",
  compoff_encashment_divisor: "The number of days a month’s salary is split into to price one earned day.",
  compoff_encashment_max_days_per_fy: "The most earned days one person can be paid for in a year.",
  compoff_encashment_component_id: "The pay line an earned-day payout shows up on.",

  // ── Payroll: what happens without anyone starting it ──
  payroll_auto_draft_enabled: "Start each month’s payroll draft on its own.",
  payroll_auto_draft_day: "The day of the month that draft is started.",
  payroll_cutoff_reminder_enabled: "Remind HR on the day attendance stops counting for the month.",
  payroll_payday_reminder_enabled: "Remind HR before pay day that the run still has to go out.",
  tax_declaration_reminder_enabled: "Remind people to declare their investments before the window shuts.",
  payroll_attachment_retention_days: "How long files attached to payroll are kept before they are deleted.",

  // ── Documents: who may do what ──
  manager_can_view_team_documents: "Allow managers to view their team’s documents.",
  manager_direct_document_authority: "Let a manager issue a document to their own report without HR approving it.",
  document_require_separate_checker: "Make somebody other than the preparer check a document before it goes out.",
  manager_can_propose_letters: "Let managers ask for a letter to be issued to somebody in their team.",

  // ── Documents: files and links ──
  document_view_url_ttl_seconds: "How long a link to open a document keeps working.",
  document_upload_url_ttl_seconds: "How long somebody has to finish an upload once it has started.",
  document_max_file_size_bytes: "The largest file anybody can upload.",
  document_scan_required: "Check every upload for viruses before it can be used.",

  // ── Documents: how long things are kept ──
  document_retention_days: "How long a document is kept before it is deleted for good.",
  letter_record_retention_days: "How long an issued letter is kept before it is deleted for good.",

  // ── Documents: the life of a document ──
  employee_can_delete_verified_documents: "Let people delete their own documents even after HR has checked them.",
  document_default_verification_required: "Have HR check a newly uploaded document before it counts as on file.",
  document_offboarding_archive_mode: "What happens to somebody’s documents once they have left.",
  document_offboarding_exit_pack_scope: "Which documents go into the pack a leaver is given.",

  // ── Documents: reading and signing ──
  document_acknowledgement_due_days: "How long somebody has to confirm they have read a document.",
  document_acknowledgement_blocking: "Hold other steps up until the person confirms they have read it.",
  document_signature_provider: "Who handles the signing when a document needs a signature.",

  // ── Documents: who gets told ──
  document_expiry_reminder_days: "How many days before a document runs out the reminders go out.",
  document_notify_hr_on_upload: "Tell HR whenever somebody uploads a document.",
  document_notify_expiry: "Tell people when one of their documents is about to run out.",
  document_notify_pending_acknowledgement: "Chase people who haven’t confirmed they read a document.",
  document_notify_request_raised: "Tell somebody as soon as a document is asked of them.",
  document_notify_request_overdue: "Chase people whose document is past the date it was asked for.",
  document_notify_letter_issued: "Tell somebody when a letter has been issued to them.",

  // ── Documents: requests and publishing ──
  document_request_default_due_days: "How long people are given to send in a document that is asked of them.",
  document_onboarding_completeness_threshold: "How much of their document list a new joiner must send to be done.",
  document_publish_sync_threshold: "How many documents are published on the spot before the rest are queued.",

  // ── Documents: letters ──
  letter_branding_enabled: "Print letters on the company letterhead.",
  letter_reference_pattern: "The shape of the reference number printed on every letter.",
  letter_default_confidential: "Mark a new letter confidential unless somebody says otherwise.",
  letter_requires_acknowledgement_default: "Ask the person to confirm they have read a new letter.",
  letter_auto_issue_on_exit: "Issue the leaving letters on their own once an exit is finalised.",
  letter_bulk_max_subjects: "How many people one bulk letter run may cover.",
  letter_bulk_rate_per_hour: "How many bulk letter runs may be started in an hour.",
  letter_preview_rate_per_hour: "How many letter previews one person may ask for in an hour.",

  // ── Documents: the letterhead itself ──
  letterhead_enabled: "Draw the company letterhead on letters and payslips.",
  signatory_name: "The name printed under the signature on official letters.",
  signatory_designation: "The job title printed under that name.",
  registered_address_lines: "The registered address printed on letters. Up to five lines.",
  cin: "The company registration number printed on official letters.",
  gstin: "The company’s GST number, printed on official letters.",
  pan: "The company’s PAN, printed on official letters.",
  tan: "The company’s TAN, printed on tax letters.",
  contact_email: "The email address printed on letters for people to reply to.",
  contact_phone: "The phone number printed on letters.",
  website: "The company website printed on letters.",
  accent_color_hex: "The colour used for the lines and headings on the letterhead.",
  footer_note: "A line printed at the foot of every letter.",

  // ── Company & billing ──
  billing_notification_emails: "Extra addresses that get the invoices and renewal notices as well as HR.",
  billing_reminder_lead_days: "How many days before the plan ends a reminder goes out.",
};

/**
 * What a setting does, in one plain line.
 *
 * Ours first, the catalogue's `description` second. The fallback matters: the
 * catalogue is the thing that grows, and a setting added next week has to
 * explain itself with no frontend release even if its words are the registry's
 * rather than ours.
 */
export function settingBlurb(entry) {
  if (!entry) return null;
  if (SETTING_BLURB[entry.key]) return SETTING_BLURB[entry.key];
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
   · It is a caution, not a description — the one-liner above the control
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

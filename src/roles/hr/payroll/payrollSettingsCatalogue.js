// ─────────────────────────────────────────────────────────────────────────────
// payrollSettingsCatalogue.js — EVERY setting on the payroll_settings
// singleton, declared the way the settings hub's catalogue declares one.
//
// ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
// Payroll Settings is where the sidebar sends HR under Setup › Pay, so it is
// where somebody goes to FINISH setting payroll up. Until 15 Oct 2026 it
// offered about twenty of the singleton's keys and quietly left out the rest —
// including the hours in a working day, the pay calendar, overtime, the loan
// ceilings and the tax-declaration window (user report, 15 Oct 2026: "that
// folder page does not provide all the setup required fields like the full day
// hours"). Every one of those arrives on the same `GET /payroll/hr/settings`
// and is accepted by the same partial PUT, so the fields were missing from the
// SCREEN, not from the contract.
//
// The page used to describe its fields in JSX, one hand-written control at a
// time, which is why adding one was a page edit and why twelve were never
// added at all. They are data now, in the same shape `GET /settings/catalog`
// (#242) returns, so the shared `SettingInput` can draw all of them and the
// two settings screens in this product cannot drift apart.
//
// ─── WHAT A DECLARATION MAY SAY, AND WHERE IT COMES FROM ───────────────────
// `public/ref docs/md_settings/org_settings_registry.md` entries #35–#57 are
// the source for every type, range and enum below, with the per-phase column
// tables behind them (`md_payrolls/phases/phase{2,3,4,7}_*`). Two rules kept
// while transcribing them:
//
//   · ONLY BOUNDS THE CONTRACT STATES. `loan_max_tenure_months` is "INTEGER,
//     default 60" with no ceiling, so it gets `{ min: 1 }` and no max. An
//     invented maximum is a rule HR can hit that the server would have
//     allowed, and it is invisible until somebody is blocked by it.
//   · NO DEFAULTS. The hub knows which settings sit on the shipped default
//     because #244 returns `non_default_keys` per group; this endpoint returns
//     no such thing. A "Customised" pill computed from a default typed in here
//     would be a guess about the server's own column default, and a wrong one
//     is worse than none — so these cards show "N unsaved" and nothing else,
//     and there is no "put back to default" button.
//
// ─── WHERE THE SPEC CONTRADICTS ITSELF, THE STORED VALUE WINS ──────────────
// Two enums are spelled differently in the frontend response doc (captured
// from live replies) and in the phase plan that created the column:
// `negative_net_handling` is `clamp_and_carry` in one and
// `clamp_and_carry_forward` in the other, and `net_pay_rounding` is
// ENUM(`none`,`nearest_rupee`) in the plan while a run snapshot shows
// `nearest_ten`. Offering a value this server does not accept fails the whole
// save, so neither is guessed (CLAUDE.md §9):
//   · `aliases` lists the other spelling. When the server's own value is an
//     alias, that spelling REPLACES the canonical one in the list, so what we
//     send back is the word this server already uses.
//   · a stored value matching nothing in the list is ADDED to it, rather than
//     leaving the control unable to show what the setting is set to.
// Both happen in `resolveEntry` below, the only place here that reads the live
// settings object.
//
// ─── THE CONTROLS ARE CHOSEN FROM THE DATA, NOT NAMED HERE ─────────────────
// `SettingInput` (shared/settings) picks the control from `data_type`, `range`
// and `unit`: a yes/no is a switch, a short enum is a row of pills, a 1–12
// integer named `*_month` is a list of month names, a 1–31 `*_day` is "25th of
// the month", and a `unit` is drawn ON the number box ("8 hours", "₹ 50,000").
// Three fields cannot be drawn that way and say so with `control`:
//   · `component` — a salary component, picked from the org's live list. The
//     stored value is a UUID, and §4 forbids an id reaching the screen, so the
//     generic enum select (which labels each option with its own value) is not
//     usable.
//   · `leaveTypes` — a list of leave CODES, drawn as the org's real leave
//     types. Typing codes by hand meant knowing them by heart, and a typo
//     saved silently and then paid out nothing.
// `readOnly` is for a setting with exactly one legal value (`payroll_cycle`):
// shown, because "are we monthly?" is a real setup question, but not as a
// control — a select with one option is a button that does nothing.
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiCalculator, HiCalendar, HiCurrencyRupee, HiDocumentDownload, HiLightningBolt,
  HiLogout, HiMail, HiReceiptRefund, HiScale, HiSwitchHorizontal, HiUserGroup,
} from "react-icons/hi";
import { PDF_CACHE_NUMBERS } from "./pdfRenderMeta";

/* ─── Builders ─────────────────────────────────────────────────────────────
   Short on purpose: the interesting part of an entry is its range and its
   unit, and those are what has to be checkable against the registry at a
   glance. `unit: null` is written out rather than left off, because
   `isDayOfMonth`/`isMonthOfYear` treat a unit as proof the number is a COUNT
   of days or months rather than a date. */
const int = (key, range, unit = null, extra = {}) =>
  ({ key, data_type: "integer", unit, range, ...extra });

const dec = (key, range, unit = null, extra = {}) =>
  ({ key, data_type: "decimal", unit, range, ...extra });

const pick = (key, values, extra = {}) =>
  ({ key, data_type: "enum", range: { enum: values }, ...extra });

const yesNo = (key, extra = {}) => ({ key, data_type: "boolean", ...extra });

/** A day of the month — a cut-off, a pay day. Reads "25th of the month". */
const dayOfMonth = (key, extra = {}) => int(key, { min: 1, max: 31 }, null, extra);

/** A month of the year — a financial year start, a deadline. Reads "April". */
const monthOfYear = (key, extra = {}) => int(key, { min: 1, max: 12 }, null, extra);

/** A salary component, picked from the org's live list (never by id). */
const component = (key, componentType, emptyLabel) => ({
  key, data_type: "string", nullable: true, control: "component", componentType, emptyLabel,
});

/* The two bases and the three divisors mean the same thing in a settlement and
   in a cash-out, so they are written once. Functions rather than constants
   because each entry needs its own array: a shared one would be the same
   object on two entries, and `resolveEntry` rewrites the list it is handed. */
function RATE_BASIS() { return ["basic", "gross"]; }
function DIVISOR_BASIS() { return ["fixed_30", "calendar_days", "standard_working_days"]; }

/** The bounds the PDF phase wrote down, read from where it wrote them. */
function pdfRange(key) {
  const rule = PDF_CACHE_NUMBERS[key] || {};
  return { min: rule.min, max: rule.max };
}

/* The currencies worth offering. The column is a free ISO-4217 string, but a
   text box invites "INRR", and a typo there relabels every figure in payroll —
   so it is a list, and `resolveEntry` adds whatever this org is already on if
   it isn't one of these. */
const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SAR", "SGD", "MYR", "AUD", "CAD", "LKR", "NPR"];

/* ─── The cards ─────────────────────────────────────────────────────────────
   In the order payroll is set up: the calendar a period hangs off, then how an
   amount is worked out, then who may change it, then the things that pay out,
   then what happens to somebody who leaves.

   `summary` is the one line a FOLDED card shows about what it is currently set
   to. The hub's cards don't carry one — they show the group's blurb — but this
   screen is read far more often than it is changed, and the summary is the
   whole reason HR can check a rule without opening anything. It returns parts;
   the page joins the ones that aren't null.

   `lead` marks a card whose master switch governs everything else in it, so
   that switch is read FIRST instead of being gathered to the end with the
   other switches (`orderFields`): "Pay for earned days off: off" before the
   rate it would be paid at, never after it. */
export const PAYROLL_SETTING_GROUPS = [
  {
    key: "calendar",
    label: "Pay calendar",
    icon: HiCalendar,
    blurb: "The shape of a pay period: when it opens, when attendance stops counting towards it, and the day money leaves.",
    summary: (s) => [
      s.pay_day ? `Paid on the ${ordinalOf(s.pay_day)}${s.pay_day_in_next_month ? " of the next month" : ""}` : null,
      s.attendance_cutoff_day ? `attendance counted to the ${ordinalOf(s.attendance_cutoff_day)}` : null,
    ],
    fields: [
      pick("payroll_cycle", ["monthly"], { readOnly: true }),
      dayOfMonth("period_start_day"),
      dayOfMonth("attendance_cutoff_day"),
      dayOfMonth("pay_day"),
      monthOfYear("financial_year_start_month"),
      pick("currency", CURRENCIES),
      yesNo("pay_day_in_next_month"),
    ],
  },
  {
    key: "engine",
    label: "How pay is worked out",
    icon: HiCalculator,
    blurb: "The rules behind every amount on a payslip: what a day without pay costs, what an hour is worth, and what happens when deductions outrun pay.",
    summary: (s) => [
      s.standard_working_hours_per_day ? `${s.standard_working_hours_per_day}-hour day` : null,
      s.overtime_payable ? "overtime paid" : "overtime not paid",
    ],
    fields: [
      pick("lop_basis", ["calendar_days", "standard_working_days", "fixed_30"]),
      dec("standard_working_hours_per_day", { min: 1, max: 24 }, "hours"),
      pick("net_pay_rounding", ["none", "nearest_rupee"]),
      /* The key this page has always written, kept for a server that really
         does store it. Drawn only when `net_pay_rounding` is absent — two
         rounding controls on one card would be a question nobody can answer
         (see `supersededBy` in `resolveEntry`). */
      pick("rounding_policy", ["nearest_rupee", "two_decimals"], {
        supersededBy: "net_pay_rounding",
        help: "payroll.settings",
      }),
      pick("in_progress_treatment", ["present", "absent", "flag_error"]),
      pick("negative_net_handling", ["clamp_and_carry_forward", "block"], {
        aliases: { clamp_and_carry_forward: ["clamp_and_carry"] },
      }),
      dec("overtime_rate_multiplier", { min: 1, max: 5 }, "×"),
      pick("overtime_hourly_basis", ["basic", "gross"]),
      yesNo("overtime_payable"),
    ],
  },
  {
    key: "authority",
    label: "Who may do what",
    icon: HiUserGroup,
    blurb: "How much of their team’s pay a manager can see, whether their proposals need HR behind them, and whether one HR admin can approve their own change.",
    summary: (s) => [
      s.manager_can_view_team_compensation ? "Managers see team pay" : "Managers can’t see team pay",
      s.payroll_require_separate_checker ? "a second HR admin approves" : "one HR admin is enough",
    ],
    fields: [
      yesNo("manager_can_view_team_compensation"),
      yesNo("manager_direct_compensation_authority", { help: "payroll.settings" }),
      yesNo("payroll_require_separate_checker", { help: "payroll.settings" }),
    ],
  },
  {
    key: "claims",
    label: "Claims & benefits",
    icon: HiReceiptRefund,
    blurb: "Who signs off an expense claim, how far ahead an approved one may be paid, and whether benefit enrolments are charged in payroll.",
    summary: (s) => [
      Number(s.reimbursement_approval_levels) === 1 ? "HR approves claims" : "Manager, then HR",
      s.benefit_deductions_enabled ? "benefits charged" : "benefits not charged",
    ],
    fields: [
      /* Stored as an integer 1–2, offered as the two chains it means. Declared
         as an enum so both are readable without opening a dropdown; the page
         coerces the choice back to a number before it is sent (`numeric`). */
      pick("reimbursement_approval_levels", [2, 1], { numeric: true }),
      int("reimbursement_payout_lookahead_months", { min: 0, max: 6 }, "months"),
      yesNo("benefit_deductions_enabled"),
    ],
  },
  {
    key: "loans",
    label: "Salary advances",
    icon: HiCurrencyRupee,
    blurb: "The ceilings every salary advance is checked against, and what a request that doesn’t say gets by default.",
    summary: (s) => [
      s.loan_max_amount ? `Up to ₹${Number(s.loan_max_amount).toLocaleString("en-IN")}` : "No amount limit",
      s.loan_max_concurrent_per_employee ? `${s.loan_max_concurrent_per_employee} at a time` : null,
    ],
    fields: [
      dec("loan_max_amount", { min: 0 }, "INR", { nullable: true }),
      int("loan_max_tenure_months", { min: 1 }, "months"),
      dec("loan_max_interest_rate", { min: 0, max: 100 }, "%"),
      dec("loan_default_interest_rate", { min: 0, max: 100 }, "%"),
      pick("loan_interest_method", ["reducing_balance", "flat"]),
      int("loan_max_concurrent_per_employee", { min: 1 }, "loans"),
    ],
  },
  {
    key: "tax",
    label: "Income tax & declarations",
    icon: HiScale,
    blurb: "The regime people start on, when they may declare their investments, and when the proofs are due. Rates and slabs live on Tax & Legal Deductions.",
    summary: (s) => [
      s.default_tax_regime ? `${s.default_tax_regime === "old" ? "Old" : "New"} regime by default` : null,
      s.tax_declaration_window_start_month
        ? `declarations open in ${MONTHS[s.tax_declaration_window_start_month] || "N/A"}`
        : null,
    ],
    fields: [
      pick("default_tax_regime", ["new", "old"]),
      pick("tds_monthly_rounding", ["none", "nearest_rupee", "nearest_ten"]),
      monthOfYear("tax_declaration_window_start_month"),
      monthOfYear("tax_declaration_window_end_month"),
      monthOfYear("tax_proof_deadline_month"),
      dayOfMonth("tax_proof_deadline_day"),
      pick("pt_state_source", ["work_location", "profile_state"]),
      yesNo("allow_employee_regime_switch"),
    ],
  },
  {
    key: "payslips",
    label: "Payslip delivery",
    icon: HiMail,
    blurb: "When employees get to see a payslip, and whether they are told by email.",
    summary: (s) => [
      s.payslip_auto_publish === false ? "Held back for a final check" : "Released when a run is approved",
      s.payslip_auto_email ? "email sent" : "no email",
    ],
    fields: [
      yesNo("payslip_auto_publish"),
      yesNo("payslip_auto_email"),
    ],
  },
  {
    key: "pdfs",
    label: "Payslip PDFs",
    icon: HiDocumentDownload,
    blurb: "Payslips, annual statements and Form 16 are all built the same way. A released payslip is kept ready after the first download, so the next one is instant.",
    summary: (s) => [
      s.payslip_prerender_on_publish === false
        ? "Built the first time somebody downloads one"
        : "Built as soon as a run is released",
    ],
    fields: [
      yesNo("payslip_prerender_on_publish"),
      /* The two bounds come from pdfRenderMeta, which is where the PDF phase
         wrote them down and where the save-time coercion still reads them. */
      int("pdf_bulk_inline_miss_threshold", pdfRange("pdf_bulk_inline_miss_threshold"), "payslips"),
      int("pdf_cache_retention_days", pdfRange("pdf_cache_retention_days"), "days"),
    ],
  },
  {
    key: "exit",
    label: "When somebody leaves",
    icon: HiLogout,
    blurb: "How a leaver’s last payment is worked out: notice that wasn’t served, leave that was never taken, and any advance still being repaid.",
    summary: (s) => [
      s.fnf_notice_recovery_enabled ? "Short notice charged" : "Short notice not charged",
      s.fnf_leave_encashment_enabled ? "unused leave paid out" : "no leave payout",
    ],
    /* SHELVED BY HAND, not by `fieldShelves`. Reading the shelf off the keys
       would head this card with "Notice" and "Encashment" — and §6 has banned
       the second word outright (it is "Leave Payout" in this product). The
       first shelf carries no heading, because the two facts on it are about
       the exit as a whole rather than about either recovery. */
    shelves: [
      { key: "whole", label: null, keys: ["fnf_default_notice_period_days", "fnf_loan_recovery_mode"] },
      {
        key: "notice",
        label: "Notice that wasn’t served",
        keys: ["fnf_notice_recovery_enabled", "fnf_notice_recovery_rate_basis", "fnf_notice_recovery_component_id"],
      },
      {
        key: "leave",
        label: "Leave that was never taken",
        keys: [
          "fnf_leave_encashment_enabled", "fnf_encashment_leave_type_codes", "fnf_encashment_rate_basis",
          "fnf_encashment_divisor", "fnf_encashment_max_days", "fnf_encashment_component_id",
        ],
      },
    ],
    fields: [
      int("fnf_default_notice_period_days", { min: 0, max: 365 }, "days"),
      pick("fnf_loan_recovery_mode", ["payroll", "manual"]),
      yesNo("fnf_notice_recovery_enabled", { help: "payroll.settings" }),
      pick("fnf_notice_recovery_rate_basis", RATE_BASIS(), { help: "payroll.settings" }),
      component("fnf_notice_recovery_component_id", "deduction", "Not set — settlements will be refused"),
      yesNo("fnf_leave_encashment_enabled"),
      {
        key: "fnf_encashment_leave_type_codes",
        data_type: "array",
        control: "leaveTypes",
        help: "payroll.settings",
      },
      pick("fnf_encashment_rate_basis", RATE_BASIS()),
      pick("fnf_encashment_divisor", DIVISOR_BASIS()),
      int("fnf_encashment_max_days", { min: 0, max: 365 }, "days", { nullable: true, help: "payroll.settings" }),
      component("fnf_encashment_component_id", "earning", "Not set — nothing will be paid out"),
    ],
  },
  {
    key: "compoff",
    label: "Cashing out earned days off",
    icon: HiSwitchHorizontal,
    blurb: "A day off is earned by working on an off day. With this on, a manager can propose paying those days out as cash instead, and HR approves.",
    summary: (s) => [s.compoff_encashment_enabled ? "Allowed, with HR approval" : "Not allowed"],
    lead: true,
    fields: [
      yesNo("compoff_encashment_enabled"),
      pick("compoff_encashment_rate_basis", RATE_BASIS()),
      pick("compoff_encashment_divisor", DIVISOR_BASIS()),
      int("compoff_encashment_max_days_per_fy", { min: 0, max: 365 }, "days", { nullable: true }),
      component("compoff_encashment_component_id", "earning", "Not set — nothing can be paid out"),
    ],
  },
  {
    key: "automation",
    label: "Reminders & tidying",
    icon: HiLightningBolt,
    blurb: "What payroll does on its own each month: drafting the run, reminding people about the cut-off and the pay day, and clearing out old attachments.",
    summary: (s) => [
      s.payroll_auto_draft_enabled
        ? `Draft started on the ${ordinalOf(s.payroll_auto_draft_day)}`
        : "Drafts are started by hand",
    ],
    /* #56 is documented against this singleton, but no server has yet returned
       one of these keys — so this whole card simply doesn't appear
       (`resolveGroups`). That is the same gate every other field here is
       behind, and it is why offering them can't go wrong: a key the server
       never sent is never drawn and never sent back. Before this gate existed
       the switches were left off the page entirely, because saving a value the
       server drops is worse than not offering it. The jobs themselves are run
       from Payroll Automation, which only reads these. */
    fields: [
      dayOfMonth("payroll_auto_draft_day"),
      int("payroll_attachment_retention_days", { min: 1 }, "days"),
      yesNo("payroll_auto_draft_enabled"),
      yesNo("payroll_cutoff_reminder_enabled"),
      yesNo("payroll_payday_reminder_enabled"),
      yesNo("tax_declaration_reminder_enabled"),
    ],
  },
];

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ORDINAL = { 1: "st", 2: "nd", 3: "rd" };

/** "25th", for a summary line. N/A rather than a dash when it isn't set (§5). */
const ordinalOf = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return "N/A";
  const teens = value % 100;
  return `${value}${teens >= 11 && teens <= 13 ? "th" : ORDINAL[value % 10] || "th"}`;
};

/* ─── From a declaration to something a card can draw ──────────────────────
   One pass over the live settings object, in the page's `useMemo`. It answers
   the three questions a declaration can't:
     1. Does this server store the key at all? (`key in saved`.) A key it has
        never heard of fails the WHOLE save if we send it, so no field is drawn
        for one — the rule this page has used since 2026-10-02.
     2. Is this key superseded by one the server also stores? (The legacy
        rounding key.)
     3. Does the stored value fit the enum we declared? See the header: an
        alias replaces the canonical spelling, anything else joins the list. */

/** The entry as it should be drawn, or `null` when it shouldn't be at all. */
export function resolveEntry(entry, saved) {
  if (!entry || !saved || !(entry.key in saved)) return null;
  if (entry.supersededBy && entry.supersededBy in saved) return null;

  const stored = saved[entry.key];
  const declared = entry.range?.enum;
  if (!Array.isArray(declared) || stored === null || stored === undefined || stored === "") return entry;
  if (declared.some((option) => String(option) === String(stored))) return entry;

  // The server's own spelling of a value we declared under another name.
  const aliased = Object.entries(entry.aliases || {})
    .find(([, spellings]) => spellings.some((spelling) => String(spelling) === String(stored)));
  const options = aliased
    ? declared.map((option) => (option === aliased[0] ? stored : option))
    // A value we never declared. Added rather than dropped: a control that
    // can't show what the setting is set to is worse than a longer list.
    : [...declared, stored];
  return { ...entry, range: { ...entry.range, enum: options } };
}

/**
 * The cards to draw, carrying only the fields this server actually stores.
 *
 * A card left with nothing is dropped whole — an empty card is a promise of
 * settings that aren't there.
 *
 * @param {object} saved  the settings object exactly as the server returned it
 */
export function resolveGroups(saved) {
  if (!saved) return [];
  return PAYROLL_SETTING_GROUPS
    .map((group) => ({
      ...group,
      fields: group.fields.map((entry) => resolveEntry(entry, saved)).filter(Boolean),
    }))
    .filter((group) => group.fields.length > 0);
}

/* ─── DOM ids ─────────────────────────────────────────────────
   Keyed by the same keys this file declares, and here rather than beside the
   markup because a component file may only export components (lint rule
   `react-refresh/only-export-components`, CLAUDE.md §8). The page needs both:
   the dock scrolls to a CARD, and §11 focuses a FIELD. */

/** The card for a group of settings. */
export const payrollCardId = (key) => `payroll-setting-card-${key}`;

/** One setting’s own control, which is what `focusFirstProblem` looks up. */
export const payrollFieldId = (key) => `payroll-setting-${key}`;

/** Every field on every drawn card, flat — for the search and the validator. */
export const allFields = (groups) => (groups || []).flatMap((group) => group.fields);

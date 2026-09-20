// ─────────────────────────────────────────────────────────────────────────────
// statutoryBreakdown.js — reads `statutory_breakdown`, the PF / ESI / PT / TDS
// block that the three "current salary structure" reads (#18 HR, #29 manager,
// #33 self) compute on the fly and attach to the response.
//
// It is never persisted, so it is legitimately absent on every other salary
// payload — the structure history, the template preview, an older backend — and
// every consumer has to render without it. Nothing here throws on a missing or
// half-filled block; callers get `null` and fall back to the contractual view.
//
// Wire format is decimal strings ("1750.00"), never numbers. Everything below
// hands back real numbers (for arithmetic) or finished strings (for display).
// ─────────────────────────────────────────────────────────────────────────────

import { humanize } from "../attendance/enums";
import { formatMoney } from "./formatUtils";

const toAmount = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Distinguishes "the backend sent 0" from "the backend sent nothing". */
const isNumeric = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number.parseFloat(v));

/** Use the backend's own total when it sent one; derive it only when it didn't. */
const preferred = (v, derived) => (isNumeric(v) ? toAmount(v) : derived);

/** A statutory head is on when its snapshot flag says so; amounts decide only when the flag is missing. */
const isOn = (enabled, amount) => (typeof enabled === "boolean" ? enabled : amount > 0);

/**
 * Whether a line is rendered as an amount rather than as "Not applicable".
 * A head whose flag says "off" but that still carries money is shown as money:
 * the amount is counted in the total either way, and a row reading "Not
 * applicable" next to a total that includes it is how a deduction goes
 * unnoticed. The flags only ever choose the wording for a genuine zero.
 */
const shows = (on, amount) => on || amount > 0;

// `status` is not enumerated in the integration guide; the sample shows
// "estimated" and the payroll-run items use the same vocabulary as
// runMeta.STATUTORY_NOTE. Anything unrecognised is treated as an estimate,
// which is the conservative reading — it never claims a figure is final.
const STATUS_META = {
  estimated: {
    label: "Estimated",
    note: "Worked out from this structure using today's statutory rules. Your payslip can differ once attendance, unpaid leave and investment proofs are applied.",
  },
  calculated: { label: "Calculated", note: null },
  not_applied: {
    label: "Not applied",
    note: "PF, ESI, professional tax and income tax were not applied here, so this is not the final take-home amount.",
  },
  disabled: {
    label: "Not configured",
    note: "Statutory deductions (PF, ESI, professional tax and income tax) are switched off for this organisation.",
  },
};

const TAX_REGIME = {
  new: { label: "New regime (Section 115BAC)", short: "new regime" },
  old: { label: "Old regime", short: "old regime" },
};

/** "12.00" → "12%", "0.75" → "0.75%", missing → null. */
export function formatRate(v) {
  if (!isNumeric(v)) return null;
  const n = toAmount(v);
  return `${Number.isInteger(n) ? n : Number(n.toFixed(2))}%`;
}

/** Warnings may arrive as codes or as `{ code, message }`; both render as a sentence. */
function readWarnings(snapshot) {
  const list = Array.isArray(snapshot?.warnings) ? snapshot.warnings : [];
  return list
    .map((w) => (typeof w === "string" ? humanize(w) : w?.message || humanize(w?.code)))
    .filter(Boolean);
}

/**
 * `statutory_breakdown` → a shape the UI can render directly, or `null` when the
 * structure carries no breakdown at all.
 */
export function normalizeStatutory(structure) {
  const raw = structure?.statutory_breakdown;
  if (!raw || typeof raw !== "object") return null;

  const snapshot = raw.statutory_snapshot && typeof raw.statutory_snapshot === "object" ? raw.statutory_snapshot : {};
  const figures = raw.figures && typeof raw.figures === "object" ? raw.figures : {};
  const pf = snapshot.pf || {};
  const esi = snapshot.esi || {};
  const pt = snapshot.pt || {};
  const tax = snapshot.tax || {};

  const pfWage = toAmount(raw.pf_wage);
  const esiWage = toAmount(raw.esi_wage);
  const pfEmployee = toAmount(raw.pf_employee_amount);
  const pfEmployer = toAmount(raw.pf_employer_amount);
  const esiEmployee = toAmount(raw.esi_employee_amount);
  const esiEmployer = toAmount(raw.esi_employer_amount);
  const professionalTax = toAmount(raw.professional_tax_amount);
  const incomeTax = toAmount(raw.income_tax_amount);
  const eps = toAmount(raw.eps_amount);
  const edli = toAmount(pf.edli);
  const adminCharges = toAmount(pf.admin_charges);

  const pfOn = isOn(pf.enabled, pfEmployee + pfEmployer);
  const esiCovered = typeof raw.esi_covered === "boolean" ? raw.esi_covered : esi.covered ?? null;
  // `covered: true` is itself a statement that ESI applies, so a payload that
  // omits `esi.enabled` must not be described as "ESI is not enabled".
  const esiOn = (isOn(esi.enabled, esiEmployee + esiEmployer) || esiCovered === true) && esiCovered !== false;
  const ptOn = isOn(pt.enabled, professionalTax);
  const taxOn = isOn(tax.enabled, incomeTax);

  const pfRate = formatRate(pf.employee_rate);
  const esiRate = formatRate(esi.employee_rate);
  const regimeMeta = TAX_REGIME[tax.regime];
  const regime = regimeMeta?.label || humanize(tax.regime) || null;
  // Kept apart from `regime` so the sentence below never lower-cases "115BAC".
  const regimeShort = regimeMeta?.short || (regime ? `${regime.toLowerCase()} regime` : null);

  const employeeLines = [
    {
      key: "pf",
      label: "Provident fund (EPF)",
      amount: pfEmployee,
      applicable: shows(pfOn, pfEmployee),
      note: pfOn
        ? [pfRate && `${pfRate} of ${formatMoney(pfWage)} counted for PF`, pf.ceiling_applied === true && "capped at the statutory wage ceiling"]
            .filter(Boolean).join(" · ")
        : "Provident fund is not applied to this structure.",
    },
    {
      key: "esi",
      label: "Employee state insurance (ESI)",
      amount: esiEmployee,
      applicable: shows(esiOn, esiEmployee),
      note: esiOn
        ? [esiRate && `${esiRate} of ${formatMoney(esiWage)} counted for ESI`].filter(Boolean).join(" · ")
        : esiCovered === false
          ? "Not covered — monthly gross is above the ESI wage limit."
          : "ESI is not enabled for this organisation.",
    },
    {
      key: "pt",
      label: "Professional tax",
      amount: professionalTax,
      applicable: shows(ptOn, professionalTax),
      note: ptOn
        ? `${pt.state_code ? `${pt.state_code} ` : ""}state slab`
        : "No state professional tax applies to this structure.",
    },
    {
      key: "tds",
      label: "Income tax (TDS)",
      amount: incomeTax,
      applicable: shows(taxOn, incomeTax),
      note: taxOn
        ? incomeTax > 0
          ? regime || "Projected over the financial year"
          : `No tax due on the projected annual income${regimeShort ? ` under the ${regimeShort}` : ""}.`
        : "Income tax is not withheld against this structure.",
    },
  ];

  const employerLines = [
    {
      key: "pf_employer",
      label: "Provident fund (employer)",
      amount: pfEmployer,
      applicable: shows(pfOn, pfEmployer),
      note: pfOn && (eps > 0 || isNumeric(pf.epf_employer))
        ? `Pension (EPS) ${formatMoney(eps)} · EPF ${formatMoney(pf.epf_employer)}`
        : null,
    },
    {
      key: "esi_employer",
      label: "Employee state insurance (employer)",
      amount: esiEmployer,
      applicable: shows(esiOn, esiEmployer),
      note: esiOn ? formatRate(esi.employer_rate) && `${formatRate(esi.employer_rate)} of ${formatMoney(esiWage)}` : null,
    },
    {
      key: "edli",
      label: "Life insurance (EDLI)",
      amount: edli,
      applicable: shows(pfOn && edli > 0, edli),
      note: edli > 0 ? `${formatRate(pf.edli_rate) || "EDLI"} of ${formatMoney(pfWage)}` : null,
    },
    {
      key: "pf_admin",
      label: "PF admin charges",
      amount: adminCharges,
      applicable: shows(pfOn && adminCharges > 0, adminCharges),
      note: adminCharges > 0 ? `${formatRate(pf.admin_charge_rate) || "Admin charge"} of ${formatMoney(pfWage)}` : null,
    },
  ];

  const employeeTotal = preferred(figures.total_deductions, employeeLines.reduce((s, l) => s + l.amount, 0));
  // The server's total now covers EDLI and admin charges as well as PF and ESI,
  // so the fallback has to count the same heads or the two disagree whenever
  // `figures` is absent.
  const employerTotal = preferred(figures.total_employer_contributions, pfEmployer + esiEmployer + edli + adminCharges);
  const monthlyGross = preferred(figures.monthly_gross, toAmount(structure.monthly_gross));
  const netPay = preferred(figures.net_pay, monthlyGross - employeeTotal);
  const companyCost = preferred(figures.ctc_cost, monthlyGross + employerTotal);

  // `ctc_cost` is gross + employer contributions. That is not the same number as
  // the structure's own contracted CTC whenever employer PF sits on top of the
  // CTC budget rather than inside it — in the integration guide's own sample the
  // two are ₹21,000 a year apart. Never label both of them "CTC"; flag the gap.
  const contractedMonthly = toAmount(structure.annual_ctc) / 12;
  const costAboveContractedCtc = contractedMonthly > 0 && companyCost - contractedMonthly > 1;

  // Stale-structure detection, per the 2026-09-20 integration note. Under the
  // CTC-inclusive model the evaluator reserves the employer's share out of the
  // CTC, so `ctc_cost` must equal annual_ctc / 12. A structure assigned before
  // that fix was built on the old formula — the whole CTC became gross and the
  // employer's share was charged on top — so the two disagree and the figures
  // below are not the final cost. Compared in paise, and two-sided: a cost that
  // came out *under* the CTC is just as much a sign of a stale calculation.
  const ctcCostPaise = Math.round(companyCost * 100);
  const monthlyCtcPaise = Math.round(contractedMonthly * 100);
  const needsRecalculation = contractedMonthly > 0 && Math.abs(ctcCostPaise - monthlyCtcPaise) > 1;

  const statusKey = String(raw.status || "").trim().toLowerCase();
  const meta = STATUS_META[statusKey] || STATUS_META.estimated;

  return {
    status: statusKey || null,
    statusLabel: meta.label,
    // Never volunteer the reassuring "this is an estimate" sentence for a
    // payload that did not actually say what it is.
    statusNote: statusKey ? meta.note : null,
    isEstimate: statusKey !== "calculated",

    monthlyGross,
    employeeTotal,
    employerTotal,
    netPay,
    companyCost,
    contractedMonthly,
    costAboveContractedCtc,
    needsRecalculation,

    employeeLines,
    employerLines,
    // Heads that actually bite. Zero-but-applicable rows stay in `employeeLines`
    // with the sentence that explains the zero.
    hasDeductions: employeeLines.some((l) => l.amount > 0),

    pfWage,
    esiWage,
    taxableEarnings: toAmount(raw.taxable_earnings),
    esiCovered,
    pfOn,
    esiOn,
    ptOn,
    taxOn,
    snapshot,
    detailGroups: buildDetailGroups({ pf, esi, pt, tax, pfWage, esiWage, eps, pfOn, esiOn, ptOn, taxOn, esiCovered, regime }),
    warnings: readWarnings(snapshot),
  };
}

/** `[label, value]` rows for the "how this was worked out" grids, grouped per head. */
function buildDetailGroups({ pf, esi, pt, tax, pfWage, esiWage, eps, pfOn, esiOn, ptOn, taxOn, esiCovered, regime }) {
  const groups = [];

  if (pfOn) {
    groups.push({
      key: "pf",
      title: "Provident fund",
      rows: [
        ["Pay counted for PF", formatMoney(pfWage)],
        ["Employee rate", formatRate(pf.employee_rate)],
        ["Employer rate", formatRate(pf.employer_rate)],
        ["Pension (EPS)", formatMoney(eps)],
        ["Employer EPF share", isNumeric(pf.epf_employer) ? formatMoney(pf.epf_employer) : null],
        ["Insurance (EDLI)", isNumeric(pf.edli) ? formatMoney(pf.edli) : null],
        // Verified live 2026-09-19: this is the plain rate on the PF wage and is
        // counted inside `figures.total_employer_contributions`. An org that sets
        // `pf_admin_charge_min` above zero may still see an establishment floor
        // here — the backend decides, this only renders what it sends.
        ["Admin charges", isNumeric(pf.admin_charges) ? formatMoney(pf.admin_charges) : null],
        ["Wage ceiling", pf.ceiling_applied === true ? "Applied" : pf.restricted === true ? "Restricted to the ceiling wage" : "Not applied"],
        ["Unpaid leave reduces the ceiling", typeof pf.lop_reduces_ceiling === "boolean" ? (pf.lop_reduces_ceiling ? "Yes" : "No") : null],
      ],
    });
  }

  groups.push({
    key: "esi",
    title: "Employee state insurance",
    rows: esiOn
      ? [
          ["Pay counted for ESI", formatMoney(esiWage)],
          ["Employee rate", formatRate(esi.employee_rate)],
          ["Employer rate", formatRate(esi.employer_rate)],
          ["Covered", "Yes"],
        ]
      : [["Covered", esiCovered === false ? "No — gross is above the ESI wage limit" : "No — ESI is not enabled"]],
  });

  groups.push({
    key: "pt",
    title: "Professional tax",
    rows: ptOn
      ? [["State", pt.state_code || null], ["Monthly amount", formatMoney(pt.amount)]]
      : [["Applies", "No state professional tax is configured"]],
  });

  groups.push({
    key: "tax",
    title: "Income tax",
    rows: taxOn
      ? [
          ["Regime", regime],
          ["Projected annual taxable pay", isNumeric(tax.annual_taxable_estimate) ? formatMoney(tax.annual_taxable_estimate) : null],
          ["Projected annual tax", isNumeric(tax.annual_tax_liability) ? formatMoney(tax.annual_tax_liability) : null],
          ["Monthly TDS", isNumeric(tax.monthly_tds) ? formatMoney(tax.monthly_tds) : null],
        ]
      : [["Applies", "Income tax is not withheld against this structure"]],
  });

  return groups.map((g) => ({ ...g, rows: g.rows.filter(([, v]) => v !== null && v !== undefined) })).filter((g) => g.rows.length > 0);
}

/**
 * The three figures every caller shows together — gross, what comes off, and
 * what is left — derived in one place.
 *
 * `net` is deliberately `gross - deductions` rather than the backend's
 * `figures.net_pay`. The contract defines them as equal, but net_pay nets only
 * the statutory side and knows nothing about contractual deduction components,
 * so mixing the two sources let a card and the panel under it disagree, and let
 * the panel's own "gross / deductions / take-home" tiles fail to add up. One
 * derivation means the arithmetic on screen always reconciles; `statutory.netPay`
 * stays available as the server's cross-check.
 *
 * @param {object|null} statutory - normalizeStatutory() output, or null.
 * @param {{ monthlyGross?: unknown, componentDeductions?: unknown }} [opts]
 *   `monthlyGross` is the fallback gross used when there is no breakdown.
 */
export function statutoryTotals(statutory, { monthlyGross, componentDeductions = 0 } = {}) {
  const contractual = toAmount(componentDeductions);
  const gross = statutory ? statutory.monthlyGross : toAmount(monthlyGross);
  const statutoryDeductions = statutory ? statutory.employeeTotal : 0;
  const deductions = statutoryDeductions + contractual;
  return { gross, statutoryDeductions, componentDeductions: contractual, deductions, net: gross - deductions };
}

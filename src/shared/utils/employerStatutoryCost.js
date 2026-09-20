// ─────────────────────────────────────────────────────────────────────────────
// employerStatutoryCost.js — what a salary structure really costs the company,
// as opposed to the CTC that was typed into the form.
//
// THE PROBLEM THIS EXISTS FOR
// The evaluator defines the balancing component as
//     balancing = annual_ctc − Σ(annual_amount of every other is_part_of_ctc component)
// and statutory heads are STATUTORY_COMPONENT_NOT_ASSIGNABLE, so a template
// physically cannot hold a line for employer PF. Every rupee of the CTC is
// therefore absorbed into gross earnings — Special Allowance, being the
// balancing line, swells to fill whatever is left — and the employer's PF, EDLI,
// admin charges and ESI are then computed *on top* of that gross.
//
// The structure reconciles to the CTC to the paise and is still ~5% more
// expensive than the CTC says. On a ₹600,000 CTC with Basic at 40%, the company
// actually pays about ₹628,800 a year.
//
// There is no "preview with statutory" endpoint — #18/#29/#33 attach
// `statutory_breakdown` only to a structure that already exists — so the only
// way to show HR the real cost *before* they commit is to work it out here from
// the org's own statutory config. Everything below is therefore an ESTIMATE and
// must be labelled as one; once the structure is assigned, the server's
// `statutory_breakdown` is authoritative and should be shown instead.
//
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ VERIFIED AGAINST THE DEPLOYED BACKEND — 2026-09-19.                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
// The evaluator now RESERVES the employer's statutory share out of the CTC
// before the balancing line takes the remainder. Measured live on template ESS:
//
//     annual_ctc 600,000 − annual_gross 576,600 = 23,400 reserved
//     = employer PF 21,600 + EDLI 900 + PF admin 900
//
// So `annual_ctc` IS now all-in, and a structure priced through the preview no
// longer overshoots its budget. Confirmed answers:
//
//   1. `annual_ctc` = all-in (gross + employer statutory). The reserved amount
//      is `annual_ctc − annual_gross`, and `serverEmployerStatutory()` reads it
//      from there — no other field exposes it.
//   2. The preview does NOT return `statutory_breakdown`, `ctc_cost` or
//      `employer_contribution` lines. New fields are `annual_ctc_check` and
//      `gross_definition` (a prose note). CAUTION: `annual_ctc_check` holds the
//      GROSS, not the CTC — do not render it as a CTC.
//   3. `monthly_gross` / `annual_gross` are still earnings-only, and match the
//      sum of the earning lines exactly. This module still derives gross from
//      the lines regardless; keep it that way.
//
// The local estimate below is now only a fallback for the pre-fix evaluator,
// where gross equals the CTC and the difference is therefore zero. It is
// validated to reproduce the server's numbers to the rupee on both paths.
//
// ── STILL OPEN: confirm with backend ────────────────────────────────────────
// Structures assigned BEFORE this fix were built on the old formula and are
// still ~5-7% over their stated CTC. Confirmed live: employee
// f5eccc72…de45 has annual_ctc 350,000 with gross 350,000 and ctc_cost
// 373,400. `normalizeStatutory().costAboveContractedCtc` flags one when the
// structure is opened, but nothing sweeps for them. Ask whether a backfill is
// planned; if not, that flag should drive a column on the HR salary grid.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeStatutory, statutoryTotals } from "./statutoryBreakdown";

const toAmount = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Config booleans arrive as real booleans; treat a missing flag as "on" only when a rate exists. */
const flagOn = (v, fallback = false) => (typeof v === "boolean" ? v : fallback);

const pct = (amount, rate) => (amount * toAmount(rate)) / 100;

/** Catalog rows keyed by component_code — preview lines carry `code`, not the PF/ESI flags. */
export function componentFlagsByCode(catalog) {
  const map = {};
  (Array.isArray(catalog) ? catalog : []).forEach((c) => {
    const code = c?.component_code || c?.code;
    if (code) map[code] = c;
  });
  return map;
}

/**
 * Employer-side statutory cost for one month of a previewed structure.
 *
 * @param {object} args
 * @param {Array}  args.lines   preview `lines` (or a structure's `components`)
 * @param {object} args.flags   componentFlagsByCode(catalog)
 * @param {object} args.config  GET /payroll/hr/statutory/config
 * @param {number} [args.monthlyGross] preview `monthly_gross`; summed from the
 *        earning lines when absent.
 */
export function employerStatutoryCost({ lines, flags = {}, config = {}, monthlyGross } = {}) {
  const rows = (Array.isArray(lines) ? lines : []).filter((l) => (l?.component_type || "earning") === "earning");
  const codeOf = (l) => l?.code || l?.component_code;
  const amountOf = (l) => toAmount(l?.monthly_amount);

  // Gross is summed from the EARNING lines, never taken from `monthly_gross`.
  // If the backend ever redefines that field to include employer contributions,
  // trusting it would add employer PF on top of a gross that already contains
  // it — a phantom overshoot, and the re-price action would then push the CTC
  // down by that amount and underpay the employee. `monthly_gross` is only a
  // fallback for a payload that carries no lines at all.
  const earningsGross = rows.reduce((s, l) => s + amountOf(l), 0);
  const reportedGross = monthlyGross === undefined || monthlyGross === null || monthlyGross === ""
    ? null
    : toAmount(monthlyGross);
  const gross = rows.length > 0 ? earningsGross : toAmount(reportedGross);
  // A disagreement means the server counts something in gross that is not an
  // earning line; worth surfacing rather than silently picking a side.
  const grossMismatch = reportedGross !== null && rows.length > 0 && Math.abs(reportedGross - earningsGross) > 0.01;

  // ── PF ────────────────────────────────────────────────────────────────────
  const pfEnabled = flagOn(config.pf_enabled);
  const pfWageRaw = rows.reduce((s, l) => s + (flags[codeOf(l)]?.pf_applicable ? amountOf(l) : 0), 0);
  const pfCeiling = toAmount(config.pf_wage_ceiling);
  const pfCeilingApplied = flagOn(config.pf_restrict_to_ceiling) && pfCeiling > 0 && pfWageRaw > pfCeiling;
  const pfWage = pfEnabled ? (pfCeilingApplied ? pfCeiling : pfWageRaw) : 0;

  const employerPf = pfEnabled ? pct(pfWage, config.pf_employer_rate) : 0;
  const epsCeiling = toAmount(config.eps_wage_ceiling);
  const eps = pfEnabled && flagOn(config.eps_enabled)
    ? pct(epsCeiling > 0 ? Math.min(pfWage, epsCeiling) : pfWage, config.eps_rate)
    : 0;
  const epfEmployer = Math.max(0, employerPf - eps);

  const edliCeiling = toAmount(config.edli_wage_ceiling);
  const edli = pfEnabled && flagOn(config.edli_enabled)
    ? pct(edliCeiling > 0 ? Math.min(pfWage, edliCeiling) : pfWage, config.edli_rate)
    : 0;
  // Admin charges carry an establishment-wide monthly floor
  // (`pf_admin_charge_min`). That floor belongs to the whole organisation, not
  // to one employee, so only the rate part is attributed here; applying the
  // floor per head would overstate a large payroll enormously.
  const adminCharges = pfEnabled ? pct(pfWage, config.pf_admin_charge_rate) : 0;

  // ── ESI ───────────────────────────────────────────────────────────────────
  const esiEnabled = flagOn(config.esi_enabled);
  const esiThreshold = toAmount(config.esi_wage_threshold);
  const esiCovered = esiEnabled && esiThreshold > 0 && gross <= esiThreshold;
  const esiWage = esiCovered
    ? rows.reduce((s, l) => s + (flags[codeOf(l)]?.esi_applicable ? amountOf(l) : 0), 0)
    : 0;
  const employerEsi = esiCovered ? pct(esiWage, config.esi_employer_rate) : 0;

  // `figures.ctc_cost` counts employer PF + employer ESI only, so the headline
  // here uses the same definition and EDLI / admin are reported separately.
  const core = employerPf + employerEsi;
  const extras = edli + adminCharges;

  return {
    monthlyGross: gross,
    earningsGross, reportedGross, grossMismatch,
    pfEnabled, pfWage, pfWageRaw, pfCeilingApplied,
    employerPf, eps, epfEmployer, edli, adminCharges,
    esiEnabled, esiCovered, esiWage, employerEsi,
    core, extras,
    monthlyCost: gross + core,
    monthlyCostWithExtras: gross + core + extras,
    annualCost: (gross + core) * 12,
    annualCostWithExtras: (gross + core + extras) * 12,
  };
}

/**
 * The server's own employer-statutory total for a preview, or null when it
 * doesn't publish one. Read in order of authority: explicit employer
 * contribution lines, then a statutory breakdown, then `ctc_cost` minus gross.
 *
 * Whatever the backend states beats anything computed here, so when it starts
 * reporting these the estimate below stops being used at all.
 */
export function serverEmployerStatutory(preview) {
  const lines = Array.isArray(preview?.lines) ? preview.lines : [];
  const employerLines = lines.filter((l) => l?.component_type === "employer_contribution");
  if (employerLines.length > 0) return employerLines.reduce((s, l) => s + toAmount(l.monthly_amount), 0);

  const figures = preview?.statutory_breakdown?.figures;
  if (figures && figures.total_employer_contributions !== undefined && figures.total_employer_contributions !== null) {
    return toAmount(figures.total_employer_contributions);
  }

  const earnings = lines.filter((l) => (l?.component_type || "earning") === "earning");
  if (preview?.ctc_cost !== undefined && preview?.ctc_cost !== null && earnings.length > 0) {
    return Math.max(0, toAmount(preview.ctc_cost) - earnings.reduce((s, l) => s + toAmount(l.monthly_amount), 0));
  }

  // The evaluator now reserves employer statutory out of the CTC before the
  // balancing line takes the remainder, so `annual_ctc − annual_gross` IS the
  // reserved amount, stated by the server. Verified live 2026-09-19:
  // CTC 600,000 − gross 576,600 = 23,400 = employer PF 21,600 + EDLI 900 +
  // admin 900. Preferred over the local estimate because it is the very figure
  // the structure was built from, and it already covers every head the backend
  // chose to reserve — including ones this module does not model.
  //
  // On the pre-fix evaluator gross equals the CTC, so this is 0 and the caller
  // correctly falls through to the estimate.
  const annualCtc = toAmount(preview?.annual_ctc);
  const annualGross = toAmount(preview?.annual_gross);
  if (annualCtc > 0 && annualGross > 0 && annualCtc - annualGross > 0.01) return (annualCtc - annualGross) / 12;

  return null;
}

/**
 * Employer cost for a preview, preferring the server's figures and falling back
 * to the local estimate. `source` says which was used, so the UI can drop the
 * "estimated" caveat when the number came from the backend.
 */
export function costFromPreview({ preview, flags = {}, config = {} } = {}) {
  const estimate = employerStatutoryCost({
    lines: preview?.lines, flags, config, monthlyGross: preview?.monthly_gross,
  });
  const fromServer = serverEmployerStatutory(preview);
  if (fromServer === null) return { ...estimate, source: "estimated" };

  const gross = estimate.monthlyGross;
  // A server figure is the whole employer-side cost it accounts for, so EDLI and
  // admin charges must NOT be added again — they are already inside it. The
  // with-extras totals therefore collapse onto the plain ones here; adding
  // `estimate.extras` would have overstated the live payload by ₹1,800 a year.
  return {
    ...estimate,
    source: "server",
    core: fromServer,
    extras: 0,
    monthlyCost: gross + fromServer,
    annualCost: (gross + fromServer) * 12,
    monthlyCostWithExtras: gross + fromServer,
    annualCostWithExtras: (gross + fromServer) * 12,
  };
}

/**
 * What comes OFF the employee's gross, for the same preview.
 *
 * PF and ESI are simple rates and are computed exactly. Professional tax needs
 * the state slab table and income tax needs the employee's regime and Chapter
 * VI-A declarations — neither is knowable before a structure exists, so they are
 * reported as unresolved heads rather than guessed. A take-home figure that
 * quietly omitted a real TDS would be worse than one that says it is missing.
 */
export function employeeStatutoryDeductions({ lines, flags = {}, config = {} } = {}) {
  const base = employerStatutoryCost({ lines, flags, config });
  const pfEmployee = base.pfEnabled ? pct(base.pfWage, config.pf_employee_rate) : 0;
  const esiEmployee = base.esiCovered ? pct(base.esiWage, config.esi_employee_rate) : 0;

  const unresolved = [];
  if (flagOn(config.pt_enabled)) unresolved.push({ key: "pt", label: "Professional tax", why: "depends on the state slab" });
  if (flagOn(config.income_tax_enabled)) unresolved.push({ key: "tds", label: "Income tax (TDS)", why: "depends on the employee's regime and declarations" });

  const lines_ = [
    { key: "pf", label: "Provident fund (employee)", amount: pfEmployee, applicable: base.pfEnabled && pfEmployee > 0 },
    { key: "esi", label: "Employee state insurance", amount: esiEmployee, applicable: base.esiCovered && esiEmployee > 0 },
  ];
  const known = pfEmployee + esiEmployee;
  return {
    pfEmployee, esiEmployee, known, lines: lines_, unresolved,
    monthlyGross: base.monthlyGross,
    takeHome: base.monthlyGross - known,
    complete: unresolved.length === 0,
  };
}

/**
 * Employee-side deductions for a preview, preferring the server's own numbers.
 *
 * As of 2026-09-20 the template preview returns `statutory_breakdown` — the same
 * block the employee sees on their own salary page — because the request now
 * carries `user_id`, so the backend can resolve the two heads this module can
 * never work out on its own: professional tax (a state slab) and TDS (the
 * employee's regime and declarations). When that block is present it wins
 * outright and nothing here is estimated.
 *
 * The client estimate stays as the fallback for an older backend, for a preview
 * that came back without the block, and for callers that have lines but no
 * preview. It resolves PF and ESI exactly and names PT and TDS as unresolved
 * rather than guessing them.
 *
 * Both branches return the same shape, so `CtcMoneyFlow` renders either without
 * knowing which it got; `source` says which, for the wording that depends on it.
 *
 * @returns {{source:"server"|"estimated", lines:Array, unresolved:Array,
 *            known:number, monthlyGross:number, takeHome:number, complete:boolean}}
 */
const amountOfLine = (lines, key) => toAmount((lines || []).find((l) => l?.key === key)?.amount);

export function deductionsFromPreview({ preview, flags = {}, config = {} } = {}) {
  const server = normalizeStatutory(preview);
  if (server) {
    // Deduction-type components are contractual, not statutory: the backend's
    // `net_pay` nets only the statutory heads, so netting them here as well is
    // what keeps "gross − withheld = take-home" true on screen. `statutoryTotals`
    // is the single place that derivation lives.
    const componentDeductions = (preview?.lines || [])
      .filter((l) => (l?.component_type || "earning") === "deduction")
      .reduce((sum, l) => sum + toAmount(l.monthly_amount), 0);
    const totals = statutoryTotals(server, { componentDeductions });
    return {
      source: "server",
      // `normalizeStatutory` exposes the heads as rows, not as named fields;
      // read them back off the rows rather than widening its contract.
      pfEmployee: amountOfLine(server.employeeLines, "pf"),
      esiEmployee: amountOfLine(server.employeeLines, "esi"),
      lines: server.employeeLines,
      unresolved: [],
      known: totals.deductions,
      monthlyGross: totals.gross,
      takeHome: totals.net,
      complete: true,
    };
  }
  return { source: "estimated", ...employeeStatutoryDeductions({ lines: preview?.lines, flags, config }) };
}

/** True when a template's components include the single balancing line. */
export const hasBalancingLine = (lines) =>
  (Array.isArray(lines) ? lines : []).some((l) => l?.calculation_type === "balancing");

/**
 * The CTC to enter so that the *real* company cost lands on `target`.
 *
 * Employer cost rises with CTC but not proportionally — a flat component, the PF
 * ceiling or the ESI threshold each put a kink in the curve — so this does not
 * try to invert the evaluator algebraically. It asks the server to evaluate a
 * candidate CTC (`previewAt`), measures the real cost, and uses the secant
 * method, which converges in two or three steps on a curve this close to linear.
 * The evaluator stays the single source of truth for the component split.
 *
 * @param {object} args
 * @param {number} args.target            desired all-in annual cost
 * @param {(ctc:number)=>Promise<object>} args.previewAt resolves to { lines, monthly_gross }
 * @param {(preview:object)=>number} args.costOf annual cost of a preview
 * @param {number} [args.tolerance=1]     rupees
 * @param {number} [args.maxIterations=6]
 * @returns {Promise<{ ctc:number, cost:number, iterations:number, converged:boolean }>}
 */
export async function solveCtcForTargetCost({ target, previewAt, costOf, tolerance = 1, maxIterations = 6 }) {
  const goal = toAmount(target);
  if (goal <= 0) throw new Error("Target cost must be more than zero.");

  // Start from the target itself and from a point below it; the answer is always
  // at or below the target, because cost is never less than the CTC.
  let x0 = goal;
  let y0 = costOf(await previewAt(x0)) - goal;
  if (Math.abs(y0) <= tolerance) return { ctc: x0, cost: y0 + goal, iterations: 1, converged: true };

  let x1 = Math.max(1, goal - y0);
  let iterations = 1;

  for (let i = 0; i < maxIterations; i += 1) {
    const y1 = costOf(await previewAt(x1)) - goal;
    iterations += 1;
    if (Math.abs(y1) <= tolerance) return { ctc: x1, cost: y1 + goal, iterations, converged: true };
    const slope = (y1 - y0) / (x1 - x0);
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = x1 - y1 / slope;
    if (!Number.isFinite(next) || next <= 0) break;
    x0 = x1; y0 = y1;
    x1 = next;
  }
  const finalCost = costOf(await previewAt(x1));
  return { ctc: x1, cost: finalCost, iterations: iterations + 1, converged: Math.abs(finalCost - goal) <= tolerance };
}

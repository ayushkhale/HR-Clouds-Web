// ─────────────────────────────────────────────────────────────────────────────
// StatutoryBreakdown.jsx — renders the `statutory_breakdown` block the current
// salary-structure reads attach (HR #18, manager #29, self #33).
//
// Two entry points, both no-ops when the structure carries no breakdown:
//   <StatutorySummary />  — the gross / deductions / take-home strip.
//   <StatutoryBreakdownPanel /> — the itemised heads, employer share and the
//                                "how this was worked out" detail.
//
// Zero-value heads are kept on screen with the sentence that explains the zero
// (not covered by ESI, no state PT, no tax due), because a missing row reads as
// "we forgot" and a bare ₹0.00 reads as a bug.
// ─────────────────────────────────────────────────────────────────────────────

import { HiShieldCheck, HiInformationCircle, HiExclamation, HiOfficeBuilding, HiCalculator } from "react-icons/hi";
import { DetailGrid, DetailSection, DetailTable } from "./DetailDialog";
import { formatMoney } from "../utils/formatUtils";
import { statutoryTotals } from "../utils/statutoryBreakdown";

/** One tile of the summary strip. `tone` only ever picks from the purple family (or rose for money taken away). */
function Tile({ label, value, hint, tone = "plain" }) {
  const tones = {
    plain: "border border-slate-200/80 bg-white text-slate-900",
    accent: "border border-purple-200 bg-purple-50 text-purple-800",
    minus: "border border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div className={`rounded-2xl px-4 py-3.5 min-w-0 ${tones[tone] || tones.plain}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-lg font-black mt-0.5 tabular-nums truncate">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

/**
 * Compact strip for places that already show a CTC and just need the take-home
 * consequence — HR's revise dialog, a manager's history dialog.
 *
 * `componentDeductions` is the monthly total of any contractual `deduction`
 * components; the backend's `net_pay` does not know about them.
 */
export function StatutorySummary({ statutory, componentDeductions = 0, className = "" }) {
  if (!statutory) return null;
  const totals = statutoryTotals(statutory, { componentDeductions });
  return (
    <div className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Gross / month" value={formatMoney(totals.gross)} />
        <Tile label="Deductions / month" value={`− ${formatMoney(totals.deductions)}`} tone="minus" hint={statutory.statusLabel} />
        <Tile label="Take-home / month" value={formatMoney(totals.net)} tone="accent" hint="After PF, ESI, PT and tax" />
      </div>
      {statutory.statusNote && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
          <HiInformationCircle className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-px" /> <span>{statutory.statusNote}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Non-blocking banner for a structure that predates the CTC-inclusive cost
 * model (integration note 2026-09-20, §4).
 *
 * Those structures were priced with the whole CTC becoming gross pay and the
 * employer's contributions charged on top, so `ctc_cost` does not equal
 * annual_ctc / 12 and every figure derived from them understates what the
 * company actually pays. Re-saving the structure re-runs it through the fixed
 * evaluator. Deliberately non-blocking: the numbers are stale, not unusable,
 * and hiding the page would leave HR with nothing at all.
 *
 * Renders nothing unless `statutory.needsRecalculation` — safe to drop in
 * anywhere a normalized breakdown is in scope.
 */
export function RecalculationPendingNotice({ statutory, className = "" }) {
  if (!statutory?.needsRecalculation) return null;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3.5 py-2.5 ${className}`}>
      <HiExclamation className="w-4 h-4 shrink-0 text-fuchsia-500 mt-px" />
      <p className="text-[11px] font-semibold leading-relaxed text-fuchsia-800">
        This salary structure was created under the previous cost model and is pending recalculation. The figures below
        may not reflect the final cost to company — re-save (revise) the structure to refresh it.
        <span className="block mt-0.5 font-medium text-fuchsia-700">
          Costs {formatMoney(statutory.companyCost)} a month against a contracted {formatMoney(statutory.contractedMonthly)}.
        </span>
      </p>
    </div>
  );
}

/**
 * Shown where the panel would be when a payload carries no `statutory_breakdown`
 * at all — an older backend, or one of the reads that was never enriched.
 *
 * Rendering nothing here is not neutral: the surrounding page would go on
 * showing "deductions: none" and a take-home equal to gross, which is a claim,
 * and a wrong one. PF and TDS still come off the pay. Say we don't have the
 * figures rather than imply there are none — the same reason the HR grid keeps
 * a LOAD_ERROR state instead of falling back to "Not set".
 */
export function StatutoryUnavailableNotice({ compact = false, className = "", defaultOpen = true }) {
  const text = "PF, ESI, professional tax and income tax aren't included here — they're worked out when payroll runs. Actual take-home will be lower than the figure shown.";
  if (compact) {
    return (
      <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 ${className}`}>
        <HiInformationCircle className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-px" /> <span>{text}</span>
      </p>
    );
  }
  return (
    <DetailSection title="Statutory deductions" icon={HiShieldCheck} className={className} defaultOpen={defaultOpen}>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3.5">
        <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" /> <span>{text}</span>
      </p>
    </DetailSection>
  );
}

function AmountTable({ rows, empty, sign = "" }) {
  return (
    <DetailTable
      rows={rows}
      empty={empty}
      rowKey={(r) => r.key}
      columns={[
        {
          header: "Head",
          render: (l) => (
            <span className="block min-w-0">
              <span className={`font-semibold ${l.applicable ? "text-slate-800" : "text-slate-500"}`}>{l.label}</span>
              {l.note && <span className="block text-[11px] text-slate-500 mt-0.5">{l.note}</span>}
            </span>
          ),
        },
        {
          header: "Monthly",
          align: "right",
          render: (l) =>
            l.applicable ? (
              <span className={`font-bold tabular-nums ${sign ? "text-rose-600" : "text-purple-700"}`}>{sign}{formatMoney(l.amount)}</span>
            ) : (
              <span className="text-xs font-semibold text-slate-400">Not applicable</span>
            ),
        },
      ]}
    />
  );
}

/**
 * The itemised view. Render inside a DetailDialog body or straight onto a page —
 * DetailSection is a self-contained card either way.
 */
export default function StatutoryBreakdownPanel({ statutory, componentDeductions = 0, showEmployer = true, showDetail = true, defaultOpen = true }) {
  if (!statutory) return null;
  const totals = statutoryTotals(statutory, { componentDeductions });

  return (
    <div className="space-y-5">
      <DetailSection
        defaultOpen={defaultOpen}
        title="Statutory deductions"
        icon={HiShieldCheck}
        action={<span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">{statutory.statusLabel}</span>}
      >
        <AmountTable rows={statutory.employeeLines} empty="No statutory heads apply." sign="− " />

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
            <dt className="text-xs font-semibold text-slate-600">Gross</dt>
            <dd className="font-bold tabular-nums text-slate-900">{formatMoney(totals.gross)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5">
            <dt className="text-xs font-semibold text-rose-700">Deductions{totals.componentDeductions > 0 ? " (incl. salary deductions)" : ""}</dt>
            <dd className="font-bold tabular-nums text-rose-700">− {formatMoney(totals.deductions)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2.5">
            <dt className="text-xs font-semibold text-purple-700">Take-home</dt>
            <dd className="font-black tabular-nums text-purple-800">{formatMoney(totals.net)}</dd>
          </div>
        </dl>

        {statutory.statusNote && (
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
            <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500" /> <span>{statutory.statusNote}</span>
          </p>
        )}

        {statutory.warnings.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {statutory.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <HiExclamation className="w-3.5 h-3.5 shrink-0 mt-px" /> <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {showEmployer && (
        <DetailSection title="Paid by the company (not deducted from you)" icon={HiOfficeBuilding} defaultOpen={defaultOpen}>
          <AmountTable rows={statutory.employerLines} empty="The company makes no statutory contribution on this structure." />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-slate-600">Total monthly cost to the company</span>
            <span className="font-bold tabular-nums text-slate-900">{formatMoney(statutory.companyCost)}</span>
          </div>
          {statutory.costAboveContractedCtc && (
            // Gross + employer contributions overshoots the contracted CTC when
            // employer PF is budgeted on top of it. Say so rather than showing
            // two different numbers both labelled "CTC".
            <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500" />
              <span>
                This is gross pay plus the company&apos;s statutory contributions. It runs above the contracted CTC of{" "}
                {formatMoney(statutory.contractedMonthly)} a month because employer contributions sit outside the CTC on this structure.
              </span>
            </p>
          )}
        </DetailSection>
      )}

      {showDetail && statutory.detailGroups.length > 0 && (
        <DetailSection title="How this was worked out" icon={HiCalculator} defaultOpen={defaultOpen}>
          <div className="space-y-4">
            {statutory.detailGroups.map((g) => (
              <div key={g.key}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">{g.title}</p>
                <DetailGrid items={g.rows} cols={3} />
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

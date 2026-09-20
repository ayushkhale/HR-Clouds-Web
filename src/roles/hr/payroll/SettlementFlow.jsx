// ─────────────────────────────────────────────────────────────────────────────
// SettlementFlow.jsx — what the last payment for a leaver adds up to.
//
// Three separate movements net against each other, and two of them go the
// "wrong" way — the employee owes the company. Showing them as one total would
// hide that, so each is a stage with its own sign, and the net says plainly
// whether this is a payment or a recovery.
//
// Built on the same stage rhythm as CtcMoneyFlow, so the two money explanations
// in this product read alike.
// ─────────────────────────────────────────────────────────────────────────────

import { HiCash, HiClock, HiCreditCard, HiInformationCircle, HiCheckCircle } from "react-icons/hi";
import { formatMoney, formatPeriod } from "../../../shared/utils/formatUtils";
import { amount, settlementNet } from "./phase7Meta";

const LABEL = "text-[10px] font-bold uppercase tracking-wider text-slate-400";

function Stage({ icon: Icon, title, total, tone = "plain", note, children, first }) {
  const totalCls = tone === "minus" ? "text-rose-700" : tone === "plus" ? "text-violet-700" : "text-slate-900";
  return (
    <div className={first ? "" : "pt-4 border-t border-slate-100"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
        <h5 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Icon className="w-3.5 h-3.5 text-purple-500 shrink-0" /> {title}
        </h5>
        {total !== undefined && total !== null && (
          <span className={`text-xs font-black tabular-nums ${totalCls}`}>
            {tone === "minus" ? "− " : tone === "plus" ? "+ " : ""}{formatMoney(total)}
          </span>
        )}
      </div>
      {note && <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">{note}</p>}
      {children}
    </div>
  );
}

function Line({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-slate-600 min-w-0">
        {label}
        {hint && <span className="block text-[10px] text-slate-400 leading-snug">{hint}</span>}
      </span>
      <span className="text-[11px] font-bold tabular-nums text-slate-800 shrink-0">{value}</span>
    </div>
  );
}

/**
 * @param {object} preview  the #200 settlement-preview response
 * @param {boolean} [prepared] true once #201 has frozen these figures
 */
export default function SettlementFlow({ preview, prepared = false }) {
  if (!preview) return null;

  const { encash, notice, loans, net } = settlementNet(preview);
  // Nothing due either way. "We pay them ₹0.00" reads as a mistake, and
  // "They owe us ₹0.00" reads worse.
  const settled = Math.abs(net) < 0.005;
  const noticeBlock = preview.notice_recovery || {};
  const loanBlock = preview.loan_recovery || {};
  const encashments = preview.encashments || [];
  const skipped = preview.skipped_encashments || [];
  const isPayout = net >= 0;

  return (
    <section className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border-b border-slate-100">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800">The final payment</h4>
          {preview.settlement_period_month && (
            <p className="text-[10px] text-slate-400 mt-0.5">Paid with {formatPeriod(preview.settlement_period_month)} payroll</p>
          )}
        </div>
        <span className={`text-xs font-black tabular-nums ${settled ? "text-slate-500" : isPayout ? "text-purple-700" : "text-rose-700"}`}>
          {settled ? "Nothing due" : isPayout ? formatMoney(net) : `${formatMoney(Math.abs(net))} to recover`}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Money to the employee ------------------------------------------- */}
        <Stage first icon={HiCash} title="Unused leave paid out" total={encash} tone={encash > 0 ? "plus" : "plain"}
          note={encashments.length === 0 ? "No leave balance is being paid out." : undefined}>
          {encashments.length > 0 && (
            <div>
              {encashments.map((e, i) => (
                <Line
                  key={`${e.leave_type_code}-${i}`}
                  label={`${e.leave_type_code || "Leave"} · ${e.days} ${Number(e.days) === 1 ? "day" : "days"}`}
                  hint={amount(e.per_day_amount) === null ? undefined : `${formatMoney(e.per_day_amount)} a day`}
                  value={formatMoney(e.amount)}
                />
              ))}
            </div>
          )}
          {skipped.length > 0 && (
            <p className="flex items-start gap-1.5 mt-2 text-[10px] leading-relaxed text-slate-500">
              <HiInformationCircle className="w-3 h-3 shrink-0 text-purple-400 mt-0.5" />
              <span>
                Not paid out: {skipped.map((s) => s.leave_type_code || s.code).filter(Boolean).join(", ") || "some leave types"}
                {skipped[0]?.reason ? ` — ${skipped[0].reason}` : ""}.
              </span>
            </p>
          )}
        </Stage>

        {/* Money back from the employee ------------------------------------ */}
        <Stage icon={HiClock} title="Short notice" total={notice} tone={notice > 0 ? "minus" : "plain"}
          note={
            noticeBlock.waived ? "Waived — nothing is being recovered."
              : noticeBlock.enabled === false ? "Recovering short notice is switched off."
              : notice === 0 ? "Full notice was served, so there is nothing to recover."
              : undefined
          }>
          {notice > 0 && (
            <Line
              label={`${noticeBlock.days} ${Number(noticeBlock.days) === 1 ? "day" : "days"} short`}
              hint={amount(noticeBlock.per_day_amount) === null ? undefined : `${formatMoney(noticeBlock.per_day_amount)} a day`}
              value={formatMoney(noticeBlock.amount)}
            />
          )}
        </Stage>

        <Stage icon={HiCreditCard} title="Outstanding loans" total={loans} tone={loans > 0 ? "minus" : "plain"}
          note={
            (loanBlock.loans || []).length === 0 ? "No loans are outstanding."
              // The server sends "manual" / "payroll", not the doc's
              // "manual_recovery" / "recover_via_payroll" (confirmed live
              // 2026-09-20). Accept both so this note does not silently vanish.
              : loanBlock.mode === "manual" || loanBlock.mode === "manual_recovery"
                ? "Collected separately, outside payroll — not taken from this payment."
              : undefined
          }>
          {(loanBlock.loans || []).map((l, i) => (
            <Line
              key={l.id || i}
              label={l.loan_number || l.purpose || "Loan"}
              hint={amount(l.outstanding_principal) === null ? undefined : `${formatMoney(l.outstanding_principal)} outstanding`}
              value={formatMoney(l.recovery_amount ?? l.outstanding_principal)}
            />
          ))}
        </Stage>

        {/* The answer ------------------------------------------------------ */}
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${
          settled ? "bg-slate-50 border-slate-200" : isPayout ? "bg-purple-50 border-purple-200" : "bg-rose-50 border-rose-200"}`}>
          <div className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${settled ? "text-slate-500" : isPayout ? "text-purple-500" : "text-rose-500"}`}>
              {settled ? "Nothing to settle" : isPayout ? "We pay them" : "They owe us"}
            </p>
            <p className={`text-[10px] mt-0.5 ${settled ? "text-slate-400" : isPayout ? "text-purple-400" : "text-rose-400"}`}>
              {settled
                ? "Neither side owes the other. Their last month's salary is paid as normal."
                : isPayout
                  ? "Added to their final payslip."
                  : "Taken off their final payslip. If it can't all be recovered, collect the rest separately."}
            </p>
          </div>
          <span className={`text-lg font-black tabular-nums ${settled ? "text-slate-500" : isPayout ? "text-purple-800" : "text-rose-800"}`}>
            {formatMoney(Math.abs(net))}
          </span>
        </div>

        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
          {prepared ? <HiCheckCircle className="w-3.5 h-3.5 shrink-0 text-violet-500 mt-px" />
            : <HiInformationCircle className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-px" />}
          <span>
            {prepared
              ? "These amounts are locked in and waiting to be paid. Statutory deductions and tax are worked out when the payroll runs."
              : "Nothing has been charged or paid yet — this is just a projection. Statutory deductions and tax are worked out when the payroll runs."}
          </span>
        </p>
      </div>
    </section>
  );
}

export { LABEL };

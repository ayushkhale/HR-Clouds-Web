import React from "react";
import { HiExclamationCircle, HiPencil, HiPlus, HiTrash } from "react-icons/hi";
import { CTC_PRESETS, formatINR, moYr, friendlyPreviewNote } from "./ctcBudget";

// Slim target-CTC strip for the Manage Components modal. Warns only, never blocks.
export default function CtcBudgetBar({ target, onTargetChange, budget, loading, error, isCtcDriven, suggestions = [], onSuggestion }) {
  const T = Number(target);

  let status = null;
  let barTone = "bg-purple-600";
  if (budget && T > 0) {
    const over = budget.remaining < -0.5;
    const ratio = budget.used / T;
    const balancingName = budget.balancing?.meta.name || "balancing";
    if (over) {
      barTone = "bg-rose-500";
      status = {
        tone: "text-rose-600",
        text: budget.balancing
          ? `Over by ${moYr(-budget.remaining)} · ${balancingName} would go negative`
          : `Over by ${moYr(-budget.remaining)}`,
      };
    } else if (budget.balancing) {
      // Only what is left AFTER the employer's statutory share actually reaches
      // the balancing component; `budget.remaining` already has it taken off —
      // unless the statutory config never loaded, in which case say "at most"
      // rather than promise a figure that is certainly too high.
      status = budget.reservedKnown
        ? { tone: "text-slate-600", text: `${moYr(budget.remaining)} goes to ${balancingName}` }
        : { tone: "text-slate-500", text: `up to ${moYr(budget.remaining)} goes to ${balancingName} · before employer PF` };
    } else if (budget.remaining > 0.5) {
      if (ratio >= 0.95) barTone = "bg-fuchsia-500";
      status = isCtcDriven
        ? { tone: "text-fuchsia-600", text: `${moYr(budget.remaining)} not allocated · add a balancing component` }
        : { tone: "text-violet-600", text: `${moYr(budget.remaining)} left to allocate` };
    } else {
      status = { tone: "text-violet-600", text: "Target fully allocated" };
    }
  }

  // A balancing line fills whatever is left, so the target counts as fully allocated.
  const filledByBalancing = Boolean(budget?.balancing) && budget.remaining >= -0.5;
  const allocated = budget ? (filledByBalancing ? T : budget.used) : 0;
  const fillPct = budget && T > 0 ? Math.min((allocated / T) * 100, 100) : 0;

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="target-ctc" className="text-[11px] font-bold text-slate-500 uppercase">Target CTC</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
          <input
            id="target-ctc"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 1200000"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            className="w-36 pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CTC_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onTargetChange(String(v))}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition ${T === v ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600 hover:bg-purple-100"}`}
            >
              {v / 100000}L
            </button>
          ))}
        </div>
        {T > 0 && (
          <button type="button" onClick={() => onTargetChange("")} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">Clear</button>
        )}
        {loading && <span className="ml-auto text-[11px] text-slate-400">Calculating…</span>}
      </div>

      {!(T > 0) ? (
        <p className="text-xs text-slate-400 mt-2">Set a target CTC to see how much of it these components use.</p>
      ) : budget ? (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full ${barTone} transition-all duration-300`} style={{ width: `${fillPct}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2 text-xs">
            <span className="text-slate-500 tabular-nums">
              <span className="font-bold text-slate-800">{formatINR(allocated)}</span> of {formatINR(T)} allocated
              {budget.unresolved > 0 && <span className="text-slate-400"> · {budget.unresolved} not estimated</span>}
            </span>
            {status && <span className={`font-semibold tabular-nums ${status.tone}`}>{status.text}</span>}
          </div>

          {/* The target does not all become pay. Show the split so "goes to
              Special Allowance" is never read as the whole remainder. */}
          {budget.reserved > 0.5 && (
            <dl className="mt-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-1 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Paid to the employee (gross)</dt><dd className="font-semibold tabular-nums text-slate-800">{formatINR(T - budget.reserved)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Employer statutory — PF, EDLI, admin</dt><dd className="font-semibold tabular-nums text-slate-800">{formatINR(budget.reserved)}</dd></div>
              <div className="flex justify-between gap-3 pt-1 border-t border-slate-100"><dt className="font-bold text-slate-600">Target CTC</dt><dd className="font-bold tabular-nums text-slate-900">{formatINR(T)}</dd></div>
            </dl>
          )}
          {budget.estimate && error && !loading && (
            <p className="flex items-start gap-1.5 mt-2 text-[11px] text-fuchsia-600" title={error}>
              <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{friendlyPreviewNote(error)}</span>
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-0.5">Suggested</span>
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSuggestion?.(s)}
                  title="Fills in the form for you. Nothing is saved until you confirm."
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${s.tone === "red" ? "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-purple-100 bg-white text-purple-700 hover:bg-purple-50"}`}
                >
                  {s.kind === "edit" ? <HiPencil className="w-3 h-3" /> : s.kind === "remove" ? <HiTrash className="w-3 h-3" /> : <HiPlus className="w-3 h-3" />}
                  {s.title}
                  <span className="font-normal text-slate-500">· {s.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

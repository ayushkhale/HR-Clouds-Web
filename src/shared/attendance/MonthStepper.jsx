// ─────────────────────────────────────────────────────────────────────────────
// attendance/MonthStepper.jsx — Previous / month / next, for the header of a
// dashboard's trend-chart card.
//
// Shared so the HR and manager dashboards step months with the same control in
// the same place (§2). It sits in its own file rather than beside the other
// chart helpers because exporting a component from `trendChartMeta.jsx` made
// react-refresh flag every helper in that file.
// ─────────────────────────────────────────────────────────────────────────────

import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { isFutureMonth, monthLabel, shiftMonth } from "./dates";

/** Next is disabled once it would land in a month that hasn’t happened yet. */
function MonthStepper({ period, onChange }) {
  const next = shiftMonth(period.year, period.month, 1);
  return (
    <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-600">
      <button type="button" onClick={() => onChange(shiftMonth(period.year, period.month, -1))} className="p-1 hover:bg-slate-100 rounded text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
      <span className="w-24 text-center select-none">{monthLabel(period.year, period.month)}</span>
      <button type="button" onClick={() => onChange(next)} disabled={isFutureMonth(next.year, next.month)} className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

export default MonthStepper;

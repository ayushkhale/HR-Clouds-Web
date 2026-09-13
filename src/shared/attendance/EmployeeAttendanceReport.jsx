// ─────────────────────────────────────────────────────────────────────────────
// attendance/EmployeeAttendanceReport.jsx — Employee range report (H46), shared
// by the HR Reports page and the employee profile "Reports" tab so both read
// the same fields and export the same CSV.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import { HiDownload } from "react-icons/hi";
import { attendanceAPI } from "../api";
import { downloadCSV } from "../utils/csv.js";
import { listFrom, num, unwrap } from "./normalize.js";
import { addDaysYMD, fmtDate, fmtMinutes, fmtTime, parseYMDLocal, todayYMD, ymdOnly } from "./dates.js";
import { EmptyState, ErrorState, FieldError, LoadingRows, Spinner, StatusBadge } from "./ui.jsx";

// Consumers previously disagreed on field names (clock_in_time vs clock_in).
export const normalizeReportRecord = (r) => ({
  ...r,
  date: ymdOnly(r.date),
  clock_in_time: r.clock_in_time ?? r.clock_in ?? null,
  clock_out_time: r.clock_out_time ?? r.clock_out ?? null,
  early_exit_minutes: r.early_exit_minutes ?? r.early_leave_minutes ?? 0,
  is_anomaly: !!(r.is_anomaly ?? r.has_anomaly),
});

const localTime = (iso) => (iso ? fmtTime(iso, "") : "");

export default function EmployeeAttendanceReport({ userId, employeeLabel = "employee", emptyHint }) {
  const today = todayYMD();
  const [range, setRange] = useState({ from: addDaysYMD(today, -29), to: today });
  const [rangeError, setRangeError] = useState("");
  // `generated` records the parameters the visible data was produced with, so
  // the CSV name/labels never describe a range the user edited afterwards.
  const [state, setState] = useState({ data: null, loading: false, error: null, generated: null });
  const reqId = useRef(0);

  // A different person (profile navigation) must never show the previous report.
  useEffect(() => {
    reqId.current += 1;
    setState({ data: null, loading: false, error: null, generated: null });
  }, [userId]);

  const generate = useCallback(async () => {
    if (!userId) return;
    if (!parseYMDLocal(range.from) || !parseYMDLocal(range.to)) return setRangeError("Choose a start and end date.");
    if (range.from > range.to) return setRangeError("The start date must be on or before the end date.");
    setRangeError("");
    const id = ++reqId.current;
    const params = { userId, from: range.from, to: range.to };
    setState({ data: null, loading: true, error: null, generated: null });
    try {
      // Query keys for H46 are undocumented (audit C15); these are the keys the
      // live endpoint has been consumed with.
      const res = await attendanceAPI.getEmployeeReport(userId, { start_date: params.from, end_date: params.to });
      if (id === reqId.current) setState({ data: unwrap(res) || {}, loading: false, error: null, generated: params });
    } catch (error) {
      if (id === reqId.current) setState({ data: null, loading: false, error, generated: null });
    }
  }, [userId, range.from, range.to]);

  const records = listFrom(state.data, ["records"]).map(normalizeReportRecord).sort((a, b) => a.date.localeCompare(b.date));
  const summary = state.data?.summary;

  const exportCsv = () => {
    if (!state.generated) return;
    const safeName = String(employeeLabel || "employee").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    downloadCSV(
      `attendance_${safeName}_${state.generated.from}_to_${state.generated.to}.csv`,
      ["Date", "Status", "Clock In", "Clock Out", "Late (min)", "Left Early (min)", "Overtime (min)", "Flagged"],
      records.map((r) => [r.date, r.status || "", localTime(r.clock_in_time), localTime(r.clock_out_time), num(r.late_minutes), num(r.early_exit_minutes), num(r.overtime_minutes), r.is_anomaly ? "Yes" : "No"])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label htmlFor="er-from" className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">From</label>
          <input id="er-from" type="date" max={range.to || today} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-500" />
        </div>
        <div>
          <label htmlFor="er-to" className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">To</label>
          <input id="er-to" type="date" min={range.from} max={today} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-500" />
        </div>
        <button type="button" onClick={generate} disabled={!userId || state.loading} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2">
          {state.loading && <Spinner />} Generate report
        </button>
        {records.length > 0 && (
          <button type="button" onClick={exportCsv} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 hover:bg-slate-50">
            <HiDownload className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>
      <FieldError message={rangeError} />
      {!userId && emptyHint && <p className="text-xs text-slate-400">{emptyHint}</p>}

      {state.error ? (
        <ErrorState error={state.error} onRetry={generate} fallback="Couldn't generate the report." />
      ) : state.loading ? (
        <LoadingRows rows={4} />
      ) : state.data && (
        <>
          {state.generated && (state.generated.from !== range.from || state.generated.to !== range.to) && (
            <p className="text-[11px] font-semibold text-amber-600">Showing {fmtDate(state.generated.from)} – {fmtDate(state.generated.to)}. Generate again to apply the new dates.</p>
          )}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Present", `${num(summary.total_present)}d`],
                ["Absent", `${num(summary.total_absent)}d`],
                ["Late", num(summary.total_late)],
                ["Overtime", fmtMinutes(summary.total_overtime_minutes, "0m")],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                  <div className="text-xl font-extrabold text-slate-800">{value}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</div>
                </div>
              ))}
            </div>
          )}
          {records.length === 0 ? (
            <EmptyState title="No records" message="No attendance was recorded in this period." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">In</th>
                    <th className="px-5 py-3">Out</th>
                    <th className="px-5 py-3">Late</th>
                    <th className="px-5 py-3">Overtime</th>
                    <th className="px-5 py-3">Flagged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {records.map((r) => (
                    <tr key={r.id || r.date} className="hover:bg-slate-50/80">
                      <td className="px-5 py-3 font-medium whitespace-nowrap">{fmtDate(r.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-3">{fmtTime(r.clock_in_time)}</td>
                      <td className="px-5 py-3">{fmtTime(r.clock_out_time)}</td>
                      <td className="px-5 py-3">{num(r.late_minutes) > 0 ? <span className="text-amber-600 font-bold">{fmtMinutes(r.late_minutes)}</span> : "—"}</td>
                      <td className="px-5 py-3">{num(r.overtime_minutes) > 0 ? <span className="text-indigo-600 font-bold">+{fmtMinutes(r.overtime_minutes)}</span> : "—"}</td>
                      <td className="px-5 py-3">{r.is_anomaly ? <span className="text-rose-600 font-bold">Yes</span> : <span className="text-slate-400">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

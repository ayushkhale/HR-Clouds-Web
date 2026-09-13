import React, { useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import { HiDownload, HiCalendar, HiUserGroup, HiUser } from "react-icons/hi";
import EmployeePicker from "../../../../shared/attendance/EmployeePicker";
import EmployeeAttendanceReport from "../../../../shared/attendance/EmployeeAttendanceReport";
import { downloadCSV } from "../../../../shared/utils/csv";
import { employeeCode, listFrom, num, personName } from "../../../../shared/attendance/normalize";
import { fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, todayYMD } from "../../../../shared/attendance/dates";
import { RECORD_STATUS_FILTERS } from "../../../../shared/attendance/enums";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Spinner, StatusBadge } from "../../../../shared/attendance/ui";

const TABS = [
  { value: "daily", label: "Daily report", icon: HiCalendar },
  { value: "monthly", label: "Monthly report", icon: HiUserGroup },
  { value: "employee", label: "Employee report", icon: HiUser },
];

const localTime = (iso) => (iso ? fmtTime(iso, "") : "");

// `params` is what the visible rows were generated for. Exports and labels use
// it, never the current (possibly edited) filter inputs.
function useReport() {
  const [state, setState] = useState({ rows: null, loading: false, error: null, params: null });
  const run = async (fetcher, params) => {
    setState({ rows: null, loading: true, error: null, params: null });
    try {
      const res = await fetcher();
      setState({ rows: listFrom(res, ["records", "report", "employees"]), loading: false, error: null, params });
    } catch (error) {
      setState({ rows: null, loading: false, error, params: null });
    }
  };
  return [state, run];
}

function DailyReport() {
  const [date, setDate] = useState(todayYMD());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [state, run] = useReport();
  // §5.8: `date` is required; `status` and `search` are optional server-side filters.
  const generate = () => {
    const params = { date, status: status || undefined, search: search.trim() || undefined };
    return run(() => attendanceAPI.getDailyReport(params), params);
  };
  const rows = state.rows || [];
  const shownDate = state.params?.date || date;

  const exportCsv = () =>
    downloadCSV(
      `daily_attendance_${shownDate}${state.params?.status ? `_${state.params.status}` : ""}.csv`,
      ["Employee", "Code", "Status", "Clock In", "Clock Out", "Late (min)", "Left Early (min)", "Overtime (min)", "Flagged"],
      rows.map((d) => [personName(d), employeeCode(d), d.status || "", localTime(d.clock_in_time), localTime(d.clock_out_time), num(d.late_minutes), num(d.early_leave_minutes ?? d.early_exit_minutes), num(d.overtime_minutes), d.is_anomaly ? "Yes" : "No"])
    );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-2xs border border-slate-100 flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <label htmlFor="daily-date" className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
          <input id="daily-date" type="date" max={todayYMD()} value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500" />
        </div>
        <div>
          <label htmlFor="daily-status" className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
          <select id="daily-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500">
            {RECORD_STATUS_FILTERS.map((s) => <option key={s.value || "all"} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="sm:flex-1 sm:max-w-xs">
          <label htmlFor="daily-search" className="block text-xs font-semibold text-slate-500 mb-1">Search</label>
          <input id="daily-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && date && !state.loading && generate()} placeholder="Name or employee code" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500" />
        </div>
        <button type="button" onClick={generate} disabled={!date || state.loading} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {state.loading && <Spinner />} Generate
        </button>
        {rows.length > 0 && (
          <button type="button" onClick={exportCsv} className="px-5 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg inline-flex items-center justify-center gap-2 hover:bg-slate-50">
            <HiDownload className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      {state.error ? (
        <div className="bg-white rounded-3xl border border-slate-100"><ErrorState error={state.error} onRetry={generate} fallback="Couldn't generate the daily report." /></div>
      ) : state.loading ? (
        <LoadingRows rows={5} />
      ) : state.rows && (
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-2xs border border-slate-100 space-y-3">
          {shownDate !== date && <p className="text-[11px] font-semibold text-amber-600">Showing {fmtDate(shownDate)}. Generate again to load {fmtDate(date)}.</p>}
          {rows.length === 0 ? (
            <EmptyState title="No records" message={`No attendance recorded on ${fmtDate(shownDate)}.`} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm min-w-[820px]">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">In</th>
                    <th className="px-5 py-3">Out</th>
                    <th className="px-5 py-3">Late</th>
                    <th className="px-5 py-3">Overtime</th>
                    <th className="px-5 py-3">Flagged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {rows.map((d, i) => (
                    <tr key={d.id || d.user_id || i} className="hover:bg-slate-50/80">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800">{personName(d)}</p>
                        {employeeCode(d) && <p className="text-[10px] text-slate-400">{employeeCode(d)}</p>}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={d.status || "not_marked"} /></td>
                      <td className="px-5 py-3">{fmtTime(d.clock_in_time)}</td>
                      <td className="px-5 py-3">{fmtTime(d.clock_out_time)}</td>
                      <td className="px-5 py-3">{num(d.late_minutes) > 0 ? <span className="text-amber-600 font-bold">{fmtMinutes(d.late_minutes)}</span> : "—"}</td>
                      <td className="px-5 py-3">{num(d.overtime_minutes) > 0 ? <span className="text-indigo-600 font-bold">+{fmtMinutes(d.overtime_minutes)}</span> : "—"}</td>
                      <td className="px-5 py-3">{d.is_anomaly ? <span className="text-rose-600 font-bold">Yes</span> : <span className="text-slate-400">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthlyReport() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [state, run] = useReport();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  // The live endpoint is consumed with `month=YYYY-MM` (audit C15).
  const generate = () => run(() => attendanceAPI.getMonthlyReport({ month: period }), { year, month, period });
  const rows = state.rows || [];
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i).filter((y) => y <= now.getFullYear());
  const shown = state.params || { year, month, period };

  const exportCsv = () =>
    downloadCSV(
      `monthly_attendance_${shown.period}.csv`,
      ["Employee", "Code", "Present (days)", "Absent (days)", "Late (days)", "Overtime (min)"],
      rows.map((e) => [personName(e), employeeCode(e), num(e.total_present), num(e.total_absent), num(e.total_late_days), num(e.total_overtime_minutes)])
    );

  const totals = rows.reduce(
    (acc, e) => ({ present: acc.present + num(e.total_present), late: acc.late + num(e.total_late_days), ot: acc.ot + num(e.total_overtime_minutes) }),
    { present: 0, late: 0, ot: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-2xs border border-slate-100 flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex gap-3">
          <div>
            <label htmlFor="mr-month" className="block text-xs font-semibold text-slate-500 mb-1">Month</label>
            <select id="mr-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m} disabled={isFutureMonth(year, m)}>{new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "long" })}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mr-year" className="block text-xs font-semibold text-slate-500 mb-1">Year</label>
            <select id="mr-year" value={year} onChange={(e) => { const y = Number(e.target.value); setYear(y); if (isFutureMonth(y, month)) setMonth(now.getMonth() + 1); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <button type="button" onClick={generate} disabled={state.loading} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {state.loading && <Spinner />} Generate
        </button>
        {rows.length > 0 && (
          <button type="button" onClick={exportCsv} className="px-5 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg inline-flex items-center justify-center gap-2 hover:bg-slate-50">
            <HiDownload className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      {state.error ? (
        <div className="bg-white rounded-3xl border border-slate-100"><ErrorState error={state.error} onRetry={generate} fallback="Couldn't generate the monthly report." /></div>
      ) : state.loading ? (
        <LoadingRows rows={5} />
      ) : state.rows && (
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-2xs border border-slate-100 space-y-6">
          {shown.period !== period && <p className="text-[11px] font-semibold text-amber-600">Showing {monthLabel(shown.year, shown.month)}. Generate again to load {monthLabel(year, month)}.</p>}
          {rows.length === 0 ? (
            <EmptyState title="No records" message={`No attendance recorded for ${monthLabel(shown.year, shown.month)}.`} />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ["People in report", rows.length],
                  ["Avg present days", (totals.present / rows.length).toFixed(1)],
                  ["Late days (total)", totals.late],
                  ["Overtime (total)", fmtMinutes(totals.ot, "0m")],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                    <div className="text-xl font-extrabold text-slate-800">{value}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm min-w-[640px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Present</th>
                      <th className="px-5 py-3">Absent</th>
                      <th className="px-5 py-3">Late</th>
                      <th className="px-5 py-3">Overtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                    {rows.map((e, i) => (
                      <tr key={e.user_id || e.id || i} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-800">{personName(e)}</p>
                          {employeeCode(e) && <p className="text-[10px] text-slate-400">{employeeCode(e)}</p>}
                        </td>
                        <td className="px-5 py-3 font-bold text-indigo-600">{num(e.total_present)}d</td>
                        <td className="px-5 py-3 font-bold text-slate-500">{num(e.total_absent)}d</td>
                        <td className="px-5 py-3">{num(e.total_late_days) > 0 ? <span className="text-amber-600 font-bold">{num(e.total_late_days)}</span> : "—"}</td>
                        <td className="px-5 py-3">{num(e.total_overtime_minutes) > 0 ? <span className="text-indigo-600 font-bold">+{fmtMinutes(e.total_overtime_minutes)}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeReport() {
  const [selected, setSelected] = useState({ id: "", name: "" });
  return (
    <div className="bg-white rounded-3xl p-6 shadow-2xs border border-slate-100 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Employee</p>
        <EmployeePicker value={selected.id} onChange={(id, option) => setSelected({ id, name: option?.name || "" })} purpose="emp_report" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Report {selected.name ? `· ${selected.name}` : ""}</p>
        <EmployeeAttendanceReport key={selected.id} userId={selected.id} employeeLabel={selected.name} emptyHint="Select an employee to generate their report." />
      </div>
    </div>
  );
}

function AttendanceReportsPage() {
  const [activeTab, setActiveTab] = useState("daily");
  return (
    <>
      <DashboardTopBar title="Attendance Reports" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Daily, monthly and per-employee reports for payroll and compliance. Exports open correctly in Excel.</p>
        </div>
        <FilterTabs options={TABS} value={activeTab} onChange={setActiveTab} />
        {activeTab === "daily" && <DailyReport />}
        {activeTab === "monthly" && <MonthlyReport />}
        {activeTab === "employee" && <EmployeeReport />}
      </main>
    </>
  );
}

export default AttendanceReportsPage;

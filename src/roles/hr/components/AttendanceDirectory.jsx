import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { attendanceAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { HiSearch, HiChevronLeft, HiChevronRight, HiUsers, HiBriefcase, HiShieldCheck, HiRefresh } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import LiveEffectiveHours from "../../../shared/attendance/LiveEffectiveHours";
import { departmentName, employeeCode, personName } from "../../../shared/attendance/normalize";
import { addDaysYMD, fmtDate, fmtMinutes, fmtTime, todayYMD } from "../../../shared/attendance/dates";
import { RECORD_STATUS_FILTERS } from "../../../shared/attendance/enums";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";

const TABS = [
  { value: "employees", label: "Employees", icon: HiUsers, fetch: attendanceAPI.getAllEmployeesAttendance },
  { value: "managers", label: "Managers", icon: HiBriefcase, fetch: attendanceAPI.getAllManagersAttendance },
  { value: "hr", label: "HR", icon: HiShieldCheck, fetch: attendanceAPI.getAllHRsAttendance },
];
const AUTO_REFRESH_MS = 120_000;
const SEARCH_DEBOUNCE_MS = 350;

function AttendanceDirectory() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("employees");
  const [date, setDate] = useState(todayYMD());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const today = todayYMD();
  const tab = TABS.find((t) => t.value === activeTab) || TABS[0];

  // `search` and `status` are server-side filters on the HR list endpoints
  // (contract §6.1), so they cover every page, not just the loaded one.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const list = usePagedList(
    ({ page, limit }) => tab.fetch({ page, limit, date, search: search || undefined, status: status || undefined }),
    { limit: 20, keys: ["records"], filterKey: `${activeTab}-${date}-${search}-${status}` }
  );

  // Keep "today" live: periodic refresh while the tab is visible, plus
  // after recompute sweeps triggered from the lock page.
  const reloadList = list.reload;
  useEffect(() => {
    if (date !== today) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reloadList();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [date, today, reloadList]);
  useAttendanceChanged([ATTENDANCE_EVENTS.LOCK, ATTENDANCE_EVENTS.REGULARIZATION], reloadList);

  const filtered = !!(search || status);
  const openProfile = (userId) => userId && navigate(`/dashboard/hr/employees/${userId}?tab=attendance`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800">{DICTIONARY.HEADERS.ATTENDANCE_DIRECTORY}</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">{DICTIONARY.DESCRIPTIONS.ATTENDANCE_DIRECTORY}</p>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col xl:flex-row justify-between gap-4">
        <FilterTabs options={TABS} value={activeTab} onChange={setActiveTab} />
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative sm:w-56">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name or code…" aria-label="Search people" className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-purple-500">
            {RECORD_STATUS_FILTERS.map((s) => <option key={s.value || "all"} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs">
            <button type="button" onClick={() => setDate((d) => addDaysYMD(d, -1))} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Previous day">
              <HiChevronLeft className="w-4 h-4" />
            </button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} className="w-32 text-center bg-transparent outline-none" aria-label="Attendance date" />
            <button type="button" onClick={() => setDate((d) => (d >= today ? d : addDaysYMD(d, 1)))} disabled={date >= today} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Next day">
              <HiChevronRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={list.reload} disabled={list.loading} className="p-1 ml-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-purple-600 disabled:opacity-40" aria-label="Refresh">
              <HiRefresh className={`w-4 h-4 ${list.loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load attendance." />
        ) : list.loading && list.items.length === 0 ? (
          <div className="p-6"><LoadingRows rows={5} /></div>
        ) : list.items.length === 0 ? (
          <EmptyState icon={HiUsers} title="No records" message={filtered ? `No ${tab.label.toLowerCase()} match these filters on ${fmtDate(date)}.` : `No ${tab.label.toLowerCase()} attendance for ${fmtDate(date)}.`} />
        ) : (
          <>
            <div className={`overflow-x-auto ${list.loading ? "opacity-60" : ""}`}>
              <table className="w-full text-left text-sm min-w-[880px]">
                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] uppercase tracking-wide">Code</th>
                    <th className="px-6 py-3.5 text-[11px] uppercase tracking-wide">Name</th>
                    <th className="px-6 py-3.5 text-[11px] uppercase tracking-wide">Department</th>
                    <th className="px-6 py-3.5 text-[11px] uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-[11px] uppercase tracking-wide">Clock In</th>
                    <th className="px-6 py-3.5 text-[11px] uppercase tracking-wide">Clock Out</th>
                    <th className="px-6 py-3.5 text-right text-[11px] uppercase tracking-wide">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.items.map((record, idx) => {
                    const name = personName(record);
                    return (
                      <tr
                        key={record.user_id || record.id || idx}
                        onClick={() => openProfile(record.user_id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openProfile(record.user_id))}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${name}'s attendance`}
                        className="hover:bg-slate-50/50 focus:bg-purple-50/40 outline-none transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3.5 font-mono text-xs font-semibold text-slate-700">{employeeCode(record) || <span className="text-slate-300 font-normal">—</span>}</td>
                        <td className="px-6 py-3.5"><p className="font-bold text-slate-800 text-sm truncate max-w-[200px]" title={name}>{name}</p></td>
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-700 text-sm">{departmentName(record) || "—"}</p>
                          {record.designation && <p className="text-xs text-slate-400 mt-0.5">{record.designation}</p>}
                        </td>
                        <td className="px-6 py-3.5">{record.active_break ? <StatusBadge status="late" label="On Break" /> : <StatusBadge status={record.status || "not_marked"} />}</td>
                        <td className="px-6 py-3.5">
                          {record.clock_in_time ? <span className="font-semibold text-slate-700 text-sm">{fmtTime(record.clock_in_time)}</span> : <span className="text-xs text-slate-400 italic">Not clocked in</span>}
                          {Number(record.late_minutes) > 0 && <p className="text-[10px] text-amber-600 font-bold mt-0.5">{fmtMinutes(record.late_minutes)} late</p>}
                        </td>
                        <td className="px-6 py-3.5">
                          {record.clock_out_time ? <span className="font-semibold text-slate-700 text-sm">{fmtTime(record.clock_out_time)}</span> : <span className="text-xs text-slate-400 italic">{record.clock_in_time ? "Working" : "—"}</span>}
                        </td>
                        <td className="px-6 py-3.5 text-right text-sm">
                          <LiveEffectiveHours effectiveHours={record.effective_hours} clockInTime={record.clock_in_time} clockOutTime={record.clock_out_time} breaks={record.breaks} activeBreak={record.active_break} breakMinutes={record.break_duration_minutes} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
              <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AttendanceDirectory;

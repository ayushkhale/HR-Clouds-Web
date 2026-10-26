import React, { useEffect, useState } from "react";
import { attendanceAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { HiSearch, HiChevronLeft, HiChevronRight, HiUsers, HiBriefcase, HiShieldCheck, HiRefresh } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import LiveEffectiveHours from "../../../shared/attendance/LiveEffectiveHours";
import { departmentName, employeeCode, personName } from "../../../shared/attendance/normalize";
import { fetchAllOrgEmployees } from "../../../shared/utils/orgEmployees";

// The HR list composes `name` server-side and sends the literal "Unknown" when a
// user has no profile row (typically the HR who signed the organisation up).
// Gap G-8 creates those rows and backfills existing organisations; after that
// `name` is the real name or the login email, never "Unknown". Remove this
// fallback once the backend confirms the backfill ran in every environment.
const PLACEHOLDER_NAME = "Unknown";
import { addDaysYMD, fmtDate, fmtMinutes, fmtTime, todayYMD } from "../../../shared/attendance/dates";
import { RECORD_STATUS_FILTERS, normalizeStatusKey } from "../../../shared/attendance/enums";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";
import { PunchInlineGlance, PunchPhotoViewer } from "../../../shared/attendance/PunchDetails";
import { punchesState } from "../../../shared/attendance/punchMeta";
import DailyLogDialog from "../../../shared/attendance/DailyLogDialog";
import { HelpLabel } from "../../../shared/fieldHelp/FieldHelp";
import LocateDialogHost, { LocateCell } from "../../../shared/attendance/LocateQuickAction";
import { LOCATE_COLUMN_LABEL, LOCATE_SURFACE, useLocateColumn } from "../../../shared/attendance/locateColumn";

const TABS = [
  { value: "employees", label: "Employees", icon: HiUsers, fetch: attendanceAPI.getAllEmployeesAttendance, role: "employee" },
  { value: "managers", label: "Managers", icon: HiBriefcase, fetch: attendanceAPI.getAllManagersAttendance, role: "manager" },
  { value: "hr", label: "HR", icon: HiShieldCheck, fetch: attendanceAPI.getAllHRsAttendance, role: "hr" },
];
const AUTO_REFRESH_MS = 120_000;
const SEARCH_DEBOUNCE_MS = 350;

// `title` lets the Live Attendance page use its sidebar name; the dashboard
// keeps the section heading "Attendance Directory".
function AttendanceDirectory({ title = DICTIONARY.HEADERS.ATTENDANCE_DIRECTORY, headingLevel = "h2" }) {
  const Heading = headingLevel;
  const [activeTab, setActiveTab] = useState("employees");
  const [date, setDate] = useState(todayYMD());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  // The clock-in/out punch (coords + photo) a reader asked to see, lifted out of
  // the row so the viewer is a sibling of the table, not nested in a <tr> (§3).
  const [viewPunch, setViewPunch] = useState(null);
  // The person whose day a reader opened. Selecting a row opens the day's full
  // breakdown in place (the same DailyLogDialog the profile tab uses), rather
  // than ejecting to the profile screen for one day's figures.
  const [openDay, setOpenDay] = useState(null);
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
  const openDayFor = (userId) => userId && setOpenDay({ userId, role: tab.role });

  // Until the backend creates the missing profile rows, resolve "Unknown" names
  // from the organisation list, whose name falls back to the login email.
  const [orgNames, setOrgNames] = useState(null);
  const hasPlaceholder = activeTab === "hr" && list.items.some((r) => r?.name === PLACEHOLDER_NAME && r.user_id);
  useEffect(() => {
    if (!hasPlaceholder || orgNames) return undefined;
    let cancelled = false;
    fetchAllOrgEmployees()
      .then((rows) => {
        if (cancelled) return;
        const pairs = rows.map((e) => [e?.user_id, personName(e, "")]);
        setOrgNames(new Map(pairs.filter(([id, name]) => id && name && name !== PLACEHOLDER_NAME)));
      })
      .catch(() => { if (!cancelled) setOrgNames(new Map()); });
    return () => { cancelled = true; };
  }, [hasPlaceholder, orgNames]);
  const nameOf = (record) => {
    const name = personName(record);
    return name === PLACEHOLDER_NAME ? orgNames?.get(record.user_id) || name : name;
  };

  // "Ask where they are", one press from the live list — the quickest place HR
  // reaches for when someone is marked present and unreachable. The column is
  // only drawn when the organisation has the feature on, the date is today and
  // at least one person on this page can actually be asked (§5), so on a past
  // date or a page of nobody-clocked-in it disappears rather than greying out.
  const locate = useLocateColumn({ viewer: "hr", date });
  const showLocate = locate.show && list.items.some(locate.canAsk);

  return (
    <>
    <div className="space-y-6">
      <div>
        <Heading className={`${headingLevel === "h1" ? "text-2xl text-slate-900" : "text-xl text-slate-800"} font-bold tracking-tight`}>{title}</Heading>
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
                    {showLocate && (
                      <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">
                        <HelpLabel text={LOCATE_COLUMN_LABEL} help={{ surface: LOCATE_SURFACE, field: "column", label: "the Location column" }} />
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.items.map((record, idx) => {
                    const name = nameOf(record);
                    // Holiday / weekly-off / leave are days nothing was owed, so a
                    // missing punch reads "N/A" (not applicable) rather than "Not
                    // clocked in", which implies a missed working day. The roster now
                    // synthesises these rows for past dates too (2026-10-03 fix), so
                    // the whole staff list shows on a holiday — not just the absent.
                    const noPunchOwed = ["holiday", "weekly_off", "on_leave"].includes(normalizeStatusKey(record.status));
                    // The HR list rows carry only the first-in / last-out punch
                    // (`punches`); the full leg-by-leg log lives behind the profile.
                    // HR reads are never truncated (contract §6 — only the two
                    // team endpoints set the flag), so truncated is always false.
                    const punches = punchesState(record);
                    return (
                      <tr
                        key={record.user_id || record.id || idx}
                        onClick={() => openDayFor(record.user_id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDayFor(record.user_id))}
                        tabIndex={0}
                        role="button"
                        aria-haspopup="dialog"
                        aria-label={`Open ${name}'s attendance`}
                        className="hover:bg-slate-50/50 focus:bg-purple-50/40 outline-none transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3.5 font-mono text-xs font-semibold text-slate-700">{employeeCode(record) || <span className="text-slate-400 font-sans font-semibold">N/A</span>}</td>
                        <td className="px-6 py-3.5"><p className="font-bold text-slate-800 text-sm truncate max-w-[200px]" title={name}>{name}</p></td>
                        <td className="px-6 py-3.5">
                          <p className={`font-semibold text-sm ${departmentName(record) ? "text-slate-700" : "text-slate-400"}`}>{departmentName(record) || "N/A"}</p>
                          {record.designation && <p className="text-xs text-slate-400 mt-0.5">{record.designation}</p>}
                        </td>
                        <td className="px-6 py-3.5">{record.active_break ? <StatusBadge status="late" label="On Break" /> : <StatusBadge status={record.status || "not_marked"} />}</td>
                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center gap-2">
                            {record.clock_in_time ? <span className="font-semibold text-slate-700 text-sm">{fmtTime(record.clock_in_time)}</span> : <span className="text-xs text-slate-400 italic">{noPunchOwed ? "N/A" : "Not clocked in"}</span>}
                            <PunchInlineGlance punch={punches.in} onViewPhoto={setViewPunch} />
                          </span>
                          {Number(record.late_minutes) > 0 && <p className="text-[10px] text-fuchsia-600 font-bold mt-0.5">{fmtMinutes(record.late_minutes)} late</p>}
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center gap-2">
                            {record.clock_out_time ? <span className="font-semibold text-slate-700 text-sm">{fmtTime(record.clock_out_time)}</span> : <span className="text-xs text-slate-400 italic">{record.clock_in_time ? "Working" : "N/A"}</span>}
                            <PunchInlineGlance punch={punches.out} onViewPhoto={setViewPunch} />
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right text-sm">
                          <LiveEffectiveHours record={record} />
                        </td>
                        {showLocate && <LocateCell column={locate} row={record} name={name} />}
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
    {viewPunch && <PunchPhotoViewer punch={viewPunch} onClose={() => setViewPunch(null)} />}
    <LocateDialogHost column={locate} />
    {openDay && (
      <DailyLogDialog
        userId={openDay.userId}
        date={date}
        employeeRole={openDay.role}
        viewer="hr"
        onClose={() => setOpenDay(null)}
      />
    )}
    </>
  );
}

export default AttendanceDirectory;

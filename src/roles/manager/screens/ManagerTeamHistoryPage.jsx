import React, { useCallback, useEffect, useRef, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI, organizationAPI } from "../../../shared/api";
import { HiFilter, HiClock, HiUser, HiPencil } from "react-icons/hi";
import { normalizePaginated } from "../../../shared/attendance/normalize";
import { useOrgEmployees } from "../../../shared/attendance/EmployeePicker";
import { humanize } from "../../../shared/attendance/enums";
import { addDaysYMD, fmtDate, fmtMinutes, fmtTime, parseYMDLocal, todayYMD, workedLabel, ymdOnly } from "../../../shared/attendance/dates";
import { EmptyState, ErrorState, FieldError, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";
import { dayChip, isSynthesizedDay, isWorkingDay, metric } from "../../../shared/attendance/dayStatus";
import { PersonSelect } from "../../../shared/components/PersonPicker";

// Contract §2 C15 / §8.1: GET /manager/team/history ignores every query
// parameter and returns all records ever for the whole team, unbounded — so it
// is not used. History is read per member from
// GET /manager/team/member/:userId/history, which is filtered by from/to and
// paginated (`total_pages`). The member list is the org roster, which the
// server scopes to the caller's reports.
const PAGE_SIZE = 25;
const FETCH_LIMIT = 100; // backend maximum per request
const MAX_FETCHES = 20;  // ~5 years of days; a safety stop

// The endpoint has no sort parameter and pages oldest-first, so reversing one
// page at a time still showed the oldest page first. The whole range is read
// (100 days a request), sorted newest-first, and paged here.
function useWholeRangeHistory(applied) {
  const [state, setState] = useState({ items: [], loading: false, error: null });
  const [page, setPage] = useState(1);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!applied) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const fetchPage = (p) => attendanceAPI.getTeamMemberHistory(applied.userId, { from: applied.from, to: applied.to, page: p, limit: FETCH_LIMIT });
      const first = normalizePaginated(await fetchPage(1), ["records"], { page: 1, limit: FETCH_LIMIT });
      const pages = Math.min(MAX_FETCHES, first.totalPages || 1);
      const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2)));
      const items = [...first.items, ...rest.flatMap((res) => normalizePaginated(res, ["records"]).items)]
        .sort((a, b) => (ymdOnly(b.date) || "").localeCompare(ymdOnly(a.date) || ""));
      if (id === reqId.current) setState({ items, loading: false, error: null });
    } catch (error) {
      if (id === reqId.current) setState({ items: [], loading: false, error });
    }
  }, [applied]);

  useEffect(() => { setPage(1); load(); }, [load]);

  // The server fills every day in the range, including days before the person
  // joined, which then read "Absent". Those synthesized days are dropped; a real
  // record (a punch) before the joining date is still shown.
  const joined = useJoiningDate(applied?.userId);
  const items = joined ? state.items.filter((r) => !isSynthesizedDay(r) || (ymdOnly(r.date) || "") >= joined) : state.items;
  const hiddenBeforeJoining = state.items.length - items.length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  return {
    items: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    total: items.length,
    joined,
    hiddenBeforeJoining,
    totalPages,
    page: safePage,
    limit: PAGE_SIZE,
    setPage,
    loading: state.loading,
    error: state.error,
    reload: load,
  };
}

/** The member's joining date (YYYY-MM-DD) from their profile, or null. */
function useJoiningDate(userId) {
  const [joined, setJoined] = useState({ userId: null, date: null });
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    organizationAPI.getEmployee(userId)
      .then((res) => {
        const e = res?.data || {};
        const date = ymdOnly(e.joining_date || e.date_of_joining || e.profile?.joining_date || e.profile?.date_of_joining) || null;
        if (alive) setJoined({ userId, date });
      })
      .catch(() => alive && setJoined({ userId, date: null }));
    return () => {
      alive = false;
    };
  }, [userId]);
  return joined.userId === userId ? joined.date : null;
}

function ManagerTeamHistoryPage() {
  const today = todayYMD();
  const team = useOrgEmployees("shift_assignment");
  const [draft, setDraft] = useState({ userId: "", from: addDaysYMD(today, -29), to: today });
  const [applied, setApplied] = useState(null); // { userId, from, to } once a member is chosen
  const [formError, setFormError] = useState("");

  const list = useWholeRangeHistory(applied);

  const applyFilter = (e) => {
    e.preventDefault();
    if (!draft.userId) return setFormError("Choose a team member.");
    if (!parseYMDLocal(draft.from) || !parseYMDLocal(draft.to)) return setFormError("Choose both a start and an end date.");
    if (draft.from > draft.to) return setFormError("The start date must be on or before the end date.");
    if (draft.to > today) return setFormError("The end date can't be in the future.");
    setFormError("");
    if (applied && draft.userId === applied.userId && draft.from === applied.from && draft.to === applied.to) list.reload();
    else setApplied({ ...draft });
  };

  const member = applied ? team.options.find((o) => o.id === applied.userId) : null;
  const memberLabel = member ? `${member.name}${member.code ? ` · ${member.code}` : ""}` : "Team member";

  return (
    <>
      <DashboardTopBar title="Attendance History" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance History</h1>
          <p className="text-sm text-slate-500 mt-1">Past attendance for a member of your reporting line over a date range.</p>
        </div>

        <form onSubmit={applyFilter} className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-5 sm:p-6 flex flex-col lg:flex-row lg:items-end gap-4" noValidate>
          <div className="flex-[2] min-w-0">
            <label htmlFor="th-member" className="block text-xs font-semibold text-slate-500 mb-1">Team member</label>
            <PersonSelect
              id="th-member"
              people={team.options}
              value={draft.userId}
              onChange={(id) => setDraft((d) => ({ ...d, userId: id }))}
              placeholder="Select a team member…"
              loading={team.loading}
              error={team.error ? "Couldn't load your team." : ""}
              emptyText="No team members found."
            />
          </div>
          <div className="flex-1">
            <label htmlFor="th-from" className="block text-xs font-semibold text-slate-500 mb-1">From</label>
            <input id="th-from" type="date" max={draft.to || today} value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
          </div>
          <div className="flex-1">
            <label htmlFor="th-to" className="block text-xs font-semibold text-slate-500 mb-1">To</label>
            <input id="th-to" type="date" min={draft.from} max={today} value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
          </div>
          <button type="submit" disabled={list.loading && !!applied} className="px-6 py-2 bg-purple-600 text-white font-bold text-sm rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            <HiFilter className="w-4 h-4" /> Show history
          </button>
        </form>
        <FieldError message={formError} />

        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
          {!applied ? (
            <EmptyState icon={HiUser} title="Choose a team member" message="Select someone from your team and a date range to see their attendance history." />
          ) : (
            <>
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <HiClock className="text-purple-600" />
                <h2 className="text-sm font-bold text-slate-800">{memberLabel}</h2>
                <span className="text-xs text-slate-400">· {fmtDate(applied.from)} – {fmtDate(applied.to)}</span>
                {list.hiddenBeforeJoining > 0 && (
                  <span className="text-xs text-slate-400">· Joined {fmtDate(list.joined)}; {list.hiddenBeforeJoining} earlier {list.hiddenBeforeJoining === 1 ? "day is" : "days are"} not shown</span>
                )}
              </div>
              {list.error ? (
                <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load this team member's history." />
              ) : list.loading && list.items.length === 0 ? (
                <div className="p-6"><LoadingRows rows={5} /></div>
              ) : list.items.length === 0 ? (
                <EmptyState icon={HiClock} title="No records" message={list.hiddenBeforeJoining > 0 ? "This person joined after this period." : "No attendance was recorded for this person in this period."} />
              ) : (
                <>
                  <div className={`overflow-x-auto ${list.loading ? "opacity-60" : ""}`}>
                    <table className="w-full text-left text-sm min-w-[860px]">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="px-5 py-3.5">Date</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5">In</th>
                          <th className="px-5 py-3.5">Out</th>
                          <th className="px-5 py-3.5">Effective</th>
                          <th className="px-5 py-3.5">Late / Early</th>
                          <th className="px-5 py-3.5">Overtime</th>
                          <th className="px-5 py-3.5">Work mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {list.items.map((r, idx) => {
                          // Dense rows carry `null`, not 0, on days with no
                          // punch — treating those as 0 made every weekly off
                          // report "On time" and dragged overtime averages down.
                          const late = metric(r.late_minutes);
                          const early = metric(r.early_exit_minutes);
                          const overtime = metric(r.overtime_minutes);
                          const chip = dayChip(r);
                          const due = isWorkingDay(r);
                          // No data reads N/A; a duration with nothing recorded reads 0m.
                          const na = <span className="text-slate-400">N/A</span>;
                          const zero = <span className="text-slate-400">0m</span>;
                          return (
                            <tr key={r.id || `${r.date}-${idx}`} className={isSynthesizedDay(r) ? (due ? "" : "bg-slate-50/40") : "hover:bg-slate-50/80 transition-colors"}>
                              <td className="px-5 py-3 text-xs font-medium whitespace-nowrap">{fmtDate(ymdOnly(r.date), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{r.is_regularized && <span title="Corrected through a regularization request" className="ml-1.5 inline-flex items-center justify-center w-4 h-4 align-middle rounded-full bg-purple-100 text-purple-600"><HiPencil className="w-2.5 h-2.5" aria-hidden="true" /><span className="sr-only">Corrected</span></span>}</td>
                              <td className="px-5 py-3">
                                <StatusBadge status={chip.key === "late" ? "present" : chip.key} label={chip.label} />
                              </td>
                              <td className="px-5 py-3 text-xs">{r.clock_in_time ? fmtTime(r.clock_in_time) : na}</td>
                              <td className="px-5 py-3 text-xs">{r.clock_out_time ? fmtTime(r.clock_out_time) : na}</td>
                              <td className="px-5 py-3 text-xs font-semibold">{metric(r.effective_hours) === null && !r.worked_duration_formatted ? zero : workedLabel(r)}</td>
                              <td className="px-5 py-3 text-xs">
                                {late === null && early === null ? na : (
                                  <>
                                    {late > 0 && <span className="block text-rose-600 font-bold">{fmtMinutes(late)} late</span>}
                                    {early > 0 && <span className="block text-fuchsia-600 font-bold">{fmtMinutes(early)} early</span>}
                                    {!late && !early && <span className="text-violet-600 font-semibold">On time</span>}
                                  </>
                                )}
                              </td>
                              <td className="px-5 py-3 text-xs">{overtime === null ? zero : overtime > 0 ? <span className="text-violet-600 font-bold">+{fmtMinutes(overtime)}</span> : <span className="text-slate-400">0m</span>}</td>
                              <td className="px-5 py-3 text-xs text-slate-500">{r.work_mode ? humanize(r.work_mode) : na}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-4 border-t border-slate-100">
                    <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} noun="day" />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default ManagerTeamHistoryPage;

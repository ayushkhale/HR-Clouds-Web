import React, { useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiFilter, HiClock, HiUser } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { useOrgEmployees } from "../../../shared/attendance/EmployeePicker";
import { humanize } from "../../../shared/attendance/enums";
import { addDaysYMD, fmtDate, fmtHours, fmtMinutes, fmtTime, parseYMDLocal, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { EmptyState, ErrorState, FieldError, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";

// Contract §2 C15 / §8.1: GET /manager/team/history ignores every query
// parameter and returns all records ever for the whole team, unbounded — so it
// is not used. History is read per member from
// GET /manager/team/member/:userId/history, which is filtered by from/to and
// paginated (`total_pages`). The member list is the org roster, which the
// server scopes to the caller's reports.
function ManagerTeamHistoryPage() {
  const today = todayYMD();
  const team = useOrgEmployees("shift_assignment");
  const [draft, setDraft] = useState({ userId: "", from: addDaysYMD(today, -29), to: today });
  const [applied, setApplied] = useState(null); // { userId, from, to } once a member is chosen
  const [formError, setFormError] = useState("");

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getTeamMemberHistory(applied.userId, { from: applied.from, to: applied.to, page, limit }),
    { limit: 25, keys: ["records"], filterKey: applied ? `${applied.userId}_${applied.from}_${applied.to}` : "none", enabled: !!applied }
  );

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
      <DashboardTopBar title="Team History" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historical Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">Past attendance for a member of your reporting line over a date range.</p>
        </div>

        <form onSubmit={applyFilter} className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-5 sm:p-6 flex flex-col lg:flex-row lg:items-end gap-4" noValidate>
          <div className="flex-[2] min-w-0">
            <label htmlFor="th-member" className="block text-xs font-semibold text-slate-500 mb-1">Team member</label>
            <select
              id="th-member"
              value={draft.userId}
              onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))}
              disabled={team.loading || !!team.error}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
            >
              <option value="">{team.loading ? "Loading your team…" : team.error ? "Couldn't load your team" : team.options.length === 0 ? "No team members found" : "Select a team member…"}</option>
              {team.options.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.code ? ` · ${o.code}` : ""}</option>
              ))}
            </select>
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
              </div>
              {list.error ? (
                <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load this team member's history." />
              ) : list.loading && list.items.length === 0 ? (
                <div className="p-6"><LoadingRows rows={5} /></div>
              ) : list.items.length === 0 ? (
                <EmptyState icon={HiClock} title="No records" message="No attendance was recorded for this person in this period." />
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
                          const late = Number(r.late_minutes) || 0;
                          const early = Number(r.early_exit_minutes) || 0;
                          return (
                            <tr key={r.id || `${r.date}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-5 py-3 text-xs font-medium whitespace-nowrap">{fmtDate(ymdOnly(r.date), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                              <td className="px-5 py-3">
                                <StatusBadge status={r.status} />
                                {r.is_regularized && <span className="block mt-1 text-[9px] font-bold text-amber-600 uppercase tracking-wide">Corrected</span>}
                              </td>
                              <td className="px-5 py-3 text-xs">{fmtTime(r.clock_in_time)}</td>
                              <td className="px-5 py-3 text-xs">{fmtTime(r.clock_out_time)}</td>
                              <td className="px-5 py-3 text-xs font-semibold">{fmtHours(r.effective_hours)}</td>
                              <td className="px-5 py-3 text-xs">
                                {late > 0 && <span className="block text-rose-600 font-bold">{fmtMinutes(late)} late</span>}
                                {early > 0 && <span className="block text-amber-600 font-bold">{fmtMinutes(early)} early</span>}
                                {late === 0 && early === 0 && <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-5 py-3 text-xs">{Number(r.overtime_minutes) > 0 ? <span className="text-emerald-600 font-bold">+{fmtMinutes(r.overtime_minutes)}</span> : <span className="text-slate-400">—</span>}</td>
                              <td className="px-5 py-3 text-xs text-slate-500">{r.work_mode ? humanize(r.work_mode) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-4 border-t border-slate-100">
                    <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} />
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

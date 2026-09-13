import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { HiGift, HiInformationCircle } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { COMP_OFF_FILTERS } from "../../../shared/attendance/enums";
import { num, unwrap } from "../../../shared/attendance/normalize";
import { addDaysYMD as addDays, fmtDate, fmtHours, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { workspaceFromPath } from "../../../shared/attendance/paths";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";

const TERM = DICTIONARY.TERMS.COMP_OFF;

// Record shape is not documented (audit C11); these accessors accept the field
// names used across the user, manager and HR views of the same entity.
const workedDate = (r) => ymdOnly(r.earned_date || r.worked_date || r.date || r.work_date);
const creditDays = (r) => r.days_earned ?? r.credit_days ?? r.days ?? r.comp_off_days ?? null;
const expiryDate = (r) => ymdOnly(r.expiry_date || r.expires_on || r.expires_at || r.valid_until);

function EmployeeCompOffsPage() {
  const { pathname } = useLocation();
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState({ data: null, loading: true, error: null });

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyCompOffs({ status: status || undefined, page, limit }),
    { limit: 20, keys: ["comp_offs", "compOffs", "records"], filterKey: status }
  );

  const loadSummary = useCallback(async () => {
    setSummary((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getMyCompOffSummary();
      setSummary({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      setSummary({ data: null, loading: false, error });
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useAttendanceChanged([ATTENDANCE_EVENTS.COMPOFF, ATTENDANCE_EVENTS.PUNCH], () => {
    loadSummary();
    list.reload();
  });

  const s = summary.data || {};
  const cards = [
    { label: "Available balance", value: num(s.available_balance), tone: "text-purple-600" },
    { label: "Total earned", value: num(s.total_earned), tone: "text-slate-800" },
    { label: "Used", value: num(s.used_days), tone: "text-slate-800" },
    { label: "Expired", value: num(s.expired_days), tone: "text-slate-800" },
  ];
  const today = todayYMD();
  const isEmployeeWorkspace = workspaceFromPath(pathname) === "employee";

  return (
    <>
      <DashboardTopBar title={`My ${TERM}s`} />
      <main className="p-4 sm:p-8 max-w-[1400px] w-full mx-auto flex-1 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Compensatory Time Off
          </h1>
          <p className="text-sm text-slate-500 mt-1">Days credited for working on holidays or weekly offs.</p>
        </div>

        <div className="flex items-start gap-2 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            Approved {TERM.toLowerCase()} days are added to your leave balance and must be used before they expire.
            {isEmployeeWorkspace && <> Apply for them from <Link to="/dashboard/employee/leaves" className="font-bold underline">My Leaves</Link>.</>}
          </span>
        </div>

        {summary.error ? (
          <div className="bg-white rounded-3xl border border-slate-100"><ErrorState error={summary.error} onRetry={loadSummary} fallback="Couldn't load your balance." /></div>
        ) : (
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${summary.loading ? "opacity-60" : ""}`}>
            {cards.map((c) => (
              <div key={c.label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
                <span className={`text-2xl sm:text-3xl font-bold tracking-tight leading-none ${c.tone}`}>{c.value}</span>
                <div className="text-[11px] sm:text-sm font-semibold text-slate-500 mt-2">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
          <div className="px-5 sm:px-6 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-800">History</h3>
            <FilterTabs options={COMP_OFF_FILTERS} value={status} onChange={setStatus} />
          </div>
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback={`Couldn't load your ${TERM.toLowerCase()}s.`} />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-6"><LoadingRows rows={4} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState icon={HiGift} title={`No ${TERM.toLowerCase()} records`} message={status ? "Nothing with this status." : "Work on a holiday or weekly off to earn one, if your organisation's policy allows it."} />
          ) : (
            <>
              <div className={`overflow-x-auto p-4 sm:p-6 ${list.loading ? "opacity-60" : ""}`}>
                <table className="w-full text-left border-separate border-spacing-y-2 min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <th className="px-4 py-3 rounded-l-xl">Worked on</th>
                      <th className="px-4 py-3">Hours worked</th>
                      <th className="px-4 py-3">Credit</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3 rounded-r-xl">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-semibold text-slate-700">
                    {list.items.map((record, idx) => {
                      const expiry = expiryDate(record);
                      const credit = creditDays(record);
                      const remarks = record.remarks || record.manager_remarks || record.manager_note;
                      const expiringSoon = expiry && record.status === "approved" && expiry >= today && expiry <= addDays(today, 14);
                      return (
                        <tr key={record.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">{fmtDate(workedDate(record))}</td>
                          <td className="px-4 py-3">{record.worked_hours != null ? fmtHours(record.worked_hours) : "—"}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600">{credit != null ? `+${credit} day${Number(credit) === 1 ? "" : "s"}` : "—"}</td>
                          <td className="px-4 py-3"><StatusBadge kind="compoff" status={record.status || "earned"} /></td>
                          <td className={`px-4 py-3 whitespace-nowrap ${expiringSoon ? "text-amber-600 font-bold" : ""}`}>{expiry ? fmtDate(expiry) : "—"}</td>
                          <td className="px-4 py-3 truncate max-w-xs text-slate-500 font-medium" title={remarks}>{remarks || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-6 pb-5">
                <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} />
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default EmployeeCompOffsPage;

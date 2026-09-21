import React, { useCallback, useEffect, useState } from "react";
import { HiCalendar, HiRefresh } from "react-icons/hi";
import { leaveAPI } from "../../../shared/api";
import { listFrom } from "../../../shared/attendance/normalize";
import { fmtDate } from "../../../shared/attendance/dates";
import { EmptyState, ErrorState, LoadingRows } from "../../../shared/attendance/ui";
import { BalanceCard, balanceGridCols } from "../../hr/screens/employee-profile/LeaveTab";

const STATUS_TONE = {
  approved: "bg-violet-50 text-violet-700 border-violet-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};
const statusLabel = (s) => (s ? String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "N/A");
const days = (v) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "N/A";
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
};

/**
 * A direct report's leave, read through the manager-scoped
 * /leaves/team/member/:userId/* endpoints. Read-only: leave rules and policy
 * assignment belong to HR.
 */
export default function TeamMemberLeaveTab({ userId }) {
  const [balances, setBalances] = useState({ items: [], loading: true, error: null });
  const [requests, setRequests] = useState({ items: [], loading: true, error: null });

  const load = useCallback(() => {
    if (!userId) return;
    setBalances((b) => ({ ...b, loading: true, error: null }));
    setRequests((r) => ({ ...r, loading: true, error: null }));
    leaveAPI.getTeamMemberBalances(userId)
      .then((res) => setBalances({ items: listFrom(res, ["balances", "records"]), loading: false, error: null }))
      .catch((error) => setBalances({ items: [], loading: false, error }));
    leaveAPI.getTeamMemberRequests(userId)
      .then((res) => setRequests({ items: listFrom(res, ["requests", "records"]), loading: false, error: null }))
      .catch((error) => setRequests({ items: [], loading: false, error }));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Leave balances</h2>
          <p className="text-xs text-slate-400 mt-0.5">Days left for each leave type this year.</p>
        </div>
        <button type="button" onClick={load} disabled={balances.loading || requests.loading} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh leave">
          <HiRefresh className={`w-4 h-4 ${balances.loading || requests.loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {balances.error ? (
        <div className="bg-white rounded-2xl border border-slate-100"><ErrorState error={balances.error} onRetry={load} fallback="Couldn't load leave balances." /></div>
      ) : balances.loading ? (
        <LoadingRows rows={2} />
      ) : balances.items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100"><EmptyState icon={HiCalendar} title="No balances" message="No leave policy is assigned to this person yet." /></div>
      ) : (
        <div className={`grid gap-4 ${balanceGridCols(balances.items.length)}`}>
          {balances.items.map((b, i) => <BalanceCard key={b.id || b.leave_type_id || i} balance={b} index={i} />)}
        </div>
      )}

      <div>
        <h2 className="text-base font-bold text-slate-800">Leave history</h2>
        <p className="text-xs text-slate-400 mt-0.5">Past and upcoming requests.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        {requests.error ? (
          <ErrorState error={requests.error} onRetry={load} fallback="Couldn't load leave history." />
        ) : requests.loading ? (
          <div className="p-6"><LoadingRows rows={4} /></div>
        ) : requests.items.length === 0 ? (
          <EmptyState icon={HiCalendar} title="No leave yet" message="This person hasn't requested any leave." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 text-[11px] font-semibold uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5">Leave type</th>
                  <th className="px-6 py-3.5">Dates</th>
                  <th className="px-6 py-3.5">Length</th>
                  <th className="px-6 py-3.5">Reason</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requests.items.map((req, i) => {
                  const start = fmtDate(req.start_date, { day: "numeric", month: "short", year: "numeric" });
                  const end = fmtDate(req.end_date, { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <tr key={req.id || i} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-semibold text-slate-800">{req.leave_type?.name || "Leave"}</td>
                      <td className="px-6 py-3.5 text-slate-600 whitespace-nowrap">{req.start_date === req.end_date ? start : `${start} – ${end}`}</td>
                      <td className="px-6 py-3.5 text-slate-600">{days(req.total_days)}</td>
                      <td className="px-6 py-3.5 text-slate-500 max-w-[240px] truncate" title={req.reason || undefined}>{req.reason || "N/A"}</td>
                      <td className="px-6 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_TONE[req.status] || "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"}`}>
                          {statusLabel(req.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

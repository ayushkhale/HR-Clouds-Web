import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiDocumentReport, HiOutlineDocumentSearch, HiUserGroup } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod } from "../../../../shared/utils/formatUtils";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const slipRunId = (s) => s.run_id || s.payroll_run?.id || s.runId;
const slipPeriod = (s) => s.period_month || s.payroll_run?.period_month;

// ── One report's payslip for one run (#54) ─────────────────────────────────
function PayslipDetailModal({ userId, runId, period, onClose, showToast }) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getReportPayslip(userId, runId)
      .then((res) => { if (!cancelled) setData(res.data || res); })
      .catch((err) => { if (!cancelled) { showToast(payrollErrorMessage(err, "Failed to load payslip"), "error"); setData(null); } });
    return () => { cancelled = true; };
  }, [userId, runId, showToast]);

  const item = data?.item || data || {};
  const lines = data?.components || item.components || data?.snapshot?.lines || [];
  const lineAmt = (l) => l.amount ?? l.calculated_amount ?? l.annual_amount;
  const lineName = (l) => l.component_name || l.name;
  const earnings = lines.filter((l) => l.component_type === "earning");
  const deductions = lines.filter((l) => l.component_type === "deduction");

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Payslip — {formatPeriod(period)}</h2>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        {data === undefined ? <div className="p-8"><Skeleton type="dashboard" /></div> : (
          <div className="p-6 overflow-y-auto space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3"><p className="text-[10px] font-bold text-purple-400 uppercase">Gross</p><p className="text-base font-black text-purple-700 tabular-nums">{formatMoney(item.gross_earnings ?? item.gross_pay)}</p></div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3"><p className="text-[10px] font-bold text-red-400 uppercase">Deductions</p><p className="text-base font-black text-red-600 tabular-nums">{formatMoney(item.total_deductions)}</p></div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3"><p className="text-[10px] font-bold text-emerald-500 uppercase">Net Pay</p><p className="text-base font-black text-emerald-700 tabular-nums">{formatMoney(item.net_pay)}</p></div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">Payable / LOP</p><p className="text-base font-black text-slate-700 tabular-nums">{item.payable_days ?? "—"} / {item.lop_days ?? "—"}</p></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Earnings</h3>
                <div className="space-y-2 text-sm">
                  {earnings.length === 0 && <span className="text-slate-400 italic">No earnings lines</span>}
                  {earnings.map((l, i) => (<div key={i} className="flex justify-between"><span className="text-slate-600">{lineName(l)}</span><span className="font-semibold text-slate-800 tabular-nums">{formatMoney(lineAmt(l))}</span></div>))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Deductions</h3>
                <div className="space-y-2 text-sm">
                  {deductions.length === 0 && <span className="text-slate-400 italic">No deductions</span>}
                  {deductions.map((l, i) => (<div key={i} className="flex justify-between"><span className="text-slate-600">{lineName(l)}</span><span className="font-semibold text-red-600 tabular-nums">{formatMoney(lineAmt(l))}</span></div>))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Whole team's numbers for one run (#51 summary + #52 items) ─────────────
function TeamRunModal({ runId, period, onClose, showToast }) {
  const [summary, setSummary] = useState(undefined);
  const [items, setItems] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getTeamRunSummary(runId)
      .then((res) => { if (!cancelled) setSummary(res.data || res); })
      .catch((err) => { if (!cancelled) { showToast(payrollErrorMessage(err, "Failed to load team summary"), "error"); setSummary(null); } });
    payrollAPI.getTeamRunItems(runId)
      .then((res) => { if (!cancelled) setItems(res.data?.records || res.data?.items || res.data || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [runId, showToast]);

  const list = Array.isArray(items) ? items : [];
  // Comp-view OFF strips per-head money — detect whether any item carries a figure.
  const moneyHidden = list.length > 0 && list.every((it) => it.net_pay == null && it.gross_earnings == null);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Team cost — {formatPeriod(period)}</h2>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          {summary === undefined ? <Skeleton type="dashboard" /> : summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">Headcount</p><p className="text-base font-black text-slate-800 tabular-nums">{summary.headcount ?? list.length}</p></div>
              <div className="bg-purple-50 rounded-xl p-3"><p className="text-[10px] font-bold text-purple-400 uppercase">Gross</p><p className="text-base font-black text-purple-700 tabular-nums">{formatMoney(summary.total_gross)}</p></div>
              <div className="bg-emerald-50 rounded-xl p-3"><p className="text-[10px] font-bold text-emerald-500 uppercase">Net</p><p className="text-base font-black text-emerald-700 tabular-nums">{formatMoney(summary.total_net)}</p></div>
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">LOP days</p><p className="text-base font-black text-slate-800 tabular-nums">{summary.total_lop_days ?? "—"}</p></div>
            </div>
          )}

          {moneyHidden && (
            <p className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">Per-employee figures are hidden by your organisation's compensation-visibility policy. Aggregates are shown above.</p>
          )}

          {items === undefined ? <Skeleton type="table" rows={4} /> : list.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Team member</th>
                    {!moneyHidden && <th className="px-4 py-2.5 text-right">Gross</th>}
                    {!moneyHidden && <th className="px-4 py-2.5 text-right">Net</th>}
                    <th className="px-4 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.map((it, i) => (
                    <tr key={it.id || i}>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{it.employee_name || it.user?.profile?.display_name || it.user?.identifier || "—"}</td>
                      {!moneyHidden && <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatMoney(it.gross_earnings)}</td>}
                      {!moneyHidden && <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-600">{formatMoney(it.net_pay)}</td>}
                      <td className="px-4 py-2.5 capitalize text-slate-500">{it.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamPayslipsPage() {
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [toast, setToast] = useState(null);

  const [detailSlip, setDetailSlip] = useState(null); // { userId, runId, period }
  const [teamRun, setTeamRun] = useState(null);        // { runId, period }

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    organizationAPI.getEmployees({ purpose: "shift_assignment" })
      .then((res) => {
        const members = res.data?.records || (Array.isArray(res.data) ? res.data : res.data?.employees) || [];
        setTeamMembers(members);
        if (members.length > 0) setSelectedUserId(members[0].id || members[0]._id);
      })
      .catch((err) => showToast(payrollErrorMessage(err, "Failed to load your team"), "error"))
      .finally(() => setLoadingTeam(false));
  }, [showToast]);

  useEffect(() => {
    if (!selectedUserId) return;
    setLoadingPayslips(true);
    payrollAPI.getReportPayslips(selectedUserId)
      .then((res) => {
        const raw = res.data?.records ?? res.data?.data ?? res.data ?? [];
        setPayslips(Array.isArray(raw) ? raw : []);
      })
      .catch((err) => showToast(payrollErrorMessage(err, "Failed to load payslips"), "error"))
      .finally(() => setLoadingPayslips(false));
  }, [selectedUserId, showToast]);

  return (
    <>
      <DashboardTopBar title="Team Payslips" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiDocumentReport className="text-purple-600 w-7 h-7" /> Team Payslips
            </h1>
            <p className="text-sm text-slate-500 mt-1">Finalized payslips for your direct reports. Open a run to see the whole team's cost.</p>
          </div>
          {!loadingTeam && teamMembers.length > 0 && (
            <select value={selectedUserId || ""} onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-purple-400 shadow-sm">
              {teamMembers.map((m) => (<option key={m.id || m._id} value={m.id || m._id}>{m.name || m.identifier}</option>))}
            </select>
          )}
        </div>

        {loadingTeam || loadingPayslips ? <Skeleton type="table" rows={4} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4 text-right">Payable / LOP</th>
                    <th className="px-6 py-4 text-right">Gross</th>
                    <th className="px-6 py-4 text-right">Deductions</th>
                    <th className="px-6 py-4 text-right">Net Pay</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payslips.map((slip) => {
                    const rid = slipRunId(slip);
                    const period = slipPeriod(slip);
                    return (
                      <tr key={slip.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{formatPeriod(period)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-slate-600">{slip.payable_days ?? "—"} / {slip.lop_days ?? "—"}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-700">{formatMoney(slip.gross_earnings ?? slip.gross_pay)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-red-600">{formatMoney(slip.total_deductions)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-black text-emerald-600">{formatMoney(slip.net_pay)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setDetailSlip({ userId: selectedUserId, runId: rid, period })} title="View payslip"
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                              <HiOutlineDocumentSearch className="w-3.5 h-3.5" /> Payslip
                            </button>
                            {rid && (
                              <button onClick={() => setTeamRun({ runId: rid, period })} title="Whole team for this run"
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                                <HiUserGroup className="w-3.5 h-3.5" /> Team
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {payslips.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No finalized payslips for this employee yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {detailSlip && detailSlip.runId && (
        <PayslipDetailModal userId={detailSlip.userId} runId={detailSlip.runId} period={detailSlip.period} onClose={() => setDetailSlip(null)} showToast={showToast} />
      )}
      {teamRun && (
        <TeamRunModal runId={teamRun.runId} period={teamRun.period} onClose={() => setTeamRun(null)} showToast={showToast} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPlay, HiCalculator,
  HiCheck, HiCash, HiArrowRight, HiUserGroup, HiLockClosed,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatPeriod, formatMoney } from "../../../../shared/utils/formatUtils";

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

const STATUS_STYLES = {
  draft: "bg-slate-50 text-slate-600 border-slate-200",
  calculating: "bg-slate-50 text-slate-700 border-slate-300",
  calculated: "bg-purple-50 text-purple-700 border-purple-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-slate-800 text-white border-slate-800",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

// A single readiness stat in the pre-flight panel.
function ReadinessStat({ label, value, tone = "neutral" }) {
  const toneCls = {
    neutral: "text-slate-800",
    warn: value > 0 ? "text-amber-600" : "text-slate-800",
    bad: value > 0 ? "text-red-600" : "text-slate-800",
  }[tone];
  return (
    <div className="flex flex-col">
      <span className={`text-lg font-bold tabular-nums ${toneCls}`}>{value}</span>
      <span className="text-[11px] text-slate-500 font-medium leading-tight">{label}</span>
    </div>
  );
}

export default function PayrollRunDashboard() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), notes: "" });
  const [eligibility, setEligibility] = useState(null);
  const [eligLoading, setEligLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const periodMonth = `${form.year}-${String(form.month).padStart(2, "0")}`;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getRuns();
      setRuns(res.data?.records || res.data || []);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load runs"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Pre-flight readiness check — runs whenever the chosen month changes while the modal is open.
  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    setEligLoading(true);
    setEligibility(null);
    payrollAPI.getRunEligibility({ period_month: periodMonth })
      .then((res) => { if (!cancelled) setEligibility(res.data || res); })
      .catch((err) => { if (!cancelled) showToast(payrollErrorMessage(err, "Couldn't check readiness for this month"), "error"); })
      .finally(() => { if (!cancelled) setEligLoading(false); });
    return () => { cancelled = true; };
  }, [isModalOpen, periodMonth]);

  const openModal = () => {
    const d = new Date();
    setForm({ month: d.getMonth() + 1, year: d.getFullYear(), notes: "" });
    setIsModalOpen(true);
  };

  const alreadyRun = eligibility?.already_run;
  const canCreate = !eligLoading && !alreadyRun;

  const handleCreateRun = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    try {
      await payrollAPI.createRun({ period_month: periodMonth, run_type: "regular", notes: form.notes });
      showToast("Run created successfully");
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to create run"), "error");
    } finally {
      setCreating(false);
    }
  };

  const CONFIRM_PROMPTS = {
    approve: "Approve this run? This freezes the calculated pay for every employee and locks attendance for the period. You won't be able to recalculate afterwards.",
    pay: "Mark this run as paid? This is the final step and cannot be undone.",
    cancel: "Cancel this run? This releases the attendance lock and reopens the period. Any calculated figures will be discarded.",
  };

  const handleAction = async (id, action) => {
    const prompt = CONFIRM_PROMPTS[action];
    if (prompt && !window.confirm(prompt)) return;
    try {
      if (action === "calculate") await payrollAPI.calculateRun(id);
      if (action === "approve") await payrollAPI.approveRun(id);
      if (action === "pay") await payrollAPI.payRun(id);
      if (action === "cancel") await payrollAPI.cancelRun(id);
      showToast(`Run ${action}d successfully`);
      loadData();
    } catch (err) {
      showToast(payrollErrorMessage(err, `Failed to ${action} run`), "error");
    }
  };

  const openRun = (id) => navigate(`/dashboard/hr/payroll/runs/${id}`);

  return (
    <>
        <DashboardTopBar title="Payroll Run Engine" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payroll Runs
              </h1>
              <p className="text-sm text-slate-500 mt-1">Command center to execute and finalize monthly payroll.</p>
            </div>
            <button onClick={openModal}
              className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlay className="w-5 h-5" /> Start New Run
            </button>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="flex flex-col gap-4">
              {runs.map((run) => (
                <div key={run.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col xl:flex-row xl:items-center gap-6 p-5 sm:p-6 transition-all hover:border-slate-300 group">
                  
                  {/* Left: Period & Status & Errors */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-800 text-lg group-hover:text-purple-700 transition cursor-pointer" onClick={() => openRun(run.id)}>
                        {formatPeriod(run.period_month)}
                      </h3>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_STYLES[run.status] || STATUS_STYLES.draft}`}>
                        {run.status}
                      </span>
                    </div>
                    {run.notes
                      ? <p className="text-sm text-slate-500 line-clamp-1 mb-3">{run.notes}</p>
                      : <p className="text-sm text-slate-400 mb-3 cursor-pointer hover:text-purple-600 transition" onClick={() => openRun(run.id)}>View details</p>}
                    
                    {run.error_count > 0 && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 border border-rose-100 bg-rose-50/50 rounded-lg px-2.5 py-1">
                        <HiExclamationCircle className="w-4 h-4 shrink-0 opacity-70" /> {run.error_count} item{run.error_count === 1 ? "" : "s"} need attention
                      </div>
                    )}
                  </div>

                  {/* Middle: Stats */}
                  <div className="flex flex-wrap items-center gap-6 xl:gap-8 shrink-0 py-4 xl:py-0 border-y border-slate-50 xl:border-y-0 xl:border-l xl:pl-8">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Employees</p>
                      <p className="text-base font-semibold text-slate-800 tabular-nums">{run.total_employees || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gross Payout</p>
                      <p className="text-base font-semibold text-slate-700 tabular-nums">{formatMoney(run.total_gross)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Net Payout</p>
                      <p className="text-base font-semibold text-slate-800 tabular-nums">{formatMoney(run.total_net)}</p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col gap-2 shrink-0 xl:w-48 justify-end mt-2 xl:mt-0">
                    {/* Primary next action */}
                    {run.status === "draft" ? (
                      <button onClick={() => handleAction(run.id, "calculate")} className="flex-1 flex justify-center items-center gap-1.5 px-4 py-2 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-100 hover:bg-purple-100 rounded-lg transition shadow-sm">
                        <HiCalculator className="w-3.5 h-3.5" /> Calculate
                      </button>
                    ) : run.status === "calculated" ? (
                      <button onClick={() => handleAction(run.id, "approve")} className="flex-1 flex justify-center items-center gap-1.5 px-4 py-2 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-100 hover:bg-purple-100 rounded-lg transition shadow-sm">
                        <HiCheck className="w-3.5 h-3.5" /> Approve
                      </button>
                    ) : run.status === "approved" ? (
                      <button onClick={() => handleAction(run.id, "pay")} className="flex-1 flex justify-center items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-lg transition shadow-sm">
                        <HiCash className="w-3.5 h-3.5" /> Finalize
                      </button>
                    ) : (
                      <button onClick={() => openRun(run.id)} className="flex-1 flex justify-center items-center px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition shadow-sm">
                        Review Details
                      </button>
                    )}

                    {/* Secondary actions row */}
                    {run.status !== "paid" && run.status !== "cancelled" && (
                      <div className="flex gap-2">
                        <button onClick={() => openRun(run.id)} className="flex-1 flex justify-center items-center px-2 py-2 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition shadow-sm" title="Review">
                          Review
                        </button>
                        {run.status === "calculated" && (
                          <button onClick={() => handleAction(run.id, "calculate")} className="flex justify-center items-center px-3 py-2 text-[11px] text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition shadow-sm" title="Recalculate">
                            <HiCalculator className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleAction(run.id, "cancel")} className="flex justify-center items-center px-3 py-2 text-[11px] text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition shadow-sm" title="Cancel Run">
                          <HiX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              ))}
              {runs.length === 0 && (
                <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
                  <p className="text-slate-500 font-medium">No payroll runs found. Start a new run to begin.</p>
                </div>
              )}
            </div>
          )}
        </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Start Payroll Run</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateRun} className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: parseInt(e.target.value, 10) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i + 1}>{new Date(0, i).toLocaleString("default", { month: "long" })}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value, 10) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>

              {/* ── Pre-flight readiness ── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <HiUserGroup className="w-4 h-4 text-purple-600" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Readiness — {formatPeriod(periodMonth)}</span>
                </div>

                {eligLoading ? (
                  <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                ) : eligibility ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <ReadinessStat label="In payroll" value={eligibility.headcount ?? 0} />
                      <ReadinessStat label="Joiners" value={eligibility.joiners_count ?? 0} />
                      <ReadinessStat label="Leavers" value={eligibility.leavers_count ?? 0} />
                      <ReadinessStat label="Missing structure" value={eligibility.missing_structure_count ?? 0} tone="bad" />
                      <ReadinessStat label="Missing bank a/c" value={eligibility.missing_bank_account_count ?? 0} tone="warn" />
                      <ReadinessStat label="Needs exit date" value={eligibility.exit_date_required_count ?? 0} tone="bad" />
                    </div>

                    {(eligibility.missing_structure_count > 0 || eligibility.exit_date_required_count > 0) && (
                      <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Some employees can't be calculated yet. You can still create the run and resolve them before approval.
                      </p>
                    )}
                    {eligibility.period_locked && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
                        <HiLockClosed className="w-3.5 h-3.5 shrink-0" /> This period has an attendance lock in place.
                      </p>
                    )}
                    {alreadyRun && (
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                        <span>A run already exists for this month.</span>
                        <button type="button" onClick={() => { setIsModalOpen(false); openRun(alreadyRun.id || alreadyRun); }} className="font-bold underline shrink-0">Open it</button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Readiness details unavailable for this month.</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Notes <span className="font-medium text-slate-400 normal-case">(optional)</span></label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Regular monthly payroll" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" disabled={!canCreate || creating} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                  {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Start Run"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

import React, { useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../../shared/api";
import { leaveErrorMessage } from "../../../../shared/utils/leaveErrors";
import { HiLightningBolt, HiRefresh, HiCheckCircle, HiExclamationCircle, HiX, HiPlay, HiInformationCircle } from "react-icons/hi";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

// Renders the numeric summary the automation engines return so HR can see the
// real outcome (e.g. how many employees were credited vs safely skipped),
// instead of an opaque "done" toast.
function RunSummary({ result, stats }) {
  if (!result) return null;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Last run:</span>
        {stats.map(({ key, label, tone }) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
              tone === "good" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : tone === "warn" ? "bg-amber-50 text-amber-700 border-amber-100"
                : tone === "bad" ? "bg-rose-50 text-rose-700 border-rose-100"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            {label}: {result[key] ?? "—"}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LeaveAutomationPage() {
  const [loadingAccrual, setLoadingAccrual] = useState(false);
  const [loadingRollover, setLoadingRollover] = useState(false);
  const [accrualDate, setAccrualDate] = useState("");
  const [rolloverDate, setRolloverDate] = useState("");
  const [accrualResult, setAccrualResult] = useState(null);
  const [rolloverResult, setRolloverResult] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleRunAccrual() {
    if (!window.confirm("Run the Monthly Leave accrual now? It safely credits leaves to anyone who hasn't received them for the target month (already-credited employees are skipped).")) return;
    setLoadingAccrual(true);
    setAccrualResult(null);
    try {
      const res = await leaveAPI.runAccrual(accrualDate || null);
      const data = res?.data || {};
      setAccrualResult(data);
      showToast(`Accrual complete — ${data.credited ?? 0} credited, ${data.skipped ?? 0} skipped${data.period ? ` for ${data.period}` : ""}.`);
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to run accrual engine."), "error");
    } finally {
      setLoadingAccrual(false);
    }
  }

  async function handleRunRollover() {
    if (!window.confirm("Run the Year-End Rollover now? This carries forward leftover leaves (up to each policy's limit), lapses the rest, and seeds the new year. Run this BEFORE the January accrual.")) return;
    setLoadingRollover(true);
    setRolloverResult(null);
    try {
      const res = await leaveAPI.runRollover(rolloverDate || null);
      const data = res?.data || {};
      setRolloverResult(data);
      showToast(`Rollover complete — ${data.rolled ?? 0} rolled, ${data.skipped ?? 0} skipped${data.oldYear ? ` (${data.oldYear} → ${data.newYear})` : ""}.`);
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to run rollover engine."), "error");
    } finally {
      setLoadingRollover(false);
    }
  }

  return (
    <>
        <DashboardTopBar title="Leave Automation & Maintenance" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Automation Engine</h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-4xl">
              The "brain" of the leave system. Automatically calculates and updates employee leave balances via scheduled background jobs. 
              When triggering manually across a year boundary, always run <strong className="text-slate-700">Year-End Rollover before the January accrual</strong>. Both engines are safe to re-run.
            </p>
          </div>

          <div className="flex flex-col gap-4">

            {/* Monthly Accrual Row */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col xl:flex-row xl:items-start gap-6 transition-all hover:border-slate-300">
              {/* Left Side: Info */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100/50">
                  <HiLightningBolt className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-800 truncate">Monthly Leaves (Accruals)</h2>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed pr-4">
                    Deposits one month's worth of leaves into employees' accounts on the 1st of every month.
                  </p>
                  <RunSummary
                    result={accrualResult}
                    stats={[
                      { key: "period", label: "Period" },
                      { key: "processed", label: "Processed" },
                      { key: "credited", label: "Credited", tone: "good" },
                      { key: "skipped", label: "Skipped", tone: "warn" },
                      { key: "failed", label: "Failed", tone: "bad" },
                    ]}
                  />
                </div>
              </div>

              {/* Right Side: Actions */}
              <div className="flex flex-col sm:flex-row xl:flex-col gap-3 shrink-0 xl:w-56">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Reference date (optional)</label>
                  <input
                    type="date"
                    value={accrualDate}
                    onChange={e => setAccrualDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-50 transition"
                  />
                </div>
                <button
                  onClick={handleRunAccrual}
                  disabled={loadingAccrual}
                  className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:text-purple-700 hover:border-purple-200 hover:bg-purple-50 disabled:opacity-50 text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm"
                >
                  {loadingAccrual ? (
                    <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-purple-600 rounded-full animate-spin" /> Running...</>
                  ) : (
                    <><HiPlay className="w-4 h-4 text-purple-500" /> Trigger Accrual</>
                  )}
                </button>
              </div>
            </div>

            {/* Year End Rollover Row */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col xl:flex-row xl:items-start gap-6 transition-all hover:border-slate-300">
              {/* Left Side: Info */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/50">
                  <HiRefresh className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-800 truncate">New Year Calculations (Rollover)</h2>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed pr-4">
                    Closes out the old year. Moves unused leaves into the new year, lapses the rest, and seeds fresh quotas.
                  </p>
                  <RunSummary
                    result={rolloverResult}
                    stats={[
                      { key: "oldYear", label: "Old" },
                      { key: "newYear", label: "New" },
                      { key: "processed", label: "Processed" },
                      { key: "rolled", label: "Rolled", tone: "good" },
                      { key: "skipped", label: "Skipped", tone: "warn" },
                      { key: "failed", label: "Failed", tone: "bad" },
                    ]}
                  />
                </div>
              </div>

              {/* Right Side: Actions */}
              <div className="flex flex-col sm:flex-row xl:flex-col gap-3 shrink-0 xl:w-56">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Reference date (optional)</label>
                  <input
                    type="date"
                    value={rolloverDate}
                    onChange={e => setRolloverDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                  />
                </div>
                <button
                  onClick={handleRunRollover}
                  disabled={loadingRollover}
                  className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50 text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm"
                >
                  {loadingRollover ? (
                    <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" /> Running...</>
                  ) : (
                    <><HiPlay className="w-4 h-4 text-blue-500" /> Trigger Rollover</>
                  )}
                </button>
              </div>
            </div>

          </div>
        </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

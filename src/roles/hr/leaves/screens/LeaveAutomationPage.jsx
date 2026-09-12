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
    <div className="mt-4 pt-4 border-t border-slate-50">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Last run</p>
      <div className="flex flex-wrap gap-2">
        {stats.map(({ key, label, tone }) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
              tone === "good" ? "bg-emerald-50 text-emerald-700"
                : tone === "warn" ? "bg-amber-50 text-amber-700"
                : tone === "bad" ? "bg-rose-50 text-rose-700"
                : "bg-slate-100 text-slate-600"
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
            <p className="text-sm text-slate-500 mt-1">
              The "brain" of the leave system. Automatically calculates and updates employee leave balances.
            </p>
          </div>

          {/* Ordering hint */}
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 max-w-4xl">
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              These run automatically via cron in production. When triggering manually across a year boundary,
              always run <strong>Year-End Rollover before the January accrual</strong> — the rollover seeds the
              new year's balance rows that accrual then tops up. Both engines are idempotent and safe to re-run.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">

            {/* Monthly Accrual Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <HiLightningBolt className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Monthly Leaves (Accruals)</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Deposits one month's worth of leaves into employees' accounts on the 1st of every month. Safe to re-run — it won't double-credit anyone.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Reference date (optional)</label>
                <input
                  type="date"
                  value={accrualDate}
                  onChange={e => setAccrualDate(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank to use today. Set a date to run accrual for a specific month.</p>
              </div>

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

              <div className="mt-auto pt-4 border-t border-slate-50 flex justify-end items-center">
                <button
                  onClick={handleRunAccrual}
                  disabled={loadingAccrual}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
                >
                  {loadingAccrual ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                  ) : (
                    <><HiPlay className="w-4 h-4" /> Trigger Accrual</>
                  )}
                </button>
              </div>
            </div>

            {/* Year End Rollover Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <HiRefresh className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">New Year Calculations (Rollover)</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Closes out the old year. Moves unused leaves (up to the limit) into the new year, lapses the rest, and seeds everyone's fresh quotas.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Reference date (optional)</label>
                <input
                  type="date"
                  value={rolloverDate}
                  onChange={e => setRolloverDate(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank to use today. Set e.g. Jan 1 to run across a year boundary.</p>
              </div>

              <RunSummary
                result={rolloverResult}
                stats={[
                  { key: "oldYear", label: "Old year" },
                  { key: "newYear", label: "New year" },
                  { key: "processed", label: "Processed" },
                  { key: "rolled", label: "Rolled", tone: "good" },
                  { key: "skipped", label: "Skipped", tone: "warn" },
                  { key: "failed", label: "Failed", tone: "bad" },
                ]}
              />

              <div className="mt-auto pt-4 border-t border-slate-50 flex justify-end items-center">
                <button
                  onClick={handleRunRollover}
                  disabled={loadingRollover}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-black disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
                >
                  {loadingRollover ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                  ) : (
                    <><HiPlay className="w-4 h-4" /> Trigger Rollover</>
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

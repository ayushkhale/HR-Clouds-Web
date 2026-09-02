import React, { useState } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../../shared/api";
import { HiLightningBolt, HiRefresh, HiCheckCircle, HiExclamationCircle, HiX, HiPlay } from "react-icons/hi";

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

export default function LeaveAutomationPage() {
  const [loadingAccrual, setLoadingAccrual] = useState(false);
  const [loadingRollover, setLoadingRollover] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleRunAccrual() {
    if (!window.confirm("Are you sure you want to run the Monthly Leave calculations now? It will safely add leaves to everyone's account who hasn't received them this month.")) return;
    setLoadingAccrual(true);
    try {
      showToast("Accrual engine started. This may take a few moments...", "success");
      await leaveAPI.runAccrual();
      showToast("Monthly accruals have been successfully processed for all employees.", "success");
    } catch (err) {
      showToast(err.message || "Failed to run accrual engine.", "error");
    } finally {
      setLoadingAccrual(false);
    }
  }

  async function handleRunRollover() {
    if (!window.confirm("Are you sure you want to run the New Year Calculations? This will carry-forward leftover leaves and start the new year fresh.")) return;
    setLoadingRollover(true);
    try {
      showToast("Rollover engine started. This may take a few moments...", "success");
      await leaveAPI.runRollover();
      showToast("Year-end rollover has been successfully processed for all employees.", "success");
    } catch (err) {
      showToast(err.message || "Failed to run rollover engine.", "error");
    } finally {
      setLoadingRollover(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Leave Automation & Maintenance" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Automation Engine</h1>
            <p className="text-sm text-slate-500 mt-1">
              The "brain" of the leave system. Automatically calculates and updates employee leave balances.
            </p>
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
                    Automatically deposits 1 month's worth of leaves into employees' accounts on the 1st of every month. (Safe to click multiple times - it won't double-credit anyone!)
                  </p>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Usually runs on 1st of month</span>
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
                    Closes out the old year. Moves unused leaves (up to the limit) into the new year, drops the rest, and gives everyone their fresh new leaves for the year!
                  </p>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Usually runs on Dec 31 / Mar 31</span>
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
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

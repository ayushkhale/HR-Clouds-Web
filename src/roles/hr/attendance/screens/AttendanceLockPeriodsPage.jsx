import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import PageHeader from "../../../../shared/components/PageHeader";
import { attendanceAPI } from "../../../../shared/api";
import { HiSparkles, HiLockClosed, HiLockOpen, HiPlus, HiX, HiExclamation, HiCheckCircle } from "react-icons/hi";

function AttendanceLockPeriodsPage() {
  const [locks, setLocks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchLocks(); }, []);

  const fetchLocks = async () => {
    try {
      const res = await attendanceAPI.getLockPeriods();
      if (res.success) setLocks(res.data || []);
    } catch (err) { console.error(err); }
  };

  const showToastMsg = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreateLock = async () => {
    try {
      const res = await attendanceAPI.createLockPeriod(form);
      if (res.success) {
        showToastMsg("Period locked successfully");
        setShowConfirm(false);
        setShowForm(false);
        setForm({ start_date: "", end_date: "", reason: "" });
        fetchLocks();
      }
    } catch (err) {
      const code = err.data?.error?.code || "";
      if (code === "OVERLAPPING_LOCK") {
        showToastMsg("This period overlaps with an existing lock", "error");
      } else {
        showToastMsg(err.message || "Failed to create lock", "error");
      }
      setShowConfirm(false);
    }
  };

  const handleUnlock = async (lock) => {
    if (!confirm(`Unlock period ${lock.start_date} to ${lock.end_date}? This will re-open this period for edits.`)) return;
    try {
      const res = await attendanceAPI.deleteLockPeriod(lock.id);
      if (res.success) {
        showToastMsg("Lock removed successfully");
        fetchLocks();
      }
    } catch (err) {
      showToastMsg(err.message || "Failed to unlock", "error");
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "--";

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Lock Periods" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Period Locking</h1>
              <p className="text-sm text-slate-500 mt-1">Freeze attendance data for payroll processing.</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" /> Lock Period
            </button>
          </div>

          {/* Create Lock Form */}
          {showForm && (
            <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-base font-bold text-slate-850 flex items-center gap-2">
                <HiLockClosed className="w-4 h-4 text-purple-600" /> Create New Lock
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1.5">Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1.5">End Date *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1.5">Reason</label>
                  <input type="text" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. July 2026 Payroll"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800">Cancel</button>
                <button onClick={() => setShowConfirm(true)} disabled={!form.start_date || !form.end_date}
                  className="px-5 py-2 bg-[#6D28D9] hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                  <HiLockClosed className="w-4 h-4" /> Lock Period
                </button>
              </div>
            </div>
          )}

          {/* Active Locks Table */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            <h3 className="text-base font-bold text-slate-850 flex items-center gap-2">
              <HiLockClosed className="w-4 h-4 text-purple-600" /> Active Lock Periods
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4">Reason</th>
                    <th className="px-6 py-4">Locked On</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {locks.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400">No lock periods configured. Lock a period before running payroll.</td></tr>
                  ) : locks.map(lock => (
                    <tr key={lock.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-primary-800">
                        {formatDate(lock.start_date)} — {formatDate(lock.end_date)}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{lock.reason || "--"}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{formatDate(lock.created_at)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1 w-fit">
                          <HiLockClosed className="w-3 h-3" /> Locked
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleUnlock(lock)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 ml-auto transition-colors">
                          <HiLockOpen className="w-3.5 h-3.5" /> Unlock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto">
                <HiExclamation className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Confirm Period Lock</h3>
              <p className="text-sm text-slate-500">
                Locking <strong className="text-slate-700">{form.start_date}</strong> to <strong className="text-slate-700">{form.end_date}</strong> will freeze all attendance records for this period.
              </p>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700 font-medium text-left">
                ⚠️ All pending regularizations and comp-off requests within this date range will be automatically rejected. This action can be reversed by unlocking.
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleCreateLock} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                <HiLockClosed className="w-4 h-4" /> Lock Period
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 ${toast.type === "error" ? "bg-rose-500 text-white" : "bg-purple-600 text-white"}`}>
          {toast.type === "error" ? <HiX className="w-4 h-4" /> : <HiCheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default AttendanceLockPeriodsPage;

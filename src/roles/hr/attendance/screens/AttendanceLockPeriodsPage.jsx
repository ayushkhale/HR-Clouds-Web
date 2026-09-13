import React, { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { validateLock, hasErrors } from "../../../../shared/attendance/validation";
import { listFrom, personName, unwrap } from "../../../../shared/attendance/normalize";
import { fmtDate, fmtDateTime, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../../../../shared/attendance/events";
import { EmptyState, ErrorState, FieldError, InlineAlert, LoadingRows, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import { HiLockClosed, HiLockOpen, HiPlus, HiExclamation, HiRefresh, HiX } from "react-icons/hi";

// Locks created by an approved payroll run (payroll D-3) must not be removed
// casually — unlocking re-opens a period that has already been paid.
const isPayrollLock = (lock) =>
  !!(lock.payroll_run_id || lock.payroll_run || lock.source === "payroll" || lock.lock_type === "payroll" || /payroll run/i.test(lock.reason || ""));

function UnlockDialog({ lock, onClose, onUnlocked }) {
  const payroll = isPayrollLock(lock);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (busy || (payroll && typed.trim().toUpperCase() !== "UNLOCK")) return;
    setBusy(true);
    setError("");
    try {
      await attendanceAPI.deleteLockPeriod(lock.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.LOCK, { action: "delete", id: lock.id });
      onUnlocked();
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't remove the lock."));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" role="dialog" aria-modal="true">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-800">Unlock {fmtDate(ymdOnly(lock.start_date))} – {fmtDate(ymdOnly(lock.end_date))}?</h3>
            <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600" aria-label="Close"><HiX className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-slate-500">Employees and managers will be able to change punches, regularizations, overtime and {""}comp-offs dated in this range again.</p>
          {payroll && (
            <InlineAlert tone="rose">
              This lock was created by a payroll run. Changing attendance after payroll has been processed can make paid amounts incorrect.
              <label className="block mt-2 font-bold">Type UNLOCK to confirm
                <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 w-full px-3 py-2 border border-rose-200 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:border-rose-400" autoComplete="off" />
              </label>
            </InlineAlert>
          )}
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}
        </div>
        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl disabled:opacity-50">Cancel</button>
          <button type="button" onClick={confirm} disabled={busy || (payroll && typed.trim().toUpperCase() !== "UNLOCK")} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Spinner /> : <HiLockOpen className="w-4 h-4" />} Unlock
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendanceLockPeriodsPage() {
  const [state, setState] = useState({ locks: [], loading: true, error: null });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(null); // validated payload awaiting confirmation
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [unlocking, setUnlocking] = useState(null);
  const [recomputeDate, setRecomputeDate] = useState("");
  const [recomputing, setRecomputing] = useState(false);
  const { toast, showToast, clearToast } = useToast(6000);

  const fetchLocks = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getLockPeriods();
      const locks = listFrom(res, ["locks"]).sort((a, b) => ymdOnly(b.start_date).localeCompare(ymdOnly(a.start_date)));
      setState({ locks, loading: false, error: null });
    } catch (error) {
      setState({ locks: [], loading: false, error });
    }
  }, []);

  useEffect(() => { fetchLocks(); }, [fetchLocks]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const reviewLock = () => {
    const { errors: v, payload } = validateLock(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setCreateError("");
    setConfirming(payload);
  };

  const handleCreateLock = async () => {
    if (creating || !confirming) return;
    setCreating(true);
    setCreateError("");
    try {
      await attendanceAPI.createLockPeriod(confirming);
      emitAttendanceChanged(ATTENDANCE_EVENTS.LOCK, { action: "create" });
      showToast("Period locked.");
      setConfirming(null);
      setShowForm(false);
      setForm({ start_date: "", end_date: "", reason: "" });
      fetchLocks();
    } catch (err) {
      setCreateError(attendanceErrorMessage(err, "Couldn't lock this period."));
    } finally {
      setCreating(false);
    }
  };

  const handleRecomputeStale = async () => {
    if (recomputing) return;
    const scope = recomputeDate ? `for ${fmtDate(recomputeDate)}` : "for all dates";
    if (!(await window.confirm(`Recompute attendance records that are stuck "in progress" despite a clock-out ${scope}? Locked dates are not changed.`))) return;
    setRecomputing(true);
    try {
      const res = await attendanceAPI.recomputeStaleRecords({ date: recomputeDate || undefined });
      const data = unwrap(res) || {};
      const count = data.recomputed ?? data.count ?? data.updated ?? data.processed;
      showToast(count != null ? `Recomputed ${count} record${Number(count) === 1 ? "" : "s"} ${scope}.` : `Stale records recomputed ${scope}.`);
      emitAttendanceChanged(ATTENDANCE_EVENTS.LOCK, { action: "recompute" });
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't recompute stale records."), "error");
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <>
      <DashboardTopBar title="Lock Periods" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Period Locking & Maintenance</h1>
            <p className="text-sm text-slate-500 mt-1">Freeze attendance for payroll processing and run maintenance tasks.</p>
          </div>
          <button onClick={() => setShowForm((v) => !v)} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2">
            <HiPlus className="w-4 h-4" /> Lock period
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><HiLockClosed className="w-4 h-4 text-purple-600" /> New lock</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="lock-start" className="block text-xs font-semibold text-slate-500 mb-1.5">Start date *</label>
                <input id="lock-start" type="date" max={form.end_date || undefined} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-purple-500 ${errors.start_date ? "border-rose-300" : "border-slate-200"}`} />
                <FieldError message={errors.start_date} />
              </div>
              <div>
                <label htmlFor="lock-end" className="block text-xs font-semibold text-slate-500 mb-1.5">End date *</label>
                <input id="lock-end" type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-purple-500 ${errors.end_date ? "border-rose-300" : "border-slate-200"}`} />
                <FieldError message={errors.end_date} />
              </div>
              <div>
                <label htmlFor="lock-reason" className="block text-xs font-semibold text-slate-500 mb-1.5">Reason <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="lock-reason" type="text" maxLength={255} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. July 2026 payroll" className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-purple-500 ${errors.reason ? "border-rose-300" : "border-slate-200"}`} />
                <FieldError message={errors.reason} />
              </div>
            </div>
            {form.end_date && form.end_date >= todayYMD() && <InlineAlert tone="amber">This range includes today or future dates — employees won't be able to clock in on those days until it's unlocked.</InlineAlert>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="button" onClick={reviewLock} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                <HiLockClosed className="w-4 h-4" /> Review lock
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <HiLockClosed className="w-4 h-4 text-purple-600" />
            <h3 className="text-base font-bold text-slate-800">Lock periods</h3>
          </div>
          {state.error ? (
            <ErrorState error={state.error} onRetry={fetchLocks} fallback="Couldn't load lock periods." />
          ) : state.loading ? (
            <div className="p-6"><LoadingRows rows={3} /></div>
          ) : state.locks.length === 0 ? (
            <EmptyState icon={HiLockClosed} title="No lock periods" message="Lock a period before running payroll so attendance can't change underneath it." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[760px]">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-6 py-3.5">Period</th>
                    <th className="px-6 py-3.5">Reason</th>
                    <th className="px-6 py-3.5">Source</th>
                    <th className="px-6 py-3.5">Locked</th>
                    <th className="px-6 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {state.locks.map((lock) => {
                    const payroll = isPayrollLock(lock);
                    const creator = personName(lock.creator || lock.created_by_user || lock.locked_by_user || {}, "");
                    return (
                      <tr key={lock.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{fmtDate(ymdOnly(lock.start_date))} — {fmtDate(ymdOnly(lock.end_date))}</td>
                        <td className="px-6 py-4 text-slate-500 max-w-xs truncate" title={lock.reason}>{lock.reason || "—"}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${payroll ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-purple-50 text-purple-700 border-purple-200"}`}>
                            {payroll ? "Payroll run" : "Manual"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">{fmtDateTime(lock.created_at)}{creator ? ` · ${creator}` : ""}</td>
                        <td className="px-6 py-4 text-right">
                          <button type="button" onClick={() => setUnlocking(lock)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">
                            <HiLockOpen className="w-3.5 h-3.5" /> Unlock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><HiRefresh className="w-4 h-4 text-purple-600" /> Recompute stale records</h3>
            <p className="text-xs text-slate-500 mt-1">Fixes records stuck "in progress" even though a clock-out exists. Leave the date empty to sweep all dates.</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <label htmlFor="recompute-date" className="block text-xs font-semibold text-slate-500 mb-1.5">Date (optional)</label>
              <input id="recompute-date" type="date" max={todayYMD()} value={recomputeDate} onChange={(e) => setRecomputeDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500" />
            </div>
            <button type="button" onClick={handleRecomputeStale} disabled={recomputing} className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition-all shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {recomputing ? <Spinner /> : <HiRefresh className="w-4 h-4" />} {recomputing ? "Recomputing…" : "Recompute"}
            </button>
          </div>
        </div>
      </main>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !creating && setConfirming(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" role="dialog" aria-modal="true">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto"><HiExclamation className="w-8 h-8" /></div>
              <h3 className="text-xl font-bold text-slate-800">Confirm period lock</h3>
              <p className="text-sm text-slate-500">
                Locking <strong className="text-slate-700">{fmtDate(confirming.start_date)}</strong> to <strong className="text-slate-700">{fmtDate(confirming.end_date)}</strong> freezes attendance for that range.
              </p>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700 font-medium text-left">
                While locked, clock-ins, regularizations and approvals dated in this range are refused. Remove the lock to allow changes again.
              </div>
              {createError && <InlineAlert tone="rose" className="text-left">{createError}</InlineAlert>}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button type="button" onClick={() => setConfirming(null)} disabled={creating} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleCreateLock} disabled={creating} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {creating ? <Spinner /> : <HiLockClosed className="w-4 h-4" />} Lock period
              </button>
            </div>
          </div>
        </div>
      )}

      {unlocking && (
        <UnlockDialog
          lock={unlocking}
          onClose={() => setUnlocking(null)}
          onUnlocked={() => { setUnlocking(null); showToast("Lock removed."); fetchLocks(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

export default AttendanceLockPeriodsPage;

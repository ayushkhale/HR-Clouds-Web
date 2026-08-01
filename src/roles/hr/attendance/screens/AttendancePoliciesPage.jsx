import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiClipboardList,
  HiPlus,
  HiX,
  HiCheckCircle,
  HiExclamationCircle,
  HiPencil,
  HiBadgeCheck,
} from "react-icons/hi";

/* ─── Toast ─────────────────────────────────────────────────────────────── */
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
  return (
    <div
      className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold transition-all ${
        isSuccess
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {isSuccess ? (
        <HiCheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      ) : (
        <HiExclamationCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
      )}
      <span>{toast.message}</span>
      <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-600">
        <HiX className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
function PolicyModal({ editPolicy, onClose, onSaved }) {
  const isEdit = !!editPolicy;
  const [form, setForm] = useState({
    name: editPolicy?.name || "",
    grace_minutes: editPolicy?.grace_minutes ?? 15,
    late_threshold_minutes: editPolicy?.late_threshold_minutes ?? 60,
    half_day_min_hours: editPolicy?.half_day_min_hours ?? 4.5,
    full_day_min_hours: editPolicy?.full_day_min_hours ?? 8.5,
    overtime_enabled: editPolicy?.overtime_enabled ?? false,
    overtime_min_minutes: editPolicy?.overtime_min_minutes ?? 60,
    regularization_allowed: editPolicy?.regularization_allowed ?? true,
    regularization_window_days: editPolicy?.regularization_window_days ?? 7,
    is_default: editPolicy?.is_default ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Policy name is required."); return; }
    setLoading(true);
    setError("");
    try {
      if (isEdit) {
        await attendanceAPI.updatePolicy(editPolicy.id, form);
      } else {
        await attendanceAPI.createPolicy(form);
      }
      onSaved(isEdit ? "Policy updated successfully." : "Policy created successfully.");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {isEdit ? "Edit Policy" : "Create Attendance Policy"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Define rules for how attendance is calculated.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Policy Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Policy Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Standard Office Policy 2026"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>

          {/* Grace & Late row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Clock-in Grace Period (mins)
              </label>
              <input
                type="number"
                min={0}
                value={form.grace_minutes}
                onChange={(e) => set("grace_minutes", parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1">After shift start before marking Late</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Late Mark Threshold (mins)
              </label>
              <input
                type="number"
                min={0}
                value={form.late_threshold_minutes}
                onChange={(e) => set("late_threshold_minutes", parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1">Minutes late before it becomes a Half Day</p>
            </div>
          </div>

          {/* Half Day / Full Day row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Minimum Hours for Half Day
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={form.half_day_min_hours}
                onChange={(e) => set("half_day_min_hours", parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Minimum Hours for Full Day
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={form.full_day_min_hours}
                onChange={(e) => set("full_day_min_hours", parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>
          </div>

          {/* Overtime */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">Enable Overtime Tracking</p>
                <p className="text-[10px] text-slate-400">Track and approve overtime hours</p>
              </div>
              <button
                type="button"
                onClick={() => set("overtime_enabled", !form.overtime_enabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.overtime_enabled ? "bg-purple-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    form.overtime_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {form.overtime_enabled && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Minimum Overtime (mins)
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.overtime_min_minutes}
                  onChange={(e) => set("overtime_min_minutes", parseInt(e.target.value) || 30)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">Overtime below this is ignored</p>
              </div>
            )}
          </div>

          {/* Regularisation */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">Allow Employees to Regularise Attendance</p>
                <p className="text-[10px] text-slate-400">Employees can correct missed/wrong punches</p>
              </div>
              <button
                type="button"
                onClick={() => set("regularization_allowed", !form.regularization_allowed)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.regularization_allowed ? "bg-purple-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    form.regularization_allowed ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {form.regularization_allowed && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Regularisation Window (days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.regularization_window_days}
                  onChange={(e) => set("regularization_window_days", parseInt(e.target.value) || 7)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">How many past days employees can correct</p>
              </div>
            )}
          </div>

          {/* Default Policy */}
          <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Set as Organisation Default Policy</p>
              <p className="text-[10px] text-slate-400">Applies to all employees without a specific policy</p>
            </div>
            <button
              type="button"
              onClick={() => set("is_default", !form.is_default)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.is_default ? "bg-purple-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.is_default ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition"
            >
              {loading ? "Saving…" : isEdit ? "Update Policy" : "Create Policy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AttendancePoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | policy object
  const [toast, setToast] = useState(null);
  const [deactivating, setDeactivating] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadPolicies = useCallback(async () => {
    try {
      const res = await attendanceAPI.getPolicies();
      setPolicies(res.data || []);
    } catch {
      showToast("Failed to load policies.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  async function handleDeactivate(policy) {
    if (!window.confirm(`Deactivate "${policy.name}"? Historical records will not be affected.`)) return;
    setDeactivating(policy.id);
    try {
      await attendanceAPI.deactivatePolicy(policy.id);
      showToast("Policy deactivated.");
      loadPolicies();
    } catch (err) {
      showToast(err.message || "Failed to deactivate.", "error");
    } finally {
      setDeactivating(null);
    }
  }

  function onSaved(msg) {
    setModal(null);
    showToast(msg);
    loadPolicies();
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8">

          {/* Page Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <HiClipboardList className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Attendance Policies</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage how attendance is calculated for your organisation.
                </p>
              </div>
            </div>
            <button
              onClick={() => setModal("create")}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition"
            >
              <HiPlus className="w-4 h-4" />
              Create Policy
            </button>
          </div>

          {/* Policies Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-16 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading policies…</p>
              </div>
            ) : policies.length === 0 ? (
              <div className="p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <HiClipboardList className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No policies created yet</p>
                <p className="text-xs text-slate-400">Create your first attendance policy to get started.</p>
                <button
                  onClick={() => setModal("create")}
                  className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl"
                >
                  <HiPlus className="w-4 h-4" />
                  Create Policy
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Policy Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grace Period</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Day / Half Day</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {policies.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                          {p.is_default && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                              <HiBadgeCheck className="w-3 h-3" />
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">{p.grace_minutes} mins</td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {p.full_day_min_hours} hrs / {p.half_day_min_hours} hrs
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            p.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {p.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setModal(p)}
                            className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition"
                            title="Edit policy"
                          >
                            <HiPencil className="w-4 h-4" />
                          </button>
                          {p.is_active && (
                            <button
                              onClick={() => handleDeactivate(p)}
                              disabled={deactivating === p.id}
                              className="text-[10px] font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-3 py-1 rounded-lg transition disabled:opacity-50"
                            >
                              {deactivating === p.id ? "…" : "Deactivate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Modal */}
      {modal && (
        <PolicyModal
          editPolicy={modal === "create" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}

      {/* Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

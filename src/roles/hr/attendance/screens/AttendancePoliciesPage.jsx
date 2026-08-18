import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiClipboardList,
  HiPlus,
  HiX,
  HiCheckCircle,
  HiExclamationCircle,
  HiPencil,
  HiBadgeCheck,
  HiInformationCircle,
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

/* ─── Toggle ─────────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-purple-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-[78vw] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isEdit ? "Edit Policy" : "Create Attendance Policy"}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Define rules for how attendance is calculated.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-10 py-8 space-y-7">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Policy Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Policy Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Standard Office Policy 2026"
              className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>

          {/* Row 1: Grace + Late + Half Day + Full Day */}
          <div className="grid grid-cols-4 gap-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Minutes Before Marking Late
              </label>
              <input
                type="number"
                min={0}
                value={form.grace_minutes}
                onChange={(e) => set("grace_minutes", parseInt(e.target.value) || 0)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">Employee won't be marked late within this window</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Mark as Late After (mins)
              </label>
              <input
                type="number"
                min={0}
                value={form.late_threshold_minutes}
                onChange={(e) => set("late_threshold_minutes", parseInt(e.target.value) || 0)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">Beyond this, it counts as a Half Day</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Hours for Half Day
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={form.half_day_min_hours}
                onChange={(e) => set("half_day_min_hours", parseFloat(e.target.value) || 0)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">Min hours needed to count as Half Day</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Hours for Full Day
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={form.full_day_min_hours}
                onChange={(e) => set("full_day_min_hours", parseFloat(e.target.value) || 0)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">Min hours needed to count as Full Day</p>
            </div>
          </div>

          {/* Row 2: Overtime + Regularisation side by side */}
          <div className="grid grid-cols-2 gap-6">
            {/* Overtime */}
            <div className="bg-slate-50 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Track Extra Hours (Overtime)</p>
                  <p className="text-xs text-slate-400 mt-0.5">Record when employees work beyond their shift time</p>
                </div>
                <Toggle checked={form.overtime_enabled} onChange={(v) => set("overtime_enabled", v)} />
              </div>
              {form.overtime_enabled && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Count Overtime After (mins)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.overtime_min_minutes}
                    onChange={(e) => set("overtime_min_minutes", parseInt(e.target.value) || 30)}
                    className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">Extra minutes below this won't be counted</p>
                </div>
              )}
            </div>

            {/* Regularisation */}
            <div className="bg-slate-50 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Let Employees Fix Their Attendance</p>
                  <p className="text-xs text-slate-400 mt-0.5">Allow staff to correct a missed check-in or wrong punch</p>
                </div>
                <Toggle checked={form.regularization_allowed} onChange={(v) => set("regularization_allowed", v)} />
              </div>
              {form.regularization_allowed && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Fix Attendance Up To (days ago)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.regularization_window_days}
                    onChange={(e) => set("regularization_window_days", parseInt(e.target.value) || 7)}
                    className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">How many past days an employee can go back and correct</p>
                </div>
              )}
            </div>
          </div>

          {/* Default Policy */}
          <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-700">Use as Default Policy</p>
              <p className="text-xs text-slate-400 mt-0.5">All employees will follow this unless assigned a different policy</p>
            </div>
            <Toggle checked={form.is_default} onChange={(v) => set("is_default", v)} />
          </div>
          {form.is_default && !editPolicy?.is_default && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
              <HiInformationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>The existing default policy will automatically lose its default status when you save.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition"
            >
              {loading ? "Saving…" : isEdit ? "Update Policy" : "Create Policy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
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
  const [modal, setModal] = useState(null); // null | "create" | policy object (full details)
  const [editLoading, setEditLoading] = useState(false); // loading full policy details before opening modal
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

  // Fetch full policy details before opening edit modal
  async function handleEditClick(policy) {
    setEditLoading(policy.id);
    try {
      const res = await attendanceAPI.getPolicy(policy.id);
      setModal(res.data || policy);
    } catch {
      showToast("Failed to load policy details.", "error");
    } finally {
      setEditLoading(null);
    }
  }

  async function handleDeactivate(policy) {
    if (!window.confirm(`Deactivate "${policy.name}"? Historical records will not be affected.`)) return;
    setDeactivating(policy.id);
    try {
      await attendanceAPI.deactivatePolicy(policy.id);
      showToast("Policy deactivated.");
      loadPolicies();
    } catch (err) {
      // 400 = trying to deactivate the default policy
      if (err.status === 400) {
        showToast("Cannot deactivate the default policy. Please set another policy as default first.", "error");
      } else {
        showToast(err.message || "Failed to deactivate.", "error");
      }
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
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8">

          {/* Page Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance Policies</h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage how attendance is calculated for your organisation.
              </p>
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
          {loading ? (
            <Skeleton type="table" rows={4} />
          ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {policies.length === 0 ? (
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
                        <div className="flex items-center gap-2 flex-wrap">
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
                            onClick={() => handleEditClick(p)}
                            disabled={editLoading === p.id}
                            className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50"
                            title="Edit policy"
                          >
                            {editLoading === p.id ? (
                              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <HiPencil className="w-4 h-4" />
                            )}
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
          )}
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

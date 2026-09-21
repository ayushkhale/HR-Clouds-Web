import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../../shared/api";
import {
  HiPlus, HiPencil, HiTrash, HiX, HiCheckCircle, HiExclamationCircle,
  HiExclamation, HiBan, HiClipboardList, HiUserGroup, HiAdjustments,
} from "react-icons/hi";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";

// Phase-6 demographic gating options. Empty selection ⇒ open to everyone (null).
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
const MARITAL_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];

// A restriction array can arrive as null/[] (open) or a list of allowed values.
function toArray(v) { return Array.isArray(v) ? v : []; }
const labelFor = (options, value) => options.find((o) => o.value === value)?.label || value;

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 ${checked ? "bg-purple-600" : "bg-slate-200"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

// ─── Leave Type Modal (Create / Edit) ────────────────────────────────────────
function LeaveTypeModal({ editType, onClose, onSaved }) {
  const isEdit = !!editType;
  const [form, setForm] = useState({
    name: editType?.name || "",
    code: editType?.code || "",
    description: editType?.description || "",
    is_paid: editType?.is_paid ?? true,
    requires_document_threshold: editType?.requires_document_threshold ?? "",
    sandwich_rule_applies: editType?.sandwich_rule_applies ?? false,
    allowed_genders: toArray(editType?.allowed_genders),
    allowed_marital_statuses: toArray(editType?.allowed_marital_statuses),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }
  // Toggle a value in a restriction array (genders / marital statuses).
  function toggleIn(key, value) {
    setForm(f => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.code.trim()) { setError("Code is required."); return; }
    setLoading(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      is_paid: form.is_paid,
      sandwich_rule_applies: form.sandwich_rule_applies,
      // Empty selection means "open to everyone" — send null, not [].
      allowed_genders: form.allowed_genders.length ? form.allowed_genders : null,
      allowed_marital_statuses: form.allowed_marital_statuses.length ? form.allowed_marital_statuses : null,
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.requires_document_threshold !== "") {
      payload.requires_document_threshold = parseInt(form.requires_document_threshold) || 0;
    }
    try {
      if (isEdit) {
        await leaveAPI.updateLeaveType(editType.id, payload);
      } else {
        await leaveAPI.createLeaveType(payload);
      }
      onSaved(isEdit ? "Leave type updated." : "Leave type created.");
    } catch (err) {
      if (err.data?.errorCode === "LEAVE_TYPE_EXISTS") {
        setError(`Code "${form.code.toUpperCase()}" already exists. Choose a unique code.`);
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";
  const labelClass = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit Leave Type" : "Add Leave Type"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define the rules for this leave category.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <HiX className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-5">
            {error && (
              <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: basics */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
                  <div>
                    <label className={labelClass}>Name <span className="text-rose-400">*</span></label>
                    <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Sick Leave" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Code <span className="text-rose-400">*</span></label>
                    <input type="text" value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="e.g. SL" maxLength={10} className={`${inputClass} font-mono uppercase`} />
                    <p className="text-[10px] text-slate-400 mt-1">Unique, max 10 chars.</p>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Description</label>
                  <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4} placeholder="Optional description..." className={`${inputClass} resize-none`} />
                </div>

                <div>
                  <label className={labelClass}>Document Required After (days)</label>
                  <input type="number" min={0} value={form.requires_document_threshold} onChange={e => set("requires_document_threshold", e.target.value)} placeholder="e.g. 3  (leave blank to disable)" className={inputClass} />
                  <p className="text-[10px] text-slate-400 mt-1">Employee must upload proof after this many days of leave.</p>
                </div>
              </div>

              {/* Right: rules & eligibility */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between gap-3 bg-purple-50/60 border border-purple-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Paid Leave</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Employee gets salary during this leave</p>
                    </div>
                    <Toggle checked={form.is_paid} onChange={v => set("is_paid", v)} />
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-purple-50/60 border border-purple-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Count Weekends In Between</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Weekends between leave days also count as leave</p>
                    </div>
                    <Toggle checked={form.sandwich_rule_applies} onChange={v => set("sandwich_rule_applies", v)} />
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl p-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Who can apply (optional)</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Restrict who can apply (e.g. Maternity → Female). Leave everything unticked to allow all employees.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Allowed genders</p>
                    <div className="flex flex-wrap gap-2">
                      {GENDER_OPTIONS.map(opt => {
                        const on = form.allowed_genders.includes(opt.value);
                        return (
                          <button type="button" key={opt.value} onClick={() => toggleIn("allowed_genders", opt.value)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${on ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Allowed marital statuses</p>
                    <div className="flex flex-wrap gap-2">
                      {MARITAL_OPTIONS.map(opt => {
                        const on = form.allowed_marital_statuses.includes(opt.value);
                        return (
                          <button type="button" key={opt.value} onClick={() => toggleIn("allowed_marital_statuses", opt.value)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${on ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="sm:min-w-[220px] bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition">
              {loading ? "Saving…" : isEdit ? "Update Leave Type" : "Create Leave Type"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteModal({ leaveType, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("confirm"); // confirm | balances_warn | pending_block
  const [errorMsg, setErrorMsg] = useState("");

  async function handleDelete(force = false) {
    setLoading(true);
    try {
      await leaveAPI.deleteLeaveType(leaveType.id, force);
      onDeleted(`"${leaveType.name}" deactivated successfully.`);
    } catch (err) {
      const code = err.data?.errorCode;
      if (code === "ACTIVE_BALANCES_EXIST") {
        setStage("balances_warn");
      } else if (code === "PENDING_REQUESTS_EXIST") {
        setStage("pending_block");
      } else {
        setErrorMsg(err.message || "Failed to deactivate.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-800">
            {stage === "pending_block" ? "Cannot Deactivate" : `Deactivate "${leaveType.name}"?`}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {stage === "confirm" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 flex items-center justify-center">
                <HiTrash className="w-6 h-6 text-fuchsia-500" />
              </div>
              <p className="text-sm text-slate-600">
                This will deactivate <strong>{leaveType.name}</strong> ({leaveType.code}).
                Employees will no longer be able to apply for this leave type. Past records are kept.
              </p>
              {errorMsg && (
                <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{errorMsg}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button
                  onClick={() => handleDelete(false)}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 transition disabled:opacity-50"
                >
                  {loading ? "Processing…" : "Deactivate"}
                </button>
              </div>
            </>
          )}

          {stage === "balances_warn" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 flex items-center justify-center">
                <HiExclamation className="w-6 h-6 text-fuchsia-500" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Employees still have leave days of this type.</p>
              <p className="text-sm text-slate-500">
                Deactivating will stop employees from applying for this leave. Their existing days will be frozen.
                Do you want to deactivate anyway?
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button
                  onClick={() => handleDelete(true)}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-fuchsia-500 text-white hover:bg-fuchsia-600 transition disabled:opacity-50"
                >
                  {loading ? "Processing…" : "Deactivate Anyway"}
                </button>
              </div>
            </>
          )}

          {stage === "pending_block" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
                <HiBan className="w-6 h-6 text-rose-500" />
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-4">
                <p className="text-sm font-bold text-rose-700 mb-1">Pending requests exist</p>
                <p className="text-sm text-rose-600">
                  One or more employees have pending leave requests for <strong>{leaveType.name}</strong>.
                  Please approve or reject all pending requests before deactivating this leave type.
                </p>
              </div>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                OK, I'll Resolve First
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${active ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-violet-500" : "bg-slate-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeaveTypesPage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | leaveType object
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leaveAPI.getLeaveTypes({ include_inactive: true });
      setTypes(res.data || []);
    } catch {
      showToast("Failed to load leave types.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  function onSaved(msg) {
    setModal(null);
    showToast(msg);
    loadTypes();
  }

  function onDeleted(msg) {
    setDeleteTarget(null);
    setPreview(null);
    showToast(msg);
    loadTypes();
  }

  const genders = preview ? toArray(preview.allowed_genders) : [];
  const maritals = preview ? toArray(preview.allowed_marital_statuses) : [];

  return (
    <>
        <DashboardTopBar title="Leave Types" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">

          {/* Page Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Leave Types</h1>
              <p className="text-sm text-slate-500 mt-1">
                Define the categories of leave your organisation offers (e.g. Sick Leave, Casual Leave). Click a row to see its details.
              </p>
            </div>
            <button
              onClick={() => setModal("create")}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition"
            >
              <HiPlus className="w-4 h-4" />
              Add Leave Type
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {types.length === 0 ? (
                <div className="p-16 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <HiClipboardList className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No leave types yet</p>
                  <p className="text-xs text-slate-400">Create your first leave type to get started.</p>
                  <button
                    onClick={() => setModal("create")}
                    className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl"
                  >
                    <HiPlus className="w-4 h-4" /> Add Leave Type
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Code</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weekends In Between</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document After</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {types.map(t => {
                        const row = rowPreviewProps(() => setPreview(t), `View ${t.name}`);
                        return (
                          <tr key={t.id} {...row} className={`${row.className} ${!t.is_active ? "opacity-60" : ""}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                                {(toArray(t.allowed_genders).length > 0 || toArray(t.allowed_marital_statuses).length > 0) && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-1.5 py-0.5 rounded" title="Eligibility restricted by gender / marital status">
                                    Restricted
                                  </span>
                                )}
                              </div>
                              {t.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[260px]">{t.description}</p>}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-block font-mono text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{t.code}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full ${t.is_paid ? "bg-violet-50 text-violet-700" : "bg-rose-50 text-rose-600"}`}>
                                {t.is_paid ? "Paid" : "Unpaid (LWP)"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-semibold ${t.sandwich_rule_applies ? "text-fuchsia-600" : "text-slate-400"}`}>
                                {t.sandwich_rule_applies ? "✓ Counted" : "N/A"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {t.requires_document_threshold > 0 ? `After ${t.requires_document_threshold} days` : "0"}
                            </td>
                            <td className="px-6 py-4"><StatusBadge active={t.is_active} /></td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 justify-end">
                                <button onClick={() => setModal(t)} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Edit">
                                  <HiPencil className="w-4 h-4" />
                                </button>
                                {t.is_active && (
                                  <button onClick={() => setDeleteTarget(t)} className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition" title="Deactivate">
                                    <HiTrash className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>

      {preview && (
        <DetailDialog
          eyebrow="Leave type"
          icon={HiClipboardList}
          title={preview.name}
          subtitle={preview.code}
          badge={<DetailPill tone="onDark">{preview.is_active ? "Active" : "Inactive"}</DetailPill>}
          onClose={() => setPreview(null)}
          footer={
            <>
              {preview.is_active && (
                <button onClick={() => setDeleteTarget(preview)} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2">
                  <HiTrash className="w-4 h-4" /> Deactivate
                </button>
              )}
              <button onClick={() => { const t = preview; setPreview(null); setModal(t); }} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiPencil className="w-4 h-4" /> Edit leave type
              </button>
            </>
          }
        >
          <DetailSection title="Rules" icon={HiAdjustments}>
            <DetailGrid
              items={[
                ["Code", preview.code],
                ["Pay", preview.is_paid ? "Paid" : "Unpaid (LWP)"],
                ["Weekends in between", preview.sandwich_rule_applies ? "Counted as leave" : "Not counted"],
                ["Document required after", preview.requires_document_threshold > 0 ? `${preview.requires_document_threshold} days` : "0 days"],
              ]}
            />
            <div className="mt-3"><DetailText label="Description">{preview.description}</DetailText></div>
          </DetailSection>

          <DetailSection title="Who can apply" icon={HiUserGroup}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-purple-50/70 border border-purple-100/80 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500/90 mb-2">Genders</p>
                <div className="flex flex-wrap gap-1.5">
                  {genders.length === 0 ? <DetailPill tone="outline">Everyone</DetailPill> : genders.map((g) => <DetailPill key={g}>{labelFor(GENDER_OPTIONS, g)}</DetailPill>)}
                </div>
              </div>
              <div className="rounded-xl bg-purple-50/70 border border-purple-100/80 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500/90 mb-2">Marital statuses</p>
                <div className="flex flex-wrap gap-1.5">
                  {maritals.length === 0 ? <DetailPill tone="outline">Everyone</DetailPill> : maritals.map((m) => <DetailPill key={m}>{labelFor(MARITAL_OPTIONS, m)}</DetailPill>)}
                </div>
              </div>
            </div>
          </DetailSection>
        </DetailDialog>
      )}

      {/* Modals */}
      {modal && (
        <LeaveTypeModal
          editType={modal === "create" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          leaveType={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={onDeleted}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

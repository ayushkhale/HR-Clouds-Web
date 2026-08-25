import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../../shared/api";
import {
  HiPlus, HiPencil, HiTrash, HiX, HiCheckCircle, HiExclamationCircle,
  HiChevronDown, HiChevronRight, HiInformationCircle, HiTemplate,
  HiExclamation,
} from "react-icons/hi";

// ─── Toast ────────────────────────────────────────────────────────────────────
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

// ─── Accrual Pill ─────────────────────────────────────────────────────────────
function AccrualPill({ type }) {
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${type === "upfront" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
      {type === "upfront" ? "Upfront" : "Monthly"}
    </span>
  );
}

// ─── Create / Edit Policy Template Modal ─────────────────────────────────────
function PolicyModal({ editPolicy, onClose, onSaved }) {
  const isEdit = !!editPolicy;
  const [form, setForm] = useState({
    name: editPolicy?.name || "",
    description: editPolicy?.description || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Policy name is required."); return; }
    setLoading(true); setError("");
    try {
      const payload = { name: form.name.trim() };
      if (form.description.trim()) payload.description = form.description.trim();
      if (isEdit) {
        await leaveAPI.updateTemplate(editPolicy.id, payload);
      } else {
        await leaveAPI.createTemplate(payload);
      }
      onSaved(isEdit ? "Policy updated." : "Policy created.");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isEdit ? "Edit Policy" : "Create Policy Template"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Group leave rules into an assignable package.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Policy Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Permanent Employee Policy 2026"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Optional description..."
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Saving…" : isEdit ? "Update Policy" : "Create Policy"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add / Edit Entitlement Modal ─────────────────────────────────────────────
function EntitlementModal({ templateId, editEntitlement, leaveTypes, onClose, onSaved }) {
  const isEdit = !!editEntitlement;
  const [form, setForm] = useState({
    leave_type_id: editEntitlement?.leave_type_id || "",
    annual_quota: editEntitlement?.annual_quota ?? "",
    accrual_type: editEntitlement?.accrual_type || "upfront",
    max_carry_forward: editEntitlement?.max_carry_forward ?? 0,
    probation_restriction_days: editEntitlement?.probation_restriction_days ?? 0,
    max_negative_balance: editEntitlement?.max_negative_balance ?? 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isEdit && !form.leave_type_id) { setError("Please select a leave type."); return; }
    if (form.annual_quota === "" || form.annual_quota === null) { setError("Annual quota is required."); return; }
    setLoading(true); setError("");
    const payload = {
      annual_quota: parseFloat(form.annual_quota) || 0,
      accrual_type: form.accrual_type,
      max_carry_forward: parseFloat(form.max_carry_forward) || 0,
      probation_restriction_days: parseInt(form.probation_restriction_days) || 0,
      max_negative_balance: parseFloat(form.max_negative_balance) || 0,
    };
    if (!isEdit) payload.leave_type_id = form.leave_type_id;
    try {
      if (isEdit) {
        await leaveAPI.updateEntitlement(templateId, editEntitlement.id, payload);
      } else {
        await leaveAPI.addEntitlement(templateId, payload);
      }
      onSaved(isEdit ? "Entitlement updated." : "Entitlement added.");
    } catch (err) {
      if (err.data?.code === "ENTITLEMENT_EXISTS") {
        setError("This leave type already has a quota in this policy. Delete it first to reconfigure.");
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isEdit ? "Edit Entitlement" : "Add Entitlement"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define the annual quota and rules for this leave type.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}

          {/* Leave Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Leave Type <span className="text-red-400">*</span>
              {isEdit && <span className="ml-2 text-[10px] text-amber-500 normal-case font-semibold">(Immutable — cannot change)</span>}
            </label>
            <select
              value={form.leave_type_id}
              onChange={e => set("leave_type_id", e.target.value)}
              disabled={isEdit}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <option value="">Select a leave type...</option>
              {leaveTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
              ))}
            </select>
          </div>

          {/* Quota + Accrual Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Annual Quota (days) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="365"
                value={form.annual_quota}
                onChange={e => set("annual_quota", e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Accrual Type</label>
              <div className="flex gap-2 mt-1">
                {["upfront", "monthly"].map(t => (
                  <label key={t} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${form.accrual_type === t ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                    <input type="radio" name="accrual_type" value={t} checked={form.accrual_type === t} onChange={() => set("accrual_type", t)} className="sr-only" />
                    {t === "upfront" ? "Upfront" : "Monthly"}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{form.accrual_type === "upfront" ? "Full quota credited at year start." : "Quota split and credited monthly."}</p>
            </div>
          </div>

          {/* Carry Forward + Probation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Max Carry Forward (days)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={form.max_carry_forward}
                onChange={e => set("max_carry_forward", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1">Days that roll to next year. 0 = no carry.</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Probation Restriction (days)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.probation_restriction_days}
                onChange={e => set("probation_restriction_days", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
              <p className="text-[10px] text-slate-400 mt-1">Days from joining before this leave can be used. 0 = no restriction.</p>
            </div>
          </div>

          {/* Max Negative Balance */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Max Overdraft (days)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={form.max_negative_balance}
              onChange={e => set("max_negative_balance", e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
            <p className="text-[10px] text-slate-400 mt-1">Days the employee can go below zero. 0 = no overdraft.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Saving…" : isEdit ? "Update Entitlement" : "Add Entitlement"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Policy Card ──────────────────────────────────────────────────────────────
function PolicyCard({ policy, leaveTypes, onEditPolicy, onDeletePolicy, onAddEntitlement, onEditEntitlement, onDeleteEntitlement, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const [entitlementModal, setEntitlementModal] = useState(null); // null | "create" | entitlement obj

  const entitlements = policy.entitlements || [];

  function onEntitlementSaved(msg) {
    setEntitlementModal(null);
    showToast(msg);
    onAddEntitlement(); // triggers parent reload
  }

  async function handleDeleteEntitlement(eid) {
    if (!window.confirm("Remove this entitlement from the policy?")) return;
    try {
      await leaveAPI.deleteEntitlement(policy.id, eid);
      showToast("Entitlement removed.");
      onDeleteEntitlement();
    } catch (err) {
      showToast(err.message || "Failed to remove.", "error");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="px-6 py-5 flex items-center justify-between gap-4">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-3 text-left flex-1 min-w-0"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <HiTemplate className="w-5 h-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{policy.name}</p>
            {policy.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{policy.description}</p>}
            <p className="text-[10px] text-slate-400 mt-1 font-medium">{entitlements.length} entitlement{entitlements.length !== 1 ? "s" : ""}</p>
          </div>
          {expanded ? <HiChevronDown className="w-5 h-5 text-slate-400 shrink-0" /> : <HiChevronRight className="w-5 h-5 text-slate-400 shrink-0" />}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setEntitlementModal("create")} className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition">
            <HiPlus className="w-3.5 h-3.5" /> Add Quota
          </button>
          <button onClick={() => onEditPolicy(policy)} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Edit policy">
            <HiPencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDeletePolicy(policy)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition" title="Delete policy">
            <HiTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Entitlements */}
      {expanded && (
        <div className="border-t border-slate-100">
          {/* Live-template warning */}
          <div className="flex items-start gap-2.5 px-6 py-3 bg-amber-50 border-b border-amber-100">
            <HiInformationCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-medium">
              Editing this policy won't change anything for employees who are <strong>already assigned</strong> to it.
              To change a specific employee's leave right now, go to their profile and use <strong>Override Config</strong>.
            </p>
          </div>

          {entitlements.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-slate-500 mb-3">No entitlements yet. Add a leave type quota to make this policy usable.</p>
              <button onClick={() => setEntitlementModal("create")} className="inline-flex items-center gap-2 text-xs font-semibold bg-purple-600 text-white px-4 py-2 rounded-xl">
                <HiPlus className="w-3.5 h-3.5" /> Add First Quota
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Type</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Annual Quota</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Accrual</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carry Forward</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Probation</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {entitlements.map(ent => (
                  <tr key={ent.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{ent.leave_type?.name || "—"}</span>
                        <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{ent.leave_type?.code}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm font-semibold text-slate-700">{parseFloat(ent.annual_quota)} days</td>
                    <td className="px-6 py-3"><AccrualPill type={ent.accrual_type} /></td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {ent.max_carry_forward > 0 ? `Max ${parseFloat(ent.max_carry_forward)} days` : "None"}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {ent.probation_restriction_days > 0 ? `${ent.probation_restriction_days} days` : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEntitlementModal(ent)} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition">
                          <HiPencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteEntitlement(ent.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition">
                          <HiTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Entitlement Modal */}
      {entitlementModal && (
        <EntitlementModal
          templateId={policy.id}
          editEntitlement={entitlementModal === "create" ? null : entitlementModal}
          leaveTypes={leaveTypes}
          onClose={() => setEntitlementModal(null)}
          onSaved={onEntitlementSaved}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeavePoliciesPage() {
  const [templates, setTemplates] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [policyModal, setPolicyModal] = useState(null); // null | "create" | template obj
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tmplRes, typesRes] = await Promise.all([
        leaveAPI.getTemplates(),
        leaveAPI.getLeaveTypes({ include_inactive: false }),
      ]);
      setTemplates(tmplRes.data || []);
      setLeaveTypes(typesRes.data || []);
    } catch {
      showToast("Failed to load policies.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function onPolicySaved(msg) {
    setPolicyModal(null);
    showToast(msg);
    loadData();
  }

  async function handleDeletePolicy(policy) {
    if (!window.confirm(`Delete policy "${policy.name}"? All entitlements will be permanently removed. Assigned employees will lose their configuration.`)) return;
    try {
      await leaveAPI.deleteTemplate(policy.id);
      showToast(`Policy "${policy.name}" deleted.`);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to delete.", "error");
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Leave Management" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">

          {/* Page Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Leave Policies</h1>
              <p className="text-sm text-slate-500 mt-1">
                Create policy templates and configure leave quotas. Assign templates to employees in their profile.
              </p>
            </div>
            <button
              onClick={() => setPolicyModal("create")}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition"
            >
              <HiPlus className="w-4 h-4" />
              Create Policy
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                <HiTemplate className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No policy templates yet</p>
              <p className="text-xs text-slate-400">Create a policy and add leave quotas to it.</p>
              <button onClick={() => setPolicyModal("create")} className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                <HiPlus className="w-4 h-4" /> Create Policy
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map(policy => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  leaveTypes={leaveTypes}
                  onEditPolicy={p => setPolicyModal(p)}
                  onDeletePolicy={handleDeletePolicy}
                  onAddEntitlement={loadData}
                  onEditEntitlement={loadData}
                  onDeleteEntitlement={loadData}
                  showToast={showToast}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Policy Modal */}
      {policyModal && (
        <PolicyModal
          editPolicy={policyModal === "create" ? null : policyModal}
          onClose={() => setPolicyModal(null)}
          onSaved={onPolicySaved}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

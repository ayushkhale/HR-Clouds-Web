import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiGift, HiCheck,
  HiCalculator, HiSparkles, HiTrash, HiPencil, HiEye
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";

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

const MONTHS = Array.from({ length: 12 }).map((_, i) => new Date(0, i).toLocaleString("default", { month: "long" }));
const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPeriod = (pm) => {
  if (!pm) return "-";
  const [y, m] = pm.split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const STATUS_PILL = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};

const BONUS_TYPE_LABEL = {
  flat: "Flat amount",
  percent_of_basic: "% of Basic",
  percent_of_gross: "% of Gross",
};

const now = new Date();
const emptyForm = () => ({
  name: "",
  period_month: now.getMonth() + 1,
  period_year: now.getFullYear(),
  bonus_type: "percent_of_basic",
  value: "",
  eligibility_source: "all_employees",
  department_ids: [],
  user_ids: [],
  min_tenure_months: "",
  max_amount_per_employee: "",
  reason: "",
});

export default function PayrollBonusRulesPage() {
  const [rules, setRules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const [impact, setImpact] = useState(null); // { rule, data }
  const [impactLoading, setImpactLoading] = useState(false);

  const [detail, setDetail] = useState(null); // full bonus rule (#68)
  const [detailLoading, setDetailLoading] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleRes, empRes, deptRes] = await Promise.all([
        payrollAPI.getBonusRules(statusFilter ? { status: statusFilter } : undefined),
        organizationAPI.getEmployees({ purpose: "emp_report" }).catch(() => ({ data: [] })),
        organizationAPI.getDepartments().catch(() => ({ data: [] })),
      ]);
      setRules(ruleRes.data?.records || ruleRes.data || []);
      setEmployees(empRes.data?.records || empRes.data?.employees || empRes.data || []);
      setDepartments(deptRes.data?.records || deptRes.data?.departments || deptRes.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load bonus rules", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  };

  const openEdit = (rule) => {
    const [y, m] = (rule.period_month || "").split("-");
    const cfg = rule.eligibility_config || {};
    setEditingId(rule.id);
    setForm({
      name: rule.name || "",
      period_month: m ? parseInt(m) : now.getMonth() + 1,
      period_year: y ? parseInt(y) : now.getFullYear(),
      bonus_type: rule.bonus_type || "percent_of_basic",
      value: rule.value ?? "",
      eligibility_source: rule.eligibility_source || "all_employees",
      department_ids: cfg.department_ids || [],
      user_ids: cfg.user_ids || [],
      min_tenure_months: cfg.min_tenure_months ?? "",
      max_amount_per_employee: rule.max_amount_per_employee ?? "",
      reason: rule.reason || "",
    });
    setIsModalOpen(true);
  };

  const buildPayload = () => {
    const eligibility_config = {};
    if (form.eligibility_source === "department") eligibility_config.department_ids = form.department_ids;
    if (form.eligibility_source === "manual") eligibility_config.user_ids = form.user_ids;
    if (form.min_tenure_months !== "") eligibility_config.min_tenure_months = parseInt(form.min_tenure_months);

    const payload = {
      name: form.name.trim(),
      period_month: `${form.period_year}-${String(form.period_month).padStart(2, "0")}`,
      bonus_type: form.bonus_type,
      value: parseFloat(form.value),
      eligibility_source: form.eligibility_source,
      eligibility_config,
      reason: form.reason.trim(),
    };
    if (form.max_amount_per_employee !== "") payload.max_amount_per_employee = parseFloat(form.max_amount_per_employee);
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.eligibility_source === "department" && form.department_ids.length === 0)
      return showToast("Select at least one department", "error");
    if (form.eligibility_source === "manual" && form.user_ids.length === 0)
      return showToast("Select at least one employee", "error");
    try {
      const payload = buildPayload();
      if (editingId) {
        await payrollAPI.updateBonusRule(editingId, payload);
        showToast("Bonus rule updated");
      } else {
        await payrollAPI.createBonusRule(payload);
        showToast("Bonus rule created — pending approval");
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to save bonus rule", "error");
    }
  };

  const act = async (fn, okMsg) => {
    try {
      await fn();
      showToast(okMsg);
      loadData();
    } catch (err) {
      showToast(err.message || "Action failed", "error");
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) return showToast("Reason required", "error");
    await act(() => payrollAPI.rejectBonusRule(rejectingId, { rejection_reason: rejectionReason }), "Bonus rule rejected");
    setRejectingId(null);
    setRejectionReason("");
  };

  const handleApply = (rule) => {
    if (!window.confirm(`Apply "${rule.name}"? This materialises individual adjustments for every eligible employee in ${fmtPeriod(rule.period_month)}.`)) return;
    act(() => payrollAPI.applyBonusRule(rule.id), "Bonus rule applied to payroll");
  };

  const openImpact = async (rule) => {
    setImpact({ rule, data: null });
    setImpactLoading(true);
    try {
      const res = await payrollAPI.previewBonusRuleImpact(rule.id);
      setImpact({ rule, data: res.data || res });
    } catch (err) {
      showToast(err.message || "Failed to compute impact", "error");
      setImpact(null);
    } finally {
      setImpactLoading(false);
    }
  };

  const openDetail = async (rule) => {
    setDetail(rule);
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getBonusRule(rule.id);
      setDetail(res.data || rule);
    } catch (err) {
      showToast(err.message || "Failed to load bonus rule", "error");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const empName = (id) => employees.find((e) => (e.id || e.user_id || e._id) === id)?.name || id;
  const deptName = (id) => departments.find((d) => (d.id || d._id) === id)?.name || id;
  const toggleId = (key, id) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
  }));

  const isPercent = form.bonus_type !== "flat";

  return (
    <>
        <DashboardTopBar title="Bonus Rules" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">

          <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiGift className="text-purple-600 w-7 h-7" /> Bonus Rules
              </h1>
              <p className="text-sm text-slate-500 mt-1">Declarative bonus policies that materialise adjustments for an eligible population.</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={openCreate} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiPlus className="w-5 h-5" /> New Bonus Rule
              </button>
            </div>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Rule</th>
                    <th className="px-6 py-4 border-b border-slate-100">Period</th>
                    <th className="px-6 py-4 border-b border-slate-100">Calculation</th>
                    <th className="px-6 py-4 border-b border-slate-100">Eligibility</th>
                    <th className="px-6 py-4 border-b border-slate-100">Status</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{r.name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{r.reason}</p>
                        {r.applied_at && (
                          <span className="inline-block mt-1 text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                            APPLIED · {r.applied_count ?? 0} employees
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{fmtPeriod(r.period_month)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {BONUS_TYPE_LABEL[r.bonus_type] || r.bonus_type}
                        <span className="block text-[11px] font-bold text-slate-800">
                          {r.bonus_type === "flat" ? money(r.value) : `${parseFloat(r.value || 0)}%`}
                        </span>
                      </td>
                      <td className="px-6 py-4 capitalize text-slate-600">{(r.eligibility_source || "").replace(/_/g, " ")}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[r.status] || "bg-slate-100 text-slate-600"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openDetail(r)} className="p-1.5 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="View details"><HiEye className="w-4 h-4" /></button>
                          {(r.status === "pending" || r.status === "approved") && !r.applied_at && (
                            <button onClick={() => openImpact(r)} className="p-1.5 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition" title="Preview impact"><HiCalculator className="w-4 h-4" /></button>
                          )}
                          {r.status === "pending" && (
                            <>
                              <button onClick={() => openEdit(r)} className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="Edit"><HiPencil className="w-4 h-4" /></button>
                              <button onClick={() => act(() => payrollAPI.approveBonusRule(r.id), "Bonus rule approved")} className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition" title="Approve"><HiCheck className="w-4 h-4" /></button>
                              <button onClick={() => setRejectingId(r.id)} className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition" title="Reject"><HiX className="w-4 h-4" /></button>
                            </>
                          )}
                          {r.status === "approved" && !r.applied_at && (
                            <button onClick={() => handleApply(r)} className="px-2.5 py-1.5 text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-1"><HiSparkles className="w-3.5 h-3.5" /> Apply</button>
                          )}
                          {(r.status === "pending" || r.status === "approved") && !r.applied_at && (
                            <button onClick={() => window.confirm("Cancel this bonus rule?") && act(() => payrollAPI.cancelBonusRule(r.id), "Bonus rule cancelled")} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Cancel"><HiTrash className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rules.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No bonus rules yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>

      {/* Create / Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editingId ? "Edit Bonus Rule" : "New Bonus Rule"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Rule Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Q4 Engineering Bonus" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Target Month</label>
                  <select value={form.period_month} onChange={(e) => setForm({ ...form, period_month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Target Year</label>
                  <input type="number" required value={form.period_year} onChange={(e) => setForm({ ...form, period_year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Calculation</label>
                  <select value={form.bonus_type} onChange={(e) => setForm({ ...form, bonus_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="percent_of_basic">% of Basic</option>
                    <option value="percent_of_gross">% of Gross</option>
                    <option value="flat">Flat amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">{isPercent ? "Percentage" : "Amount"} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type="number" required min="0.01" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{isPercent ? "%" : "₹"}</span>
                  </div>
                </div>
              </div>
              {isPercent && (
                <p className="text-[11px] text-slate-400 -mt-1">Basis is the approved salary structure at month-end &mdash; not the LOP-reduced run figure.</p>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Eligibility</label>
                <select value={form.eligibility_source} onChange={(e) => setForm({ ...form, eligibility_source: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="all_employees">All employees</option>
                  <option value="department">By department</option>
                  <option value="manual">Specific employees</option>
                </select>
              </div>

              {form.eligibility_source === "department" && (
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3 space-y-1.5 bg-slate-50/50">
                  {departments.map((d) => {
                    const id = d.id || d._id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.department_ids.includes(id)} onChange={() => toggleId("department_ids", id)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                        <span className="text-slate-700">{d.name}</span>
                      </label>
                    );
                  })}
                  {departments.length === 0 && <p className="text-xs text-slate-400">No departments found.</p>}
                </div>
              )}

              {form.eligibility_source === "manual" && (
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3 space-y-1.5 bg-slate-50/50">
                  {employees.map((emp) => {
                    const id = emp.id || emp.user_id || emp._id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.user_ids.includes(id)} onChange={() => toggleId("user_ids", id)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                        <span className="text-slate-700">{emp.name}</span>
                      </label>
                    );
                  })}
                  {employees.length === 0 && <p className="text-xs text-slate-400">No employees found.</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Min Tenure (months)</label>
                  <input type="number" min="0" value={form.min_tenure_months} onChange={(e) => setForm({ ...form, min_tenure_months: e.target.value })} placeholder="Optional" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Max / Employee (₹)</label>
                  <input type="number" min="0" value={form.max_amount_per_employee} onChange={(e) => setForm({ ...form, max_amount_per_employee: e.target.value })} placeholder="Optional cap" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                <textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} placeholder="Why this bonus is being paid" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none resize-none" />
              </div>

              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">{editingId ? "Save Changes" : "Create Rule"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Impact preview modal */}
      {impact && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Impact Preview</h2>
                <p className="text-xs text-slate-500">{impact.rule.name} · {fmtPeriod(impact.rule.period_month)}</p>
              </div>
              <button onClick={() => setImpact(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            {impactLoading || !impact.data ? (
              <div className="p-10"><Skeleton type="dashboard" /></div>
            ) : (
              <>
                <div className="p-6 grid grid-cols-2 gap-4">
                  <div className="bg-purple-50 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-purple-500 uppercase">Eligible Employees</p>
                    <p className="text-2xl font-black text-purple-700 mt-1">{impact.data.eligible_count ?? impact.data.employees?.length ?? 0}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">Total Liability</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{money(impact.data.total_bonus_liability ?? impact.data.total_liability)}</p>
                  </div>
                </div>
                <div className="px-6 pb-2 overflow-y-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3 text-right">Basis</th>
                        <th className="px-4 py-3 text-right">Bonus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {(impact.data.employees || []).map((row) => (
                        <tr key={row.user_id}>
                          <td className="px-4 py-2.5 font-semibold text-slate-700">{row.name || empName(row.user_id)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{money(row.basic_salary ?? row.basis_amount)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-800">{money(row.bonus_amount)}</td>
                        </tr>
                      ))}
                      {(impact.data.employees || []).length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">No eligible employees for this rule.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between items-center">
                  <p className="text-[11px] text-slate-400">Preview only — no records are written.</p>
                  {impact.rule.status === "approved" && !impact.rule.applied_at && (
                    <button onClick={() => { const r = impact.rule; setImpact(null); handleApply(r); }} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 flex items-center gap-1.5">
                      <HiSparkles className="w-4 h-4" /> Apply to Payroll
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Reject Bonus Rule</h2>
              <button onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleReject} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea required value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-red-400 outline-none resize-none" placeholder="Provide a reason..." />
              </div>
              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition shadow-md shadow-red-200">Reject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bonus rule detail drawer (#68) */}
      {detail && (() => {
        const cfg = detail.eligibility_config || {};
        const src = detail.eligibility_source;
        const meta = [
          ["Created by", detail.created_by_name || detail.created_by],
          ["Created on", detail.created_at ? fmtDate(detail.created_at) : null],
          ["Approved by", detail.approved_by_name || detail.approved_by],
          ["Rejection reason", detail.rejection_reason],
          ["Applied", detail.applied_at ? `${detail.applied_count ?? 0} employees` : null],
        ].filter(([, v]) => v != null && v !== "");
        return (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{detail.name}</h2>
                  <p className="text-xs text-slate-500">{fmtPeriod(detail.period_month)}</p>
                </div>
                <button onClick={() => setDetail(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
              </div>
              <div className="p-6 overflow-y-auto space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{BONUS_TYPE_LABEL[detail.bonus_type] || detail.bonus_type}</p>
                    <p className="text-2xl font-black text-purple-700 mt-0.5">{detail.bonus_type === "flat" ? money(detail.value) : `${parseFloat(detail.value || 0)}%`}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[detail.status] || "bg-slate-100 text-slate-600"}`}>{detail.status}</span>
                </div>

                <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Eligibility</span>
                    <span className="text-sm font-semibold text-slate-800 capitalize">{(src || "").replace(/_/g, " ")}</span>
                  </div>
                  {src === "department" && (
                    <div className="px-4 py-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">Departments</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(cfg.department_ids || []).map((id) => <span key={id} className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{deptName(id)}</span>)}
                        {(cfg.department_ids || []).length === 0 && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </div>
                  )}
                  {src === "manual" && (
                    <div className="px-4 py-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">Employees</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(cfg.user_ids || []).map((id) => <span key={id} className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{empName(id)}</span>)}
                        {(cfg.user_ids || []).length === 0 && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </div>
                  )}
                  {cfg.min_tenure_months != null && cfg.min_tenure_months !== "" && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Min tenure</span>
                      <span className="text-sm font-semibold text-slate-800">{cfg.min_tenure_months} months</span>
                    </div>
                  )}
                  {detail.max_amount_per_employee != null && detail.max_amount_per_employee !== "" && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Cap / employee</span>
                      <span className="text-sm font-semibold text-slate-800">{money(detail.max_amount_per_employee)}</span>
                    </div>
                  )}
                </div>

                {detail.reason && (
                  <div className="rounded-xl border border-slate-100 px-4 py-3">
                    <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Reason</p>
                    <p className="text-sm text-slate-700">{detail.reason}</p>
                  </div>
                )}

                {detailLoading ? (
                  <p className="text-xs text-slate-400 text-center">Loading full detail…</p>
                ) : meta.length > 0 && (
                  <dl className="rounded-xl border border-slate-100 divide-y divide-slate-50">
                    {meta.map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between px-4 py-2.5 gap-4">
                        <dt className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{k}</dt>
                        <dd className="text-sm text-slate-700 text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

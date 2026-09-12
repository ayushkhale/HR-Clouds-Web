import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPencil, HiUserGroup, HiClock, HiEye,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatDate } from "../../../../shared/utils/formatUtils";

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

const REVISION_LABELS = {
  initial: "Initial", increment: "Increment", promotion: "Promotion",
  correction: "Correction", restructure: "Restructure",
};

const STRUCT_STATUS = {
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  proposed: "bg-amber-50 text-amber-700 border border-amber-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
  cancelled: "bg-slate-100 text-slate-500",
};

const userId = (u) => u?.id || u?.user_id || u?._id;
const userName = (u) => u?.name || u?.display_name || [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.identifier || "Unknown";
const userDept = (u) => u?.department || u?.department_name || "—";

// ── Revision history (all statuses — HR needs the full audit picture, #17) ──
function HistoryModal({ user, onClose, showToast }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getEmployeeStructureHistory(userId(user))
      .then((res) => { if (!cancelled) setRows(res.data?.records || res.data || []); })
      .catch((err) => { if (!cancelled) { showToast(payrollErrorMessage(err, "Failed to load history"), "error"); setRows([]); } });
    return () => { cancelled = true; };
  }, [user, showToast]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Salary history</h2>
            <p className="text-xs text-slate-500">{userName(user)}{userDept(user) !== "—" ? ` · ${userDept(user)}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {rows === null ? <Skeleton type="table" rows={4} /> : rows.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No salary structures on record yet.</p>
          ) : (
            <ol className="space-y-0">
              {rows.map((h, i) => {
                const isCurrent = h.status === "approved" && !h.effective_to;
                return (
                  <li key={h.id || i} className="relative pl-6 pb-6 last:pb-0 border-l-2 border-slate-100 last:border-transparent">
                    <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${isCurrent ? "bg-purple-600" : "bg-slate-300"}`} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-slate-800">{formatMoney(h.annual_ctc)}</span>
                        <span className="text-xs text-slate-400">/ year</span>
                        {h.version != null && <span className="text-[11px] text-slate-400">v{h.version}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                          {REVISION_LABELS[h.revision_type] || h.revision_type || "Revision"}
                        </span>
                        {h.status && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STRUCT_STATUS[h.status] || "bg-slate-100 text-slate-500"}`}>{h.status}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatDate(h.effective_from)} — {isCurrent ? "Present" : formatDate(h.effective_to)}
                    </p>
                    {h.revision_reason && <p className="text-xs text-slate-400 mt-1 italic">“{h.revision_reason}”</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assign / revise, with preview-before-commit (#15, #16, #18) ────────────
function AssignModal({ user, templates, onClose, onDone, showToast }) {
  const [current, setCurrent] = useState(undefined); // undefined = loading, null = none
  const hasCurrent = !!current;

  const [form, setForm] = useState({
    annual_ctc: "",
    effective_from: new Date().toISOString().split("T")[0],
    revision_type: "initial",
    revision_reason: "",
    template_id: templates[0]?.id || "",
  });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load the employee's current structure so HR sees what they're revising (#18).
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getEmployeeCurrentStructure(userId(user))
      .then((res) => {
        if (cancelled) return;
        const cur = res.data ?? null;
        setCurrent(cur);
        setForm((f) => ({ ...f, revision_type: cur ? "increment" : "initial" }));
      })
      .catch(() => { if (!cancelled) setCurrent(null); });
    return () => { cancelled = true; };
  }, [user]);

  // Preview invalidates whenever an input that affects it changes.
  const resetPreview = () => setPreview(null);

  const runPreview = async () => {
    if (!form.template_id || !form.annual_ctc) {
      showToast("Pick a template and enter a CTC to preview", "error");
      return;
    }
    setPreviewing(true);
    try {
      const res = await payrollAPI.previewTemplate(form.template_id, { annual_ctc: form.annual_ctc });
      setPreview(res.data || res);
    } catch (err) {
      // Evaluator 422s (NO_BASIC_COMPONENT, CTC_BELOW_FIXED_COMPONENTS, …) surface here, before commit.
      showToast(payrollErrorMessage(err, "Couldn't preview this structure"), "error");
    } finally {
      setPreviewing(false);
    }
  };

  const reasonRequired = hasCurrent;
  const canSubmit =
    form.template_id && form.annual_ctc && form.effective_from &&
    (!reasonRequired || form.revision_reason.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Build payload defensively: template-driven, so send template_id and never
      // an empty string (which would trip the template_id XOR components rule).
      const payload = {
        annual_ctc: form.annual_ctc,
        effective_from: form.effective_from,
        revision_type: form.revision_type,
        template_id: form.template_id,
      };
      if (form.revision_reason.trim()) payload.revision_reason = form.revision_reason.trim();

      const res = await payrollAPI.assignEmployeeStructure(userId(user), payload);
      const status = res.data?.status;
      showToast(status === "proposed"
        ? "Revision submitted — it needs a second HR user to approve"
        : "Salary structure assigned");
      onDone();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to assign structure"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{hasCurrent ? "Revise salary" : "Assign salary"}</h2>
            <p className="text-xs text-slate-500">{userName(user)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Current-structure context */}
          {current === undefined ? (
            <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
          ) : hasCurrent ? (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Current CTC</p>
                <p className="text-sm font-bold text-slate-800">{formatMoney(current.annual_ctc)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Since</p>
                <p className="text-sm font-semibold text-slate-600">{formatDate(current.effective_from)}{current.version != null ? ` · v${current.version}` : ""}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">No salary structure yet — this will be the initial assignment.</p>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Template <span className="text-red-500">*</span></label>
            <select required value={form.template_id} onChange={(e) => { setForm({ ...form, template_id: e.target.value }); resetPreview(); }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
              <option value="">-- Select template --</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
            </select>
            {templates.length === 0 && <p className="text-xs text-amber-600 mt-1">No templates exist yet. Create one under Structure Templates first.</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Annual CTC <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input type="number" required min="1" value={form.annual_ctc} onChange={(e) => { setForm({ ...form, annual_ctc: e.target.value }); resetPreview(); }}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Effective from <span className="text-red-500">*</span></label>
              <input type="date" required value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Revision type</label>
              <select value={form.revision_type} onChange={(e) => setForm({ ...form, revision_type: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                {!hasCurrent && <option value="initial">Initial</option>}
                <option value="increment">Increment</option>
                <option value="promotion">Promotion</option>
                <option value="correction">Correction</option>
                <option value="restructure">Restructure</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">
                Reason {reasonRequired && <span className="text-red-500">*</span>}
              </label>
              <input type="text" value={form.revision_reason} onChange={(e) => setForm({ ...form, revision_reason: e.target.value })}
                placeholder={reasonRequired ? "Required for a revision" : "Optional"}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
          </div>

          {/* Preview-before-commit */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5"><HiEye className="w-3.5 h-3.5" /> Preview</span>
              <button type="button" onClick={runPreview} disabled={previewing || !form.template_id || !form.annual_ctc}
                className="text-xs font-bold text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed">
                {previewing ? "Calculating…" : "Preview split"}
              </button>
            </div>
            {preview ? (
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase font-bold text-slate-400">
                      <th className="text-left pb-2">Component</th>
                      <th className="text-right pb-2">Monthly</th>
                      <th className="text-right pb-2">Annual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(preview.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-slate-700">{l.name}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{formatMoney(l.monthly_amount)}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">{formatMoney(l.annual_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-100">
                    <tr>
                      <td className="pt-2 font-bold text-slate-800">Annual gross</td>
                      <td className="pt-2 text-right text-purple-600 font-black tabular-nums">{formatMoney(preview.monthly_gross)}</td>
                      <td className="pt-2 text-right text-purple-700 font-black tabular-nums">{formatMoney(preview.annual_gross)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className={`mt-3 text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 ${preview.reconciled ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"}`}>
                  {preview.reconciled ? <HiCheckCircle className="w-4 h-4" /> : <HiExclamationCircle className="w-4 h-4" />}
                  {preview.reconciled ? "Reconciles to the CTC exactly." : "Does not reconcile to the CTC — check the template."}
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-xs text-slate-400">Preview the component split and confirm it reconciles before assigning.</p>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
            <button type="submit" disabled={!canSubmit || submitting}
              className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
              {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (hasCurrent ? "Assign revision" : "Assign structure")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EmployeeSalaryStructuresPage() {
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [ctcByUser, setCtcByUser] = useState({}); // userId -> current structure (or null)
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [assignUser, setAssignUser] = useState(null);
  const [historyUser, setHistoryUser] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Enrich the roster with each employee's current CTC (#18), in parallel and
  // failure-isolated so one missing structure never blanks the table.
  const enrichCtc = useCallback(async (list) => {
    if (!list.length) return;
    const results = await Promise.allSettled(
      list.map((u) => payrollAPI.getEmployeeCurrentStructure(userId(u)))
    );
    const map = {};
    results.forEach((r, i) => {
      map[userId(list[i])] = r.status === "fulfilled" ? (r.value.data ?? null) : null;
    });
    setCtcByUser(map);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, tplRes] = await Promise.all([
        organizationAPI.getEmployees({ purpose: "emp_report" }),
        payrollAPI.getTemplates(),
      ]);
      const list = empRes.data?.records || empRes.data || [];
      setEmployees(list);
      setTemplates(tplRes.data?.records || tplRes.data || []);
      enrichCtc(list);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load data"), "error");
    } finally {
      setLoading(false);
    }
  }, [enrichCtc, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <>
      <DashboardTopBar title="Employee Salary Structures" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HiUserGroup className="text-purple-600 w-7 h-7" /> Salary Assignment
          </h1>
          <p className="text-sm text-slate-500 mt-1">Review current pay, then assign or revise salary structures.</p>
        </div>

        {loading ? <Skeleton type="table" rows={6} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4 text-right">Current CTC</th>
                    <th className="px-6 py-4">Effective from</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {employees.map((user, i) => {
                    const cur = ctcByUser[userId(user)];
                    return (
                      <tr key={userId(user) || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-800">{userName(user)}</p>
                          {user.email && <p className="text-xs text-slate-400">{user.email}</p>}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{userDept(user)}</td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          {cur === undefined ? (
                            <span className="inline-block w-16 h-4 rounded bg-slate-100 animate-pulse" />
                          ) : cur ? (
                            <span className="font-bold text-slate-800">{formatMoney(cur.annual_ctc)}</span>
                          ) : (
                            <span className="text-xs text-slate-400">Not set</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{cur ? formatDate(cur.effective_from) : "—"}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setHistoryUser(user)} title="Salary history"
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                              <HiClock className="w-3.5 h-3.5" /> History
                            </button>
                            <button onClick={() => setAssignUser(user)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                              <HiPencil className="w-3.5 h-3.5" /> {cur ? "Revise" : "Assign"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {historyUser && <HistoryModal user={historyUser} onClose={() => setHistoryUser(null)} showToast={showToast} />}

      {assignUser && (
        <AssignModal
          user={assignUser}
          templates={templates}
          showToast={showToast}
          onClose={() => setAssignUser(null)}
          onDone={() => { setAssignUser(null); loadData(); }}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiArrowLeft, HiCalculator,
  HiCheck, HiCash, HiSearch, HiChevronLeft, HiChevronRight, HiBan,
  HiRefresh, HiCalendar, HiOutlineDocumentSearch,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatPeriod, formatMoney } from "../../../../shared/utils/formatUtils";

const PAGE_SIZE = 20;

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

// Resolve a display name for a run item, however the backend nested it.
const itemName = (it, emps = []) => {
  const emp = emps.find(e => (e.id || e.user_id || e._id) === it.user_id || (e.id || e.user_id || e._id) === it.employee_id);
  if (emp) return emp.name || emp.display_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
  return it.employee_name ||
    it.employee?.name ||
    it.employee?.display_name ||
    [it.employee?.first_name, it.employee?.last_name].filter(Boolean).join(" ").trim() ||
    it.employee?.identifier ||
    it.user?.profile?.display_name ||
    [it.user?.profile?.first_name, it.user?.profile?.last_name].filter(Boolean).join(" ").trim() ||
    it.name ||
    it.user?.identifier ||
    it.employee_code ||
    "Unknown";
};

const itemDept = (it, emps = []) => {
  const emp = emps.find(e => (e.id || e.user_id || e._id) === it.user_id || (e.id || e.user_id || e._id) === it.employee_id);
  if (emp && (emp.department || emp.department_name)) return emp.department || emp.department_name;
  return it.department || it.department_name || it.employee?.department || it.employee?.department_name || it.user?.department || it.user?.profile?.department || "N/A";
};

const itemCode = (it, emps = []) => {
  const emp = emps.find(e => (e.id || e.user_id || e._id) === it.user_id || (e.id || e.user_id || e._id) === it.employee_id);
  if (emp && (emp.employee_code || emp.code)) return emp.employee_code || emp.code;
  return it.employee_code || it.employee?.employee_code || it.user?.profile?.employee_code || null;
};

const ITEM_STATUS = {
  pending:    { cls: "bg-slate-50 text-slate-600 border border-slate-200",  label: "Pending" },
  calculated: { cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", label: "Calculated" },
  error:      { cls: "bg-rose-50 text-rose-700 border border-rose-200", label: "Error" },
  excluded:   { cls: "bg-amber-50 text-amber-700 border border-amber-200", label: "Excluded" },
};

const RUN_STATUS = {
  draft: "bg-slate-100 text-slate-600",
  calculating: "bg-blue-100 text-blue-700",
  calculated: "bg-blue-100 text-blue-700",
  approved: "bg-purple-100 text-purple-700",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function StatusBadge({ status }) {
  const s = ITEM_STATUS[status] || ITEM_STATUS.pending;
  return <span className={`px-2 py-1 rounded-full text-[11px] font-bold w-max inline-block ${s.cls}`}>{s.label}</span>;
}

// ── Item drill-down: component lines + day ledger ──────────────────────────
function ItemDetailModal({ runId, itemId, onClose, showToast }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    payrollAPI.getRunItem(runId, itemId)
      .then((res) => { if (!cancelled) setDetail(res.data || res); })
      .catch((err) => { if (!cancelled) showToast(payrollErrorMessage(err, "Failed to load payslip detail"), "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId, itemId, showToast]);

  const item = detail?.item || detail || {};
  const components = detail?.components || item.components || [];
  const ledger = detail?.attendance_snapshot?.per_date || item.attendance_snapshot?.per_date || [];
  const earnings = components.filter((c) => c.component_type === "earning");
  const deductions = components.filter((c) => c.component_type === "deduction");

  const LEDGER_CLASS = {
    P: { label: "Present", cls: "bg-emerald-100 text-emerald-700" },
    L: { label: "LOP", cls: "bg-red-100 text-red-700" },
    W: { label: "Week-off", cls: "bg-slate-100 text-slate-500" },
    H: { label: "Holiday", cls: "bg-blue-50 text-blue-600" },
    O: { label: "Leave", cls: "bg-amber-50 text-amber-600" },
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{loading ? "Loading payslip…" : itemName(item)}</h2>
            {!loading && <p className="text-xs text-slate-500">{itemDept(item)}{itemCode(item) ? ` · ${itemCode(item)}` : ""}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>

        {loading ? <div className="p-8"><Skeleton type="dashboard" /></div> : (
          <div className="p-6 overflow-y-auto space-y-6">
            {item.status === "error" && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <HiExclamationCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">{item.error_code || "Calculation error"}</p>
                  {item.error_reason && <p className="text-red-600 mt-0.5">{item.error_reason}</p>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-purple-400 uppercase">Gross</p>
                <p className="text-base font-black text-purple-700 tabular-nums">{formatMoney(item.gross_earnings)}</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-red-400 uppercase">Deductions</p>
                <p className="text-base font-black text-red-600 tabular-nums">{formatMoney(item.total_deductions)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-emerald-500 uppercase">Net Pay</p>
                <p className="text-base font-black text-emerald-700 tabular-nums">{formatMoney(item.net_pay)}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Payable / LOP</p>
                <p className="text-base font-black text-slate-700 tabular-nums">{item.payable_days ?? "—"} / {item.lop_days ?? "—"}</p>
              </div>
            </div>

            {item.statutory_status === "not_applied" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Statutory deductions (PF, ESI, PT, TDS) are not applied in this figure — net pay is gross minus LOP only, not final take-home.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Earnings</h3>
                <div className="space-y-2 text-sm">
                  {earnings.length === 0 && <span className="text-slate-400 italic">No earnings lines</span>}
                  {earnings.map((c, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-slate-600">{c.component_name}</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{formatMoney(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Deductions</h3>
                <div className="space-y-2 text-sm">
                  {deductions.length === 0 && <span className="text-slate-400 italic">No deductions</span>}
                  {deductions.map((c, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-slate-600">{c.component_name}</span>
                      <span className="font-semibold text-red-600 tabular-nums">{formatMoney(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {ledger.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Attendance ledger</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ledger.map((day, i) => {
                    const cls = LEDGER_CLASS[day.c] || { label: day.c, cls: "bg-slate-100 text-slate-500" };
                    const dayNum = String(day.d || "").split("-").pop();
                    return (
                      <span key={i} title={`${day.d} · ${cls.label}${day.r ? ` · ${day.r}` : ""}`}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold tabular-nums ${cls.cls}`}>
                        {dayNum}
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
                  {Object.entries(LEDGER_CLASS).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded ${v.cls}`} /> {v.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reason-required modal, reused by Exclude and Override-period ───────────
function ReasonModal({ title, label, placeholder, confirmLabel, extraField, onSubmit, onClose, busy }) {
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState(extraField?.default || "");
  const canSubmit = reason.trim().length > 0 && (!extraField || extra);
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {extraField && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">{extraField.label}</label>
              <input type={extraField.type || "text"} value={extra} onChange={(e) => setExtra(e.target.value)} min={extraField.min} max={extraField.max}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              {extraField.hint && <p className="text-xs text-slate-400 mt-1">{extraField.hint}</p>}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">{label} <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
            <button onClick={() => onSubmit(reason.trim(), extra)} disabled={!canSubmit || busy}
              className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
              {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayrollRunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();

  const [run, setRun] = useState(null);
  const [preview, setPreview] = useState(null);
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [detailItemId, setDetailItemId] = useState(null);
  const [reasonModal, setReasonModal] = useState(null); // { kind: 'exclude'|'period', item }

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadHeader = useCallback(async () => {
    try {
      const [runRes, prevRes, empRes] = await Promise.all([
        payrollAPI.getRun(runId),
        payrollAPI.getRunPreview(runId).catch(() => null),
        organizationAPI.getEmployees({ purpose: "emp_report" }).catch(() => null),
      ]);
      setRun(runRes.data || runRes);
      if (prevRes) setPreview(prevRes.data || prevRes);
      if (empRes) setEmployees(empRes.data?.records || empRes.data || empRes || []);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load run"), "error");
    }
  }, [runId, showToast]);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      const res = await payrollAPI.getRunItems(runId, params);
      setItems(res.data?.records || res.data?.items || res.data || []);
      setTotal(res.data?.total ?? res.data?.count ?? res.meta?.total ?? 0);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load run items"), "error");
    } finally {
      setItemsLoading(false);
    }
  }, [runId, page, statusFilter, showToast]);

  useEffect(() => {
    setLoading(true);
    loadHeader().finally(() => setLoading(false));
  }, [loadHeader]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const refresh = () => { loadHeader(); loadItems(); };

  // Client-side name search over the current page (server filters by UUID only).
  const visibleItems = search.trim()
    ? items.filter((it) => itemName(it, employees).toLowerCase().includes(search.trim().toLowerCase()) || (itemCode(it, employees) || "").toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  const errorCount = run?.error_count ?? preview?.error_items?.length ?? 0;
  const isStale = !!run?.requires_recalculation;
  const status = run?.status;

  const CONFIRM = {
    approve: "Approve this run? This freezes the calculated pay for every employee and locks attendance for the period. You won't be able to recalculate afterwards.",
    pay: "Mark this run as paid? This is the final step and cannot be undone.",
    cancel: "Cancel this run? This releases the attendance lock and reopens the period. Any calculated figures will be discarded.",
  };

  const runAction = async (action) => {
    if (CONFIRM[action] && !window.confirm(CONFIRM[action])) return;
    setBusy(true);
    try {
      if (action === "calculate") await payrollAPI.calculateRun(runId);
      if (action === "approve") await payrollAPI.approveRun(runId);
      if (action === "pay") await payrollAPI.payRun(runId);
      if (action === "cancel") await payrollAPI.cancelRun(runId);
      showToast(`Run ${action}d successfully`);
      refresh();
    } catch (err) {
      showToast(payrollErrorMessage(err, `Failed to ${action} run`), "error");
    } finally {
      setBusy(false);
    }
  };

  const includeItem = async (item) => {
    setBusy(true);
    try {
      await payrollAPI.includeRunItem(runId, item.id);
      showToast("Employee re-included — recalculate to update their figures");
      refresh();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to include employee"), "error");
    } finally {
      setBusy(false);
    }
  };

  const submitReason = async (reason, extra) => {
    const { kind, item } = reasonModal;
    setBusy(true);
    try {
      if (kind === "exclude") {
        await payrollAPI.excludeRunItem(runId, item.id, { exclusion_reason: reason });
        showToast("Employee excluded from this run");
      } else {
        await payrollAPI.overrideRunItemPeriod(runId, item.id, { period_end: extra, period_override_reason: reason });
        showToast("Pay period updated — recalculate to apply");
      }
      setReasonModal(null);
      refresh();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Action failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canApprove = status === "calculated" && !isStale && errorCount === 0;

  if (loading) {
    return (
      <>
        <DashboardTopBar title="Payroll Run" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full"><Skeleton type="dashboard" /></main>
      </>
    );
  }

  return (
    <>
      <DashboardTopBar title="Payroll Run" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">

        <button onClick={() => navigate("/dashboard/hr/payroll/runs")} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition mb-5">
          <HiArrowLeft className="w-4 h-4" /> All runs
        </button>

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{formatPeriod(run?.period_month)}</h1>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${RUN_STATUS[status] || RUN_STATUS.draft}`}>{status}</span>
            </div>
            {run?.notes && <p className="text-sm text-slate-500 mt-1">{run.notes}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(status === "draft" || status === "calculated") && (
              <button onClick={() => runAction("calculate")} disabled={busy}
                className="px-4 py-2.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                {status === "calculated" ? <HiRefresh className="w-4 h-4" /> : <HiCalculator className="w-4 h-4" />}
                {status === "calculated" ? "Recalculate" : "Calculate"}
              </button>
            )}
            {status === "calculated" && (
              <button onClick={() => runAction("approve")} disabled={busy || !canApprove} title={!canApprove ? "Resolve blockers before approving" : ""}
                className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed">
                <HiCheck className="w-4 h-4" /> Approve
              </button>
            )}
            {status === "approved" && (
              <button onClick={() => runAction("pay")} disabled={busy}
                className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-emerald-200 disabled:opacity-50">
                <HiCash className="w-4 h-4" /> Finalize (Pay)
              </button>
            )}
            {["draft", "calculated", "approved"].includes(status) && (
              <button onClick={() => runAction("cancel")} disabled={busy}
                className="px-4 py-2.5 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition disabled:opacity-50">
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* ── Approval gate messaging ── */}
        {status === "calculated" && !canApprove && (
          <div className="mb-6 flex items-start gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <HiExclamationCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div>
              {isStale && <p><b>Recalculation needed.</b> Figures changed since the last calculation. Recalculate before approving.</p>}
              {errorCount > 0 && (
                <p className={isStale ? "mt-1" : ""}>
                  <b>{errorCount} employee{errorCount === 1 ? "" : "s"} can't be approved.</b>{" "}
                  <button onClick={() => { setStatusFilter("error"); setPage(1); }} className="underline font-semibold">Show only errors</button> to resolve or exclude them.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Summary tiles ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Employees</p>
            <p className="text-xl font-black text-slate-800 mt-1 tabular-nums">{run?.total_employees ?? 0}</p>
            {run?.excluded_count > 0 && <p className="text-[11px] text-amber-600 mt-0.5">{run.excluded_count} excluded</p>}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Gross</p>
            <p className="text-xl font-black text-purple-700 mt-1 tabular-nums">{formatMoney(run?.total_gross)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Deductions</p>
            <p className="text-xl font-black text-red-600 mt-1 tabular-nums">{formatMoney(run?.total_deductions)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Net Payout</p>
            <p className="text-xl font-black text-emerald-600 mt-1 tabular-nums">{formatMoney(run?.total_net)}</p>
          </div>
        </div>

        {/* ── Department breakdown ── */}
        {preview?.department_breakdown?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Cost by department</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {preview.department_breakdown.map((d, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-50 rounded-xl px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{d.department || d.department_name || "Unassigned"}</p>
                    <p className="text-[11px] text-slate-400">{d.headcount ?? d.count ?? 0} employees</p>
                  </div>
                  <p className="text-sm font-bold text-slate-800 tabular-nums shrink-0">{formatMoney(d.total_net ?? d.net ?? d.total_gross)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Items ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this page by name…"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs font-semibold">
              {[["", "All"], ["calculated", "Calculated"], ["error", "Errors"], ["excluded", "Excluded"], ["pending", "Pending"]].map(([val, label]) => (
                <button key={val} onClick={() => { setStatusFilter(val); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md transition ${statusFilter === val ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-semibold">
                <tr>
                  <th className="px-5 py-3.5 text-xs uppercase tracking-wide">Employee</th>
                  <th className="px-5 py-3.5 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 text-xs uppercase tracking-wide text-right">Payable / LOP</th>
                  <th className="px-5 py-3.5 text-xs uppercase tracking-wide text-right">Gross</th>
                  <th className="px-5 py-3.5 text-xs uppercase tracking-wide text-right">Net</th>
                  <th className="px-5 py-3.5 text-xs uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {itemsLoading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Loading employees…</td></tr>
                ) : visibleItems.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    {items.length === 0 ? "No employees in this run yet. Calculate the run to populate it." : "No employees match your search."}
                  </td></tr>
                ) : visibleItems.map((it) => {
                  const editable = ["draft", "calculated"].includes(status);
                  return (
                    <tr key={it.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <button onClick={() => setDetailItemId(it.id)} className="text-left group">
                          <p className="font-bold text-slate-800 group-hover:text-purple-700 transition">{itemName(it, employees)}</p>
                          <p className="text-xs text-slate-400">{itemDept(it, employees)}{itemCode(it, employees) ? ` · ${itemCode(it, employees)}` : ""}</p>
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">{it.payable_days ?? "—"} / {it.lop_days ?? "—"}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-800">{formatMoney(it.gross_earnings)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-bold text-emerald-600">{formatMoney(it.net_pay)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setDetailItemId(it.id)} title="View payslip" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition">
                            <HiOutlineDocumentSearch className="w-4 h-4" />
                          </button>
                          {editable && it.status !== "excluded" && (
                            <>
                              <button onClick={() => setReasonModal({ kind: "period", item: it })} title="Override pay period" className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition">
                                <HiCalendar className="w-4 h-4" />
                              </button>
                              <button onClick={() => setReasonModal({ kind: "exclude", item: it })} title="Exclude from run" className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition">
                                <HiBan className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {editable && it.status === "excluded" && (
                            <button onClick={() => includeItem(it)} disabled={busy} title="Re-include" className="p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition disabled:opacity-50">
                              <HiRefresh className="w-4 h-4" />
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

          {total > PAGE_SIZE && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Page {page} of {totalPages} · {total} employees</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      </main>

      {detailItemId && (
        <ItemDetailModal runId={runId} itemId={detailItemId} onClose={() => setDetailItemId(null)} showToast={showToast} />
      )}

      {reasonModal?.kind === "exclude" && (
        <ReasonModal
          title={`Exclude ${itemName(reasonModal.item, employees)}`}
          label="Exclusion reason"
          placeholder="e.g. Disciplinary hold, pending bank details"
          confirmLabel="Exclude"
          busy={busy}
          onSubmit={submitReason}
          onClose={() => setReasonModal(null)}
        />
      )}

      {reasonModal?.kind === "period" && (
        <ReasonModal
          title={`Override pay period — ${itemName(reasonModal.item, employees)}`}
          label="Reason"
          placeholder="e.g. Mid-month termination"
          confirmLabel="Update period"
          busy={busy}
          extraField={{ label: "Last payable day", type: "date", hint: "Must fall within this run's month." }}
          onSubmit={submitReason}
          onClose={() => setReasonModal(null)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

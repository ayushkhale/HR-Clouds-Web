import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiDatabase,
  HiChevronLeft, HiChevronRight, HiChevronDown, HiFilter,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";

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

const userId = (u) => u?.id || u?.user_id || u?._id;
const userName = (u) => u?.name || u?.display_name || [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.identifier || "Unknown";

// The append-only trail spans every payroll entity. Offer the common ones as a
// dropdown; "All" leaves the filter off entirely.
const ENTITY_TYPES = [
  ["", "All entities"],
  ["salary_structure", "Salary structure"],
  ["structure_template", "Structure template"],
  ["salary_component", "Salary component"],
  ["payroll_run", "Payroll run"],
  ["payroll_run_item", "Run item"],
  ["payroll_adjustment", "Adjustment"],
  ["bonus_rule", "Bonus rule"],
  ["loan", "Loan"],
  ["bank_account", "Bank account"],
  ["payroll_settings", "Settings"],
  ["statutory_config", "Statutory config"],
  ["pt_slab", "PT slab"],
  ["tax_regime", "Tax regime"],
  ["tax_declaration", "Tax declaration"],
];

const ENTITY_LABEL = Object.fromEntries(ENTITY_TYPES.map(([v, l]) => [v, l]));

const actionTone = () => "bg-slate-50 text-slate-600 border-slate-200";

const fmtWhen = (d) => {
  if (!d) return "N/A";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "N/A"
    : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const prettify = (s) => (s ? String(s).replace(/_/g, " ") : "N/A");

const emptyFilters = { entity_type: "", action: "", target_user_id: "", from: "", to: "" };
const PAGE_SIZE = 20; // fixed request size — the user never changes it, so it must not depend on the response

export default function PayrollAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [filters, setFilters] = useState(emptyFilters);   // committed (in-flight) filters
  const [draft, setDraft] = useState(emptyFilters);        // form state, applied on submit
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: null, pages: null }); // derived from the response only
  const [expanded, setExpanded] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const empName = useCallback(
    (id) => employees.find((e) => userId(e) === id)?.name || id || "N/A",
    [employees]
  );

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await payrollAPI.getAuditLogs(params);
      const body = res.data || {};
      setLogs(body.records || body.logs || (Array.isArray(body) ? body : []));
      const total = body.total ?? body.pagination?.total ?? null;
      const pages = body.pages ?? body.pagination?.pages ?? (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null);
      setPageInfo({ total, pages });
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load audit logs"), "error");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters, showToast]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Employee directory for the target filter + resolving ids to names.
  useEffect(() => {
    organizationAPI.getEmployees({ purpose: "emp_report" })
      .then((res) => setEmployees(res.data?.records || res.data?.employees || res.data || []))
      .catch(() => setEmployees([]));
  }, []);

  const applyFilters = (e) => {
    e?.preventDefault();
    setExpanded(null);
    setPage(1);
    setFilters(draft);
  };

  const resetFilters = () => {
    setDraft(emptyFilters);
    setExpanded(null);
    setPage(1);
    setFilters(emptyFilters);
  };

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  const canPrev = page > 1;
  const canNext = pageInfo.pages != null ? page < pageInfo.pages : logs.length >= PAGE_SIZE;

  return (
    <>
      <DashboardTopBar title="Audit Log" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Payroll Audit Log
          </h1>
          <p className="text-sm text-slate-500 mt-1">An append-only record of every payroll change — who did what, and when.</p>
        </div>

        {/* Filter bar */}
        <form onSubmit={applyFilters} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Entity</label>
              <select value={draft.entity_type} onChange={(e) => setDraft({ ...draft, entity_type: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
                {ENTITY_TYPES.map(([v, l]) => <option key={v || "all"} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Action</label>
              <input value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="e.g. approve" className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Employee</label>
              <select value={draft.target_user_id} onChange={(e) => setDraft({ ...draft, target_user_id: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
                <option value="">Anyone</option>
                {employees.map((e) => <option key={userId(e)} value={userId(e)}>{userName(e)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">From</label>
              <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">To</label>
              <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
            <div className="flex items-end gap-2 h-full pb-0">
              <button type="submit" className="flex-1 h-[42px] text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition flex justify-center items-center gap-1.5 shadow-sm shadow-purple-200">
                <HiFilter className="w-4 h-4" /> Apply
              </button>
              {hasFilters && (
                <button type="button" onClick={resetFilters} className="h-[42px] px-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent rounded-lg transition" title="Clear filters">
                  <HiX className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </form>

        {loading ? <Skeleton type="table" rows={8} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 w-8"></th>
                    <th className="px-6 py-4">When</th>
                    <th className="px-6 py-4">Actor</th>
                    <th className="px-6 py-4">Action</th>
                    <th className="px-6 py-4">Entity</th>
                    <th className="px-6 py-4">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map((log, i) => {
                    const key = log.id || i;
                    const isOpen = expanded === key;
                    const meta = log.changes ?? log.metadata ?? log.details ?? log.diff ?? null;
                    const actor = log.actor_name || log.performed_by_name || empName(log.actor_id || log.actor_user_id || log.performed_by || log.user_id);
                    const target = log.target_user_id ? empName(log.target_user_id) : null;
                    return (
                      <React.Fragment key={key}>
                        <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setExpanded(isOpen ? null : key)}>
                          <td className="px-6 py-4 text-slate-300">
                            <HiChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180 text-purple-500" : ""}`} />
                          </td>
                          <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{fmtWhen(log.created_at || log.timestamp || log.performed_at)}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{actor}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${actionTone(log.action)}`}>{prettify(log.action)}</span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 capitalize">{ENTITY_LABEL[log.entity_type] || prettify(log.entity_type)}</td>
                          <td className="px-6 py-4 text-slate-600">{target || <span className="text-slate-300 font-medium">N/A</span>}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={6} className="px-6 py-4">
                              {log.reason && <div className="text-xs mb-3"><span className="font-bold text-slate-400 uppercase mr-2">Reason</span><span className="text-slate-600">{log.reason}</span></div>}
                              {meta ? (
                                <pre className="bg-white border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 overflow-x-auto whitespace-pre-wrap break-words">
                                  {typeof meta === "string" ? meta : JSON.stringify(meta, null, 2)}
                                </pre>
                              ) : (
                                <p className="text-xs text-slate-400 italic">No additional detail recorded for this event.</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {logs.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">{hasFilters ? "No audit entries match these filters." : "No audit entries recorded yet."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                {pageInfo.total != null
                  ? `Page ${page} of ${pageInfo.pages} · ${pageInfo.total} entries`
                  : `Page ${page}`}
              </p>
              <div className="flex items-center gap-2">
                <button disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"><HiChevronLeft className="w-4 h-4" /></button>
                <button disabled={!canNext} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

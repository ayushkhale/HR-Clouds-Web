import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import useEmployeeDirectory from "../useEmployeeDirectory";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiDatabase,
  HiChevronLeft, HiChevronRight, HiFilter, HiCode, HiDocumentText,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { PersonSelect } from "../../../../shared/components/PersonPicker";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}


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

const logWhen = (log) => log.created_at || log.timestamp || log.performed_at;
const logMeta = (log) => log.changes ?? log.metadata ?? log.details ?? log.diff ?? null;

export default function PayrollAuditLogPage() {
  const [logs, setLogs] = useState([]);
  // Every employee, leavers included: the trail names people who have since left.
  const { directory, nameOf } = useEmployeeDirectory();
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [filters, setFilters] = useState(emptyFilters);   // committed (in-flight) filters
  const [draft, setDraft] = useState(emptyFilters);        // form state, applied on submit
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: null, pages: null }); // derived from the response only
  const [preview, setPreview] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Never show a raw UUID: unresolved ids read "Unknown user" (e.g. a system actor).
  const empName = useCallback((id) => nameOf(id, "Unknown user"), [nameOf]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await payrollAPI.getAuditLogs(params);
      const body = res?.data;
      setLogs(Array.isArray(body) ? body : body?.records || body?.logs || []);
      // Payroll lists send `pagination` next to `data`; older shapes nested it.
      const meta = res?.pagination || body?.pagination || null;
      const total = meta?.total ?? body?.total ?? null;
      const pages = meta?.total_pages ?? meta?.totalPages ?? body?.pages
        ?? (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null);
      setPageInfo({ total, pages });
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load audit logs"), "error");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters, showToast]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const applyFilters = (e) => {
    e?.preventDefault();
    setPage(1);
    setFilters(draft);
  };

  const resetFilters = () => {
    setDraft(emptyFilters);
    setPage(1);
    setFilters(emptyFilters);
  };

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  const canPrev = page > 1;
  const canNext = pageInfo.pages != null ? page < pageInfo.pages : logs.length >= PAGE_SIZE;

  const actorOf = (log) => log.actor_name || log.performed_by_name || empName(log.actor_id || log.actor_user_id || log.performed_by || log.user_id);

  return (
    <>
      <DashboardTopBar title="Audit Log" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">An append-only record of every payroll change — who did what, and when. Click a row to see the full entry.</p>
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
              <PersonSelect people={directory.options} value={draft.target_user_id} onChange={(id) => setDraft({ ...draft, target_user_id: id })} clearLabel="Anyone" aria-label="Employee" />
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
                    <th className="px-6 py-4">When</th>
                    <th className="px-6 py-4">Actor</th>
                    <th className="px-6 py-4">Action</th>
                    <th className="px-6 py-4">Entity</th>
                    <th className="px-6 py-4">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map((log, i) => (
                    <tr key={log.id || i} {...rowPreviewProps(() => setPreview(log), "View audit entry")}>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{fmtWhen(logWhen(log))}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{actorOf(log)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border-purple-100">{prettify(log.action)}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 capitalize">{ENTITY_LABEL[log.entity_type] || prettify(log.entity_type)}</td>
                      <td className="px-6 py-4 text-slate-600">{log.target_user_id ? empName(log.target_user_id) : <span className="text-slate-400 font-medium">N/A</span>}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">{hasFilters ? "No audit entries match these filters." : "No audit entries recorded yet."}</td></tr>
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

      {preview && (() => {
        const meta = logMeta(preview);
        return (
          <DetailDialog
            eyebrow="Audit entry"
            icon={HiDatabase}
            title={`${prettify(preview.action)} · ${ENTITY_LABEL[preview.entity_type] || prettify(preview.entity_type)}`}
            subtitle={fmtWhen(logWhen(preview))}
            badge={<DetailPill tone="onDark">{prettify(preview.action)}</DetailPill>}
            onClose={() => setPreview(null)}
          >
            <DetailSection title="What happened" icon={HiDocumentText}>
              <DetailGrid
                cols={3}
                items={[
                  ["When", fmtWhen(logWhen(preview))],
                  ["Done by", actorOf(preview)],
                  ["Action", prettify(preview.action)],
                  ["Entity", ENTITY_LABEL[preview.entity_type] || prettify(preview.entity_type)],
                  { label: "Entity ID", value: preview.entity_id, mono: true },
                  ["Affected employee", preview.target_user_id ? empName(preview.target_user_id) : null],
                ]}
              />
              {preview.reason && <div className="mt-3"><DetailText label="Reason">{preview.reason}</DetailText></div>}
            </DetailSection>

            <DetailSection title="Recorded details" icon={HiCode}>
              {meta ? (
                <pre className="bg-purple-950 text-purple-100 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[50vh]">
                  {typeof meta === "string" ? meta : JSON.stringify(meta, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">No additional detail recorded for this event.</p>
              )}
            </DetailSection>
          </DetailDialog>
        );
      })()}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PayrollExportsPage — the export audit trail (#182).
//
// Every payslip PDF, bulk ZIP, report CSV/PDF and bank file opens a row here
// BEFORE the first byte is sent, so a download that failed halfway still leaves
// a record. This screen is the answer to "who took a copy of our salary data?".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatPeriod } from "../../../../shared/utils/formatUtils";
import useEmployeeDirectory from "../useEmployeeDirectory";
import useToast from "../useToast";
import PayrollToast from "../PayrollToast";
import { EXPORT_SCOPE_LABEL, EXPORT_STATUS, EXPORT_TYPE_LABEL, exportStatusKey, meta } from "../phase6Meta";
import {
  HiChevronLeft, HiChevronRight, HiCloudDownload, HiCode, HiDocumentText, HiFilter, HiRefresh, HiX,
} from "react-icons/hi";

const PAGE_SIZE = 20;

const TYPE_FILTERS = [["", "All exports"], ...Object.entries(EXPORT_TYPE_LABEL)];
const FORMAT_FILTERS = [["", "Any format"], ["csv", "CSV"], ["pdf", "PDF"], ["zip", "ZIP"], ["json", "On screen (JSON)"]];
const STATUS_FILTERS = [["", "Any outcome"], ["completed", "Completed"], ["no_data", "Empty · no data"], ["started", "In progress"], ["failed", "Failed"]];

const emptyFilters = { report_type: "", format: "", status: "" };

const fmtWhen = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "N/A"
    : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const fmtBytes = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/** "2026-01 → 2026-03", a single month, or the run it belongs to. */
function windowLabel(row) {
  const from = row.period_from || row.window_start;
  const to = row.period_to || row.window_end;
  if (from && to) return from === to ? formatPeriod(from) : `${formatPeriod(from)} → ${formatPeriod(to)}`;
  if (from) return formatPeriod(from);
  if (row.run_id) return "One payroll run";
  return "N/A";
}

export default function PayrollExportsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState(emptyFilters);
  const [preview, setPreview] = useState(null);
  const { toast, showToast, hideToast } = useToast();

  // Leavers included: an export's actor may have left since.
  const { nameOf } = useEmployeeDirectory();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const res = await payrollAPI.getExports(params);
      const body = res?.data;
      const list = Array.isArray(body) ? body : body?.rows || body?.records || [];
      setRows(list);
      const meta_ = res?.pagination || body?.pagination || null;
      setTotal(meta_?.total ?? body?.count ?? null);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't load the export history"), "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters, showToast]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);
  const pages = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
  const canNext = pages != null ? page < pages : rows.length >= PAGE_SIZE;

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

  const actorOf = (row) => row.requested_by_name || nameOf(row.requested_by, "Unknown user");

  return (
    <>
      <DashboardTopBar title="Exports" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Exports</h1>
            <p className="text-sm text-slate-500 mt-1">
              Every payslip, report and bank file that left the system — who took it, what it covered and whether it finished. Click a row for the full record.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="h-[42px] px-4 text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition flex items-center gap-2 disabled:opacity-60">
            <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <form onSubmit={applyFilters} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">What was exported</label>
              <select value={draft.report_type} onChange={(e) => setDraft({ ...draft, report_type: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
                {TYPE_FILTERS.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Format</label>
              <select value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
                {FORMAT_FILTERS.map(([value, label]) => <option key={value || "any"} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Outcome</label>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
                {STATUS_FILTERS.map(([value, label]) => <option key={value || "any"} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="flex-1 h-[42px] text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition flex justify-center items-center gap-1.5 shadow-sm shadow-purple-200">
                <HiFilter className="w-4 h-4" /> Apply
              </button>
              {hasFilters && (
                <button type="button" onClick={resetFilters} title="Clear filters" className="h-[42px] px-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition">
                  <HiX className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </form>

        {loading ? <Skeleton type="table" rows={8} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[860px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">When</th>
                    <th className="px-6 py-4">What</th>
                    <th className="px-6 py-4">Covers</th>
                    <th className="px-6 py-4">Taken by</th>
                    <th className="px-6 py-4 text-right">Rows</th>
                    <th className="px-6 py-4">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row, i) => {
                    const status = meta(EXPORT_STATUS, exportStatusKey(row));
                    return (
                      <tr key={row.id || i} {...rowPreviewProps(() => setPreview(row), "View export record")}>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{fmtWhen(row.created_at || row.started_at)}</td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-800">{EXPORT_TYPE_LABEL[row.report_type] || row.report_type || "N/A"}</p>
                          <p className="text-[11px] text-slate-400 uppercase">{row.format || "N/A"}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{windowLabel(row)}</td>
                        <td className="px-6 py-4 text-slate-700 font-semibold">{actorOf(row)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-slate-600">{row.row_count ?? "N/A"}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${status.pill}`}>{status.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        {hasFilters ? "No exports match these filters." : "Nothing has been exported yet. Payslip PDFs, reports and bank files will be recorded here."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                {total != null ? `Page ${page} of ${pages} · ${total} export${total === 1 ? "" : "s"}` : `Page ${page}`}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Previous page">
                  <HiChevronLeft className="w-4 h-4" />
                </button>
                <button type="button" disabled={!canNext} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Next page">
                  <HiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {preview && (
        <DetailDialog
          eyebrow="Export record"
          icon={HiCloudDownload}
          title={EXPORT_TYPE_LABEL[preview.report_type] || preview.report_type || "Export"}
          subtitle={fmtWhen(preview.created_at || preview.started_at)}
          badge={<DetailPill tone="onDark">{meta(EXPORT_STATUS, exportStatusKey(preview)).label}</DetailPill>}
          onClose={() => setPreview(null)}
        >
          <DetailSection title="What left the system" icon={HiDocumentText}>
            <DetailGrid
              cols={3}
              items={[
                ["Type", EXPORT_TYPE_LABEL[preview.report_type] || preview.report_type],
                ["Format", preview.format ? String(preview.format).toUpperCase() : null],
                ["Scope", EXPORT_SCOPE_LABEL[preview.scope] || preview.scope],
                ["Covers", windowLabel(preview)],
                ["Rows", preview.row_count ?? null],
                ["Size", fmtBytes(preview.byte_count)],
              ]}
            />
          </DetailSection>

          <DetailSection title="Who and when" icon={HiDocumentText}>
            <DetailGrid
              cols={3}
              items={[
                ["Taken by", actorOf(preview)],
                ["Their role", preview.requested_role || null],
                ["About", preview.subject_user_id ? nameOf(preview.subject_user_id, "Unknown user") : "Everyone in scope"],
                ["Started", fmtWhen(preview.started_at || preview.created_at)],
                ["Finished", preview.completed_at ? fmtWhen(preview.completed_at) : "Didn't finish"],
                ["From address", preview.ip_address || null],
              ]}
            />
            {preview.failure_reason && (
              <div className="mt-4"><DetailText label="Why it failed">{preview.failure_reason}</DetailText></div>
            )}
          </DetailSection>

          <DetailSection title="Filters used" icon={HiCode}>
            {preview.filters && Object.keys(preview.filters).length > 0 ? (
              <pre className="bg-purple-950 text-purple-100 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[40vh]">
                {JSON.stringify(preview.filters, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">No filters were applied — this export covered everything in its scope.</p>
            )}
            <p className="text-[11px] text-slate-400 mt-3">Only ids, codes and period bounds are recorded here. Names, amounts and account numbers are never stored in an export record.</p>
          </DetailSection>
        </DetailDialog>
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

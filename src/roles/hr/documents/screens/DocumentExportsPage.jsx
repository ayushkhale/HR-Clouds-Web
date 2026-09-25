// ─────────────────────────────────────────────────────────────────────────────
// DocumentExportsPage.jsx — Every bulk download anybody has taken out of this
// organisation's documents, and who took it (#119, #120).
//
// This exists because of one rule the server enforces and nothing on screen can
// switch off: before a spreadsheet or an exit pack leaves, a row is written
// here. If that row can't be written, the download is refused. So the answer to
// "has anyone exported our staff records?" is always exactly this list —
// never "probably not".
//
// What is recorded is the shape of the request, not its contents: who asked,
// when, from which address, which filters, how many rows and how many bytes.
// The data itself was never stored, so this can be kept for as long as an
// auditor wants without holding anybody's documents a second time.
//
// Single-document downloads are not here. Those are recorded against the
// document's own history, which is the right place for them — this page is
// about data leaving in bulk.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiCheckCircle, HiClipboardList, HiClock, HiCloudDownload, HiDatabase, HiExclamationCircle,
  HiExternalLink, HiFilter, HiRefresh, HiShieldCheck, HiUserCircle, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Pagination, PersonCell } from "../../../../shared/attendance/ui";
import DetailDialog, { DetailGrid, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { fmtDate, fmtDateTime, todayYMD } from "../../../../shared/attendance/dates";
import { formatBytes } from "../../../../shared/documents/documentMeta";
import { ExportStatusBadge } from "../../../../shared/documents/phase5Ui";
import {
  EXPORT_STATUS_ORDER, EXPORT_TYPE_FILTERS, describeExportFilters, exportDuration,
  exportListOf, exportStatusMeta, exportTypeMeta,
} from "../../../../shared/documents/reportMeta";
import { DocEmptyState, DocErrorState, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;

function Tile({ label, value, sub, icon: Icon, tone = "text-purple-500", alert = false, onClick, active }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-2xl border px-4 py-3.5 transition ${active ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100" : alert ? "bg-rose-50/40 border-rose-200 hover:border-rose-300" : "bg-white border-slate-100 hover:border-purple-200 shadow-xs"}`}
    >
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums ${alert ? "text-rose-700" : "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1 truncate">{sub}</p>}
    </button>
  );
}

/** One export, in full: who took what, with which filters, and how it ended. */
function ExportDetailDialog({ row, nameOf, onClose }) {
  const [full, setFull] = useState(row);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    documentsAPI.getDocumentExport(row.id)
      .then((res) => { if (alive) setFull((current) => ({ ...current, ...(res?.data ?? res ?? {}) })); })
      // The list row already carries everything that matters; a failed detail
      // read just means no extra fields, not an error worth interrupting for.
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [row.id]);

  const type = exportTypeMeta(full.export_type);
  const meta = exportStatusMeta(full.status);
  const applied = describeExportFilters(full.filters);
  const rows = Number(full.row_count);
  const duration = exportDuration(full);

  return (
    <DetailDialog
      title={type.label}
      subtitle={`Taken by ${full.requester_identifier || nameOf(full.requested_by, "a colleague")}`}
      eyebrow="Bulk download"
      icon={HiCloudDownload}
      badge={<ExportStatusBadge status={full.status} />}
      loading={loading}
      onClose={onClose}
    >
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${full.status === "failed" ? "border-rose-200 bg-rose-50" : full.status === "completed" ? "border-violet-200 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
        <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 text-purple-600">
          {full.status === "failed" ? <HiExclamationCircle className="w-5 h-5 text-rose-600" /> : full.status === "completed" ? <HiCheckCircle className="w-5 h-5 text-violet-600" /> : <HiClock className="w-5 h-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{meta.label}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            {full.status === "completed"
              ? `${Number.isFinite(rows) ? `${rows.toLocaleString("en-IN")} ${rows === 1 ? "row" : "rows"}` : "The file"} left the server${duration ? ` in ${duration}` : ""}${full.byte_count ? `, ${formatBytes(full.byte_count)} in all` : ""}. What happened to the file after that is outside this system.`
              : full.status === "failed"
                ? "The download did not complete, so nothing reached the person who asked for it."
                : "The download was opened and hasn't been recorded as finished. That usually means it was cancelled part-way, or the connection dropped."}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">{type.blurb}</p>

      <DetailSection title="Who and when" icon={HiUserCircle} collapsible={false}>
        <DetailGrid
          cols={3}
          items={[
            { label: "Taken by", value: full.requester_identifier || nameOf(full.requested_by, "A colleague") },
            { label: "Started", value: fmtDateTime(full.started_at) },
            { label: "Finished", value: full.completed_at ? fmtDateTime(full.completed_at) : "Not recorded" },
            { label: "Format", value: String(full.format || "").toUpperCase() || "N/A" },
            { label: "Covers", value: full.scope === "self" ? "One person" : "The organisation" },
            { label: "From address", value: full.ip_address || "Not recorded" },
          ]}
        />
      </DetailSection>

      <DetailSection title="What was taken" icon={HiDatabase} collapsible={false}>
        <DetailGrid
          cols={3}
          items={[
            { label: "Rows", value: Number.isFinite(rows) ? rows.toLocaleString("en-IN") : "Not recorded" },
            { label: "Size", value: full.byte_count ? formatBytes(full.byte_count) : "Not recorded" },
            { label: "About", value: full.subject_user_id ? nameOf(full.subject_user_id, "an employee") : "Everyone in scope" },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          Only the shape of the download is kept — never its contents. Nobody’s documents are stored a second time by this record.
        </p>
      </DetailSection>

      {applied.length > 0 && (
        <DetailSection title="Filters used" icon={HiFilter}>
          <DetailGrid cols={2} items={applied.map((f) => ({ label: f.label, value: f.value }))} />
          <p className="text-[11px] text-slate-400 mt-3">These are the exact filters that produced the file, so the same set can be reproduced if it is ever queried.</p>
        </DetailSection>
      )}

      {full.failure_reason && (
        <DetailSection title="Why it failed" icon={HiExclamationCircle}>
          <DetailText>{full.failure_reason}</DetailText>
        </DetailSection>
      )}
    </DetailDialog>
  );
}

export default function DocumentExportsPage() {
  const { nameOf } = useEmployeeDirectory();

  const [filters, setFilters] = useState({ export_type: "", status: "", format: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, totalPages: 1, loading: true, error: null });
  const [tallies, setTallies] = useState({ completed: null, failed: null });
  const [detail, setDetail] = useState(null);

  const query = useMemo(() => ({
    export_type: filters.export_type || undefined,
    status: filters.status || undefined,
    format: filters.format || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [filters]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // This list pages with `page`, not offset — unlike the rest of Phase 5.
      const res = await documentsAPI.getDocumentExports({ ...query, page, limit: PAGE });
      if (token !== reqRef.current) return;
      setState({ ...exportListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, totalPages: 1, loading: false, error });
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const scope = { from: filters.from || undefined, to: filters.to || undefined };
    const results = await Promise.allSettled(
      ["completed", "failed"].map((status) => documentsAPI.getDocumentExports({ ...scope, status, limit: 1, page: 1 })),
    );
    if (token !== tallyRef.current) return;
    setTallies({
      completed: results[0].status === "fulfilled" ? exportListOf(results[0].value).total : null,
      failed: results[1].status === "fulfilled" ? exportListOf(results[1].value).total : null,
    });
  }, [filters.from, filters.to]);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);
  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const filtered = Object.values(filters).some(Boolean);
  const today = todayYMD();

  return (
    <>
      <DashboardTopBar title="Export Log" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Export Log</h1>
            <p className="text-sm text-slate-500 mt-1">
              Every spreadsheet and leaver’s pack taken out of your documents, and who took it. The record is written before the file is sent — if it can’t be written, the download doesn’t happen.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <Link to="/dashboard/hr/documents/search" className={SECONDARY_BTN}>
              <HiClipboardList className="w-4 h-4" /> Find a Document
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label="Downloads taken" value={tallies.completed ?? "…"} sub="Files that reached somebody"
            icon={HiCheckCircle} tone="text-violet-500"
            onClick={() => update({ status: filters.status === "completed" ? "" : "completed" })} active={filters.status === "completed"}
          />
          <Tile
            label="Didn't complete" value={tallies.failed ?? "…"} sub={tallies.failed ? "No file was delivered" : "None"}
            icon={HiExclamationCircle} tone="text-rose-500" alert={!!tallies.failed}
            onClick={() => update({ status: filters.status === "failed" ? "" : "failed" })} active={filters.status === "failed"}
          />
          <div className="col-span-2 rounded-2xl border border-slate-100 bg-white shadow-xs px-4 py-3.5 flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiShieldCheck className="w-5 h-5" /></span>
            <p className="text-xs text-slate-500 leading-relaxed">
              This covers <strong>bulk</strong> downloads only — search spreadsheets, compliance reports and leavers’ packs. When one person opens one document, that is recorded in the document’s own history instead.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <select aria-label="Kind of export" value={filters.export_type} onChange={(e) => update({ export_type: e.target.value })} className={SELECT}>
            {EXPORT_TYPE_FILTERS.map((f) => <option key={f.value || "all"} value={f.value}>{f.label}</option>)}
          </select>
          <select aria-label="Outcome" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={SELECT}>
            <option value="">Any outcome</option>
            {EXPORT_STATUS_ORDER.map((key) => <option key={key} value={key}>{exportStatusMeta(key).label}</option>)}
          </select>
          <select aria-label="File format" value={filters.format} onChange={(e) => update({ format: e.target.value })} className={SELECT}>
            <option value="">Any format</option>
            <option value="csv">Spreadsheet (CSV)</option>
            <option value="json">On-screen pack (JSON)</option>
          </select>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            From
            <input type="date" value={filters.from} max={filters.to || today} onChange={(e) => update({ from: e.target.value })} className={SELECT} aria-label="From date" />
          </label>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            To
            <input type="date" value={filters.to} min={filters.from || undefined} max={today} onChange={(e) => update({ to: e.target.value })} className={SELECT} aria-label="To date" />
          </label>
          {filtered && (
            <button type="button" onClick={() => update({ export_type: "", status: "", format: "", from: "", to: "" })} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
              <HiX className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the export log." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={HiCloudDownload}
              title={filtered ? "Nothing matches" : "No bulk downloads yet"}
              message={filtered
                ? "Try another kind, outcome or date range."
                : "Nobody has exported a spreadsheet or generated a leaver's pack. When they do, it appears here with their name against it."}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[860px]">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">What was taken</th>
                      <th className="px-5 py-3.5">By</th>
                      <th className="px-5 py-3.5">Outcome</th>
                      <th className="px-5 py-3.5 text-right">Rows</th>
                      <th className="px-5 py-3.5 text-right">Size</th>
                      <th className="px-5 py-3.5">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {state.rows.map((row) => {
                      const type = exportTypeMeta(row.export_type);
                      const rowCount = Number(row.row_count);
                      return (
                        <tr
                          key={row.id}
                          {...rowPreviewProps(() => setDetail(row), `Open the ${type.label} record`)}
                          className={`cursor-pointer outline-none transition-colors ${row.status === "failed" ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-purple-50/30 focus:bg-purple-50/40"}`}
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800 truncate max-w-[260px]">{type.label}</p>
                            <p className="text-[11px] text-slate-400">{String(row.format || "").toUpperCase()}{row.scope === "self" ? " · one person" : ""}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            {row.requested_by
                              ? <PersonCell entity={{ name: nameOf(row.requested_by, "A colleague"), email: row.requester_identifier }} secondary={row.requester_identifier || undefined} />
                              : <span className="text-xs text-slate-500">{row.requester_identifier || "N/A"}</span>}
                          </td>
                          <td className="px-5 py-3.5"><ExportStatusBadge status={row.status} /></td>
                          <td className="px-5 py-3.5 text-right text-xs font-bold text-slate-600 tabular-nums">{Number.isFinite(rowCount) ? rowCount.toLocaleString("en-IN") : "—"}</td>
                          <td className="px-5 py-3.5 text-right text-xs text-slate-600 tabular-nums">{row.byte_count ? formatBytes(row.byte_count) : "—"}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(row.started_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.total > PAGE && (
                <div className="px-5 py-4 border-t border-slate-100">
                  <Pagination page={page} totalPages={state.totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="download" />
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          Nothing here can be edited or removed — that is what makes it worth having. If a download shouldn’t have happened, the record of it stays, and the conversation is with the person who took it.{" "}
          <Link to="/dashboard/hr/documents/settings" className="font-bold text-purple-600 hover:underline">Document Settings <HiExternalLink className="inline w-3 h-3" /></Link>
        </p>
      </main>

      {detail && <ExportDetailDialog row={detail} nameOf={nameOf} onClose={() => setDetail(null)} />}
    </>
  );
}

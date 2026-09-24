// ─────────────────────────────────────────────────────────────────────────────
// DocumentCompliancePage.jsx — HR's view of who has acknowledged and signed
// what, across every live document that asks for it (#76), with the audit
// download (#77).
//
// One row per document. Clicking a row opens the document itself, whose
// "Who got it" section is the per-person roster (#59) — and from there one
// person's permanent proof (#78) and the Excuse action (#61).
//
// Everything "overdue" is judged by the server on one IST date per request
// (`as_of`) and shown as-is. Filters: kind of document, department, overdue
// only. The download uses the same filters, minus paging.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiBadgeCheck, HiCheckCircle, HiClipboardCheck, HiDownload, HiExclamationCircle, HiRefresh,
  HiUserGroup, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Pagination, Toast, useToast } from "../../../../shared/attendance/ui";
import { fmtDate } from "../../../../shared/attendance/dates";
import { useTargetingOptions } from "../../../../shared/attendance/useTargetingOptions";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import OrgDocumentDetailDialog from "../../../../shared/documents/OrgDocumentDetailDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { ORG_PLANES } from "../../../../shared/documents/orgDocumentPlanes";
import { documentTypeName } from "../../../../shared/documents/orgDocumentMeta";
import { complianceListOf, percentLabel, sumCompliance } from "../../../../shared/documents/complianceMeta";
import { CompletionBar, RateMeter } from "../../../../shared/documents/orgUi";
import { DocEmptyState, DocErrorState, SECONDARY_BTN, SELECT, Switch } from "../../../../shared/documents/ui";
import { documentErrorMessage, exportTooLargeDetail } from "../../../../shared/utils/documentErrors";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;
// The summary tiles read up to this many documents in one go (the API's cap).
const SUMMARY_LIMIT = 100;
const plane = ORG_PLANES.hr;

function Tile({ label, value, sub, icon: Icon, tone = "text-purple-500", alert = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${alert ? "bg-rose-50/40 border-rose-200" : "bg-white border-slate-100 shadow-xs"}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums ${alert ? "text-rose-700" : "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1 truncate">{sub}</p>}
    </div>
  );
}

const Num = ({ value, alert = false }) => (
  <span className={`tabular-nums text-xs font-bold ${alert && Number(value) > 0 ? "text-rose-600" : Number(value) > 0 ? "text-slate-800" : "text-slate-400"}`}>{Number(value) || 0}</span>
);

export default function DocumentCompliancePage() {
  const { types, index } = useDocumentTypes("hrOrg");
  const targeting = useTargetingOptions();
  const { rows: people, nameOf } = useEmployeeDirectory();
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ type_id: "", department_id: "", overdue_only: false });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, asOf: null, loading: true, error: null });
  const [summary, setSummary] = useState({ totals: null, documents: null, partial: false, loading: true });
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null);

  // Only what the server accepts; empty values are dropped by the query builder.
  const query = useMemo(() => ({
    type_id: filters.type_id || undefined,
    department_id: filters.department_id || undefined,
    overdue_only: filters.overdue_only ? true : undefined,
  }), [filters]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getOrgCompliance({ ...query, limit: PAGE, offset: (page - 1) * PAGE });
      if (token !== reqRef.current) return;
      setState({ ...complianceListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, asOf: null, loading: false, error });
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  // Headline numbers across every matching document, not just this page.
  const sumRef = useRef(0);
  const loadSummary = useCallback(async () => {
    const token = ++sumRef.current;
    setSummary((s) => ({ ...s, loading: true }));
    try {
      const { rows, total } = complianceListOf(await documentsAPI.getOrgCompliance({ ...query, limit: SUMMARY_LIMIT }));
      if (token !== sumRef.current) return;
      setSummary({ totals: sumCompliance(rows), documents: total, partial: total > rows.length, loading: false });
    } catch {
      if (token === sumRef.current) setSummary({ totals: null, documents: null, partial: false, loading: false });
    }
  }, [query]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const refresh = useCallback(() => { load(); loadSummary(); }, [load, loadSummary]);
  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const filtered = !!(filters.type_id || filters.department_id || filters.overdue_only);

  const download = async () => {
    setExporting(true);
    try {
      const { filename } = await documentsAPI.exportOrgCompliance(query);
      showToast(`Downloaded ${filename}`);
    } catch (err) {
      const big = exportTooLargeDetail(err);
      showToast(
        big
          ? `This download would have ${big.rows?.toLocaleString("en-IN") ?? "too many"} rows — the most is ${big.max?.toLocaleString("en-IN") ?? "50,000"}. Pick a kind of document or a department and try again.`
          : documentErrorMessage(err, "Couldn't prepare the download."),
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  // What the detail dialog needs to name departments, locations and people.
  const rowsById = useMemo(() => new Map(people.map((p) => [p.user_id ?? p.id, p])), [people]);
  const resolveTarget = useCallback((dimension, id) => {
    if (dimension.kind === "department") return targeting.departmentOptions.find((o) => o.value === id)?.label || null;
    if (dimension.kind === "location") return targeting.locationOptions.find((o) => o.value === id)?.label || null;
    if (dimension.kind === "person") return rowsById.get(id)?.name || nameOf(id, null);
    return id;
  }, [targeting.departmentOptions, targeting.locationOptions, rowsById, nameOf]);

  /** A compliance row opens the document itself; the detail read fills in the rest. */
  const open = (row) => setDetail({
    id: row.document_id,
    title: row.title,
    version: row.version,
    status: "published",
    document_type_id: row.document_type_id,
    requires_acknowledgement: row.requires_acknowledgement,
    requires_signature: row.requires_signature,
    published_at: row.published_at,
    recipient_count: row.total,
  });

  const totals = summary.totals;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const orgTypes = types.filter((t) => (t.plane || "org") === "org");

  return (
    <>
      <DashboardTopBar title="Document Compliance" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Document Compliance</h1>
            <p className="text-sm text-slate-500 mt-1">
              Who has acknowledged or signed each live document, who is still to do it, and who is late.
              {state.asOf && <span className="text-slate-400"> Late is counted as of {fmtDate(state.asOf)}.</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={download}
              disabled={exporting || (!state.loading && state.total === 0)}
              title="One row per person, with dates and versions — ready for an audit"
              className={SECONDARY_BTN}
            >
              <HiDownload className={`w-4 h-4 ${exporting ? "animate-bounce" : ""}`} /> {exporting ? "Preparing…" : "Download report (CSV)"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label="Documents tracked"
            value={summary.documents === null ? "…" : summary.documents}
            sub="Live, and asking for acknowledgement or a signature"
            icon={HiClipboardCheck}
          />
          <Tile
            label="Done"
            value={totals ? percentLabel(totals.completion_rate) : "…"}
            sub={totals ? `${totals.completed.toLocaleString("en-IN")} of ${totals.total.toLocaleString("en-IN")} people` : ""}
            icon={HiCheckCircle}
            tone="text-violet-500"
          />
          <Tile
            label="Still to do"
            value={totals ? totals.pending.toLocaleString("en-IN") : "…"}
            sub="Not late yet"
            icon={HiBadgeCheck}
            tone="text-indigo-500"
          />
          <Tile
            label="Overdue"
            value={totals ? totals.overdue.toLocaleString("en-IN") : "…"}
            sub={totals?.waived ? `${totals.waived.toLocaleString("en-IN")} excused` : "Past their deadline"}
            icon={HiExclamationCircle}
            tone="text-rose-500"
            alert={!!totals?.overdue}
          />
        </div>

        {totals && totals.total > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4">
            <CompletionBar counts={totals} />
            {summary.partial && (
              <p className="text-[11px] text-slate-400 mt-2">These totals cover the {SUMMARY_LIMIT} most recent documents. Filter to see the rest.</p>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <select aria-label="Kind of document" value={filters.type_id} onChange={(e) => update({ type_id: e.target.value })} className={SELECT}>
            <option value="">Any kind of document</option>
            {orgTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active === false ? " (switched off)" : ""}</option>)}
          </select>
          <select aria-label="Department" value={filters.department_id} onChange={(e) => update({ department_id: e.target.value })} className={SELECT}>
            <option value="">Every department</option>
            {targeting.departmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="inline-flex items-center gap-2.5 h-10 px-3 rounded-xl border border-slate-200 bg-white cursor-pointer">
            <Switch checked={filters.overdue_only} onChange={(v) => update({ overdue_only: v })} label="Only documents with someone overdue" />
            <span className="text-sm font-medium text-slate-700">Only with someone overdue</span>
          </label>
          {filtered && (
            <button type="button" onClick={() => update({ type_id: "", department_id: "", overdue_only: false })} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
              <HiX className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load document compliance." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={filters.overdue_only ? HiCheckCircle : HiClipboardCheck}
              title={filters.overdue_only ? "Nobody is overdue" : filtered ? "Nothing matches" : "Nothing to track yet"}
              message={filters.overdue_only
                ? "Everyone is on time with what they've been asked to acknowledge or sign."
                : filtered
                  ? "Try a different kind of document or department."
                  : "Documents appear here once they're published and ask people to acknowledge or sign them. Turn that on when you write one in Organisation Documents."}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[920px]">
                  <thead className="bg-slate-50/80 text-[11px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Document</th>
                      <th className="px-3 py-3">Asks for</th>
                      <th className="px-3 py-3">Published</th>
                      <th className="px-3 py-3">Progress</th>
                      <th className="px-3 py-3 text-right">People</th>
                      <th className="px-3 py-3 text-right">Done</th>
                      <th className="px-3 py-3 text-right">Still to do</th>
                      <th className="px-3 py-3 text-right">Overdue</th>
                      <th className="px-5 py-3 text-right">Excused</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.rows.map((row) => {
                      const typeName = row.type?.name || documentTypeName(row, index);
                      return (
                        <tr
                          key={row.document_id}
                          className="cursor-pointer hover:bg-purple-50/30 outline-none focus-visible:bg-purple-50"
                          {...rowPreviewProps(() => open(row), `Open ${row.title}`)}
                        >
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-800 truncate max-w-[280px]">{row.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{[typeName, `Version ${row.version || 1}`].filter(Boolean).join(" · ")}</p>
                          </td>
                          <td className="px-3 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
                            {row.requires_signature ? "Signature" : "Acknowledgement"}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDate(row.published_at)}</td>
                          <td className="px-3 py-3"><RateMeter rate={row.completion_rate} /></td>
                          <td className="px-3 py-3 text-right"><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 tabular-nums"><HiUserGroup className="w-3.5 h-3.5 text-slate-400" />{Number(row.total) || 0}</span></td>
                          <td className="px-3 py-3 text-right"><Num value={row.completed} /></td>
                          <td className="px-3 py-3 text-right"><Num value={row.pending} /></td>
                          <td className="px-3 py-3 text-right"><Num value={row.overdue} alert /></td>
                          <td className="px-5 py-3 text-right"><Num value={row.waived} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.total > PAGE && (
                <div className="px-5 py-3 border-t border-slate-100">
                  <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="document" />
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          Click a document to see everyone it went to, open one person’s proof, or excuse someone. Acknowledgements and signatures are permanent — nobody can change or delete them.
        </p>
      </main>

      {detail && (
        <OrgDocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          resolveTarget={resolveTarget}
          nameOf={nameOf}
          people={people}
          showToast={showToast}
          onChanged={refresh}
          onClose={() => setDetail(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

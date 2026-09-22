// ─────────────────────────────────────────────────────────────────────────────
// DocumentVerificationPage.jsx — HR's Verification Queue (#14): every
// `pending_verification` document in the organisation, oldest first, with the
// manager's Tier-B recommendation alongside. Opening a row previews the file
// and offers Verify (#18) / Reject (#19); the Tier-C decision is final.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiBadgeCheck, HiClipboardCheck, HiRefresh, HiThumbDown, HiThumbUp } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import DocumentTable from "../../../../shared/documents/DocumentTable";
import DocumentDetailDialog from "../../../../shared/documents/DocumentDetailDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { DOCUMENT_PLANES } from "../../../../shared/documents/documentPlanes";
import { listPayload } from "../../../../shared/documents/documentMeta";
import { DocEmptyState, DocErrorState, SELECT } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;
const plane = DOCUMENT_PLANES.hr;

export default function DocumentVerificationPage() {
  const { types, index } = useDocumentTypes("hr");
  const { rows: people, status: dirStatus, nameOf } = useEmployeeDirectory();
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ type_id: "", user_id: "" });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [detail, setDetail] = useState(null);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getVerificationQueue({
        type_id: filters.type_id || undefined,
        user_ids: filters.user_id ? [filters.user_id] : undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      if (id !== reqRef.current) return;
      setState({ ...listPayload(res), loading: false, error: null });
    } catch (error) {
      if (id === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  // A filter change resets the page in the same update — one request, not two.
  const updateFilters = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  // Roster rows carry the avatar, name and code PersonCell needs.
  const rowsById = useMemo(() => new Map(people.map((p) => [p.user_id ?? p.id, p])), [people]);
  const personOf = useCallback((id) => rowsById.get(id) || { name: nameOf(id, "Employee") }, [rowsById, nameOf]);
  const recCounts = useMemo(() => ({
    verify: state.rows.filter((r) => r.recommendation === "verify").length,
    reject: state.rows.filter((r) => r.recommendation === "reject").length,
  }), [state.rows]);
  const filtered = !!(filters.type_id || filters.user_id);

  return (
    <>
      <DashboardTopBar title="Verification Queue" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Verification Queue</h1>
            <p className="text-sm text-slate-500 mt-1">Documents waiting for your final decision, oldest first. Managers’ recommendations are shown where they’ve given one.</p>
          </div>
          <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50 self-start sm:self-auto" aria-label="Refresh" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: filtered ? "Waiting (filtered)" : "Waiting for a decision", value: state.total, icon: HiClipboardCheck, tone: "text-purple-500" },
            { label: "Manager says verify (this page)", value: recCounts.verify, icon: HiThumbUp, tone: "text-violet-500" },
            { label: "Manager says reject (this page)", value: recCounts.reject, icon: HiThumbDown, tone: "text-rose-500" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl bg-white border border-slate-100 shadow-xs px-4 py-3.5">
              <div className="flex items-center gap-2 text-slate-400"><Icon className={`w-4 h-4 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span></div>
              <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none mt-2 tabular-nums">{state.loading && !state.rows.length ? "…" : value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="md:w-80">
            <PersonSelect people={people} value={filters.user_id} onChange={(id) => updateFilters({ user_id: id })} placeholder="Any employee" clearLabel="Any employee" loading={dirStatus === "loading"} />
          </div>
          <select aria-label="Document type" value={filters.type_id} onChange={(e) => updateFilters({ type_id: e.target.value })} className={SELECT}>
            <option value="">Any document type</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active === false ? " (switched off)" : ""}</option>)}
          </select>
          {filtered && <button type="button" onClick={() => updateFilters({ type_id: "", user_id: "" })} className="text-xs font-bold text-purple-600 hover:underline px-2">Clear</button>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the verification queue." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState icon={HiBadgeCheck} title={filtered ? "Nothing waiting for this filter" : "All caught up"} message={filtered ? "Clear the filters to see the whole queue." : "No document is waiting for verification. New uploads that need review will appear here."} />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <DocumentTable
                rows={state.rows}
                types={index}
                onOpen={setDetail}
                personOf={personOf}
                showRecommendation
                pagination={{ page, total: state.total, limit: PAGE, onPageChange: setPage }}
              />
            </div>
          )}
        </div>
      </main>

      {detail && (
        <DocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={load}
          onClose={() => setDetail(null)}
        />
      )}
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

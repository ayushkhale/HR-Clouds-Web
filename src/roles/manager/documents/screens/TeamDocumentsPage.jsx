// ─────────────────────────────────────────────────────────────────────────────
// TeamDocumentsPage.jsx — The manager's view of their direct reports'
// documents (API #25–#33). Three tabs:
//   To review            — pending_verification team documents: open, check,
//                          and recommend verify / reject (Tier B, #33)
//   My recommendations   — ones I've recommended that HR hasn't decided yet (#28)
//   All team documents   — everything I'm allowed to see (#26)
//
// Scope is enforced by the server: only direct reports, never confidential
// documents, and nothing at all when the org turns manager visibility off.
// Managers can upload for a report in types that allow it (#31/#32); they
// never delete, replace or make the final decision (unless the org gives
// managers direct authority, in which case a recommendation decides).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiClipboardCheck, HiCollection, HiRefresh, HiUpload, HiUserGroup } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { useOrgEmployees } from "../../../../shared/attendance/EmployeePicker";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import DocumentTable from "../../../../shared/documents/DocumentTable";
import DocumentDetailDialog from "../../../../shared/documents/DocumentDetailDialog";
import DocumentUploadDialog from "../../../../shared/documents/DocumentUploadDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { DOCUMENT_PLANES } from "../../../../shared/documents/documentPlanes";
import { listPayload } from "../../../../shared/documents/documentMeta";
import { DocEmptyState, DocErrorState, LABEL, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";

const PAGE = 25;
const plane = DOCUMENT_PLANES.manager;

const TABS = [
  { key: "review", label: "Needs my review" },
  { key: "mine", label: "My recommendations" },
  { key: "all", label: "All team documents" },
];

/** Pick a report, then the shared upload form (types limited to manager_can_request). */
function UploadForReport({ team, types, onDone, onClose }) {
  const [userId, setUserId] = useState("");
  const person = team.find((p) => p.id === userId);
  if (!userId) {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-label="Choose a team member" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Upload for a team member</h2>
            <p className="text-xs text-slate-500 mt-0.5">Only document types that let managers upload are offered.</p>
          </div>
          <div>
            <span className={LABEL}>Team member</span>
            <PersonSelect people={team} value={userId} onChange={setUserId} placeholder="Choose a report" emptyText="No reports found." />
          </div>
          <div className="flex justify-end"><button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button></div>
        </div>
      </div>
    );
  }
  return (
    <DocumentUploadDialog
      types={types}
      subjectName={person?.name || "your report"}
      issue={(payload) => plane.issue(userId, payload)}
      confirm={plane.confirm}
      onDraftLeft={onDone}
      onDone={(doc) => onDone(doc, true)}
      onClose={onClose}
    />
  );
}

export default function TeamDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "review";
  const setTab = (key) => { setParams(key === "review" ? {} : { tab: key }, { replace: true }); setPage(1); };

  const { types, uploadTypes, index, error: typesError } = useDocumentTypes("manager");
  const team = useOrgEmployees("shift_assignment");
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ user_id: "", type_id: "", status: "" });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [reviewCount, setReviewCount] = useState(null);
  const [mineCount, setMineCount] = useState(null);
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(false);

  const nameOf = useCallback((id, fallback) => team.options.find((o) => o.id === id)?.name || fallback || (team.loading ? "Loading…" : "Team member"), [team.options, team.loading]);
  const rowsById = useMemo(() => new Map(team.options.map((o) => [o.id, o.raw || o])), [team.options]);
  const personOf = useCallback((id) => rowsById.get(id) || { name: nameOf(id) }, [rowsById, nameOf]);

  // Only the newest request may write the table (tabs and filters change fast).
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let res;
      if (tab === "mine") {
        res = await documentsAPI.getMyRecommendations();
      } else {
        res = await documentsAPI.getTeamDocuments({
          user_id: filters.user_id || undefined,
          type_id: filters.type_id || undefined,
          status: tab === "review" ? "pending_verification" : filters.status || undefined,
          limit: PAGE,
          offset: (page - 1) * PAGE,
        });
      }
      if (id !== reqRef.current) return;
      const payload = listPayload(res);
      setState({ ...payload, loading: false, error: null });
      if (tab === "review" && !filters.user_id && !filters.type_id) setReviewCount(payload.total);
      if (tab === "mine") setMineCount(payload.total);
    } catch (error) {
      if (id === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [tab, filters, page]);

  useEffect(() => { load(); }, [load]);

  // Filter changes reset the page in the same update — one request, not two.
  const updateFilters = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  // Tab badges: both counts are cheap single-row reads.
  const loadCounts = useCallback(() => {
    documentsAPI.getTeamDocuments({ status: "pending_verification", limit: 1 }).then((r) => setReviewCount(listPayload(r).total)).catch(() => {});
    documentsAPI.getMyRecommendations().then((r) => setMineCount(listPayload(r).total)).catch(() => {});
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const refresh = () => { load(); loadCounts(); };
  const badge = { review: reviewCount, mine: mineCount };
  const filtered = !!(filters.user_id || filters.type_id || (tab === "all" && filters.status));

  return (
    <>
      <DashboardTopBar title="Team Documents" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Team Documents</h1>
            <p className="text-sm text-slate-500 mt-1">Check your team’s documents and recommend a decision to HR. Confidential documents are only visible to HR.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => setUploading(true)} disabled={uploadTypes.length === 0} title={uploadTypes.length === 0 ? "No document type lets managers upload yet." : undefined} className={PRIMARY_BTN}>
              <HiUpload className="w-4 h-4" /> Upload for a report
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="Team documents">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === t.key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label}
                {badge[t.key] > 0 && <span className={`min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.key === "review" ? "bg-rose-500 text-white" : "bg-purple-100 text-purple-700"}`}>{badge[t.key]}</span>}
              </button>
            ))}
          </div>

          {tab !== "mine" && (
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="md:w-64">
                <PersonSelect people={team.options} value={filters.user_id} onChange={(id) => updateFilters({ user_id: id })} placeholder="Whole team" clearLabel="Whole team" loading={team.loading} />
              </div>
              <select aria-label="Document type" value={filters.type_id} onChange={(e) => updateFilters({ type_id: e.target.value })} className={SELECT}>
                <option value="">Any type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {tab === "all" && (
                <select aria-label="Status" value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })} className={SELECT}>
                  <option value="">Any status</option>
                  <option value="available">Verified</option>
                  <option value="pending_verification">In review</option>
                  <option value="expired">Expired</option>
                </select>
              )}
              {filtered && <button type="button" onClick={() => updateFilters({ user_id: "", type_id: "", status: "" })} className="text-xs font-bold text-purple-600 hover:underline px-2">Clear</button>}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your team's documents." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            tab === "review" ? (
              <DocEmptyState icon={HiClipboardCheck} title={filtered ? "Nothing to review for this filter" : "All caught up"} message={filtered ? "Clear the filters to see the whole team." : "No team document is waiting for review right now."} />
            ) : tab === "mine" ? (
              <DocEmptyState icon={HiCollection} title="No open recommendations" message="Recommendations you send appear here until HR decides them." />
            ) : (
              <DocEmptyState
                icon={HiUserGroup}
                title={filtered ? "Nothing matches" : "No team documents to show"}
                message={filtered ? "Try another filter." : typesError ? "" : types.length === 0
                  ? "Your organisation hasn't allowed managers to see any document type, or manager visibility is switched off."
                  : "Your team hasn't uploaded anything you can see yet."}
              />
            )
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <DocumentTable
                rows={state.rows}
                types={index}
                onOpen={setDetail}
                personOf={personOf}
                showRecommendation={tab !== "all" || filters.status === "pending_verification"}
                pagination={tab === "mine" ? undefined : { page, total: state.total, limit: PAGE, onPageChange: setPage }}
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
          onChanged={refresh}
          onClose={() => setDetail(null)}
        />
      )}

      {uploading && (
        <UploadForReport
          team={team.options}
          types={uploadTypes}
          onDone={(doc, finished) => {
            if (finished) {
              setUploading(false);
              showToast(doc?.status === "pending_verification" ? "Uploaded — it's waiting for HR" : "Uploaded");
            }
            refresh();
          }}
          onClose={() => setUploading(false)}
        />
      )}
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

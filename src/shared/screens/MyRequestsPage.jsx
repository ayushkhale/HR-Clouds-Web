// ─────────────────────────────────────────────────────────────────────────────
// MyRequestsPage.jsx — "What's asked of me": the documents HR or my manager
// have asked me for (#97), and the full list of what my job requires me to
// have on file (#98). Mounted in every workspace, because everyone is asked
// for documents.
//
// This is the third self-service documents screen, and the three divide cleanly:
//   My Documents      — the file I keep about myself
//   Company Documents — what the company has handed me, and asks me to sign
//   What's asked of me — what is still missing, and by when          ← this one
//
// The whole screen answers one question: what do I have to do, and how urgent
// is it? So it opens on the checklist rather than the request list — a missing
// document matters whether or not anybody has formally asked for it yet — and
// every item that needs something has an Upload button right there.
//
// Nothing here closes a request. Uploading the document does, on the server,
// inside the upload's own transaction; the reply says which request it closed
// and the toast repeats it back. There is deliberately no "mark as done".
//
// The self projection withholds how many times I've been reminded and when. It
// is not hidden by this screen — the server never sends it — and that is right:
// chasing cadence is the organisation's business, not a number to worry at.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiCheckCircle, HiClipboardCheck, HiClipboardList, HiClock, HiExclamationCircle, HiExternalLink,
  HiFolderOpen, HiRefresh, HiUpload,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { Toast, useToast } from "../attendance/ui";
import { useMyDocumentPaths } from "../attendance/paths";
import { useAuth } from "../contexts/AuthContext";
import ChecklistPanel from "../documents/ChecklistPanel";
import RequestsTable from "../documents/RequestsTable";
import DocumentRequestDetailDialog from "../documents/DocumentRequestDetailDialog";
import DocumentDetailDialog from "../documents/DocumentDetailDialog";
import DocumentUploadDialog from "../documents/DocumentUploadDialog";
import useDocumentTypes from "../documents/useDocumentTypes";
import { DOCUMENT_PLANES } from "../documents/documentPlanes";
import { REQUEST_PLANES } from "../documents/requestPlanes";
import { OUTSTANDING, OVERDUE_ONLY, REQUEST_FILTERS, requestFilterQuery, requestListOf } from "../documents/requestMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../documents/ui";

const PAGE = 20;
const plane = REQUEST_PLANES.self;
const docPlane = DOCUMENT_PLANES.self;

const TABS = [
  { key: "checklist", label: "What I need on file", icon: HiClipboardCheck },
  { key: "requests", label: "Asked of me", icon: HiClipboardList },
];

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

export default function MyRequestsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "checklist";
  const { user } = useAuth();
  // Each workspace mounts this page under its own prefix, so the link back to
  // "My Documents" is resolved from the path rather than hard-coded.
  const myPaths = useMyDocumentPaths();
  const { types, index } = useDocumentTypes("self");
  const { toast, showToast, clearToast } = useToast();

  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState(null);
  const [docDetail, setDocDetail] = useState(null);
  const [uploading, setUploading] = useState(null); // { presetTypeId }

  const setTab = (key) => { setParams(key === "checklist" ? {} : { tab: key }, { replace: true }); setPage(1); };

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.list({ ...requestFilterQuery(status), page, limit: PAGE });
      if (token !== reqRef.current) return;
      setState({ ...requestListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  // Three `limit: 1` reads for the headline numbers, because the list's own
  // `total` only ever describes the filter that fetched it.
  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const wanted = [OVERDUE_ONLY, OUTSTANDING, "fulfilled"];
    const results = await Promise.allSettled(wanted.map((f) => plane.list({ ...requestFilterQuery(f), limit: 1 })));
    if (token !== tallyRef.current) return;
    setTallies(Object.fromEntries(wanted.map((f, i) => [
      f, results[i].status === "fulfilled" ? requestListOf(results[i].value).total : null,
    ])));
  }, []);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  /** An upload changes the checklist, the request list and the tallies alike. */
  const refreshAll = useCallback(() => {
    load();
    loadTallies();
    setRefreshKey((k) => k + 1);
  }, [load, loadTallies]);

  const changeStatus = (next) => { setStatus(next); setPage(1); };

  const myName = useMemo(() => user?.name || user?.full_name || "you", [user]);
  const overdue = tallies[OVERDUE_ONLY];
  // "Still open" already counts the overdue ones, so the badge is that number
  // alone rather than the two added together.
  const stillOpen = tallies[OUTSTANDING];

  const openUpload = (presetTypeId = "") => setUploading({ presetTypeId });

  /**
   * The upload reply says which request it closed, if any. Saying so is the
   * whole payoff of the auto-fulfil handshake — otherwise the employee uploads
   * a file and is left wondering whether the thing that was asked of them is
   * now settled.
   */
  const onUploaded = (doc) => {
    setUploading(null);
    const met = doc?.fulfilled_request_id;
    const base = doc?.status === "pending_verification" ? "Uploaded — it's now waiting for review" : "Uploaded";
    showToast(met ? `${base}. That closes what was asked of you for it.` : base);
    refreshAll();
  };

  return (
    <>
      <DashboardTopBar title="What’s Asked Of Me" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">What’s Asked Of Me</h1>
            <p className="text-sm text-slate-500 mt-1">
              The documents your job needs on file, and anything HR or your manager has asked you for. Upload one and it’s ticked off automatically — there’s nothing to mark as done.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refreshAll} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button" onClick={() => openUpload()} disabled={types.length === 0}
              title={types.length === 0 ? "Your organisation hasn't opened any document type for you to upload yet." : undefined}
              className={PRIMARY_BTN}
            >
              <HiUpload className="w-4 h-4" /> Upload a document
            </button>
          </div>
        </div>

        {/* The one row that says "do this first". Overdue is the only state that
            gets a full-width alert; everything else lives in the tiles. */}
        {overdue > 0 && (
          <button
            type="button"
            onClick={() => { setTab("requests"); changeStatus(OVERDUE_ONLY); }}
            className="w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left hover:bg-rose-100/60 transition"
          >
            <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-sm font-semibold text-rose-800 flex-1">
              {overdue === 1 ? "One document is past its deadline" : `${overdue} documents are past their deadline`}. Upload {overdue === 1 ? "it" : "them"} to stop the reminder emails.
            </span>
            <span className="text-xs font-bold text-rose-700">Show me</span>
          </button>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Tile
            label="Overdue" value={overdue ?? "…"} sub="Please do these first"
            icon={HiExclamationCircle} tone="text-rose-500" alert={!!overdue}
            onClick={() => { setTab("requests"); changeStatus(status === OVERDUE_ONLY ? "" : OVERDUE_ONLY); }}
            active={tab === "requests" && status === OVERDUE_ONLY}
          />
          <Tile
            label="Still to do" value={stillOpen ?? "…"} sub="Asked for and not yet uploaded"
            icon={HiClock} tone="text-fuchsia-500"
            onClick={() => { setTab("requests"); changeStatus(status === OUTSTANDING ? "" : OUTSTANDING); }}
            active={tab === "requests" && status === OUTSTANDING}
          />
          <Tile
            label="Done" value={tallies.fulfilled ?? "…"} sub="Closed by your upload"
            icon={HiCheckCircle} tone="text-violet-500"
            onClick={() => { setTab("requests"); changeStatus(status === "fulfilled" ? "" : "fulfilled"); }}
            active={tab === "requests" && status === "fulfilled"}
          />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="View">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === t.key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Icon className="w-4 h-4" /> {t.label}
                  {t.key === "requests" && stillOpen > 0 && (
                    <span className={`min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-bold ${overdue > 0 ? "bg-rose-500 text-white" : "bg-fuchsia-100 text-fuchsia-700"}`}>
                      {stillOpen}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {tab === "requests" && (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="my-req-filter">Show</label>
              <select id="my-req-filter" value={status} onChange={(e) => changeStatus(e.target.value)} className={SELECT}>
                {REQUEST_FILTERS.map((f) => <option key={f.value || "all"} value={f.value}>{f.value ? f.label : "Everything"}</option>)}
              </select>
            </div>
          )}
        </div>

        {tab === "checklist" ? (
          <ChecklistPanel
            plane={plane}
            subjectName="you"
            refreshKey={refreshKey}
            showToast={showToast}
            onUploadOne={(item) => openUpload(index.has(item.document_type_id) ? item.document_type_id : "")}
            onOpenDocument={(documentId, name) => setDocDetail({ id: documentId, title: name })}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            {state.error ? (
              <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load what's been asked of you." />
            ) : state.loading && state.rows.length === 0 ? (
              <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : state.rows.length === 0 ? (
              <DocEmptyState
                icon={status ? HiClipboardList : HiCheckCircle}
                title={status ? "Nothing in this state" : "Nothing has been asked of you"}
                message={status
                  ? "Try another filter."
                  : "Nobody has asked you for a document. It’s still worth checking “What I need on file” — those are the documents your job needs, whether or not anyone has chased them."}
                action={!status
                  ? <button type="button" onClick={() => setTab("checklist")} className={SECONDARY_BTN}><HiClipboardCheck className="w-4 h-4" /> What I need on file</button>
                  : null}
              />
            ) : (
              <div className={state.loading ? "opacity-60" : ""}>
                <RequestsTable
                  rows={state.rows}
                  types={index}
                  onOpen={setDetail}
                  showReminders={plane.showsReminders}
                  pagination={{ page, total: state.total, limit: PAGE, onPageChange: setPage }}
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
          Everything you upload here lands in your own file.
          <Link to={myPaths.documents} className="inline-flex items-center gap-1 font-bold text-purple-600 hover:underline">
            <HiFolderOpen className="w-3.5 h-3.5" /> My Documents <HiExternalLink className="w-3 h-3" />
          </Link>
        </p>
      </main>

      {detail && (
        <DocumentRequestDetailDialog
          request={detail}
          plane={plane}
          types={index}
          nameOf={(id, fallback) => (id === user?.id ? myName : fallback ?? "a colleague")}
          showToast={showToast}
          onChanged={refreshAll}
          onOpenDocument={(documentId, name) => { setDetail(null); setDocDetail({ id: documentId, title: name }); }}
          onClose={() => setDetail(null)}
        />
      )}

      {docDetail && (
        <DocumentDetailDialog
          doc={docDetail}
          plane={docPlane}
          types={index}
          showToast={showToast}
          onChanged={refreshAll}
          onReplace={(doc) => { setDocDetail(null); setUploading({ presetTypeId: doc.document_type_id, predecessor: doc }); }}
          onClose={() => setDocDetail(null)}
        />
      )}

      {uploading && (
        <DocumentUploadDialog
          mode={uploading.predecessor ? "replace" : "upload"}
          types={uploading.predecessor ? [...index.values()] : types}
          presetTypeId={uploading.presetTypeId}
          predecessor={uploading.predecessor}
          issue={(payload) => (uploading.predecessor ? docPlane.replace(uploading.predecessor.id, payload) : docPlane.issue(null, payload))}
          confirm={docPlane.confirm}
          discard={docPlane.remove}
          onDraftLeft={refreshAll}
          onDone={onUploaded}
          onClose={() => setUploading(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MyDocumentsPage.jsx — Self-service documents (API #34–#42), mounted in every
// workspace (employee, manager, HR): anyone in the organisation manages their
// own file here.
//
// Two views:
//   My documents        — everything I have, by state, with what needs action
//                         (rejected, expired, expiring soon) called out first
//   What I can upload   — the types my organisation accepts from me, each with
//                         its format / size / expiry rules and whether I
//                         already have one
//
// A person's document count is small, so the whole list is read once (up to
// 1,000 rows) and filtered here; "expiring soon" is derived on the client.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiCheckCircle, HiClock, HiDocumentText, HiExclamationCircle, HiFolderOpen, HiLockClosed, HiRefresh, HiUpload, HiViewGrid,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { documentsAPI } from "../api";
import { FilterTabs, Toast, useToast } from "../attendance/ui";
import DocumentTable from "../documents/DocumentTable";
import DocumentDetailDialog from "../documents/DocumentDetailDialog";
import DocumentUploadDialog from "../documents/DocumentUploadDialog";
import useDocumentTypes from "../documents/useDocumentTypes";
import { DOCUMENT_PLANES } from "../documents/documentPlanes";
import { LIVE_STATUSES, displayStatus, groupLabel, listPayload, typePolicyLine } from "../documents/documentMeta";
import { DocEmptyState, DocErrorState, DocStatusBadge, PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";

const plane = DOCUMENT_PLANES.self;
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

const FILTERS = [
  { value: "", label: "All" },
  { value: "available", label: "Verified" },
  { value: "pending_verification", label: "In review" },
  { value: "expiring_soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Action required" },
  { value: "pending_upload", label: "Not finished" },
  { value: "superseded", label: "Older versions" },
];

async function loadAllMine() {
  const first = listPayload(await documentsAPI.getMyDocuments({ limit: PAGE_SIZE, offset: 0 }));
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
  if (pages <= 1) return first.rows;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => documentsAPI.getMyDocuments({ limit: PAGE_SIZE, offset: (i + 1) * PAGE_SIZE })),
  );
  return [...first.rows, ...rest.flatMap((res) => listPayload(res).rows)];
}

const byNewest = (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""));

function Tile({ label, value, icon: Icon, tone = "text-purple-500", onClick, active }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-2xl border px-4 py-3.5 transition ${active ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100" : "bg-white border-slate-100 hover:border-purple-200 shadow-xs"}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
        <span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none mt-2 tabular-nums">{value}</p>
    </button>
  );
}

export default function MyDocumentsPage() {
  const { types, index, loading: typesLoading, error: typesError, reload: reloadTypes } = useDocumentTypes("self");
  const { toast, showToast, clearToast } = useToast();
  const [view, setView] = useState("mine");
  const [filter, setFilter] = useState("");
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(null); // { mode, predecessor?, presetTypeId? }

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = (await loadAllMine()).sort(byNewest);
      setState({ rows, loading: false, error: null });
    } catch (error) {
      setState({ rows: [], loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withDisplay = useMemo(() => state.rows.map((d) => ({ ...d, _display: displayStatus(d) })), [state.rows]);
  const counts = useMemo(() => {
    const c = {};
    withDisplay.forEach((d) => { c[d._display] = (c[d._display] || 0) + 1; });
    return c;
  }, [withDisplay]);

  // "Verified" means every valid document, including ones expiring soon (they
  // also have their own filter), so the tile, the tab and the list agree.
  const matches = (d, f) => (f === "available" ? d._display === "available" || d._display === "expiring_soon" : d._display === f);

  // "All" hides older versions and discarded drafts; they have their own filter.
  const visible = useMemo(() => {
    if (!filter) return withDisplay.filter((d) => !["superseded", "deleted"].includes(d._display));
    return withDisplay.filter((d) => matches(d, filter));
  }, [withDisplay, filter]);

  // Live document per type, for the "What I can upload" checklist.
  const liveByType = useMemo(() => {
    const map = new Map();
    withDisplay.forEach((d) => {
      if (![...LIVE_STATUSES, "expiring_soon"].includes(d._display)) return;
      const list = map.get(d.document_type_id) || [];
      list.push(d);
      map.set(d.document_type_id, list);
    });
    return map;
  }, [withDisplay]);

  const rejected = counts.rejected || 0;
  const expired = counts.expired || 0;
  const expiring = counts.expiring_soon || 0;
  const drafts = counts.pending_upload || 0;

  const openUpload = (presetTypeId = "") => setUploading({ mode: "upload", presetTypeId });
  const openReplace = (doc) => { setDetail(null); setUploading({ mode: "replace", predecessor: doc }); };
  const uploadAgain = (doc) => { setDetail(null); openUpload(index.has(doc.document_type_id) ? doc.document_type_id : ""); };

  const onUploaded = (doc) => {
    setUploading(null);
    showToast(doc?.status === "pending_verification" ? "Uploaded — it's now waiting for review" : "Uploaded and active");
    load();
  };

  return (
    <>
      <DashboardTopBar title="My Documents" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Documents</h1>
            <p className="text-sm text-slate-500 mt-1">Your identity, education and employment papers, kept in encrypted storage. Only you and HR can see confidential ones.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { load(); reloadTypes(); }} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => openUpload()} disabled={typesLoading || types.length === 0} className={PRIMARY_BTN} title={!typesLoading && types.length === 0 ? "Your organisation hasn't opened any document type for self-upload yet." : undefined}>
              <HiUpload className="w-4 h-4" /> Upload document
            </button>
          </div>
        </div>

        {/* Things that need the employee, most urgent first. */}
        {!state.loading && !state.error && (rejected > 0 || expired > 0 || expiring > 0 || drafts > 0) && (
          <div className="space-y-2">
            {rejected > 0 && (
              <button type="button" onClick={() => { setView("mine"); setFilter("rejected"); }} className="w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left hover:bg-rose-100/60 transition">
                <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />
                <span className="text-sm font-semibold text-rose-800 flex-1">{rejected} {rejected === 1 ? "document was" : "documents were"} rejected. Read the reason and upload a corrected copy.</span>
                <span className="text-xs font-bold text-rose-700">Review</span>
              </button>
            )}
            {expired > 0 && (
              <button type="button" onClick={() => { setView("mine"); setFilter("expired"); }} className="w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-left hover:bg-rose-50/60 transition">
                <HiClock className="w-5 h-5 text-rose-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 flex-1">{expired} {expired === 1 ? "document has" : "documents have"} expired. Upload the renewed copy as a new version.</span>
                <span className="text-xs font-bold text-rose-700">Review</span>
              </button>
            )}
            {expiring > 0 && (
              <button type="button" onClick={() => { setView("mine"); setFilter("expiring_soon"); }} className="w-full flex items-center gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-left hover:bg-fuchsia-100/60 transition">
                <HiClock className="w-5 h-5 text-fuchsia-600 shrink-0" />
                <span className="text-sm font-semibold text-fuchsia-800 flex-1">{expiring} {expiring === 1 ? "document expires" : "documents expire"} within 30 days.</span>
                <span className="text-xs font-bold text-fuchsia-700">Review</span>
              </button>
            )}
            {drafts > 0 && (
              <button type="button" onClick={() => { setView("mine"); setFilter("pending_upload"); }} className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 transition">
                <HiUpload className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 flex-1">{drafts} {drafts === 1 ? "upload didn't" : "uploads didn't"} finish. Check or discard {drafts === 1 ? "it" : "them"}.</span>
                <span className="text-xs font-bold text-purple-700">Review</span>
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Verified" value={(counts.available || 0) + expiring} icon={HiCheckCircle} onClick={() => { setView("mine"); setFilter("available"); }} active={view === "mine" && filter === "available"} />
          <Tile label="In review" value={counts.pending_verification || 0} icon={HiClock} tone="text-fuchsia-500" onClick={() => { setView("mine"); setFilter("pending_verification"); }} active={view === "mine" && filter === "pending_verification"} />
          <Tile label="Need action" value={rejected + expired} icon={HiExclamationCircle} tone="text-rose-500" onClick={() => { setView("mine"); setFilter(rejected ? "rejected" : "expired"); }} active={view === "mine" && (filter === "rejected" || filter === "expired")} />
          <Tile label="Document types open to me" value={types.length} icon={HiViewGrid} onClick={() => setView("types")} active={view === "types"} />
        </div>

        <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="View">
          {[["mine", "My documents"], ["types", "What I can upload"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${view === key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {view === "mine" ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 overflow-x-auto">
              <FilterTabs options={FILTERS.map((f) => {
                const n = f.value ? withDisplay.filter((d) => matches(d, f.value)).length : 0;
                return { ...f, label: n ? `${f.label} (${n})` : f.label };
              })} value={filter} onChange={setFilter} />
            </div>
            {state.error ? (
              <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your documents." />
            ) : state.loading && state.rows.length === 0 ? (
              <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : visible.length === 0 ? (
              <DocEmptyState
                icon={HiFolderOpen}
                title={filter ? "Nothing in this state" : "You haven't uploaded any documents yet"}
                message={filter ? "Try another filter." : types.length ? "Start with the documents your organisation asks for — see “What I can upload”." : "HR hasn't opened any document types for self-upload yet."}
                action={!filter && types.length ? <button type="button" onClick={() => setView("types")} className={SECONDARY_BTN}><HiViewGrid className="w-4 h-4" /> What I can upload</button> : null}
              />
            ) : (
              <DocumentTable rows={visible} types={index} onOpen={setDetail} />
            )}
          </div>
        ) : typesError ? (
          <div className="bg-white rounded-2xl border border-slate-100"><DocErrorState error={typesError} onRetry={reloadTypes} fallback="Couldn't load the document types." /></div>
        ) : typesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : types.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100"><DocEmptyState icon={HiDocumentText} title="No document types are open for self-upload" message="Your HR team hasn't opened any document types for employees to upload yet. They can still add documents to your file for you." /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {types.map((t) => {
              const live = liveByType.get(t.id) || [];
              const single = !t.allows_multiple;
              const current = live[0];
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">{groupLabel(t.group)}</p>
                      <h3 className="text-base font-bold text-slate-800 mt-0.5 flex items-center gap-1.5">{t.name}{t.is_confidential && <HiLockClosed className="w-4 h-4 text-purple-500" title="Confidential" />}</h3>
                    </div>
                    {current ? <DocStatusBadge status={current._display} /> : <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-white text-slate-500 border-slate-200 whitespace-nowrap">Not uploaded</span>}
                  </div>
                  {t.description && <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-3">{t.description}</p>}
                  <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
                    <li className="font-semibold text-slate-600">{typePolicyLine(t)}</li>
                    {t.has_expiry && <li>Needs an expiry date</li>}
                    <li>{t.requires_verification ? "Reviewed by HR before it counts" : "Active as soon as it's uploaded"}</li>
                    <li>{single ? "One at a time — replace it to update" : "You can keep several"}</li>
                  </ul>
                  <div className="mt-auto pt-4 flex gap-2">
                    {single && current ? (
                      <button type="button" onClick={() => setDetail(current)} className={`${SECONDARY_BTN} flex-1`}>Open current</button>
                    ) : (
                      <button type="button" onClick={() => openUpload(t.id)} className={`${PRIMARY_BTN} flex-1`}><HiUpload className="w-4 h-4" /> Upload</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {detail && (
        <DocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          showToast={showToast}
          onChanged={load}
          onReplace={openReplace}
          onUploadAgain={uploadAgain}
          onClose={() => setDetail(null)}
        />
      )}

      {uploading && (
        <DocumentUploadDialog
          mode={uploading.mode}
          types={types}
          presetTypeId={uploading.presetTypeId}
          predecessor={uploading.predecessor}
          issue={(payload) => (uploading.mode === "replace" ? plane.replace(uploading.predecessor.id, payload) : plane.issue(null, payload))}
          confirm={plane.confirm}
          discard={plane.remove || undefined}
          onDraftLeft={load}
          onDone={onUploaded}
          onClose={() => setUploading(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

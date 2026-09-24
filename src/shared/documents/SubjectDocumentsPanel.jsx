// ─────────────────────────────────────────────────────────────────────────────
// documents/SubjectDocumentsPanel.jsx — One person's document file, as HR or
// their manager sees it.
//   hr      — GET /hr/employees/:userId/documents (#13): every status; upload
//             (#10/#11), link an external document (#12), and the full detail
//   manager — GET /manager/employees/:userId/documents (#27): only what the
//             manager may see (non-confidential, visible statuses); upload in
//             manager_can_request types (#31/#32) and recommend
//
// Used by HR's Employee Documents page and profile tab, and the manager's
// member profile tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiFolderOpen, HiLink, HiRefresh, HiUpload } from "react-icons/hi";
import { Toast, useToast } from "../attendance/ui";
import DocumentTable from "./DocumentTable";
import DocumentDetailDialog from "./DocumentDetailDialog";
import DocumentUploadDialog from "./DocumentUploadDialog";
import LinkReferenceDialog from "./LinkReferenceDialog";
import useDocumentTypes from "./useDocumentTypes";
import { DOCUMENT_PLANES } from "./documentPlanes";
import { listPayload } from "./documentMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "./ui";

const PAGE = 20;

// The manager read accepts only these three statuses (#27).
// A dropdown, not tabs: seven tabs wrapped onto two lines inside a profile tab
// and pushed the buttons into a stack. The other profile tabs keep one control
// in their header row, and this now matches them.
const HR_FILTERS = [
  { value: "", label: "All documents" },
  { value: "pending_verification", label: "In review" },
  { value: "available", label: "Verified" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
  { value: "pending_upload", label: "Not finished" },
  { value: "superseded", label: "Older versions" },
];
const MANAGER_FILTERS = HR_FILTERS.slice(0, 4);

/**
 * @param {object} props
 * @param {"hr"|"manager"} props.planeKey
 * @param {string} props.userId
 * @param {string} [props.subjectName]
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 */
export default function SubjectDocumentsPanel({ planeKey, userId, subjectName = "", nameOf }) {
  const plane = DOCUMENT_PLANES[planeKey];
  const { index, uploadTypes, loading: typesLoading } = useDocumentTypes(planeKey);
  const { toast, showToast, clearToast } = useToast();

  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ rows: [], total: 0, loading: true, error: null });
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(null); // { mode, predecessor?, presetTypeId? }
  const [linking, setLinking] = useState(false);

  // Only the newest request may write the list: a slow response for an old
  // filter or page must not overwrite the current one.
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    if (!userId) return;
    const id = ++reqRef.current;
    setList((l) => ({ ...l, loading: true, error: null }));
    try {
      const res = await plane.list(userId, { status: status || undefined, limit: PAGE, offset: (page - 1) * PAGE });
      if (id !== reqRef.current) return;
      const { rows, total } = listPayload(res);
      setList({ rows, total, loading: false, error: null });
    } catch (error) {
      if (id === reqRef.current) setList({ rows: [], total: 0, loading: false, error });
    }
  }, [plane, userId, status, page]);

  useEffect(() => { load(); }, [load]);

  // Changing the filter goes back to page 1 in the same update, so one request goes out.
  const changeStatus = (next) => { setStatus(next); setPage(1); };

  const canUpload = !!plane.issue && uploadTypes.length > 0;
  const who = subjectName || (nameOf ? nameOf(userId, "this employee") : "this employee");

  const openReplace = (doc) => {
    setDetail(null);
    setUploading({ mode: "replace", predecessor: doc });
  };

  const filters = planeKey === "hr" ? HR_FILTERS : MANAGER_FILTERS;
  const summary = list.loading && list.rows.length === 0
    ? "Loading…"
    : `${list.total} ${list.total === 1 ? "document" : "documents"}${status ? ` · ${filters.find((f) => f.value === status)?.label.toLowerCase()}` : " on file"}. ${planeKey === "manager"
      ? "Confidential documents stay with HR."
      : "Open one to verify, replace or remove it."}`;

  return (
    <div className="space-y-5">
      {/* Same shape as the other profile tabs: title on the left, controls on the right, one row. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">Documents</h2>
          <p className="text-xs text-slate-500 mt-0.5">{summary}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0">
          <label className="sr-only" htmlFor={`doc-filter-${planeKey}-${userId}`}>Show</label>
          <select
            id={`doc-filter-${planeKey}-${userId}`}
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
            className={SELECT}
          >
            {filters.map((f) => <option key={f.value || "all"} value={f.value}>{f.label}</option>)}
          </select>
          <button type="button" onClick={load} disabled={list.loading} className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh documents" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${list.loading ? "animate-spin" : ""}`} />
          </button>
          {plane.linkReference && (
            <button type="button" onClick={() => setLinking(true)} disabled={typesLoading || uploadTypes.length === 0} className={`${SECONDARY_BTN} !h-10 !py-0`}>
              <HiLink className="w-4 h-4" /> Link external
            </button>
          )}
          {plane.issue && (
            <button
              type="button"
              onClick={() => setUploading({ mode: "upload" })}
              disabled={!canUpload}
              title={!typesLoading && !canUpload ? (planeKey === "manager" ? "No document type lets managers upload yet." : "Activate a document type first.") : undefined}
              className={`${PRIMARY_BTN} !h-10 !py-0 !shadow-none`}
            >
              <HiUpload className="w-4 h-4" /> Upload
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        {list.error ? (
          <DocErrorState error={list.error} onRetry={load} fallback="Couldn't load these documents." />
        ) : list.loading && list.rows.length === 0 ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : list.rows.length === 0 ? (
          <DocEmptyState
            icon={HiFolderOpen}
            title={status ? "No documents in this state" : "No documents yet"}
            message={status ? "Try another filter." : planeKey === "manager"
              ? `${who} has no documents you can see. Confidential documents are only visible to HR.`
              : `Nothing has been uploaded for ${who} yet.`}
            action={!status && canUpload ? <button type="button" onClick={() => setUploading({ mode: "upload" })} className={PRIMARY_BTN}><HiUpload className="w-4 h-4" /> Upload the first one</button> : null}
          />
        ) : (
          <div className={list.loading ? "opacity-60" : ""}>
            <DocumentTable
              rows={list.rows}
              types={index}
              onOpen={setDetail}
              showRecommendation={planeKey === "hr" && status === "pending_verification"}
              pagination={{ page, total: list.total, limit: PAGE, onPageChange: setPage }}
            />
          </div>
        )}
      </div>

      {detail && (
        <DocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={load}
          onReplace={plane.replace ? openReplace : undefined}
          onClose={() => setDetail(null)}
        />
      )}

      {uploading && (
        <DocumentUploadDialog
          mode={uploading.mode}
          types={uploading.mode === "replace" ? [...index.values()] : uploadTypes}
          predecessor={uploading.predecessor}
          subjectName={who}
          issue={(payload) => (uploading.mode === "replace" ? plane.replace(uploading.predecessor.id, payload) : plane.issue(userId, payload))}
          confirm={plane.confirm}
          discard={plane.remove || undefined}
          onDraftLeft={load}
          onDone={(doc) => {
            setUploading(null);
            showToast(doc?.status === "pending_verification" ? "Uploaded — waiting for review" : "Uploaded");
            load();
          }}
          onClose={() => setUploading(null)}
        />
      )}

      {linking && (
        <LinkReferenceDialog
          types={uploadTypes}
          subjectName={who}
          link={(payload) => plane.linkReference(userId, payload)}
          onDone={() => { setLinking(false); showToast("External document linked"); load(); }}
          onClose={() => setLinking(false)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// documents/SubjectDocumentsPanel.jsx — One person's document file, as HR or
// their manager sees it.
//   hr      — GET /hr/employees/:userId/documents (#13): every status; upload
//             (#10/#11), link an external document (#12), and the full detail
//   manager — GET /manager/employees/:userId/documents (#27): only what the
//             manager may see (non-confidential, visible statuses); upload in
//             manager_can_request types (#31/#32) and recommend
//
// Since Phase 4 it also carries the two things you need in the same place as
// the file itself, as tabs beside it:
//   Required documents — what this person must hold and how much of it they
//                        have (#86 / #96), with "ask for all the outstanding
//                        ones" (#81, HR only)
//   Requests           — what has been asked of them and where each stands
//                        (#82 / #94, filtered to this one person)
//
// Asking and having are two halves of one question ("is this person's file in
// order?"), so they live together rather than on a separate screen. Nothing
// here ever closes a request: confirming a matching upload does that on the
// server, and reports it back as `fulfilled_request_id`.
//
// Phase 5 adds the other end of the same lifecycle, for HR only: gathering
// everything on the file into a leaver's pack (#123/#124) and closing the file
// down when they go (#122). Those sit in their own card at the foot of the
// Documents tab rather than in the toolbar — they belong to the day somebody
// leaves, not to any ordinary day, and the destructive one should not be one
// slip away from Upload.
//
// Used by HR's Employee Documents page and profile tab, and the manager's
// member profile tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiArchive, HiClipboardCheck, HiClipboardList, HiFolderOpen, HiLink, HiLogout, HiRefresh, HiUpload } from "react-icons/hi";
import { Toast, useToast } from "../attendance/ui";
import DocumentTable from "./DocumentTable";
import DocumentDetailDialog from "./DocumentDetailDialog";
import DocumentUploadDialog from "./DocumentUploadDialog";
import LinkReferenceDialog from "./LinkReferenceDialog";
import ChecklistPanel from "./ChecklistPanel";
import RequestsTable from "./RequestsTable";
import RequestDocumentDialog from "./RequestDocumentDialog";
import DocumentRequestDetailDialog from "./DocumentRequestDetailDialog";
import OffboardingDialog from "./OffboardingDialog";
import ExitPackDialog from "./ExitPackDialog";
import useDocumentTypes from "./useDocumentTypes";
import useDocumentSettings from "./useDocumentSettings";
import { DOCUMENT_PLANES } from "./documentPlanes";
import { REQUEST_PLANES } from "./requestPlanes";
import { documentsAPI } from "../api";
import { listPayload } from "./documentMeta";
import { fmtDate } from "../attendance/dates";
import { OUTSTANDING, REQUEST_FILTERS, requestFilterQuery, requestListOf, requesterRoleLabel } from "./requestMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "./ui";

const PAGE = 20;
// Phase 4 lists page with page + limit, capped at 100 — not limit/offset.
const REQUEST_PAGE = 20;

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

const VIEWS = [
  { key: "documents", label: "Documents", icon: HiFolderOpen },
  { key: "checklist", label: "Required documents", icon: HiClipboardCheck },
  { key: "requests", label: "Requests", icon: HiClipboardList },
];

/**
 * @param {object} props
 * @param {"hr"|"manager"} props.planeKey
 * @param {string} props.userId
 * @param {string} [props.subjectName]
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 */
export default function SubjectDocumentsPanel({ planeKey, userId, subjectName = "", nameOf }) {
  const plane = DOCUMENT_PLANES[planeKey];
  const requestPlane = REQUEST_PLANES[planeKey];
  const { index, uploadTypes, loading: typesLoading } = useDocumentTypes(planeKey);
  // HR can read this; a manager cannot, and then the dialog says "your
  // organisation’s standard window" instead of naming a number of days.
  const { settings, requestDueDays } = useDocumentSettings();
  const { toast, showToast, clearToast } = useToast();

  const [view, setView] = useState("documents");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ rows: [], total: 0, loading: true, error: null });
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(null); // { mode, predecessor?, presetTypeId?, presetTitle?, askedFor? }
  const [linking, setLinking] = useState(false);

  // Phase 4 state. `refreshKey` re-reads the checklist after an upload, a
  // request or a withdrawal, because all three change what it says.
  const [refreshKey, setRefreshKey] = useState(0);
  const [requesting, setRequesting] = useState(null); // { presetTypeId }
  const [requestDetail, setRequestDetail] = useState(null);
  const [requestFilter, setRequestFilter] = useState("");
  const [requestPage, setRequestPage] = useState(1);
  const [requests, setRequests] = useState({ rows: [], total: 0, loading: true, error: null });
  const [openCount, setOpenCount] = useState(null);

  // Phase 5, HR only: the two things that happen when somebody leaves.
  const [offboarding, setOffboarding] = useState(false);
  const [exitPack, setExitPack] = useState(false);

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

  // The request list is scoped to this one person via `user_id`. On the manager
  // plane a person outside the reporting line answers an empty list, never a
  // 403, so nothing extra is needed to keep it safe.
  const listReqRef = useRef(0);
  const loadRequests = useCallback(async () => {
    if (!userId) return;
    const id = ++listReqRef.current;
    setRequests((r) => ({ ...r, loading: true, error: null }));
    try {
      const res = await requestPlane.list({
        user_id: userId,
        ...requestFilterQuery(requestFilter),
        page: requestPage,
        limit: REQUEST_PAGE,
      });
      if (id !== listReqRef.current) return;
      setRequests({ ...requestListOf(res), loading: false, error: null });
    } catch (error) {
      if (id === listReqRef.current) setRequests({ rows: [], total: 0, loading: false, error });
    }
  }, [requestPlane, userId, requestFilter, requestPage]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  /**
   * The tab badge is its own `limit: 1` read, because the list's `total` only
   * describes whatever filter and page are showing — counting the rows on screen
   * would report 0 open requests while the Cancelled filter is on.
   */
  const countRef = useRef(0);
  const loadOpenCount = useCallback(async () => {
    if (!userId) return;
    const token = ++countRef.current;
    try {
      const res = await requestPlane.list({ user_id: userId, ...requestFilterQuery(OUTSTANDING), limit: 1 });
      if (token === countRef.current) setOpenCount(requestListOf(res).total);
    } catch {
      // No badge rather than a wrong one; the list itself reports any error.
      if (token === countRef.current) setOpenCount(null);
    }
  }, [requestPlane, userId]);

  useEffect(() => { loadOpenCount(); }, [loadOpenCount]);

  // Changing the filter goes back to page 1 in the same update, so one request goes out.
  const changeStatus = (next) => { setStatus(next); setPage(1); };
  const changeRequestFilter = (next) => { setRequestFilter(next); setRequestPage(1); };

  /** An upload, a request or a withdrawal all change every one of the three views. */
  const refreshAll = useCallback(() => {
    load();
    loadRequests();
    loadOpenCount();
    setRefreshKey((k) => k + 1);
  }, [load, loadRequests, loadOpenCount]);

  const canUpload = !!plane.issue && uploadTypes.length > 0;
  const canRequest = !!requestPlane.create && uploadTypes.length > 0;
  const who = subjectName || (nameOf ? nameOf(userId, "this employee") : "this employee");

  const openReplace = (doc) => {
    setDetail(null);
    setUploading({ mode: "replace", predecessor: doc });
  };

  const uploadTypeIds = useMemo(() => new Set(uploadTypes.map((t) => t.id)), [uploadTypes]);

  /**
   * Put the document in from the request that asked for it, rather than
   * closing the dialog, switching tab and picking the type again by hand.
   */
  const uploadForRequest = (req) => {
    const asker = req?.requested_by && nameOf
      ? nameOf(req.requested_by, requesterRoleLabel(req?.requested_by_role))
      : requesterRoleLabel(req?.requested_by_role);
    setRequestDetail(null);
    setView("documents");
    setUploading({
      mode: "upload",
      presetTypeId: req?.document_type_id || "",
      presetTitle: index.get(req?.document_type_id)?.name || "",
      askedFor: {
        headline: `${asker} asked ${who} for this${req?.created_at ? ` on ${fmtDate(req.created_at)}` : ""}`,
        note: req?.note || "",
        dueOn: req?.due_on || "",
      },
    });
  };

  /**
   * An upload that met an open request says so. The server closed it inside the
   * confirm transaction and handed back which one, so the toast reports a fact
   * rather than guessing from what the list used to show.
   */
  const onUploaded = (doc, verb = "Uploaded") => {
    setUploading(null);
    const met = doc?.fulfilled_request_id;
    const base = doc?.status === "pending_verification" ? `${verb} — waiting for review` : verb;
    showToast(met ? `${base}. That also closed the request for it.` : base);
    refreshAll();
  };

  const filters = planeKey === "hr" ? HR_FILTERS : MANAGER_FILTERS;
  const summary = list.loading && list.rows.length === 0
    ? "Loading…"
    : `${list.total} ${list.total === 1 ? "document" : "documents"}${status ? ` · ${filters.find((f) => f.value === status)?.label.toLowerCase()}` : " on file"}. ${planeKey === "manager"
      ? "Confidential documents stay with HR."
      : "Open one to verify, replace or remove it."}`;

  const openRequests = openCount ?? 0;

  return (
    <div className="space-y-5">
      {/* Same shape as the other profile tabs: title on the left, controls on the right, one row. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">Documents</h2>
          <p className="text-xs text-slate-500 mt-0.5">{summary}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0">
          {view === "documents" && (
            <>
              <label className="sr-only" htmlFor={`doc-filter-${planeKey}-${userId}`}>Show</label>
              <select
                id={`doc-filter-${planeKey}-${userId}`}
                value={status}
                onChange={(e) => changeStatus(e.target.value)}
                className={SELECT}
              >
                {filters.map((f) => <option key={f.value || "all"} value={f.value}>{f.label}</option>)}
              </select>
            </>
          )}
          {view === "requests" && (
            <>
              <label className="sr-only" htmlFor={`req-filter-${planeKey}-${userId}`}>Show</label>
              <select
                id={`req-filter-${planeKey}-${userId}`}
                value={requestFilter}
                onChange={(e) => changeRequestFilter(e.target.value)}
                className={SELECT}
              >
                {REQUEST_FILTERS.map((f) => <option key={f.value || "all"} value={f.value}>{f.label}</option>)}
              </select>
            </>
          )}
          <button type="button" onClick={view === "requests" ? loadRequests : load} disabled={view === "requests" ? requests.loading : list.loading} className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${(view === "requests" ? requests.loading : list.loading) ? "animate-spin" : ""}`} />
          </button>
          {canRequest && (
            <button
              type="button"
              onClick={() => setRequesting({ presetTypeId: "" })}
              className={`${SECONDARY_BTN} !h-10 !py-0`}
            >
              <HiClipboardList className="w-4 h-4" /> Ask for a document
            </button>
          )}
          {plane.linkReference && view === "documents" && (
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

      <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="This person's documents">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-bold transition ${view === v.key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Icon className="w-4 h-4" /> {v.label}
              {v.key === "requests" && openRequests > 0 && (
                <span className="min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-100 text-fuchsia-700">{openRequests}</span>
              )}
            </button>
          );
        })}
      </div>

      {view === "checklist" ? (
        <ChecklistPanel
          plane={requestPlane}
          userId={userId}
          subjectName={who}
          refreshKey={refreshKey}
          showToast={showToast}
          onRequestsChanged={refreshAll}
          onRequestOne={canRequest ? (item) => setRequesting({ presetTypeId: item.document_type_id }) : undefined}
          onOpenDocument={(documentId, name) => { setView("documents"); setDetail({ id: documentId, title: name }); }}
          compact
        />
      ) : view === "requests" ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {requests.error ? (
            <DocErrorState error={requests.error} onRetry={loadRequests} fallback="Couldn't load the requests." />
          ) : requests.loading && requests.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : requests.rows.length === 0 ? (
            <DocEmptyState
              icon={HiClipboardList}
              title={requestFilter ? "Nothing in this state" : "Nothing has been asked for"}
              message={requestFilter
                ? "Try another filter."
                : `Nobody has asked ${who} for a document yet. Start from Required documents, or use “Ask for a document”.`}
              action={!requestFilter && canRequest
                ? <button type="button" onClick={() => setRequesting({ presetTypeId: "" })} className={PRIMARY_BTN}><HiClipboardList className="w-4 h-4" /> Ask for a document</button>
                : null}
            />
          ) : (
            <div className={requests.loading ? "opacity-60" : ""}>
              <RequestsTable
                rows={requests.rows}
                types={index}
                nameOf={nameOf}
                onOpen={setRequestDetail}
                showReminders={requestPlane.showsReminders}
                pagination={{ page: requestPage, total: requests.total, limit: REQUEST_PAGE, onPageChange: setRequestPage }}
              />
            </div>
          )}
        </div>
      ) : (
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
      )}

      {/* The other end of the lifecycle. HR only, and deliberately not in the
          toolbar: closing a file down can't be undone, so it shouldn't sit one
          slip away from Upload. */}
      {planeKey === "hr" && view === "documents" && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-white text-purple-600 flex items-center justify-center shrink-0"><HiLogout className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">When {who} leaves</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Gather everything on their file into one pack for the handover, and close the file down — archiving their documents, excusing what they never signed, withdrawing open requests and stopping the reminder emails.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setExitPack(true)} className={`${SECONDARY_BTN} !h-10 !py-0`}>
              <HiArchive className="w-4 h-4" /> Their pack
            </button>
            <button type="button" onClick={() => setOffboarding(true)} className={`${SECONDARY_BTN} !h-10 !py-0`}>
              <HiLogout className="w-4 h-4" /> Close it down
            </button>
          </div>
        </div>
      )}

      {detail && (
        <DocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={refreshAll}
          onReplace={plane.replace ? openReplace : undefined}
          onRequestReplacement={canRequest ? (doc) => {
            setDetail(null);
            setRequesting({ presetTypeId: doc.document_type_id });
          } : undefined}
          onClose={() => setDetail(null)}
        />
      )}

      {uploading && (
        <DocumentUploadDialog
          mode={uploading.mode}
          types={uploading.mode === "replace" ? [...index.values()] : uploadTypes}
          predecessor={uploading.predecessor}
          presetTypeId={uploading.presetTypeId}
          presetTitle={uploading.presetTitle}
          askedFor={uploading.askedFor}
          subjectName={who}
          issue={(payload) => (uploading.mode === "replace" ? plane.replace(uploading.predecessor.id, payload) : plane.issue(userId, payload))}
          confirm={plane.confirm}
          discard={plane.remove || undefined}
          onDraftLeft={refreshAll}
          onDone={(doc) => onUploaded(doc)}
          onClose={() => setUploading(null)}
        />
      )}

      {linking && (
        <LinkReferenceDialog
          types={uploadTypes}
          subjectName={who}
          link={(payload) => plane.linkReference(userId, payload)}
          onDone={(doc) => {
            setLinking(false);
            const met = doc?.fulfilled_request_id;
            showToast(met ? "External document linked. That also closed the request for it." : "External document linked");
            refreshAll();
          }}
          onClose={() => setLinking(false)}
        />
      )}

      {requesting && (
        <RequestDocumentDialog
          types={uploadTypes}
          presetTypeId={requesting.presetTypeId}
          subjectName={who}
          defaultDueDays={requestDueDays}
          create={(payload) => requestPlane.create(userId, payload)}
          onDone={(created) => {
            setRequesting(null);
            showToast(`Asked ${who} for it. They'll see it in their portal straight away.`);
            refreshAll();
            if (created?.id) setRequestDetail(created);
          }}
          onOpenExisting={(id) => { setRequesting(null); setView("requests"); setRequestDetail({ id }); }}
          onClose={() => setRequesting(null)}
        />
      )}

      {requestDetail && (
        <DocumentRequestDetailDialog
          request={requestDetail}
          plane={requestPlane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={refreshAll}
          onOpenDocument={(documentId, name) => { setRequestDetail(null); setView("documents"); setDetail({ id: documentId, title: name }); }}
          onUpload={canUpload ? uploadForRequest : undefined}
          uploadTypeIds={uploadTypeIds}
          onClose={() => setRequestDetail(null)}
        />
      )}

      {offboarding && (
        <OffboardingDialog
          subjectName={who}
          run={(opts) => documentsAPI.offboardDocuments(userId, opts)}
          onDone={refreshAll}
          onClose={() => setOffboarding(false)}
        />
      )}

      {exitPack && (
        <ExitPackDialog
          subjectName={who}
          defaultScope={settings?.document_offboarding_exit_pack_scope || "all"}
          fetchPack={(params) => documentsAPI.getExitPack(userId, params)}
          exportPack={(params) => documentsAPI.exportExitPack(userId, params)}
          showToast={showToast}
          onClose={() => setExitPack(false)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

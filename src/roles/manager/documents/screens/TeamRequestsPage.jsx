// ─────────────────────────────────────────────────────────────────────────────
// TeamRequestsPage.jsx — What has been asked of the manager's team, and what
// each person still needs on file (#93–#96).
//
// Two views, because a manager has two different questions:
//   Requests          — the requests, whoever raised them (#94). HR's requests
//                       appear here too: the manager can see they exist, which
//                       is the point, but can only withdraw their own.
//   Required docs     — that report's required-document checklist (#96), with
//                       "ask for it" on each outstanding item (#93)
//
// Three limits are the server's, and are shown as facts rather than as errors:
//   · A manager can only ask for the kinds of document their organisation lets
//     managers ask for. Sensitive ones are HR's alone.
//   · A manager can only withdraw a request they raised themselves. Anything
//     else answers a uniform "not found", so the button is not offered at all.
//   · There is no nudge on this plane. Reminder emails still go out every
//     morning automatically; sending one early is HR's to do.
//
// A manager can also put the document in themselves, for the kinds policy lets
// them handle — the paper often reaches the manager first. It is the same
// close as the employee's own upload: the server matches it to the request.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiCheckCircle, HiClipboardCheck, HiClipboardList, HiClock, HiExclamationCircle, HiExternalLink,
  HiInformationCircle, HiRefresh, HiUserGroup,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { useOrgEmployees } from "../../../../shared/attendance/EmployeePicker";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import ChecklistPanel from "../../../../shared/documents/ChecklistPanel";
import RequestsTable from "../../../../shared/documents/RequestsTable";
import RequestDocumentDialog from "../../../../shared/documents/RequestDocumentDialog";
import DocumentRequestDetailDialog from "../../../../shared/documents/DocumentRequestDetailDialog";
import DocumentUploadDialog from "../../../../shared/documents/DocumentUploadDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { REQUEST_PLANES } from "../../../../shared/documents/requestPlanes";
import { DOCUMENT_PLANES } from "../../../../shared/documents/documentPlanes";
import { fmtDate } from "../../../../shared/attendance/dates";
import {
  OUTSTANDING, OVERDUE_ONLY, REQUEST_FILTERS, requestFilterQuery, requestListOf, requesterRoleLabel,
} from "../../../../shared/documents/requestMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";

const PAGE = 25;
const plane = REQUEST_PLANES.manager;
const docPlane = DOCUMENT_PLANES.manager;

const TABS = [
  { key: "requests", label: "Requests", icon: HiClipboardList },
  { key: "checklist", label: "Required documents", icon: HiClipboardCheck },
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

export default function TeamRequestsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "requests";
  const userId = params.get("user") || "";
  const status = REQUEST_FILTERS.some((f) => f.value && f.value === params.get("status")) ? params.get("status") : "";

  // The manager plane's types are exactly the ones policy lets a manager ask
  // for — `uploadTypes` here is `manager_can_request`, which is the same gate
  // the server applies to #93.
  const { uploadTypes, index, types } = useDocumentTypes("manager");
  const team = useOrgEmployees("shift_assignment");
  const { toast, showToast, clearToast } = useToast();

  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState(null);
  const [asking, setAsking] = useState(null); // { userId, presetTypeId }
  const [uploading, setUploading] = useState(null); // { userId, presetTypeId, presetTitle, askedFor }

  const nameOf = useCallback(
    (id, fallback) => team.options.find((o) => o.id === id)?.name || fallback || (team.loading ? "Loading…" : "Team member"),
    [team.options, team.loading],
  );
  const rowsById = useMemo(() => new Map(team.options.map((o) => [o.id, o.raw || o])), [team.options]);
  const personOf = useCallback((id) => rowsById.get(id) || { name: nameOf(id) }, [rowsById, nameOf]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.list({ user_id: userId || undefined, ...requestFilterQuery(status), page, limit: PAGE });
      if (token !== reqRef.current) return;
      setState({ ...requestListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [userId, status, page]);

  useEffect(() => { load(); }, [load]);

  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const wanted = [OVERDUE_ONLY, OUTSTANDING, "fulfilled"];
    const results = await Promise.allSettled(
      wanted.map((f) => plane.list({ user_id: userId || undefined, ...requestFilterQuery(f), limit: 1 })),
    );
    if (token !== tallyRef.current) return;
    setTallies(Object.fromEntries(wanted.map((f, i) => [
      f, results[i].status === "fulfilled" ? requestListOf(results[i].value).total : null,
    ])));
  }, [userId]);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refreshAll = useCallback(() => { load(); loadTallies(); setRefreshKey((k) => k + 1); }, [load, loadTallies]);

  const update = (patch) => {
    const next = { tab: tab === "requests" ? "" : tab, user: userId, status, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
    setPage(1);
  };

  const filtered = !!(userId || status);

  const uploadTypeIds = useMemo(() => new Set(uploadTypes.map((t) => t.id)), [uploadTypes]);

  /** Put the document in for a report (F3), from the request that asked for it. */
  const uploadForRequest = (req) => {
    const who = nameOf(req?.user_id, "this team member");
    const asker = req?.requested_by ? nameOf(req.requested_by, requesterRoleLabel(req?.requested_by_role)) : requesterRoleLabel(req?.requested_by_role);
    setDetail(null);
    setUploading({
      userId: req?.user_id,
      subjectName: who,
      presetTypeId: req?.document_type_id || "",
      presetTitle: index.get(req?.document_type_id)?.name || "",
      askedFor: {
        headline: `${asker} asked ${who} for this${req?.created_at ? ` on ${fmtDate(req.created_at)}` : ""}`,
        note: req?.note || "",
        dueOn: req?.due_on || "",
      },
    });
  };

  const onUploaded = (doc) => {
    const who = uploading?.subjectName || "them";
    setUploading(null);
    const base = doc?.status === "pending_verification" ? `Added to ${who}'s file — HR still needs to check it` : `Added to ${who}'s file`;
    showToast(doc?.fulfilled_request_id ? `${base}. That closes the request for it.` : base);
    refreshAll();
  };
  const overdue = tallies[OVERDUE_ONLY];
  // Managers can't request anything when the organisation hasn't opened a single
  // type to them. Saying so beats a button that always refuses.
  const canRequest = uploadTypes.length > 0;

  return (
    <>
      <DashboardTopBar title="Team Document Requests" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Team Document Requests</h1>
            <p className="text-sm text-slate-500 mt-1">
              What has been asked of your team and who is late, plus what each person’s job needs on file. A request closes itself the moment they upload the document.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refreshAll} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setAsking({ userId, presetTypeId: "" })}
              disabled={!canRequest}
              title={!canRequest ? "Your organisation hasn't opened any kind of document for managers to ask for." : undefined}
              className={PRIMARY_BTN}
            >
              <HiClipboardList className="w-4 h-4" /> Ask for a document
            </button>
          </div>
        </div>

        {overdue > 0 && status !== OVERDUE_ONLY && (
          <button
            type="button"
            onClick={() => update({ tab: "", status: OVERDUE_ONLY })}
            className="w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left hover:bg-rose-100/60 transition"
          >
            <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-sm font-semibold text-rose-800 flex-1">
              {overdue === 1 ? "One document on your team is" : `${overdue} documents on your team are`} past their deadline. They’re getting a reminder every morning — a word in person usually works faster.
            </span>
            <span className="text-xs font-bold text-rose-700">Show me</span>
          </button>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Tile
            label="Overdue" value={overdue ?? "…"} sub="Past their deadline"
            icon={HiExclamationCircle} tone="text-rose-500" alert={!!overdue}
            onClick={() => update({ tab: "", status: status === OVERDUE_ONLY ? "" : OVERDUE_ONLY })} active={status === OVERDUE_ONLY}
          />
          <Tile
            label="Still open" value={tallies[OUTSTANDING] ?? "…"} sub="Asked for and not yet provided"
            icon={HiClock} tone="text-fuchsia-500"
            onClick={() => update({ tab: "", status: status === OUTSTANDING ? "" : OUTSTANDING })} active={status === OUTSTANDING}
          />
          <Tile
            label="Done" value={tallies.fulfilled ?? "…"} sub="Closed by their upload"
            icon={HiCheckCircle} tone="text-violet-500"
            onClick={() => update({ tab: "", status: status === "fulfilled" ? "" : "fulfilled" })} active={status === "fulfilled"}
          />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="View">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                  onClick={() => update({ tab: t.key === "requests" ? "" : t.key })}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === t.key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="md:w-64">
              <PersonSelect
                people={team.options}
                value={userId}
                onChange={(id) => update({ user: id })}
                placeholder={tab === "checklist" ? "Choose a team member" : "Whole team"}
                clearLabel="Whole team"
                loading={team.loading}
                emptyText="No reports found."
                aria-label="Team member"
              />
            </div>
            {tab === "requests" && (
              <select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })} className={SELECT}>
                {REQUEST_FILTERS.map((f) => <option key={f.value || "all"} value={f.value}>{f.value ? f.label : "Any status"}</option>)}
              </select>
            )}
            {filtered && (
              <button type="button" onClick={() => update({ user: "", status: "" })} className="text-xs font-bold text-purple-600 hover:underline px-2">Clear</button>
            )}
            {userId && (
              <Link to={`/dashboard/manager/team/member/${userId}?tab=documents`} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap px-2">
                Their whole file <HiExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {tab === "checklist" ? (
          userId ? (
            <ChecklistPanel
              plane={plane}
              userId={userId}
              subjectName={nameOf(userId, "this team member")}
              refreshKey={refreshKey}
              showToast={showToast}
              onRequestsChanged={refreshAll}
              onRequestOne={canRequest ? (item) => setAsking({ userId, presetTypeId: item.document_type_id }) : undefined}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
              <DocEmptyState
                icon={HiUserGroup}
                title="Choose a team member"
                message="Pick someone above to see the documents their job requires and how much of it they’ve provided."
              />
            </div>
          )
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            {state.error ? (
              <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your team's requests." />
            ) : state.loading && state.rows.length === 0 ? (
              <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : state.rows.length === 0 ? (
              <DocEmptyState
                icon={status === OVERDUE_ONLY ? HiCheckCircle : HiClipboardList}
                title={status === OVERDUE_ONLY ? "Nobody on your team is late" : filtered ? "Nothing matches" : "Nothing has been asked of your team"}
                message={status === OVERDUE_ONLY
                  ? "Everything asked of your team is still within its deadline."
                  : filtered
                    ? "Try another person or status."
                    : "Neither you nor HR has asked anyone on your team for a document. Pick a person to see what their job needs."}
                action={!filtered
                  ? <button type="button" onClick={() => update({ tab: "checklist" })} className={SECONDARY_BTN}><HiClipboardCheck className="w-4 h-4" /> See what one person needs</button>
                  : null}
              />
            ) : (
              <div className={state.loading ? "opacity-60" : ""}>
                <RequestsTable
                  rows={state.rows}
                  types={index}
                  personOf={personOf}
                  nameOf={nameOf}
                  onOpen={setDetail}
                  showReminders={plane.showsReminders}
                  pagination={{ page, total: state.total, limit: PAGE, onPageChange: setPage }}
                />
              </div>
            )}
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
          <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
          <span>
            You can withdraw a request you raised yourself; HR’s requests are theirs to withdraw. Reminder emails go out every morning automatically while something is overdue — there’s nothing for you to send.
            {types.length > 0 && uploadTypes.length === 0 && " Your organisation hasn't opened any kind of document for managers to ask for, so only HR can request from your team."}
          </span>
        </p>
      </main>

      {asking && (
        <AskDialog
          team={team.options}
          teamLoading={team.loading}
          initialUserId={asking.userId}
          presetTypeId={asking.presetTypeId}
          nameOf={nameOf}
          types={uploadTypes}
          onDone={(created, who) => {
            setAsking(null);
            showToast(`Asked ${who} for it. They’ll see it in their portal straight away.`);
            refreshAll();
            if (created?.id) setDetail(created);
          }}
          onClose={() => setAsking(null)}
        />
      )}

      {detail && (
        <DocumentRequestDetailDialog
          request={detail}
          plane={plane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={refreshAll}
          onUpload={uploadForRequest}
          uploadTypeIds={uploadTypeIds}
          onClose={() => setDetail(null)}
        />
      )}

      {uploading && (
        <DocumentUploadDialog
          types={uploadTypes}
          presetTypeId={uploading.presetTypeId}
          presetTitle={uploading.presetTitle}
          askedFor={uploading.askedFor}
          subjectName={uploading.subjectName}
          issue={(payload) => docPlane.issue(uploading.userId, payload)}
          confirm={docPlane.confirm}
          onDraftLeft={refreshAll}
          onDone={onUploaded}
          onClose={() => setUploading(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/** Choose the report first, then the same request form used everywhere else. */
function AskDialog({ team, teamLoading, initialUserId = "", presetTypeId = "", nameOf, types, onDone, onClose }) {
  const [userId, setUserId] = useState(initialUserId);

  if (!userId) {
    return (
      <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-label="Choose a team member" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Who are you asking?</h2>
            <p className="text-xs text-slate-500 mt-0.5">Only people who report to you, and only the kinds of document your organisation lets managers ask for.</p>
          </div>
          <PersonSelect people={team} value={userId} onChange={setUserId} placeholder="Choose a team member" loading={teamLoading} emptyText="No reports found." aria-label="Team member" />
          <div className="flex justify-end"><button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button></div>
        </div>
      </div>
    );
  }

  const who = nameOf(userId, "this team member");
  return (
    <RequestDocumentDialog
      types={types}
      presetTypeId={presetTypeId}
      subjectName={who}
      create={(payload) => plane.create(userId, payload)}
      onDone={(created) => onDone(created, who)}
      onClose={onClose}
    />
  );
}

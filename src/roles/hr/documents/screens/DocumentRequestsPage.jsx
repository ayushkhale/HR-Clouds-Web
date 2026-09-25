// ─────────────────────────────────────────────────────────────────────────────
// DocumentRequestsPage.jsx — Everything HR has asked people for, across the
// whole organisation (#82), with the detail, the nudge and the withdrawal
// (#83–#85) behind each row, and "ask someone" (#80) in the header.
//
// This is the chasing screen: the question it answers is "who owes us a
// document, and how late are they?". So it opens on the overdue list rather
// than on everything, and the four tiles above are the shortcuts between them.
//
// No row is ever ticked off here. A request closes itself the moment a matching
// document is confirmed — which is why "Done" rows carry a link to the document
// that met them rather than a button.
//
// One employee's whole picture (their file, their required documents, their
// requests) lives on Employee Documents; this screen is the org-wide roll-up.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiCheckCircle, HiClipboardList, HiClock, HiExclamationCircle, HiExternalLink, HiRefresh, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import RequestsTable from "../../../../shared/documents/RequestsTable";
import RequestDocumentDialog from "../../../../shared/documents/RequestDocumentDialog";
import DocumentRequestDetailDialog from "../../../../shared/documents/DocumentRequestDetailDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import useDocumentSettings from "../../../../shared/documents/useDocumentSettings";
import { REQUEST_PLANES } from "../../../../shared/documents/requestPlanes";
import {
  OUTSTANDING, OVERDUE_ONLY, REQUEST_FILTERS, REQUEST_TALLIES, requestFilterQuery, requestListOf,
} from "../../../../shared/documents/requestMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;
const plane = REQUEST_PLANES.hr;

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

export default function DocumentRequestsPage() {
  // The filter lives in the URL so a chase list can be shared or bookmarked,
  // and so coming back from an employee's file lands where you left off.
  const [params, setParams] = useSearchParams();
  const status = REQUEST_FILTERS.some((f) => f.value && f.value === params.get("status")) ? params.get("status") : "";
  const userId = params.get("user") || "";
  const typeId = params.get("type") || "";

  const { types, uploadTypes, index } = useDocumentTypes("hr");
  // Only so the request dialog can say what "leave the date blank" means.
  const { requestDueDays } = useDocumentSettings();
  const { rows: people, nameOf, status: peopleStatus } = useEmployeeDirectory();
  const { toast, showToast, clearToast } = useToast();

  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({});
  const [detail, setDetail] = useState(null);
  const [asking, setAsking] = useState(null); // { userId }

  const query = useMemo(() => ({
    ...requestFilterQuery(status),
    user_id: userId || undefined,
    document_type_id: typeId || undefined,
  }), [status, userId, typeId]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getDocumentRequests({ ...query, page, limit: PAGE });
      if (token !== reqRef.current) return;
      setState({ ...requestListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  /**
   * The four headline numbers. Each is a `limit: 1` read for its own filter —
   * four cheap count queries beat one big read, because the list is paged and
   * `total` only ever describes the filter that fetched it. "Still open" counts
   * the overdue ones too, so the two tiles read as "12 open, 3 of them late"
   * rather than as two sets that have to be added up.
   */
  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const scope = { user_id: userId || undefined, document_type_id: typeId || undefined };
    const results = await Promise.allSettled(
      REQUEST_TALLIES.map((f) => documentsAPI.getDocumentRequests({ ...scope, ...requestFilterQuery(f), limit: 1 })),
    );
    if (token !== tallyRef.current) return;
    setTallies(Object.fromEntries(REQUEST_TALLIES.map((f, i) => [
      f, results[i].status === "fulfilled" ? requestListOf(results[i].value).total : null,
    ])));
  }, [userId, typeId]);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);

  const update = (patch) => {
    const next = { status, user: userId, type: typeId, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
    setPage(1);
  };

  const rowsById = useMemo(() => new Map(people.map((p) => [p.user_id ?? p.id, p])), [people]);
  const personOf = useCallback((id) => rowsById.get(id) || { name: nameOf(id, "Employee") }, [rowsById, nameOf]);

  const employeeTypes = useMemo(() => types.filter((t) => (t.plane || "employee") === "employee"), [types]);
  const filtered = !!(status || userId || typeId);

  return (
    <>
      <DashboardTopBar title="Document Requests" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Document Requests</h1>
            <p className="text-sm text-slate-500 mt-1">
              Everything you’ve asked people for, and who is late. A request closes itself as soon as the document arrives — you never have to tick one off.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setAsking({ userId })}
              disabled={uploadTypes.length === 0}
              title={uploadTypes.length === 0 ? "Activate a document type first." : undefined}
              className={PRIMARY_BTN}
            >
              <HiClipboardList className="w-4 h-4" /> Ask for a document
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label="Overdue" value={tallies[OVERDUE_ONLY] ?? "…"} sub="Past their due date"
            icon={HiExclamationCircle} tone="text-rose-500" alert={!!tallies[OVERDUE_ONLY]}
            onClick={() => update({ status: status === OVERDUE_ONLY ? "" : OVERDUE_ONLY })} active={status === OVERDUE_ONLY}
          />
          <Tile
            label="Still open" value={tallies[OUTSTANDING] ?? "…"} sub="Asked for and not yet provided"
            icon={HiClock} tone="text-fuchsia-500"
            onClick={() => update({ status: status === OUTSTANDING ? "" : OUTSTANDING })} active={status === OUTSTANDING}
          />
          <Tile
            label="Done" value={tallies.fulfilled ?? "…"} sub="Closed by the document arriving"
            icon={HiCheckCircle} tone="text-violet-500"
            onClick={() => update({ status: status === "fulfilled" ? "" : "fulfilled" })} active={status === "fulfilled"}
          />
          <Tile
            label="Cancelled" value={tallies.cancelled ?? "…"} sub="Withdrawn, with a reason"
            icon={HiX} tone="text-indigo-500"
            onClick={() => update({ status: status === "cancelled" ? "" : "cancelled" })} active={status === "cancelled"}
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="md:w-72">
            <PersonSelect
              people={people}
              value={userId}
              onChange={(id) => update({ user: id })}
              placeholder="Anyone"
              clearLabel="Anyone"
              loading={peopleStatus === "loading"}
              aria-label="Employee"
            />
          </div>
          <select aria-label="Kind of document" value={typeId} onChange={(e) => update({ type: e.target.value })} className={SELECT}>
            <option value="">Any kind of document</option>
            {employeeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active === false ? " (switched off)" : ""}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })} className={SELECT}>
            {REQUEST_FILTERS.map((f) => <option key={f.value || "all"} value={f.value}>{f.value ? f.label : "Any status"}</option>)}
          </select>
          {filtered && (
            <button type="button" onClick={() => update({ status: "", user: "", type: "" })} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
              <HiX className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          {userId && (
            <Link to={`/dashboard/hr/documents/employees?user=${userId}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap px-2">
              Their whole file <HiExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the document requests." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={status === OVERDUE_ONLY ? HiCheckCircle : HiClipboardList}
              title={status === OVERDUE_ONLY ? "Nobody is late" : filtered ? "Nothing matches" : "Nothing has been asked for yet"}
              message={status === OVERDUE_ONLY
                ? "Every document that has been asked for is still within its deadline."
                : filtered
                  ? "Try a different person, kind of document or status."
                  : "Ask someone for a document here, or open an employee’s file and use Required documents to ask for everything outstanding in one go."}
              action={!filtered && uploadTypes.length > 0
                ? <button type="button" onClick={() => setAsking({ userId: "" })} className={PRIMARY_BTN}><HiClipboardList className="w-4 h-4" /> Ask for a document</button>
                : filtered
                  ? <button type="button" onClick={() => update({ status: "", user: "", type: "" })} className={SECONDARY_BTN}>Clear the filters</button>
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

        <p className="text-[11px] text-slate-400">
          Reminder emails go out every morning while a request is overdue, at most one a day and at most five in all. Nudging from a request sends today’s straight away. None of it sends unless request emails are switched on in Document Settings.
        </p>
      </main>

      {asking && (
        <AskDialog
          people={people}
          peopleLoading={peopleStatus === "loading"}
          initialUserId={asking.userId}
          nameOf={nameOf}
          types={uploadTypes}
          defaultDueDays={requestDueDays}
          onDone={(created, who) => {
            setAsking(null);
            showToast(`Asked ${who} for it. They’ll see it in their portal straight away.`);
            refresh();
            if (created?.id) setDetail(created);
          }}
          onOpenExisting={(id) => { setAsking(null); setDetail({ id }); }}
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
          onChanged={refresh}
          onClose={() => setDetail(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/**
 * Asking from the org-wide list needs one extra step the per-person panel
 * doesn't: choosing the person. They are asked for first, on their own, so the
 * request form can then be exactly the same form as everywhere else.
 */
function AskDialog({ people, peopleLoading, initialUserId = "", nameOf, types, defaultDueDays, onDone, onOpenExisting, onClose }) {
  const [userId, setUserId] = useState(initialUserId);

  if (!userId) {
    return (
      <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-label="Choose an employee" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Who are you asking?</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pick the person, then say what you need from them.</p>
          </div>
          <PersonSelect people={people} value={userId} onChange={setUserId} placeholder="Choose an employee" loading={peopleLoading} aria-label="Employee" />
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const who = nameOf(userId, "this employee");
  return (
    <RequestDocumentDialog
      types={types}
      subjectName={who}
      defaultDueDays={defaultDueDays}
      create={(payload) => plane.create(userId, payload)}
      onDone={(created) => onDone(created, who)}
      onOpenExisting={onOpenExisting}
      onClose={onClose}
    />
  );
}

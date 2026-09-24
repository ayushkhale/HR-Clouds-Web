// ─────────────────────────────────────────────────────────────────────────────
// OrgProposalsPage.jsx — A manager's own proposals (#62–#69): a letter or
// notice drafted for one person on their team and sent to HR to issue.
//
// A manager never publishes. They write the proposal, attach the file, and HR
// either issues it to that person or declines it with a reason — which is what
// this screen shows, one row per proposal and its outcome.
//
// When the organisation has team documents switched off, #62 answers with an
// empty list rather than an error, so that case is an explanation, not a
// failure state.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheckCircle, HiDocumentAdd, HiInbox, HiPencilAlt, HiRefresh, HiXCircle } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { useOrgEmployees } from "../../../../shared/attendance/EmployeePicker";
import OrgDocumentTable from "../../../../shared/documents/OrgDocumentTable";
import OrgDocumentDetailDialog from "../../../../shared/documents/OrgDocumentDetailDialog";
import OrgDocumentFormDialog from "../../../../shared/documents/OrgDocumentFormDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { ORG_PLANES } from "../../../../shared/documents/orgDocumentPlanes";
import { listPayload } from "../../../../shared/documents/documentMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN } from "../../../../shared/documents/ui";

const PAGE = 25;
const plane = ORG_PLANES.manager;

export default function OrgProposalsPage() {
  const { uploadTypes, index, loading: typesLoading, error: typesError } = useDocumentTypes("managerOrg");
  const team = useOrgEmployees("shift_assignment");
  const { toast, showToast, clearToast } = useToast();

  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // "new" | draft row

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.list({ limit: PAGE, offset: (page - 1) * PAGE });
      if (token !== reqRef.current) return;
      setState({ ...listPayload(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const nameOf = useCallback(
    (id, fallback) => team.options.find((o) => o.id === id)?.name || fallback || (team.loading ? "Loading…" : "Team member"),
    [team.options, team.loading],
  );
  // A proposal targets exactly one person, so the person columns resolve from the roster.
  const resolveTarget = useCallback((dimension, id) => (dimension.kind === "person" ? nameOf(id, null) : id), [nameOf]);

  const outcomes = useMemo(() => ({
    waiting: state.rows.filter((r) => r.status === "draft").length,
    issued: state.rows.filter((r) => ["published", "superseded", "retired"].includes(r.status)).length,
    declined: state.rows.filter((r) => r.status === "rejected").length,
  }), [state.rows]);

  // #62 returning nothing is the organisation's setting, not a fault.
  const turnedOff = !typesLoading && !typesError && uploadTypes.length === 0;

  const onSaved = (doc, message) => {
    setEditing(null);
    showToast(message);
    load();
    if (doc?.id) setDetail(doc);
  };

  return (
    <>
      <DashboardTopBar title="Document Proposals" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Document Proposals</h1>
            <p className="text-sm text-slate-500 mt-1">
              Letters and notices you’ve drafted for someone on your team. HR issues them to that person, or sends them back with a reason.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => setEditing("new")} disabled={turnedOff || typesLoading} className={PRIMARY_BTN}>
              <HiDocumentAdd className="w-4 h-4" /> New proposal
            </button>
          </div>
        </div>

        {turnedOff && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Your organisation hasn’t opened any documents for managers to propose.</p>
            <p className="text-xs text-slate-500 mt-1">Ask HR to allow it for the kinds of document you need — a warning letter or a performance plan, for example.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Waiting on HR (this page)", value: outcomes.waiting, icon: HiInbox, tone: "text-purple-500" },
            { label: "Issued (this page)", value: outcomes.issued, icon: HiCheckCircle, tone: "text-violet-500" },
            { label: "Sent back (this page)", value: outcomes.declined, icon: HiXCircle, tone: "text-rose-500" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl bg-white border border-slate-100 shadow-xs px-4 py-3.5">
              <div className="flex items-center gap-2 text-slate-400">
                <Icon className={`w-4 h-4 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
              </div>
              <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none mt-2 tabular-nums">{state.loading && !state.rows.length ? "…" : value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your proposals." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={HiPencilAlt}
              title="You haven't proposed anything yet"
              message={turnedOff
                ? "This becomes available once HR opens a document type for managers."
                : "Draft a letter or notice for someone on your team and send it to HR. Nothing reaches the person until HR issues it."}
              action={!turnedOff ? (
                <button type="button" onClick={() => setEditing("new")} className={PRIMARY_BTN}><HiDocumentAdd className="w-4 h-4" /> New proposal</button>
              ) : null}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <OrgDocumentTable
                rows={state.rows}
                types={index}
                onOpen={setDetail}
                nameOf={nameOf}
                pagination={{ page, total: state.total, limit: PAGE, onPageChange: setPage }}
              />
            </div>
          )}
        </div>
      </main>

      {detail && (
        <OrgDocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          resolveTarget={resolveTarget}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={load}
          onEdit={(row) => { setDetail(null); setEditing(row); }}
          onClose={() => setDetail(null)}
        />
      )}

      {editing && (
        <OrgDocumentFormDialog
          mode={editing === "new" ? "create" : "edit"}
          plane={plane}
          types={uploadTypes}
          doc={editing === "new" ? null : editing}
          targeting={{ departmentOptions: [], locationOptions: [], employmentTypeOptions: [], jobStatusOptions: [] }}
          people={team.options}
          peopleLoading={team.loading}
          onSaved={onSaved}
          onDraftLeft={load}
          onClose={() => setEditing(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IssuedDocumentsPage.jsx — "Company documents": the policies, notices and
// letters the organisation has issued to me (#70–#75). Mounted in every
// workspace, because everyone receives these.
//
// This is the other half of My Documents. That screen is the file I keep about
// myself; this one is what the company has handed me, and what it asks of me:
// to read it, and sometimes to acknowledge it (#73) or sign it (#74).
//
// "Needs you" / "Overdue" / "Done" come from the server's compliance verdict
// (#70 `compliance_state`), judged on today's IST date — never recomputed here.
// Opening a document records that I've read it (#72), so that is always a
// deliberate click, never a background call.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiBadgeCheck, HiBell, HiCheckCircle, HiExclamationCircle, HiInbox, HiLockClosed, HiPencilAlt,
  HiRefresh, HiShieldCheck,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { documentsAPI } from "../api";
import { FilterTabs, Pagination, Toast, useToast } from "../attendance/ui";
import { fmtDate } from "../attendance/dates";
import OrgDocumentDetailDialog from "../documents/OrgDocumentDetailDialog";
import useDocumentTypes from "../documents/useDocumentTypes";
import { ORG_PLANES } from "../documents/orgDocumentPlanes";
import { listPayload, typeIndex } from "../documents/documentMeta";
import { documentTypeName, orgDisplayStatus } from "../documents/orgDocumentMeta";
import { ackBlockOf, actionWindow, asksForSomething, hasEvidence, nextActionOf, obligationLabel } from "../documents/complianceMeta";
import { DocEmptyState, DocErrorState, DocIcon, PRIMARY_BTN } from "../documents/ui";
import { ComplianceStateBadge, DueChip, OrgStatusBadge, RecipientStateBadge } from "../documents/orgUi";

const PAGE = 24;
const plane = ORG_PLANES.self;

// `compliance_state` on #70 — completed | pending | overdue | waived.
const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Needs you" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Done" },
  { value: "waived", label: "Excused" },
];

function Tile({ label, value, icon: Icon, tone = "text-purple-500", onClick, active, alert = false }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-2xl border px-4 py-3.5 transition ${active ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100" : alert ? "bg-rose-50/40 border-rose-200 hover:border-rose-300" : "bg-white border-slate-100 hover:border-purple-200 shadow-xs"}`}
    >
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums ${alert ? "text-rose-700" : "text-slate-800"}`}>{value}</p>
    </button>
  );
}

/** One issued document, as a card — a list row would bury the deadline and the action. */
function IssuedCard({ row, typeName, onOpen }) {
  const doc = row.document || {};
  const block = ackBlockOf(row);
  const next = nextActionOf(row);
  const win = actionWindow(doc);
  const done = hasEvidence(row);
  const tracked = asksForSomething(doc);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(row); } }}
      className={`h-full text-left rounded-2xl border bg-white hover:bg-purple-50/20 shadow-xs transition p-4 flex items-start gap-3.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-purple-200 ${block.isOverdue && next ? "border-rose-200 hover:border-rose-300" : "border-slate-100 hover:border-purple-200"}`}
    >
      <DocIcon doc={doc} className="w-10 h-10" />
      <div className="min-w-0 flex-1 flex flex-col h-full">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5 min-w-0">
            <span className="truncate">{doc.title}</span>
            {doc.is_confidential && <HiLockClosed className="w-3.5 h-3.5 text-purple-500 shrink-0" title="Confidential" />}
          </p>
          {tracked && block.state
            ? <ComplianceStateBadge state={block.state} className="shrink-0" />
            : <RecipientStateBadge state={row.state} className="shrink-0" />}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
          {[typeName, doc.version > 1 ? `Version ${doc.version}` : null, obligationLabel(doc)].filter(Boolean).join(" · ")}
        </p>
        {doc.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{doc.description}</p>}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-auto pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
            <OrgStatusBadge status={orgDisplayStatus(doc)} />
            {next && win.open && (
              <DueChip daysRemaining={block.daysRemaining} dueOn={block.dueOn} fmt={fmtDate} withDate />
            )}
            {done && (block.signedAt || block.acknowledgedAt) && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700">
                <HiShieldCheck className="w-3.5 h-3.5" /> {row.state === "signed" ? "Signed" : "Acknowledged"} {fmtDate(block.signedAt || block.acknowledgedAt)}
              </span>
            )}
            {next && win.reason === "scheduled" && doc.effective_from && (
              <span className="text-[11px] text-slate-400">Opens {fmtDate(doc.effective_from)}</span>
            )}
          </div>
          {/* Opens the document with the confirm step already up. */}
          {next && win.open && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen(row, next); }}
              className={`${PRIMARY_BTN} !px-3.5 !py-1.5 !text-xs !shadow-none`}
            >
              {next === "sign" ? <HiPencilAlt className="w-3.5 h-3.5" /> : <HiBadgeCheck className="w-3.5 h-3.5" />}
              {next === "sign" ? "Sign" : "Acknowledge"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IssuedDocumentsPage() {
  // The type name comes nested on each row (#70 `document_type.name`); this
  // list is the fallback for rows from before that shipped.
  const { types } = useDocumentTypes("self");
  const { toast, showToast, clearToast } = useToast();

  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({ all: null, pending: null, overdue: null, completed: null });
  const [blocking, setBlocking] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getMyIssuedDocuments({
        compliance_state: filter || undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      setState({ ...listPayload(res), loading: false, error: null });
    } catch (error) {
      setState({ rows: [], total: 0, loading: false, error });
    }
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  /** One-row reads for each tile's total, across every page. */
  const loadTallies = useCallback(async () => {
    const [all, pending, overdue, completed] = await Promise.allSettled([
      documentsAPI.getMyIssuedDocuments({ limit: 1 }),
      documentsAPI.getMyIssuedDocuments({ compliance_state: "pending", limit: 1 }),
      // Overdue rows are also read in full (up to 100) to learn whether the
      // organisation flags them as blocking.
      documentsAPI.getMyIssuedDocuments({ compliance_state: "overdue", limit: 100 }),
      documentsAPI.getMyIssuedDocuments({ compliance_state: "completed", limit: 1 }),
    ]);
    const total = (r) => (r.status === "fulfilled" ? listPayload(r.value).total : null);
    setTallies({ all: total(all), pending: total(pending), overdue: total(overdue), completed: total(completed) });
    setBlocking(overdue.status === "fulfilled" && listPayload(overdue.value).rows.some((r) => r?.acknowledgement?.is_blocking));
  }, []);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);

  const index = useMemo(() => typeIndex(types), [types]);
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const pick = (next) => { setFilter(next); setPage(1); };
  const count = (v) => (v === null ? "…" : v);
  const overdue = Number(tallies.overdue) || 0;

  return (
    <>
      <DashboardTopBar title="Company Documents" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Company Documents</h1>
            <p className="text-sm text-slate-500 mt-1">
              Policies, notices and letters your organisation has issued to you. Some only need reading; others ask you to acknowledge or sign them.
            </p>
          </div>
          <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50 shrink-0 self-start sm:self-auto" aria-label="Refresh" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {overdue > 0 && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${blocking ? "border-rose-300 bg-rose-100/70" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex items-start gap-3 min-w-0">
              {blocking ? <HiExclamationCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" /> : <HiBell className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-sm font-bold text-rose-800">
                  {overdue === 1 ? "One document is overdue." : `${overdue} documents are overdue.`}
                </p>
                <p className="text-xs text-rose-700 mt-0.5">
                  {blocking
                    ? "Your organisation treats overdue documents as a priority. Please acknowledge or sign them first."
                    : "The date you were asked to acknowledge or sign them by has passed. It only takes a minute."}
                </p>
              </div>
            </div>
            {filter !== "overdue" && (
              <button type="button" onClick={() => pick("overdue")} className="text-xs font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 px-3 py-1.5 rounded-lg shrink-0">
                Show them
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Issued to you" value={count(tallies.all)} icon={HiInbox} onClick={() => pick("")} active={filter === ""} />
          <Tile label="Needs you" value={count(tallies.pending)} icon={HiBadgeCheck} tone="text-fuchsia-500" onClick={() => pick("pending")} active={filter === "pending"} />
          <Tile label="Overdue" value={count(tallies.overdue)} icon={HiExclamationCircle} tone="text-rose-500" onClick={() => pick("overdue")} active={filter === "overdue"} alert={overdue > 0 && filter !== "overdue"} />
          <Tile label="Done" value={count(tallies.completed)} icon={HiCheckCircle} tone="text-violet-500" onClick={() => pick("completed")} active={filter === "completed"} />
        </div>

        <FilterTabs options={FILTERS} value={filter} onChange={pick} />

        {state.error ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your company documents." />
          </div>
        ) : state.loading && state.rows.length === 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : state.rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <DocEmptyState
              icon={filter === "completed" ? HiCheckCircle : HiInbox}
              title={
                filter === "pending" ? "Nothing needs you right now"
                  : filter === "overdue" ? "Nothing is overdue"
                    : filter ? "Nothing here" : "Nothing has been issued to you yet"
              }
              message={
                filter === "pending" || filter === "overdue" ? "You're all caught up."
                  : filter ? "Try another filter to see the rest."
                    : "When your organisation publishes a policy, notice or letter addressed to you, it appears here."
              }
              action={filter ? <button type="button" onClick={() => pick("")} className={PRIMARY_BTN}>Show everything</button> : null}
            />
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 xl:grid-cols-2 gap-3 ${state.loading ? "opacity-60" : ""}`}>
              {state.rows.map((row) => (
                <IssuedCard
                  key={row.id}
                  row={row}
                  typeName={documentTypeName(row.document, index)}
                  onOpen={(r, action = null) => setDetail({ row: r, action })}
                />
              ))}
            </div>
            {state.total > PAGE && (
              <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="document" />
            )}
          </>
        )}
      </main>

      {detail && (
        <OrgDocumentDetailDialog
          doc={detail.row.document}
          recipient={detail.row}
          initialAction={detail.action}
          plane={plane}
          types={index}
          showToast={showToast}
          onChanged={refresh}
          onClose={() => { setDetail(null); refresh(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

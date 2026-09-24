// ─────────────────────────────────────────────────────────────────────────────
// OrgDocumentsPage.jsx — The policies, notices and letters this organisation
// issues to its people (#43–#61).
//
// Two tabs:
//   All documents      — everything HR has written, at any stage (#52)
//   Manager proposals  — drafts a manager wrote for one of their team and sent
//                        here to be issued or declined (#53)
//
// Writing, publishing, withdrawing and the recipient roster all happen in the
// dialogs; this screen finds the document and keeps the counts honest.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiClipboardCheck, HiDocumentAdd, HiDocumentText, HiInbox, HiPencilAlt, HiRefresh, HiSearch, HiSparkles, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { useTargetingOptions } from "../../../../shared/attendance/useTargetingOptions";
import OrgDocumentTable from "../../../../shared/documents/OrgDocumentTable";
import OrgDocumentDetailDialog from "../../../../shared/documents/OrgDocumentDetailDialog";
import OrgDocumentFormDialog from "../../../../shared/documents/OrgDocumentFormDialog";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { ORG_PLANES } from "../../../../shared/documents/orgDocumentPlanes";
import { listPayload } from "../../../../shared/documents/documentMeta";
import { ORG_STATUS_FILTERS } from "../../../../shared/documents/orgDocumentMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;
const plane = ORG_PLANES.hr;

export default function OrgDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "proposals" ? "proposals" : "all";
  const setTab = (next) => setParams(next === "proposals" ? { tab: "proposals" } : {}, { replace: true });

  const { types, uploadTypes, index } = useDocumentTypes("hrOrg");
  const { rows: people, status: dirStatus, nameOf } = useEmployeeDirectory();
  const targeting = useTargetingOptions();
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ status: "", type_id: "", q: "" });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({ live: null, drafts: null, proposals: null });
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // "new" | draft row
  // The org's default acknowledgement window prefills new drafts. Best effort:
  // the form falls back to 14 days if settings can't be read.
  const [defaultAckDays, setDefaultAckDays] = useState(undefined);

  useEffect(() => {
    let alive = true;
    documentsAPI.getSettings()
      .then((res) => {
        const days = Number(res?.data?.document_acknowledgement_due_days);
        if (alive && Number.isInteger(days) && days >= 1 && days <= 365) setDefaultAckDays(days);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Debounce the title search so every keystroke isn't a request.
  useEffect(() => {
    const id = setTimeout(() => { setFilters((f) => ({ ...f, q: query.trim().slice(0, 200) })); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = tab === "proposals"
        ? await documentsAPI.getOrgProposals({ limit: PAGE, offset: (page - 1) * PAGE })
        : await documentsAPI.getOrgDocuments({
          status: filters.status || undefined,
          type_id: filters.type_id || undefined,
          q: filters.q || undefined,
          limit: PAGE,
          offset: (page - 1) * PAGE,
        });
      if (token !== reqRef.current) return;
      setState({ ...listPayload(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [tab, filters, page]);

  useEffect(() => { load(); }, [load]);

  /** The three numbers on the tiles, each a one-row read for its total. */
  const loadTallies = useCallback(async () => {
    const [live, drafts, proposals] = await Promise.allSettled([
      documentsAPI.getOrgDocuments({ status: "published", limit: 1 }),
      documentsAPI.getOrgDocuments({ status: "draft", limit: 1 }),
      documentsAPI.getOrgProposals({ limit: 1 }),
    ]);
    const total = (r) => (r.status === "fulfilled" ? listPayload(r.value).total : null);
    setTallies({ live: total(live), drafts: total(drafts), proposals: total(proposals) });
  }, []);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);

  const updateFilters = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const onTab = (next) => { setTab(next); setPage(1); };

  // Rows carry ids; names come from the org roster and the targeting options.
  const rowsById = useMemo(() => new Map(people.map((p) => [p.user_id ?? p.id, p])), [people]);
  const resolveTarget = useCallback((dimension, id) => {
    if (dimension.kind === "department") return targeting.departmentOptions.find((o) => o.value === id)?.label || null;
    if (dimension.kind === "location") return targeting.locationOptions.find((o) => o.value === id)?.label || null;
    if (dimension.kind === "person") return rowsById.get(id)?.name || nameOf(id, null);
    return id;
  }, [targeting.departmentOptions, targeting.locationOptions, rowsById, nameOf]);

  const filtered = !!(filters.status || filters.type_id || filters.q);
  const noTypes = uploadTypes.length === 0;

  const onSaved = (doc, message, opts = {}) => {
    setEditing(null);
    showToast(message, opts.tone === "error" ? "error" : undefined);
    refresh();
    // Land on the document either way: after a plain save the next step
    // (publish) is one click, and after a publish this is where the recipient
    // roster lives.
    if (doc?.id) setDetail(doc);
  };

  return (
    <>
      <DashboardTopBar title="Organisation Documents" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Organisation Documents</h1>
            <p className="text-sm text-slate-500 mt-1">
              Policies, notices and letters your organisation issues to its people. Each one goes to the audience.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => setEditing("new")} disabled={noTypes} title={noTypes ? "Create an organisation document type first" : undefined} className={PRIMARY_BTN}>
              <HiDocumentAdd className="w-4 h-4" /> New document
            </button>
          </div>
        </div>

        {noTypes && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3">
            <p className="text-sm font-semibold text-fuchsia-800">
              Before you can issue anything, your organisation needs at least one <span className="font-bold">organisation document</span> type — a policy, a notice, a letter.
            </p>
            <Link to="/dashboard/hr/documents/types" className={SECONDARY_BTN}>Set one up</Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "In force now", value: tallies.live, icon: HiSparkles, tone: "text-violet-500" },
            { label: "Drafts, not issued yet", value: tallies.drafts, icon: HiPencilAlt, tone: "text-slate-400" },
            { label: "Manager proposals waiting", value: tallies.proposals, icon: HiInbox, tone: "text-purple-500" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl bg-white border border-slate-100 shadow-xs px-4 py-3.5">
              <div className="flex items-center gap-2 text-slate-400">
                <Icon className={`w-4 h-4 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
              </div>
              <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none mt-2 tabular-nums">{value === null ? "…" : value}</p>
            </div>
          ))}
        </div>

        <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="Organisation documents">
          {[["all", "All documents"], ["proposals", "Manager proposals"]].map(([key, label]) => (
            <button
              key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => onTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${tab === key ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
              {key === "proposals" && tallies.proposals > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-purple-600 text-white text-[10px] font-bold tabular-nums">{tallies.proposals}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "all" && (
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-0 md:max-w-xs">
              <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title"
                aria-label="Search organisation documents"
                className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              />
            </div>
            <select aria-label="Stage" value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })} className={SELECT}>
              {ORG_STATUS_FILTERS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label="Kind of document" value={filters.type_id} onChange={(e) => updateFilters({ type_id: e.target.value })} className={SELECT}>
              <option value="">Any kind</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active === false ? " (switched off)" : ""}</option>)}
            </select>
            {filtered && (
              <button type="button" onClick={() => { setQuery(""); updateFilters({ status: "", type_id: "", q: "" }); }} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
                <HiX className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your organisation documents." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            tab === "proposals" ? (
              <DocEmptyState
                icon={HiClipboardCheck}
                title="Nothing waiting from managers"
                message="When a manager drafts a letter for someone on their team, it arrives here for you to issue or decline."
              />
            ) : (
              <DocEmptyState
                icon={HiDocumentText}
                title={filtered ? "Nothing matches" : "No organisation documents yet"}
                message={filtered
                  ? "Try a different stage or search."
                  : "Write your first policy or notice, choose who it goes to, and publish it when you're ready."}
                action={!filtered && !noTypes ? (
                  <button type="button" onClick={() => setEditing("new")} className={PRIMARY_BTN}><HiDocumentAdd className="w-4 h-4" /> New document</button>
                ) : null}
              />
            )
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <OrgDocumentTable
                rows={state.rows}
                types={index}
                onOpen={setDetail}
                nameOf={nameOf}
                showProposer={tab === "proposals"}
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
          people={people}
          showToast={showToast}
          onChanged={refresh}
          onEdit={(row) => { setDetail(null); setEditing(row); }}
          onOpenDraft={(draft) => setDetail(draft)}
          onClose={() => setDetail(null)}
        />
      )}

      {editing && (
        <OrgDocumentFormDialog
          mode={editing === "new" ? "create" : "edit"}
          plane={plane}
          types={uploadTypes}
          doc={editing === "new" ? null : editing}
          targeting={targeting}
          people={people}
          peopleLoading={dirStatus === "loading"}
          canPublish
          defaultAckDays={defaultAckDays}
          onSaved={onSaved}
          onDraftLeft={refresh}
          onClose={() => setEditing(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamCompliancePage.jsx — Which of my team still have to acknowledge or sign
// a company document, and who is late (#79).
//
// One card per person, opening to their documents. The server decides scope:
// only my direct and indirect reports, never a confidential document, and
// nothing at all when the organisation turns team document visibility off
// (403 — shown as a plain notice, not an error). A person outside my team
// simply comes back empty.
//
// Managers can see and remind; they can't acknowledge, sign or excuse for
// anyone — those are the employee's own act, or HR's.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheckCircle, HiChevronDown, HiClipboardCheck, HiExclamationCircle, HiEyeOff, HiRefresh, HiUserGroup, HiX } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Pagination, PersonCell } from "../../../../shared/attendance/ui";
import { fmtDate } from "../../../../shared/attendance/dates";
import { useOrgEmployees } from "../../../../shared/attendance/EmployeePicker";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import { complianceListOf } from "../../../../shared/documents/complianceMeta";
import { ComplianceStateBadge, DueChip, RecipientStateBadge } from "../../../../shared/documents/orgUi";
import { DocEmptyState, DocErrorState, Switch } from "../../../../shared/documents/ui";
import { isTeamVisibilityOff } from "../../../../shared/utils/documentErrors";

const PAGE = 25;

function Tile({ label, value, icon: Icon, tone = "text-purple-500", alert = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${alert ? "bg-rose-50/40 border-rose-200" : "bg-white border-slate-100 shadow-xs"}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums ${alert ? "text-rose-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

/** One team member and the documents still asked of them. */
function MemberCard({ row, person, open, onToggle }) {
  const docs = Array.isArray(row.documents) ? row.documents : [];
  const overdue = Number(row.overdue_count) || 0;
  const pending = Number(row.pending_count) || 0;
  return (
    <div className={`rounded-2xl border bg-white shadow-xs overflow-hidden ${overdue ? "border-rose-200" : "border-slate-100"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-purple-50/30 transition"
      >
        <PersonCell entity={person} secondary={`${docs.length} ${docs.length === 1 ? "document" : "documents"}`} />
        <div className="flex items-center gap-2 shrink-0">
          {overdue > 0 && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">{overdue} overdue</span>}
          {pending > 0 && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold">{pending} still to do</span>}
          {!overdue && !pending && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-bold">All done</span>}
          <HiChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          {docs.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-400">No documents to show.</p>
          ) : (
            <table className="w-full text-left text-sm min-w-[560px]">
              <thead className="bg-slate-50/80 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-2">Document</th>
                  <th className="px-3 py-2">Where they’re at</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {docs.map((d) => (
                  <tr key={d.document_id}>
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-semibold text-slate-800 truncate max-w-[320px]">{d.title}</p>
                      {d.version > 1 && <p className="text-[10px] text-slate-400">Version {d.version}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ComplianceStateBadge state={d.compliance_state} />
                        {d.compliance_state !== "completed" && d.state !== "waived" && <RecipientStateBadge state={d.state} />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {d.due_on ? (
                        <div className="leading-tight space-y-0.5">
                          <p className={`text-xs font-semibold ${d.compliance_state === "overdue" ? "text-rose-600" : "text-slate-700"}`}>{fmtDate(d.due_on)}</p>
                          <DueChip daysRemaining={d.days_remaining} done={["completed", "waived"].includes(d.compliance_state)} className="!text-[10px]" />
                        </div>
                      ) : <span className="text-xs text-slate-400">No deadline</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamCompliancePage() {
  const team = useOrgEmployees("shift_assignment");
  const [filters, setFilters] = useState({ user_id: "", overdue_only: false });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, asOf: null, loading: true, error: null });
  const [expanded, setExpanded] = useState(() => new Set());

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getTeamCompliance({
        user_id: filters.user_id || undefined,
        overdue_only: filters.overdue_only ? true : undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      if (token !== reqRef.current) return;
      const payload = complianceListOf(res);
      setState({ ...payload, loading: false, error: null });
      // Late people open by default: that's who you came to find.
      setExpanded(new Set(payload.rows.filter((r) => Number(r.overdue_count) > 0).map((r) => r.user_id)));
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, asOf: null, loading: false, error });
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const toggle = (id) => setExpanded((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Rows carry a name and code already; the roster adds the avatar and department.
  const rowsById = useMemo(() => new Map(team.options.map((o) => [o.id, o.raw || o])), [team.options]);
  const personOf = (row) => {
    const raw = rowsById.get(row.user_id);
    return raw
      ? { ...raw, name: row.display_name || raw.name, employee_code: row.employee_code || raw.employee_code }
      : { name: row.display_name || "Team member", employee_code: row.employee_code };
  };

  const hidden = isTeamVisibilityOff(state.error);
  const pageOverdue = state.rows.reduce((n, r) => n + (Number(r.overdue_count) || 0), 0);
  const pagePending = state.rows.reduce((n, r) => n + (Number(r.pending_count) || 0), 0);
  const peopleLate = state.rows.filter((r) => Number(r.overdue_count) > 0).length;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const filtered = !!(filters.user_id || filters.overdue_only);
  const onePage = state.total <= PAGE;

  return (
    <>
      <DashboardTopBar title="Document Compliance" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Document Compliance</h1>
            <p className="text-sm text-slate-500 mt-1">
              Which company documents your team still has to acknowledge or sign, and who is late. Confidential documents are never shown here.
              {state.asOf && <span className="text-slate-400"> Late is counted as of {fmtDate(state.asOf)}.</span>}
            </p>
          </div>
          <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50 shrink-0 self-start sm:self-auto" aria-label="Refresh" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {hidden ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <DocEmptyState
              icon={HiEyeOff}
              title="Team documents are turned off"
              message="Your organisation has chosen not to show managers their team's documents, so this view is empty. HR can turn it on in Document Settings."
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Tile label="People with documents" value={state.loading && !state.rows.length ? "…" : state.total} icon={HiUserGroup} />
              <Tile label={onePage ? "Documents still to do" : "Still to do (this page)"} value={state.loading && !state.rows.length ? "…" : pagePending} icon={HiClipboardCheck} tone="text-indigo-500" />
              <Tile
                label={onePage ? "Overdue" : "Overdue (this page)"}
                value={state.loading && !state.rows.length ? "…" : pageOverdue}
                icon={HiExclamationCircle}
                tone="text-rose-500"
                alert={pageOverdue > 0}
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="w-full md:w-80">
                <PersonSelect
                  people={team.options}
                  value={filters.user_id}
                  onChange={(v) => update({ user_id: v || "" })}
                  placeholder="Everyone in my team"
                  clearLabel="Everyone in my team"
                  loading={team.loading}
                  aria-label="Team member"
                  emptyText="No team members found."
                />
              </div>
              <label className="inline-flex items-center gap-2.5 h-10 px-3 rounded-xl border border-slate-200 bg-white cursor-pointer">
                <Switch checked={filters.overdue_only} onChange={(v) => update({ overdue_only: v })} label="Only people with something overdue" />
                <span className="text-sm font-medium text-slate-700">Only people who are late</span>
              </label>
              {filtered && (
                <button type="button" onClick={() => update({ user_id: "", overdue_only: false })} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
                  <HiX className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            {peopleLate > 0 && (
              <p className="flex items-start gap-2 text-xs text-slate-600">
                <HiExclamationCircle className="w-4 h-4 text-rose-500 shrink-0 mt-px" />
                {peopleLate === 1 ? "One person is late." : `${peopleLate} people are late.`} Remind them to open Company Documents — only they can acknowledge or sign.
              </p>
            )}

            {state.error ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
                <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your team's document compliance." />
              </div>
            ) : state.loading && state.rows.length === 0 ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
            ) : state.rows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
                <DocEmptyState
                  icon={HiCheckCircle}
                  title={filters.overdue_only ? "Nobody is late" : filters.user_id ? "Nothing for this person" : "Nothing to follow up"}
                  message={filters.overdue_only
                    ? "Everyone in your team is on time."
                    : filters.user_id
                      ? "They have no company documents to acknowledge or sign that you can see."
                      : "Nobody in your team has a company document to acknowledge or sign right now."}
                />
              </div>
            ) : (
              <>
                <div className={`grid grid-cols-1 xl:grid-cols-2 gap-3 items-start ${state.loading ? "opacity-60" : ""}`}>
                  {state.rows.map((row) => (
                    <MemberCard
                      key={row.user_id}
                      row={row}
                      person={personOf(row)}
                      open={expanded.has(row.user_id)}
                      onToggle={() => toggle(row.user_id)}
                    />
                  ))}
                </div>
                {state.total > PAGE && (
                  <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="person" />
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

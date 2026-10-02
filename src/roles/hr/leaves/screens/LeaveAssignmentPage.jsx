// ─────────────────────────────────────────────────────────────────────────────
// LeaveAssignmentPage.jsx — Setup › Leave › Leave Assignment. Who has which
// leave policy, who has none, and the one place to hand policies out.
//
// WHY IT EXISTS: assigning a leave policy used to live only on one employee's
// profile, three clicks deep (Employees → a person → Leave → Assign). So the
// question HR actually asks — "is anyone missing a leave policy?" — could only
// be answered by opening every profile in turn, and a new joiner with no leave
// rules at all was invisible until they tried to apply. This screen inverts it:
// the whole organisation in one list, people with no policy first-class, and
// assignment to a department in one pass.
//
// It deliberately mirrors Shift Management (AttendanceRosterPage): same shape,
// same filter strip, same row-opens-an-inspector, same place in the sidebar one
// group down. A manager promoted to HR must not learn two screens for one job
// (CLAUDE.md §2). HR-only, because every Phase 7 endpoint is HR-only — a manager
// gets no sidebar entry at all rather than a button that 403s.
//
// CONTRACT TRAPS, all of them learned the hard way:
//
//  · THE LIST IS SERVER-PAGINATED and it REJECTS an unknown query key with a
//    400 (not "ignores it and returns everything", which is what the shift list
//    this screen copies does). Filters go through the allow-list in
//    leave.api.js; page/filter/search changes reset to page 1.
//
//  · THERE IS NO `user_id` FILTER on GET /leaves/assignments, so one row cannot
//    be re-read after a write. The page re-reads the CURRENT PAGE instead — one
//    request, not one per row (§7). Don't "fix" this into a per-row refresh.
//
//  · "NO POLICY" AND "POLICY NOT RECORDED" ARE DIFFERENT PEOPLE. Anyone set up
//    before the backend recorded which policy gave them their leave comes back
//    as `coverage: "legacy"`. They have leave. Lumping them into the "No policy"
//    count would send HR chasing people who are already covered.
//
//  · NO DELETE. A started assignment's balances are already written and can't be
//    honestly reversed, so End is the only lifecycle action (backend change
//    record §4.6). The row menu that Shift Management has would hold one item,
//    so the action is a plain button instead.
//
//  · NOTHING GOES ON THE EVENT BUS. Assigning a policy empties no approval queue
//    and moves no sidebar badge, so there is no emitAttendanceChanged call here
//    and no kind in INBOX_EVENT_KINDS (§7). That is deliberate, not an omission.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiClipboardCheck, HiExclamationCircle, HiPencil, HiPlus, HiSearch, HiTemplate, HiUserGroup, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import Skeleton from "../../../../shared/components/Skeleton";
import { leaveAPI } from "../../../../shared/api";
import { leaveErrorMessage } from "../../../../shared/utils/leaveErrors";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { fmtDate, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import {
  EmptyState, ErrorState, FilterTabs, InlineAlert, Pagination, Spinner, Toast, useToast,
} from "../../../../shared/attendance/ui";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import AssignLeavePolicyDialog from "../../../../shared/leaves/AssignLeavePolicyDialog";
import CustomiseLeaveRulesDialog from "../../../../shared/leaves/CustomiseLeaveRulesDialog";
import AssignmentInspector from "../components/AssignmentInspector";
import {
  ASSIGNMENT_STATE, COVERAGE, COVERAGE_FILTERS, assignmentState, canEnd,
  filterToQuery, normalizeAssignmentRows, normalizeSummary,
} from "../../../../shared/leaves/leaveAssignmentMeta";

const PAGE_SIZE = 25;
const TH = "px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const help = (field, extra) => ({ surface: "leaves.assignment", field, ...extra });

/* ─── End a policy ───────────────────────────────────────────────────────────
   The copy is the backend's, verbatim in meaning: balances are kept, no leave
   can be applied for after the date, accrual stops. Anything softer than that
   would read like a cancellation, which this is not. */
function EndPolicyModal({ row, assignment, onClose, onSaved }) {
  const from = ymdOnly(assignment?.effective_from);
  const today = todayYMD();
  // Today or later, and never before the policy started — both are server rules.
  const minDate = from && from > today ? from : today;
  const [effectiveTo, setEffectiveTo] = useState(minDate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blockedBy, setBlockedBy] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (!effectiveTo) { setError("Choose the last day this policy applies."); return; }
    if (effectiveTo < minDate) {
      setError(minDate === today
        ? "The last day has to be today or later."
        : `This policy doesn’t start until ${fmtDate(minDate)}, so it can’t end before then.`);
      return;
    }
    setBusy(true);
    setError("");
    setBlockedBy(0);
    try {
      const payload = { effective_to: effectiveTo };
      if (reason.trim()) payload.reason = reason.trim();
      await leaveAPI.endAssignment(assignment.id, payload);
      onSaved(`${row.name}’s leave policy now ends on ${fmtDate(effectiveTo)}.`);
    } catch (err) {
      // The server names the leave that stands in the way; HR has to clear those
      // requests first, so say how many rather than just refusing.
      const ids = err?.data?.details?.request_ids;
      if (Array.isArray(ids)) setBlockedBy(ids.length);
      setError(leaveErrorMessage(err, "Couldn’t set the end date."));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" role="dialog" aria-modal="true" aria-label="End this leave policy">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">End this leave policy</h2>
            <p className="text-xs text-slate-500 mt-1 truncate">{row.name} · {assignment?.template?.name || "Leave policy"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5" noValidate>
          {error && (
            <InlineAlert tone="rose">
              {error}
              {blockedBy > 0 && ` There ${blockedBy === 1 ? "is 1 leave request" : `are ${blockedBy} leave requests`} dated after that day.`}
            </InlineAlert>
          )}
          <div>
            <div className="flex items-center">
              <label htmlFor="end-leave-policy" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Last day this policy applies <span className="text-rose-500">*</span>
              </label>
              <FieldHelp {...help("effective_to")} label="the last day a leave policy applies" className="mb-1.5" />
            </div>
            <input
              id="end-leave-policy" type="date" value={effectiveTo} min={minDate}
              onChange={(e) => { setEffectiveTo(e.target.value); setError(""); }} disabled={busy}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition"
            />
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              That day is included. Their balances are kept exactly as they are — nothing is credited back or taken away.
              No leave can be applied for after it, and monthly leave stops being added.
            </p>
          </div>
          <div>
            <label htmlFor="end-leave-reason" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Why (optional)</label>
            <input
              id="end-leave-reason" type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}
              placeholder="e.g. last working day"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition disabled:opacity-50">
              {busy && <Spinner />}{busy ? "Saving…" : "Set the end date"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Coverage tiles ─────────────────────────────────────────────────────────
   "No policy" is the only one that can be clicked, because it is the only one
   that is a to-do list. The others are context. */
function CoverageTiles({ summary, status, activeFilter, onFilter }) {
  if (status === "error") return null;
  const loading = status === "loading";
  const tiles = [
    { key: "on_policy", label: "On a policy", value: summary.onPolicy, icon: HiClipboardCheck, hint: summary.legacy > 0 ? `${summary.legacy} with the policy not recorded` : null },
    { key: "none", label: "No policy", value: summary.unassigned, icon: HiExclamationCircle, hint: summary.unassigned > 0 ? "Needs a policy before they can apply" : "Everybody is covered", urgent: summary.unassigned > 0, clickable: true },
    { key: "overrides", label: "Rules changed by hand", value: summary.withOverrides, icon: HiPencil, hint: "People with a rule set just for them" },
    { key: "templates", label: "Policies in use", value: summary.templatesInUse, icon: HiTemplate, hint: summary.templates.length ? `of ${summary.templates.length} set up` : null },
  ]
    // Only once the answer is in: dropping a tile mid-load would shift the row
    // from three across to four as it landed.
    .filter((t) => loading || t.value !== undefined);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {tiles.map((t) => {
        const active = t.clickable && activeFilter === t.key;
        const body = (
          <>
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.urgent ? "bg-fuchsia-50 text-fuchsia-600" : "bg-purple-50 text-purple-600"}`}>
              <t.icon className="w-5 h-5" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.label}</span>
              <span className={`block text-xl font-extrabold leading-tight ${t.urgent ? "text-fuchsia-700" : "text-slate-900"}`}>
                {loading ? "—" : t.value}
              </span>
              {t.hint && <span className="block text-[11px] text-slate-500 mt-0.5 truncate">{t.hint}</span>}
            </span>
          </>
        );
        return t.clickable ? (
          <button
            key={t.key} type="button" onClick={() => onFilter(active ? "all" : t.key)}
            aria-pressed={active}
            className={`flex items-center gap-3 rounded-2xl border bg-white shadow-sm px-4 py-3.5 transition hover:border-purple-300 ${active ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-100"}`}
          >
            {body}
          </button>
        ) : (
          <div key={t.key} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white shadow-sm px-4 py-3.5">{body}</div>
        );
      })}
    </div>
  );
}

/* ─── The page ───────────────────────────────────────────────────────────── */
export default function LeaveAssignmentPage() {
  const [list, setList] = useState({ rows: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Filter, search and page are ONE state object on purpose: see the note on
  // setFilter below.
  const [query, setQuery] = useState({ filter: "all", q: "", page: 1 });
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState({ data: normalizeSummary(null), status: "loading" });
  const [inspect, setInspect] = useState(null);
  const [endTarget, setEndTarget] = useState(null);
  const [customiseTarget, setCustomiseTarget] = useState(null);
  const [assignFor, setAssignFor] = useState(null); // { row } | { bulk: true }
  const { toast, showToast, clearToast } = useToast();

  const listToken = useRef(0);
  const today = todayYMD();

  // `q` is capped at the 150 characters the endpoint accepts. Returning the same
  // object when nothing changed lets React bail out, so the first keystroke-free
  // render doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = search.trim().slice(0, 150);
      setQuery((cur) => (cur.q === q ? cur : { ...cur, q, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Both of these reset the page in the SAME update as the thing that
  // invalidates it — a filter change that left the page behind asked the server
  // for page 3 of a one-page result and got an empty list back.
  const setFilter = useCallback((filter) => {
    setQuery((cur) => (cur.filter === filter ? cur : { ...cur, filter, page: 1 }));
  }, []);
  const setPage = useCallback((page) => setQuery((cur) => ({ ...cur, page })), []);

  const loadList = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++listToken.current;
    if (quiet) setRefreshing(true);
    setLoadError(null);
    const requested = { ...filterToQuery(query.filter), page: query.page, limit: PAGE_SIZE };
    if (query.q) requested.q = query.q;
    try {
      const res = await leaveAPI.getAssignments(requested);
      if (mine !== listToken.current) return;
      setList(normalizeAssignmentRows(res, requested));
    } catch (err) {
      if (mine !== listToken.current) return;
      setLoadError(err);
    } finally {
      if (mine === listToken.current) { setLoading(false); setRefreshing(false); }
    }
  }, [query]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await leaveAPI.getAssignmentSummary();
      setSummary({ data: normalizeSummary(res), status: "ok" });
    } catch {
      // The tiles are context, not the screen. A server without the summary
      // endpoint hides them rather than blocking the list (§7).
      setSummary({ data: normalizeSummary(null), status: "error" });
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  /** After any write: the current page again plus the tiles. One request each. */
  const refreshAfterWrite = useCallback(() => { loadList({ quiet: true }); loadSummary(); }, [loadList, loadSummary]);

  function onWritten(message, close) {
    close?.();
    showToast(message);
    refreshAfterWrite();
  }

  const filterOptions = useMemo(() => {
    const counts = summary.status === "ok"
      ? { on_policy: summary.data.onPolicy, legacy: summary.data.legacy, none: summary.data.unassigned, overrides: summary.data.withOverrides }
      : {};
    return COVERAGE_FILTERS
      // Nobody set up before policy tracking → the tab would always be empty. It
      // stays while it is the chosen tab, or hiding it would leave the strip with
      // nothing selected and the list still filtered.
      .filter((o) => o.value !== "legacy" || query.filter === "legacy" || summary.status !== "ok" || summary.data.legacy > 0)
      .map((o) => (counts[o.value] ? { ...o, label: `${o.label} (${counts[o.value]})` } : o));
  }, [summary, query.filter]);

  // Absent key → hidden feature (§7): no override counts anywhere, no column.
  const showCustomColumn = useMemo(() => list.rows.some((r) => r.assignment?.override_count !== undefined), [list.rows]);
  const showActions = useMemo(() => list.rows.some((r) => canEnd(r.assignment, today)), [list.rows, today]);
  const filtering = query.filter !== "all" || !!query.q;

  return (
    <>
      <DashboardTopBar title="Leave Assignment" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="Leave Assignment" help={help("page", { label: "the Leave Assignment page" })} />
            </h1>
            <p className="text-sm text-slate-500 mt-1">Who has which leave policy, and what it gives them.</p>
          </div>
          <button
            type="button" onClick={() => setAssignFor({ bulk: true })}
            className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition"
          >
            <HiPlus className="w-4 h-4" /> Assign a policy
          </button>
        </div>

        <CoverageTiles summary={summary.data} status={summary.status} activeFilter={query.filter} onFilter={setFilter} />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <FilterTabs options={filterOptions} value={query.filter} onChange={setFilter} />
          <div className="relative w-full md:w-72">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={150}
              placeholder="Search name, email or code…"
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>
        </div>

        {loading ? (
          <Skeleton type="table" rows={6} />
        ) : loadError ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ErrorState
              error={loadError}
              onRetry={() => { setLoading(true); loadList(); }}
              fallback={loadError?.status === 404
                ? "The leave assignment list isn’t available on this server yet."
                : "Couldn’t load who is on which leave policy."}
            />
          </div>
        ) : (
          <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${refreshing ? "opacity-60 transition-opacity" : ""}`}>
            {list.rows.length === 0 ? (
              query.page > 1 ? (
                <EmptyState
                  icon={HiSearch}
                  title="Nothing on this page"
                  message="The list got shorter while you were on it."
                  action={
                    <button type="button" onClick={() => setPage(1)} className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-lg transition">
                      Back to the first page
                    </button>
                  }
                />
              ) : filtering ? (
                <EmptyState icon={HiSearch} title="Nobody matches that" message="Try another filter or a different search." />
              ) : (
                <EmptyState icon={HiUserGroup} title="No people to show yet" message="Invite people into the organisation, then give them a leave policy from here." />
              )
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className={TH}>Employee</th>
                        <th className={TH}>Emp. Code</th>
                        <th className={TH}><HelpLabel text="Leave Policy" help={help("coverage", { size: "sm" })} /></th>
                        <th className={TH}>From</th>
                        <th className={TH}><HelpLabel text="State" help={help("state", { size: "sm" })} /></th>
                        {showCustomColumn && (
                          <th className={TH}><HelpLabel text="Custom Rules" help={help("override_count", { size: "sm" })} /></th>
                        )}
                        {showActions && <th className={`${TH} text-right`}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.rows.map((row, i) => {
                        const cov = COVERAGE[row.coverage];
                        const state = assignmentState(row.assignment, today);
                        const overrides = row.assignment?.override_count || 0;
                        const entitlements = row.assignment?.template?.entitlement_count;
                        return (
                          <tr
                            key={row.userId || `row-${i}`}
                            {...(row.userId
                              ? rowPreviewProps(() => setInspect(row), `Leave policy for ${row.name}`)
                              : { className: "hover:bg-slate-50/60" })}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 text-xs">
                                  <GenderAvatar person={row.person} name={row.name} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{row.name}</p>
                                  {row.email && row.email !== row.name && <p className="text-[10px] text-slate-400 truncate">{row.email}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">{row.employeeCode || "N/A"}</td>
                            <td className="px-6 py-4">
                              {row.coverage === "none" ? (
                                <p className="text-xs font-semibold text-fuchsia-700">No policy</p>
                              ) : row.coverage === "legacy" ? (
                                <>
                                  <p className="text-xs font-semibold text-slate-800">Not recorded</p>
                                  <p className="text-[10px] text-slate-400">Assign a policy to track it</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs font-semibold text-slate-800 truncate max-w-[14rem]">{row.assignment?.template?.name || "N/A"}</p>
                                  {entitlements > 0 && (
                                    <p className="text-[10px] text-slate-400">{entitlements} kind{entitlements === 1 ? "" : "s"} of leave</p>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600">
                              {row.assignment?.effective_from ? fmtDate(ymdOnly(row.assignment.effective_from)) : "N/A"}
                            </td>
                            <td className="px-6 py-4">
                              {state ? (
                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold border px-2.5 py-1 rounded-full ${ASSIGNMENT_STATE[state].pill}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${ASSIGNMENT_STATE[state].dot}`} />
                                  {ASSIGNMENT_STATE[state].label}
                                  {row.assignment?.effective_to && state === "ongoing" && ` until ${fmtDate(ymdOnly(row.assignment.effective_to))}`}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center text-[10px] font-bold border px-2.5 py-1 rounded-full ${cov.pill}`}>{cov.label}</span>
                              )}
                            </td>
                            {showCustomColumn && (
                              <td className="px-6 py-4 text-xs text-slate-600">
                                {overrides > 0 ? `${overrides} kind${overrides === 1 ? "" : "s"}` : ""}
                              </td>
                            )}
                            {showActions && (
                              <td className="px-6 py-4 text-right">
                                {canEnd(row.assignment, today) && (
                                  <button
                                    type="button" data-row-action
                                    onClick={(e) => { e.stopPropagation(); setEndTarget({ row, assignment: row.assignment }); }}
                                    className="text-xs font-bold text-fuchsia-700 hover:bg-fuchsia-50 px-3 py-1.5 rounded-lg transition"
                                  >
                                    End
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-50">
                  <Pagination
                    page={list.page} totalPages={list.totalPages} total={list.total} limit={PAGE_SIZE}
                    onPageChange={setPage} disabled={refreshing} noun="person"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {inspect && (
        <AssignmentInspector
          row={inspect}
          onClose={() => setInspect(null)}
          onChangePolicy={(row) => setAssignFor({ row })}
          onEnd={(row, assignment) => setEndTarget({ row, assignment })}
          onCustomise={(row, type) => setCustomiseTarget({ row, type })}
        />
      )}

      {/* Siblings of the inspector, never children (§3 stacking). */}
      {endTarget && (
        <EndPolicyModal
          row={endTarget.row} assignment={endTarget.assignment}
          onClose={() => setEndTarget(null)}
          onSaved={(msg) => { setInspect(null); onWritten(msg, () => setEndTarget(null)); }}
        />
      )}

      {customiseTarget && (
        <CustomiseLeaveRulesDialog
          userId={customiseTarget.row.userId}
          leaveTypeId={customiseTarget.type.leave_type_id}
          leaveTypeName={customiseTarget.type.leave_type?.name || "This leave"}
          subjectName={customiseTarget.row.name}
          effective={customiseTarget.type.effective}
          policyDefault={customiseTarget.type.policy_default}
          templateCurrent={customiseTarget.type.template_current}
          overriddenFields={customiseTarget.type.overridden_fields || []}
          onClose={() => setCustomiseTarget(null)}
          onSaved={(msg) => { setInspect(null); onWritten(msg, () => setCustomiseTarget(null)); }}
        />
      )}

      {assignFor && (
        <AssignLeavePolicyDialog
          userId={assignFor.row?.userId}
          subjectName={assignFor.row?.name}
          allowBulk={!assignFor.row}
          onAssigned={(msg) => { setInspect(null); onWritten(msg, () => setAssignFor(null)); }}
          onClose={() => setAssignFor(null)}
          zIndex="z-[170]"
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

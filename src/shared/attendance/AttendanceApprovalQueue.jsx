// ─────────────────────────────────────────────────────────────────────────────
// attendance/AttendanceApprovalQueue.jsx — Pending list + DecisionDialog for one
// decision type (regularization | overtime | compoff | anomaly). Used by the
// per-type manager pages, the Approvals Inbox and the HR Inbox so all behave
// identically. Rows stay short — the full context lives in the dialog.
//
// Multi-select (2026-10-14):
//   Checkboxes on the left. A "select all" in the header toggles every VISIBLE
//   row (after search / role filter — selecting rows you can't see is a mistake
//   waiting to happen). A sticky bottom bar appears the moment at least one row
//   is checked, showing the count and one button per action the type supports.
//   On click, a ReasonDialog collects one shared reason and settleWithLimit
//   fires them all with concurrency 4. Failures are grouped by REASON rather
//   than just counted, and the commonest reason is spelled out above the
//   table: "2 failed" gives a reviewer nothing to act on, and a row someone
//   else has already handled is a different problem from a decision the
//   server refused. The queue reloads at the end, once.
//
// Paging and the date window (2026-10-14):
//   CONTRACT TRAP — none of these endpoints paginates or filters. `/team/
//   anomalies`, `/regularizations/pending`, `/overtime/pending` and
//   `/comp-offs/pending` accept NO query parameters at all (contract §6.2 /
//   §6.3, "none accepted") and return every open row in one response. Adding
//   `page`, `limit`, `from` or `to` to those calls changes nothing — whatever
//   you send is discarded. So the page and the date window are applied HERE,
//   over the list the server already sent. HR's queues are org-wide, so the
//   anomaly one runs to hundreds of rows and used to render all of them at
//   once; a page of 40 and a from/to window are what make it usable. The card
//   count stays the true unresolved total — it must not follow the filters.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCalendar, HiCheckCircle, HiRefresh, HiSearch, HiX } from "react-icons/hi";
import DecisionDialog, { DetailRow } from "./DecisionDialog.jsx";
import { AnomalyDetails, OvertimeDetails, RegularizationDetails, recordOf } from "./DecisionContext.jsx";
import { DECISION_TYPES, runDecision } from "./decisions.js";
import { emitAttendanceChanged } from "./events.js";
import { resolvePerson, useTeamNames } from "./useTeamNames.js";
import { entityId, listFrom } from "./normalize.js";
import { formatDayCount } from "../utils/formatUtils.js";
import { anomalyLabel, humanize } from "./enums.js";
import { fmtClockTime, fmtDate, fmtHours, fmtMinutes, fmtTime, toLocalYMD, workedLabel, ymdOnly } from "./dates.js";
import { useAttendanceChanged } from "./events.js";
import { decisionErrorMessage, isAlreadyProcessed, isHierarchyViolation, isNotFound } from "../utils/attendanceErrors.js";
import { EmptyState, ErrorState, FilterTabs, InlineAlert, LoadingRows, Pagination, StatusBadge, Toast, useToast } from "./ui.jsx";
import GenderAvatar from "../components/GenderAvatar.jsx";
import { fetchAllOrgEmployees } from "../utils/orgEmployees.js";
import { HelpLabel } from "../fieldHelp/FieldHelp.jsx";
import ReasonDialog from "../components/ReasonDialog.jsx";
import { settleWithLimit } from "../utils/promisePool.js";

const itemDate = (i) => ymdOnly(i.date || i.record_date || recordOf(i)?.date || i.earned_date || i.worked_date);
/**
 * The date a row is ABOUT — what it sorts by and what the date window matches.
 * An anomaly can arrive with no `date` of its own (a flag raised off a punch
 * that has no record yet), so it falls back to when the flag was raised. That
 * is the same fallback the anomaly Date column prints: if the two disagreed,
 * the window would hide rows while showing a date that sits inside it.
 */
const rowDate = (i) => itemDate(i) || ymdOnly(i.created_at) || "";
const otMinutes = (i) => i.overtime_minutes ?? i.minutes ?? i.requested_minutes ?? (i.hours != null ? Math.round(Number(i.hours) * 60) : null);
const creditDays = (i) => {
  const direct = i.days_earned ?? i.credit_days ?? i.days ?? i.comp_off_days ?? i.credited_days ?? i.earned_days ?? i.credit;
  if (direct != null && direct !== "") return Number(direct);
  if (i.worked_hours != null) {
    const hrs = parseFloat(i.worked_hours);
    if (!isNaN(hrs) && hrs > 0 && hrs < 5) return 0.5;
  }
  return 1;
};
const expiry = (i) => ymdOnly(i.expiry_date || i.expires_on || i.valid_until);
const shiftOf = (i) => recordOf(i)?.shift_snapshot || recordOf(i)?.shift || null;

// ── Requester role (HR filter) ──────────────────────────────────────────────
const ROLE_OPTIONS = [["employee", "Employees"], ["manager", "Managers"], ["hr", "HR"]];

function normalizeRole(value) {
  const r = String(value || "").toLowerCase();
  if (!r) return "";
  if (r.includes("manager")) return "manager";
  if (r.includes("hr") || r.includes("admin")) return "hr";
  if (r.includes("employee")) return "employee";
  return "";
}

/** The org roster's role wins; the request's own user object is the fallback. */
function requesterRole(item, roles) {
  const user = item?.user || {};
  const id = item?.user_id || user.id;
  return (
    normalizeRole(id && roles[id]) ||
    normalizeRole(user.role || item?.role) ||
    (user.hr_profile ? "hr" : user.manager_profile ? "manager" : user.employee_profile ? "employee" : "")
  );
}

/** user_id → role for the whole organisation. Only the role is kept, no other PII. */
function useOrgRoles(enabled) {
  const [roles, setRoles] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchAllOrgEmployees({ includeInactive: true })
      .then((rows) => {
        if (!alive) return;
        const map = {};
        rows.forEach((row) => {
          const role = row?.role || row?.role_name || row?.org_role;
          if (row?.user_id && role) map[row.user_id] = role;
        });
        setRoles(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);
  return roles;
}

function RequestedTime({ iso, date }) {
  if (!iso) return <span className="text-slate-400">N/A</span>;
  return (
    <>
      {fmtTime(iso)}
      {date && toLocalYMD(iso) > date && <span className="ml-1 text-[10px] font-bold text-indigo-500">+1 day</span>}
    </>
  );
}

function PunchRange({ record, date }) {
  if (!record?.clock_in_time) return <span className="text-slate-400">No record</span>;
  return <>{fmtTime(record.clock_in_time)} – {record.clock_out_time ? <RequestedTime iso={record.clock_out_time} date={date} /> : "…"}</>;
}

const COLUMNS = {
  regularization: [
    { header: "Date", render: (i) => fmtDate(itemDate(i)) },
    { header: "Recorded", render: (i) => <span className="text-slate-500"><PunchRange record={recordOf(i)} date={itemDate(i)} /></span> },
    { header: "Requested", render: (i) => <span className="font-bold text-violet-700"><RequestedTime iso={i.requested_clock_in} date={itemDate(i)} /> → <RequestedTime iso={i.requested_clock_out} date={itemDate(i)} /></span> },
    {
      header: "Mode",
      help: { surface: "attendance.approval_queue", field: "work_mode", label: "work mode" },
      render: (i) => {
        const recorded = recordOf(i)?.work_mode;
        if (!i.work_mode) return "N/A";
        return recorded && recorded !== i.work_mode
          ? <span title={`Recorded as ${humanize(recorded)}`}>{humanize(recorded)} → <span className="font-bold text-indigo-600">{humanize(i.work_mode)}</span></span>
          : humanize(i.work_mode);
      },
    },
    { header: "Reason", render: (i) => <span className="block max-w-[220px] truncate" title={i.reason}>{i.reason || "N/A"}</span> },
  ],
  overtime: [
    { header: "Date", render: (i) => fmtDate(itemDate(i)) },
    {
      header: "Overtime",
      // Measured against the attendance policy's FULL-DAY hours, not the length
      // of the shift shown in the next column. Those two differ (a 7h policy
      // under a 10–6 shift), so the number looked an hour out and reviewers
      // suspected a maths bug (UI/UX review 2026-10-06, Issue 6). The detail
      // dialog shows the full working; this says which baseline it used.
      help: { surface: "attendance.approval_queue", field: "overtime_minutes", label: "overtime" },
      render: (i) => <span className="font-bold text-indigo-600">{fmtMinutes(otMinutes(i))}</span>,
    },
    {
      header: "Shift",
      render: (i) => {
        const shift = shiftOf(i);
        // A day worked without an assigned shift has no shift snapshot.
        if (!shift) return <span className="text-slate-400">No shift assigned</span>;
        return (
          <span title={`${fmtClockTime(shift.start_time)} – ${fmtClockTime(shift.end_time)}`}>
            <span className="block font-semibold text-slate-700">{shift.name || "Shift"}</span>
            <span className="block text-[10px] text-slate-400">{fmtClockTime(shift.start_time)} – {fmtClockTime(shift.end_time)}</span>
          </span>
        );
      },
    },
    { header: "Worked", render: (i) => <PunchRange record={recordOf(i)} date={itemDate(i)} /> },
    // The backend's own worked figure (breaks off) — the one overtime is measured against.
    { header: "Effective", render: (i) => (i.worked_duration_formatted || recordOf(i)?.effective_hours != null ? workedLabel(i.worked_duration_formatted ? i : recordOf(i)) : "N/A") },
  ],
  // `when` drops a column that no row on the page can fill. The pending list
  // carries no credit and no expiry (both are set on approval), so those two
  // columns were a wall of "N/A"; what kind of day was worked is the useful fact.
  compoff: [
    { header: "Worked on", render: (i) => fmtDate(itemDate(i)) },
    { header: "Day off", render: (i) => (i.worked_type ? humanize(i.worked_type) : "N/A") },
    { header: "Hours", render: (i) => (i.worked_hours != null ? fmtHours(i.worked_hours) : "N/A") },
    { header: "Credit", help: { surface: "attendance.approval_queue", field: "days_earned", label: "comp-off credit", overlay: true }, when: (items) => items.some((i) => creditDays(i) != null), render: (i) => formatDayCount(creditDays(i)) },
    { header: "Expires", when: (items) => items.some((i) => expiry(i)), render: (i) => (expiry(i) ? fmtDate(expiry(i)) : "N/A") },
  ],
  anomaly: [
    { header: "Date", render: (i) => fmtDate(rowDate(i)) },
    { header: "Flag", render: (i) => anomalyLabel(i) },
    { header: "Severity", render: (i) => (i.severity ? <StatusBadge kind="severity" status={i.severity} /> : "N/A") },
    { header: "Details", render: (i) => <span className="block max-w-[260px] truncate" title={i.description}>{i.description || "N/A"}</span> },
  ],
};

// ── Bulk action labels ──────────────────────────────────────────────────────
// Maps each action key to wording for the floating bar and the toast.
const BULK_LABELS = {
  approve: { bar: "Approve", past: "approved" },
  reject: { bar: "Reject", past: "rejected" },
  resolve: { bar: "Mark resolved", past: "resolved" },
};

// Concurrency 4: enough to feel fast, low enough to stay within typical
// rate-limit headers from the attendance endpoints.
const BULK_CONCURRENCY = 4;

// One page of rows. 40 is about one screen of scroll with the checkbox column,
// and it keeps "select all" to a number a reviewer can still account for.
const PAGE_SIZE = 40;

// What a row is called when the footer counts them.
const ROW_NOUN = { anomaly: "flag", regularization: "request", overtime: "request", compoff: "request" };

/** fetchRecord: let the anomaly view read the day's record from the manager team history. */
export function DecisionDetails({ type, item, person, fetchRecord = false }) {
  if (type === "regularization") return <RegularizationDetails item={item} person={person} />;
  if (type === "overtime") return <OvertimeDetails item={item} person={person} overtimeMinutes={otMinutes(item)} />;
  if (type === "anomaly") return <AnomalyDetails item={item} person={person} fetchRecord={fetchRecord} />;
  const date = itemDate(item);
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 divide-y divide-slate-100">
      <DetailRow label="Employee">{person.name}{person.code ? ` · ${person.code}` : ""}</DetailRow>
      {type === "compoff" && (
        <>
          <DetailRow label="Worked on">{fmtDate(date)}</DetailRow>
          {item.worked_hours != null && <DetailRow label="Hours worked">{fmtHours(item.worked_hours)}</DetailRow>}
          {creditDays(item) != null && <DetailRow label="Credit">{creditDays(item)} day(s)</DetailRow>}
          {expiry(item) && <DetailRow label="Expires">{fmtDate(expiry(item))}</DetailRow>}
        </>
      )}
    </div>
  );
}

/** scope: "team" (manager reporting line) | "org" (HR — the pending queues are org-wide for HR, contract §2 C1). */
export default function AttendanceApprovalQueue({ type, onCountChange, scope = "team" }) {
  const cfg = DECISION_TYPES[type];
  const names = useTeamNames();
  // HR reviews the whole organisation: it gets the requester-role filter, and
  // it is not hierarchy-scoped, which changes how a refusal is worded below.
  const orgWide = scope === "org";
  const showRoleFilter = orgWide;
  const roles = useOrgRoles(showRoleFilter);
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  // Inclusive YYYY-MM-DD window over the row's own date. Empty = every date.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [staleNotice, setStaleNotice] = useState("");
  // Why a bulk run could not finish — the server's reason, not just a count.
  const [failureNote, setFailureNote] = useState("");
  const { toast, showToast, clearToast } = useToast();

  // A reporting-line refusal means something different to HR than to a
  // manager, so the queue maps its own errors (see decisionErrorMessage).
  const mapError = useCallback(
    (err, fallback) => decisionErrorMessage(err, { orgWide, fallback }),
    [orgWide]
  );

  // ── Multi-select state ──────────────────────────────────────────────────
  const [checked, setChecked] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);    // { key, label, requireRemarks }
  const [bulkError, setBulkError] = useState("");
  // Clear selection when data reloads or filters change.
  const clearChecked = useCallback(() => setChecked(new Set()), []);
  const prevLoadRef = useRef(0);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setFailureNote("");
    try {
      const res = await cfg.fetch();
      // Oldest first: a queue is worked from the top, and the oldest item is
      // the one that has been waiting on someone the longest.
      const items = listFrom(res, cfg.listKeys).sort((a, b) => rowDate(a).localeCompare(rowDate(b)) || String(a.id || "").localeCompare(String(b.id || "")));

      setState({ items, loading: false, error: null });
      onCountChange?.(type, items.length);
      prevLoadRef.current += 1;
      clearChecked();
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, [cfg, type, onCountChange, clearChecked]);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged([cfg.event], load);

  const people = useMemo(
    () => state.items.map((item) => ({ item, person: resolvePerson(item, names), role: requesterRole(item, roles) })),
    [state.items, names, roles]
  );

  // The date window narrows everything downstream, including the role counts —
  // "Employees (12)" beside a list of 3 would be counting rows nobody can see.
  const dated = useMemo(() => {
    if (!from && !to) return people;
    return people.filter(({ item }) => {
      const d = rowDate(item);
      // An undated row can't be claimed to fall inside a window; it comes back
      // the moment the window is cleared, and the empty state says a filter is on.
      if (!d) return false;
      return (!from || d >= from) && (!to || d <= to);
    });
  }, [people, from, to]);

  const roleOptions = useMemo(() => {
    const counts = dated.reduce((acc, p) => ({ ...acc, [p.role]: (acc[p.role] || 0) + 1 }), {});
    return [
      { value: "all", label: `All (${dated.length})` },
      ...ROLE_OPTIONS.map(([value, label]) => ({ value, label: `${label} (${counts[value] || 0})` })),
    ];
  }, [dated]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dated.filter(({ person, role }) =>
      (!showRoleFilter || roleFilter === "all" || role === roleFilter) &&
      (!q || person.name.toLowerCase().includes(q) || person.code.toLowerCase().includes(q))
    );
  }, [dated, search, roleFilter, showRoleFilter]);

  // ── Paging ────────────────────────────────────────────────────────────────
  // `safePage` is derived, not stored: a decision that empties the last page,
  // or a narrower filter, must not leave the table blank on a page that no
  // longer exists.
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage]
  );
  const goToPage = useCallback((next) => setPage(next), []);

  // Any change to what is being listed starts again from the top.
  useEffect(() => { setPage(1); }, [search, roleFilter, from, to]);

  // ── Checkbox helpers ──────────────────────────────────────────────────────
  // "Visible" means this page. Checking 40 rows, paging away and then bulk-
  // resolving rows you can no longer see is exactly the mistake the select-all
  // guard exists to prevent, so the selection is pruned to the rows on screen.
  const visibleIds = useMemo(() => new Set(pageRows.map(({ item }) => entityId(item))), [pageRows]);
  useEffect(() => {
    setChecked((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set();
      prev.forEach((id) => { if (visibleIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);
  const checkedVisible = useMemo(() => {
    const ids = [];
    checked.forEach((id) => { if (visibleIds.has(id)) ids.push(id); });
    return ids;
  }, [checked, visibleIds]);
  const allChecked = checkedVisible.length > 0 && checkedVisible.length === pageRows.length;
  const someChecked = checkedVisible.length > 0;

  const toggleOne = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [allChecked, visibleIds]);

  // ── Single-item decision ────────────────────────────────────────────────
  const handleSubmit = async (action, remarks) => {
    const id = entityId(selected);
    // Never POST to /…/undefined/approve.
    if (!id) throw new Error("This request is missing its identifier. Refresh the queue and try again.");
    try {
      const message = await runDecision(type, action, id, remarks);
      setSelected(null);
      showToast(message);
    } catch (err) {
      // Item gone, already actioned, or outside the manager's line: refresh
      // the queue so the stale row disappears, and keep the dialog's message.
      // Not for an HR caller refused on the reporting line — that row has not
      // changed and is still unresolved, so "the queue was refreshed because
      // this request changed" would be telling them something untrue.
      if (isNotFound(err) || isAlreadyProcessed(err) || (isHierarchyViolation(err) && !orgWide)) {
        setStaleNotice("The queue was refreshed because this request changed.");
        load();
      }
      throw err;
    }
  };

  // ── Bulk decision ───────────────────────────────────────────────────────
  const startBulk = (action) => {
    setBulkAction(action);
    setBulkError("");
  };

  const submitBulk = (reason) => {
    if (!bulkAction) return;
    const action = bulkAction;
    const ids = [...checkedVisible];

    // Fire-and-forget: close the dialog and clear selection immediately so the
    // user isn't blocked. Each request is independent — one failure never stops
    // the rest. The event bus is emitted once at the end, not per item.
    setBulkAction(null);
    setBulkError("");
    clearChecked();

    settleWithLimit(
      ids,
      (id) => cfg.run(action.key, id, reason),
      { concurrency: BULK_CONCURRENCY },
    ).then((results) => {
      let ok = 0;
      // Why each one failed, counted. A bare "3 failed" tells the reviewer
      // nothing they can act on, and the reasons differ: a row someone else
      // just handled is not the same as a decision the server refused.
      const reasons = new Map();
      results.forEach((r) => {
        if (r.status === "fulfilled") { ok += 1; return; }
        const why = mapError(r.reason, `Couldn’t ${action.label.toLowerCase()} this item.`);
        reasons.set(why, (reasons.get(why) || 0) + 1);
      });
      const failed = ids.length - ok;
      emitAttendanceChanged(cfg.event);
      load();
      const actionPast = BULK_LABELS[action.key]?.past || "processed";
      if (failed === 0) {
        showToast(`${ok} ${ok === 1 ? "item" : "items"} ${actionPast}.`);
        return;
      }
      // The commonest reason, named in full above the table; the toast stays short.
      const [why] = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
      setFailureNote(failed === 1 ? why : `${failed} items were not ${actionPast}. ${why}`);
      showToast(ok === 0 ? `Nothing was ${actionPast}.` : `${ok} ${actionPast}, ${failed} not ${actionPast}.`);
    });
  };

  const columns = COLUMNS[type].filter((c) => !c.when || c.when(state.items));
  const searching = !!search.trim();
  const windowed = !!from || !!to;
  const clearWindow = () => { setFrom(""); setTo(""); };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center md:flex-wrap gap-3">
          <div className="relative w-full md:w-64">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code…" className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100" />
          </div>
          {showRoleFilter && <FilterTabs options={roleOptions} value={roleFilter} onChange={setRoleFilter} />}
          {/* Date window. Both ends are optional, so "everything before March"
              and "March onwards" are a single field each, not a preset list. */}
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl pl-2.5 pr-1 py-1.5 bg-white text-xs font-semibold text-slate-600">
            <HiCalendar className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" title="From date" className="w-28 bg-transparent outline-none" />
            <span className="text-slate-300" aria-hidden="true">→</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" title="To date" className="w-28 bg-transparent outline-none" />
            {windowed ? (
              <button type="button" onClick={clearWindow} aria-label="Clear the date filter" className="p-1 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-slate-100 transition">
                <HiX className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="w-[22px]" aria-hidden="true" />
            )}
          </div>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="self-start lg:self-auto inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-purple-600 disabled:opacity-50">
          <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {staleNotice && <InlineAlert tone="sky" className="m-4">{staleNotice}</InlineAlert>}
      {failureNote && <InlineAlert tone="rose" className="m-4">{failureNote}</InlineAlert>}

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} fallback={`Couldn't load pending ${cfg.label.toLowerCase()} items.`} />
      ) : state.loading && state.items.length === 0 ? (
        <div className="p-5"><LoadingRows rows={4} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HiCheckCircle}
          title={state.items.length ? "No matches" : "All caught up"}
          message={state.items.length
            ? windowed && !searching && roleFilter === "all"
              ? "Nothing pending falls in those dates. Widen the range, or clear it to see everything waiting."
              : "No pending items match your filters."
            : `There are no pending ${cfg.label.toLowerCase()} items ${orgWide ? "in the organisation" : "for your team"}.`}
        />
      ) : (
        <div className={`overflow-x-auto ${state.loading ? "opacity-60" : ""}`}>
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
              <tr>
                {/* Select-all checkbox — toggles every VISIBLE row. */}
                <th className="pl-5 pr-2 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    aria-label={allChecked ? "Deselect all" : "Select all"}
                  />
                </th>
                <th className="px-5 py-3.5">Employee</th>
                {columns.map((c) => <th key={c.header} className="px-5 py-3.5"><HelpLabel text={c.header} help={c.help} /></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {pageRows.map(({ item, person, role }) => {
                const id = entityId(item);
                const isChecked = checked.has(id);
                const designation = item.user?.employee_profile?.designation;
                const secondary = [person.code, designation || (showRoleFilter && role ? ROLE_OPTIONS.find(([v]) => v === role)?.[1].replace(/s$/, "") : "")].filter(Boolean).join(" · ");
                const open = () => { setStaleNotice(""); setSelected(item); };
                return (
                  <tr
                    key={id}
                    tabIndex={0}
                    aria-haspopup="dialog"
                    className={`outline-none transition-colors cursor-pointer ${isChecked ? "bg-purple-50/60" : "hover:bg-purple-50/40 focus:bg-purple-50/60"}`}
                    onClick={open}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                  >
                    {/* Row checkbox — click stops here, not on the row. */}
                    <td className="pl-5 pr-2 py-3.5 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(id)}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        aria-label={`Select ${person.name}`}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 text-xs"><GenderAvatar person={item} name={person.name} /></div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{person.name}</p>
                          {secondary && <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{secondary}</p>}
                        </div>
                      </div>
                    </td>
                    {columns.map((c) => <td key={c.header} className="px-5 py-3.5 text-xs font-medium whitespace-nowrap">{c.render(item)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* One page at a time. With a single page this prints the count only,
          which is what tells HR how many are waiting behind the filters. */}
      {rows.length > 0 && !state.error && (
        <div className="px-5 py-3.5 border-t border-slate-100">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={rows.length}
            limit={PAGE_SIZE}
            onPageChange={goToPage}
            disabled={state.loading}
            noun={ROW_NOUN[type] || "item"}
          />
        </div>
      )}

      {/* ── Floating bulk action bar ──────────────────────────────────────── */}
      {someChecked && (
        <div className="sticky bottom-0 z-30 border-t border-purple-200 bg-purple-50/95 backdrop-blur-md px-5 py-3 flex items-center justify-between gap-4">
          <span className="text-sm font-bold text-purple-900">
            {checkedVisible.length} {checkedVisible.length === 1 ? "item" : "items"} selected
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={clearChecked} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Clear
            </button>
            {cfg.actions.map((action) => {
              const label = BULK_LABELS[action.key]?.bar || action.label;
              const danger = action.tone === "rose";
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => startBulk(action)}
                  className={`px-5 py-2 text-xs font-bold rounded-xl transition ${danger ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"}`}
                >
                  {label} ({checkedVisible.length})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bulk reason dialog ────────────────────────────────────────────── */}
      {bulkAction && (
        <ReasonDialog
          title={`${BULK_LABELS[bulkAction.key]?.bar || bulkAction.label} ${checkedVisible.length} ${checkedVisible.length === 1 ? "item" : "items"}`}
          description={`This will apply to all ${checkedVisible.length} selected items with the same reason.`}
          label={type === "anomaly" ? "Resolution note" : "Remarks for the employees"}
          placeholder={type === "anomaly" ? "Write a shared resolution note…" : "Add context for all selected employees…"}
          confirmLabel={`${BULK_LABELS[bulkAction.key]?.bar || bulkAction.label} all`}
          tone={bulkAction.tone === "rose" ? "danger" : "primary"}
          minLength={bulkAction.requireRemarks ? 3 : 0}
          optional={!bulkAction.requireRemarks}
          error={bulkError}
          onSubmit={submitBulk}
          onClose={() => { setBulkAction(null); setBulkError(""); }}
        />
      )}

      {/* ── Single-item decision dialog ──────────────────────────────────── */}
      <DecisionDialog
        open={!!selected}
        entityKey={selected ? entityId(selected) : undefined}
        title={type === "anomaly" ? "Resolve attendance flag" : `Review ${cfg.label.toLowerCase()} request`}
        subtitle={selected ? resolvePerson(selected, names).name : ""}
        size="lg"
        actions={cfg.actions}
        notice={cfg.notice && <InlineAlert tone="sky">{cfg.notice}</InlineAlert>}
        remarksLabel={type === "anomaly" ? "Resolution note" : "Remarks for the employee"}
        mapError={mapError}
        onSubmit={handleSubmit}
        onClose={() => setSelected(null)}
      >
        {selected && <DecisionDetails type={type} item={selected} person={resolvePerson(selected, names)} fetchRecord={scope === "team"} />}
      </DecisionDialog>

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

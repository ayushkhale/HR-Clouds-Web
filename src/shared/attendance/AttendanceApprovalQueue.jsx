// ─────────────────────────────────────────────────────────────────────────────
// attendance/AttendanceApprovalQueue.jsx — Pending list + DecisionDialog for one
// decision type (regularization | overtime | compoff | anomaly). Used by the
// per-type manager pages and the Approvals Inbox so both behave identically.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HiCheckCircle, HiRefresh, HiSearch } from "react-icons/hi";
import DecisionDialog, { DetailRow } from "./DecisionDialog.jsx";
import { DECISION_TYPES, runDecision } from "./decisions.js";
import { resolvePerson, useTeamNames } from "./useTeamNames.js";
import { entityId, initials, listFrom } from "./normalize.js";
import { anomalyTypeLabel } from "./enums.js";
import { fmtDate, fmtDateTime, fmtHours, fmtMinutes, fmtTime, toLocalYMD, ymdOnly } from "./dates.js";
import { useAttendanceChanged } from "./events.js";
import { isAlreadyProcessed, isHierarchyViolation, isNotFound } from "../utils/attendanceErrors.js";
import { EmptyState, ErrorState, InlineAlert, LoadingRows, StatusBadge, Toast, useToast } from "./ui.jsx";

const itemDate = (i) => ymdOnly(i.date || i.record_date || i.attendance_record?.date || i.earned_date || i.worked_date);
const otMinutes = (i) => i.overtime_minutes ?? i.minutes ?? i.requested_minutes ?? (i.hours != null ? Math.round(Number(i.hours) * 60) : null);
const creditDays = (i) => i.days_earned ?? i.credit_days ?? i.days ?? null;
const expiry = (i) => ymdOnly(i.expiry_date || i.expires_on || i.valid_until);

function RequestedTime({ iso, date }) {
  if (!iso) return <span className="text-slate-400">—</span>;
  return (
    <>
      {fmtTime(iso)}
      {date && toLocalYMD(iso) > date && <span className="ml-1 text-[10px] font-bold text-indigo-500">+1 day</span>}
    </>
  );
}

const COLUMNS = {
  regularization: [
    { header: "Date", render: (i) => fmtDate(itemDate(i)) },
    { header: "Requested", render: (i) => <><RequestedTime iso={i.requested_clock_in} date={itemDate(i)} /> → <RequestedTime iso={i.requested_clock_out} date={itemDate(i)} /></> },
    { header: "Reason", render: (i) => <span className="block max-w-[260px] truncate" title={i.reason}>{i.reason || "—"}</span> },
    { header: "Submitted", render: (i) => fmtDateTime(i.created_at) },
  ],
  overtime: [
    { header: "Date", render: (i) => fmtDate(itemDate(i)) },
    { header: "Overtime", render: (i) => <span className="font-bold text-indigo-600">{fmtMinutes(otMinutes(i))}</span> },
    { header: "Worked", render: (i) => i.attendance_record ? `${fmtTime(i.attendance_record.clock_in_time)} – ${fmtTime(i.attendance_record.clock_out_time)}` : "—" },
    { header: "Notes", render: (i) => <span className="block max-w-[240px] truncate" title={i.reason || i.notes}>{i.reason || i.notes || "—"}</span> },
  ],
  compoff: [
    { header: "Worked on", render: (i) => fmtDate(itemDate(i)) },
    { header: "Hours", render: (i) => (i.worked_hours != null ? fmtHours(i.worked_hours) : "—") },
    { header: "Credit", render: (i) => (creditDays(i) != null ? `${creditDays(i)} day${Number(creditDays(i)) === 1 ? "" : "s"}` : "—") },
    { header: "Expires", render: (i) => (expiry(i) ? fmtDate(expiry(i)) : "—") },
  ],
  anomaly: [
    { header: "Date", render: (i) => fmtDate(itemDate(i) || ymdOnly(i.created_at)) },
    { header: "Flag", render: (i) => anomalyTypeLabel(i.type || i.anomaly_type) },
    { header: "Severity", render: (i) => (i.severity ? <StatusBadge kind="severity" status={i.severity} /> : "—") },
    { header: "Details", render: (i) => <span className="block max-w-[260px] truncate" title={i.description}>{i.description || "—"}</span> },
  ],
};

export function DecisionDetails({ type, item, person }) {
  const date = itemDate(item);
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 divide-y divide-slate-100">
      <DetailRow label="Employee">{person.name}{person.code ? ` · ${person.code}` : ""}</DetailRow>
      {type === "regularization" && (
        <>
          <DetailRow label="Date">{fmtDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</DetailRow>
          <DetailRow label="Requested in"><RequestedTime iso={item.requested_clock_in} date={date} /></DetailRow>
          <DetailRow label="Requested out"><RequestedTime iso={item.requested_clock_out} date={date} /></DetailRow>
          {item.attendance_record && (
            <DetailRow label="Currently recorded">{fmtTime(item.attendance_record.clock_in_time)} – {fmtTime(item.attendance_record.clock_out_time)}</DetailRow>
          )}
          <DetailRow label="Reason">{item.reason || "—"}</DetailRow>
        </>
      )}
      {type === "overtime" && (
        <>
          <DetailRow label="Date">{fmtDate(date)}</DetailRow>
          <DetailRow label="Overtime">{fmtMinutes(otMinutes(item))}</DetailRow>
          {item.attendance_record && <DetailRow label="Worked">{fmtTime(item.attendance_record.clock_in_time)} – {fmtTime(item.attendance_record.clock_out_time)} · {fmtHours(item.attendance_record.effective_hours)}</DetailRow>}
          {(item.reason || item.notes) && <DetailRow label="Notes">{item.reason || item.notes}</DetailRow>}
        </>
      )}
      {type === "compoff" && (
        <>
          <DetailRow label="Worked on">{fmtDate(date)}</DetailRow>
          {item.worked_hours != null && <DetailRow label="Hours worked">{fmtHours(item.worked_hours)}</DetailRow>}
          {creditDays(item) != null && <DetailRow label="Credit">{creditDays(item)} day(s)</DetailRow>}
          {expiry(item) && <DetailRow label="Expires">{fmtDate(expiry(item))}</DetailRow>}
        </>
      )}
      {type === "anomaly" && (
        <>
          <DetailRow label="Date">{fmtDate(date || ymdOnly(item.created_at))}</DetailRow>
          <DetailRow label="Flag">{anomalyTypeLabel(item.type || item.anomaly_type)}</DetailRow>
          {item.severity && <DetailRow label="Severity"><StatusBadge kind="severity" status={item.severity} /></DetailRow>}
          {item.description && <DetailRow label="Details">{item.description}</DetailRow>}
        </>
      )}
    </div>
  );
}

/** scope: "team" (manager reporting line) | "org" (HR — the pending queues are org-wide for HR, contract §2 C1). */
export default function AttendanceApprovalQueue({ type, onCountChange, scope = "team" }) {
  const cfg = DECISION_TYPES[type];
  const names = useTeamNames();
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [staleNotice, setStaleNotice] = useState("");
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await cfg.fetch();
      const items = listFrom(res, cfg.listKeys).sort((a, b) => itemDate(a).localeCompare(itemDate(b)));
      setState({ items, loading: false, error: null });
      onCountChange?.(type, items.length);
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, [cfg, type, onCountChange]);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged([cfg.event], load);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.items
      .map((item) => ({ item, person: resolvePerson(item, names) }))
      .filter(({ person }) => !q || person.name.toLowerCase().includes(q) || person.code.toLowerCase().includes(q));
  }, [state.items, names, search]);

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
      if (isNotFound(err) || isHierarchyViolation(err) || isAlreadyProcessed(err)) {
        setStaleNotice("The queue was refreshed because this request changed.");
        load();
      }
      throw err;
    }
  };

  const columns = COLUMNS[type];
  const actionLabel = type === "anomaly" ? "Resolve" : "Review";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="relative w-full sm:w-72">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code…" className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100" />
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-purple-600 disabled:opacity-50">
          <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {staleNotice && <InlineAlert tone="sky" className="m-4">{staleNotice}</InlineAlert>}

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} fallback={`Couldn't load pending ${cfg.label.toLowerCase()} items.`} />
      ) : state.loading && state.items.length === 0 ? (
        <div className="p-5"><LoadingRows rows={4} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={HiCheckCircle} title={state.items.length ? "No matches" : "All caught up"} message={state.items.length ? "No pending items match your search." : `There are no pending ${cfg.label.toLowerCase()} items ${scope === "org" ? "in the organisation" : "for your team"}.`} />
      ) : (
        <div className={`overflow-x-auto ${state.loading ? "opacity-60" : ""}`}>
          <table className="w-full text-left text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-5 py-3.5">Employee</th>
                {columns.map((c) => <th key={c.header} className="px-5 py-3.5">{c.header}</th>)}
                <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map(({ item, person }) => (
                <tr key={entityId(item)} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">{initials(person.name)}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{person.name}</p>
                        {person.code && <p className="text-[10px] text-slate-400">{person.code}</p>}
                      </div>
                    </div>
                  </td>
                  {columns.map((c) => <td key={c.header} className="px-5 py-3.5 text-xs font-medium whitespace-nowrap">{c.render(item)}</td>)}
                  <td className="px-5 py-3.5 text-right">
                    <button type="button" onClick={() => { setStaleNotice(""); setSelected(item); }} className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3.5 py-1.5 rounded-lg transition">
                      {actionLabel}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DecisionDialog
        open={!!selected}
        entityKey={selected ? entityId(selected) : undefined}
        title={type === "anomaly" ? "Resolve attendance flag" : `Review ${cfg.label.toLowerCase()} request`}
        subtitle={selected ? resolvePerson(selected, names).name : ""}
        actions={cfg.actions}
        notice={cfg.notice && <InlineAlert tone="sky">{cfg.notice}</InlineAlert>}
        remarksLabel={type === "anomaly" ? "Resolution note" : "Remarks for the employee"}
        onSubmit={handleSubmit}
        onClose={() => setSelected(null)}
      >
        {selected && <DecisionDetails type={type} item={selected} person={resolvePerson(selected, names)} />}
      </DecisionDialog>

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

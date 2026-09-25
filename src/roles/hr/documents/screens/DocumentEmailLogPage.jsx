// ─────────────────────────────────────────────────────────────────────────────
// DocumentEmailLogPage.jsx — Every document email the system has queued, and
// what became of it (#87).
//
// This screen exists because of one honest limitation: nothing else in the
// module can tell you whether an email actually arrived. Raising a request or
// nudging somebody only puts a notice in a queue; a separate sender empties
// that queue every fifteen minutes. So a 200 from "Remind now" means "queued",
// never "delivered" — and when somebody says "I never got it", this is the only
// place that can answer.
//
// The answer is usually one of four things, and the screen is built to get to
// each of them in one click:
//   Failed      — five attempts, then given up. `last_error` says why (almost
//                 always a bad or bouncing address). Kept for good.
//   Not sent    — deliberately skipped, because the setting was switched off
//                 or there was nobody to send to.
//   Waiting     — queued and not picked up yet. Send it now from Automation.
//   Sent        — handed to the email provider, with the time it went.
//
// `dedupe_key` is never returned by the server, so there is nothing here about
// how duplicates are prevented — only the notices themselves.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBell, HiCheckCircle, HiClock, HiExclamationCircle, HiExternalLink, HiEyeOff, HiLightningBolt,
  HiMail, HiRefresh, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Pagination, PersonCell } from "../../../../shared/attendance/ui";
import { fmtDate, fmtDateTime, todayYMD } from "../../../../shared/attendance/dates";
import DetailDialog, { DetailGrid, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { NotificationStatusBadge } from "../../../../shared/documents/requestUi";
import {
  NOTIFICATION_EVENT_ORDER, NOTIFICATION_STATUS_ORDER, notificationEventMeta, notificationStatusMeta,
  recipientLabel, requestListOf,
} from "../../../../shared/documents/requestMeta";
import { DocEmptyState, DocErrorState, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;
// The four states worth a headline. `sending` is left out: it lasts seconds.
const TALLY_STATUSES = ["failed", "pending", "sent", "skipped"];

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

/** What one notice was for, and where it ended up. */
function EmailDetailDialog({ row, nameOf, onClose }) {
  const event = notificationEventMeta(row.event_type);
  const meta = notificationStatusMeta(row.status);
  const attempts = Number(row.attempts) || 0;

  // The payload is whatever variables the email template needed. It is shown as
  // written rather than reformatted: the value of seeing it is knowing exactly
  // what the person was told.
  const payload = row.payload && typeof row.payload === "object" ? Object.entries(row.payload) : [];

  return (
    <DetailDialog
      title={event.label}
      subtitle={`To ${recipientLabel(row, nameOf)}`}
      eyebrow="Document email"
      icon={HiMail}
      badge={<NotificationStatusBadge status={row.status} />}
      onClose={onClose}
    >
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${row.status === "failed" ? "border-rose-200 bg-rose-50" : row.status === "sent" ? "border-violet-200 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
        <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 text-purple-600">
          {row.status === "failed" ? <HiExclamationCircle className="w-5 h-5 text-rose-600" /> : row.status === "sent" ? <HiCheckCircle className="w-5 h-5 text-violet-600" /> : <HiClock className="w-5 h-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{meta.label}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            {row.status === "sent"
              ? `Handed to the email service on ${fmtDateTime(row.sent_at)}. Whether it reached their inbox after that is between their mail provider and them.`
              : row.status === "failed"
                ? `Given up after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}. The reason is below — a wrong or full mailbox is the usual cause.`
                : row.status === "skipped"
                  ? "Never sent on purpose: either the matching setting was off, or there was nobody to send it to."
                  : row.status === "sending"
                    ? "Being sent right now."
                    : `Queued for ${fmtDateTime(row.scheduled_for)}. The sender runs every fifteen minutes; you can also run it now from Documents Automation.`}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">{event.blurb}</p>

      <DetailSection title="Delivery" icon={HiBell} collapsible={false}>
        <DetailGrid
          cols={3}
          items={[
            { label: "Sent to", value: recipientLabel(row, nameOf) },
            { label: "About", value: row.subject_user_id ? nameOf(row.subject_user_id, "an employee") : "N/A" },
            { label: "Attempts", value: `${attempts}` },
            { label: "Queued for", value: fmtDateTime(row.scheduled_for) },
            { label: "Picked up", value: row.claimed_at ? fmtDateTime(row.claimed_at) : "Not yet" },
            { label: "Sent", value: row.sent_at ? fmtDateTime(row.sent_at) : "Not sent" },
          ]}
        />
      </DetailSection>

      {row.last_error && (
        <DetailSection title="Why it didn't go" icon={HiExclamationCircle}>
          <DetailText>{row.last_error}</DetailText>
        </DetailSection>
      )}

      {payload.length > 0 && (
        <DetailSection title="What the email said" icon={HiMail} defaultOpen={false}>
          <DetailGrid cols={2} items={payload.map(([key, value]) => ({
            label: key.replace(/_/g, " "),
            value: value === null || value === undefined ? "N/A" : typeof value === "object" ? JSON.stringify(value) : String(value),
          }))} />
        </DetailSection>
      )}
    </DetailDialog>
  );
}

export default function DocumentEmailLogPage() {
  const { rows: people, nameOf } = useEmployeeDirectory();

  const [filters, setFilters] = useState({ status: "", event_type: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({ failed: null, pending: null, sent: null, skipped: null });
  const [detail, setDetail] = useState(null);

  const query = useMemo(() => ({
    status: filters.status || undefined,
    event_type: filters.event_type || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [filters]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getDocumentNotifications({ ...query, page, limit: PAGE });
      if (token !== reqRef.current) return;
      setState({ ...requestListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  // Four `limit: 1` reads, one per status worth a headline. Cheaper than fetching
  // the whole log, and each `total` is exactly the number the tile wants.
  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const scope = { event_type: filters.event_type || undefined, from: filters.from || undefined, to: filters.to || undefined };
    const results = await Promise.allSettled(
      TALLY_STATUSES.map((status) => documentsAPI.getDocumentNotifications({ ...scope, status, limit: 1 })),
    );
    if (token !== tallyRef.current) return;
    setTallies(Object.fromEntries(TALLY_STATUSES.map((status, i) => [
      status, results[i].status === "fulfilled" ? requestListOf(results[i].value).total : null,
    ])));
  }, [filters.event_type, filters.from, filters.to]);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);
  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const filtered = !!(filters.status || filters.event_type || filters.from || filters.to);
  const today = todayYMD();

  const rowsById = useMemo(() => new Map(people.map((p) => [p.user_id ?? p.id, p])), [people]);
  const personOf = useCallback((id) => rowsById.get(id) || { name: nameOf(id, "A colleague") }, [rowsById, nameOf]);
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));

  return (
    <>
      <DashboardTopBar title="Document Emails" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Document Emails</h1>
            <p className="text-sm text-slate-500 mt-1">
              Every reminder and notice the Documents module has queued, and what became of it. This is where to look when somebody says they never got an email.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <Link to="/dashboard/hr/documents/automation" className={SECONDARY_BTN}>
              <HiLightningBolt className="w-4 h-4" /> Send what’s waiting
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label="Didn't go" value={tallies.failed ?? "…"} sub="Given up after five tries"
            icon={HiExclamationCircle} tone="text-rose-500" alert={!!tallies.failed}
            onClick={() => update({ status: filters.status === "failed" ? "" : "failed" })} active={filters.status === "failed"}
          />
          <Tile
            label="Waiting to send" value={tallies.pending ?? "…"} sub="The sender runs every 15 minutes"
            icon={HiClock} tone="text-fuchsia-500"
            onClick={() => update({ status: filters.status === "pending" ? "" : "pending" })} active={filters.status === "pending"}
          />
          <Tile
            label="Sent" value={tallies.sent ?? "…"} sub="Handed to the email service"
            icon={HiCheckCircle} tone="text-violet-500"
            onClick={() => update({ status: filters.status === "sent" ? "" : "sent" })} active={filters.status === "sent"}
          />
          <Tile
            label="Not sent on purpose" value={tallies.skipped ?? "…"} sub="A setting was off, or nobody to send to"
            icon={HiEyeOff} tone="text-indigo-500"
            onClick={() => update({ status: filters.status === "skipped" ? "" : "skipped" })} active={filters.status === "skipped"}
          />
        </div>

        {tallies.failed > 0 && filters.status !== "failed" && (
          <button
            type="button"
            onClick={() => update({ status: "failed" })}
            className="w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left hover:bg-rose-100/60 transition"
          >
            <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-sm font-semibold text-rose-800 flex-1">
              {tallies.failed} {tallies.failed === 1 ? "email never reached its recipient" : "emails never reached their recipients"}. Usually a wrong or full mailbox — check the reason and fix the address on their profile.
            </span>
            <span className="text-xs font-bold text-rose-700">Show them</span>
          </button>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <select aria-label="What the email was for" value={filters.event_type} onChange={(e) => update({ event_type: e.target.value })} className={SELECT}>
            <option value="">Anything</option>
            {NOTIFICATION_EVENT_ORDER.map((key) => <option key={key} value={key}>{notificationEventMeta(key).label}</option>)}
          </select>
          <select aria-label="Delivery state" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={SELECT}>
            <option value="">Any state</option>
            {NOTIFICATION_STATUS_ORDER.map((key) => <option key={key} value={key}>{notificationStatusMeta(key).label}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            From
            <input type="date" value={filters.from} max={filters.to || today} onChange={(e) => update({ from: e.target.value })} className={SELECT} aria-label="From date" />
          </label>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            To
            <input type="date" value={filters.to} min={filters.from || undefined} max={today} onChange={(e) => update({ to: e.target.value })} className={SELECT} aria-label="To date" />
          </label>
          {filtered && (
            <button type="button" onClick={() => update({ status: "", event_type: "", from: "", to: "" })} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
              <HiX className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the email log." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={filters.status === "failed" ? HiCheckCircle : HiMail}
              title={filters.status === "failed" ? "Every email got through" : filtered ? "Nothing matches" : "No emails yet"}
              message={filters.status === "failed"
                ? "Nothing has been given up on."
                : filtered
                  ? "Try another kind of email, state or date range."
                  : "Nothing has been queued yet. Document emails are all switched off by default — turn the ones you want on in Document Settings."}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[820px]">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">What it was</th>
                      <th className="px-5 py-3.5">Sent to</th>
                      <th className="px-5 py-3.5">State</th>
                      <th className="px-5 py-3.5">Queued</th>
                      <th className="px-5 py-3.5">Sent</th>
                      <th className="px-5 py-3.5 text-right">Tries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {state.rows.map((row) => {
                      const event = notificationEventMeta(row.event_type);
                      const attempts = Number(row.attempts) || 0;
                      return (
                        <tr
                          key={row.id}
                          {...rowPreviewProps(() => setDetail(row), `Open the ${event.label} email`)}
                          className={`cursor-pointer outline-none transition-colors ${row.status === "failed" ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-purple-50/30 focus:bg-purple-50/40"}`}
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800 truncate max-w-[260px]">{event.label}</p>
                            {row.last_error && <p className="text-[11px] text-rose-600 truncate max-w-[260px]">{row.last_error}</p>}
                          </td>
                          <td className="px-5 py-3.5">
                            {row.recipient_user_id
                              ? <PersonCell entity={personOf(row.recipient_user_id)} />
                              : <span className="text-xs font-semibold text-slate-600">{recipientLabel(row, nameOf)}</span>}
                          </td>
                          <td className="px-5 py-3.5"><NotificationStatusBadge status={row.status} /></td>
                          <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(row.scheduled_for)}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{row.sent_at ? fmtDateTime(row.sent_at) : <span className="text-slate-400">Not sent</span>}</td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={`text-xs font-bold tabular-nums ${attempts >= 5 ? "text-rose-600" : attempts > 1 ? "text-fuchsia-700" : "text-slate-500"}`}>{attempts}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.total > PAGE && (
                <div className="px-5 py-4 border-t border-slate-100">
                  <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="email" />
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          Emails that were sent or deliberately skipped are cleared out after 90 days. Ones that failed are kept indefinitely, so there is always a record of a delivery problem. Emails never carry the document itself — only a link into this portal. <Link to="/dashboard/hr/documents/settings" className="font-bold text-purple-600 hover:underline">Choose which emails go out <HiExternalLink className="inline w-3 h-3" /></Link>
        </p>
      </main>

      {detail && <EmailDetailDialog row={detail} nameOf={nameOf} onClose={() => setDetail(null)} />}
    </>
  );
}

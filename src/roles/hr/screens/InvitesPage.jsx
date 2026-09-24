// ─────────────────────────────────────────────────────────────────────────────
// InvitesPage.jsx — Every invitation this organisation has sent, and what
// became of it.
//
// Reads `GET /organizations/users/invite`, which the backend has not built yet
// (gap B5 — see backend_spec_list_invitations_2026_09_24.md). Until it ships,
// that call 404s and the screen says so in plain words instead of showing a
// red error: sending, resending and revoking all work today, only the history
// is missing. The moment the endpoint exists this screen fills itself in with
// no further change.
//
// Resend and revoke are addressed by email, not id, so they work on any
// invitation the list can show.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiBan, HiCheckCircle, HiClock, HiExclamationCircle, HiInbox, HiMail,
  HiPaperAirplane, HiRefresh, HiSearch, HiUserAdd, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { organizationAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { FilterTabs, Pagination, Toast, useToast } from "../../../shared/attendance/ui";
import { TONE_CLASSES, TONE_DOT } from "../../../shared/attendance/enums";
import { fmtDate, fmtDateTime } from "../../../shared/attendance/dates";
import GenderAvatar from "../../../shared/components/GenderAvatar";
import InviteMemberModal from "../components/InviteMemberModal";

const PAGE = 25;

/* ── What became of an invitation ─────────────────────────────────────────── */
const INVITE_STATUS = {
  pending: { label: "Waiting to be accepted", short: "Waiting", tone: "amber", icon: HiClock },
  accepted: { label: "Accepted", short: "Accepted", tone: "emerald", icon: HiCheckCircle },
  revoked: { label: "Revoked", short: "Revoked", tone: "slate", icon: HiBan },
  expired: { label: "Expired", short: "Expired", tone: "rose", icon: HiExclamationCircle },
};
const statusMeta = (s) => INVITE_STATUS[s] || { label: s || "Unknown", short: s || "Unknown", tone: "slate", icon: HiMail };

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "accepted", label: "Accepted" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
];

function StatusPill({ status }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate}`}
      title={meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
      {meta.short}
    </span>
  );
}

/**
 * Whether the invitation email itself got out. An invitation can be perfectly
 * valid while its email bounced, and that person is then waiting for something
 * that never arrived — so a failed send is called out rather than hidden
 * behind a "Waiting" pill.
 */
function DeliveryNote({ invite }) {
  const state = invite.delivery_status;
  if (state === "failed") {
    return (
      <p className="flex items-start gap-1 text-[10px] font-bold text-rose-600 mt-1" title={invite.delivery_error || undefined}>
        <HiExclamationCircle className="w-3 h-3 shrink-0 mt-px" />
        Email didn&apos;t send{invite.delivery_error ? ` — ${invite.delivery_error}` : ""}
      </p>
    );
  }
  if (state === "queued") {
    return <p className="text-[10px] font-bold text-fuchsia-700 mt-1">Email still sending…</p>;
  }
  if (Number(invite.send_count) > 1) {
    return <p className="text-[10px] text-slate-400 mt-1">Sent {invite.send_count} times</p>;
  }
  return null;
}

export default function InvitesPage() {
  const { user } = useAuth();
  const { toast, showToast, clearToast } = useToast();

  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [busyEmail, setBusyEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await organizationAPI.listInvitations({
        status: filter || undefined,
        q: search || undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      if (token !== reqRef.current) return;
      const data = res?.data ?? res;
      const rows = Array.isArray(data) ? data : (data?.rows ?? data?.invitations ?? []);
      const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : rows.length;
      setState({ rows, total, loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [filter, search, page]);

  useEffect(() => { load(); }, [load]);

  // A 404 means the endpoint does not exist yet, which is a different thing
  // from the request failing — and calls for an explanation, not an error.
  const notBuiltYet = state.error?.status === 404;

  const resend = async (email) => {
    if (!email || busyEmail) return;
    setBusyEmail(email);
    try {
      await organizationAPI.resendInvitation({ email });
      showToast(`Invitation resent to ${email}`);
      load();
    } catch (err) {
      showToast(err?.data?.message || err.message || "Couldn't resend the invitation.", "error");
    } finally {
      setBusyEmail("");
    }
  };

  const revoke = async (email) => {
    if (!email || busyEmail) return;
    const ok = await window.confirm(
      `Revoke the invitation for ${email}?\n\nThe link in their email stops working immediately. You can invite them again later.`,
    );
    if (!ok) return;
    setBusyEmail(email);
    try {
      await organizationAPI.revokeInvitation({ email });
      showToast(`Invitation revoked for ${email}`);
      load();
    } catch (err) {
      showToast(err?.data?.message || err.message || "Couldn't revoke the invitation.", "error");
    } finally {
      setBusyEmail("");
    }
  };

  const tallies = useMemo(() => ({
    pending: state.rows.filter((r) => r.status === "pending").length,
    accepted: state.rows.filter((r) => r.status === "accepted").length,
    failed: state.rows.filter((r) => r.delivery_status === "failed").length,
  }), [state.rows]);

  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const filtered = !!(filter || search);

  return (
    <>
      <DashboardTopBar title="Invites" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Invites</h1>
            <p className="text-sm text-slate-500 mt-1">
              Everyone you&apos;ve invited to join, and whether they&apos;ve accepted yet.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button" onClick={load} disabled={state.loading}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50"
              aria-label="Refresh" title="Refresh"
            >
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button" onClick={() => setInviting(true)}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200"
            >
              <HiUserAdd className="w-4 h-4" /> New invite
            </button>
          </div>
        </div>

        {!notBuiltYet && !state.error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Waiting to be accepted (this page)", value: tallies.pending, icon: HiClock, tone: "text-fuchsia-500" },
              { label: "Accepted (this page)", value: tallies.accepted, icon: HiCheckCircle, tone: "text-violet-500" },
              { label: "Email didn't send (this page)", value: tallies.failed, icon: HiExclamationCircle, tone: "text-rose-500" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl bg-white border border-slate-100 shadow-xs px-4 py-3.5">
                <div className="flex items-center gap-2 text-slate-400">
                  <Icon className={`w-4 h-4 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none mt-2 tabular-nums">
                  {state.loading && !state.rows.length ? "…" : value}
                </p>
              </div>
            ))}
          </div>
        )}

        {!notBuiltYet && (
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-0 md:max-w-xs">
              <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email" aria-label="Search invitations"
                className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              />
            </div>
            <FilterTabs options={FILTERS} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} />
            {filtered && (
              <button
                type="button" onClick={() => { setQuery(""); setFilter(""); setPage(1); }}
                className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2"
              >
                <HiX className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {notBuiltYet ? (
            <div className="p-12 text-center">
              <span className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-3">
                <HiInbox className="w-7 h-7" />
              </span>
              <p className="text-sm font-bold text-slate-700">Invite history isn&apos;t available yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto leading-relaxed">
                This needs a change on the server before past invitations can be listed. Sending a new invite,
                resending one and revoking one all work now — only the history of what was sent is missing.
              </p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button" onClick={() => setInviting(true)}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200"
                >
                  <HiUserAdd className="w-4 h-4" /> Invite someone
                </button>
              </div>
            </div>
          ) : state.error ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4" role="alert">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-400">
                <HiExclamationCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 max-w-md">
                {state.error?.data?.message || state.error?.message || "Couldn't load the invitations."}
              </p>
              <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
                <HiRefresh className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <div className="p-12 text-center">
              <span className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-3">
                <HiMail className="w-7 h-7" />
              </span>
              <p className="text-sm font-bold text-slate-700">{filtered ? "Nothing matches" : "No invitations yet"}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                {filtered ? "Try another filter or search." : "Invite your first team member and they'll appear here."}
              </p>
            </div>
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[880px]">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <th className="px-6 py-4 border-b border-slate-100">Person</th>
                      <th className="px-6 py-4 border-b border-slate-100">Role</th>
                      <th className="px-6 py-4 border-b border-slate-100">Department</th>
                      <th className="px-6 py-4 border-b border-slate-100">Status</th>
                      <th className="px-6 py-4 border-b border-slate-100">Sent</th>
                      <th className="px-6 py-4 border-b border-slate-100">Invited by</th>
                      <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {state.rows.map((inv) => {
                      const open = inv.status === "pending" || inv.status === "expired";
                      const busy = busyEmail === inv.email;
                      return (
                        <tr key={inv.id || inv.email} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-slate-100"><GenderAvatar person={inv} /></span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate max-w-[220px]">{inv.name || "Invited person"}</p>
                                <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{inv.email}</p>
                                <DeliveryNote invite={inv} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-semibold text-slate-700 capitalize">{inv.role || "employee"}</span>
                            {inv.designation && <p className="text-[10px] text-slate-400">{inv.designation}</p>}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">{inv.department_name || inv.department || "—"}</td>
                          <td className="px-6 py-4">
                            <StatusPill status={inv.status} />
                            {inv.status === "accepted" && inv.accepted_at && (
                              <p className="text-[10px] text-slate-400 mt-1">{fmtDate(inv.accepted_at)}</p>
                            )}
                            {inv.status === "pending" && inv.expires_at && (
                              <p className="text-[10px] text-slate-400 mt-1">Expires {fmtDate(inv.expires_at)}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-semibold text-slate-700">{inv.invited_at ? fmtDate(inv.invited_at) : "—"}</p>
                            {inv.last_sent_at && inv.last_sent_at !== inv.invited_at && (
                              <p className="text-[10px] text-slate-400" title={fmtDateTime(inv.last_sent_at)}>
                                resent {fmtDate(inv.last_sent_at)}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 truncate max-w-[140px]">
                            {inv.invited_by_name || (inv.invited_by === user?.id ? "You" : "—")}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1.5">
                              {open ? (
                                <>
                                  <button
                                    type="button" onClick={() => resend(inv.email)} disabled={busy}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition"
                                  >
                                    <HiPaperAirplane className="w-3.5 h-3.5" /> {busy ? "…" : "Resend"}
                                  </button>
                                  <button
                                    type="button" onClick={() => revoke(inv.email)} disabled={busy}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                                  >
                                    <HiBan className="w-3.5 h-3.5" /> Revoke
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-300">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.total > PAGE && (
                <div className="px-6 py-4 border-t border-slate-100">
                  <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="invitation" />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {inviting && (
        <InviteMemberModal
          userId={user?.id}
          onClose={() => setInviting(false)}
          onInvited={() => { showToast("Invitation sent"); load(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvitesPage.jsx — Every invitation this organisation has sent, and what
// became of it (`GET /organizations/users/invite`).
//
// Contract: public/ref docs/md_updates/
// invitation_list_manager_daily_log_and_type_contracts_2026_09_24.md §1.
//
//   · `status` is derived by the server on every read — pending, accepted,
//     revoked, expired. Invitations last 48 hours from the LAST send.
//   · `delivery_status` says whether the email got out. `queued` means the send
//     was never attempted (the server stopped between saving and sending), so
//     it is treated like a failure: resend to be sure.
//   · Revoked rows stay in the list. Re-inviting after a revoke adds a new row.
//   · Invitations sent before the history existed only appear once resent.
//   · Until the server's database update is applied the list answers 500; a
//     404 means the endpoint isn't deployed at all. Both get a plain notice.
//
// Actions, by email:
//   pending → Resend (new link, new 48 hours) · Revoke
//   expired → Invite again: resend needs a live invitation, so this sends a
//             fresh invite from the snapshot the row kept (the server refreshes
//             the same row rather than adding one)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiBan, HiCheckCircle, HiClock, HiExclamationCircle, HiInbox, HiMail,
  HiPaperAirplane, HiRefresh, HiSearch, HiUserAdd, HiX, HiUserCircle,
} from "react-icons/hi";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import DetailDialog, { DetailGrid, DetailSection, DetailStats, rowPreviewProps } from "../../../shared/components/DetailDialog";
import { organizationAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { FilterTabs, Pagination, Toast, useToast } from "../../../shared/attendance/ui";
import { TONE_CLASSES, TONE_DOT } from "../../../shared/attendance/enums";
import { fmtDate, fmtDateTime } from "../../../shared/attendance/dates";
import { useTargetingOptions } from "../../../shared/attendance/useTargetingOptions";
import GenderAvatar from "../../../shared/components/GenderAvatar";
import InviteMemberModal from "../components/InviteMemberModal";

const PAGE = 25;
const SELECT = "h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:border-purple-400 outline-none";

/* ── What became of an invitation ─────────────────────────────────────────── */
const INVITE_STATUS = {
  pending: { label: "Waiting to be accepted", short: "Waiting", tone: "amber", icon: HiClock },
  accepted: { label: "Accepted — they've joined", short: "Accepted", tone: "emerald", icon: HiCheckCircle },
  revoked: { label: "Revoked — the link no longer works", short: "Revoked", tone: "slate", icon: HiBan },
  expired: { label: "Expired — not accepted within 48 hours", short: "Expired", tone: "rose", icon: HiExclamationCircle },
};
const statusMeta = (s) => INVITE_STATUS[s] || { label: s || "N/A", short: s || "N/A", tone: "slate", icon: HiMail };

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

// The roles an invitation can be issued for (the list filter's allow-list).
const ROLE_LABEL = { employee: "Employee", manager: "Manager", hr: "HR", admin: "Admin", worker: "Worker" };
const roleLabel = (r) => ROLE_LABEL[r] || (r ? r[0].toUpperCase() + r.slice(1) : "N/A");

/** The email didn't (or may not have) gone out — worth calling out on a pending invite. */
const emailProblem = (inv) => inv.delivery_status === "failed" || inv.delivery_status === "queued";

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
 * Whether the invitation email got out. An invitation can be perfectly valid
 * while its email bounced, and that person is then waiting for something that
 * never arrived — so a problem is called out rather than hidden behind
 * "Waiting". Only relevant while the invitation is still open.
 */
function DeliveryNote({ invite }) {
  const open = invite.status === "pending";
  if (open && invite.delivery_status === "failed") {
    return (
      <p className="flex items-start gap-1 text-[10px] font-bold text-rose-600 mt-1" title={invite.delivery_error || undefined}>
        <HiExclamationCircle className="w-3 h-3 shrink-0 mt-px" />
        Email didn&apos;t send — resend it
      </p>
    );
  }
  if (open && invite.delivery_status === "queued") {
    return (
      <p className="flex items-start gap-1 text-[10px] font-bold text-fuchsia-700 mt-1">
        <HiExclamationCircle className="w-3 h-3 shrink-0 mt-px" />
        Email may not have gone out — resend to be sure
      </p>
    );
  }
  if (Number(invite.send_count) > 1) {
    return <p className="text-[10px] text-slate-400 mt-1">Sent {invite.send_count} times</p>;
  }
  return null;
}

function Tile({ label, value, icon: Icon, tone, onClick, active, alert = false }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-2xl border px-4 py-3.5 transition ${active ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100" : alert ? "bg-rose-50/40 border-rose-200 hover:border-rose-300" : "bg-white border-slate-100 hover:border-purple-200 shadow-xs"}`}
    >
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums ${alert ? "text-rose-700" : "text-slate-800"}`}>{value === null ? "…" : value}</p>
    </button>
  );
}

/** A plain-words state for a list that can't be read yet (endpoint missing or not switched on). */
function NotReady({ reason, onRetry, onInvite }) {
  const missing = reason === "missing";
  return (
    <div className="p-12 text-center">
      <span className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-3">
        <HiInbox className="w-7 h-7" />
      </span>
      <p className="text-sm font-bold text-slate-700">Invite history isn&apos;t available yet</p>
      <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto leading-relaxed">
        {missing
          ? "This needs a change on the server before past invitations can be listed."
          : "The server couldn't read the invite history. It usually means a server update is still being finished — try again in a few minutes."}
        {" "}Sending a new invite still works.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {!missing && (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
            <HiRefresh className="w-4 h-4" /> Try again
          </button>
        )}
        <button
          type="button" onClick={onInvite}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200"
        >
          <HiUserAdd className="w-4 h-4" /> Invite someone
        </button>
      </div>
    </div>
  );
}

/** Everything about one invitation — opened by clicking its row. */
function InvitePreview({ inv, you, busy, onResend, onRevoke, onReinvite, onClose }) {
  const meta = statusMeta(inv.status);
  const footer = [];
  if (inv.status === "pending") {
    footer.push(
      <button key="revoke" type="button" onClick={() => onRevoke(inv)} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
        <HiBan className="w-4 h-4" /> Revoke
      </button>,
      <button key="resend" type="button" onClick={() => onResend(inv)} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 disabled:opacity-50">
        <HiPaperAirplane className="w-4 h-4" /> {busy ? "Sending…" : "Resend"}
      </button>,
    );
  }
  if (inv.status === "expired") {
    footer.push(
      <button key="again" type="button" onClick={() => onReinvite(inv)} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 disabled:opacity-50">
        <HiPaperAirplane className="w-4 h-4" /> {busy ? "Sending…" : "Invite again"}
      </button>,
    );
  }

  const delivery = inv.delivery_status === "failed"
    ? "Didn't send"
    : inv.delivery_status === "queued" ? "May not have gone out" : inv.delivery_status === "sent" ? "Sent" : null;

  return (
    <DetailDialog
      eyebrow="Invitation"
      icon={HiMail}
      title={inv.name || inv.email}
      subtitle={inv.name ? inv.email : undefined}
      badge={<StatusPill status={inv.status} />}
      onClose={onClose}
      footer={footer.length ? <>{footer}</> : undefined}
    >
      {inv.status === "pending" && emailProblem(inv) && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
          <HiExclamationCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-bold">{inv.delivery_status === "failed" ? "The invitation email didn't send" : "The invitation email may not have gone out"}</p>
            <p className="mt-0.5 break-words">
              {inv.delivery_status === "failed"
                ? `${inv.delivery_error ? `The mail service said: “${inv.delivery_error}”. ` : ""}Check the address, then resend.`
                : "It was saved but never handed to the mail service. Resend it so they get a link."}
            </p>
          </div>
        </div>
      )}

      <DetailStats
        items={[
          { label: "Status", value: meta.short, icon: meta.icon, hint: meta.label },
          { label: "Invited", value: fmtDate(inv.invited_at), icon: HiClock },
          {
            label: inv.status === "accepted" ? "Joined" : inv.status === "revoked" ? "Revoked" : "Link valid until",
            value: fmtDateTime(inv.status === "accepted" ? inv.accepted_at : inv.status === "revoked" ? inv.revoked_at : inv.expires_at),
            icon: HiCheckCircle,
          },
          { label: "Times sent", value: Number(inv.send_count) || 1, icon: HiPaperAirplane },
        ]}
      />

      <DetailSection title="Invited as" icon={HiUserCircle}>
        <DetailGrid
          cols={3}
          items={[
            ["Role", roleLabel(inv.role)],
            ["Department", inv.department_name || null],
            ["Designation", inv.designation || null],
            ["Reports to", inv.reporting_person_name || null],
            ["Invited by", inv.invited_by === you ? "You" : inv.invited_by_name || null],
            ["Email delivery", delivery],
          ]}
        />
        <p className="text-[11px] text-slate-500 mt-3">
          {inv.status === "accepted"
            ? "This is what they were invited as. Their current details are on their profile."
            : "This is what they were invited as."}
        </p>
      </DetailSection>

      <DetailSection title="History" icon={HiClock} defaultOpen={false}>
        <DetailGrid
          cols={2}
          items={[
            ["First sent", fmtDateTime(inv.invited_at)],
            ["Last sent", fmtDateTime(inv.last_sent_at)],
            ["Link expires", fmtDateTime(inv.expires_at)],
            ["Accepted", inv.accepted_at ? fmtDateTime(inv.accepted_at) : null],
            ["Revoked", inv.revoked_at ? fmtDateTime(inv.revoked_at) : null],
          ]}
        />
      </DetailSection>
    </DetailDialog>
  );
}

export default function InvitesPage() {
  const { user } = useAuth();
  const { toast, showToast, clearToast } = useToast();
  const targeting = useTargetingOptions();

  const [filter, setFilter] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({ pending: null, accepted: null, expired: null });
  const [busyEmail, setBusyEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    // The server caps `q` at 200 characters.
    const id = setTimeout(() => { setSearch(query.trim().slice(0, 200)); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [query]);

  // Unknown query keys are silently dropped by the server, so these names must
  // match the contract exactly: status, q, role, department_id, limit, offset.
  const scope = useMemo(() => ({
    q: search || undefined,
    role: role || undefined,
    department_id: department || undefined,
  }), [search, role, department]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await organizationAPI.listInvitations({
        ...scope,
        status: filter || undefined,
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
  }, [scope, filter, page]);

  useEffect(() => { load(); }, [load]);

  /** Real totals per status (one-row reads), for the same search and filters. */
  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const read = (status) => organizationAPI.listInvitations({ ...scope, status, limit: 1 });
    const results = await Promise.allSettled([read("pending"), read("accepted"), read("expired")]);
    if (token !== tallyRef.current) return;
    const total = (r) => {
      if (r.status !== "fulfilled") return null;
      const data = r.value?.data ?? r.value;
      return Number.isFinite(Number(data?.total)) ? Number(data.total) : null;
    };
    setTallies({ pending: total(results[0]), accepted: total(results[1]), expired: total(results[2]) });
  }, [scope]);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);

  // A 404 means the endpoint isn't deployed; a bare 500 means it is but its
  // storage isn't ready yet. Neither is the person's fault, so neither is red.
  const notReady = state.error?.status === 404
    ? "missing"
    : state.error?.status >= 500 && !state.error?.data?.errorCode ? "pending-setup" : null;

  const serverMessage = (err, fallback) => err?.data?.message || (err?.message && !/^Request failed/.test(err.message) ? err.message : "") || fallback;

  const resend = async (inv) => {
    if (!inv?.email || busyEmail) return;
    setBusyEmail(inv.email);
    try {
      await organizationAPI.resendInvitation({ email: inv.email });
      showToast(`Sent again to ${inv.email} — the old link stops working and the new one lasts 48 hours`);
      setPreview(null);
      refresh();
    } catch (err) {
      showToast(serverMessage(err, "Couldn't resend the invitation."), "error");
      refresh();
    } finally {
      setBusyEmail("");
    }
  };

  const revoke = async (inv) => {
    if (!inv?.email || busyEmail) return;
    const ok = await window.confirm(
      `Revoke the invitation for ${inv.email}?\n\nThe link in their email stops working straight away. The invitation stays in this list as revoked, and you can invite them again later.`,
    );
    if (!ok) return;
    setBusyEmail(inv.email);
    try {
      await organizationAPI.revokeInvitation({ email: inv.email });
      showToast(`Invitation revoked for ${inv.email}`);
      setPreview(null);
      refresh();
    } catch (err) {
      showToast(serverMessage(err, "Couldn't revoke the invitation."), "error");
      refresh();
    } finally {
      setBusyEmail("");
    }
  };

  /**
   * An expired invitation has no live link to resend, so a fresh invite is sent
   * with what the row remembers. The server refreshes that same row.
   */
  const reinvite = async (inv) => {
    if (!inv?.email || busyEmail) return;
    const ok = await window.confirm(`Invite ${inv.name || inv.email} again?\n\nThey get a new email with a link that lasts 48 hours, as ${roleLabel(inv.role).toLowerCase()}${inv.department_name ? ` in ${inv.department_name}` : ""}.`);
    if (!ok) return;
    const payload = { email: inv.email, role: inv.role || "employee" };
    if (inv.name) payload.name = inv.name;
    if (inv.department_id) payload.department_id = inv.department_id;
    if (inv.designation) payload.designation = inv.designation;
    if (inv.reporting_person) payload.reporting_person = inv.reporting_person;
    setBusyEmail(inv.email);
    try {
      await organizationAPI.inviteUser(payload);
      showToast(`Invited ${inv.email} again`);
      setPreview(null);
      refresh();
    } catch (err) {
      showToast(serverMessage(err, "Couldn't send the invitation again."), "error");
      refresh();
    } finally {
      setBusyEmail("");
    }
  };

  const pick = (value) => { setFilter(value); setPage(1); };
  const clearAll = () => { setQuery(""); setSearch(""); setFilter(""); setRole(""); setDepartment(""); setPage(1); };
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const filtered = !!(filter || search || role || department);
  const hasAction = (inv) => inv.status === "pending" || inv.status === "expired";
  const anyAction = state.rows.some(hasAction);
  const deliveryIssues = state.rows.filter((r) => r.status === "pending" && emailProblem(r)).length;

  return (
    <>
      <DashboardTopBar title="Invites" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Invites</h1>
            <p className="text-sm text-slate-500 mt-1">
              Everyone you&apos;ve invited to join, and whether they&apos;ve accepted. An invitation link lasts 48 hours from when it was last sent.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button" onClick={refresh} disabled={state.loading}
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

        {!notReady && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Tile label="Waiting to be accepted" value={tallies.pending} icon={HiClock} tone="text-fuchsia-500" onClick={() => pick(filter === "pending" ? "" : "pending")} active={filter === "pending"} />
              <Tile label="Accepted" value={tallies.accepted} icon={HiCheckCircle} tone="text-violet-500" onClick={() => pick(filter === "accepted" ? "" : "accepted")} active={filter === "accepted"} />
              <Tile label="Expired — invite again" value={tallies.expired} icon={HiExclamationCircle} tone="text-rose-500" onClick={() => pick(filter === "expired" ? "" : "expired")} active={filter === "expired"} alert={Number(tallies.expired) > 0 && filter !== "expired"} />
            </div>

            {deliveryIssues > 0 && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-800">
                  <span className="font-bold">{deliveryIssues === 1 ? "One invitation email" : `${deliveryIssues} invitation emails`} on this page didn&apos;t reach {deliveryIssues === 1 ? "its person" : "their people"}.</span>{" "}
                  They&apos;re marked below — check the address and resend.
                </p>
              </div>
            )}

            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-0 lg:max-w-xs">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200}
                  placeholder="Search by name or email" aria-label="Search invitations"
                  className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
                />
              </div>
              <select aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={SELECT}>
                <option value="">Any role</option>
                {["employee", "manager", "hr"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <select aria-label="Department" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className={SELECT}>
                <option value="">Every department</option>
                {targeting.departmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <FilterTabs options={FILTERS} value={filter} onChange={pick} />
              {filtered && (
                <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
                  <HiX className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {notReady ? (
            <NotReady reason={notReady} onRetry={refresh} onInvite={() => setInviting(true)} />
          ) : state.error ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4" role="alert">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-400">
                <HiExclamationCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 max-w-md">
                {state.error?.status === 403
                  ? "You don't have access to the invite list."
                  : serverMessage(state.error, "Couldn't load the invitations.")}
              </p>
              <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
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
                {filtered
                  ? "Try another filter or search."
                  : "Invite your first team member and they'll appear here. Invitations sent before this list existed show up once you resend them."}
              </p>
              {filtered && (
                <button type="button" onClick={clearAll} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
                  Show everything
                </button>
              )}
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
                      {anyAction && <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {state.rows.map((inv) => {
                      const busy = busyEmail === inv.email;
                      return (
                        <tr
                          key={inv.id || inv.email}
                          className="cursor-pointer hover:bg-purple-50/30 transition-colors outline-none focus-visible:bg-purple-50"
                          {...rowPreviewProps(() => setPreview(inv), `Invitation for ${inv.name || inv.email}`)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-slate-100"><GenderAvatar person={inv} name={inv.name || inv.email} /></span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate max-w-[220px]">{inv.name || inv.email}</p>
                                {inv.name && <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{inv.email}</p>}
                                <DeliveryNote invite={inv} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-semibold text-slate-700">{roleLabel(inv.role)}</span>
                            {inv.designation && <p className="text-[10px] text-slate-400">{inv.designation}</p>}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {inv.department_name ? <span className="text-slate-600">{inv.department_name}</span> : <span className="text-slate-400">N/A</span>}
                          </td>
                          <td className="px-6 py-4">
                            <StatusPill status={inv.status} />
                            {inv.status === "accepted" && inv.accepted_at && (
                              <p className="text-[10px] text-slate-400 mt-1">Joined {fmtDate(inv.accepted_at)}</p>
                            )}
                            {inv.status === "pending" && inv.expires_at && (
                              <p className="text-[10px] text-slate-400 mt-1" title={fmtDateTime(inv.expires_at)}>Link valid until {fmtDate(inv.expires_at)}</p>
                            )}
                            {inv.status === "revoked" && inv.revoked_at && (
                              <p className="text-[10px] text-slate-400 mt-1">{fmtDate(inv.revoked_at)}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-semibold text-slate-700">{fmtDate(inv.invited_at)}</p>
                            {inv.last_sent_at && inv.last_sent_at !== inv.invited_at && (
                              <p className="text-[10px] text-slate-400" title={fmtDateTime(inv.last_sent_at)}>
                                last sent {fmtDate(inv.last_sent_at)}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs truncate max-w-[140px]">
                            {inv.invited_by === user?.id
                              ? <span className="text-slate-600">You</span>
                              : inv.invited_by_name ? <span className="text-slate-600">{inv.invited_by_name}</span> : <span className="text-slate-400">N/A</span>}
                          </td>
                          {anyAction && (
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-1.5">
                                {inv.status === "pending" && (
                                  <>
                                    <button
                                      type="button" onClick={() => resend(inv)} disabled={busy}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition"
                                    >
                                      <HiPaperAirplane className="w-3.5 h-3.5" /> {busy ? "Sending…" : "Resend"}
                                    </button>
                                    <button
                                      type="button" onClick={() => revoke(inv)} disabled={busy}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                                    >
                                      <HiBan className="w-3.5 h-3.5" /> Revoke
                                    </button>
                                  </>
                                )}
                                {inv.status === "expired" && (
                                  <button
                                    type="button" onClick={() => reinvite(inv)} disabled={busy}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition"
                                  >
                                    <HiPaperAirplane className="w-3.5 h-3.5" /> {busy ? "Sending…" : "Invite again"}
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
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

      {preview && (
        <InvitePreview
          inv={preview}
          you={user?.id}
          busy={busyEmail === preview.email}
          onResend={resend}
          onRevoke={revoke}
          onReinvite={reinvite}
          onClose={() => setPreview(null)}
        />
      )}

      {inviting && (
        <InviteMemberModal
          userId={user?.id}
          onClose={() => setInviting(false)}
          onInvited={() => { showToast("Invitation sent"); refresh(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

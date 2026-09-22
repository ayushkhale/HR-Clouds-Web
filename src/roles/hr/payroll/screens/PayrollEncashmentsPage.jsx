// ─────────────────────────────────────────────────────────────────────────────
// PayrollEncashmentsPage.jsx — cashing out comp-offs and unused leave
// (API #206–#211).
//
// A comp-off is a day earned for working on an off day. Rather than taking the
// day, an employee can be paid for it. Managers propose (#216, Tier B), HR
// approves or raises one directly (Tier C).
//
// Approving is the moment money moves: the comp-off is marked as cashed out and
// the leave wallet is debited in the same transaction, then an earning
// adjustment lands in the chosen pay month. That is irreversible once the run is
// paid, so approve asks first and says exactly what will happen.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import useEmployeeDirectory from "../useEmployeeDirectory";
import {
  HiPlus, HiCash, HiCheck, HiX, HiBan, HiCalendar, HiUser, HiInformationCircle, HiExclamationCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import PeriodPicker from "../PeriodPicker";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import {
  ENCASHMENT_STATUS, SOURCE_KINDS, encashmentStatusMeta, sourceKindLabel, encashmentActions, toneClass, amount,
} from "../phase7Meta";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import CompOffPicker, { loadHrCompOffsFor } from "../../../../shared/components/CompOffPicker";

const PAGE_SIZE = 20;
const currentPeriod = () => new Date().toISOString().slice(0, 7);

const STATUS_FILTERS = [["", "All requests"], ...Object.entries(ENCASHMENT_STATUS).map(([k, v]) => [k, v.label])];

/** Days can be fractional (half a comp-off), so never round them away. */
const fmtDays = (v) => {
  const n = amount(v);
  if (n === null) return "N/A";
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
};

function StatusPill({ status }) {
  const meta = encashmentStatusMeta(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${toneClass(meta.tone)}`}>
      {meta.label}
    </span>
  );
}

/* ── Raise a request ──────────────────────────────────────────────────────── */

function CreateDialog({ onClose, onDone, showToast, settings }) {
  const { rows: people, status: dirStatus } = useEmployeeDirectory({ includeInactive: false });
  const [form, setForm] = useState({
    user_id: "", source_kind: "comp_off", leave_type_code: "EL", days: "", period_month: currentPeriod(),
  });
  const [compOffIds, setCompOffIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCompOff = form.source_kind === "comp_off";
  // The two source kinds are gated by different settings; say which is off
  // rather than letting the server refuse after the form is filled in.
  const disabledReason = isCompOff
    ? (settings && settings.compoff_encashment_enabled === false
      ? "Cashing out earned leave is switched off in Payroll Settings." : "")
    : (settings && settings.fnf_leave_encashment_enabled === false
      ? "Paying out leave balances is switched off in Payroll Settings." : "");

  const ids = compOffIds;
  const personName = people.find((p) => (p.user_id ?? p.id) === form.user_id)?.name || "This person";
  const problem = !form.user_id ? "Choose an employee."
    : disabledReason
      || (isCompOff
        ? (ids.length === 0 ? "Tick at least one earned leave day." : "")
        : (!form.leave_type_code.trim() ? "Enter the leave type." : !(parseFloat(form.days) > 0) ? "Enter how many days." : ""));

  const submit = async (e) => {
    e.preventDefault();
    if (problem || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = isCompOff
        ? { source_kind: "comp_off", comp_off_ids: ids, period_month: form.period_month }
        : { source_kind: "leave_balance", leave_type_code: form.leave_type_code.trim().toUpperCase(), days: parseFloat(form.days), period_month: form.period_month };
      await payrollAPI.createEncashment(form.user_id, payload);
      showToast("Request raised");
      onDone();
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't raise this request."));
      setSaving(false);
    }
  };

  const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";
  const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Pay out a balance</h2>
            <p className="text-xs text-slate-500 mt-0.5">Turn unused days into cash on a payslip.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className={labelCls}>Employee</label>
            <PersonSelect people={people} value={form.user_id} onChange={(id) => setForm({ ...form, user_id: id })} placeholder="Choose an employee" loading={dirStatus === "loading"} />
          </div>

          <div>
            <span className={labelCls}>What is being paid out</span>
            <div className="grid grid-cols-2 gap-2">
              {SOURCE_KINDS.map((k) => (
                <button key={k.value} type="button"
                  onClick={() => setForm({ ...form, source_kind: k.value })}
                  aria-pressed={form.source_kind === k.value}
                  className={`text-left px-3.5 py-3 rounded-xl border transition ${form.source_kind === k.value ? "border-purple-400 bg-purple-50 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-200"}`}>
                  <span className={`block text-xs font-bold ${form.source_kind === k.value ? "text-purple-800" : "text-slate-700"}`}>{k.label}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">{k.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          {isCompOff ? (
            <div>
              <span className={labelCls}>Which days to cash out</span>
              <CompOffPicker userId={form.user_id} value={compOffIds} onChange={setCompOffIds} load={loadHrCompOffsFor} personName={personName} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Leave type</label>
                <input type="text" value={form.leave_type_code} onChange={(e) => setForm({ ...form, leave_type_code: e.target.value.toUpperCase() })} placeholder="EL" className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>Days</label>
                <input type="number" step="0.5" min="0.5" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} placeholder="5" className={fieldCls} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Pay it in</label>
            <PeriodPicker value={form.period_month} onChange={(v) => setForm({ ...form, period_month: v })} idPrefix="enc-period" selectClassName={fieldCls} yearsBack={1} yearsAhead={1} />
            <p className="text-[11px] text-slate-400 mt-1.5">The month whose payslip this is added to. It must still be open.</p>
          </div>

          {disabledReason && (
            <p className="flex items-start gap-2 text-[11px] font-semibold text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3.5 py-2.5">
              <HiInformationCircle className="w-4 h-4 shrink-0" /> <span>{disabledReason}</span>
            </p>
          )}
          {error && (
            <p className="flex items-start gap-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              <HiExclamationCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
            </p>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {problem && <p className="text-[11px] font-semibold text-slate-500 mb-2.5">{problem}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
            <button type="submit" disabled={!!problem || saving} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
              {saving ? "Raising…" : "Raise request"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function PayrollEncashmentsPage() {
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const { rows: people, nameOf, status: dirStatus } = useEmployeeDirectory();

  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", source_kind: "", period_month: "", user_id: "" });
  const [settings, setSettings] = useState(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reasonFor, setReasonFor] = useState(null); // { row, action }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await payrollAPI.getEncashments(params);
      const norm = normalizePaginated(res, ["encashments", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setError("");
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't load these requests."));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    payrollAPI.getSettings().then((res) => setSettings(res?.data || null)).catch(() => {});
  }, []);

  // The row opens the dialog at once; the single-encashment read (#208) then
  // replaces it so a request another HR user just approved or cancelled shows
  // its real status before anyone acts on it.
  const openDetail = async (row) => {
    setDetail(row);
    try {
      const res = await payrollAPI.getEncashment(row.id);
      const fresh = res?.data;
      if (fresh?.id) setDetail((current) => (current?.id === fresh.id ? { ...current, ...fresh } : current));
    } catch {
      // Keep showing the list row; it is only at most one refresh stale.
    }
  };

  // Maker–checker: when the organisation requires a separate checker, whoever
  // raised a request may not approve it (§5.5).
  const separateChecker = Boolean(settings?.payroll_require_separate_checker);
  const viewerId = user?.id;

  const act = async (row, action, reason) => {
    setBusyId(row.id);
    try {
      if (action === "approve") await payrollAPI.approveEncashment(row.id);
      else if (action === "reject") await payrollAPI.rejectEncashment(row.id, { reason });
      else await payrollAPI.cancelEncashment(row.id, reason ? { reason } : {});
      showToast(action === "approve" ? "Approved — it will be paid in the chosen month"
        : action === "reject" ? "Request rejected" : "Request cancelled");
      setDetail(null);
      load();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't update this request."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (row) => {
    const days = fmtDays(row.days);
    const money = amount(row.amount) === null ? "" : ` (${formatMoney(row.amount)})`;
    const ok = await window.confirm(
      `Approve ${days}${money} for ${nameOf(row.user_id, "this employee")}?\n\n` +
      `The balance is taken off straight away and the amount is added to the ${formatPeriod(row.period_month)} payslip. ` +
      `Once that payroll is paid, this can't be undone.`
    );
    if (ok) act(row, "approve");
  };

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const pending = useMemo(() => list.items.filter((r) => r.status === "pending").length, [list.items]);
  const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";
  const filterLabelCls = "block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1";

  return (
    <>
      <DashboardTopBar title="Encashments" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Encashments</h1>
            <p className="text-sm text-slate-500 mt-1">
              Pay people for earned leave and unused leave instead of them taking the time off.
              {pending > 0 && <span className="font-semibold text-fuchsia-700"> {pending} waiting for approval.</span>}
            </p>
          </div>
          <button onClick={() => setCreating(true)} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 flex items-center gap-2">
            <HiPlus className="w-4 h-4" /> Pay out a balance
          </button>
        </div>

        {/* Every filter is labelled: an unlabelled month box gave no clue what
            it narrowed. Empty means "any", and the server takes YYYY-MM. */}
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="min-w-[9rem]">
            <label htmlFor="enc-f-status" className={filterLabelCls}>Status</label>
            <select id="enc-f-status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={`${selectCls} w-full`}>
              {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="min-w-[11rem]">
            <label htmlFor="enc-f-kind" className={filterLabelCls}>What is paid out</label>
            <select id="enc-f-kind" value={filters.source_kind} onChange={(e) => setFilter("source_kind", e.target.value)} className={`${selectCls} w-full`}>
              <option value="">Earned leave and leave balance</option>
              {SOURCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="min-w-[14rem]">
            <span className={filterLabelCls}>Employee</span>
            <PersonSelect people={people} value={filters.user_id} onChange={(id) => setFilter("user_id", id)} placeholder="Anyone" clearLabel="Anyone" loading={dirStatus === "loading"} aria-label="Filter by employee" />
          </div>
          <div className="min-w-[10rem]">
            <label htmlFor="enc-f-month" className={filterLabelCls}>Paid in month</label>
            <input id="enc-f-month" type="month" value={filters.period_month}
              onChange={(e) => setFilter("period_month", e.target.value)} className={`${selectCls} w-full`} />
          </div>
          {(filters.status || filters.source_kind || filters.period_month || filters.user_id) && (
            <button onClick={() => { setFilters({ status: "", source_kind: "", period_month: "", user_id: "" }); setPage(1); }} className="h-10 text-xs font-bold text-purple-600 hover:underline px-2">Clear</button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {loading ? <div className="p-6"><Skeleton type="table" rows={5} /></div>
            : error ? (
              <div className="p-10 text-center">
                <p className="text-sm text-rose-700 mb-3">{error}</p>
                <button onClick={load} className="text-xs font-bold text-purple-600 hover:underline">Try again</button>
              </div>
            ) : list.items.length === 0 ? (
              <div className="p-12 text-center">
                <HiCash className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">Nothing here yet</p>
                <p className="text-xs text-slate-400 mt-1">Requests raised by you or proposed by managers will appear here.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Employee</th>
                        <th className="px-6 py-3.5">What</th>
                        <th className="px-6 py-3.5">Days</th>
                        <th className="px-6 py-3.5 text-right">Amount</th>
                        <th className="px-6 py-3.5">Paid in</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.items.map((row) => {
                        const acts = encashmentActions(row, { viewerId, separateChecker });
                        const amt = amount(row.amount);
                        return (
                          <tr key={row.id} {...rowPreviewProps(() => openDetail(row))} className="hover:bg-purple-50/30 transition-colors cursor-pointer">
                            <td className="px-6 py-3.5">
                              <span className="font-semibold text-slate-800">{nameOf(row.user_id, dirStatus === "loading" ? "…" : "Unknown")}</span>
                              {acts.isOwnRequest && <span className="ml-2 text-[9px] font-bold uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">You raised</span>}
                            </td>
                            <td className="px-6 py-3.5 text-slate-600">{sourceKindLabel(row.source_kind)}{row.leave_type_code ? ` · ${row.leave_type_code}` : ""}</td>
                            <td className="px-6 py-3.5 text-slate-600">{fmtDays(row.days)}</td>
                            <td className="px-6 py-3.5 text-right font-bold tabular-nums text-slate-800">{amt === null ? <span className="text-slate-400 font-semibold">N/A</span> : formatMoney(amt)}</td>
                            <td className="px-6 py-3.5 text-slate-600">{formatPeriod(row.period_month)}</td>
                            <td className="px-6 py-3.5"><StatusPill status={row.status} /></td>
                            <td className="px-6 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {acts.canApprove ? (
                                <>
                                  <button onClick={() => approve(row)} disabled={busyId === row.id} title="Approve" className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 disabled:opacity-40"><HiCheck className="w-4 h-4" /></button>
                                  <button onClick={() => setReasonFor({ row, action: "reject" })} disabled={busyId === row.id} title="Reject" className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"><HiBan className="w-4 h-4" /></button>
                                </>
                              ) : row.status === "pending" ? (
                                <span className="text-[10px] font-semibold text-slate-400" title={acts.approveReason}>Needs another approver</span>
                              ) : acts.canCancel ? (
                                <button onClick={() => setReasonFor({ row, action: "cancel" })} disabled={busyId === row.id} title="Cancel" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"><HiX className="w-4 h-4" /></button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {list.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">Page {page} of {list.totalPages} · {list.total} request{list.total === 1 ? "" : "s"}</span>
                    <div className="flex gap-2">
                      <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
                      <button disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
      </main>

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} showToast={showToast} settings={settings} />}

      {reasonFor && (
        <ReasonDialog
          title={reasonFor.action === "reject" ? "Reject this request?" : "Cancel this request?"}
          description={reasonFor.action === "reject"
            ? `${fmtDays(reasonFor.row.days)} for ${nameOf(reasonFor.row.user_id, "this employee")}. They keep the days — nothing is paid out.`
            : `${fmtDays(reasonFor.row.days)} for ${nameOf(reasonFor.row.user_id, "this employee")}. Any balance already taken off is put back.`}
          label="Why?"
          confirmLabel={reasonFor.action === "reject" ? "Reject" : "Cancel request"}
          tone="danger"
          minLength={5}
          busy={busyId === reasonFor.row.id}
          onClose={() => { if (!busyId) setReasonFor(null); }}
          onSubmit={async (reason) => { const { row, action } = reasonFor; setReasonFor(null); await act(row, action, reason); }}
        />
      )}

      {detail && (
        <DetailDialog open onClose={() => setDetail(null)} title={nameOf(detail.user_id, "Encashment")}
          subtitle={`${sourceKindLabel(detail.source_kind)} · ${formatPeriod(detail.period_month)}`}
          badge={<DetailPill tone="onDark">{encashmentStatusMeta(detail.status).label}</DetailPill>}>
          <DetailStats items={[
            { label: "Days", value: fmtDays(detail.days), icon: HiCalendar },
            { label: "Amount", value: amount(detail.amount) === null ? "Not worked out yet" : formatMoney(detail.amount), icon: HiCash },
            { label: "Paid in", value: formatPeriod(detail.period_month), icon: HiCalendar },
          ]} />
          <DetailSection title="Request" icon={HiUser}>
            <DetailGrid items={[
              ["Employee", nameOf(detail.user_id, "Unknown")],
              ["What is paid out", sourceKindLabel(detail.source_kind)],
              ["Leave type", detail.leave_type_code || null],
              ["Daily rate", amount(detail.per_day_amount) === null ? null : formatMoney(detail.per_day_amount)],
              ["Raised on", formatDate(detail.created_at)],
              ["Decided on", formatDate(detail.approved_at || detail.rejected_at)],
            ]} />
          </DetailSection>
          {detail.reason && <DetailSection title="Reason" icon={HiInformationCircle}><DetailText>{detail.reason}</DetailText></DetailSection>}
        </DetailDialog>
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

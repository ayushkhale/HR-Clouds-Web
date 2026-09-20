// ─────────────────────────────────────────────────────────────────────────────
// PayrollExitsPage.jsx — people leaving, and their final payment
// (API #195–#202).
//
// Four states, in order:
//   recorded  — the last working day is on file. Nothing charged or paid.
//   prepared  — the amounts are frozen and waiting for a payroll run.
//   settled   — paid through an approved run. Closed.
//   cancelled — called off.
//
// "Prepare" is the step that writes: it creates the adjustments and debits the
// leave wallet in one transaction. It is reversible with "Undo" right up until
// the payroll run that carries it is approved, so Undo sits next to it rather
// than hidden away — the reason people fear irreversible buttons is not knowing
// where the exit is.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import useEmployeeDirectory from "../useEmployeeDirectory";
import {
  HiPlus, HiX, HiLogout, HiPencil, HiBan, HiRefresh, HiEye,
  HiInformationCircle, HiExclamationCircle, HiCheckCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import PeriodPicker from "../PeriodPicker";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import SettlementFlow from "../SettlementFlow";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatDate, formatPeriod } from "../../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import { EXIT_TYPES, EXIT_STATUS, exitTypeLabel, exitStatusMeta, exitActions, toneClass } from "../phase7Meta";

const PAGE_SIZE = 20;
const today = () => new Date().toISOString().slice(0, 10);
const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";

const STATUS_FILTERS = [["", "Everyone"], ...Object.entries(EXIT_STATUS).map(([k, v]) => [k, v.label])];

function StatusPill({ status }) {
  const meta = exitStatusMeta(status);
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${toneClass(meta.tone)}`}>{meta.label}</span>;
}

/* ── Record / correct an exit ─────────────────────────────────────────────── */

function ExitForm({ exit, onClose, onDone, showToast, defaultNoticeDays }) {
  const editing = Boolean(exit);
  const { rows: people, status: dirStatus } = useEmployeeDirectory({ includeInactive: false });
  const [form, setForm] = useState(() => ({
    user_id: exit?.user_id || "",
    exit_type: exit?.exit_type || "resignation",
    last_working_day: exit?.last_working_day?.slice(0, 10) || today(),
    resignation_date: exit?.resignation_date?.slice(0, 10) || "",
    notice_period_days: exit?.notice_period_days ?? defaultNoticeDays ?? 30,
    notice_served_days: exit?.notice_served_days ?? "",
    notice_recovery_waived: Boolean(exit?.notice_recovery_waived),
    notice_recovery_days_override: exit?.notice_recovery_days_override ?? "",
    exit_reason: exit?.exit_reason || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // How much notice is short, shown live so the consequence of the two number
  // fields is visible before anything is saved.
  const req = Number(form.notice_period_days);
  const served = form.notice_served_days === "" ? null : Number(form.notice_served_days);
  const shortfall = served === null || !Number.isFinite(req) ? null : Math.max(0, req - served);

  const problem = !form.user_id ? "Choose who is leaving."
    : !form.last_working_day ? "Enter their last working day." : "";

  const submit = async (e) => {
    e.preventDefault();
    if (problem || saving) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        exit_type: form.exit_type,
        last_working_day: form.last_working_day,
        notice_period_days: Number(form.notice_period_days) || 0,
        notice_recovery_waived: form.notice_recovery_waived,
      };
      if (form.resignation_date) body.resignation_date = form.resignation_date;
      if (form.notice_served_days !== "") body.notice_served_days = Number(form.notice_served_days);
      if (form.notice_recovery_days_override !== "") body.notice_recovery_days_override = Number(form.notice_recovery_days_override);
      if (form.exit_reason.trim()) body.exit_reason = form.exit_reason.trim();

      if (editing) await payrollAPI.correctExit(exit.id, body);
      else await payrollAPI.createExit({ ...body, user_id: form.user_id });

      showToast(editing ? "Exit updated" : "Exit recorded");
      onDone();
    } catch (err) {
      setError(payrollErrorMessage(err, editing ? "Couldn't update this exit." : "Couldn't record this exit."));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{editing ? "Change the exit details" : "Record someone leaving"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Payroll uses the last working day to stop paying them a full month.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {!editing && (
            <div>
              <label className={labelCls}>Who is leaving</label>
              <select required value={form.user_id} onChange={(e) => set({ user_id: e.target.value })} className={fieldCls}>
                <option value="">{dirStatus === "loading" ? "Loading people…" : "Choose an employee"}</option>
                {people.map((p) => {
                  const id = p.user_id ?? p.id;
                  const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Unnamed";
                  return <option key={id} value={id}>{name}</option>;
                })}
              </select>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Why they are leaving</label>
              <select value={form.exit_type} onChange={(e) => set({ exit_type: e.target.value })} className={fieldCls}>
                {EXIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Last working day</label>
              <input type="date" required value={form.last_working_day} onChange={(e) => set({ last_working_day: e.target.value })} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>Date they resigned <span className="font-medium text-slate-400 normal-case">(optional)</span></label>
              <input type="date" value={form.resignation_date} onChange={(e) => set({ resignation_date: e.target.value })} className={fieldCls} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="text-xs font-bold text-slate-700 mb-1">Notice period</h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              If they leave before serving their full notice, the difference can be recovered from the final payment.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Notice they owed</label>
                <div className="relative">
                  <input type="number" min="0" max="365" value={form.notice_period_days} onChange={(e) => set({ notice_period_days: e.target.value })} className={`${fieldCls} pr-14`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">days</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Notice they served</label>
                <div className="relative">
                  <input type="number" min="0" max="365" value={form.notice_served_days} onChange={(e) => set({ notice_served_days: e.target.value })} placeholder="—" className={`${fieldCls} pr-14`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">days</span>
                </div>
              </div>
            </div>

            {shortfall !== null && (
              <p className={`flex items-start gap-1.5 mt-3 text-[11px] font-semibold ${shortfall > 0 ? "text-fuchsia-800" : "text-violet-800"}`}>
                {shortfall > 0 ? <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> : <HiCheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" />}
                <span>{shortfall > 0 ? `${shortfall} ${shortfall === 1 ? "day" : "days"} short.` : "Full notice served — nothing to recover."}</span>
              </p>
            )}

            <label className="flex items-start gap-3 cursor-pointer group mt-3">
              <input type="checkbox" checked={form.notice_recovery_waived} onChange={(e) => set({ notice_recovery_waived: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
              <div>
                <span className="block text-xs font-bold text-slate-700 group-hover:text-purple-700">Don&apos;t recover short notice</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">Nothing is deducted even if they left early.</span>
              </div>
            </label>

            {!form.notice_recovery_waived && (
              <div className="mt-3 sm:max-w-[13rem]">
                <label className={labelCls}>Recover a set number of days instead</label>
                <div className="relative">
                  <input type="number" min="0" max="365" value={form.notice_recovery_days_override} onChange={(e) => set({ notice_recovery_days_override: e.target.value })} placeholder="Leave blank" className={`${fieldCls} pr-14`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">days</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Overrides the calculation above — for an agreed settlement.</p>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Notes <span className="font-medium text-slate-400 normal-case">(optional)</span></label>
            <input type="text" maxLength={500} value={form.exit_reason} onChange={(e) => set({ exit_reason: e.target.value })} placeholder="e.g. Relocating abroad" className={fieldCls} />
          </div>

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
              {saving ? "Saving…" : editing ? "Save changes" : "Record exit"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ── Settlement drawer ────────────────────────────────────────────────────── */

function SettlementPanel({ exit, onClose, onChanged, showToast, nameOf }) {
  const [period, setPeriod] = useState(exit.settlement_period_month || (exit.last_working_day || "").slice(0, 7) || new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const acts = exitActions(exit);
  const prepared = exit.status === "prepared";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getSettlementPreview(exit.id, { period_month: period });
      setPreview(res?.data ?? res ?? null);
      setError("");
    } catch (err) {
      setPreview(null);
      setError(payrollErrorMessage(err, "Couldn't work out this settlement."));
    } finally {
      setLoading(false);
    }
  }, [exit.id, period]);

  useEffect(() => { load(); }, [load]);

  const prepare = async () => {
    const who = nameOf(exit.user_id, "this employee");
    const ok = await window.confirm(
      `Lock in the final settlement for ${who}?\n\n` +
      `The amounts below are added to the ${formatPeriod(period)} payroll and any leave being paid out is taken off their balance now.\n\n` +
      `You can undo this until that payroll is approved.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await payrollAPI.prepareSettlement(exit.id, { period_month: period });
      showToast("Settlement locked in");
      onChanged();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't lock in this settlement."), "error");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async (reason) => {
    setBusy(true);
    try {
      await payrollAPI.resetSettlement(exit.id, { reason });
      showToast("Settlement undone — the balances are back");
      setResetting(false);
      onChanged();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't undo this settlement."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate">{nameOf(exit.user_id, "Final settlement")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {exitTypeLabel(exit.exit_type)} · last day {formatDate(exit.last_working_day)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg shrink-0"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 ${toneClass(exitStatusMeta(exit.status).tone)}`}>
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-px" />
            <p className="text-[11px] font-semibold leading-relaxed">{exitStatusMeta(exit.status).note}</p>
          </div>

          <div className="sm:max-w-xs">
            <label className={labelCls}>Pay it with</label>
            <PeriodPicker value={period} onChange={setPeriod} idPrefix="fnf-period" selectClassName={fieldCls} yearsBack={1} yearsAhead={1} disabled={prepared || busy} />
            {prepared && <p className="text-[10px] text-slate-400 mt-1.5">Fixed while the settlement is locked in. Undo it to change the month.</p>}
          </div>

          {loading ? <Skeleton type="card" />
            : error ? (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3">
                <p className="text-[11px] font-semibold text-rose-700">{error}</p>
                <button onClick={load} className="text-[11px] font-bold text-rose-800 underline mt-1.5">Try again</button>
              </div>
            ) : <SettlementFlow preview={preview} prepared={prepared} />}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {!acts.canPrepare && !acts.canReset && (
            <p className="text-[11px] font-semibold text-slate-500 mb-2.5">{acts.prepareReason}</p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Close</button>
            {acts.canReset && (
              <button type="button" onClick={() => setResetting(true)} disabled={busy}
                className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 transition disabled:opacity-50 flex justify-center items-center gap-2">
                <HiRefresh className="w-4 h-4" /> Undo settlement
              </button>
            )}
            {acts.canPrepare && (
              <button type="button" onClick={prepare} disabled={busy || loading || !!error}
                className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
                {busy ? "Locking in…" : "Lock in these amounts"}
              </button>
            )}
          </div>
        </div>
      </div>

      {resetting && (
        <ReasonDialog
          title="Undo this settlement?"
          description="The amounts are removed from the payroll and any leave paid out goes back onto their balance. You can prepare it again afterwards."
          label="Why are you undoing it?"
          confirmLabel="Undo settlement"
          tone="danger"
          minLength={5}
          busy={busy}
          onClose={() => { if (!busy) setResetting(false); }}
          onSubmit={doReset}
        />
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function PayrollExitsPage() {
  const { toast, showToast, hideToast } = useToast();
  const { nameOf, status: dirStatus } = useEmployeeDirectory();

  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [settling, setSettling] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [defaultNotice, setDefaultNotice] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (status) params.status = status;
      const res = await payrollAPI.getExits(params);
      const norm = normalizePaginated(res, ["exits", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setError("");
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't load exits."));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    payrollAPI.getSettings()
      .then((res) => { const d = res?.data?.fnf_default_notice_period_days; if (d != null) setDefaultNotice(d); })
      .catch(() => {});
  }, []);

  // Keep the open settlement panel pointed at the freshest row, so its buttons
  // follow the status rather than the state it was opened in.
  const refresh = async () => {
    await load();
    if (settling) {
      try {
        const res = await payrollAPI.getExit(settling.id);
        setSettling(res?.data ?? null);
      } catch { setSettling(null); }
    }
  };

  const doCancel = async (reason) => {
    setBusy(true);
    try {
      await payrollAPI.cancelExit(cancelling.id, { reason });
      showToast("Exit cancelled");
      setCancelling(null);
      load();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't cancel this exit."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DashboardTopBar title="Exits & Settlements" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">People leaving</h1>
            <p className="text-sm text-slate-500 mt-1">Record a last working day, then work out and pay the final settlement.</p>
          </div>
          <button onClick={() => setCreating(true)} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 flex items-center gap-2">
            <HiPlus className="w-4 h-4" /> Record someone leaving
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <select aria-label="Filter by stage" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
            {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {loading ? <div className="p-6"><Skeleton type="table" rows={4} /></div>
            : error ? (
              <div className="p-10 text-center">
                <p className="text-sm text-rose-700 mb-3">{error}</p>
                <button onClick={load} className="text-xs font-bold text-purple-600 hover:underline">Try again</button>
              </div>
            ) : list.items.length === 0 ? (
              <div className="p-12 text-center">
                <HiLogout className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">Nobody is on their way out</p>
                <p className="text-xs text-slate-400 mt-1">Record a last working day and payroll will stop paying a full month.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Employee</th>
                        <th className="px-6 py-3.5">Reason</th>
                        <th className="px-6 py-3.5">Last day</th>
                        <th className="px-6 py-3.5">Notice</th>
                        <th className="px-6 py-3.5">Stage</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.items.map((row) => {
                        const acts = exitActions(row);
                        const req = Number(row.notice_period_days);
                        const served = row.notice_served_days == null ? null : Number(row.notice_served_days);
                        const short = served === null || !Number.isFinite(req) ? null : Math.max(0, req - served);
                        return (
                          <tr key={row.id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="px-6 py-3.5 font-semibold text-slate-800">{nameOf(row.user_id, dirStatus === "loading" ? "…" : "Unknown")}</td>
                            <td className="px-6 py-3.5 text-slate-600">{exitTypeLabel(row.exit_type)}</td>
                            <td className="px-6 py-3.5 text-slate-600 whitespace-nowrap">{formatDate(row.last_working_day)}</td>
                            <td className="px-6 py-3.5 text-xs">
                              {short === null ? <span className="text-slate-300">—</span>
                                : row.notice_recovery_waived ? <span className="text-slate-500">Waived</span>
                                : short > 0 ? <span className="font-bold text-fuchsia-600">{short}d short</span>
                                : <span className="text-violet-600 font-semibold">Full</span>}
                            </td>
                            <td className="px-6 py-3.5"><StatusPill status={row.status} /></td>
                            <td className="px-6 py-3.5 text-right whitespace-nowrap">
                              <button onClick={() => setSettling(row)} title="Final settlement" className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50"><HiEye className="w-4 h-4" /></button>
                              <button onClick={() => setEditing(row)} disabled={!acts.canCorrect} title={acts.canCorrect ? "Change details" : acts.correctReason}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><HiPencil className="w-4 h-4" /></button>
                              <button onClick={() => setCancelling(row)} disabled={!acts.canCancel} title={acts.canCancel ? "Cancel this exit" : acts.cancelReason}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"><HiBan className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {list.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">Page {page} of {list.totalPages} · {list.total} {list.total === 1 ? "person" : "people"}</span>
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

      {creating && <ExitForm onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} showToast={showToast} defaultNoticeDays={defaultNotice} />}
      {editing && <ExitForm exit={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} showToast={showToast} defaultNoticeDays={defaultNotice} />}
      {settling && <SettlementPanel exit={settling} nameOf={nameOf} onClose={() => setSettling(null)} onChanged={refresh} showToast={showToast} />}

      {cancelling && (
        <ReasonDialog
          title="Cancel this exit?"
          description={`${nameOf(cancelling.user_id, "This employee")} will be treated as staying. Anything already prepared for their final payment is undone.`}
          label="Why are you cancelling it?"
          confirmLabel="Cancel exit"
          tone="danger"
          minLength={5}
          busy={busy}
          onClose={() => { if (!busy) setCancelling(null); }}
          onSubmit={doCancel}
        />
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

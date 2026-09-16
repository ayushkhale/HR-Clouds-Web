import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiExclamationCircle, HiX, HiPlay, HiCalculator, HiCheck, HiCash, HiUserGroup, HiLockClosed,
  HiRefresh, HiChevronLeft, HiChevronRight, HiBan, HiClock, HiArrowRight, HiShieldCheck,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage, payrollErrorCode, runFailureAdvice } from "../../../../shared/utils/payrollErrors";
import { formatPeriod, formatMoney, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import PeriodPicker from "../PeriodPicker";
import {
  runStatusMeta, runActions, runNextStep, RUN_STATUS_FILTERS, RUN_ACTION_SUCCESS, RUN_ACTION_FAILURE,
  statutoryReadinessNotes, payoutReadinessNotes, taxTablesMissing, alreadyRunText, toCount, plural, inferredExitDate,
} from "../runMeta";
import { currentPeriod } from "../variablePayMeta";

const PAGE_SIZE = 10;
const INTERACTIVE = "button, a, input, select, textarea, label";
const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

function ReadinessStat({ label, value, tone = "neutral" }) {
  const n = toCount(value);
  const toneCls = tone === "bad" && n > 0 ? "text-rose-600" : tone === "warn" && n > 0 ? "text-fuchsia-600" : "text-slate-800";
  return (
    <div className="rounded-xl bg-white border border-purple-100/70 px-3 py-2.5">
      <p className={`text-lg font-bold tabular-nums ${toneCls}`}>{n}</p>
      <p className="text-[11px] text-slate-500 font-medium leading-tight">{label}</p>
    </div>
  );
}

// ── Start a run: month picker + pre-flight readiness (#37) ──────────────────
function StartRunDialog({ onClose, onCreated, onOpenExisting }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [notes, setNotes] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [elig, setElig] = useState({ loading: true, data: null, error: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const closeRef = useRef(onClose);
  closeRef.current = creating ? () => {} : onClose;

  useEffect(() => {
    let cancelled = false;
    setElig({ loading: true, data: null, error: "" });
    payrollAPI.getRunEligibility({ period_month: period })
      .then((res) => { if (!cancelled) setElig({ loading: false, data: res?.data ?? res ?? null, error: "" }); })
      .catch((err) => { if (!cancelled) setElig({ loading: false, data: null, error: payrollErrorMessage(err, "Couldn't check readiness for this month.") }); });
    return () => { cancelled = true; };
  }, [period, reloadKey]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const data = elig.data || {};
  // `already_run` is `{ id, status }` or null.
  const alreadyRun = data.already_run && typeof data.already_run === "object" ? data.already_run : null;
  const missing = Array.isArray(data.missing_structure) ? data.missing_structure : [];
  const exitDates = Array.isArray(data.exit_date_required) ? data.exit_date_required : [];
  const lockedRanges = Array.isArray(data.locked_ranges) ? data.locked_ranges : [];
  const readinessNotes = [...statutoryReadinessNotes(data.statutory), ...payoutReadinessNotes(data.payouts)];
  // Creating would fail with TAX_TABLES_MISSING; the readiness note says why.
  const blockedByTax = taxTablesMissing(data.statutory);
  const canCreate = !elig.loading && !alreadyRun && !blockedByTax && !creating;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError("");
    try {
      const payload = { period_month: period, run_type: "regular" };
      if (notes.trim()) payload.notes = notes.trim();
      const res = await payrollAPI.createRun(payload);
      onCreated(res?.data ?? res, period);
    } catch (err) {
      setCreateError(payrollErrorMessage(err, "Couldn't start the run."));
      if (payrollErrorCode(err) === "DUPLICATE_RUN") setReloadKey((k) => k + 1);
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-4" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <form onSubmit={handleCreate} role="dialog" aria-modal="true" aria-label="Start a payroll run" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Start a payroll run</h2>
            <p className="text-sm text-slate-500 mt-0.5">Pick the month. We check who is ready to be paid before you start.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={creating} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="run-period-month" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Pay month</label>
              <PeriodPicker value={period} onChange={(v) => { setPeriod(v); setCreateError(""); }} idPrefix="run-period" selectClassName={fieldCls} yearsBack={3} yearsAhead={1} disabled={creating} />
            </div>
            <div>
              <label htmlFor="run-notes" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Notes <span className="font-medium text-slate-400 normal-case">(optional)</span></label>
              <input id="run-notes" type="text" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Regular monthly salary" className={fieldCls} />
            </div>
          </div>

          <section className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="flex items-center gap-2 text-[11px] font-bold text-purple-700 uppercase tracking-wide">
                <HiUserGroup className="w-4 h-4" /> Readiness for {formatPeriod(period)}
              </span>
              {!elig.loading && (
                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="text-[11px] font-bold text-purple-600 hover:underline flex items-center gap-1">
                  <HiRefresh className="w-3.5 h-3.5" /> Check again
                </button>
              )}
            </div>

            {elig.loading ? (
              <div className="h-28 rounded-xl bg-purple-100/50 animate-pulse" />
            ) : elig.error ? (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                {elig.error} You can still start the run. Payroll checks everyone again when it calculates.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <ReadinessStat label="Employees to pay" value={data.headcount} />
                  <ReadinessStat label="Joined this month" value={data.joiners_count} />
                  <ReadinessStat label="Left this month" value={data.leavers_count} />
                  <ReadinessStat label="No salary structure" value={data.missing_structure_count} tone="bad" />
                  <ReadinessStat label="Need a last working day" value={data.exit_date_required_count} tone="bad" />
                  <ReadinessStat label="No bank account" value={data.missing_bank_account_count} tone="warn" />
                </div>

                {/* Eligibility lists carry `user_id` and `employee_code` only — no names. */}
                {[["Without a salary structure", missing], ["Need a last working day", exitDates]].map(([title, rows]) => rows.length > 0 && (
                  <div key={title}>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">{title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rows.slice(0, 10).map((m, i) => {
                        // Exit rows carry the inferred last working day (gap G-4, else in `reason`).
                        const lastDay = rows === exitDates ? inferredExitDate(m) : "";
                        return (
                          <span key={m.user_id || i} title={m.reason || undefined} className="text-[11px] font-semibold text-rose-700 bg-white border border-rose-200 rounded-md px-2 py-0.5">
                            {m.employee_code || "No employee code"}
                            {lastDay && <span className="font-medium text-rose-500"> · last seen {formatDate(lastDay)}</span>}
                          </span>
                        );
                      })}
                      {rows.length > 10 && <span className="text-[11px] text-slate-500 px-1 py-0.5">+{rows.length - 10} more</span>}
                    </div>
                  </div>
                ))}

                {(toCount(data.missing_structure_count) > 0 || toCount(data.exit_date_required_count) > 0) && (
                  <p className="text-xs text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3 py-2">
                    These employees will show up as problems after calculating. You can start now and fix or exclude them before approving.
                  </p>
                )}
                {data.period_locked && (
                  <p className="flex items-start gap-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <HiLockClosed className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Attendance for this month is already locked
                      {lockedRanges.length > 0 && ` (${lockedRanges.map((r) => `${formatDate(r.start_date || r.start)} to ${formatDate(r.end_date || r.end)}`).join(", ")})`}.
                      {" "}If the lock covers only part of the month, approval will be blocked.
                    </span>
                  </p>
                )}
                {readinessNotes.length > 0 && (
                  <div className="rounded-xl bg-white border border-purple-100 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-purple-700 uppercase mb-1.5"><HiShieldCheck className="w-3.5 h-3.5" /> Tax, reimbursements & benefits</p>
                    <ul className="space-y-1">
                      {readinessNotes.map((note) => (
                        <li key={note.text} className={`text-xs leading-relaxed ${note.tone === "bad" ? "text-rose-700 font-semibold" : note.tone === "warn" ? "text-fuchsia-800" : "text-slate-600"}`}>{note.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {alreadyRun && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-purple-800 bg-purple-100/70 border border-purple-200 rounded-xl px-3 py-2.5">
                    <span className="font-semibold">{alreadyRunText(alreadyRun)}</span>
                    {alreadyRun.id && (
                      <button type="button" onClick={() => onOpenExisting(alreadyRun.id)} className="font-bold underline shrink-0">Open it</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {createError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{createError}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={creating} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="submit" disabled={!canCreate} className="sm:min-w-[170px] px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
            {creating ? <Spinner light /> : <><HiPlay className="w-4 h-4" /> Start run</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── One run in the list ─────────────────────────────────────────────────────
const STEP_ICON = {
  clock: HiClock, calculator: HiCalculator, refresh: HiRefresh, error: HiExclamationCircle,
  approve: HiCheck, pay: HiCash, open: HiArrowRight,
};

// Every card has exactly one button: the next step (see runNextStep). Cancel
// lives on the run page only.
function RunCard({ run, busy, onOpen, onCalculate }) {
  const meta = runStatusMeta(run.status);
  const acts = runActions(run);
  const excluded = toCount(run.excluded_count);
  const calculatingHere = busy?.id === run.id;

  const primary = runNextStep(run);
  const PrimaryIcon = STEP_ICON[primary.icon] || HiArrowRight;
  const handlePrimary = () => {
    if (primary.key === "calculate") onCalculate();
    else if (primary.key === "open") onOpen(primary.query);
  };

  const onCardClick = (e) => {
    if (e.target.closest(INTERACTIVE)) return;
    if (window.getSelection?.()?.toString()) return;
    onOpen();
  };

  return (
    <article
      onClick={onCardClick}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
      tabIndex={0}
      aria-label={`Payroll run for ${formatPeriod(run.period_month)}, ${meta.label}`}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center gap-5 cursor-pointer transition hover:border-purple-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-300"
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h3 className="font-bold text-slate-800 text-lg">{formatPeriod(run.period_month)}</h3>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${meta.pill}`}>{meta.label}</span>
        </div>
        <p className="text-sm text-slate-500 line-clamp-1">{run.notes || meta.hint}</p>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {acts.errorCount > 0 && (
            <button type="button" onClick={() => onOpen("status=error")} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg px-2.5 py-1 transition">
              <HiExclamationCircle className="w-4 h-4" /> {plural(acts.errorCount, "employee")} need{acts.errorCount === 1 ? "s" : ""} attention · View
            </button>
          )}
          {excluded > 0 && (
            <button type="button" onClick={() => onOpen("status=excluded")} className="inline-flex items-center gap-1.5 text-xs font-bold text-fuchsia-700 border border-fuchsia-200 bg-fuchsia-50 hover:bg-fuchsia-100 rounded-lg px-2.5 py-1 transition">
              <HiBan className="w-3.5 h-3.5" /> {excluded} excluded
            </button>
          )}
          {acts.stale && run.status === "calculated" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 border border-purple-200 bg-purple-50 rounded-lg px-2.5 py-1">
              <HiRefresh className="w-3.5 h-3.5" /> Needs recalculating
            </span>
          )}
          {acts.stuck && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fuchsia-700 border border-fuchsia-200 bg-fuchsia-50 rounded-lg px-2.5 py-1">
              <HiClock className="w-3.5 h-3.5" /> Calculation seems stuck
            </span>
          )}
          {run.status === "paid" && run.paid_at && <span className="text-xs text-slate-500">Paid on {formatDate(run.paid_at)}</span>}
          {run.status === "approved" && run.approved_at && <span className="text-xs text-slate-500">Approved on {formatDate(run.approved_at)}</span>}
        </div>

        {run.status === "failed" && (
          <p className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 line-clamp-2">
            <b>Why it failed:</b> {run.failure_reason || "No reason was recorded."}
            {runFailureAdvice(run) && <> <b>What to do:</b> {runFailureAdvice(run)}</>}
          </p>
        )}
        {run.status === "cancelled" && (
          <p className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 line-clamp-2">
            <b>Cancelled{run.cancelled_at ? ` on ${formatDate(run.cancelled_at)}` : ""}:</b> {run.cancellation_reason || "No reason was recorded."}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 shrink-0 py-4 xl:py-0 border-y border-slate-100 xl:border-y-0 xl:border-l xl:pl-8">
        <div>
          <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Employees</dt>
          <dd className="text-base font-semibold text-slate-800 tabular-nums">{toCount(run.total_employees)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gross pay</dt>
          <dd className="text-base font-semibold text-slate-700 tabular-nums">{formatMoney(run.total_gross)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Deductions</dt>
          <dd className="text-base font-semibold text-slate-700 tabular-nums">{formatMoney(run.total_deductions)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Net pay</dt>
          <dd className="text-base font-bold text-purple-700 tabular-nums">{formatMoney(run.total_net)}</dd>
        </div>
      </dl>

      <div className="shrink-0 xl:w-52">
        <button
          type="button"
          onClick={handlePrimary}
          // Opening a run never waits on another card's calculation.
          disabled={primary.key === "wait" || (primary.key === "calculate" && !!busy)}
          aria-label={`${primary.label}: ${formatPeriod(run.period_month)}`}
          className={`w-full h-10 flex justify-center items-center gap-1.5 px-4 text-xs font-bold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed ${primary.attention ? "text-white bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-200" : "text-purple-700 bg-white border border-purple-200 hover:bg-purple-50"}`}
        >
          {calculatingHere ? <Spinner light /> : <PrimaryIcon className="w-4 h-4" />} {calculatingHere ? "Calculating…" : primary.label}
        </button>
      </div>
    </article>
  );
}

export default function PayrollRunDashboard() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestRef = useRef(0);

  const [busy, setBusy] = useState(null); // { id } of the run being calculated
  const busyRef = useRef(false);
  const [startOpen, setStartOpen] = useState(false);

  const loadRuns = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      const res = await payrollAPI.getRuns(params);
      if (reqId !== requestRef.current) return;
      const norm = normalizePaginated(res, ["runs", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setLoadError("");
      // The last run on a page can move to another status filter — step back.
      if (norm.items.length === 0 && page > 1) setPage((p) => Math.max(1, p - 1));
    } catch (err) {
      if (reqId !== requestRef.current) return;
      setLoadError(payrollErrorMessage(err, "Couldn't load payroll runs."));
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Keep a calculating run's card current without a manual refresh.
  const hasCalculating = list.items.some((r) => r.status === "calculating");
  useEffect(() => {
    if (!hasCalculating) return undefined;
    // Don't poll a tab nobody is looking at; catch up when it comes back.
    const tick = () => { if (document.visibilityState === "visible") loadRuns({ silent: true }); };
    const timer = setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [hasCalculating, loadRuns]);

  const openRun = (id, query = "") => navigate(`/dashboard/hr/payroll/runs/${id}${query ? `?${query}` : ""}`);

  // The only action taken from the list (see RunCard).
  const calculate = async (run) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy({ id: run.id });
    try {
      await payrollAPI.calculateRun(run.id);
      showToast(RUN_ACTION_SUCCESS.calculate);
    } catch (err) {
      showToast(payrollErrorMessage(err, RUN_ACTION_FAILURE.calculate), "error");
    } finally {
      busyRef.current = false;
      setBusy(null);
      // The server state may have moved even on failure (e.g. a claim by another tab).
      loadRuns({ silent: true });
    }
  };

  const changeFilter = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <>
      <DashboardTopBar title="Payroll Runs" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payroll Runs</h1>
            <p className="text-sm text-slate-500 mt-1">Work out, check, approve and pay each month’s salaries. Click a run to open it.</p>
          </div>
          <button type="button" onClick={() => setStartOpen(true)} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
            <HiPlay className="w-5 h-5" /> Start new run
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <label htmlFor="run-status-filter" className="text-xs font-bold text-slate-500 uppercase">Show</label>
            <select id="run-status-filter" value={statusFilter} onChange={(e) => changeFilter(e.target.value)} className="h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
              {RUN_STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            {!loading && !loadError && <span className="text-xs font-semibold text-slate-500">{plural(list.total, "run")}</span>}
            <button type="button" onClick={() => loadRuns()} className="h-10 px-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition flex items-center gap-1.5">
              <HiRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <Skeleton type="dashboard" />
        ) : loadError ? (
          <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
            <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-700">{loadError}</p>
            <button type="button" onClick={() => loadRuns()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
          </div>
        ) : list.items.length === 0 ? (
          <div className="py-16 px-6 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
            <p className="text-slate-600 font-semibold">{statusFilter ? "No runs with this status." : "No payroll runs yet."}</p>
            <p className="text-sm text-slate-400 mt-1">{statusFilter ? "Try another filter." : "Start a run to pay this month's salaries."}</p>
            {!statusFilter && (
              <button type="button" onClick={() => setStartOpen(true)} className="mt-5 px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition inline-flex items-center gap-2">
                <HiPlay className="w-4 h-4" /> Start new run
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.items.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                busy={busy}
                onOpen={(query) => openRun(run.id, query)}
                onCalculate={() => calculate(run)}
              />
            ))}
          </div>
        )}

        {!loading && !loadError && list.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Page {page} of {list.totalPages}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
              <button type="button" onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))} disabled={page >= list.totalPages} aria-label="Next page" className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </main>

      {startOpen && (
        <StartRunDialog
          onClose={() => setStartOpen(false)}
          onOpenExisting={(id) => { setStartOpen(false); openRun(id); }}
          onCreated={(created, period) => {
            setStartOpen(false);
            showToast(`Run started for ${formatPeriod(created?.period_month || period)}. Calculate it next.`);
            if (created?.id) openRun(created.id);
            else loadRuns();
          }}
        />
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

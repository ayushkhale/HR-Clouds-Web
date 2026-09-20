// ─────────────────────────────────────────────────────────────────────────────
// PayrollArrearsPage.jsx — paying differences found in a month already closed
// (API #203–#205).
//
// When something changes after a month has been paid — a backdated salary
// revision, corrected attendance — that month's payslips are already frozen and
// are never rewritten. Instead the engine recalculates what the month *would*
// produce now, subtracts what was actually paid and anything already made up,
// and the remainder is paid in the next open month.
//
// "Check for differences" is read-only. "Pay the difference" is the commit, and
// it is one transaction with a batch reference, so the same month cannot
// quietly be paid twice.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import useEmployeeDirectory from "../useEmployeeDirectory";
import {
  HiSearch, HiCash, HiArrowRight, HiInformationCircle, HiCheckCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import PeriodPicker from "../PeriodPicker";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import { payrollErrorMessage, payrollErrorCode } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod } from "../../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import { arrearStatusMeta, toneClass, amount } from "../phase7Meta";

const PAGE_SIZE = 20;
const lastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};

const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";

function StatusPill({ status }) {
  const meta = arrearStatusMeta(status);
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${toneClass(meta.tone)}`}>{meta.label}</span>;
}

/** Signed money: a negative delta is money being taken back, not paid. */
function Delta({ value }) {
  const n = amount(value);
  if (n === null) return <span className="text-slate-300">—</span>;
  if (n === 0) return <span className="text-slate-400 tabular-nums">{formatMoney(0)}</span>;
  return (
    <span className={`font-bold tabular-nums ${n > 0 ? "text-violet-700" : "text-rose-700"}`}>
      {n > 0 ? "+" : "−"}{formatMoney(Math.abs(n))}
    </span>
  );
}

/* ── Find differences ─────────────────────────────────────────────────────── */

function DriftPanel({ showToast, onCommitted, nameOf }) {
  const [sourceMonth, setSourceMonth] = useState(lastMonth);
  const [drift, setDrift] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const check = async () => {
    setLoading(true);
    setError("");
    setErrorCode("");
    setDrift(null);
    try {
      const res = await payrollAPI.getArrearDrift({ period_month: sourceMonth });
      setDrift(res?.data ?? res ?? null);
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't check that month."));
      setErrorCode(payrollErrorCode(err));
    } finally {
      setLoading(false);
    }
  };

  // Derive from `drift` itself: `drift?.employees || []` is a fresh array on
  // every render, so memoising against it would recompute every time anyway.
  const withDelta = useMemo(
    () => (drift?.employees || []).filter((e) => (amount(e.net_delta) || 0) !== 0),
    [drift]
  );
  const total = useMemo(() => withDelta.reduce((s, e) => s + (amount(e.net_delta) || 0), 0), [withDelta]);

  const commit = async (reason) => {
    setBusy(true);
    try {
      await payrollAPI.reconcileArrears({ period_month: sourceMonth, reason });
      showToast(`Differences from ${formatPeriod(sourceMonth)} added to the next open payroll`);
      setConfirming(false);
      setDrift(null);
      onCommitted();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't pay these differences."), "error");
    } finally {
      setBusy(false);
    }
  };

  // "No closed run" is an ordinary answer to the question, not a failure.
  const isEmptyAnswer = errorCode === "NO_CLOSED_RUN_FOR_PERIOD";

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-sm font-bold text-slate-800">Check a month for differences</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Compares what a closed month would pay today against what it actually paid. Nothing changes until you choose to pay.
        </p>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month to check</label>
            <PeriodPicker value={sourceMonth} onChange={(v) => { setSourceMonth(v); setDrift(null); setError(""); }} idPrefix="arr-src" selectClassName={selectCls} yearsBack={3} yearsAhead={0} disabled={loading} />
          </div>
          <button onClick={check} disabled={loading}
            className="h-10 px-5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-2">
            <HiSearch className="w-4 h-4" /> {loading ? "Checking…" : "Check for differences"}
          </button>
        </div>

        {loading && <div className="mt-5"><Skeleton type="table" rows={3} /></div>}

        {!loading && error && (
          <div className={`mt-5 rounded-xl px-3.5 py-3 border ${isEmptyAnswer ? "bg-slate-50 border-slate-200" : "bg-rose-50 border-rose-200"}`}>
            <p className={`flex items-start gap-2 text-[11px] font-semibold ${isEmptyAnswer ? "text-slate-600" : "text-rose-700"}`}>
              <HiInformationCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
            </p>
          </div>
        )}

        {!loading && drift && withDelta.length === 0 && (
          <p className="flex items-start gap-2 mt-5 text-[11px] font-semibold text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-3.5 py-2.5">
            <HiCheckCircle className="w-4 h-4 shrink-0" />
            <span>{formatPeriod(sourceMonth)} is up to date — nothing has changed since it was paid.</span>
          </p>
        )}

        {!loading && withDelta.length > 0 && (
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 mb-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-purple-800">
                  {withDelta.length} {withDelta.length === 1 ? "person is" : "people are"} owed a different amount
                </p>
                <p className="text-[11px] text-purple-600 mt-0.5 flex items-center gap-1.5">
                  {formatPeriod(drift.source_period_month || sourceMonth)}
                  <HiArrowRight className="w-3 h-3" />
                  paid in {drift.target_period_month ? formatPeriod(drift.target_period_month) : "the next open month"}
                </p>
              </div>
              <span className={`text-lg font-black tabular-nums ${total >= 0 ? "text-purple-800" : "text-rose-700"}`}>
                {total >= 0 ? "+" : "−"}{formatMoney(Math.abs(total))}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3 text-right">Difference</th>
                    <th className="px-4 py-3">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {withDelta.map((e) => {
                    const open = expanded === e.user_id;
                    const comps = e.components || e.component_deltas || [];
                    return (
                      <tr key={e.user_id} className="align-top">
                        <td className="px-4 py-3 font-semibold text-slate-800">{nameOf(e.user_id, e.employee_code || "Unknown")}</td>
                        <td className="px-4 py-3 text-right"><Delta value={e.net_delta} /></td>
                        <td className="px-4 py-3">
                          {comps.length === 0 ? <span className="text-xs text-slate-400">Not itemised</span> : (
                            <>
                              <button onClick={() => setExpanded(open ? null : e.user_id)} className="text-xs font-bold text-purple-600 hover:underline">
                                {open ? "Hide" : `${comps.length} ${comps.length === 1 ? "change" : "changes"}`}
                              </button>
                              {open && (
                                <ul className="mt-2 space-y-1">
                                  {comps.map((c, i) => (
                                    <li key={c.component_code || i} className="flex items-baseline justify-between gap-3 text-[11px]">
                                      <span className="text-slate-600">{c.name || c.component_code}</span>
                                      <Delta value={c.delta ?? c.net_delta} />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={() => setConfirming(true)} disabled={busy}
              className="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
              Pay the difference in the next open month
            </button>
            <p className="flex items-start gap-1.5 mt-2 text-[10px] leading-relaxed text-slate-500">
              <HiInformationCircle className="w-3 h-3 shrink-0 text-purple-400 mt-0.5" />
              <span>{formatPeriod(sourceMonth)} itself is not changed — payslips already issued stay exactly as they were.</span>
            </p>
          </div>
        )}
      </div>

      {confirming && (
        <ReasonDialog
          title="Pay these differences?"
          description={`${withDelta.length} ${withDelta.length === 1 ? "person" : "people"} · ${total >= 0 ? "" : "−"}${formatMoney(Math.abs(total))} from ${formatPeriod(sourceMonth)}, added to the next open payroll. The reason appears on the payslip record.`}
          label="Why is this being paid?"
          placeholder="e.g. Backdated increments approved in April"
          confirmLabel="Pay the difference"
          minLength={5}
          busy={busy}
          onClose={() => { if (!busy) setConfirming(false); }}
          onSubmit={commit}
        />
      )}
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function PayrollArrearsPage() {
  const { toast, showToast, hideToast } = useToast();
  const { nameOf, status: dirStatus } = useEmployeeDirectory();

  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", source_period_month: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await payrollAPI.getArrears(params);
      const norm = normalizePaginated(res, ["arrears", "adjustments", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setError("");
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't load past differences."));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <DashboardTopBar title="Pay Differences" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Pay differences</h1>
          <p className="text-sm text-slate-500 mt-1">
            When something changes after a month has been paid, the difference is made up in the next open month.
          </p>
        </div>

        <DriftPanel showToast={showToast} onCommitted={load} nameOf={nameOf} />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h2 className="text-sm font-bold text-slate-800 mr-2">Already paid out</h2>
          <select aria-label="Filter by status" value={filters.status} onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }} className={selectCls}>
            <option value="">All</option>
            <option value="pending">Waiting for approval</option>
            <option value="approved">Approved</option>
            <option value="applied">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input type="month" aria-label="Filter by the month it came from" value={filters.source_period_month}
            onChange={(e) => { setFilters((f) => ({ ...f, source_period_month: e.target.value })); setPage(1); }} className={selectCls} />
          {(filters.status || filters.source_period_month) && (
            <button onClick={() => { setFilters({ status: "", source_period_month: "" }); setPage(1); }} className="text-xs font-bold text-purple-600 hover:underline px-2">Clear</button>
          )}
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
                <HiCash className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">Nothing paid out yet</p>
                <p className="text-xs text-slate-400 mt-1">Differences you choose to pay will be listed here with where they came from.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Employee</th>
                        <th className="px-6 py-3.5">For</th>
                        <th className="px-6 py-3.5">Paid in</th>
                        <th className="px-6 py-3.5 text-right">Amount</th>
                        <th className="px-6 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.items.map((row) => (
                        <tr key={row.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-6 py-3.5 font-semibold text-slate-800">{nameOf(row.user_id, dirStatus === "loading" ? "…" : "Unknown")}</td>
                          <td className="px-6 py-3.5 text-slate-600">{formatPeriod(row.source_period_month)}</td>
                          <td className="px-6 py-3.5 text-slate-600">{formatPeriod(row.period_month || row.target_period_month)}</td>
                          <td className="px-6 py-3.5 text-right"><Delta value={row.amount} /></td>
                          <td className="px-6 py-3.5"><StatusPill status={row.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {list.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">Page {page} of {list.totalPages}</span>
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

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

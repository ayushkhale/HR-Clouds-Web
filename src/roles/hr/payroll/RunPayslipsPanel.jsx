// ─────────────────────────────────────────────────────────────────────────────
// RunPayslipsPanel — payslip delivery for one payroll run (#167, #171, #172,
// #174, #175, #176, #181).
//
// Payslips are frozen at approval. Whether employees can *see* them is a
// separate switch: with "release on approval" off they sit held until HR
// publishes here. Emails are a queue — publishing marks them pending and the
// backend drains them; HR can force a batch or retry failures.
//
// The bank file is deliberately the last step: it only exists for a paid run.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { payrollAPI, payrollFiles } from "../../../shared/api";
import { downloadFile } from "../../../shared/utils/download";
import { payrollErrorMessage } from "../../../shared/utils/payrollErrors";
import { formatDate, formatMoney, formatPeriod } from "../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../shared/attendance/normalize";
import {
  EMAIL_MAX_ATTEMPTS, EMAIL_STATUS, EMAIL_STATUS_FILTERS, PAYSLIP_STATUS,
  PAYSLIP_STATUS_FILTERS, PAYSLIP_VISIBILITY_FILTERS, meta,
} from "./phase6Meta";
import {
  HiCash, HiChevronLeft, HiChevronRight, HiDocumentDownload, HiExclamationCircle,
  HiEye, HiMail, HiRefresh, HiSearch, HiUpload,
} from "react-icons/hi";

const PAGE_SIZE = 25;
const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : formatMoney(v));

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />;
}

export default function RunPayslipsPanel({ run, showToast }) {
  const runId = run?.id;
  const status = run?.status;
  const isPaid = status === "paid";
  const closed = status === "approved" || status === "paid";

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: null, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dispatch, setDispatch] = useState(null);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", visible_to_employee: "", email_status: "" });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Typing shouldn't fire a request per keystroke; the index is server-filtered.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [filters, search]);

  const load = useCallback(async () => {
    if (!runId || !closed) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      if (search) params.q = search;
      const res = await payrollAPI.getRunPayslips(runId, params);
      const list = normalizePaginated(res, ["payslips", "records"], { page, limit: PAGE_SIZE });
      setRows(list.items);
      setPagination({ page: list.page, total: list.total, totalPages: list.totalPages });
    } catch (err) {
      setRows([]);
      setError(payrollErrorMessage(err, "Couldn't load the payslips for this run"));
    } finally {
      setLoading(false);
    }
  }, [runId, closed, page, filters, search]);

  const loadDispatch = useCallback(async () => {
    if (!runId || !closed) return;
    try {
      const res = await payrollAPI.getRunDispatchStatus(runId);
      setDispatch(res?.data || null);
    } catch {
      // The email queue is secondary; its absence must not blank the panel.
      setDispatch(null);
    }
  }, [runId, closed]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDispatch(); }, [loadDispatch]);

  const heldCount = useMemo(() => rows.filter((r) => r.visible_to_employee === false).length, [rows]);
  const counts = dispatch?.counts || {};
  const failedEmails = Number(counts.failed) || 0;
  const pendingEmails = (Number(counts.pending) || 0) + (Number(counts.sending) || 0);

  const act = async (key, fn, success) => {
    setBusy(key);
    setError("");
    try {
      const res = await fn();
      showToast(success(res?.data || {}));
      await Promise.all([load(), loadDispatch()]);
    } catch (err) {
      const message = payrollErrorMessage(err, "That didn't work");
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy("");
    }
  };

  const publish = () => act(
    "publish",
    () => payrollAPI.publishRunPayslips(runId),
    (d) => (Number(d.payslips_published) > 0
      ? `${d.payslips_published} payslip${Number(d.payslips_published) === 1 ? "" : "s"} released to employees.`
      : "Every payslip in this run was already released."),
  );

  const backfill = () => act(
    "backfill",
    () => payrollAPI.backfillRunPayslips(runId),
    (d) => (Number(d.created ?? d.payslips_created) > 0
      ? `${d.created ?? d.payslips_created} payslip${Number(d.created ?? d.payslips_created) === 1 ? "" : "s"} rebuilt from this run.`
      : "Nothing to rebuild — every employee already has a frozen payslip."),
  );

  const sendEmails = () => act(
    "dispatch",
    () => payrollAPI.dispatchRunPayslips(runId, { include_failed: true }),
    (d) => `${d.sent ?? d.processed ?? 0} notification${(d.sent ?? d.processed) === 1 ? "" : "s"} sent.`,
  );

  const download = async (key, path, filename) => {
    setBusy(key);
    setError("");
    try {
      await downloadFile(path, { filename });
      showToast("Download started.");
      loadDispatch();
    } catch (err) {
      const message = payrollErrorMessage(err, "Couldn't prepare that download");
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy("");
    }
  };

  const downloadRowPdf = async (row) => {
    setBusy(`pdf-${row.payslip_id || row.user_id}`);
    try {
      await downloadFile(payrollFiles.hrPayslipPdf(row.user_id, runId), {
        params: row.version ? { version: row.version } : undefined,
        filename: `payslip-${row.employee_code || row.user_id}-${row.period_month || ""}.pdf`,
      });
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't download that payslip"), "error");
    } finally {
      setBusy("");
    }
  };

  if (!closed) {
    return (
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Payslips</h2>
        </div>
        <p className="px-5 py-8 text-sm text-slate-500 text-center">
          Payslips are created when the run is approved. Approve it to see them here.
        </p>
      </section>
    );
  }

  const period = formatPeriod(run?.period_month);

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Payslips &amp; delivery</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {pagination.total != null ? `${pagination.total} payslip${pagination.total === 1 ? "" : "s"} for ${period}` : `Payslips for ${period}`}
            {heldCount > 0 ? ` · ${heldCount} on this page held back` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={publish} disabled={!!busy} className="px-3 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-1.5 shadow-sm shadow-purple-200 disabled:opacity-50">
            {busy === "publish" ? <Spinner /> : <HiEye className="w-4 h-4" />} Release to employees
          </button>
          <button type="button" onClick={sendEmails} disabled={!!busy} title="Send queued notifications now, and retry failed ones" className="px-3 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "dispatch" ? <Spinner /> : <HiMail className="w-4 h-4" />} Send emails
          </button>
          <button type="button" onClick={() => download("zip", payrollFiles.hrRunPayslipsZip(runId), `payslips-${run?.period_month || runId}.zip`)} disabled={!!busy} className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "zip" ? <Spinner /> : <HiDocumentDownload className="w-4 h-4" />} Download all (ZIP)
          </button>
          {isPaid && (
            <button type="button" onClick={() => download("bank", payrollFiles.hrBankAdvice(runId), `bank-advice-${run?.period_month || runId}.csv`)} disabled={!!busy} title="NEFT file for bulk upload to the bank" className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
              {busy === "bank" ? <Spinner /> : <HiCash className="w-4 h-4" />} Bank file (CSV)
            </button>
          )}
          <button type="button" onClick={backfill} disabled={!!busy} title="For a run approved before payslips existed — creates the frozen copies" className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-purple-700 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "backfill" ? <Spinner /> : <HiUpload className="w-4 h-4" />} Rebuild
          </button>
        </div>
      </div>

      {/* Email queue */}
      {dispatch && (
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email</span>
          {Object.entries(EMAIL_STATUS).map(([key, value]) => (
            <span key={key} className="text-xs text-slate-600">
              {value.label} <strong className="tabular-nums text-slate-800">{counts[key] ?? 0}</strong>
            </span>
          ))}
          {failedEmails > 0 && (
            <span className="text-xs font-semibold text-rose-700">
              {failedEmails} failed after up to {dispatch.max_attempts ?? EMAIL_MAX_ATTEMPTS} tries — the payslips are still released.
            </span>
          )}
          {pendingEmails > 0 && <span className="text-xs text-slate-500">{pendingEmails} waiting to go out.</span>}
        </div>
      )}

      {dispatch?.recent_failures?.length > 0 && (
        <ul className="px-5 py-3 border-b border-slate-100 space-y-1">
          {dispatch.recent_failures.slice(0, 3).map((f) => (
            <li key={f.payslip_id} className="text-[11px] text-rose-700 flex items-start gap-1.5">
              <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{f.last_error || "The email couldn't be delivered."}{f.retryable === false ? " This one won't be retried." : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Filters */}
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name or code…" className="w-full h-[38px] pl-9 pr-3 text-sm bg-white border border-slate-200 rounded-lg focus:border-purple-400 outline-none" />
        </div>
        {[["status", PAYSLIP_STATUS_FILTERS], ["visible_to_employee", PAYSLIP_VISIBILITY_FILTERS], ["email_status", EMAIL_STATUS_FILTERS]].map(([key, options]) => (
          <select
            key={key}
            value={filters[key]}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="h-[38px] px-3 text-sm bg-white border border-slate-200 rounded-lg focus:border-purple-400 outline-none"
          >
            {options.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
          </select>
        ))}
        <button type="button" onClick={() => { load(); loadDispatch(); }} disabled={loading} className="ml-auto h-[38px] px-3 text-xs font-bold text-slate-500 hover:text-purple-700 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
          <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="px-5 py-3 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{error}</p>}

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">Loading payslips…</div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-sm text-slate-500 text-center">
          No payslips match. A run approved before payslips existed has none until you use <b>Rebuild</b>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3 text-right">Gross</th>
                <th className="px-5 py-3 text-right">Net pay</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Employee sees it</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const slipStatus = meta(PAYSLIP_STATUS, row.status);
                const email = meta(EMAIL_STATUS, row.email_status);
                const key = row.payslip_id || `${row.user_id}-${row.version}`;
                return (
                  <tr key={key} className="hover:bg-purple-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{row.full_name || "N/A"}</p>
                      <p className="text-[11px] text-slate-400">{row.employee_code || "N/A"}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{row.department_name || "Unassigned"}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{money(row.gross_earnings)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-700">{money(row.net_pay)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${slipStatus.pill}`}>v{row.version ?? 1} · {slipStatus.label}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.visible_to_employee ? (row.published_at ? formatDate(row.published_at) : "Yes") : <span className="font-semibold text-fuchsia-700">Held back</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${email.pill}`}>{email.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => downloadRowPdf(row)}
                        disabled={!!busy}
                        className="px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition disabled:opacity-50"
                      >
                        {busy === `pdf-${row.payslip_id || row.user_id}` ? "…" : "PDF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.totalPages}{pagination.total != null ? ` · ${pagination.total} payslips` : ""}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40" aria-label="Previous page">
              <HiChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40" aria-label="Next page">
              <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PayrollPayslipsPage — one employee's delivered documents (#168, #169, #170,
// #173, #183, #184, #185).
//
// A payslip is frozen at approval: the name, department and bank shown are the
// ones that were true when the money was paid, which is why a reissue can fix a
// spelling but never a figure.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, payrollFiles } from "../../../../shared/api";
import { downloadFile } from "../../../../shared/utils/download";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatDate, formatMoney, formatPeriod } from "../../../../shared/utils/formatUtils";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailTable, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import useEmployeeDirectory from "../useEmployeeDirectory";
import useToast from "../useToast";
import PayrollToast from "../PayrollToast";
import { currentFY, fyOptions } from "../fyUtils";
import { EMAIL_STATUS, PAYSLIP_STATUS, meta } from "../phase6Meta";
import {
  HiCurrencyRupee, HiDocumentDownload, HiDocumentReport, HiDocumentText,
  HiExclamationCircle, HiRefresh, HiUser, HiX,
} from "react-icons/hi";

const TABS = [
  ["payslips", "Payslip history"],
  ["annual", "Annual statement"],
  ["form16", "Form 16"],
];

const REISSUE_MIN = 10;

/** fyOptions may hand back strings or {value,label} — accept both. */
const fyValue = (option) => (typeof option === "string" ? option : option?.value ?? String(option ?? ""));

const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : formatMoney(v));

// ── Reissue (#173) ──────────────────────────────────────────────────────────
function ReissueDialog({ payslip, onClose, onDone, showToast }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tooShort = reason.trim().length < REISSUE_MIN;

  const submit = async (e) => {
    e.preventDefault();
    if (tooShort || busy) return;
    setBusy(true);
    setError("");
    try {
      await payrollAPI.reissuePayslip(payslip.payslip_id || payslip.id, { reason: reason.trim() });
      showToast("Payslip reissued. The employee now sees the corrected version.");
      onDone();
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't reissue this payslip"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Reissue this payslip</h2>
            <p className="text-sm text-slate-400 mt-0.5">{formatPeriod(payslip.period_month)} · version {payslip.version ?? 1}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-2 text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
            <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
            <span>A reissue only corrects presentation — a name, a department. The figures must stay identical, or it will be refused. To change money, cancel the run, recalculate and approve it again.</span>
          </div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>}
          <div>
            <label htmlFor="reissue-reason" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Why is it being reissued? <span className="text-red-400">*</span>
            </label>
            <textarea
              id="reissue-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Corrected the spelling of the employee's last name"
              className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">At least {REISSUE_MIN} characters. This is kept on the record for audit.</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || tooShort} className="px-5 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? "Reissuing…" : "Reissue payslip"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── One payslip, as it was frozen (#169) ────────────────────────────────────
function PayslipDialog({ userId, row, onClose, onReissue, showToast }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [downloading, setDownloading] = useState(false);
  const runId = row.run_id;

  useEffect(() => {
    let alive = true;
    payrollAPI.getEmployeePayslip(userId, runId, row.version ? { version: row.version } : undefined)
      .then((res) => { if (alive) setState({ loading: false, data: res?.data || null, error: "" }); })
      .catch((err) => { if (alive) setState({ loading: false, data: null, error: payrollErrorMessage(err, "Couldn't load this payslip") }); });
    return () => { alive = false; };
  }, [userId, runId, row.version]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(payrollFiles.hrPayslipPdf(userId, runId), {
        params: row.version ? { version: row.version } : undefined,
        filename: `payslip-${row.period_month || runId}.pdf`,
      });
      showToast("Payslip PDF downloaded.");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't download the PDF"), "error");
    } finally {
      setDownloading(false);
    }
  };

  const d = state.data;
  const components = Array.isArray(d?.components) ? d.components : [];
  const earnings = components.filter((c) => c.component_type === "earning");
  const deductions = components.filter((c) => c.component_type === "deduction");
  const status = meta(PAYSLIP_STATUS, row.status);

  return (
    <DetailDialog
      eyebrow="Payslip"
      icon={HiDocumentText}
      title={formatPeriod(row.period_month)}
      subtitle={`Version ${row.version ?? 1}${d?.snapshot_source === "live_projection" ? " · built from the run (no frozen copy)" : ""}`}
      badge={<DetailPill tone="onDark">{status.label}</DetailPill>}
      loading={state.loading}
      onClose={onClose}
      footer={
        <>
          {row.status === "active" && (
            <button type="button" onClick={() => onReissue(row)} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition">
              Reissue…
            </button>
          )}
          <button type="button" onClick={download} disabled={downloading} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 flex items-center gap-2 disabled:opacity-50">
            <HiDocumentDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </>
      }
    >
      {state.error ? (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{state.error}</p>
      ) : (
        <>
          <DetailSection title="This month" icon={HiCurrencyRupee}>
            <DetailGrid
              cols={4}
              items={[
                ["Gross earnings", money(d?.figures?.gross_earnings)],
                ["Deductions", money(d?.figures?.total_deductions)],
                ["Net pay", money(d?.figures?.net_pay)],
                ["Paid days", d?.figures?.payable_days ?? "N/A"],
              ]}
            />
            {d?.statutory_note && (
              <p className="mt-4 text-xs text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">{d.statutory_note}</p>
            )}
          </DetailSection>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DetailSection title="Earnings" icon={HiCurrencyRupee}>
              <DetailTable
                columns={[
                  { header: "Component", render: (c) => c.component_name || c.component_code },
                  { header: "Amount", align: "right", render: (c) => money(c.amount) },
                ]}
                rows={earnings}
                empty="No earning lines on this payslip."
                rowKey={(c, i) => c.component_code || i}
              />
            </DetailSection>
            <DetailSection title="Deductions" icon={HiCurrencyRupee}>
              <DetailTable
                columns={[
                  { header: "Component", render: (c) => c.component_name || c.component_code },
                  { header: "Amount", align: "right", render: (c) => money(c.amount) },
                ]}
                rows={deductions}
                empty="Nothing was deducted this month."
                rowKey={(c, i) => c.component_code || i}
              />
            </DetailSection>
          </div>

          <DetailSection title="Delivery" icon={HiDocumentReport}>
            <DetailGrid
              cols={4}
              items={[
                ["Released to employee", row.visible_to_employee ? "Yes" : "Held back"],
                ["Released on", row.published_at ? formatDate(row.published_at) : "N/A"],
                ["Email", meta(EMAIL_STATUS, row.email_status).label],
                ["Version", row.version ?? 1],
              ]}
            />
            {row.reissue_reason && <div className="mt-4"><DetailText label="Reissued because">{row.reissue_reason}</DetailText></div>}
          </DetailSection>
        </>
      )}
    </DetailDialog>
  );
}

// ── Annual statement (#183 / #184) ──────────────────────────────────────────
function AnnualStatementTab({ userId, employeeName, showToast }) {
  const [fy, setFy] = useState(currentFY());
  const [state, setState] = useState({ loading: false, data: null, error: "" });
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setState({ loading: true, data: null, error: "" });
    try {
      const res = await payrollAPI.getEmployeeAnnualStatement(userId, { financial_year: fy });
      setState({ loading: false, data: res?.data || null, error: "" });
    } catch (err) {
      setState({ loading: false, data: null, error: payrollErrorMessage(err, "Couldn't load the annual statement") });
    }
  }, [userId, fy]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(payrollFiles.hrAnnualStatementPdf(userId), {
        params: { financial_year: fy },
        filename: `annual-statement-${fy}.pdf`,
      });
      showToast("Annual statement downloaded.");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't download the statement"), "error");
    } finally {
      setDownloading(false);
    }
  };

  const months = Array.isArray(state.data?.months) ? state.data.months : [];
  const ytd = state.data?.ytd_totals;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="annual-fy" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Financial year</label>
          <select id="annual-fy" value={fy} onChange={(e) => setFy(e.target.value)} className="h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
            {fyOptions().map((option) => {
              const value = fyValue(option);
              return <option key={value} value={value}>FY {value}</option>;
            })}
          </select>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="h-[42px] px-4 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
          <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button type="button" onClick={download} disabled={downloading || !userId} className="h-[42px] px-4 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
          <HiDocumentDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
        </button>
        <p className="text-xs text-slate-500 ml-auto max-w-sm">A month-by-month summary of {employeeName || "this employee"}&apos;s pay for the year — useful for a loan or a visa application.</p>
      </div>

      {state.error ? (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{state.error}</p>
      ) : state.loading ? (
        <Skeleton type="table" rows={6} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Month</th>
                  <th className="px-5 py-3 text-right">Gross</th>
                  <th className="px-5 py-3 text-right">Deductions</th>
                  <th className="px-5 py-3 text-right">Net pay</th>
                  <th className="px-5 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {months.map((m) => (
                  <tr key={m.period_month} className={m.status === "empty" ? "text-slate-400" : ""}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{formatPeriod(m.period_month)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{m.status === "empty" ? "No payroll" : money(m.gross_earnings)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{m.status === "empty" ? "N/A" : money(m.total_deductions)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-700">{m.status === "empty" ? "N/A" : money(m.net_pay)}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{m.source === "live_projection" ? "From the run" : m.source === "snapshot" ? "Frozen payslip" : "N/A"}</td>
                  </tr>
                ))}
                {months.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No payroll was recorded for this financial year.</td></tr>
                )}
              </tbody>
              {ytd && (
                <tfoot>
                  <tr className="bg-purple-50/60 border-t-2 border-purple-100">
                    <td className="px-5 py-3 font-bold text-purple-800">Year to date</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-800">{money(ytd.gross_earnings)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-800">{money(ytd.total_deductions)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-black text-purple-800">{money(ytd.net_pay)}</td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form 16 (#185) ──────────────────────────────────────────────────────────
function Form16Tab({ userId, showToast }) {
  const [fy, setFy] = useState(currentFY());
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(payrollFiles.hrForm16Pdf(userId, fy), { filename: `form16-${fy}.pdf` });
      showToast("Form 16 downloaded.");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't download Form 16"), "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8 max-w-2xl">
      <h3 className="text-base font-bold text-slate-800">Form 16 — Part B</h3>
      <p className="text-sm text-slate-500 mt-1">
        The tax certificate built from this employee&apos;s pay and tax for the year. Part A comes from TRACES and is uploaded separately under Year-End &amp; Form 16.
      </p>
      <div className="flex flex-wrap items-end gap-3 mt-5">
        <div>
          <label htmlFor="form16-fy" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Financial year</label>
          <select id="form16-fy" value={fy} onChange={(e) => setFy(e.target.value)} className="h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
            {fyOptions().map((option) => {
              const value = fyValue(option);
              return <option key={value} value={value}>FY {value}</option>;
            })}
          </select>
        </div>
        <button type="button" onClick={download} disabled={downloading || !userId} className="h-[42px] px-4 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
          <HiDocumentDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download Form 16"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-4 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
        Available once the financial year is finalised under Year-End &amp; Form 16. Until then the figures can still move, so no certificate is issued.
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function PayrollPayslipsPage() {
  const { directory, nameOf, status: directoryStatus } = useEmployeeDirectory();
  const [userId, setUserId] = useState("");
  const [tab, setTab] = useState("payslips");
  const [history, setHistory] = useState({ loading: false, rows: [], error: "" });
  const [activeOnly, setActiveOnly] = useState(false);
  const [openSlip, setOpenSlip] = useState(null);
  const [reissueTarget, setReissueTarget] = useState(null);
  const { toast, showToast, hideToast } = useToast();

  const options = useMemo(() => directory?.options || [], [directory]);
  useEffect(() => {
    if (!userId && options.length > 0) setUserId(options[0].id);
  }, [options, userId]);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setHistory({ loading: true, rows: [], error: "" });
    try {
      const res = await payrollAPI.getEmployeePayslipHistory(userId, activeOnly ? { active_only: true } : undefined);
      const body = res?.data;
      setHistory({ loading: false, rows: body?.payslips || (Array.isArray(body) ? body : []), error: "" });
    } catch (err) {
      setHistory({ loading: false, rows: [], error: payrollErrorMessage(err, "Couldn't load this employee's payslips") });
    }
  }, [userId, activeOnly]);

  useEffect(() => { if (tab === "payslips") loadHistory(); }, [tab, loadHistory]);

  const employeeName = useMemo(() => (userId ? nameOf(userId, "This employee") : ""), [userId, nameOf]);

  return (
    <>
      <DashboardTopBar title="Payslips & Documents" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Payslips &amp; Documents</h1>
          <p className="text-sm text-slate-500 mt-1">
            Every payslip issued to an employee, their yearly statement and their Form 16 — including replaced and withdrawn versions.
          </p>
        </div>

        {/* Employee + tabs */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-wrap items-end gap-4">
          <div className="min-w-[260px]">
            <label htmlFor="payslip-employee" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Employee</label>
            <select id="payslip-employee" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
              {options.length === 0 && <option value="">{directoryStatus === "loading" ? "Loading people…" : "No employees found"}</option>}
              {options.map((person) => (
                <option key={person.id} value={person.id}>{person.name}{person.code ? ` (${person.code})` : ""}{person.active ? "" : " · left"}</option>
              ))}
            </select>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl" role="tablist">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${tab === value ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!userId ? (
          <div className="bg-white rounded-2xl border border-slate-100 border-dashed shadow-sm py-16 text-center">
            <HiUser className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Choose an employee to see their documents.</p>
          </div>
        ) : tab === "payslips" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                Only current versions
              </label>
              <button type="button" onClick={loadHistory} disabled={history.loading} className="h-[38px] px-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
                <HiRefresh className={`w-3.5 h-3.5 ${history.loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {history.error ? (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{history.error}</p>
            ) : history.loading ? (
              <Skeleton type="table" rows={5} />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[820px]">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4">Period</th>
                        <th className="px-6 py-4">Version</th>
                        <th className="px-6 py-4">State</th>
                        <th className="px-6 py-4">Employee can see it</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Released</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {history.rows.map((row) => {
                        const status = meta(PAYSLIP_STATUS, row.status);
                        const email = meta(EMAIL_STATUS, row.email_status);
                        return (
                          <tr key={row.payslip_id || `${row.run_id}-${row.version}`} {...rowPreviewProps(() => setOpenSlip(row), `Open the ${formatPeriod(row.period_month)} payslip`)}>
                            <td className="px-6 py-4 font-bold text-slate-800">{formatPeriod(row.period_month)}</td>
                            <td className="px-6 py-4 text-slate-600 tabular-nums">v{row.version ?? 1}</td>
                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${status.pill}`}>{status.label}</span></td>
                            <td className="px-6 py-4 text-slate-600">{row.visible_to_employee ? "Yes" : "Held back"}</td>
                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${email.pill}`}>{email.label}</span></td>
                            <td className="px-6 py-4 text-slate-500">{row.published_at ? formatDate(row.published_at) : "N/A"}</td>
                          </tr>
                        );
                      })}
                      {history.rows.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No payslips have been issued to {employeeName} yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : tab === "annual" ? (
          <AnnualStatementTab userId={userId} employeeName={employeeName} showToast={showToast} />
        ) : (
          <Form16Tab userId={userId} showToast={showToast} />
        )}
      </main>

      {openSlip && (
        <PayslipDialog
          userId={userId}
          row={openSlip}
          onClose={() => setOpenSlip(null)}
          onReissue={(row) => { setOpenSlip(null); setReissueTarget(row); }}
          showToast={showToast}
        />
      )}
      {reissueTarget && (
        <ReissueDialog
          payslip={reissueTarget}
          onClose={() => setReissueTarget(null)}
          onDone={() => { setReissueTarget(null); loadHistory(); }}
          showToast={showToast}
        />
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

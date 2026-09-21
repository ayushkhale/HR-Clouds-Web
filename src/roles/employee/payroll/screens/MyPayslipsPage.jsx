// ─────────────────────────────────────────────────────────────────────────────
// MyPayslipsPage — an employee's own delivered documents.
//
// Payslips (#55/#56) with the PDF (#191), the financial-year statement
// (#192/#193) and Form 16 Part B (#194). A payslip only appears once HR has
// released it; a held one is indistinguishable from one that doesn't exist.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, payrollFiles } from "../../../../shared/api";
import { downloadFile } from "../../../../shared/utils/download";
import { payrollErrorMessage, payslipDownloadMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod } from "../../../../shared/utils/formatUtils";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailSection, DetailTable } from "../../../../shared/components/DetailDialog";
import useToast from "../../../hr/payroll/useToast";
import PayrollToast from "../../../hr/payroll/PayrollToast";
import { currentFY, fyOptions } from "../../../hr/payroll/fyUtils";
import {
  HiCurrencyRupee, HiDocumentDownload, HiDocumentReport, HiDocumentText, HiRefresh,
} from "react-icons/hi";

const TABS = [
  ["payslips", "Payslips"],
  ["annual", "Annual statement"],
  ["form16", "Form 16"],
];

const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : formatMoney(v));
const fyValue = (option) => (typeof option === "string" ? option : option?.value ?? String(option ?? ""));
const slipRunId = (slip) => slip.run_id || slip.payroll_run?.id || slip.runId;
const slipPeriod = (slip) => slip.period_month || slip.payroll_run?.period_month;

// ── One payslip in full ─────────────────────────────────────────────────────
function PayslipDialog({ runId, period, onClose, showToast }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    payrollAPI.getMyPayslip(runId)
      .then((res) => { if (alive) setState({ loading: false, data: res?.data || null, error: "" }); })
      .catch((err) => { if (alive) setState({ loading: false, data: null, error: payrollErrorMessage(err, "Couldn't open this payslip") }); });
    return () => { alive = false; };
  }, [runId]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(payrollFiles.myPayslipPdf(runId), { filename: `payslip-${period || runId}.pdf` });
      showToast("Payslip downloaded.");
    } catch (err) {
      showToast(payslipDownloadMessage(err, "Couldn't download the PDF"), "error");
    } finally {
      setDownloading(false);
    }
  };

  const d = state.data;
  const item = d?.item || d || {};
  const lines = d?.components || item.components || d?.snapshot?.lines || [];
  const lineAmount = (l) => l.amount ?? l.calculated_amount;
  const lineName = (l) => l.component_name || l.name || l.component_code;
  const earnings = lines.filter((l) => l.component_type === "earning");
  const deductions = lines.filter((l) => l.component_type === "deduction");
  const figures = d?.figures || item;

  return (
    <DetailDialog
      eyebrow="Payslip"
      icon={HiDocumentText}
      title={formatPeriod(period)}
      loading={state.loading}
      onClose={onClose}
      footer={
        <button type="button" onClick={download} disabled={downloading} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 flex items-center gap-2 disabled:opacity-50">
          <HiDocumentDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
        </button>
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
                ["Gross pay", money(figures.gross_earnings ?? figures.gross_pay)],
                ["Deductions", money(figures.total_deductions)],
                ["Net pay", money(figures.net_pay)],
                ["Paid days", figures.payable_days ?? "N/A"],
              ]}
            />
            {d?.statutory_note && (
              <p className="mt-4 text-xs text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">{d.statutory_note}</p>
            )}
          </DetailSection>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DetailSection title="What you earned" icon={HiCurrencyRupee}>
              <DetailTable
                columns={[
                  { header: "Item", render: (l) => lineName(l) },
                  { header: "Amount", align: "right", render: (l) => money(lineAmount(l)) },
                ]}
                rows={earnings}
                empty="No earning lines on this payslip."
                rowKey={(l, i) => l.component_code || i}
              />
            </DetailSection>
            <DetailSection title="What was deducted" icon={HiCurrencyRupee}>
              <DetailTable
                columns={[
                  { header: "Item", render: (l) => lineName(l) },
                  { header: "Amount", align: "right", render: (l) => money(lineAmount(l)) },
                ]}
                rows={deductions}
                empty="Nothing was deducted this month."
                rowKey={(l, i) => l.component_code || i}
              />
            </DetailSection>
          </div>
        </>
      )}
    </DetailDialog>
  );
}

// ── Annual statement ────────────────────────────────────────────────────────
function AnnualStatementTab({ showToast }) {
  const [fy, setFy] = useState(currentFY());
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setState({ loading: true, data: null, error: "" });
    try {
      const res = await payrollAPI.getMyAnnualStatement({ financial_year: fy });
      setState({ loading: false, data: res?.data || null, error: "" });
    } catch (err) {
      setState({ loading: false, data: null, error: payrollErrorMessage(err, "Couldn't load your annual statement") });
    }
  }, [fy]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(payrollFiles.myAnnualStatementPdf(), {
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
          <label htmlFor="my-annual-fy" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Financial year</label>
          <select id="my-annual-fy" value={fy} onChange={(e) => setFy(e.target.value)} className="h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
            {fyOptions().map((option) => {
              const value = fyValue(option);
              return <option key={value} value={value}>FY {value}</option>;
            })}
          </select>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="h-[42px] px-4 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
          <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button type="button" onClick={download} disabled={downloading} className="h-[42px] px-4 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
          <HiDocumentDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
        </button>
        <p className="text-xs text-slate-500 ml-auto max-w-sm">A month-by-month summary of your pay for the year — often what a bank or embassy asks for.</p>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {months.map((m) => (
                  <tr key={m.period_month} className={m.status === "empty" ? "text-slate-400" : ""}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{formatPeriod(m.period_month)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{m.status === "empty" ? "No pay run" : money(m.gross_earnings)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{m.status === "empty" ? "N/A" : money(m.total_deductions)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-700">{m.status === "empty" ? "N/A" : money(m.net_pay)}</td>
                  </tr>
                ))}
                {months.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">Nothing recorded for this financial year yet.</td></tr>
                )}
              </tbody>
              {ytd && (
                <tfoot>
                  <tr className="bg-purple-50/60 border-t-2 border-purple-100">
                    <td className="px-5 py-3 font-bold text-purple-800">Year to date</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-800">{money(ytd.gross_earnings)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-800">{money(ytd.total_deductions)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-black text-purple-800">{money(ytd.net_pay)}</td>
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

// ── Form 16 ─────────────────────────────────────────────────────────────────
function Form16Tab({ showToast }) {
  const [fy, setFy] = useState(currentFY());
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(payrollFiles.myForm16Pdf(fy), { filename: `form16-${fy}.pdf` });
      showToast("Form 16 downloaded.");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Form 16 for this financial year hasn't been published yet."), "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8 max-w-2xl">
      <h3 className="text-base font-bold text-slate-800">Form 16 — Part B</h3>
      <p className="text-sm text-slate-500 mt-1">Your tax certificate for filing a return. It becomes available once HR closes the financial year.</p>
      <div className="flex flex-wrap items-end gap-3 mt-5">
        <div>
          <label htmlFor="my-form16-fy" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Financial year</label>
          <select id="my-form16-fy" value={fy} onChange={(e) => setFy(e.target.value)} className="h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none">
            {fyOptions().map((option) => {
              const value = fyValue(option);
              return <option key={value} value={value}>FY {value}</option>;
            })}
          </select>
        </div>
        <button type="button" onClick={download} disabled={downloading} className="h-[42px] px-4 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
          <HiDocumentDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download Form 16"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-4 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
        Part A comes from the tax department (TRACES) and is issued separately by your employer.
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MyPayslipsPage() {
  const [tab, setTab] = useState("payslips");
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [downloading, setDownloading] = useState("");
  const { toast, showToast, hideToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getMyPayslips();
      setPayslips(res.data?.records || res.data || []);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't load your payslips"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async (runId, period) => {
    setDownloading(runId);
    try {
      await downloadFile(payrollFiles.myPayslipPdf(runId), { filename: `payslip-${period || runId}.pdf` });
    } catch (err) {
      showToast(payslipDownloadMessage(err), "error");
    } finally {
      setDownloading("");
    }
  };

  return (
    <>
      <DashboardTopBar title="My Payslips" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Payslips</h1>
            <p className="text-sm text-slate-500 mt-1">Your monthly payslips, your statement for the year, and your Form 16.</p>
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

        {tab === "payslips" && (
          loading ? <Skeleton type="dashboard" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {payslips.map((slip) => {
                const runId = slipRunId(slip);
                const period = slipPeriod(slip);
                return (
                  <div key={slip.id || runId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg">{formatPeriod(period)}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Paid days: {slip.payable_days ?? "N/A"}</p>
                      </div>
                      {(slip.payroll_run?.status === "paid" || slip.run_status === "paid") && (
                        <span className="bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">Paid</span>
                      )}
                    </div>

                    <div className="p-5 flex-1 space-y-3">
                      <div className="flex justify-between">
                        <p className="text-xs font-bold text-slate-400 uppercase">Gross pay</p>
                        <p className="text-sm font-semibold text-slate-700 tabular-nums">{money(slip.gross_earnings ?? slip.gross_pay)}</p>
                      </div>
                      <div className="flex justify-between">
                        <p className="text-xs font-bold text-slate-400 uppercase">Deductions</p>
                        <p className="text-sm font-semibold text-rose-600 tabular-nums">{money(slip.total_deductions)}</p>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase">Net pay</p>
                        <p className="text-sm font-black text-purple-700 tabular-nums">{money(slip.net_pay)}</p>
                      </div>
                    </div>

                    <div className="p-4 border-t border-slate-50 flex items-center gap-2">
                      <button type="button" onClick={() => setOpen({ runId, period })} className="flex-1 flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                        <HiDocumentText className="w-4 h-4" /> View details
                      </button>
                      <button type="button" onClick={() => downloadPdf(runId, period)} disabled={downloading === runId} className="flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition disabled:opacity-50">
                        <HiDocumentDownload className="w-4 h-4" /> {downloading === runId ? "…" : "PDF"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {payslips.length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <HiDocumentReport className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-600 font-semibold">No payslips yet</p>
                  <p className="text-xs text-slate-400 mt-1">They appear here once your employer releases the month&apos;s payroll.</p>
                </div>
              )}
            </div>
          )
        )}

        {tab === "annual" && <AnnualStatementTab showToast={showToast} />}
        {tab === "form16" && <Form16Tab showToast={showToast} />}
      </main>

      {open && <PayslipDialog runId={open.runId} period={open.period} onClose={() => setOpen(null)} showToast={showToast} />}
      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}

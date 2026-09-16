import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import useEmployeeDirectory from "../useEmployeeDirectory";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiCash, HiCheck,
  HiCalendar, HiTrash, HiLightningBolt, HiDocumentText, HiTrendingUp
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }).map((_, i) => new Date(0, i).toLocaleString("default", { month: "long" }));
const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPeriod = (pm) => {
  if (!pm) return "N/A";
  const [y, m] = pm.split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const fmtDate = (d) => {
  if (!d) return "N/A";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const prettify = (s) => (s ? String(s).replace(/_/g, " ") : "");

const STATUS_PILL = {
  pending: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  active: "bg-violet-50 text-violet-700 border-violet-200",
  closed: "bg-slate-50 text-slate-600 border-slate-200",
  foreclosed: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-50 text-slate-600 border-slate-200",
};
// Preview is purple-only.
const INST_TONE = { deducted: "solid", scheduled: "soft", cancelled: "muted", skipped: "outline" };

// Pure client-side EMI estimate, mirrors loan_schedule.utils (flat / reducing_balance)
function estimateSchedule(principal, annualRate, tenure, method) {
  const P = parseFloat(principal) || 0;
  const n = parseInt(tenure) || 0;
  const r = parseFloat(annualRate) || 0;
  if (P <= 0 || n <= 0) return null;
  if (r === 0) {
    const emi = P / n;
    return { emi, totalInterest: 0, totalPayable: P };
  }
  if (method === "flat") {
    const totalInterest = (P * r * n) / 1200;
    const totalPayable = P + totalInterest;
    return { emi: totalPayable / n, totalInterest, totalPayable };
  }
  const i = r / 1200;
  const pow = Math.pow(1 + i, n);
  const emi = (P * i * pow) / (pow - 1);
  const totalPayable = emi * n;
  return { emi, totalInterest: totalPayable - P, totalPayable };
}

const now = new Date();
const emptyForm = () => ({
  user_id: "",
  loan_type: "loan",
  principal_amount: "",
  annual_interest_rate: "0",
  interest_method: "reducing_balance",
  tenure_months: "6",
  start_month: now.getMonth() + 1,
  start_year: now.getFullYear(),
  disbursement_date: now.toISOString().slice(0, 10),
  reason: "",
});

/** initialStatus: preselected status filter, e.g. "pending" from the HR Inbox. */
export default function PayrollLoansPage({ initialStatus = "" } = {}) {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const [schedule, setSchedule] = useState(null); // { loan, installments, loading }
  const [foreclosing, setForeclosing] = useState(null); // loan
  const [fcForm, setFcForm] = useState({ settlement_mode: "recover_via_payroll", recovery_month: now.getMonth() + 1, recovery_year: now.getFullYear(), reason: "" });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // The employee list is loaded once below, not again on every status filter change.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const loanRes = await payrollAPI.getLoans(statusFilter ? { status: statusFilter } : undefined);
      setLoans(loanRes.data?.records || loanRes.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load loans", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // Every page of employees, leavers included: closed and foreclosed loans still name them.
  const people = useEmployeeDirectory();
  const empName = (id) => people.nameOf(id);

  const est = useMemo(
    () => estimateSchedule(form.principal_amount, form.annual_interest_rate, form.tenure_months, form.interest_method),
    [form.principal_amount, form.annual_interest_rate, form.tenure_months, form.interest_method]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        loan_type: form.loan_type,
        principal_amount: parseFloat(form.principal_amount),
        annual_interest_rate: parseFloat(form.annual_interest_rate) || 0,
        interest_method: form.interest_method,
        tenure_months: parseInt(form.tenure_months),
        start_period_month: `${form.start_year}-${String(form.start_month).padStart(2, "0")}`,
        disbursement_date: form.disbursement_date,
        reason: form.reason.trim(),
      };
      await payrollAPI.grantLoan(form.user_id, payload);
      showToast("Loan granted");
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to grant loan", "error");
    }
  };

  const act = async (fn, okMsg) => {
    try {
      await fn();
      showToast(okMsg);
      setSchedule(null);
      loadData();
    } catch (err) {
      showToast(err.message || "Action failed", "error");
    }
  };

  // window.confirm resolves asynchronously (GlobalAlertProvider) — always await it.
  const handleCancelLoan = async (loan) => {
    if (!(await window.confirm("Cancel this loan? Only allowed with zero deducted installments."))) return;
    act(() => payrollAPI.cancelLoan(loan.id), "Loan cancelled");
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) return showToast("Reason required", "error");
    await act(() => payrollAPI.rejectLoan(rejectingId, { rejection_reason: rejectionReason }), "Loan rejected");
    setRejectingId(null);
    setRejectionReason("");
  };

  const openSchedule = async (loan) => {
    // Open with the row immediately; full metadata (#77) + installment schedule
    // (#78) are failure-isolated so one missing never hides the other.
    setSchedule({ loan, installments: [], loading: true });
    const [detailRes, instRes] = await Promise.allSettled([
      payrollAPI.getLoan(loan.id),
      payrollAPI.getLoanInstallments(loan.id),
    ]);
    if (detailRes.status === "rejected" && instRes.status === "rejected" && loan.status !== "pending") {
      showToast(detailRes.reason?.message || "Failed to load full loan details", "error");
    }
    const detail = detailRes.status === "fulfilled" ? (detailRes.value.data || loan) : loan;
    const installments = instRes.status === "fulfilled" ? (instRes.value.data?.records || instRes.value.data || []) : [];
    setSchedule((s) => (s && s.loan.id === loan.id ? { loan: detail, installments, loading: false } : s));
  };

  const handleForeclose = async (e) => {
    e.preventDefault();
    try {
      const payload = { settlement_mode: fcForm.settlement_mode, reason: fcForm.reason.trim() };
      if (fcForm.settlement_mode === "recover_via_payroll")
        payload.recovery_period_month = `${fcForm.recovery_year}-${String(fcForm.recovery_month).padStart(2, "0")}`;
      await payrollAPI.forecloseLoan(foreclosing.id, payload);
      showToast("Loan foreclosed");
      setForeclosing(null);
      setSchedule(null);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to foreclose", "error");
    }
  };

  const openForeclose = (loan) => {
    setFcForm({ settlement_mode: "recover_via_payroll", recovery_month: now.getMonth() + 1, recovery_year: now.getFullYear(), reason: "" });
    setForeclosing(loan);
  };

  const outstanding = (l) => l.outstanding_principal ?? l.outstanding_balance ?? l.remaining_balance ?? 0;
  const fieldClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";
  const labelClass = "block text-[11px] font-bold text-slate-500 uppercase mb-2";

  return (
    <>
        <DashboardTopBar title="Loans & Advances" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">

          <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Loans &amp; Advances</h1>
              <p className="text-sm text-slate-500 mt-1">Grant company loans and salary advances with an auto-generated EMI schedule. Click a row to see its details.</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[42px] px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="foreclosed">Foreclosed</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={() => { setForm(emptyForm()); setIsModalOpen(true); }} className="h-[42px] px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiPlus className="w-5 h-5" /> Grant Loan
              </button>
            </div>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <th className="px-6 py-4 border-b border-slate-100">Employee</th>
                      <th className="px-6 py-4 border-b border-slate-100">Type</th>
                      <th className="px-6 py-4 border-b border-slate-100">Principal</th>
                      <th className="px-6 py-4 border-b border-slate-100">Interest</th>
                      <th className="px-6 py-4 border-b border-slate-100">EMI</th>
                      <th className="px-6 py-4 border-b border-slate-100">Tenure</th>
                      <th className="px-6 py-4 border-b border-slate-100">Outstanding</th>
                      <th className="px-6 py-4 border-b border-slate-100">Status</th>
                      <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {loans.map((l) => (
                      <tr key={l.id} {...rowPreviewProps(() => openSchedule(l), `View loan for ${empName(l.user_id)}`)}>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-800">{empName(l.user_id)}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">first EMI {fmtPeriod(l.start_period_month)}</p>
                        </td>
                        <td className="px-6 py-4 capitalize text-slate-600">{prettify(l.loan_type) || "N/A"}</td>
                        <td className="px-6 py-4 font-semibold text-slate-800">{money(l.principal_amount)}</td>
                        <td className="px-6 py-4 text-slate-600">{parseFloat(l.annual_interest_rate || 0)}%<span className="block text-[10px] text-slate-400 capitalize">{prettify(l.interest_method) || "N/A"}</span></td>
                        <td className="px-6 py-4 text-slate-600">{money(l.emi_amount)}</td>
                        <td className="px-6 py-4 text-slate-600">{l.tenure_months ?? 0} mo</td>
                        <td className="px-6 py-4 font-bold text-purple-700">{money(outstanding(l))}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[l.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>{l.status}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {l.status === "pending" && (
                              <>
                                <button onClick={() => act(() => payrollAPI.approveLoan(l.id), "Loan approved — schedule generated")} className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition" title="Approve"><HiCheck className="w-4 h-4" /></button>
                                <button onClick={() => setRejectingId(l.id)} className="p-1.5 text-slate-400 hover:text-fuchsia-600 hover:bg-fuchsia-50 rounded-lg transition" title="Reject"><HiX className="w-4 h-4" /></button>
                              </>
                            )}
                            {l.status === "active" && (
                              <button onClick={() => openForeclose(l)} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-purple-700 rounded-lg transition flex items-center gap-1"><HiLightningBolt className="w-3.5 h-3.5" /> Foreclose</button>
                            )}
                            {(l.status === "pending" || l.status === "active") && (
                              <button onClick={() => handleCancelLoan(l)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Cancel"><HiTrash className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {loans.length === 0 && (
                      <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500">No loans yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

      {/* Grant loan modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Grant Loan / Advance</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
                  <div>
                    <label className={labelClass}>Employee <span className="text-red-500">*</span></label>
                    <select required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} className={fieldClass}>
                      <option value="">{people.status === "loading" ? "Loading employees…" : people.status === "error" ? "Couldn't load employees" : "Select employee"}</option>
                      {/* Loans are granted to current employees only. */}
                      {people.directory.activeOptions.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` (${e.code})` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <select value={form.loan_type} onChange={(e) => setForm({ ...form, loan_type: e.target.value })} className={fieldClass}>
                      <option value="loan">Company Loan</option>
                      <option value="salary_advance">Salary Advance</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Principal (₹) <span className="text-red-500">*</span></label>
                    <input type="number" required min="1" value={form.principal_amount} onChange={(e) => setForm({ ...form, principal_amount: e.target.value })} className={fieldClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <label className={labelClass}>Tenure (mo) <span className="text-red-500">*</span></label>
                    <input type="number" required min="1" value={form.tenure_months} onChange={(e) => setForm({ ...form, tenure_months: e.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Interest % p.a.</label>
                    <input type="number" min="0" step="0.01" value={form.annual_interest_rate} onChange={(e) => setForm({ ...form, annual_interest_rate: e.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Method</label>
                    <select value={form.interest_method} onChange={(e) => setForm({ ...form, interest_method: e.target.value })} className={fieldClass}>
                      <option value="reducing_balance">Reducing</option>
                      <option value="flat">Flat</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>First EMI Month</label>
                    <select value={form.start_month} onChange={(e) => setForm({ ...form, start_month: parseInt(e.target.value) })} className={fieldClass}>
                      {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Year</label>
                    <input type="number" required value={form.start_year} onChange={(e) => setForm({ ...form, start_year: parseInt(e.target.value) })} className={fieldClass} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                  <div>
                    <label className={labelClass}>Disbursement Date</label>
                    <input type="date" value={form.disbursement_date} onChange={(e) => setForm({ ...form, disbursement_date: e.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Reason <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Medical emergency" className={fieldClass} />
                  </div>
                </div>

                {est && (
                  <div className="bg-purple-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] font-bold text-purple-500 uppercase">Est. EMI</p>
                      <p className="text-base font-black text-purple-700 mt-0.5">{money(est.emi)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-purple-500 uppercase">Total Interest</p>
                      <p className="text-base font-black text-purple-700 mt-0.5">{money(est.totalInterest)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-purple-500 uppercase">Total Payable</p>
                      <p className="text-base font-black text-purple-700 mt-0.5">{money(est.totalPayable)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button type="submit" className="sm:min-w-[200px] px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Grant Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan details preview */}
      {schedule && (() => {
        const loan = schedule.loan;
        return (
          <DetailDialog
            eyebrow="Loan details"
            icon={HiCash}
            title={empName(loan.user_id)}
            subtitle={prettify(loan.loan_type) ? `${prettify(loan.loan_type)} · first EMI ${fmtPeriod(loan.start_period_month)}` : undefined}
            badge={<DetailPill tone="onDark">{loan.status || "N/A"}</DetailPill>}
            loading={schedule.loading}
            onClose={() => setSchedule(null)}
            footer={loan.status === "active" && (
              <button onClick={() => openForeclose(loan)} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiLightningBolt className="w-4 h-4" /> Foreclose loan
              </button>
            )}
          >
            <DetailStats
              items={[
                { label: "Principal", value: money(loan.principal_amount), icon: HiCash },
                { label: "Monthly EMI", value: money(loan.emi_amount), icon: HiCalendar },
                { label: "Recovered", value: money(loan.recovered_amount ?? loan.total_recovered), icon: HiCheckCircle },
                { label: "Outstanding", value: money(outstanding(loan)), icon: HiTrendingUp },
              ]}
            />

            <DetailSection title="Loan terms" icon={HiDocumentText}>
              <DetailGrid
                cols={3}
                items={[
                  ["Type", prettify(loan.loan_type)],
                  ["Interest rate", `${parseFloat(loan.annual_interest_rate || 0)}% p.a.`],
                  ["Interest method", prettify(loan.interest_method)],
                  ["Tenure", `${loan.tenure_months ?? 0} months`],
                  ["First EMI", fmtPeriod(loan.start_period_month)],
                  ["Disbursed on", fmtDate(loan.disbursement_date)],
                ]}
              />
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <DetailText label="Reason">{loan.reason}</DetailText>
                {loan.rejection_reason && <DetailText label="Rejection reason">{loan.rejection_reason}</DetailText>}
              </div>
            </DetailSection>

            <DetailSection title={`Repayment schedule (${schedule.installments.length})`} icon={HiCalendar}>
              <DetailTable
                rows={schedule.installments}
                rowKey={(inst, i) => inst.id || inst.installment_number || i}
                empty={loan.status === "pending" ? "The schedule is created once the loan is approved." : "No installments."}
                columns={[
                  { header: "#", render: (inst) => inst.installment_number },
                  { header: "Due", render: (inst) => fmtPeriod(inst.due_period_month) },
                  { header: "Principal", align: "right", render: (inst) => money(inst.principal_amount) },
                  { header: "Interest", align: "right", render: (inst) => money(inst.interest_amount) },
                  { header: "EMI", align: "right", render: (inst) => <span className="font-semibold text-slate-800">{money(inst.total_amount)}</span> },
                  { header: "Status", align: "center", render: (inst) => <DetailPill tone={INST_TONE[inst.status] || "soft"}>{inst.status || "N/A"}</DetailPill> },
                ]}
              />
            </DetailSection>
          </DetailDialog>
        );
      })()}

      {/* Foreclose modal */}
      {foreclosing && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Foreclose Loan</h2>
              <button onClick={() => setForeclosing(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleForeclose} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                Outstanding principal <span className="font-bold text-slate-800">{money(outstanding(foreclosing))}</span>. Remaining scheduled installments are cancelled and their interest is forgiven.
              </p>
              <div>
                <label className={labelClass}>Settlement Mode</label>
                <select value={fcForm.settlement_mode} onChange={(e) => setFcForm({ ...fcForm, settlement_mode: e.target.value })} className={fieldClass}>
                  <option value="recover_via_payroll">Recover via payroll</option>
                  <option value="settled_externally">Settled externally</option>
                </select>
              </div>
              {fcForm.settlement_mode === "recover_via_payroll" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Recovery Month</label>
                    <select value={fcForm.recovery_month} onChange={(e) => setFcForm({ ...fcForm, recovery_month: parseInt(e.target.value) })} className={fieldClass}>
                      {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Year</label>
                    <input type="number" required value={fcForm.recovery_year} onChange={(e) => setFcForm({ ...fcForm, recovery_year: parseInt(e.target.value) })} className={fieldClass} />
                  </div>
                </div>
              )}
              <div>
                <label className={labelClass}>Reason <span className="text-red-500">*</span></label>
                <textarea required value={fcForm.reason} onChange={(e) => setFcForm({ ...fcForm, reason: e.target.value })} rows={2} className={`${fieldClass} resize-none`} placeholder="e.g. Employee requested early payoff" />
              </div>
              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setForeclosing(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Foreclose</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Reject Loan</h2>
              <button onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleReject} className="p-6 space-y-4">
              <div>
                <label className={labelClass}>Rejection Reason <span className="text-red-500">*</span></label>
                <textarea required value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-red-400 outline-none resize-none" placeholder="Provide a reason..." />
              </div>
              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition shadow-md shadow-red-200">Reject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

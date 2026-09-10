import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCash, HiCalendar, HiGift, HiTrendingDown, HiTrendingUp } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPeriod = (pm) => {
  if (!pm) return "-";
  const [y, m] = String(pm).split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const asList = (d) => d?.records || d?.data || (Array.isArray(d) ? d : []);
const outstanding = (l) => l.outstanding_principal ?? l.outstanding_balance ?? l.remaining_balance ?? 0;

const INST_PILL = {
  scheduled: "bg-amber-100 text-amber-700",
  deducted: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
  skipped: "bg-red-100 text-red-700",
};

export default function MyLoansAndAdvancesPage() {
  const [tab, setTab] = useState("loans");
  const [loans, setLoans] = useState([]);
  const [bonuses, setBonuses] = useState({ earned: [], upcoming: [] });
  const [adjustments, setAdjustments] = useState({ earned: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [installments, setInstallments] = useState([]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, bonusRes, adjRes] = await Promise.all([
        payrollAPI.getMyLoans().catch(() => ({ data: [] })),
        payrollAPI.getMyBonuses().catch(() => ({ data: {} })),
        payrollAPI.getMyAdjustments().catch(() => ({ data: {} })),
      ]);
      setLoans(asList(loanRes.data));
      const b = bonusRes.data || {};
      setBonuses({ earned: b.earned || asList(b), upcoming: b.upcoming || [] });
      const a = adjRes.data || {};
      setAdjustments({ earned: a.earned || asList(a), upcoming: a.upcoming || [] });
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleViewSchedule = async (loan) => {
    try {
      const res = await payrollAPI.getMyLoanInstallments(loan.id);
      setInstallments(asList(res.data));
      setSelectedLoan(loan);
    } catch (err) {
      showToast(err.message || "Failed to fetch schedule", "error");
    }
  };

  const TABS = [
    { key: "loans", label: "Loans & Advances", icon: HiCash },
    { key: "variable", label: "Bonuses & Adjustments", icon: HiGift },
  ];

  const allAdjRows = [
    ...adjustments.earned.map((r) => ({ ...r, _bucket: "earned" })),
    ...adjustments.upcoming.map((r) => ({ ...r, _bucket: "upcoming" })),
  ];
  const allBonusRows = [
    ...bonuses.earned.map((r) => ({ ...r, _bucket: "earned" })),
    ...bonuses.upcoming.map((r) => ({ ...r, _bucket: "upcoming" })),
  ];

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Loans & Variable Pay" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiCash className="text-purple-600 w-7 h-7" /> Loans &amp; Variable Pay
            </h1>
            <p className="text-sm text-slate-500 mt-1">Your loan balances, EMI schedules, bonuses and one-off adjustments.</p>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {loading ? <Skeleton type="dashboard" /> : tab === "loans" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {loans.map((loan) => (
                <div key={loan.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg capitalize">{(loan.loan_type || "loan").replace(/_/g, " ")}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">From {fmtPeriod(loan.start_period_month)} · {loan.tenure_months} months</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${loan.status === "active" ? "bg-emerald-100 text-emerald-700" : loan.status === "foreclosed" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                      {loan.status}
                    </span>
                  </div>
                  <div className="p-5 flex-1 space-y-3">
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Principal</p><p className="text-sm font-black text-slate-800">{money(loan.principal_amount)}</p></div>
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Recovered</p><p className="text-sm font-semibold text-emerald-600">{money(loan.recovered_amount)}</p></div>
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Outstanding</p><p className="text-sm font-black text-purple-700">{money(outstanding(loan))}</p></div>
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Monthly EMI</p><p className="text-sm font-semibold text-slate-600">{money(loan.emi_amount)}</p></div>
                    {loan.next_due_period_month && (
                      <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Next Due</p><p className="text-sm font-semibold text-slate-600">{fmtPeriod(loan.next_due_period_month)}</p></div>
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-50 bg-white">
                    <button onClick={() => handleViewSchedule(loan)} className="w-full flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                      <HiCalendar className="w-4 h-4" /> View Repayment Schedule
                    </button>
                  </div>
                </div>
              ))}
              {loans.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">You have no active or past loans.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <Section title="Bonuses & Incentives" icon={HiGift} rows={allBonusRows} />
              <Section title="Adjustments" icon={HiTrendingUp} rows={allAdjRows} showType />
            </div>
          )}
        </main>
      </div>

      {selectedLoan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Repayment Schedule</h2>
              <button onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">Due</th>
                    <th className="px-5 py-3 text-right">EMI</th>
                    <th className="px-5 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {installments.map((inst) => (
                    <tr key={inst.id || inst.installment_number} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-slate-400 font-bold">{inst.installment_number}</td>
                      <td className="px-5 py-3 text-slate-600 font-medium">{fmtPeriod(inst.due_period_month)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(inst.total_amount ?? inst.amount)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${INST_PILL[inst.status] || "bg-slate-100 text-slate-500"}`}>{inst.status}</span>
                      </td>
                    </tr>
                  ))}
                  {installments.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No installments found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Section({ title, icon: Icon, rows, showType }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-purple-600" /> {title}
      </h2>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <th className="px-6 py-3.5 border-b border-slate-100">Item</th>
              <th className="px-6 py-3.5 border-b border-slate-100">Period</th>
              {showType && <th className="px-6 py-3.5 border-b border-slate-100">Type</th>}
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Amount</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-3.5 font-semibold text-slate-800">
                  {r.component_name || r.name || "—"}
                  {r.reason && <span className="block text-[11px] text-slate-400 font-normal line-clamp-1">{r.reason}</span>}
                </td>
                <td className="px-6 py-3.5 text-slate-600">{fmtPeriod(r.period_month)}</td>
                {showType && (
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold ${r.adjustment_type === "deduction" ? "text-red-600" : "text-emerald-600"}`}>
                      {r.adjustment_type === "deduction" ? <HiTrendingDown className="w-3.5 h-3.5" /> : <HiTrendingUp className="w-3.5 h-3.5" />}
                      {r.adjustment_type === "deduction" ? "Deduction" : "Earning"}
                    </span>
                  </td>
                )}
                <td className="px-6 py-3.5 text-right font-bold text-slate-800">{money(r.amount ?? r.bonus_amount)}</td>
                <td className="px-6 py-3.5 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${r._bucket === "earned" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {r._bucket === "earned" ? "Paid" : "Upcoming"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showType ? 5 : 4} className="px-6 py-8 text-center text-slate-500">Nothing here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

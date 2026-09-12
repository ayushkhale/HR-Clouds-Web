import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiAdjustments, HiGift, HiCash, HiTrash
} from "react-icons/hi";
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

const MONTHS = Array.from({ length: 12 }).map((_, i) => new Date(0, i).toLocaleString("default", { month: "long" }));
const money = (v) => (v === null || v === undefined || v === "" ? "—" : `₹${parseFloat(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const fmtPeriod = (pm) => {
  if (!pm) return "-";
  const [y, m] = pm.split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const STATUS_PILL = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  active: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};
const Pill = ({ s }) => <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[s] || "bg-slate-100 text-slate-600"}`}>{s}</span>;

// Team loan detail + installment schedule (#90).
function LoanDetailModal({ loanId, memberName, onClose, showToast }) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getTeamLoan(loanId)
      .then((res) => { if (!cancelled) setData(res.data || res); })
      .catch((err) => { if (!cancelled) { showToast(err.message || "Failed to load loan", "error"); setData(null); } });
    return () => { cancelled = true; };
  }, [loanId, showToast]);

  const loan = data?.loan || data || {};
  const installments = data?.installments || loan.installments || [];
  const outstanding = loan.outstanding_amount ?? loan.outstanding_balance;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Loan details</h2>
            <p className="text-xs text-slate-500">{memberName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {data === undefined ? <Skeleton type="table" rows={4} /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">Principal</p><p className="text-sm font-black text-slate-800">{money(loan.principal_amount)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">Recovered</p><p className="text-sm font-black text-emerald-600">{money(loan.recovered_amount)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">Outstanding</p><p className="text-sm font-black text-purple-700">{money(outstanding)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-400 uppercase">Tenure</p><p className="text-sm font-black text-slate-800">{loan.tenure_months ?? "—"} mo</p></div>
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Installment schedule</h3>
              {installments.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No installments scheduled yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                      <tr><th className="px-4 py-2.5 text-left">Period</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-left">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {installments.map((inst, i) => (
                        <tr key={inst.id || i}>
                          <td className="px-4 py-2.5 text-slate-700">{fmtPeriod(inst.period_month || inst.due_period_month)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{money(inst.amount ?? inst.emi_amount ?? inst.installment_amount)}</td>
                          <td className="px-4 py-2.5"><Pill s={inst.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const now = new Date();
const TABS = [
  { key: "adjustments", label: "Adjustments", icon: HiAdjustments },
  { key: "bonuses", label: "Bonus Proposals", icon: HiGift },
  { key: "loans", label: "Loan Recommendations", icon: HiCash },
];

export default function ManagerAdjustmentsPage() {
  const [tab, setTab] = useState("adjustments");
  const [team, setTeam] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // 'adj' | 'bonus' | 'loan'
  const [loanDetail, setLoanDetail] = useState(null); // { id, name } | null

  const [adjForm, setAdjForm] = useState({ user_id: "", adjustment_type: "earning", category: "incentive", component_name: "", amount: "", reason: "", month: now.getMonth() + 1, year: now.getFullYear() });
  const [bonusForm, setBonusForm] = useState({ name: "", bonus_type: "flat", value: "", user_ids: [], reason: "", month: now.getMonth() + 1, year: now.getFullYear() });
  const [loanForm, setLoanForm] = useState({ user_id: "", loan_type: "salary_advance", principal_amount: "", tenure_months: "3", annual_interest_rate: "0", interest_method: "reducing_balance", reason: "", month: now.getMonth() + 1, year: now.getFullYear() });

  // Stable identity: LoanDetailModal's fetch effect lists showToast in its deps,
  // so an unstable function would re-fire the fetch on every parent re-render.
  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, adjRes, bonusRes, loanRes] = await Promise.all([
        organizationAPI.getEmployees({ purpose: "shift_assignment" }).catch(() => ({ data: [] })),
        payrollAPI.getTeamAdjustments().catch(() => ({ data: [] })),
        payrollAPI.getTeamBonusRules().catch(() => ({ data: [] })),
        payrollAPI.getTeamLoans().catch(() => ({ data: [] })),
      ]);
      const rawTeam = Array.isArray(teamRes.data) ? teamRes.data : (teamRes.data?.employees ?? teamRes.data?.records ?? teamRes.data?.data ?? []);
      setTeam(Array.isArray(rawTeam) ? rawTeam : []);
      setAdjustments(adjRes.data?.records || adjRes.data || []);
      setBonuses(bonusRes.data?.records || bonusRes.data || []);
      setLoans(loanRes.data?.records || loanRes.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const teamName = (id) => team.find((m) => (m.id || m._id || m.user_id) === id)?.name || id;
  const period = (f) => `${f.year}-${String(f.month).padStart(2, "0")}`;

  const submitAdj = async (e) => {
    e.preventDefault();
    try {
      await payrollAPI.proposeTeamAdjustment(adjForm.user_id, {
        period_month: period(adjForm),
        adjustment_type: adjForm.adjustment_type,
        category: adjForm.category,
        component_name: adjForm.component_name || (adjForm.adjustment_type === "earning" ? "Spot Award" : "Deduction"),
        amount: parseFloat(adjForm.amount),
        reason: adjForm.reason.trim(),
      });
      showToast("Adjustment proposed to HR");
      setModal(null);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to propose", "error");
    }
  };

  const submitBonus = async (e) => {
    e.preventDefault();
    if (bonusForm.user_ids.length === 0) return showToast("Select at least one report", "error");
    try {
      await payrollAPI.proposeTeamBonusRule({
        name: bonusForm.name.trim(),
        period_month: period(bonusForm),
        bonus_type: bonusForm.bonus_type,
        value: parseFloat(bonusForm.value),
        eligibility_source: "manual",
        eligibility_config: { user_ids: bonusForm.user_ids },
        reason: bonusForm.reason.trim(),
      });
      showToast("Bonus proposal sent to HR");
      setModal(null);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to propose bonus", "error");
    }
  };

  const submitLoan = async (e) => {
    e.preventDefault();
    try {
      await payrollAPI.recommendTeamLoan(loanForm.user_id, {
        loan_type: loanForm.loan_type,
        principal_amount: parseFloat(loanForm.principal_amount),
        tenure_months: parseInt(loanForm.tenure_months),
        annual_interest_rate: parseFloat(loanForm.annual_interest_rate) || 0,
        interest_method: loanForm.interest_method,
        start_period_month: period(loanForm),
        reason: loanForm.reason.trim(),
      });
      showToast("Loan recommendation sent to HR");
      setModal(null);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to recommend loan", "error");
    }
  };

  const cancelAdj = async (id) => {
    if (!window.confirm("Cancel this proposal?")) return;
    try {
      await payrollAPI.cancelTeamAdjustment(id);
      showToast("Proposal cancelled");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to cancel", "error");
    }
  };

  const toggleReport = (id) => setBonusForm((f) => ({
    ...f,
    user_ids: f.user_ids.includes(id) ? f.user_ids.filter((x) => x !== id) : [...f.user_ids, id],
  }));

  const addBtn = {
    adjustments: { label: "Propose Adjustment", onClick: () => setModal("adj") },
    bonuses: { label: "Propose Bonus", onClick: () => setModal("bonus") },
    loans: { label: "Recommend Loan", onClick: () => setModal("loan") },
  }[tab];

  return (
    <>
        <DashboardTopBar title="Team Variable Pay" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">

          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiAdjustments className="text-purple-600 w-7 h-7" /> Team Variable Pay
              </h1>
              <p className="text-sm text-slate-500 mt-1">Propose bonuses, one-off adjustments and loan recommendations — HR gives the final approval.</p>
            </div>
            <button onClick={addBtn.onClick} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlus className="w-5 h-5" /> {addBtn.label}
            </button>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                {tab === "adjustments" && (
                  <>
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4 border-b border-slate-100">Team Member</th>
                        <th className="px-6 py-4 border-b border-slate-100">Period</th>
                        <th className="px-6 py-4 border-b border-slate-100">Type</th>
                        <th className="px-6 py-4 border-b border-slate-100">Amount</th>
                        <th className="px-6 py-4 border-b border-slate-100">Status</th>
                        <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {adjustments.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-bold text-slate-800">{a.employee?.name || teamName(a.user_id)}</td>
                          <td className="px-6 py-4 text-slate-600">{fmtPeriod(a.period_month)}</td>
                          <td className="px-6 py-4 capitalize text-slate-600">{a.adjustment_type}<span className="block text-[10px] text-slate-400 font-bold">{a.category?.replace(/_/g, " ")}</span></td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{money(a.amount)}</td>
                          <td className="px-6 py-4"><Pill s={a.status} /></td>
                          <td className="px-6 py-4 text-right">
                            {a.status === "pending" && (
                              <button onClick={() => cancelAdj(a.id)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Cancel"><HiTrash className="w-4 h-4" /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {adjustments.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No adjustment proposals yet.</td></tr>}
                    </tbody>
                  </>
                )}

                {tab === "bonuses" && (
                  <>
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4 border-b border-slate-100">Proposal</th>
                        <th className="px-6 py-4 border-b border-slate-100">Period</th>
                        <th className="px-6 py-4 border-b border-slate-100">Value</th>
                        <th className="px-6 py-4 border-b border-slate-100">Reports</th>
                        <th className="px-6 py-4 border-b border-slate-100">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {bonuses.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-bold text-slate-800">{b.name}<span className="block text-[11px] text-slate-400 font-normal line-clamp-1">{b.reason}</span></td>
                          <td className="px-6 py-4 text-slate-600">{fmtPeriod(b.period_month)}</td>
                          <td className="px-6 py-4 text-slate-600">{b.bonus_type === "flat" ? money(b.value) : `${parseFloat(b.value || 0)}%`}</td>
                          <td className="px-6 py-4 text-slate-600">{(b.eligibility_config?.user_ids || []).length}</td>
                          <td className="px-6 py-4"><Pill s={b.status} /></td>
                        </tr>
                      ))}
                      {bonuses.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No bonus proposals yet.</td></tr>}
                    </tbody>
                  </>
                )}

                {tab === "loans" && (
                  <>
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4 border-b border-slate-100">Team Member</th>
                        <th className="px-6 py-4 border-b border-slate-100">Type</th>
                        <th className="px-6 py-4 border-b border-slate-100">Principal</th>
                        <th className="px-6 py-4 border-b border-slate-100">Tenure</th>
                        <th className="px-6 py-4 border-b border-slate-100">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {loans.map((l) => (
                        <tr key={l.id} onClick={() => setLoanDetail({ id: l.id, name: teamName(l.user_id) })} className="hover:bg-slate-50/50 cursor-pointer">
                          <td className="px-6 py-4 font-bold text-slate-800">{teamName(l.user_id)}</td>
                          <td className="px-6 py-4 capitalize text-slate-600">{(l.loan_type || "").replace(/_/g, " ")}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{money(l.principal_amount)}</td>
                          <td className="px-6 py-4 text-slate-600">{l.tenure_months} mo</td>
                          <td className="px-6 py-4"><Pill s={l.status} /></td>
                        </tr>
                      ))}
                      {loans.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No loan recommendations yet.</td></tr>}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </main>

      {/* Propose Adjustment */}
      {modal === "adj" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Propose Adjustment</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitAdj} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Team Member <span className="text-red-500">*</span></label>
                <select required value={adjForm.user_id} onChange={(e) => setAdjForm({ ...adjForm, user_id: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="">-- Select Report --</option>
                  {team.map((m) => <option key={m.id || m._id} value={m.id || m._id}>{m.name || m.identifier}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                  <select value={adjForm.adjustment_type} onChange={(e) => setAdjForm({ ...adjForm, adjustment_type: e.target.value, category: e.target.value === "earning" ? "incentive" : "ad_hoc_deduction" })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="earning">Earning (+)</option>
                    <option value="deduction">Deduction (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Amount <span className="text-red-500">*</span></label>
                  <input type="number" required min="1" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                  <select value={adjForm.month} onChange={(e) => setAdjForm({ ...adjForm, month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={adjForm.year} onChange={(e) => setAdjForm({ ...adjForm, year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Label</label>
                <input type="text" value={adjForm.component_name} onChange={(e) => setAdjForm({ ...adjForm, component_name: e.target.value })} placeholder="e.g. Spot Award" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                <input type="text" required value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <p className="text-xs text-slate-400 italic">Sent to HR for final approval before it reaches payroll.</p>
              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setModal(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Propose to HR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Propose Bonus */}
      {modal === "bonus" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Propose Team Bonus</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitBonus} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Name <span className="text-red-500">*</span></label>
                <input type="text" required value={bonusForm.name} onChange={(e) => setBonusForm({ ...bonusForm, name: e.target.value })} placeholder="e.g. Sprint Delivery Award" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                  <select value={bonusForm.bonus_type} onChange={(e) => setBonusForm({ ...bonusForm, bonus_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="flat">Flat ₹</option>
                    <option value="percent_of_basic">% of Basic</option>
                    <option value="percent_of_gross">% of Gross</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Value <span className="text-red-500">*</span></label>
                  <input type="number" required min="0.01" step="0.01" value={bonusForm.value} onChange={(e) => setBonusForm({ ...bonusForm, value: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                  <select value={bonusForm.month} onChange={(e) => setBonusForm({ ...bonusForm, month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={bonusForm.year} onChange={(e) => setBonusForm({ ...bonusForm, year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reports <span className="text-red-500">*</span></label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3 space-y-1.5 bg-slate-50/50">
                  {team.map((m) => {
                    const id = m.id || m._id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={bonusForm.user_ids.includes(id)} onChange={() => toggleReport(id)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                        <span className="text-slate-700">{m.name || m.identifier}</span>
                      </label>
                    );
                  })}
                  {team.length === 0 && <p className="text-xs text-slate-400">No reports found.</p>}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                <textarea required value={bonusForm.reason} onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })} rows={2} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setModal(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Propose to HR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recommend Loan */}
      {modal === "loan" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Recommend Loan / Advance</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitLoan} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Team Member <span className="text-red-500">*</span></label>
                <select required value={loanForm.user_id} onChange={(e) => setLoanForm({ ...loanForm, user_id: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="">-- Select Report --</option>
                  {team.map((m) => <option key={m.id || m._id} value={m.id || m._id}>{m.name || m.identifier}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                  <select value={loanForm.loan_type} onChange={(e) => setLoanForm({ ...loanForm, loan_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="salary_advance">Salary Advance</option>
                    <option value="loan">Company Loan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Principal (₹) <span className="text-red-500">*</span></label>
                  <input type="number" required min="1" value={loanForm.principal_amount} onChange={(e) => setLoanForm({ ...loanForm, principal_amount: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Tenure</label>
                  <input type="number" required min="1" value={loanForm.tenure_months} onChange={(e) => setLoanForm({ ...loanForm, tenure_months: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                  <select value={loanForm.month} onChange={(e) => setLoanForm({ ...loanForm, month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo.slice(0, 3)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={loanForm.year} onChange={(e) => setLoanForm({ ...loanForm, year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                <textarea required value={loanForm.reason} onChange={(e) => setLoanForm({ ...loanForm, reason: e.target.value })} rows={2} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none resize-none" />
              </div>
              <p className="text-xs text-slate-400 italic">HR reviews and, if approved, generates the EMI schedule.</p>
              <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setModal(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Send to HR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loanDetail && (
        <LoanDetailModal loanId={loanDetail.id} memberName={loanDetail.name} onClose={() => setLoanDetail(null)} showToast={showToast} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
